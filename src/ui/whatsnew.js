import { parseNotes, nextSeen } from '#whatsnew';
import { textParts } from '#onboarding';
import { intlTag } from '#i18n';
import { loadSeen, saveSeen } from '#storage';
import { bindSheetDrag } from '#ds/sheet';
import { $, el, storage, ui, t, lang } from '#ui/context';

// The release notes of the language of the screen, or of English when that file cannot be read
// (VER-19). Null when neither can.
const loadNotes = async () => {
  for (const code of new Set([lang, 'en'])) {
    try {
      const response = await fetch(`./release-notes/${code}.md`);
      if (response.ok) return parseNotes(await response.text());
    } catch {
      // The next language, or no notes.
    }
  }
  return null;
};

// A part of a note: a `name` span, as the onboarding text shows it, inside a `strong` when the
// part is bold (`**`).
const noteNode = ({ text, key, strong }) => {
  const node = key ? el('span', { className: 'onboarding-key' }, [text]) : text;
  return strong ? el('strong', {}, [node]) : node;
};

const noteItem = (note) => el('li', {}, textParts(note).map(noteNode));

const entryNode = ({ version, date, notes }) => {
  const day = new Date(`${date}T12:00:00`).toLocaleDateString(intlTag(lang), { day: 'numeric', month: 'long', year: 'numeric' });
  return el('section', { className: 'whatsnew-entry' }, [
    el('h3', { className: 'whatsnew-version', textContent: t('whatsNew.version', { version, date: day }) }),
    el('ul', { className: 'whatsnew-notes' }, notes.map(noteItem)),
  ]);
};

// What to do when the sheet closes: store the seen version after the notes of a start.
let onClose = null;

export const openWhatsNew = (entries, { done = null } = {}) => {
  onClose = done;
  $('whatsnew-body').replaceChildren(...entries.map(entryNode));
  $('whatsnew-sheet').hidden = false;
  $('whatsnew-close').focus();
};

export const isWhatsNewOpen = () => !$('whatsnew-sheet').hidden;

export const closeWhatsNew = () => {
  $('whatsnew-sheet').hidden = true;
  onClose?.();
  onClose = null;
  if (ui.view === 'settings') $('show-whatsnew').focus();
};

// At a start: the notes of the versions after the seen one, once (VER-21). A storage that cannot
// be read shows nothing.
export const startWhatsNew = async (running) => {
  const entries = await loadNotes();
  $('show-whatsnew').hidden = !entries?.length;
  if (!storage || !running) return;
  // The walkthrough or another sheet covers the screen: the notes wait for the next start.
  const blocked = ui.onboarding !== null || document.querySelector('.sheet-layer:not([hidden])') !== null;
  const { show, store } = nextSeen({ entries: entries ?? [], seen: loadSeen(storage), running: running.version, loaded: entries !== null, blocked });
  const save = () => store && saveSeen(storage, store);
  if (show.length) openWhatsNew(show, { done: save });
  else save();
};

export const bind = () => {
  $('whatsnew-veil').addEventListener('click', closeWhatsNew);
  $('whatsnew-close').addEventListener('click', closeWhatsNew);
  bindSheetDrag($('whatsnew-sheet'), { close: closeWhatsNew });
  $('show-whatsnew').addEventListener('click', async () => {
    const entries = await loadNotes();
    if (entries?.length) openWhatsNew(entries);
  });
};
