# To-dos, receipts and money

The doc of the phone: the to-dos and the receipts of the owner. Its files are `src/doc.js`,
`src/todos.js`, `src/receipts.js` and `src/money.js`. The shapes follow the maney sync contract
(`maney_records`, kinds `todo` and `receipt`).

## Doc

- **TODO-1** The doc is `{ version: 1, todos: [Todo], receipts: [Receipt], summary: Summary | null }`,
  stored as JSON under `maney.doc`. A stored doc that is not valid is kept under `maney.doc.corrupt`.
  A `Todo` is `{ id, text, due, done, doneAt }`. `due` is a real date `YYYY-MM-DD` or null. `doneAt` is
  an ISO-8601 time or null. A `Receipt` is `{ id, takenOn, amountCents, shop, note, photo }`.
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
  `setTodoDone` sets `done` and sets `doneAt` to the given time, or to null when `done` is false.
  `deleteTodo` removes one. An unknown id is `error.todoMissing`.
- **TODO-6** `sortedTodos` puts the open to-dos first, by `due` ascending with no due last, then by id.
  The done to-dos follow, the latest `doneAt` first.

## Receipts

- **TODO-7** `addReceipt` checks `takenOn` (`error.dateInvalid`), `amountCents` as an integer above 0
  (`error.amountInvalid`), the shop of at most 120 characters (`error.shopTooLong`), the note of at
  most 500 (`error.noteTooLong`) and `photo` as null or a key of 1 to 64 characters
  (`error.photoInvalid`). Shop and note are trimmed and may be empty.
- **TODO-8** `editReceipt` changes the given fields with the checks of TODO-7. `deleteReceipt` removes
  one. An unknown id is `error.receiptMissing`.
- **TODO-9** `sortedReceipts` puts the latest `takenOn` first, then by id. A to-do and a receipt may
  share an id.
