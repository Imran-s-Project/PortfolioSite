export const normalize = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

export interface SearchFields { title: string; subtitle?: string; keywords?: string[] }

/** 0 = no match. Every query word must appear somewhere; title hits weigh most. Works for Bangla and Latin text. */
export function score(query: string, f: SearchFields): number {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return 0;
  const title = normalize(f.title);
  const sub = normalize(f.subtitle ?? '');
  const kw = normalize((f.keywords ?? []).join(' '));
  let total = 0;
  for (const w of words) {
    let s = 0;
    if (title.startsWith(w)) s += 6;
    else if (title.includes(w)) s += 4;
    if (kw.includes(w)) s += 2;
    if (sub.includes(w)) s += 1;
    if (!s) return 0;
    total += s;
  }
  return total;
}

export function rank<T>(query: string, items: readonly T[], fields: (item: T) => SearchFields, limit = 20): T[] {
  return items
    .map((item, index) => ({ item, index, s: score(query, fields(item)) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.index - b.index)
    .slice(0, limit)
    .map((r) => r.item);
}
