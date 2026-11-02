import { moveNote } from '#notes';
import { dropIndex, shifts } from '#reorder';
import { HOLD_MS, EDGE, EDGE_STEP, DRAG_START, scroller, state, ui, t, apply, guardClick } from '#ui/context';
import { rowTops, slide } from '#ui/motion';

// The lifted row of a manual order, or null.
export let reorder = null;

// Puts the lifted row below the pointer and opens the gap among the other rows of its scope.
const placeLifted = () => {
  const { rows, from, tops, heights } = reorder;
  const last = rows.length - 1;
  const raw = reorder.pointerY - reorder.startY + scroller.scrollTop - reorder.scrollStart;
  const dy = Math.max(tops[0] - tops[from], Math.min(tops[last] + heights[last] - tops[from] - heights[from], raw));
  reorder.to = dropIndex(tops, heights, from, tops[from] + dy);
  const offsets = shifts(rows.length, from, reorder.to, heights[from]);
  rows.forEach((row, index) => {
    const y = index === from ? dy : offsets[index];
    row.style.transform = y ? `translateY(${y}px)` : '';
  });
};

// Scrolls the list while the pointer is near its top or its bottom edge.
const edgeScroll = () => {
  if (!reorder) return;
  const { top, bottom } = scroller.getBoundingClientRect();
  const step = reorder.pointerY < top + EDGE ? -EDGE_STEP : reorder.pointerY > bottom - EDGE ? EDGE_STEP : 0;
  if (step) {
    scroller.scrollTop += step;
    placeLifted();
  }
  reorder.frame = requestAnimationFrame(edgeScroll);
};

const lift = (node, rowNode, pointerId, y) => {
  // The rows of the scope that are next to the row.
  const inScope = (row) => row?.dataset.scope === node.dataset.scope;
  const rows = [node];
  for (let row = node.previousElementSibling; inScope(row); row = row.previousElementSibling) rows.unshift(row);
  for (let row = node.nextElementSibling; inScope(row); row = row.nextElementSibling) rows.push(row);
  if (rows.length < 2) return;
  try {
    rowNode.setPointerCapture(pointerId);
  } catch {
    // The pointer is gone: without its release the move would never end.
    return;
  }
  const rects = rows.map((row) => row.getBoundingClientRect());
  const from = rows.indexOf(node);
  reorder = {
    node,
    pointerId,
    rows,
    from,
    to: from,
    tops: rects.map((rect) => rect.top + scroller.scrollTop),
    heights: rects.map((rect) => rect.height),
    startY: y,
    pointerY: y,
    scrollStart: scroller.scrollTop,
  };
  node.classList.add('lifted');
  navigator.vibrate?.(10);
  reorder.frame = requestAnimationFrame(edgeScroll);
};

// Ends a move. `keep` writes the new order; without it the row goes back.
export const endReorder = (keep) => {
  if (!reorder) return;
  const { node, rows, from, to, frame } = reorder;
  cancelAnimationFrame(frame);
  reorder = null;
  // The click that follows a drop must not open the note.
  guardClick();
  // A render in the time of the move built new rows: the order of these rows is stale.
  const moved = keep && to !== from && node.isConnected;
  const before = moved ? rowTops() : null;
  node.classList.remove('lifted');
  rows.forEach((row) => {
    row.style.transform = '';
  });
  if (!moved) return;
  // The index among all the notes: the scope of a note row is the whole list.
  const index = state.notes.findIndex((note) => note.id === rows[to].dataset.id);
  if (apply(moveNote(state, node.dataset.id, index), { undoText: t('toast.order') })) slide(before);
};

// Lets a hold of a finger, or a vertical drag of the mouse, lift the row and move it in its scope.
export const bindReorder = (rowNode, node, id) => {
  let pending = null;
  // True after a hold of the finger: the click of its release must not open the note.
  let held = false;
  const forget = () => {
    clearTimeout(pending?.timer);
    pending = null;
  };
  const start = (pointerId, y) => {
    if (!node.isConnected) return;
    held = true;
    lift(node, rowNode, pointerId, y);
  };
  rowNode.addEventListener('pointerdown', (event) => {
    forget();
    held = false;
    if (event.button !== 0 || reorder || !node.dataset.scope) return;
    if (ui.openId === id) return;
    const mouse = event.pointerType === 'mouse';
    const { pointerId, clientX: x, clientY: y } = event;
    const timer = mouse
      ? null
      : setTimeout(() => {
          pending = null;
          start(pointerId, y);
        }, HOLD_MS);
    pending = { x, y, mouse, timer, pointerId };
  });
  rowNode.addEventListener('pointermove', (event) => {
    // A release out of the row gives it no pointerup: a later hover must not lift it.
    if (pending && (event.pointerId !== pending.pointerId || !(event.buttons & 1))) forget();
    if (pending) {
      const dx = Math.abs(event.clientX - pending.x);
      const dy = Math.abs(event.clientY - pending.y);
      if (Math.max(dx, dy) < DRAG_START) return;
      const { mouse, y } = pending;
      forget();
      // A finger that moves before the hold ends scrolls or swipes. The mouse needs no hold.
      if (mouse && dy > dx) lift(node, rowNode, event.pointerId, y);
    }
    if (reorder?.node !== node || reorder.pointerId !== event.pointerId) return;
    reorder.pointerY = event.clientY;
    placeLifted();
  });
  const finish = (keep) => (event) => {
    forget();
    if (held) guardClick();
    held = false;
    if (reorder?.node === node && reorder.pointerId === event.pointerId) endReorder(keep);
  };
  rowNode.addEventListener('pointerup', finish(true));
  rowNode.addEventListener('pointercancel', finish(false));
  // A long press of a finger must not open the menu of the browser.
  rowNode.addEventListener('contextmenu', (event) => {
    if (event.pointerType !== 'mouse') event.preventDefault();
  });
};

export const bind = () => {
  // A lifted row follows the finger, so the list must not scroll below it.
  document.addEventListener(
    'touchmove',
    (event) => {
      if (reorder) event.preventDefault();
    },
    { passive: false },
  );
};
