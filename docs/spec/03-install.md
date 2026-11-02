# Install

Rules of `src/install.js` and `src/ui/install.js`.

- **INS-1** The install offer has three states: `idle` (no offer), `available` (Chrome gave
  `beforeinstallprompt`) and `installed`. `installNext` moves among them: `prompt` makes it
  `available`, `dismissed` makes it `idle` until the next prompt, and `installed` is final.
- **INS-2** Settings shows the group **App**, with its row **Install the app**, only in the state
  `available`. A tap
  shows the prompt of Chrome. An accepted prompt makes the state `installed`; a dismissed one
  makes it `idle`.
- **INS-3** An app that starts in `display-mode: standalone` starts `installed`. The event
  `appinstalled` also makes it `installed`, whoever started the install.

## Limits

No banner and no toast offer the install. Chrome may never give the prompt, for example on a
second visit after a dismiss; the menu **Install app** of Chrome still works (VER-14).
