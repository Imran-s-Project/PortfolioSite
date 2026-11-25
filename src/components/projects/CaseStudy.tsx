import Link from 'next/link';
import { SmartImage } from '@/components/shared/SmartImage';
import { Icon } from '@/components/shared/Icon';
import { Paragraphs } from '@/components/shared/Inline';
import { fmt, type Messages } from '@/i18n';
import { localizePath, pick } from '@/i18n/locales';
import type { Locale, Project } from '@/types';
import { hostOf } from './ProjectThumb';

/** A project's case-study body. Every section renders only if real data exists — nothing is invented to fill space. */
export function CaseStudy({ project, locale, messages: m }: { project: Project; locale: Locale; messages: Messages }) {
  const description = project.description ? pick(project.description, locale) : '';
  const process = project.process ? pick(project.process, locale) : '';
  const hasDetail = !!(description || project.objectives?.length || project.features?.length || process || project.challenges?.length || project.screenshots.length);
  const name = pick(project.name, locale);
  return (
    <div className="cs__layout">
      <div className="cs__body">
        <section className="panel cs__section" aria-labelledby="cs-overview">
          <h2 id="cs-overview">{m.projects.overview}</h2>
          {description ? <Paragraphs text={description} /> : <p>{pick(project.summary, locale)}</p>}
        </section>

        {project.objectives && project.objectives.length > 0 && (
          <section className="panel cs__section" aria-labelledby="cs-objectives">
            <h2 id="cs-objectives">{m.projects.objectives}</h2>
            <ul className="cs__list">{project.objectives.map((o, i) => <li key={i}>{pick(o, locale)}</li>)}</ul>
          </section>
        )}
        {project.features && project.features.length > 0 && (
          <section className="panel cs__section" aria-labelledby="cs-features">
            <h2 id="cs-features">{m.projects.features}</h2>
            <ul className="cs__list">{project.features.map((o, i) => <li key={i}>{pick(o, locale)}</li>)}</ul>
          </section>
        )}
        {process && (
          <section className="panel cs__section" aria-labelledby="cs-process">
            <h2 id="cs-process">{m.projects.process}</h2>
            <Paragraphs text={process} />
          </section>
        )}
        {project.challenges && project.challenges.length > 0 && (
          <section className="panel cs__section" aria-labelledby="cs-challenges">
            <h2 id="cs-challenges">{m.projects.challenges}</h2>
            <div className="stack">
              {project.challenges.map((c, i) => (
                <div className="cs__pair" key={i}>
                  <div><h3>{m.projects.challenge}</h3><p>{pick(c.challenge, locale)}</p></div>
                  <div><h3>{m.projects.solution}</h3><p>{pick(c.solution, locale)}</p></div>
                </div>
              ))}
            </div>
          </section>
        )}
        {project.screenshots.length > 0 && (
          <section className="panel cs__section" aria-labelledby="cs-gallery">
            <h2 id="cs-gallery">{m.projects.gallery}</h2>
            <div className="cs__gallery">
              {project.screenshots.map((s) => (
                <figure key={s.url}>
                  <SmartImage src={s.url} alt={s.alt[locale] || s.alt.en || name} width={800} height={500} sizes="(min-width: 62rem) 22rem, 90vw" />
                </figure>
              ))}
            </div>
          </section>
        )}
        {!hasDetail && <p className="alert" role="note">{m.projects.noExtra}</p>}
      </div>

      <aside className="panel cs__meta" aria-label={m.projects.overview}>
        <dl>
          <div><dt>{m.projects.category}</dt><dd>{pick(project.category, locale)}</dd></div>
          <div><dt>{m.projects.liveSite}</dt><dd><a href={project.url} target="_blank" rel="noopener noreferrer" aria-label={`${fmt(m.projects.visit, { name })} ${m.a11y.external}`}>{hostOf(project.url)}</a></dd></div>
          {project.technologies.length > 0 && (
            <div><dt>{m.projects.technologies}</dt><dd className="chips">{project.technologies.map((t) => <span className="chip" key={t}>{t}</span>)}</dd></div>
          )}
        </dl>
        <div className="stack" style={{ marginTop: '1.25rem' }}>
          <a className="btn btn--primary" href={project.url} target="_blank" rel="noopener noreferrer">{m.projects.liveSite}<Icon name="external" /></a>
          <Link className="btn btn--ghost" href={localizePath(locale, '/projects')}><Icon name="arrow-left" />{m.projects.back}</Link>
        </div>
      </aside>
    </div>
  );
}
