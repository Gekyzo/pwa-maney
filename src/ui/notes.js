import { addNote, editNote, deleteNote, findNote } from '#notes';
import { bindSheetDrag } from '#ds/sheet';
import { settle } from '#swipe';
import { SIDE_BUTTON, DRAG_START, $, el, ui, state, t, apply, render, guardClick } from '#ui/context';
import { iconButton } from '#ui/controls';
import { reorder, bindReorder } from '#ui/drag';

const openSheet = (id = null) => {
  ui.sheetOpen = true;
  ui.editing = id;
  $('note-sheet-title').textContent = t(id ? 'notes.editTitle' : 'notes.new');
  $('note-text').value = id ? findNote(state, id)?.text ?? '' : '';
  render();
  $('note-text').focus();
};

export const closeNoteSheet = () => {
  ui.sheetOpen = false;
  ui.editing = null;
  render();
};

const openNote = (id) => {
  ui.noteId = id;
  render();
};

const remove = (id) => {
  if (ui.noteId === id) ui.noteId = null;
  apply(deleteNote(state, id), { undoText: t('toast.noteDeleted') });
};

export const moveRow = (row, x) => {
  row.style.transform = x ? `translateX(${x}px)` : '';
};

// Lets a horizontal drag of the row show the side actions behind it (`settle` decides).
const bindSwipe = (row, width, id) => {
  let drag = null;
  row.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, base: ui.openId === id ? -width : 0, active: false };
  });
  row.addEventListener('pointermove', (event) => {
    if (!drag || reorder) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dy) > DRAG_START && Math.abs(dy) >= Math.abs(dx)) drag = null;
      if (!drag || Math.abs(dx) < DRAG_START) return;
      drag.active = true;
      row.setPointerCapture(event.pointerId);
      row.classList.add('dragging');
    }
    drag.at = Math.max(-width, Math.min(0, drag.base + dx));
    moveRow(row, drag.at);
  });
  const finish = (event) => {
    if (!drag) return;
    const { active, x, at } = drag;
    drag = null;
    if (!active) return;
    // The click that follows a drag must not open the note.
    guardClick();
    const side = settle(event.clientX - x, { start: 0, end: width }, ui.openId === id ? 'end' : null);
    ui.openId = side ? id : null;
    ui.settleFrom = { id, x: at };
    render();
  };
  row.addEventListener('pointerup', finish);
  row.addEventListener('pointercancel', finish);
};

// A row slides left to show Delete (swipe), and a hold lifts it to a new place (drag).
const row = (note) => {
  const open = ui.openId === note.id;
  const actions = [iconButton('trash', t('row.delete', { text: note.text }), () => remove(note.id), { variant: 'danger' })];
  const width = actions.length * SIDE_BUTTON;
  const name = el('button', { className: 'item-row-name', type: 'button', tabIndex: -1, onclick: () => openNote(note.id) }, [
    el('span', { textContent: note.text }),
  ]);
  const body = el('div', { className: 'item-row-body' }, [name]);
  const from = ui.settleFrom?.id === note.id ? ui.settleFrom.x : null;
  if (from !== null) {
    // Start where the drag ended, then move to the settled place with the CSS transition.
    moveRow(body, from);
    requestAnimationFrame(() => requestAnimationFrame(() => moveRow(body, open ? -width : 0)));
  } else moveRow(body, open ? -width : 0);
  bindSwipe(body, width, note.id);
  const box = el('div', { className: open ? 'item-row-swipe open' : 'item-row-swipe' }, [
    el('div', { className: 'item-row-actions', inert: !open }, actions),
    body,
  ]);
  const node = el('li', { className: 'item-row' }, [box]);
  Object.assign(node.dataset, { id: note.id, scope: 'notes' });
  bindReorder(body, node, note.id);
  return node;
};

export const renderNotes = () => {
  const visible = ui.view === 'notes';
  $('notes').hidden = !visible;
  $('fab').hidden = !visible || ui.sheetOpen;
  if (ui.openId && !findNote(state, ui.openId)) ui.openId = null;
  $('note-list').replaceChildren(...state.notes.map(row));
  ui.settleFrom = null;
  $('notes-empty').hidden = state.notes.length > 0;
  const note = ui.noteId === null ? null : findNote(state, ui.noteId);
  if (!note) ui.noteId = null;
  // The pane shows the detail alone below 840px, and beside the list from 840px (LAY-3).
  if (note) $('notes').dataset.detail = '';
  else delete $('notes').dataset.detail;
  $('note-detail-text').textContent = note?.text ?? '';
  $('note-detail-empty').hidden = Boolean(note);
  $('note-actions').hidden = !note;
  $('note-sheet').hidden = !ui.sheetOpen;
};

export const bind = () => {
  $('fab').addEventListener('click', () => openSheet());
  $('notes-add').addEventListener('click', () => openSheet());
  $('note-veil').addEventListener('click', closeNoteSheet);
  $('note-close').addEventListener('click', closeNoteSheet);
  bindSheetDrag($('note-sheet'), { close: closeNoteSheet });
  $('note-back').addEventListener('click', () => openNote(null));
  $('note-edit').addEventListener('click', () => openSheet(ui.noteId));
  $('note-delete').addEventListener('click', () => remove(ui.noteId));
  $('note-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const text = $('note-text').value;
    const result = ui.editing ? editNote(state, ui.editing, text) : addNote(state, text);
    if (apply(result)) closeNoteSheet();
  });
  // A tap out of the open row closes it, without a render, so that the tap still does its work.
  document.addEventListener(
    'pointerdown',
    (event) => {
      const box = document.querySelector('.item-row-swipe.open');
      if (!box || box.contains(event.target)) return;
      ui.openId = null;
      box.classList.remove('open');
      moveRow(box.querySelector('.item-row-body'), 0);
      box.querySelector('.item-row-actions').inert = true;
    },
    true,
  );
};
