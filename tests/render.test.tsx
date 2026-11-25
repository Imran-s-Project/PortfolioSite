import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { BlockRenderer } from '@/components/blog/BlockRenderer';
import { Toc } from '@/components/blog/Toc';
import { PostCard } from '@/components/blog/PostCard';
import { CaseStudy } from '@/components/projects/CaseStudy';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { Hero } from '@/components/hero/Hero';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { AboutSection } from '@/components/sections/AboutSection';
import { LocaleProvider } from '@/components/layout/LocaleProvider';
import { ContactSection } from '@/components/sections/ContactSection';
import { ThemeScript } from '@/components/theme/ThemeScript';
import { getMessages } from '@/i18n';
import { SEED_PROJECTS } from '@/data/seed-projects';
import { DEFAULT_SETTINGS } from '@/data/site-data';
import { parseBlocks } from '@/lib/validation/schemas';
import { buildToc } from '@/lib/utils/blocks';
import type { Locale, PostSummary } from '@/types';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const hostile = [
  { id: 'a1', type: 'heading', level: 2, text: 'Hello <img src=x onerror=alert(1)> **world**' },
  { id: 'a2', type: 'paragraph', text: 'See [docs](https://example.com) and [bad](javascript:alert(1)) and <script>alert(1)</script>' },
  { id: 'a3', type: 'button', label: 'Go', href: 'javascript:alert(1)', variant: 'primary' },
  { id: 'a4', type: 'button', label: 'Site', href: 'https://example.com', variant: 'ghost' },
  { id: 'a5', type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  { id: 'a6', type: 'video', url: 'https://evil.example/x.html' },
  { id: 'a7', type: 'code', language: 'html', code: '<script>alert(1)</script>', filename: 'x.html' },
  { id: 'a8', type: 'table', headers: ['A', 'B'], rows: [['1', '**2**']] },
  { id: 'a9', type: 'list', ordered: true, items: ['one', 'two', ''] },
  { id: 'b1', type: 'callout', tone: 'warning', title: 'Careful', text: 'text' },
  { id: 'b2', type: 'quote', text: 'q', cite: 'someone' },
  { id: 'b3', type: 'divider' }
];

describe('block renderer', () => {
  const out = html(<BlockRenderer blocks={parseBlocks(hostile)} />);
  test('renders every supported block', () => {
    for (const needle of ['<h2', '<strong>world</strong>', 'href="https://example.com"', 'youtube-nocookie.com/embed/dQw4w9WgXcQ', '<table', '<ol>', 'data-tone="warning"', '<blockquote>', '<hr/>', 'x.html']) assert.ok(out.includes(needle), needle);
  });
  test('stored content can never inject markup, script or unsafe links', () => {
    assert.ok(!out.includes('<script'), 'no script element');
    assert.ok(!out.includes('<img src=x'), 'no raw img from text');
    assert.ok(!/href="\s*javascript:/i.test(out), 'no javascript: link survives (the text may remain, inert)');
    assert.ok(out.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'script text is escaped');
    assert.ok(!out.includes('evil.example'), 'unsupported video host is not embedded');
    assert.equal((out.match(/<li>/g) ?? []).length, 2, 'empty list item dropped');
  });
  test('external links open safely', () => assert.ok(/<a [^>]*href="https:\/\/example.com"[^>]*rel="noopener noreferrer"/.test(out) || out.includes('rel="noopener noreferrer"')));
  test('table of contents from headings', () => {
    const toc = html(<Toc items={buildToc(parseBlocks([{ id: 'h1', type: 'heading', level: 2, text: 'One' }, { id: 'h2', type: 'heading', level: 3, text: 'Two' }]))} title="On this page" />);
    assert.ok(toc.includes('href="#h-h1"') && toc.includes('data-level="3"'));
  });
});

describe('page building blocks, both languages', () => {
  for (const locale of ['bn', 'en'] as Locale[]) {
    const m = getMessages(locale);
    test(`${locale}: all ten project cards and case studies render`, () => {
      for (const [i, p] of SEED_PROJECTS.entries()) {
        const card = html(<ProjectCard project={p} locale={locale} messages={m} index={i} />);
        assert.ok(card.includes(`/${locale}/projects/${p.slug}`) && card.includes(p.url) && card.includes('rel="noopener noreferrer"'), p.slug);
        const cs = html(<CaseStudy project={p} locale={locale} messages={m} />);
        assert.ok(cs.includes(m.projects.noExtra), 'no invented detail: shows the honest note');
        assert.ok(!cs.includes('id="cs-objectives"') && !cs.includes('id="cs-features"') && !cs.includes('id="cs-gallery"'), 'sections without data are not rendered');
      }
    });
    test(`${locale}: hero, about, contact and footer render with the owner's copy`, () => {
      const hero = html(<LocaleProvider locale={locale} messages={m}><Hero locale={locale} messages={m} settings={DEFAULT_SETTINGS} /></LocaleProvider>);
      assert.ok(hero.includes('Imran Ahmed') === (locale === 'en') || hero.includes('ইমরান'), 'name');
      assert.ok(hero.includes('github.com/imran-s-project'));
      assert.ok(!hero.includes('hero__avail'), 'availability stays hidden until the owner chooses it');
      const about = html(<AboutSection locale={locale} messages={m} />);
      assert.ok(about.includes('<strong>') && !about.includes('**'));
      const contact = html(<LocaleProvider locale={locale} messages={m}><ContactSection locale={locale} messages={m} settings={DEFAULT_SETTINGS} /></LocaleProvider>);
      assert.ok(contact.includes('mailto:project.developer.tech@gmail.com') && contact.includes('/assets/imran_ahmed_cv.pdf') && contact.includes('name="website"'));
      const footer = html(<SiteFooter locale={locale} messages={m} settings={DEFAULT_SETTINGS} />);
      assert.ok(footer.includes('data-scene="blue-hour"') && footer.includes('♥'));
    });
  }
  test('blog card falls back to the other language and shows reading time', () => {
    const post: PostSummary = { id: 'p', slug: 'hello', status: 'published', schemaVersion: 1, title: { bn: '', en: 'Hello' }, excerpt: { bn: '', en: 'Excerpt' }, categoryId: null, tagIds: [], featured: false, publishedAt: '2026-11-01T00:00:00.000Z', createdAt: '', updatedAt: '', authorId: '', seo: { metaTitle: { bn: '', en: '' }, metaDescription: { bn: '', en: '' }, noindex: false }, readingMinutes: { bn: 1, en: 4 }, views: 0 };
    const card = html(<PostCard post={post} locale="bn" messages={getMessages('bn')} />);
    assert.ok(card.includes('Hello') && card.includes('/bn/blog/hello') && card.includes('<time'));
  });
  test('theme script embeds only the known themes and a JSON-encoded default', () => {
    const s = html(<ThemeScript defaultTheme="ember" />);
    assert.ok(s.includes('"ember"') && s.includes('imran-portfolio-theme') && s.includes('data-intro'));
  });
});
