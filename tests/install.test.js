import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installStart, installNext, showInstall } from '#install';

test('an app opened standalone starts installed, else idle', () => {
  assert.equal(installStart(true), 'installed');
  assert.equal(installStart(false), 'idle');
});

test('the prompt of the browser makes the install available', () => {
  assert.equal(installNext('idle', 'prompt'), 'available');
});

test('a dismissed prompt goes back to idle until the next prompt', () => {
  assert.equal(installNext('available', 'dismissed'), 'idle');
  assert.equal(installNext('idle', 'prompt'), 'available');
});

test('installed is final', () => {
  for (const event of ['prompt', 'dismissed', 'installed']) assert.equal(installNext('installed', event), 'installed');
  assert.equal(installNext('available', 'installed'), 'installed');
  assert.equal(installNext('idle', 'installed'), 'installed');
});

test('an unknown event changes nothing', () => {
  assert.equal(installNext('available', 'other'), 'available');
});

test('the Install button shows only while the install is available', () => {
  assert.deepEqual(['idle', 'available', 'installed'].map(showInstall), [false, true, false]);
});
