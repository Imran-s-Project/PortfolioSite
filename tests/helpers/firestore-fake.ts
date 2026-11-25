/**
 * A stand-in for Firestore's REST endpoint, so the server-side data layer can be tested without a network:
 * it replaces `fetch`, records every request and answers with whatever the test says.
 */
import { mock } from 'node:test';
import type { FsValue } from '@/lib/firestore/rest';

/* ── encoding: plain objects → Firestore REST values ── */
export function toFsValue(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v as Record<string, unknown>) } };
  throw new Error(`cannot encode a ${typeof v}`);
}
export const toFields = (o: Record<string, unknown>): Record<string, FsValue> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, toFsValue(v)]));

export interface FakeDocument {
  name: string;
  fields: Record<string, FsValue>;
}
export const fsDocument = (collection: string, id: string, fields: Record<string, unknown>): FakeDocument => ({
  name: `projects/test/databases/(default)/documents/${collection}/${id}`,
  fields: toFields(fields)
});
/** A runQuery answer. No documents is not `[]` but one row without a document: `[{ readTime }]`. */
export const queryRows = (...docs: FakeDocument[]): unknown[] =>
  docs.length ? docs.map((document) => ({ document, readTime: '2026-11-18T00:00:00Z' })) : [{ readTime: '2026-11-18T00:00:00Z' }];

/* ── responses ── */
export const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Google's error body. `wrap` mimics streaming methods such as runQuery, which wrap the error in an array. */
export function googleError(status: number, code: string, message: string, opts: { reason?: string; wrap?: boolean } = {}): Response {
  const error = {
    code: status,
    message,
    status: code,
    ...(opts.reason ? { details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: opts.reason, domain: 'googleapis.com', metadata: { service: 'firestore.googleapis.com' } }] } : {})
  };
  return json(status, opts.wrap ? [{ error }] : { error });
}

/* ── the fake itself ── */
export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** The decoded `structuredQuery`, for runQuery calls. */
  query: Record<string, unknown> | null;
  init: RequestInit;
}

/**
 * Replaces `fetch` until `mock.restoreAll()`. `respond` gets each request (and its 1-based number) and returns the answer;
 * returning an Error makes `fetch` reject, like a network failure.
 */
export function fakeFirestore(respond: (call: RecordedCall, n: number) => Response | Error | Promise<Response | Error>): RecordedCall[] {
  const calls: RecordedCall[] = [];
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as { structuredQuery?: Record<string, unknown> }) : null;
    const call: RecordedCall = {
      url: String(input),
      method: init.method ?? 'GET',
      headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>)),
      query: body?.structuredQuery ?? null,
      init
    };
    calls.push(call);
    const answer = await respond(call, calls.length);
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return calls;
}

/** Captures what a console method prints (and keeps it off the test report). */
export function captureConsole(method: 'error' | 'warn'): string[] {
  const lines: string[] = [];
  mock.method(console, method, (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '));
  });
  return lines;
}

/* ── a valid published post, as Firestore stores it ── */
export const postFields = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  slug: 'hello',
  status: 'published',
  schemaVersion: 1,
  title: { bn: 'হ্যালো', en: 'Hello' },
  excerpt: { bn: 'সারাংশ', en: 'Excerpt' },
  categoryId: 'tech',
  tagIds: ['a'],
  featured: false,
  publishedAt: new Date('2026-11-01T10:00:00Z'),
  createdAt: new Date('2026-10-30T10:00:00Z'),
  updatedAt: new Date('2026-11-01T10:00:00Z'),
  authorId: 'u1',
  seo: { metaTitle: { bn: '', en: '' }, metaDescription: { bn: '', en: '' }, noindex: false },
  readingMinutes: { bn: 2, en: 2 },
  views: 5,
  ...over
});
