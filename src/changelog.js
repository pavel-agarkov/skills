import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CHANGELOG_JSON = 'changelog.json';

/** A plain release version: three numeric parts, no leading `v`, no prerelease or build suffix. */
export const PLAIN_VERSION = /^\d+\.\d+\.\d+$/;

export const isPlainVersion = (v) => typeof v === 'string' && PLAIN_VERSION.test(v);

/** Numeric three-part comparison: -1, 0 or 1. Both arguments must be plain versions. */
export function compareVersions(a, b) {
  for (const v of [a, b]) {
    if (!isPlainVersion(v)) throw new Error(`invalid version ${JSON.stringify(v)}: expected plain x.y.z`);
  }
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/** Throws a descriptive Error when the entries are malformed or out of step with the package version. */
export function validateChangelog(entries, packageVersion) {
  const fail = (why) => {
    throw new Error(`invalid ${CHANGELOG_JSON}: ${why}`);
  };
  if (!Array.isArray(entries) || entries.length === 0) fail('expected a non-empty JSON array of entries');
  const seen = new Set();
  entries.forEach((e, i) => {
    if (e === null || typeof e !== 'object' || Array.isArray(e)) fail(`entry ${i} must be an object`);
    if (!isPlainVersion(e.version)) fail(`entry ${i} "version" ${JSON.stringify(e.version)} must be a plain x.y.z version`);
    if (seen.has(e.version)) fail(`duplicate version ${e.version}`);
    seen.add(e.version);
    if (!Array.isArray(e.notes) || e.notes.length === 0) fail(`${e.version}: "notes" must be a non-empty array`);
    if (!e.notes.every((n) => typeof n === 'string' && n.trim() !== '')) fail(`${e.version}: every note must be a non-empty string`);
    if (i > 0 && compareVersions(entries[i - 1].version, e.version) <= 0) {
      fail(`entries must be newest first: ${entries[i - 1].version} comes before ${e.version}`);
    }
  });
  if (entries[0].version !== packageVersion) {
    fail(`top entry ${entries[0].version} does not match package.json version ${JSON.stringify(packageVersion)}; add an entry for it`);
  }
  return entries;
}

/** Reads and validates `changelog.json` against the `package.json` version in packageRoot. */
export function loadChangelog(packageRoot) {
  const read = (name) => {
    try {
      return JSON.parse(readFileSync(join(packageRoot, name), 'utf8'));
    } catch (err) {
      throw new Error(`cannot read ${name}: ${err.message}`);
    }
  };
  const pkg = read('package.json');
  return validateChangelog(read(CHANGELOG_JSON), pkg.version);
}

/** Entries with from < version <= to, newest first. A non-plain `from` is older than every entry. */
export function entriesBetween(entries, from, to) {
  return entries.filter(
    (e) => (!isPlainVersion(from) || compareVersions(e.version, from) > 0) && compareVersions(e.version, to) <= 0,
  );
}

/** The bullet list for one entry (no trailing newline), used for the GitHub Release body. */
export function renderNotes(entry) {
  return entry.notes.map((n) => `- ${n}`).join('\n');
}

/** The full CHANGELOG.md text: title, one `## <version>` section per entry, trailing newline. */
export function renderMarkdown(entries) {
  const sections = entries.map((e) => `## ${e.version}\n\n${renderNotes(e)}`);
  return `# Changelog\n\n${sections.join('\n\n')}\n`;
}
