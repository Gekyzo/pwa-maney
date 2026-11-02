import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// scripts/release.mjs runs git, so each test runs it in a new repository with the files that a
// release reads and writes.
const root = new URL('../', import.meta.url).pathname;
const FILES = ['package.json', 'src/version.js', 'src/whatsnew.js', 'scripts/bump-version.mjs', 'scripts/changelog.mjs', 'scripts/release.mjs'];
const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
};

// A release-notes file whose Unreleased holds `unreleased`.
const writeNotes = (dir, lang, unreleased) =>
  writeFileSync(join(dir, 'release-notes', `${lang}.md`), `# Release notes\n\n## Unreleased\n\n${unreleased}\n\n## 1.0.9 - 2026-10-13\n\n- Old.\n`);

const repo = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'release-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const file of FILES) cpSync(join(root, file), join(dir, file));
  // The version of the copy, not of the app, so that the test does not change at each release.
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ ...pkg, version: '1.0.9' }, null, 2)}\n`);
  writeFileSync(join(dir, 'version.json'), '{\n  "version": "1.0.9",\n  "date": "2026-10-13T21:36:06.766Z"\n}\n');
  writeFileSync(join(dir, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n\n### Added\n\n- A menu.\n\n## 1.0.9 - 2026-10-13\n\nOld.\n');
  mkdirSync(join(dir, 'release-notes'));
  writeNotes(dir, 'en', '- A menu.');
  writeNotes(dir, 'es', '- Un menú.');
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: ENV, encoding: 'utf8' }).trim();
  git('init', '--quiet', '--initial-branch=main');
  git('add', '.');
  git('commit', '--quiet', '-m', 'Start');
  const release = (...args) => spawnSync('node', ['scripts/release.mjs', ...args], { cwd: dir, env: ENV, encoding: 'utf8' });
  return { dir, git, release };
};

test('release bumps the patch, commits the bump and tags it', (t) => {
  const { dir, git, release } = repo(t);
  const run = release();
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /v1\.0\.10/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'version.json'), 'utf8')).version, '1.0.10');
  assert.equal(git('log', '-1', '--format=%s'), 'Bump version to 1.0.10');
  assert.deepEqual(git('show', '--name-only', '--format=', 'HEAD').split('\n').sort(), [
    'CHANGELOG.md',
    'package.json',
    'release-notes/en.md',
    'release-notes/es.md',
    'version.json',
  ]);
  assert.equal(git('rev-parse', 'v1.0.10^{commit}'), git('rev-parse', 'HEAD'));
  // An annotated tag, so that `git push --follow-tags` sends it.
  assert.equal(git('cat-file', '-t', 'v1.0.10'), 'tag');
  assert.match(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'), /## 1\.0\.10 - \d{4}-\d{2}-\d{2}\n\n### Added\n\n- A menu\./);
  const notes = readFileSync(join(dir, 'release-notes', 'es.md'), 'utf8');
  assert.match(notes, /## Unreleased\n\nNo change\.\n\n## 1\.0\.10 - \d{4}-\d{2}-\d{2}\n\n- Un menú\./);
});

test('release refuses release notes whose languages disagree on Unreleased and writes nothing', (t) => {
  const { dir, git, release } = repo(t);
  writeNotes(dir, 'es', 'No change.');
  git('commit', '--quiet', '-am', 'Notes in English only');
  const run = release();
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /release notes/);
  assert.match(run.stderr, /es/);
  assert.equal(git('log', '-1', '--format=%s'), 'Notes in English only');
  assert.equal(git('tag'), '');
  assert.equal(git('status', '--porcelain'), '');
});

test('release accepts release notes with no change in any language', (t) => {
  const { dir, git, release } = repo(t);
  writeNotes(dir, 'en', 'No change.');
  writeNotes(dir, 'es', 'No change.');
  git('commit', '--quiet', '-am', 'No user change');
  assert.equal(release().status, 0);
  assert.doesNotMatch(readFileSync(join(dir, 'release-notes', 'en.md'), 'utf8'), /## 1\.0\.10/);
});

test('release takes a minor or a major step', (t) => {
  const { git, release } = repo(t);
  assert.equal(release('minor').status, 0);
  assert.equal(git('describe', '--tags'), 'v1.1.0');
});

test('release refuses an unknown level and changes nothing', (t) => {
  const { git, release } = repo(t);
  const run = release('huge');
  assert.notEqual(run.status, 0);
  assert.equal(git('log', '-1', '--format=%s'), 'Start');
  assert.equal(git('status', '--porcelain'), '');
});

test('release refuses a branch that is not main', (t) => {
  const { git, release } = repo(t);
  git('switch', '--quiet', '-c', 'feature');
  const run = release();
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /main/);
  assert.equal(git('tag'), '');
});

test('release refuses a working tree with changes', (t) => {
  const { dir, git, release } = repo(t);
  writeFileSync(join(dir, 'CHANGELOG.md'), 'changed\n');
  const run = release();
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /changes/);
  assert.equal(git('log', '-1', '--format=%s'), 'Start');
  assert.equal(git('tag'), '');
});

test('release refuses a version whose tag exists', (t) => {
  const { git, release } = repo(t);
  git('tag', 'v1.0.10');
  const run = release();
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /v1\.0\.10/);
  assert.equal(git('log', '-1', '--format=%s'), 'Start');
  assert.equal(git('status', '--porcelain'), '');
});

// A remote with the start commit, as `origin` of the repository of the test.
const withOrigin = (t, { dir, git }) => {
  const remote = mkdtempSync(join(tmpdir(), 'release-origin-'));
  t.after(() => rmSync(remote, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main', remote], { env: ENV });
  git('remote', 'add', 'origin', remote);
  git('push', '--quiet', 'origin', 'main');
  return remote;
};

test('release refuses a main that is behind origin and writes nothing', (t) => {
  const repository = repo(t);
  const { git, release } = repository;
  const remote = withOrigin(t, repository);
  // Another clone pushes a commit, as the app does when it commits ROADMAP.md.
  const other = mkdtempSync(join(tmpdir(), 'release-other-'));
  t.after(() => rmSync(other, { recursive: true, force: true }));
  execFileSync('git', ['clone', '--quiet', remote, other], { env: ENV });
  writeFileSync(join(other, 'ROADMAP.md'), '# Roadmap\n');
  execFileSync('git', ['add', '.'], { cwd: other, env: ENV });
  execFileSync('git', ['commit', '--quiet', '-m', 'Add roadmap item'], { cwd: other, env: ENV });
  execFileSync('git', ['push', '--quiet', 'origin', 'main'], { cwd: other, env: ENV });
  const run = release();
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /behind origin\/main/);
  assert.match(run.stderr, /git pull --rebase/);
  assert.equal(git('log', '-1', '--format=%s'), 'Start');
  assert.equal(git('tag'), '');
  assert.equal(git('status', '--porcelain'), '');
});

test('release accepts a main that is ahead of origin', (t) => {
  const repository = repo(t);
  const { dir, git, release } = repository;
  withOrigin(t, repository);
  writeFileSync(join(dir, 'ROADMAP.md'), '# Roadmap\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'Add a roadmap');
  const run = release();
  assert.equal(run.status, 0, run.stderr);
  assert.equal(git('rev-parse', 'v1.0.10^{commit}'), git('rev-parse', 'HEAD'));
});

test('release refuses an origin that it cannot fetch and writes nothing', (t) => {
  const { git, release } = repo(t);
  git('remote', 'add', 'origin', join(tmpdir(), 'release-no-such-remote'));
  const run = release();
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /fetch origin/);
  assert.equal(git('log', '-1', '--format=%s'), 'Start');
  assert.equal(git('tag'), '');
});

test('release refuses release notes whose languages do not have the same versions and writes nothing', (t) => {
  const { dir, git, release } = repo(t);
  writeFileSync(join(dir, 'release-notes', 'es.md'), '# Notas\n\n## Unreleased\n\n- Un menú.\n');
  git('commit', '--quiet', '-am', 'Spanish notes miss 1.0.9');
  const run = release();
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /release notes/);
  assert.match(run.stderr, /es/);
  assert.equal(git('log', '-1', '--format=%s'), 'Spanish notes miss 1.0.9');
  assert.equal(git('tag'), '');
  assert.equal(git('status', '--porcelain'), '');
});
