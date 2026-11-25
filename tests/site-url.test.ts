import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSiteUrl } from '@/config/site';

describe('site URL — detected from the environment, never hard-coded', () => {
  test('local development falls back to localhost', () => {
    assert.equal(resolveSiteUrl({}), 'http://localhost:3000');
    assert.equal(resolveSiteUrl({ PORT: '4100' }), 'http://localhost:4100');
  });

  test('on Vercel it uses the production domain, even on a preview deployment', () => {
    assert.equal(
      resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'my-site.vercel.app', VERCEL_URL: 'my-site-git-feature-abc.vercel.app' }),
      'https://my-site.vercel.app'
    );
  });

  test('the deployment address is only the second choice', () => {
    assert.equal(resolveSiteUrl({ VERCEL_URL: 'my-site-abc123.vercel.app' }), 'https://my-site-abc123.vercel.app');
  });

  test('an explicit NEXT_PUBLIC_SITE_URL wins; the protocol and trailing slashes are normalised', () => {
    assert.equal(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://example.com/', VERCEL_PROJECT_PRODUCTION_URL: 'my-site.vercel.app' }),
      'https://example.com'
    );
    assert.equal(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'example.com' }), 'https://example.com');
  });

  test('a blank override (a copied .env.example) is ignored', () => {
    assert.equal(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: '  ', VERCEL_PROJECT_PRODUCTION_URL: 'my-site.vercel.app' }),
      'https://my-site.vercel.app'
    );
  });
});
