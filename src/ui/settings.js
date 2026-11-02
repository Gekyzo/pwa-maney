import { normalizeDoc, importedDoc } from '#doc';
import { importJson, resetAll } from '#storage';
import { LANGUAGES, LANGUAGE_NAMES } from '#i18n';
import { switchModule } from '#modules';
import {
  $,
  el,
  state,
  storage,
  t,
  lang,
  chosen,
  hand,
  theme,
  off,
  isOn,
  textOf,
  showToast,
  apply,
  render,
  setLanguage,
  setHand,
  setTheme,
  setModules,
  setNavMotion,
  exportDoc,
} from '#ui/context';
import { runUpdate } from '#ui/update';
import { renderOnboarding } from '#ui/onboarding';
import { signedIn, stopSync } from '#ui/account';

// The value of a row of Preferences is the text of the option that its select has.
const renderValues = () => {
  for (const id of ['language', 'hand', 'theme']) {
    $(`${id}-value`).textContent = $(id).selectedOptions[0]?.textContent ?? '';
  }
};

// Writes the fixed text of the page, then the text that a render builds.
export const applyLanguage = () => {
  document.documentElement.lang = lang;
  document.title = t('app.title');
  // The worker answers the manifest in this language (SW-13).
  const text = { type: 'manifest', lang, name: t('app.title'), description: t('app.description') };
  navigator.serviceWorker?.ready.then((registration) => registration.active?.postMessage(text)).catch(() => {});
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-attr]').forEach((node) => {
    node.dataset.i18nAttr.split(',').forEach((pair) => {
      const [name, key] = pair.split(':');
      node.setAttribute(name, t(key));
    });
  });
  const option = (value, text) => el('option', { value, textContent: text, selected: value === (chosen ?? '') });
  $('language').replaceChildren(
    option('', t('settings.automatic')),
    ...LANGUAGES.map((code) => option(code, LANGUAGE_NAMES[code])),
  );
  const handOption = (value, key) => el('option', { value, textContent: t(key), selected: value === hand });
  $('hand').replaceChildren(handOption('right', 'settings.handRight'), handOption('left', 'settings.handLeft'));
  const themeOption = (value, key) => el('option', { value, textContent: t(key), selected: value === theme });
  $('theme').replaceChildren(
    themeOption('system', 'settings.automatic'),
    themeOption('light', 'settings.themeLight'),
    themeOption('dark', 'settings.themeDark'),
  );
  document.querySelectorAll('[data-module]').forEach((box) => {
    box.checked = isOn(box.dataset.module);
  });
  renderValues();
  render();
  renderOnboarding();
};

export const bind = () => {
  $('export').addEventListener('click', () => {
    exportDoc(state);
  });
  $('import').addEventListener('click', () => $('import-file').click());
  // SET-2: the app starts again as a new install, with the walkthrough. With no storage the data is
  // only in memory, so the reload alone clears it. The session key goes too, so a signed-in device
  // opens Sign in. The sync stops first (SYNC-10): a run in progress saves nothing after the removal.
  // The photos that wait for their upload go too (REC-10).
  $('reset').addEventListener('click', async () => {
    if (!window.confirm(t(signedIn() ? 'reset.confirmLocal' : 'reset.confirm'))) return;
    await stopSync();
    if (storage && !resetAll(storage)) {
      showToast(t('error.resetFailed'));
      return;
    }
    location.reload();
  });
  $('language').addEventListener('change', (event) => {
    setLanguage(event.target.value || null);
    applyLanguage();
  });
  $('hand').addEventListener('change', (event) => setHand(event.target.value));
  $('theme').addEventListener('change', (event) => setTheme(event.target.value));
  for (const id of ['hand', 'theme']) $(id).addEventListener('change', renderValues);
  document.querySelectorAll('[data-module]').forEach((box) => {
    box.addEventListener('change', () => {
      setModules(switchModule(off, box.dataset.module, box.checked));
      setNavMotion(true);
      render();
      setNavMotion(false);
    });
  });
  $('update').addEventListener('click', () => runUpdate($('update')));
  $('import-file').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    const result = importJson(await file.text(), normalizeDoc);
    if (result.error) {
      showToast(textOf(result.error));
      return;
    }
    const todos = t('todos.count', { count: result.state.todos.length });
    const receipts = t('receipts.count', { count: result.state.receipts.length });
    // SYNC-9: with a session the import replaces the receipts and to-dos of the account, on every device.
    if (!window.confirm(t(signedIn() ? 'import.confirmAccount' : 'import.confirm', { todos, receipts }))) return;
    apply({ state: importedDoc(result.state, state) }, { undoText: t('toast.imported'), explicit: true });
  });
};
