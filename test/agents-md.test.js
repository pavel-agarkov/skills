import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyBlock, removeBlock, BEGIN_MARKER, END_MARKER } from '../src/agents-md.js';

const skills = [
  { name: 'one', description: 'First skill' },
  { name: 'two', description: 'Second skill' },
];
const tmp = () => mkdtemp(join(tmpdir(), 'agents-'));
const read = (cwd) => readFile(join(cwd, 'AGENTS.md'), 'utf8');

test('creates a missing AGENTS.md and records createdFile', async () => {
  const cwd = await tmp();
  const r = applyBlock({ cwd, skills });
  assert.deepEqual(r, { present: true, createdFile: true, action: 'create' });
  const text = await read(cwd);
  assert.ok(text.startsWith(BEGIN_MARKER) && text.trimEnd().endsWith(END_MARKER));
  assert.ok(text.includes('**one**: First skill (`.agents/skills/one/SKILL.md`)'));
});

test('appends to existing content and preserves it; rewrite replaces only the block', async () => {
  const cwd = await tmp();
  const head = '# My rules\n\nKeep this.\n';
  await writeFile(join(cwd, 'AGENTS.md'), head);
  const r = applyBlock({ cwd, skills });
  assert.equal(r.createdFile, false);
  assert.equal(r.action, 'append');
  const withBlock = await read(cwd);
  assert.ok(withBlock.startsWith(`${head}\n${BEGIN_MARKER}`));
  // consumer adds text after the block
  await writeFile(join(cwd, 'AGENTS.md'), `${withBlock}\nTail text\n`);
  const r2 = applyBlock({ cwd, skills: [skills[0]] });
  assert.equal(r2.action, 'update');
  const after = await read(cwd);
  assert.ok(after.startsWith(`${head}\n${BEGIN_MARKER}`));
  assert.ok(after.endsWith(`${END_MARKER}\n\nTail text\n`));
  assert.ok(!after.includes('**two**'));
  assert.equal(applyBlock({ cwd, skills: [skills[0]] }).action, 'none');
});

test('preserves CRLF files', async () => {
  const cwd = await tmp();
  await writeFile(join(cwd, 'AGENTS.md'), 'a\r\nb\r\n');
  applyBlock({ cwd, skills });
  const text = await read(cwd);
  assert.ok(!/[^\r]\n/.test(text));
});

test('unpaired marker throws and leaves the file untouched', async () => {
  const cwd = await tmp();
  const bad = `intro\n${BEGIN_MARKER}\nno end\n`;
  await writeFile(join(cwd, 'AGENTS.md'), bad);
  assert.throws(() => applyBlock({ cwd, skills }), /unpaired/);
  assert.throws(() => removeBlock({ cwd }), /unpaired/);
  assert.equal(await read(cwd), bad);
});

test('remove restores the original bytes', async () => {
  const cwd = await tmp();
  const head = '# My rules\n\nKeep this.\n';
  await writeFile(join(cwd, 'AGENTS.md'), head);
  applyBlock({ cwd, skills });
  assert.equal(removeBlock({ cwd }).action, 'remove');
  assert.equal(await read(cwd), head);
});

test('remove deletes the file only when installer created it and nothing else remains', async () => {
  const cwd = await tmp();
  applyBlock({ cwd, skills });
  assert.equal(removeBlock({ cwd, createdFile: true }).action, 'delete');
  await assert.rejects(access(join(cwd, 'AGENTS.md')));

  const cwd2 = await tmp();
  applyBlock({ cwd: cwd2, skills });
  await writeFile(join(cwd2, 'AGENTS.md'), `${await read(cwd2)}\nadded later\n`);
  assert.equal(removeBlock({ cwd: cwd2, createdFile: true }).action, 'remove');
  assert.ok((await read(cwd2)).includes('added later'));
});

test('dry run writes nothing', async () => {
  const cwd = await tmp();
  applyBlock({ cwd, skills, dryRun: true });
  await assert.rejects(access(join(cwd, 'AGENTS.md')));
});
