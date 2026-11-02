// Reads the design system out of its stylesheets (design-system.css, then the sheets of an app) and
// icons.svg. No DOM access: the catalogue page, rules.js and the tests of each app import it.

export const LAYERS = ['tokens', 'base', 'components', 'layouts', 'screens'];

const TAGS = ['component', 'extends', 'summary', 'scope', 'part', 'variant', 'state', 'example'];
const EXTENDS_TAGS = ['extends', 'part', 'variant', 'state', 'example'];

const SCALES = [
  ['--space-', 'space'],
  ['--text-', 'text'],
  ['--weight-', 'weight'],
  ['--radius-', 'radius'],
  ['--shadow-', 'shadow'],
  ['--motion', 'motion'],
  ['--font', 'font'],
  ['--tap', 'size'],
  ['--icon', 'size'],
  ['--nav-', 'size'],
  ['--rail-', 'size'],
  ['--side-', 'size'],
  ['--content-', 'size'],
  ['--pane-', 'size'],
  ['--arrow', 'size'],
  ['--art-', 'size'],
];

const lineAt = (text, index) => text.slice(0, index).split('\n').length;

// The comments of `css`, and `css` with each comment blanked out, so that indexes and lines stay.
const splitComments = (css) => {
  const comments = [];
  const code = css.replace(/\/\*[\s\S]*?\*\//g, (text, index) => {
    comments.push({ text, line: lineAt(css, index) });
    return text.replace(/[^\n]/g, ' ');
  });
  return { code, comments };
};

const closing = (code, open) => {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    if (code[i] === '}' && --depth === 0) return i;
  }
  return code.length;
};

const declarationsOf = (code, start, end) => {
  const declarations = [];
  let from = start;
  for (const part of code.slice(start, end).split(';')) {
    const colon = part.indexOf(':');
    if (colon !== -1 && part.trim()) {
      const lead = part.length - part.trimStart().length;
      declarations.push({
        property: part.slice(0, colon).trim(),
        value: part.slice(colon + 1).trim().replace(/\s+/g, ' '),
        line: lineAt(code, from + lead),
      });
    }
    from += part.length + 1;
  }
  return declarations;
};

export const rulesOf = (css) => {
  const { code } = splitComments(css);
  const rules = [];
  const walk = (start, end, layer, keyframe) => {
    let i = start;
    while (i < end) {
      const open = code.indexOf('{', i);
      const semi = code.indexOf(';', i);
      if (open === -1 || open >= end) return;
      if (semi !== -1 && semi < open) {
        i = semi + 1;
        continue;
      }
      const close = closing(code, open);
      const prelude = code.slice(i, open).trim().replace(/\s+/g, ' ');
      if (prelude.startsWith('@layer')) walk(open + 1, close, prelude.slice(6).trim(), false);
      else if (prelude.startsWith('@keyframes')) walk(open + 1, close, layer, true);
      else if (prelude.startsWith('@')) walk(open + 1, close, layer, keyframe);
      else {
        const at = i + code.slice(i, open).search(/\S/);
        rules.push({ layer, selector: prelude, line: lineAt(code, at), keyframe, declarations: declarationsOf(code, open + 1, close) });
      }
      i = close + 1;
    }
  };
  walk(0, code.length, null, false);
  return rules;
};

const parseBlock = ({ text, line }) => {
  const entries = [];
  for (const raw of text.slice(2, -2).split('\n')) {
    const row = raw.trim().replace(/^\*\s?/, '');
    const tag = row.match(/^@(\w+)\s*(.*)$/);
    if (tag) entries.push({ tag: tag[1], text: tag[2].trim() });
    else if (row && entries.length) entries.at(-1).text += ` ${row}`;
  }
  const name = entries[0].text;
  const named = (tag) =>
    entries.filter((entry) => entry.tag === tag).map((entry) => {
      const [first, ...rest] = entry.text.split(/\s+/);
      return { name: first, text: rest.join(' ') };
    });
  const one = (tag) => entries.find((entry) => entry.tag === tag)?.text ?? '';
  const extension = entries[0].tag === 'extends';
  const unknown = (known) => entries.filter((entry) => !known.includes(entry.tag)).map((entry) => `${name}: unknown tag @${entry.tag}`);
  const errors = extension ? unknown(EXTENDS_TAGS) : [
    ...unknown(TAGS),
    ...(one('summary') ? [] : [`${name}: no @summary`]),
    ...(entries.some((entry) => entry.tag === 'example') ? [] : [`${name}: no @example`]),
  ];
  return {
    name,
    extension,
    line,
    summary: one('summary'),
    scope: one('scope') || null,
    parts: named('part'),
    variants: named('variant'),
    states: named('state'),
    examples: entries.filter((entry) => entry.tag === 'example').map((entry) => entry.text),
    errors,
  };
};

export const blocksOf = (css) =>
  splitComments(css).comments.filter(({ text }) => /^\/\*\s*@(component|extends)\b/.test(text)).map(parseBlock);

const scaleOf = (name) => SCALES.find(([prefix]) => name.startsWith(prefix))?.[1] ?? 'colour';

// `css` is one string or an array of strings, read in order.
export const parseCatalog = ({ css: source, sprite }) => {
  const css = Array.isArray(source) ? source.join('\n') : source;
  const rules = rulesOf(css);
  const { comments } = splitComments(css);
  const notes = new Map(comments.map(({ text, line }) => [line, text.slice(2, -2).trim()]));
  const tokens = rules
    .filter((rule) => rule.layer === 'tokens' && rule.selector === ':root')
    .flatMap((rule) => rule.declarations)
    .filter((declaration) => declaration.property.startsWith('--'))
    .map(({ property, value, line }) => ({ name: property, value, note: notes.get(line) ?? '', scale: scaleOf(property) }));
  const all = blocksOf(css);
  const blocks = all.filter((block) => !block.extension);
  // The first line of each sheet in the joined text, to tell the sheet of a block.
  const starts = [1];
  for (const text of (Array.isArray(source) ? source : [source]).slice(0, -1)) starts.push(starts.at(-1) + text.split('\n').length);
  const components = blocks.map((block) => ({ ...block, sheet: starts.filter((start) => start <= block.line).length - 1, layer: rules.find((rule) => rule.line > block.line)?.layer ?? null }));
  const unknown = [];
  for (const extension of all.filter((block) => block.extension)) {
    const target = components.find(({ name }) => name === extension.name);
    if (!target) unknown.push(`${extension.name}: @extends of an unknown component`);
    else {
      for (const key of ['parts', 'variants', 'states']) {
        const names = new Set(target[key].map(({ name }) => name));
        target[key] = [...target[key], ...extension[key].filter(({ name }) => !names.has(name))];
      }
      target.examples = [...target.examples, ...extension.examples];
    }
  }
  const seen = new Set();
  const twice = blocks.filter(({ name }) => seen.has(name) || !seen.add(name)).map(({ name }) => `${name}: documented twice`);
  const icons = [...sprite.matchAll(/<symbol\b[^>]*\bid="([^"]+)"/g)].map(([, id]) => id);
  return { tokens, components, icons, errors: [...all.flatMap((block) => block.errors), ...twice, ...unknown] };
};

export const classesOf = (html) =>
  [...html.matchAll(/\bclass="([^"]*)"/g)].flatMap(([, value]) => value.split(/\s+/).filter(Boolean));

export const iconsOf = (html) => [...html.matchAll(/<use\b[^>]*\bhref="[^"#]*#([^"]+)"/g)].map(([, id]) => id);

// The end of the expression that starts at `start`: a comma or a closing bracket at depth 0.
const expressionEnd = (js, start) => {
  let depth = 0;
  for (let i = start; i < js.length; i += 1) {
    const char = js[i];
    if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) {
      if (depth === 0) return i;
      depth -= 1;
    } else if (char === ',' && depth === 0) return i;
  }
  return js.length;
};

// The words of the string literals of `text`, except a literal that a comparison uses.
const literals = (text) =>
  [...text.matchAll(/'([^'\n]*)'/g)]
    .filter((match) => !/[=!]==?\s*$/.test(text.slice(0, match.index)))
    .flatMap(([, value]) => value.split(/\s+/).filter((word) => /^[a-z][a-z0-9-]*$/.test(word)));

export const classesInScript = (js) => [...new Set([
  ...[...js.matchAll(/\b(?:className|variant):\s*/g)].flatMap((match) => {
    const start = match.index + match[0].length;
    return literals(js.slice(start, expressionEnd(js, start)));
  }),
  ...[...js.matchAll(/classList\.(?:add|remove|toggle)\(([^)]*)\)/g)].flatMap(([, args]) => literals(args.split(',')[0])),
])];

// The menu of the catalogue page: its fixed sections, then one section for each layer and each
// screen scope that has a part, with the names of the parts in catalogue order, then the app
// screens of shots/index.json when there are any.
export const menuOf = ({ components }, apps = []) => {
  const of = (test) => components.filter(test).map((part) => part.name);
  const layers = [
    ['components', 'Components'],
    ['layouts', 'Layouts'],
    ['base', 'Base'],
  ].map(([id, title]) => ({ id, title, items: of((part) => part.layer === id) }));
  const scopes = [...new Set(components.filter((part) => part.layer === 'screens').map((part) => part.scope))];
  return [
    { id: 'colours', title: 'Colours', items: [] },
    { id: 'scales', title: 'Scales', items: [] },
    { id: 'icons', title: 'Icons', items: [] },
    ...layers.filter((section) => section.items.length),
    ...scopes.map((scope) => ({ id: `screens-${scope}`, title: `Screen parts · ${scope}`, items: of((part) => part.layer === 'screens' && part.scope === scope) })),
    ...(apps.length ? [{ id: 'apps', title: 'App screens', items: apps.map((app) => app.name) }] : []),
  ];
};
