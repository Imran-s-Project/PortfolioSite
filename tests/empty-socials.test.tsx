/**
 * The owner can remove every social link in Admin → Settings. Nothing empty may be left behind on the public pages.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { Hero } from '@/components/hero/Hero';
import { LocaleProvider } from '@/components/layout/LocaleProvider';
import { ContactSection } from '@/components/sections/ContactSection';
import { DEFAULT_SETTINGS } from '@/data/site-data';
import { getMessages } from '@/i18n';
import type { Locale, SiteSettings } from '@/types';

const page = (locale: Locale, settings: SiteSettings) => {
  const m = getMessages(locale);
  return {
    hero: renderToStaticMarkup(<LocaleProvider locale={locale} messages={m}><Hero locale={locale} messages={m} settings={settings} /></LocaleProvider>),
    contact: renderToStaticMarkup(<LocaleProvider locale={locale} messages={m}><ContactSection locale={locale} messages={m} settings={settings} /></LocaleProvider>)
  };
};

describe('no social links', () => {
  for (const locale of ['bn', 'en'] as Locale[]) {
    test(`${locale}: no empty navigation or list is left on the home page`, () => {
      const { hero, contact } = page(locale, { ...DEFAULT_SETTINGS, socials: [] });
      assert.ok(!hero.includes('hero__social') && !hero.includes(`aria-label="${getMessages(locale).hero.social}"`), 'hero');
      assert.ok(!contact.includes('contact__social'), 'contact');
      assert.ok(hero.includes('hero__cta') && contact.includes('contact__email'), 'the rest of both sections is still there');
    });

    test(`${locale}: with links they are all shown, and the e-mail entry is not repeated in the contact section`, () => {
      const { hero, contact } = page(locale, DEFAULT_SETTINGS);
      const withoutMail = DEFAULT_SETTINGS.socials.filter((s) => s.icon !== 'mail');
      assert.equal((hero.match(/class="social-link"/g) ?? []).length, DEFAULT_SETTINGS.socials.length);
      assert.equal((contact.match(/<li>/g) ?? []).length, withoutMail.length);
    });
  }

  test('a link that is not a web address opens in the same tab and does not claim to open a new one', () => {
    const phone = { id: 'call', name: 'Phone', handle: '', url: 'tel:+8801000000000', icon: 'github' };
    const { contact } = page('en', { ...DEFAULT_SETTINGS, socials: [phone] });
    const anchor = /<a\b[^>]*href="tel:\+8801000000000"[^>]*>/.exec(contact)?.[0] ?? '';
    assert.ok(anchor && !anchor.includes('target=') && !anchor.includes('rel='), anchor);
    assert.ok(!contact.includes(getMessages('en').a11y.external));
  });
});
