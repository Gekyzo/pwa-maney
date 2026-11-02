# Deploy checklist

Features and checks to settle in an app made from this template before its first deploy. Go
through it again before a release that adds a section, a stored doc or a manifest member.

## Identity

- [ ] `npm run init -- <slug> "<Name>"` ran once. `src/config.js` has the new slug.
- [ ] `manifest.webmanifest`: `name`, `short_name`, `description`, `lang`, `theme_color` and
      `background_color` fit the app. The `theme-color` meta tags of `index.html` match.
- [ ] `icons/source.png` is the art of the app (512×512, art inside the centre 80%), and
      `npm run icons` wrote the PNG icons again. The maskable icon keeps its art in the safe zone.
- [ ] `README.md` describes the app, not the template.

## Domain

- [ ] The notes demo is replaced or deleted. `docs/spec/07-notes.md` lists its files.
- [ ] Each stored doc has a `version` and a `normalize`. A new version has its migration.
- [ ] Export and import cover each stored doc that the user can lose.
- [ ] The rules of the new domain are in `docs/spec/`, with a prefix in its README.

## Text

- [ ] Each text of the screen is in each catalog of `src/locales/`. `npm test` checks the keys.
- [ ] The name and the description of the manifest follow the language of the screen (SW-13).

## Offline

- [ ] `SHELL` of `sw.js` lists each new file: modules, styles, icons, data.
- [ ] A change of the shell, or of a stored doc that an old module cannot read, has a new cache
      name (SW-10).
- [ ] With the server stopped, a second start opens the app and each section works.

## Android launcher shortcuts

A long press on the icon of the installed app shows its shortcuts. Decide which actions earn
one, or that the app has none. `pwa-shopping-list` has the reference implementation: commit
`0803bc9` and the rules SHORT-1 to SHORT-5 of its `docs/spec/11-integrations.md`.

- [ ] `shortcuts` in `manifest.webmanifest`, four at most, each with a `url` of the form
      `./?open=<name>` inside `scope`.
- [ ] The start of `src/app.js` reads `open`, shows that section (or opens its sheet), ignores an
      unknown name and does not open a sheet below the first-start walkthrough.
- [ ] The app removes `open` from the URL at once and keeps the other parameters.
- [ ] Each shortcut has a 192 px icon: Chrome can skip a shortcut with no icon. `npm run icons`
      draws them from `icons.svg`; the icons are in `SHELL`.
- [ ] The shortcut names follow the language of the screen: the page sends them with the
      manifest text and `localizeManifest` of `sw.js` puts them in place by their `open` name.
- [ ] The shortcuts work offline: the worker ignores the query of the URL.
- [ ] Android shows a new or renamed shortcut only after the next update check of Chrome for the
      installed app. Test on the phone after a reinstall, or wait for that check.

## Install and update

- [ ] The Install button of Settings installs the app on Chrome for Android.
- [ ] The update toast shows at the second start after a deploy (SW-12).

## Release

- [ ] `npm test` passes.
- [ ] The UI was checked in a browser at 360×800, 768×1024 and 1280×800.
- [ ] `npm run hooks` ran in this clone.
- [ ] The GitHub repository exists, and its Pages source is "GitHub Actions".
- [ ] `CHANGELOG.md` has the user-visible changes under `## Unreleased`.
- [ ] `npm run release`, then `git push --follow-tags`.
