import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { DEFAULT_SETTINGS } from '@/data/site-data';
import { getMessages } from '@/i18n';
import { localizePath } from '@/i18n/locales';
import { currentYear } from '@/lib/utils/dates';
import type { Locale, SiteSettings } from '@/types';

const render = (locale: Locale, settings: SiteSettings = DEFAULT_SETTINGS) => renderToStaticMarkup(<SiteFooter locale={locale} messages={getMessages(locale)} settings={settings} />);
const anchors = (html: string) => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ attrs: m[1], inner: m[2], text: m[2].replace(/<[^>]*>/g, '').trim() }));
const attr = (attrs: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1];

describe('footer, both languages', () => {
  for (const locale of ['bn', 'en'] as Locale[]) {
    const m = getMessages(locale);
    const html = render(locale);

    test(`${locale}: the three steps are all there — invitation, columns, small print`, () => {
      for (const text of [m.footer.ctaTitle, m.footer.ctaText, m.footer.ctaButton, m.footer.explore, m.footer.resources, m.footer.getInTouch, m.footer.follow, m.footer.top, m.footer.privacy]) assert.ok(html.includes(text), text);
      assert.ok(html.includes('class="footer__cta"') && html.includes('class="footer__grid"') && html.includes('class="footer__bottom"'));
    });

    test(`${locale}: page links go to this language, the invitation goes to the contact form`, () => {
      const links = anchors(html).map((a) => attr(a.attrs, 'href'));
      for (const path of ['/', '/projects', '/blog', '/about', '/privacy']) assert.ok(links.includes(localizePath(locale, path)), path);
      assert.equal(links.filter((h) => h === `${localizePath(locale, '/')}#contact`).length, 2, 'the invitation button and the "Contact" link');
      assert.ok(links.includes('/sitemap.xml'));
    });

    test(`${locale}: CV download, e-mail, small print`, () => {
      assert.ok(new RegExp(`<a href="${DEFAULT_SETTINGS.resumeUrl}" download`).test(html), 'CV is a download link');
      assert.ok(html.includes(`href="mailto:${DEFAULT_SETTINGS.email}"`));
      assert.ok(html.includes('<wbr/>@gmail.com'), 'a long address may wrap only before the @');
      assert.ok(html.includes(m.footer.copyright.replace('{year}', String(currentYear()))));
      assert.ok(html.includes('data-scene="blue-hour"') && html.includes('♥'));
      assert.ok(html.includes(`aria-label="${m.footer.heart}"`), 'the heart has a name for screen readers');
    });

    test(`${locale}: every social profile is an icon button with a name; links to other sites open safely`, () => {
      const socials = DEFAULT_SETTINGS.socials.filter((s) => s.icon !== 'mail');
      const list = html.slice(html.indexOf('class="footer__social"'), html.indexOf('</ul>', html.indexOf('class="footer__social"')));
      const links = anchors(list);
      assert.equal(links.length, socials.length, 'the e-mail entry is not repeated among the icons');
      for (const [i, link] of links.entries()) {
        assert.ok(link.text.includes(socials[i].name), `visible to screen readers: ${socials[i].name}`);
        assert.equal(attr(link.attrs, 'title'), socials[i].name, 'tooltip');
        assert.ok(link.attrs.includes('target="_blank"') && link.attrs.includes('rel="noopener noreferrer"'));
        assert.ok(link.text.includes(m.a11y.external), 'says it opens a new tab');
      }
    });

    test(`${locale}: the structure is accessible — unique ids, labelled lists, only h2 headings, every link has a name`, () => {
      const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((x) => x[1]);
      assert.equal(new Set(ids).size, ids.length, 'ids are unique');
      for (const ref of [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map((x) => x[1])) assert.ok(ids.includes(ref), `aria-labelledby → #${ref} exists`);
      assert.ok(!/<h[1346]\b/.test(html), 'a footer never opens a heading outline of its own');
      for (const a of anchors(html)) assert.ok(a.text.length > 0, `link without a name: ${a.attrs}`);
      assert.equal((html.match(/<nav\b/g) ?? []).length, 2, 'two labelled navigation lists');
    });
  }
});

describe('footer: what the owner controls in Admin', () => {
  test('availability is hidden until chosen; then it uses the owner’s note or the standard wording', () => {
    assert.ok(!render('en').includes('footer__avail'));
    const available = render('en', { ...DEFAULT_SETTINGS, availability: 'available' });
    assert.ok(available.includes('data-state="available"') && available.includes(getMessages('en').hero.available));
    const busy = render('bn', { ...DEFAULT_SETTINGS, availability: 'busy' });
    assert.ok(busy.includes('data-state="busy"') && busy.includes(getMessages('bn').hero.busy));
    const note = render('en', { ...DEFAULT_SETTINGS, availability: 'available', availabilityNote: { bn: 'খোলা', en: 'Taking projects from March' } });
    assert.ok(note.includes('Taking projects from March') && !note.includes(getMessages('en').hero.available));
  });

  test('no socials: no empty "Find me online" block', () => {
    const html = render('en', { ...DEFAULT_SETTINGS, socials: [] });
    assert.ok(!html.includes('footer-follow') && !html.includes('footer__social'));
  });

  test('a profile that is not a web link (a phone number, say) is a plain link, not a new-tab link', () => {
    const html = render('en', { ...DEFAULT_SETTINGS, socials: [{ id: 'call', name: 'Phone', handle: '', url: 'tel:+8801000000000', icon: 'github' }] });
    const [link] = anchors(html.slice(html.indexOf('class="footer__social"')));
    assert.ok(link.attrs.includes('href="tel:+8801000000000"') && !link.attrs.includes('target=') && !link.attrs.includes('rel='));
  });

  test('the e-mail, CV and every address are escaped, not injected', () => {
    const html = render('en', { ...DEFAULT_SETTINGS, email: 'a"><script>alert(1)</script>@x.example', resumeUrl: '/cv.pdf" onclick="alert(1)' });
    assert.ok(!html.includes('<script>alert(1)</script>') && !html.includes('onclick="alert(1)"'));
  });
});
