import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCatalog } from '../src/catalog.js';
import { sha256, syncSkills } from '../src/sync.js';

async function makeCatalog(files) {
  // files: { skillName: { 'rel/path': content } }
  const root = await mkdtemp(join(tmpdir(), 'syncpkg-'));
  for (const [name, entries] of Object.entries(files)) {
    for (const [rel, content] of Object.entries({ 'SKILL.md': `---\nname: ${name}\ndescription: d\ntags: [t]\n---\n`, ...entries })) {
      const abs = join(root, 'dist', 'skills', name, ...rel.split('/'));
      await mkdir(join(abs, '..'), { recursive: true });
      await writeFile(abs, content);
    }
  }
  return loadCatalog(root);
}

const tmpProject = () => mkdtemp(join(tmpdir(), 'syncproj-'));
const prevOf = (r) => ({ installed: { skills: r.skills, files: r.files } });
const exists = (p) => access(p).then(() => true, () => false);

test('copies skill folders and records sorted sha256 manifest with forward slashes', async () => {
  const catalog = await makeCatalog({ a: { 'references/x.md': 'X' } });
  const cwd = await tmpProject();
  const r = syncSkills({ cwd, catalog, skills: ['a'] });
  assert.deepEqual(r.added, ['.agents/skills/a/SKILL.md', '.agents/skills/a/references/x.md']);
  assert.deepEqual(r.files.map((f) => f.path), r.added);
  assert.equal(r.files[1].sha256, sha256(Buffer.from('X')));
  assert.equal(await readFile(join(cwd, '.agents', 'skills', 'a', 'references', 'x.md'), 'utf8'), 'X');
});

test('second sync with the manifest is a no-op', async () => {
  const catalog = await makeCatalog({ a: {} });
  const cwd = await tmpProject();
  const r1 = syncSkills({ cwd, catalog, skills: ['a'] });
  const r2 = syncSkills({ cwd, catalog, skills: ['a'], prev: prevOf(r1) });
  assert.deepEqual([r2.added, r2.updated, r2.removed, r2.modified], [[], [], [], []]);
  assert.deepEqual(r2.files, r1.files);
});

test('collision with an unmanaged skill dir throws unless force', async () => {
  const catalog = await makeCatalog({ a: {} });
  const cwd = await tmpProject();
  await mkdir(join(cwd, '.agents', 'skills', 'a'), { recursive: true });
  await writeFile(join(cwd, '.agents', 'skills', 'a', 'mine.md'), 'mine');
  assert.throws(() => syncSkills({ cwd, catalog, skills: ['a'] }), /\.agents\/skills\/a already exists.*--force/);
  const r = syncSkills({ cwd, catalog, skills: ['a'], force: true });
  assert.deepEqual(r.added, ['.agents/skills/a/SKILL.md']);
  assert.equal(await readFile(join(cwd, '.agents', 'skills', 'a', 'mine.md'), 'utf8'), 'mine');
  assert.ok(!r.files.some((f) => f.path.endsWith('mine.md')));
});

test('removes unmodified files of dropped skills and prunes empty dirs', async () => {
  const catalog = await makeCatalog({ a: { 'r/x.md': 'X' }, b: {} });
  const cwd = await tmpProject();
  const r1 = syncSkills({ cwd, catalog, skills: ['a', 'b'] });
  const r2 = syncSkills({ cwd, catalog, skills: ['b'], prev: prevOf(r1) });
  assert.deepEqual(r2.removed, ['.agents/skills/a/SKILL.md', '.agents/skills/a/r/x.md']);
  assert.equal(await exists(join(cwd, '.agents', 'skills', 'a')), false);
  assert.equal(await exists(join(cwd, '.agents', 'skills', 'b', 'SKILL.md')), true);
});

test('consumer-modified file is skipped, dropped from manifest, kept on removal; force overwrites', async () => {
  const catalog = await makeCatalog({ a: {} });
  const cwd = await tmpProject();
  const r1 = syncSkills({ cwd, catalog, skills: ['a'] });
  const file = join(cwd, '.agents', 'skills', 'a', 'SKILL.md');
  await writeFile(file, 'edited');

  const r2 = syncSkills({ cwd, catalog, skills: ['a'], prev: prevOf(r1) });
  assert.deepEqual(r2.modified, ['.agents/skills/a/SKILL.md']);
  assert.deepEqual(r2.files, []);
  assert.equal(await readFile(file, 'utf8'), 'edited');

  const r3 = syncSkills({ cwd, catalog, skills: [], prev: prevOf(r1) });
  assert.deepEqual(r3.modified, ['.agents/skills/a/SKILL.md']);
  assert.equal(await readFile(file, 'utf8'), 'edited');

  const r4 = syncSkills({ cwd, catalog, skills: ['a'], prev: prevOf(r1), force: true });
  assert.deepEqual(r4.updated, ['.agents/skills/a/SKILL.md']);
  assert.equal(r4.files[0].sha256, r1.files[0].sha256);
  assert.notEqual(await readFile(file, 'utf8'), 'edited');
});

test('manifest file missing on disk is recreated', async () => {
  const catalog = await makeCatalog({ a: {} });
  const cwd = await tmpProject();
  const r1 = syncSkills({ cwd, catalog, skills: ['a'] });
  const file = join(cwd, '.agents', 'skills', 'a', 'SKILL.md');
  await (await import('node:fs/promises')).rm(file);
  const r2 = syncSkills({ cwd, catalog, skills: ['a'], prev: prevOf(r1) });
  assert.deepEqual(r2.added, ['.agents/skills/a/SKILL.md']);
  assert.equal(await exists(file), true);
});

test('dry run returns the plan and writes nothing', async () => {
  const catalog = await makeCatalog({ a: {} });
  const cwd = await tmpProject();
  const r = syncSkills({ cwd, catalog, skills: ['a'], dryRun: true });
  assert.deepEqual(r.added, ['.agents/skills/a/SKILL.md']);
  assert.deepEqual(await readdir(cwd), []);
});

test('two agents: every skill file is copied under .claude/skills and .agents/skills, all in the manifest', async () => {
  const catalog = await makeCatalog({ a: { 'references/x.md': 'X' }, b: {} });
  const cwd = await tmpProject();
  const r = syncSkills({ cwd, catalog, skills: ['a', 'b'], agents: ['claude-code', 'universal'] });
  const expected = [];
  for (const dir of ['.agents/skills', '.claude/skills']) expected.push(`${dir}/a/SKILL.md`, `${dir}/a/references/x.md`, `${dir}/b/SKILL.md`);
  assert.deepEqual(r.added, expected.sort());
  assert.deepEqual(r.files.map((f) => f.path), r.added);
  for (const p of expected) assert.equal(await exists(join(cwd, ...p.split('/'))), true, p);
  const r2 = syncSkills({ cwd, catalog, skills: ['a', 'b'], agents: ['universal', 'claude-code'], prev: prevOf(r) });
  assert.deepEqual([r2.added, r2.updated, r2.removed, r2.modified], [[], [], [], []]);
});

test('collision is per agent folder: a consumer .claude/skills/<name> collides while ours is in .agents/skills; force takes over', async () => {
  const catalog = await makeCatalog({ a: {} });
  const cwd = await tmpProject();
  const r1 = syncSkills({ cwd, catalog, skills: ['a'], agents: ['universal'] });
  await mkdir(join(cwd, '.claude', 'skills', 'a'), { recursive: true });
  await writeFile(join(cwd, '.claude', 'skills', 'a', 'mine.md'), 'mine');
  const prev = { ...prevOf(r1), agents: ['universal'] };
  assert.throws(
    () => syncSkills({ cwd, catalog, skills: ['a'], agents: ['claude-code', 'universal'], prev }),
    (e) => e.message.startsWith('.claude/skills/a already exists and was not installed by this package') && !e.message.includes('.agents/skills/a'),
  );
  assert.equal(await exists(join(cwd, '.claude', 'skills', 'a', 'SKILL.md')), false);
  const r = syncSkills({ cwd, catalog, skills: ['a'], agents: ['claude-code', 'universal'], prev, force: true });
  assert.deepEqual(r.added, ['.claude/skills/a/SKILL.md']);
  assert.equal(await readFile(join(cwd, '.claude', 'skills', 'a', 'mine.md'), 'utf8'), 'mine');
});

test('collision error lists every colliding folder across agents', async () => {
  const catalog = await makeCatalog({ a: {}, b: {} });
  const cwd = await tmpProject();
  for (const dir of [['.claude', 'skills', 'a'], ['.agents', 'skills', 'b']]) await mkdir(join(cwd, ...dir), { recursive: true });
  assert.throws(
    () => syncSkills({ cwd, catalog, skills: ['a', 'b'], agents: ['claude-code', 'universal'] }),
    /^Error: \.agents\/skills\/b, \.claude\/skills\/a already exist and were not installed by this package/,
  );
});

test('a skill whose every file the consumer modified is not a collision on the next sync', async () => {
  const catalog = await makeCatalog({ a: {} });
  const cwd = await tmpProject();
  const r1 = syncSkills({ cwd, catalog, skills: ['a'] });
  await writeFile(join(cwd, '.agents', 'skills', 'a', 'SKILL.md'), 'edited');
  const r2 = syncSkills({ cwd, catalog, skills: ['a'], prev: prevOf(r1) });
  assert.deepEqual(r2.files, []);
  const r3 = syncSkills({ cwd, catalog, skills: ['a'], prev: prevOf(r2) });
  assert.deepEqual(r3.modified, ['.agents/skills/a/SKILL.md']);
});

test('pruning stays within each skills dir; a manifest path outside the registry prunes nothing', async () => {
  const catalog = await makeCatalog({ a: {} });
  const cwd = await tmpProject();
  const r1 = syncSkills({ cwd, catalog, skills: ['a'], agents: ['claude-code', 'universal'] });
  await mkdir(join(cwd, 'other', 'deep'), { recursive: true });
  await writeFile(join(cwd, 'other', 'deep', 'f.md'), 'F');
  const prev = { installed: { skills: r1.skills, files: [...r1.files, { path: 'other/deep/f.md', sha256: sha256(Buffer.from('F')) }] } };
  const r2 = syncSkills({ cwd, catalog, skills: [], agents: ['claude-code', 'universal'], prev });
  assert.deepEqual(r2.removed, ['.agents/skills/a/SKILL.md', '.claude/skills/a/SKILL.md', 'other/deep/f.md']);
  for (const gone of [['.claude', 'skills'], ['.agents', 'skills']]) assert.equal(await exists(join(cwd, ...gone)), false, gone.join('/'));
  // the agents' root folders and the outside folder are not the sync's to prune
  assert.equal(await exists(join(cwd, '.claude')), true);
  assert.equal(await exists(join(cwd, 'other', 'deep')), true);
});
