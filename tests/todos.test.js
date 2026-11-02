import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TODO, isDate, isIso, isLate, localDay, normalizeTodo, addTodo, editTodo, setTodoDone, deleteTodo, sortedTodos } from '#todos';

const doc = (...todos) => ({ version: 1, todos, receipts: [], summary: null });
const todo = (id, extra = {}) => ({ id, text: id, due: null, done: false, doneAt: null, ...extra });

test('isDate accepts only a real calendar date', () => {
  for (const text of ['2026-02-28', '2024-02-29', '2026-12-31']) assert.equal(isDate(text), true, text);
  for (const text of ['2026-02-30', '2026-13-01', '2026-2-3', '', '2026-02-28T00:00', null, 5]) assert.equal(isDate(text), false, String(text));
});

test('isIso accepts only a real ISO-8601 time', () => {
  const good = ['2026-11-02T10:00:00Z', '2026-11-02T10:00:00.000Z', '2024-02-29T23:59:59+02:00', '2026-01-01T00:00:00.5-05:30'];
  for (const text of good) assert.equal(isIso(text), true, text);
  const bad = [
    '2026-02-30T10:00:00Z',
    '2026-11-02T24:00:00Z',
    '2026-11-02T10:60:00Z',
    '2026-11-02T10:00:60Z',
    '2026-11-02T10:00:00+24:00',
    '2026-11-02T10:00:00+02:60',
    '2026-11-02T10:00:00',
    '2026-11-02',
    '',
    null,
    5,
  ];
  for (const text of bad) assert.equal(isIso(text), false, String(text));
});

test('addTodo trims the text, starts open, and leaves the input state unchanged', () => {
  const state = doc(todo('a'));
  const before = structuredClone(state);
  const { state: next, error } = addTodo(state, { text: '  buy  ', due: '' }, 'x');
  assert.equal(error, undefined);
  assert.deepEqual(next.todos.find((t) => t.id === 'x'), { id: 'x', text: 'buy', due: null, done: false, doneAt: null });
  assert.deepEqual(state, before);
});

test('addTodo gets a fresh id and keeps a valid due date', () => {
  const { state } = addTodo(doc(), { text: 'a', due: '2026-03-01' });
  assert.equal(typeof state.todos[0].id, 'string');
  assert.equal(state.todos[0].due, '2026-03-01');
});

test('addTodo refuses a blank text, a long text and a false date', () => {
  const state = doc();
  assert.deepEqual(addTodo(state, { text: '  ', due: null }, 'x'), { state, error: { key: 'error.textRequired' } });
  assert.deepEqual(addTodo(state, { text: 'a'.repeat(501), due: null }, 'x'), {
    state,
    error: { key: 'error.textTooLong', params: { max: 500 } },
  });
  assert.equal(addTodo(state, { text: 'a'.repeat(MAX_TODO), due: null }, 'x').error, undefined);
  assert.deepEqual(addTodo(state, { text: 'a', due: '2026-02-30' }, 'x'), { state, error: { key: 'error.dateInvalid' } });
});

test('editTodo changes the text and the due date of one to-do', () => {
  const state = doc(todo('a'), todo('b'));
  const before = structuredClone(state);
  const { state: next } = editTodo(state, 'b', { text: ' B ', due: '2026-05-05' });
  assert.deepEqual(next.todos[1], { ...todo('b'), text: 'B', due: '2026-05-05' });
  assert.deepEqual(next.todos[0], todo('a'));
  assert.deepEqual(state, before);
  assert.equal(editTodo(state, 'b', { text: 'x', due: null }).state.todos[1].due, null);
});

test('editTodo refuses a bad value and an unknown id', () => {
  const state = doc(todo('a'));
  assert.deepEqual(editTodo(state, 'a', { text: '', due: null }), { state, error: { key: 'error.textRequired' } });
  assert.deepEqual(editTodo(state, 'a', { text: 'x', due: '2026-00-01' }), { state, error: { key: 'error.dateInvalid' } });
  assert.deepEqual(editTodo(state, 'zz', { text: 'x', due: null }), { state, error: { key: 'error.todoMissing' } });
});

test('setTodoDone sets and clears doneAt', () => {
  const state = doc(todo('a'));
  const before = structuredClone(state);
  const { state: done } = setTodoDone(state, 'a', true, '2026-11-02T10:00:00.000Z');
  assert.deepEqual(done.todos[0], todo('a', { done: true, doneAt: '2026-11-02T10:00:00.000Z' }));
  assert.deepEqual(state, before);
  const { state: open } = setTodoDone(done, 'a', false, '2026-11-03T10:00:00.000Z');
  assert.deepEqual(open.todos[0], todo('a'));
});

test('setTodoDone refuses a missing or false time when it marks a to-do done', () => {
  const state = doc(todo('a'));
  const invalid = { state, error: { key: 'error.dateInvalid' } };
  for (const now of [undefined, null, '', 'now', '2026-02-30T10:00:00Z']) assert.deepEqual(setTodoDone(state, 'a', true, now), invalid, String(now));
  assert.deepEqual(setTodoDone(doc(todo('a', { done: true, doneAt: '2026-11-02T10:00:00.000Z' })), 'a', false).state.todos[0], todo('a'));
});

test('setTodoDone and deleteTodo refuse an unknown id', () => {
  const state = doc(todo('a'));
  const missing = { state, error: { key: 'error.todoMissing' } };
  assert.deepEqual(setTodoDone(state, 'zz', true, '2026-11-02T10:00:00.000Z'), missing);
  assert.deepEqual(deleteTodo(state, 'zz'), missing);
});

test('deleteTodo removes one to-do', () => {
  const state = doc(todo('a'), todo('b'));
  const before = structuredClone(state);
  assert.deepEqual(deleteTodo(state, 'a').state.todos, [todo('b')]);
  assert.deepEqual(state, before);
});

test('sortedTodos puts open first, by due date with none last, then by id; done by doneAt descending', () => {
  const list = [
    todo('d1', { done: true, doneAt: '2026-11-01T08:00:00.000Z' }),
    todo('o-none-b'),
    todo('o-late', { due: '2026-12-01' }),
    todo('d2', { done: true, doneAt: '2026-11-02T08:00:00.000Z' }),
    todo('o-none-a'),
    todo('o-early', { due: '2026-11-05' }),
  ];
  const before = structuredClone(list);
  assert.deepEqual(sortedTodos(list).map((t) => t.id), ['o-early', 'o-late', 'o-none-a', 'o-none-b', 'd2', 'd1']);
  assert.deepEqual(list, before);
});

test('normalizeTodo drops unknown fields', () => {
  assert.deepEqual(normalizeTodo({ ...todo('a'), text: ' x ', extra: 1 }), todo('a', { text: 'x' }));
});

test('normalizeTodo refuses a value that is not a to-do', () => {
  const bad = [
    null,
    42,
    {},
    todo('a', { done: 'yes' }),
    todo('', {}),
    todo('a', { text: ' ' }),
    todo('a', { text: 'a'.repeat(501) }),
    todo('a', { due: '2026-02-30' }),
    todo('a', { doneAt: 'not a date' }),
    todo('a', { doneAt: 5 }),
  ];
  for (const value of bad) assert.equal(normalizeTodo(value), null, JSON.stringify(value));
});

test('localDay gives the local calendar day of a time', () => {
  assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(localDay(new Date(2026, 10, 2, 0, 0)), '2026-11-02');
});

test('isLate is true for an open to-do whose due date is before today', () => {
  assert.equal(isLate(todo('a', { due: '2026-11-01' }), '2026-11-02'), true);
  assert.equal(isLate(todo('a', { due: '2026-11-02' }), '2026-11-02'), false);
  assert.equal(isLate(todo('a', { due: '2026-11-03' }), '2026-11-02'), false);
  assert.equal(isLate(todo('a'), '2026-11-02'), false);
  assert.equal(isLate(todo('a', { due: '2026-11-01', done: true, doneAt: '2026-11-02T10:00:00Z' }), '2026-11-02'), false);
});
