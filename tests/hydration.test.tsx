/**
 * Hydration: the HTML the server sends and the first render in the browser must be identical, or React reports a mismatch.
 * These tests render on the server while pretending to be different machines and browsers, and require identical output.
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from 'react-dom/server';
import { PostCard } from '@/components/blog/PostCard';
import { ShareBar } from '@/components/blog/ShareBar';
import { LocaleProvider } from '@/components/layout/LocaleProvider';
import { getMessages } from '@/i18n';
import { currentYear, formatDate } from '@/lib/utils/dates';
import { shareTargets } from '@/lib/utils/share';
import type { Locale, PostSummary } from '@/types';

const ZONES = ['UTC', 'Asia/Dhaka', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'];
const originalZone = process.env.TZ;
afterEach(() => {
  if (originalZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalZone;
});
/** Runs `render` as if the machine were set to each time zone, and returns what each one produced. */
const inEveryZone = <T,>(render: () => T): T[] =>
  ZONES.map((zone) => {
    process.env.TZ = zone;
    return render();
  });

describe('ShareBar: the server markup never depends on what the browser can do', () => {
  const share = (locale: Locale = 'en') =>
    renderToString(
      <LocaleProvider locale={locale} messages={getMessages(locale)}>
        <ShareBar url="https://example.com/en/blog/hello" title={'Hello & <World>'} />
      </LocaleProvider>
    );
  const nav = globalThis.navigator as unknown as Record<string, unknown>;

  afterEach(() => {
    delete nav.share;
  });

  test('identical output whether or not navigator.share exists', () => {
    delete nav.share;
    const without = share();
    Object.defineProperty(nav, 'share', { value: async () => undefined, configurable: true, writable: true });
    const withShare = share();
    assert.equal(withShare, without, 'a browser with native sharing must not change the first render — that was the hydration error');
  });

  test('the native-share button is added only after hydration, never in the server HTML', () => {
    Object.defineProperty(nav, 'share', { value: async () => undefined, configurable: true, writable: true });
    const html = share();
    const buttons = [...html.matchAll(/<button\b[^>]*>/g)].length;
    assert.equal(buttons, 1, 'only "copy link" is a button in the server HTML');
  });

  test('every social target and copy-link are always there, and links to other sites open safely', () => {
    const html = share();
    for (const name of ['X', 'Facebook', 'LinkedIn', 'WhatsApp', 'Telegram']) assert.ok(html.includes(`>${name}<`), name);
    assert.ok(html.includes(getMessages('en').blog.copyLink));
    const anchors = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
    assert.equal(anchors.length, 5);
    for (const a of anchors) assert.ok(a.includes('target="_blank"') && a.includes('rel="noopener noreferrer"'), a);
  });

  test('works in both languages with the same structure', () => {
    const strip = (s: string) => s.replace(/>[^<]*</g, '><');
    const bn = share('bn');
    assert.equal(strip(bn), strip(share('en')), 'same elements, only the words differ');
    assert.ok(bn.includes(getMessages('bn').blog.share));
  });

  test('the share links carry a properly encoded URL and title', () => {
    const targets = shareTargets('https://example.com/en/blog/hello?x=1&y=2', 'Hello & <World>');
    assert.deepEqual(targets.map((t) => t.name), ['X', 'Facebook', 'LinkedIn', 'WhatsApp', 'Telegram']);
    for (const t of targets) {
      assert.ok(t.href.startsWith('https://'), t.href);
      assert.ok(!t.href.includes('<') && !t.href.includes(' '), 'nothing unencoded: ' + t.href);
      assert.ok(t.href.includes(encodeURIComponent('https://example.com/en/blog/hello?x=1&y=2')));
    }
  });
});

describe('dates: the same text on the server and in every visitor’s browser', () => {
  const lateEvening = '2026-11-01T20:00:00Z'; // already 2 November in Dhaka, still 1 November in Los Angeles

  for (const locale of ['en', 'bn'] as Locale[]) {
    test(`${locale}: formatDate does not depend on the machine's time zone`, () => {
      const results = inEveryZone(() => formatDate(lateEvening, locale));
      assert.equal(new Set(results).size, 1, JSON.stringify(results));
      assert.ok(results[0].length > 0);
    });
  }

  test('the day shown is the owner’s day (Dhaka), so a late-evening post is not dated a day early', () => {
    assert.ok(formatDate(lateEvening, 'en').startsWith('2 November'), formatDate(lateEvening, 'en'));
    assert.ok(formatDate(lateEvening, 'en', { dateStyle: 'medium' }).includes('2 Nov'));
  });

  test('a caller can still choose a zone, and bad input is an empty string, never a crash', () => {
    assert.ok(formatDate(lateEvening, 'en', { dateStyle: 'long', timeZone: 'America/Los_Angeles' }).startsWith('1 November'));
    assert.equal(formatDate('not a date', 'en'), '');
    assert.equal(formatDate(null, 'bn'), '');
  });

  test('a blog card (rendered on the server AND again in the browser by the blog explorer) is identical in every zone', () => {
    const post: PostSummary = {
      id: 'p', slug: 'hello', status: 'published', schemaVersion: 1, title: { bn: 'হ্যালো', en: 'Hello' }, excerpt: { bn: 'সারাংশ', en: 'Excerpt' },
      categoryId: null, tagIds: [], featured: false, publishedAt: lateEvening, createdAt: '', updatedAt: '', authorId: '',
      seo: { metaTitle: { bn: '', en: '' }, metaDescription: { bn: '', en: '' }, noindex: false }, readingMinutes: { bn: 1, en: 3 }, views: 0
    };
    for (const locale of ['en', 'bn'] as Locale[]) {
      const cards = inEveryZone(() => renderToString(<PostCard post={post} locale={locale} messages={getMessages(locale)} />));
      assert.equal(new Set(cards).size, 1, `${locale}: the card changed with the time zone`);
    }
  });

  test('the copyright year follows the owner’s calendar, not the machine’s', () => {
    const newYearsEveUtc = new Date('2026-12-31T19:00:00Z'); // 1 January 2027, 01:00 in Dhaka
    assert.equal(inEveryZone(() => currentYear(newYearsEveUtc)).every((y) => y === 2027), true);
    assert.equal(currentYear(new Date('2026-12-31T17:59:59Z')), 2026);
  });
});
