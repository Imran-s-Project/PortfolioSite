import { Timestamp, addDoc, collection, serverTimestamp, type DocumentData } from 'firebase/firestore';
import { getDb } from '@/lib/firebase/client';

/** Firestore Timestamps → ISO strings, recursively, so the rest of the app only ever sees plain JSON. */
export function toPlain(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(toPlain);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, toPlain(x)]));
  return v;
}
export const plainDoc = (id: string, data: DocumentData | undefined): Record<string, unknown> & { id: string } => ({ ...(toPlain(data ?? {}) as Record<string, unknown>), id });

/** Firestore rejects `undefined`; drop it (and keep everything else untouched). */
export function stripUndefined<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripUndefined) as T;
  if (v instanceof Timestamp || v === null || typeof v !== 'object') return v;
  const proto = Object.getPrototypeOf(v) as unknown;
  if (proto !== Object.prototype && proto !== null) return v; // FieldValue sentinels etc.
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).map(([k, x]) => [k, stripUndefined(x)])) as T;
}

/** Append-only audit trail (/activityLogs). Never blocks the user's action if it fails. */
export async function logActivity(actor: { uid: string; name: string }, action: string, entity: string, entityId: string, summary: string): Promise<void> {
  try {
    await addDoc(collection(getDb(), 'activityLogs'), { actorId: actor.uid, actorName: actor.name, action, entity, entityId, summary: summary.slice(0, 200), createdAt: serverTimestamp() });
  } catch (err) {
    console.warn('[activity] could not log', err);
  }
}

/** Ask the server to drop its page cache so visitors see the change now instead of within a minute. Best effort. */
export async function revalidateSite(idToken: string | null): Promise<void> {
  if (!idToken) return;
  try {
    await fetch('/api/revalidate', { method: 'POST', headers: { Authorization: `Bearer ${idToken}` } });
  } catch {
    /* the 60-second cache window will catch up */
  }
}
