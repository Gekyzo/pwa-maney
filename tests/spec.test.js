import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { APP_SLUG } from '#config';
import { NOTES_KEY } from '#notes';
import { LANGUAGE_KEY, HAND_KEY, THEME_KEY, MODULES_KEY, ONBOARDED_KEY } from '#storage';
import { CATALOGS, FALLBACK, LANGUAGES } from '#i18n';

// The facts of docs/spec/ that the code can prove. A rule of behaviour has no check here.
const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const list = (dir, end) => readdirSync(new URL(dir, root)).filter((file) => file.endsWith(end)).sort();

const files = list('docs/spec/', '.md');
const docs = Object.fromEntries(files.map((file) => [file, read(`docs/spec/${file}`)]));
const all = Object.values(docs).join('\n');

// The text from a `## title` heading to the next heading of that level.
const section = (file, title) => {
  const [, after = ''] = docs[file].split(`\n## ${title}\n`);
  return after.split('\n## ')[0];
};

// A rule is defined as `**LIST-7**`, and named in a text as `LIST-7`.
const defined = [...all.matchAll(/\*\*([A-Z][A-Z0-9]*-\d+)\*\*/g)].map(([, id]) => id);
const prefixOf = (id) => id.split('-')[0];

test('the specification has rules', () => {
  assert.ok(defined.length > 0);
});

test('each rule identifier is defined one time', () => {
  const twice = defined.filter((id, index) => defined.indexOf(id) !== index);
  assert.deepEqual(twice, []);
});

test('each prefix of a rule is in the prefix table of the index, and each prefix of the table has a rule', () => {
  const table = [...section('README.md', 'Rule identifiers').matchAll(/`([A-Z][A-Z0-9]*)`/g)].map(([, prefix]) => prefix);
  assert.deepEqual([...new Set(table)].sort(), [...new Set(defined.map(prefixOf))].sort());
});

test('each rule that a text names is defined', () => {
  const prefixes = new Set(defined.map(prefixOf));
  const named = [...all.matchAll(/\b([A-Z][A-Z0-9]*-\d+)\b/g)].map(([, id]) => id).filter((id) => prefixes.has(prefixOf(id)));
  assert.deepEqual(named.filter((id) => !defined.includes(id)), []);
});

test('each link to a document of the specification has its file', () => {
  const links = [...all.matchAll(/\]\(([\w-]+\.md)\)/g)].map(([, file]) => file);
  assert.ok(links.length > 0);
  assert.deepEqual(links.filter((file) => !files.includes(file)), []);
});

test('the index lists each document', () => {
  const listed = [...section('README.md', 'Documents').matchAll(/\]\(([\w-]+\.md)\)/g)].map(([, file]) => file);
  assert.deepEqual(listed.sort(), files.filter((file) => file !== 'README.md'));
});

test('the specification has the storage keys and the names of the caches', () => {
  const [, cache] = read('sw.js').match(/const CACHE = '([^']+)'/);
  const [, manifest] = read('sw.js').match(/const MANIFEST = '([^']+)'/);
  for (const key of [NOTES_KEY, `${NOTES_KEY}.corrupt`]) assert.ok(docs['07-notes.md'].includes(`\`${key}\``), key);
  for (const key of [LANGUAGE_KEY, HAND_KEY, THEME_KEY, MODULES_KEY, ONBOARDED_KEY]) assert.ok(docs['01-engineering.md'].includes(`\`${key}\``), key);
  for (const name of [cache, manifest]) assert.ok(docs['02-offline-version.md'].includes(`\`${name}\``), name);
});

test('the cache prefix of sw.js is the slug of src/config.js', () => {
  const [, cache] = read('sw.js').match(/const CACHE = '([^']+)'/);
  const [, manifest] = read('sw.js').match(/const MANIFEST = '([^']+)'/);
  assert.match(cache, new RegExp(`^${APP_SLUG}-shell-v\\d+$`));
  assert.equal(manifest, `${APP_SLUG}-manifest`);
});

test('the language document has each language and the fallback', () => {
  const languages = docs['06-i18n.md'];
  const codes = [...section('06-i18n.md', 'Languages').matchAll(/\(`([a-z]{2})`/g)].map(([, code]) => code);
  assert.deepEqual(codes.sort(), [...LANGUAGES].sort());
  assert.ok(languages.includes(`\`${LANGUAGE_KEY}\``));
  assert.equal(FALLBACK, 'en');
});

test('each message key that the specification names is in the Spanish catalog', () => {
  const keys = [...all.matchAll(/`((?:error|toast)\.\w+)`/g)].map(([, key]) => key);
  assert.ok(keys.length > 0);
  assert.deepEqual(keys.filter((key) => !Object.hasOwn(CATALOGS.es, key)), []);
});

// The rows of the module table: `src/name.js`, its duty, the modules that it may import.
const moduleRows = section('01-engineering.md', 'Modules')
  .split('\n')
  .map((row) => row.match(/^\| `src\/([\w/-]+)\.js` \|[^|]*\| ([^|]*) \|$/))
  .filter(Boolean)
  .map(([, name, allowed]) => ({ name, allowed }));

test('the module table has each module of src', () => {
  const modules = readdirSync(new URL('src/', root), { recursive: true })
    .filter((file) => file.endsWith('.js') && !file.startsWith('locales'))
    .map((file) => file.slice(0, -'.js'.length).replaceAll('\\', '/'))
    .sort();
  assert.deepEqual(moduleRows.map(({ name }) => name).sort(), modules);
});

test('a module imports only the modules that the module table gives it', () => {
  for (const { name, allowed } of moduleRows) {
    if (allowed.includes('all of the above')) continue;
    const may = [...allowed.matchAll(/`([\w/*]+)`/g)].map(([, module]) => module);
    const imports = [...read(`src/${name}.js`).matchAll(/from '#([\w/]+)'/g)].map(([, module]) => module);
    const stray = imports.filter((module) => !may.includes(module) && !may.includes(module.replace(/\/\w+$/, '/*')));
    assert.deepEqual(stray, [], name);
  }
});

test('the test table has each test file', () => {
  const listed = [...section('01-engineering.md', 'Tests').matchAll(/`tests\/([\w-]+\.test\.js)`/g)].map(([, file]) => file);
  assert.deepEqual([...new Set(listed)].sort(), list('tests/', '.test.js'));
});
