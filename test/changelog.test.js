import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  compareVersions,
  entriesBetween,
  isPlainVersion,
  loadChangelog,
  renderMarkdown,
  renderNotes,
  validateChangelog,
} from '../src/changelog.js';
import { repoRoot } from './helpers.js';

const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const three = () => [
  { version: '0.10.0', notes: ['Ten.'] },
  { version: '0.9.0', notes: ['Nine.', 'More nine.'] },
  { version: '0.1.0', notes: ['One.'] },
];

test('compareVersions is numeric per part', () => {
  assert.equal(compareVersions('0.10.0', '0.9.0'), 1);
  assert.equal(compareVersions('0.9.0', '0.10.0'), -1);
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('2.0.0', '1.99.99'), 1);
  assert.throws(() => compareVersions('v1.0.0', '1.0.0'), /invalid version/);
});

test('isPlainVersion accepts only x.y.z', () => {
  assert.equal(isPlainVersion('0.1.0'), true);
  assert.equal(isPlainVersion('10.20.30'), true);
  for (const v of ['0.0.0-stage', 'v1.0.0', '1.0', '1.0.0.0', '', undefined, 1]) assert.equal(isPlainVersion(v), false, String(v));
});

test('validateChangelog accepts a well-formed list', () => {
  assert.deepEqual(validateChangelog(three(), '0.10.0'), three());
});

test('validateChangelog rejects each rule violation', () => {
  assert.throws(() => validateChangelog([], '0.1.0'), /non-empty JSON array/);
  assert.throws(() => validateChangelog({}, '0.1.0'), /non-empty JSON array/);
  const dup = [{ version: '0.2.0', notes: ['a'] }, { version: '0.2.0', notes: ['b'] }];
  assert.throws(() => validateChangelog(dup, '0.2.0'), /duplicate version 0\.2\.0/);
  const order = [{ version: '0.9.0', notes: ['a'] }, { version: '0.10.0', notes: ['b'] }];
  assert.throws(() => validateChangelog(order, '0.9.0'), /newest first/);
  assert.throws(() => validateChangelog([{ version: '0.1.0', notes: [] }], '0.1.0'), /non-empty array/);
  assert.throws(() => validateChangelog([{ version: '0.1.0' }], '0.1.0'), /non-empty array/);
  assert.throws(() => validateChangelog([{ version: '0.1.0', notes: ['  '] }], '0.1.0'), /non-empty string/);
  assert.throws(() => validateChangelog([{ version: 'v0.1.0', notes: ['a'] }], 'v0.1.0'), /plain x\.y\.z/);
  assert.throws(() => validateChangelog([{ version: '0.1.0-rc.1', notes: ['a'] }], '0.1.0-rc.1'), /plain x\.y\.z/);
  assert.throws(() => validateChangelog(three(), '0.11.0'), /does not match package\.json version/);
});

test('entriesBetween selects from < v <= to, newest first', () => {
  const e = three();
  assert.deepEqual(entriesBetween(e, '0.9.0', '0.9.0'), []);
  assert.deepEqual(entriesBetween(e, '0.1.0', '0.10.0').map((x) => x.version), ['0.10.0', '0.9.0']);
  assert.deepEqual(entriesBetween(e, '0.1.0', '0.9.0').map((x) => x.version), ['0.9.0']);
  assert.deepEqual(entriesBetween(e, '0.0.0-stage', '0.9.0').map((x) => x.version), ['0.9.0', '0.1.0']);
  assert.deepEqual(entriesBetween(e, undefined, '0.10.0').map((x) => x.version), ['0.10.0', '0.9.0', '0.1.0']);
});

test('renderNotes and renderMarkdown', () => {
  const e = three();
  assert.equal(renderNotes(e[1]), '- Nine.\n- More nine.');
  assert.equal(
    renderMarkdown(e),
    '# Changelog\n\n## 0.10.0\n\n- Ten.\n\n## 0.9.0\n\n- Nine.\n- More nine.\n\n## 0.1.0\n\n- One.\n',
  );
});

test('the real changelog.json validates against the package.json version', () => {
  const entries = loadChangelog(repoRoot);
  assert.equal(entries[0].version, pkg.version);
  for (const e of entries) assert.deepEqual(Object.keys(e).sort(), ['notes', 'version'], `${e.version}: only version and notes`);
});

test('committed CHANGELOG.md matches changelog.json', () => {
  // git may check the file out with CRLF on Windows; compare the LF form the generator writes.
  const committed = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(committed, renderMarkdown(loadChangelog(repoRoot)), 'CHANGELOG.md is out of date; run `npm run changelog`');
});

test('package files ship changelog.json and CHANGELOG.md, not scripts/', () => {
  assert.ok(pkg.files.includes('changelog.json'));
  assert.ok(pkg.files.includes('CHANGELOG.md'));
  assert.ok(!pkg.files.some((f) => f.startsWith('scripts')));
  assert.equal(pkg.scripts.changelog, 'node scripts/changelog.js');
});
