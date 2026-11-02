import { installStart, installNext, showInstall } from '#install';
import { $, ui } from '#ui/context';

// The prompt that Chrome gives once the app can be installed. It can be used one time.
let deferred = null;

export const renderInstall = () => {
  $('install-group').hidden = !showInstall(ui.install);
};

const move = (event) => {
  ui.install = installNext(ui.install, event);
  renderInstall();
};

export const bind = () => {
  ui.install = installStart(matchMedia('(display-mode: standalone)').matches);
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event;
    move('prompt');
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    move('installed');
  });
  $('install').addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    move(outcome === 'accepted' ? 'installed' : 'dismissed');
  });
  renderInstall();
};
