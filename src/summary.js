import { isDate, isIso } from '#todos';

// The summary that maney pushes and the phone only reads: the contract shape, `v: 1`.
export const MAX_NEXT_DUE = 10;
const STATES = ['expected', 'late', 'unknown'];
const COUNTS = ['ok', 'review', 'missing', 'pending'];

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const line = (value) => {
  if (!isObject(value)) return null;
  const { date, label, amountCents, state } = value;
  if (!isDate(date) || typeof label !== 'string' || !Number.isInteger(amountCents) || !STATES.includes(state)) return null;
  return { date, label, amountCents, state };
};

const holding = (value) => {
  if (!isObject(value)) return null;
  const { name, provider, valueCents, valuedOn } = value;
  if (typeof name !== 'string' || typeof provider !== 'string' || !Number.isInteger(valueCents) || !isDate(valuedOn)) return null;
  return { name, provider, valueCents, valuedOn };
};

// Each item through `clean`, or null when one is not valid.
const all = (list, clean) => {
  if (!Array.isArray(list)) return null;
  const items = list.map(clean);
  return items.every(Boolean) ? items : null;
};

// A clean summary, or null. `nextDue` comes back oldest date first.
export const normalizeSummary = (value) => {
  if (!isObject(value) || value.v !== 1) return null;
  if (!isIso(value.generatedAt) || typeof value.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)) return null;
  if (!isObject(value.status) || !COUNTS.every((name) => Number.isInteger(value.status[name]))) return null;
  if (!Array.isArray(value.nextDue) || value.nextDue.length > MAX_NEXT_DUE) return null;
  const nextDue = all(value.nextDue, line);
  const investments = all(value.investments, holding);
  if (!nextDue || !investments) return null;
  const { ok, review, missing, pending } = value.status;
  return {
    v: 1,
    generatedAt: value.generatedAt,
    month: value.month,
    status: { ok, review, missing, pending },
    nextDue: nextDue.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    investments,
  };
};
