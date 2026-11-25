import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { BlogExplorer } from '@/components/blog/BlogExplorer';
import { LocaleProvider } from '@/components/layout/LocaleProvider';
import { getMessages } from '@/i18n';
import { BLOG_PAGE_SIZE, pageWindow, paginate } from '@/lib/utils/paginate';
import type { Locale, PostSummary, Taxonomy } from '@/types';

const numbers = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

describe('paginate', () => {
  test('cuts a list into pages and says which items are on the page', () => {
    const first = paginate(numbers(25), 1, 10);
    assert.deepEqual(first.items, numbers(10));
    assert.deepEqual({ page: first.page, pageCount: first.pageCount, total: first.total, from: first.from, to: first.to }, { page: 1, pageCount: 3, total: 25, from: 1, to: 10 });
    const last = paginate(numbers(25), 3, 10);
    assert.deepEqual(last.items, [21, 22, 23, 24, 25]);
    assert.deepEqual({ from: last.from, to: last.to }, { from: 21, to: 25 });
  });

  test('a list that fits on one page is one page; an empty list is "page 1 of 1" with nothing on it', () => {
    assert.equal(paginate(numbers(BLOG_PAGE_SIZE), 1).pageCount, 1);
    assert.equal(paginate(numbers(BLOG_PAGE_SIZE + 1), 1).pageCount, 2);
    const none = paginate([], 1);
    assert.deepEqual({ items: none.items, page: none.page, pageCount: none.pageCount, from: none.from, to: none.to }, { items: [], page: 1, pageCount: 1, from: 0, to: 0 });
  });

  test('a page outside the valid range is moved inside it — never an empty page', () => {
    for (const wanted of [0, -4, 99, Number.NaN, Infinity, -Infinity]) {
      const p = paginate(numbers(25), wanted, 10);
      assert.ok(p.page >= 1 && p.page <= 3, `${wanted} → ${p.page}`);
      assert.ok(p.items.length > 0, `${wanted} gave an empty page`);
    }
    assert.equal(paginate(numbers(25), 99, 10).page, 3, 'too far → the last page');
    assert.equal(paginate(numbers(25), -3, 10).page, 1, 'before the start → the first page');
    assert.equal(paginate(numbers(25), 2.9, 10).page, 2, 'a fraction is cut off');
  });

  test('a nonsense page size falls back to the default, and the input list is never changed', () => {
    for (const size of [0, -1, Number.NaN]) assert.equal(paginate(numbers(20), 1, size).items.length, BLOG_PAGE_SIZE);
    const input = numbers(12);
    const copy = [...input];
    paginate(input, 2, 5);
    assert.deepEqual(input, copy);
  });

  test('every item appears on exactly one page', () => {
    for (const total of [0, 1, 8, 9, 10, 17, 18, 19, 100]) {
      const all = numbers(total);
      const seen: number[] = [];
      const { pageCount } = paginate(all, 1);
      for (let page = 1; page <= pageCount; page++) seen.push(...paginate(all, page).items);
      assert.deepEqual(seen, all, `${total} items`);
    }
  });
});

describe('pageWindow', () => {
  test('shows the first and last page, the current one and its neighbours, with … between', () => {
    assert.deepEqual(pageWindow(1, 1), [1]);
    assert.deepEqual(pageWindow(1, 0), []);
    assert.deepEqual(pageWindow(1, 5), [1, 2, null, 5]);
    assert.deepEqual(pageWindow(3, 5), [1, 2, 3, 4, 5]);
    assert.deepEqual(pageWindow(5, 9), [1, null, 4, 5, 6, null, 9]);
    assert.deepEqual(pageWindow(9, 9), [1, null, 8, 9]);
  });

  test('"…" is never used for a single skipped page — the number is shown instead', () => {
    assert.deepEqual(pageWindow(4, 7), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(pageWindow(3, 6), [1, 2, 3, 4, 5, 6], 'page 5 alone would be hidden by a "…", so it is shown');
    assert.deepEqual(pageWindow(3, 7), [1, 2, 3, 4, null, 7], 'two pages (5 and 6) are hidden — now "…" is honest');
  });

  test('for every list length and position: first, last and current are offered, in order, and "…" hides at least two pages', () => {
    for (let count = 1; count <= 40; count++) {
      for (let current = 1; current <= count; current++) {
        const win = pageWindow(current, count);
        const shown = win.filter((n): n is number => n !== null);
        assert.ok(shown.includes(1) && shown.includes(count) && shown.includes(current), `${current}/${count}`);
        assert.deepEqual(shown, [...shown].sort((a, b) => a - b), 'ascending');
        assert.equal(new Set(shown).size, shown.length, 'no repeats');
        assert.ok(!win.some((n, i) => n === null && win[i + 1] === null), 'no two "…" in a row');
        win.forEach((n, i) => {
          if (n === null) assert.ok((win[i + 1] as number) - (win[i - 1] as number) >= 3, `a "…" must stand for 2+ pages (${current}/${count})`);
        });
        assert.ok(win.length <= 7, `at most seven slots (${current}/${count}: ${win.length})`);
      }
    }
  });

  test('an out-of-range current page is treated as the nearest valid one', () => {
    assert.deepEqual(pageWindow(0, 5), pageWindow(1, 5));
    assert.deepEqual(pageWindow(50, 5), pageWindow(5, 5));
  });
});

const post = (i: number, over: Partial<PostSummary> = {}): PostSummary => ({
  id: `p${i}`, slug: `post-${i}`, status: 'published', schemaVersion: 1, title: { bn: `লেখা ${i}`, en: `Post ${i}` }, excerpt: { bn: `সারাংশ ${i}`, en: `Excerpt ${i}` },
  categoryId: null, tagIds: [], featured: false, publishedAt: new Date(Date.UTC(2026, 0, 1) + (100 - i) * 86_400_000).toISOString(), createdAt: '', updatedAt: '', authorId: 'a',
  seo: { metaTitle: { bn: '', en: '' }, metaDescription: { bn: '', en: '' }, noindex: false }, readingMinutes: { bn: 2, en: 2 }, views: 0, ...over
});
const posts = (n: number): PostSummary[] => numbers(n).map((i) => post(i));
const render = (list: PostSummary[], locale: Locale = 'en', tags: Taxonomy[] = []) =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} messages={getMessages(locale)}>
      <BlogExplorer posts={list} categories={[]} tags={tags} />
    </LocaleProvider>
  );
const cards = (html: string) => (html.match(/class="postcard"/g) ?? []).length;

describe('the blog list, a page at a time', () => {
  test('25 articles: the first page shows nine, with a pager for three pages', () => {
    const html = render(posts(25));
    const m = getMessages('en').blog;
    assert.equal(cards(html), BLOG_PAGE_SIZE);
    assert.ok(html.includes('>Post 1<') && html.includes('>Post 9<') && !html.includes('>Post 10<'), 'the newest nine, in the order given');
    assert.ok(html.includes(`aria-label="${m.pagination}"`));
    for (const n of [1, 2, 3]) assert.ok(html.includes(`aria-label="Page ${n}"`), `page ${n}`);
    assert.ok(!html.includes('aria-label="Page 4"'));
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1, 'exactly one current page');
    assert.ok(/aria-current="page" aria-label="Page 1"/.test(html), 'and it is page 1');
    assert.ok(html.includes('Showing 1–9 of 25 articles'));
  });

  test('on the first page "Previous" is disabled and "Next" is not', () => {
    const html = render(posts(25));
    const buttons = [...html.matchAll(/<button\b[^>]*class="chip blogpager__step"[^>]*>/g)].map((x) => x[0]);
    assert.equal(buttons.length, 2);
    assert.ok(buttons[0].includes('disabled=""'), 'previous');
    assert.ok(!buttons[1].includes('disabled'), 'next');
  });

  test('nine articles or fewer: no pager and no "Showing …" line — the page looks as it always did', () => {
    for (const n of [1, BLOG_PAGE_SIZE]) {
      const html = render(posts(n));
      assert.equal(cards(html), n);
      assert.ok(!html.includes('blogpager') && !html.includes('Showing'), `${n} articles`);
    }
  });

  test('no articles at all: the "nothing matches" message, no pager', () => {
    const html = render([]);
    assert.equal(cards(html), 0);
    assert.ok(html.includes(getMessages('en').blog.noResults) && !html.includes('blogpager'));
  });

  test('Bangla: the pager and the line under it are in Bangla', () => {
    const html = render(posts(25), 'bn');
    const m = getMessages('bn').blog;
    assert.ok(html.includes(m.prev) && html.includes(m.next) && html.includes(`aria-label="${m.pagination}"`));
    assert.ok(html.includes('25টি লেখার মধ্যে 1–9 দেখানো হচ্ছে'));
    assert.ok(html.includes('aria-label="পাতা 2"'));
  });

  test('the server and the first browser render are the same: always page 1, nothing read from the browser', () => {
    assert.equal(render(posts(25)), render(posts(25)));
  });
});
