import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseChangelog, hasUnreleased, localDate } from '../scripts/changelog.mjs';

const INTRO = '# Changelog\n\nThe changes of the app.\n\n';
const OLD = '## 1.0.8 - 2026-10-13\n\n### Changed\n\n- The icon of the app.\n';
const EMPTY = '## Unreleased\n\nNo change.\n\n';
const build = (unreleased) => `${INTRO}${unreleased}${OLD}`;
const release = { version: '1.0.9', date: '2026-10-14' };

test('releaseChangelog gives the version and the date to the changes of Unreleased', () => {
  const text = build('## Unreleased\n\n### Added\n\n- A field for the amount.\n\n');
  assert.equal(
    releaseChangelog(text, release),
    build(`${EMPTY}## 1.0.9 - 2026-10-14\n\n### Added\n\n- A field for the amount.\n\n`),
  );
});

test('releaseChangelog keeps a changelog whose Unreleased has no change', () => {
  for (const unreleased of [EMPTY, '## Unreleased\n\n', '## Unreleased\n\nNo change\n\n']) {
    assert.equal(releaseChangelog(build(unreleased), release), build(unreleased));
  }
});

test('releaseChangelog keeps a changelog with no Unreleased heading', () => {
  assert.equal(releaseChangelog(build(''), release), build(''));
  assert.equal(releaseChangelog('', release), '');
});

test('releaseChangelog releases an Unreleased that is the last section', () => {
  const text = `${INTRO}## Unreleased\n\n### Fixed\n\n- The order of the shops.\n`;
  assert.equal(
    releaseChangelog(text, release),
    `${INTRO}${EMPTY}## 1.0.9 - 2026-10-14\n\n### Fixed\n\n- The order of the shops.\n`,
  );
});

test('releaseChangelog does not take a subheading or a longer heading for Unreleased', () => {
  const text = `${INTRO}### Unreleased\n\n- A change.\n\n## Unreleased changes\n\n- A change.\n`;
  assert.equal(releaseChangelog(text, release), text);
});

test('localDate gives the day of the date in the local time zone', () => {
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(localDate(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
});

test('hasUnreleased is true when Unreleased holds a change', () => {
  assert.equal(hasUnreleased(build('## Unreleased\n\n- A change.\n\n')), true);
});

test('hasUnreleased is false for no change, an empty Unreleased or no Unreleased heading', () => {
  for (const unreleased of [EMPTY, '## Unreleased\n\n', '']) assert.equal(hasUnreleased(build(unreleased)), false);
});
