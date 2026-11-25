import { NextResponse } from 'next/server';
import { getCategories, getPosts, getProjects } from '@/lib/firestore/public';
import type { SearchIndex } from '@/components/search/CommandPalette';

export const revalidate = 300;

/** Small public search index (projects + published articles) for the command palette. Cached for 5 minutes. */
export async function GET() {
  const [projects, posts, categories] = await Promise.all([getProjects(), getPosts({ limit: 200 }), getCategories()]);
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  const body: SearchIndex = {
    projects: projects.map((p) => ({ slug: p.slug, name: p.name, category: p.category, keywords: p.technologies })),
    posts: posts.map((p) => ({ slug: p.slug, title: p.title, excerpt: p.excerpt, category: p.categoryId ? (cat.get(p.categoryId) ?? null) : null }))
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } });
}
