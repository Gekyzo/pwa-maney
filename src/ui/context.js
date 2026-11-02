import { DOC_KEY, emptyDoc, normalizeDoc } from '#doc';
import {
  loadDoc,
  saveDoc,
  loadLanguage,
  saveLanguage,
  loadHand,
  saveHand,
  loadTheme,
  saveTheme,
  loadModules,
  saveModules,
  loadOnboarded,
  hasStoredDoc,
  isDocLost,
  exportJson,
  exportFilename,
} from '#storage';
import { LANGUAGES, resolveLanguage, translator } from '#i18n';
import { shouldShow } from '#onboarding';

// The values that the views share. A view reads them through the import, a live binding, and
// changes them only through the setters of this module.

export const UNDO_MS = 5000;
export const MESSAGE_MS = 3000;
export const CLICK_GUARD_MS = 350;
// Width of one swipe-action of a row, the same as in styles.css.
export const SIDE_BUTTON = 64;
export const DRAG_START = 10;
export const LEAVE_MS = 200;
// The wait for the service worker to load the new deploy.
export const REFRESH_MS = 15000;
// The wait for the deployed version: a weak network can leave the request open.
export const CHECK_MS = 8000;

export const $ = (id) => document.getElementById(id);

export const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

export const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

export const scroller = document.querySelector('main');

// The choice of the user, or null to follow the phone.
export let chosen = storage ? loadLanguage(storage, LANGUAGES) : null;
export let lang = resolveLanguage(navigator.languages, chosen);
export let t = translator(lang);
// The hand that holds the phone: `left` mirrors the controls, in styles.css.
export let hand = storage ? loadHand(storage) : 'right';
document.documentElement.dataset.hand = hand;

// The colours: `light` or `dark` override the phone, in styles.css; `system` follows it.
export let theme = storage ? loadTheme(storage) : 'system';
document.documentElement.dataset.theme = theme;

// The modules that the user turned off (MOD-2).
export let off = storage ? loadModules(storage) : [];
export const isOn = (id) => !off.includes(id);
export let navMotion = false;

// The text of a message of a pure module.
export const textOf = ({ key, params }) => t(key, params);

// Read before the doc. A stored doc, valid or not, means that the install is not new.
const firstStart = storage ? shouldShow({ seen: loadOnboarded(storage), hasState: hasStoredDoc(storage, DOC_KEY) }) : false;

const DOC = { key: DOC_KEY, normalize: normalizeDoc, empty: emptyDoc };
export let state = storage ? loadDoc(storage, DOC) : emptyDoc();

// Read before any save, as the first save replaces the doc that could not be read (TODO-1).
export const stateLost = storage ? isDocLost(storage, DOC) : false;

export const ui = {
  // The section in view.
  view: 'receipts',
  // The open sheet: `todo`, `receipt` or null.
  sheet: null,
  // The to-do or the receipt that the open sheet edits, or null for a new one.
  editing: null,
  // The key of the row whose side actions are open (`rowKey` of ui/rows.js), or null.
  openId: null,
  // Where the last swipe left its row, { key, x }, so that the next render moves the row from there.
  settleFrom: null,
  // The page of the walkthrough in view, or null while the walkthrough is closed.
  onboarding: firstStart ? 0 : null,
  // `running` is the version of the cached shell; `latest` is the deployed one.
  version: { running: null, latest: null, checking: false },
  // The install offer: `idle`, `available` or `installed` (INS-1).
  install: 'idle',
  // True once the update toast showed in this start (VER-18).
  updateOffered: false,
};

let toastTimer = null;
// The button of the toast: { label, run }, or null; and the doc that its Undo puts back, or null.
export let toastAction = null;
export let undoDoc = null;

// `undo` is the doc to go back to; `action` is { label, run } for any other button.
export const showToast = (text, { undo = null, action = null, ms = undo || action ? UNDO_MS : MESSAGE_MS } = {}) => {
  clearTimeout(toastTimer);
  undoDoc = undo;
  toastAction = undo ? { label: t('toast.undo'), run: () => commit(undo) } : action;
  $('toast-text').textContent = text;
  $('toast-action').textContent = toastAction?.label ?? '';
  $('toast-action').hidden = !toastAction;
  $('toast').hidden = false;
  toastTimer = setTimeout(hideToast, ms);
};

export const hideToast = () => {
  clearTimeout(toastTimer);
  toastAction = null;
  undoDoc = null;
  $('toast').hidden = true;
};

// The render of the whole screen. app.js registers it, so that a view renders without importing app.js.
let renderer = () => {};
export const setRender = (fn) => {
  renderer = fn;
};
export const render = () => renderer();

// The hook of each save: the sync registers its queue here, so that this module imports no view.
let onSave = () => {};
export const setOnSave = (fn) => {
  onSave = fn;
};

// `explicit` marks an import (SYNC-9): its save deletes the records of the account that it lacks.
export const commit = (next, { explicit = false } = {}) => {
  state = next;
  const saved = storage !== null && saveDoc(storage, DOC_KEY, state);
  render();
  // After the render: an error of the hook never leaves the screen behind the state.
  if (saved) {
    try {
      onSave(state, { explicit });
    } catch (error) {
      console.error(error);
    }
  }
  return saved;
};

// Puts a doc that the sync merged in place (SYNC-2): it is saved and shown, but it is not a save of the
// user, so the hook does not run. A doc that cannot be saved changes nothing and gives false, so the
// doc in memory stays the stored one.
export const replaceDoc = (next) => {
  if (storage && !saveDoc(storage, DOC_KEY, next)) return false;
  // Undo would put back the doc of before the merge and send it as a save of the user.
  if (undoDoc) hideToast();
  state = next;
  render();
  return true;
};

// Applies a pure operation. `undoText` makes the change reversible for a few seconds.
export const apply = (result, { undoText = null, explicit = false } = {}) => {
  if (result.error) {
    showToast(textOf(result.error));
    return false;
  }
  const previous = state;
  const saved = commit(result.state, { explicit });
  if (!saved) showToast(t('error.notSaved'));
  else if (undoText) showToast(undoText, { undo: previous });
  else hideToast();
  return true;
};

const download = (filename, text) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  el('a', { href: url, download: filename }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// The backup file of a doc (SET-1), also offered before a login or a logout loses changes (ACC-11, ACC-12).
export const exportDoc = (doc) => download(exportFilename(new Date()), exportJson(doc));

// The click that follows a drag, a drop or a slide must not press the button below the finger.
export let clickGuardUntil = 0;
export const guardClick = () => {
  clickGuardUntil = Date.now() + CLICK_GUARD_MS;
};

// With no storage a choice lasts until the app closes.
export const setLanguage = (code) => {
  chosen = code;
  if (storage) saveLanguage(storage, chosen);
  lang = resolveLanguage(navigator.languages, chosen);
  t = translator(lang);
};

export const setHand = (value) => {
  hand = value === 'left' ? 'left' : 'right';
  if (storage) saveHand(storage, hand);
  document.documentElement.dataset.hand = hand;
};

export const setTheme = (value) => {
  theme = ['light', 'dark'].includes(value) ? value : 'system';
  if (storage) saveTheme(storage, theme);
  document.documentElement.dataset.theme = theme;
};

export const setModules = (next) => {
  off = next;
  if (storage) saveModules(storage, off);
};

// Set by a switch of Modules, so that the render that follows animates the navigation (MOD-3).
export const setNavMotion = (on) => {
  navMotion = on;
};
