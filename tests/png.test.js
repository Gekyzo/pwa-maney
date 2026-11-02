import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodePng, decodePng, clearWhite, resizeRgba } from '../scripts/png.mjs';

const build = (size, pixel) => Buffer.from(Array.from({ length: size * size }, (_, n) => pixel(n)).flat());

test('decodePng gives back the pixels that encodePng wrote', () => {
  const rgba = build(3, (n) => [n * 20, 255 - n * 20, n, n % 2 ? 255 : 128]);
  assert.deepEqual(decodePng(encodePng(3, rgba)), { width: 3, height: 3, rgba });
});

test('decodePng reads the filters of a PNG from another encoder', () => {
  const { width, height, rgba } = decodePng(readFileSync(new URL('../icons/source.png', import.meta.url)));
  assert.equal(width, height);
  assert.equal(rgba.length, width * height * 4);
  assert.deepEqual([...rgba.subarray(0, 4)], [255, 255, 255, 255]);
  assert.deepEqual(decodePng(encodePng(width, rgba)).rgba, rgba);
});

test('decodePng rejects data that is not a PNG', () => {
  assert.throws(() => decodePng(Buffer.from('not a png')), /not a PNG/);
});

test('decodePng rejects a format other than 8-bit RGBA without interlace', () => {
  const png = encodePng(1, Buffer.from([1, 2, 3, 4]));
  for (const [offset, value] of [[24, 16], [25, 2], [28, 1]]) {
    const other = Buffer.from(png);
    other[offset] = value;
    assert.throws(() => decodePng(other), /8-bit RGBA/);
  }
});

test('clearWhite makes the white that touches the edge transparent and keeps a white inside the art', () => {
  // 5x5: white frame, a red ring, a white centre the ring closes in.
  const red = [200, 0, 0, 255];
  const white = [255, 255, 255, 255];
  const ring = (x, y) => x >= 1 && x <= 3 && y >= 1 && y <= 3 && !(x === 2 && y === 2);
  const rgba = build(5, (n) => (ring(n % 5, Math.floor(n / 5)) ? red : white));
  const out = clearWhite({ width: 5, height: 5, rgba });
  const pixel = (x, y) => [...out.subarray((y * 5 + x) * 4, (y * 5 + x) * 4 + 4)];
  assert.equal(pixel(0, 0)[3], 0);
  assert.equal(pixel(4, 2)[3], 0);
  assert.deepEqual(pixel(1, 1), red);
  assert.deepEqual(pixel(2, 2), white);
});

test('clearWhite turns an edge blended with the white into the colour at part alpha', () => {
  // A pink pixel at the edge is red at half alpha over white.
  const rgba = Buffer.from([255, 255, 255, 255, 255, 128, 128, 255, 255, 0, 0, 255]);
  const out = clearWhite({ width: 3, height: 1, rgba });
  assert.deepEqual([...out.subarray(4, 8)], [255, 0, 0, 127]);
  assert.deepEqual([...out.subarray(8, 12)], [255, 0, 0, 255]);
});

test('resizeRgba averages with the alpha, so a transparent pixel gives no colour', () => {
  const rgba = Buffer.from([0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255]);
  const out = resizeRgba({ width: 2, height: 2, rgba }, 1);
  assert.deepEqual([...out], [255, 0, 0, 128]);
});
