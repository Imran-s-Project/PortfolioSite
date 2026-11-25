import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relatedProjects, relatedPosts } from '@/lib/utils/related';
import { SEED_PROJECTS } from '@/data/seed-projects';
import type { PostSummary } from '@/types';

test('related projects: same-category first, never itself, at most n', () => {
  const quran = SEED_PROJECTS.find((p) => p.slug === 'quran-bangla')!;
  const rel = relatedProjects(quran, SEED_PROJECTS, 3);
  assert.equal(rel.length, 3);
  assert.ok(!rel.some((p) => p.slug === quran.slug));
  assert.ok(rel[0]!.categories.some((c) => quran.categories.includes(c)));
});
test('related posts: shared tags outrank shared category; falls back to newest', () => {
  const mk = (id: string, tagIds: string[], categoryId: string | null): PostSummary => ({ id, slug: id, status: 'published', schemaVersion: 1, title: { bn: '', en: id }, excerpt: { bn: '', en: '' }, categoryId, tagIds, featured: false, publishedAt: null, createdAt: '', updatedAt: '', authorId: '', seo: { metaTitle: { bn: '', en: '' }, metaDescription: { bn: '', en: '' }, noindex: false }, readingMinutes: { bn: 1, en: 1 }, views: 0 });
  const post = mk('a', ['x', 'y'], 'c1');
  const all = [post, mk('b', [], 'c1'), mk('c', ['x'], null), mk('d', [], null)];
  assert.deepEqual(relatedPosts(post, all, 3).map((p) => p.id), ['c', 'b', 'd']);
});
