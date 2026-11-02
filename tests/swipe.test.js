import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reached, settle } from '#swipe';

const sides = { start: 160, end: 160 };

test('settle opens the end side on a long drag to the left', () => {
  assert.equal(settle(-80, sides, null), 'end');
});

test('settle opens the start side on a long drag to the right', () => {
  assert.equal(settle(80, sides, null), 'start');
});

test('settle opens nothing on a short drag', () => {
  assert.equal(settle(-60, sides, null), null);
  assert.equal(settle(60, sides, null), null);
  assert.equal(settle(0, sides, null), null);
});

test('settle needs 40 px at least for a narrow side', () => {
  const narrow = { start: 72, end: 72 };
  assert.equal(settle(35, narrow, null), null);
  assert.equal(settle(45, narrow, null), 'start');
});

test('settle does not open a side that has no width', () => {
  assert.equal(settle(200, { start: 0, end: 160 }, null), null);
  assert.equal(settle(-200, { start: 160, end: 0 }, null), null);
});

test('settle closes an open side on a long drag back', () => {
  assert.equal(settle(-80, sides, 'start'), null);
  assert.equal(settle(80, sides, 'end'), null);
});

test('settle keeps an open side on a short drag or a drag further out', () => {
  assert.equal(settle(-30, sides, 'start'), 'start');
  assert.equal(settle(30, sides, 'end'), 'end');
  assert.equal(settle(50, sides, 'start'), 'start');
  assert.equal(settle(-50, sides, 'end'), 'end');
});

test('settle opens the other side on a drag across the row', () => {
  assert.equal(settle(-260, sides, 'start'), 'end');
  assert.equal(settle(260, sides, 'end'), 'start');
  assert.equal(settle(-260, { start: 160, end: 0 }, 'start'), null);
});

test('reached needs 35 % of a wide row', () => {
  assert.equal(reached(139, 400), false);
  assert.equal(reached(140, 400), true);
  assert.equal(reached(300, 400), true);
});

test('reached needs 80 px at least on a narrow row', () => {
  assert.equal(reached(79, 120), false);
  assert.equal(reached(80, 120), true);
});

test('reached is false with no drag or a drag to the left', () => {
  assert.equal(reached(0, 400), false);
  assert.equal(reached(-200, 400), false);
});
