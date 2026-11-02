# Roadmap

## Planned

## Deferred

- **Suggestions button.** A button that sends a user's idea to the project repo.
  - Decided so far: the target is a GitHub issue, not a PR. The repo URL comes from a config
    module that `npm run init` writes (button hidden when empty). Offline, the button is
    disabled with a "needs a connection" note.
  - Open: the users have no GitHub account, and a prefilled issue URL needs a sign-in. The
    options are a small relay service that holds the token (the first backend and network
    call; needs abuse limits), a share sheet or `mailto:` to the author, or both behind one
    button.
