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
