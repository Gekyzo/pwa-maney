import { APP_SLUG } from '#config';
import { MODULES } from '#modules';

// Every key of this app: `<slug>.<name>`, so two apps of one origin do not share data.
export const keyOf = (name) => `${APP_SLUG}.${name}`;

const parse = (text) => {
  try {
    return { data: JSON.parse(text) };
  } catch {
    return { invalidJson: true };
  }
};

// `normalize(data)` validates and migrates a stored doc: a clean doc, or null when it is not one.
// A doc that is not valid stays at `<key>.corrupt`, so a bug of a migration loses nothing.
export const loadDoc = (storage, { key, normalize, empty }) => {
  try {
    const text = storage.getItem(key);
    if (text === null) return empty();
    const doc = normalize(parse(text).data);
    if (doc) return doc;
    storage.setItem(`${key}.corrupt`, text);
  } catch {
    // Storage is not available: the app works in memory.
  }
  return empty();
};

export const saveDoc = (storage, key, doc) => {
  try {
    storage.setItem(key, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
};

// True when the storage holds a doc at `key`, valid or not: the install is not new.
export const hasStoredDoc = (storage, key) => {
  try {
    return storage.getItem(key) !== null;
  } catch {
    return false;
  }
};

// SET-2: removes each key of this app, `<slug>.*`, the corrupt copies included, and no key of
// another app of the origin. The keys are read first: a removal moves the indices of the rest.
export const resetAll = (storage) => {
  try {
    const prefix = keyOf('');
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    keys.filter((key) => key?.startsWith(prefix)).forEach((key) => storage.removeItem(key));
    return true;
  } catch {
    return false;
  }
};

export const exportJson = (doc) => JSON.stringify(doc, null, 2);

// Local time, to the second, so two exports of one day get two names.
export const exportFilename = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${APP_SLUG}-${day}-${time}.json`;
};

export const importJson = (text, normalize) => {
  const { data, invalidJson } = parse(text);
  if (invalidJson) return { error: { key: 'error.invalidJson' } };
  const state = normalize(data);
  return state ? { state } : { error: { key: 'error.notBackup' } };
};

// The language that the user chose. It is a preference of the device, not a part of the state.
export const LANGUAGE_KEY = keyOf('lang');

// The stored language when it is one of `supported`, else null: the app follows the phone.
export const loadLanguage = (storage, supported) => {
  try {
    const lang = storage.getItem(LANGUAGE_KEY);
    return supported.includes(lang) ? lang : null;
  } catch {
    return null;
  }
};

// `null` removes the choice.
export const saveLanguage = (storage, lang) => {
  try {
    if (lang === null) storage.removeItem(LANGUAGE_KEY);
    else storage.setItem(LANGUAGE_KEY, lang);
    return true;
  } catch {
    return false;
  }
};

// The hand that the user holds the phone with. It is a preference of the device, as the language is.
export const HAND_KEY = keyOf('hand');

// The stored hand when it is `left`, else `right`.
export const loadHand = (storage) => {
  try {
    return storage.getItem(HAND_KEY) === 'left' ? 'left' : 'right';
  } catch {
    return 'right';
  }
};

// `right` is the hand of an app with no choice: it removes the key.
export const saveHand = (storage, hand) => {
  try {
    if (hand === 'left') storage.setItem(HAND_KEY, 'left');
    else storage.removeItem(HAND_KEY);
    return true;
  } catch {
    return false;
  }
};

// The colours of the app: `light`, `dark`, or `system` to follow the phone. A preference of the
// device, as the hand is.
export const THEME_KEY = keyOf('theme');
const THEMES = ['light', 'dark'];

// The stored theme when it is `light` or `dark`, else `system`.
export const loadTheme = (storage) => {
  try {
    const theme = storage.getItem(THEME_KEY);
    return THEMES.includes(theme) ? theme : 'system';
  } catch {
    return 'system';
  }
};

// `system` is the theme of an app with no choice: it removes the key.
export const saveTheme = (storage, theme) => {
  try {
    if (THEMES.includes(theme)) storage.setItem(THEME_KEY, theme);
    else storage.removeItem(THEME_KEY);
    return true;
  } catch {
    return false;
  }
};

// The modules that the user turned off (MOD-2). A preference of the device, as the theme is.
export const MODULES_KEY = keyOf('modules');

const knownModules = (ids) => MODULES.filter((id) => ids.includes(id));

// The stored ids that are modules, in the order of MODULES. Anything else reads as all on.
export const loadModules = (storage) => {
  try {
    const ids = JSON.parse(storage.getItem(MODULES_KEY));
    return Array.isArray(ids) ? knownModules(ids) : [];
  } catch {
    return [];
  }
};

// No module off is the app with no choice: it removes the key.
export const saveModules = (storage, off) => {
  try {
    const ids = knownModules(off);
    if (ids.length) storage.setItem(MODULES_KEY, JSON.stringify(ids));
    else storage.removeItem(MODULES_KEY);
    return true;
  } catch {
    return false;
  }
};

// Set after the walkthrough of the first start closed. It is a preference of the device, as the
// hand is.
export const ONBOARDED_KEY = keyOf('onboarded');

// A storage that cannot be read counts as seen, so the walkthrough does not show at each start.
export const loadOnboarded = (storage) => {
  try {
    return storage.getItem(ONBOARDED_KEY) === '1';
  } catch {
    return true;
  }
};

export const saveOnboarded = (storage) => {
  try {
    storage.setItem(ONBOARDED_KEY, '1');
    return true;
  } catch {
    return false;
  }
};

// The newest version whose release notes the user has seen (VER-21).
export const SEEN_VERSION_KEY = keyOf('seen-version');

// Null when nothing is stored or the storage cannot be read: no notes show.
export const loadSeen = (storage) => {
  try {
    return storage.getItem(SEEN_VERSION_KEY);
  } catch {
    return null;
  }
};

export const saveSeen = (storage, version) => {
  try {
    storage.setItem(SEEN_VERSION_KEY, version);
    return true;
  } catch {
    return false;
  }
};
