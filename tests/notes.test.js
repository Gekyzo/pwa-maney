import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_SLUG } from '#config';
import { NOTES_KEY, MAX_TEXT, emptyNotes, normalizeNotes, addNote, editNote, deleteNote, moveNote, findNote } from '#notes';

const build = (...texts) => ({ version: 1, notes: texts.map((text, i) => ({ id: `n${i}`, text })) });

test('the key of the notes has the slug', () => {
  assert.equal(NOTES_KEY, `${APP_SLUG}.notes`);
});

test('a note is added first, trimmed, and the input state is unchanged', () => {
  const state = build('old');
  const { state: next, error } = addNote(state, '  new  ', 'x');
  assert.equal(error, undefined);
  assert.deepEqual(next.notes, [{ id: 'x', text: 'new' }, { id: 'n0', text: 'old' }]);
  assert.deepEqual(state, build('old'));
});

test('a blank note is an error and the state is unchanged', () => {
  const state = build('a');
  for (const text of ['', '   ', null, undefined]) {
    assert.deepEqual(addNote(state, text, 'x'), { state, error: { key: 'error.textRequired' } });
  }
});

test('a note over the maximum length is an error', () => {
  const state = emptyNotes();
  assert.deepEqual(addNote(state, 'a'.repeat(MAX_TEXT + 1), 'x'), {
    state,
    error: { key: 'error.textTooLong', params: { max: MAX_TEXT } },
  });
  assert.equal(addNote(state, 'a'.repeat(MAX_TEXT), 'x').error, undefined);
});

test('a note without an id gets a fresh one', () => {
  const { state } = addNote(emptyNotes(), 'a');
  assert.equal(typeof state.notes[0].id, 'string');
  assert.ok(state.notes[0].id.length > 0);
});

test('an edit changes the text of one note', () => {
  const { state } = editNote(build('a', 'b'), 'n1', ' B ');
  assert.deepEqual(state.notes.map((n) => n.text), ['a', 'B']);
});

test('an edit to a blank text is an error', () => {
  const state = build('a');
  assert.deepEqual(editNote(state, 'n0', ' '), { state, error: { key: 'error.textRequired' } });
});

test('a delete removes one note', () => {
  const { state } = deleteNote(build('a', 'b'), 'n0');
  assert.deepEqual(state.notes, [{ id: 'n1', text: 'b' }]);
});

test('an id that does not exist is an error for edit, delete and move', () => {
  const state = build('a');
  const missing = { state, error: { key: 'error.noteMissing' } };
  assert.deepEqual(editNote(state, 'zz', 'x'), missing);
  assert.deepEqual(deleteNote(state, 'zz'), missing);
  assert.deepEqual(moveNote(state, 'zz', 0), missing);
});

test('a move puts a note at an index, clamped to the list', () => {
  assert.deepEqual(moveNote(build('a', 'b', 'c'), 'n0', 2).state.notes.map((n) => n.text), ['b', 'c', 'a']);
  assert.deepEqual(moveNote(build('a', 'b', 'c'), 'n2', -5).state.notes.map((n) => n.text), ['c', 'a', 'b']);
});

test('findNote returns the note or null', () => {
  assert.deepEqual(findNote(build('a'), 'n0'), { id: 'n0', text: 'a' });
  assert.equal(findNote(build('a'), 'zz'), null);
});

test('normalizeNotes keeps a valid doc and trims the texts', () => {
  assert.deepEqual(normalizeNotes({ version: 1, notes: [{ id: 'a', text: ' x ', more: 1 }] }), {
    version: 1,
    notes: [{ id: 'a', text: 'x' }],
  });
});

test('normalizeNotes refuses a doc that is not version 1 notes', () => {
  const bad = [
    null,
    42,
    {},
    { version: 2, notes: [] },
    { version: 1 },
    { version: 1, notes: [{ id: '', text: 'a' }] },
    { version: 1, notes: [{ id: 'a', text: ' ' }] },
    { version: 1, notes: [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }] },
  ];
  for (const data of bad) assert.equal(normalizeNotes(data), null, JSON.stringify(data));
});
