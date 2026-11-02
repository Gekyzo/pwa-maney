# Maney

The phone companion of maney: receipts with a photo, to-dos and the month summary. It is built from pwa-template. It gives the app:

- an offline service worker, an update check with an update toast, and an install button;
- an adaptive layout: a bottom bar on a phone, a rail on a tablet, list and detail side by side
  on a wide screen;
- a design system with a live catalogue at `/designs/`;
- English and Spanish text, light and dark themes, a left-hand mode;
- a release script and a GitHub Pages deploy on a version tag;
- structural tests that keep the layers, the text, the design system and the specification in step.

The sections are Receipts, To-dos, Summary and Settings. The To-dos screen lists the to-dos with an
optional due date; Receipts and Summary come next.

## Develop

```sh
npm run serve   # http://localhost:8080
npm test
npm run ds      # copy the design system again from ../pwa-design-system
```

## Account and set-up outside the app

The app opens with **Sign in**: **Continue with Google** (an account on the PocketBase server of
`pwa-server`, approved per app) or **Use offline** (no account). The data stays on the device in
both modes; nothing syncs. The rules are in [docs/spec/08-account.md](docs/spec/08-account.md).

The server slug is `APP_SLUG` of `src/config.js`, which `npm run init` rewrites. Two steps happen
outside the app, and the app works offline without them:

1. A row in `apps` on the server (`/_/`): slug `APP_SLUG`, url `https://<user>.github.io/<slug>/`.
2. The redirect URIs `https://<user>.github.io/<slug>/` and `http://localhost:8080/` on the
   Google OAuth client.

## Install on Android

Open the deployed URL in Chrome. Use the **Install** button of Settings, or Chrome menu →
**Install app**.

## Release and deploy

Go through [docs/deploy-checklist.md](docs/deploy-checklist.md) first.

1. Write the user-visible changes under `## Unreleased` in `CHANGELOG.md`.
2. `npm run release` (or `npm run release -- minor|major`). It commits `Bump version to X.Y.Z`
   and creates the tag `vX.Y.Z`.
3. `git push --follow-tags`. The workflow `.github/workflows/pages.yml` deploys the tag.

Set the repository's Pages source to "GitHub Actions" once.

## Design system

The shared tokens, components and layouts come from `pwa-design-system`, copied into
`vendor/design-system/` by `npm run ds`; `SOURCE.json` there names the version and the commit.
`index.html` loads `vendor/design-system/design-system.css`, then `styles.css`, which holds the
parts of the app only. Change a shared part in `pwa-design-system`, then run `npm run ds`; never
edit `vendor/` by hand. Open `/designs/` on the dev server for the catalogue.
`docs/spec/04-design-system.md` has the rules of the app and points to the shared ones.
