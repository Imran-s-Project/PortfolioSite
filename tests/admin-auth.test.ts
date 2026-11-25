/**
 * Who may ask the server to refresh the public pages (/api/revalidate). Google's services are replaced by a fake `fetch`.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { firebaseConfig } from '@/config/firebase';
import { SITE_URL } from '@/config/site';
import { verifyAdmin } from '@/lib/server/admin-auth';

interface Call {
  url: string;
  headers: Record<string, string>;
  body?: string;
}
type Answer = Response | Error;
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fake fetch: the first answer is for Identity Toolkit (who owns this token?), the second for the administrator document. */
function fake(...answers: Answer[]): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)), body: typeof init?.body === 'string' ? init.body : undefined });
    const answer = answers[calls.length - 1];
    if (!answer) throw new Error('unexpected extra request');
    if (answer instanceof Error) throw answer;
    return answer;
  }) as typeof fetch;
  return { fetchImpl, calls };
}
const owner = (uid: string) => json({ users: [{ localId: uid }] });
const adminDoc = (role: unknown) => json({ name: 'projects/x/databases/(default)/documents/adminProfiles/u', fields: role === undefined ? {} : { role: { stringValue: role } } });

describe('verifyAdmin', () => {
  test('no token: 401, and Google is not even asked', async () => {
    for (const token of [undefined, null, '']) {
      const { fetchImpl, calls } = fake();
      assert.deepEqual(await verifyAdmin(token, fetchImpl), { ok: false, status: 401, error: 'missing token' });
      assert.equal(calls.length, 0);
    }
  });

  test('a token Google does not accept: 401', async () => {
    for (const answer of [json({ error: { message: 'INVALID_ID_TOKEN' } }, 400), json({}, 500), new Error('network down')]) {
      const { fetchImpl, calls } = fake(answer);
      assert.deepEqual(await verifyAdmin('forged', fetchImpl), { ok: false, status: 401, error: 'invalid token' });
      assert.equal(calls.length, 1, 'the administrator document is never read for an unknown caller');
    }
  });

  test('an answer without a usable user id: 401', async () => {
    for (const answer of [json({}), json({ users: [] }), json({ users: [{}] }), json({ users: [{ localId: 42 }] }), json({ users: [{ localId: 'a/../b' }] }), json({ users: [{ localId: 'ab' }] }), new Response('not json')]) {
      const { fetchImpl } = fake(answer);
      assert.equal((await verifyAdmin('tok', fetchImpl)).ok, false);
    }
  });

  test('signed in but without an administrator document: 403', async () => {
    const { fetchImpl } = fake(owner('visitor123'), json({ error: { status: 'NOT_FOUND' } }, 404));
    assert.deepEqual(await verifyAdmin('tok', fetchImpl), { ok: false, status: 403, error: 'not an administrator' });
  });

  test('the document alone is not enough — its role must be "admin", as in the Security Rules', async () => {
    for (const role of ['editor', 'ADMIN', '', 'administrator', undefined, 7, null]) {
      const { fetchImpl } = fake(owner('someone123'), adminDoc(role));
      const result = await verifyAdmin('tok', fetchImpl);
      assert.deepEqual(result, { ok: false, status: 403, error: 'not an administrator' }, String(role));
    }
  });

  test('an unreadable or failing document answer is a refusal, never a pass', async () => {
    for (const answer of [new Response('<html>', { status: 200 }), json({}, 500), new Error('timeout')]) {
      const { fetchImpl } = fake(owner('someone123'), answer);
      assert.equal((await verifyAdmin('tok', fetchImpl)).ok, false);
    }
  });

  test('an administrator is let through, with their uid', async () => {
    const { fetchImpl } = fake(owner('admin-uid-123'), adminDoc('admin'));
    assert.deepEqual(await verifyAdmin('tok', fetchImpl), { ok: true, uid: 'admin-uid-123' });
  });

  test('the document is read with the CALLER’s token (so the Security Rules decide), and the token never goes into a URL', async () => {
    const { fetchImpl, calls } = fake(owner('admin-uid-123'), adminDoc('admin'));
    await verifyAdmin('caller-token-value', fetchImpl);
    assert.equal(calls.length, 2);
    assert.ok(calls[0].url.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='));
    assert.equal(JSON.parse(calls[0].body ?? '{}').idToken, 'caller-token-value', 'the token travels in the request body');
    assert.ok(calls[1].url.includes('/documents/adminProfiles/admin-uid-123?key='));
    assert.equal(calls[1].headers.Authorization, 'Bearer caller-token-value');
    for (const call of calls) assert.ok(!call.url.includes('caller-token-value'), 'a token in a URL would end up in logs');
  });

  test('server requests carry the site as Referer, so a key restricted to "HTTP referrers" accepts them', async () => {
    const { fetchImpl, calls } = fake(owner('admin-uid-123'), adminDoc('admin'));
    await verifyAdmin('tok', fetchImpl);
    // The address is detected from the environment (https on Vercel, http://localhost:3000 in development) — never a fixed domain.
    for (const call of calls) {
      assert.match(call.headers.Referer ?? '', /^https?:\/\/[^/]+\/$/, 'an origin with a trailing slash');
      assert.equal(call.headers.Referer, `${SITE_URL}/`, 'the address the site detected for itself');
    }
  });

  test('the user id is escaped in the path, so it cannot reach another document', async () => {
    const { fetchImpl, calls } = fake(owner('abc/../../x'), adminDoc('admin'));
    await verifyAdmin('tok', fetchImpl);
    assert.equal(calls.length, 1, 'such an id is refused before any document is read');
  });

  test('the API key is only ever sent as the key parameter, URL-encoded', async () => {
    const { fetchImpl, calls } = fake(owner('admin-uid-123'), adminDoc('admin'));
    await verifyAdmin('tok', fetchImpl);
    for (const call of calls) assert.ok(call.url.includes(`key=${encodeURIComponent(firebaseConfig.apiKey)}`));
  });
});
