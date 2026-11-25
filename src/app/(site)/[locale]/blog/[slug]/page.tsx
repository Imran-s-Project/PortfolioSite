import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BlockRenderer } from '@/components/blog/BlockRenderer';
import { PostCard } from '@/components/blog/PostCard';
import { ReadingProgress } from '@/components/blog/ReadingProgress';
import { ShareBar } from '@/components/blog/ShareBar';
import { Toc } from '@/components/blog/Toc';
import { ViewCounter } from '@/components/blog/ViewCounter';
import { Icon } from '@/components/shared/Icon';
import { JsonLd } from '@/components/shared/JsonLd';
import { SmartImage } from '@/components/shared/SmartImage';
import { LOCALES, SITE_URL } from '@/config/site';
import { fmt, getMessages } from '@/i18n';
import { isLocale, localizePath, pick } from '@/i18n/locales';
import { getCategories, getPost, getPosts, getTags } from '@/lib/firestore/public';
import { blogPostingLd, breadcrumbLd } from '@/lib/seo/jsonld';
import { pageMetadata } from '@/lib/seo/metadata';
import { buildToc } from '@/lib/utils/blocks';
import { formatDate } from '@/lib/utils/dates';
import { relatedPosts } from '@/lib/utils/related';

export const revalidate = 60;
type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateStaticParams() {
  const posts = await getPosts({ limit: 100, required: false }); // at build time an empty list only means "render on demand"
  return LOCALES.flatMap((locale) => posts.map((p) => ({ locale, slug: p.slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const post = await getPost(slug);
  if (!post) return {};
  const title = post.seo.metaTitle[locale] || pick(post.title, locale);
  const description = post.seo.metaDescription[locale] || pick(post.excerpt, locale);
  return pageMetadata({
    locale, path: `/blog/${slug}`, title, description, type: 'article', noindex: post.seo.noindex, canonical: post.seo.canonical,
    image: post.seo.ogImage ?? post.coverImage?.url, publishedTime: post.publishedAt ?? undefined, modifiedTime: post.updatedAt || undefined
  });
}

export default async function ArticlePage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const post = await getPost(slug);
  if (!post) notFound();
  const m = getMessages(locale);
  const other = locale === 'bn' ? 'en' : 'bn';
  const usesFallback = post.content[locale].length === 0 && post.content[other].length > 0;
  const blocks = usesFallback ? post.content[other] : post.content[locale];
  const [categories, tags, all] = await Promise.all([getCategories({ required: false }), getTags({ required: false }), getPosts({ limit: 50, required: false })]);
  const category = categories.find((c) => c.id === post.categoryId);
  const postTags = tags.filter((t) => post.tagIds.includes(t.id));
  const related = relatedPosts(post, all, 3);
  const title = pick(post.title, locale);
  const path = localizePath(locale, `/blog/${slug}`);
  const description = post.seo.metaDescription[locale] || pick(post.excerpt, locale);
  const catName = new Map(categories.map((c) => [c.id, pick(c.name, locale)]));

  return (
    <div className="page" data-scene="forest">
      <JsonLd data={[blogPostingLd(post, locale, path, title, description), breadcrumbLd([{ name: m.nav.home, path: localizePath(locale, '/') }, { name: m.nav.blog, path: localizePath(locale, '/blog') }, { name: title, path }])]} />
      <ReadingProgress targetId="article-body" />
      <ViewCounter postId={post.id} />
      <div className="container section" style={{ paddingTop: '1rem' }}>
        <header className="article__head" data-enter style={{ '--i': 0 } as CSSProperties}>
          <nav aria-label={m.a11y.breadcrumb}>
            <ol className="crumbs">
              <li><Link href={localizePath(locale, '/blog')}>{m.nav.blog}</Link></li>
              {category && <li><Link href={localizePath(locale, `/blog/category/${category.slug}`)}>{pick(category.name, locale)}</Link></li>}
            </ol>
          </nav>
          <h1>{title}</h1>
          <p className="cs__lead">{pick(post.excerpt, locale)}</p>
          <div className="article__meta">
            {post.publishedAt && <span>{m.blog.published}: <time dateTime={post.publishedAt}>{formatDate(post.publishedAt, locale)}</time></span>}
            {post.updatedAt && post.publishedAt && post.updatedAt.slice(0, 10) !== post.publishedAt.slice(0, 10) && <span>{m.blog.updated}: <time dateTime={post.updatedAt}>{formatDate(post.updatedAt, locale)}</time></span>}
            <span>{fmt(m.blog.readTime, { n: post.readingMinutes[usesFallback ? other : locale] })}</span>
            {post.views > 0 && <span>{fmt(m.blog.views, { n: post.views.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-GB') })}</span>}
          </div>
          {postTags.length > 0 && <div className="chips">{postTags.map((t) => <span className="chip" key={t.id}>#{pick(t.name, locale)}</span>)}</div>}
        </header>

        {post.coverImage && (
          <div className="article__cover">
            <SmartImage src={post.coverImage.url} alt={post.coverImage.alt[locale] || post.coverImage.alt.en || ''} fill priority sizes="(min-width: 62rem) 60rem, 100vw" />
          </div>
        )}

        <div className="article__layout">
          <aside className="article__toc"><Toc items={buildToc(blocks)} title={m.blog.toc} /></aside>
          <article id="article-body" className="panel article__panel">
            {usesFallback && <p className="alert" role="note" style={{ marginBottom: '1.5rem' }}>{fmt(m.blog.fallback, { lang: getMessages(other).blog.langName })}</p>}
            <BlockRenderer blocks={blocks} />
            <ShareBar url={`${SITE_URL}${path}`} title={title} />
          </article>
        </div>

        <p style={{ marginTop: '2.5rem' }}><Link className="btn btn--ghost" href={localizePath(locale, '/blog')}><Icon name="arrow-left" />{m.blog.back}</Link></p>

        {related.length > 0 && (
          <section style={{ marginTop: '3.5rem' }} aria-labelledby="related-title">
            <h2 id="related-title" className="section__title" style={{ fontSize: 'var(--fs-3)', marginBottom: '1.25rem' }}>{m.blog.related}</h2>
            <ul className="postgrid" role="list">{related.map((p) => <PostCard key={p.id} post={p} locale={locale} messages={m} categoryName={p.categoryId ? catName.get(p.categoryId) : undefined} />)}</ul>
          </section>
        )}
      </div>
    </div>
  );
}
