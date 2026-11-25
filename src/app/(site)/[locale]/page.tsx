import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Hero } from '@/components/hero/Hero';
import { PostCard } from '@/components/blog/PostCard';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { AboutSection } from '@/components/sections/AboutSection';
import { ContactSection } from '@/components/sections/ContactSection';
import { ShowcaseSection } from '@/components/sections/ShowcaseSection';
import { COPY } from '@/data/site-data';
import { getMessages } from '@/i18n';
import { isLocale, localizePath, pick } from '@/i18n/locales';
import { getCategories, getPosts, getProjects, getSettings } from '@/lib/firestore/public';
import { pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const m = getMessages(locale);
  const settings = await getSettings();
  return pageMetadata({ locale, path: '/', title: m.meta.title, description: settings.seo.description[locale] || m.meta.description, image: settings.seo.ogImage });
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale);
  const [settings, projects, posts, categories] = await Promise.all([getSettings(), getProjects(), getPosts({ limit: 3, required: false }), getCategories({ required: false })]);
  const featured = projects.filter((p) => p.featured);
  const shown = (featured.length ? featured : projects).slice(0, 4);
  const cat = new Map(categories.map((c) => [c.id, pick(c.name, locale)]));
  const ps = COPY.projectsSection;

  return (
    <>
      <Hero locale={locale} messages={m} settings={settings} />
      <ShowcaseSection locale={locale} url={settings.showcaseVideoUrl} />

      <section className="section" id="projects" data-scene="valley" aria-labelledby="projects-title">
        <div className="container">
          <div className="section__head" data-reveal>
            <p className="section__eyebrow">{ps.eyebrow[locale]}</p>
            <h2 id="projects-title" className="section__title">{ps.heading[locale]}</h2>
            <p className="section__intro">{m.projects.intro}</p>
          </div>
          <ul className="pgrid" data-layout="featured" data-reveal>
            {shown.map((p, i) => <ProjectCard key={p.slug} project={p} locale={locale} messages={m} index={projects.indexOf(p) >= 0 ? projects.indexOf(p) : i} />)}
          </ul>
          <p style={{ marginTop: '2rem' }}><Link className="btn btn--primary" href={localizePath(locale, '/projects')}>{m.projects.viewAll}</Link></p>
        </div>
      </section>

      <AboutSection locale={locale} messages={m} />

      {posts.length > 0 && (
        <section className="section" id="blog" aria-labelledby="blog-title">
          <div className="container">
            <div className="section__head" data-reveal>
              <h2 id="blog-title" className="section__title">{m.blog.latest}</h2>
              <p className="section__intro">{m.blog.intro}</p>
            </div>
            <ul className="postgrid" role="list" data-reveal>
              {posts.map((p) => <PostCard key={p.id} post={p} locale={locale} messages={m} categoryName={p.categoryId ? cat.get(p.categoryId) : undefined} />)}
            </ul>
            <p style={{ marginTop: '2rem' }}><Link className="btn btn--ghost" href={localizePath(locale, '/blog')}>{m.blog.back}</Link></p>
          </div>
        </section>
      )}

      <ContactSection locale={locale} messages={m} settings={settings} />
    </>
  );
}
