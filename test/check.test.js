import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from '../src/args.js';
import { check } from '../src/commands/check.js';
import { install } from '../src/commands/install.js';
import { update } from '../src/commands/update.js';
import { TRAINER, cli, ctxFor, makeCatalog, realCatalog, snapshot, tmpProject } from './helpers.js';

const chk = (cwd, catalog = realCatalog, extra = {}) => check(parseArgs(['check']), ctxFor(cwd, catalog, extra));

test('check is pending after a catalog change, clean after update, and never writes', async () => {
  const cwd = await tmpProject();
  const v1 = await makeCatalog({ alpha: ['web'] });
  await install(parseArgs(['install', '--tag', 'web']), ctxFor(cwd, v1.catalog));
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
  await install(parseArgs(['install', '--skill', TRAINER]), ctxFor(cwd));
  await writeFile(join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md'), 'edited');
  const lines = [];
  assert.equal((await chk(cwd, realCatalog, { out: (s) => lines.push(s) })).pending, true);
  assert.ok(lines.join('').includes(`modified: .agents/skills/${TRAINER}/SKILL.md`));
});

test('CLI exit codes: 0 clean, 3 pending, 1 without config', async () => {
  const cwd = await tmpProject();
  const run = (...a) => spawnSync(process.execPath, [cli, ...a, '--cwd', cwd], { encoding: 'utf8' });
  assert.equal(run('check').status, 1);
  assert.equal(run('install', '--skill', TRAINER).status, 0);
  assert.equal(run('check').status, 0);
  await writeFile(join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md'), 'edited');
  const pending = run('check');
  assert.equal(pending.status, 3);
  assert.ok(pending.stdout.includes('modified:'));
  assert.equal(run('update').status, 0); // skips the modified file, exit 0
});
