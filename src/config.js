// The name of this app in storage keys, cache names and file names. `npm run init` rewrites it.
export const APP_SLUG = 'maney';

// The PocketBase server of the account (ACC-3). A local host talks to the local server.
export const PRODUCTION_API = 'https://artisandevs.duckdns.org';
export const LOCAL_API = 'http://localhost:8090';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

// `location.hostname` gives `[::1]` for IPv6.
export const apiUrl = (hostname) => (LOCAL_HOSTS.includes(hostname) ? LOCAL_API : PRODUCTION_API);
