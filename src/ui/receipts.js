import { addReceipt, editReceipt, deleteReceipt, findReceipt, sortedReceipts } from '#receipts';
import { parseEuros, formatCents, eurosInput } from '#money';
import { localDay } from '#todos';
import { intlTag } from '#i18n';
import { bindSheetDrag } from '#ds/sheet';
import { $, el, ui, state, t, lang, apply, render } from '#ui/context';
import { iconButton } from '#ui/controls';
import { rowKey, swipeRow } from '#ui/rows';

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
  render();
  $('receipt-amount').focus();
};

export const closeReceiptSheet = () => {
  ui.sheet = null;
  ui.editing = null;
  render();
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
  $('receipt-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const amountCents = parseEuros($('receipt-amount').value);
    if (amountCents === null) {
      showAmountError(true);
      $('receipt-amount').focus();
      return;
    }
    const fields = { takenOn: $('receipt-taken').value, amountCents, shop: $('receipt-shop').value, note: $('receipt-note').value };
    // The photo comes with its own step; a new receipt has none yet.
    const result = ui.editing ? editReceipt(state, ui.editing, fields) : addReceipt(state, { ...fields, photo: null });
    if (apply(result)) closeReceiptSheet();
  });
};
