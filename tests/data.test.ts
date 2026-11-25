import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEED_PROJECTS } from '@/data/seed-projects';
import { SCENES } from '@/data/scenes';
import { SOCIAL_LINKS, ICON_PATHS, COPY, PROJECT_FILTERS, SKILL_GROUPS } from '@/data/site-data';
import { isValidSlug } from '@/lib/utils/slug';

// These are the exact project URLs from the legacy site's js/data/projects.js (owner-supplied source of truth).
const LEGACY_URLS = [
  'https://rupshajf.vercel.app', 'https://quranbangla.vercel.app', 'https://tvcedit.vercel.app', 'https://tvsites.vercel.app',
  'https://tvcourse.vercel.app', 'https://tvexam.vercel.app', 'https://buyzenshop.vercel.app',
  'https://imran-s-project.github.io/MazeFlow/', 'https://tvqrcode.vercel.app', 'https://exammasters.vercel.app/'
];

describe('migrated data', () => {
  test('all ten projects survive, in the original order, with their original URLs', () => {
    assert.equal(SEED_PROJECTS.length, 10);
    assert.deepEqual(SEED_PROJECTS.map((p) => p.url), LEGACY_URLS);
    assert.deepEqual(SEED_PROJECTS.map((p) => p.name.en), [
      'Rupsha Jonokollan Foundation', 'Quran Bangla', 'Tech Verse Code Editor', 'Tech Verse Site', 'Tech Verse Course',
      'Tech Verse Exam', 'BuyZen Shop', 'MazeFlow', 'Teach QR Code Generate', 'Exam Paper Master'
    ]);
  });
  test('slugs are valid and unique; every text exists in both languages', () => {
    const slugs = SEED_PROJECTS.map((p) => p.slug);
    assert.equal(new Set(slugs).size, 10);
    for (const p of SEED_PROJECTS) {
      assert.ok(isValidSlug(p.slug), p.slug);
      for (const v of [p.name, p.category, p.summary]) assert.ok(v.bn && v.en, `${p.slug} bilingual`);
      assert.deepEqual(p.technologies, [], 'no invented technologies');
      assert.deepEqual(p.screenshots, [], 'no invented screenshots');
      assert.equal(p.name.bn, p.name.bn.trim());
    }
  });
  test('social links keep every legacy URL and have icons', () => {
    assert.equal(SOCIAL_LINKS.length, 7);
    assert.ok(SOCIAL_LINKS.some((s) => s.url === 'https://github.com/imran-s-project'));
    assert.ok(SOCIAL_LINKS.some((s) => s.url === 'mailto:project.developer.tech@gmail.com'));
    for (const s of SOCIAL_LINKS) assert.ok((ICON_PATHS[s.icon] ?? []).length > 0, s.icon);
  });
  test('six scenes, with a poster and video in the manifest for each', () => {
    assert.deepEqual(SCENES.map((s) => s.id), ['hero', 'valley', 'forest', 'river', 'lake', 'blue-hour']);
    const manifest = JSON.parse(readFileSync(new URL('../public/nature/manifest.json', import.meta.url), 'utf8')) as {
      scenes: Record<string, { posters: Record<string, string>; video: Record<string, { webm: string; mp4: string }> }>;
    };
    for (const s of SCENES) {
      const m = manifest.scenes[s.id];
      assert.ok(m, s.id);
      for (const rel of [...Object.values(m.posters), ...Object.values(m.video).flatMap((v) => [v.webm, v.mp4])])
        assert.ok(readFileSync(new URL(`../public/nature/${rel}`, import.meta.url)).length > 1000, rel);
    }
  });
  test('owner copy is intact and the CV file exists', () => {
    assert.equal(COPY.hero.name.en, 'Imran Ahmed');
    assert.equal(COPY.about.paragraphs.length, 3);
    assert.equal(COPY.about.skills.length, 10);
    assert.ok(readFileSync(new URL('../public/assets/imran_ahmed_cv.pdf', import.meta.url)).length > 10_000);
    assert.equal(PROJECT_FILTERS.length, 6);
    assert.equal(SKILL_GROUPS.flatMap((g) => g.items).sort().join(), '0,1,2,3,4,5,6,7,8,9');
  });
  test('inline markup replaced the legacy <strong> tags', () => {
    assert.ok(!JSON.stringify(COPY).includes('<strong>'));
    assert.ok(COPY.about.paragraphs[0]?.en.includes('**'));
  });
});
