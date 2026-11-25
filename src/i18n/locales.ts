import { DEFAULT_LOCALE, LOCALES } from '@/config/site';
import type { Locale } from '@/types';

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALES as readonly string[]).includes(v);

/** '/projects' + 'en' → '/en/projects' ; '/' → '/en' */
export function localizePath(locale: Locale, path = '/'): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return p === '/' ? `/${locale}` : `/${locale}${p}`;
}

/** '/en/projects/x' → { locale: 'en', rest: '/projects/x' } ; no locale prefix → locale null */
export function splitLocale(pathname: string): { locale: Locale | null; rest: string } {
  const seg = pathname.split('/')[1] ?? '';
  if (isLocale(seg)) return { locale: seg, rest: pathname.slice(seg.length + 1) || '/' };
  return { locale: null, rest: pathname || '/' };
}
export const swapLocale = (pathname: string, to: Locale): string => localizePath(to, splitLocale(pathname).rest);

/** Picks bn/en from an Accept-Language header. Bangla if offered, English if it leads, otherwise the default. */
export function detectLocale(acceptLanguage: string | null | undefined): Locale {
  const tags = (acceptLanguage ?? '').split(',').map((s) => s.trim().split(';')[0]?.toLowerCase() ?? '').filter(Boolean);
  if (tags.some((t) => t === 'bn' || t.startsWith('bn-'))) return 'bn';
  if (tags[0]?.startsWith('en')) return 'en';
  return DEFAULT_LOCALE;
}
export const pick = (v: { bn: string; en: string }, locale: Locale): string => v[locale] || v[locale === 'bn' ? 'en' : 'bn'];
