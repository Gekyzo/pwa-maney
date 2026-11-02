#!/usr/bin/env node
// Turns a copy of the template into a new app: `npm run init -- <slug> "<Name>" [--short <short>] [--theme <#hex>]`.
import { readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_SLUG = 'pwa-template';
const TEMPLATE_NAME = 'PWA Template';
const SLUG = /^[a-z][a-z0-9-]*$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
// A name goes as typed into HTML, JSON and JS string literals: these characters would break one.
const UNSAFE = /[<>&'"`\\]/;
const USAGE = 'usage: npm run init -- <slug> "<Name>" [--short <short>] [--theme <#hex>]';
const TEXT = /\.(js|mjs|json|webmanifest|html|css|md|yml)$/;
// vendor/ is a copy of another repository, checked by its hashes: it goes over as it is.
const SKIP = /^(\.git|node_modules|\.superpowers|docs\/superpowers|vendor)(\/|$)/;
// They name the template on purpose: to find it, and to test it.
const OWN = ['scripts/init.mjs', 'tests/init.test.js'];

const checkName = (label, value) => {
  if (!value.trim()) throw new Error(`${label} is empty. ${USAGE}`);
  if (UNSAFE.test(value)) throw new Error(`${label} must not contain < > & quotes or a backslash: ${value}`);
  return value.trim();
};

export const parseArgs = (argv) => {
  const positional = [];
  const options = { short: null, theme: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--short' || arg === '--theme') {
      options[arg.slice(2)] = argv[i + 1] ?? null;
      i += 1;
    } else positional.push(arg);
  }
  const [slug, name] = positional;
  if (!slug || name === undefined) throw new Error(USAGE);
  if (!SLUG.test(slug)) throw new Error(`slug must match ${SLUG}: ${slug}`);
  const clean = checkName('name', name);
  const short = options.short === null ? clean : checkName('short name', options.short);
  if (options.theme !== null && !HEX.test(options.theme)) throw new Error(`theme must be #rrggbb: ${options.theme}`);
  return { slug, name: clean, short, theme: options.theme };
};

const textFiles = (root) =>
  readdirSync(root, { recursive: true })
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => TEXT.test(file) && !SKIP.test(file) && !OWN.includes(file));

const json = (text, edit) => `${JSON.stringify(edit(JSON.parse(text)), null, 2)}\n`;

// The edits of one file that a plain rename does not cover.
const EDITS = {
  'package.json': (text) => json(text, (pkg) => ({ ...pkg, version: '0.1.0' })),
  'version.json': (text, { now }) => json(text, () => ({ version: '0.1.0', date: now.toISOString() })),
  'manifest.webmanifest': (text, { short, theme }) =>
    json(text, (manifest) => ({ ...manifest, short_name: short, ...(theme ? { theme_color: theme } : {}) })),
  'index.html': (text, { theme }) =>
    theme ? text.replace(/(<meta name="theme-color" content=")[^"]+(" media="\(prefers-color-scheme: light\)">)/, `$1${theme}$2`) : text,
  'CHANGELOG.md': () => '# Changelog\n\nUser-visible changes, newest first.\n\n## Unreleased\n\nNo change.\n',
};

export const initApp = (root, { slug, name, short, theme }, now = new Date()) => {
  const config = readFileSync(join(root, 'src/config.js'), 'utf8');
  if (!config.includes(`'${TEMPLATE_SLUG}'`)) throw new Error('init: this app was already initialised (src/config.js has no template slug)');
  // The cache starts again at v1, then every literal of the template takes the new names.
  const rename = (text) =>
    text
      .replace(/pwa-template-shell-v\d+/g, () => `${slug}-shell-v1`)
      // A function, so that `$&` or `$$` in a name goes in as typed and not as a pattern.
      .replaceAll(TEMPLATE_SLUG, () => slug)
      .replaceAll(TEMPLATE_NAME, () => name);
  const writes = textFiles(root).map((file) => {
    const before = readFileSync(join(root, file), 'utf8');
    const edit = EDITS[file] ?? ((text) => text);
    return [file, before, edit(rename(before), { short, theme, now })];
  });
  // Every file is read and changed in memory before the first write, so an error leaves the copy as it was.
  for (const [file, before, after] of writes) if (after !== before) writeFileSync(join(root, file), after);
  rmSync(join(root, 'docs/superpowers'), { recursive: true, force: true });
};

const NEXT_STEPS = `Next:
  1. Replace icons/source.png, then npm run icons
  2. Replace or delete the notes demo (docs/spec/07-notes.md lists its files)
  3. git init -b main && npm run hooks
  4. Create the GitHub repo; set Pages source to "GitHub Actions"
  5. npm test`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const options = parseArgs(process.argv.slice(2));
    initApp(fileURLToPath(new URL('../', import.meta.url)), options);
    console.log(`Initialised ${options.name} (${options.slug}).\n${NEXT_STEPS}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
