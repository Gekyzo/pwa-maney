import { NOTES_KEY, emptyNotes, normalizeNotes } from '#notes';
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
// The hold of a finger that lifts a row for a manual order.
export const HOLD_MS = 400;
// The distance from an edge of the list where a lifted row scrolls it, and the scroll of one frame.
export const EDGE = 56;
export const EDGE_STEP = 8;
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
const firstStart = storage ? shouldShow({ seen: loadOnboarded(storage), hasState: hasStoredDoc(storage, NOTES_KEY) }) : false;

const DOC = { key: NOTES_KEY, normalize: normalizeNotes, empty: emptyNotes };
export let state = storage ? loadDoc(storage, DOC) : emptyNotes();

export const ui = {
  // The section in view.
  view: 'notes',
  // The note whose detail is open, or null.
  noteId: null,
  sheetOpen: false,
  // The note that the sheet edits, or null for a new note.
  editing: null,
  // The note row whose side actions are open, or null.
  openId: null,
  // Where the last swipe left its row, so that the next render moves the row from there.
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
// The button of the toast: { label, run }, or null.
export let toastAction = null;

// `undo` is the doc to go back to; `action` is { label, run } for any other button.
export const showToast = (text, { undo = null, action = null, ms = undo || action ? UNDO_MS : MESSAGE_MS } = {}) => {
  clearTimeout(toastTimer);
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
  $('toast').hidden = true;
};

// The render of the whole screen. app.js registers it, so that a view renders without importing app.js.
let renderer = () => {};
export const setRender = (fn) => {
  renderer = fn;
};
export const render = () => renderer();

export const commit = (next) => {
  state = next;
  const saved = storage !== null && saveDoc(storage, NOTES_KEY, state);
  render();
  return saved;
};

// Applies a pure operation. `undoText` makes the change reversible for a few seconds.
export const apply = (result, { undoText = null } = {}) => {
  if (result.error) {
    showToast(textOf(result.error));
    return false;
  }
  const previous = state;
  const saved = commit(result.state);
  if (!saved) showToast(t('error.notSaved'));
  else if (undoText) showToast(undoText, { undo: previous });
  else hideToast();
  return true;
};

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
