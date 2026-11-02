# Receipts

The receipts of the owner and the Receipts screen. Its files are `src/receipts.js`, `src/money.js`
and `src/ui/receipts.js`; the photos are `src/photos.js`, `src/photostore.js` and `src/ui/photo.js`. The shape follows the maney sync contract (`maney_records`, kind `receipt`).

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
  `parseEuros`: null shows `error.amountInvalid` under the field and saves nothing. A new receipt
  with no photo taken has `photo: null`. The sheet holds the photo slot (REC-7 to REC-9). **Close**,
  a tap on the veil or a drag down of the head closes it with no save, and a photo taken in it is
  dropped. The amount of a receipt opens as `eurosInput` writes it.

## Photo

- **REC-7** The photo slot of the sheet has **Take photo** (`receipts.takePhoto`), a button in front
  of a hidden `<input type="file" accept="image/*" capture="environment">`. `scalePhoto` draws the
  picked file, turned as its EXIF says (`imageOrientation: 'from-image'`), into a canvas of the size
  that `fitWithin` gives: at most 1600 px on the long side (`PHOTO_MAX`), the same ratio, each side
  at least 1 px; a smaller picture keeps its size. The canvas gives a `image/jpeg` blob of quality
  0.8. A file that cannot be read shows `error.photoInvalid`. A new photo of an open receipt
  replaces its photo on **Save**.
- **REC-8** The photo waits in the sheet until **Save**. **Save** puts it in the store of pending
  photos (the IndexedDB database `maney.photos`, object store `pending`, by the key of the photo),
  then saves the receipt with `photo` set to the new key, `crypto.randomUUID()`. A store that
  fails shows `error.notSaved` and saves nothing; a save that the checks refuse removes the photo
  from the store. With no IndexedDB the store lives in memory for this start. The photo leaves the
  store when the server took it (SYNC-14), or at the sweep of a start (SYNC-15). An export
  holds no pending photo (SYNC-16).
- **REC-9** A photo of the store shows from the device, through an object URL that the sheet
  revokes when it closes, with `receipts.photoPending`. An uploaded photo shows online only: the
  app finds its `maney_files` record and reads the bytes through a file token
  (`POST /api/files/token`, then `/api/files/maney_files/<id>/<name>?token=`). One file token
  serves at most 120 s. Offline, or when a request fails, the slot shows `receipts.photoOffline`.
  The picture has the text `receipts.photo`.
- **REC-10** **Delete all data** (SET-2) also empties the store of pending photos, before the
  reload. A logout and a login of another user empty it too (SYNC-10).
