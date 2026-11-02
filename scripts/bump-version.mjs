// Writes the version of the next deploy to version.json and prints it. package.json gets
// the same version, and the changes under `Unreleased` in CHANGELOG.md and in each
// release-notes/<lang>.md get the version and the date. Run by scripts/release.mjs, which
// commits the bump and tags it.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseVersion, nextVersion, LEVELS } from '#version';
import { releaseChangelog, localDate } from './changelog.mjs';

const file = new URL('../version.json', import.meta.url);
const manifest = new URL('../package.json', import.meta.url);
const changelog = new URL('../CHANGELOG.md', import.meta.url);
const notes = new URL('../release-notes/', import.meta.url);
const [level = 'patch'] = process.argv.slice(2);

if (!LEVELS.includes(level)) {
  console.error(`Unknown level "${level}". Use one of: ${LEVELS.join(', ')}.`);
  process.exit(1);
}

const read = () => {
  try {
    return parseVersion(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
};

const next = nextVersion(read(), new Date(), level);
writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
const data = JSON.parse(readFileSync(manifest, 'utf8'));
writeFileSync(manifest, `${JSON.stringify({ ...data, version: next.version }, null, 2)}\n`);

const release = { version: next.version, date: localDate(new Date(next.date)) };
const releaseFile = (url) => {
  try {
    const text = readFileSync(url, 'utf8');
    const released = releaseChangelog(text, release);
    if (released !== text) writeFileSync(url, released);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};

const noteFiles = () => {
  try {
    return readdirSync(notes).filter((file) => file.endsWith('.md'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

releaseFile(changelog);
for (const file of noteFiles()) releaseFile(new URL(file, notes));
console.log(next.version);
