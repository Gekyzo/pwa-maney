// The sections, in the order of the bottom bar.
export const SECTIONS = ['notes', 'settings'];

// The length of a slide that changes the section or a page.
const SLIDE_MIN = 60;

// The way of a slide of `dx`, `dy` px (right and down are positive): 1 for a slide to the left,
// which goes forward, -1 for a slide to the right, 0 for a slide that is short or not horizontal.
export const slideDirection = (dx, dy) => {
  if (Math.abs(dx) < SLIDE_MIN || Math.abs(dx) < 2 * Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
};

// The section that a slide of `dx`, `dy` px goes to from `view`, in the order of `sections`: the
// next one on a slide to the left, the previous one on a slide to the right. Null for no slide,
// and at the first and the last section.
export const slideTo = (view, dx, dy, sections = SECTIONS) => {
  const way = slideDirection(dx, dy);
  const index = sections.indexOf(view);
  if (!way || index < 0) return null;
  return sections[index + way] ?? null;
};

// The way from `from` to `to` in the order of `sections`: 1 towards a later section, -1 towards
// an earlier one, 0 when there is no way.
export const direction = (from, to, sections = SECTIONS) => {
  const [a, b] = [sections.indexOf(from), sections.indexOf(to)];
  return a < 0 || b < 0 ? 0 : Math.sign(b - a);
};
