# Specification

This is the specification of Maney as it is on `main`. It states what the app does, not
how the work was planned. The code and its tests are the authority: when a rule here and the code
differ, one of the two has a defect.

The names of the screen are the English ones; `src/locales/es.js` is the source wording.

## Documents

| Document | Content |
|---|---|
| [01-engineering.md](01-engineering.md) | Modules, code rules, storage keys, tests and checks |
| [02-offline-version.md](02-offline-version.md) | Service worker, version, update toast, deploy, installation |
| [03-install.md](03-install.md) | The install offer and the Install button |
| [04-design-system.md](04-design-system.md) | The copy of the design system, the parts of the app and the catalogue |
| [05-layout.md](05-layout.md) | Navigation, sections, modules, Settings and the walkthrough |
| [06-i18n.md](06-i18n.md) | The languages and the rules of the text |
| [07-receipts.md](07-receipts.md) | The receipts and the Receipts screen |
| [08-account.md](08-account.md) | Google sign-in, the approval gate and the offline choice |
| [10-todos.md](10-todos.md) | The doc of to-dos and receipts, money, dates and the To-dos screen |
| [11-summary.md](11-summary.md) | The summary of the month that maney pushes, and the Summary screen |

## Rule identifiers

Each rule has an identifier, a prefix and a number, such as `TODO-3`. An identifier is stable: a
rule that goes away keeps its number, marked as removed, and a new rule gets the next number. Use
the identifier in a commit body or in a test name to point at a rule.

The rules DS-1 to DS-8 and LAY-1 to LAY-4 belong to the design system, `pwa-design-system`.
[04-design-system.md](04-design-system.md) says where they are.

| Prefix | Document |
|---|---|
| `ENG` | 01-engineering |
| `SW`, `VER` | 02-offline-version |
| `INS` | 03-install |
| `DSV` | 04-design-system |
| `NAV`, `MOD`, `SET`, `ONB` | 05-layout |
| `I18N` | 06-i18n |
| `REC` | 07-receipts |
| `ACC` | 08-account |
| `TODO` | 10-todos |
| `SUM` | 11-summary |

## Words

| Word | Meaning |
|---|---|
| Shell | The files that the service worker keeps for offline use: `SHELL` of `sw.js` |
| Deploy | A release tag `vX.Y.Z` that GitHub Pages publishes |
| Size class | compact (below 600px), medium (600px to 839px) or expanded (840px and up) |
| Section | One of the screens of the navigation: Receipts, To-dos, Summary and Settings |
| Module | A part of the app that Settings turns off, with its sections |
| Pane | The list and the detail of one entry, side by side in the expanded class |
| Sheet | A panel that comes up from the bottom of the screen |
| Message | An error or a notice as `{ key, params }`, which the screen turns into text |
| Doc | The stored state of the app: one JSON value under one storage key |

## Upkeep

A change of behaviour changes the rule here in the same commit as the code. A new feature adds its
rules to the document of its area, or adds a document and a row in the tables above.

`tests/spec.test.js` and `.githooks/pre-commit` enforce this; see the rules ENG-12 to ENG-15 in
[01-engineering.md](01-engineering.md).
