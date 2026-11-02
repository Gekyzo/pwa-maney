import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SHOP, MAX_NOTE, normalizeReceipt, addReceipt, editReceipt, deleteReceipt, sortedReceipts } from '#receipts';

const doc = (...receipts) => ({ version: 1, todos: [], receipts, summary: null });
const receipt = (id, extra = {}) => ({ id, takenOn: '2026-11-01', amountCents: 1250, shop: 'Shop', note: '', photo: null, ...extra });
const fields = (extra = {}) => ({ takenOn: '2026-11-01', amountCents: 1250, shop: ' Shop ', note: ' n ', photo: null, ...extra });

test('addReceipt trims shop and note, and leaves the input state unchanged', () => {
  const state = doc(receipt('a'));
  const before = structuredClone(state);
  const { state: next, error } = addReceipt(state, fields(), 'x');
  assert.equal(error, undefined);
  assert.deepEqual(next.receipts.find((r) => r.id === 'x'), receipt('x', { note: 'n' }));
  assert.deepEqual(state, before);
});

test('addReceipt allows an empty shop and note, and gets a fresh id', () => {
  const { state, error } = addReceipt(doc(), fields({ shop: '', note: '' }));
  assert.equal(error, undefined);
  assert.equal(typeof state.receipts[0].id, 'string');
  assert.deepEqual([state.receipts[0].shop, state.receipts[0].note], ['', '']);
});

test('addReceipt needs an integer amount above 0', () => {
  const state = doc();
  for (const amountCents of [0, -1, 1.5, '12', NaN, null]) {
    assert.deepEqual(addReceipt(state, fields({ amountCents }), 'x'), { state, error: { key: 'error.amountInvalid' } }, String(amountCents));
  }
});

test('addReceipt needs a real date', () => {
  const state = doc();
  for (const takenOn of ['2026-02-30', '', 'x', null]) {
    assert.deepEqual(addReceipt(state, fields({ takenOn }), 'x'), { state, error: { key: 'error.dateInvalid' } }, String(takenOn));
  }
});

test('addReceipt limits the shop and the note', () => {
  const state = doc();
  assert.deepEqual(addReceipt(state, fields({ shop: 'a'.repeat(MAX_SHOP + 1) }), 'x'), {
    state,
    error: { key: 'error.shopTooLong', params: { max: 120 } },
  });
  assert.deepEqual(addReceipt(state, fields({ note: 'a'.repeat(MAX_NOTE + 1) }), 'x'), {
    state,
    error: { key: 'error.noteTooLong', params: { max: 500 } },
  });
  assert.equal(addReceipt(state, fields({ shop: 'a'.repeat(MAX_SHOP), note: 'a'.repeat(MAX_NOTE) }), 'x').error, undefined);
});

test('the photo is null or a key of 1 to 64 characters', () => {
  const state = doc();
  assert.equal(addReceipt(state, fields({ photo: 'k'.repeat(64) }), 'x').error, undefined);
  for (const photo of ['', 'k'.repeat(65), 5]) {
    assert.deepEqual(addReceipt(state, fields({ photo }), 'x'), { state, error: { key: 'error.photoInvalid' } }, String(photo));
  }
});

test('editReceipt changes the given fields of one receipt', () => {
  const state = doc(receipt('a'), receipt('b'));
  const before = structuredClone(state);
  const { state: next } = editReceipt(state, 'b', { amountCents: 300, shop: ' New ' });
  assert.deepEqual(next.receipts[1], receipt('b', { amountCents: 300, shop: 'New' }));
  assert.deepEqual(next.receipts[0], receipt('a'));
  assert.deepEqual(state, before);
});

test('editReceipt refuses a bad value and an unknown id', () => {
  const state = doc(receipt('a'));
  assert.deepEqual(editReceipt(state, 'a', { amountCents: 0 }), { state, error: { key: 'error.amountInvalid' } });
  assert.deepEqual(editReceipt(state, 'zz', { shop: 'x' }), { state, error: { key: 'error.receiptMissing' } });
});

test('deleteReceipt removes one receipt or refuses an unknown id', () => {
  const state = doc(receipt('a'), receipt('b'));
  assert.deepEqual(deleteReceipt(state, 'a').state.receipts, [receipt('b')]);
  assert.deepEqual(deleteReceipt(state, 'zz'), { state, error: { key: 'error.receiptMissing' } });
});

test('sortedReceipts puts the newest takenOn first, then by id', () => {
  const list = [receipt('b'), receipt('c', { takenOn: '2026-11-02' }), receipt('a'), receipt('d', { takenOn: '2026-10-01' })];
  const before = structuredClone(list);
  assert.deepEqual(sortedReceipts(list).map((r) => r.id), ['c', 'a', 'b', 'd']);
  assert.deepEqual(list, before);
});

test('normalizeReceipt keeps a valid receipt and drops unknown fields', () => {
  assert.deepEqual(normalizeReceipt({ ...receipt('a'), shop: ' S ', extra: 1 }), receipt('a', { shop: 'S' }));
});

test('normalizeReceipt refuses a value that is not a receipt', () => {
  const bad = [
    null,
    42,
    {},
    receipt(''),
    receipt('a', { amountCents: 0 }),
    receipt('a', { amountCents: 1.5 }),
    receipt('a', { takenOn: '2026-02-30' }),
    receipt('a', { shop: 5 }),
    receipt('a', { shop: 'a'.repeat(121) }),
    receipt('a', { note: 'a'.repeat(501) }),
    receipt('a', { photo: '' }),
    receipt('a', { photo: 'k'.repeat(65) }),
  ];
  for (const value of bad) assert.equal(normalizeReceipt(value), null, JSON.stringify(value));
});
