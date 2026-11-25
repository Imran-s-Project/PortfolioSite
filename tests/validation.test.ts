import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseBlocks, parsePost, parseProject, parseSettings, parseTaxonomy, validateContact, blockSchema } from '@/lib/validation/schemas';
import { DEFAULT_SETTINGS } from '@/data/site-data';
import { SEED_PROJECTS } from '@/data/seed-projects';
import { BLOCK_TYPES } from '@/types';
import { createBlock } from '@/lib/utils/blocks';

describe('blocks', () => {
  test('every block type produced by the editor validates', () => {
    for (const t of BLOCK_TYPES) assert.ok(blockSchema.safeParse(createBlock(t)).success, t);
  });
  test('invalid blocks are dropped, valid ones kept', () => {
    const good = { id: 'a1', type: 'paragraph', text: 'hello' };
    const out = parseBlocks([good, { id: 'x', type: 'script', text: '<script>' }, { id: 'y', type: 'image', url: 'javascript:alert(1)', alt: '' }, { id: 'z', type: 'image', url: 'http://insecure.example/a.png', alt: '' }, null, 5, { type: 'paragraph' }]);
    assert.deepEqual(out, [good]);
    assert.deepEqual(parseBlocks('nope'), []);
  });
  test('button links must be safe', () => {
    assert.ok(blockSchema.safeParse({ id: 'b', type: 'button', label: 'Go', href: 'https://a.bd', variant: 'primary' }).success);
    assert.equal(blockSchema.safeParse({ id: 'b', type: 'button', label: 'Go', href: 'javascript:alert(1)', variant: 'primary' }).success, false);
  });
  test('size limits hold', () => assert.equal(blockSchema.safeParse({ id: 'p', type: 'paragraph', text: 'x'.repeat(10001) }).success, false));
});

describe('posts', () => {
  const base = { id: 'p1', slug: 'hello-world', status: 'published', title: { en: 'Hello' }, excerpt: { bn: 'সারাংশ' }, content: { en: [{ id: 'a', type: 'paragraph', text: 'hi' }, { id: 'b', type: 'bogus' }] }, publishedAt: '2026-11-01T00:00:00.000Z' };
  test('parses a minimal Firestore document and fills defaults', () => {
    const p = parsePost(base);
    assert.ok(p);
    assert.equal(p.title.bn, '');
    assert.equal(p.title.en, 'Hello');
    assert.equal(p.content.en.length, 1);
    assert.deepEqual(p.content.bn, []);
    assert.deepEqual(p.tagIds, []);
    assert.equal(p.views, 0);
    assert.equal(p.seo.noindex, false);
  });
  test('rejects bad slugs and missing ids', () => {
    assert.equal(parsePost({ ...base, slug: 'Bad Slug' }), null);
    assert.equal(parsePost({ ...base, id: '' }), null);
    assert.equal(parsePost(null), null);
  });
  test('a cover image without a url is ignored; non-https is rejected', () => {
    assert.equal(parsePost({ ...base, coverImage: { url: '', alt: {} } })?.coverImage, undefined);
    assert.equal(parsePost({ ...base, coverImage: { url: 'http://x.y/a.png', alt: {} } }), null);
  });
});

describe('projects', () => {
  test('the ten seed projects pass the same validation Firestore documents go through', () => {
    for (const s of SEED_PROJECTS) {
      const p = parseProject(s);
      assert.ok(p, s.slug);
      assert.equal(p.url, s.url);
      assert.deepEqual(p.name, s.name);
      assert.equal(p.status, 'published');
    }
  });
  test('rejects non-https project URLs', () => assert.equal(parseProject({ ...SEED_PROJECTS[0], url: 'http://x.y' }), null));
  test('empty optional sections stay undefined so the page can hide them', () => {
    const p = parseProject({ ...SEED_PROJECTS[0], objectives: [{ bn: '', en: '' }], description: { bn: '', en: '' } });
    assert.deepEqual(p?.objectives, []);
    assert.equal(p?.description, undefined);
  });
});

describe('settings & taxonomy', () => {
  test('missing settings document keeps defaults', () => {
    assert.deepEqual(parseSettings(undefined, DEFAULT_SETTINGS), DEFAULT_SETTINGS);
    assert.deepEqual(parseSettings({ defaultTheme: 'nope' }, DEFAULT_SETTINGS), DEFAULT_SETTINGS);
  });
  test('overrides apply field by field', () => {
    const s = parseSettings({ defaultTheme: 'ember', availability: 'available', maintenance: { enabled: true } }, DEFAULT_SETTINGS);
    assert.equal(s.defaultTheme, 'ember');
    assert.equal(s.availability, 'available');
    assert.equal(s.maintenance.enabled, true);
    assert.equal(s.maintenance.message.en, DEFAULT_SETTINGS.maintenance.message.en);
    assert.equal(s.email, DEFAULT_SETTINGS.email);
  });
  test('taxonomy', () => {
    assert.equal(parseTaxonomy({ id: 'web', slug: 'web', name: { en: 'Web' } })?.name.en, 'Web');
    assert.equal(parseTaxonomy({ id: 'web', slug: 'Web!', name: {} }), null);
  });
});

describe('contact form', () => {
  const ok = { name: 'Rafi', email: 'rafi@example.com', subject: 'Hello', message: 'I would like to talk about a project.' };
  test('accepts a valid message and trims it', () => {
    const r = validateContact({ ...ok, name: '  Rafi  ' });
    assert.ok(r.ok && r.data.name === 'Rafi');
  });
  test('reports every bad field', () => {
    const r = validateContact({ name: 'R', email: 'nope', subject: 'x', message: 'short' });
    assert.ok(!r.ok);
    assert.deepEqual([...r.fields].sort(), ['email', 'message', 'name', 'subject']);
  });
  test('limits', () => {
    assert.ok(!validateContact({ ...ok, message: 'x'.repeat(4001) }).ok);
    assert.ok(validateContact({ ...ok, message: 'আমি একটি প্রজেক্ট নিয়ে কথা বলতে চাই।' }).ok);
  });
});
