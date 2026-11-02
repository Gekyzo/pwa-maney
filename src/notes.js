import { APP_SLUG } from '#config';

// The demo domain of the template: a list of short notes, newest first. Replace it with the
// domain of the app.
export const NOTES_KEY = `${APP_SLUG}.notes`;
export const MAX_TEXT = 200;

export const emptyNotes = () => ({ version: 1, notes: [] });

const missing = (state) => ({ state, error: { key: 'error.noteMissing' } });

// The clean text, or an error message.
const checkText = (text) => {
  const clean = String(text ?? '').trim();
  if (!clean) return { error: { key: 'error.textRequired' } };
  if (clean.length > MAX_TEXT) return { error: { key: 'error.textTooLong', params: { max: MAX_TEXT } } };
  return { clean };
};

export const findNote = (state, id) => state.notes.find((note) => note.id === id) ?? null;

export const addNote = (state, text, id = crypto.randomUUID()) => {
  const { clean, error } = checkText(text);
  if (error) return { state, error };
  return { state: { ...state, notes: [{ id, text: clean }, ...state.notes] } };
};

export const editNote = (state, id, text) => {
  if (!findNote(state, id)) return missing(state);
  const { clean, error } = checkText(text);
  if (error) return { state, error };
  return { state: { ...state, notes: state.notes.map((note) => (note.id === id ? { ...note, text: clean } : note)) } };
};

export const deleteNote = (state, id) => {
  if (!findNote(state, id)) return missing(state);
  return { state: { ...state, notes: state.notes.filter((note) => note.id !== id) } };
};

// Puts the note at `index` of the list without it, clamped to the ends.
export const moveNote = (state, id, index) => {
  const note = findNote(state, id);
  if (!note) return missing(state);
  const rest = state.notes.filter((other) => other.id !== id);
  const at = Math.min(Math.max(index, 0), rest.length);
  return { state: { ...state, notes: [...rest.slice(0, at), note, ...rest.slice(at)] } };
};

const validNote = (note) =>
  typeof note === 'object' &&
  note !== null &&
  typeof note.id === 'string' &&
  note.id !== '' &&
  typeof note.text === 'string' &&
  note.text.trim() !== '';

// A clean version 1 doc, or null. Add a migration here when the version goes up.
export const normalizeNotes = (data) => {
  if (typeof data !== 'object' || data === null || data.version !== 1 || !Array.isArray(data.notes)) return null;
  if (!data.notes.every(validNote)) return null;
  const notes = data.notes.map(({ id, text }) => ({ id, text: text.trim() }));
  if (new Set(notes.map((note) => note.id)).size !== notes.length) return null;
  return { version: 1, notes };
};
