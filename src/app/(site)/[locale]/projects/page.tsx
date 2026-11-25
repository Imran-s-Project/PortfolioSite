import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { ProjectExplorer } from '@/components/projects/ProjectExplorer';
import { JsonLd } from '@/components/shared/JsonLd';
import { PROJECT_FILTERS } from '@/data/site-data';
import { getMessages } from '@/i18n';
import { isLocale, localizePath } from '@/i18n/locales';
import { getProjects } from '@/lib/firestore/public';
import { breadcrumbLd } from '@/lib/seo/jsonld';
import { pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const m = getMessages(locale);
  return pageMetadata({ locale, path: '/projects', title: m.meta.projects, description: m.projects.intro });
}

export default async function ProjectsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale);
  const projects = await getProjects();
  const featured = projects.filter((p) => p.featured);

  return (
    <div className="page" data-scene="valley">
      <JsonLd data={breadcrumbLd([{ name: m.nav.home, path: localizePath(locale, '/') }, { name: m.nav.projects, path: localizePath(locale, '/projects') }])} />
      <div className="container section" style={{ paddingTop: '1rem' }}>
        <div className="section__head" data-enter style={{ '--i': 0 } as CSSProperties}>
          <h1 className="section__title">{m.projects.title}</h1>
          <p className="section__intro">{m.projects.intro}</p>
        </div>
        {featured.length > 0 && (
          <div style={{ marginBottom: '3rem' }}>
            <h2 className="section__eyebrow" style={{ marginBottom: '1rem' }}>{m.projects.featured}</h2>
            <ul className="pgrid" data-layout="featured">
              {featured.slice(0, 4).map((p) => <ProjectCard key={p.slug} project={p} locale={locale} messages={m} index={projects.indexOf(p)} />)}
            </ul>
          </div>
        )}
        <ProjectExplorer projects={projects} filters={PROJECT_FILTERS} />
      </div>
    </div>
  );
}
