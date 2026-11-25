import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { firebaseConfig } from '@/config/firebase';
import { SITE_URL } from '@/config/site';
import { classifyFailure, FirestoreRequestError, getDocument, queryDocuments, readDocument, resetFailureLog, runQuery, scrub, type QuerySpec } from '@/lib/firestore/rest';
import { captureConsole, fakeFirestore, fsDocument, googleError, json, queryRows } from './helpers/firestore-fake';

const INDEX_LINK = 'https://console.firebase.google.com/v1/r/project/demo/firestore/indexes?create_composite=Cgpi';
const MISSING_INDEX = () => googleError(400, 'FAILED_PRECONDITION', `The query requires an index. You can create it here: ${INDEX_LINK}`, { wrap: true });
const FAKE_KEY = `AIza${'x'.repeat(35)}`;

const latest: QuerySpec = {
  collection: 'blogPosts',
  where: [{ field: 'status', op: 'EQUAL', value: 'published' }],
  orderBy: [{ field: 'publishedAt', direction: 'DESCENDING' }],
  select: ['slug', 'publishedAt'],
  limit: 2
};
const post = (id: string, publishedAt: string | null) => fsDocument('blogPosts', id, { slug: id, publishedAt: publishedAt ? new Date(publishedAt) : undefined });

describe('classifying a failed Firestore request', () => {
  const message = {
    index: `The query requires an index. You can create it here: ${INDEX_LINK}`,
    badKey: 'API key not valid. Please pass a valid API key.',
    referer: 'Requests from referer <empty> are blocked.',
    disabled: 'Cloud Firestore API has not been used in project 123 before or it is disabled. Enable it by visiting …',
    rules: 'Missing or insufficient permissions.',
    noDoc: 'Document "projects/p/databases/(default)/documents/siteSettings/main" not found.',
    noDb: 'The database (default) does not exist for project p. Please visit https://console.cloud.google.com/datastore/setup?project=p to add a database.'
  };
  const cases: [string, Parameters<typeof classifyFailure>[0], string][] = [
    ['the HTTP 400 that was reported: a composite index is not deployed', { httpStatus: 400, code: 'FAILED_PRECONDITION', message: message.index }, 'missing-index'],
    ['index still building', { httpStatus: 400, code: 'FAILED_PRECONDITION', message: 'The query requires an index. That index is currently building and cannot be used yet.' }, 'missing-index'],
    ['a rejected API key is ALSO an HTTP 400', { httpStatus: 400, code: 'INVALID_ARGUMENT', reason: 'API_KEY_INVALID', message: message.badKey }, 'invalid-api-key'],
    ['an API key without a message', { httpStatus: 400, reason: 'API_KEY_INVALID' }, 'invalid-api-key'],
    ['a malformed query', { httpStatus: 400, code: 'INVALID_ARGUMENT', message: 'Invalid field path.' }, 'invalid-query'],
    ['HTTP-referrer-restricted key used from a server', { httpStatus: 403, code: 'PERMISSION_DENIED', reason: 'API_KEY_HTTP_REFERRER_BLOCKED', message: message.referer }, 'api-key-blocked'],
    ['blocked without a reason code', { httpStatus: 403, message: message.referer }, 'api-key-blocked'],
    ['Firestore API disabled', { httpStatus: 403, code: 'PERMISSION_DENIED', reason: 'SERVICE_DISABLED', message: message.disabled }, 'api-disabled'],
    ['Security Rules refusal', { httpStatus: 403, code: 'PERMISSION_DENIED', message: message.rules }, 'permission-denied'],
    ['unauthenticated', { httpStatus: 401 }, 'permission-denied'],
    ['a document that does not exist', { httpStatus: 404, code: 'NOT_FOUND', message: message.noDoc }, 'not-found'],
    ['a database that was never created', { httpStatus: 404, code: 'NOT_FOUND', message: message.noDb }, 'no-database'],
    ['rate limited', { httpStatus: 429, code: 'RESOURCE_EXHAUSTED' }, 'quota'],
    ['Google having a bad moment', { httpStatus: 503, code: 'UNAVAILABLE' }, 'unavailable'],
    ['no answer at all', { httpStatus: null }, 'unavailable'],
    ['something unexpected', { httpStatus: 418 }, 'unknown']
  ];
  for (const [name, input, expected] of cases) test(`${name} → ${expected}`, () => assert.equal(classifyFailure(input), expected));
});

describe('scrub: nothing key-shaped ever reaches a log', () => {
  test('removes key= parameters, key-shaped strings and the configured key', () => {
    const text = `GET https://x/y?alt=json&key=${FAKE_KEY}&z=1 failed for ${FAKE_KEY} and ${firebaseConfig.apiKey}`;
    const out = scrub(text);
    assert.ok(!out.includes(FAKE_KEY) && !out.includes(firebaseConfig.apiKey), 'no key survives');
    assert.ok(out.includes('key=[redacted]&z=1'), 'the rest of the URL is kept');
  });
  test('also removes any extra secret it is told about, but ignores ones too short to be a secret', () => {
    assert.equal(scrub('the token tok-1234567890 here', ['tok-1234567890']), 'the token [redacted] here');
    assert.equal(scrub('a k b', ['k']), 'a k b');
  });
  test('collapses whitespace', () => assert.equal(scrub('a \n  b\t c '), 'a b c'));
});

describe('queryDocuments: failures are explained, never silently turned into "nothing"', () => {
  let logged: string[];
  beforeEach(() => {
    resetFailureLog();
    logged = captureConsole('error');
  });
  afterEach(() => mock.restoreAll());

  test('asks Firestore the right question, the right way', async () => {
    const calls = fakeFirestore(() => json(200, queryRows()));
    await queryDocuments(latest);
    assert.equal(calls.length, 1);
    const [call] = calls;
    assert.ok(call.url.startsWith(`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents:runQuery?key=`));
    assert.equal(call.method, 'POST');
    assert.equal(call.headers.Referer, `${SITE_URL}/`, 'a server call has no Referer of its own — without this, a referrer-restricted key answers 403');
    assert.equal(call.headers['Content-Type'], 'application/json');
    assert.deepEqual(call.init.signal instanceof AbortSignal, true, 'a hung request must time out instead of stalling a build');
    assert.deepEqual((call.init as { next?: unknown }).next, { revalidate: 60 });
    assert.equal(call.query?.limit, 2);
  });

  test('an empty result is a successful, empty answer', async () => {
    fakeFirestore(() => json(200, queryRows()));
    const out = await queryDocuments(latest);
    assert.deepEqual(out, { ok: true, value: [], degraded: false });
    assert.equal(logged.length, 0);
  });

  test('HTTP 400 FAILED_PRECONDITION (the reported error) is identified as a missing index, with the fix and the link', async () => {
    fakeFirestore(() => MISSING_INDEX());
    const out = await queryDocuments(latest, 60, { fallback: false });
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.error.kind, 'missing-index');
    assert.equal(out.error.httpStatus, 400);
    assert.equal(out.error.code, 'FAILED_PRECONDITION');
    assert.equal(out.error.indexUrl, INDEX_LINK);
    assert.ok(out.error.message.includes('firebase deploy --only firestore:indexes'));
    assert.equal(logged.length, 1);
    assert.ok(logged[0].includes('[firestore] query on "blogPosts" failed: HTTP 400 FAILED_PRECONDITION [missing-index]'));
    assert.ok(logged[0].includes(`index link: ${INDEX_LINK}`));
  });

  test('a missing index does not take the blog down: same query without ordering, sorted here — and the cause is still logged', async () => {
    const calls = fakeFirestore((_, n) =>
      n === 1 ? MISSING_INDEX() : json(200, queryRows(post('old', '2026-01-01T00:00:00Z'), post('newest', '2026-11-10T00:00:00.5Z'), post('mid', '2026-06-01T00:00:00Z'), post('newest-whole-second', '2026-11-10T00:00:00Z'), post('no-date', null)))
    );
    const out = await queryDocuments(latest);
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.degraded, true);
    assert.deepEqual(out.value.map((d) => d.id), ['newest', 'newest-whole-second'], 'newest first, a fractional second counts, limit applied, undated posts left out like Firestore does');
    assert.equal(calls.length, 2);
    const retry = calls[1].query as { orderBy?: unknown; limit?: number; select?: { fields: { fieldPath: string }[] }; where?: unknown };
    assert.equal(retry.orderBy, undefined, 'the retry needs no composite index');
    assert.equal(retry.limit, 500);
    assert.ok(retry.where, 'the filters stay');
    assert.equal(logged.length, 1);
    assert.ok(logged[0].includes('[missing-index]') && logged[0].includes('sorted in memory'));
  });

  test('the retry fetches the ordered field even when the query did not select it', async () => {
    const calls = fakeFirestore((_, n) => (n === 1 ? MISSING_INDEX() : json(200, queryRows())));
    await queryDocuments({ ...latest, select: ['slug'] });
    const select = (calls[1].query as { select: { fields: { fieldPath: string }[] } }).select.fields.map((f) => f.fieldPath);
    assert.deepEqual(select, ['slug', 'publishedAt']);
  });

  test('ascending order and ties are handled like Firestore (ties by document id)', async () => {
    fakeFirestore((_, n) => (n === 1 ? MISSING_INDEX() : json(200, queryRows(post('b', '2026-01-01T00:00:00Z'), post('a', '2026-01-01T00:00:00Z'), post('c', '2025-01-01T00:00:00Z')))));
    const out = await queryDocuments({ ...latest, orderBy: [{ field: 'publishedAt', direction: 'ASCENDING' }], limit: undefined });
    assert.ok(out.ok);
    if (out.ok) assert.deepEqual(out.value.map((d) => d.id), ['c', 'a', 'b']);
  });

  test('when even the retry fails, the failure is reported — not an empty list', async () => {
    fakeFirestore((_, n) => (n === 1 ? MISSING_INDEX() : googleError(503, 'UNAVAILABLE', 'try later')));
    const out = await queryDocuments(latest);
    assert.equal(out.ok, false);
    if (!out.ok) {
      assert.equal(out.error.kind, 'unavailable');
      assert.ok(out.error.label.includes('without ordering'));
    }
  });

  test('a query without an ordering has nothing to fall back to', async () => {
    const calls = fakeFirestore(() => MISSING_INDEX());
    const out = await queryDocuments({ collection: 'blogPosts', where: latest.where });
    assert.equal(out.ok, false);
    assert.equal(calls.length, 1);
  });

  test('a rejected API key (HTTP 400 as well) is told apart from a missing index — and the key never appears in the log', async () => {
    fakeFirestore(() => googleError(400, 'INVALID_ARGUMENT', `API key ${firebaseConfig.apiKey} not valid. Please pass a valid API key. (${FAKE_KEY})`, { reason: 'API_KEY_INVALID', wrap: true }));
    const out = await queryDocuments(latest);
    assert.ok(!out.ok);
    if (out.ok) return;
    assert.equal(out.error.kind, 'invalid-api-key');
    const everything = `${out.error.message}\n${logged.join('\n')}`;
    assert.ok(!everything.includes(firebaseConfig.apiKey) && !everything.includes(FAKE_KEY), 'no key in message or log');
    assert.ok(everything.includes('NEXT_PUBLIC_FIREBASE_API_KEY'), 'tells the owner where to look');
  });

  test('an API-key restriction and Security Rules are different problems with different advice', async () => {
    fakeFirestore(() => googleError(403, 'PERMISSION_DENIED', 'Requests from referer <empty> are blocked.', { reason: 'API_KEY_HTTP_REFERRER_BLOCKED' }));
    const blocked = await queryDocuments(latest);
    fakeFirestore(() => googleError(403, 'PERMISSION_DENIED', 'Missing or insufficient permissions.'));
    resetFailureLog();
    const denied = await queryDocuments({ ...latest, collection: 'other' });
    assert.ok(!blocked.ok && !denied.ok);
    if (blocked.ok || denied.ok) return;
    assert.equal(blocked.error.kind, 'api-key-blocked');
    assert.ok(blocked.error.hint.includes('HTTP referrers'));
    assert.equal(denied.error.kind, 'permission-denied');
    assert.ok(denied.error.hint.includes('firestore.rules'));
  });

  test('a network failure and a timeout say so', async () => {
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND firestore.googleapis.com'), { code: 'ENOTFOUND' });
    fakeFirestore(() => new TypeError('fetch failed', { cause }));
    const offline = await queryDocuments(latest);
    fakeFirestore(() => new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    resetFailureLog();
    const slow = await queryDocuments(latest);
    assert.ok(!offline.ok && !slow.ok);
    if (offline.ok || slow.ok) return;
    assert.equal(offline.error.kind, 'unavailable');
    assert.equal(offline.error.httpStatus, null);
    assert.ok(offline.error.message.includes('ENOTFOUND'));
    assert.equal(slow.error.kind, 'unavailable');
    assert.ok(slow.error.message.includes('no answer within 10s'));
  });

  test('a proxy error page (not JSON) is reported, clipped', async () => {
    fakeFirestore(() => new Response(`<html>${'Bad gateway '.repeat(100)}</html>`, { status: 502 }));
    const out = await queryDocuments(latest);
    assert.ok(!out.ok);
    if (!out.ok) {
      assert.equal(out.error.kind, 'unavailable');
      assert.ok(out.error.message.length < 1200);
    }
  });

  test('an answer that is not the expected JSON is "bad-response"', async () => {
    fakeFirestore(() => new Response('not json', { status: 200 }));
    const notJson = await queryDocuments(latest);
    fakeFirestore(() => json(200, { surprise: true }));
    resetFailureLog();
    const notAList = await queryDocuments(latest);
    assert.ok(!notJson.ok && !notAList.ok);
    if (!notJson.ok && !notAList.ok) assert.deepEqual([notJson.error.kind, notAList.error.kind], ['bad-response', 'bad-response']);
  });

  test('an error that arrives inside a 200 stream is still an error', async () => {
    fakeFirestore(() => json(200, [{ error: { code: 503, status: 'UNAVAILABLE', message: 'stream broke' } }]));
    const out = await queryDocuments(latest);
    assert.ok(!out.ok);
    if (!out.ok) assert.equal(out.error.kind, 'unavailable');
  });

  test('the same failure is logged once, with a count of what was held back when the window has passed', async () => {
    fakeFirestore(() => googleError(500, 'INTERNAL', 'oops'));
    let now = 1_000_000;
    mock.method(Date, 'now', () => now);
    await Promise.all([queryDocuments(latest), queryDocuments(latest), queryDocuments(latest)]);
    assert.equal(logged.length, 1, 'three identical failures, one line');
    now += 60_000;
    await queryDocuments(latest);
    assert.equal(logged.length, 1, 'still inside the window');
    now += 6 * 60_000;
    await queryDocuments(latest);
    assert.equal(logged.length, 2);
    assert.ok(logged[1].includes('3 identical failures'));
    await queryDocuments({ ...latest, collection: 'blogTags' });
    assert.equal(logged.length, 3, 'a different cause is logged straight away');
  });

  test('runQuery stays lenient (an empty list on failure) — but the failure is still logged', async () => {
    fakeFirestore(() => googleError(500, 'INTERNAL', 'oops'));
    assert.deepEqual(await runQuery(latest), []);
    assert.equal(logged.length, 1);
  });
});

describe('readDocument', () => {
  let logged: string[];
  beforeEach(() => {
    resetFailureLog();
    logged = captureConsole('error');
  });
  afterEach(() => mock.restoreAll());

  test('reads and decodes a document', async () => {
    const calls = fakeFirestore(() => json(200, fsDocument('siteSettings', 'main', { siteName: 'Imran', theme: 'ember' })));
    const out = await readDocument('siteSettings/main');
    assert.ok(out.ok);
    if (out.ok) assert.deepEqual(out.value, { siteName: 'Imran', theme: 'ember', id: 'main' });
    assert.ok(calls[0].url.includes('/documents/siteSettings/main?key='));
    assert.equal(calls[0].headers.Referer, `${SITE_URL}/`);
  });

  test('a document that does not exist is a normal answer, not a failure — nothing is logged', async () => {
    fakeFirestore(() => googleError(404, 'NOT_FOUND', 'Document "projects/p/databases/(default)/documents/siteSettings/main" not found.'));
    assert.deepEqual(await readDocument('siteSettings/main'), { ok: true, value: null, degraded: false });
    assert.equal(logged.length, 0);
  });

  test('a database that was never created is a failure, with its own advice', async () => {
    fakeFirestore(() => googleError(404, 'NOT_FOUND', 'The database (default) does not exist for project p.'));
    const out = await readDocument('siteSettings/main');
    assert.ok(!out.ok);
    if (!out.ok) {
      assert.equal(out.error.kind, 'no-database');
      assert.ok(out.error.hint.includes('Create it in Firebase Console'));
    }
    assert.equal(logged.length, 1);
  });

  test('permission errors and non-document answers are failures', async () => {
    fakeFirestore(() => googleError(403, 'PERMISSION_DENIED', 'Missing or insufficient permissions.'));
    const denied = await readDocument('siteSettings/main');
    fakeFirestore(() => json(200, ['nope']));
    resetFailureLog();
    const odd = await readDocument('siteSettings/main');
    assert.ok(!denied.ok && !odd.ok);
    if (!denied.ok && !odd.ok) assert.deepEqual([denied.error.kind, odd.error.kind], ['permission-denied', 'bad-response']);
  });

  test('getDocument stays lenient: null for missing and for failed (the failure is logged)', async () => {
    fakeFirestore(() => googleError(500, 'INTERNAL', 'oops'));
    assert.equal(await getDocument('siteSettings/main'), null);
    assert.equal(logged.length, 1);
  });
});

describe('FirestoreRequestError', () => {
  test('is an Error with a readable one-line message', () => {
    const e = new FirestoreRequestError({ label: 'query on "x"', httpStatus: 400, code: 'FAILED_PRECONDITION', message: 'The query requires an index.\n You can create it here: ' + INDEX_LINK });
    assert.ok(e instanceof Error && e.name === 'FirestoreRequestError');
    assert.ok(!e.message.includes('\n'));
    assert.equal(e.kind, 'missing-index');
  });
});
