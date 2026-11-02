// The install offer of the browser (INS-1): `idle` (no offer), `available` (the Install button
// shows) or `installed`. The view feeds it `beforeinstallprompt` (prompt), the answer of the user
// (dismissed or installed) and `appinstalled` (installed).
export const installStart = (standalone) => (standalone ? 'installed' : 'idle');

const NEXT = { prompt: 'available', dismissed: 'idle', installed: 'installed' };

export const installNext = (current, event) => (current === 'installed' ? current : NEXT[event] ?? current);

export const showInstall = (state) => state === 'available';
