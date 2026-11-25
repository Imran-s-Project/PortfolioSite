/**
 * Should the living background (and other ambient motion) move?
 * Default: yes, unless the OS asks for reduced motion. A header button lets a visitor override it either way and the
 * choice is remembered (WCAG 2.2.2: anything that moves by itself for more than 5 seconds needs a pause control).
 * The same module feeds the nature engine (plain subscribe) and React (useSyncExternalStore in hooks/useMotion.ts).
 */
import { STORAGE_KEYS } from '@/config/site';

type Listener = (enabled: boolean) => void;
const listeners = new Set<Listener>();
let stored: 'on' | 'off' | null = null;
let ready = false;
let reducedMq: MediaQueryList | null = null;

function init(): void {
  if (ready || typeof window === 'undefined') return;
  ready = true;
  try {
    const v = localStorage.getItem(STORAGE_KEYS.motion);
    stored = v === 'on' || v === 'off' ? v : null;
  } catch {
    /* storage unavailable — the default still works */
  }
  reducedMq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  // The OS setting can change while the page is open.
  reducedMq?.addEventListener('change', () => {
    if (!stored) emit();
  });
}
function emit(): void {
  const on = motionEnabled();
  for (const fn of listeners) fn(on);
}

export function prefersReducedMotion(): boolean {
  init();
  return !!reducedMq?.matches;
}
/** True when ambient motion should play. */
export function motionEnabled(): boolean {
  init();
  return stored ? stored === 'on' : !prefersReducedMotion();
}
export function setMotion(on: boolean): void {
  init();
  stored = on ? 'on' : 'off';
  try {
    localStorage.setItem(STORAGE_KEYS.motion, stored);
  } catch {
    /* non-fatal */
  }
  emit();
}
export const toggleMotion = (): void => setMotion(!motionEnabled());
export function subscribeMotion(fn: Listener): () => void {
  init();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
