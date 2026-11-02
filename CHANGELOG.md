# Changelog

User-visible changes, newest first.

## Unreleased

- The Receipts and Summary screens. Receipts: rows in the order of `sortedReceipts` with the shop, the date and the amount; a sheet with the date, the amount (`parseEuros`, an error line under the field), the shop, the note and an empty photo slot; a swipe to Delete with Undo. Summary: read only, the month, the update time, the four counts, the next movements and the investments, or the empty text until maney sends one. The swipe rows move to `ui/rows.js`; a to-do check box is named by its text and shows the stored state after a refused tick; Escape closes the open sheet, else the open row. `eurosInput` writes cents as the text of an amount field.
- The To-dos screen replaces the notes demo: rows in the order of `sortedTodos`, a check box, the due date in the colour of danger when it is late, the sheet with the text and an optional date, a swipe to Delete with Undo. The sections are Receipts, To-dos, Summary and Settings, and each of the first three is a module; Receipts and Summary are empty until their screens come. The drag module (`ui/drag.js`, `reorder.js`) goes. `isIso` refuses an impossible time, and `setTodoDone` refuses a missing time.
- First release, from pwa-template 0.1.4: offline shell, install, update toast, What's new, Google or offline account, English and Spanish, light and dark themes. The release notes start with this version; the template's 0.1.2 to 0.1.4 entries, which this app never shipped, go.
