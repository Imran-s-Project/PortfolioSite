import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { jsonLdString, personLd, breadcrumbLd, blogPostingLd, websiteLd } from '@/lib/seo/jsonld';

describe('structured data', () => {
  test('script-closing sequences can never appear in the output', () => {
    const s = jsonLdString({ headline: '</script><script>alert(1)</script>' });
    assert.ok(!s.includes('</script'));
    assert.deepEqual(JSON.parse(s), { headline: '</script><script>alert(1)</script>' });
  });
  test('person, website, breadcrumbs and blog posting', () => {
    const p = personLd('bn');
    assert.equal(p['@type'], 'Person');
    assert.ok(p.sameAs.includes('https://github.com/imran-s-project'));
    assert.ok(p.sameAs.every((u) => u.startsWith('https://')));
    assert.equal(websiteLd('en', 'd').inLanguage, 'en');
    const b = breadcrumbLd([{ name: 'Home', path: '/en' }, { name: 'Blog', path: '/en/blog' }]);
    assert.equal(b.itemListElement[1]?.item.startsWith('http'), true);
    const post = blogPostingLd({ title: { bn: '', en: 'T' }, excerpt: { bn: '', en: '' }, publishedAt: '2026-11-01T00:00:00Z', updatedAt: '', coverImage: { url: 'https://x.y/a.png', alt: { bn: '', en: '' } }, seo: { metaTitle: { bn: '', en: '' }, metaDescription: { bn: '', en: '' }, noindex: false } }, 'en', '/en/blog/t', 'T', 'D');
    assert.equal(post['@type'], 'BlogPosting');
    assert.equal(post.dateModified, '2026-11-01T00:00:00Z');
    assert.deepEqual(post.image, ['https://x.y/a.png']);
  });
});
