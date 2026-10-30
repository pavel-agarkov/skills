import { test } from 'node:test';
import assert from 'node:assert/strict';
import { link, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from '../src/args.js';
import { BEGIN_MARKER, END_MARKER, applyBlock } from '../src/agents-md.js';
import { remove } from '../src/commands/remove.js';
import { update } from '../src/commands/update.js';
import { readConfig } from '../src/config.js';
import { isPending, printSummary, reconcile } from '../src/lifecycle.js';
import { resolveRulesTargets } from '../src/rules.js';
import { ASPNET, CONFIG_FILE, LEGACY_CONFIG_FILE, TRAINER, ctxFor, makeCatalog, readConfigJson, realCatalog, snapshot, tmpProject, writeLegacyInstall } from './helpers.js';

const { catalog: C } = await makeCatalog({ alpha: ['web'], beta: ['web'] });

const exists = (p) => stat(p).then(() => true, () => false);
const readText = (cwd, file) => readFile(join(cwd, file), 'utf8');
const count = (text, marker) => text.split(marker).length - 1;
const BOTH = ['claude-code', 'universal'];

// Rules blocks through reconcile directly, until the CLI exposes --agent (phase 4).
const reconcileC = (cwd, agents, { agentsMd = true, skills = ['alpha', 'beta'] } = {}) => {
  const read = readConfig(cwd);
  return reconcile({ cwd, catalog: C, prev: read?.config ?? null, source: read?.source, agents, skills, tags: [], agentsMd, packageVersion: '0.1.0' });
};

test('resolveRulesTargets: universal → AGENTS.md; claude-code → CLAUDE.md when it exists, else AGENTS.md; one entry per file', async () => {
  const bare = await tmpProject();
  assert.deepEqual([...resolveRulesTargets(bare, ['universal'])], [['AGENTS.md', '.agents/skills']]);
  assert.deepEqual([...resolveRulesTargets(bare, ['claude-code'])], [['AGENTS.md', '.claude/skills']]);
  assert.deepEqual([...resolveRulesTargets(bare, BOTH)], [['AGENTS.md', '.agents/skills']]);

  const claude = await tmpProject();
  await writeFile(join(claude, 'CLAUDE.md'), '# Claude\n');
  assert.deepEqual([...resolveRulesTargets(claude, ['universal'])], [['AGENTS.md', '.agents/skills']]);
  assert.deepEqual([...resolveRulesTargets(claude, ['claude-code'])], [['CLAUDE.md', '.claude/skills']]);
  assert.deepEqual([...resolveRulesTargets(claude, BOTH)], [['AGENTS.md', '.agents/skills'], ['CLAUDE.md', '.claude/skills']]);
});

// A CLAUDE.md linked to AGENTS.md is one file: both agents share one block, and a second run changes nothing.
async function linkedClaudeMd(makeLink) {
  const cwd = await tmpProject();
  await writeFile(join(cwd, 'AGENTS.md'), '# Agents\n');
  await makeLink(join(cwd, 'AGENTS.md'), join(cwd, 'CLAUDE.md'));
  assert.deepEqual([...resolveRulesTargets(cwd, BOTH)], [['AGENTS.md', '.agents/skills']]);

  reconcileC(cwd, BOTH);
  const text = await readText(cwd, 'AGENTS.md');
  assert.equal(count(text, BEGIN_MARKER), 1);
  assert.ok(text.includes('.agents/skills/alpha/SKILL.md'), text);
  assert.deepEqual(Object.keys((await readConfigJson(cwd)).installed.rules), ['AGENTS.md']);
  const again = reconcileC(cwd, BOTH);
  assert.deepEqual(again.rulesActions, [{ file: 'AGENTS.md', action: 'none' }]);
  assert.equal(isPending(again), false);
  assert.equal(await readText(cwd, 'AGENTS.md'), text);
}

test('a CLAUDE.md hard-linked to AGENTS.md gets one shared block and stays idempotent', async () => {
  await linkedClaudeMd((target, path) => link(target, path));
});

test('a CLAUDE.md symlinked to AGENTS.md gets one shared block and stays idempotent', async (t) => {
  const probe = await tmpProject();
  try {
    await symlink(join(probe, 'x'), join(probe, 'y'));
  } catch {
    t.skip('symlinks are not permitted here');
    return;
  }
  await linkedClaudeMd((target, path) => symlink(target, path));
});

test('a recorded CLAUDE.md that is later linked to AGENTS.md is not unapplied over the AGENTS.md block', async () => {
  const cwd = await tmpProject();
  await writeFile(join(cwd, 'AGENTS.md'), '# Agents\n');
  await writeFile(join(cwd, 'CLAUDE.md'), '# Claude\n');
  reconcileC(cwd, BOTH);
  assert.deepEqual(Object.keys((await readConfigJson(cwd)).installed.rules), ['AGENTS.md', 'CLAUDE.md']);

  await rm(join(cwd, 'CLAUDE.md'));
  await link(join(cwd, 'AGENTS.md'), join(cwd, 'CLAUDE.md'));
  reconcileC(cwd, BOTH);
  const text = await readText(cwd, 'AGENTS.md');
  assert.equal(count(text, BEGIN_MARKER), 1);
  assert.ok(text.includes('.agents/skills/alpha/SKILL.md'), text);
  assert.deepEqual(Object.keys((await readConfigJson(cwd)).installed.rules), ['AGENTS.md']);
});

test('applyBlock never creates CLAUDE.md, not even in a dry run; marker errors name the file', async () => {
  const cwd = await tmpProject();
  const at = { cwd, file: 'CLAUDE.md', skills: [{ name: 'alpha', description: 'A' }], skillsDir: '.claude/skills' };
  assert.throws(() => applyBlock({ ...at, dryRun: true }), /CLAUDE\.md does not exist/);
  assert.throws(() => applyBlock(at), /CLAUDE\.md does not exist/);
  assert.equal(await exists(join(cwd, 'CLAUDE.md')), false);
  await writeFile(join(cwd, 'CLAUDE.md'), `${END_MARKER}\n${BEGIN_MARKER}\n`);
  assert.throws(() => applyBlock(at), /^Error: CLAUDE\.md has the END skills marker before the BEGIN marker.*CLAUDE\.md was not changed/);
});

test('both agents, agentsMd on, no CLAUDE.md: AGENTS.md gets exactly one block listing .agents/skills; CLAUDE.md is not created', async () => {
  const cwd = await tmpProject();
  const run = reconcileC(cwd, BOTH);
  assert.deepEqual(run.rulesActions, [{ file: 'AGENTS.md', action: 'create' }]);
  const text = await readText(cwd, 'AGENTS.md');
  assert.equal(count(text, BEGIN_MARKER), 1);
  assert.equal(count(text, END_MARKER), 1);
  assert.ok(text.includes('(`.agents/skills/alpha/SKILL.md`)') && text.includes('(`.agents/skills/beta/SKILL.md`)'), text);
  assert.ok(!text.includes('.claude/skills'));
  assert.equal(await exists(join(cwd, 'CLAUDE.md')), false);
  assert.deepEqual((await readConfigJson(cwd)).installed.rules, { 'AGENTS.md': { createdFile: true } });
  assert.deepEqual(reconcileC(cwd, BOTH).rulesActions, [{ file: 'AGENTS.md', action: 'none' }]);
});

test('both agents with an existing CLAUDE.md: CLAUDE.md lists .claude/skills, AGENTS.md lists .agents/skills; text outside the markers is byte-identical', async () => {
  const cwd = await tmpProject();
  const claudeText = '# Claude rules\n\nUse tabs.\n';
  const agentsText = '# Agent rules\r\n\r\nBe kind.\r\n';
  await writeFile(join(cwd, 'CLAUDE.md'), claudeText);
  await writeFile(join(cwd, 'AGENTS.md'), agentsText);
  const run = reconcileC(cwd, BOTH);
  assert.deepEqual(run.rulesActions, [{ file: 'AGENTS.md', action: 'append' }, { file: 'CLAUDE.md', action: 'append' }]);

  const claude = await readText(cwd, 'CLAUDE.md');
  assert.ok(claude.startsWith(`${claudeText}\n${BEGIN_MARKER}`) && claude.endsWith(`${END_MARKER}\n`), claude);
  assert.ok(claude.includes('(`.claude/skills/alpha/SKILL.md`)') && !claude.includes('.agents/skills'));
  const agents = await readText(cwd, 'AGENTS.md');
  assert.ok(agents.startsWith(`${agentsText}\r\n${BEGIN_MARKER}`) && agents.endsWith(`${END_MARKER}\r\n`), agents);
  assert.ok(agents.includes('(`.agents/skills/alpha/SKILL.md`)') && !agents.includes('.claude/skills'));
  assert.deepEqual((await readConfigJson(cwd)).installed.rules, { 'AGENTS.md': { createdFile: false }, 'CLAUDE.md': { createdFile: false } });

  // turning the index off restores both files byte for byte
  const off = reconcileC(cwd, BOTH, { agentsMd: false });
  assert.deepEqual(off.rulesActions, [{ file: 'AGENTS.md', action: 'remove' }, { file: 'CLAUDE.md', action: 'remove' }]);
  assert.equal(await readText(cwd, 'CLAUDE.md'), claudeText);
  assert.equal(await readText(cwd, 'AGENTS.md'), agentsText);
  assert.deepEqual((await readConfigJson(cwd)).installed.rules, {});
});

test('claude-code only, no CLAUDE.md: AGENTS.md is created and lists .claude/skills paths', async () => {
  const cwd = await tmpProject();
  const run = reconcileC(cwd, ['claude-code']);
  assert.deepEqual(run.rulesActions, [{ file: 'AGENTS.md', action: 'create' }]);
  const text = await readText(cwd, 'AGENTS.md');
  assert.ok(text.includes('(`.claude/skills/alpha/SKILL.md`)') && text.includes('(`.claude/skills/beta/SKILL.md`)'), text);
  assert.ok(!text.includes('.agents/skills'));
  assert.equal(await exists(join(cwd, 'CLAUDE.md')), false);
  assert.deepEqual((await readConfigJson(cwd)).installed.rules, { 'AGENTS.md': { createdFile: true } });
});

test('a CLAUDE.md added later: the next run moves claude-code\'s block from AGENTS.md to CLAUDE.md', async () => {
  // AGENTS.md created by us: it is deleted once the block leaves it
  const cwd = await tmpProject();
  reconcileC(cwd, ['claude-code']);
  const claudeText = '# Claude\n';
  await writeFile(join(cwd, 'CLAUDE.md'), claudeText);
  const run = reconcileC(cwd, ['claude-code']);
  assert.deepEqual(run.rulesActions, [{ file: 'CLAUDE.md', action: 'append' }, { file: 'AGENTS.md', action: 'delete' }]);
  assert.equal(await exists(join(cwd, 'AGENTS.md')), false);
  const claude = await readText(cwd, 'CLAUDE.md');
  assert.ok(claude.startsWith(`${claudeText}\n${BEGIN_MARKER}`) && claude.includes('(`.claude/skills/alpha/SKILL.md`)'), claude);
  assert.deepEqual((await readConfigJson(cwd)).installed.rules, { 'CLAUDE.md': { createdFile: false } });
  const lines = [];
  printSummary((s) => lines.push(s), run);
  assert.ok(lines.join('').includes('CLAUDE.md index: append\nAGENTS.md index: delete\n'), lines.join(''));
  assert.ok(!lines.join('').includes('warning'));
  assert.deepEqual(reconcileC(cwd, ['claude-code']).rulesActions, [{ file: 'CLAUDE.md', action: 'none' }]);

  // a consumer AGENTS.md is kept, byte-identical to what it was before the block went in
  const own = await tmpProject();
  const agentsText = '# Mine\n';
  await writeFile(join(own, 'AGENTS.md'), agentsText);
  reconcileC(own, ['claude-code']);
  await writeFile(join(own, 'CLAUDE.md'), claudeText);
  assert.deepEqual(reconcileC(own, ['claude-code']).rulesActions, [{ file: 'CLAUDE.md', action: 'append' }, { file: 'AGENTS.md', action: 'remove' }]);
  assert.equal(await readText(own, 'AGENTS.md'), agentsText);
});

test('an unpaired marker in CLAUDE.md aborts before any skill file changes, naming CLAUDE.md', async () => {
  const fresh = await tmpProject();
  await writeFile(join(fresh, 'CLAUDE.md'), `# Claude\n\n${BEGIN_MARKER}\nhalf a block\n`);
  const before = await snapshot(fresh);
  assert.throws(() => reconcileC(fresh, BOTH), /^Error: CLAUDE\.md has an unpaired or repeated skills marker.*CLAUDE\.md was not changed/);
  assert.deepEqual(await snapshot(fresh), before);

  // on an existing install a pending skill change is not applied either, also when the block is being removed
  const cwd = await tmpProject();
  await writeFile(join(cwd, 'CLAUDE.md'), '# Claude\n');
  reconcileC(cwd, BOTH);
  const text = await readText(cwd, 'CLAUDE.md');
  await writeFile(join(cwd, 'CLAUDE.md'), text.replace(END_MARKER, ''));
  await rm(join(cwd, '.claude', 'skills', 'alpha', 'SKILL.md'));
  const broken = await snapshot(cwd);
  assert.throws(() => reconcileC(cwd, BOTH), /CLAUDE\.md has an unpaired/);
  assert.throws(() => reconcileC(cwd, ['universal']), /CLAUDE\.md has an unpaired/);
  assert.throws(() => reconcileC(cwd, BOTH, { agentsMd: false }), /CLAUDE\.md has an unpaired/);
  assert.deepEqual(await snapshot(cwd), broken);
});

test('a v1 install with the AGENTS.md block upgrades with AGENTS.md byte-identical', async () => {
  for (const agentsMdText of [undefined, '# Team\n\ntext\n']) {
    const cwd = await tmpProject();
    await writeLegacyInstall(cwd, { agentsMd: true, agentsMdText, skills: [TRAINER, ASPNET] });
    const original = await readFile(join(cwd, 'AGENTS.md'));
    const r = await update(parseArgs(['update']), ctxFor(cwd, realCatalog, { packageVersion: '0.2.0' }));
    assert.deepEqual(r.rulesActions, [{ file: 'AGENTS.md', action: 'none' }]);
    assert.deepEqual(await readFile(join(cwd, 'AGENTS.md')), original);
    assert.deepEqual((await readConfigJson(cwd)).installed.rules, { 'AGENTS.md': { createdFile: agentsMdText === undefined } });
    assert.equal(await exists(join(cwd, ...LEGACY_CONFIG_FILE.split('/'))), false);
    assert.equal(await exists(join(cwd, CONFIG_FILE)), true);
  }
});

test('full remove takes the block out of every recorded rules file, validating all of them before anything is deleted', async () => {
  const rem = (cwd, out = () => {}) => remove(parseArgs(['remove']), ctxFor(cwd, C, { out }));
  const claudeText = '# Claude\n';
  const cwd = await tmpProject();
  await writeFile(join(cwd, 'CLAUDE.md'), claudeText);
  reconcileC(cwd, BOTH);

  // an unpaired marker in either file aborts with nothing deleted
  const good = await readText(cwd, 'CLAUDE.md');
  await writeFile(join(cwd, 'CLAUDE.md'), good.replace(BEGIN_MARKER, ''));
  const before = await snapshot(cwd);
  await assert.rejects(rem(cwd), /CLAUDE\.md has an unpaired/);
  assert.deepEqual(await snapshot(cwd), before);
  await writeFile(join(cwd, 'CLAUDE.md'), good);

  const lines = [];
  const r = await rem(cwd, (s) => lines.push(s));
  assert.deepEqual(r.rulesActions, [{ file: 'AGENTS.md', action: 'delete' }, { file: 'CLAUDE.md', action: 'remove' }]);
  assert.ok(lines.join('').includes('AGENTS.md index: delete\nCLAUDE.md index: remove\n'), lines.join(''));
  assert.deepEqual(Object.keys(await snapshot(cwd)), ['CLAUDE.md']);
  assert.equal(await readText(cwd, 'CLAUDE.md'), claudeText);

  // a recorded rules file deleted by hand is a warning naming it
  const gone = await tmpProject();
  await writeFile(join(gone, 'CLAUDE.md'), claudeText);
  reconcileC(gone, BOTH);
  await rm(join(gone, 'CLAUDE.md'));
  const warned = [];
  await rem(gone, (s) => warned.push(s));
  assert.ok(warned.join('').includes('warning: CLAUDE.md was already removed\n'), warned.join(''));
  assert.deepEqual(Object.keys(await snapshot(gone)), []);
});
