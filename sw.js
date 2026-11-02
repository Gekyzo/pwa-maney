const CACHE = 'maney-shell-v1';

const SHELL = [
  './',
  './index.html',
  './vendor/design-system/design-system.css',
  './vendor/design-system/sheet.js',
  './vendor/design-system/geist.woff2',
  './styles.css',
  './icons.svg',
  './manifest.webmanifest',
  './src/app.js',
  './src/config.js',
  './src/pocketbase.js',
  './src/records.js',
  './src/sync.js',
  './src/syncer.js',
  './src/photos.js',
  './src/photostore.js',
  './src/session.js',
  './src/ui/context.js',
  './src/ui/controls.js',
  './src/ui/install.js',
  './src/ui/motion.js',
  './src/ui/nav.js',
  './src/ui/rows.js',
  './src/ui/todos.js',
  './src/ui/receipts.js',
  './src/ui/photo.js',
  './src/ui/summary.js',
  './src/ui/settings.js',
  './src/ui/update.js',
  './src/ui/dust.js',
  './src/ui/onboarding.js',
  './src/ui/whatsnew.js',
  './src/ui/account.js',
  './src/swipe.js',
  './src/particles.js',
  './src/onboarding.js',
  './src/money.js',
  './src/todos.js',
  './src/receipts.js',
  './src/summary.js',
  './src/doc.js',
  './src/install.js',
  './src/sections.js',
  './src/modules.js',
  './src/storage.js',
  './src/version.js',
  './src/whatsnew.js',
  './src/i18n.js',
  './src/locales/en.js',
  './src/locales/es.js',
  './version.json',
  './release-notes/en.md',
  './release-notes/es.md',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/logo.png',
];

// The text of the manifest in the language of the screen, which the page sends (`manifest`
// message). A cache of its own, so it outlives a deploy.
const MANIFEST = 'maney-manifest';
const MANIFEST_TEXT = './manifest-text.json';
const LOCALIZED = ['lang', 'name', 'description'];

// The manifest with each member of LOCALIZED that `text` holds as a non-empty string.
const localizeManifest = (manifest, text) => ({
  ...manifest,
  ...Object.fromEntries(
    LOCALIZED.filter((key) => typeof text?.[key] === 'string' && text[key]).map((key) => [key, text[key]]),
  ),
});

// `reload` goes past the HTTP cache, so the shell is never a mix of two deploys.
const fill = async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })));
};

self.addEventListener('install', (event) => {
  event.waitUntil(fill().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key !== MANIFEST).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Fetches a fresh copy past the HTTP cache and stores it for the next launch.
const refresh = async (cache, request) => {
  const response = await fetch(request.url, { cache: 'no-cache' });
  if (response.ok) await cache.put(request.url, response.clone());
  return response;
};

// Stale-while-revalidate: answer from the cache at once, refresh in the background.
const respond = async (event) => {
  const { request } = event;
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request.url, { ignoreSearch: true });
  const fresh = refresh(cache, request);
  if (cached) {
    event.waitUntil(fresh.catch(() => {}));
    return cached;
  }
  try {
    return await fresh;
  } catch (error) {
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    throw error;
  }
};

const readManifestText = async () => {
  const stored = await (await caches.open(MANIFEST)).match(MANIFEST_TEXT);
  return stored ? stored.json() : null;
};

// The shell copy of the manifest, in the language that the page sent last.
const respondManifest = async (event) => {
  const response = await respond(event);
  try {
    const text = await readManifestText();
    if (!text) return response;
    const manifest = localizeManifest(await response.clone().json(), text);
    return new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/manifest+json' } });
  } catch {
    return response;
  }
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // The page reads the deployed version: the cache must not answer.
  if (url.searchParams.has('latest')) return;
  const manifest = url.pathname === new URL('./manifest.webmanifest', self.location).pathname;
  event.respondWith(manifest ? respondManifest(event) : respond(event));
});

// The Update button and the update toast: load the full shell of the new deploy, then answer on
// the port.
// The page sends the text of the manifest in the language of the screen at each start and
// change of language.
const storeManifestText = async ({ lang, name, description }) => {
  const cache = await caches.open(MANIFEST);
  const body = JSON.stringify({ lang, name, description });
  await cache.put(MANIFEST_TEXT, new Response(body, { headers: { 'Content-Type': 'application/json' } }));
};

self.addEventListener('message', (event) => {
  if (event.data?.type === 'manifest') {
    event.waitUntil(storeManifestText(event.data).catch(() => {}));
    return;
  }
  if (event.data?.type !== 'refresh') return;
  const [port] = event.ports;
  event.waitUntil(
    fill().then(
      () => port?.postMessage({ ok: true }),
      () => port?.postMessage({ ok: false }),
    ),
  );
});
