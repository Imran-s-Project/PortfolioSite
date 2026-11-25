'use client';
import { useId, useMemo, useState } from 'react';
import { Icon } from '@/components/shared/Icon';
import { useLocale, useMessages } from '@/components/layout/LocaleProvider';
import { fmt } from '@/i18n';
import { rank } from '@/lib/utils/search';
import type { Localized, Project } from '@/types';
import { ProjectCard } from './ProjectCard';

/** Category + technology filters and live search over all projects (Bangla and English text are both searchable). */
export function ProjectExplorer({ projects, filters }: { projects: Project[]; filters: { key: string; label: Localized }[] }) {
  const locale = useLocale();
  const m = useMessages();
  const [category, setCategory] = useState('all');
  const [tech, setTech] = useState('all');
  const [query, setQuery] = useState('');
  const searchId = useId();

  const technologies = useMemo(() => [...new Set(projects.flatMap((p) => p.technologies))].sort((a, b) => a.localeCompare(b)), [projects]);
  const visible = useMemo(() => {
    const base = projects.filter((p) => (category === 'all' || p.categories.includes(category)) && (tech === 'all' || p.technologies.includes(tech)));
    if (!query.trim()) return base;
    return rank(query, base, (p) => ({
      title: `${p.name.bn} ${p.name.en}`,
      subtitle: `${p.category.bn} ${p.category.en} ${p.summary.bn} ${p.summary.en}`,
      keywords: p.technologies
    }));
  }, [projects, category, tech, query]);

  return (
    <div className="explorer">
      <div className="explorer__bar">
        <div className="explorer__search field">
          <label htmlFor={searchId} className="sr-only">{m.projects.search}</label>
          <Icon name="search" />
          <input id={searchId} className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={m.projects.searchPlaceholder} autoComplete="off" />
        </div>
        <div role="group" aria-label={m.projects.filters} className="chips">
          <button type="button" className="chip" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>{m.projects.allCategories}</button>
          {filters.map((f) => (
            <button key={f.key} type="button" className="chip" aria-pressed={category === f.key} onClick={() => setCategory(f.key)}>{f.label[locale]}</button>
          ))}
        </div>
        {technologies.length > 0 && (
          <div role="group" aria-label={m.projects.technology} className="chips">
            <button type="button" className="chip" aria-pressed={tech === 'all'} onClick={() => setTech('all')}>{m.projects.anyTech}</button>
            {technologies.map((t) => (
              <button key={t} type="button" className="chip" aria-pressed={tech === t} onClick={() => setTech(t)}>{t}</button>
            ))}
          </div>
        )}
        <p className="explorer__count" role="status" aria-live="polite">{fmt(m.projects.count, { n: visible.length })}</p>
      </div>

      {visible.length ? (
        <ul className="pgrid">
          {visible.map((p) => (
            <ProjectCard key={p.slug} project={p} locale={locale} messages={m} index={projects.indexOf(p)} />
          ))}
        </ul>
      ) : (
        <div className="empty"><h3>{m.projects.empty}</h3></div>
      )}
    </div>
  );
}
