# Account

The account and the approval gate. The server is the PocketBase server of `pwa-server`: one
account serves every app, and the administrator approves access per app. The app talks to it
with `fetch`, with no SDK. The doc stays on the device: nothing syncs. The user picks one of
two ways in: **Continue with Google**, or **Use offline** with no account.

## Rules

- **ACC-1** The start routes by the saved session, then by the offline flag (ACC-10): a session
  that is not approved opens **Waiting for approval**; an approved session opens the app; no
  session and the flag opens the app; no session and no flag opens **Sign in**. The route never
  reads the clock.
- **ACC-2** **Sign in** has the app icon, the title, one line of text, **Continue with
  Google** and **Use offline**. **Waiting for approval** has **Check again** and **Log out**. Both
  cover the whole app, the walkthrough too. **Use offline** closes **Sign in** (ACC-10); with the
  offline flag set, `Escape` closes it too. Else `Escape` does nothing while one is open. An
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
  session. An approved session keeps the app open; a session that is no longer approved opens
  **Waiting for approval**; an auth error removes the session and opens **Sign in**. A network or
  server error changes nothing. A logout during the request makes the answer save nothing.
- **ACC-7** **Check again** refreshes the session as ACC-6. A session that is still not approved
  shows the toast `account.waiting.still`.
- **ACC-8** Settings has the group **Account**: with a session, the email and **Log out**; with
  none, **Sign in with Google**, which opens **Sign in**. **Log out** removes the session only;
  the doc and the preferences stay. It then routes as ACC-1: with the offline flag the app
  stays open, else **Sign in** shows.
- **ACC-9** With no `localStorage` the app shows no account screen and works as before.
- **ACC-10** The offline flag is `maney.offline` = `1` in `localStorage`. **Use offline**
  writes it; an approved session that opens the app removes it. A storage that refuses the
  write still opens the app for this start.

## Set-up outside the app

- The server has a row in `apps`: slug `maney`, url `https://gekyzo.github.io/pwa-maney/`.
- The Google OAuth client has the redirect URIs `https://gekyzo.github.io/pwa-maney/` and
  `http://localhost:8080/` (`npm run serve`).
