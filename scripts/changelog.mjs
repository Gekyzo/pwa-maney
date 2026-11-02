// The release of CHANGELOG.md: the changes under `Unreleased` get the version and the date of
// the deploy, and a new `Unreleased` with no change goes above them. No dependencies.

const HEADING = /^## Unreleased[ \t]*$/m;
const NO_CHANGE = /^No change\.?$/;
const EMPTY = '## Unreleased\n\nNo change.\n\n';

// The day of `date` in the local time zone, as `YYYY-MM-DD`.
export const localDate = (date) =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');

// The heading of `Unreleased` and the end of its text, or null with no such heading.
const unreleased = (text) => {
  const heading = HEADING.exec(text);
  if (!heading) return null;
  const start = heading.index + heading[0].length;
  const next = text.indexOf('\n## ', start);
  const body = text.slice(start, next === -1 ? text.length : next).trim();
  return { heading, start, changed: Boolean(body) && !NO_CHANGE.test(body) };
};

// True when `Unreleased` holds a change.
export const hasUnreleased = (text) => Boolean(unreleased(text)?.changed);

// Returns `text` with the changes of `Unreleased` under `## version - date`. Returns `text`
// as it is when it has no `Unreleased` heading or the heading has no change. The release notes
// of `release-notes/` have the same shape and are released the same way.
export const releaseChangelog = (text, { version, date }) => {
  const found = unreleased(text);
  if (!found?.changed) return text;
  const { heading, start } = found;
  return `${text.slice(0, heading.index)}${EMPTY}## ${version} - ${date}${text.slice(start)}`;
};
