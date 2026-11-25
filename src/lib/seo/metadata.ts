import type { Metadata } from 'next';
import { OG_LOCALE, SITE_URL } from '@/config/site';
import { localizePath } from '@/i18n/locales';
import type { Locale } from '@/types';

interface PageMeta {
  locale: Locale;
  /** locale-less path, e.g. '/projects/quran-bangla' */
  path: string;
  title: string;
  description: string;
  image?: string;
  type?: 'website' | 'article';
  noindex?: boolean;
  canonical?: string;
  publishedTime?: string;
  modifiedTime?: string;
  /** false when the page exists in one language only */
  alternates?: boolean;
}

/** Canonical URL, hreflang alternates, Open Graph and X/Twitter card for one page. */
export function pageMetadata(o: PageMeta): Metadata {
  const url = `${SITE_URL}${localizePath(o.locale, o.path)}`;
  const other: Locale = o.locale === 'bn' ? 'en' : 'bn';
  const image = o.image ?? '/og/og-default.png';
  const withAlternates = o.alternates !== false;
  return {
    title: o.title,
    description: o.description,
    alternates: {
      canonical: o.canonical ?? url,
      ...(withAlternates ? { languages: { [o.locale]: url, [other]: `${SITE_URL}${localizePath(other, o.path)}`, 'x-default': `${SITE_URL}${localizePath('bn', o.path)}` } } : {})
    },
    robots: o.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: o.type ?? 'website',
      url,
      title: o.title,
      description: o.description,
      siteName: 'Imran Ahmed',
      locale: OG_LOCALE[o.locale],
      alternateLocale: [OG_LOCALE[other]],
      images: [{ url: image, width: 1200, height: 630, alt: o.title }],
      ...(o.type === 'article' ? { publishedTime: o.publishedTime, modifiedTime: o.modifiedTime } : {})
    },
    twitter: { card: 'summary_large_image', title: o.title, description: o.description, images: [image] }
  };
}
