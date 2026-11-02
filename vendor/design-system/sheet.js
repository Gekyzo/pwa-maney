// Drag-to-close for a bottom sheet. An app imports it from vendor/design-system/sheet.js.
// `dismissed` is pure. `bindSheetDrag` touches the DOM and has no unit test: it needs a browser.

const FAR = 0.3; // share of the sheet height that closes it
const FAST = 0.5; // px per ms that closes it
const WINDOW = 100; // ms of moves that give the release velocity

// True when a downward drag of `dy` px, released at `velocity` px/ms, closes a sheet `height` px tall.
export const dismissed = (dy, velocity, height) => dy > 0 && (dy > height * FAR || velocity > FAST);

// Release velocity in px/ms from the moves [{ dy, t }] of a drag. A pause of more than WINDOW ms before `now` is 0.
export const velocityOf = (moves, now) => {
  const last = moves[moves.length - 1];
  if (!last || now - last.t > WINDOW) return 0;
  const from = moves.find((move) => last.t - move.t <= WINDOW);
  const span = last.t - from.t;
  return span > 0 ? (last.dy - from.dy) / span : 0;
};

const GRIP = '.sheet-grab, .sheet-head';
const CONTROL = 'button, input, a, select';

// Binds the drag to a `.sheet-layer` element. Returns a function that removes it.
export const bindSheetDrag = (layer, { close }) => {
  const sheet = layer.querySelector('.sheet');
  const veil = layer.querySelector('.sheet-veil');
  if (!sheet) return () => {};
  let drag = null;

  const reset = () => {
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (veil) {
      veil.style.transition = '';
      veil.style.opacity = '';
    }
  };

  const onDown = (event) => {
    if (drag || (event.pointerType === 'mouse' && event.button !== 0) || !event.target.closest(GRIP) || event.target.closest(CONTROL)) return;
    // A side sheet hides its grab and does not drag.
    const grab = sheet.querySelector('.sheet-grab');
    if (grab && globalThis.getComputedStyle?.(grab).display === 'none') return;
    drag = { id: event.pointerId, y: event.clientY, height: sheet.offsetHeight || 1, moves: [] };
    sheet.setPointerCapture?.(event.pointerId);
    sheet.style.transition = 'none';
    if (veil) veil.style.transition = 'none';
  };

  const onMove = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = Math.max(0, event.clientY - drag.y);
    drag.moves.push({ dy, t: event.timeStamp });
    sheet.style.transform = `translateY(${dy}px)`;
    if (veil) veil.style.opacity = String(Math.max(0, 1 - dy / drag.height));
  };

  const onEnd = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { moves, height } = drag;
    drag = null;
    const last = moves[moves.length - 1];
    const dy = last ? last.dy : 0;
    const velocity = velocityOf(moves, event.timeStamp);
    const cancelled = event.type !== 'pointerup';
    reset();
    if (!cancelled && dismissed(dy, velocity, height)) close();
  };

  layer.addEventListener('pointerdown', onDown);
  layer.addEventListener('pointermove', onMove);
  layer.addEventListener('pointerup', onEnd);
  layer.addEventListener('pointercancel', onEnd);
  layer.addEventListener('lostpointercapture', onEnd);
  return () => {
    layer.removeEventListener('pointerdown', onDown);
    layer.removeEventListener('pointermove', onMove);
    layer.removeEventListener('pointerup', onEnd);
    layer.removeEventListener('pointercancel', onEnd);
    layer.removeEventListener('lostpointercapture', onEnd);
    drag = null;
    reset();
  };
};
