import { analyticsEnabled } from '@/config/firebase';
import { getFirebaseApp } from './client';

/** Firebase Analytics (GA4) — only when NEXT_PUBLIC_ENABLE_ANALYTICS=true. Off by default; the privacy page mentions it when on. */
export async function startAnalytics(): Promise<void> {
  if (!analyticsEnabled || typeof window === 'undefined') return;
  const { getAnalytics, isSupported } = await import('firebase/analytics');
  if (await isSupported()) getAnalytics(getFirebaseApp());
}
