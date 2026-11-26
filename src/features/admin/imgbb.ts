/**
 * ImgBB image hosting (free plan) — the one place the Admin Panel talks to it.
 *
 * The file goes straight from the browser to ImgBB. Sending it through this site's own server would be simpler, but Vercel Functions
 * refuse request bodies over 4.5 MB and the Admin Panel accepts images up to 5 MB.
 * The API key is a secret, so it is NOT part of the JavaScript every visitor downloads: `/api/imgbb-key` hands it to a verified
 * administrator only, and it is then kept in memory for the rest of the session.
 */
import { imageName } from './media-utils';

export const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';
const KEY_ENDPOINT = '/api/imgbb-key';
const UPLOAD_TIMEOUT_MS = 180_000; // a 5 MB photo on a slow mobile connection still fits
const MAX_ATTEMPTS = 3;

/** 'config': the key is missing on the server or ImgBB refused it — only the site owner can fix that. `retryable`: worth another try. */
export class ImgbbError extends Error {
  constructor(public reason: 'failed' | 'config', public retryable = false) {
    super(reason);
  }
}

export interface ImgbbImage {
  id: string;
  /** Direct https address of the image. */
  url: string;
  /** ImgBB's own "delete this image" link. The free API has no delete call, so this is the only handle on the file. */
  deleteUrl?: string;
  width?: number;
  height?: number;
}

interface ImgbbBody {
  success?: unknown;
  data?: { id?: unknown; url?: unknown; delete_url?: unknown; width?: unknown; height?: unknown; image?: { url?: unknown } };
  error?: { message?: unknown };
}

/** ImgBB sends sizes as strings ("800"); the site stores whole positive numbers only. */
const dimension = (v: unknown): number | undefined => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n <= 20000 ? n : undefined;
};

/** Turns ImgBB's answer into an image, or throws the right ImgbbError. Pure, so it is unit-tested without a network. */
export function parseImgbbResponse(status: number, text: string): ImgbbImage {
  let body: ImgbbBody | null = null;
  try {
    body = JSON.parse(text) as ImgbbBody | null;
  } catch {
    /* not JSON — handled as a failure below */
  }
  const d = body?.data;
  if (status >= 200 && status < 300 && body?.success === true && d) {
    const id = typeof d.id === 'string' || typeof d.id === 'number' ? String(d.id) : '';
    const direct = typeof d.url === 'string' ? d.url : typeof d.image?.url === 'string' ? d.image.url : '';
    const url = direct.replace(/^http:\/\//i, 'https://'); // the site only accepts https image addresses
    if (/^[\w-]{1,64}$/.test(id) && /^https:\/\//i.test(url) && url.length <= 2048) {
      const deleteUrl = typeof d.delete_url === 'string' && /^https:\/\//i.test(d.delete_url) && d.delete_url.length <= 500 ? d.delete_url : undefined;
      const width = dimension(d.width);
      const height = dimension(d.height);
      return { id, url, ...(deleteUrl ? { deleteUrl } : {}), ...(width && height ? { width, height } : {}) };
    }
  }
  const message = typeof body?.error?.message === 'string' ? body.error.message : '';
  if (/api.{0,12}key/i.test(message)) throw new ImgbbError('config'); // "Invalid API v1 key."
  throw new ImgbbError('failed', status >= 500);
}

/* ───────────── the API key: from our own server, administrators only ───────────── */

let cachedKey: string | null = null;
let pendingKey: Promise<string> | null = null;

async function requestKey(idToken: () => Promise<string | null>, fetchImpl: typeof fetch): Promise<string> {
  const token = await idToken().catch(() => null);
  if (!token) throw new ImgbbError('failed');
  const res = await fetchImpl(KEY_ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }).catch(() => null);
  if (!res) throw new ImgbbError('failed', true); // offline
  if (res.status === 503) throw new ImgbbError('config'); // IMGBB_API_KEY is not set on the server
  if (!res.ok) throw new ImgbbError('failed');
  const body = (await res.json().catch(() => null)) as { key?: unknown } | null;
  if (typeof body?.key !== 'string' || body.key.length < 8) throw new ImgbbError('config');
  return body.key;
}

/** The ImgBB API key: asked from the server once, then remembered. Several uploads at the same moment share one request. */
export function getUploadKey(idToken: () => Promise<string | null>, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (cachedKey) return Promise.resolve(cachedKey);
  pendingKey ??= requestKey(idToken, fetchImpl)
    .then((key) => (cachedKey = key))
    .finally(() => {
      pendingKey = null;
    });
  return pendingKey;
}
export const forgetUploadKey = (): void => {
  cachedKey = null;
};

/* ───────────── the upload itself ───────────── */

interface Reply {
  status: number;
  text: string;
}

/** XMLHttpRequest, because it is the only browser API that reports upload progress. No custom headers: the browser sets the multipart one. */
function post(url: string, form: FormData, onProgress?: (fraction: number) => void): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.responseType = 'text';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new ImgbbError('failed', true));
    xhr.ontimeout = () => reject(new ImgbbError('failed', true));
    xhr.onabort = () => reject(new ImgbbError('failed'));
    xhr.send(form);
  });
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Sends one image to ImgBB. Network trouble, timeouts and ImgBB-side (5xx) errors are retried twice; anything else is final. */
export async function uploadToImgbb(file: File, key: string, onProgress?: (fraction: number) => void, wait: (ms: number) => Promise<void> = sleep): Promise<ImgbbImage> {
  const url = `${IMGBB_UPLOAD_URL}?key=${encodeURIComponent(key)}`;
  for (let attempt = 1; ; attempt++) {
    onProgress?.(0);
    const form = new FormData();
    form.append('image', file);
    form.append('name', imageName(file));
    try {
      const { status, text } = await post(url, form, onProgress);
      return parseImgbbResponse(status, text);
    } catch (err) {
      const failure = err instanceof ImgbbError ? err : new ImgbbError('failed');
      if (!failure.retryable || attempt >= MAX_ATTEMPTS) throw failure;
      await wait(attempt * 1500);
    }
  }
}

/** Key + upload in one call. A key ImgBB refuses is forgotten, so fixing it on the server needs no page reload. */
export async function hostImage(file: File, idToken: () => Promise<string | null>, onProgress?: (fraction: number) => void): Promise<ImgbbImage> {
  const key = await getUploadKey(idToken);
  try {
    return await uploadToImgbb(file, key, onProgress);
  } catch (err) {
    if (err instanceof ImgbbError && err.reason === 'config') forgetUploadKey();
    throw err;
  }
}
