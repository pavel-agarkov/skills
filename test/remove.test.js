import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { UsageError, parseArgs } from '../src/args.js';
import { add } from '../src/commands/add.js';
import { remove } from '../src/commands/remove.js';
import { update } from '../src/commands/update.js';
import { ASPNET, TRAINER, cli, ctxFor, makeCatalog, readConfigJson, realCatalog, snapshot, tmpProject } from './helpers.js';

// alpha [web, api], beta [web], gamma [api, db], delta [db], omega [solo]
const { catalog: C } = await makeCatalog({ alpha: ['web', 'api'], beta: ['web'], gamma: ['api', 'db'], delta: ['db'], omega: ['solo'] });

const addC = (cwd, argv, catalog = C) => add(parseArgs(['add', ...argv]), ctxFor(cwd, catalog));
const rem = (cwd, argv = [], extra = {}, catalog = C) => remove(parseArgs(['remove', ...argv]), ctxFor(cwd, catalog, extra));
const exists = (p) => stat(p).then(() => true, () => false);
const installed = async (cwd) => ((await exists(join(cwd, '.agents', 'skills'))) ? (await readdir(join(cwd, '.agents', 'skills'))).sort() : []);
const withOut = async (fn) => {
  const lines = [];
  const r = await fn((s) => lines.push(s));
  return { r, text: lines.join('') };
};

test('no config: nothing-to-remove message and null; an unknown name is still a usage error', async () => {
  const cwd = await tmpProject();
  const { r, text } = await withOut((out) => rem(cwd, [], { out }));
  assert.equal(r, null);
  assert.ok(text.includes('Nothing to remove'));
  assert.equal((await withOut((out) => rem(cwd, ['--skill', 'alpha'], { out }))).r, null);
  await assert.rejects(rem(cwd, ['--skill', 'nope']), UsageError);
  assert.deepEqual(await readdir(cwd), []);
});

test('single skill', async () => {
  const cwd = await tmpProject();
  await addC(cwd, ['--skill', 'alpha,beta,gamma']);
  const r = await rem(cwd, ['--skill', 'alpha']);
  assert.deepEqual(await installed(cwd), ['beta', 'gamma']);
  assert.ok(r.removed.includes('.agents/skills/alpha/SKILL.md'));
  const cfg = await readConfigJson(cwd);
  assert.deepEqual([cfg.skills, cfg.tags, cfg.installed.skills], [['beta', 'gamma'], [], ['beta', 'gamma']]);
  assert.ok(!cfg.installed.files.some((f) => f.path.includes('/alpha/')));
});

test('several skills', async () => {
  const cwd = await tmpProject();
  await addC(cwd, ['--skill', 'alpha,beta,gamma']);
  await rem(cwd, ['--skill', 'alpha', '--skill', 'gamma']);
  assert.deepEqual(await installed(cwd), ['beta']);
  assert.deepEqual((await readConfigJson(cwd)).skills, ['beta']);
});

test('one tag removes every skill carrying it', async () => {
  const cwd = await tmpProject();
  await addC(cwd, ['--tag', 'web,db']);
  assert.deepEqual(await installed(cwd), ['alpha', 'beta', 'delta', 'gamma']);
  await rem(cwd, ['--tag', 'web']);
  assert.deepEqual(await installed(cwd), ['delta', 'gamma']);
  const cfg = await readConfigJson(cwd);
  assert.deepEqual([cfg.skills, cfg.tags], [[], ['db']]);
});

test('several tags', async () => {
  const cwd = await tmpProject();
  await addC(cwd, ['--tag', 'web,db,api']);
  await rem(cwd, ['--tag', 'web,db']);
  // alpha and gamma stay through the api tag
  assert.deepEqual(await installed(cwd), ['alpha', 'gamma']);
  assert.deepEqual((await readConfigJson(cwd)).tags, ['api']);
});

test('mixed names and tags', async () => {
  const cwd = await tmpProject();
  await addC(cwd, ['--skill', 'delta,gamma', '--tag', 'web']);
  await rem(cwd, ['--skill', 'delta', '--tag', 'web']);
  assert.deepEqual(await installed(cwd), ['gamma']);
  const cfg = await readConfigJson(cwd);
  assert.deepEqual([cfg.skills, cfg.tags], [['gamma'], []]);
});

test('removing a tag also removes an explicitly added skill carrying it, from disk and config; update does not bring it back', async () => {
  const cwd = await tmpProject();
  await addC(cwd, ['--skill', 'alpha,delta', '--tag', 'web']);
  await rem(cwd, ['--tag', 'web']);
  assert.deepEqual(await installed(cwd), ['delta']);
  const cfg = await readConfigJson(cwd);
  assert.deepEqual([cfg.skills, cfg.tags, cfg.installed.skills], [['delta'], [], ['delta']]);
  await update(parseArgs(['update']), ctxFor(cwd, C));
  assert.deepEqual(await installed(cwd), ['delta']);
});

test('a skill still covered by another selected tag stays and is reported with a hint', async () => {
  const cwd = await tmpProject();
  await addC(cwd, ['--tag', 'web,api']);
  const { r, text } = await withOut((out) => rem(cwd, ['--tag', 'web'], { out }));
  assert.deepEqual(await installed(cwd), ['alpha', 'gamma']);
  assert.deepEqual(r.covered, ['alpha']);
  assert.ok(text.includes('skill "alpha" is still selected by tag "api"') && text.includes('remove --tag api'));
  assert.deepEqual((await readConfigJson(cwd)).tags, ['api']);

  // removing by name a skill that is only selected through a tag
  const other = await tmpProject();
  await addC(other, ['--tag', 'db']);
  const second = await withOut((out) => rem(other, ['--skill', 'delta'], { out }));
  assert.deepEqual(await installed(other), ['delta', 'gamma']);
  assert.ok(second.text.includes('remove --tag db'));
  assert.ok(!second.text.includes('nothing to remove'));

  // an explicit name covered by another tag leaves `skills` but stays installed
  const third = await tmpProject();
  await addC(third, ['--skill', 'alpha', '--tag', 'web,api']);
  await rem(third, ['--tag', 'web']);
  const cfg = await readConfigJson(third);
  assert.deepEqual([cfg.skills, cfg.tags], [[], ['api']]);
  assert.deepEqual(await installed(third), ['alpha', 'gamma']);
});

test('unknown name or tag aborts with a usage error and nothing is changed', async () => {
  const cwd = await tmpProject();
  await writeFile(join(cwd, 'AGENTS.md'), '# mine\n');
  await addC(cwd, ['--skill', 'alpha,beta', '--agents-md']);
  const before = await snapshot(cwd);
  await assert.rejects(rem(cwd, ['--skill', 'alpha,nope']), (e) => e instanceof UsageError && /unknown skill: nope.*valid:.*alpha/.test(e.message));
  await assert.rejects(rem(cwd, ['--tag', 'nope']), /unknown tag: nope.*valid:.*web/);
  await assert.rejects(rem(cwd, ['--skill', 'alpha', '--tag', 'nope', '--dry-run']), UsageError);
  assert.deepEqual(await snapshot(cwd), before);
});

test('a known name or tag outside the saved selection is a warning and changes nothing', async () => {
  const cwd = await tmpProject();
  await addC(cwd, ['--skill', 'alpha']);
  const before = await snapshot(cwd);
  const { text } = await withOut((out) => rem(cwd, ['--skill', 'beta', '--tag', 'db'], { out }));
  assert.ok(text.includes('skill "beta" is not in the saved selection; nothing to remove'));
  assert.ok(text.includes('tag "db" is not in the saved selection; nothing to remove'));
  assert.deepEqual(await snapshot(cwd), before);
});

test('removing the last remaining skill is a full removal', async () => {
  const cwd = await tmpProject();
  const outside = '# Team\n\ntext\n';
  await writeFile(join(cwd, 'AGENTS.md'), outside);
  await addC(cwd, ['--skill', 'alpha,beta', '--agents-md']);
  await rem(cwd, ['--skill', 'alpha']);
  const r = await rem(cwd, ['--skill', 'beta']);
  assert.equal(r.full, true);
  assert.equal(await exists(join(cwd, '.agents')), false);
  assert.equal(await readFile(join(cwd, 'AGENTS.md'), 'utf8'), outside);

  const tagged = await tmpProject();
  await addC(tagged, ['--tag', 'web']);
  assert.equal((await rem(tagged, ['--tag', 'web'])).full, true);
  assert.deepEqual(await readdir(tagged), []);
});

test('consumer-added and consumer-modified files, their dirs, and AGENTS.md text outside the markers stay byte-identical', async () => {
  const cwd = await tmpProject();
  const outside = '# Team\n\nhand written\n';
  await writeFile(join(cwd, 'AGENTS.md'), outside);
  await addC(cwd, ['--skill', 'alpha,beta,gamma', '--agents-md']);
  const own = join(cwd, '.agents', 'skills', 'alpha', 'mine.md');
  await writeFile(own, 'mine');
  const edited = join(cwd, '.agents', 'skills', 'beta', 'SKILL.md');
  await writeFile(edited, 'edited');
  const untouched = await readFile(join(cwd, '.agents', 'skills', 'gamma', 'SKILL.md'));

  const { text } = await withOut((out) => rem(cwd, ['--skill', 'alpha,beta'], { out }));
  assert.equal(await readFile(own, 'utf8'), 'mine');
  assert.equal(await readFile(edited, 'utf8'), 'edited');
  assert.equal(await exists(join(cwd, '.agents', 'skills', 'alpha', 'SKILL.md')), false);
  assert.deepEqual(await readFile(join(cwd, '.agents', 'skills', 'gamma', 'SKILL.md')), untouched);
  assert.ok(text.includes('modified locally; left untouched'));
  const md = await readFile(join(cwd, 'AGENTS.md'), 'utf8');
  assert.ok(md.startsWith(outside) && md.includes('**gamma**') && !md.includes('**alpha**') && !md.includes('**beta**'));

  // the final full removal also leaves them, and the outside text, alone
  await rem(cwd, ['--skill', 'gamma']);
  assert.equal(await readFile(own, 'utf8'), 'mine');
  assert.equal(await readFile(edited, 'utf8'), 'edited');
  assert.equal(await readFile(join(cwd, 'AGENTS.md'), 'utf8'), outside);
  assert.deepEqual(Object.keys(await snapshot(join(cwd, '.agents'))).sort(), ['skills/alpha/mine.md', 'skills/beta/SKILL.md']);
});

test('plain remove removes exactly what was installed; leaves consumer-modified and consumer-added files', async () => {
  const cwd = await tmpProject();
  const outside = '# Team\n\nhand written\n';
  await writeFile(join(cwd, 'AGENTS.md'), outside);
  await add(parseArgs(['add', '--skill', `${TRAINER},${ASPNET}`, '--agents-md']), ctxFor(cwd));
  const own = join(cwd, '.agents', 'skills', TRAINER, 'mine.md');
  await writeFile(own, 'mine');
  const edited = join(cwd, '.agents', 'skills', ASPNET, 'SKILL.md');
  await writeFile(edited, 'edited');

  const { text } = await withOut((out) => remove(parseArgs(['remove']), ctxFor(cwd, realCatalog, { out })));
  assert.equal(await readFile(own, 'utf8'), 'mine');
  assert.equal(await readFile(edited, 'utf8'), 'edited');
  assert.equal(await readFile(join(cwd, 'AGENTS.md'), 'utf8'), outside);
  assert.equal(await exists(join(cwd, '.agents', '.pa-skills-config.json')), false);
  assert.equal(await exists(join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md')), false);
  assert.ok(text.includes('modified locally; left in place'));
  assert.deepEqual(Object.keys(await snapshot(join(cwd, '.agents'))).sort(), [`skills/${ASPNET}/SKILL.md`, `skills/${TRAINER}/mine.md`]);
});

test('add followed by remove of the same selection leaves the project byte-identical', async () => {
  const shapes = [
    ['--skill', 'alpha'],
    ['--skill', 'alpha,beta'],
    ['--tag', 'web'],
    ['--tag', 'web,db'],
    ['--skill', 'delta', '--tag', 'web'],
    ['--skill', 'alpha', '--tag', 'web', '--agents-md'],
  ];
  for (const shape of shapes) {
    // from an empty project, and beside consumer-authored files and an existing AGENTS.md
    const empty = await tmpProject();
    const before = await snapshot(empty);
    await addC(empty, shape);
    await rem(empty, shape);
    assert.deepEqual(await snapshot(empty), before, `empty project, ${shape.join(' ')}`);

    // beside consumer-authored files, an existing AGENTS.md and an unrelated installed skill
    const busy = await tmpProject();
    await mkdir(join(busy, 'src'));
    await writeFile(join(busy, 'src', 'keep.txt'), 'keep');
    await writeFile(join(busy, 'AGENTS.md'), '# Mine\n\ntext\n');
    await addC(busy, ['--skill', 'omega', '--agents-md']);
    const base = await snapshot(busy);
    const extra = shape.filter((a) => a !== '--agents-md');
    await addC(busy, extra);
    await rem(busy, extra);
    assert.deepEqual(await snapshot(busy), base, `busy project, ${shape.join(' ')}`);
  }
});

test('--agents-md: kept in sync after remove --skill; removed by remove --agents-md while skills stay', async () => {
  const cwd = await tmpProject();
  const outside = '# Mine\n\ntext\n';
  await writeFile(join(cwd, 'AGENTS.md'), outside);
  await addC(cwd, ['--skill', 'alpha,beta,gamma', '--agents-md']);
  await rem(cwd, ['--skill', 'alpha']);
  let md = await readFile(join(cwd, 'AGENTS.md'), 'utf8');
  assert.ok(md.startsWith(outside) && md.includes('**beta**') && md.includes('**gamma**') && !md.includes('**alpha**'));
  assert.equal((await readConfigJson(cwd)).agentsMd, true);

  await rem(cwd, ['--agents-md']);
  assert.equal(await readFile(join(cwd, 'AGENTS.md'), 'utf8'), outside);
  assert.deepEqual(await installed(cwd), ['beta', 'gamma']);
  const cfg = await readConfigJson(cwd);
  assert.equal(cfg.agentsMd, false);
  assert.deepEqual(cfg.installed.agentsMd, { present: false, createdFile: false });

  // the index stays off for later add / update / remove runs
  await addC(cwd, ['--skill', 'delta']);
  await update(parseArgs(['update']), ctxFor(cwd, C));
  await rem(cwd, ['--skill', 'delta']);
  assert.equal(await readFile(join(cwd, 'AGENTS.md'), 'utf8'), outside);
});

test('remove --agents-md alone deletes an installer-created AGENTS.md and keeps the skills; with skill flags it removes those too', async () => {
  const cwd = await tmpProject();
  await addC(cwd, ['--skill', 'alpha,beta', '--agents-md']);
  assert.equal(await exists(join(cwd, 'AGENTS.md')), true);
  await rem(cwd, ['--agents-md']);
  assert.equal(await exists(join(cwd, 'AGENTS.md')), false);
  assert.deepEqual(await installed(cwd), ['alpha', 'beta']);

  await addC(cwd, ['--agents-md']);
  assert.ok((await readFile(join(cwd, 'AGENTS.md'), 'utf8')).includes('**beta**'));
  await rem(cwd, ['--skill', 'alpha', '--agents-md']);
  assert.deepEqual(await installed(cwd), ['beta']);
  assert.equal(await exists(join(cwd, 'AGENTS.md')), false);
  assert.equal((await readConfigJson(cwd)).agentsMd, false);
});

test('remove --agents-md with the index off is a no-op', async () => {
  const cwd = await tmpProject();
  await addC(cwd, ['--skill', 'alpha']);
  const before = await snapshot(cwd);
  await rem(cwd, ['--agents-md']);
  assert.deepEqual(await snapshot(cwd), before);
});

test('--dry-run writes nothing (partial and full)', async () => {
  const cwd = await tmpProject();
  await addC(cwd, ['--skill', 'alpha,beta', '--agents-md']);
  const before = await snapshot(cwd);
  for (const argv of [['--dry-run'], ['--skill', 'alpha', '--dry-run'], ['--agents-md', '--dry-run'], ['--skill', 'alpha,beta', '--dry-run']]) {
    const { r, text } = await withOut((out) => rem(cwd, argv, { out }));
    assert.ok(text.includes('[dry-run]'), argv.join(' '));
    assert.ok(r.removed.length > 0 || argv.includes('--agents-md'));
    assert.deepEqual(await snapshot(cwd), before, argv.join(' '));
  }
});

test('items already deleted by hand are warnings; the rest is removed and the config deleted', async () => {
  const cwd = await tmpProject();
  await writeFile(join(cwd, 'AGENTS.md'), '# keep\n');
  await add(parseArgs(['add', '--skill', `${TRAINER},${ASPNET}`, '--agents-md']), ctxFor(cwd));
  await rm(join(cwd, '.agents', 'skills', ASPNET), { recursive: true });
  await rm(join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md'));
  await writeFile(join(cwd, 'AGENTS.md'), '# keep\n'); // block gone
  const { text } = await withOut((out) => remove(parseArgs(['remove']), ctxFor(cwd, realCatalog, { out })));
  assert.ok(text.includes('was already removed'));
  assert.ok(text.includes('skills block was already gone'));
  assert.equal(await readFile(join(cwd, 'AGENTS.md'), 'utf8'), '# keep\n');
  assert.equal(await exists(join(cwd, '.agents', '.pa-skills-config.json')), false);
  assert.equal(await exists(join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md')), false);
});

test('everything deleted by hand (files, folders, AGENTS.md): still succeeds and deletes the config', async () => {
  const cwd = await tmpProject();
  await add(parseArgs(['add', '--skill', TRAINER, '--agents-md']), ctxFor(cwd));
  await rm(join(cwd, '.agents', 'skills'), { recursive: true });
  await rm(join(cwd, 'AGENTS.md'));
  const { text } = await withOut((out) => remove(parseArgs(['remove']), ctxFor(cwd, realCatalog, { out })));
  assert.ok(text.includes('AGENTS.md was already removed'));
  assert.deepEqual(await readdir(cwd), []);
});

test('a skill folder deleted by hand is a warning when removing it by name; AGENTS.md hand-deleted is a warning too', async () => {
  const cwd = await tmpProject();
  await addC(cwd, ['--skill', 'alpha,beta', '--agents-md']);
  await rm(join(cwd, '.agents', 'skills', 'alpha'), { recursive: true });
  await rm(join(cwd, 'AGENTS.md'));
  const { text } = await withOut((out) => rem(cwd, ['--skill', 'alpha'], { out }));
  assert.ok(text.includes('.agents/skills/alpha/SKILL.md was already removed; dropped from config'));
  assert.deepEqual(await installed(cwd), ['beta']);
  assert.ok(!(await readConfigJson(cwd)).installed.files.some((f) => f.path.includes('/alpha/')));
  assert.ok(text.includes('AGENTS.md skills block was missing; recreated'));
});

test('unpaired AGENTS.md marker aborts before deleting anything (full and partial)', async () => {
  const cwd = await tmpProject();
  await addC(cwd, ['--skill', 'alpha,beta', '--agents-md']);
  const text = await readFile(join(cwd, 'AGENTS.md'), 'utf8');
  await writeFile(join(cwd, 'AGENTS.md'), text.replace('<!-- END @pavel-agarkov/skills -->', ''));
  const before = await snapshot(cwd);
  await assert.rejects(rem(cwd), /unpaired/);
  await assert.rejects(rem(cwd, ['--skill', 'alpha']), /unpaired/);
  await assert.rejects(rem(cwd, ['--skill', 'alpha,beta']), /unpaired/);
  await assert.rejects(rem(cwd, ['--agents-md']), /unpaired/);
  assert.deepEqual(await snapshot(cwd), before);
});

test('CLI exit codes: remove 0 with and without a config; unknown names and removed commands/flags exit 2', async () => {
  const cwd = await tmpProject();
  const run = (...a) => spawnSync(process.execPath, [cli, ...a, '--cwd', cwd], { encoding: 'utf8' });
  assert.equal(run('remove').status, 0);
  assert.equal(run('add', '--skill', TRAINER).status, 0);
  assert.equal(run('add', '--skill', ASPNET, '--agents-md').status, 0);
  const before = await snapshot(cwd);
  assert.equal(run('remove', '--skill', 'nope').status, 2);
  assert.equal(run('remove', '--tag', 'nope').status, 2);
  assert.equal(run('remove', '--no-agents-md').status, 2);
  for (const c of ['install', 'uninstall', 'configure']) assert.equal(run(c).status, 2, c);
  assert.deepEqual(await snapshot(cwd), before);

  assert.equal(run('remove', '--skill', TRAINER).status, 0);
  assert.deepEqual(await installed(cwd), [ASPNET]);
  assert.equal(run('remove', '--skill', ASPNET).status, 0);
  assert.deepEqual(await readdir(cwd), []);
  assert.equal(run('add', '--tag', 'dotnet').status, 0);
  assert.equal(run('remove', '--tag', 'dotnet').status, 0);
  assert.deepEqual(await readdir(cwd), []);

  assert.equal(run('add', '--skill', TRAINER).status, 0);
  await rm(join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md'));
  assert.equal(run('remove').status, 0);
  assert.equal(run('update').status, 1);
  assert.equal(await exists(join(cwd, '.agents')), false);
});
