import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SESSION_KEY,
  OAUTH_KEY,
  loadSession,
  saveSession,
  dropSession,
  routeAtStart,
  savePending,
  takePending,
  readOAuthReturn,
  OFFLINE_KEY,
  loadOffline,
  saveOffline,
  dropOffline,
} from '#session';

// A fake Storage over a Map; `broken` throws on each call, as a blocked storage does.
const memory = (entries = {}, { broken = false } = {}) => {
  const map = new Map(Object.entries(entries));
  const guard = (fn) => (...args) => {
    if (broken) throw new Error('blocked');
    return fn(...args);
  };
  return {
    map,
    getItem: guard((key) => (map.has(key) ? map.get(key) : null)),
    setItem: guard((key, value) => map.set(key, String(value))),
    removeItem: guard((key) => map.delete(key)),
  };
};

const SESSION = { token: 'T', user: { id: 'u1', email: 'a@b.c', name: 'Ana', approved: true } };

test('the keys have the slug of the app', () => {
  assert.equal(SESSION_KEY, 'maney.session');
  assert.equal(OAUTH_KEY, 'maney.oauth');
});

test('a saved session loads back as it was (ACC-5)', () => {
  const storage = memory();
  assert.equal(saveSession(storage, SESSION), true);
  assert.deepEqual(loadSession(storage), SESSION);
});

test('no session, or a value that is not one, loads as null', () => {
  const values = ['', 'nope', '{}', '{"token":1,"user":{"id":"u"}}', '{"token":"T"}', '{"token":"T","user":{"id":2}}', 'null'];
  assert.equal(loadSession(memory()), null);
  for (const text of values) assert.equal(loadSession(memory({ [SESSION_KEY]: text })), null, text);
});

test('a blocked storage loads no session and saves none', () => {
  const storage = memory({}, { broken: true });
  assert.equal(loadSession(storage), null);
  assert.equal(saveSession(storage, SESSION), false);
  assert.doesNotThrow(() => dropSession(storage));
});

test('dropSession removes the session and nothing else (ACC-8)', () => {
  const storage = memory({ [SESSION_KEY]: JSON.stringify(SESSION), 'maney.notes': '{}' });
  dropSession(storage);
  assert.deepEqual([...storage.map.keys()], ['maney.notes']);
});

test('the start routes by the session (ACC-1)', () => {
  assert.equal(routeAtStart(null), 'login');
  assert.equal(routeAtStart(SESSION), 'app');
  assert.equal(routeAtStart({ ...SESSION, user: { ...SESSION.user, approved: false } }), 'waiting');
});

test('with no session the offline flag opens the app; a session wins over it (ACC-1)', () => {
  assert.equal(routeAtStart(null, true), 'app');
  assert.equal(routeAtStart(null, false), 'login');
  assert.equal(routeAtStart(SESSION, true), 'app');
  assert.equal(routeAtStart({ ...SESSION, user: { ...SESSION.user, approved: false } }, true), 'waiting');
});

test('the offline flag is saved, read and removed (ACC-10)', () => {
  const storage = memory({ 'maney.notes': '{}' });
  assert.equal(OFFLINE_KEY, 'maney.offline');
  assert.equal(loadOffline(storage), false);
  assert.equal(saveOffline(storage), true);
  assert.equal(storage.map.get(OFFLINE_KEY), '1');
  assert.equal(loadOffline(storage), true);
  dropOffline(storage);
  assert.equal(loadOffline(storage), false);
  assert.deepEqual([...storage.map.keys()], ['maney.notes']);
});

test('only the value 1 counts as the offline flag', () => {
  for (const text of ['', '0', 'true', '"1"']) assert.equal(loadOffline(memory({ [OFFLINE_KEY]: text })), false, text);
});

test('a blocked storage reads no offline flag and saves none', () => {
  const storage = memory({}, { broken: true });
  assert.equal(loadOffline(storage), false);
  assert.equal(saveOffline(storage), false);
  assert.doesNotThrow(() => dropOffline(storage));
});

test('a pending sign-in is taken one time (ACC-4)', () => {
  const storage = memory();
  const pending = { provider: 'google', state: 'S', codeVerifier: 'V' };
  savePending(storage, pending);
  assert.deepEqual(takePending(storage), pending);
  assert.equal(takePending(storage), null);
});

test('a pending sign-in that cannot be read is null', () => {
  assert.equal(takePending(memory({ [OAUTH_KEY]: '{' })), null);
  assert.equal(takePending(memory({ [OAUTH_KEY]: '"text"' })), null);
  assert.equal(takePending(memory({}, { broken: true })), null);
});

test('a return from Google gives the code and the state, and a URL without them (ACC-4)', () => {
  const { oauth, clean } = readOAuthReturn(new URL('https://app.test/pwa-maney/?a=1&code=C&state=S#top'));
  assert.deepEqual(oauth, { code: 'C', state: 'S' });
  assert.equal(clean, '/pwa-maney/?a=1#top');
});

test('a cancel at Google returns error and state with no code', () => {
  const { oauth, clean } = readOAuthReturn(new URL('https://app.test/?error=access_denied&state=S'));
  assert.deepEqual(oauth, { code: null, state: 'S' });
  assert.equal(clean, '/');
});

test('a URL that is not a return changes nothing', () => {
  for (const href of ['https://app.test/?a=1', 'https://app.test/?code=C', 'https://app.test/?state=S']) {
    const url = new URL(href);
    assert.deepEqual(readOAuthReturn(url), { oauth: null, clean: `${url.pathname}${url.search}${url.hash}` }, href);
  }
});
