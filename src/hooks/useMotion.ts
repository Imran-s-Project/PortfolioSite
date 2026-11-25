'use client';
import { useSyncExternalStore } from 'react';
import { motionEnabled, subscribeMotion } from '@/lib/motion-pref';

/** Is ambient motion on (not paused by the visitor, not reduced by the OS)? Server and first client render assume "on". */
export function useMotionEnabled(): boolean {
  return useSyncExternalStore((cb) => subscribeMotion(cb), motionEnabled, () => true);
}
