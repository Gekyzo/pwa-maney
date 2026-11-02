import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueue, mergePulled, cursorOf, validRecords, mergeFields } from '#sync';

const up = (key, text = key) => ({ kind: 'todo', key, op: 'upsert', data: { text } });
const rec = (key, text, updated, extra = {}) => ({ kind: 'todo', key, data: { text }, updated, ...extra });

test('the queue keeps one entry for each record, the later one, at the end (SYNC-5)', () => {
  const queue = enqueue([up('a', 'one'), up('b')], [up('a', 'two'), up('c')]);
  assert.deepEqual(queue.map(({ key }) => key), ['b', 'a', 'c']);
  assert.equal(queue[1].data.text, 'two');
});

test('the queue keeps a to-do and a receipt of the same key apart (SYNC-5)', () => {
  const queue = enqueue([up('a')], [{ kind: 'receipt', key: 'a', op: 'delete', photo: null }]);
  assert.equal(queue.length, 2);
});

test('enqueue leaves its inputs alone (SYNC-5)', () => {
  const queue = [up('a')];
  enqueue(queue, [up('b')]);
  assert.equal(queue.length, 1);
});

test('a queued key ignores the pulled record, and the server copy updates (SYNC-5)', () => {
  const local = new Map([['todo:a', { kind: 'todo', key: 'a', data: { text: 'mine' } }]]);
  const pulled = [rec('a', 'theirs', '2026-01-02')];
  const merged = mergePulled({ local, server: new Map(), queue: [up('a', 'mine')], pulled });
  assert.equal(merged.local.get('todo:a').data.text, 'mine');
  assert.equal(merged.server.get('todo:a').data.text, 'theirs');
});

test('a pulled record with no queued change replaces the local one (SYNC-5)', () => {
  const merged = mergePulled({ local: new Map(), server: new Map(), queue: [], pulled: [rec('a', 'theirs', '2026-01-02')] });
  assert.deepEqual(merged.local.get('todo:a'), { kind: 'todo', key: 'a', data: { text: 'theirs' } });
});

test('a pulled deleted record removes the local record (SYNC-6)', () => {
  const local = new Map([['receipt:a', { kind: 'receipt', key: 'a', data: {} }]]);
  const merged = mergePulled({ local, server: new Map(), queue: [], pulled: [{ kind: 'receipt', key: 'a', data: {}, updated: '2026-01-02', deleted: true }] });
  assert.equal(merged.local.has('receipt:a'), false);
  assert.equal(local.has('receipt:a'), true);
});

test('the cursor is the greatest updated, or the previous one (SYNC-1)', () => {
  assert.equal(cursorOf([rec('a', 'a', '2026-01-02'), rec('b', 'b', '2026-01-05'), rec('c', 'c', '2026-01-03')], ''), '2026-01-05');
  assert.equal(cursorOf([], '2026-01-01'), '2026-01-01');
  assert.equal(cursorOf([rec('a', 'a', '2026-01-02')], '2026-02-01'), '2026-02-01');
});

const todoData = (text) => ({ text, due: null, done: false, doneAt: null });
const receiptData = { takenOn: '2026-11-02', amountCents: 1250, shop: '', note: '', photo: null };
const summaryData = {
  v: 1, generatedAt: '2026-11-02T08:00:00Z', month: '2026-11', status: { ok: 1, review: 0, missing: 0, pending: 0 }, nextDue: [], investments: [],
};

test('validRecords drops a record of an unknown kind and a todo with a 501-character text, and keeps the others (SYNC-7)', () => {
  const map = new Map([
    ['todo:a', { kind: 'todo', key: 'a', data: todoData('Pay') }],
    ['todo:b', { kind: 'todo', key: 'b', data: todoData('x'.repeat(501)) }],
    ['receipt:r', { kind: 'receipt', key: 'r', data: receiptData }],
    ['summary:current', { kind: 'summary', key: 'current', data: summaryData }],
    ['note:n', { kind: 'note', key: 'n', data: {} }],
  ]);
  const { local, dropped } = validRecords(map);
  assert.deepEqual(dropped, ['todo:b', 'note:n']);
  assert.deepEqual([...local.keys()], ['todo:a', 'receipt:r', 'summary:current']);
  assert.equal(map.size, 5);
});

test('validRecords drops a receipt with no amount and a summary of another key (SYNC-7)', () => {
  const { dropped } = validRecords(new Map([
    ['receipt:r', { kind: 'receipt', key: 'r', data: { ...receiptData, amountCents: 0 } }],
    ['summary:old', { kind: 'summary', key: 'old', data: summaryData }],
  ]));
  assert.deepEqual(dropped, ['receipt:r', 'summary:old']);
});

test('a record is checked with its key as the id, not a stray id in its data (SYNC-1, SYNC-7)', () => {
  const { local, dropped } = validRecords(new Map([['todo:a', { kind: 'todo', key: 'a', data: { ...todoData('Pay'), id: '' } }]]));
  assert.deepEqual(dropped, []);
  assert.deepEqual([...local.keys()], ['todo:a']);
});

const base = { text: 'a', due: null, done: false, doneAt: null };

test('a to-do text edited on the phone survives a done set by maney', () => {
  const server = { text: 'a', due: null, done: true, doneAt: 'T1' };
  const local = { text: 'b', due: null, done: false, doneAt: null };
  assert.deepEqual(mergeFields(server, base, local), { data: { text: 'b', done: true, doneAt: 'T1', due: null }, overruled: [] });
});

test('a field changed on both sides keeps the server value and is reported overruled', () => {
  const server = { ...base, text: 'c' };
  const local = { ...base, text: 'b' };
  assert.deepEqual(mergeFields(server, base, local), { data: { ...base, text: 'c' }, overruled: ['text'] });
});

test('a field changed to the same value on both sides is not overruled', () => {
  const both = { ...base, text: 'b' };
  assert.deepEqual(mergeFields(both, base, { ...both }), { data: both, overruled: [] });
});

test('with base null and the server equal to local nothing is overruled (a create whose answer was lost)', () => {
  const same = { ...base, text: 'b' };
  assert.deepEqual(mergeFields(same, null, { ...same }), { data: same, overruled: [] });
  assert.deepEqual(mergeFields({ ...base, text: 'c' }, null, same), { data: { ...base, text: 'c' }, overruled: ['text'] });
});

test('a field only the phone has is put in, and one the phone dropped is left out', () => {
  assert.deepEqual(mergeFields({ text: 'a' }, { text: 'a' }, { text: 'a', due: '2026-11-03' }).data, { text: 'a', due: '2026-11-03' });
  assert.deepEqual(mergeFields({ text: 'a', due: 'x' }, { text: 'a', due: 'x' }, { text: 'a' }).data, { text: 'a' });
});

test('mergeFields compares values, not objects', () => {
  const result = mergeFields({ list: [1, 2] }, { list: [1, 2] }, { list: [1, 2] });
  assert.deepEqual(result, { data: { list: [1, 2] }, overruled: [] });
});

test('mergeFields leaves its inputs alone', () => {
  const server = { text: 'a', due: null, done: true, doneAt: 'T1' };
  const before = structuredClone({ server, base, local: { ...base, text: 'b' } });
  const local = { ...base, text: 'b' };
  const { data } = mergeFields(server, base, local);
  data.text = 'changed';
  assert.deepEqual({ server, base, local }, before);
});
