import { parseCatalog, classesInScript, menuOf } from '../vendor/design-system/catalog.js';

// A browser cannot list a directory, so the views are named here. tests/design.test.js keeps the
// list equal to src/ui/.
const UI = ['account', 'context', 'controls', 'drag', 'dust', 'install', 'motion', 'nav', 'notes', 'onboarding', 'settings', 'update', 'whatsnew'];

// The shared stylesheet first, then the app's: the order of index.html.
const SHEETS = ['../vendor/design-system/design-system.css', '../styles.css'];

const $ = (id) => document.getElementById(id);

const el = (tag, { dataset = {}, ...props } = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  Object.assign(node.dataset, dataset);
  node.append(...children);
  return node;
};

const get = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(url);
  return response.text();
};

// Where a class is used: the sections and sheets of index.html, by the id of the nearest box or
// the landmark around it, and the views of src/ui/.
const usesOf = (name, page, scripts) => {
  const place = (node) => {
    const box = node.closest('[id]');
    return box ? `#${box.id}` : (node.closest('header, nav, main, footer')?.localName ?? 'body');
  };
  const boxes = [...page.querySelectorAll(`.${CSS.escape(name)}`)].map(place);
  const files = scripts.filter(([, classes]) => classes.includes(name)).map(([file]) => `src/ui/${file}.js`);
  return [...new Set([...boxes, ...files])];
};

const swatch = (token) =>
  el('div', { className: 'ds-swatch', title: token.value }, [
    el('span', { style: `color-scheme: light; background: ${token.value}` }),
    el('span', { style: `color-scheme: dark; background: ${token.value}` }),
    el('code', { textContent: `${token.name}${token.note ? ` · ${token.note}` : ''}` }),
  ]);

const SAMPLES = {
  space: (value) => el('span', { style: `display: block; width: ${value}; height: 12px; background: var(--primary)` }),
  radius: (value) => el('span', { style: `display: block; width: 48px; height: 48px; border: 2px solid var(--primary); border-radius: ${value}` }),
  text: (value) => el('span', { style: `font-size: ${value}`, textContent: 'Leche entera' }),
  weight: (value) => el('span', { style: `font-weight: ${value}`, textContent: 'Leche entera' }),
  shadow: (value) => el('span', { style: `display: block; width: 96px; height: 40px; border-radius: 10px; background: var(--surface); box-shadow: ${value}` }),
  size: (value) => el('span', { style: `display: block; width: ${value}; height: 12px; background: var(--muted)` }),
};

const scaleRow = (token) =>
  el('div', { className: 'ds-scale', dataset: { name: token.name } }, [
    el('code', { textContent: `${token.name}: ${token.value}${token.note ? ` · ${token.note}` : ''}` }),
    SAMPLES[token.scale]?.(`var(${token.name})`) ?? el('span'),
  ]);

const example = (html) => {
  const box = el('div', { className: 'ds-example' });
  // The examples are the markup of the stylesheets, written by their authors, so they go in as HTML.
  box.innerHTML = html.replaceAll('icons.svg#', '../icons.svg#');
  const copy = el('button', { className: 'button outline', type: 'button', textContent: 'Copy' });
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(html);
    copy.textContent = 'Copied';
    setTimeout(() => {
      copy.textContent = 'Copy';
    }, 1200);
  });
  return [box, el('div', { className: 'ds-code' }, [el('pre', { textContent: html }), copy])];
};

const list = (title, items) =>
  items.length ? [el('p', { className: 'ds-meta', textContent: `${title}: ${items.map((item) => `${item.name} — ${item.text}`).join(' · ')}` })] : [];

const card = (part, page, scripts) =>
  el('section', { className: 'ds-card', id: part.name, dataset: { name: [part.name, ...part.parts.map((p) => p.name), ...part.variants.map((v) => v.name)].join(' ') } }, [
    el('h3', { textContent: part.name }),
    el('p', { textContent: part.summary }),
    ...list('Variants', part.variants),
    ...list('Parts', part.parts),
    ...list('States', part.states),
    ...part.examples.flatMap(example),
    el('p', { className: 'ds-meta', textContent: `Used in: ${usesOf(part.name, page, scripts).join(', ') || 'nothing yet'}` }),
  ]);

const section = (id, title, children) => el('section', { className: 'ds-section', id }, [el('h2', { textContent: title }), ...children]);

const link = (id, text, kind) => {
  const anchor = el('a', { className: `ds-link ${kind}`, href: `#${id}`, textContent: text });
  anchor.dataset.target = id;
  return anchor;
};

// The menu: each section, then the parts of the section, each a link to its anchor.
const renderMenu = (catalog) => {
  $('ds-menu').replaceChildren(
    el('ul', { className: 'ds-menu-list' }, menuOf(catalog).map((entry) =>
      el('li', { dataset: { section: entry.id } }, [
        link(entry.id, entry.title, 'ds-section-link'),
        ...(entry.items.length
          ? [el('ul', { className: 'ds-menu-list' }, entry.items.map((name) => el('li', { dataset: { name } }, [link(name, name, 'ds-item-link')])))]
          : []),
      ]))),
  );
};

const render = ({ catalog, page, scripts }) => {
  const of = (layer) => catalog.components.filter((part) => part.layer === layer);
  const colours = catalog.tokens.filter((token) => token.scale === 'colour');
  const scales = catalog.tokens.filter((token) => token.scale !== 'colour');
  const scopes = [...new Set(of('screens').map((part) => part.scope))];
  $('out').replaceChildren(
    ...(catalog.errors.length ? [el('p', { className: 'ds-error', textContent: catalog.errors.join(' · ') })] : []),
    section('colours', 'Colours · light | dark', [el('div', { className: 'ds-swatches' }, colours.map(swatch))]),
    section('scales', 'Scales', [el('div', { className: 'ds-card' }, scales.map(scaleRow))]),
    section('icons', 'Icons', [
      el('div', { className: 'ds-icons' }, catalog.icons.map((id) => {
        const tile = el('div', { dataset: { name: id } }, [el('code', { textContent: id })]);
        tile.insertAdjacentHTML('afterbegin', `<svg class="icon" aria-hidden="true"><use href="../icons.svg#${id}"/></svg>`);
        return tile;
      })),
    ]),
    section('components', 'Components', of('components').map((part) => card(part, page, scripts))),
    section('layouts', 'Layouts', of('layouts').map((part) => card(part, page, scripts))),
    section('base', 'Base', of('base').map((part) => card(part, page, scripts))),
    ...scopes.map((scope) => section(`screens-${scope}`, `Screen parts · ${scope}`, of('screens').filter((part) => part.scope === scope).map((part) => card(part, page, scripts)))),
  );
};

const filter = () => {
  const query = $('filter').value.trim().toLowerCase();
  document.querySelectorAll('#out [data-name], #ds-menu [data-name]').forEach((node) => {
    node.hidden = query !== '' && !node.dataset.name.toLowerCase().includes(query);
  });
};

// The drawer of a narrow screen. On a wide screen the menu is a sidebar and these do nothing visible.
const openMenu = (open) => {
  $('ds-menu').classList.toggle('ds-open', open);
  $('ds-veil').hidden = !open;
  $('ds-menu-button').setAttribute('aria-expanded', String(open));
};

$('ds-menu-button').addEventListener('click', () => openMenu(!$('ds-menu').classList.contains('ds-open')));
$('ds-veil').addEventListener('click', () => openMenu(false));
$('ds-menu').addEventListener('click', (event) => {
  if (event.target.closest('a')) openMenu(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') openMenu(false);
});

// Marks the section and the part at the top of the view in the menu.
const markCurrent = () => {
  const top = 96;
  const last = (selector) => [...document.querySelectorAll(selector)].filter((node) => !node.hidden && node.getBoundingClientRect().top <= top).at(-1);
  const current = new Set([last('#out .ds-section')?.id, last('#out .ds-card[id]')?.id]);
  document.querySelectorAll('#ds-menu .ds-link').forEach((anchor) => {
    anchor.setAttribute('aria-current', String(current.has(anchor.dataset.target)));
  });
};

let marking = false;
document.addEventListener('scroll', () => {
  if (marking) return;
  marking = true;
  requestAnimationFrame(() => {
    marking = false;
    markCurrent();
  });
}, { passive: true });

$('filter').addEventListener('input', filter);
$('theme').addEventListener('change', (event) => {
  if (event.target.value) document.documentElement.dataset.theme = event.target.value;
  else delete document.documentElement.dataset.theme;
});

const fail = (text) => $('out').replaceChildren(el('p', { className: 'ds-error', textContent: text }));

let sources = null;
try {
  sources = await Promise.all([...SHEETS, '../icons.svg', '../index.html', ...UI.map((name) => `../src/ui/${name}.js`)].map(get));
} catch (error) {
  fail(`Could not load ${error.message}. Run npm run serve and open http://localhost:8080/designs/.`);
}
if (sources) {
  const [shared, own, sprite, html, ...views] = sources;
  const catalog = parseCatalog({ css: [shared, own], sprite });
  render({
    catalog,
    page: new DOMParser().parseFromString(html, 'text/html'),
    scripts: UI.map((name, index) => [name, classesInScript(views[index])]),
  });
  renderMenu(catalog);
  // The anchor of the address was not on the page before the render.
  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  markCurrent();
}
