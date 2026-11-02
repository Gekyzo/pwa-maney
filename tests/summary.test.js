import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSummary } from '#summary';

const example = () => ({
  v: 1,
  generatedAt: '2026-11-02T09:30:00.000Z',
  month: '2026-11',
  status: { ok: 40, review: 3, missing: 1, pending: 2 },
  nextDue: [
    { date: '2026-11-03', label: 'Rent', amountCents: -85000, state: 'expected' },
    { date: '2026-11-05', label: 'Payslip', amountCents: 250000, state: 'late' },
  ],
  investments: [{ name: 'Fund', provider: 'Broker', valueCents: 1234500, valuedOn: '2026-10-31' }],
});

test('the contract example passes unchanged', () => {
  const value = example();
  assert.deepEqual(normalizeSummary(value), example());
  assert.deepEqual(value, example());
});

test('an empty summary passes', () => {
  const value = { ...example(), nextDue: [], investments: [] };
  assert.deepEqual(normalizeSummary(value), value);
});

test('unknown fields are dropped', () => {
  const value = { ...example(), extra: 1, status: { ...example().status, more: 2 } };
  assert.deepEqual(normalizeSummary(value), example());
});

test('nextDue comes back oldest date first', () => {
  const value = example();
  value.nextDue.reverse();
  assert.deepEqual(normalizeSummary(value).nextDue.map((line) => line.date), ['2026-11-03', '2026-11-05']);
});

test('a value that is not the contract shape gives null', () => {
  const line = (n) => ({ date: '2026-11-03', label: `l${n}`, amountCents: n, state: 'expected' });
  const mutate = (change) => {
    const value = example();
    change(value);
    return value;
  };
  const bad = [
    null,
    42,
    {},
    mutate((v) => { v.v = 2; }),
    mutate((v) => { v.status.ok = 1.5; }),
    mutate((v) => { v.status.review = '3'; }),
    mutate((v) => { delete v.status.missing; }),
    mutate((v) => { v.nextDue = Array.from({ length: 11 }, (_, n) => line(n)); }),
    mutate((v) => { v.nextDue[0].state = 'done'; }),
    mutate((v) => { v.nextDue[0].amountCents = 1.5; }),
    mutate((v) => { v.nextDue[0].date = '2026-02-30'; }),
    mutate((v) => { v.month = '2026-13'; }),
    mutate((v) => { v.generatedAt = 'yesterday'; }),
    mutate((v) => { v.investments[0].valuedOn = 'x'; }),
    mutate((v) => { v.investments[0].valueCents = 'a'; }),
    mutate((v) => { v.investments = null; }),
  ];
  for (const value of bad) assert.equal(normalizeSummary(value), null, JSON.stringify(value));
});

test('ten nextDue lines pass', () => {
  const value = example();
  value.nextDue = Array.from({ length: 10 }, (_, n) => ({ date: '2026-11-03', label: `l${n}`, amountCents: n, state: 'unknown' }));
  assert.equal(normalizeSummary(value).nextDue.length, 10);
});
