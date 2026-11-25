import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, isValidSlug, uniqueSlug } from '@/lib/utils/slug';
import { parseInline, safeHref, stripInline, type InlineNode } from '@/lib/utils/inline';
import { buildToc, createBlock, isBlockEmpty, moveItem, readingMinutes, blocksToPlainText } from '@/lib/utils/blocks';
import { resolveVideo } from '@/lib/utils/embed';
import { rank, score } from '@/lib/utils/search';
import { detectLocale, localizePath, splitLocale, swapLocale } from '@/i18n/locales';
import { BLOCK_TYPES, type Block } from '@/types';

describe('slug', () => {
  test('slugify', () => {
    assert.equal(slugify('Hello, World!'), 'hello-world');
    assert.equal(slugify('Café Müller & Sons'), 'cafe-muller-and-sons');
    assert.equal(slugify('  --Quran   Bangla--  '), 'quran-bangla');
    assert.equal(slugify('কুরআন বাংলা', 'post'), 'post');
    assert.equal(slugify('a'.repeat(200)).length, 80);
  });
  test('isValidSlug / uniqueSlug', () => {
    assert.ok(isValidSlug('quran-bangla'));
    for (const bad of ['', 'Quran', 'a--b', '-a', 'a-', 'a b', 'a_b']) assert.equal(isValidSlug(bad), false, bad);
    assert.equal(uniqueSlug('x', []), 'x');
    assert.equal(uniqueSlug('x', ['x', 'x-2']), 'x-3');
  });
});

const flat = (n: InlineNode[]): string => JSON.stringify(n);
describe('inline markup', () => {
  test('bold, italic, code, link, nesting', () => {
    assert.deepEqual(parseInline('a **b** c'), [{ k: 'text', v: 'a ' }, { k: 'strong', c: [{ k: 'text', v: 'b' }] }, { k: 'text', v: ' c' }]);
    assert.deepEqual(parseInline('*x*'), [{ k: 'em', c: [{ k: 'text', v: 'x' }] }]);
    assert.deepEqual(parseInline('`a*b*`'), [{ k: 'code', v: 'a*b*' }]);
    assert.deepEqual(parseInline('[site](https://a.bd/x)'), [{ k: 'link', href: 'https://a.bd/x', c: [{ k: 'text', v: 'site' }] }]);
    assert.equal(stripInline('**a *b* c**'), 'a b c');
  });
  test('unbalanced markers stay literal', () => {
    assert.equal(stripInline('2 * 3 = 6'), '2 * 3 = 6');
    assert.equal(stripInline('**open'), '**open');
    assert.equal(stripInline('`open'), '`open');
  });
  test('bold + italic together', () => assert.deepEqual(parseInline('***x***'), [{ k: 'strong', c: [{ k: 'em', c: [{ k: 'text', v: 'x' }] }] }]));
  test('escapes', () => assert.equal(stripInline('\\*not italic\\*'), '*not italic*'));
  test('unsafe links never become links', () => {
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,hi', 'vbscript:x', '//evil.com', 'java\nscript:alert(1)', 'ftp://x.y'])
      assert.equal(safeHref(bad), null, bad);
    assert.ok(!flat(parseInline('[x](javascript:alert(1))')).includes('"k":"link"'));
  });
  test('allowed links', () => {
    for (const ok of ['https://a.b', 'http://a.b/c?d=1', 'mailto:a@b.co', 'tel:+8801700000000', '/projects', '#top'])
      assert.equal(safeHref(ok), ok, ok);
  });
  test('html is just text', () => {
    const nodes = parseInline('<img src=x onerror=alert(1)> **b**');
    assert.equal(nodes[0]?.k, 'text');
    assert.ok(stripInline('<script>alert(1)</script>').startsWith('<script>'));
  });
  test('bangla text is untouched', () => assert.equal(stripInline('**কুরআন** বাংলা'), 'কুরআন বাংলা'));
  test('depth is bounded', () => {
    const deep = '**'.repeat(1).concat('*a*'.repeat(50)).concat('**');
    assert.doesNotThrow(() => parseInline(deep));
  });
});

describe('blocks', () => {
  test('createBlock covers every block type', () => {
    for (const t of BLOCK_TYPES) {
      const b = createBlock(t);
      assert.equal(b.type, t);
      assert.ok(b.id.length >= 8);
    }
  });
  test('empty detection', () => {
    assert.ok(isBlockEmpty(createBlock('paragraph')));
    assert.ok(isBlockEmpty(createBlock('image')));
    assert.equal(isBlockEmpty(createBlock('divider')), false);
    assert.equal(isBlockEmpty({ ...(createBlock('paragraph') as Block), text: 'hi' } as Block), false);
  });
  test('reading time & plain text', () => {
    const p = { ...createBlock('paragraph'), text: Array(450).fill('word').join(' ') } as Block;
    assert.equal(readingMinutes([p]), 3);
    assert.equal(readingMinutes([]), 1);
    assert.equal(blocksToPlainText([{ ...createBlock('paragraph'), text: 'a **b**' } as Block]), 'a b');
  });
  test('toc uses h2/h3 only', () => {
    const mk = (level: 2 | 3 | 4, text: string) => ({ ...createBlock('heading'), level, text }) as Block;
    const toc = buildToc([mk(2, 'One'), mk(4, 'skip'), mk(3, 'Two **b**'), mk(2, '')]);
    assert.deepEqual(toc.map((t) => [t.level, t.text]), [[2, 'One'], [3, 'Two b']]);
  });
  test('moveItem', () => {
    assert.deepEqual(moveItem([1, 2, 3], 0, 2), [2, 3, 1]);
    assert.deepEqual(moveItem([1, 2, 3], 5, 0), [1, 2, 3]);
  });
});

describe('video embeds', () => {
  test('youtube/vimeo/file', () => {
    assert.deepEqual(resolveVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), { kind: 'embed', provider: 'youtube', src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' });
    assert.equal(resolveVideo('https://youtu.be/dQw4w9WgXcQ')?.kind, 'embed');
    assert.deepEqual(resolveVideo('https://vimeo.com/123456789'), { kind: 'embed', provider: 'vimeo', src: 'https://player.vimeo.com/video/123456789' });
    assert.equal(resolveVideo('https://cdn.example.com/a.mp4')?.kind, 'file');
  });
  test('rejects anything else', () => {
    for (const bad of ['http://youtube.com/watch?v=dQw4w9WgXcQ', 'javascript:alert(1)', 'https://evil.com/watch?v=abc', 'https://youtube.com/watch?v=<script>', 'nope'])
      assert.equal(resolveVideo(bad), null, bad);
  });
});

describe('search', () => {
  const items = [
    { t: 'Quran Bangla', s: 'Islamic / Educational Platform' },
    { t: 'কুরআন বাংলা', s: 'ইসলামিক' },
    { t: 'BuyZen Shop', s: 'E-commerce' }
  ];
  const f = (i: (typeof items)[number]) => ({ title: i.t, subtitle: i.s });
  test('ranking', () => {
    assert.deepEqual(rank('quran', items, f).map((i) => i.t), ['Quran Bangla']);
    assert.deepEqual(rank('কুরআন', items, f).map((i) => i.t), ['কুরআন বাংলা']);
    assert.deepEqual(rank('e-comm', items, f).map((i) => i.t), ['BuyZen Shop']);
    assert.deepEqual(rank('zzz', items, f), []);
    assert.equal(score('', { title: 'x' }), 0);
    assert.ok(score('quran', { title: 'Quran' }) > score('quran', { title: 'x', subtitle: 'quran' }));
  });
});

describe('locale helpers', () => {
  test('paths', () => {
    assert.equal(localizePath('en', '/'), '/en');
    assert.equal(localizePath('bn', 'projects'), '/bn/projects');
    assert.deepEqual(splitLocale('/en/projects/x'), { locale: 'en', rest: '/projects/x' });
    assert.deepEqual(splitLocale('/en'), { locale: 'en', rest: '/' });
    assert.deepEqual(splitLocale('/projects'), { locale: null, rest: '/projects' });
    assert.equal(swapLocale('/bn/blog/a', 'en'), '/en/blog/a');
    assert.equal(swapLocale('/en', 'bn'), '/bn');
  });
  test('detectLocale', () => {
    assert.equal(detectLocale('bn-BD,bn;q=0.9,en;q=0.8'), 'bn');
    assert.equal(detectLocale('en-US,en;q=0.9'), 'en');
    assert.equal(detectLocale('fr-FR,fr;q=0.9,bn;q=0.4'), 'bn');
    assert.equal(detectLocale('fr-FR'), 'bn');
    assert.equal(detectLocale(null), 'bn');
  });
});
