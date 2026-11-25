import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery, decodeDocument, decodeValue, encodeScalar } from '@/lib/firestore/rest';

describe('firestore REST codec', () => {
  test('decodes every value type, nested', () => {
    const doc = decodeDocument({
      name: 'projects/x/databases/(default)/documents/blogPosts/abc123',
      fields: {
        title: { mapValue: { fields: { en: { stringValue: 'Hi' }, bn: { stringValue: 'হাই' } } } },
        views: { integerValue: '42' }, ratio: { doubleValue: 0.5 }, featured: { booleanValue: true },
        publishedAt: { timestampValue: '2026-11-01T10:00:00.123456Z' }, none: { nullValue: null },
        tagIds: { arrayValue: { values: [{ stringValue: 'a' }, { stringValue: 'b' }] } }, empty: { arrayValue: {} }
      }
    });
    assert.deepEqual(doc, { id: 'abc123', title: { en: 'Hi', bn: 'হাই' }, views: 42, ratio: 0.5, featured: true, publishedAt: '2026-11-01T10:00:00.123456Z', none: null, tagIds: ['a', 'b'], empty: [] });
    assert.ok(!Number.isNaN(new Date(doc.publishedAt as string).getTime()));
    assert.equal(decodeValue({ bytesValue: 'x' }), null);
  });
  test('encodes scalars', () => {
    assert.deepEqual(encodeScalar('a'), { stringValue: 'a' });
    assert.deepEqual(encodeScalar(3), { integerValue: '3' });
    assert.deepEqual(encodeScalar(1.5), { doubleValue: 1.5 });
    assert.deepEqual(encodeScalar(false), { booleanValue: false });
    assert.deepEqual(encodeScalar(new Date('2026-01-02T03:04:05.000Z')), { timestampValue: '2026-01-02T03:04:05.000Z' });
  });
  test('builds structured queries', () => {
    assert.deepEqual(buildQuery({ collection: 'projects', where: [{ field: 'status', op: 'EQUAL', value: 'published' }] }), {
      structuredQuery: { from: [{ collectionId: 'projects' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'published' } } } }
    });
    const q = buildQuery({
      collection: 'blogPosts',
      where: [{ field: 'status', op: 'EQUAL', value: 'published' }, { field: 'publishedAt', op: 'LESS_THAN_OR_EQUAL', value: new Date('2026-11-16T00:00:00Z') }],
      orderBy: [{ field: 'publishedAt', direction: 'DESCENDING' }], select: ['slug', 'title'], limit: 10
    }) as { structuredQuery: Record<string, unknown> };
    const sq = q.structuredQuery;
    assert.equal((sq.where as { compositeFilter: { op: string; filters: unknown[] } }).compositeFilter.op, 'AND');
    assert.equal((sq.where as { compositeFilter: { filters: unknown[] } }).compositeFilter.filters.length, 2);
    assert.deepEqual(sq.orderBy, [{ field: { fieldPath: 'publishedAt' }, direction: 'DESCENDING' }]);
    assert.deepEqual(sq.select, { fields: [{ fieldPath: 'slug' }, { fieldPath: 'title' }] });
    assert.equal(sq.limit, 10);
    assert.equal('where' in (buildQuery({ collection: 'blogTags' }) as { structuredQuery: object }).structuredQuery, false);
  });
});
