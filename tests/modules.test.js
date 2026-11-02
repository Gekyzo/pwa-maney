import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, switchModule, visibleSections } from '#modules';

test('MODULES is notes', () => {
  assert.deepEqual(MODULES, ['notes']);
});

test('visibleSections with no module off is the full navigation', () => {
  assert.deepEqual(visibleSections([]), ['notes', 'settings']);
});

test('visibleSections without notes keeps settings', () => {
  assert.deepEqual(visibleSections(['notes']), ['settings']);
});

test('visibleSections ignores an unknown id', () => {
  assert.deepEqual(visibleSections(['shops']), ['notes', 'settings']);
});

test('switchModule turns a module off and on', () => {
  assert.deepEqual(switchModule([], 'notes', false), ['notes']);
  assert.deepEqual(switchModule(['notes'], 'notes', true), []);
  assert.deepEqual(switchModule([], 'notes', true), []);
});

test('switchModule ignores an unknown id and does not change its input', () => {
  const off = ['notes'];
  assert.deepEqual(switchModule(off, 'shops', false), ['notes']);
  assert.deepEqual(off, ['notes']);
});
