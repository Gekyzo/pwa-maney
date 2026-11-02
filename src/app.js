import { $, ui, storage, t, setRender, showToast, hideToast, toastAction, clickGuardUntil } from '#ui/context';
import { bind as bindNav, renderNav } from '#ui/nav';
import { bind as bindRows, closeOpenRow } from '#ui/rows';
import { bind as bindTodos, renderTodos, openTodoSheet, closeTodoSheet } from '#ui/todos';
import { bind as bindReceipts, renderReceipts, openReceiptSheet, closeReceiptSheet } from '#ui/receipts';
import { bind as bindSummary, renderSummary } from '#ui/summary';
import { bind as bindSettings, applyLanguage } from '#ui/settings';
import { bind as bindInstall, renderInstall } from '#ui/install';
import { readVersion, renderVersion, offerUpdate } from '#ui/update';
import { bind as bindOnboarding, closeOnboarding, turnOnboarding } from '#ui/onboarding';
import { bind as bindWhatsNew, startWhatsNew, isWhatsNewOpen, closeWhatsNew } from '#ui/whatsnew';
import { bind as bindAccount, renderAccount, startAccount, goOnline, isAccountOpen, closeAccount } from '#ui/account';
import { readOAuthReturn } from '#session';

// The return of the Google sign-in (ACC-4): `code`, `state` and `error` leave the URL at once.
const { oauth, clean } = readOAuthReturn(new URL(location.href));
if (oauth) history.replaceState(history.state, '', clean);

const renderAll = () => {
  renderNav();
  $('title').textContent = t(`nav.${ui.view}`);
  $('settings').hidden = ui.view !== 'settings';
  renderReceipts();
  renderTodos();
  renderSummary();
  // A list of rows owns + to add one; the button hides while a sheet is open.
  const adds = ui.view === 'receipts' || ui.view === 'todos';
  $('fab').hidden = !adds || ui.sheet !== null;
  if (adds) $('fab').setAttribute('aria-label', t(`${ui.view}.add`));
  // The slide of a row is shown once: a later render puts the row in place at once.
  ui.settleFrom = null;
  renderVersion();
  renderInstall();
  renderAccount();
};
setRender(renderAll);

bindNav();
bindRows();
bindTodos();
bindReceipts();
bindSummary();
$('fab').addEventListener('click', () => (ui.view === 'receipts' ? openReceiptSheet() : openTodoSheet()));
bindSettings();
bindInstall();
bindOnboarding();
bindWhatsNew();
bindAccount();

document.addEventListener(
  'click',
  (event) => {
    if (Date.now() >= clickGuardUntil) return;
    event.preventDefault();
    event.stopPropagation();
  },
  true,
);

document.addEventListener('keydown', (event) => {
  // The account screens cover the app, the walkthrough too. Only Sign in over an open app closes (ACC-2).
  if (isAccountOpen()) {
    if (event.key === 'Escape') closeAccount();
    return;
  }
  if (ui.onboarding !== null) {
    if (event.key === 'Escape') closeOnboarding();
    else if (event.key === 'ArrowRight') turnOnboarding(1);
    else if (event.key === 'ArrowLeft') turnOnboarding(-1);
    return;
  }
  if (event.key !== 'Escape') return;
  if (isWhatsNewOpen()) {
    closeWhatsNew();
    return;
  }
  // The open sheet closes first, else the open row.
  if (ui.sheet === 'todo') closeTodoSheet();
  else if (ui.sheet === 'receipt') closeReceiptSheet();
  else closeOpenRow();
});

$('toast-action').addEventListener('click', () => {
  const action = toastAction;
  hideToast();
  action?.run();
});

applyLanguage();
if (ui.onboarding !== null) $('onboarding-next').focus();
startAccount(oauth);
window.addEventListener('online', goOnline);
if (!storage) showToast(t('error.noStorage'));
navigator.storage?.persist?.().catch(() => {});
navigator.serviceWorker?.register('./sw.js').catch(() => {});
// Read once at the start: the worker answers from the cache, then stores the file of the next deploy.
readVersion('./version.json').then((running) => {
  ui.version.running = running;
  renderVersion();
  startWhatsNew(running);
  navigator.serviceWorker?.ready.then(offerUpdate).catch(() => {});
});
