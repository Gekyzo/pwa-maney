# Receipts

The receipts of the owner and the Receipts screen. Its files are `src/receipts.js`, `src/money.js`
and `src/ui/receipts.js`. The shape follows the maney sync contract (`maney_records`, kind `receipt`).

## Doc

- **REC-1** A `Receipt` of the doc (TODO-1) is `{ id, takenOn, amountCents, shop, note, photo }`.
  `takenOn` is a real date `YYYY-MM-DD`, `amountCents` an integer from 1 to `MAX_CENTS`, `shop` a
  text of 0 to 120 characters, `note` a text of 0 to 500, and `photo` null or the key of a photo, 1
  to 64 characters. `normalizeReceipt` refuses a receipt with no id, a shop or a note that is not a
  text, or no `photo` field.

## Operations

- **REC-2** `addReceipt` checks `takenOn` (`error.dateInvalid`), `amountCents` as an integer above 0
  (`error.amountInvalid`), the shop of at most 120 characters (`error.shopTooLong`), the note of at
  most 500 (`error.noteTooLong`) and `photo` as null or a key of 1 to 64 characters
  (`error.photoInvalid`). Shop and note are trimmed and may be empty. It adds the receipt at the end.
- **REC-3** `editReceipt` changes the given fields with the checks of REC-2. `deleteReceipt` removes
  one. An unknown id is `error.receiptMissing`.
- **REC-4** `sortedReceipts` puts the latest `takenOn` first, then by id. A to-do and a receipt may
  share an id.

## Screen

- **REC-5** The Receipts section lists the receipts in the order of REC-4, in one column, centred
  from 600px. A row has the shop, or `receipts.noShop` in the muted colour, the date below it as day,
  month and year in the language of the screen, and the amount at the end through `formatCents`.
  With no receipt the section shows `receipts.empty` and **Add receipt**. A row slides left to show
  **Delete**; the toast `toast.receiptDeleted` offers **Undo** for 5 seconds. Escape closes the open
  sheet, else the open row.
- **REC-6** **+** and **Add receipt** open the sheet of a new receipt; a tap on a row opens the sheet
  of that receipt. The sheet has the date (today by default), the amount (a decimal keyboard), the
  shop (at most 120 characters), the note (at most 500) and **Save**. **Save** reads the amount with
  `parseEuros`: null shows `error.amountInvalid` under the field and saves nothing. A new receipt has
  no photo. The sheet holds an empty photo slot, hidden. **Close**, a tap on the veil or a drag down
  of the head closes it with no save. The amount of a receipt opens as `eurosInput` writes it.
