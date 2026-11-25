/**
 * How rich may the nature background be on THIS device? Pure decisions, no DOM side effects.
 * QA overrides (URL query):  ?nature=off (posters only) · ?nature=low (act like a constrained phone) ·
 *                            ?nature=high (act like a desktop, and never step the quality down) · ?nature-debug (log engine decisions)
 */
import { STORAGE_KEYS } from '@/config/site';
import { motionEnabled } from '@/lib/motion-pref';

/** Delivery tiers, smallest → largest. `portrait` is a 9:16 crop made for phones. */
export const TIERS = ['portrait', 'hd', 'fhd', 'qhd'] as const;
export type MistMode = 'webgl' | 'css' | 'none';

interface NetworkInformationLike {
  effectiveType?: string;
  saveData?: boolean;
}
type NavigatorExtras = Navigator & { connection?: NetworkInformationLike; mozConnection?: NetworkInformationLike; webkitConnection?: NetworkInformationLike; deviceMemory?: number };

const mm = (q: string): boolean => typeof matchMedia === 'function' && matchMedia(q).matches;

/** How long the frame-rate guard's verdict is remembered for this tab. One slow stretch (a dev-server compile, a busy phone)
 *  must not keep the footage switched off until the tab is closed. */
const CAP_TTL_MS = 3 * 60 * 1000;

export interface NatureProfile {
  force: string | null;
  debug: boolean;
  coarse: boolean;
  lowEnd: boolean;
  constrained: boolean;
  saveData: boolean;
  maxPlaying: number;
  maxAlive: number;
  capAt(index: number): number;
  tierCap(): number;
  videoAllowed(): boolean;
  motion(): boolean;
  parallax(): boolean;
  mistMode(): MistMode;
  log(...args: unknown[]): void;
}

export function createProfile(): NatureProfile {
  const params = new URLSearchParams(location.search);
  const force = params.get('nature'); // off | low | high | null
  const debug = params.has('nature-debug');
  const nav = navigator as NavigatorExtras;
  const conn = nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null;
  const effective = conn?.effectiveType ?? '';
  const memory = nav.deviceMemory ?? 4; // Safari/Firefox do not report it → assume a normal device
  const cores = navigator.hardwareConcurrency ?? 4;
  const coarse = force === 'high' ? false : force === 'low' || mm('(pointer: coarse)') || mm('(hover: none)');
  const slowNet = /(^|-)2g$/.test(effective) || effective === '3g';
  const veryslow = /(^|-)2g$/.test(effective);
  const lowEnd = force !== 'high' && (force === 'low' || memory <= 2 || cores <= 2);
  const saveData = !!conn?.saveData || mm('(prefers-reduced-data: reduce)');
  const constrained = force !== 'high' && (coarse || lowEnd || slowNet);

  // Highest tier index the frame-rate guard still allows: 3 = no restriction … 0 = portrait only, -1 = posters only.
  let cap = 3;
  try {
    // stored as "<cap>@<time>"; an old-format, expired or malformed value is ignored. `?nature=high` ignores it completely.
    const [value = '', at = ''] = (sessionStorage.getItem(STORAGE_KEYS.natureCap) ?? '').split('@');
    const fresh = at !== '' && Number.isFinite(Number(at)) && Date.now() - Number(at) < CAP_TTL_MS;
    if (force !== 'high' && fresh && value !== '' && Number.isFinite(Number(value))) cap = Math.max(-1, Math.min(3, Math.floor(Number(value))));
  } catch {
    /* storage unavailable — the guard simply starts fresh on every page load */
  }

  const profile: NatureProfile = {
    force,
    debug,
    coarse,
    lowEnd,
    constrained,
    saveData,
    maxPlaying: 2, // videos that may decode at the same time
    maxAlive: constrained ? 2 : 3, // videos that may exist at all
    capAt(index) {
      if (force === 'high') return cap; // QA override: the guard never steps the footage down
      cap = Math.max(-1, Math.min(3, Math.floor(index)));
      try {
        sessionStorage.setItem(STORAGE_KEYS.natureCap, `${cap}@${Date.now()}`);
      } catch {
        /* ignore */
      }
      return cap;
    },
    tierCap: () => Math.min(constrained ? 1 : 3, cap),
    videoAllowed: () => force !== 'off' && motionEnabled() && !saveData && !veryslow && profile.tierCap() >= 0,
    motion: () => force !== 'off' && motionEnabled(),
    parallax: () => profile.motion() && !coarse,
    mistMode() {
      if (force === 'off' || saveData || lowEnd) return 'none';
      return constrained ? 'css' : 'webgl';
    },
    log(...args) {
      if (debug) console.info('[nature]', ...args);
    }
  };
  return profile;
}
