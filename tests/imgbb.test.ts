/**
 * ImgBB uploads: how its answers are read, how the API key is fetched (administrators only) and how a failing network is retried.
 * ImgBB itself and the browser's XMLHttpRequest are replaced by fakes — nothing here touches the network.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ImgbbError, forgetUploadKey, getUploadKey, hostImage, parseImgbbResponse, uploadToImgbb } from '@/features/admin/imgbb';

/** The example answer from ImgBB's API documentation. */
const DOCS_ANSWER = JSON.stringify({
  data: {
    id: '2ndCYJK',
    title: 'c1f64245afb2',
    url_viewer: 'https://ibb.co/2ndCYJK',
    url: 'https://i.ibb.co/w04Prt6/c1f64245afb2.gif',
    display_url: 'https://i.ibb.co/98W13PY/c1f64245afb2.gif',
    width: '1',
    height: '1',
    size: '42',
    time: '1552042565',
    expiration: '0',
    image: { filename: 'c1f64245afb2.gif', name: 'c1f64245afb2', mime: 'image/gif', extension: 'gif', url: 'https://i.ibb.co/w04Prt6/c1f64245afb2.gif' },
    delete_url: 'https://ibb.co/2ndCYJK/670a7e48ddcb85ac340c717a41047e5c'
  },
  success: true,
  status: 200
});
const INVALID_KEY = JSON.stringify({ status_code: 400, error: { message: 'Invalid API v1 key.', code: 100 }, status_txt: 'Bad Request' });

function failure(fn: () => unknown): ImgbbError {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof ImgbbError, 'throws an ImgbbError');
    return err;
  }
  assert.fail('should have thrown');
}

describe('parseImgbbResponse', () => {
  test('reads a successful upload', () => {
    assert.deepEqual(parseImgbbResponse(200, DOCS_ANSWER), {
      id: '2ndCYJK',
      url: 'https://i.ibb.co/w04Prt6/c1f64245afb2.gif',
      deleteUrl: 'https://ibb.co/2ndCYJK/670a7e48ddcb85ac340c717a41047e5c',
      width: 1,
      height: 1
    });
  });

  test('sizes arrive as strings and are kept only when they are sensible whole numbers', () => {
    const answer = (width: unknown, height: unknown) => JSON.stringify({ success: true, data: { id: 'a1', url: 'https://i.ibb.co/x/a.png', width, height } });
    assert.deepEqual(parseImgbbResponse(200, answer('1200', '630')), { id: 'a1', url: 'https://i.ibb.co/x/a.png', width: 1200, height: 630 });
    for (const [w, h] of [['0', '10'], ['abc', '10'], ['99999', '10'], [undefined, undefined], ['10', '']]) {
      assert.deepEqual(parseImgbbResponse(200, answer(w, h)), { id: 'a1', url: 'https://i.ibb.co/x/a.png' });
    }
  });

  test('an http address is upgraded; the direct link falls back to image.url; a bad delete link is dropped', () => {
    const body = JSON.stringify({ success: true, data: { id: 'a1', image: { url: 'http://i.ibb.co/x/a.png' }, delete_url: 'javascript:alert(1)' } });
    assert.deepEqual(parseImgbbResponse(200, body), { id: 'a1', url: 'https://i.ibb.co/x/a.png' });
  });

  test('an answer without a usable id or address is a failure, never half an image', () => {
    for (const data of [{}, { id: 'a1' }, { url: 'https://i.ibb.co/x/a.png' }, { id: 'a/../b', url: 'https://i.ibb.co/x/a.png' }, { id: 'a1', url: 'javascript:alert(1)' }, { id: 'a1', url: 'data:image/png;base64,AAAA' }]) {
      const err = failure(() => parseImgbbResponse(200, JSON.stringify({ success: true, data })));
      assert.deepEqual([err.reason, err.retryable], ['failed', false]);
    }
    assert.equal(failure(() => parseImgbbResponse(200, JSON.stringify({ success: false, data: { id: 'a1', url: 'https://i.ibb.co/x/a.png' } }))).reason, 'failed');
  });

  test('a key ImgBB refuses is a configuration problem, not a connection problem', () => {
    const err = failure(() => parseImgbbResponse(400, INVALID_KEY));
    assert.deepEqual([err.reason, err.retryable], ['config', false]);
  });

  test('server errors are worth retrying, client errors are not, and a page that is not JSON is just a failure', () => {
    assert.deepEqual(((e) => [e.reason, e.retryable])(failure(() => parseImgbbResponse(503, '<html>Bad gateway</html>'))), ['failed', true]);
    assert.deepEqual(((e) => [e.reason, e.retryable])(failure(() => parseImgbbResponse(400, JSON.stringify({ error: { message: 'Empty upload source.' } })))), ['failed', false]);
    assert.deepEqual(((e) => [e.reason, e.retryable])(failure(() => parseImgbbResponse(429, '{}'))), ['failed', false]);
    assert.equal(failure(() => parseImgbbResponse(200, 'null')).reason, 'failed');
  });
});

describe('getUploadKey', () => {
  beforeEach(() => forgetUploadKey());
  const KEY = '0123456789abcdef0123456789abcdef';
  const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const token = async () => 'id-token';
  interface Call {
    url: string;
    init?: RequestInit;
  }
  function fake(...answers: Array<Response | Error>): { fetchImpl: typeof fetch; calls: Call[] } {
    const calls: Call[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      const answer = answers[calls.length - 1];
      if (!answer) throw new Error('unexpected extra request');
      if (answer instanceof Error) throw answer;
      return answer;
    }) as typeof fetch;
    return { fetchImpl, calls };
  }

  test('asks our own server with the administrator’s token, then remembers the answer', async () => {
    const { fetchImpl, calls } = fake(json({ key: KEY }));
    assert.equal(await getUploadKey(token, fetchImpl), KEY);
    assert.equal(await getUploadKey(token, fetchImpl), KEY);
    assert.equal(calls.length, 1, 'one request per session');
    assert.equal(calls[0]?.url, '/api/imgbb-key');
    assert.equal(calls[0]?.init?.method, 'POST');
    assert.deepEqual(calls[0]?.init?.headers, { Authorization: 'Bearer id-token' });
  });

  test('uploads started at the same moment share one request', async () => {
    const { fetchImpl, calls } = fake(json({ key: KEY }));
    const keys = await Promise.all([getUploadKey(token, fetchImpl), getUploadKey(token, fetchImpl), getUploadKey(token, fetchImpl)]);
    assert.deepEqual(keys, [KEY, KEY, KEY]);
    assert.equal(calls.length, 1);
  });

  test('a server without IMGBB_API_KEY is a configuration problem, and the next attempt asks again', async () => {
    const { fetchImpl, calls } = fake(json({ error: 'IMGBB_API_KEY is not set' }, 503), json({ key: KEY }));
    await assert.rejects(getUploadKey(token, fetchImpl), (e) => e instanceof ImgbbError && e.reason === 'config');
    assert.equal(await getUploadKey(token, fetchImpl), KEY);
    assert.equal(calls.length, 2);
  });

  test('not an administrator, no token, no network, no key in the answer: each fails cleanly', async () => {
    for (const answer of [json({ error: 'not an administrator' }, 403), json({ error: 'invalid token' }, 401), new Error('offline')]) {
      forgetUploadKey();
      await assert.rejects(getUploadKey(token, fake(answer).fetchImpl), (e) => e instanceof ImgbbError && e.reason === 'failed');
    }
    const none = fake();
    await assert.rejects(getUploadKey(async () => null, none.fetchImpl), (e) => e instanceof ImgbbError && e.reason === 'failed');
    assert.equal(none.calls.length, 0, 'without a token the server is not even asked');
    await assert.rejects(getUploadKey(token, fake(json({})).fetchImpl), (e) => e instanceof ImgbbError && e.reason === 'config');
  });
});

/* ───────────── a stand-in for the browser's XMLHttpRequest ───────────── */
interface ProgressEvent2 {
  lengthComputable: boolean;
  loaded: number;
  total: number;
}
class FakeXHR {
  static sent: FakeXHR[] = [];
  /** One entry per request: what the "network" does with it. */
  static script: Array<(x: FakeXHR) => void> = [];
  upload: { onprogress: ((e: ProgressEvent2) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  responseText = '';
  responseType = '';
  timeout = 0;
  method = '';
  url = '';
  body: unknown;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  send(body: unknown) {
    this.body = body;
    FakeXHR.sent.push(this);
    const step = FakeXHR.script.shift();
    queueMicrotask(() => step?.(this));
  }
}
const answer = (status: number, text: string) => (x: FakeXHR) => {
  x.status = status;
  x.responseText = text;
  x.onload?.();
};
const networkError = (x: FakeXHR) => x.onerror?.();
const timeout = (x: FakeXHR) => x.ontimeout?.();

describe('uploadToImgbb', () => {
  const realXhr = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
  before(() => {
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeXHR;
  });
  after(() => {
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = realXhr;
  });
  beforeEach(() => {
    FakeXHR.sent = [];
    FakeXHR.script = [];
    forgetUploadKey();
  });

  const file = () => new File([new Uint8Array(2048)], 'My Photo (1).PNG', { type: 'image/png' });
  const waits: number[] = [];
  const wait = async (ms: number) => {
    waits.push(ms);
  };
  beforeEach(() => {
    waits.length = 0;
  });

  test('posts the file and a safe name to ImgBB, reports progress, and returns the hosted image', async () => {
    FakeXHR.script = [
      (x) => {
        x.upload.onprogress?.({ lengthComputable: true, loaded: 1024, total: 2048 });
        x.upload.onprogress?.({ lengthComputable: false, loaded: 0, total: 0 });
        x.upload.onprogress?.({ lengthComputable: true, loaded: 2048, total: 2048 });
        answer(200, DOCS_ANSWER)(x);
      }
    ];
    const seen: number[] = [];
    const image = await uploadToImgbb(file(), 'k e/y', (f) => seen.push(f), wait);
    assert.equal(image.url, 'https://i.ibb.co/w04Prt6/c1f64245afb2.gif');
    assert.deepEqual(seen, [0, 0.5, 1], 'starts at 0, follows the browser’s byte counts, ignores events without a total');

    const [req] = FakeXHR.sent;
    assert.equal(FakeXHR.sent.length, 1);
    assert.equal(req?.method, 'POST');
    assert.equal(req?.url, 'https://api.imgbb.com/1/upload?key=k%20e%2Fy', 'the key is URL-encoded');
    assert.equal(req?.responseType, 'text');
    assert.ok((req?.timeout ?? 0) >= 120_000, 'a slow mobile upload is given time');
    const form = req?.body as FormData;
    assert.ok(form.get('image') instanceof File);
    assert.equal(form.get('name'), 'my-photo-1');
    assert.equal(form.has('key'), false, 'the key travels in the address only');
  });

  test('a dropped connection or a timeout is retried, with a growing pause', async () => {
    FakeXHR.script = [networkError, timeout, answer(200, DOCS_ANSWER)];
    const seen: number[] = [];
    const image = await uploadToImgbb(file(), 'key', (f) => seen.push(f), wait);
    assert.equal(image.id, '2ndCYJK');
    assert.equal(FakeXHR.sent.length, 3);
    assert.deepEqual(waits, [1500, 3000]);
    assert.deepEqual(seen, [0, 0, 0], 'the progress bar starts over on each attempt');
  });

  test('gives up after three attempts', async () => {
    FakeXHR.script = [answer(502, 'Bad gateway'), answer(500, ''), answer(503, '')];
    await assert.rejects(uploadToImgbb(file(), 'key', undefined, wait), (e) => e instanceof ImgbbError && e.reason === 'failed');
    assert.equal(FakeXHR.sent.length, 3);
  });

  test('a refused key or a rejected file is final — retrying cannot help', async () => {
    FakeXHR.script = [answer(400, INVALID_KEY), answer(200, DOCS_ANSWER)];
    await assert.rejects(uploadToImgbb(file(), 'key', undefined, wait), (e) => e instanceof ImgbbError && e.reason === 'config');
    assert.equal(FakeXHR.sent.length, 1);
    assert.deepEqual(waits, []);
  });

  test('hostImage forgets a key ImgBB refused, so a fixed server setting works without reloading the page', async () => {
    const realFetch = globalThis.fetch;
    const keys = ['bad-key-bad-key', 'good-key-good-key'];
    globalThis.fetch = (async () => new Response(JSON.stringify({ key: keys.shift() }), { status: 200 })) as typeof fetch;
    try {
      FakeXHR.script = [answer(400, INVALID_KEY), answer(200, DOCS_ANSWER)];
      const token = async () => 'id-token';
      await assert.rejects(hostImage(file(), token), (e) => e instanceof ImgbbError && e.reason === 'config');
      const image = await hostImage(file(), token);
      assert.equal(image.id, '2ndCYJK');
      assert.match(FakeXHR.sent[0]?.url ?? '', /key=bad-key-bad-key$/);
      assert.match(FakeXHR.sent[1]?.url ?? '', /key=good-key-good-key$/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
