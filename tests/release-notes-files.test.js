import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { LANGUAGES } from '#i18n';
import { parseNotes } from '#whatsnew';

// Each language of the screen has its release notes, and no version misses a language.
const dir = new URL('../release-notes/', import.meta.url);
const read = (lang) => readFileSync(new URL(`${lang}.md`, dir), 'utf8');

test('release-notes has one file for each language and no other file', () => {
  assert.deepEqual(readdirSync(dir).sort(), LANGUAGES.map((lang) => `${lang}.md`).sort());
});

test('each release-notes file has the same released versions in the same order', () => {
  const versions = (lang) => parseNotes(read(lang)).map(({ version }) => version);
  for (const lang of LANGUAGES) assert.deepEqual(versions(lang), versions('en'), lang);
});
