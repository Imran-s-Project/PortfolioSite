import { DEFAULT_SETTINGS } from '@/data/site-data';
import { SEED_PROJECTS } from '@/data/seed-projects';
import { parsePost, parseProject, parseSettings, parseTaxonomy } from '@/lib/validation/schemas';
import type { Post, PostSummary, Project, SiteSettings, Taxonomy } from '@/types';
import { queryDocuments, readDocument, type Outcome, type PlainDoc, type QuerySpec } from './rest';

/** Everything except the (large) article body — used for lists, cards, search and the sitemap. */
const POST_SUMMARY_FIELDS = ['slug', 'status', 'schemaVersion', 'title', 'excerpt', 'coverImage', 'categoryId', 'tagIds', 'featured', 'publishedAt', 'createdAt', 'updatedAt', 'authorId', 'seo', 'readingMinutes', 'views'];
const isPost = (p: Post | null): p is Post => p !== null;

/**
 * The queries the public site runs — exported so `npm run diagnose:firestore` asks exactly what the site asks.
 * Every query that combines a filter with an ordering needs a composite index; they are all listed in firestore.indexes.json:
 *   posts()                  → blogPosts (status ↑, publishedAt ↓)
 *   posts({ categoryId })    → blogPosts (status ↑, categoryId ↑, publishedAt ↓)
 * The others use only equality filters, which Firestore serves from its automatic single-field indexes.
 */
export const publicQueries = {
  /** Published posts, newest first. */
  posts: (opts: { limit?: number; categoryId?: string } = {}): QuerySpec => ({
    collection: 'blogPosts',
    where: [
      { field: 'status', op: 'EQUAL', value: 'published' },
      ...(opts.categoryId ? [{ field: 'categoryId', op: 'EQUAL' as const, value: opts.categoryId }] : [])
    ],
    orderBy: [{ field: 'publishedAt', direction: 'DESCENDING' }],
    select: POST_SUMMARY_FIELDS,
    limit: opts.limit ?? 100
  }),
  /** One published post with its full body. */
  post: (slug: string): QuerySpec => ({
    collection: 'blogPosts',
    where: [
      { field: 'slug', op: 'EQUAL', value: slug },
      { field: 'status', op: 'EQUAL', value: 'published' }
    ],
    limit: 1
  }),
  projects: (): QuerySpec => ({ collection: 'projects', where: [{ field: 'status', op: 'EQUAL', value: 'published' }] }),
  taxonomy: (collection: 'blogCategories' | 'blogTags'): QuerySpec => ({ collection })
};

/**
 * What a failed read becomes — the difference between "nothing there" and "could not ask":
 * - At RUN TIME a failed read must never turn into "no posts" or a 404, because Next would cache that page. Throwing makes
 *   Next keep serving the last good version of the page and retry on the next visit (or show the error page when there is none).
 * - `next build` must not fail just because Firestore is unreachable for a moment: the page is built with the empty value and
 *   regenerated within a minute. The failure is logged either way.
 * - `required: false` is for decoration (names on filter chips, related posts, home-page teasers): the empty value is fine.
 */
function settle<T>(outcome: Outcome<T>, emptyValue: T, required: boolean): T {
  if (outcome.ok) return outcome.value;
  if (!required || process.env.NEXT_PHASE === 'phase-production-build') return emptyValue;
  throw outcome.error;
}

export interface ReadOptions {
  /** Default true: a failed read throws at run time. Pass false where an empty list is an acceptable stand-in. */
  required?: boolean;
}

/** Documents that exist but fail validation are skipped; say so once, so "my post does not show up" has an answer in the log. */
const warned = new Set<string>();
function warnSkipped(what: string, count: number): void {
  if (count === 0 || warned.has(`${what}:${count}`)) return;
  warned.add(`${what}:${count}`);
  console.warn(`[firestore] ${count} ${what} exist but failed validation and are not shown — open them in Admin and save again.`);
}

/* ───────── settings ───────── */
export async function getSettings(): Promise<SiteSettings> {
  const outcome = await readDocument('siteSettings/main', 60);
  return parseSettings(outcome.ok ? outcome.value : null, DEFAULT_SETTINGS); // the built-in defaults are a complete, good-looking site
}

/* ───────── projects: the ten built-in projects, overridden by anything edited in Admin ───────── */
export async function getProjects(): Promise<Project[]> {
  const outcome = await queryDocuments(publicQueries.projects());
  const rows: PlainDoc[] = outcome.ok ? outcome.value : []; // built-in projects still show when the remote list is unavailable
  const remote = rows.map((r) => parseProject({ ...r, slug: r.id })).filter((p): p is Project => p !== null);
  const bySlug = new Map<string, Project>(SEED_PROJECTS.map((p) => [p.slug, p]));
  for (const p of remote) bySlug.set(p.slug, p);
  return [...bySlug.values()].sort((a, b) => a.order - b.order || a.name.en.localeCompare(b.name.en));
}
export async function getProject(slug: string): Promise<Project | null> {
  return (await getProjects()).find((p) => p.slug === slug) ?? null;
}

/* ───────── blog (published posts only — the same condition the Security Rules enforce) ───────── */
export async function getPosts(opts: { limit?: number; categoryId?: string } & ReadOptions = {}): Promise<PostSummary[]> {
  const rows = settle(await queryDocuments(publicQueries.posts(opts)), [], opts.required ?? true);
  const posts = rows.map(parsePost).filter(isPost);
  warnSkipped('published posts', rows.length - posts.length);
  return posts.map((p) => {
    const { content: _content, ...summary } = p;
    void _content;
    return summary;
  });
}

/** `null` means there is no published post with this slug. A failed read throws instead (see `settle`) — never a false 404. */
export async function getPost(slug: string): Promise<Post | null> {
  const rows = settle(await queryDocuments(publicQueries.post(slug)), [], true);
  const post = rows.map(parsePost).find(isPost) ?? null;
  warnSkipped(`published posts (slug "${slug}")`, rows.length - (post ? 1 : 0));
  return post;
}

async function taxonomy(collection: 'blogCategories' | 'blogTags', required: boolean): Promise<Taxonomy[]> {
  const rows = settle(await queryDocuments(publicQueries.taxonomy(collection)), [], required);
  return rows.map((r) => parseTaxonomy({ ...r })).filter((t): t is Taxonomy => t !== null).sort((a, b) => a.order - b.order || a.name.en.localeCompare(b.name.en));
}
export const getCategories = (opts: ReadOptions = {}) => taxonomy('blogCategories', opts.required ?? true);
export const getTags = (opts: ReadOptions = {}) => taxonomy('blogTags', opts.required ?? true);
