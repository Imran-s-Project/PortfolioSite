import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBucketImage } from '@/lib/utils/images';

test('only this bucket’s Firebase Storage URLs are optimised', () => {
  const b = 'imransiteinfo.firebasestorage.app';
  assert.ok(isBucketImage(`https://firebasestorage.googleapis.com/v0/b/${b}/o/media%2F2026%2F11%2Fa.png?alt=media&token=x`, b));
  assert.equal(isBucketImage('https://firebasestorage.googleapis.com/v0/b/other-bucket/o/a.png', b), false);
  assert.equal(isBucketImage('https://evil.example/v0/b/imransiteinfo.firebasestorage.app/o/a.png', b), false);
  assert.equal(isBucketImage('http://firebasestorage.googleapis.com/v0/b/imransiteinfo.firebasestorage.app/o/a.png', b), false);
});
