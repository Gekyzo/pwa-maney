// The queue of record changes, the merge of pulled records, the check of records and the field-level
// merge of a push (SYNC-4 to SYNC-7). Pure: no storage, no clock, no DOM. Every function returns new
// values and leaves its inputs alone.
import { recordKey, same } from '#records';
import { normalizeTodo } from '#todos';
import { normalizeReceipt } from '#receipts';
import { normalizeSummary } from '#summary';

const changeKey = (change) => recordKey(change.kind, change.key);

// One entry for each record: a later change replaces an earlier one and moves to the end.
export const enqueue = (queue, changes) => {
  const latest = new Map();
  for (const change of [...queue, ...changes]) {
    latest.delete(changeKey(change));
    latest.set(changeKey(change), change);
  }
  return [...latest.values()];
};

const plain = ({ kind, key, data }) => ({ kind, key, data });

// SYNC-5: a queued change wins over a pulled record. SYNC-6: a pulled record with `deleted` removes the record.
export const mergePulled = ({ local, server, queue, pulled }) => {
  const queued = new Set(queue.map(changeKey));
  const nextLocal = new Map(local);
  const nextServer = new Map(server);
  for (const rec of pulled) {
    const id = recordKey(rec.kind, rec.key);
    nextServer.set(id, rec);
    if (queued.has(id)) continue;
    if (rec.deleted) nextLocal.delete(id);
    else nextLocal.set(id, plain(rec));
  }
  return { local: nextLocal, server: nextServer };
};

// The check of each kind, with the key as the id. The summary has the one key `current`.
const CHECKS = {
  todo: ({ key, data }) => normalizeTodo({ ...data, id: key }),
  receipt: ({ key, data }) => normalizeReceipt({ ...data, id: key }),
  summary: ({ key, data }) => key === 'current' && normalizeSummary(data),
};

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// SYNC-7: each record is checked alone by its kind, so one bad record never empties the doc. A record
// of another kind is dropped.
export const validRecords = (records) => {
  const local = new Map();
  const dropped = [];
  for (const [id, rec] of records) {
    const check = Object.hasOwn(CHECKS, rec.kind) ? CHECKS[rec.kind] : null;
    if (check && isObject(rec.data) && check(rec)) local.set(id, rec);
    else dropped.push(id);
  }
  return { local, dropped };
};

export const cursorOf = (pulled, previous) =>
  pulled.reduce((greatest, rec) => (rec.updated > greatest ? rec.updated : greatest), previous);

const changed = (from, to, name) => from === null || !same(from[name], to[name]);

// SYNC-4: the server data with each field that the client changed since `base` put back, except a
// field that the server changed too: that one keeps the server value, and is overruled when it
// differs from the client one. With `base` null every field counts as changed on both sides.
export const mergeFields = (server, base, local) => {
  const data = structuredClone(server);
  const overruled = [];
  const names = [...new Set([...Object.keys(local), ...Object.keys(base ?? {})])];
  for (const name of names) {
    if (!changed(base, local, name)) continue;
    if (changed(base, server, name)) {
      if (!same(server[name], local[name])) overruled.push(name);
      continue;
    }
    if (Object.hasOwn(local, name)) data[name] = structuredClone(local[name]);
    else delete data[name];
  }
  // `doneAt` follows `done`: it is never named alone, and `done` names both.
  return { data, overruled: overruled.filter((name) => name !== 'doneAt') };
};

// The fields that the overruled toast names, each with its label `sync.field.<name>` (SYNC-4).
export const OVERRULED_FIELDS = ['text', 'due', 'done', 'takenOn', 'amountCents', 'shop', 'note', 'photo'];

// The overruled fields that the toast shows: each once, a name with no label left out.
export const shownFields = (names) => [...new Set(names)].filter((name) => OVERRULED_FIELDS.includes(name));
