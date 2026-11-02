import { LEAVE_MS } from '#ui/context';

// Closes rows of the list, then runs `done`.
export const collapse = (nodes, done) => {
  if (!nodes.length || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    done();
    return;
  }
  nodes.forEach((node) => {
    node.style.height = `${node.offsetHeight}px`;
    // Read the layout, so that the height below starts a transition.
    node.getBoundingClientRect();
    node.classList.add('leaving');
    node.style.height = '0px';
  });
  setTimeout(done, LEAVE_MS);
};

// Opens rows that a render has just built. It is the opposite of `collapse`.
export const expand = (nodes) => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  nodes.forEach((node) => {
    const still = { minHeight: 0, overflow: 'hidden' };
    node.animate(
      [
        { height: '0px', opacity: 0, ...still },
        { height: `${node.offsetHeight}px`, opacity: 1, ...still },
      ],
      { duration: LEAVE_MS, easing: 'ease-out' },
    );
  });
};

// The top of each note row, by id.
export const rowTops = () =>
  new Map([...document.querySelectorAll('#note-list .item-row[data-id]')].map((node) => [node.dataset.id, { node, top: node.getBoundingClientRect().top }]));

// Moves each row from its place before a render (`before`, from `rowTops`) to its new place.
export const slide = (before) => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  rowTops().forEach(({ node, top }, key) => {
    const from = before.get(key);
    if (!from || from.top === top) return;
    node.animate([{ transform: `translateY(${from.top - top}px)` }, { transform: 'none' }], {
      duration: LEAVE_MS,
      easing: 'ease-out',
    });
  });
};
