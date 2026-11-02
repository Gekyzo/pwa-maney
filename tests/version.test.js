import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, compareVersions, versionStatus, nextVersion, shouldOfferUpdate } from '#version';

const DATE = '2026-10-12T21:41:00.000Z';
const build = (version, date = DATE) => ({ version, date });

test('parseVersion keeps the version and the date', () => {
  assert.deepEqual(parseVersion({ version: '1.2.3', date: DATE, other: 1 }), build('1.2.3'));
});

test('parseVersion rejects a version that is not major.minor.patch', () => {
  for (const value of ['1.2', '1.2.3.4', 'v1.2.3', '1.2.x', '1.2.3-beta', '01.2.3', '', 12, null, undefined]) {
    assert.equal(parseVersion({ version: value, date: DATE }), null);
  }
});

test('parseVersion rejects a date that is not valid', () => {
  for (const value of ['yesterday', '', 12, null, undefined]) {
    assert.equal(parseVersion({ version: '1.0.0', date: value }), null);
  }
});

test('parseVersion rejects data that is not an object', () => {
  for (const data of [null, undefined, 'text', 3, []]) {
    assert.equal(parseVersion(data), null);
  }
});

test('compareVersions compares each part as a number', () => {
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.ok(compareVersions('1.2.10', '1.2.9') > 0);
  assert.ok(compareVersions('1.9.0', '1.10.0') < 0);
  assert.ok(compareVersions('2.0.0', '1.99.99') > 0);
});

test('versionStatus is current when the deployed version is the running version', () => {
  assert.equal(versionStatus(build('1.2.3'), build('1.2.3')), 'current');
});

test('versionStatus is outdated when the deployed version is newer', () => {
  assert.equal(versionStatus(build('1.2.9'), build('1.2.10')), 'outdated');
});

test('versionStatus is current when the running version is newer than the deployed version', () => {
  assert.equal(versionStatus(build('1.3.0'), build('1.2.9')), 'current');
});

test('versionStatus is unknown when one side is missing', () => {
  assert.equal(versionStatus(null, build('1.0.0')), 'unknown');
  assert.equal(versionStatus(build('1.0.0'), null), 'unknown');
  assert.equal(versionStatus(null, null), 'unknown');
});

test('nextVersion adds one to the patch by default and takes the date of the bump', () => {
  const current = build('1.2.3');
  const next = nextVersion(current, new Date('2026-10-13T08:00:00.000Z'));
  assert.deepEqual(next, build('1.2.4', '2026-10-13T08:00:00.000Z'));
  assert.deepEqual(current, build('1.2.3'));
});

test('nextVersion sets the lower parts to zero for a minor and a major bump', () => {
  const now = new Date('2026-10-13T08:00:00.000Z');
  assert.equal(nextVersion(build('1.2.3'), now, 'minor').version, '1.3.0');
  assert.equal(nextVersion(build('1.2.3'), now, 'major').version, '2.0.0');
});

test('nextVersion starts at 1.0.0 when there is no version', () => {
  assert.deepEqual(nextVersion(null, new Date('2026-10-13T08:00:00.000Z')), build('1.0.0', '2026-10-13T08:00:00.000Z'));
});

test('the update is offered once per start, only for a newer deploy', () => {
  assert.equal(shouldOfferUpdate('outdated', false), true);
  assert.equal(shouldOfferUpdate('outdated', true), false);
  assert.equal(shouldOfferUpdate('current', false), false);
  assert.equal(shouldOfferUpdate('unknown', false), false);
});
