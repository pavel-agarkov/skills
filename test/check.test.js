import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from '../src/args.js';
import { check } from '../src/commands/check.js';
import { add } from '../src/commands/add.js';
import { update } from '../src/commands/update.js';
import { TRAINER, cli, ctxFor, makeCatalog, realCatalog, snapshot, tmpProject, toCrlf, writeLegacyInstall } from './helpers.js';

const chk = (cwd, catalog = realCatalog, extra = {}) => check(parseArgs(['check']), ctxFor(cwd, catalog, extra));

test('check is pending after a catalog change, clean after update, and never writes', async () => {
  const cwd = await tmpProject();
  const v1 = await makeCatalog({ alpha: ['web'] });
  await add(parseArgs(['add', '--tag', 'web']), ctxFor(cwd, v1.catalog));
  assert.equal((await chk(cwd, v1.catalog)).pending, false);

  const v2 = await makeCatalog({ alpha: ['web'], beta: ['web'] });
  const before = await snapshot(cwd);
  const lines = [];
  const r = await chk(cwd, v2.catalog, { out: (s) => lines.push(s) });
  assert.equal(r.pending, true);
  assert.ok(lines.join('').includes('added: .agents/skills/beta/SKILL.md'));
  assert.deepEqual(await snapshot(cwd), before);

  await update(parseArgs(['update']), ctxFor(cwd, v2.catalog));
  assert.equal((await chk(cwd, v2.catalog)).pending, false);
});

test('modified files make check pending; no config is an error', async () => {
  const cwd = await tmpProject();
  await assert.rejects(chk(cwd), /nothing installed/);
  await add(parseArgs(['add', '--skill', TRAINER]), ctxFor(cwd));
  await writeFile(join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md'), 'edited');
  const lines = [];
  assert.equal((await chk(cwd, realCatalog, { out: (s) => lines.push(s) })).pending, true);
  assert.ok(lines.join('').includes(`modified: .agents/skills/${TRAINER}/SKILL.md`));
});

test('CLI exit codes: 0 clean, 3 pending, 1 without config', async () => {
  const cwd = await tmpProject();
  const run = (...a) => spawnSync(process.execPath, [cli, ...a, '--cwd', cwd], { encoding: 'utf8' });
  assert.equal(run('check').status, 1);
  assert.equal(run('add', '--skill', TRAINER).status, 0);
  assert.equal(run('check').status, 0);
  await writeFile(join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md'), 'edited');
  const pending = run('check');
  assert.equal(pending.status, 3);
  assert.ok(pending.stdout.includes('modified:'));
  assert.equal(run('update').status, 0); // skips the modified file, exit 0
});

test('check on a v0.2.0 install is pending, reports the config move and changes no byte (exit 3)', async () => {
  const cwd = await tmpProject();
  await writeLegacyInstall(cwd, { agentsMd: true });
  const before = await snapshot(cwd);
  const lines = [];
  const r = await chk(cwd, realCatalog, { out: (s) => lines.push(s) });
  assert.equal(r.pending, true);
  assert.equal(r.source, 'legacy');
  assert.ok(lines.join('').includes('pending: config: moved .agents/.pa-skills-config.json → .pa-skills.json\n'), lines.join(''));
  assert.deepEqual(await snapshot(cwd), before);

  const cliRun = spawnSync(process.execPath, [cli, 'check', '--cwd', cwd], { encoding: 'utf8' });
  assert.equal(cliRun.status, 3, cliRun.stderr);
  assert.ok(cliRun.stdout.includes('config: moved .agents/.pa-skills-config.json'));
  assert.deepEqual(await snapshot(cwd), before);

  // --dry-run update does not migrate either
  await update(parseArgs(['update', '--dry-run']), ctxFor(cwd));
  assert.deepEqual(await snapshot(cwd), before);
});

test('check on a v0.2.0 install beside CLAUDE.md exits 1 naming the add --agent to run, and changes no byte', async () => {
  const cwd = await tmpProject();
  await writeLegacyInstall(cwd);
  await writeFile(join(cwd, 'CLAUDE.md'), '# Claude\n');
  const before = await snapshot(cwd);
  await assert.rejects(chk(cwd), /found CLAUDE\.md and \.agents\/.*"add --agent universal".*"add --agent claude-code,universal".*Nothing was changed/);
  const r = spawnSync(process.execPath, [cli, 'check', '--cwd', cwd], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stderr);
  assert.deepEqual(await snapshot(cwd), before);
});

// Line endings: fixtures write their own bytes (a temp catalog is LF on every OS), never the checkout's.

test('an installed SKILL.md converted to CRLF is not pending (CLI exit 0)', async () => {
  const cwd = await tmpProject();
  const { catalog } = await makeCatalog({ alpha: ['web'] });
  await add(parseArgs(['add', '--skill', 'alpha']), ctxFor(cwd, catalog));
  const file = join(cwd, '.agents', 'skills', 'alpha', 'SKILL.md');
  const crlf = toCrlf(await readFile(file));
  assert.ok(crlf.includes('\r\n'));
  await writeFile(file, crlf);
  const lines = [];
  const r = await chk(cwd, catalog, { out: (s) => lines.push(s) });
  assert.equal(r.pending, false, lines.join(''));
  assert.ok(!lines.join('').includes('modified:'), lines.join(''));
  // the CLI exit code too (its own catalog is the real one, so install a real skill and convert it the same way)
  const real = await tmpProject();
  const run = (...a) => spawnSync(process.execPath, [cli, ...a, '--cwd', real], { encoding: 'utf8' });
  assert.equal(run('add', '--skill', TRAINER).status, 0);
  const realFile = join(real, '.agents', 'skills', TRAINER, 'SKILL.md');
  await writeFile(realFile, toCrlf(await readFile(realFile)));
  const cliCheck = run('check');
  assert.equal(cliCheck.status, 0, cliCheck.stdout);
});

test('a CRLF copy with a real content edit is reported as modified', async () => {
  const cwd = await tmpProject();
  const { catalog } = await makeCatalog({ alpha: ['web'] });
  await add(parseArgs(['add', '--skill', 'alpha']), ctxFor(cwd, catalog));
  const file = join(cwd, '.agents', 'skills', 'alpha', 'SKILL.md');
  await writeFile(file, toCrlf(Buffer.from(`${await readFile(file, 'utf8')}consumer line\n`)));
  const lines = [];
  assert.equal((await chk(cwd, catalog, { out: (s) => lines.push(s) })).pending, true);
  assert.ok(lines.join('').includes('modified: .agents/skills/alpha/SKILL.md'), lines.join(''));
});
