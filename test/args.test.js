import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, UsageError } from '../src/args.js';

test('parses command and defaults', () => {
  const o = parseArgs(['add']);
  assert.equal(o.command, 'add');
  assert.deepEqual(o.skills, []);
  assert.deepEqual(o.tags, []);
  assert.equal(o.agentsMd, undefined);
  assert.equal(o.force, false);
  assert.equal(o.dryRun, false);
});

test('--skill is repeatable and comma-separated', () => {
  const o = parseArgs(['add', '--skill', 'a,b', '--skill=c', '--skill', ' d , ']);
  assert.deepEqual(o.skills, ['a', 'b', 'c', 'd']);
});

test('--tag is repeatable and comma-separated', () => {
  const o = parseArgs(['list', '--tag', 'x,y', '--tag', 'z']);
  assert.deepEqual(o.tags, ['x', 'y', 'z']);
});

test('--agent: comma list, repeated, inline =*, and -a; -a needs a value; ids are not checked here', () => {
  assert.deepEqual(parseArgs(['add', '--agent', 'claude-code,universal']).agents, ['claude-code', 'universal']);
  assert.deepEqual(parseArgs(['add', '--agent', 'claude-code', '--agent', 'universal']).agents, ['claude-code', 'universal']);
  assert.deepEqual(parseArgs(['add', '--agent=*']).agents, ['*']);
  assert.deepEqual(parseArgs(['add', '-a', 'universal']).agents, ['universal']);
  assert.deepEqual(parseArgs(['remove', '-a', 'claude-code', '--agent=universal']).agents, ['claude-code', 'universal']);
  assert.deepEqual(parseArgs(['add', '--agent', 'nope']).agents, ['nope']);
  assert.deepEqual(parseArgs(['add']).agents, []);
  assert.throws(() => parseArgs(['add', '-a']), (e) => e instanceof UsageError && /-a requires a value/.test(e.message));
  assert.throws(() => parseArgs(['add', '-a', '--force']), UsageError);
  assert.throws(() => parseArgs(['add', '--agent']), UsageError);
});

test('--agents-md is a plain flag; --no-agents-md is gone', () => {
  assert.equal(parseArgs(['add', '--agents-md']).agentsMd, true);
  assert.equal(parseArgs(['remove', '--agents-md']).agentsMd, true);
  assert.equal(parseArgs(['remove']).agentsMd, undefined);
  assert.throws(() => parseArgs(['add', '--no-agents-md']), UsageError);
});

test('install, uninstall and configure are unknown commands', () => {
  for (const c of ['install', 'uninstall', 'configure']) assert.throws(() => parseArgs([c]), UsageError);
});

test('boolean flags, cwd, help, version', () => {
  const o = parseArgs(['update', '--force', '--dry-run', '--cwd', '/tmp/x', '--help', '--version']);
  assert.equal(o.force, true);
  assert.equal(o.dryRun, true);
  assert.equal(o.cwd, '/tmp/x');
  assert.equal(o.help, true);
  assert.equal(o.version, true);
});

test('changes is a command', () => {
  assert.equal(parseArgs(['changes']).command, 'changes');
});

test('flags may precede the command', () => {
  assert.equal(parseArgs(['--dry-run', 'check']).command, 'check');
});

test('usage errors', () => {
  assert.throws(() => parseArgs(['bogus']), UsageError);
  assert.throws(() => parseArgs(['add', '--nope']), UsageError);
  assert.throws(() => parseArgs(['add', '--skill']), UsageError);
  assert.throws(() => parseArgs(['add', '--skill', '--force']), UsageError);
  assert.throws(() => parseArgs(['add', '--force=1']), UsageError);
  assert.throws(() => parseArgs(['add', 'update']), UsageError);
});
