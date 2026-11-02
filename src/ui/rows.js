import { settle } from '#swipe';
import { SIDE_BUTTON, DRAG_START, el, ui, render, guardClick } from '#ui/context';

// The rows that slide left to show their side actions, shared by the lists of to-dos and receipts.
// A row is named by a key of its kind and its id (`todo:<id>`), as a to-do and a receipt may share an id.

export const rowKey = (kind, id) => `${kind}:${id}`;

export const moveRow = (row, x) => {
  row.style.transform = x ? `translateX(${x}px)` : '';
};

// Lets a horizontal drag of the row show the side actions behind it (`settle` decides).
const bindSwipe = (row, width, key) => {
  let drag = null;
  row.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, base: ui.openId === key ? -width : 0, active: false };
  });
  row.addEventListener('pointermove', (event) => {
    if (!drag) return;
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
    // The click that follows a drag must not open the sheet or tick the to-do.
    guardClick();
    const side = settle(event.clientX - x, { start: 0, end: width }, ui.openId === key ? 'end' : null);
    ui.openId = side ? key : null;
    ui.settleFrom = { key, x: at };
    render();
  };
  row.addEventListener('pointerup', finish);
  row.addEventListener('pointercancel', finish);
};

// The box of a row: the side actions behind the body, which slides over them.
export const swipeRow = (key, body, actions) => {
  const open = ui.openId === key;
  const width = actions.length * SIDE_BUTTON;
  const from = ui.settleFrom?.key === key ? ui.settleFrom.x : null;
  if (from !== null) {
    // Start where the drag ended, then move to the settled place with the CSS transition.
    moveRow(body, from);
    requestAnimationFrame(() => requestAnimationFrame(() => moveRow(body, open ? -width : 0)));
  } else moveRow(body, open ? -width : 0);
  bindSwipe(body, width, key);
  return el('div', { className: open ? 'item-row-swipe open' : 'item-row-swipe' }, [
    el('div', { className: 'item-row-actions', inert: !open }, actions),
    body,
  ]);
};

// Closes the open row, if there is one. True when a row closed.
export const closeOpenRow = () => {
  if (ui.openId === null) return false;
  ui.openId = null;
  render();
  return true;
};

export const bind = () => {
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
