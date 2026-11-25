/** How many articles one page of the blog shows: three full rows on a wide screen, and still a short scroll on a phone. */
export const BLOG_PAGE_SIZE = 9;

export interface PageSlice<T> {
  items: T[];
  /** The page actually shown (1-based) — the requested one, kept inside the valid range. */
  page: number;
  pageCount: number;
  total: number;
  /** 1-based position of the first and last item on this page; 0 and 0 when the list is empty. */
  from: number;
  to: number;
}

/**
 * One page of a list. A page number outside the valid range is moved to the nearest valid one — a filter can leave fewer pages
 * than the reader was on, and that must never show an empty page. An empty list is "page 1 of 1".
 */
export function paginate<T>(items: readonly T[], page: number, size: number = BLOG_PAGE_SIZE): PageSlice<T> {
  const perPage = Number.isFinite(size) && size >= 1 ? Math.floor(size) : BLOG_PAGE_SIZE;
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const wanted = Number.isFinite(page) ? Math.trunc(page) : 1;
  const current = Math.min(Math.max(wanted, 1), pageCount);
  const start = (current - 1) * perPage;
  const slice = items.slice(start, start + perPage);
  return { items: slice, page: current, pageCount, total, from: slice.length === 0 ? 0 : start + 1, to: start + slice.length };
}

/**
 * The page numbers to offer: the first, the last, the current page and its neighbours. `null` stands for "…" where pages are
 * skipped — but a gap of exactly one page shows that page instead, since "…" would hide no more than the number itself.
 */
export function pageWindow(current: number, pageCount: number, neighbours = 1): (number | null)[] {
  if (pageCount <= 1) return pageCount === 1 ? [1] : [];
  const here = Math.min(Math.max(Math.trunc(current) || 1, 1), pageCount);
  const keep = new Set<number>([1, pageCount]);
  for (let n = here - neighbours; n <= here + neighbours; n++) if (n >= 1 && n <= pageCount) keep.add(n);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    const before = sorted[i - 1];
    if (before !== undefined) {
      if (n - before === 2) out.push(before + 1);
      else if (n - before > 2) out.push(null);
    }
    out.push(n);
  });
  return out;
}
