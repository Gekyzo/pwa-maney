# Engineering

## Modules

| Module | Responsibility | May import |
|---|---|---|
| `src/config.js` | The slug of the app, which `npm run init` rewrites, and the URL of the account server | nothing |
| `src/pocketbase.js` | The client of the account server: Google sign-in, refresh, the access row (ACC-3), the records of `maney_records`: pull, push with the field-level merge, stream (SYNC-4); the photos of `maney_files`: upload, find, tombstone, the file token and the photo address (SYNC-14, SYNC-15, REC-9) | `config`, `sync` |
| `src/session.js` | The session on the device, the start route and the return from Google (ACC-1, ACC-4, ACC-5) | `storage` |
| `src/version.js` | Version rules and the update offer rule | nothing |
| `src/whatsnew.js` | The parse of the release notes and the versions that a user has not seen | `version` |
| `src/i18n.js` | The language choice and the translator | `locales/*` |
| `src/sections.js` | The order of the sections and the rule of the slide between them | nothing |
| `src/modules.js` | The modules that Settings turns off, and the visible sections | `sections` |
| `src/storage.js` | Load, save, validation hook, export, import, device preferences | `config`, `modules` |
| `src/install.js` | The install offer state machine | nothing |
| `src/money.js` | Euros as integer cents: the parse of typed euros, the text of an amount field and the de-DE display | nothing |
| `src/todos.js` | Pure to-do operations, the real-date and real-time checks, the late rule and the to-do validation | nothing |
| `src/receipts.js` | Pure receipt operations and the receipt validation | `todos`, `money` |
| `src/summary.js` | The validation of the summary that maney pushes | `todos` |
| `src/doc.js` | The doc of to-dos, receipts and the summary, and its validation | `storage`, `todos`, `receipts`, `summary` |
| `src/records.js` | The doc as server records, and the diff of two sets of records, with no change of the summary (SYNC-1, SYNC-13) | nothing |
| `src/sync.js` | The queue of changes, the merge of pulled records, the check of each record by its kind and the field-level merge of a push (SYNC-4 to SYNC-7) | `records`, `todos`, `receipts`, `summary` |
| `src/syncer.js` | The sync driver: the queue of each save, the run, the retries, the token refresh, the stream, the status and the check of a change by another tab (SYNC-2 to SYNC-4, SYNC-11, SYNC-12); the photo before its receipt, the sweep of a start and a refused photo (SYNC-14 to SYNC-16) | `records`, `sync`, `session`, `pocketbase`, `doc`, `storage`, `photos`, `photostore` |
| `src/photos.js` | The scale of a photo and the photos that the sweep of a start finds (REC-7, SYNC-15) | nothing |
| `src/photostore.js` | The store of the photos that wait for their upload: IndexedDB `maney.photos`, or memory (REC-8) | `storage` |
| `src/swipe.js` | The rule that settles the slide of a row (optional) | nothing |
| `src/particles.js` | The particles of a picture and their place in time (optional) | nothing |
| `src/onboarding.js` | The show rule and the page steps of the walkthrough (optional) | nothing |
| `src/ui/context.js` | The values that the views share, the toast, `render`, `commit`, `apply`, the hook of each save, `replaceDoc` (the doc that the sync puts in place) and the export file | `doc`, `storage`, `i18n`, `onboarding` |
| `src/ui/controls.js` | The icon builder and the side-action button | `ui/context` |
| `src/ui/motion.js` | Row collapse and expand animations | `ui/context` |
| `src/ui/update.js` | The version line, the check, the refresh and the update toast | `version`, `i18n`, `ui/context` |
| `src/ui/install.js` | The Install button | `install`, `ui/context` |
| `src/ui/nav.js` | The navigation, the change and the slide of a section | `sections`, `modules`, `ui/context`, `ui/update`, `ui/dust` |
| `src/ui/rows.js` | The rows that slide left to show their side actions, and the close of an open row | `swipe`, `ui/context` |
| `src/ui/todos.js` | The To-dos section, its rows and its sheet (TODO-10) | `todos`, `i18n`, `ds/sheet`, `ui/context`, `ui/controls`, `ui/rows` |
| `src/ui/receipts.js` | The Receipts section, its rows and its sheet with its photo (REC-5 to REC-9) | `receipts`, `money`, `todos`, `i18n`, `ds/sheet`, `ui/context`, `ui/controls`, `ui/rows`, `ui/photo`, `ui/account` |
| `src/ui/photo.js` | The scale of a photo through a canvas (REC-7) | `photos` |
| `src/ui/summary.js` | The Summary section, read only (SUM-3) | `money`, `i18n`, `ui/context` |
| `src/ui/settings.js` | Settings, Delete all data (SET-2, SYNC-10), the import (SYNC-9), and the text of the page in its language | `doc`, `storage`, `i18n`, `modules`, `ui/context`, `ui/update`, `ui/onboarding`, `ui/account` |
| `src/ui/dust.js` | The dust of a navigation item (optional) | `particles`, `ui/context`, `ui/controls` |
| `src/ui/onboarding.js` | The walkthrough (optional) | `onboarding`, `sections`, `storage`, `ui/context`, `ui/controls` |
| `src/ui/whatsnew.js` | The release notes sheet, its Settings row and the seen version | `whatsnew`, `onboarding`, `i18n`, `storage`, `ds/sheet`, `ui/context` |
| `src/ui/account.js` | The account screens, the group Account of Settings, and the sync of the app: the login, the logout, the auth stop, the window events, the offline note and the overruled toast (ACC-1 to ACC-12, SYNC-3, SYNC-4, SYNC-10 to SYNC-12); the photo store and the address of an uploaded photo (REC-8 to REC-10) | `pocketbase`, `syncer`, `sync`, `session`, `config`, `i18n`, `ui/context`, `photostore` |
| `src/app.js` | Wires the views, the global keys, the service worker and the update check | all of the above |

## Code rules

- **ENG-1** A state operation is a pure function `(state, …) → { state }`. It never changes its
  input.
- **ENG-2** A rejected operation returns `{ state, error }` with the same state object. Nothing
  throws for a user error. `error` is a message `{ key, params }`.
- **ENG-3** The screen applies an operation, saves, then builds the page again from the state.
- **ENG-4** A module with a side effect takes the object of that effect as a parameter (the
  storage object), so that a test passes a fake.
- **ENG-5** No module imports `src/app.js`. A view of `src/ui/` renders the screen through
  `render` of `src/ui/context.js`.
- **ENG-6** A module of `src/` is imported by its alias, `from '#todos'`, never by a relative
  path. Node resolves `#name` through `imports` of `package.json`; the browser resolves it through
  the import map of `index.html`. `tests/aliases.test.js` checks that the two agree. An alias
  `#ds/<name>` names the module `vendor/design-system/<name>.js` (DSV-1).
- **ENG-7** A new id comes from `crypto.randomUUID()`. An operation that creates a record takes
  the id as an optional parameter, for the tests.
- **ENG-8** Every storage key is `<slug>.<name>`, from `keyOf` of `src/storage.js` or `APP_SLUG`
  of `src/config.js`, so two apps of one origin do not share data.
- **ENG-16** The screen code is `src/app.js` and the views of `src/ui/`. A view never imports
  `src/app.js`, a pure module never imports a view, and the imports among the views have no
  cycle. `src/ui/context.js` owns the values that the views share; another module reads them
  through its import and changes them only through a setter. `tests/layers.test.js` checks this.
- **ENG-17** `npm run init -- <slug> "<Name>"` turns a copy of the template into a new app, one
  time: it renames each literal of the template, starts the version at `0.1.0` and the cache at
  `v1`, resets
  `CHANGELOG.md` and deletes `docs/superpowers/`. It changes no file when it fails. It leaves
  `vendor/` as it is (DSV-4).

## Storage keys

The doc key is `maney.doc` ([10-todos.md](10-todos.md)). The device preferences are `maney.lang`,
`maney.hand`, `maney.theme`, `maney.modules` and `maney.onboarded`. The account keeps `maney.session` (ACC-5) and
`maney.offline` (ACC-10), and `maney.oauth` in `sessionStorage` for the time of a Google redirect (ACC-4).
The sync keeps `maney.sync` and `maney.queue` ([09-sync.md](09-sync.md)). The photos that wait for their
upload are in the IndexedDB database `maney.photos` ([07-receipts.md](07-receipts.md), REC-8).

## Change guide

| Change | Do |
|---|---|
| A new rule of the domain | An operation in its pure module with its tests, then a control in its view of `src/ui/` |
| A new view | A module of `src/ui/` with a `bind()` that `src/app.js` calls, its alias, its file in `SHELL`, its row in the module table and its name in `UI` of `designs/page.js` |
| A change of the shape of the doc | Its `normalize` function, a new `version` and its migration |
| A new text | A key in each catalog, with the same placeholders |
| A new module of `src/` | Its alias in the import map of `index.html`, and its file in `SHELL` of `sw.js` |
| A new file that the app loads | Its path in `SHELL` of `sw.js` |
| A stored doc that an old module cannot read | A new cache name in `sw.js` (SW-10) |
| A change of behaviour | The rule in this specification, in the same commit |

## Tests

`npm test` runs `node --test` (Node 20 or later).

| Test file | Covers |
|---|---|
| `tests/money.test.js` | Typed euros to cents, the text of an amount field and the display of cents (TODO-4, REC-6) |
| `tests/todos.test.js` | The to-do operations, their order, the late rule and their validation (TODO-1, TODO-3, TODO-5, TODO-6, TODO-10) |
| `tests/receipts.test.js` | The receipt operations, their order and their validation (REC-2 to REC-4) |
| `tests/summary.test.js` | The validation of the summary (SUM-1, SUM-2) |
| `tests/doc.test.js` | The doc, its key and its validation (TODO-1, TODO-2, REC-1) |
| `tests/pocketbase.test.js` | The client of the account server and its URL, the records, the push with its field-level merge and the stream (ACC-3, ACC-4, ACC-6, SYNC-4); the multipart upload, the find and the tombstone of a photo, the file token and the photo address (SYNC-14, SYNC-15) |
| `tests/records.test.js` | The doc as records, the doc back from them and the diff, with no summary change and the photo of a receipt delete (SYNC-1, SYNC-13) |
| `tests/sync.test.js` | The queue, the merge of pulled records, tombstones, the cursor, the check of records by kind and `mergeFields` (SYNC-4 to SYNC-7) |
| `tests/syncer.test.js` | The sync driver: the queue of a save, the run, the stops and retries, the refresh, the merge, the field-level merge of a push, the summary, the reset, the stream and two tabs (SYNC-2 to SYNC-6, SYNC-11 to SYNC-13); the photo before its receipt, the sweep and a refused photo (SYNC-14 to SYNC-16) |
| `tests/photos.test.js` | The scale of a photo, the orphan photos and the photos to tombstone (REC-7, SYNC-15) |
| `tests/session.test.js` | The session, the start route, the offline flag, the pending sign-in and the return URL (ACC-1, ACC-4, ACC-5, ACC-10) |
| `tests/storage.test.js` | Load, save, the corrupt copy, the lost doc, export, import and the device preferences |
| `tests/install.test.js` | The install offer states (INS-1) |
| `tests/swipe.test.js` | The settle rule of a row slide |
| `tests/sw.test.js` | The manifest text that the worker puts in place (SW-13) |
| `tests/sections.test.js` | The slide between sections |
| `tests/modules.test.js` | The visible sections and the switch of a module |
| `tests/particles.test.js` | The particles of a picture and their place in time |
| `tests/onboarding.test.js` | The show rule and the page steps of the walkthrough |
| `tests/version.test.js` | Version rules and the update offer rule |
| `tests/whatsnew.test.js` | The parse of the release notes and the unseen versions |
| `tests/release-notes-files.test.js` | One release-notes file for each language, with the same versions (VER-19) |
| `tests/i18n.test.js` | The language choice, the translator, the parity of the catalogs |
| `tests/markup.test.js` | `index.html` holds no text of its own; the sections, the module switches, the to-do sheet, the Receipts section and the receipt sheet, the Summary section, the walkthrough, the account markup and the offline note |
| `tests/aliases.test.js` | The import map against `package.json`; each `#ds/` alias names a vendored module |
| `tests/layers.test.js` | The layer rules and `SHELL` (ENG-16) |
| `tests/design.test.js` | Each rule of `vendor/design-system/rules.js` over the two stylesheets, `index.html`, `icons.svg`, `src/ui/` and `designs/`, and the parts of `styles.css` (DSV-3) |
| `tests/vendor.test.js` | The copy of the design system: its hashes, its files, its place in `index.html`, `designs/index.html` and `SHELL`, no copied rule in `styles.css` (DSV-1 to DSV-3) |
| `tests/png.test.js` | The PNG encoder and decoder of `scripts/png.mjs`, which `npm run icons` uses |
| `tests/release.test.js` | The release of `scripts/release.mjs`: the bump commit, the tag and the refusals, also a `main` behind `origin` (VER-10 to VER-12) |
| `tests/changelog.test.js` | The release of `CHANGELOG.md` by `scripts/changelog.mjs` (VER-17) |
| `tests/init.test.js` | The arguments of `scripts/init.mjs`, and a run of it in a copy: the new names, no trace of the template, `vendor/` kept as it is, its refusal of a second run (ENG-17) |
| `tests/spec.test.js` | The facts of this specification that the code can prove (ENG-12) |

A unit test uses `node:test` with `node:assert/strict`, one behaviour for each test, and checks
that the input state does not change.

## Checks with no test

- **ENG-9** `src/app.js`, the views of `src/ui/`, `styles.css` and `sw.js` have no unit test. A
  change to one of them is checked in a browser at 360×800, 768×1024 and 1280×800, with
  `npm run serve`. The offline check runs with the server stopped. `src/photostore.js` (IndexedDB)
  and `src/ui/photo.js` (the canvas) run in the browser only, so they too are checked there: a
  photo that a reload keeps while offline, and the size and type of the uploaded file.
- **ENG-10** `.githooks/pre-push` and `.githooks/pre-commit` have no test. They are checked in a
  scratch clone, the first one with a bare remote.
- **ENG-11** A task is done when `npm test` passes and, for a change of the screen or of `sw.js`,
  the browser check ran.

## Upkeep of this specification

- **ENG-12** `tests/spec.test.js` compares the specification with the code: each rule identifier is
  defined one time and each named rule exists; each link has its file and the index lists each
  document; the storage keys and the cache names; the languages; each `error.*` and `toast.*` key
  that a document names; the module table against `src/` and against the imports of each module;
  the test table against `tests/`.
- **ENG-13** `.githooks/pre-commit`, enabled with `npm run hooks`, stops a commit that stages a
  change of the app with no staged change of `docs/spec/`. The app is `src/`, `sw.js`,
  `index.html` and `manifest.webmanifest`. Of the catalogs of `src/locales/`, only `es.js` counts.
- **ENG-14** A commit that changes no rule, such as a refactor, passes with
  `git commit --no-verify`, and its body says that no rule changed.
- **ENG-15** A change of behaviour changes its rule in the same commit as the code. This is part
  of the definition of done.

## Commands

```sh
npm test                          # unit tests
npm run serve                     # http://localhost:8080
npm run icons                     # write the PNG icons again
npm run hooks                     # enable .githooks/ in this clone
npm run release                   # bump the version, commit it and tag it vX.Y.Z
npm run init -- <slug> "<Name>"   # turn a copy of the template into a new app
```
