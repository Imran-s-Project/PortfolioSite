import type { MetadataRoute } from 'next';
import { LOCALES, SITE_URL } from '@/config/site';
import { localizePath } from '@/i18n/locales';
import { getCategories, getPosts, getProjects } from '@/lib/firestore/public';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [projects, posts, categories] = await Promise.all([getProjects(), getPosts({ limit: 500 }), getCategories()]);
  const entry = (path: string, lastModified?: string, priority = 0.6): MetadataRoute.Sitemap =>
    LOCALES.map((locale) => ({
      url: `${SITE_URL}${localizePath(locale, path)}`,
      lastModified: lastModified ? new Date(lastModified) : undefined,
      priority,
      alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}${localizePath(l, path)}`])) }
    }));
  return [
    ...entry('/', undefined, 1),
    ...entry('/projects', undefined, 0.9),
    ...entry('/blog', undefined, 0.8),
    ...entry('/about', undefined, 0.6),
    ...entry('/privacy', undefined, 0.2),
    ...projects.flatMap((p) => entry(`/projects/${p.slug}`, p.updatedAt, 0.7)),
    ...categories.flatMap((c) => entry(`/blog/category/${c.slug}`, undefined, 0.5)),
    ...posts.filter((p) => !p.seo.noindex).flatMap((p) => entry(`/blog/${p.slug}`, p.updatedAt || p.publishedAt || undefined, 0.7))
  ];
}
