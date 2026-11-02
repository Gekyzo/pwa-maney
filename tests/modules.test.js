import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, switchModule, visibleSections } from '#modules';

test('MODULES is receipts, todos and summary', () => {
  assert.deepEqual(MODULES, ['receipts', 'todos', 'summary']);
});

test('visibleSections with no module off is the full navigation', () => {
  assert.deepEqual(visibleSections([]), ['receipts', 'todos', 'summary', 'settings']);
});

test('each module hides its own section only', () => {
  assert.deepEqual(visibleSections(['receipts']), ['todos', 'summary', 'settings']);
  assert.deepEqual(visibleSections(['todos']), ['receipts', 'summary', 'settings']);
  assert.deepEqual(visibleSections(['summary']), ['receipts', 'todos', 'settings']);
});

test('visibleSections with every module off keeps settings', () => {
  assert.deepEqual(visibleSections(MODULES), ['settings']);
});

test('visibleSections ignores an unknown id', () => {
  assert.deepEqual(visibleSections(['shops']), ['receipts', 'todos', 'summary', 'settings']);
});

test('switchModule turns a module off and on, in the order of MODULES', () => {
  assert.deepEqual(switchModule([], 'todos', false), ['todos']);
  assert.deepEqual(switchModule(['summary'], 'receipts', false), ['receipts', 'summary']);
  assert.deepEqual(switchModule(['todos'], 'todos', true), []);
  assert.deepEqual(switchModule([], 'todos', true), []);
});

test('switchModule ignores an unknown id and does not change its input', () => {
  const off = ['todos'];
  assert.deepEqual(switchModule(off, 'shops', false), ['todos']);
  assert.deepEqual(off, ['todos']);
});
