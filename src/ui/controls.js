import { el } from '#ui/context';

const SVG_NS = 'http://www.w3.org/2000/svg';

// A line icon of icons.svg.
export const icon = (name, variant = '') => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', variant ? `icon ${variant}` : 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `icons.svg#${name}`);
  svg.append(use);
  return svg;
};

let sprite = null;

// The shapes of a symbol, for a copy of an icon that must stand alone, such as a data: image.
export const symbolNodes = async (name) => {
  sprite ??= fetch('icons.svg')
    .then((response) => response.text())
    .then((text) => new DOMParser().parseFromString(text, 'image/svg+xml'));
  const symbol = (await sprite).getElementById(name);
  return symbol ? [...symbol.childNodes].map((node) => node.cloneNode(true)) : [];
};

// A button of a side menu: an icon, with the name of the action for a screen reader.
export const iconButton = (name, label, onClick, { variant = '' } = {}) => {
  const button = el('button', { type: 'button', className: ['swipe-action', variant].join(' '), title: label, onclick: onClick }, [icon(name)]);
  button.setAttribute('aria-label', label);
  return button;
};
