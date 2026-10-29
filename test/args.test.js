import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, UsageError } from '../src/args.js';

test('parses command and defaults', () => {
  const o = parseArgs(['install']);
  assert.equal(o.command, 'install');
  assert.deepEqual(o.skills, []);
  assert.deepEqual(o.tags, []);
  assert.equal(o.agentsMd, undefined);
  assert.equal(o.force, false);
  assert.equal(o.dryRun, false);
});

test('--skill is repeatable and comma-separated', () => {
  const o = parseArgs(['install', '--skill', 'a,b', '--skill=c', '--skill', ' d , ']);
  assert.deepEqual(o.skills, ['a', 'b', 'c', 'd']);
});

test('--tag is repeatable and comma-separated', () => {
  const o = parseArgs(['list', '--tag', 'x,y', '--tag', 'z']);
  assert.deepEqual(o.tags, ['x', 'y', 'z']);
});

test('agents-md tri-state', () => {
  assert.equal(parseArgs(['install', '--agents-md']).agentsMd, true);
  assert.equal(parseArgs(['install', '--no-agents-md']).agentsMd, false);
});

test('boolean flags, cwd, help, version', () => {
  const o = parseArgs(['update', '--force', '--dry-run', '--cwd', '/tmp/x', '--help', '--version']);
  assert.equal(o.force, true);
  assert.equal(o.dryRun, true);
  assert.equal(o.cwd, '/tmp/x');
  assert.equal(o.help, true);
  assert.equal(o.version, true);
});

test('flags may precede the command', () => {
  assert.equal(parseArgs(['--dry-run', 'check']).command, 'check');
});

test('usage errors', () => {
  assert.throws(() => parseArgs(['bogus']), UsageError);
  assert.throws(() => parseArgs(['install', '--nope']), UsageError);
  assert.throws(() => parseArgs(['install', '--skill']), UsageError);
  assert.throws(() => parseArgs(['install', '--skill', '--force']), UsageError);
  assert.throws(() => parseArgs(['install', '--force=1']), UsageError);
  assert.throws(() => parseArgs(['install', 'update']), UsageError);
});
