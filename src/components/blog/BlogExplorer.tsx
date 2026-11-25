'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/shared/Icon';
import { useLocale, useMessages } from '@/components/layout/LocaleProvider';
import { localizePath, pick } from '@/i18n/locales';
import { paginate } from '@/lib/utils/paginate';
import { rank } from '@/lib/utils/search';
import type { PostSummary, Taxonomy } from '@/types';
import { BlogPager } from './BlogPager';
import { PostCard } from './PostCard';

/** Search + tag filter over the published articles, shown a page at a time; category chips link to their own (indexable) pages. */
export function BlogExplorer({ posts, categories, tags, activeCategory }: { posts: PostSummary[]; categories: Taxonomy[]; tags: Taxonomy[]; activeCategory?: string }) {
  const locale = useLocale();
  const m = useMessages();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('all');
  const [page, setPage] = useState(1);
  const searchId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  /** Set when the reader turns a page (never by a filter, never on first load): only then is the top of the list brought into view. */
  const turned = useRef(false);
  const catName = useMemo(() => new Map(categories.map((c) => [c.id, pick(c.name, locale)])), [categories, locale]);
  const usedTags = useMemo(() => tags.filter((t) => posts.some((p) => p.tagIds.includes(t.id))), [tags, posts]);

  const visible = useMemo(() => {
    const base = posts.filter((p) => tag === 'all' || p.tagIds.includes(tag));
    if (!query.trim()) return base;
    return rank(query, base, (p) => ({ title: `${p.title.bn} ${p.title.en}`, subtitle: `${p.excerpt.bn} ${p.excerpt.en}` }));
  }, [posts, tag, query]);
  // `paginate` keeps the page inside the valid range, so a list that shrinks can never leave the reader on an empty page
  const view = useMemo(() => paginate(visible, page), [visible, page]);

  const turnTo = (next: number) => {
    if (next === view.page) return;
    turned.current = true;
    setPage(next);
  };
  const search = (value: string) => {
    setQuery(value);
    setPage(1);
  };
  const filterTag = (id: string) => {
    setTag(id);
    setPage(1);
  };

  useEffect(() => {
    if (!turned.current) return;
    turned.current = false;
    const list = listRef.current;
    if (!list) return;
    list.scrollIntoView({ block: 'start' });
    list.focus({ preventScroll: true }); // the next Tab lands on the first article of the new page, not back on the page buttons
  }, [view.page]);

  return (
    <div>
      <div className="blog__bar">
        <div className="explorer__search field">
          <label htmlFor={searchId} className="sr-only">{m.blog.search}</label>
          <Icon name="search" />
          <input id={searchId} className="input" type="search" value={query} onChange={(e) => search(e.target.value)} placeholder={m.blog.searchPlaceholder} autoComplete="off" />
        </div>
        {categories.length > 0 && (
          <nav aria-label={m.blog.allCategories} className="chips">
            <Link className={`chip${!activeCategory ? ' is-active' : ''}`} href={localizePath(locale, '/blog')}>{m.blog.allCategories}</Link>
            {categories.map((c) => (
              <Link key={c.id} className={`chip${activeCategory === c.id ? ' is-active' : ''}`} href={localizePath(locale, `/blog/category/${c.slug}`)}>{pick(c.name, locale)}</Link>
            ))}
          </nav>
        )}
        {usedTags.length > 0 && (
          <div role="group" aria-label={m.blog.tags} className="chips">
            <button type="button" className="chip" aria-pressed={tag === 'all'} onClick={() => filterTag('all')}>{m.blog.allTags}</button>
            {usedTags.map((t) => (
              <button key={t.id} type="button" className="chip" aria-pressed={tag === t.id} onClick={() => filterTag(t.id)}>#{pick(t.name, locale)}</button>
            ))}
          </div>
        )}
      </div>
      <div ref={listRef} tabIndex={-1} className="blog__list">
        {view.total ? (
          <ul className="postgrid" role="list">
            {view.items.map((p) => <PostCard key={p.id} post={p} locale={locale} messages={m} categoryName={p.categoryId ? catName.get(p.categoryId) : undefined} />)}
          </ul>
        ) : (
          <div className="empty" role="status"><h3>{m.blog.noResults}</h3></div>
        )}
      </div>
      <BlogPager view={view} messages={m} onPage={turnTo} />
    </div>
  );
}
