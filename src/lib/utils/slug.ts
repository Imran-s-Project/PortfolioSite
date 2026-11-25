export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** ASCII url slug. Non-latin input (e.g. Bangla) yields '' so callers pass a fallback. */
export function slugify(input: string, fallback = ''): string {
  const s = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return s || fallback;
}

export const isValidSlug = (s: string): boolean => s.length > 0 && s.length <= 80 && SLUG_RE.test(s);

/** Appends -2, -3 … until the slug is not in `taken`. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
