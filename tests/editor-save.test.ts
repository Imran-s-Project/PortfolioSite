/**
 * What the post editor may save, and how it saves. The rule behind most of these tests: the editor must never write something the
 * site cannot read back — a post that fails to parse disappears from the blog AND from the admin list.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { blockProblems, emptyPost, isHttpsUrl, optionalUrl, problems, unreadBlocks, type EditorPost } from '@/features/editor/model';
import { createSaveGate } from '@/features/editor/save-gate';
import { createBlock } from '@/lib/utils/blocks';
import { parsePost } from '@/lib/validation/schemas';
import { BLOCK_TYPES, type Block } from '@/types';

const valid = (over: Partial<EditorPost> = {}): EditorPost => ({ ...emptyPost(), title: { bn: '', en: 'Hello' }, slug: 'hello', ...over });
const paragraph = (text: string): Block => ({ ...createBlock('paragraph'), text }) as Block;
/** What Firestore hands back for a saved post, as plain JSON — enough for the reader (`parsePost`) to accept or refuse. */
const stored = (s: EditorPost) => ({ id: 'p1', slug: s.slug, status: s.status, title: s.title, excerpt: s.excerpt, content: s.content, seo: s.seo, categoryId: s.categoryId, tagIds: s.tagIds });

describe('addresses the site accepts for the share image and the canonical link', () => {
  test('only a full https:// address', () => {
    assert.equal(isHttpsUrl('https://example.com/a.png'), true);
    assert.equal(isHttpsUrl('HTTPS://EXAMPLE.COM/a.png'), true);
    for (const bad of ['http://example.com/a.png', '/og/a.png', 'example.com/a.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'https://', 'ftp://example.com', '', ' ']) assert.equal(isHttpsUrl(bad), false, bad);
    assert.equal(isHttpsUrl('https://example.com/' + 'a'.repeat(2100)), false, 'longer than the reader allows');
  });

  test('a box left empty (or only spaces) means "not set"; surrounding spaces are removed', () => {
    assert.equal(optionalUrl(undefined), undefined);
    assert.equal(optionalUrl('   '), undefined);
    assert.equal(optionalUrl('  https://example.com/a.png '), 'https://example.com/a.png');
  });

  test('the editor refuses exactly what would make the reader drop the whole post', () => {
    for (const field of ['ogImage', 'canonical'] as const) {
      const bad = valid({ seo: { ...emptyPost().seo, [field]: 'http://example.com/x' } });
      assert.equal(parsePost(stored(bad)), null, `without the check, ${field} http:// makes the post unreadable`);
      assert.deepEqual(problems(bad, [], false), [field === 'ogImage' ? 'seo-image' : 'seo-canonical']);
      const good = valid({ seo: { ...emptyPost().seo, [field]: 'https://example.com/x' } });
      assert.ok(parsePost(stored(good)), `${field} https:// is fine`);
      assert.deepEqual(problems(good, [], false), []);
    }
    assert.deepEqual(problems(valid({ seo: { ...emptyPost().seo, ogImage: '   ', canonical: '' } }), [], false), [], 'empty boxes are not a problem');
  });
});

describe('blocks the site would silently drop', () => {
  test('every block a writer can add is valid as it is created — so a draft reopens with all of them', () => {
    for (const type of BLOCK_TYPES) assert.deepEqual(blockProblems({ bn: [createBlock(type)], en: [] }), [], type);
  });

  test('too much text in one block is reported with its place, per language', () => {
    const found = blockProblems({ bn: [paragraph('ok')], en: [paragraph('a'), paragraph('x'.repeat(10_001))] });
    assert.deepEqual(found, [{ lang: 'en', number: 2, type: 'paragraph' }]);
    assert.deepEqual(blockProblems({ bn: [paragraph('x'.repeat(10_000))], en: [] }), [], 'exactly the limit is fine');
  });

  test('a button with an unsafe link is reported; safe links are not', () => {
    const button = (href: string): Block => ({ ...createBlock('button'), label: 'Go', href }) as Block;
    assert.equal(blockProblems({ bn: [button('javascript:alert(1)')], en: [] }).length, 1);
    for (const href of ['https://example.com', '/contact', 'mailto:a@b.co', '']) assert.deepEqual(blockProblems({ bn: [button(href)], en: [] }), [], href);
  });

  test('more blocks than the reader keeps (500) are reported from the 501st', () => {
    const many = Array.from({ length: 501 }, (_, i) => paragraph(`p${i}`));
    assert.deepEqual(blockProblems({ bn: many, en: [] }), [{ lang: 'bn', number: 501, type: 'paragraph' }]);
    assert.deepEqual(blockProblems({ bn: many.slice(0, 500), en: [] }), []);
  });

  test('problems() includes them, after the address checks', () => {
    const s = valid({ content: { bn: [paragraph('x'.repeat(10_001))], en: [] } });
    assert.deepEqual(problems(s, [], false), ['blocks']);
    assert.deepEqual(problems({ ...s, slug: 'Bad Slug' }, [], false), ['slug', 'blocks']);
  });

  test('save → reopen: a post with every kind of block comes back complete, in order, unchanged', () => {
    const blocks: Block[] = [
      { id: 'b01', type: 'heading', level: 2, text: 'Intro' },
      { id: 'b02', type: 'paragraph', text: 'Text with **bold** and [a link](https://example.com).' },
      { id: 'b03', type: 'image', url: 'https://example.com/a.png', alt: 'A picture', caption: 'Caption', width: 800, height: 600 },
      { id: 'b04', type: 'gallery', images: [{ url: 'https://example.com/1.png', alt: 'one' }, { url: 'https://example.com/2.png', alt: 'two' }] },
      { id: 'b05', type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Demo' },
      { id: 'b06', type: 'code', language: 'ts', code: 'const a = 1;', filename: 'a.ts' },
      { id: 'b07', type: 'quote', text: 'Quote', cite: 'Someone' },
      { id: 'b08', type: 'callout', tone: 'warning', title: 'Careful', text: 'Mind the gap' },
      { id: 'b09', type: 'button', label: 'Go', href: '/contact', variant: 'ghost' },
      { id: 'b10', type: 'table', headers: ['A', 'B'], rows: [['1', '2']] },
      { id: 'b11', type: 'divider' },
      { id: 'b12', type: 'list', ordered: true, items: ['one', 'two'] }
    ];
    const post = valid({ content: { bn: blocks, en: blocks.slice(0, 3) } });
    assert.deepEqual(problems(post, [], true), []);
    const back = parsePost(JSON.parse(JSON.stringify(stored(post))));
    assert.ok(back);
    assert.deepEqual(JSON.parse(JSON.stringify(back.content)), JSON.parse(JSON.stringify(post.content)));
    assert.equal(unreadBlocks(stored(post), back), 0, 'nothing was lost');
  });
});

describe('blocks that were stored but cannot be read', () => {
  const two = [paragraph('a'), paragraph('b')];
  test('counts what the reader dropped, so the editor can warn before a save deletes them', () => {
    const raw = { content: { bn: [...two, { id: 'x', type: 'paragraph', text: 'y'.repeat(20_000) }], en: [{ nonsense: true }] } };
    assert.equal(unreadBlocks(raw, { content: { bn: two, en: [] } }), 2);
  });
  test('nothing dropped, or an unreadable document, is zero', () => {
    assert.equal(unreadBlocks({ content: { bn: two, en: [] } }, { content: { bn: two, en: [] } }), 0);
    for (const raw of [null, undefined, 'text', 42, {}, { content: null }, { content: { bn: 'not a list' } }]) assert.equal(unreadBlocks(raw, { content: { bn: [], en: [] } }), 0);
  });
});

describe('the save gate: one save at a time, and typing is never overwritten', () => {
  test('a second save cannot start while one is running; it can once the first has finished', () => {
    const gate = createSaveGate();
    const first = gate.begin();
    assert.ok(first);
    assert.equal(gate.busy, true);
    assert.equal(gate.begin(), null, 'a double click or an autosave on top of a click');
    gate.end(first);
    assert.equal(gate.busy, false);
    assert.ok(gate.begin());
  });

  test('only the holder of the current ticket can release the gate', () => {
    const gate = createSaveGate();
    const old = gate.begin()!;
    gate.end(old);
    const current = gate.begin()!;
    gate.end(old); // a late, stale release
    assert.equal(gate.busy, true, 'the newer save is still protected');
    gate.end(current);
    assert.equal(gate.busy, false);
  });

  test('edits made during a save are detected, so the saved copy does not replace them', () => {
    const gate = createSaveGate();
    const ticket = gate.begin()!;
    assert.equal(gate.untouched(ticket), true, 'nothing typed: the screen equals what was saved');
    gate.edited();
    assert.equal(gate.untouched(ticket), false, 'something was typed while saving');
    gate.end(ticket);
    const next = gate.begin()!;
    assert.equal(gate.untouched(next), true, 'a new save starts from the current text');
  });

  test('after a failed save the autosave waits until something is typed', () => {
    const gate = createSaveGate();
    assert.equal(gate.retryable(), true);
    const ticket = gate.begin()!;
    gate.failed(ticket);
    gate.end(ticket);
    assert.equal(gate.retryable(), false, 'same text, same failure: do not try again every few seconds');
    gate.edited();
    assert.equal(gate.retryable(), true, 'new text: try again');
  });

  test('two saves started at the same moment create exactly one post', async () => {
    const gate = createSaveGate();
    const created: string[] = [];
    const saveNewPost = async (slug: string): Promise<void> => {
      const ticket = gate.begin();
      if (!ticket) return;
      try {
        await new Promise((resolve) => setTimeout(resolve, 5)); // the address check and the write take time
        created.push(slug);
      } finally {
        gate.end(ticket);
      }
    };
    await Promise.all([saveNewPost('hello'), saveNewPost('hello'), saveNewPost('hello')]);
    assert.deepEqual(created, ['hello']);
  });
});
