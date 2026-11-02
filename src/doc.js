import { keyOf } from '#storage';
import { isDate, normalizeTodo } from '#todos';
import { normalizeReceipt } from '#receipts';
import { normalizeSummary } from '#summary';

// The stored doc of the app: to-dos and receipts of the phone, and the last summary that maney pushed.
export const DOC_KEY = keyOf('doc');
export { isDate };

export const emptyDoc = () => ({ version: 1, todos: [], receipts: [], summary: null });

const clean = (list, normalize) => {
  if (!Array.isArray(list)) return null;
  const items = list.map(normalize);
  if (!items.every(Boolean)) return null;
  return new Set(items.map((item) => item.id)).size === items.length ? items : null;
};

// A clean version 1 doc, or null. Add a migration here when the version goes up.
export const normalizeDoc = (data) => {
  if (typeof data !== 'object' || data === null || data.version !== 1) return null;
  const todos = clean(data.todos, normalizeTodo);
  const receipts = clean(data.receipts, normalizeReceipt);
  if (!todos || !receipts) return null;
  if (data.summary === null) return { version: 1, todos, receipts, summary: null };
  const summary = normalizeSummary(data.summary);
  return summary ? { version: 1, todos, receipts, summary } : null;
};

// SYNC-9, SYNC-13: an import takes the to-dos and the receipts of the file; the summary is the one of
// the device, as only maney writes it.
export const importedDoc = (imported, current) => ({ ...imported, summary: current.summary });
