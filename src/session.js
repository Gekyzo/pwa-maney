// The session of the account on the device (ACC-5), the offline flag (ACC-10), the route of the
// start (ACC-1) and the return from Google (ACC-4). The storage objects are parameters, so a test passes a fake.
import { keyOf } from '#storage';

export const SESSION_KEY = keyOf('session');
// In sessionStorage, for the time of the Google redirect only: the state and the verifier.
export const OAUTH_KEY = keyOf('oauth');
// The device works with no account: Use offline (ACC-10).
export const OFFLINE_KEY = keyOf('offline');

const isObject = (value) => typeof value === 'object' && value !== null;

const read = (storage, key) => {
  try {
    const text = storage.getItem(key);
    return text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
};

const write = (storage, key, value) => {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const remove = (storage, key) => {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing more to remove.
  }
};

// The saved session, or null when there is none or the value is not one.
export const loadSession = (storage) => {
  const session = read(storage, SESSION_KEY);
  const valid = isObject(session) && typeof session.token === 'string' && isObject(session.user) && typeof session.user.id === 'string';
  return valid ? session : null;
};

export const saveSession = (storage, session) => write(storage, SESSION_KEY, session);

// ACC-8: only the session goes; the notes and the preferences stay.
export const dropSession = (storage) => remove(storage, SESSION_KEY);

export const loadOffline = (storage) => {
  try {
    return storage.getItem(OFFLINE_KEY) === '1';
  } catch {
    return false;
  }
};

export const saveOffline = (storage) => {
  try {
    storage.setItem(OFFLINE_KEY, '1');
    return true;
  } catch {
    return false;
  }
};

export const dropOffline = (storage) => remove(storage, OFFLINE_KEY);

// It never reads the clock: a saved session opens at once, offline too (ACC-1). A session wins over
// the offline flag.
export const routeAtStart = (session, offline = false) => {
  if (!session) return offline ? 'app' : 'login';
  return session.user.approved === true ? 'app' : 'waiting';
};

export const savePending = (storage, pending) => write(storage, OAUTH_KEY, pending);

// The pending sign-in, one time: it is removed as it is read.
export const takePending = (storage) => {
  const pending = read(storage, OAUTH_KEY);
  remove(storage, OAUTH_KEY);
  return isObject(pending) ? pending : null;
};

const RETURN_PARAMS = ['code', 'state', 'error'];

// A return has `state` and `code`, or `state` and `error` (a cancel at Google). `clean` is the path,
// the query and the hash with the parameters of the return removed, the other ones kept.
export const readOAuthReturn = (url) => {
  const { searchParams: params } = url;
  const isReturn = params.has('state') && (params.has('code') || params.has('error'));
  const oauth = isReturn ? { code: params.get('code'), state: params.get('state') } : null;
  const kept = new URLSearchParams(params);
  if (isReturn) RETURN_PARAMS.forEach((name) => kept.delete(name));
  const query = kept.toString();
  return { oauth, clean: `${url.pathname}${query ? `?${query}` : ''}${url.hash}` };
};
