import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncer, reloadsOn, SYNC_KEY, QUEUE_KEY } from '#syncer';
import { PocketBaseError } from '#pocketbase';
import { saveSession, loadSession, SESSION_KEY, OFFLINE_KEY } from '#session';
import { LANGUAGE_KEY } from '#storage';
import { normalizeDoc, emptyDoc, DOC_KEY } from '#doc';
import { mergeFields } from '#sync';
import { toRecords } from '#records';

const todo = (id, text = id) => ({ id, text, due: null, done: false, doneAt: null });
const docOf = (...todos) => normalizeDoc({ version: 1, todos, receipts: [], summary: null });

const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const tokenOf = (id, n = 0) => `${base64url({ alg: 'none' })}.${base64url({ id, exp: 4_000_000_000, n })}.sig`;
const sessionOf = (id, approved = true) => ({ token: tokenOf(id), user: { id, email: `${id}@example.test`, name: id, approved } });

const fakeStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
};

const storedSync = (storage) => JSON.parse(storage.getItem(SYNC_KEY));
const storedQueue = (storage) => JSON.parse(storage.getItem(QUEUE_KEY) ?? '[]');

// An in-memory server of one owner's records, with increasing `updated` strings.
const fakeServer = () => {
  let clock = 0;
  const rows = [];
  const stamp = () => {
    clock += 1;
    return `2026-10-31 07:00:00.${String(clock).padStart(3, '0')}Z`;
  };
  return {
    rows,
    files: [],
    add: (owner, { id: key, ...data }, kind = 'todo') => rows.push({ id: `pb${rows.length + 1}`, owner, kind, key, data, deleted: false, updated: stamp() }),
    // A write of the other client (maney): the fields of `patch` go into the data of the record.
    edit: (kind, key, patch) => {
      const row = rows.find((r) => r.kind === kind && r.key === key);
      Object.assign(row, { data: { ...row.data, ...patch } }, patch.deleted ? { deleted: true, data: row.data } : {}, { updated: stamp() });
    },
    stamp,
  };
};

const ownerOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).id;
const recOf = ({ owner: _, ...row }) => ({ ...row });

const fakeClient = (server) => {
  const calls = [];
  const client = {
    calls,
    order: [],
    finds: [],
    pushed: [],
    bases: [],
    pushes: 0,
    failPush: null,
    failPull: null,
    failRefresh: null,
    hold: null,
    streams: [],
    refresh: async (token) => {
      calls.push('refresh');
      if (client.failRefresh) throw client.failRefresh;
      const id = ownerOf(token);
      return { token: tokenOf(id, calls.length), user: { id, email: `${id}@example.test`, name: id, approved: true } };
    },
    pull: async (token, since, owner) => {
      calls.push('pull');
      if (client.hold) await client.hold('pull');
      if (client.failPull) throw client.failPull;
      return server.rows
        .filter((row) => row.owner === owner && (!since || row.updated >= since))
        .sort((a, b) => (a.updated < b.updated ? -1 : 1))
        .map(recOf);
    },
    // As the real client (SYNC-4): a found record whose `updated` is not the base one gets the merge of mergeFields.
    push: async (token, change, owner, base) => {
      calls.push('push');
      client.order.push(`push:${change.kind}:${change.key}`);
      client.pushes += 1;
      client.bases.push(base);
      const failure = client.failPush?.(client.pushes, change);
      if (failure) throw failure;
      client.pushed.push(change);
      let row = server.rows.find((r) => r.owner === owner && r.kind === change.kind && r.key === change.key);
      if (!row && change.op === 'delete') return { rec: null, overruled: [] };
      let overruled = [];
      let data = change.data;
      if (!row) {
        row = { id: `pb${server.rows.length + 1}`, owner, kind: change.kind, key: change.key };
        server.rows.push(row);
      } else if (change.op === 'upsert' && base && row.updated !== base.updated) {
        ({ data, overruled } = mergeFields(row.data, base.data, change.data));
      }
      Object.assign(row, change.op === 'delete' ? { deleted: true } : { deleted: false, data }, { updated: server.stamp() });
      // The server took the change, but its answer is lost on the way back.
      if (client.loseAnswer?.(client.pushes, change)) throw new PocketBaseError('network');
      return { rec: recOf(row), overruled };
    },
    // The files of `maney_files` (SYNC-14, SYNC-15).
    uploadPhoto: async (token, { key, blob }, owner) => {
      client.order.push(`uploadPhoto:${key}`);
      const failure = client.failUpload?.(key);
      if (failure) throw failure;
      let file = server.files.find((f) => f.owner === owner && f.key === key);
      if (!file) {
        file = { id: `f${server.files.length + 1}`, owner, key };
        server.files.push(file);
      }
      Object.assign(file, { photo: `${key}.jpg`, blob, deleted: false });
      return { id: file.id, key, photo: file.photo };
    },
    // A file of the owner by key, tombstone or not, or null (SYNC-14).
    findPhoto: async (token, key, owner) => {
      client.finds.push(key);
      const file = server.files.find((f) => f.owner === owner && f.key === key);
      return file ? { id: file.id, key, photo: file.photo, deleted: file.deleted === true } : null;
    },
    deletePhoto: async (token, key, owner) => {
      client.order.push(`deletePhoto:${key}`);
      const file = server.files.find((f) => f.owner === owner && f.key === key);
      if (!file) return null;
      file.deleted = true;
      return { id: file.id, key, photo: file.photo, deleted: true };
    },
    subscribe: (tokenFn, onChange, { onReconnect }) => {
      const stream = { tokenFn, onChange, onReconnect, closed: false };
      client.streams.push(stream);
      return () => {
        stream.closed = true;
      };
    },
  };
  return client;
};

// A PhotoStore backed by a Map, as the in-memory store of #photostore.
const fakePhotos = () => {
  const map = new Map();
  return {
    map,
    put: async (key, blob) => { map.set(key, blob); },
    get: async (key) => map.get(key) ?? null,
    remove: async (key) => { map.delete(key); },
    keys: async () => [...map.keys()],
    clear: async () => { map.clear(); },
  };
};

const START = Date.parse('2026-10-31T08:00:00Z');

// A device: its storage, its doc, a clock and timers that run only when the test says so.
const device = ({ server = fakeServer(), user = 'u1', doc = emptyDoc(), synced = true, storage: given, lost, local, photos = fakePhotos() } = {}) => {
  const storage = given ?? fakeStorage();
  if (!given) {
    saveSession(storage, sessionOf(user));
    if (synced) storage.setItem(SYNC_KEY, JSON.stringify({ owner: user, cursor: '', server: [], local: local ?? [...toRecords(doc)], lastSync: null }));
  }
  const client = fakeClient(server);
  const box = { doc, statuses: [], overruled: [], timers: [], sets: 0, clock: START };
  const syncer = createSyncer({
    client,
    storage,
    getDoc: () => box.doc,
    // As the app: a doc that cannot be saved stays out, and setDoc gives false.
    setDoc: (next) => {
      box.sets += 1;
      if (box.failSet) return false;
      box.doc = next;
      return true;
    },
    now: () => box.clock,
    onStatus: (status) => box.statuses.push(status),
    onOverruled: (fields) => box.overruled.push(fields),
    setTimer: (fn, ms) => {
      const timer = { fn, ms, cleared: false };
      box.timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      if (timer) timer.cleared = true;
    },
    lost,
    photos,
  });
  // Saves a doc as the app does: it puts it in place, then tells the syncer.
  const save = (next, options) => {
    box.doc = next;
    syncer.notify(next, options);
  };
  const live = () => box.timers.filter((timer) => !timer.cleared);
  return { storage, client, server, box, syncer, save, live, photos };
};

// A gate that holds a call of the client until the test opens it.
const gate = () => {
  let open;
  const opened = new Promise((resolve) => {
    open = resolve;
  });
  return { opened, open };
};

test('a save queues its diff and a run 1500 ms later sends it, empties the queue and stores lastSync (SYNC-2, SYNC-3, SYNC-4)', async () => {
  const d = device();
  d.save(docOf(todo('a', 'Shirt')));
  assert.deepEqual(storedQueue(d.storage).map(({ key, op }) => [key, op]), [['a', 'upsert']]);
  assert.equal(d.client.calls.length, 0);
  const [timer] = d.live();
  assert.equal(timer.ms, 1500);
  assert.equal(await timer.fn(), 'ok');
  assert.deepEqual(d.client.pushed.map(({ key }) => key), ['a']);
  assert.deepEqual(storedQueue(d.storage), []);
  assert.equal(storedSync(d.storage).lastSync, new Date(START).toISOString());
  assert.equal(d.syncer.status().pending, 0);
  assert.equal(d.syncer.status().lastSync, new Date(START).toISOString());
});

test('a new save within 1500 ms starts the delay again (SYNC-3)', () => {
  const d = device();
  d.save(docOf(todo('a')));
  d.save(docOf(todo('a'), todo('b')));
  assert.equal(d.live().length, 1);
  assert.equal(d.box.timers.length, 2);
  assert.equal(d.syncer.status().pending, 2);
});

test('a save of a device with no account queues nothing (SYNC-2)', () => {
  const d = device();
  d.storage.removeItem(SESSION_KEY);
  d.save(docOf(todo('a')));
  assert.equal(d.syncer.status().pending, 0);
  assert.equal(d.live().length, 0);
});

test('a network error keeps the queue and reports online false (SYNC-4, SYNC-11)', async () => {
  const d = device();
  d.save(docOf(todo('a')));
  d.client.failPush = () => new PocketBaseError('network');
  assert.equal(await d.syncer.run(), 'offline');
  assert.equal(storedQueue(d.storage).length, 1);
  assert.equal(d.syncer.status().online, false);
  assert.equal(d.box.statuses.at(-1).online, false);
});

test('a 429 keeps the queue and schedules a retry at 5000, then at 15000 (SYNC-3)', async () => {
  const d = device();
  d.save(docOf(todo('a')));
  d.client.failPush = () => new PocketBaseError('rate', 429);
  assert.equal(await d.syncer.run(), 'rate');
  assert.equal(d.syncer.status().online, true);
  const first = d.live().at(-1);
  assert.equal(first.ms, 5000);
  assert.equal(await first.fn(), 'rate');
  assert.equal(d.live().at(-1).ms, 15000);
  assert.equal(storedQueue(d.storage).length, 1);
});

test('a 5xx retries too, as offline; a run that reaches the server ends the series (SYNC-3, SYNC-11)', async () => {
  const d = device();
  d.save(docOf(todo('a')));
  d.client.failPush = () => new PocketBaseError('server', 503);
  assert.equal(await d.syncer.run(), 'offline');
  assert.equal(d.live().at(-1).ms, 5000);
  d.client.failPush = null;
  assert.equal(await d.live().at(-1).fn(), 'ok');
  d.client.failPush = () => new PocketBaseError('server', 503);
  d.save(docOf(todo('a', 'Other')));
  await d.syncer.run();
  assert.equal(d.live().at(-1).ms, 5000);
});

test('a 400 with field errors drops that change and goes on (SYNC-4)', async () => {
  const d = device();
  d.save(docOf(todo('a'), todo('b')));
  d.client.failPush = (n) => (n === 1 ? new PocketBaseError('invalid', 400, { data: { code: 'validation_invalid' } }) : null);
  assert.equal(await d.syncer.run(), 'ok');
  assert.deepEqual(d.client.pushed.map(({ key }) => key), ['b']);
  assert.deepEqual(storedQueue(d.storage), []);
});

test('an auth error stops the sync, keeps the queue and sets auth; the next run makes no request (SYNC-4)', async () => {
  const d = device();
  d.save(docOf(todo('a')));
  d.client.failPush = () => new PocketBaseError('auth', 401);
  assert.equal(await d.syncer.run(), 'auth');
  assert.equal(storedQueue(d.storage).length, 1);
  assert.equal(d.syncer.status().auth, true);
  const before = d.client.calls.length;
  assert.equal(await d.syncer.run(), 'auth');
  assert.equal(d.client.calls.length, before);
  const timers = d.box.timers.length;
  d.save(docOf(todo('a'), todo('b')));
  assert.equal(d.syncer.status().pending, 2);
  assert.equal(d.box.timers.length, timers);
});

test('a 400 with no field error is a refused rule: an auth stop (SYNC-4)', async () => {
  const d = device();
  d.save(docOf(todo('a')));
  d.client.failPush = () => new PocketBaseError('invalid', 400, {});
  assert.equal(await d.syncer.run(), 'auth');
});

test('the token is refreshed when the last refresh is older than 600000 ms (SYNC-4)', async () => {
  const d = device();
  await d.syncer.run();
  assert.equal(d.client.calls.filter((call) => call === 'refresh').length, 1);
  d.box.clock = START + 600_000;
  await d.syncer.run();
  assert.equal(d.client.calls.filter((call) => call === 'refresh').length, 1);
  d.box.clock = START + 600_001;
  await d.syncer.run();
  assert.equal(d.client.calls.filter((call) => call === 'refresh').length, 2);
  assert.equal(loadSession(d.storage).token, tokenOf('u1', 4));
});

test('an expired token is refreshed at once (SYNC-4)', async () => {
  const d = device();
  await d.syncer.run();
  const expired = { ...sessionOf('u1'), token: `${base64url({ alg: 'none' })}.${base64url({ id: 'u1', exp: START / 1000 + 30 })}.sig` };
  saveSession(d.storage, expired);
  await d.syncer.run();
  assert.equal(d.client.calls.filter((call) => call === 'refresh').length, 2);
});

test('a run pulls the account, merges it into the doc and moves the cursor (SYNC-4)', async () => {
  const server = fakeServer();
  server.add('u1', docOf(todo('a', 'Coat')).todos[0]);
  const d = device({ server });
  assert.equal(await d.syncer.run(), 'ok');
  assert.deepEqual(d.box.doc.todos.map(({ text }) => text), ['Coat']);
  assert.equal(storedSync(d.storage).cursor, server.rows[0].updated);
  assert.equal(d.syncer.status().pending, 0);
});

test('a pulled record that the check refuses is dropped alone (SYNC-7)', async () => {
  const server = fakeServer();
  server.add('u1', docOf(todo('a', 'Coat')).todos[0]);
  server.add('u1', { ...docOf(todo('b', 'Hat')).todos[0], text: '' });
  const d = device({ server });
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  try {
    assert.equal(await d.syncer.run(), 'ok');
  } finally {
    console.error = original;
  }
  assert.deepEqual(d.box.doc.todos.map(({ id }) => id), ['a']);
  assert.equal(errors.length, 1);
  assert.equal(d.syncer.status().pending, 0);
});

test('lost with an empty doc pulls the account and queues no delete (SYNC-2)', async () => {
  const server = fakeServer();
  const coat = docOf(todo('a', 'Coat'));
  server.add('u1', coat.todos[0]);
  const d = device({ server, lost: true, local: [...toRecords(coat)] });
  assert.equal(await d.syncer.run(), 'ok');
  assert.deepEqual(d.client.pushed, []);
  assert.deepEqual(d.box.doc.todos.map(({ text }) => text), ['Coat']);
});

// The console.error of the SYNC-2 guard is expected in these tests.
const quiet = async (fn) => {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
};

test('a save with none of the to-dos of the account sends no delete of them, unless explicit (SYNC-2)', async () => {
  const server = fakeServer();
  const coat = docOf(todo('a', 'Coat'));
  server.add('u1', coat.todos[0]);
  const d = device({ server, local: [...toRecords(coat)] });
  await quiet(() => {
    d.save(docOf(todo('b', 'Hat')));
    assert.deepEqual(storedQueue(d.storage).map(({ key, op }) => [key, op]), [['b', 'upsert']]);
    d.save(docOf(todo('b', 'Hat')), { explicit: true });
  });
  assert.deepEqual(storedQueue(d.storage).map(({ key, op }) => [key, op]), [['b', 'upsert'], ['a', 'delete']]);
});

test('a todo added to a doc that fell back to empty reaches the server and stays in the doc (SYNC-2)', async () => {
  const server = fakeServer();
  const coat = docOf(todo('a', 'Coat'));
  server.add('u1', coat.todos[0]);
  const d = device({ server, local: [...toRecords(coat)] });
  await quiet(async () => {
    d.save(docOf(todo('b', 'Hat')));
    d.save(docOf(todo('b', 'Hat'), todo('c', 'Scarf')));
    d.save(docOf(todo('b', 'Hat')));
    assert.equal(await d.syncer.run(), 'ok');
  });
  // The todo that the user added and deleted again goes as a delete; the coat gets none.
  assert.deepEqual(d.client.pushed.map(({ key, op }) => [key, op]), [['b', 'upsert'], ['c', 'delete']]);
  assert.deepEqual(d.box.doc.todos.map(({ id }) => id).sort(), ['a', 'b']);
  assert.deepEqual(server.rows.filter((row) => !row.deleted).map(({ key }) => key).sort(), ['a', 'b']);
  assert.equal(d.syncer.status().pending, 0);
});

test('a refused save keeps its todo across a restart before the merge (SYNC-2)', async () => {
  const server = fakeServer();
  const coat = docOf(todo('a', 'Coat'));
  server.add('u1', coat.todos[0]);
  const d = device({ server, local: [...toRecords(coat)] });
  await quiet(() => d.save(docOf(todo('b', 'Hat'))));
  const again = device({ server, storage: d.storage, doc: d.box.doc });
  assert.equal(await quiet(() => again.syncer.run()), 'ok');
  assert.ok(again.client.pushed.every(({ op }) => op === 'upsert'));
  assert.deepEqual(again.box.doc.todos.map(({ id }) => id).sort(), ['a', 'b']);
});

test('a user who deletes the to-dos one by one still sends the deletes (SYNC-2)', () => {
  const both = docOf(todo('a'), todo('b'));
  const d = device({ doc: both });
  d.save(docOf(todo('b')));
  d.save(emptyDoc());
  assert.deepEqual(storedQueue(d.storage).map(({ key, op }) => [key, op]), [['a', 'delete'], ['b', 'delete']]);
});

test('a save during a run survives the merge (SYNC-5)', async () => {
  const server = fakeServer();
  server.add('u1', docOf(todo('a', 'Coat')).todos[0]);
  const d = device({ server });
  const held = gate();
  const arrived = gate();
  d.client.hold = () => {
    arrived.open();
    return held.opened;
  };
  const running = d.syncer.run();
  await arrived.opened;
  d.save(docOf(todo('b', 'Hat')));
  held.open();
  assert.equal(await running, 'ok');
  assert.deepEqual(d.box.doc.todos.map(({ id }) => id).sort(), ['a', 'b']);
  assert.deepEqual(storedQueue(d.storage).map(({ key }) => key), ['b']);
});

test('the merge does not queue what it puts in place (SYNC-2)', async () => {
  const server = fakeServer();
  server.add('u1', docOf(todo('a', 'Coat')).todos[0]);
  const d = device({ server });
  await d.syncer.run();
  await d.syncer.run();
  assert.deepEqual(d.client.pushed, []);
  assert.equal(d.syncer.status().pending, 0);
});

test('a run while one runs gets the promise of that run', async () => {
  const d = device();
  const first = d.syncer.run();
  assert.equal(d.syncer.run(), first);
  await first;
});

test('reset during a run makes the run save nothing', async () => {
  const server = fakeServer();
  server.add('u1', docOf(todo('a', 'Coat')).todos[0]);
  const d = device({ server, doc: docOf(todo('b')) });
  const held = gate();
  const arrived = gate();
  d.client.hold = () => {
    arrived.open();
    return held.opened;
  };
  const running = d.syncer.run();
  await arrived.opened;
  d.syncer.reset();
  const sets = d.box.sets;
  held.open();
  assert.equal(await running, 'ok');
  assert.equal(d.box.sets, sets);
  assert.deepEqual(d.box.doc, emptyDoc());
  assert.equal(d.storage.getItem(SYNC_KEY), null);
  assert.equal(d.storage.getItem(QUEUE_KEY), null);
  assert.equal(d.storage.getItem(SESSION_KEY), null);
  assert.equal(d.syncer.status().lastSync, null);
});

const ids = (doc) => doc.todos.map(({ id }) => id).sort();
const liveKeys = (server, owner) => server.rows.filter((row) => row.owner === owner && !row.deleted).map(({ key }) => key).sort();

test('a first login queues the to-dos of the device and merges the account; a to-do on both sides keeps the copy of the device (SYNC-8)', async () => {
  const server = fakeServer();
  server.add('u1', docOf(todo('b', 'Old hat')).todos[0]);
  server.add('u1', docOf(todo('c', 'Scarf')).todos[0]);
  const storage = fakeStorage();
  const d = device({ server, storage, doc: docOf(todo('a', 'Coat'), todo('b', 'Hat')) });
  assert.equal(await d.syncer.login(sessionOf('u1')), 'synced');
  assert.equal(storedSync(storage).owner, 'u1');
  assert.equal(loadSession(storage).user.id, 'u1');
  assert.deepEqual(d.client.pushed.map(({ key, op }) => [key, op]), [['a', 'upsert'], ['b', 'upsert']]);
  assert.deepEqual(ids(d.box.doc), ['a', 'b', 'c']);
  assert.equal(d.box.doc.todos.find(({ id }) => id === 'b').text, 'Hat');
  assert.deepEqual(liveKeys(server, 'u1'), ['a', 'b', 'c']);
  assert.equal(server.rows.find(({ key }) => key === 'b').data.text, 'Hat');
  assert.deepEqual(d.box.overruled, []);
  assert.equal(d.syncer.status().pending, 0);
});

test('a first login on a device with no to-dos takes the account and sends nothing (SYNC-8)', async () => {
  const server = fakeServer();
  server.add('u1', docOf(todo('c', 'Scarf')).todos[0]);
  const d = device({ server, storage: fakeStorage() });
  assert.equal(await d.syncer.login(sessionOf('u1')), 'synced');
  assert.deepEqual(d.client.pushed, []);
  assert.deepEqual(ids(d.box.doc), ['c']);
});

test('a login of the same user again keeps the queue and the state and goes on (ACC-11)', async () => {
  const d = device({ doc: docOf(todo('a')) });
  d.save(docOf(todo('a'), todo('b')));
  assert.equal(await d.syncer.login(sessionOf('u1')), 'synced');
  assert.deepEqual(d.client.pushed.map(({ key, op }) => [key, op]), [['b', 'upsert']]);
  assert.deepEqual(ids(d.box.doc), ['a', 'b']);
  assert.equal(d.box.sets, 0);
});

test('a login of another user with an empty queue clears the device and takes the new account, with no change sent from the old one (ACC-11)', async () => {
  const server = fakeServer();
  const coat = docOf(todo('a', 'Coat'));
  server.add('u1', coat.todos[0]);
  server.add('u2', docOf(todo('z', 'Boots')).todos[0]);
  const d = device({ server, doc: coat });
  assert.equal(await d.syncer.run(), 'ok');
  assert.notEqual(storedSync(d.storage).cursor, '');
  assert.equal(await d.syncer.login(sessionOf('u2')), 'synced');
  assert.deepEqual(d.client.pushed, []);
  assert.deepEqual(ids(d.box.doc), ['z']);
  const sync = storedSync(d.storage);
  assert.equal(sync.owner, 'u2');
  assert.deepEqual(sync.local.map(([id]) => id), ['todo:z']);
  assert.deepEqual(sync.server.map(([id]) => id), ['todo:z']);
  assert.equal(sync.cursor, server.rows.find(({ owner }) => owner === 'u2').updated);
  assert.deepEqual(sync.added, []);
  assert.equal(loadSession(d.storage).user.id, 'u2');
  assert.deepEqual(liveKeys(server, 'u2'), ['z']);
  assert.deepEqual(liveKeys(server, 'u1'), ['a']);
});

test('a login of another user with a queue asks for an export and changes nothing; with discard it clears and goes on (ACC-11)', async () => {
  const server = fakeServer();
  const coat = docOf(todo('a', 'Coat'));
  server.add('u1', coat.todos[0]);
  const d = device({ server, local: [...toRecords(coat)] });
  // A refused save (SYNC-2): the queue holds the hat and `added` names it.
  await quiet(() => d.save(docOf(todo('b', 'Hat'))));
  const doc = d.box.doc;
  const before = { sync: d.storage.getItem(SYNC_KEY), queue: d.storage.getItem(QUEUE_KEY), session: d.storage.getItem(SESSION_KEY) };
  assert.deepEqual(storedSync(d.storage).added, ['todo:b']);
  assert.equal(await d.syncer.login(sessionOf('u2')), 'ask-export');
  assert.equal(d.box.doc, doc);
  assert.equal(d.box.sets, 0);
  assert.deepEqual({ sync: d.storage.getItem(SYNC_KEY), queue: d.storage.getItem(QUEUE_KEY), session: d.storage.getItem(SESSION_KEY) }, before);
  assert.deepEqual(d.client.calls, []);
  assert.equal(d.syncer.status().pending, 1);
  assert.equal(await d.syncer.login(sessionOf('u2'), { discard: true }), 'synced');
  assert.deepEqual(d.client.pushed, []);
  assert.deepEqual(d.box.doc, emptyDoc());
  assert.equal(storedSync(d.storage).owner, 'u2');
  assert.deepEqual(storedSync(d.storage).added, []);
  assert.deepEqual(storedSync(d.storage).local, []);
  assert.deepEqual(storedQueue(d.storage), []);
  assert.deepEqual(liveKeys(server, 'u2'), []);
});

test('a login of an account with no approval saves the session, makes no request and changes no state (ACC-3)', async () => {
  const storage = fakeStorage();
  const d = device({ storage, doc: docOf(todo('a')) });
  assert.equal(await d.syncer.login(sessionOf('u1', false)), 'waiting');
  assert.equal(d.client.calls.length, 0);
  assert.equal(loadSession(storage).user.approved, false);
  assert.equal(storage.getItem(SYNC_KEY), null);
  assert.equal(storage.getItem(QUEUE_KEY), null);
  assert.deepEqual(ids(d.box.doc), ['a']);
  // Over the data of another owner, with a queue: no question yet, and the data stays.
  const e = device({ doc: docOf(todo('a')), local: [] });
  e.save(docOf(todo('a'), todo('b')));
  const sync = e.storage.getItem(SYNC_KEY);
  assert.equal(await e.syncer.login(sessionOf('u2', false)), 'waiting');
  assert.equal(e.client.calls.length, 0);
  assert.equal(e.storage.getItem(SYNC_KEY), sync);
  assert.equal(e.syncer.status().pending, 2);
  assert.equal(e.box.sets, 0);
});

test('a login during a run makes that run stale: its auth error does not stop the sync of the login (SYNC-8)', async () => {
  const d = device();
  const held = gate();
  const arrived = gate();
  let pulls = 0;
  d.client.hold = () => {
    pulls += 1;
    if (pulls > 1) return Promise.resolve();
    arrived.open();
    return held.opened.then(() => {
      throw new PocketBaseError('auth', 401);
    });
  };
  const running = d.syncer.run();
  await arrived.opened;
  const login = d.syncer.login(sessionOf('u1'));
  held.open();
  assert.equal(await running, 'ok');
  assert.equal(await login, 'synced');
  assert.equal(d.syncer.status().auth, false);
  assert.equal(pulls, 2);
});

test('logout online sends the queue, then clears the to-dos, the sync state, the queue and the session; the preferences stay (ACC-12)', async () => {
  const d = device();
  d.storage.setItem(OFFLINE_KEY, '1');
  d.storage.setItem(LANGUAGE_KEY, 'es');
  d.save(docOf(todo('a')));
  await d.syncer.run();
  d.save(docOf(todo('a'), todo('b')));
  assert.equal(await d.syncer.logout({ online: true }), 'done');
  assert.deepEqual(d.client.pushed.map(({ key }) => key), ['a', 'b']);
  assert.deepEqual(d.box.doc, emptyDoc());
  for (const key of [SYNC_KEY, QUEUE_KEY, SESSION_KEY]) assert.equal(d.storage.getItem(key), null, key);
  assert.equal(d.storage.getItem(OFFLINE_KEY), '1');
  assert.equal(d.storage.getItem(LANGUAGE_KEY), 'es');
  assert.equal(d.client.streams[0].closed, true);
  assert.equal(d.syncer.status().pending, 0);
});

test('logout offline with a queue asks for an export and changes nothing; with discard it clears and sends nothing (ACC-12)', async () => {
  const d = device();
  d.save(docOf(todo('a')));
  const doc = d.box.doc;
  const before = [SYNC_KEY, QUEUE_KEY, SESSION_KEY].map((key) => d.storage.getItem(key));
  assert.equal(await d.syncer.logout({ online: false }), 'ask-export');
  assert.equal(d.box.doc, doc);
  assert.equal(d.box.sets, 0);
  assert.deepEqual([SYNC_KEY, QUEUE_KEY, SESSION_KEY].map((key) => d.storage.getItem(key)), before);
  assert.deepEqual(d.client.calls, []);
  assert.equal(d.syncer.status().pending, 1);
  assert.equal(await d.syncer.logout({ online: false, discard: true }), 'done');
  assert.deepEqual(d.client.calls, []);
  assert.deepEqual(d.box.doc, emptyDoc());
  for (const key of [SYNC_KEY, QUEUE_KEY, SESSION_KEY]) assert.equal(d.storage.getItem(key), null, key);
  assert.equal(d.syncer.status().pending, 0);
});

test('logout online with a sync that stops keeps the queue and asks for an export (ACC-12)', async () => {
  const d = device();
  d.save(docOf(todo('a')));
  d.client.failPush = () => new PocketBaseError('network');
  assert.equal(await d.syncer.logout({ online: true }), 'ask-export');
  assert.equal(d.syncer.status().pending, 1);
  assert.notEqual(d.storage.getItem(SESSION_KEY), null);
});

test('an import tombstones each todo of the server that it does not hold (SYNC-9)', async () => {
  const server = fakeServer();
  const both = docOf(todo('a', 'Coat'), todo('b', 'Hat'));
  both.todos.forEach((g) => server.add('u1', g));
  const d = device({ server, doc: both });
  assert.equal(await d.syncer.run(), 'ok');
  d.save(docOf(todo('c', 'Scarf')), { explicit: true });
  assert.equal(await d.syncer.run(), 'ok');
  assert.deepEqual(d.client.pushed.map(({ key, op }) => [key, op]), [['a', 'delete'], ['b', 'delete'], ['c', 'upsert']]);
  assert.deepEqual(liveKeys(server, 'u1'), ['c']);
  assert.deepEqual(ids(d.box.doc), ['c']);
});

test('Delete all data stops the sync, clears this device only and sends nothing; the status starts again (SYNC-10)', async () => {
  const server = fakeServer();
  server.add('u1', docOf(todo('a', 'Coat')).todos[0]);
  const d = device({ server });
  assert.equal(await d.syncer.run(), 'ok');
  d.save(docOf(todo('a', 'Coat'), todo('b')));
  d.client.failPush = () => new PocketBaseError('server', 503);
  assert.equal(await d.syncer.run(), 'offline');
  assert.equal(d.syncer.status().online, false);
  const calls = d.client.calls.length;
  d.syncer.reset();
  assert.deepEqual(d.syncer.status(), { online: true, pending: 0, lastSync: null, auth: false, reached: 0 });
  assert.deepEqual(d.box.statuses.at(-1), d.syncer.status());
  assert.deepEqual(d.live(), []);
  assert.equal(d.client.calls.length, calls);
  assert.equal(d.client.streams[0].closed, true);
  for (const key of [SYNC_KEY, QUEUE_KEY, SESSION_KEY]) assert.equal(d.storage.getItem(key), null, key);
  assert.deepEqual(liveKeys(server, 'u1'), ['a']);
});

test('the stream opens after a run that reached the server, and an event starts a run (SYNC-3)', async () => {
  const d = device();
  assert.equal(d.client.streams.length, 0);
  await d.syncer.run();
  assert.equal(d.client.streams.length, 1);
  const [stream] = d.client.streams;
  assert.equal(stream.tokenFn(), loadSession(d.storage).token);
  await d.syncer.run();
  assert.equal(d.client.streams.length, 1);
  const pulls = d.client.calls.filter((call) => call === 'pull').length;
  await stream.onChange({});
  assert.equal(d.client.calls.filter((call) => call === 'pull').length, pulls + 1);
  await stream.onReconnect();
  assert.equal(d.client.calls.filter((call) => call === 'pull').length, pulls + 2);
});

test('offline closes the stream and reports offline; online runs and opens it again (SYNC-3, SYNC-11)', async () => {
  const d = device();
  await d.syncer.run();
  d.syncer.offline();
  assert.equal(d.client.streams[0].closed, true);
  assert.equal(d.syncer.status().online, false);
  assert.equal(d.box.statuses.at(-1).online, false);
  assert.equal(await d.syncer.online(), 'ok');
  assert.equal(d.syncer.status().online, true);
  assert.equal(d.client.streams.length, 2);
  assert.equal(d.client.streams[1].closed, false);
});

test('an auth stop and a reset close the stream (SYNC-3)', async () => {
  const d = device();
  await d.syncer.run();
  d.client.failRefresh = new PocketBaseError('auth', 401);
  d.box.clock = START + 600_001;
  assert.equal(await d.syncer.run(), 'auth');
  assert.equal(d.client.streams[0].closed, true);
  const e = device();
  await e.syncer.run();
  e.syncer.reset();
  assert.equal(e.client.streams[0].closed, true);
});

// A lost approval: the saves stay in the doc only, and no queue holds them.
const unapprovedEdit = () => {
  const d = device({ doc: docOf(todo('a')) });
  saveSession(d.storage, sessionOf('u1', false));
  d.save(docOf(todo('a'), todo('b')));
  assert.equal(d.syncer.status().pending, 0);
  return d;
};

test('logout after a lost approval asks for an export of an edit that no queue holds; with discard it clears (ACC-12)', async () => {
  const d = unapprovedEdit();
  const before = [SYNC_KEY, QUEUE_KEY, SESSION_KEY].map((key) => d.storage.getItem(key));
  assert.equal(await d.syncer.logout({ online: true }), 'ask-export');
  assert.deepEqual(ids(d.box.doc), ['a', 'b']);
  assert.equal(d.box.sets, 0);
  assert.deepEqual([SYNC_KEY, QUEUE_KEY, SESSION_KEY].map((key) => d.storage.getItem(key)), before);
  assert.equal(await d.syncer.logout({ online: true, discard: true }), 'done');
  assert.deepEqual(d.box.doc, emptyDoc());
  for (const key of [SYNC_KEY, QUEUE_KEY, SESSION_KEY]) assert.equal(d.storage.getItem(key), null, key);
});

test('a login of another user after a lost approval asks for an export of an edit that no queue holds; with discard it clears (ACC-11)', async () => {
  const d = unapprovedEdit();
  const before = [SYNC_KEY, QUEUE_KEY, SESSION_KEY].map((key) => d.storage.getItem(key));
  assert.equal(await d.syncer.login(sessionOf('u2')), 'ask-export');
  assert.deepEqual(ids(d.box.doc), ['a', 'b']);
  assert.equal(d.box.sets, 0);
  assert.deepEqual([SYNC_KEY, QUEUE_KEY, SESSION_KEY].map((key) => d.storage.getItem(key)), before);
  assert.deepEqual(d.client.calls, []);
  assert.equal(await d.syncer.login(sessionOf('u2'), { discard: true }), 'synced');
  assert.deepEqual(d.client.pushed, []);
  assert.deepEqual(d.box.doc, emptyDoc());
  assert.equal(storedSync(d.storage).owner, 'u2');
});

test('a merged doc that the app cannot save keeps the base and the cursor, so the next run pulls it again (SYNC-2)', async (t) => {
  t.mock.method(console, 'error', () => {});
  const server = fakeServer();
  server.add('u1', todo('a'));
  const d = device({ server, doc: docOf(todo('a')) });
  assert.equal(await d.syncer.run(), 'ok');
  const { cursor, local } = storedSync(d.storage);
  assert.notEqual(cursor, '');
  server.add('u1', todo('b'));
  d.box.failSet = true;
  assert.equal(await d.syncer.run(), 'ok');
  assert.equal(d.box.sets, 1);
  assert.deepEqual(d.box.doc.todos.map(({ id }) => id), ['a']);
  assert.equal(storedSync(d.storage).cursor, cursor);
  assert.deepEqual(storedSync(d.storage).local, local);
  assert.deepEqual(storedQueue(d.storage), []);
  d.box.failSet = false;
  assert.equal(await d.syncer.run(), 'ok');
  assert.deepEqual(d.box.doc.todos.map(({ id }) => id).sort(), ['a', 'b']);
  assert.deepEqual(storedSync(d.storage).local.map(([id]) => id).sort(), ['todo:a', 'todo:b']);
  assert.deepEqual(d.client.pushed, []);
  assert.equal(console.error.mock.callCount(), 1);
});

const syncOf = (fields) => JSON.stringify({ owner: 'u1', cursor: 'c1', server: [], local: [['todo:a', { kind: 'todo', key: 'a', data: {} }]], lastSync: null, added: [], ...fields });
const sessionText = (id, approved = true, n = 0) => JSON.stringify({ ...sessionOf(id, approved), token: tokenOf(id, n) });

test('a change by another tab of the to-dos, the queue or a clear of the storage reloads this tab (SYNC-12)', () => {
  assert.equal(reloadsOn({ key: DOC_KEY, oldValue: '{"a":1}', newValue: '{"a":2}' }), true);
  assert.equal(reloadsOn({ key: DOC_KEY, oldValue: null, newValue: '{}' }), true);
  assert.equal(reloadsOn({ key: QUEUE_KEY, oldValue: '[]', newValue: '[{}]' }), true);
  assert.equal(reloadsOn({ key: QUEUE_KEY, oldValue: '[]', newValue: null }), true);
  assert.equal(reloadsOn({ key: null, oldValue: null, newValue: null }), true);
});

test('a change by another tab of the sync state reloads this tab, unless only the time of the sync or the server copy changed (SYNC-12)', () => {
  assert.equal(reloadsOn({ key: SYNC_KEY, oldValue: syncOf(), newValue: syncOf({ cursor: 'c2' }) }), true);
  assert.equal(reloadsOn({ key: SYNC_KEY, oldValue: syncOf(), newValue: syncOf({ owner: 'u2' }) }), true);
  assert.equal(reloadsOn({ key: SYNC_KEY, oldValue: syncOf(), newValue: syncOf({ local: [] }) }), true);
  assert.equal(reloadsOn({ key: SYNC_KEY, oldValue: syncOf(), newValue: syncOf({ added: ['todo:b'] }) }), true);
  assert.equal(reloadsOn({ key: SYNC_KEY, oldValue: syncOf(), newValue: null }), true);
  assert.equal(reloadsOn({ key: SYNC_KEY, oldValue: 'not json', newValue: syncOf() }), true);
  assert.equal(reloadsOn({ key: SYNC_KEY, oldValue: syncOf(), newValue: syncOf({ lastSync: '2026-10-31T08:00:00.000Z' }) }), false);
  assert.equal(reloadsOn({ key: SYNC_KEY, oldValue: syncOf(), newValue: syncOf({ server: [['todo:a', { id: 'pb1' }]] }) }), false);
});

test('a change by another tab of the session reloads this tab only for another user, an approval or a logout; a new token does not (SYNC-12)', () => {
  assert.equal(reloadsOn({ key: SESSION_KEY, oldValue: sessionText('u1', true, 1), newValue: sessionText('u1', true, 2) }), false);
  assert.equal(reloadsOn({ key: SESSION_KEY, oldValue: sessionText('u1'), newValue: sessionText('u2') }), true);
  assert.equal(reloadsOn({ key: SESSION_KEY, oldValue: sessionText('u1', false), newValue: sessionText('u1', true) }), true);
  assert.equal(reloadsOn({ key: SESSION_KEY, oldValue: sessionText('u1'), newValue: null }), true);
  assert.equal(reloadsOn({ key: SESSION_KEY, oldValue: null, newValue: sessionText('u1') }), true);
});

test('a change by another tab of other keys does not reload this tab (SYNC-12)', () => {
  assert.equal(reloadsOn({ key: LANGUAGE_KEY, oldValue: 'en', newValue: 'es' }), false);
  assert.equal(reloadsOn({ key: OFFLINE_KEY, oldValue: null, newValue: '1' }), false);
  assert.equal(reloadsOn({ key: 'other.app', oldValue: null, newValue: '1' }), false);
});

test('stop makes a run in progress stale and leaves the storage as the other tab wrote it; nothing runs after it (SYNC-12)', async () => {
  const server = fakeServer();
  server.add('u1', todo('b'));
  const d = device({ doc: docOf(todo('a')), server });
  const held = gate();
  d.client.hold = () => held.opened;
  const running = d.syncer.run();
  await Promise.resolve();
  d.syncer.stop();
  const before = new Map(d.storage.map);
  d.storage.setItem(DOC_KEY, 'written by another tab');
  held.open();
  assert.equal(await running, 'ok');
  assert.equal(d.box.sets, 0);
  assert.equal(d.storage.getItem(DOC_KEY), 'written by another tab');
  d.storage.removeItem(DOC_KEY);
  assert.deepEqual(d.storage.map, before);
  d.client.hold = null;
  const calls = d.client.calls.length;
  d.save(docOf(todo('a'), todo('c')));
  assert.equal(await d.syncer.run(), 'ok');
  assert.equal(await d.syncer.login(sessionOf('u1')), 'stopped');
  assert.equal(await d.syncer.logout({ online: true }), 'stopped');
  assert.equal(d.client.calls.length, calls);
  assert.deepEqual(d.storage.map, before);
  assert.deepEqual(d.live(), []);
});

// Two tabs of one browser share one storage. A write of one tab reaches the other one as a `storage`
// event after the task of the write, as in a browser; the listener of the app (SYNC-12) stops the
// syncer of that tab and loads it again from the storage.
const twoTabs = (server) => {
  const map = new Map();
  const tabs = [];
  const view = (owner) => {
    const write = (key, value) => {
      const oldValue = map.has(key) ? map.get(key) : null;
      if (value === null) map.delete(key);
      else map.set(key, String(value));
      const newValue = map.has(key) ? map.get(key) : null;
      if (oldValue === newValue) return;
      for (const tab of tabs) if (tab !== owner()) setImmediate(() => tab.onStorage({ key, oldValue, newValue }));
    };
    return { map, getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: write, removeItem: (key) => write(key, null) };
  };
  const open = () => {
    const tab = { reloads: 0 };
    const storage = view(() => tab);
    const client = fakeClient(server);
    const load = () => {
      const stored = storage.getItem(DOC_KEY);
      tab.doc = stored ? JSON.parse(stored) : emptyDoc();
      tab.syncer = createSyncer({
        client,
        storage,
        getDoc: () => tab.doc,
        setDoc: (next) => {
          tab.doc = next;
          storage.setItem(DOC_KEY, JSON.stringify(next));
          return true;
        },
        setTimer: () => null,
        clearTimer: () => {},
      });
    };
    tab.onStorage = (event) => {
      if (!reloadsOn(event)) return;
      tab.syncer.stop();
      tab.reloads += 1;
      load();
    };
    tab.save = (next) => {
      tab.doc = next;
      storage.setItem(DOC_KEY, JSON.stringify(next));
      tab.syncer.notify(next);
    };
    tab.client = client;
    load();
    tabs.push(tab);
    return tab;
  };
  return { map, open };
};

const flush = () => new Promise((resolve) => setImmediate(resolve));
const serverView = (server) => server.rows.map((row) => `${row.key}:${row.deleted ? 'deleted' : row.data.text}`).sort();

test('two tabs that edit offline never mix their state, so a new start deletes nothing (SYNC-12)', async () => {
  const server = fakeServer();
  server.add('u1', todo('a'));
  const browser = twoTabs(server);
  const first = browser.open();
  first.save(docOf(todo('a')));
  assert.equal(await first.syncer.login(sessionOf('u1')), 'synced');
  const second = browser.open();
  await flush();
  // Offline: the first tab adds a todo, then the second tab renames the other one.
  for (const tab of [first, second]) tab.client.failPush = () => new PocketBaseError('network');
  first.save(docOf(todo('a'), todo('g')));
  await flush();
  assert.ok(second.reloads > 0);
  assert.deepEqual(second.doc.todos.map(({ id }) => id).sort(), ['a', 'g']);
  // The second tab edits the doc that it holds in memory.
  second.save({ ...second.doc, todos: second.doc.todos.map((g) => (g.id === 'a' ? { ...g, text: 'A2' } : g)) });
  await flush();
  assert.ok(first.reloads > 0);
  // Online: the first tab runs, then every tab closes and the browser starts again.
  for (const tab of [first, second]) tab.client.failPush = null;
  assert.equal(await first.syncer.run(), 'ok');
  await flush();
  assert.deepEqual(serverView(server), ['a:A2', 'g:g']);
  const next = twoTabs(server);
  for (const [key, value] of browser.map) next.map.set(key, value);
  const restart = next.open();
  assert.equal(await restart.syncer.login(sessionOf('u1')), 'synced');
  assert.deepEqual(serverView(server), ['a:A2', 'g:g']);
  assert.deepEqual(restart.doc.todos.map(({ id }) => id).sort(), ['a', 'g']);
});

// The field-level merge of a push (contract §Conflicts), the summary and the receipt tombstone.
const DONE_AT = '2026-11-02T10:00:00Z';

const syncedTodo = async () => {
  const server = fakeServer();
  server.add('u1', todo('a', 'Pay rent'));
  const d = device({ server });
  assert.equal(await d.syncer.run(), 'ok');
  return d;
};

test('a to-do text edited on the phone survives a done set by maney', async () => {
  const d = await syncedTodo();
  d.server.edit('todo', 'a', { done: true, doneAt: DONE_AT });
  d.save(docOf(todo('a', 'Pay the rent')));
  assert.equal(await d.syncer.run(), 'ok');
  assert.deepEqual(storedQueue(d.storage), []);
  const expected = { text: 'Pay the rent', due: null, done: true, doneAt: DONE_AT };
  assert.deepEqual(d.server.rows[0].data, expected);
  assert.deepEqual(d.box.doc.todos, [{ id: 'a', ...expected }]);
  assert.deepEqual(d.box.overruled, []);
});

test('a field changed on both sides keeps the server value after the run', async () => {
  const d = await syncedTodo();
  d.server.edit('todo', 'a', { text: 'Pay the rent today' });
  d.save(docOf(todo('a', 'Pay the rent')));
  assert.equal(await d.syncer.run(), 'ok');
  assert.equal(d.box.doc.todos[0].text, 'Pay the rent today');
  assert.equal(d.server.rows[0].data.text, 'Pay the rent today');
  assert.deepEqual(d.box.overruled, [['text']]);
  assert.deepEqual(storedQueue(d.storage), []);
});

test('a pushed change passes the server copy of the record as its base', async () => {
  const d = await syncedTodo();
  const copy = d.server.rows[0];
  d.save(docOf(todo('a', 'Pay the rent'), todo('b', 'New')));
  assert.equal(await d.syncer.run(), 'ok');
  assert.deepEqual(d.client.pushed.map(({ key }) => key), ['a', 'b']);
  assert.deepEqual(d.client.bases[0], { id: copy.id, kind: 'todo', key: 'a', data: { text: 'Pay rent', due: null, done: false, doneAt: null }, deleted: false, updated: '2026-10-31 07:00:00.001Z' });
  assert.equal(d.client.bases[1], null);
  // The answer of the push is the server copy now.
  assert.equal(new Map(storedSync(d.storage).server).get('todo:a').data.text, 'Pay the rent');
});

const SUMMARY = {
  v: 1,
  generatedAt: '2026-11-02T08:00:00Z',
  month: '2026-11',
  status: { ok: 12, review: 2, missing: 1, pending: 3 },
  nextDue: [{ date: '2026-11-05', label: 'Alquiler', amountCents: -80000, state: 'expected' }],
  investments: [],
};

test('the summary pulled from the server goes into the doc and is never queued', async () => {
  const server = fakeServer();
  server.add('u1', { id: 'current', ...SUMMARY }, 'summary');
  const d = device({ server });
  assert.equal(await d.syncer.run(), 'ok');
  assert.deepEqual(d.box.doc.summary, SUMMARY);
  // The SYNC-2 guard logs these saves: they hold none of the records of the account.
  await quiet(async () => {
    d.save({ ...d.box.doc, summary: null });
    d.save(docOf(todo('a')));
    assert.deepEqual(storedQueue(d.storage).map(({ kind }) => kind), ['todo']);
    assert.equal(await d.syncer.run(), 'ok');
  });
  assert.ok(d.client.pushed.every(({ kind }) => kind !== 'summary'));
  assert.deepEqual(d.box.doc.summary, SUMMARY);
});

test('a pulled receipt tombstone removes the receipt (SYNC-6)', async () => {
  const server = fakeServer();
  const receipt = { id: 'r1', takenOn: '2026-11-02', amountCents: 1250, shop: 'Mercadona', note: '', photo: null };
  server.add('u1', receipt, 'receipt');
  server.add('u1', todo('a'));
  const d = device({ server });
  assert.equal(await d.syncer.run(), 'ok');
  assert.deepEqual(d.box.doc.receipts, [receipt]);
  server.edit('receipt', 'r1', { deleted: true });
  assert.equal(await d.syncer.run(), 'ok');
  assert.deepEqual(d.box.doc.receipts, []);
  assert.deepEqual(ids(d.box.doc), ['a']);
  assert.deepEqual(d.client.pushed, []);
});

test('a receipt delete on the phone tombstones it on the server with its photo key in the change', async () => {
  const server = fakeServer();
  const receipt = { id: 'r1', takenOn: '2026-11-02', amountCents: 1250, shop: '', note: '', photo: 'p1' };
  server.add('u1', receipt, 'receipt');
  const d = device({ server });
  assert.equal(await d.syncer.run(), 'ok');
  d.save({ ...d.box.doc, receipts: [] });
  assert.equal(await d.syncer.run(), 'ok');
  assert.deepEqual(d.client.pushed, [{ kind: 'receipt', key: 'r1', op: 'delete', photo: 'p1' }]);
  assert.equal(server.rows[0].deleted, true);
});

test('a lost create answer followed by a second local edit pushes the second edit and reports no overruled field (SYNC-4)', async () => {
  const d = device();
  d.save(docOf(todo('a', 'First')));
  d.client.loseAnswer = (n) => n === 1;
  assert.equal(await d.syncer.run(), 'offline');
  assert.equal(d.server.rows[0].data.text, 'First');
  assert.equal(new Map(storedSync(d.storage).server).has('todo:a'), false);
  d.client.loseAnswer = null;
  d.save(docOf(todo('a', 'Second')));
  assert.equal(await d.syncer.run(), 'ok');
  assert.equal(d.client.bases.at(-1), null);
  assert.equal(d.server.rows.length, 1);
  assert.equal(d.server.rows[0].data.text, 'Second');
  assert.equal(d.box.doc.todos[0].text, 'Second');
  assert.deepEqual(d.box.overruled, []);
  assert.deepEqual(storedQueue(d.storage), []);
});

test('a first login with a to-do on both sides keeps the device copy and reports no overruled field (SYNC-8)', async () => {
  const server = fakeServer();
  server.add('u1', { ...todo('a', 'Server text'), done: true, doneAt: '2026-11-01T10:00:00Z' });
  const d = device({ server, storage: fakeStorage(), doc: docOf(todo('a', 'Device text')) });
  assert.equal(await d.syncer.login(sessionOf('u1')), 'synced');
  const expected = { text: 'Device text', due: null, done: false, doneAt: null };
  assert.deepEqual(server.rows[0].data, expected);
  assert.deepEqual(d.box.doc.todos, [{ id: 'a', ...expected }]);
  assert.deepEqual(d.box.overruled, []);
});

// Receipt photos (SYNC-14 to SYNC-16).
const receiptOf = (id, photo = null) => ({ id, takenOn: '2026-11-02', amountCents: 999, shop: 'Eroski', note: '', photo });
const receiptDoc = (...receipts) => normalizeDoc({ version: 1, todos: [], receipts, summary: null });
const jpegOf = (name) => new Blob([name], { type: 'image/jpeg' });
const offlineNow = (d) => {
  d.client.failRefresh = new PocketBaseError('network');
  d.client.failPush = () => new PocketBaseError('network');
};
const onlineNow = (d) => {
  d.client.failRefresh = null;
  d.client.failPush = null;
};
// A save of a receipt with a new photo, as the sheet does: the photo goes to the store, then the save.
const saveWithPhoto = async (d, doc, key) => {
  await d.photos.put(key, jpegOf(key));
  d.save(doc);
};

test('a receipt with a pending photo uploads the file before the receipt record (SYNC-14)', async () => {
  const d = device();
  await saveWithPhoto(d, receiptDoc(receiptOf('r1', 'p1')), 'p1');
  assert.equal(await d.syncer.run(), 'ok');
  assert.deepEqual(d.client.order, ['uploadPhoto:p1', 'push:receipt:r1']);
  assert.deepEqual(await d.photos.keys(), []);
  assert.equal(d.server.files[0].key, 'p1');
  assert.equal(d.server.rows[0].data.photo, 'p1');
});

test('receipts captured offline reach the server in order at the online event (SYNC-14)', async () => {
  const d = device();
  offlineNow(d);
  await saveWithPhoto(d, receiptDoc(receiptOf('r1', 'p1')), 'p1');
  assert.equal(await d.syncer.run(), 'offline');
  await saveWithPhoto(d, receiptDoc(receiptOf('r1', 'p1'), receiptOf('r2', 'p2')), 'p2');
  assert.equal(await d.syncer.run(), 'offline');
  assert.equal(storedQueue(d.storage).length, 2);
  assert.equal((await d.photos.keys()).length, 2);
  assert.equal(d.syncer.status().online, false);
  assert.deepEqual(d.client.order, []);
  onlineNow(d);
  assert.equal(await d.syncer.online(), 'ok');
  assert.deepEqual(d.client.order, ['uploadPhoto:p1', 'push:receipt:r1', 'uploadPhoto:p2', 'push:receipt:r2']);
  assert.deepEqual(storedQueue(d.storage), []);
  assert.deepEqual(await d.photos.keys(), []);
});

test('a photo upload that fails keeps the receipt queued and sends it only after the photo (SYNC-4, SYNC-14)', async () => {
  const d = device();
  await saveWithPhoto(d, receiptDoc(receiptOf('r1', 'p1')), 'p1');
  d.client.failUpload = () => new PocketBaseError('network');
  assert.equal(await d.syncer.run(), 'offline');
  assert.deepEqual(d.client.order, ['uploadPhoto:p1']);
  assert.equal(storedQueue(d.storage).length, 1);
  assert.deepEqual(await d.photos.keys(), ['p1']);
  d.client.failUpload = null;
  assert.equal(await d.syncer.run(), 'ok');
  assert.deepEqual(d.client.order, ['uploadPhoto:p1', 'uploadPhoto:p1', 'push:receipt:r1']);
  assert.deepEqual(storedQueue(d.storage), []);
});

test('a receipt deleted before its photo uploaded sends no file and its photo leaves at the next start (SYNC-15)', async () => {
  const d = device();
  offlineNow(d);
  await saveWithPhoto(d, receiptDoc(receiptOf('r1', 'p1')), 'p1');
  assert.equal(await d.syncer.run(), 'offline');
  d.save(receiptDoc());
  // Undo puts the receipt back in the same start.
  d.save(receiptDoc(receiptOf('r1', 'p1')));
  assert.deepEqual(await d.photos.keys(), ['p1']);
  d.save(receiptDoc());
  onlineNow(d);
  assert.equal(await d.syncer.run(), 'ok');
  assert.ok(!d.client.order.some((call) => call.startsWith('uploadPhoto')));
  assert.deepEqual(await d.photos.keys(), ['p1']);
  const next = device({ server: d.server, storage: d.storage, photos: d.photos, doc: d.box.doc });
  assert.equal(await next.syncer.run(), 'ok');
  assert.deepEqual(await next.photos.keys(), []);
  assert.deepEqual(next.client.order.filter((call) => !call.startsWith('push')), []);
  assert.deepEqual(d.server.files, []);
});

test('a deleted receipt whose photo was uploaded tombstones the file at the next start, once (SYNC-15)', async () => {
  const d = device();
  await saveWithPhoto(d, receiptDoc(receiptOf('r1', 'p1')), 'p1');
  assert.equal(await d.syncer.run(), 'ok');
  d.save(receiptDoc());
  assert.equal(await d.syncer.run(), 'ok');
  assert.equal(d.server.rows[0].deleted, true);
  assert.ok(!d.client.order.includes('deletePhoto:p1'));
  assert.equal(d.server.files[0].deleted, false);
  const second = device({ server: d.server, storage: d.storage, photos: d.photos, doc: d.box.doc });
  assert.equal(await second.syncer.run(), 'ok');
  assert.deepEqual(second.client.order, ['deletePhoto:p1']);
  assert.equal(d.server.files[0].deleted, true);
  assert.deepEqual(storedSync(d.storage).gone, ['p1']);
  assert.equal(await second.syncer.run(), 'ok');
  assert.deepEqual(second.client.order, ['deletePhoto:p1']);
  const third = device({ server: d.server, storage: d.storage, photos: d.photos, doc: d.box.doc });
  assert.equal(await third.syncer.run(), 'ok');
  assert.deepEqual(third.client.order, []);
});

test('a replaced photo uploads the new file before the receipt (SYNC-14, SYNC-15)', async () => {
  const server = fakeServer();
  server.add('u1', receiptOf('r1', 'p1'), 'receipt');
  server.files.push({ id: 'f1', owner: 'u1', key: 'p1', photo: 'p1.jpg', deleted: false });
  const d = device({ server });
  assert.equal(await d.syncer.run(), 'ok');
  assert.equal(d.box.doc.receipts[0].photo, 'p1');
  await saveWithPhoto(d, receiptDoc(receiptOf('r1', 'p2')), 'p2');
  assert.equal(await d.syncer.run(), 'ok');
  assert.deepEqual(d.client.order, ['uploadPhoto:p2', 'push:receipt:r1']);
  assert.equal(server.files[0].deleted, false);
  const next = device({ server, storage: d.storage, photos: d.photos, doc: d.box.doc });
  assert.equal(await next.syncer.run(), 'ok');
  assert.deepEqual(next.client.order, ['deletePhoto:p1']);
  assert.equal(server.files[0].deleted, true);
  assert.equal(server.files[1].deleted, false);
  assert.deepEqual(storedSync(d.storage).gone, ['p1']);
});

test('an expired token keeps the receipts and photos, and a login sends them (SYNC-4, SYNC-14)', async () => {
  const storage = fakeStorage();
  const expired = `${base64url({ alg: 'none' })}.${base64url({ id: 'u1', exp: 1 })}.sig`;
  saveSession(storage, { ...sessionOf('u1'), token: expired });
  storage.setItem(SYNC_KEY, JSON.stringify({ owner: 'u1', cursor: '', server: [], local: [], lastSync: null }));
  const d = device({ storage });
  await saveWithPhoto(d, receiptDoc(receiptOf('r1', 'p1')), 'p1');
  d.client.failRefresh = new PocketBaseError('network');
  assert.equal(await d.syncer.run(), 'offline');
  assert.equal(storedQueue(storage).length, 1);
  assert.deepEqual(await d.photos.keys(), ['p1']);
  assert.equal(d.syncer.status().auth, false);
  d.client.failRefresh = new PocketBaseError('auth', 401);
  assert.equal(await d.syncer.run(), 'auth');
  assert.equal(d.syncer.status().auth, true);
  assert.equal(storedQueue(storage).length, 1);
  assert.deepEqual(await d.photos.keys(), ['p1']);
  assert.deepEqual(d.client.order, []);
  d.client.failRefresh = null;
  assert.equal(await d.syncer.login(sessionOf('u1')), 'synced');
  assert.deepEqual(d.client.order, ['uploadPhoto:p1', 'push:receipt:r1']);
  assert.deepEqual(storedQueue(storage), []);
  assert.deepEqual(await d.photos.keys(), []);
});

test('a photo the server refuses with field errors is dropped and the receipt goes with photo null (SYNC-16)', async () => {
  const d = device();
  await saveWithPhoto(d, receiptDoc(receiptOf('r1', 'p1')), 'p1');
  d.client.failUpload = () => new PocketBaseError('invalid', 400, { photo: { code: 'validation_invalid_mime_type' } });
  assert.equal(await quiet(() => d.syncer.run()), 'ok');
  assert.deepEqual(await d.photos.keys(), []);
  assert.equal(d.client.pushed[0].data.photo, null);
  assert.equal(d.server.rows[0].data.photo, null);
  assert.equal(d.box.doc.receipts[0].photo, null);
  assert.deepEqual(storedQueue(d.storage), []);
});

test('Delete all data clears the photo store (SYNC-10)', async () => {
  const d = device();
  offlineNow(d);
  await saveWithPhoto(d, receiptDoc(receiptOf('r1', 'p1')), 'p1');
  await d.photos.put('p9', jpegOf('p9'));
  await d.syncer.reset();
  assert.deepEqual(await d.photos.keys(), []);
  assert.equal(storedSync(d.storage), null);
});

test('a refused photo followed by a failed push sends the receipt with photo null at the next run and no file call (SYNC-16)', async () => {
  const d = device();
  await saveWithPhoto(d, receiptDoc(receiptOf('r1', 'p1')), 'p1');
  d.client.failUpload = () => new PocketBaseError('invalid', 400, { photo: { code: 'validation_invalid_mime_type' } });
  d.client.failPush = () => new PocketBaseError('network');
  assert.equal(await quiet(() => d.syncer.run()), 'offline');
  assert.deepEqual(await d.photos.keys(), []);
  assert.deepEqual(storedQueue(d.storage).map(({ data }) => data.photo), [null]);
  assert.equal(d.box.doc.receipts[0].photo, null);
  d.client.failUpload = null;
  d.client.failPush = null;
  d.client.order.length = 0;
  assert.equal(await d.syncer.run(), 'ok');
  assert.deepEqual(d.client.order, ['push:receipt:r1']);
  assert.equal(d.server.rows[0].data.photo, null);
  assert.deepEqual(d.server.files, []);
  assert.equal(d.box.doc.receipts[0].photo, null);
  assert.deepEqual(storedQueue(d.storage), []);
});

test('an uploaded photo followed by a failed push sends the receipt at the next run with no new upload (SYNC-14)', async () => {
  const d = device();
  await saveWithPhoto(d, receiptDoc(receiptOf('r1', 'p1')), 'p1');
  d.client.failPush = () => new PocketBaseError('network');
  assert.equal(await d.syncer.run(), 'offline');
  assert.deepEqual(d.client.order, ['uploadPhoto:p1', 'push:receipt:r1']);
  assert.deepEqual(await d.photos.keys(), []);
  assert.equal(storedQueue(d.storage).length, 1);
  d.client.failPush = null;
  assert.equal(await d.syncer.run(), 'ok');
  assert.deepEqual(d.client.order, ['uploadPhoto:p1', 'push:receipt:r1', 'push:receipt:r1']);
  assert.equal(d.server.rows[0].data.photo, 'p1');
  assert.equal(d.server.files.length, 1);
  assert.deepEqual(storedQueue(d.storage), []);
});

test('a receipt deleted before the first run of a start keeps its pending photo for the Undo, and online the photo uploads first (SYNC-15)', async () => {
  const first = device();
  offlineNow(first);
  await saveWithPhoto(first, receiptDoc(receiptOf('r1', 'p1')), 'p1');
  // A new start, offline, with no run yet: the first save of the user starts the first run.
  const d = device({ server: first.server, storage: first.storage, photos: first.photos, doc: first.box.doc });
  offlineNow(d);
  d.save(receiptDoc());
  assert.equal(await d.live().at(-1).fn(), 'offline');
  // Undo within 5 s puts the receipt back.
  d.save(receiptDoc(receiptOf('r1', 'p1')));
  assert.deepEqual(await d.photos.keys(), ['p1']);
  onlineNow(d);
  assert.equal(await d.syncer.online(), 'ok');
  assert.deepEqual(d.client.order, ['uploadPhoto:p1', 'push:receipt:r1']);
  assert.equal(d.server.rows[0].data.photo, 'p1');
  assert.equal(d.server.files[0].key, 'p1');
});

test('the start removes the pending photos that nothing names, with no session (SYNC-15)', async () => {
  const photos = fakePhotos();
  await photos.put('p9', jpegOf('p9'));
  const d = device({ storage: fakeStorage(), photos });
  assert.equal(await d.syncer.run(), 'ok');
  assert.deepEqual(await d.photos.keys(), []);
  assert.deepEqual(d.client.order, []);
});

test('a receipt that names a photo with no pending file and no server file goes with photo null (SYNC-16)', async () => {
  const d = device();
  // A backup import, or a photo store lost at a reload: the receipt names a photo the device lacks.
  d.save(receiptDoc(receiptOf('r1', 'p1')));
  assert.equal(await quiet(() => d.syncer.run()), 'ok');
  assert.deepEqual(d.client.finds, ['p1']);
  assert.ok(!d.client.order.some((call) => call.startsWith('uploadPhoto')));
  assert.equal(d.client.pushed[0].data.photo, null);
  assert.equal(d.server.rows[0].data.photo, null);
  assert.equal(d.box.doc.receipts[0].photo, null);
  assert.deepEqual(storedQueue(d.storage), []);
});

test('a receipt that names a photo with no pending file goes as it is when the server holds the file (SYNC-14)', async () => {
  const server = fakeServer();
  server.files.push({ id: 'f1', owner: 'u1', key: 'p1', photo: 'p1.jpg', deleted: false });
  const d = device({ server });
  d.save(receiptDoc(receiptOf('r1', 'p1')));
  assert.equal(await d.syncer.run(), 'ok');
  assert.deepEqual(d.client.order, ['push:receipt:r1']);
  assert.equal(d.server.rows[0].data.photo, 'p1');
  assert.equal(d.box.doc.receipts[0].photo, 'p1');
});

test('an edit of a receipt whose photo the server copy names makes no file call (SYNC-14)', async () => {
  const server = fakeServer();
  server.add('u1', receiptOf('r1', 'p1'), 'receipt');
  const d = device({ server });
  assert.equal(await d.syncer.run(), 'ok');
  d.save(receiptDoc({ ...receiptOf('r1', 'p1'), note: 'Lunch' }));
  assert.equal(await d.syncer.run(), 'ok');
  assert.deepEqual(d.client.finds, []);
  assert.deepEqual(d.client.order, ['push:receipt:r1']);
  assert.equal(d.server.rows[0].data.photo, 'p1');
});
