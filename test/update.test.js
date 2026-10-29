import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from '../src/args.js';
import { add } from '../src/commands/add.js';
import { update } from '../src/commands/update.js';
import { ASPNET, TRAINER, ctxFor, makeCatalog, readConfigJson, realCatalog, snapshot, tmpProject } from './helpers.js';

const inst = (cwd, argv, catalog = realCatalog) => add(parseArgs(['add', ...argv]), ctxFor(cwd, catalog));
const upd = (cwd, argv = [], catalog = realCatalog, extra = {}) => update(parseArgs(['update', ...argv]), ctxFor(cwd, catalog, extra));
const skillMd = (n) => `.agents/skills/${n}/SKILL.md`;
const exists = (p) => stat(p).then(() => true, () => false);

test('no config means nothing installed', async () => {
  const cwd = await tmpProject();
  await assert.rejects(upd(cwd), /nothing installed/);
});

test('consumer files stay byte-identical; modified file skipped, --force overwrites and re-records the hash', async () => {
  const cwd = await tmpProject();
  const outside = '# Team rules\n\nBe kind.\n';
  await writeFile(join(cwd, 'AGENTS.md'), outside);
  await inst(cwd, ['--skill', TRAINER, '--agents-md']);
  const own = join(cwd, '.agents', 'skills', TRAINER, 'my-notes.md');
  await writeFile(own, 'mine');
  const skillFile = join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md');
  const original = await readFile(skillFile);
  await writeFile(skillFile, 'consumer edit');

  const lines = [];
  const r = await upd(cwd, [], realCatalog, { out: (s) => lines.push(s) });
  assert.deepEqual(r.result.modified, [skillMd(TRAINER)]);
  assert.ok(lines.join('').includes('modified locally'));
  assert.equal(await readFile(skillFile, 'utf8'), 'consumer edit');
  assert.equal(await readFile(own, 'utf8'), 'mine');
  assert.ok((await readFile(join(cwd, 'AGENTS.md'), 'utf8')).startsWith(outside));
  assert.ok(!(await readConfigJson(cwd)).installed.files.some((f) => f.path === skillMd(TRAINER)));

  await upd(cwd, ['--force']);
  assert.deepEqual(await readFile(skillFile), original);
  const rec = (await readConfigJson(cwd)).installed.files.find((f) => f.path === skillMd(TRAINER));
  assert.ok(rec && /^[0-9a-f]{64}$/.test(rec.sha256));
  assert.equal(await readFile(own, 'utf8'), 'mine');
});

test('a new skill gaining a selected tag is picked up; a skill leaving the catalog is removed', async () => {
  const cwd = await tmpProject();
  const v1 = await makeCatalog({ alpha: ['web'], beta: ['web'], gamma: ['other'] });
  await inst(cwd, ['--tag', 'web'], v1.catalog);
  assert.deepEqual((await readConfigJson(cwd)).installed.skills, ['alpha', 'beta']);

  const v2 = await makeCatalog({ alpha: ['web'], gamma: ['web'], delta: ['web'] }); // beta gone, gamma/delta gain web
  const r = await upd(cwd, [], v2.catalog, { packageVersion: '0.2.0' });
  assert.deepEqual(r.resolved, ['alpha', 'delta', 'gamma']);
  assert.ok(r.result.added.includes(skillMd('gamma')) && r.result.added.includes(skillMd('delta')));
  assert.deepEqual(r.result.removed, [skillMd('beta')]);
  assert.equal(await exists(join(cwd, '.agents', 'skills', 'beta')), false);
  const cfg = await readConfigJson(cwd);
  assert.equal(cfg.packageVersion, '0.2.0');
  assert.deepEqual(cfg.installed.skills, ['alpha', 'delta', 'gamma']);

  // a tag no longer carried by a skill removes it
  const v3 = await makeCatalog({ alpha: ['web'], gamma: ['other'], delta: ['web'] });
  const r3 = await upd(cwd, [], v3.catalog);
  assert.deepEqual(r3.result.removed, [skillMd('gamma')]);
});

test('a saved explicit skill that no longer exists is dropped with a warning', async () => {
  const cwd = await tmpProject();
  const v1 = await makeCatalog({ alpha: ['a'], beta: ['b'] });
  await inst(cwd, ['--skill', 'alpha,beta'], v1.catalog);
  const v2 = await makeCatalog({ alpha: ['a'] });
  const lines = [];
  await upd(cwd, [], v2.catalog, { out: (s) => lines.push(s) });
  assert.ok(lines.join('').includes('saved skill "beta" is no longer in the package'));
  const cfg = await readConfigJson(cwd);
  assert.deepEqual(cfg.skills, ['alpha']);
  assert.equal(await exists(join(cwd, '.agents', 'skills', 'beta')), false);
});

test('--dry-run writes nothing', async () => {
  const cwd = await tmpProject();
  const v1 = await makeCatalog({ alpha: ['web'] });
  await inst(cwd, ['--tag', 'web'], v1.catalog);
  const before = await snapshot(cwd);
  const v2 = await makeCatalog({ alpha: ['web'], beta: ['web'] });
  const lines = [];
  const r = await upd(cwd, ['--dry-run'], v2.catalog, { out: (s) => lines.push(s), packageVersion: '9.9.9' });
  assert.deepEqual(r.result.added, [skillMd('beta')]);
  assert.ok(lines.join('').includes('[dry-run]'));
  assert.deepEqual(await snapshot(cwd), before);
});

test('hand-deleted skill files, folders and AGENTS.md are recreated with a warning', async () => {
  const cwd = await tmpProject();
  await inst(cwd, ['--skill', `${TRAINER},${ASPNET}`, '--agents-md']);
  await rm(join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md'));
  await rm(join(cwd, '.agents', 'skills', ASPNET), { recursive: true });
  await rm(join(cwd, 'AGENTS.md'));
  const lines = [];
  const r = await upd(cwd, [], realCatalog, { out: (s) => lines.push(s) });
  const text = lines.join('');
  assert.ok(text.includes(`${skillMd(TRAINER)} was missing; restored`));
  assert.ok(text.includes(`${skillMd(ASPNET)} was missing; restored`));
  assert.ok(text.includes('AGENTS.md skills block was missing; recreated'));
  assert.ok(r.result.restored.length >= 2);
  assert.equal(await exists(join(cwd, '.agents', 'skills', ASPNET, 'SKILL.md')), true);
  assert.ok((await readFile(join(cwd, 'AGENTS.md'), 'utf8')).includes(TRAINER));
  assert.equal(await exists(join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md')), true);
});

test('hand-deleted files of a skill that left the catalog are only dropped from the config', async () => {
  const cwd = await tmpProject();
  const v1 = await makeCatalog({ alpha: ['web'], beta: ['web'] });
  await inst(cwd, ['--tag', 'web'], v1.catalog);
  await rm(join(cwd, '.agents', 'skills', 'beta'), { recursive: true });
  const v2 = await makeCatalog({ alpha: ['web'] });
  const lines = [];
  const r = await upd(cwd, [], v2.catalog, { out: (s) => lines.push(s) });
  assert.deepEqual(r.result.missing, [skillMd('beta')]);
  assert.ok(lines.join('').includes('already removed; dropped from config'));
  assert.ok(!(await readConfigJson(cwd)).installed.files.some((f) => f.path.includes('/beta/')));
});

test('unpaired AGENTS.md marker aborts update before any skill file is written', async () => {
  const cwd = await tmpProject();
  await inst(cwd, ['--skill', TRAINER, '--agents-md']);
  const text = await readFile(join(cwd, 'AGENTS.md'), 'utf8');
  await writeFile(join(cwd, 'AGENTS.md'), text.replace('<!-- END @pavel-agarkov/skills -->', ''));
  await rm(join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md'));
  await assert.rejects(upd(cwd), /unpaired/);
  assert.equal(await exists(join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md')), false);
});
