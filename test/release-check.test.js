import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRelease } from '../scripts/release-check.js';

const entries = [
  { version: '0.2.0', notes: ['Two.'] },
  { version: '0.1.0', notes: ['One.'] },
];

test('unchanged version is ok and publishes nothing', () => {
  const r = checkRelease({ baseVersion: '0.1.0', headVersion: '0.1.0', entries });
  assert.equal(r.ok, true);
  assert.equal(r.message, 'version 0.1.0 unchanged; nothing will be published on merge');
});

test('bump with a changelog entry is ok', () => {
  const r = checkRelease({ baseVersion: '0.1.0', headVersion: '0.2.0', entries });
  assert.equal(r.ok, true);
  assert.equal(r.message, '0.1.0 -> 0.2.0 will be published on merge');
});

test('bump without a changelog entry fails', () => {
  const r = checkRelease({ baseVersion: '0.1.0', headVersion: '0.3.0', entries });
  assert.equal(r.ok, false);
  assert.match(r.message, /no changelog\.json entry for 0\.3\.0/);
});

test('bump whose entry has empty notes fails', () => {
  const r = checkRelease({ baseVersion: '0.1.0', headVersion: '0.2.0', entries: [{ version: '0.2.0', notes: [] }] });
  assert.equal(r.ok, false);
  assert.match(r.message, /non-empty notes/);
});

test('lower version fails', () => {
  const r = checkRelease({ baseVersion: '0.2.0', headVersion: '0.1.0', entries });
  assert.equal(r.ok, false);
  assert.match(r.message, /must be greater than the base version 0\.2\.0/);
});

test('equal but reformatted version fails', () => {
  const r = checkRelease({ baseVersion: '0.2.0', headVersion: 'v0.2.0', entries });
  assert.equal(r.ok, false);
  assert.match(r.message, /plain x\.y\.z/);
});

test('prerelease head fails', () => {
  const r = checkRelease({ baseVersion: '0.1.0', headVersion: '0.2.0-beta.1', entries });
  assert.equal(r.ok, false);
  assert.match(r.message, /plain x\.y\.z/);
});

test('non-plain base is ok when the head is valid', () => {
  for (const baseVersion of ['0.0.0-stage', '']) {
    const r = checkRelease({ baseVersion, headVersion: '0.2.0', entries });
    assert.equal(r.ok, true, JSON.stringify(baseVersion));
  }
  assert.equal(checkRelease({ baseVersion: '0.0.0-stage', headVersion: '0.3.0', entries }).ok, false);
});
