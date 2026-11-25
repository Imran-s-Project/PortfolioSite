import { OWNER, SITE_URL } from '@/config/site';
import type { Locale, Post } from '@/types';
import { SOCIAL_LINKS } from '@/data/site-data';

/** Serialises structured data for a <script type="application/ld+json"> tag; "<" is escaped so it can never close the tag. */
export const jsonLdString = (data: unknown): string => JSON.stringify(data).replace(/</g, '\\u003c');

const abs = (path: string): string => (/^https?:/i.test(path) ? path : `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`);

export function personLd(locale: Locale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${SITE_URL}/#person`,
    name: OWNER.name[locale],
    alternateName: OWNER.name[locale === 'bn' ? 'en' : 'bn'],
    jobTitle: OWNER.jobTitle,
    url: SITE_URL,
    image: abs('/og/og-default.png'),
    sameAs: SOCIAL_LINKS.filter((s) => /^https:/.test(s.url)).map((s) => s.url)
  };
}
export function websiteLd(locale: Locale, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: OWNER.name.en,
    url: `${SITE_URL}/${locale}`,
    inLanguage: locale,
    description,
    publisher: { '@id': `${SITE_URL}/#person` }
  };
}
export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: abs(it.path) }))
  };
}
export function blogPostingLd(post: Pick<Post, 'title' | 'excerpt' | 'publishedAt' | 'updatedAt' | 'coverImage' | 'seo'>, locale: Locale, path: string, title: string, description: string) {
  const image = post.seo.ogImage ?? post.coverImage?.url;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title.slice(0, 110),
    description,
    inLanguage: locale,
    mainEntityOfPage: { '@type': 'WebPage', '@id': abs(path) },
    datePublished: post.publishedAt ?? undefined,
    dateModified: post.updatedAt || post.publishedAt || undefined,
    ...(image ? { image: [image] } : {}),
    author: { '@id': `${SITE_URL}/#person` },
    publisher: { '@id': `${SITE_URL}/#person` }
  };
}
