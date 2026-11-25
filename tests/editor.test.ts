import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyFormat } from '@/features/editor/format';
import { cleanContent, emptyPost, fromLocalInput, problems, suggestSlug, toLocalInput, unzipLines, zipLines } from '@/features/editor/model';
import { mediaPath, validateImage } from '@/features/admin/media-utils';
import { parseInline, stripInline } from '@/lib/utils/inline';
import { createBlock } from '@/lib/utils/blocks';
import type { Block } from '@/types';

describe('inline formatting toolbar', () => {
  test('wraps a selection', () => {
    assert.deepEqual(applyFormat('hello world', 6, 11, 'bold'), { value: 'hello **world**', start: 8, end: 13 });
    assert.deepEqual(applyFormat('hello world', 0, 5, 'italic'), { value: '*hello* world', start: 1, end: 6 });
    assert.equal(applyFormat('use x here', 4, 5, 'code').value, 'use `x` here');
  });
  test('toggles off when already wrapped', () => {
    const on = applyFormat('hello world', 6, 11, 'bold');
    assert.equal(applyFormat(on.value, on.start, on.end, 'bold').value, 'hello world');
  });
  test('empty selection inserts a selected placeholder', () => {
    const r = applyFormat('ab', 1, 1, 'bold');
    assert.equal(r.value, 'a**text**b');
    assert.equal(r.value.slice(r.start, r.end), 'text');
  });
  test('links', () => {
    const r = applyFormat('see docs now', 4, 8, 'link', 'https://a.bd');
    assert.equal(r.value, 'see [docs](https://a.bd) now');
    assert.deepEqual(parseInline(r.value)[1], { k: 'link', href: 'https://a.bd', c: [{ k: 'text', v: 'docs' }] });
  });
  test('italic inside bold is not mistaken for unwrapping bold', () => {
    const r = applyFormat('**word**', 2, 6, 'italic');
    assert.equal(stripInline(r.value), 'word');
    assert.ok(r.value.includes('***word***') || r.value === '***word***');
  });
  test('result always parses back to the same plain text', () => {
    for (const kind of ['bold', 'italic', 'code'] as const) assert.equal(stripInline(applyFormat('plain text here', 6, 10, kind).value), 'plain text here');
  });
});

describe('editor model', () => {
  test('slug suggestion', () => {
    assert.equal(suggestSlug({ bn: '', en: 'Building a PWA!' }), 'building-a-pwa');
    assert.equal(suggestSlug({ bn: 'পিডব্লিউএ', en: '' }), 'post');
    assert.equal(suggestSlug({ bn: '', en: '' }), '');
  });
  test('validation before save / publish', () => {
    const s = emptyPost();
    assert.deepEqual(problems(s, [], false), ['title', 'slug']);
    const ok = { ...s, title: { bn: '', en: 'Hi' }, slug: 'hi' };
    assert.deepEqual(problems(ok, [], false), []);
    assert.deepEqual(problems(ok, ['hi'], false), ['slug-taken']);
    assert.deepEqual(problems(ok, [], true), ['content']);
    const withContent = { ...ok, content: { bn: [], en: [{ ...createBlock('paragraph'), text: 'x' } as Block] } };
    assert.deepEqual(problems(withContent, [], true), []);
    assert.deepEqual(problems({ ...withContent, coverImage: { url: 'https://x/a.png', alt: { bn: '', en: '' } } }, [], true), ['cover-alt']);
  });
  test('empty blocks are dropped from live content', () => {
    const full = { ...createBlock('paragraph'), text: 'x' } as Block;
    assert.deepEqual(cleanContent({ bn: [createBlock('paragraph'), full], en: [] }), { bn: [full], en: [] });
  });
  test('date input round trip', () => {
    const iso = '2026-11-16T09:30:00.000Z';
    assert.equal(fromLocalInput(toLocalInput(iso)), iso);
    assert.equal(toLocalInput(null), '');
    assert.equal(fromLocalInput(''), null);
  });
  test('paired lines', () => {
    assert.deepEqual(zipLines('এক\nদুই', 'one'), [{ bn: 'এক', en: 'one' }, { bn: 'দুই', en: '' }]);
    assert.deepEqual(unzipLines(zipLines('a\nb', 'x\ny')), { bn: 'a\nb', en: 'x\ny' });
    assert.deepEqual(zipLines('', ''), []);
  });
});

describe('uploads', () => {
  test('validation mirrors the storage rules', () => {
    assert.equal(validateImage({ type: 'image/png', size: 1000 }), null);
    assert.equal(validateImage({ type: 'image/svg+xml', size: 1000 }), 'type');
    assert.equal(validateImage({ type: 'text/html', size: 10 }), 'type');
    assert.equal(validateImage({ type: 'image/png', size: 5 * 1024 * 1024 }), 'size');
    assert.equal(validateImage({ type: 'image/png', size: 0 }), 'empty');
  });
  test('storage path has exactly the 4-segment shape the rules require', () => {
    const p = mediaPath({ name: 'My Photo (1).JPG', type: 'image/jpeg' }, new Date(Date.UTC(2026, 10, 16)));
    assert.match(p, /^media\/2026\/11\/[a-z0-9]+-my-photo-1\.jpg$/);
    assert.equal(p.split('/').length, 4);
    assert.match(mediaPath({ name: 'ছবি.png', type: 'image/png' }), /-image\.png$/);
  });
});
