import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNotes, unseen, nextSeen } from '#whatsnew';

const FILE = `# Release notes

## Unreleased

- Not deployed yet.

## 1.2.0 - 2026-10-20

- A new menu.
- \`Settings\` shows the version.

## 1.1.0 - 2026-10-10

- The list scrolls.
`;

const entry = (version, date = '2026-10-01') => ({ version, date, notes: ['A change.'] });

test('parseNotes gives each released version with its date and its notes, newest first', () => {
  assert.deepEqual(parseNotes(FILE), [
    { version: '1.2.0', date: '2026-10-20', notes: ['A new menu.', '`Settings` shows the version.'] },
    { version: '1.1.0', date: '2026-10-10', notes: ['The list scrolls.'] },
  ]);
});

test('parseNotes gives no entry for an empty file or a file with only Unreleased', () => {
  assert.deepEqual(parseNotes(''), []);
  assert.deepEqual(parseNotes('# Release notes\n\n## Unreleased\n\nNo change.\n'), []);
});

test('parseNotes skips a heading that is not a version and a date, and a version with no note', () => {
  const text = '## 1.2 - 2026-10-01\n\n- Short.\n\n## 1.3.0\n\n- No date.\n\n## 1.4.0 - 2026-10-02\n\nNo bullet.\n\n## 1.5.0 - 2026-10-03\n\n- Kept.\n';
  assert.deepEqual(parseNotes(text), [{ version: '1.5.0', date: '2026-10-03', notes: ['Kept.'] }]);
});

test('unseen gives the versions newer than the seen one', () => {
  const entries = [entry('1.2.0'), entry('1.1.0'), entry('1.0.0')];
  assert.deepEqual(unseen(entries, '1.0.0').map(({ version }) => version), ['1.2.0', '1.1.0']);
});

test('unseen gives nothing with no seen version, or a seen version that is the newest or newer', () => {
  const entries = [entry('1.2.0'), entry('1.1.0')];
  assert.deepEqual(unseen(entries, null), []);
  assert.deepEqual(unseen(entries, '1.2.0'), []);
  assert.deepEqual(unseen(entries, '2.0.0'), []);
});

test('unseen compares versions by number', () => {
  assert.deepEqual(unseen([entry('1.10.0')], '1.9.0').map(({ version }) => version), ['1.10.0']);
});

// nextSeen({ entries, seen, running, loaded, blocked }) → { show, store }: the notes to show at a
// start, and the seen version to store (null: store nothing). `store` is stored at once when
// `show` is empty, else when the sheet closes.
const notes = [entry('1.3.0'), entry('1.2.0'), entry('1.1.0')];
const at = (over) => nextSeen({ entries: notes, seen: '1.1.0', running: '1.3.0', loaded: true, blocked: false, ...over });
const versions = ({ show }) => show.map(({ version }) => version);

test('nextSeen shows the versions after the seen one and stores the newest of them', () => {
  const result = at({});
  assert.deepEqual(versions(result), ['1.3.0', '1.2.0']);
  assert.equal(result.store, '1.3.0');
});

test('nextSeen stores the running version at a first start and shows nothing', () => {
  assert.deepEqual(at({ seen: null }), { show: [], store: '1.3.0' });
});

test('nextSeen shows and stores nothing when the notes could not be read', () => {
  assert.deepEqual(at({ entries: [], loaded: false }), { show: [], store: null });
});

test('nextSeen shows and stores nothing while another layer covers the screen', () => {
  assert.deepEqual(at({ blocked: true }), { show: [], store: null });
});

test('nextSeen shows no version newer than the running one, and stores the newest shown', () => {
  const result = at({ running: '1.2.0' });
  assert.deepEqual(versions(result), ['1.2.0']);
  assert.equal(result.store, '1.2.0');
});

test('nextSeen keeps an unseen running version for a later start when its notes are not cached yet', () => {
  // The cache still has the notes of 1.2.0 only: 1.3.0 must stay unseen.
  const result = at({ entries: notes.slice(1) });
  assert.deepEqual(versions(result), ['1.2.0']);
  assert.equal(result.store, '1.2.0');
});

test('nextSeen never lowers the seen version, as after a downgrade', () => {
  assert.deepEqual(at({ seen: '1.3.0', running: '1.2.0' }), { show: [], store: null });
});

test('nextSeen stores nothing when there is nothing new', () => {
  assert.deepEqual(at({ seen: '1.3.0' }), { show: [], store: null });
});

test('nextSeen stores the running version at a first start, also under the walkthrough or with no notes', () => {
  assert.deepEqual(at({ seen: null, blocked: true }), { show: [], store: '1.3.0' });
  assert.deepEqual(at({ seen: null, loaded: false }), { show: [], store: '1.3.0' });
});
