# Notes

The demo domain of the template: a list of short notes. Replace this document with the domain of
the app. Its files are `src/notes.js`, `src/ui/notes.js`, `tests/notes.test.js`, the `notes.*`,
`row.delete`, `toast.noteDeleted`, `toast.order` and `error.*Note*`/`error.text*` keys of the
catalogs, the `#notes` section and the `#note-sheet` of `index.html`.

## Doc

- **NOTE-1** The doc is `{ version: 1, notes: [{ id, text }] }`, newest note first, stored as JSON
  under `maney.notes`. A stored doc that is not valid is kept under
  `maney.notes.corrupt`, and the app starts with no notes.
- **NOTE-2** `normalizeNotes` accepts a doc of version 1 whose notes have a non-empty id, a text
  that is not blank, and no id two times. It trims each text and drops unknown fields. A new
  version adds its migration here.

## Operations

- **NOTE-3** `addNote` puts a note first. The text is trimmed; a blank text is
  `error.textRequired`, and a text of more than 200 characters is `error.textTooLong`.
- **NOTE-4** `editNote` changes the text of one note, with the checks of NOTE-3.
- **NOTE-5** `deleteNote` removes one note. The toast `toast.noteDeleted` offers **Undo** for 5
  seconds.
- **NOTE-6** `moveNote` puts a note at an index of the list, clamped to its ends. The toast
  `toast.order` offers **Undo**.
- **NOTE-7** An id that is not in the doc is `error.noteMissing`, and nothing changes.

## Screen

- **NOTE-8** The Notes section lists the notes. With no note it shows `notes.empty` and **Add
  note**. **+** and **Add note** open the sheet of a new note; a tap on a row opens its detail
  (LAY-3), with **Edit** and **Delete**. The head of the sheet has the title and **Close**, its
  foot **Save**; **Close**, a tap on the veil or a drag down of the head closes it with no save.
- **NOTE-9** A row slides left to show **Delete**. A hold of a finger, or a vertical drag of the
  mouse, lifts the row and moves it in the list (NOTE-6).
