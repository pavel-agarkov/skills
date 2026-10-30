import { test } from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from '../src/args.js';
import { add } from '../src/commands/add.js';
import { update } from '../src/commands/update.js';
import { check } from '../src/commands/check.js';
import { remove } from '../src/commands/remove.js';
import { ASPNET, CONFIG_FILE, LEGACY_CONFIG_FILE, TRAINER, cli, ctxFor, makeCatalog, readConfigJson, realCatalog, snapshot, tmpProject, writeLegacyInstall } from './helpers.js';

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

const NOTES = [
  { version: '0.3.0', notes: ['Third release.'] },
  { version: '0.2.0', notes: ['Second release.'] },
  { version: '0.1.0', notes: ['Initial release.'] },
];

const outputOf = async (fn) => {
  const lines = [];
  await fn((s) => lines.push(s));
  return lines.join('');
};

test('update prints the changes since the previously recorded version', async () => {
  const cwd = await tmpProject();
  await inst(cwd, ['--skill', TRAINER]);
  const text = await outputOf((out) => upd(cwd, [], realCatalog, { changelog: NOTES, packageVersion: '0.3.0', out }));
  assert.ok(text.includes('Changes since 0.1.0:\n0.3.0\n  - Third release.\n0.2.0\n  - Second release.\n'), text);
  assert.ok(!text.includes('Initial release.'));
  assert.ok(text.indexOf('Changes since') > text.indexOf('Nothing to change'));
  assert.equal((await readConfigJson(cwd)).packageVersion, '0.3.0');
});

test('update prints every entry when the recorded version is not plain', async () => {
  const cwd = await tmpProject();
  await inst(cwd, ['--skill', TRAINER]);
  const cfg = await readConfigJson(cwd);
  cfg.packageVersion = '0.0.0-stage';
  await writeFile(join(cwd, '.pa-skills.json'), `${JSON.stringify(cfg, null, 2)}\n`);
  const text = await outputOf((out) => upd(cwd, [], realCatalog, { changelog: NOTES, packageVersion: '0.3.0', out }));
  assert.ok(text.includes('Changes since 0.0.0-stage:\n0.3.0\n  - Third release.\n0.2.0\n  - Second release.\n0.1.0\n  - Initial release.\n'), text);
});

test('update prints no changes when the version is unchanged, with --dry-run, in check, or without a changelog', async () => {
  const cwd = await tmpProject();
  await inst(cwd, ['--skill', TRAINER]);
  const same = await outputOf((out) => upd(cwd, [], realCatalog, { changelog: NOTES, out }));
  assert.ok(!same.includes('Changes since'), same);
  const dry = await outputOf((out) => upd(cwd, ['--dry-run'], realCatalog, { changelog: NOTES, packageVersion: '0.3.0', out }));
  assert.ok(!dry.includes('Changes since'), dry);
  const chk = await outputOf((out) => check(parseArgs(['check']), ctxFor(cwd, realCatalog, { changelog: NOTES, packageVersion: '0.3.0', out })));
  assert.ok(!chk.includes('Changes since'), chk);
  assert.equal((await readConfigJson(cwd)).packageVersion, '0.1.0');
  const none = await outputOf((out) => upd(cwd, [], realCatalog, { changelog: undefined, packageVersion: '0.3.0', out }));
  assert.ok(!none.includes('Changes since'), none);
});

/** Snapshot without the given config file, to compare everything else across a config move. */
const snapshotWithout = async (cwd, rel) => {
  const all = await snapshot(cwd);
  delete all[rel];
  return all;
};

test('upgrade: update on a v0.2.0 install moves the config to .pa-skills.json v2; skill files and AGENTS.md stay byte-identical', async () => {
  for (const agentsMd of [false, true]) {
    const cwd = await tmpProject();
    await writeLegacyInstall(cwd, { agentsMd, skills: [TRAINER, ASPNET] });
    const before = await snapshotWithout(cwd, LEGACY_CONFIG_FILE);
    const legacy = JSON.parse(await readFile(join(cwd, ...LEGACY_CONFIG_FILE.split('/')), 'utf8'));

    const lines = [];
    const r = await upd(cwd, [], realCatalog, { packageVersion: '0.2.0', out: (s) => lines.push(s) });
    assert.ok(lines.join('').includes('config: moved .agents/.pa-skills-config.json → .pa-skills.json\n'), lines.join(''));
    assert.deepEqual([r.result.added, r.result.updated, r.result.removed, r.rulesActions.map((a) => a.action)], [[], [], [], agentsMd ? ['none'] : []], `agentsMd ${agentsMd}`);

    const cfg = await readConfigJson(cwd);
    assert.equal(cfg.version, 2);
    assert.deepEqual(cfg.agents, ['universal']);
    assert.deepEqual(cfg.installed.files, legacy.installed.files);
    assert.deepEqual(cfg.installed.rules, agentsMd ? { 'AGENTS.md': { createdFile: true } } : {});
    assert.equal(await exists(join(cwd, ...LEGACY_CONFIG_FILE.split('/'))), false);
    assert.deepEqual(await snapshotWithout(cwd, CONFIG_FILE), before, `agentsMd ${agentsMd}`);

    // a second update writes nothing
    const after = await snapshot(cwd);
    const again = [];
    await upd(cwd, [], realCatalog, { packageVersion: '0.2.0', out: (s) => again.push(s) });
    assert.deepEqual(await snapshot(cwd), after);
    assert.ok(!again.join('').includes('config: moved'));
  }
});

test('upgrade: a corrupt legacy config fails naming .agents/.pa-skills-config.json and nothing is changed', async () => {
  const cwd = await tmpProject();
  await writeLegacyInstall(cwd, { agentsMd: true });
  await writeFile(join(cwd, ...LEGACY_CONFIG_FILE.split('/')), '{ "version": 1, ');
  const before = await snapshot(cwd);
  const calls = [
    () => upd(cwd),
    () => check(parseArgs(['check']), ctxFor(cwd)),
    () => inst(cwd, ['--skill', ASPNET]),
    () => remove(parseArgs(['remove']), ctxFor(cwd)),
  ];
  for (const call of calls) {
    await assert.rejects(call(), /cannot parse \.agents\/\.pa-skills-config\.json: .*nothing was changed/);
    assert.deepEqual(await snapshot(cwd), before);
  }
});

test('both configs present: the root one is used, a warning names the legacy file, and the legacy file is kept', async () => {
  const cwd = await tmpProject();
  await inst(cwd, ['--skill', TRAINER]);
  await writeFile(join(cwd, ...LEGACY_CONFIG_FILE.split('/')), 'left over by hand\n');
  const lines = [];
  const r = await upd(cwd, [], realCatalog, { out: (s) => lines.push(s) });
  assert.equal(r.source, 'root');
  assert.ok(lines.join('').includes('warning: ignoring .agents/.pa-skills-config.json; .pa-skills.json is used (delete the old file)\n'));
  assert.ok(!lines.join('').includes('config: moved'));
  assert.equal(await readFile(join(cwd, ...LEGACY_CONFIG_FILE.split('/')), 'utf8'), 'left over by hand\n');
  assert.deepEqual((await readConfigJson(cwd)).skills, [TRAINER]);
});

test('upgrade matrix: v0.2.0 alone → universal; with .claude/ update and check exit 1 changing nothing; add --agent claude-code,universal then migrates', async () => {
  const runCli = (cwd, ...argv) => spawnSync(process.execPath, [cli, ...argv, '--cwd', cwd], { encoding: 'utf8' });

  // the fixture alone: our own .agents/ is the only marker, so update picks universal and changes no skill file
  const alone = await tmpProject();
  await writeLegacyInstall(alone, { agentsMd: true });
  const skillsBefore = await snapshot(join(alone, '.agents', 'skills'));
  assert.equal(runCli(alone, 'update').status, 0);
  assert.deepEqual((await readConfigJson(alone)).agents, ['universal']);
  assert.deepEqual(await snapshot(join(alone, '.agents', 'skills')), skillsBefore);

  // the fixture beside .claude/: both present, so update and check fail once and nothing moves
  const cwd = await tmpProject();
  await writeLegacyInstall(cwd, { agentsMd: true });
  await mkdir(join(cwd, '.claude'));
  const before = await snapshot(cwd);
  for (const command of ['update', 'check']) {
    const r = runCli(cwd, command);
    assert.equal(r.status, 1, `${command}: ${r.stderr}`);
    assert.ok(r.stderr.includes('found .claude/, .agents/ and AGENTS.md'), r.stderr);
    assert.ok(r.stderr.includes('"add --agent universal"') && r.stderr.includes('"add --agent claude-code,universal"'), r.stderr);
    assert.deepEqual(await snapshot(cwd), before, command);
  }
  assert.equal(await exists(join(cwd, ...LEGACY_CONFIG_FILE.split('/'))), true);
  assert.equal(await exists(join(cwd, CONFIG_FILE)), false);

  // the suggested command: both copies, the root config with exactly the flag agents, and the legacy file gone
  const fixed = runCli(cwd, 'add', '--agent', 'claude-code,universal');
  assert.equal(fixed.status, 0, fixed.stderr);
  for (const dir of ['.claude', '.agents']) assert.equal(await exists(join(cwd, dir, 'skills', TRAINER, 'SKILL.md')), true, dir);
  const cfg = await readConfigJson(cwd);
  assert.deepEqual([cfg.version, cfg.agents, cfg.skills], [2, ['claude-code', 'universal'], [TRAINER]]);
  assert.equal(await exists(join(cwd, ...LEGACY_CONFIG_FILE.split('/'))), false);
  assert.equal(runCli(cwd, 'check').status, 0);
});

test('upgrade: plain add on a v0.2.0 install beside .claude/ exits 2 naming only the add --agent values that keep .agents/skills', async () => {
  const cwd = await tmpProject();
  await writeLegacyInstall(cwd);
  await mkdir(join(cwd, '.claude'));
  const before = await snapshot(cwd);
  const r = spawnSync(process.execPath, [cli, 'add', '--skill', ASPNET, '--cwd', cwd], { encoding: 'utf8' });
  assert.equal(r.status, 2, r.stderr);
  assert.ok(r.stderr.includes('"add --agent universal"') && r.stderr.includes('"add --agent claude-code,universal"'), r.stderr);
  // not the fresh-install wording, which also offers --agent claude-code alone
  assert.ok(!r.stderr.includes('--agent claude-code, --agent universal'), r.stderr);
  assert.deepEqual(await snapshot(cwd), before);
});

test('upgrade: add --agent claude-code on a v0.2.0 install saves exactly the flag agents', async () => {
  const cwd = await tmpProject();
  await writeLegacyInstall(cwd);
  const r = await inst(cwd, ['--agent', 'claude-code']);
  assert.deepEqual((await readConfigJson(cwd)).agents, ['claude-code']);
  // universal was never chosen, so its v1 copies are dropped like any deselected agent
  assert.ok(r.result.removed.every((p) => p.startsWith('.agents/skills/')) && r.result.removed.length > 0);
  assert.equal(await exists(join(cwd, '.claude', 'skills', TRAINER, 'SKILL.md')), true);
});

// Line endings: fixtures write their own bytes (a temp catalog is LF on every OS), never the checkout's.
const toLf = (buf) => Buffer.from(buf.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');
const toCrlf = (buf) => Buffer.from(toLf(buf).toString('latin1').replaceAll('\n', '\r\n'), 'latin1');
const tracked = async (cwd, rel) => (await readConfigJson(cwd)).installed.files.some((f) => f.path === rel);

test('an installed SKILL.md converted to CRLF: update changes nothing, does not warn and keeps it tracked', async () => {
  const cwd = await tmpProject();
  const { catalog } = await makeCatalog({ alpha: ['web'] });
  await inst(cwd, ['--skill', 'alpha'], catalog);
  const file = join(cwd, '.agents', 'skills', 'alpha', 'SKILL.md');
  const crlf = toCrlf(await readFile(file));
  await writeFile(file, crlf);
  const lines = [];
  const r = await upd(cwd, [], catalog, { out: (s) => lines.push(s) });
  const text = lines.join('');
  assert.deepEqual([r.result.added, r.result.updated, r.result.removed, r.result.modified], [[], [], [], []]);
  assert.ok(text.includes('Nothing to change'), text);
  assert.ok(!text.includes('modified locally'), text);
  assert.ok(await tracked(cwd, skillMd('alpha')));
  assert.deepEqual(await readFile(file), crlf);
});

test('a CRLF copy with a real content edit: update skips it, --force overwrites it with the packaged bytes', async () => {
  const cwd = await tmpProject();
  const { catalog } = await makeCatalog({ alpha: ['web'] });
  await inst(cwd, ['--skill', 'alpha'], catalog);
  const file = join(cwd, '.agents', 'skills', 'alpha', 'SKILL.md');
  const packaged = await readFile(file);
  const edited = toCrlf(Buffer.from(`${packaged.toString('utf8')}consumer line\n`));
  await writeFile(file, edited);

  const lines = [];
  const r = await upd(cwd, [], catalog, { out: (s) => lines.push(s) });
  assert.deepEqual(r.result.modified, [skillMd('alpha')]);
  assert.ok(lines.join('').includes('modified locally'));
  assert.deepEqual(await readFile(file), edited);

  const forced = await upd(cwd, ['--force'], catalog);
  assert.deepEqual(forced.result.updated, [skillMd('alpha')]);
  assert.deepEqual(await readFile(file), packaged);
  assert.ok(await tracked(cwd, skillMd('alpha')));
});

test('a CRLF copy of an outdated file is updated to the new packaged bytes, not reported as modified', async () => {
  const cwd = await tmpProject();
  const v1 = await makeCatalog({ alpha: ['web'] });
  await inst(cwd, ['--tag', 'web'], v1.catalog);
  const file = join(cwd, '.agents', 'skills', 'alpha', 'SKILL.md');
  await writeFile(file, toCrlf(await readFile(file)));

  const v2 = await makeCatalog({ alpha: ['web', 'api'] }); // same skill, new content
  const next = await readFile(join(v2.root, 'dist', 'skills', 'alpha', 'SKILL.md'));
  const lines = [];
  const r = await upd(cwd, [], v2.catalog, { out: (s) => lines.push(s) });
  assert.deepEqual([r.result.updated, r.result.modified], [[skillMd('alpha')], []]);
  assert.ok(!lines.join('').includes('modified locally'), lines.join(''));
  assert.deepEqual(await readFile(file), next);
  assert.ok(await tracked(cwd, skillMd('alpha')));
});

test('back-compat: a 0.3.0 install (raw SHA-256 of LF files, LF on disk) is clean and an unchanged update changes no byte', async () => {
  const cwd = await tmpProject();
  const skill = realCatalog.skills.get(TRAINER);
  const files = [];
  for (const file of skill.files) {
    const lf = toLf(await readFile(join(skill.dir, ...file.split('/'))));
    const rel = `.agents/skills/${TRAINER}/${file}`;
    await mkdir(join(cwd, ...rel.split('/'), '..'), { recursive: true });
    await writeFile(join(cwd, ...rel.split('/')), lf);
    files.push({ path: rel, sha256: createHash('sha256').update(lf).digest('hex') });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  // Written by hand with sorted keys, as 0.3.0 serialized it (LF, 2-space indent, trailing newline).
  const config = {
    agents: ['universal'],
    agentsMd: false,
    installed: { files, rules: {}, skills: [TRAINER] },
    package: '@pavel-agarkov/skills',
    packageVersion: '0.3.0',
    skills: [TRAINER],
    tags: [],
    version: 2,
  };
  await writeFile(join(cwd, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`);
  const before = await snapshot(cwd);

  const lines = [];
  const c = await check(parseArgs(['check']), ctxFor(cwd, realCatalog, { packageVersion: '0.3.0', out: (s) => lines.push(s) }));
  assert.equal(c.pending, false, lines.join(''));
  const r = await upd(cwd, [], realCatalog, { packageVersion: '0.3.0' });
  assert.deepEqual([r.result.added, r.result.updated, r.result.removed, r.result.modified], [[], [], [], []]);
  assert.deepEqual(await snapshot(cwd), before);
});
