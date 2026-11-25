/**
 * Server-side, read-only access to PUBLIC Firestore content over the REST API.
 *
 * Why REST instead of the SDK: pages are rendered/regenerated on the server (SEO + speed); the REST API needs no
 * credentials — requests are evaluated by the very same Security Rules as any anonymous visitor, so only published
 * content can ever be read. Nothing here can write. (Writes happen in the browser, authenticated, in the admin area.)
 *
 * Note: Firestore App Check *enforcement* would block these server requests (a server cannot solve reCAPTCHA).
 * Keep App Check in "monitor" mode for Firestore, or add the Admin SDK — see docs/FIREBASE_SETUP.md.
 *
 * Failure handling: a failed request is never swallowed into "no results". It becomes a `FirestoreRequestError` that says WHAT
 * went wrong (a composite index that is not deployed, a rejected API key, Security Rules, a network error …) and what to do about
 * it. Google's error body is read, scrubbed of anything key-shaped and logged once per few minutes per cause — a broken setup is
 * obvious in the logs without flooding them and without ever printing the API key. Callers receive an `Outcome`, so "there are no
 * posts" and "we could not ask" can never be confused.
 */
import { firebaseConfig } from '@/config/firebase';
import { SITE_URL } from '@/config/site';

const ROOT = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

export type FsValue = Record<string, unknown>;
type FsDocument = { name: string; fields?: Record<string, FsValue> };
export type PlainDoc = Record<string, unknown> & { id: string };
type FetchInit = RequestInit & { next?: { revalidate?: number | false; tags?: string[] } };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFsDocument = (v: unknown): v is FsDocument => isRecord(v) && typeof v.name === 'string' && (v.fields === undefined || isRecord(v.fields));

/* ───────────────────────────── value codec ───────────────────────────── */
export function decodeValue(v: FsValue): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return ((v.arrayValue as { values?: FsValue[] }).values ?? []).map(decodeValue);
  if ('mapValue' in v) return decodeFields((v.mapValue as { fields?: Record<string, FsValue> }).fields ?? {});
  return null;
}
export function decodeFields(fields: Record<string, FsValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));
}
export function decodeDocument(doc: FsDocument): PlainDoc {
  return { ...decodeFields(doc.fields ?? {}), id: doc.name.split('/').pop() ?? '' };
}

type Scalar = string | number | boolean | Date;
export function encodeScalar(v: Scalar): FsValue {
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
}

/* ───────────────────────────── query building ───────────────────────────── */
export interface QuerySpec {
  collection: string;
  where?: { field: string; op: 'EQUAL' | 'LESS_THAN_OR_EQUAL' | 'ARRAY_CONTAINS'; value: Scalar }[];
  orderBy?: { field: string; direction?: 'ASCENDING' | 'DESCENDING' }[];
  select?: string[];
  limit?: number;
}

export function buildQuery(spec: QuerySpec): Record<string, unknown> {
  const filters = (spec.where ?? []).map((w) => ({ fieldFilter: { field: { fieldPath: w.field }, op: w.op, value: encodeScalar(w.value) } }));
  const structuredQuery: Record<string, unknown> = { from: [{ collectionId: spec.collection }] };
  if (filters.length === 1) structuredQuery.where = filters[0];
  else if (filters.length > 1) structuredQuery.where = { compositeFilter: { op: 'AND', filters } };
  if (spec.orderBy?.length) structuredQuery.orderBy = spec.orderBy.map((o) => ({ field: { fieldPath: o.field }, direction: o.direction ?? 'ASCENDING' }));
  if (spec.select?.length) structuredQuery.select = { fields: spec.select.map((fieldPath) => ({ fieldPath })) };
  if (spec.limit) structuredQuery.limit = spec.limit;
  return { structuredQuery };
}

/* ───────────────────────────── failures ───────────────────────────── */
/** What went wrong, in the terms of the person who has to fix it. */
export type FailureKind =
  | 'missing-index' //     400 FAILED_PRECONDITION: the query needs a composite index that is not deployed (or still building)
  | 'invalid-api-key' //   400 API_KEY_INVALID: the web API key is wrong, expired, deleted or missing
  | 'invalid-query' //     any other 400: the request itself is malformed — a code bug
  | 'api-key-blocked' //   403 API_KEY_*: an API-key restriction (HTTP referrer, API allow-list, IP) rejects server calls
  | 'api-disabled' //      403 SERVICE_DISABLED: the Cloud Firestore API is switched off for the Google Cloud project
  | 'permission-denied' // 403: Security Rules refuse the read
  | 'no-database' //       404: the Firestore database was never created
  | 'not-found' //         404: a single document that does not exist (normal for optional documents)
  | 'quota' //             429: rate limited / quota exhausted
  | 'unavailable' //       5xx, network error or timeout
  | 'bad-response' //      2xx, but not the JSON we expect (a proxy or captive portal in between?)
  | 'unknown';

interface FailureInfo {
  httpStatus: number | null;
  /** Google's status string, e.g. `FAILED_PRECONDITION`. */
  code?: string;
  /** The machine-readable reason of the ErrorInfo detail, e.g. `API_KEY_INVALID`. */
  reason?: string;
  message?: string;
}

/** Pure: turns an HTTP status + Google's error fields into a `FailureKind`. */
export function classifyFailure({ httpStatus, code, reason, message = '' }: FailureInfo): FailureKind {
  if (httpStatus === null) return 'unavailable';
  if (reason === 'API_KEY_INVALID' || reason === 'API_KEY_EXPIRED' || /api key (not valid|expired)|missing a valid api key|api key not found/i.test(message)) return 'invalid-api-key';
  if (reason?.startsWith('API_KEY_') || /requests from (referer|referrer|ip|this ip)\b.*blocked|are blocked\./i.test(message)) return 'api-key-blocked';
  if (reason === 'SERVICE_DISABLED' || /api has not been used in project|api is disabled|has not been enabled/i.test(message)) return 'api-disabled';
  // "The database (default) does not exist for project …" — not to be confused with `Document "…/databases/(default)/documents/…" not found`.
  if (httpStatus === 404) return /\bdatabase\b[^.]*does not exist/i.test(message) ? 'no-database' : 'not-found';
  if (httpStatus === 429 || code === 'RESOURCE_EXHAUSTED') return 'quota';
  if (httpStatus === 400 && (code === 'FAILED_PRECONDITION' || /requires an index|index.+(building|not ready)|create_composite/i.test(message))) return 'missing-index';
  if (httpStatus === 400) return 'invalid-query';
  if (httpStatus === 401 || httpStatus === 403) return 'permission-denied';
  if (httpStatus >= 500) return 'unavailable';
  return 'unknown';
}

const HINTS: Record<FailureKind, string> = {
  'missing-index':
    'A composite index is not deployed yet (or is still building). Run `firebase deploy --only firestore:indexes` (firestore.indexes.json already lists it) or open the link above, then wait until the index shows "Enabled" in Firebase Console → Firestore → Indexes.',
  'invalid-api-key':
    'The Firebase web API key was rejected. Compare NEXT_PUBLIC_FIREBASE_API_KEY (Vercel → Settings → Environment Variables) with Firebase Console → Project settings → Your apps.',
  'invalid-query': 'Firestore rejected the query itself. That is a code bug, not a configuration problem — check the query definitions in src/lib/firestore/public.ts.',
  'api-key-blocked':
    'An API-key restriction rejected this server request. Server calls send the site URL as Referer, so allow it under Google Cloud Console → APIs & Services → Credentials → the browser key → HTTP referrers (for example https://your-domain/*), and keep "Cloud Firestore API" in the key\'s API restrictions. IP-address restrictions cannot work for a serverless host.',
  'api-disabled': 'The Cloud Firestore API is switched off for this Google Cloud project. Enable it in Google Cloud Console → APIs & Services → Library.',
  'permission-denied': 'Security Rules refused the read. Public reads need status == "published". Check that firestore.rules is deployed (`firebase deploy --only firestore:rules`).',
  'no-database': 'The Firestore database does not exist yet. Create it in Firebase Console → Build → Firestore Database.',
  'not-found': 'The document does not exist.',
  quota: 'Rate limited or quota exhausted (HTTP 429). It recovers on its own; check usage in Firebase Console.',
  unavailable: 'Firestore could not be reached (network error, timeout or a 5xx). Usually transient — pages keep serving their last good version.',
  'bad-response': 'Firestore answered with something that is not the expected JSON. Is a proxy or captive portal in between?',
  unknown: 'Unexpected answer — see the status and message above.'
};

const KEY_SHAPE = /AIza[0-9A-Za-z_-]{20,}/g;
const KEY_PARAM = /([?&]key=)[^&\s"']+/gi;
const CONSOLE_URL = /https:\/\/console\.(?:firebase|cloud)\.google\.com\/[^\s"'<>)]+/;

/** Removes anything key-shaped (and the configured key itself) and collapses whitespace. Safe to log. */
export function scrub(text: string, secrets: readonly string[] = [firebaseConfig.apiKey]): string {
  let out = text.replace(KEY_PARAM, '$1[redacted]').replace(KEY_SHAPE, '[redacted]');
  for (const secret of secrets) if (secret.length >= 8) out = out.split(secret).join('[redacted]');
  return out.replace(/\s+/g, ' ').trim();
}
const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

interface FailureInit extends FailureInfo {
  /** What was being done, e.g. `query on "blogPosts"`. */
  label: string;
  kind?: FailureKind;
}

export class FirestoreRequestError extends Error {
  readonly kind: FailureKind;
  readonly label: string;
  readonly httpStatus: number | null;
  readonly code: string | null;
  readonly reason: string | null;
  /** The "create this index" link Google puts into a missing-index error, when present. */
  readonly indexUrl: string | null;
  /** What Google (or the network) said, scrubbed of anything key-shaped and clipped. */
  readonly detail: string;
  readonly hint: string;

  constructor(init: FailureInit) {
    const kind = init.kind ?? classifyFailure(init);
    const detail = scrub(init.message ?? '');
    const status = init.httpStatus === null ? 'network' : `HTTP ${init.httpStatus}`;
    const hint = HINTS[kind];
    super(`${init.label} failed: ${status}${init.code ? ` ${init.code}` : ''} [${kind}]${detail ? ` — ${clip(detail, 700)}` : ''} — ${hint}`);
    this.name = 'FirestoreRequestError';
    this.kind = kind;
    this.label = init.label;
    this.httpStatus = init.httpStatus;
    this.code = init.code ?? null;
    this.reason = init.reason ?? null;
    this.indexUrl = CONSOLE_URL.exec(detail)?.[0] ?? null;
    this.detail = clip(detail, 700);
    this.hint = hint;
  }
}

function asRequestError(err: unknown, label: string): FirestoreRequestError {
  if (err instanceof FirestoreRequestError) return err;
  return new FirestoreRequestError({ label, httpStatus: null, kind: 'unknown', message: describeThrown(err) });
}

function describeThrown(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = err.cause;
  const why = cause instanceof Error ? ` (${(cause as NodeJS.ErrnoException).code ?? cause.message})` : '';
  return `${err.message}${why}`;
}

/** Google answers errors as `{error: {...}}` — for streaming methods such as runQuery wrapped in an array: `[{error: {...}}]`. */
function readErrorBody(text: string): Pick<FailureInfo, 'code' | 'reason' | 'message'> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { message: clip(text, 300) }; // not JSON (an HTML error page from a proxy, say)
  }
  const first = Array.isArray(json) ? json[0] : json;
  const err = isRecord(first) && isRecord(first.error) ? first.error : null;
  if (!err) return {};
  const details = Array.isArray(err.details) ? err.details : [];
  const info = details.find((d): d is Record<string, unknown> => isRecord(d) && typeof d.reason === 'string');
  return {
    code: typeof err.status === 'string' ? err.status : undefined,
    reason: typeof info?.reason === 'string' ? info.reason : undefined,
    message: typeof err.message === 'string' ? err.message : undefined
  };
}

/* ───────────────────────────── logging (once per cause) ───────────────────────────── */
const LOG_WINDOW_MS = 5 * 60_000;
const recentFailures = new Map<string, { at: number; hidden: number }>();

/** Logs a failure — at most once per `LOG_WINDOW_MS` per cause, so a persistent problem is visible but never floods the log. */
function report(error: FirestoreRequestError, note?: string): void {
  const signature = `${error.label}|${error.kind}|${error.httpStatus ?? 'network'}`;
  const now = Date.now();
  const seen = recentFailures.get(signature);
  if (seen && now - seen.at < LOG_WINDOW_MS) {
    seen.hidden += 1;
    return;
  }
  if (recentFailures.size >= 50) recentFailures.clear();
  recentFailures.set(signature, { at: now, hidden: 0 });
  const quiet = seen && seen.hidden > 0 ? ` (${seen.hidden} identical failures since the last line were not logged)` : '';
  const index = error.indexUrl ? `\n  index link: ${error.indexUrl}` : '';
  console.error(`[firestore] ${error.message}${index}${note ? `\n  ${note}` : ''}${quiet}`);
}

/** Tests only: forget what was logged, so the next failure logs again. */
export function resetFailureLog(): void {
  recentFailures.clear();
}

/* ───────────────────────────── requests ───────────────────────────── */
const KEY = `key=${encodeURIComponent(firebaseConfig.apiKey)}`;
/** A server request has no Referer of its own; sending the site URL lets keys restricted to "HTTP referrers" accept it. */
const BASE_HEADERS: Record<string, string> = { Referer: `${SITE_URL}/` };
const TIMEOUT_MS = 10_000;

async function call(url: string, label: string, init: FetchInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
    throw new FirestoreRequestError({ label, httpStatus: null, message: timedOut ? `no answer within ${TIMEOUT_MS / 1000}s` : describeThrown(err) });
  }
  if (res.ok) return res;
  const body = readErrorBody(await res.text().catch(() => ''));
  throw new FirestoreRequestError({ label, httpStatus: res.status, ...body });
}

async function readJson(res: Response, label: string): Promise<unknown> {
  try {
    return (await res.json()) as unknown;
  } catch {
    throw new FirestoreRequestError({ label, httpStatus: res.status, kind: 'bad-response', message: 'the answer was not valid JSON' });
  }
}

/** One runQuery round trip; throws a `FirestoreRequestError` on any failure. */
async function execute(spec: QuerySpec, revalidate: number, label = `query on "${spec.collection}"`): Promise<PlainDoc[]> {
  const res = await call(`${ROOT}:runQuery?${KEY}`, label, {
    method: 'POST',
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildQuery(spec)),
    next: { revalidate }
  });
  const rows = await readJson(res, label);
  if (!Array.isArray(rows)) throw new FirestoreRequestError({ label, httpStatus: res.status, kind: 'bad-response', message: 'expected a list of results' });
  const failed = rows.find((r) => isRecord(r) && isRecord(r.error)); // a stream can fail after it started with a 200
  if (failed) throw new FirestoreRequestError({ label, httpStatus: res.status === 200 ? 500 : res.status, ...readErrorBody(JSON.stringify(failed)) });
  // An empty result is `[{ "readTime": "…" }]`: one row without a document.
  return rows.flatMap((r) => (isRecord(r) && isFsDocument(r.document) ? [decodeDocument(r.document)] : []));
}

/* ───────────────────────────── ordering in memory (missing-index fallback) ───────────────────────────── */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function comparable(v: unknown): number | string {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && ISO_TIMESTAMP.test(v)) {
    const t = Date.parse(v); // compare as time: "…:00.5Z" sorts after "…:00Z", which plain string comparison would get wrong
    if (!Number.isNaN(t)) return t;
  }
  return String(v);
}
function compareValues(a: unknown, b: unknown): number {
  const x = comparable(a);
  const y = comparable(b);
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  const sx = String(x);
  const sy = String(y);
  return sx < sy ? -1 : sx > sy ? 1 : 0;
}

/** Applies `spec.orderBy` and `spec.limit` the way Firestore would — including leaving out documents that lack an ordered field. */
function orderInMemory(docs: PlainDoc[], spec: QuerySpec): PlainDoc[] {
  const keys = spec.orderBy ?? [];
  const sorted = docs.filter((d) => keys.every((k) => d[k.field] !== undefined && d[k.field] !== null));
  const last = keys.at(-1)?.direction === 'DESCENDING' ? -1 : 1;
  sorted.sort((a, b) => {
    for (const k of keys) {
      const c = compareValues(a[k.field], b[k.field]);
      if (c !== 0) return k.direction === 'DESCENDING' ? -c : c;
    }
    return last * (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); // Firestore breaks ties by document id
  });
  return spec.limit ? sorted.slice(0, spec.limit) : sorted;
}

/** Without an ordering Firestore needs only the automatic single-field indexes. The ordered fields must come back to sort on. */
const FALLBACK_LIMIT = 500;
function withoutOrdering(spec: QuerySpec): QuerySpec {
  const needed = (spec.orderBy ?? []).map((o) => o.field);
  return { ...spec, orderBy: undefined, limit: FALLBACK_LIMIT, select: spec.select ? [...new Set([...spec.select, ...needed])] : undefined };
}

/* ───────────────────────────── public API ───────────────────────────── */
/** `ok: false` means "we could not ask" — never "there is nothing". `degraded` means the answer is right but was obtained the slow way. */
export type Outcome<T> = { ok: true; value: T; degraded: boolean } | { ok: false; error: FirestoreRequestError };

const FALLBACK_NOTE = 'Meanwhile the list is fetched without its ordering and sorted in memory: the content is correct, only less efficient.';

/**
 * Runs a query. Never throws. A missing composite index does not take the page down: the query is repeated without its
 * ordering (which needs no composite index) and ordered here, and the cause is still logged with the link to create the index.
 * `fallback: false` turns that off — the diagnostic script uses it to see the raw failure.
 */
export async function queryDocuments(spec: QuerySpec, revalidate = 60, opts: { fallback?: boolean } = {}): Promise<Outcome<PlainDoc[]>> {
  try {
    return { ok: true, value: await execute(spec, revalidate), degraded: false };
  } catch (first) {
    const error = asRequestError(first, `query on "${spec.collection}"`);
    const canFallBack = opts.fallback !== false && error.kind === 'missing-index' && !!spec.orderBy?.length;
    report(error, canFallBack ? FALLBACK_NOTE : undefined);
    if (!canFallBack) return { ok: false, error };
    const retryLabel = `query on "${spec.collection}" (retry without ordering)`;
    try {
      return { ok: true, value: orderInMemory(await execute(withoutOrdering(spec), revalidate, retryLabel), spec), degraded: true };
    } catch (second) {
      const retryError = asRequestError(second, retryLabel);
      report(retryError);
      return { ok: false, error: retryError };
    }
  }
}

/** Reads one document. A document that does not exist is a normal `ok` result with `value: null`; everything else that fails is `ok: false`. */
export async function readDocument(path: string, revalidate = 60): Promise<Outcome<PlainDoc | null>> {
  const label = `read of "${path}"`;
  try {
    const res = await call(`${ROOT}/${path}?${KEY}`, label, { headers: BASE_HEADERS, next: { revalidate } });
    const json = await readJson(res, label);
    if (!isFsDocument(json)) throw new FirestoreRequestError({ label, httpStatus: res.status, kind: 'bad-response', message: 'the answer was not a document' });
    return { ok: true, value: decodeDocument(json), degraded: false };
  } catch (err) {
    const error = asRequestError(err, label);
    if (error.kind === 'not-found') return { ok: true, value: null, degraded: false };
    report(error);
    return { ok: false, error };
  }
}

/** Lenient form of `queryDocuments`: the documents, or `[]` when the request failed (the failure is logged). */
export async function runQuery(spec: QuerySpec, revalidate = 60): Promise<PlainDoc[]> {
  const outcome = await queryDocuments(spec, revalidate);
  return outcome.ok ? outcome.value : [];
}

/** Lenient form of `readDocument`: the document, or `null` when it is missing or the request failed (the failure is logged). */
export async function getDocument(path: string, revalidate = 60): Promise<PlainDoc | null> {
  const outcome = await readDocument(path, revalidate);
  return outcome.ok ? outcome.value : null;
}
