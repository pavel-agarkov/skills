import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { UsageError, parseArgs } from '../src/args.js';
import { configure } from '../src/commands/configure.js';
import { install } from '../src/commands/install.js';
import { ASPNET, TRAINER, ctxFor, readConfigJson, realCatalog, snapshot, tmpProject } from './helpers.js';

const inst = (cwd, argv) => install(parseArgs(['install', ...argv]), ctxFor(cwd));
const conf = (cwd, argv, extra = {}) => configure(parseArgs(['configure', ...argv]), ctxFor(cwd, realCatalog, extra));
const exists = (p) => stat(p).then(() => true, () => false);

test('no config means nothing installed', async () => {
  await assert.rejects(conf(await tmpProject(), ['--skill', TRAINER]), /nothing installed/);
});

test('selection flags replace the saved selection; consumer files and AGENTS.md text survive', async () => {
  const cwd = await tmpProject();
  const outside = '# Mine\n\ntext\n';
  await writeFile(join(cwd, 'AGENTS.md'), outside);
  await inst(cwd, ['--skill', TRAINER, '--agents-md']);
  const own = join(cwd, '.agents', 'skills', TRAINER, 'mine.md');
  await writeFile(own, 'mine');
  const r = await conf(cwd, ['--skill', ASPNET]);
  assert.deepEqual(r.resolved, [ASPNET]);
  const cfg = await readConfigJson(cwd);
  assert.deepEqual([cfg.skills, cfg.tags], [[ASPNET], []]);
  assert.equal(await exists(join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md')), false);
  assert.equal(await readFile(own, 'utf8'), 'mine'); // consumer file and its dir stay
  const md = await readFile(join(cwd, 'AGENTS.md'), 'utf8');
  assert.ok(md.startsWith(outside) && md.includes(ASPNET) && !md.includes(`**${TRAINER}**`));
});

test('--agents-md alone changes only that option; --no-agents-md removes the block', async () => {
  const cwd = await tmpProject();
  const outside = '# Mine\n';
  await writeFile(join(cwd, 'AGENTS.md'), outside);
  await inst(cwd, ['--skill', TRAINER]);
  const filesBefore = (await readConfigJson(cwd)).installed.files;
  await conf(cwd, ['--agents-md']);
  let cfg = await readConfigJson(cwd);
  assert.equal(cfg.agentsMd, true);
  assert.deepEqual(cfg.skills, [TRAINER]);
  assert.deepEqual(cfg.installed.files, filesBefore);
  assert.ok((await readFile(join(cwd, 'AGENTS.md'), 'utf8')).includes(TRAINER));
  await conf(cwd, ['--no-agents-md']);
  assert.equal(await readFile(join(cwd, 'AGENTS.md'), 'utf8'), outside);
  cfg = await readConfigJson(cwd);
  assert.equal(cfg.agentsMd, false);
  assert.equal(cfg.installed.agentsMd.present, false);
});

test('modified files are skipped, --force overwrites and re-records', async () => {
  const cwd = await tmpProject();
  await inst(cwd, ['--skill', TRAINER]);
  const f = join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md');
  const original = await readFile(f);
  await writeFile(f, 'edit');
  const r = await conf(cwd, ['--skill', `${TRAINER},${ASPNET}`]);
  assert.equal(r.result.modified.length, 1);
  assert.equal(await readFile(f, 'utf8'), 'edit');
  await conf(cwd, ['--skill', `${TRAINER},${ASPNET}`, '--force']);
  assert.deepEqual(await readFile(f), original);
  assert.ok((await readConfigJson(cwd)).installed.files.some((x) => x.path.endsWith(`${TRAINER}/SKILL.md`)));
});

test('unknown names abort before writing', async () => {
  const cwd = await tmpProject();
  await inst(cwd, ['--skill', TRAINER]);
  const before = await snapshot(cwd);
  await assert.rejects(conf(cwd, ['--skill', 'nope']), /unknown skill: nope/);
  assert.deepEqual(await snapshot(cwd), before);
});

test('no flags without a TTY is a usage error; with a TTY the picker is used', async () => {
  const cwd = await tmpProject();
  await inst(cwd, ['--skill', TRAINER]);
  await assert.rejects(conf(cwd, []), UsageError);
  const names = [...realCatalog.skills.keys()];
  const input = Readable.from([`${names.indexOf(ASPNET) + 1}\n`]);
  const output = new Writable({ write: (_c, _e, cb) => cb() });
  await conf(cwd, [], { isTTY: true, input, output });
  assert.deepEqual((await readConfigJson(cwd)).installed.skills, [ASPNET]);
});

test('--dry-run writes nothing', async () => {
  const cwd = await tmpProject();
  await inst(cwd, ['--skill', TRAINER]);
  const before = await snapshot(cwd);
  const r = await conf(cwd, ['--skill', ASPNET, '--agents-md', '--dry-run']);
  assert.ok(r.result.added.length > 0 && r.result.removed.length > 0);
  assert.deepEqual(await snapshot(cwd), before);
});

test('removing a skill whose files were deleted by hand updates the config with a warning', async () => {
  const cwd = await tmpProject();
  await inst(cwd, ['--skill', `${TRAINER},${ASPNET}`]);
  await rm(join(cwd, '.agents', 'skills', ASPNET), { recursive: true });
  const lines = [];
  const r = await conf(cwd, ['--skill', TRAINER], { out: (s) => lines.push(s) });
  assert.ok(r.result.missing.length > 0);
  assert.ok(lines.join('').includes('already removed; dropped from config'));
  const cfg = await readConfigJson(cwd);
  assert.deepEqual(cfg.installed.skills, [TRAINER]);
  assert.ok(!cfg.installed.files.some((f) => f.path.includes(ASPNET)));
});

test('replacement is per kind: --tag keeps saved skills, --skill keeps saved tags', async () => {
  const cwd = await tmpProject();
  await inst(cwd, ['--skill', TRAINER]);
  await conf(cwd, ['--tag', 'dotnet']);
  let cfg = await readConfigJson(cwd);
  assert.deepEqual([cfg.skills, cfg.tags], [[TRAINER], ['dotnet']]);
  assert.deepEqual(cfg.installed.skills, [ASPNET, TRAINER].sort());
  await conf(cwd, ['--skill', ASPNET]);
  cfg = await readConfigJson(cwd);
  assert.deepEqual([cfg.skills, cfg.tags], [[ASPNET], ['dotnet']]);
  assert.deepEqual(cfg.installed.skills, [ASPNET]);
});
