# To-dos, receipts and money

The doc of the phone: the to-dos and the receipts of the owner, and the To-dos screen. Its files are
`src/doc.js`, `src/todos.js`, `src/receipts.js`, `src/money.js` and `src/ui/todos.js`. The shapes follow the maney sync contract
(`maney_records`, kinds `todo` and `receipt`).

## Doc

- **TODO-1** The doc is `{ version: 1, todos: [Todo], receipts: [Receipt], summary: Summary | null }`,
  stored as JSON under `maney.doc`. A stored doc that is not valid is kept under `maney.doc.corrupt`,
  and the app starts with the empty doc; `isDocLost` tells the start so, before any save replaces it.
  A `Todo` is `{ id, text, due, done, doneAt }`. `due` is a real date `YYYY-MM-DD` or null. `doneAt` is
  null or an ISO-8601 time that `isIso` accepts: a real date, hours 00 to 23, minutes and seconds 00
  to 59, and a zone `Z` or `±hh:mm` (`2026-02-30T10:00:00Z` and `T24:00:00Z` do not pass). A `Receipt` is `{ id, takenOn, amountCents, shop, note, photo }`.
- **TODO-2** `normalizeDoc` accepts version 1 only. It refuses a to-do id or a receipt id that
  occurs two times, and any to-do, receipt or summary that its own check refuses. It drops unknown
  fields. `summary: null` is valid. A new version adds its migration here.
- **TODO-3** A date passes `isDate` only when it is a real calendar day: `2026-02-30` does not.
- **TODO-4** Money is integer cents. `parseEuros` accepts an amount of 1 to 7 digits and at most
  two decimals after one point or one comma, with an optional trailing `€`. It gives null for 0, a
  negative, a thousands mark (`1.234`), a third decimal or more than `MAX_CENTS` (999999999).
  `formatCents` writes de-DE euros, such as `-1.234,56 €`.

## To-dos

- **TODO-5** `addTodo` adds a to-do at the end, open. The text is trimmed and has 1 to 500 characters
  (`error.textRequired`, `error.textTooLong`). An empty `due` is null; a false date is
  `error.dateInvalid`. `editTodo` changes the text and the due date with the same checks.
  `setTodoDone` sets `done` and sets `doneAt` to the given time, or to null when `done` is false. A
  time that is missing or that `isIso` refuses, with `done` true, is `error.dateInvalid`.
  `deleteTodo` removes one. An unknown id is `error.todoMissing`.
- **TODO-6** `sortedTodos` puts the open to-dos first, by `due` ascending with no due last, then by id.
  The done to-dos follow, the latest `doneAt` first.

## Screen

- **TODO-10** The To-dos section lists the to-dos in the order of TODO-6, in one column. A row has a
  check box (`todos.done`), the text, and the due date as day and month in the language of the
  screen. The due date of an open to-do before today (`isLate`, the local day) is in the colour of
  danger. A tick of the check box calls `setTodoDone` with the time of the tap. With no to-do the
  section shows `todos.empty` and **Add to-do**. **+** and **Add to-do** open the sheet of a new
  to-do; a tap on the text opens the sheet of that to-do. The sheet has the text (at most 500
  characters), an optional date (`todos.due`) and **Save**; **Close**, a tap on the veil or a drag
  down of the head closes it with no save. A row slides left to show **Delete**; the toast
  `toast.todoDeleted` offers **Undo** for 5 seconds.

## Receipts

- **TODO-7** `addReceipt` checks `takenOn` (`error.dateInvalid`), `amountCents` as an integer above 0
  (`error.amountInvalid`), the shop of at most 120 characters (`error.shopTooLong`), the note of at
  most 500 (`error.noteTooLong`) and `photo` as null or a key of 1 to 64 characters
  (`error.photoInvalid`). Shop and note are trimmed and may be empty.
- **TODO-8** `editReceipt` changes the given fields with the checks of TODO-7. `deleteReceipt` removes
  one. An unknown id is `error.receiptMissing`.
- **TODO-9** `sortedReceipts` puts the latest `takenOn` first, then by id. A to-do and a receipt may
  share an id.
