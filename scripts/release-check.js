#!/usr/bin/env node
// PR check: decides whether the head version change against the base branch version is allowed.
// Usage: node scripts/release-check.js <baseVersion>
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CHANGELOG_JSON, compareVersions, isPlainVersion } from '../src/changelog.js';

/**
 * Returns { ok, message }. An unchanged version is always ok (nothing is published on merge).
 * Otherwise the head must be a plain x.y.z version, strictly greater than a plain base,
 * with a changelog entry that has non-empty notes. A non-plain base only requires a valid head.
 */
export function checkRelease({ baseVersion, headVersion, entries }) {
  if (headVersion === baseVersion) {
    return { ok: true, message: `version ${headVersion} unchanged; nothing will be published on merge` };
  }
  if (!isPlainVersion(headVersion)) {
    return { ok: false, message: `version ${JSON.stringify(headVersion)} must be a plain x.y.z version (no "v", no prerelease)` };
  }
  if (isPlainVersion(baseVersion) && compareVersions(headVersion, baseVersion) <= 0) {
    return { ok: false, message: `version ${headVersion} must be greater than the base version ${baseVersion}` };
  }
  const entry = Array.isArray(entries) ? entries.find((e) => e && e.version === headVersion) : undefined;
  if (!entry) {
    return { ok: false, message: `no ${CHANGELOG_JSON} entry for ${headVersion}; add one and run npm run changelog` };
  }
  if (!Array.isArray(entry.notes) || entry.notes.length === 0 || !entry.notes.every((n) => typeof n === 'string' && n.trim() !== '')) {
    return { ok: false, message: `${CHANGELOG_JSON} entry for ${headVersion} must have non-empty notes` };
  }
  return { ok: true, message: `${baseVersion} -> ${headVersion} will be published on merge` };
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('usage: node scripts/release-check.js <baseVersion>');
    process.exit(1);
  }
  const read = (name) => {
    try {
      return JSON.parse(readFileSync(join(root, name), 'utf8'));
    } catch (err) {
      throw new Error(`cannot read ${name}: ${err.message}`);
    }
  };
  try {
    const { ok, message } = checkRelease({
      baseVersion: args[0],
      headVersion: read('package.json').version,
      entries: read(CHANGELOG_JSON),
    });
    (ok ? console.log : console.error)(message);
    if (!ok) process.exit(1);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

// Run only when executed directly, so tests can import checkRelease without side effects.
// Windows paths are case-insensitive, so compare the file URLs case-insensitively there.
const norm = (url) => (process.platform === 'win32' ? url.toLowerCase() : url);
if (process.argv[1] && norm(import.meta.url) === norm(pathToFileURL(resolve(process.argv[1])).href)) main();
