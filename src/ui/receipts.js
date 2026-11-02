import { addReceipt, editReceipt, deleteReceipt, findReceipt, sortedReceipts } from '#receipts';
import { parseEuros, formatCents, eurosInput } from '#money';
import { localDay } from '#todos';
import { intlTag } from '#i18n';
import { bindSheetDrag } from '#ds/sheet';
import { $, el, ui, state, t, lang, apply, render, showToast } from '#ui/context';
import { iconButton } from '#ui/controls';
import { rowKey, swipeRow } from '#ui/rows';
import { scalePhoto } from '#ui/photo';
import { photos, photoLink } from '#ui/account';

// REC-8: the photo taken in the open sheet, `{ key, blob }`, until Save puts it in the store.
let draft = null;
// The object URL of the pending photo in view, revoked when the sheet closes or shows another.
let objectUrl = null;
// Counts the shows of the photo slot, so that a late answer of an older one changes nothing.
let shows = 0;
// A Save that waits for the photo store, so that a second tap saves nothing.
let saving = false;

const dropObjectUrl = () => {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
};

const photoNote = (key) => {
  $('receipt-photo-note').textContent = key ? t(key) : '';
  $('receipt-photo-note').hidden = !key;
};

// REC-9: a pending photo shows from the device with `receipts.photoPending`; an uploaded one shows
// online only, through a file token, and offline the slot shows `receipts.photoOffline`.
const showPhoto = async (key) => {
  shows += 1;
  const mine = shows;
  dropObjectUrl();
  const img = $('receipt-photo-img');
  img.hidden = true;
  img.removeAttribute('src');
  photoNote(null);
  if (!key) return;
  let blob = draft?.key === key ? draft.blob : null;
  try {
    blob ??= await photos.get(key);
  } catch {
    blob = null;
  }
  if (mine !== shows) return;
  if (blob) {
    objectUrl = URL.createObjectURL(blob);
    img.src = objectUrl;
    img.hidden = false;
    photoNote('receipts.photoPending');
    return;
  }
  if (!navigator.onLine) {
    photoNote('receipts.photoOffline');
    return;
  }
  let url = null;
  try {
    url = await photoLink(key);
  } catch {
    if (mine === shows) photoNote('receipts.photoOffline');
    return;
  }
  if (mine !== shows || !url) return;
  img.src = url;
  img.hidden = false;
};

// The error line under the amount, shown while the typed amount is not one (REC-6).
const showAmountError = (on) => {
  $('receipt-amount-error').hidden = !on;
  if (on) $('receipt-amount').setAttribute('aria-invalid', 'true');
  else $('receipt-amount').removeAttribute('aria-invalid');
};

export const openReceiptSheet = (id = null) => {
  const receipt = id ? findReceipt(state, id) : null;
  ui.sheet = 'receipt';
  ui.editing = receipt ? id : null;
  $('receipt-sheet-title').textContent = t(receipt ? 'receipts.edit' : 'receipts.add');
  $('receipt-taken').value = receipt?.takenOn ?? localDay(new Date());
  $('receipt-amount').value = receipt ? eurosInput(receipt.amountCents) : '';
  $('receipt-shop').value = receipt?.shop ?? '';
  $('receipt-note').value = receipt?.note ?? '';
  showAmountError(false);
  draft = null;
  $('receipt-photo').hidden = false;
  showPhoto(receipt?.photo ?? null);
  render();
  $('receipt-amount').focus();
};

export const closeReceiptSheet = () => {
  ui.sheet = null;
  ui.editing = null;
  draft = null;
  shows += 1;
  dropObjectUrl();
  $('receipt-photo-img').removeAttribute('src');
  render();
};

// REC-7: the picked photo is scaled at once and waits in the sheet until Save.
const takePhoto = async (event) => {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;
  let blob;
  try {
    blob = await scalePhoto(file);
  } catch {
    showToast(t('error.photoInvalid'));
    return;
  }
  if (ui.sheet !== 'receipt') return;
  draft = { key: crypto.randomUUID(), blob };
  showPhoto(draft.key);
};

// REC-8: Save puts a new photo in the store first, then saves the receipt that names it, so the
// sync never sees a receipt whose pending photo is missing.
const save = async (fields) => {
  const photo = draft;
  if (photo) {
    try {
      await photos.put(photo.key, photo.blob);
    } catch {
      showToast(t('error.notSaved'));
      return;
    }
  }
  const withPhoto = photo ? { ...fields, photo: photo.key } : fields;
  const result = ui.editing ? editReceipt(state, ui.editing, withPhoto) : addReceipt(state, { photo: null, ...withPhoto });
  if (apply(result)) closeReceiptSheet();
  else if (photo) photos.remove(photo.key).catch(() => {});
};

const remove = (id) => apply(deleteReceipt(state, id), { undoText: t('toast.receiptDeleted') });

// The day, the month and the year of a calendar day, in the language of the screen, read in UTC.
const dayText = (day) =>
  new Intl.DateTimeFormat(intlTag(lang), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));

// A row: the shop, the date below it and the amount at the end. It slides left to show Delete (REC-5).
const row = (receipt) => {
  const shop = receipt.shop || t('receipts.noShop');
  const amount = formatCents(receipt.amountCents);
  const name = el('button', { className: 'item-row-name', type: 'button', onclick: () => openReceiptSheet(receipt.id) }, [
    el('span', { className: receipt.shop ? 'item-row-label' : 'item-row-label receipts-noshop', textContent: shop }),
    el('small', { className: 'item-row-meta', textContent: dayText(receipt.takenOn) }),
  ]);
  const body = el('div', { className: 'item-row-body' }, [name, el('span', { className: 'receipts-amount', textContent: amount })]);
  const label = t('row.delete', { text: `${shop} ${amount}` });
  const actions = [iconButton('trash', label, () => remove(receipt.id), { variant: 'danger' })];
  const node = el('li', { className: 'item-row' }, [swipeRow(rowKey('receipt', receipt.id), body, actions)]);
  node.dataset.id = receipt.id;
  return node;
};

export const renderReceipts = () => {
  $('receipts').hidden = ui.view !== 'receipts';
  if (ui.openId?.startsWith('receipt:') && !findReceipt(state, ui.openId.slice('receipt:'.length))) ui.openId = null;
  $('receipt-list').replaceChildren(...sortedReceipts(state.receipts).map(row));
  $('receipts-empty').hidden = state.receipts.length > 0;
  $('receipt-sheet').hidden = ui.sheet !== 'receipt';
};

export const bind = () => {
  $('receipts-add').addEventListener('click', () => openReceiptSheet());
  $('receipt-veil').addEventListener('click', closeReceiptSheet);
  $('receipt-close').addEventListener('click', closeReceiptSheet);
  bindSheetDrag($('receipt-sheet'), { close: closeReceiptSheet });
  $('receipt-amount').addEventListener('input', () => showAmountError(false));
  $('receipt-photo-button').addEventListener('click', () => $('receipt-photo-input').click());
  $('receipt-photo-input').addEventListener('change', takePhoto);
  $('receipt-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;
    const amountCents = parseEuros($('receipt-amount').value);
    if (amountCents === null) {
      showAmountError(true);
      $('receipt-amount').focus();
      return;
    }
    const fields = { takenOn: $('receipt-taken').value, amountCents, shop: $('receipt-shop').value, note: $('receipt-note').value };
    saving = true;
    try {
      await save(fields);
    } finally {
      saving = false;
    }
  });
};
