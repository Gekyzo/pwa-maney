// The doc as records, one for each to-do and receipt and one for the summary (SYNC-1), and the diff of
// two such sets. Pure: no storage, no clock, no DOM.
export const recordKey = (kind, key) => `${kind}:${key}`;

const SUMMARY_KEY = 'current';

const asRecords = (kind, items) => items.map(({ id, ...data }) => [recordKey(kind, id), { kind, key: id, data }]);

export const toRecords = (doc) =>
  new Map([
    ...asRecords('todo', doc.todos),
    ...asRecords('receipt', doc.receipts),
    ...(doc.summary ? [[recordKey('summary', SUMMARY_KEY), { kind: 'summary', key: SUMMARY_KEY, data: doc.summary }]] : []),
  ]);

const itemsOf = (records, kind) => [...records.values()].filter((rec) => rec.kind === kind).map(({ key, data }) => ({ ...data, id: key }));

// The order of the map; a record of another kind is left out. The result is not validated.
export const fromRecords = (records) => ({
  version: 1,
  todos: itemsOf(records, 'todo'),
  receipts: itemsOf(records, 'receipt'),
  summary: records.get(recordKey('summary', SUMMARY_KEY))?.data ?? null,
});

const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((name) => [name, canonical(value[name])]));
  }
  return value;
};

export const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

// True when two sets hold the same records with equal data, the summary too.
export const sameRecords = (a, b) => a.size === b.size && [...a].every(([id, rec]) => b.has(id) && same(rec.data, b.get(id).data));

// SYNC-13: the phone never writes the summary, so it gives no change.
const phoneWrites = (rec) => rec.kind !== 'summary';

// A receipt delete names its photo, so that the file can go too (SYNC-1).
const deleteOf = ({ kind, key, data }) => (kind === 'receipt' ? { kind, key, op: 'delete', photo: data?.photo ?? null } : { kind, key, op: 'delete' });

// Deletes first, then upserts, each by record id.
export const diffRecords = (prev, next) => {
  const deletes = [...prev.keys()]
    .filter((id) => !next.has(id) && phoneWrites(prev.get(id)))
    .sort(byKey)
    .map((id) => deleteOf(prev.get(id)));
  const upserts = [...next.keys()]
    .filter((id) => phoneWrites(next.get(id)) && (!prev.has(id) || !same(prev.get(id).data, next.get(id).data)))
    .sort(byKey)
    .map((id) => ({ kind: next.get(id).kind, key: next.get(id).key, op: 'upsert', data: next.get(id).data }));
  return [...deletes, ...upserts];
};
