import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configPath, readConfig, serializeConfig, validateConfig, writeConfig } from '../src/config.js';

const sample = () => ({
  version: 1,
  package: '@pavel-agarkov/skills',
  packageVersion: '0.1.0',
  skills: ['b', 'a'],
  tags: ['z', 'y'],
  agentsMd: false,
  installed: {
    skills: ['b', 'a'],
    files: [
      { sha256: '2', path: '.agents/skills/b/SKILL.md' },
      { sha256: '1', path: '.agents/skills/a/SKILL.md' },
    ],
    agentsMd: { createdFile: false, present: false },
  },
});

test('readConfig returns null when absent', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'cfg-'));
  assert.equal(readConfig(cwd), null);
});

test('write is deterministic: sorted keys and lists, 2 spaces, trailing newline, no timestamps', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'cfg-'));
  assert.equal(writeConfig(cwd, sample()), true);
  const text = await readFile(configPath(cwd), 'utf8');
  assert.ok(text.endsWith('}\n'));
  assert.ok(text.startsWith('{\n  "agentsMd": false,\n'));
  assert.ok(!/time|date/i.test(text));
  const parsed = JSON.parse(text);
  assert.deepEqual(parsed.skills, ['a', 'b']);
  assert.deepEqual(parsed.installed.files.map((f) => f.path), ['.agents/skills/a/SKILL.md', '.agents/skills/b/SKILL.md']);
  assert.deepEqual(Object.keys(parsed), [...Object.keys(parsed)].sort());
  // Rewriting the same selection (even with shuffled input) yields identical bytes and no write.
  assert.equal(writeConfig(cwd, sample()), false);
  assert.equal(await readFile(configPath(cwd), 'utf8'), text);
  assert.equal(serializeConfig(readConfig(cwd)), text);
});

test('corrupt JSON gives a clear error', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'cfg-'));
  await mkdir(join(cwd, '.agents'));
  await writeFile(configPath(cwd), '{ not json');
  assert.throws(() => readConfig(cwd), /cannot parse .*nothing was changed/);
});

test('invalid shape is rejected', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'cfg-'));
  await mkdir(join(cwd, '.agents'));
  await writeFile(configPath(cwd), JSON.stringify({ version: 2 }));
  assert.throws(() => readConfig(cwd), /unsupported version/);
  assert.throws(() => validateConfig({ ...sample(), agentsMd: 'yes' }), /agentsMd/);
  assert.throws(() => validateConfig({ ...sample(), installed: { ...sample().installed, files: [{ path: 1 }] } }), /installed.files/);
});
