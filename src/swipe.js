// The drag that a side menu of a row needs to open or to close: 40 % of its width, 40 px at least.
const limit = (width) => Math.max(40, width * 0.4);

// The side of a row that stays open after a drag of `dx` px (right is positive) that
// started with `open` showing. `sides` gives the width of each side menu; a side of
// width 0 never opens.
export const settle = (dx, sides, open = null) => {
  const offset = (open === 'start' ? sides.start : open === 'end' ? -sides.end : 0) + dx;
  if (sides.start > 0 && offset > limit(sides.start)) return open === 'start' && dx < -limit(sides.start) ? null : 'start';
  if (sides.end > 0 && offset < -limit(sides.end)) return open === 'end' && dx > limit(sides.end) ? null : 'end';
  if (open === 'start' && dx > -limit(sides.start)) return 'start';
  if (open === 'end' && dx < limit(sides.end)) return 'end';
  return null;
};

// The slide to the right of a row runs its action at the release when it passed 35 % of the
// width of the row, 80 px at least.
export const reached = (dx, width) => dx >= Math.max(80, width * 0.35);
