import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from '../src/args.js';
import { add } from '../src/commands/add.js';
import { changes } from '../src/commands/changes.js';
import { TRAINER, cli, ctxFor, readConfigJson, snapshot, tmpProject, writeLegacyInstall } from './helpers.js';

const CHANGELOG = [
  { version: '0.3.0', notes: ['Third release.', 'Another note.'] },
  { version: '0.2.0', notes: ['Second release.'] },
  { version: '0.1.0', notes: ['Initial release.'] },
];

/** A project with TRAINER installed and `packageVersion` in its config set to `recorded`. */
async function projectAt(recorded) {
  const cwd = await tmpProject();
  await add(parseArgs(['add', '--skill', TRAINER]), ctxFor(cwd));
  const cfg = await readConfigJson(cwd);
  cfg.packageVersion = recorded;
  await writeFile(join(cwd, '.pa-skills.json'), `${JSON.stringify(cfg, null, 2)}\n`);
  return cwd;
}

/** Run `changes` with the injected changelog; returns the output and asserts nothing was written. */
async function run(cwd, packageVersion = '0.3.0', changelog = CHANGELOG) {
  const before = await snapshot(cwd);
  const lines = [];
  await changes(parseArgs(['changes']), ctxFor(cwd, undefined, { changelog, packageVersion, out: (s) => lines.push(s) }));
  assert.deepEqual(await snapshot(cwd), before);
  return lines.join('');
}

test('no config: nothing installed yet', async () => {
  const cwd = await tmpProject();
  assert.equal(await run(cwd), 'Nothing installed yet, so there are no changes to show.\n');
});

test('recorded equals running: already up to date', async () => {
  assert.equal(await run(await projectAt('0.3.0')), 'You already have 0.3.0; no changes to show.\n');
});

test('recorded newer than running: suggests @latest', async () => {
  assert.equal(
    await run(await projectAt('0.4.0')),
    'This CLI (0.3.0) is older than the installed version (0.4.0). Run "npx @pavel-agarkov/skills@latest changes".\n',
  );
});

test('recorded older: lists the entries after it, newest first', async () => {
  assert.equal(
    await run(await projectAt('0.1.0')),
    'Changes since 0.1.0:\n0.3.0\n  - Third release.\n  - Another note.\n0.2.0\n  - Second release.\n',
  );
});

test('recorded not plain: lists every entry up to the running version', async () => {
  assert.equal(
    await run(await projectAt('0.0.0-stage'), '0.2.0'),
    'Changes since 0.0.0-stage:\n0.2.0\n  - Second release.\n0.1.0\n  - Initial release.\n',
  );
});

test('empty range: says so', async () => {
  const sparse = [{ version: '0.3.0', notes: ['Third release.'] }];
  assert.equal(await run(await projectAt('0.2.0'), '0.2.5', sparse), 'No changelog entries between 0.2.0 and 0.2.5.\n');
});

test('CLI: changes in an empty dir exits 0 with the nothing-installed message; help lists it', async () => {
  const cwd = await tmpProject();
  const r = spawnSync(process.execPath, [cli, 'changes', '--cwd', cwd], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('Nothing installed yet, so there are no changes to show.'));
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' }).stdout;
  assert.ok(/^  changes /m.test(help));
});

test('a v0.2.0 install: changes reads the legacy config and never moves it', async () => {
  const cwd = await tmpProject();
  await writeLegacyInstall(cwd, { packageVersion: '0.2.0' });
  assert.equal(await run(cwd), 'Changes since 0.2.0:\n0.3.0\n  - Third release.\n  - Another note.\n');
});
