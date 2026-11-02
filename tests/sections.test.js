import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECTIONS, direction, slideDirection, slideTo } from '#sections';

// A longer list than the template's, so that a slide has a middle section to pass.
const FIVE = ['a', 'b', 'c', 'd', 'settings'];

test('SECTIONS has the order of the navigation', () => {
  assert.deepEqual(SECTIONS, ['notes', 'settings']);
});

test('slideDirection is 1 for a slide to the left and -1 for a slide to the right', () => {
  assert.equal(slideDirection(-80, 0), 1);
  assert.equal(slideDirection(80, 0), -1);
});

test('slideDirection is 0 for a short slide', () => {
  assert.equal(slideDirection(-59, 0), 0);
  assert.equal(slideDirection(59, 0), 0);
  assert.equal(slideDirection(0, 0), 0);
  assert.equal(slideDirection(-60, 0), 1);
});

test('slideDirection is 0 for a slide that is not horizontal', () => {
  assert.equal(slideDirection(-80, 41), 0);
  assert.equal(slideDirection(80, -120), 0);
  assert.equal(slideDirection(-80, 40), 1);
  assert.equal(slideDirection(80, -40), -1);
});

test('slideTo goes between the sections of the template', () => {
  assert.equal(slideTo('notes', -80, 0), 'settings');
  assert.equal(slideTo('settings', 80, 0), 'notes');
});

test('slideTo goes to the next section on a slide to the left', () => {
  assert.equal(slideTo('a', -80, 0, FIVE), 'b');
  assert.equal(slideTo('d', -80, 0, FIVE), 'settings');
});

test('slideTo goes to the previous section on a slide to the right', () => {
  assert.equal(slideTo('settings', 80, 0, FIVE), 'd');
  assert.equal(slideTo('b', 80, 0, FIVE), 'a');
});

test('slideTo stops at the first and at the last section', () => {
  assert.equal(slideTo('notes', 200, 0), null);
  assert.equal(slideTo('settings', -200, 0), null);
});

test('slideTo ignores a short slide and a slide that is not horizontal', () => {
  assert.equal(slideTo('b', -59, 0, FIVE), null);
  assert.equal(slideTo('b', -80, 41, FIVE), null);
  assert.equal(slideTo('b', -80, -40, FIVE), 'c');
});

test('slideTo ignores a view that is not a section', () => {
  assert.equal(slideTo('other', -80, 0), null);
  assert.equal(slideTo('other', 80, 0), null);
});

test('direction is 1 towards a later section and -1 towards an earlier one', () => {
  assert.equal(direction('notes', 'settings'), 1);
  assert.equal(direction('settings', 'notes'), -1);
  assert.equal(direction('a', 'd', FIVE), 1);
});

test('direction is 0 for the same section and for a view that is not a section', () => {
  assert.equal(direction('notes', 'notes'), 0);
  assert.equal(direction('other', 'notes'), 0);
  assert.equal(direction('notes', 'other'), 0);
});

test('slideTo skips the sections that are not in the given list', () => {
  assert.equal(slideTo('a', -80, 0, ['a', 'c', 'settings']), 'c');
  assert.equal(slideTo('c', 80, 0, ['a', 'c', 'settings']), 'a');
});
