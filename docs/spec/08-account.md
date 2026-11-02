# Account

The account and the approval gate. The server is the PocketBase server of `pwa-server`: one
account serves every app, and the administrator approves access per app. The app talks to it
with `fetch`, with no SDK. The receipts and to-dos of an approved account sync between its
devices and maney ([09-sync.md](09-sync.md)). The user picks one of two ways in: **Continue with
Google**, or **Use offline** with no account.

## Rules

- **ACC-1** The start routes by the saved session, then by the offline flag (ACC-10): a session
  that is not approved opens **Waiting for approval**; an approved session opens the app; no
  session and the flag opens the app; no session and no flag opens **Sign in**. The route never
  reads the clock.
- **ACC-2** **Sign in** has the app icon, the title, one line of text, **Continue with
  Google** and **Use offline**. **Waiting for approval** has **Check again** and **Log out**. Both
  cover the whole app, the walkthrough too. **Use offline** closes **Sign in** (ACC-10). With the
  offline flag set, from **Sign in with Google** of Settings, or after an auth stop (SYNC-4),
  `Escape` closes it too. Else `Escape` does nothing while one is open. An
  error shows below the button: `account.error.google`, `account.error.network` or
  `account.error.tooMany`. A button waits for its request, so a second tap sends nothing.
- **ACC-3** "Approved" is the `app_access` row of the app `APP_SLUG` with the status
  `approved`. Each sign-in and each refresh reads it. With no row, the app creates a `pending`
  one; a duplicate row that another device made meanwhile is read again. The server URL is
  `http://localhost:8090` on a local host, else `https://artisandevs.duckdns.org`.
- **ACC-4** Google sign-in is a redirect. The app asks the server for the URL of the provider,
  keeps the state and the verifier in `sessionStorage` (`maney.oauth`), and sends the browser
  there with the URL of the app as the return address. On return the app removes `code`, `state`
  and `error` from the URL at once and keeps each other parameter. A return with no `code` (a
  cancel at Google), with no pending sign-in or with another `state` shows **Sign in** with
  `account.error.google`.
- **ACC-5** The session, the token and the user, is stored in `maney.session`.
- **ACC-6** At the start when online, and at the `online` event, the app refreshes a saved
  session, and logs in with the fresh session (ACC-11): its login runs the sync (SYNC-3). An
  approved session keeps the app open; a session that is no longer approved opens **Waiting for
  approval**; an auth error removes the session and opens **Sign in**, and the doc, the sync
  state and the queue stay for a login of the same user (SYNC-8). A network or server error keeps
  the session and starts a run, so the retries of SYNC-3 and the offline note (SYNC-11) follow.
  A logout during the request makes the answer save nothing. A start offline with a session shows
  the offline note.
- **ACC-7** **Check again** refreshes the session as ACC-6. A session that is still not approved
  shows the toast `account.waiting.still`.
- **ACC-8** Settings has the group **Account**: with a session, the email, the last sync under it
  in the muted style, and **Log out**; with none, or after an auth stop (SYNC-4), **Sign in with
  Google**, which opens **Sign in**. The last sync is `account.lastSync` with the date and the time
  of the last run that ended `ok`, short, in the language of the app, or `account.never`. It
  changes at each status of the sync. **Log out** runs as ACC-12: the
  device preferences and the offline flag stay. It then routes as ACC-1: with the offline flag
  the app stays open, else **Sign in** shows.
- **ACC-9** With no `localStorage` the app shows no account screen and works as before.
- **ACC-10** The offline flag is `maney.offline` = `1` in `localStorage`. **Use offline**
  writes it; an approved session that opens the app removes it. A storage that refuses the
  write still opens the app for this start.
- **ACC-11** A login of a user other than the stored owner first clears the device: the doc,
  the sync state and the queue of the previous user, so no change of that user reaches the new
  account. Then the new user takes the account (SYNC-8). A device preference stays. When changes
  are not sent, the login first asks `account.exportAsk` and changes nothing, the session too: the
  app keeps the session in memory only. A yes offers the export file. After the answer the login
  clears and goes on. A change that the server has not taken counts as not sent whether or not it
  was queued: a save after a lost approval stays in the doc only. A device with no stored owner
  clears nothing and merges (SYNC-8). A session that is not approved changes nothing and asks
  nothing until the approval (ACC-3), but it is saved: over the session of another user, that
  session is replaced, and the doc and the sync state of the stored owner stay until the approval.
- **ACC-12** **Log out** when online sends the queue first. When changes are still not sent
  (offline, the sync stopped, or a save after a lost approval that no queue holds), the app asks
  `account.logoutAsk`: a no changes nothing. A yes asks `account.logoutExport`, whose yes offers
  the export file; then the logout goes on. A second tap during a logout starts nothing. It
  removes the doc, the sync state, the queue and the session, and closes the stream. A run in
  progress becomes stale. The device preferences and the offline flag stay. **Log out** of
  **Waiting for approval** is this logout when the account owns the doc of the device (a lost
  approval). An account that never owned it (another user, or no stored owner) only removes its
  session, and the doc of the device stays.

## Set-up outside the app

- The server has a row in `apps`: slug `maney`, url `https://gekyzo.github.io/pwa-maney/`.
- The Google OAuth client has the redirect URIs `https://gekyzo.github.io/pwa-maney/` and
  `http://localhost:8080/` (`npm run serve`).
