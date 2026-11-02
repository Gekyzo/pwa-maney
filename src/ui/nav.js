import { direction, slideTo } from '#sections';
import { visibleSections } from '#modules';
import { ui, off, render, scroller, guardClick } from '#ui/context';
import { reorder } from '#ui/drag';
import { checkVersion } from '#ui/update';
import { showNavButton } from '#ui/dust';

// Lets the content of the new section come in from the side that it is on in the navigation.
const enter = (way) => {
  scroller.classList.remove('enter-next', 'enter-previous');
  if (!way) return;
  // The read of the width starts the animation again when a change follows another one.
  void scroller.offsetWidth;
  scroller.classList.add(way > 0 ? 'enter-next' : 'enter-previous');
};

export const setView = (view) => {
  if (view === ui.view) return;
  const way = direction(ui.view, view, visibleSections(off));
  Object.assign(ui, { view, noteId: null, openId: null });
  scroller.scrollTop = 0;
  render();
  enter(way);
  if (view === 'settings') checkVersion();
};

export const renderNav = () => {
  const sections = visibleSections(off);
  // A section of a module that went off sends the view to the first one that is on.
  if (!sections.includes(ui.view)) ui.view = sections[0];
  document.querySelectorAll('.nav-item').forEach((button) => {
    showNavButton(button, sections.includes(button.dataset.view));
    if (button.dataset.view === ui.view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
};

export const bind = () => {
  // A child of the content that shows later must not come in from a side.
  scroller.addEventListener('animationend', (event) => {
    if (event.animationName === 'enter') scroller.classList.remove('enter-next', 'enter-previous');
  });
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });
  // A horizontal slide that starts out of the rows changes the section (NAV-2). A row keeps its
  // drag for its side actions, and a text field keeps its drag for the selection.
  let sectionSlide = null;
  document.addEventListener('pointerdown', (event) => {
    sectionSlide = null;
    if (!event.isPrimary || event.button !== 0 || reorder || ui.sheetOpen || ui.onboarding !== null) return;
    if (!event.target.closest('.app-header, main') || event.target.closest('.item-row-swipe, input, textarea, select')) return;
    sectionSlide = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  });
  document.addEventListener('pointerup', (event) => {
    if (sectionSlide?.pointerId !== event.pointerId) return;
    const view = slideTo(ui.view, event.clientX - sectionSlide.x, event.clientY - sectionSlide.y, visibleSections(off));
    sectionSlide = null;
    if (!view) return;
    // The click that follows a slide must not press the button below the finger.
    guardClick();
    setView(view);
  });
  document.addEventListener('pointercancel', () => {
    sectionSlide = null;
  });
};
