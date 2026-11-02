import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_SLUG } from '#config';
import { DOC_KEY, emptyDoc, normalizeDoc, isDate } from '#doc';

const todo = (id) => ({ id, text: id, due: null, done: false, doneAt: null });
const receipt = (id) => ({ id, takenOn: '2026-11-01', amountCents: 100, shop: '', note: '', photo: null });
const summary = () => ({
  v: 1,
  generatedAt: '2026-11-02T09:30:00.000Z',
  month: '2026-11',
  status: { ok: 1, review: 0, missing: 0, pending: 0 },
  nextDue: [],
  investments: [],
});

test('the key of the doc has the slug', () => {
  assert.equal(DOC_KEY, `${APP_SLUG}.doc`);
});

test('emptyDoc is version 1 with nothing in it', () => {
  assert.deepEqual(emptyDoc(), { version: 1, todos: [], receipts: [], summary: null });
  assert.notEqual(emptyDoc(), emptyDoc());
});

test('isDate is re-exported', () => {
  assert.equal(isDate('2026-02-28'), true);
  assert.equal(isDate('2026-02-30'), false);
});

test('normalizeDoc keeps a valid doc and a null summary', () => {
  assert.deepEqual(normalizeDoc(emptyDoc()), emptyDoc());
  const value = { version: 1, todos: [todo('a')], receipts: [receipt('a')], summary: summary(), extra: 1 };
  assert.deepEqual(normalizeDoc(value), { version: 1, todos: [todo('a')], receipts: [receipt('a')], summary: summary() });
});

test('normalizeDoc refuses a doc that is not valid', () => {
  const bad = [
    null,
    42,
    {},
    { ...emptyDoc(), version: 2 },
    { ...emptyDoc(), todos: 'x' },
    { ...emptyDoc(), todos: [todo('a'), todo('a')] },
    { ...emptyDoc(), receipts: [receipt('a'), receipt('a')] },
    { ...emptyDoc(), todos: [{ ...todo('a'), done: 'yes' }] },
    { ...emptyDoc(), receipts: [{ ...receipt('a'), amountCents: 0 }] },
    { ...emptyDoc(), summary: { ...summary(), v: 2 } },
    { version: 1, todos: [], receipts: [] },
  ];
  for (const value of bad) assert.equal(normalizeDoc(value), null, JSON.stringify(value));
});

test('a to-do and a receipt may share an id', () => {
  assert.notEqual(normalizeDoc({ ...emptyDoc(), todos: [todo('a')], receipts: [receipt('a')] }), null);
});
