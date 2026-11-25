import type { Locale, ThemeId } from '@/types';

export const LOCALES: readonly Locale[] = ['bn', 'en'];
export const DEFAULT_LOCALE: Locale = 'bn';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

type Env = Readonly<Record<string, string | undefined>>;
const withProtocol = (v: string): string => (/^https?:\/\//i.test(v) ? v : `https://${v}`);

/**
 * The site's public address, worked out from the environment — no domain is written into the code.
 *  1. `NEXT_PUBLIC_SITE_URL` — optional manual override (a custom domain, or a host that Vercel's variables do not describe).
 *  2. `VERCEL_PROJECT_PRODUCTION_URL` — the project's production domain, which Vercel sets on every build and request (the custom
 *     domain if there is one, otherwise the `*.vercel.app` one). Preview deployments use it too, so canonical URLs and the
 *     `Referer` sent with the Firestore reads stay on the domain the API key is restricted to.
 *  3. `VERCEL_URL` — this deployment's own address, only if 2 is missing.
 *  4. `http://localhost:<PORT>` — local development.
 * This is a server-side value: Vercel's variables are not shipped to the browser, so browser code should use `window.location.origin`.
 */
export function resolveSiteUrl(env: Env): string {
  const get = (key: string): string => env[key]?.trim() ?? '';
  const vercel = get('VERCEL_PROJECT_PRODUCTION_URL') || get('VERCEL_URL');
  const url = get('NEXT_PUBLIC_SITE_URL') || (vercel ? withProtocol(vercel) : `http://localhost:${get('PORT') || '3000'}`);
  return withProtocol(url).replace(/\/+$/, '');
}
export const SITE_URL = resolveSiteUrl(process.env);

export const OG_LOCALE: Record<Locale, string> = { bn: 'bn_BD', en: 'en_US' };
/** Dates are shown in the owner's time zone, on the server and in every browser alike — a date formatted in whatever zone the machine happens to use would differ between server and visitor (a hydration mismatch) and move across midnight. */
export const SITE_TIME_ZONE = 'Asia/Dhaka';
export const OWNER = { name: { bn: 'ইমরান আহমেদ', en: 'Imran Ahmed' }, jobTitle: 'Web Developer' } as const;

/** Storage keys deliberately match the legacy site so returning visitors keep their choices. */
export const STORAGE_KEYS = {
  theme: 'imran-portfolio-theme',
  motion: 'imran-portfolio-motion',
  natureCap: 'imran-portfolio-nature-cap',
  intro: 'imran-portfolio-intro-seen',
  adminLang: 'imran-portfolio-admin-lang'
} as const;

export interface ThemeMeta {
  id: ThemeId;
  scheme: 'dark' | 'light';
  themeColor: string;
  /** Three swatches shown in the theme selector: background, surface, accent. */
  swatch: [string, string, string];
}
export const THEMES: readonly ThemeMeta[] = [
  { id: 'obsidian', scheme: 'dark', themeColor: '#07090b', swatch: ['#07090b', '#0f1519', '#22d3ee'] },
  { id: 'aurora', scheme: 'dark', themeColor: '#090a1c', swatch: ['#090a1c', '#121438', '#a78bfa'] },
  { id: 'arctic', scheme: 'light', themeColor: '#f3f6fa', swatch: ['#f3f6fa', '#ffffff', '#2563eb'] },
  { id: 'terminal', scheme: 'dark', themeColor: '#0b0e0c', swatch: ['#0b0e0c', '#131813', '#a3e635'] },
  { id: 'ember', scheme: 'dark', themeColor: '#120c08', swatch: ['#120c08', '#20150e', '#f59e0b'] }
];
export const DEFAULT_THEME: ThemeId = 'obsidian';
export const isThemeId = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);
