import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CENTS, parseEuros, formatCents } from '#money';

test('parseEuros reads euros as integer cents', () => {
  const cases = { '12,50': 1250, '12.5': 1250, '0,99': 99, ' 7 ': 700, '7 €': 700, '7€': 700, '9999999,99': MAX_CENTS };
  for (const [text, cents] of Object.entries(cases)) assert.equal(parseEuros(text), cents, text);
});

test('parseEuros refuses what is not an amount above 0', () => {
  for (const text of ['', '0', '0,00', '-3', '1.234', '12,345', '1.234,56', 'abc', '10000000', '7 € €', null, undefined]) {
    assert.equal(parseEuros(text), null, String(text));
  }
});

test('MAX_CENTS is 999999999', () => {
  assert.equal(MAX_CENTS, 999999999);
});

test('formatCents writes de-DE euros (a no-break space before the sign)', () => {
  assert.equal(formatCents(-123456), '-1.234,56 €');
  assert.equal(formatCents(5), '0,05 €');
  assert.equal(formatCents(0), '0,00 €');
});
