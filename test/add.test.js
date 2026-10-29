import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { parseArgs, UsageError } from '../src/args.js';
import { loadCatalog } from '../src/catalog.js';
import { add } from '../src/commands/add.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = loadCatalog(repoRoot);
const TRAINER = 'interview-trainer';
const ASPNET = 'aspnet-layered-service-scaffold';

const tmpProject = () => mkdtemp(join(tmpdir(), 'add-'));
const run = (cwd, argv, extra = {}) =>
  add(parseArgs(['add', ...argv]), { cwd, catalog, packageVersion: '0.1.0', out: () => {}, isTTY: false, ...extra });

async function snapshot(dir, base = dir) {
  const out = {};
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) Object.assign(out, await snapshot(abs, base));
    else out[abs.slice(base.length + 1).replaceAll('\\', '/')] = (await readFile(abs)).toString('base64');
  }
  return out;
}

const installedSkills = async (cwd) => (await readdir(join(cwd, '.agents', 'skills'))).sort();
const readJson = async (cwd) => JSON.parse(await readFile(join(cwd, '.agents', '.pa-skills-config.json'), 'utf8'));

test('single skill', async () => {
  const cwd = await tmpProject();
  const r = await run(cwd, ['--skill', TRAINER]);
  assert.deepEqual(await installedSkills(cwd), [TRAINER]);
  assert.ok(r.added.includes(`.agents/skills/${TRAINER}/SKILL.md`));
  const cfg = await readJson(cwd);
  assert.deepEqual(cfg.skills, [TRAINER]);
  assert.deepEqual(cfg.installed.skills, [TRAINER]);
  assert.equal(cfg.installed.files.length, catalog.skills.get(TRAINER).files.length);
  assert.ok(cfg.installed.files.every((f) => f.path.startsWith('.agents/skills/') && /^[0-9a-f]{64}$/.test(f.sha256) && !f.path.includes('\\')));
  assert.ok(!cfg.installed.files.some((f) => f.path.endsWith('.pa-skills-config.json')));
});

test('multiple skills', async () => {
  const cwd = await tmpProject();
  await run(cwd, ['--skill', `${TRAINER},${ASPNET}`]);
  assert.deepEqual(await installedSkills(cwd), [ASPNET, TRAINER]);
});

test('single tag', async () => {
  const cwd = await tmpProject();
  await run(cwd, ['--tag', 'dotnet']);
  assert.deepEqual(await installedSkills(cwd), [ASPNET]);
  const cfg = await readJson(cwd);
  assert.deepEqual(cfg.tags, ['dotnet']);
  assert.deepEqual(cfg.skills, []);
});

test('multiple tags', async () => {
  const cwd = await tmpProject();
  await run(cwd, ['--tag', 'dotnet', '--tag', 'interview']);
  assert.deepEqual(await installedSkills(cwd), [ASPNET, TRAINER]);
});

test('mixed names and tags, and additive over the saved selection', async () => {
  const cwd = await tmpProject();
  await run(cwd, ['--skill', TRAINER]);
  await run(cwd, ['--tag', 'backend']);
  assert.deepEqual(await installedSkills(cwd), [ASPNET, TRAINER]);
  const cfg = await readJson(cwd);
  assert.deepEqual(cfg.skills, [TRAINER]);
  assert.deepEqual(cfg.tags, ['backend']);
});

test('identical re-run is a no-op with identical bytes (config included)', async () => {
  const cwd = await tmpProject();
  await run(cwd, ['--skill', TRAINER, '--tag', 'dotnet', '--agents-md']);
  const before = await snapshot(cwd);
  const r = await run(cwd, ['--skill', TRAINER, '--tag', 'dotnet', '--agents-md']);
  assert.deepEqual([r.added, r.updated, r.removed, r.modified], [[], [], [], []]);
  assert.deepEqual(await snapshot(cwd), before);
});

test('--dry-run leaves the project byte-identical', async () => {
  const cwd = await tmpProject();
  await mkdir(join(cwd, 'src'));
  await writeFile(join(cwd, 'src', 'keep.txt'), 'keep');
  await writeFile(join(cwd, 'AGENTS.md'), '# mine\n');
  const before = await snapshot(cwd);
  const lines = [];
  const r = await run(cwd, ['--skill', TRAINER, '--agents-md', '--dry-run'], { out: (s) => lines.push(s) });
  assert.deepEqual(await snapshot(cwd), before);
  assert.ok(r.added.length > 0);
  assert.ok(lines.join('').includes('[dry-run]'));

  const empty = await tmpProject();
  await run(empty, ['--tag', 'dotnet', '--dry-run']);
  assert.deepEqual(await readdir(empty), []);
});

test('unknown skill or tag aborts before writing and lists valid names', async () => {
  const cwd = await tmpProject();
  await assert.rejects(run(cwd, ['--skill', 'nope']), /unknown skill: nope.*valid:.*interview-trainer/);
  await assert.rejects(run(cwd, ['--skill', TRAINER, '--tag', 'nope']), /unknown tag: nope/);
  assert.deepEqual(await readdir(cwd), []);
});

test('no flags without a TTY is a usage error', async () => {
  const cwd = await tmpProject();
  await assert.rejects(run(cwd, []), UsageError);
  assert.deepEqual(await readdir(cwd), []);
});

test('no flags with a TTY opens the picker', async () => {
  const cwd = await tmpProject();
  const names = [...catalog.skills.keys()];
  const input = Readable.from([`${names.indexOf(TRAINER) + 1}\n`]);
  const output = new Writable({ write: (_c, _e, cb) => cb() });
  await run(cwd, [], { isTTY: true, input, output });
  assert.deepEqual(await installedSkills(cwd), [TRAINER]);
});

test('--agents-md keeps hand-written content and the block is refreshed; consumer file in skill dir survives', async () => {
  const cwd = await tmpProject();
  const original = '# Team rules\n\nBe kind.\n';
  await writeFile(join(cwd, 'AGENTS.md'), original);
  await run(cwd, ['--skill', TRAINER, '--agents-md']);
  const text = await readFile(join(cwd, 'AGENTS.md'), 'utf8');
  assert.ok(text.startsWith(original));
  assert.ok(text.includes(`**${TRAINER}**`));
  const cfg = await readJson(cwd);
  assert.equal(cfg.agentsMd, true);
  assert.deepEqual(cfg.installed.agentsMd, { present: true, createdFile: false });

  await run(cwd, ['--skill', ASPNET]); // agentsMd stays on from the saved config
  const text2 = await readFile(join(cwd, 'AGENTS.md'), 'utf8');
  assert.ok(text2.startsWith(original));
  assert.ok(text2.includes(`**${ASPNET}**`) && text2.includes(`**${TRAINER}**`));
});

test('collision with an unmanaged skill dir is refused, nothing written', async () => {
  const cwd = await tmpProject();
  const dir = join(cwd, '.agents', 'skills', TRAINER);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'mine.md'), 'mine');
  await assert.rejects(run(cwd, ['--skill', TRAINER]), /already exist.*--force/);
  assert.deepEqual(await readdir(dir), ['mine.md']);
  await assert.rejects(stat(join(cwd, '.agents', '.pa-skills-config.json')));
});

test('CLI: no flags without a TTY exits 2; add via --cwd exits 0', async () => {
  const cwd = await tmpProject();
  const cli = join(repoRoot, 'bin', 'cli.js');
  const noFlags = spawnSync(process.execPath, [cli, 'add', '--cwd', cwd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(noFlags.status, 2);
  const ok = spawnSync(process.execPath, [cli, 'add', '--skill', TRAINER, '--cwd', cwd], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(await installedSkills(cwd), [TRAINER]);
  const bad = spawnSync(process.execPath, [cli, 'add', '--skill', 'nope', '--cwd', cwd], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  for (const argv of [['install', '--skill', TRAINER], ['uninstall'], ['configure', '--skill', TRAINER], ['add', '--skill', TRAINER, '--no-agents-md']]) {
    const r = spawnSync(process.execPath, [cli, ...argv, '--cwd', cwd], { encoding: 'utf8' });
    assert.equal(r.status, 2, argv.join(' '));
  }
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' }).stdout;
  assert.ok(/^  add /m.test(help) && /^  remove /m.test(help));
  assert.ok(!/(install|uninstall|configure|no-agents-md)/.test(help));
});

test('AGENTS.md is not used or created without --agents-md or a saved option', async () => {
  const cwd = await tmpProject();
  await run(cwd, ['--skill', TRAINER]);
  assert.deepEqual(await readdir(cwd), ['.agents']);
  assert.equal((await readJson(cwd)).agentsMd, false);
  await run(cwd, ['--skill', ASPNET]);
  assert.deepEqual(await readdir(cwd), ['.agents']);
});

test('add --agents-md creates AGENTS.md; --agents-md alone enables the index on the saved selection', async () => {
  const cwd = await tmpProject();
  await run(cwd, ['--skill', TRAINER, '--agents-md']);
  assert.ok((await readFile(join(cwd, 'AGENTS.md'), 'utf8')).includes(`**${TRAINER}**`));
  assert.deepEqual((await readJson(cwd)).installed.agentsMd, { present: true, createdFile: true });

  const other = await tmpProject();
  await run(other, ['--skill', TRAINER]);
  await run(other, ['--agents-md']);
  assert.equal((await readJson(other)).agentsMd, true);
  assert.ok((await readFile(join(other, 'AGENTS.md'), 'utf8')).includes(`**${TRAINER}**`));
});

test('manually deleted skill files and AGENTS.md do not break the CLI', async () => {
  const cwd = await tmpProject();
  await run(cwd, ['--skill', `${TRAINER},${ASPNET}`, '--agents-md']);
  const { rm } = await import('node:fs/promises');
  await rm(join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md'));
  await rm(join(cwd, 'AGENTS.md'));
  const lines = [];
  const r = await run(cwd, ['--skill', TRAINER], { out: (s) => lines.push(s) });
  assert.ok(r.restored.includes(`.agents/skills/${TRAINER}/SKILL.md`));
  assert.ok(lines.join('').includes('was missing; restored'));
  assert.ok(lines.join('').includes('AGENTS.md skills block was missing; recreated'));
  assert.ok((await readFile(join(cwd, 'AGENTS.md'), 'utf8')).includes(TRAINER));

  // Deleting a skill's files by hand, then dropping it from the selection, only updates the config.
  await rm(join(cwd, '.agents', 'skills', ASPNET), { recursive: true });
  const { sync } = { sync: (await import('../src/sync.js')).syncSkills };
  const { readConfig } = await import('../src/config.js');
  const res = sync({ cwd, catalog, skills: [TRAINER], prev: readConfig(cwd) });
  assert.deepEqual(res.missing, [`.agents/skills/${ASPNET}/SKILL.md`]);
  assert.deepEqual(res.removed, []);
});
