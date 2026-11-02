# pwa-maney

A template for offline Android PWAs: plain HTML, CSS and ES modules, no build step and
no dependencies. Copy it and run `npm run init` to start a new app.

## Commands

```sh
npm test                           # unit tests (node --test)
npm run serve                      # http://localhost:8080
npm run icons                      # write the PNG icons again from icons/source.png
npm run init -- <slug> "<Name>"    # turn a copy into a new app (once)
npm run release                    # bump, commit and tag vX.Y.Z; git push --follow-tags deploys
npm run ds                         # copy the design system again from ../pwa-design-system
```

## Conventions

Read `.claude/conventions/` (loaded at session start): GIT, WRITING, CANONICAL,
WORKFLOW, AUTONOMY, ARCHITECTURE, RELEVANT-FILES.

## Changelog and release notes

- `CHANGELOG.md` is the technical record, in English.
- `release-notes/<lang>.md` is what a user reads in the app, one file for each catalog of
  `src/locales/`. A user-visible change adds a bullet under `Unreleased` in every file, in the
  same commit. `npm run release` stops when only some languages have one.
