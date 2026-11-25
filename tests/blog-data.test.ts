import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_PROJECTS } from '@/data/seed-projects';
import { DEFAULT_SETTINGS } from '@/data/site-data';
import { getCategories, getPost, getPosts, getProjects, getSettings, getTags, publicQueries } from '@/lib/firestore/public';
import { FirestoreRequestError, resetFailureLog } from '@/lib/firestore/rest';
import { captureConsole, fakeFirestore, fsDocument, googleError, json, postFields, queryRows } from './helpers/firestore-fake';

const MISSING_INDEX = () => googleError(400, 'FAILED_PRECONDITION', 'The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/demo/firestore/indexes?create_composite=Cgpi', { wrap: true });
const isUnavailable = (e: unknown) => e instanceof FirestoreRequestError && e.kind === 'unavailable';

let errors: string[];
let warnings: string[];
beforeEach(() => {
  resetFailureLog();
  delete process.env.NEXT_PHASE;
  errors = captureConsole('error');
  warnings = captureConsole('warn');
});
afterEach(() => {
  mock.restoreAll();
  delete process.env.NEXT_PHASE;
});

const doc = (id: string, over: Record<string, unknown> = {}) => fsDocument('blogPosts', id, postFields({ slug: id, ...over }));

describe('the queries the public site runs', () => {
  test('the post list is "published, newest first", without the article bodies', () => {
    const q = publicQueries.posts();
    assert.deepEqual(q.where, [{ field: 'status', op: 'EQUAL', value: 'published' }]);
    assert.deepEqual(q.orderBy, [{ field: 'publishedAt', direction: 'DESCENDING' }]);
    assert.equal(q.limit, 100);
    assert.ok(q.select?.includes('slug') && q.select.includes('publishedAt') && !q.select.includes('content'));
  });

  test('every ordered query has its composite index listed in firestore.indexes.json', async () => {
    const { readFile } = await import('node:fs/promises');
    const { indexes } = JSON.parse(await readFile('firestore.indexes.json', 'utf8')) as { indexes: { collectionGroup: string; fields: { fieldPath: string; order: string }[] }[] };
    const has = (collection: string, fields: [string, string][]) =>
      indexes.some((i) => i.collectionGroup === collection && i.fields.length === fields.length && fields.every(([path, order], n) => i.fields[n].fieldPath === path && i.fields[n].order === order));
    for (const spec of [publicQueries.posts(), publicQueries.posts({ categoryId: 'x' })]) {
      const equalities = (spec.where ?? []).map((w) => [w.field, 'ASCENDING'] as [string, string]);
      const ordered = (spec.orderBy ?? []).map((o) => [o.field, o.direction ?? 'ASCENDING'] as [string, string]);
      assert.ok(has(spec.collection, [...equalities, ...ordered]), `composite index for ${JSON.stringify([...equalities, ...ordered])}`);
    }
  });
});

describe('getPosts', () => {
  test('returns summaries (no article body) and asks for published posts only', async () => {
    const calls = fakeFirestore(() => json(200, queryRows(doc('b', { content: { bn: [], en: [{ id: 'p1', type: 'paragraph', text: 'Body' }] } }), doc('a'))));
    const posts = await getPosts();
    assert.deepEqual(posts.map((p) => p.slug), ['b', 'a'], 'the order Firestore answered in');
    assert.ok(posts.every((p) => !('content' in p)));
    assert.equal(posts[0].title.en, 'Hello');
    assert.equal(posts[0].publishedAt, '2026-11-01T10:00:00.000Z');
    const where = (calls[0].query as { where: { fieldFilter: { field: { fieldPath: string }; value: unknown } } }).where.fieldFilter;
    assert.equal(where.field.fieldPath, 'status');
    assert.deepEqual(where.value, { stringValue: 'published' });
  });

  test('a category filter adds one equality filter', async () => {
    const calls = fakeFirestore(() => json(200, queryRows()));
    await getPosts({ limit: 3, categoryId: 'tech' });
    const q = calls[0].query as { where: { compositeFilter: { filters: { fieldFilter: { field: { fieldPath: string } } }[] } }; limit: number };
    assert.deepEqual(q.where.compositeFilter.filters.map((f) => f.fieldFilter.field.fieldPath), ['status', 'categoryId']);
    assert.equal(q.limit, 3);
  });

  test('EMPTY: no posts yet is an empty list, not an error', async () => {
    fakeFirestore(() => json(200, queryRows()));
    assert.deepEqual(await getPosts(), []);
    assert.equal(errors.length, 0);
  });

  test('a missing composite index (the reported HTTP 400) still serves the posts, newest first — and logs the cause once', async () => {
    fakeFirestore((_, n) =>
      n === 1 ? MISSING_INDEX() : json(200, queryRows(doc('old', { publishedAt: new Date('2026-01-01T00:00:00Z') }), doc('new', { publishedAt: new Date('2026-11-05T00:00:00Z') }), doc('mid', { publishedAt: new Date('2026-06-01T00:00:00Z') })))
    );
    assert.deepEqual((await getPosts()).map((p) => p.slug), ['new', 'mid', 'old']);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('[missing-index]') && errors[0].includes('firebase deploy --only firestore:indexes'));
  });

  test('UNAVAILABLE at run time: throws — a failed read is never shown as "no posts" (which Next would cache)', async () => {
    fakeFirestore(() => googleError(500, 'INTERNAL', 'oops'));
    await assert.rejects(getPosts(), isUnavailable);
    assert.equal(errors.length, 1, 'and it is logged');
  });

  test('UNAVAILABLE for decoration (home-page teasers, related posts): an empty list is fine', async () => {
    fakeFirestore(() => googleError(500, 'INTERNAL', 'oops'));
    assert.deepEqual(await getPosts({ limit: 3, required: false }), []);
  });

  test('UNAVAILABLE while `next build` runs: the build must not fail, the page is rebuilt within a minute', async () => {
    process.env.NEXT_PHASE = 'phase-production-build';
    fakeFirestore(() => googleError(500, 'INTERNAL', 'oops'));
    assert.deepEqual(await getPosts(), []);
    assert.equal(errors.length, 1, 'still logged');
  });

  test('posts that fail validation are skipped, and the log says how many (once)', async () => {
    fakeFirestore(() => json(200, queryRows(doc('good'), doc('also-bad', { slug: 'Not A Slug!' }), doc('bad', { title: { bn: '', en: 'x'.repeat(5000) } }))));
    assert.deepEqual((await getPosts()).map((p) => p.slug), ['good']);
    await getPosts();
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('2 published posts exist but failed validation'));
  });
});

describe('getPost', () => {
  const full = () => doc('hello', { content: { bn: [], en: [{ id: 'p1', type: 'paragraph', text: 'Hi there' }, { id: 'h1', type: 'heading', level: 2, text: 'Part' }] } });

  test('FOUND: the full article, looked up by slug among published posts', async () => {
    const calls = fakeFirestore(() => json(200, queryRows(full())));
    const post = await getPost('hello');
    assert.equal(post?.slug, 'hello');
    assert.equal(post?.content.en.length, 2);
    assert.equal(post?.content.bn.length, 0);
    const filters = (calls[0].query as { where: { compositeFilter: { filters: { fieldFilter: { field: { fieldPath: string }; value: { stringValue: string } } }[] } }; limit: number }).where.compositeFilter.filters.map((f) => [f.fieldFilter.field.fieldPath, f.fieldFilter.value.stringValue]);
    assert.deepEqual(filters, [['slug', 'hello'], ['status', 'published']]);
  });

  test('MISSING: no such published post is null (a real 404), not an error', async () => {
    fakeFirestore(() => json(200, queryRows()));
    assert.equal(await getPost('nope'), null);
    assert.equal(errors.length, 0);
  });

  test('UNAVAILABLE: throws instead of answering "not found" — an outage must never become a cached 404 for a real article', async () => {
    fakeFirestore(() => googleError(503, 'UNAVAILABLE', 'try later'));
    await assert.rejects(getPost('hello'), isUnavailable);
  });

  test('the same failure while building is a quiet null (nothing is pre-rendered for it)', async () => {
    process.env.NEXT_PHASE = 'phase-production-build';
    fakeFirestore(() => googleError(503, 'UNAVAILABLE', 'try later'));
    assert.equal(await getPost('hello'), null);
  });

  test('a stored post that fails validation is not shown, and the log says so', async () => {
    fakeFirestore(() => json(200, queryRows(doc('broken', { title: 'not a localized title' }))));
    assert.equal(await getPost('broken'), null);
    assert.ok(warnings.some((w) => w.includes('slug "broken"')));
  });
});

describe('categories and tags', () => {
  const tax = (collection: string, id: string, order: number | undefined, en: string) => fsDocument(collection, id, { slug: id, name: { bn: en, en }, order });

  test('sorted by their order, then by name', async () => {
    fakeFirestore(() => json(200, queryRows(tax('blogCategories', 'c', 2, 'Cee'), tax('blogCategories', 'b', 1, 'Bee'), tax('blogCategories', 'a', 1, 'Aye'), tax('blogCategories', 'z', undefined, 'Zed'))));
    assert.deepEqual((await getCategories()).map((c) => c.id), ['z', 'a', 'b', 'c']);
  });

  test('a failed read of the category a page is about throws; names on chips can do without', async () => {
    fakeFirestore(() => googleError(500, 'INTERNAL', 'oops'));
    await assert.rejects(getCategories(), isUnavailable);
    assert.deepEqual(await getCategories({ required: false }), []);
    assert.deepEqual(await getTags({ required: false }), []);
  });
});

describe('settings and projects always have something good to show', () => {
  test('settings: a failed read or a missing document falls back to the built-in defaults', async () => {
    fakeFirestore(() => googleError(500, 'INTERNAL', 'oops'));
    assert.deepEqual(await getSettings(), DEFAULT_SETTINGS);
    mock.restoreAll();
    errors = captureConsole('error');
    fakeFirestore(() => googleError(404, 'NOT_FOUND', 'Document "projects/p/databases/(default)/documents/siteSettings/main" not found.'));
    assert.deepEqual(await getSettings(), DEFAULT_SETTINGS);
    assert.equal(errors.length, 0, 'a missing optional document is not an error');
  });

  test('settings: edits made in Admin are layered over the defaults', async () => {
    fakeFirestore(() => json(200, fsDocument('siteSettings', 'main', { availability: 'busy', availabilityNote: { bn: 'ব্যস্ত', en: 'Busy until March' } })));
    const settings = await getSettings();
    assert.equal(settings.availability, 'busy');
    assert.equal(settings.availabilityNote.en, 'Busy until March');
    assert.equal(settings.email, DEFAULT_SETTINGS.email, 'everything not edited keeps its default');
  });

  test('projects: when the remote list cannot be read, the ten built-in projects still show', async () => {
    fakeFirestore(() => googleError(500, 'INTERNAL', 'oops'));
    const projects = await getProjects();
    assert.equal(projects.length, SEED_PROJECTS.length);
    assert.equal(errors.length, 1);
  });

  test('projects: an edit made in Admin overrides the built-in one with the same slug', async () => {
    const seed = SEED_PROJECTS[0];
    fakeFirestore(() => json(200, queryRows(fsDocument('projects', seed.slug, { slug: seed.slug, status: 'published', url: 'https://example.com', name: { bn: 'নতুন', en: 'Renamed' }, category: { bn: 'ক', en: 'C' }, summary: { bn: 'স', en: 'S' }, order: 1 }))));
    const projects = await getProjects();
    assert.equal(projects.length, SEED_PROJECTS.length);
    assert.equal(projects.find((p) => p.slug === seed.slug)?.name.en, 'Renamed');
  });
});
