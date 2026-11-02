// The account screens (ACC-2): Sign in, with Google or offline, and Waiting for approval, over the
// whole app; the group Account of Settings with the last sync (ACC-8); and the sync of the receipts
// and to-dos with the account (09-sync.md): the login, the logout, the auth stop, the offline note
// (SYNC-11) and the toast of the fields that another device changed first (SYNC-4).
import { createClient, PocketBaseError } from '#pocketbase';
import { createSyncer, reloadsOn, SYNC_KEY } from '#syncer';
import { loadSession, dropSession, routeAtStart, savePending, takePending, loadOffline, saveOffline, dropOffline } from '#session';
import { apiUrl } from '#config';
import { intlTag } from '#i18n';
import { $, storage, state, stateLost, ui, t, lang, showToast, render, replaceDoc, setOnSave, exportDoc } from '#ui/context';

const SCREENS = ['login', 'waiting'];

// The Google redirect keeps its state and verifier for one tab only (ACC-4).
const pendingStorage = (() => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
})();

// ACC-9: with no storage the app keeps no session, shows no account screen and works as before.
const client = storage
  ? createClient({ url: apiUrl(location.hostname), fetch: window.fetch.bind(window), EventSource: window.EventSource })
  : null;

// The screen in view, or null; and whether Sign in closes back to the app (ACC-2, an auth stop).
let screen = null;
let closable = false;
// Use offline for this start, when the storage refused the flag (ACC-10).
let offlineNow = false;
// A refresh in progress, so that the start and an `online` event send one request.
let refreshing = null;

// The last status of the sync (SYNC-11).
let status = { online: true, pending: 0, lastSync: null, auth: false, reached: 0 };
// A logout in progress, so that a second tap starts no second one.
let leaving = false;

export const sessionNow = () => (client ? loadSession(storage) : null);

// True while a session is saved: Delete all data then also logs out (SET-2).
export const signedIn = () => sessionNow() !== null;

const isOffline = () => offlineNow || loadOffline(storage);

const lastSyncText = () => {
  if (!status.lastSync) return t('account.never');
  const time = new Intl.DateTimeFormat(intlTag(lang), { dateStyle: 'short', timeStyle: 'short' }).format(new Date(status.lastSync));
  return t('account.lastSync', { time });
};

export const renderAccount = () => {
  $('account-group').hidden = !client;
  const session = sessionNow();
  $('account-row').hidden = !session;
  $('logout').hidden = !session;
  // After an auth stop the session stays, and Sign in with Google logs in again (SYNC-4).
  $('account-login').hidden = session !== null && !status.auth;
  $('account-email').textContent = session ? session.user.email || session.user.name : '';
  $('account-sync').textContent = session ? lastSyncText() : '';
  // SYNC-11: the changes stay saved on the device while the sync cannot reach the server.
  $('sync-offline').hidden = !session || status.online || ui.view === 'settings';
};

const show = (name, { canClose = false } = {}) => {
  screen = name;
  closable = name === 'login' && canClose;
  $('auth').hidden = name === null;
  for (const id of SCREENS) $(id).hidden = id !== name;
  if (name) {
    $('auth').setAttribute('aria-labelledby', `${name}-title`);
    $(`${name}-title`).focus();
  }
  renderAccount();
};

const showRoute = (session) => {
  const route = routeAtStart(session, isOffline());
  // ACC-10: an approved session that opens the app removes the flag.
  if (route === 'app' && session) {
    dropOffline(storage);
    offlineNow = false;
  }
  show(route === 'app' ? null : route);
};

const showError = (key) => {
  $('login-error').textContent = key ? t(key) : '';
  $('login-error').hidden = !key;
};

const errorKey = (error) => {
  if (error?.type === 'rate') return 'account.error.tooMany';
  if (!(error instanceof PocketBaseError) || error.type === 'network' || error.type === 'server') return 'account.error.network';
  return 'account.error.google';
};

// The buttons of a screen wait for its request, so that a second tap sends nothing (rate limit).
const busy = async (name, task) => {
  const buttons = [...$(name).querySelectorAll('button')];
  buttons.forEach((button) => {
    button.disabled = true;
  });
  try {
    await task();
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
};

const redirectUrl = () => `${location.origin}${location.pathname}`;

// SYNC-4: an auth stop shows Sign in over the app; the doc and the queue stay, and a login of
// the same user goes on with them.
const onStatus = (next) => {
  const stopped = next.auth && !status.auth;
  status = next;
  if (stopped) {
    showError(null);
    show('login', { canClose: true });
  }
  render();
};

// The fields that the toast can name; another name shows as it is.
const FIELDS = ['text', 'due', 'done', 'takenOn', 'amountCents', 'shop', 'note', 'photo'];
const fieldName = (name) => (FIELDS.includes(name) ? t(`sync.field.${name}`) : name);

// SYNC-4: a push kept the server value of fields that this device changed too. With none, no toast.
const onOverruled = (fields) => {
  if (fields.length === 0) return;
  showToast(t('toast.syncOverruled', { fields: [...new Set(fields)].map(fieldName).join(', ') }));
};

// The doc that a merge gives is put in place with no save of the user (SYNC-2).
const syncer = client ? createSyncer({ client, storage, getDoc: () => state, setDoc: replaceDoc, onStatus, onOverruled, lost: stateLost }) : null;
if (syncer) {
  status = syncer.status();
  setOnSave((doc, options) => syncer.notify(doc, options));
}

// The stored owner of the doc, or null (SYNC-8).
const owner = () => {
  try {
    return JSON.parse(storage.getItem(SYNC_KEY))?.owner ?? null;
  } catch {
    return null;
  }
};

// ACC-11, SYNC-8: the login of a session that the server gave. With changes of another user that are
// not sent, the session stays in memory only until the user exports them or declines the export.
const enter = async (session) => {
  let result = await syncer.login(session);
  if (result === 'ask-export') {
    if (window.confirm(t('account.exportAsk'))) exportDoc(state);
    result = await syncer.login(session, { discard: true });
  }
  if (result === 'waiting') {
    show('waiting');
    return;
  }
  // The first run of the login stopped at an auth error: onStatus has shown Sign in.
  if (syncer.status().auth) return;
  showRoute(session);
};

// ACC-12: online, the queue goes first. Changes that are still not sent ask before they go: a no
// changes nothing, a yes offers the export, then the logout clears the device.
const logout = async () => {
  if (leaving) return;
  leaving = true;
  try {
    const result = await syncer.logout({ online: navigator.onLine });
    if (result === 'ask-export') {
      if (!window.confirm(t('account.logoutAsk'))) return;
      if (window.confirm(t('account.logoutExport'))) exportDoc(state);
      await syncer.logout({ online: navigator.onLine, discard: true });
    }
    showError(null);
    showRoute(null);
  } finally {
    leaving = false;
  }
};

// Log out of Waiting for approval (ACC-12): the owner of the doc logs out in full. An account
// that never owned it only drops its session, and the doc of the device stays.
const leaveWaiting = () => {
  const session = sessionNow();
  if (session && owner() === session.user.id) return logout();
  dropSession(storage);
  showError(null);
  showRoute(null);
  return null;
};

// ACC-10: Use offline opens the app, for this start too when the storage refuses the flag.
const useOffline = () => {
  offlineNow = !saveOffline(storage);
  showError(null);
  show(null);
};

// ACC-8: Sign in with Google of Settings, on a device that works offline.
const openLogin = () => {
  showError(null);
  show('login', { canClose: true });
};

// ACC-4: the server gives the URL of Google; the state and the verifier wait in sessionStorage.
const google = () =>
  busy('login', async () => {
    showError(null);
    try {
      const { url, pending } = await client.oauthStart(redirectUrl());
      if (!savePending(pendingStorage, pending)) throw new PocketBaseError('storage');
      location.assign(url);
    } catch (error) {
      showError(errorKey(error));
    }
  });

// ACC-4: the return from Google. app.js has removed `code`, `state` and `error` from the URL already.
const finishOAuth = async ({ code, state }) => {
  const pending = takePending(pendingStorage);
  // A sign-in after an auth stop comes back to a device that keeps its session: Sign in can close.
  show('login', { canClose: sessionNow() !== null });
  if (!pending || !code) {
    showError('account.error.google');
    return;
  }
  await busy('login', async () => {
    try {
      await enter(await client.oauthFinish({ code, state }, pending, redirectUrl()));
    } catch (error) {
      showError(errorKey(error));
    }
  });
};

// ACC-6: a fresh session carries `approved`, and its login starts a run (SYNC-3). An auth error ends
// the session; any other error keeps it, a run starts the retries of SYNC-3, and the next start or
// `online` event tries again. Resolves to the fresh session, or null.
const refresh = () => {
  const session = sessionNow();
  if (!session) return Promise.resolve(null);
  refreshing ??= client
    .refresh(session.token)
    .then(
      async (fresh) => {
        // A logout during the request: the answer saves nothing.
        if (sessionNow()?.token !== session.token) return null;
        await enter(fresh);
        return fresh;
      },
      (error) => {
        if (error?.type === 'auth') {
          // The doc, the sync state and the queue stay: a login of the same user goes on (SYNC-8).
          dropSession(storage);
          showError(null);
          showRoute(null);
        } else {
          if (screen === 'waiting') showToast(t(errorKey(error)));
          syncer.run();
        }
        return null;
      },
    )
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
};

// ACC-7: Check again.
const checkAgain = () =>
  busy('waiting', async () => {
    const fresh = await refresh();
    if (fresh && fresh.user.approved !== true) showToast(t('account.waiting.still'));
  });

// ACC-1 and ACC-6: a saved session opens at once, offline too; online, it is refreshed after.
export const startAccount = (oauth) => {
  if (!client) return;
  if (oauth) {
    finishOAuth(oauth);
    return;
  }
  const session = sessionNow();
  showRoute(session);
  if (!session) return;
  if (navigator.onLine) refresh();
  else syncer.offline();
};

// ACC-6, SYNC-3: at the `online` event a session is refreshed, and its login runs the sync. Over
// Sign in (an auth stop) the sync only runs, and waits for the login.
export const goOnline = () => {
  if (!syncer) return;
  if (sessionNow() && screen !== 'login') refresh();
  else syncer.online();
};

// SYNC-3, SYNC-11: the `offline` event closes the stream and shows the offline note.
export const goOffline = () => {
  syncer?.offline();
};

// SYNC-11: a device that shows again runs the sync, as some phones send no `online` event.
export const goVisible = () => {
  if (syncer && document.visibilityState === 'visible' && navigator.onLine && sessionNow()) syncer.run();
};

// SYNC-10: Delete all data stops the sync before it removes the storage, so that a run in progress
// saves nothing after the removal.
export const stopSync = () => {
  syncer?.reset();
};

// SYNC-12: another tab changed the doc, the sync state, the queue or the session. The sync of
// this tab stops first, so that a run in progress saves nothing of its old memory, then the page
// loads again from what the storage holds.
export const goStale = (event) => {
  if (!storage || event.storageArea !== storage || !reloadsOn(event)) return;
  syncer?.stop();
  location.reload();
};

export const isAccountOpen = () => screen !== null;

// ACC-2: Sign in over an open app (the offline flag is set, Settings opened it, or an auth stop)
// closes with Escape, as Use offline.
export const closeAccount = () => {
  if (screen === 'login' && (closable || isOffline())) show(null);
};

export const bind = () => {
  if (!client) return;
  $('login-google').addEventListener('click', google);
  $('waiting-check').addEventListener('click', checkAgain);
  $('waiting-logout').addEventListener('click', leaveWaiting);
  $('logout').addEventListener('click', logout);
  $('login-offline').addEventListener('click', useOffline);
  $('account-login').addEventListener('click', openLogin);
};
