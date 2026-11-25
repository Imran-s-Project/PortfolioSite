'use client';
import { useEffect } from 'react';

/** Counts one anonymous view per browser session. The Security Rules only allow "views + 1" on a published post — nothing else. */
export function ViewCounter({ postId }: { postId: string }) {
  useEffect(() => {
    const key = `viewed:${postId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      return;
    }
    void (async () => {
      const [{ doc, increment, updateDoc }, { getDb }] = await Promise.all([import('firebase/firestore'), import('@/lib/firebase/client')]);
      await updateDoc(doc(getDb(), 'blogPosts', postId), { views: increment(1) });
    })().catch(() => undefined);
  }, [postId]);
  return null;
}
