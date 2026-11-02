import { SECTIONS } from '#sections';

// The modules that the user can turn off in Settings, by id.
export const MODULES = ['notes'];

// The sections that a module shows.
const SECTIONS_OF = { notes: ['notes'] };

// The sections of the bottom bar, in their order, without the sections of the modules in `off`.
export const visibleSections = (off) => {
  const hidden = off.flatMap((id) => SECTIONS_OF[id] ?? []);
  return SECTIONS.filter((view) => !hidden.includes(view));
};

// The modules that are off after a switch of `id`, in the order of MODULES.
export const switchModule = (off, id, on) => MODULES.filter((module) => (module === id ? !on : off.includes(module)));
