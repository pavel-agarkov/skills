import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../src/catalog.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function fixture(skills) {
  const root = await mkdtemp(join(tmpdir(), 'catalog-'));
  for (const [folder, content] of Object.entries(skills)) {
    const dir = join(root, 'dist', 'skills', folder);
    await mkdir(join(dir, 'references'), { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), content);
    await writeFile(join(dir, 'references', 'a.md'), 'x');
  }
  return root;
}

test('real repo: exactly the shipped skills, tags indexed', async () => {
  const names = (await readdir(join(repoRoot, 'dist', 'skills'))).sort();
  assert.deepEqual(names, ['aspnet-layered-service-scaffold', 'interview-trainer', 'pa-skills']);
  const { skills, tags } = loadCatalog(repoRoot);
  assert.deepEqual([...skills.keys()].sort(), names);
  assert.ok(tags.get('dotnet').includes('aspnet-layered-service-scaffold'));
  assert.deepEqual(tags.get('cli'), ['pa-skills']);
  assert.ok(skills.get('interview-trainer').files.includes('references/cli.md'));
  assert.ok(skills.get('aspnet-layered-service-scaffold').description.startsWith('Scaffold a dedicated'));
});

test('repo layout: no skills folder, no root SKILL.md, dist not ignored', async () => {
  await assert.rejects(access(join(repoRoot, 'skills')));
  await assert.rejects(access(join(repoRoot, 'SKILL.md')));
  const ignore = await readFile(join(repoRoot, '.gitignore'), 'utf8');
  assert.ok(!ignore.split(/\r?\n/).some((l) => /^\/?dist\/?$/.test(l.trim())));
});

test('parses folded scalar and inline tags', async () => {
  const root = await fixture({
    one: '---\nname: one\ndescription: >\n  first line\n  second line\ntags: [a-b, c]\n---\nbody',
  });
  const { skills, tags } = loadCatalog(root);
  const s = skills.get('one');
  assert.equal(s.description, 'first line second line');
  assert.deepEqual(s.tags, ['a-b', 'c']);
  assert.deepEqual(s.files, ['SKILL.md', 'references/a.md']);
  assert.deepEqual(tags.get('c'), ['one']);
});

test('throws on missing name', async () => {
  const root = await fixture({ one: '---\ndescription: d\ntags: [a]\n---' });
  assert.throws(() => loadCatalog(root), /name/);
});

test('throws on missing tags', async () => {
  const root = await fixture({ one: '---\nname: one\ndescription: d\n---' });
  assert.throws(() => loadCatalog(root), /tags/);
});

test('throws when name differs from folder', async () => {
  const root = await fixture({ one: '---\nname: two\ndescription: d\ntags: [a]\n---' });
  assert.throws(() => loadCatalog(root), /differs from folder/);
});

test('throws on invalid tag format', async () => {
  const root = await fixture({ one: '---\nname: one\ndescription: d\ntags: [Bad_Tag]\n---' });
  assert.throws(() => loadCatalog(root), /invalid tag/);
});
