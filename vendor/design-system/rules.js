// The design rules of the pwa apps (DS-n, LAY-n), as data. Each app runs them in its own tests.
//
// RULES = [{ id, title, reads, check }]. `check(files)` returns the violations: [] is a pass.
// `reads` names the keys of `files` that the check uses.
//
// files = {
//   css:     string[]            the stylesheets, the shared design-system.css first, then the app's styles.css
//   html:    string              index.html of the app
//   scripts: [name, text][]      the view scripts of the app (src/ui/*.js); `controls.js` owns icon()
//   sprite:  string              icons.svg ('' when the app has none)
//   page:    string              designs/page.js of the app, which lists the views (const UI = [...])
//   pageHtml: string             designs/index.html, the catalogue page, whose <style> is its frame
// }
// A key a check does not read may be left out.

import { LAYERS, rulesOf, iconsOf, parseCatalog, classesOf, classesInScript } from './catalog.js';

const TOKEN_PROPERTIES = /^(color|background(-color)?|border(-(top|right|bottom|left))?(-color)?|outline(-color)?|fill|stroke|padding(-\w+)?|margin(-\w+)?|gap|row-gap|column-gap|inset|top|right|bottom|left|font-size|font-weight|font-family|font|border-radius|box-shadow|transition|animation)$/;
// A value part that needs no token: a keyword, a token, env(), a percent, or a small border width.
const ALLOWED = /^(0|1px|2px|-?\d+(\.\d+)?%|-?\d+deg|var\(--[\w-]+\)|env\([\w-]+\)|[a-zA-Z-]+)$/;
// The controls that carry the tap size, and the heights a control may have.
const TAP_CLASSES = ['button', 'chip', 'input', 'swipe-action', 'segment'];
const TAP_TOKENS = ['--tap', '--tap-l'];
// The classes of the last compound of each selector of a rule.
const lastClasses = (selector) =>
  selector.split(',').flatMap((part) => [...(part.trim().split(/[\s>+~]+/).pop() ?? '').matchAll(/\.([a-z][\w-]*)(?![\w-])/g)].map(([, name]) => name));
// The drawings of the walkthrough are art: their shapes are bare svg elements.
const ART = /^\.onboarding-art > svg/;

// The parts of a value that are raw: a length, a time, a colour or a quoted font name.
const rawParts = (value) =>
  value
    .replace(/var\(--[\w-]+\)/g, ' ')
    .replace(/env\([\w-]+\)/g, ' ')
    .replace(/[(),/*+]/g, ' ')
    .split(/\s+/)
    .filter((part) => part && !ALLOWED.test(part) && !/^-?\d+(\.\d+)?$/.test(part));

const where = (rule, d) => `${rule.file}:${d.line}: ${rule.selector} { ${d.property}: ${d.value} }`;

// What the checks share: the rules of all stylesheets (each tagged with its sheet), the
// symbols, the catalogue and the classes that the page and the code use.
const contextOf = ({ css = [], html = '', scripts = [], sprite = '', page = '', pageHtml = '' }) => {
  const rules = css.flatMap((text, file) => rulesOf(text).map((rule) => ({ ...rule, file: `css[${file}]` })));
  const joined = css.join('\n');
  const symbols = [...sprite.matchAll(/<symbol\b[^>]*\bid="([^"]+)"/g)].map(([, id]) => id);
  const catalog = parseCatalog({ css, sprite });
  const names = (part) => [part.name, ...part.parts.map((p) => p.name), ...part.variants.map((v) => v.name), ...part.states.map((s) => s.name)];
  return {
    css, html, scripts, sprite, page, pageHtml, rules, joined, symbols, catalog,
    // The walkthrough is optional: with it removed there is no art to leave out.
    art: html.match(/<div class="onboarding-art">[\s\S]*?<\/div>/)?.[0] ?? '',
    used: new Set([...classesOf(html), ...scripts.flatMap(([, js]) => classesInScript(js))]),
    known: new Set(catalog.components.flatMap(names)),
  };
};

// A family of components: each name is documented, no old class is used, and no rule styles one.
const family = (names, retired, gone = []) => ({ catalog, used, rules }) => {
  const old = new RegExp(`\\.(${retired.join('|')})(?![\\w-])`);
  return [
    ...names.filter((name) => !catalog.components.some((part) => part.name === name)).map((name) => `${name} has no @component block`),
    ...retired.filter((name) => used.has(name)).map((name) => `an old class is still used: ${name}`),
    ...rules.filter((rule) => old.test(rule.selector) || gone.some((selector) => rule.selector.includes(selector))).map((rule) => `a rule styles an old class: ${rule.selector}`),
  ];
};

const FAMILY_READS = ['css', 'html', 'scripts', 'sprite'];

const define = (id, title, reads, check) => ({ id, title, reads, check: (files) => check(contextOf(files)) });

export const RULES = [
  define('DS-1', 'styles.css declares the five layers first, and each rule is in one of them (DS-1)', ['css'], ({ css, rules }) => [
    ...css.flatMap((text, file) => (/^@layer tokens, base, components, layouts, screens;/.test(text) ? [] : [`css[${file}] does not start with the layer statement`])),
    ...rules.filter((rule) => !LAYERS.includes(rule.layer)).map((rule) => `${rule.file}:${rule.line}: ${rule.selector}`),
  ]),

  define('DS-2', 'a raw value of a token property is only in the tokens layer (DS-2)', ['css'], ({ rules }) =>
    rules
      .filter((rule) => rule.layer !== 'tokens' && !rule.keyframe)
      .flatMap((rule) => rule.declarations.filter((d) => TOKEN_PROPERTIES.test(d.property) && rawParts(d.value).length).map((d) => where(rule, d)))),

  define('DS-2', 'a keyframe takes its colours from the tokens (DS-2)', ['css'], ({ rules }) =>
    rules
      .filter((rule) => rule.keyframe)
      .flatMap((rule) => rule.declarations.filter((d) => /colou?r|background/.test(d.property) && rawParts(d.value).length).map((d) => where(rule, d)))),

  define('DS-2', 'a raw width or height is not in the screens layer (DS-2)', ['css'], ({ rules }) =>
    rules
      .filter((rule) => rule.layer === 'screens')
      .flatMap((rule) => rule.declarations.filter((d) => /^(min-|max-)?(width|height)$/.test(d.property) && /\d(px|rem)/.test(d.value.replace(/var\([^)]*\)/g, '').replace(/^1px$/, ''))).map((d) => where(rule, d)))),

  define('DS-2', 'reduced motion sets the motion tokens to 0ms in one place (DS-2)', ['css'], ({ joined, rules }) => {
    const queries = (joined.match(/prefers-reduced-motion/g) ?? []).length;
    const motion = rules.filter((rule) => rule.layer === 'tokens' && rule.declarations.some((d) => d.property === '--motion' && d.value === '0ms'));
    return [
      ...(queries === 1 ? [] : [`${queries} reduced-motion queries, expected 1`]),
      ...(motion.length === 1 ? [] : [`${motion.length} rules set --motion to 0ms, expected 1`]),
    ];
  }),

  define('DS-5', 'each svg of the page uses a symbol, except the drawings of the walkthrough (DS-5)', ['html'], ({ html, art }) => {
    const svgs = html.replace(art, '').match(/<svg\b[\s\S]*?<\/svg>/g) ?? [];
    const icon = /^<svg (data-for="\w+" )?class="icon[^"]*" aria-hidden="true"><use href="icons\.svg#[\w-]+"\/><\/svg>$/;
    return svgs.filter((svg) => !icon.test(svg));
  }),

  define('DS-5', 'each icon that the page or the code names is a symbol of icons.svg (DS-5)', ['html', 'scripts', 'sprite'], ({ html, scripts, symbols }) => {
    const named = [...iconsOf(html), ...scripts.flatMap(([, js]) => [...js.matchAll(/\bicon(?:Button)?\('([\w-]+)'/g)].map(([, id]) => id))];
    return [...(named.length ? [] : ['no icon is named']), ...named.filter((id) => !symbols.includes(id))];
  }),

  define('DS-5', 'each symbol of icons.svg is used (DS-5)', ['html', 'scripts', 'sprite'], ({ html, scripts, symbols }) => {
    const text = [html, ...scripts.map(([, js]) => js)].join('\n');
    return [...(symbols.length ? [] : ['icons.svg has no symbol']), ...symbols.filter((id) => !text.includes(`#${id}"`) && !text.includes(`'${id}'`))];
  }),

  define('DS-5', 'only icon() of controls.js builds an svg (DS-5)', ['scripts'], ({ scripts }) =>
    scripts.filter(([file, js]) => file !== 'controls.js' && /createElementNS|'svg'/.test(js)).map(([file]) => file)),

  define('DS-3', 'every action is a button of the design system (DS-3)', FAMILY_READS, family(
    ['button', 'fab'],
    ['tool', 'send', 'recur', 'more', 'recipe-link'],
    ['#search-button', '#menu-clear', '#meal-remove', '#update', '#onboarding-skip', '.actions button', '.actions .danger', '.empty button', '.banner button', '.menu-actions button', '.add-row button', '.toast button', '.onboarding-actions button'],
  )),

  define('DS-3', 'primary is a variant of button only (DS-3)', ['css', 'html'], ({ rules, html }) => [
    ...rules.filter((rule) => /\.primary\b/.test(rule.selector) && !rule.selector.includes('.button')).map((rule) => rule.selector),
    ...[...html.matchAll(/class="([^"]*\bprimary\b[^"]*)"/g)].map(([, value]) => value).filter((value) => !value.split(' ').includes('button')),
  ]),

  define('DS-3', 'chips, pills, segments and switches are components (DS-3)', FAMILY_READS, family(
    ['chip', 'pill', 'segmented', 'switch', 'cluster'],
    ['chips', 'shop-chips', 'chip-count', 'seg'],
    ['.chips button', '.seg button', 'button.pill', '.group .switch'],
  )),

  define('DS-3', 'the muted colour of an icon button does not outrank its variants', ['css'], ({ rules }) => {
    const icon = rules.find((rule) => rule.selector.startsWith('.button.icon') && rule.declarations.some((d) => d.property === 'color'));
    if (!icon) return ['no .button.icon rule sets color'];
    return /^\.button\.icon:where\(/.test(icon.selector) ? [] : [icon.selector];
  }),

  define('DS-3', 'inputs, fields and selects are components (DS-3)', FAMILY_READS, family(
    ['input', 'field', 'select', 'input-row'],
    ['add-row', 'edit-name', 'edit-quantity'],
    ['.sheet .field', '.search input', '.product-form input', '.group select', '#meal-query'],
  )),

  define('DS-3', 'the header and the bottom bar are components (DS-3)', FAMILY_READS, family(
    ['app-header', 'nav-bar', 'badge', 'ring'],
    ['head', 'head-text', 'bnav', 'badge-count'],
    ['.ring span', '.bnav button', '.head h1', '.head p'],
  )),

  define('DS-3', 'sheets, toasts, banners and empty states are components (DS-3)', FAMILY_READS, family(
    ['sheet', 'toast', 'banner', 'empty-state'],
    ['veil', 'grab', 'empty', 'meal-empty'],
    ['.sheet h2', '.sheet .entry', '.toast span', '.banner p', '#edit-chips', '#edit-empty'],
  )),

  define('DS-3', 'rows, list groups and section heads are components (DS-3)', FAMILY_READS, family(
    ['item-row', 'swipe-action', 'section-head', 'group-head', 'list-group', 'item-list', 'version-status'],
    ['items', 'item', 'row', 'swipe', 'side', 'backdrop', 'name', 'qty', 'section', 'actions', 'suggestions', 'group', 'suggestion-name', 'suggestion-where', 'create'],
    ['#version-status', 'input[type="checkbox"]', '.item-row-name small'],
  )),

  define('DS-6', 'the catalogue has no error (DS-6)', ['css'], ({ catalog }) => catalog.errors),

  define('DS-6', 'each class that the page or the code uses is documented (DS-6)', ['css', 'html', 'scripts'], ({ used, known }) =>
    [...used].filter((name) => !known.has(name)).sort()),

  define('DS-6', 'each class of a selector is documented (DS-6)', ['css'], ({ rules, known }) => {
    const inSelectors = rules.filter((rule) => !rule.keyframe).flatMap((rule) => [...rule.selector.matchAll(/\.([a-z][\w-]*)/g)].map(([, name]) => name));
    return [...new Set(inSelectors)].filter((name) => !known.has(name)).sort();
  }),

  define('DS-6', 'each example of the catalogue uses known classes and icons (DS-6)', ['css', 'sprite'], ({ catalog, known, symbols }) => {
    const examples = catalog.components.flatMap((part) => part.examples);
    // The shared sheet (css[0]) shows icons that an app's sprite may lack: only the app's sheets are checked.
    const own = catalog.components.filter((part) => part.sheet > 0).flatMap((part) => part.examples);
    return [
      ...examples.flatMap(classesOf).filter((name) => !known.has(name)),
      ...own.flatMap(iconsOf).filter((id) => !symbols.includes(id)),
    ];
  }),

  define('DS-4', 'no selector styles a bare element inside a class, and none has an id (DS-4)', ['css'], ({ rules }) => {
    const selectors = rules.filter((rule) => !rule.keyframe && rule.layer !== 'tokens' && rule.layer !== 'base').map((rule) => rule.selector);
    const bare = /\.[\w-]+[^,]*?(\s+|\s*>\s*)(button|input|span|small|p|h[1-6]|li|ul|svg|select|em|strong|label|form|a)\b(?![\w-])/;
    return [...selectors.filter((selector) => selector.includes('#')), ...selectors.filter((selector) => !ART.test(selector) && bare.test(selector))];
  }),

  define('DS-3', 'a variant is used with its block in the page (DS-3)', ['css', 'html'], ({ catalog, html }) => {
    const owners = new Map();
    for (const part of catalog.components) {
      for (const variant of part.variants) owners.set(variant.name, [...(owners.get(variant.name) ?? []), part.name, ...part.parts.map((p) => p.name)]);
    }
    const alone = new Set(catalog.components.flatMap((part) => [part.name, ...part.parts.map((p) => p.name), ...part.states.map((s) => s.name)]));
    const lists = [...html.matchAll(/\bclass="([^"]*)"/g)].map(([, value]) => value.split(/\s+/));
    return lists.flatMap((list) => list.filter((name) => owners.has(name) && !alone.has(name) && !owners.get(name).some((owner) => list.includes(owner))).map((name) => `${name} in "${list.join(' ')}"`));
  }),

  define('DS-3', 'a className of the code is a literal, so that the test can read it', ['scripts'], ({ scripts }) =>
    scripts.filter(([, js]) => /className:\s*`|\.className\s*=/.test(js)).map(([file]) => file)),

  define('DS-7', 'the catalogue page reads each view of src/ui/ (DS-7)', ['scripts', 'page'], ({ page, scripts }) => {
    const listed = (page.match(/const UI = \[([^\]]*)\]/)?.[1] ?? '').match(/'([\w-]+)'/g)?.map((name) => name.slice(1, -1)) ?? [];
    const views = scripts.map(([file]) => file.replace(/\.js$/, ''));
    return [
      ...views.filter((name) => !listed.includes(name)).map((name) => `${name} is not listed`),
      ...listed.filter((name) => !views.includes(name)).map((name) => `${name} is not a view`),
    ];
  }),

  define('DS-7', 'the frame of the catalogue page does not reach into the examples (DS-7)', ['pageHtml'], ({ pageHtml }) => {
    const style = pageHtml.match(/<style>([\s\S]*?)<\/style>/)?.[1];
    if (style === undefined) return ['the catalogue page has no <style>'];
    // An unlayered frame rule beats every layer of the stylesheets, so a frame rule that ends in a
    // bare element must reach only a direct child of a frame box.
    return rulesOf(style)
      .filter((rule) => /(^|\s)(h[1-6]|p|span|div|code|pre)$/.test(rule.selector) && !/>\s*(h[1-6]|p|span|div|code|pre)$/.test(rule.selector))
      .map((rule) => rule.selector);
  }),

  define('DS-8', 'a width query uses only the breakpoints 600px and 840px, as min-width (DS-8)', ['css'], ({ joined }) => {
    const queries = [...joined.matchAll(/@media\s*([^{]+)\{/g)].map(([, query]) => query);
    const widths = queries.flatMap((query) =>
      [...query.matchAll(/\(\s*(min-|max-)?width\s*:\s*([^)]+)\)/g)].map(([, kind = '', value]) => `${kind}${value.trim()}`));
    return [
      ...['min-600px', 'min-840px'].filter((width) => !widths.includes(width)).map((width) => `no ${width} query`),
      ...widths.filter((width) => !['min-600px', 'min-840px'].includes(width)),
    ];
  }),

  define('LAY-2', 'a rail at the start side has a rail at the end side for the right hand (LAY-2)', ['css'], ({ rules }) => {
    const rail = rules.some((rule) => rule.selector === '.nav-bar' && rule.declarations.some((d) => d.property === 'inset-inline-start'));
    const end = rules.some((rule) => rule.selector === ':root[data-hand="right"] .nav-bar');
    return rail && !end ? ['no [data-hand="right"] .nav-bar'] : [];
  }),

  define('LAY-3', 'the pane layout is documented with its parts (LAY-3)', ['css'], ({ catalog }) => {
    const pane = catalog.components.find((component) => component.name === 'pane');
    if (!pane) return ['pane is not documented'];
    const parts = pane.parts.map((part) => part.name).sort();
    return parts.join() === 'pane-back,pane-detail,pane-list' ? [] : [`pane parts: ${parts.join(', ')}`];
  }),

  // The body rule belongs to the app, so it is read only when an app sheet follows the shared one.
  define('LAY-4', 'the content and the fixed controls keep out of a cutout on either side (LAY-4)', ['css'], ({ css, rules }) => {
    const declared = (selector, property) =>
      rules.filter((rule) => rule.selector === selector).flatMap((rule) => rule.declarations.filter((d) => d.property === property).map((d) => d.value));
    const some = (selector, property, inset) => declared(selector, property).some((value) => value.includes(inset));
    const every = (selector, property, inset) => declared(selector, property).every((value) => value.includes(inset));
    return [
      ...(css.length < 2 || some('body', 'padding-inline-end', 'safe-area-inset-right') ? [] : ['body end padding']),
      ...(css.length < 2 || some('body', 'padding-inline-start', 'safe-area-inset-left') ? [] : ['body start padding']),
      ...['.fab', '.toast'].filter((selector) => !some(selector, 'right', 'safe-area-inset-right')).map((selector) => `${selector} right`),
      ...(every('[data-hand="left"] .fab', 'left', 'safe-area-inset-left') ? [] : ['left-hand fab']),
      ...(every('.toast', 'left', 'safe-area-inset-left') ? [] : ['toast left']),
    ];
  }),

  // Only the shared stylesheet (css[0]) is read: an app may name its own things in its comments.
  define('DS-6', 'the doc comments of the design system carry no words of another app', ['css'], ({ css }) => {
    const docs = [...(css[0] ?? '').matchAll(/\/\*[\s\S]*?\*\//g)].map(([comment]) => comment).join('\n');
    const foreign = /\b(Leche|Café|Siempre|Buscar|Nueva tienda|Nombre|Idioma|Borrar|Próxima|Actual|recipes?|shops?|trip|bought|products?|groceries)\b/gi;
    return [...new Set(docs.match(foreign) ?? [])];
  }),

  // `switch-input` is the checkbox of a switch: it is drawn at 26px inside the 56px row of `.switch`,
  // which owns the hit area. It is not in TAP_CLASSES, so it is exempt by name.
  define('TAP-1', 'a height is never 44px, and a control is at least the tap size (TAP-1)', ['css'], ({ rules }) =>
    rules
      .filter((rule) => !rule.keyframe && rule.layer !== 'tokens')
      .flatMap((rule) =>
        rule.declarations
          .filter((d) => /^(min-)?height$/.test(d.property))
          .filter((d) => {
            if (/(^|[^\d.])44px/.test(d.value)) return true;
            if (!lastClasses(rule.selector).some((name) => TAP_CLASSES.includes(name))) return false;
            const tokens = [...d.value.matchAll(/var\((--[\w-]+)\)/g)].map(([, token]) => token);
            if (tokens.length && tokens.every((token) => TAP_TOKENS.includes(token))) return false;
            const pixels = [...d.value.matchAll(/(\d+(?:\.\d+)?)px/g)].map(([, px]) => Number(px));
            return tokens.some((token) => !TAP_TOKENS.includes(token)) || pixels.some((px) => px < 48);
          })
          .map((d) => where(rule, d)))),

  define('TAP-2', 'the line colour is a border, never a text colour (TAP-2)', ['css'], ({ rules }) =>
    rules
      .filter((rule) => !rule.keyframe && rule.layer !== 'tokens')
      .flatMap((rule) => rule.declarations.filter((d) => d.property === 'color' && /var\(--line\)/.test(d.value)).map((d) => where(rule, d)))),

  define('TXT-1', 'text is never justified (TXT-1)', ['css'], ({ rules }) =>
    rules.flatMap((rule) => rule.declarations.filter((d) => d.property === 'text-align' && d.value.replace(/\s*!important$/, '') === 'justify').map((d) => where(rule, d)))),

  // One focus ring: the global :focus-visible outline, and an input that draws a border instead.
  define('FOCUS-1', 'an input draws its focus as a border, with no outline (FOCUS-1)', ['css'], ({ rules }) => {
    const outlines = rules.flatMap((rule) => rule.declarations.filter((d) => d.property === 'outline').map((d) => ({ rule, d })));
    const visible = ({ d }) => !/^(none|0)$/.test(d.value.replace(/\s*!important$/, '').trim());
    const lastCompound = (selector) => selector.split(',').map((part) => part.trim().split(/[\s>+~]+/).pop() ?? '');
    const isInput = (compound) => /\.(input|field-input|dock-input)(?![\w-])/.test(compound);
    const focus = /:focus(-visible)?(?![\w-])/;
    const onInput = ({ rule }) => lastCompound(rule.selector).some((compound) => isInput(compound) && focus.test(compound));
    const global = outlines.filter((o) => visible(o) && /:focus-visible(?![\w-])/.test(o.rule.selector) && !onInput(o));
    const dropped = outlines.some((o) => !visible(o) && lastCompound(o.rule.selector).some((compound) => /\.input(?![\w-])/.test(compound) && focus.test(compound)));
    return [
      ...(global.length && !dropped ? ['no .input:focus-visible rule sets outline: none'] : []),
      ...outlines.filter((o) => onInput(o) && visible(o)).map(({ rule, d }) => where(rule, d)),
    ];
  }),

  // A sheet of the app has a head with its close or Done button. The button is inside the head, which ends at </header> or </div>.
  define('SHEET-1', 'each sheet has a sheet-head with a close or Done button (SHEET-1)', ['html'], ({ html }) => {
    const opens = [...html.matchAll(/class="([^"]*)"/g)].filter(([, value]) => value.split(/\s+/).includes('sheet'));
    return opens
      .map((open, i) => html.slice(open.index, opens[i + 1]?.index ?? html.length))
      .filter((part) => !/class="[^"]*\bsheet-head\b[^"]*"[^>]*>(?:(?!<\/header>|<\/div>)[\s\S])*?<button\b/.test(part))
      .map((part) => part.slice(0, 60));
  }),

  // An empty state of the app holds a button, except an inline one. The part ends at the close tag of its own element.
  define('STATE-1', 'each empty state holds a button, except an inline one (STATE-1)', ['html'], ({ html }) => {
    const tags = [...html.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b([^>]*)>/g)];
    const ends = (start) => {
      const name = tags[start][2].toLowerCase();
      let depth = 0;
      for (let i = start; i < tags.length; i += 1) {
        if (tags[i][2].toLowerCase() !== name) continue;
        depth += tags[i][1] ? -1 : tags[i][3].endsWith('/') ? 0 : 1;
        if (depth === 0) return tags[i].index;
      }
      return html.length;
    };
    return tags
      .map((tag, i) => ({ tag, i }))
      .filter(({ tag }) => !tag[1] && (/\bclass="([^"]*)"/.exec(tag[3])?.[1].split(/\s+/) ?? []).some((name) => name === 'empty-state') && !/\bclass="[^"]*\binline\b/.test(tag[3]))
      .map(({ tag, i }) => html.slice(tag.index, ends(i)))
      .filter((part) => !/<button\b/.test(part))
      .map((part) => part.slice(0, 60));
  }),

  // The blocks that mirror for the left hand: each one the css defines needs a [data-hand="left"] rule.
  define('HAND-1', 'each mirrored block that the css defines has a left-hand rule (HAND-1)', ['css'], ({ rules }) => {
    const parts = rules.flatMap((rule) => rule.selector.split(',').map((part) => part.trim()));
    const has = (part, name) => new RegExp(`\\.${name}(?![\\w-])`).test(part);
    return ['app-header', 'input-row', 'sheet-head', 'sheet-foot', 'item-row-end', 'dock']
      .filter((name) => parts.some((part) => !part.includes('[data-hand="left"]') && has(part, name)))
      .filter((name) => !parts.some((part) => part.includes('[data-hand="left"]') && has(part, name)))
      .map((name) => `.${name} has no [data-hand="left"] rule`);
  }),
];
