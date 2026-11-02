import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { RULES } from '../vendor/design-system/rules.js';
import { parseCatalog } from '../vendor/design-system/catalog.js';

// The rules of the design system (docs/spec/04-design-system.md) over the files of the app.
const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const optional = (path) => (existsSync(new URL(path, root)) ? read(path) : '');

const files = {
  css: [read('vendor/design-system/design-system.css'), read('styles.css')],
  html: read('index.html'),
  scripts: readdirSync(new URL('src/ui/', root)).map((file) => [file, read(`src/ui/${file}`)]),
  sprite: optional('icons.svg'),
  page: optional('designs/page.js'),
  pageHtml: optional('designs/index.html'),
};

test('the rules read the shared stylesheet and styles.css', () => {
  // LAY-4 reads the body rule of the app only when there are two sheets.
  assert.equal(files.css.length, 2);
});

test('the design system has rules to run', () => {
  assert.ok(RULES.length > 0);
});

for (const rule of RULES) test(rule.title, () => assert.deepEqual(rule.check(files), []));

test('the parts of the app are documented in styles.css (DSV-3)', () => {
  const names = parseCatalog({ css: read('styles.css'), sprite: files.sprite }).components.map((part) => part.name);
  for (const name of ['version-status', 'settings', 'about', 'dust', 'onboarding', 'onboarding-art']) assert.ok(names.includes(name), name);
});

test('styles.css has one version of a shared component, list-group in settings (DSV-3)', () => {
  assert.deepEqual([...read('styles.css').matchAll(/\/\*\s*@extends\s+([\w-]+)/g)].map(([, name]) => name), ['list-group']);
});
