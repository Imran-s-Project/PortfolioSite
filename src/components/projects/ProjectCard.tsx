import Link from 'next/link';
import { Icon } from '@/components/shared/Icon';
import { fmt, type Messages } from '@/i18n';
import { localizePath, pick } from '@/i18n/locales';
import type { Locale, Project } from '@/types';
import { ProjectThumb } from './ProjectThumb';

export function ProjectCard({ project, locale, messages: m, index }: { project: Project; locale: Locale; messages: Messages; index: number }) {
  const name = pick(project.name, locale);
  const href = localizePath(locale, `/projects/${project.slug}`);
  return (
    <li className="pcard">
      <Link href={href} className="pcard__thumb" tabIndex={-1} aria-hidden="true">
        <ProjectThumb project={project} index={index} locale={locale} />
      </Link>
      <div className="pcard__body">
        <div className="pcard__meta">
          <span>{pick(project.category, locale)}</span>
          {project.featured && <span className="badge">{m.projects.featuredBadge}</span>}
        </div>
        <h3><Link href={href}>{name}</Link></h3>
        <p>{pick(project.summary, locale)}</p>
        <div className="pcard__actions">
          <Link className="btn btn--sm" href={href}>{m.projects.caseStudy}</Link>
          <a className="btn btn--sm btn--ghost" href={project.url} target="_blank" rel="noopener noreferrer" aria-label={`${fmt(m.projects.visit, { name })} ${m.a11y.external}`}>
            {m.projects.liveSite}
            <Icon name="external" />
          </a>
        </div>
      </div>
    </li>
  );
}
