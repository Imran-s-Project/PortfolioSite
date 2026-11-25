import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { CaseStudy } from '@/components/projects/CaseStudy';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { JsonLd } from '@/components/shared/JsonLd';
import { LOCALES } from '@/config/site';
import { getMessages } from '@/i18n';
import { isLocale, localizePath, pick } from '@/i18n/locales';
import { getProject, getProjects } from '@/lib/firestore/public';
import { breadcrumbLd } from '@/lib/seo/jsonld';
import { pageMetadata } from '@/lib/seo/metadata';
import { relatedProjects } from '@/lib/utils/related';

export const revalidate = 60;

export async function generateStaticParams() {
  const projects = await getProjects();
  return LOCALES.flatMap((locale) => projects.map((p) => ({ locale, slug: p.slug })));
}

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const project = await getProject(slug);
  if (!project) return {};
  return pageMetadata({ locale, path: `/projects/${slug}`, title: pick(project.name, locale), description: pick(project.summary, locale), image: project.thumbnail?.url });
}

export default async function ProjectPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const [project, all] = await Promise.all([getProject(slug), getProjects()]);
  if (!project) notFound();
  const m = getMessages(locale);
  const related = relatedProjects(project, all, 3);
  const name = pick(project.name, locale);

  return (
    <div className="page" data-scene="forest">
      <JsonLd data={breadcrumbLd([{ name: m.nav.home, path: localizePath(locale, '/') }, { name: m.nav.projects, path: localizePath(locale, '/projects') }, { name, path: localizePath(locale, `/projects/${slug}`) }])} />
      <div className="container section" style={{ paddingTop: '1rem' }}>
        <nav aria-label={m.a11y.breadcrumb}>
          <ol className="crumbs">
            <li><Link href={localizePath(locale, '/')}>{m.nav.home}</Link></li>
            <li><Link href={localizePath(locale, '/projects')}>{m.nav.projects}</Link></li>
            <li aria-current="page">{name}</li>
          </ol>
        </nav>
        <header className="cs__head" data-enter style={{ '--i': 0 } as CSSProperties}>
          <p className="section__eyebrow">{pick(project.category, locale)}</p>
          <h1>{name}</h1>
          <p className="cs__lead">{pick(project.summary, locale)}</p>
        </header>
        <CaseStudy project={project} locale={locale} messages={m} />
        {related.length > 0 && (
          <section style={{ marginTop: '4rem' }} aria-labelledby="related-title">
            <h2 id="related-title" className="section__title" style={{ fontSize: 'var(--fs-3)', marginBottom: '1.25rem' }}>{m.projects.related}</h2>
            <ul className="pgrid">{related.map((p) => <ProjectCard key={p.slug} project={p} locale={locale} messages={m} index={all.indexOf(p)} />)}</ul>
          </section>
        )}
      </div>
    </div>
  );
}
