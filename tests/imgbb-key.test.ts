/**
 * /api/imgbb-key hands the ImgBB API key to administrators only. Google's services are replaced by a fake `fetch`.
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/imgbb-key/route';

const KEY = '0123456789abcdef0123456789abcdef';
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const owner = (uid: string) => json({ users: [{ localId: uid }] });
const adminDoc = (role: string) => json({ fields: { role: { stringValue: role } } });

const realFetch = globalThis.fetch;
const realKey = process.env.IMGBB_API_KEY;
let asked: string[] = [];

/** A fake Google: the first answer is for "whose token is this?", the second for the administrator document. */
function google(...answers: Response[]): void {
  asked = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    asked.push(String(input));
    const next = answers[asked.length - 1];
    if (!next) throw new Error('unexpected extra request');
    return next;
  }) as typeof fetch;
}
const request = (authorization?: string) => new NextRequest('http://localhost/api/imgbb-key', { method: 'POST', headers: authorization ? { authorization } : {} });

describe('POST /api/imgbb-key', () => {
  beforeEach(() => {
    process.env.IMGBB_API_KEY = KEY;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.IMGBB_API_KEY;
    else process.env.IMGBB_API_KEY = realKey;
  });

  test('an administrator gets the key, and it is never cached', async () => {
    google(owner('admin-user-1'), adminDoc('admin'));
    const res = await POST(request('Bearer good-token'));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { key: KEY });
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });

  test('no token: 401, and the key is not in the answer', async () => {
    google();
    const res = await POST(request());
    assert.equal(res.status, 401);
    assert.ok(!JSON.stringify(await res.json()).includes(KEY));
    assert.equal(asked.length, 0);
  });

  test('a forged token: 401', async () => {
    google(json({ error: { message: 'INVALID_ID_TOKEN' } }, 400));
    const res = await POST(request('Bearer forged'));
    assert.equal(res.status, 401);
    assert.ok(!JSON.stringify(await res.json()).includes(KEY));
  });

  test('signed in but not an administrator: 403, and the key is not in the answer', async () => {
    for (const second of [json({ error: { status: 'NOT_FOUND' } }, 404), adminDoc('editor')]) {
      google(owner('visitor-123'), second);
      const res = await POST(request('Bearer visitor-token'));
      assert.equal(res.status, 403);
      assert.ok(!JSON.stringify(await res.json()).includes(KEY));
    }
  });

  test('an administrator on a server without IMGBB_API_KEY: 503', async () => {
    for (const value of [undefined, '', '   ']) {
      if (value === undefined) delete process.env.IMGBB_API_KEY;
      else process.env.IMGBB_API_KEY = value;
      google(owner('admin-user-1'), adminDoc('admin'));
      const res = await POST(request('Bearer good-token'));
      assert.equal(res.status, 503);
      assert.equal(res.headers.get('cache-control'), 'no-store');
    }
  });
});
