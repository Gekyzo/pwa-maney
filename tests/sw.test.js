import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { LANGUAGES } from '#i18n';

// sw.js is a classic script: run it with a stub `self` and return its pure functions.
const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const { localizeManifest, SHELL } = vm.runInNewContext(`${source}\n;({ localizeManifest, SHELL })`, {
  self: { addEventListener: () => {} },
});

// An object of the vm realm has another Object.prototype: compare a plain copy.
const plain = (value) => JSON.parse(JSON.stringify(value));

const build = () => ({
  name: 'Maney',
  short_name: 'Maney',
  description: 'Plantilla',
  lang: 'es',
  id: './',
  icons: [{ src: 'icons/icon-192.png' }],
});

test('localizeManifest takes the language, the name and the description of the text', () => {
  const manifest = localizeManifest(build(), { lang: 'en', name: 'Template app', description: 'Template' });
  assert.equal(manifest.lang, 'en');
  assert.equal(manifest.name, 'Template app');
  assert.equal(manifest.description, 'Template');
});

test('localizeManifest keeps the short name and the other members', () => {
  const manifest = localizeManifest(build(), { lang: 'en', name: 'Template app', description: 'Template' });
  assert.equal(manifest.short_name, 'Maney');
  assert.equal(manifest.id, './');
  assert.deepEqual(manifest.icons, build().icons);
});

test('localizeManifest with no text returns the manifest as it is', () => {
  assert.deepEqual(plain(localizeManifest(build(), null)), build());
});

test('localizeManifest ignores a member of the text that is not a non-empty string', () => {
  const manifest = localizeManifest(build(), { lang: 'en', name: '', description: 42, short_name: 'Other' });
  assert.equal(manifest.lang, 'en');
  assert.equal(manifest.name, build().name);
  assert.equal(manifest.description, build().description);
  assert.equal(manifest.short_name, 'Maney');
});

test('localizeManifest does not change its input', () => {
  const input = build();
  localizeManifest(input, { lang: 'en', name: 'Template app', description: 'Template' });
  assert.deepEqual(input, build());
});

test('SHELL has the release notes of each language, so they show offline (VER-21)', () => {
  for (const lang of LANGUAGES) assert.ok(SHELL.includes(`./release-notes/${lang}.md`), lang);
});
