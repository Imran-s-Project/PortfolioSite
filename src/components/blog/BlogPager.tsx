import { Icon } from '@/components/shared/Icon';
import { fmt, type Messages } from '@/i18n';
import { pageWindow, type PageSlice } from '@/lib/utils/paginate';

/**
 * Previous / numbered pages / next, and a line saying which articles are on screen. Renders nothing when everything fits on one page.
 * Plain buttons (no links): the explorer filters and pages in the browser, so the address does not change.
 */
export function BlogPager({ view, messages: m, onPage }: { view: Pick<PageSlice<unknown>, 'page' | 'pageCount' | 'total' | 'from' | 'to'>; messages: Messages; onPage: (page: number) => void }) {
  if (view.pageCount <= 1) return null;
  return (
    <div className="blogpager">
      <nav aria-label={m.blog.pagination}>
        <ul role="list">
          <li>
            <button type="button" className="chip blogpager__step" disabled={view.page <= 1} onClick={() => onPage(view.page - 1)}>
              <Icon name="arrow-left" />
              <span className="blogpager__label">{m.blog.prev}</span>
            </button>
          </li>
          {pageWindow(view.page, view.pageCount).map((n, i) =>
            n === null ? (
              <li key={`gap-${i}`} className="blogpager__gap" aria-hidden="true">…</li>
            ) : (
              <li key={n}>
                <button type="button" className="chip blogpager__num" aria-current={n === view.page ? 'page' : undefined} aria-label={fmt(m.blog.page, { n })} onClick={() => onPage(n)}>
                  {n}
                </button>
              </li>
            )
          )}
          <li>
            <button type="button" className="chip blogpager__step" disabled={view.page >= view.pageCount} onClick={() => onPage(view.page + 1)}>
              <span className="blogpager__label">{m.blog.next}</span>
              <Icon name="arrow-left" className="blogpager__flip" />
            </button>
          </li>
        </ul>
      </nav>
      <p className="blogpager__status" role="status">{fmt(m.blog.showing, { from: view.from, to: view.to, total: view.total })}</p>
    </div>
  );
}
