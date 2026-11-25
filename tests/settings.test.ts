/**
 * Site settings are edited in Admin and read by every public page. One bad value must never switch off the others.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '@/data/site-data';
import { parseSettings } from '@/lib/validation/schemas';

const link = (over: Record<string, unknown> = {}) => ({ id: 'gh', name: 'GitHub', handle: '@me', url: 'https://github.com/me', icon: 'github', ...over });

describe('parseSettings: setting by setting', () => {
  test('maintenance mode still works when some other setting in the document is wrong', () => {
    const s = parseSettings(
      { maintenance: { enabled: true, message: { en: 'Back soon' } }, defaultTheme: 'neon', email: 'not-an-email', resumeUrl: 'javascript:alert(1)', showcaseVideoUrl: 42, availability: 'sometimes' },
      DEFAULT_SETTINGS
    );
    assert.equal(s.maintenance.enabled, true, 'the switch the owner turned on must stay on');
    assert.equal(s.maintenance.message.en, 'Back soon');
    assert.equal(s.defaultTheme, DEFAULT_SETTINGS.defaultTheme);
    assert.equal(s.email, DEFAULT_SETTINGS.email);
    assert.equal(s.resumeUrl, DEFAULT_SETTINGS.resumeUrl);
    assert.equal(s.showcaseVideoUrl, DEFAULT_SETTINGS.showcaseVideoUrl);
    assert.equal(s.availability, DEFAULT_SETTINGS.availability);
  });

  test('a wrong value inside a section only loses that value', () => {
    const s = parseSettings({ maintenance: { enabled: 'yes', message: { en: 'x'.repeat(700) } }, seo: { titleTemplate: 'Mine | %s', noindex: 'no', description: { en: 'Hello' } } }, DEFAULT_SETTINGS);
    assert.equal(s.maintenance.enabled, DEFAULT_SETTINGS.maintenance.enabled);
    assert.equal(s.maintenance.message.en, DEFAULT_SETTINGS.maintenance.message.en);
    assert.equal(s.seo.titleTemplate, 'Mine | %s');
    assert.equal(s.seo.noindex, DEFAULT_SETTINGS.seo.noindex);
    assert.equal(s.seo.description.en, 'Hello');
  });

  test('something that is not a settings document at all keeps the defaults', () => {
    for (const raw of [null, undefined, 'text', 12, [], true]) assert.deepEqual(parseSettings(raw, DEFAULT_SETTINGS), DEFAULT_SETTINGS);
  });

  test('valid settings are all applied', () => {
    const s = parseSettings({ availability: 'busy', defaultTheme: 'arctic', email: 'me@example.com', resumeUrl: 'https://example.com/cv.pdf', socials: [link()] }, DEFAULT_SETTINGS);
    assert.deepEqual([s.availability, s.defaultTheme, s.email, s.resumeUrl], ['busy', 'arctic', 'me@example.com', 'https://example.com/cv.pdf']);
    assert.deepEqual(s.socials, [link()]);
  });
});

describe('the CV address', () => {
  test('a file on this site or an https address is kept', () => {
    for (const url of ['/cv.pdf', '/files/My-CV.pdf', 'https://example.com/cv.pdf']) assert.equal(parseSettings({ resumeUrl: url }, DEFAULT_SETTINGS).resumeUrl, url);
  });
  test('anything else is replaced by the default — it goes straight into a download link', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'my cv.pdf', 'cv.pdf', '//evil.example/cv.pdf', '/a b.pdf']) assert.equal(parseSettings({ resumeUrl: url }, DEFAULT_SETTINGS).resumeUrl, DEFAULT_SETTINGS.resumeUrl, url);
  });
});

describe('social links', () => {
  test('never set: the defaults', () => assert.deepEqual(parseSettings({}, DEFAULT_SETTINGS).socials, DEFAULT_SETTINGS.socials));

  test('removed on purpose: an empty list means none, not "bring the defaults back"', () => {
    assert.deepEqual(parseSettings({ socials: [] }, DEFAULT_SETTINGS).socials, []);
  });

  test('a link that is not valid is skipped; the good ones stay', () => {
    const s = parseSettings({ socials: [link(), link({ id: 'bad', url: 'javascript:alert(1)' }), link({ id: 'noname', name: 5 }), link({ id: 'mail', url: 'mailto:me@example.com', icon: 'mail', name: 'Email' })] }, DEFAULT_SETTINGS);
    assert.deepEqual(s.socials.map((x) => x.id), ['gh', 'mail']);
  });

  test('if none of the stored links is valid the defaults are kept, rather than showing no links by accident', () => {
    assert.deepEqual(parseSettings({ socials: [link({ url: 'javascript:alert(1)' }), 'junk', null] }, DEFAULT_SETTINGS).socials, DEFAULT_SETTINGS.socials);
  });

  test('more than twenty is a mistake: the list is ignored, the rest of the settings still apply', () => {
    const many = Array.from({ length: 21 }, (_, i) => link({ id: `l${i}` }));
    const s = parseSettings({ socials: many, availability: 'busy' }, DEFAULT_SETTINGS);
    assert.deepEqual(s.socials, DEFAULT_SETTINGS.socials);
    assert.equal(s.availability, 'busy');
  });
});
