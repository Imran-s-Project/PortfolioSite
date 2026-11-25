import { SITE_TIME_ZONE } from '@/config/site';
import type { Locale } from '@/types';

const TAG: Record<Locale, string> = { bn: 'bn-BD', en: 'en-GB' };

/**
 * A date in the reader's language and the SITE's time zone (never the machine's): the server render and the browser render must
 * give the same text, or React reports a hydration mismatch — and a post published late in the evening would show a different
 * day to different readers. Pass `timeZone` in `opts` to override.
 */
export function formatDate(iso: string | null | undefined, locale: Locale, opts: Intl.DateTimeFormatOptions = { dateStyle: 'long' }): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat(TAG[locale], { timeZone: SITE_TIME_ZONE, ...opts }).format(d);
}
/** The calendar year in the site's time zone (for "© 2026"). */
export const currentYear = (now: Date = new Date()): number => Number(new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: SITE_TIME_ZONE }).format(now));
export const isFuture = (iso: string | null | undefined, now = Date.now()): boolean => !!iso && new Date(iso).getTime() > now;
