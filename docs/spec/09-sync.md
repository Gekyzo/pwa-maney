# Sync with the account

The receipts and the to-dos sync with the account through the server, and so with maney. The
summary comes from maney. Each to-do, each receipt and the summary is one record of
`maney_records`. The data shapes are those of the maney sync contract
(`maney-2026/docs/superpowers/specs/2026-11-02-maney-04-sync-contract.md`). A device sends its
changes as records and pulls the changes of the other clients. Its files are `src/records.js`,
`src/sync.js`, `tests/records.test.js` and `tests/sync.test.js`. Both modules are pure: they read
no storage and no clock. The client of the server (`src/pocketbase.js`) sends and receives the
records (SYNC-4). The sync driver (`src/syncer.js`, `tests/syncer.test.js`) queues the saves and
runs the sync; it takes the client, the storage, the clock and the timer as parameters.

## Records

- **SYNC-1** A to-do is the record `{ kind: 'todo', key: <id>, data }` and a receipt the record
  `{ kind: 'receipt', key: <id>, data }`. `data` is the item without its `id`. The summary is the
  record `{ kind: 'summary', key: 'current', data }`, and `data` is the summary. The record id is
  `<kind>:<key>`, such as `todo:<id>` and `summary:current`. A doc built from records, and the
  check of SYNC-7, take the `id` of an item from the key, also when `data` holds an `id`. The doc
  has version 1, its to-dos and receipts in the order of the records, and the summary or null. A
  record of another kind stays out of the doc. The diff of two sets of records gives the deletes
  first, then the upserts, each sorted by record id. A receipt delete carries `photo`: the key of
  the photo of the receipt, or null. Two `data` values that differ only in the order of their
  keys are equal. The cursor of a pull is the greatest `updated` of the pulled records.
- **SYNC-2** Each save of a device with an approved session and a stored owner queues its diff
  against the last state that the driver knows, and that state moves to the saved doc. A doc that
  the driver puts in place after a merge is not a save: it queues nothing, and it hides an open
  **Undo** toast, whose doc of before the merge would delete the merged records. A merged doc that
  the app cannot save changes nothing and is logged: the doc, the base and the cursor stay, so the
  next run pulls the same records again. A run first queues a save that the driver did not see (no
  session yet, an auth stop). A save that holds none of the records of the account, from a doc
  that held none of them since the start, queues no delete of them and is logged: a doc that fell
  back to the empty one deletes nothing. Such a save still queues its new and changed records, and
  the deletes of the records that it added, and they join the base (with their ids in
  `maney.sync` until the next merge), so the merge keeps them next to the records of the account.
  A user who deletes the records one by one, or an explicit save such as an import, still queues
  the deletes. When the start could not read the doc (`lost`), the account is pulled again in full
  with an empty base, so nothing is deleted.
- **SYNC-3** A sync starts at the start of the app and at the `online` event (after the refresh
  of ACC-6, through the login), when the app shows again (`visibilitychange` to visible) while the
  browser is online, 1.5 s after the last save of a burst (a new save in that time starts the delay
  again) and at each event of the realtime stream. Over **Sign in** after an auth stop, the
  `online` event only runs the sync, which waits for the login. A run asked for while one runs
  gets that run; a stream event during a run starts one more run after it. The stream opens after
  a run that ends `ok`, and closes at a reset, at an auth stop and at the `offline` event. A stop
  at a rate limit (429) or a server error (5xx) starts the next run after 5, 15, 30 and then 60 s,
  the last delay again for each further stop; a run that reaches the server ends the series.
- **SYNC-4** The client finds a record by owner, kind and key. A push carries the base of its
  record: the server copy at the last pull or push, or null when the device never saw it.
  - With no record, an upsert creates one, and a delete creates nothing and gives no record. A
    create that the server refuses as a duplicate patches the record that another device made.
  - A delete patches the found record with `deleted: true` and keeps its `data`, whatever its
    `updated`.
  - An upsert of a found record whose `updated` is the one of the base, or of a found record with
    a null base, patches `deleted: false` and the `data` of the change, so a tombstone comes back.
    A null base means that the device never saw a server change of the record (a create whose
    answer was lost, or the first login of SYNC-8), so the change of the device wins (SYNC-5).
  - Else the record moved on the server since the base, and the push merges field by field
    (`mergeFields` of `src/sync.js`): the server `data`, with each field that the device changed
    since the base put back. A field that the server changed too keeps the server value; it is
    overruled when it differs from the value of the device. `doneAt` is never named alone: `done`
    names both. The push patches `deleted: false` and the merged `data`. So a to-do text
    edited on the phone survives a `done` set by maney. The window between the read and the patch
    is accepted (one owner, two clients).
  - The push gives the server record and the overruled fields. The change always leaves the
    queue, so the pull of the same run puts the merged value in place. When some fields are
    overruled the app shows `toast.syncOverruled`, with the labels `sync.field.*` of the fields
    joined by `, `, each once. A field with no label is not named, and with none there is no
    toast.

  A pull asks for the records of the owner with `updated >= cursor`, sorted by `updated` then `id`, and
  walks all pages. With no cursor it pulls all records. A request with no owner fails with an auth
  error and sends nothing. The stream subscribes to `maney_records` with the current token at each
  connect, and a connect after the first reports a reconnect. A delete event gives a record with
  `deleted: true`. A run refreshes the token when it expires within 60 s, when it cannot be read,
  or when the last refresh is more than 10 min old; a session that the refresh finds no longer
  approved (ACC-3) makes no request for data. The run then sends the queue in order, then pulls
  from the cursor and merges. A change leaves the queue only when the server took it, and the
  queue is saved at once. The run stops at the first change that fails, and keeps the queue: a
  network or server error is `offline`, a 429 is `rate`. A 400 with field errors drops that change
  and goes on. A 401, a 403 or a 400 with no field error (a refused rule) is an auth stop: the
  queue stays, the status has `auth`, and no run makes a request until the next login; a save
  still queues. The app then shows **Sign in** over the app, which can close (ACC-2), and keeps
  the doc and the queue. A run that ends stores the time of the sync. A reset (a logout, Delete
  all data, or a login of another user) makes a run in progress stale: it saves nothing and
  changes no doc (SYNC-10).
- **SYNC-5** A change that waits in the queue wins. A pulled record with the same id does not
  change the local record. The copy of the server still takes the pulled record.
- **SYNC-6** A pulled record with `deleted` counts as absent. It removes the local record, unless
  a change of that record waits in the queue. A pulled summary tombstone empties the summary.
- **SYNC-7** The app checks each record alone, by its kind: a to-do as `normalizeTodo`, a receipt
  as `normalizeReceipt`, the summary as `normalizeSummary` and only with the key `current`. A
  record of another kind, or one that the check refuses, is dropped and its id is reported. The
  other records stay.

## Login, import and reset

- **SYNC-8** The first login on a device with no stored owner merges. The base of the sync is
  empty, so each local to-do and receipt is queued as an upsert, and the pull brings the records
  of the account. A record on both sides (the same id) keeps the copy of the device: it is pushed
  with a null base, so it goes as it is (SYNC-4), and a queued change wins (SYNC-5). A device with no records takes the
  account and sends nothing. No record is dropped, so the device keeps no copy of the list of
  before the login. A login of the stored owner goes on with the queue and the state. A login
  starts a run of its own; a run in progress with the token of before the login becomes stale, so
  its auth error cannot stop this sync.
- **SYNC-9** An import replaces the receipts and the to-dos of the account. With a session its
  question is `import.confirmAccount`, which says so. It is an explicit save: the next run sends a
  tombstone for each to-do and receipt of the account that the device knows and the import does
  not hold, and an upsert for the others, with no regard to the guard of SYNC-2. A record that
  another client added after the last sync, or a pulled record that the check dropped (SYNC-7), is
  not known: it stays on the server. The first comes into the doc at the next pull. The summary of
  the import is not sent (SYNC-13).
- **SYNC-10** **Delete all data** (SET-2) clears this device only. The sync stops first, before
  the storage is removed: a run in progress becomes stale and saves nothing, the timers and the
  stream stop, and the queue is dropped. The driver sends nothing; it removes the session, the
  sync state and the queue, puts the empty doc in place, and the status starts again (online,
  nothing pending, `reached` 0). The records of the account stay on the server. The store of
  pending photos is emptied (REC-10), and `gone` goes with the sync state.

## Photos

- **SYNC-14** A receipt photo is one record of `maney_files`: `owner`, `key` (the `photo` value of
  its receipt), `photo` (the file) and `deleted`. The file goes before the receipt record that names
  it. For each receipt upsert of the queue whose photo is in the store of pending photos (REC-8),
  the run uploads the file first, then removes it from the store, then pushes the receipt. The
  upload is multipart (`FormData`, no `Content-Type` of the app). It first finds the file by owner
  and key: a found one (an answer lost on the way back, or a tombstone) is patched with the photo
  and `deleted: false`; else it is created, and a create that the server refuses as a duplicate
  finds the file and patches it. A failed upload stops the run as a failed push does (SYNC-4): the
  receipt stays in the queue and the photo in the store, and the next run uploads, then pushes. An
  auth stop keeps both until the login. A request with no owner fails with an auth error and sends
  nothing.
- **SYNC-15** At the first run of each start with a session, once, before the token refresh:
  - the pending photos that no receipt of the doc and no queued receipt upsert names leave the
    store (`orphanPhotos`), with no request: a receipt deleted before its photo uploaded sends no
    file;
  - the photos to tombstone are found (`gonePhotos`): the photos of the receipt tombstones of the
    server copy, and the photos that a pushed receipt of an earlier start no longer names
    (`dropped` in `maney.sync`, a replaced photo), less those that a receipt of the doc names and
    those in `gone`. After the push of the queue, the run patches each of them with
    `deleted: true` (a file that the server lacks, or a patch refused with field errors, counts as
    done) and adds its key to `gone` in
    `maney.sync`, so a later start sends nothing for it. A receipt that names it again is left
    alone. A failure stops the run as a failed push does.

  The sweep runs only once per start because an **Undo** of a delete (5 s, in memory) can bring a
  receipt back within the same start; a photo of a receipt deleted in this start waits for the
  next start.
- **SYNC-16** A photo that the server refuses with field errors (a 400 with field errors, such as
  a wrong type or a size above 10 MB) leaves the store and is logged, and its receipt is pushed with
  `photo: null`. The pull of the same run puts `photo: null` in the doc.

## Status

- **SYNC-11** The status is `{ online, pending, lastSync, auth, reached }`. `online` is false
  after the `offline` event or a run that stopped at the network or at a server error, and true
  again after a run that `reached` counts, so a rate limit is not offline. `pending` is the length
  of the queue, and `reached` counts the runs that ended `ok`, at a rate limit or at an auth stop;
  a run that stopped at the network or at a server error (5xx) does not count. While a session is
  saved and `online` is false, the note `sync.offline` shows above Receipts, To-dos and Summary,
  not in Settings. The status also gives the last sync of Settings (ACC-8).

## Tabs

- **SYNC-12** A change of the stored doc, sync state, queue or session by another tab reloads
  this tab, so two tabs never mix their state. The app listens to the `storage` event. It reloads
  for a change of `maney.doc` or `maney.queue`, for a clear of the storage, for a change of
  `maney.sync` other than the time of the last sync and the server copy, and for a change of the
  user or of the approval in `maney.session`. A new token alone does not reload, so two open tabs
  do not reload each other at each start. Before the reload the sync of this tab stops: a run in
  progress becomes stale and saves nothing, the timers and the stream stop, and the storage keeps
  what the other tab wrote. An open sheet of this tab loses its draft.

## Who writes the summary

- **SYNC-13** The phone never writes the summary: the diff gives no change of kind `summary`, so
  the phone never queues one, also when its doc lost or changed the summary. Only a pull changes
  the summary of the doc; the merge puts a doc in place when only its summary changed.

## Keys

- `maney.sync`: the owner, the cursor, the last server records, the base records, the time of the
  last sync, the ids that a refused save added (SYNC-2), and the photos in `gone` and `dropped`
  (SYNC-15).
- `maney.photos`: the IndexedDB database of the photos that wait for their upload (REC-8).
- `maney.queue`: the changes that the server has not taken, in order.
