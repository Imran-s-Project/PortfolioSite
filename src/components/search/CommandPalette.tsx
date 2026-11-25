'use client';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/shared/Icon';
import { useLocale, useMessages } from '@/components/layout/LocaleProvider';
import { fmt } from '@/i18n';
import { localizePath, pick } from '@/i18n/locales';
import { rank } from '@/lib/utils/search';
import type { Localized } from '@/types';

export interface SearchIndex {
  projects: { slug: string; name: Localized; category: Localized; keywords: string[] }[];
  posts: { slug: string; title: Localized; excerpt: Localized; category: Localized | null }[];
}
interface Entry { key: string; group: 'pages' | 'projects' | 'articles'; title: string; hint: string; href: string; haystack: { title: string; subtitle: string; keywords: string[] } }
const RECENT_KEY = 'imran-portfolio-recent-searches';

function readRecent(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}

/** Ctrl/⌘+K command palette: pages, projects and articles in one keyboard-navigable list (WAI-ARIA combobox + listbox). */
export function CommandPalette() {
  const locale = useLocale();
  const m = useMessages();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const uid = useId();
  const listId = `${uid}-list`;

  const open = useCallback(() => {
    const d = dialog.current;
    if (!d || d.open) return;
    setRecent(readRecent());
    setQuery('');
    setActive(0);
    d.showModal();
    input.current?.focus();
  }, []);
  const close = useCallback(() => dialog.current?.close(), []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open();
      }
    };
    addEventListener('keydown', onKey);
    addEventListener('open-search', open);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('open-search', open);
    };
  }, [open]);

  // load the (small, cached) index the first time the palette is used
  const loadIndex = () => {
    if (index || failed) return;
    fetch('/api/search-index')
      .then((r) => (r.ok ? (r.json() as Promise<SearchIndex>) : Promise.reject(new Error(String(r.status)))))
      .then(setIndex)
      .catch(() => setFailed(true));
  };

  const entries = useMemo<Entry[]>(() => {
    const pages: Entry[] = [
      { key: 'home', title: m.nav.home, path: '/' },
      { key: 'projects', title: m.nav.projects, path: '/projects' },
      { key: 'blog', title: m.nav.blog, path: '/blog' },
      { key: 'about', title: m.nav.about, path: '/about' },
      { key: 'contact', title: m.nav.contact, path: '/#contact' },
      { key: 'privacy', title: m.footer.privacy, path: '/privacy' }
    ].map((p) => ({ key: `page-${p.key}`, group: 'pages' as const, title: p.title, hint: '', href: p.path.startsWith('/#') ? `${localizePath(locale, '/')}#contact` : localizePath(locale, p.path), haystack: { title: p.title, subtitle: '', keywords: [p.key] } }));
    const projects: Entry[] = (index?.projects ?? []).map((p) => ({ key: `p-${p.slug}`, group: 'projects', title: pick(p.name, locale), hint: pick(p.category, locale), href: localizePath(locale, `/projects/${p.slug}`), haystack: { title: `${p.name.bn} ${p.name.en}`, subtitle: `${p.category.bn} ${p.category.en}`, keywords: p.keywords } }));
    const posts: Entry[] = (index?.posts ?? []).map((p) => ({ key: `a-${p.slug}`, group: 'articles', title: pick(p.title, locale), hint: p.category ? pick(p.category, locale) : '', href: localizePath(locale, `/blog/${p.slug}`), haystack: { title: `${p.title.bn} ${p.title.en}`, subtitle: `${p.excerpt.bn} ${p.excerpt.en}`, keywords: [] } }));
    return [...pages, ...projects, ...posts];
  }, [index, locale, m]);

  const results = useMemo(() => (query.trim() ? rank(query, entries, (e) => e.haystack, 12) : entries.filter((e) => e.group !== 'articles').slice(0, 9)), [entries, query]);
  const current = results[Math.min(active, results.length - 1)];

  const go = (e: Entry) => {
    if (query.trim()) {
      const next = [query.trim(), ...readRecent().filter((r) => r !== query.trim())].slice(0, 5);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }
    close();
    router.push(e.href);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && current) { e.preventDefault(); go(current); }
  };

  const groupLabel = { pages: m.search.pages, projects: m.search.projects, articles: m.search.articles };
  return (
    <dialog ref={dialog} className="dialog palette" aria-label={m.search.title} onClose={() => setQuery('')} onClick={(e) => e.target === dialog.current && close()} onToggle={(e) => e.newState === 'open' && loadIndex()}>
      <div className="palette__input">
        <Icon name="search" />
        <input
          ref={input}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={current ? `${uid}-${current.key}` : undefined}
          aria-label={m.search.title}
          placeholder={m.search.placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); loadIndex(); }}
          onKeyDown={onKey}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="button" className="btn btn--icon btn--sm btn--ghost" onClick={close} aria-label={m.a11y.close}><Icon name="close" /></button>
      </div>
      <ul id={listId} className="palette__list" role="listbox" aria-label={m.search.title}>
        {!query.trim() && recent.length > 0 && (
          <li role="presentation" className="palette__group">{m.search.recent}</li>
        )}
        {!query.trim() && recent.map((r) => (
          <li key={`recent-${r}`} role="presentation"><button type="button" className="chip" style={{ margin: '0 0.7rem 0.3rem 0' }} onClick={() => { setQuery(r); loadIndex(); input.current?.focus(); }}>{r}</button></li>
        ))}
        {results.map((e, i) => (
          <li key={e.key} role="presentation">
            {(i === 0 || results[i - 1]?.group !== e.group) && <div className="palette__group" role="presentation">{groupLabel[e.group]}</div>}
            <div id={`${uid}-${e.key}`} role="option" aria-selected={i === active} className="palette__item" onPointerMove={() => setActive(i)}>
              <Link href={e.href} onClick={(ev: MouseEvent<HTMLAnchorElement>) => { ev.preventDefault(); go(e); }} tabIndex={-1}>
                <span>{e.title}</span>
                {e.hint && <small>{e.hint}</small>}
              </Link>
            </div>
          </li>
        ))}
        {query.trim() && !results.length && <li role="presentation" className="empty"><p>{fmt(m.search.empty, { q: query.trim() })}</p></li>}
        {failed && <li role="presentation" className="alert alert--bad" style={{ margin: '0.5rem' }}>{m.search.error}</li>}
      </ul>
      <div className="palette__foot" aria-hidden="true"><span><span className="kbd">↑↓</span> </span><span><span className="kbd">Enter</span></span><span><span className="kbd">Esc</span></span></div>
    </dialog>
  );
}
