import { parseVersion, versionStatus, shouldOfferUpdate } from '#version';
import { intlTag } from '#i18n';
import { REFRESH_MS, CHECK_MS, $, ui, t, lang, showToast } from '#ui/context';

const VERSION_KEYS = { current: 'version.current', unknown: 'version.unknown' };

export const renderVersion = () => {
  const { running, latest, checking } = ui.version;
  const status = versionStatus(running, latest);
  const dateForm = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
  const date = running && new Date(running.date).toLocaleString(intlTag(lang), dateForm);
  $('version').textContent = running ? t('version.running', { version: running.version, date }) : t('version.none');
  const text = checking
    ? t('version.checking')
    : status === 'outdated' ? t('version.available', { version: latest.version }) : t(VERSION_KEYS[status]);
  $('version-status').dataset.status = checking ? 'checking' : status;
  $('version-status').title = text;
  $('version-status-text').textContent = text;
  $('update').hidden = checking || status !== 'outdated';
};

export const readVersion = async (url, options) => {
  try {
    const response = await fetch(url, options);
    return response.ok ? parseVersion(await response.json()) : null;
  } catch {
    return null;
  }
};

// The time value in the URL goes past the cache of the host; the service worker lets `latest` through.
export const checkVersion = async () => {
  ui.version.checking = true;
  renderVersion();
  const latest = await readVersion(`./version.json?latest=${Date.now()}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(CHECK_MS),
  });
  Object.assign(ui.version, { latest, checking: false });
  renderVersion();
};

// Asks the service worker to load the shell of the new deploy. Resolves to false when it cannot.
export const refreshShell = () =>
  new Promise((resolve) => {
    const worker = navigator.serviceWorker?.controller;
    if (!worker) {
      resolve(true);
      return;
    }
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), REFRESH_MS);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(Boolean(event.data?.ok));
    };
    worker.postMessage({ type: 'refresh' }, [channel.port2]);
  });

// Loads the shell of the new deploy and reloads, or says that it could not (VER-8).
export const runUpdate = async (button = null) => {
  if (button) button.disabled = true;
  if (await refreshShell()) {
    location.reload();
    return;
  }
  if (button) button.disabled = false;
  showToast(t('error.updateFailed'));
};

// One background check per start: a newer deploy gets a toast with Update (VER-18).
export const offerUpdate = async () => {
  await checkVersion();
  const status = versionStatus(ui.version.running, ui.version.latest);
  if (!shouldOfferUpdate(status, ui.updateOffered)) return;
  ui.updateOffered = true;
  showToast(t('toast.update'), { action: { label: t('settings.update'), run: () => runUpdate() } });
};
