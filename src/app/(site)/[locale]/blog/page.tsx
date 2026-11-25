import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { BlogExplorer } from '@/components/blog/BlogExplorer';
import { PostCard } from '@/components/blog/PostCard';
import { JsonLd } from '@/components/shared/JsonLd';
import { getMessages } from '@/i18n';
import { isLocale, localizePath, pick } from '@/i18n/locales';
import { getCategories, getPosts, getTags } from '@/lib/firestore/public';
import { breadcrumbLd } from '@/lib/seo/jsonld';
import { pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const m = getMessages(locale);
  return pageMetadata({ locale, path: '/blog', title: m.meta.blog, description: m.blog.intro });
}

export default async function BlogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale);
  const [posts, categories, tags] = await Promise.all([getPosts({ limit: 100 }), getCategories({ required: false }), getTags({ required: false })]);
  const featured = posts.filter((p) => p.featured).slice(0, 2);
  const cat = new Map(categories.map((c) => [c.id, pick(c.name, locale)]));

  return (
    <div className="page" data-scene="forest">
      <JsonLd data={breadcrumbLd([{ name: m.nav.home, path: localizePath(locale, '/') }, { name: m.nav.blog, path: localizePath(locale, '/blog') }])} />
      <div className="container section" style={{ paddingTop: '1rem' }}>
        <div className="section__head" data-enter style={{ '--i': 0 } as CSSProperties}>
          <h1 className="section__title">{m.blog.title}</h1>
          <p className="section__intro">{m.blog.intro}</p>
        </div>
        {posts.length === 0 ? (
          <div className="panel empty" role="status">
            <h2>{m.blog.empty}</h2>
            <p>{m.blog.emptyHint}</p>
          </div>
        ) : (
          <>
            {featured.length > 0 && (
              <div style={{ marginBottom: '3rem' }}>
                <h2 className="section__eyebrow" style={{ marginBottom: '1rem' }}>{m.blog.featured}</h2>
                <ul className="postgrid" role="list">
                  {featured.map((p) => <PostCard key={p.id} post={p} locale={locale} messages={m} categoryName={p.categoryId ? cat.get(p.categoryId) : undefined} />)}
                </ul>
              </div>
            )}
            <BlogExplorer posts={posts} categories={categories} tags={tags} />
          </>
        )}
      </div>
    </div>
  );
}
