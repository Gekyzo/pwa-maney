# Layout and navigation

Rules of `src/sections.js`, `src/modules.js`, `src/onboarding.js`, the views `nav`, `dust` and
`onboarding` of `src/ui/`, and the layout of Settings.

## Size classes

The size classes, the navigation element, the `pane` layout and the safe areas are the rules
LAY-1 to LAY-4 of the design system (04-design-system). In this app the To-dos section is one
column of rows, centred from 600px (TODO-10).

## Navigation

- **NAV-1** The sections are `receipts`, `todos`, `summary` and `settings`, in the order of
  `SECTIONS`. The app starts on `receipts`, or on the first section that is on. The navigation
  shows one item for each section that is on (MOD-1). The current one has
  `aria-current="page"`, and its title is the title of the header.
- **NAV-2** A horizontal slide of at least 60 px that starts in the header or the content, out of
  a row and of a field, goes to the next section (slide left) or the previous one (slide right).
  It stops at the first and the last section. The content comes in from its side.

## Modules

- **MOD-1** `MODULES` lists the parts that Settings turns off: `receipts`, `todos` and `summary`,
  each of which shows its own section (Receipts, To-dos, Summary). With a module off, its sections leave the navigation, and a view of one of them goes
  to the first section that is on.
- **MOD-2** The modules that are off are a preference of the device under `maney.modules`,
  not part of the doc. No module off removes the key.
- **MOD-3** A switch of Modules animates the item of its section: it breaks into dust and its
  place closes, or its place opens and the dust settles (`src/ui/dust.js`). With reduced motion
  the item goes or comes at once.

## Settings

- **SET-1** Settings is a column of groups, each a `list-group-head` above a `list-group` of
  settings rows, as in pwa-shopping-list: **Backup** (**Export**, **Import**, **Delete all data**), **Preferences**
  (**Language**, **Hand**, **Theme**), **Modules** (MOD-1), **App** (INS-2) and **Help** (ONB-3),
  then the version lines (VER-4). A row of Preferences shows its current value and a chevron, and
  a tap on it opens the native picker of its select. A row that opens something ends with a
  chevron. Modules keeps its switches.
- **SET-2** **Delete all data** is the last row of Backup, in the colour of danger, with no
  chevron. It asks `reset.confirm`, or `reset.confirmLocal` with a session, which also says that
  the session closes. A yes removes each `localStorage` key of the app, `<slug>.*` (`resetAll`),
  and no key of another app of the origin, then loads the page again: the app starts as a new
  install, with the walkthrough (ONB-1), and a device that had a session opens Sign in (ACC-1). It
  has no Undo. When the removal fails, `error.resetFailed` shows and nothing else changes. The
  caches of the worker stay.

## Walkthrough

- **ONB-1** The walkthrough shows at the start of a new install only: no `maney.onboarded`
  flag and no stored doc. A storage that cannot be read counts as seen.
- **ONB-2** It has the pages of `PAGES`, each with a drawing, a title and a text. **Next** goes
  forward, **Skip** and Escape close it, a slide or the arrow keys turn a page. The last page has
  **Start** in place of **Next**, and no **Skip**.
- **ONB-3** A close stores the flag. **Show the introduction** in Settings opens it again.
