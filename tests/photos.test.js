import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHOTO_MAX, PHOTO_TYPE, PHOTO_QUALITY, fitWithin, orphanPhotos, gonePhotos } from '#photos';

const receipt = (id, photo) => ({ id, takenOn: '2026-11-02', amountCents: 999, shop: '', note: '', photo });
const docOf = (...receipts) => ({ version: 1, todos: [], receipts, summary: null });
const serverReceipt = (key, photo, deleted) => [`receipt:${key}`, { id: `pb-${key}`, kind: 'receipt', key, data: { ...receipt(key, photo), id: undefined }, deleted, updated: 'x' }];

test('the photo is a JPEG of quality 0.8 and at most 1600 px on its long side (REC-7)', () => {
  assert.equal(PHOTO_MAX, 1600);
  assert.equal(PHOTO_TYPE, 'image/jpeg');
  assert.equal(PHOTO_QUALITY, 0.8);
});

test('fitWithin scales the long side to 1600 and keeps the ratio, and never goes below 1 px (REC-7)', () => {
  assert.deepEqual(fitWithin(4032, 3024), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(3024, 4032), { width: 1200, height: 1600 });
  assert.deepEqual(fitWithin(1200, 900), { width: 1200, height: 900 });
  assert.deepEqual(fitWithin(3201, 1), { width: 1600, height: 1 });
  assert.deepEqual(fitWithin(400, 300, 200), { width: 200, height: 150 });
});

test('orphanPhotos gives the pending photos that no receipt of the doc and no queued upsert names (SYNC-15)', () => {
  const doc = docOf(receipt('r1', 'a'), receipt('r9', null));
  const queue = [
    { kind: 'receipt', key: 'r2', op: 'upsert', data: { ...receipt('r2', 'b'), id: undefined } },
    { kind: 'receipt', key: 'r3', op: 'delete', photo: 'c' },
    { kind: 'todo', key: 't1', op: 'upsert', data: { text: 'x', due: null, done: false, doneAt: null } },
  ];
  const queueBefore = structuredClone(queue);
  assert.deepEqual(orphanPhotos(['a', 'b', 'c'], doc, queue), ['c']);
  assert.deepEqual(queue, queueBefore);
  assert.deepEqual(orphanPhotos([], doc, queue), []);
});

test('gonePhotos gives the photo of a tombstoned receipt once and nothing when it is in gone (SYNC-15)', () => {
  const server = new Map([serverReceipt('r1', 'p1', true), serverReceipt('r2', 'p1', true), serverReceipt('r3', 'p3', false), serverReceipt('r4', null, true)]);
  assert.deepEqual(gonePhotos(server, docOf(), []), ['p1']);
  assert.deepEqual(gonePhotos(server, docOf(), ['p1']), []);
});

test('gonePhotos leaves out a photo that a receipt of the doc names, and adds the dropped photos (SYNC-15)', () => {
  const server = new Map([serverReceipt('r1', 'p1', true)]);
  assert.deepEqual(gonePhotos(server, docOf(receipt('r1', 'p1')), []), []);
  assert.deepEqual(gonePhotos(server, docOf(), [], ['p0', 'p1']), ['p1', 'p0']);
  assert.deepEqual(gonePhotos(new Map(), docOf(receipt('r5', 'p0')), [], ['p0']), []);
});
