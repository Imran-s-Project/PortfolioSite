'use client';
import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;
/** false while rendering on the server and during hydration, true afterwards — lets client-only UI avoid hydration mismatches. */
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
