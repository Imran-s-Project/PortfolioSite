import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '@/i18n/messages/en';
import { bn } from '@/i18n/messages/bn';
import { fmt, getMessages } from '@/i18n';

const keys = (o: unknown, p = ''): string[] =>
  Array.isArray(o) ? [`${p}[${o.length}]`, ...o.flatMap((v, i) => keys(v, `${p}[${i}]`))]
  : o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k))
  : [p];
const leaves = (o: unknown): string[] => (typeof o === 'string' ? [o] : Array.isArray(o) ? o.flatMap(leaves) : o && typeof o === 'object' ? Object.values(o).flatMap(leaves) : []);
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();

describe('i18n', () => {
  test('Bangla and English have identical keys and list lengths', () => assert.deepEqual(keys(bn), keys(en)));
  test('no empty strings', () => {
    for (const s of [...leaves(en), ...leaves(bn)]) assert.ok(s.trim().length > 0);
  });
  test('placeholders match between languages', () => {
    const e = leaves(en), b = leaves(bn);
    assert.equal(e.length, b.length);
    e.forEach((s, i) => assert.equal(placeholders(b[i] as string), placeholders(s), s));
  });
  test('Bangla strings are actually Bangla', () => {
    for (const k of ['nav.projects', 'hero.available', 'contact.send', 'blog.empty']) {
      const v = k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], bn) as string;
      assert.match(v, /[\u0980-\u09FF]/, k);
    }
  });
  test('fmt and getMessages', () => {
    assert.equal(fmt('{n} min read', { n: 3 }), '3 min read');
    assert.equal(fmt('{x} {y}', { x: 'a' }), 'a {y}');
    assert.equal(getMessages('en'), en);
  });
});
