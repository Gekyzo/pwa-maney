import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// The layer rules of docs/spec/12-engineering.md that the module table does not check (ENG-16).
const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const modules = readdirSync(new URL('src/', root), { recursive: true })
  .filter((file) => file.endsWith('.js'))
  .map((file) => file.slice(0, -'.js'.length).replaceAll('\\', '/'));
const views = modules.filter((name) => name.startsWith('ui/'));
const importsOf = (name) => [...read(`src/${name}.js`).matchAll(/from '#([\w/]+)'/g)].map(([, module]) => module);

// The values that a module shares through a live binding. Only their owner assigns them.
const OWNED = {
  'ui/context': ['chosen', 'lang', 't', 'hand', 'theme', 'off', 'navMotion', 'state', 'toastAction', 'clickGuardUntil'],
  'ui/drag': ['reorder'],
};

test('the views exist', () => {
  assert.ok(views.includes('ui/context'));
});

test('no module imports app', () => {
  assert.deepEqual(modules.filter((name) => importsOf(name).includes('app')), []);
});

test('a pure module imports no view', () => {
  const pure = modules.filter((name) => name !== 'app' && !name.startsWith('ui/'));
  assert.deepEqual(pure.filter((name) => importsOf(name).some((module) => module.startsWith('ui/'))), []);
});

test('the imports among the views have no cycle', () => {
  const marks = new Map();
  const visit = (name, path) => {
    if (marks.get(name) === 'done') return null;
    if (marks.get(name) === 'open') return [...path, name];
    marks.set(name, 'open');
    for (const next of importsOf(name).filter((module) => module.startsWith('ui/'))) {
      const cycle = visit(next, [...path, name]);
      if (cycle) return cycle;
    }
    marks.set(name, 'done');
    return null;
  };
  for (const name of views) assert.equal(visit(name, []), null);
});

test('only the owner assigns a shared value', () => {
  for (const [owner, names] of Object.entries(OWNED)) {
    const assignment = new RegExp(`^\\s*(?:${names.join('|')})\\s*=(?!=)`, 'm');
    // A pure module has its own locals, such as `state`; the rule is about the screen code.
    const screen = modules.filter((module) => module !== owner && (module === 'app' || module.startsWith('ui/')));
    for (const name of screen) assert.doesNotMatch(read(`src/${name}.js`), assignment, name);
  }
});

test('SHELL of sw.js has each module of src', () => {
  const shell = [...read('sw.js').matchAll(/'\.\/src\/([\w/]+)\.js'/g)].map(([, name]) => name);
  assert.deepEqual(modules.filter((name) => !shell.includes(name)), []);
});

test('SHELL of sw.js has the style sheet and the icons', () => {
  const shell = read('sw.js');
  for (const file of ['./styles.css', './icons.svg']) assert.ok(shell.includes(`'${file}'`), file);
});
