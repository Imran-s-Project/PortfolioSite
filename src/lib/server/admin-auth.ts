import { firebaseConfig } from '@/config/firebase';
import { SITE_URL } from '@/config/site';

export type AdminCheck = { ok: true; uid: string } | { ok: false; status: 401 | 403; error: string };

const TIMEOUT_MS = 8000;
/** A server request has no Referer of its own; sending the site URL lets an API key restricted to "HTTP referrers" accept it. */
const REFERER = { Referer: `${SITE_URL}/` };

/**
 * Is `token` — the Firebase ID token the admin app sends — the token of an administrator?
 *
 * No server secret is needed. Google's Identity Toolkit says whose token it is, and the administrator document is then read WITH THE
 * CALLER'S OWN TOKEN, so the Firestore Security Rules decide what that caller may see. The document must say `role: 'admin'` —
 * the same condition the rules use — not merely exist. Anyone else gets 401 (not signed in) or 403 (signed in, not an administrator).
 */
export async function verifyAdmin(token: string | null | undefined, fetchImpl: typeof fetch = fetch): Promise<AdminCheck> {
  if (!token) return { ok: false, status: 401, error: 'missing token' };

  const lookup = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`, {
    method: 'POST',
    headers: { ...REFERER, 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token }),
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS)
  }).catch(() => null);
  if (!lookup?.ok) return { ok: false, status: 401, error: 'invalid token' };
  const who = (await lookup.json().catch(() => null)) as { users?: { localId?: unknown }[] } | null;
  const uid = who?.users?.[0]?.localId;
  if (typeof uid !== 'string' || !/^[\w-]{6,128}$/.test(uid)) return { ok: false, status: 401, error: 'invalid token' };

  const profile = await fetchImpl(`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/adminProfiles/${encodeURIComponent(uid)}?key=${encodeURIComponent(firebaseConfig.apiKey)}`, {
    headers: { ...REFERER, Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS)
  }).catch(() => null);
  if (!profile?.ok) return { ok: false, status: 403, error: 'not an administrator' };
  const doc = (await profile.json().catch(() => null)) as { fields?: { role?: { stringValue?: unknown } } } | null;
  if (doc?.fields?.role?.stringValue !== 'admin') return { ok: false, status: 403, error: 'not an administrator' };

  return { ok: true, uid };
}
