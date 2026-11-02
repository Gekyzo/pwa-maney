# Offline use, version and deploy

Rules of `sw.js`, `src/version.js`, `version.json`, `scripts/bump-version.mjs`,
`.githooks/pre-push` and `manifest.webmanifest`.

## Service worker

- **SW-1** `src/app.js` registers `sw.js` at each start. With no service worker the app works with
  a connection only.
- **SW-2** The app shell is the list `SHELL` of `sw.js`: the page, the two stylesheets, the
  vendored `sheet.js` and `geist.woff2` (DSV-2), the manifest, each module of `src/`, each catalog, `version.json`, the icons of the app and the
  icon sprite `icons.svg`. A file that the app loads and that is not in `SHELL` does not work
  offline at the first start.
- **SW-3** At its install the worker downloads the full shell past the HTTP cache, so the shell is
  never a mix of two deploys. It then takes control at once (`skipWaiting`, `clients.claim`).
- **SW-4** At its activation the worker deletes each cache that is not the current one or
  `maney-manifest` (SW-13). The cache name is `maney-shell-v1`; the template
  took v2 for design system 0.7.1, v3 for 0.7.2 and v4 for the release notes, and `npm run init` starts a new app at v1 (ENG-17).
- **SW-5** The worker answers only `GET` requests of its own origin.
- **SW-6** A request is answered stale-while-revalidate: the cached copy at once, and a fresh copy
  goes into the cache in the background for the next start. The query of the URL is ignored for
  the match.
- **SW-7** A request with no cached copy goes to the network. If a navigation fails, the worker
  answers with the cached `index.html`.
- **SW-8** A request with the `latest` parameter goes to the network only (VER-5).
- **SW-9** The message `{ type: 'refresh' }` downloads the full shell again and answers `{ ok }`
  on the message port.
- **SW-10** A change of the stored state that an old module cannot read needs a new cache name, so
  that the worker loads the full shell again.
- **SW-13** At each start and change of language, `applyLanguage` of `src/ui/settings.js` sends
  `{ type: 'manifest', lang, name, description }` to the active worker, with `app.title` and
  `app.description` of the language of the screen. The worker stores `{ lang, name, description }`
  in the cache `maney-manifest`, and answers `manifest.webmanifest` as SW-6 and SW-7 with these
  three members in place of the ones of the file (`localizeManifest`). A member that is not a
  non-empty string keeps the value of the file. With no stored text, or a manifest that is not
  JSON, the file is answered as it is.

### Result for the user

- **SW-11** After the first load with a connection, the app starts and works with no connection.
- **SW-12** A deploy shows at the second start after it: the first start downloads the new files
  in the background. **Update**, in Settings or in the toast of VER-18, shows it at once (VER-8).

## Version

- **VER-1** `version.json` holds `{ version, date }`: a semantic version `major.minor.patch` and
  an ISO date. `package.json` has the same version.
- **VER-2** `scripts/bump-version.mjs` is the only writer of the two files. With no valid
  `version.json` the next version is `1.0.0`. A bump of a part sets the lower parts to zero.
  The same run releases `CHANGELOG.md` (VER-17) and the release notes (VER-20).
- **VER-3** A value that is not `{ version, date }` with a valid version and a valid date is "no
  version".
- **VER-4** At the start the app reads `version.json` from the cache: the running version.
  The foot of **Settings** shows `Version X.Y.Z · date` and the status (VER-6) as plain text,
  outside a group and with no heading, the date in the form of the language. With no version it
  shows `Unknown version`.
- **VER-5** When **Settings** opens, and once in the background after each start (VER-18), the app reads `version.json?latest=<time>` from the host: the
  deployed version. The request ends after 8 seconds at most. `Checking…` shows in that time.
- **VER-6** The status is a line symbol after the version, in the colour of its case. Its text is
  the tooltip and is read by a screen reader; only the text of an update shows:

  | Case | Symbol | Colour | Text | **Update** |
  |---|---|---|---|---|
  | The check runs (VER-5) | Turning arrow, spins | Muted | `Checking…` | Hidden |
  | The deployed version is newer than the running one | Down arrow in a circle | Amber | `Version X.Y.Z available` | Shows |
  | It is the same or older | Check in a circle | Green (done) | `Up to date` | Hidden |
  | One of the two is not known | Struck-out cloud | Red (danger) | `Offline` | Hidden |

- **VER-7** Two versions compare by number, part by part: `1.10.0` is newer than `1.9.0`.
- **VER-8** **Update** sends `refresh` to the worker and waits 15 seconds at most. On success
  the page loads again, with the new shell. On failure the message is `error.updateFailed`.
  With no worker in control the page loads again at once.

## Deploy

- **VER-9** The app is a static site: the repository root, served over HTTPS at
  the GitHub Pages URL of the repository. A release tag `vX.Y.Z` is a deploy: its push runs
  `.github/workflows/pages.yml`, which publishes the tagged commit to GitHub Pages. A push to
  `main` deploys nothing. The Pages source of the repository is GitHub Actions, and its
  `github-pages` environment allows the tags `v*`.
- **VER-10** Each deploy has a new version. `npm run release` makes a release on `main`:
  1. it adds one to the patch of `version.json`, sets the date, and gives the version to
     `package.json`, to `CHANGELOG.md` (VER-17) and to the release notes (VER-20);
  2. it makes the commit `Bump version to X.Y.Z` with `version.json`, `package.json`,
     `CHANGELOG.md` and `release-notes/*.md` only;
  3. it tags that commit with the annotated tag `vX.Y.Z`.

  `git push --follow-tags` then sends the commit and the tag, and the tag deploys.
- **VER-11** For a minor or a major step: `npm run release -- minor|major`.
- **VER-12** `npm run release` stops with an error, and writes nothing, when the current branch is
  not `main`, the working tree has a change, the level is unknown, or the tag of the next
  version exists. With a remote `origin`, it fetches `main` first, and it stops when it cannot
  fetch or when `main` is behind `origin/main` (`git pull --rebase` first). Otherwise the push
  rebases `main`, and the tag stays on a commit that is never pushed and never deploys.
- **VER-13** The hook `.githooks/pre-push`, enabled one time in each clone with `npm run hooks`,
  stops the push of a tag `vX.Y.Z` whose commit does not have the version `X.Y.Z` in
  `version.json`. Without it, such a tag deploys a version that Settings cannot show.
- **VER-17** A bump releases `CHANGELOG.md`: the heading `## Unreleased` becomes
  `## X.Y.Z - YYYY-MM-DD`, with the new version and the local day of the bump, and a new
  `## Unreleased` with the text `No change.` goes above it. The file stays as it is when
  `Unreleased` has no change or the file has no such heading. A deployed version with no change
  for the user has no entry.
- **VER-19** `release-notes/<lang>.md`, one file for each catalog of `src/locales/` and no other,
  holds what a user sees of each version, in that language. It has the shape of `CHANGELOG.md`:
  `## Unreleased`, then `## X.Y.Z - YYYY-MM-DD` with one `- ` line for each note, newest first.
  `## Unreleased` and `No change.` stay in English in each file: they are markers of the release,
  not text for the user. Each file has the same released versions. `CHANGELOG.md` holds the
  technical changes.
- **VER-20** A bump releases each release-notes file as VER-17 releases `CHANGELOG.md`, and the
  release commit holds them. `npm run release` stops, and writes nothing, when `Unreleased` has
  notes in some languages and not in the others, or when the files do not have the same released
  versions; the error names the languages.
- **VER-21** At each start the app reads the release notes of the language of the screen, or
  `release-notes/en.md` when that file cannot be read. Each file is in `SHELL`. It compares them
  with the stored seen version (`<slug>.seen-version`) and the running version (`nextSeen`):
  - nothing stored (a first start, or a start from before this rule): it stores the running
    version and shows nothing;
  - no notes could be read, or the walkthrough or another sheet covers the screen: it shows and
    stores nothing, and the next start tries again;
  - the notes have versions after the seen one and not after the running one: the **What's new**
    sheet shows them (VER-22), and its close stores the newest of them. A running version whose
    notes are not in the cache yet thus stays unseen;
  - otherwise it shows and stores nothing. The seen version never goes down.

  A storage that cannot be read shows nothing.
- **VER-22** The **What's new** sheet has the title `whatsNew.title` and `whatsNew.close`, and
  one block for each version, newest first: `whatsNew.version` with the day in the long form of
  the language, then the notes as a list. A `` `name` `` in a note shows as the key of the
  walkthrough. A text between two `**` shows in bold, keys in it too; a `**` with no pair
  stays as text. The veil, `Close`, a drag down and `Escape` close it.
- **VER-23** **Help** in Settings has the row `settings.whatsNew`, which shows the sheet with
  every version. The row is hidden while the notes have no version.

## Installation

- **VER-14** The manifest makes the app installable from Chrome: **Install app**, or the
  **Install** button of Settings (INS-2). It runs `standalone`, in any orientation, with `id`,
  `start_url` and `scope` `./`.
- **VER-15** The icons are `icons/icon-192.png`, `icon-512.png` and `icon-maskable-512.png`,
  written by `npm run icons` from the art of `icons/source.png`: a placeholder note on white, which each app replaces.
  The tab shows `icon-192.png`. The art of the maskable icon stays in the safe zone, a circle
  of radius 0.4 of the side. `icons/logo.png`, 288 px, is the same art with its white background
  made transparent: the white that touches the edge goes, a white inside the art stays.
- **VER-16** The installed app and the site in Chrome share one storage. The data of the installed
  app goes away with **Clear site data** and with the uninstall.

## Update toast

- **VER-18** After the worker is ready at a start, the app runs the check of VER-5 once in the
  background. When the status is the newer deploy of VER-6, a toast `toast.update` shows with the
  action **Update**, which runs VER-8. It shows at most once in a start (`shouldOfferUpdate`). An
  unknown status, such as no connection, shows nothing.

## Limits

No way back to an older version. No list of changes in the app.
