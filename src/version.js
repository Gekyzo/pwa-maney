// The version of a deploy: `{ version, date }`, read from `version.json`.
// `version` is a semantic version, `major.minor.patch`.

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const LEVELS = ['major', 'minor', 'patch'];

const parts = (version) => version.split('.').map(Number);

// Returns the version in `data`, or null when the data is not a version.
export const parseVersion = (data) => {
  if (!data || typeof data !== 'object') return null;
  const { version, date } = data;
  if (typeof version !== 'string' || !SEMVER.test(version)) return null;
  if (typeof date !== 'string' || Number.isNaN(Date.parse(date))) return null;
  return { version, date };
};

// Negative when `a` is older than `b`, positive when newer, 0 when equal.
export const compareVersions = (a, b) => {
  const other = parts(b);
  return parts(a).reduce((order, part, index) => order || part - other[index], 0);
};

// Compares the running version with the deployed one: 'current', 'outdated' or 'unknown'.
export const versionStatus = (running, latest) => {
  if (!running || !latest) return 'unknown';
  return compareVersions(latest.version, running.version) > 0 ? 'outdated' : 'current';
};

// The version of the next deploy. `level` is the part that goes up; the lower parts go to zero.
export const nextVersion = (current, now, level = 'patch') => {
  const date = now.toISOString();
  if (!current) return { version: '1.0.0', date };
  const index = LEVELS.indexOf(level);
  const next = parts(current.version).map((part, at) => (at < index ? part : at === index ? part + 1 : 0));
  return { version: next.join('.'), date };
};

// The toast of a new deploy shows at most once per start, and only when the deploy is newer (VER-18).
export const shouldOfferUpdate = (status, offered) => status === 'outdated' && !offered;
