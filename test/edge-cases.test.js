import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from '../src/args.js';
import { add } from '../src/commands/add.js';
import { check } from '../src/commands/check.js';
import { remove } from '../src/commands/remove.js';
import { update } from '../src/commands/update.js';
import { TRAINER, cli, ctxFor, readConfigJson, realCatalog, snapshot, tmpProject } from './helpers.js';

// Edge cases most likely to harm a consumer, exercised against every command that could be hurt by them.
// Cases already covered elsewhere (see test/add, remove, update, check, sync, agents-md): unknown names,
// unmanaged-dir collision, --force overwrite, non-TTY without flags, missing manifest file, hash mismatch.

const HANDLERS = { add, remove, update, check };
const call = (name, cwd, argv) => HANDLERS[name](parseArgs([name, ...argv]), ctxFor(cwd, realCatalog));
const MUTATING_AND_CHECK = [
  ['add', ['--skill', TRAINER]],
  ['remove', []],
  ['remove', ['--skill', TRAINER]],
  ['update', []],
  ['update', ['--force']],
  ['check', []],
];
const label = (name, argv) => [name, ...argv].join(' ');
const configFile = (cwd) => join(cwd, '.agents', '.pa-skills-config.json');

test('corrupt config: every command fails with a clear error and changes nothing', async () => {
  const cwd = await tmpProject();
  await call('add', cwd, ['--skill', TRAINER]);
  await writeFile(configFile(cwd), '{ "version": 1, ');
  const before = await snapshot(cwd);
  for (const [name, argv] of MUTATING_AND_CHECK) {
    await assert.rejects(call(name, cwd, argv), /cannot parse .*pa-skills-config\.json.*nothing was changed/, label(name, argv));
    assert.deepEqual(await snapshot(cwd), before, label(name, argv));
  }
});

test('corrupt config without any skills on disk: add does not overwrite it', async () => {
  const cwd = await tmpProject();
  await call('add', cwd, ['--skill', TRAINER]);
  await rm(join(cwd, '.agents', 'skills'), { recursive: true });
  await writeFile(configFile(cwd), 'not json at all');
  const before = await snapshot(cwd);
  await assert.rejects(call('add', cwd, ['--skill', TRAINER]), /cannot parse/);
  assert.deepEqual(await snapshot(cwd), before);
});

test('structurally invalid config (valid JSON, wrong shape) is rejected by every command, nothing changed', async () => {
  const cwd = await tmpProject();
  await call('add', cwd, ['--skill', TRAINER]);
  const cfg = await readConfigJson(cwd);
  await writeFile(configFile(cwd), JSON.stringify({ ...cfg, skills: 'interview-trainer' }));
  const before = await snapshot(cwd);
  for (const [name, argv] of MUTATING_AND_CHECK) {
    await assert.rejects(call(name, cwd, argv), /invalid config .*"skills" must be an array/, label(name, argv));
    assert.deepEqual(await snapshot(cwd), before, label(name, argv));
  }
});

test('CLI: corrupt config exits 1 for add, remove, update and check', async () => {
  const cwd = await tmpProject();
  const run = (...a) => spawnSync(process.execPath, [cli, ...a, '--cwd', cwd], { encoding: 'utf8' });
  assert.equal(run('add', '--skill', TRAINER).status, 0);
  await writeFile(configFile(cwd), '}{');
  const before = await snapshot(cwd);
  for (const argv of [['add', '--skill', TRAINER], ['remove'], ['update'], ['check']]) {
    const r = run(...argv);
    assert.equal(r.status, 1, argv.join(' '));
    assert.match(r.stderr, /cannot parse/, argv.join(' '));
  }
  assert.deepEqual(await snapshot(cwd), before);
});

test('Windows-style backslash paths in the manifest are rejected with a clear error, nothing changed', async () => {
  const cwd = await tmpProject();
  await call('add', cwd, ['--skill', TRAINER]);
  const cfg = await readConfigJson(cwd);
  const winPath = `.agents\\skills\\${TRAINER}\\SKILL.md`;
  cfg.installed.files = cfg.installed.files.map((f) => (f.path === `.agents/skills/${TRAINER}/SKILL.md` ? { ...f, path: winPath } : f));
  await writeFile(configFile(cwd), JSON.stringify(cfg, null, 2));
  const before = await snapshot(cwd);
  for (const [name, argv] of MUTATING_AND_CHECK) {
    await assert.rejects(call(name, cwd, argv), /forward slashes/, label(name, argv));
    assert.deepEqual(await snapshot(cwd), before, label(name, argv));
  }
  // The installed file itself was never touched.
  assert.ok((await readFile(join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md'), 'utf8')).length > 0);
});

test('manifest paths that are absolute or climb out of the project are rejected', async () => {
  const cwd = await tmpProject();
  await call('add', cwd, ['--skill', TRAINER]);
  const cfg = await readConfigJson(cwd);
  for (const bad of ['../outside.txt', '/etc/passwd', 'C:/Windows/x.txt', '.agents/skills/../../x']) {
    const next = { ...cfg, installed: { ...cfg.installed, files: [...cfg.installed.files, { path: bad, sha256: 'x' }] } };
    await writeFile(configFile(cwd), JSON.stringify(next, null, 2));
    await assert.rejects(call('remove', cwd, []), /project-relative/, bad);
  }
});

test('unpaired AGENTS.md marker: add --agents-md aborts and writes nothing (no skill files, no config)', async () => {
  const cwd = await tmpProject();
  const original = '# Rules\n\n<!-- BEGIN @pavel-agarkov/skills -->\nhalf a block\n';
  await writeFile(join(cwd, 'AGENTS.md'), original);
  const before = await snapshot(cwd);
  await assert.rejects(call('add', cwd, ['--skill', TRAINER, '--agents-md']), /unpaired.*not changed/);
  assert.deepEqual(await snapshot(cwd), before);
});

test('unpaired AGENTS.md marker: check reports it as an error and writes nothing', async () => {
  const cwd = await tmpProject();
  await call('add', cwd, ['--skill', TRAINER, '--agents-md']);
  const text = await readFile(join(cwd, 'AGENTS.md'), 'utf8');
  await writeFile(join(cwd, 'AGENTS.md'), text.replace('<!-- BEGIN @pavel-agarkov/skills -->', ''));
  const before = await snapshot(cwd);
  await assert.rejects(call('check', cwd, []), /unpaired/);
  assert.deepEqual(await snapshot(cwd), before);
});

test('manifest file missing on disk: check is pending (exit 3) and does not restore it; update restores it', async () => {
  const cwd = await tmpProject();
  const run = (...a) => spawnSync(process.execPath, [cli, ...a, '--cwd', cwd], { encoding: 'utf8' });
  assert.equal(run('add', '--skill', TRAINER).status, 0);
  const file = join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md');
  const original = await readFile(file);
  await rm(file);
  const before = await snapshot(cwd);
  const c = run('check');
  assert.equal(c.status, 3);
  assert.deepEqual(await snapshot(cwd), before);
  assert.equal(run('update').status, 0);
  assert.deepEqual(await readFile(file), original);
  assert.equal(run('check').status, 0);
});

test('manifest hash mismatch: check reports it, remove leaves the file (update/--force: see update.test.js)', async () => {
  const cwd = await tmpProject();
  await call('add', cwd, ['--skill', TRAINER]);
  const file = join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md');
  await writeFile(file, 'consumer edit');

  const lines = [];
  const c = await check(parseArgs(['check']), ctxFor(cwd, realCatalog, { out: (s) => lines.push(s) }));
  assert.equal(c.pending, true);
  assert.ok(lines.join('').includes(`modified: .agents/skills/${TRAINER}/SKILL.md`));

  await call('remove', cwd, []);
  assert.equal(await readFile(file, 'utf8'), 'consumer edit');
  assert.equal(await readFile(configFile(cwd), 'utf8').catch(() => null), null); // config removed, file kept
});
