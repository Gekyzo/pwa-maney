# Changelog

User-visible changes, newest first.

## Unreleased

No change.

## 0.1.2 - 2026-11-02

- The pull pages by keyset (SYNC-4): each request asks for the records after the last one received, by `updated` then `id`, instead of a numbered page. A record edited on another device during the pull no longer shifts the others, so the record at a page border is no longer skipped for good.

## 0.1.1 - 2026-11-02

- An import keeps the summary of the device (`importedDoc` of `doc.js`; SYNC-9, SYNC-13). `mergePulled` no longer moves the server copy of a queued record, so its push keeps the old base and takes the field-level merge instead of patching stale data over a change of maney (SYNC-5).
- The orphan sweep of pending photos runs once when the syncer starts, on the doc and queue of the start, with or without a session, so a delete and its Undo inside the first debounced run keep the photo (SYNC-15). A receipt upsert naming a photo with no pending file goes as it is when the server copy names it or `findPhoto` finds the file, else it is forgotten as a refused photo (`photo: null` in the queue, base and doc). The backup questions (`reset.confirm*`, `account.exportAsk`, `account.logoutExport`) say that a backup holds no pending photo (SYNC-16).
- Receipt photos through `maney_files`. The sheet has Take photo (`capture="environment"`); `scalePhoto` (`ui/photo.js`) scales it to at most 1600 px on the long side as a JPEG of quality 0.8 (`fitWithin` of `photos.js`). The photo waits in the IndexedDB store `maney.photos` (`photostore.js`) and uploads, multipart, before the receipt record that names it (SYNC-14); a failed upload keeps the receipt queued. At the first run of a start the sync removes the pending photos that nothing names and tombstones the uploaded photos of deleted or replaced receipts once, keeping their keys in `gone` (SYNC-15). A photo that the server refuses is dropped and the receipt goes with `photo: null` (SYNC-16). An uploaded photo shows online through a file token. Delete all data also clears the photo store.
- Receipts and to-dos sync with `maney_records` (`records.js`, `sync.js`, `syncer.js`, from pwa-wardrobe). Each to-do, receipt and the summary is a record; the phone never queues the summary (SYNC-13). A push reads the record and, when its `updated` is not the base one, patches the field-level merge of `mergeFields`: a field changed on both sides keeps the server value, and the toast `toast.syncOverruled` names it. A pulled tombstone removes the item. The account gains the last sync, the logout and login of ACC-11 and ACC-12, the offline note and the reload on a change by another tab (SYNC-12). An import with a session replaces the records of the account (SYNC-9).
- The Receipts and Summary screens. Receipts: rows in the order of `sortedReceipts` with the shop, the date and the amount; a sheet with the date, the amount (`parseEuros`, an error line under the field), the shop, the note and an empty photo slot; a swipe to Delete with Undo. Summary: read only, the month, the update time, the four counts, the next movements and the investments, or the empty text until maney sends one. The swipe rows move to `ui/rows.js`; a to-do check box is named by its text and shows the stored state after a refused tick; Escape closes the open sheet, else the open row. `eurosInput` writes cents as the text of an amount field.
- The To-dos screen replaces the notes demo: rows in the order of `sortedTodos`, a check box, the due date in the colour of danger when it is late, the sheet with the text and an optional date, a swipe to Delete with Undo. The sections are Receipts, To-dos, Summary and Settings, and each of the first three is a module; Receipts and Summary are empty until their screens come. The drag module (`ui/drag.js`, `reorder.js`) goes. `isIso` refuses an impossible time, and `setTodoDone` refuses a missing time.
- First release, from pwa-template 0.1.4: offline shell, install, update toast, What's new, Google or offline account, English and Spanish, light and dark themes. The release notes start with this version; the template's 0.1.2 to 0.1.4 entries, which this app never shipped, go.
