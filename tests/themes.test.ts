import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THEMES } from '@/config/site';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

function themeVars(id: string): Record<string, string> {
  const m = css.match(new RegExp(`:root\\[data-theme='${id}'\\]\\s*\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(m, `theme ${id} is defined`);
  const out: Record<string, string> = {};
  for (const d of (m[1] as string).matchAll(/(--[\w-]+|color-scheme)\s*:\s*([^;]+);/g)) out[d[1] as string] = (d[2] as string).trim();
  return out;
}
const lum = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
};
const ratio = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

const REQUIRED = ['--bg', '--bg-2', '--surface', '--surface-2', '--surface-3', '--glass', '--glass-strong', '--text', '--text-dim', '--text-faint',
  '--accent', '--accent-2', '--accent-ink', '--accent-soft', '--border', '--border-strong', '--ring', '--glow', '--shadow', '--shadow-lg',
  '--gradient', '--gradient-edge', '--veil-rgb', '--veil-boost', '--theme-color', '--heading-font', '--heading-weight', '--heading-tracking',
  '--success', '--warning', '--danger', '--info'];

describe('themes', () => {
  test('config and CSS agree on the five themes', () => {
    assert.deepEqual(THEMES.map((t) => t.id), ['obsidian', 'aurora', 'arctic', 'terminal', 'ember']);
  });
  for (const t of THEMES) {
    describe(t.id, () => {
      const v = themeVars(t.id);
      test('defines every token', () => {
        for (const k of REQUIRED) assert.ok(v[k], `${t.id} is missing ${k}`);
      });
      test('colour-scheme and theme colour match the config', () => {
        assert.equal(v['color-scheme'], t.scheme);
        assert.equal(v['--theme-color']?.toLowerCase(), t.themeColor.toLowerCase());
        assert.equal(v['--bg']?.toLowerCase(), t.swatch[0].toLowerCase());
        assert.equal(v['--accent']?.toLowerCase(), t.swatch[2].toLowerCase());
      });
      test('WCAG AA (4.5:1) for all reading text on page and card surfaces', () => {
        for (const text of ['--text', '--text-dim', '--text-faint']) {
          for (const bg of ['--bg', '--bg-2', '--surface', '--surface-2']) {
            const r = ratio(v[text] as string, v[bg] as string);
            assert.ok(r >= 4.5, `${t.id}: ${text} on ${bg} = ${r.toFixed(2)}`);
          }
        }
      });
      test('accent is readable as text and carries its ink colour', () => {
        for (const bg of ['--bg', '--surface']) assert.ok(ratio(v['--accent'] as string, v[bg] as string) >= 4.5, `${t.id}: accent on ${bg}`);
        assert.ok(ratio(v['--accent-ink'] as string, v['--accent'] as string) >= 4.5, `${t.id}: ink on accent`);
        assert.ok(ratio(v['--accent-ink'] as string, v['--accent-2'] as string) >= 3, `${t.id}: ink on accent-2 (large text)`);
      });
      test('status colours are readable on cards', () => {
        for (const s of ['--success', '--warning', '--danger', '--info']) assert.ok(ratio(v[s] as string, v['--surface'] as string) >= 4.5, `${t.id}: ${s}`);
      });
    });
  }
});
