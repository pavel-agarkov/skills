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
import { AGENTS } from '../src/agents.js';

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
const readJson = async (cwd) => JSON.parse(await readFile(join(cwd, '.pa-skills.json'), 'utf8'));

test('single skill', async () => {
  const cwd = await tmpProject();
  const r = await run(cwd, ['--skill', TRAINER]);
  assert.deepEqual(await installedSkills(cwd), [TRAINER]);
  assert.ok(r.added.includes(`.agents/skills/${TRAINER}/SKILL.md`));
  const cfg = await readJson(cwd);
  assert.deepEqual(cfg.skills, [TRAINER]);
  assert.deepEqual(cfg.installed.skills, [TRAINER]);
  assert.equal(cfg.installed.files.length, catalog.skills.get(TRAINER).files.length);
  assert.deepEqual(cfg.agents, ['universal']);
  const underSelected = (c) =>
    c.installed.files.every((f) => c.agents.some((a) => f.path.startsWith(`${AGENTS[a].skillsDir}/`)) && /^[0-9a-f]{64}$/.test(f.sha256) && !f.path.includes('\\'));
  assert.ok(underSelected(cfg));
  assert.ok(!cfg.installed.files.some((f) => f.path.includes('.pa-skills')));

  const both = await tmpProject();
  await run(both, ['--skill', TRAINER, '--agent', 'claude-code,universal']);
  const bothCfg = await readJson(both);
  assert.deepEqual(bothCfg.agents, ['claude-code', 'universal']);
  assert.equal(bothCfg.installed.files.length, 2 * catalog.skills.get(TRAINER).files.length);
  assert.ok(underSelected(bothCfg));
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
  assert.deepEqual(cfg.installed.rules, { 'AGENTS.md': { createdFile: false } });

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
  await assert.rejects(stat(join(cwd, '.pa-skills.json')));
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
  assert.deepEqual((await readdir(cwd)).sort(), ['.agents', '.pa-skills.json']);
  assert.equal((await readJson(cwd)).agentsMd, false);
  await run(cwd, ['--skill', ASPNET]);
  assert.deepEqual((await readdir(cwd)).sort(), ['.agents', '.pa-skills.json']);
});

test('add --agents-md creates AGENTS.md; --agents-md alone enables the index on the saved selection', async () => {
  const cwd = await tmpProject();
  await run(cwd, ['--skill', TRAINER, '--agents-md']);
  assert.ok((await readFile(join(cwd, 'AGENTS.md'), 'utf8')).includes(`**${TRAINER}**`));
  assert.deepEqual((await readJson(cwd)).installed.rules, { 'AGENTS.md': { createdFile: true } });

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
  const res = sync({ cwd, catalog, skills: [TRAINER], prev: readConfig(cwd).config });
  assert.deepEqual(res.missing, catalog.skills.get(ASPNET).files.map((f) => `.agents/skills/${ASPNET}/${f}`));
  assert.deepEqual(res.removed, []);
});

const cliAdd = (cwd, ...argv) => spawnSync(process.execPath, [join(repoRoot, 'bin', 'cli.js'), 'add', ...argv, '--cwd', cwd], { encoding: 'utf8' });
const exists = (p) => stat(p).then(() => true, () => false);

test('CLI: an unknown agent id exits 2, lists the valid ids and writes nothing', async () => {
  const cwd = await tmpProject();
  for (const argv of [['--agent', 'claude'], ['-a', 'universal,codex'], ['--agent=*,nope']]) {
    const r = cliAdd(cwd, '--skill', TRAINER, ...argv);
    assert.equal(r.status, 2, argv.join(' '));
    assert.match(r.stderr, /unknown agent: \S+ \(valid: claude-code, universal/, r.stderr);
  }
  assert.deepEqual(await readdir(cwd), []);
});

test('CLI: fresh add detects the agent (nothing → universal, .claude/ or CLAUDE.md → claude-code, AGENTS.md → universal)', async () => {
  const cases = [
    { name: 'nothing', setup: async () => {}, agents: ['universal'] },
    { name: '.claude/', setup: (cwd) => mkdir(join(cwd, '.claude')), agents: ['claude-code'] },
    { name: 'CLAUDE.md', setup: (cwd) => writeFile(join(cwd, 'CLAUDE.md'), '# mine\n'), agents: ['claude-code'] },
    { name: 'AGENTS.md', setup: (cwd) => writeFile(join(cwd, 'AGENTS.md'), '# mine\n'), agents: ['universal'] },
  ];
  for (const { name, setup, agents } of cases) {
    const cwd = await tmpProject();
    await setup(cwd);
    const r = cliAdd(cwd, '--skill', TRAINER);
    assert.equal(r.status, 0, `${name}: ${r.stderr}`);
    assert.deepEqual((await readJson(cwd)).agents, agents, name);
    for (const id of ['claude-code', 'universal']) {
      assert.equal(await exists(join(cwd, ...AGENTS[id].skillsDir.split('/'), TRAINER, 'SKILL.md')), agents.includes(id), `${name}: ${id}`);
    }
  }
});

test('CLI: fresh add with .claude/ and AGENTS.md exits 2, writes nothing and names both markers and the --agent values', async () => {
  const cwd = await tmpProject();
  await mkdir(join(cwd, '.claude'));
  await writeFile(join(cwd, 'AGENTS.md'), '# mine\n');
  const before = await snapshot(cwd);
  const r = cliAdd(cwd, '--skill', TRAINER);
  assert.equal(r.status, 2, r.stderr);
  assert.ok(r.stderr.includes('found .claude/ and AGENTS.md'), r.stderr);
  assert.ok(r.stderr.includes('--agent claude-code, --agent universal or --agent claude-code,universal'), r.stderr);
  assert.ok(r.stderr.includes('Nothing was written.'), r.stderr);
  assert.deepEqual(await snapshot(cwd), before);
  assert.deepEqual((await readdir(cwd)).sort(), ['.claude', 'AGENTS.md']);

  // an explicit --agent settles it; once agents are saved, detection does not run again
  assert.equal(cliAdd(cwd, '--skill', TRAINER, '--agent', 'universal').status, 0);
  assert.deepEqual((await readJson(cwd)).agents, ['universal']);
  assert.equal(cliAdd(cwd, '--skill', ASPNET).status, 0);
  assert.deepEqual((await readJson(cwd)).agents, ['universal']);
});

test('fresh add: detection runs before anything is written, so our own AGENTS.md does not change the answer', async () => {
  const cwd = await tmpProject();
  await mkdir(join(cwd, '.claude'));
  await run(cwd, ['--skill', TRAINER, '--agents-md']);
  assert.deepEqual((await readJson(cwd)).agents, ['claude-code']);
  assert.equal(await exists(join(cwd, '.agents')), false);
  assert.ok((await readFile(join(cwd, 'AGENTS.md'), 'utf8')).includes(`.claude/skills/${TRAINER}/SKILL.md`));
  // the AGENTS.md we created now sits beside .claude/, but the saved agents are used
  await run(cwd, ['--skill', ASPNET]);
  assert.deepEqual((await readJson(cwd)).agents, ['claude-code']);
});

test('add --agent claude-code on a universal install adds .claude/skills copies and keeps the .agents copies', async () => {
  const cwd = await tmpProject();
  await run(cwd, ['--skill', TRAINER]);
  const agentsCopy = join(cwd, '.agents', 'skills', TRAINER, 'SKILL.md');
  const original = await readFile(agentsCopy);
  const r = await run(cwd, ['--agent', 'claude-code']); // alone: keeps the saved skills, no picker
  assert.deepEqual(r.added, catalog.skills.get(TRAINER).files.map((f) => `.claude/skills/${TRAINER}/${f}`).sort());
  assert.deepEqual([r.removed, r.updated], [[], []]);
  assert.deepEqual(await readFile(agentsCopy), original);
  assert.deepEqual(await readFile(join(cwd, '.claude', 'skills', TRAINER, 'SKILL.md')), original);
  const cfg = await readJson(cwd);
  assert.deepEqual(cfg.agents, ['claude-code', 'universal']);
  assert.deepEqual(cfg.skills, [TRAINER]);

  // additive: an already saved agent changes nothing, and new skills go to both
  await run(cwd, ['--skill', ASPNET, '-a', 'universal']);
  assert.deepEqual((await readJson(cwd)).agents, ['claude-code', 'universal']);
  assert.equal(await exists(join(cwd, '.claude', 'skills', ASPNET, 'SKILL.md')), true);

  // '*' means every agent
  const star = await tmpProject();
  await run(star, ['--skill', TRAINER, '--agent', '*']);
  assert.deepEqual((await readJson(star)).agents, ['claude-code', 'universal']);
});
