import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { BlogExplorer } from '@/components/blog/BlogExplorer';
import { JsonLd } from '@/components/shared/JsonLd';
import { fmt, getMessages } from '@/i18n';
import { isLocale, localizePath, pick } from '@/i18n/locales';
import { getCategories, getPosts, getTags } from '@/lib/firestore/public';
import { breadcrumbLd } from '@/lib/seo/jsonld';
import { pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 60;
type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const m = getMessages(locale);
  const category = (await getCategories()).find((c) => c.slug === slug);
  if (!category) return {};
  const name = pick(category.name, locale);
  return pageMetadata({ locale, path: `/blog/category/${slug}`, title: fmt(m.blog.categoryHeading, { name }), description: category.description ? pick(category.description, locale) || m.blog.intro : m.blog.intro });
}

export default async function CategoryPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale);
  const categories = await getCategories();
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();
  const [posts, tags] = await Promise.all([getPosts({ limit: 100, categoryId: category.id }), getTags({ required: false })]);
  const name = pick(category.name, locale);

  return (
    <div className="page" data-scene="forest">
      <JsonLd data={breadcrumbLd([{ name: m.nav.home, path: localizePath(locale, '/') }, { name: m.nav.blog, path: localizePath(locale, '/blog') }, { name, path: localizePath(locale, `/blog/category/${slug}`) }])} />
      <div className="container section" style={{ paddingTop: '1rem' }}>
        <div className="section__head" data-enter style={{ '--i': 0 } as CSSProperties}>
          <h1 className="section__title">{fmt(m.blog.categoryHeading, { name })}</h1>
          {category.description && pick(category.description, locale) && <p className="section__intro">{pick(category.description, locale)}</p>}
        </div>
        {posts.length === 0 ? <div className="panel empty" role="status"><h2>{m.blog.empty}</h2></div> : <BlogExplorer posts={posts} categories={categories} tags={tags} activeCategory={category.id} />}
      </div>
    </div>
  );
}
