import { isDate } from '#todos';
import { MAX_CENTS } from '#money';

// The receipts of the doc: pure operations. A receipt is { id, takenOn, amountCents, shop, note, photo }.
export const MAX_SHOP = 120;
export const MAX_NOTE = 500;
export const MAX_PHOTO = 64;

const missing = (state) => ({ state, error: { key: 'error.receiptMissing' } });

const validAmount = (cents) => Number.isInteger(cents) && cents > 0 && cents <= MAX_CENTS;
const validPhoto = (photo) => photo === null || (typeof photo === 'string' && photo.length > 0 && photo.length <= MAX_PHOTO);

// The clean receipt without its id, or an error message.
const check = ({ takenOn, amountCents, shop, note, photo }) => {
  if (!isDate(takenOn)) return { error: { key: 'error.dateInvalid' } };
  if (!validAmount(amountCents)) return { error: { key: 'error.amountInvalid' } };
  const cleanShop = String(shop ?? '').trim();
  if (cleanShop.length > MAX_SHOP) return { error: { key: 'error.shopTooLong', params: { max: MAX_SHOP } } };
  const cleanNote = String(note ?? '').trim();
  if (cleanNote.length > MAX_NOTE) return { error: { key: 'error.noteTooLong', params: { max: MAX_NOTE } } };
  const cleanPhoto = photo ?? null;
  if (!validPhoto(cleanPhoto)) return { error: { key: 'error.photoInvalid' } };
  return { clean: { takenOn, amountCents, shop: cleanShop, note: cleanNote, photo: cleanPhoto } };
};

export const findReceipt = (state, id) => state.receipts.find((receipt) => receipt.id === id) ?? null;

export const addReceipt = (state, fields, id = crypto.randomUUID()) => {
  const { clean, error } = check(fields);
  if (error) return { state, error };
  return { state: { ...state, receipts: [...state.receipts, { id, ...clean }] } };
};

// `fields` holds only the fields to change.
export const editReceipt = (state, id, fields) => {
  const current = findReceipt(state, id);
  if (!current) return missing(state);
  const { clean, error } = check({ ...current, ...fields });
  if (error) return { state, error };
  return { state: { ...state, receipts: state.receipts.map((receipt) => (receipt.id === id ? { id, ...clean } : receipt)) } };
};

export const deleteReceipt = (state, id) => {
  if (!findReceipt(state, id)) return missing(state);
  return { state: { ...state, receipts: state.receipts.filter((receipt) => receipt.id !== id) } };
};

// The newest `takenOn` first, then by id.
export const sortedReceipts = (receipts) =>
  [...receipts].sort((a, b) => (a.takenOn !== b.takenOn ? (a.takenOn < b.takenOn ? 1 : -1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

// A clean receipt, or null.
export const normalizeReceipt = (value) => {
  if (typeof value !== 'object' || value === null) return null;
  if (typeof value.id !== 'string' || value.id === '') return null;
  if (typeof value.shop !== 'string' || typeof value.note !== 'string') return null;
  if (value.photo === undefined) return null;
  const { clean, error } = check(value);
  return error ? null : { id: value.id, ...clean };
};
