import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from '../src/args.js';
import { install } from '../src/commands/install.js';
import { uninstall } from '../src/commands/uninstall.js';
import { ASPNET, TRAINER, cli, ctxFor, realCatalog, snapshot, tmpProject } from './helpers.js';

const inst = (cwd, argv) => install(parseArgs(['install', ...argv]), ctxFor(cwd));
const unin = (cwd, argv = [], extra = {}) => uninstall(parseArgs(['uninstall', ...argv]), ctxFor(cwd, realCatalog, extra));
const exists = (p) => stat(p).then(() => true, () => false);

test('no config: nothing-to-uninstall message', async () => {
  const cwd = await tmpProject();
  const lines = [];
  assert.equal(await unin(cwd, [], { out: (s) => lines.push(s) }), null);
  assert.ok(lines.join('').includes('Nothing to uninstall'));
});

test('removes exactly what was installed; leaves consumer-modified and consumer-added files and their dirs', async () => {
  const cwd = await tmpProject();
  const outside = '# Team\n\nhand written\n';
  await writeFile(join(cwd, 'AGENTS.md'), outside);
  await inst(cwd, ['--skill', `${TRAINER},${ASPNET}`, '--agents-md']);
  const own = join(cwd, '.agents', 'skills', TRAINER, 'mine.md');
  await writeFile(own, 'mine');
  const edited = join(cwd, '.agents', 'skills', ASPNET, 'SKILL.md');
  await writeFile(edited, 'edited');

  const lines = [];
  await unin(cwd, [], { out: (s) => lines.push(s) });
  assert.equal(await readFile(own, 'utf8'), 'mine');
  assert.equal(await readFile(edited, 'utf8'), 'edited');
  assert.equal(await readFile(join(cwd, 'AGENTS.md'), 'utf8'), outside);
  assert.equal(await exists(join(cwd, '.agents', '.pa-skills-config.json')), false);
  assert.equal(await exists(join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md')), false);
  assert.ok(lines.join('').includes('modified locally; left in place'));
  const remaining = Object.keys(await snapshot(join(cwd, '.agents'))).sort();
  assert.deepEqual(remaining, [`skills/${ASPNET}/SKILL.md`, `skills/${TRAINER}/mine.md`]);
});

test('clean uninstall leaves no .agents and removes an installer-created AGENTS.md', async () => {
  const cwd = await tmpProject();
  await inst(cwd, ['--tag', 'dotnet', '--agents-md']);
  await unin(cwd);
  assert.deepEqual(await readdir(cwd), []);
});

test('--dry-run writes nothing', async () => {
  const cwd = await tmpProject();
  await inst(cwd, ['--skill', TRAINER, '--agents-md']);
  const before = await snapshot(cwd);
  const lines = [];
  await unin(cwd, ['--dry-run'], { out: (s) => lines.push(s) });
  assert.deepEqual(await snapshot(cwd), before);
  assert.ok(lines.join('').includes('[dry-run]'));
});

test('items already deleted by hand are warnings; the rest is removed and the config deleted', async () => {
  const cwd = await tmpProject();
  await writeFile(join(cwd, 'AGENTS.md'), '# keep\n');
  await inst(cwd, ['--skill', `${TRAINER},${ASPNET}`, '--agents-md']);
  await rm(join(cwd, '.agents', 'skills', ASPNET), { recursive: true });
  await rm(join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md'));
  await writeFile(join(cwd, 'AGENTS.md'), '# keep\n'); // block gone
  const lines = [];
  await unin(cwd, [], { out: (s) => lines.push(s) });
  const text = lines.join('');
  assert.ok(text.includes('was already removed'));
  assert.ok(text.includes('skills block was already gone'));
  assert.equal(await readFile(join(cwd, 'AGENTS.md'), 'utf8'), '# keep\n');
  assert.equal(await exists(join(cwd, '.agents', '.pa-skills-config.json')), false);
  assert.equal(await exists(join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md')), false);
});

test('everything deleted by hand (files, folders, AGENTS.md): still succeeds and deletes the config', async () => {
  const cwd = await tmpProject();
  await inst(cwd, ['--skill', TRAINER, '--agents-md']);
  await rm(join(cwd, '.agents', 'skills'), { recursive: true });
  await rm(join(cwd, 'AGENTS.md'));
  const lines = [];
  await unin(cwd, [], { out: (s) => lines.push(s) });
  assert.ok(lines.join('').includes('AGENTS.md was already removed'));
  assert.deepEqual(await readdir(cwd), []);
});

test('unpaired AGENTS.md marker aborts before deleting anything', async () => {
  const cwd = await tmpProject();
  await inst(cwd, ['--skill', TRAINER, '--agents-md']);
  const text = await readFile(join(cwd, 'AGENTS.md'), 'utf8');
  await writeFile(join(cwd, 'AGENTS.md'), text.replace('<!-- END @pavel-agarkov/skills -->', ''));
  const before = await snapshot(cwd);
  await assert.rejects(unin(cwd), /unpaired/);
  assert.deepEqual(await snapshot(cwd), before);
});

test('CLI: uninstall exits 0 with and without a config; update without config exits 1', async () => {
  const cwd = await tmpProject();
  const run = (...a) => spawnSync(process.execPath, [cli, ...a, '--cwd', cwd], { encoding: 'utf8' });
  assert.equal(run('uninstall').status, 0);
  assert.equal(run('install', '--skill', TRAINER).status, 0);
  await rm(join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md'));
  assert.equal(run('uninstall').status, 0);
  assert.equal(run('update').status, 1);
  assert.equal(await exists(join(cwd, '.agents')), false);
});

test('--skill/--tag are rejected with exit 2 and nothing changes', async () => {
  const cwd = await tmpProject();
  await inst(cwd, ['--skill', TRAINER, '--agents-md']);
  const before = await snapshot(cwd);
  for (const flag of [['--skill', TRAINER], ['--tag', 'dotnet']]) {
    await assert.rejects(unin(cwd, flag), /takes no --skill\/--tag/);
    const r = spawnSync(process.execPath, [join(import.meta.dirname, '..', 'bin', 'cli.js'), 'uninstall', ...flag, '--cwd', cwd], { encoding: 'utf8' });
    assert.equal(r.status, 2);
  }
  assert.deepEqual(await snapshot(cwd), before);
});
