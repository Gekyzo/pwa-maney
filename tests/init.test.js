import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../scripts/init.mjs';

// Files that may name the template after init: the init script and its test.
const ALLOWED = ['scripts/init.mjs', 'tests/init.test.js'];
const root = fileURLToPath(new URL('../', import.meta.url));
// Inside a copy that init already ran on, the slug is not the template one: skip, no recursion.
const isTemplate = readFileSync(join(root, 'src/config.js'), 'utf8').includes("'pwa-template'");

const copy = () => {
  const dir = mkdtempSync(join(tmpdir(), 'pwa-init-'));
  cpSync(root, dir, { recursive: true, filter: (src) => !/[/\\](\.git|node_modules|\.superpowers)([/\\]|$)/.test(src.slice(root.length - 1)) });
  return dir;
};

const run = (dir, ...args) => spawnSync(process.execPath, ['scripts/init.mjs', ...args], { cwd: dir, encoding: 'utf8' });

const files = (dir) =>
  readdirSync(dir, { recursive: true })
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => !/^(\.git|node_modules|icons)(\/|$)/.test(file) && /\.(js|mjs|json|webmanifest|html|css|md|yml)$/.test(file));

test('parseArgs reads the slug, the name and the options', () => {
  assert.deepEqual(parseArgs(['gym-log', 'Gym Log', '--short', 'Gym', '--theme', '#123abc']), {
    slug: 'gym-log',
    name: 'Gym Log',
    short: 'Gym',
    theme: '#123abc',
  });
  assert.deepEqual(parseArgs(['a', 'A']), { slug: 'a', name: 'A', short: 'A', theme: null });
});

test('parseArgs refuses a bad slug, a missing name, a bad colour and a name that breaks a literal', () => {
  const bad = [[], ['Gym', 'Gym'], ['1gym', 'G'], ['gym_log', 'G'], ['gym'], ['gym', 'G', '--theme', 'red'], ['gym', "Gym's"], ['gym', 'A<b>'], ['gym', '   ']];
  for (const argv of bad) assert.throws(() => parseArgs(argv), /usage|slug|name|theme/i, JSON.stringify(argv));
});

test('init renames the app, resets the version and leaves no trace of the template', { skip: !isTemplate }, () => {
  const dir = copy();
  try {
    const result = run(dir, 'gym-log', 'Gym Log', '--short', 'Gym', '--theme', '#123abc');
    assert.equal(result.status, 0, result.stderr);
    const read = (path) => readFileSync(join(dir, path), 'utf8');
    assert.match(read('src/config.js'), /APP_SLUG = 'gym-log'/);
    // The template may be past v1; a new app has no old cache, so it starts again at v1.
    assert.match(read('sw.js'), /const CACHE = 'gym-log-shell-v1'/);
    assert.doesNotMatch(read('docs/spec/02-offline-version.md'), /gym-log-shell-v(?!1\b)/);
    assert.match(read('sw.js'), /const MANIFEST = 'gym-log-manifest'/);
    const manifest = JSON.parse(read('manifest.webmanifest'));
    assert.deepEqual([manifest.name, manifest.short_name, manifest.theme_color], ['Gym Log', 'Gym', '#123abc']);
    assert.equal(JSON.parse(read('package.json')).name, 'gym-log');
    assert.equal(JSON.parse(read('version.json')).version, '0.1.0');
    assert.match(read('index.html'), /<title>Gym Log<\/title>/);
    assert.match(read('index.html'), /name="theme-color" content="#123abc" media="\(prefers-color-scheme: light\)"/);
    assert.match(read('README.md'), /^# Gym Log\n/);
    assert.match(read('CHANGELOG.md'), /## Unreleased\n\nNo change\.\n$/);
    assert.match(read('docs/spec/02-offline-version.md'), /gym-log-shell-v1/);
    assert.equal(existsSync(join(dir, 'docs/superpowers')), false);
    assert.equal(existsSync(join(dir, 'scripts/init.mjs')), true);
    // The copy of the design system is not the app's to rename: init keeps it byte for byte.
    const vendor = readdirSync(join(root, 'vendor/design-system'));
    assert.ok(vendor.includes('SOURCE.json'));
    for (const file of vendor) assert.equal(read(`vendor/design-system/${file}`), readFileSync(join(root, 'vendor/design-system', file), 'utf8'), file);
    const leftovers = files(dir).filter((file) => /pwa-template|PWA Template/.test(read(file)) && !ALLOWED.includes(file));
    assert.deepEqual(leftovers, []);
    execFileSync('npm', ['test'], { cwd: dir, stdio: 'pipe' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('init refuses to run a second time and changes nothing', { skip: !isTemplate }, () => {
  const dir = copy();
  try {
    assert.equal(run(dir, 'gym-log', 'Gym Log').status, 0);
    const before = readFileSync(join(dir, 'src/config.js'), 'utf8');
    const second = run(dir, 'other', 'Other');
    assert.equal(second.status, 1);
    assert.match(second.stderr, /already/i);
    assert.equal(readFileSync(join(dir, 'src/config.js'), 'utf8'), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('init puts a name with $ patterns in as typed', { skip: !isTemplate }, () => {
  const dir = copy();
  try {
    const result = run(dir, 'cash-app', 'Save $$ now');
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.webmanifest'), 'utf8'));
    assert.equal(manifest.name, 'Save $$ now');
    assert.match(readFileSync(join(dir, 'index.html'), 'utf8'), /<title>Save \$\$ now<\/title>/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
