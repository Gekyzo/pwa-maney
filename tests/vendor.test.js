import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

// The copy of pwa-design-system in vendor/design-system/, written by `npm run ds` (DSV-1 to DSV-3).
const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const VENDOR = 'vendor/design-system/';
const vendored = existsSync(new URL(`${VENDOR}SOURCE.json`, root));
const source = vendored ? JSON.parse(read(`${VENDOR}SOURCE.json`)) : { files: {} };
const listing = existsSync(new URL(VENDOR, root)) ? readdirSync(new URL(VENDOR, root)).sort() : [];
const sheets = listing.filter((file) => file.endsWith('.css'));
// The vendored files that the page loads: the stylesheets and the modules of the import map.
const loaded = ['design-system.css', 'sheet.js'];

test('vendor/design-system/ has SOURCE.json with the version, the commit and the files', () => {
  assert.ok(vendored, 'run npm run ds');
  assert.match(source.version ?? '', /^\d+\.\d+\.\d+$/);
  assert.match(source.commit ?? '', /^[0-9a-f]{40}$/);
  assert.deepEqual(Object.keys(source.files).sort(), ['catalog.js', 'design-system.css', 'geist.woff2', 'rules.js', 'sheet.js']);
});

test('vendor/design-system/ holds the files of SOURCE.json and SOURCE.json only', () => {
  assert.deepEqual(listing, [...Object.keys(source.files), 'SOURCE.json'].sort());
});

test('each vendored file has the sha256 of SOURCE.json', () => {
  for (const [file, hash] of Object.entries(source.files)) {
    const actual = createHash('sha256').update(readFileSync(new URL(`${VENDOR}${file}`, root))).digest('hex');
    assert.equal(actual, hash, `${VENDOR}${file} changed after npm run ds`);
  }
});

test('SHELL of sw.js has each vendored stylesheet', () => {
  const sw = read('sw.js');
  assert.ok(sheets.length > 0);
  for (const file of sheets) assert.ok(sw.includes(`'./${VENDOR}${file}'`), file);
});

test('SHELL of sw.js has each vendored file that the page loads', () => {
  const sw = read('sw.js');
  for (const file of loaded) assert.ok(sw.includes(`'./${VENDOR}${file}'`), file);
});

test('SHELL caches the font of the design system', () => {
  assert.ok(read('sw.js').includes(`'./${VENDOR}geist.woff2'`));
});

const stylesheets = (html, prefix) =>
  [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(([, href]) => href).filter((href) => href.startsWith(prefix)).map((href) => href.slice(prefix.length));

test('index.html links the shared stylesheet before styles.css', () => {
  assert.deepEqual(stylesheets(read('index.html'), './'), [`${VENDOR}design-system.css`, 'styles.css']);
});

test('designs/index.html links the shared stylesheet before styles.css', () => {
  assert.deepEqual(stylesheets(read('designs/index.html'), '../'), [`${VENDOR}design-system.css`, 'styles.css']);
});

// The comments of `css` that open a part: `@component name` or `@extends name` (an override).
const markersOf = (css) =>
  [...css.matchAll(/\/\*[\s\S]*?\*\//g)]
    .map(({ 0: text, index }) => ({ text, line: css.slice(0, index).split('\n').length }))
    .filter(({ text }) => /^\/\*\s*@(component|extends)\s/.test(text));

const own = (rule) => ['components', 'layouts'].includes(rule.layer) && !rule.keyframe;

test('a rule of styles.css with a shared selector follows an @extends block', async () => {
  const { rulesOf } = await import(`../${VENDOR}catalog.js`);
  const app = read('styles.css');
  const shared = new Set(rulesOf(read(`${VENDOR}design-system.css`)).filter(own).map((rule) => rule.selector));
  const markers = markersOf(app);
  const copies = rulesOf(app)
    .filter((rule) => own(rule) && shared.has(rule.selector))
    .filter((rule) => !/^\/\*\s*@extends\s/.test(markers.filter((marker) => marker.line < rule.line).at(-1)?.text ?? ''))
    .map((rule) => `${rule.line}: ${rule.selector}`);
  assert.deepEqual(copies, []);
});

test('an @extends block of styles.css names a shared component', async () => {
  const { parseCatalog } = await import(`../${VENDOR}catalog.js`);
  const names = new Set(parseCatalog({ css: read(`${VENDOR}design-system.css`), sprite: '' }).components.map((part) => part.name));
  const overrides = [...read('styles.css').matchAll(/\/\*\s*@extends\s+([\w-]+)/g)].map(([, name]) => name);
  assert.deepEqual(overrides.filter((name) => !names.has(name)), []);
});
