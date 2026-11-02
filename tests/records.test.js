import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordKey, toRecords, fromRecords, diffRecords } from '#records';
import { emptyDoc } from '#doc';

const todo = (id, text = id, extra = {}) => ({ id, text, due: null, done: false, doneAt: null, ...extra });
const receipt = (id, extra = {}) => ({ id, takenOn: '2026-11-02', amountCents: 1250, shop: 'Mercadona', note: '', photo: null, ...extra });
const summary = {
  v: 1,
  generatedAt: '2026-11-02T08:00:00Z',
  month: '2026-11',
  status: { ok: 12, review: 2, missing: 1, pending: 3 },
  nextDue: [{ date: '2026-11-05', label: 'Alquiler', amountCents: -80000, state: 'expected' }],
  investments: [{ name: 'Fondo', provider: 'Indexa', valueCents: 1234567, valuedOn: '2026-10-31' }],
};
const docOf = ({ todos = [], receipts = [], summary: sum = null } = {}) => ({ version: 1, todos, receipts, summary: sum });

test('a record id joins the kind and the key (SYNC-1)', () => {
  assert.equal(recordKey('todo', 'a1'), 'todo:a1');
});

test('a to-do and a receipt are records whose data has no id, and the summary is summary:current (SYNC-1)', () => {
  const records = toRecords(docOf({ todos: [todo('t1')], receipts: [receipt('r1')], summary }));
  assert.deepEqual([...records.keys()], ['todo:t1', 'receipt:r1', 'summary:current']);
  const { id: _t, ...todoData } = todo('t1');
  const { id: _r, ...receiptData } = receipt('r1');
  assert.deepEqual(records.get('todo:t1'), { kind: 'todo', key: 't1', data: todoData });
  assert.deepEqual(records.get('receipt:r1'), { kind: 'receipt', key: 'r1', data: receiptData });
  assert.deepEqual(records.get('summary:current'), { kind: 'summary', key: 'current', data: summary });
});

test('a doc with no summary gives no summary record (SYNC-1)', () => {
  assert.deepEqual([...toRecords(emptyDoc()).keys()], []);
});

test('toRecords and fromRecords round-trip a doc with to-dos, receipts and a summary', () => {
  const doc = docOf({ todos: [todo('t1'), todo('t2', 'Pay', { done: true, doneAt: '2026-11-02T08:00:00Z' })], receipts: [receipt('r1'), receipt('r2', { photo: 'p2' })], summary });
  assert.deepEqual(fromRecords(toRecords(doc)), doc);
  assert.deepEqual(fromRecords(toRecords(emptyDoc())), emptyDoc());
});

test('a stray id in the data does not replace the key of the record, and an unknown kind is left out (SYNC-1)', () => {
  const { id: _, ...data } = todo('a');
  const doc = fromRecords(new Map([
    ['todo:a', { kind: 'todo', key: 'a', data: { ...data, id: 'other' } }],
    ['note:x', { kind: 'note', key: 'x', data: {} }],
  ]));
  assert.deepEqual(doc.todos.map((item) => item.id), ['a']);
  assert.deepEqual(doc.receipts, []);
  assert.equal(doc.summary, null);
});

test('an add gives one upsert, an edit one upsert, and the deletes come first (SYNC-1)', () => {
  const prev = toRecords(docOf({ todos: [todo('a'), todo('b')] }));
  const next = toRecords(docOf({ todos: [todo('b', 'New')], receipts: [receipt('c')] }));
  assert.deepEqual(diffRecords(prev, next).map(({ kind, key, op }) => [kind, key, op]), [['todo', 'a', 'delete'], ['receipt', 'c', 'upsert'], ['todo', 'b', 'upsert']]);
});

test('diffRecords never gives a change of kind summary', () => {
  const other = { ...summary, month: '2026-12' };
  assert.deepEqual(diffRecords(toRecords(docOf()), toRecords(docOf({ summary }))), []);
  assert.deepEqual(diffRecords(toRecords(docOf({ summary })), toRecords(docOf())), []);
  assert.deepEqual(diffRecords(toRecords(docOf({ summary })), toRecords(docOf({ summary: other, todos: [todo('a')] }))).map(({ kind }) => kind), ['todo']);
});

test('a receipt delete carries the key of its photo', () => {
  const prev = toRecords(docOf({ todos: [todo('t')], receipts: [receipt('r1', { photo: 'p1' }), receipt('r2')] }));
  const changes = diffRecords(prev, toRecords(docOf()));
  assert.deepEqual(changes, [
    { kind: 'receipt', key: 'r1', op: 'delete', photo: 'p1' },
    { kind: 'receipt', key: 'r2', op: 'delete', photo: null },
    { kind: 'todo', key: 't', op: 'delete' },
  ]);
});

test('equal data in another key order gives no change (SYNC-1)', () => {
  const prev = new Map([['todo:a', { kind: 'todo', key: 'a', data: { text: 'A', due: null } }]]);
  const next = new Map([['todo:a', { kind: 'todo', key: 'a', data: { due: null, text: 'A' } }]]);
  assert.deepEqual(diffRecords(prev, next), []);
});
