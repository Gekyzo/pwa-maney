import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropIndex, shifts, moveTo } from '#reorder';

// Four rows of 56 px.
const tops = [0, 56, 112, 168];
const heights = [56, 56, 56, 56];

test('dropIndex keeps the place for a small move', () => {
  assert.equal(dropIndex(tops, heights, 1, 56), 1);
  assert.equal(dropIndex(tops, heights, 1, 80), 1);
  assert.equal(dropIndex(tops, heights, 1, 30), 1);
});

test('dropIndex takes the place of a neighbour when the leading edge passes its centre', () => {
  assert.equal(dropIndex(tops, heights, 1, 84), 1);
  assert.equal(dropIndex(tops, heights, 1, 85), 2);
  assert.equal(dropIndex(tops, heights, 1, 28), 1);
  assert.equal(dropIndex(tops, heights, 1, 27), 0);
});

test('dropIndex gives the end place to a row that is on it', () => {
  assert.equal(dropIndex(tops, heights, 1, 168), 3);
  assert.equal(dropIndex(tops, heights, 2, 0), 0);
});

test('dropIndex passes more than one row', () => {
  assert.equal(dropIndex(tops, heights, 0, 170), 3);
  assert.equal(dropIndex(tops, heights, 3, 50), 1);
});

test('dropIndex stops at the two ends', () => {
  assert.equal(dropIndex(tops, heights, 1, 5000), 3);
  assert.equal(dropIndex(tops, heights, 2, -5000), 0);
});

test('dropIndex uses the height of each row', () => {
  // The second row is tall: its centre is at 56 + 60.
  const tall = { tops: [0, 56, 176], heights: [56, 120, 56] };
  assert.equal(dropIndex(tall.tops, tall.heights, 0, 60), 0);
  assert.equal(dropIndex(tall.tops, tall.heights, 0, 61), 1);
});

test('shifts opens the gap below for a move down', () => {
  assert.deepEqual(shifts(4, 0, 2, 56), [0, -56, -56, 0]);
});

test('shifts opens the gap above for a move up', () => {
  assert.deepEqual(shifts(4, 3, 1, 56), [0, 56, 56, 0]);
});

test('shifts moves no row for the same place', () => {
  assert.deepEqual(shifts(3, 1, 1, 56), [0, 0, 0]);
});

test('moveTo moves an id down, up and to the same place', () => {
  assert.deepEqual(moveTo(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveTo(['a', 'b', 'c', 'd'], 3, 1), ['a', 'd', 'b', 'c']);
  assert.deepEqual(moveTo(['a', 'b', 'c'], 1, 1), ['a', 'b', 'c']);
});

test('moveTo does not change its input', () => {
  const ids = ['a', 'b', 'c'];
  moveTo(ids, 0, 2);
  assert.deepEqual(ids, ['a', 'b', 'c']);
});
