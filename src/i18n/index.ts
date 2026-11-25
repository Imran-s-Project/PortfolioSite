import type { Locale } from '@/types';
import { en, type Messages } from './messages/en';
import { bn } from './messages/bn';

export type { Messages };
const dictionaries: Record<Locale, Messages> = { bn, en };
export const getMessages = (locale: Locale): Messages => dictionaries[locale];

/** fmt('{n} min read', { n: 3 }) → '3 min read'. Unknown placeholders are left as they are. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
