import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG_REL_PATH, LEGACY_CONFIG_REL_PATH, configPath, legacyConfigPath, readConfig, serializeConfig, upgradeV1, validateConfig, writeConfig } from '../src/config.js';

const sample = () => ({
  version: 2,
  package: '@pavel-agarkov/skills',
  packageVersion: '0.1.0',
  agents: ['universal'],
  skills: ['b', 'a'],
  tags: ['z', 'y'],
  agentsMd: false,
  installed: {
    skills: ['b', 'a'],
    files: [
      { sha256: '2', path: '.agents/skills/b/SKILL.md' },
      { sha256: '1', path: '.agents/skills/a/SKILL.md' },
    ],
    rules: {},
  },
});

const sampleV1 = (agentsMd = { present: false, createdFile: false }) => {
  const { agents: _agents, installed, ...rest } = sample();
  const { rules: _rules, ...inst } = installed;
  return { ...rest, version: 1, agentsMd: agentsMd.present, installed: { ...inst, agentsMd } };
};

const exists = (p) => stat(p).then(() => true, () => false);

test('config paths: root .pa-skills.json, legacy .agents/.pa-skills-config.json', async () => {
  assert.equal(CONFIG_REL_PATH, '.pa-skills.json');
  assert.equal(LEGACY_CONFIG_REL_PATH, '.agents/.pa-skills-config.json');
  assert.equal(configPath('/p'), join('/p', '.pa-skills.json'));
  assert.equal(legacyConfigPath('/p'), join('/p', '.agents', '.pa-skills-config.json'));
});

test('readConfig returns null when absent', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'cfg-'));
  assert.equal(readConfig(cwd), null);
});

test('write is deterministic: sorted keys and lists, 2 spaces, trailing newline, no timestamps', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'cfg-'));
  assert.equal(writeConfig(cwd, sample()), true);
  const text = await readFile(configPath(cwd), 'utf8');
  assert.ok(text.endsWith('}\n'));
  assert.ok(text.startsWith('{\n  "agents": [\n    "universal"\n  ],\n  "agentsMd": false,\n'));
  assert.ok(!/time|date/i.test(text));
  const parsed = JSON.parse(text);
  assert.deepEqual(parsed.skills, ['a', 'b']);
  assert.deepEqual(parsed.installed.files.map((f) => f.path), ['.agents/skills/a/SKILL.md', '.agents/skills/b/SKILL.md']);
  assert.deepEqual(Object.keys(parsed), [...Object.keys(parsed)].sort());
  // Rewriting the same selection (even with shuffled input) yields identical bytes and no write.
  assert.equal(writeConfig(cwd, sample()), false);
  assert.equal(await readFile(configPath(cwd), 'utf8'), text);
  const read = readConfig(cwd);
  assert.deepEqual([read.source, read.staleLegacy], ['root', false]);
  assert.equal(serializeConfig(read.config), text);
  assert.deepEqual(await readdir(cwd), ['.pa-skills.json']);
});

test('corrupt JSON gives a clear error naming the file', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'cfg-'));
  await writeFile(configPath(cwd), '{ not json');
  assert.throws(() => readConfig(cwd), /cannot parse \.pa-skills\.json: .*nothing was changed/);

  const legacy = await mkdtemp(join(tmpdir(), 'cfg-'));
  await mkdir(join(legacy, '.agents'));
  await writeFile(legacyConfigPath(legacy), '{ not json');
  assert.throws(() => readConfig(legacy), /cannot parse \.agents\/\.pa-skills-config\.json: .*nothing was changed/);
});

test('invalid shape is rejected: version 2 is accepted, version 3 is not', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'cfg-'));
  await writeFile(configPath(cwd), JSON.stringify(sample()));
  assert.equal(readConfig(cwd).config.version, 2);
  await writeFile(configPath(cwd), JSON.stringify({ ...sample(), version: 3 }));
  assert.throws(() => readConfig(cwd), /invalid config \.pa-skills\.json: unsupported version 3/);
  await writeFile(configPath(cwd), JSON.stringify(sampleV1()));
  assert.throws(() => readConfig(cwd), /unsupported version 1/); // v1 is only read from the legacy path
  assert.throws(() => validateConfig({ ...sample(), agentsMd: 'yes' }), /agentsMd/);
  assert.throws(() => validateConfig({ ...sample(), installed: { ...sample().installed, files: [{ path: 1 }] } }), /installed.files/);
});

test('v2 requires known, unique agents and installed.rules keyed by AGENTS.md / CLAUDE.md', () => {
  for (const agents of [undefined, 'universal', ['cursor'], ['universal', 'universal']]) {
    assert.throws(() => validateConfig({ ...sample(), agents }), /"agents" must be/, String(agents));
  }
  assert.deepEqual(validateConfig({ ...sample(), agents: ['universal', 'claude-code'] }).agents, ['universal', 'claude-code']);
  assert.equal(validateConfig({ ...sample(), agents: [] }).agents.length, 0); // allowed in memory
  const withRules = (rules) => ({ ...sample(), installed: { ...sample().installed, rules } });
  assert.ok(validateConfig(withRules({ 'AGENTS.md': { createdFile: true }, 'CLAUDE.md': { createdFile: false } })));
  assert.throws(() => validateConfig(withRules(undefined)), /"installed.rules" must be an object/);
  assert.throws(() => validateConfig(withRules({ 'README.md': { createdFile: false } })), /"installed.rules" key "README.md"/);
  assert.throws(() => validateConfig(withRules({ 'AGENTS.md': { createdFile: 'no' } })), /createdFile/);
  // CLAUDE.md is never created by us, so a hand-edited true flag must not let remove delete it
  assert.throws(() => validateConfig(withRules({ 'CLAUDE.md': { createdFile: true } })), /"installed.rules.CLAUDE.md.createdFile" must be false/);
  const { rules: _rules, ...noRules } = sample().installed;
  assert.throws(() => validateConfig({ ...sample(), installed: { ...noRules, agentsMd: { present: false, createdFile: false } } }), /installed.rules/);
});

test('writeConfig refuses an empty agents list and writes nothing', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'cfg-'));
  assert.throws(() => writeConfig(cwd, { ...sample(), agents: [] }), /empty "agents"/);
  assert.deepEqual(await readdir(cwd), []);
});

test('upgradeV1 maps the AGENTS.md state onto installed.rules and leaves agents empty', () => {
  const plain = upgradeV1(sampleV1());
  assert.deepEqual(plain, { ...sample(), agents: [] });
  const withBlock = upgradeV1(sampleV1({ present: true, createdFile: true }));
  assert.equal(withBlock.agentsMd, true);
  assert.deepEqual(withBlock.installed.rules, { 'AGENTS.md': { createdFile: true } });
  assert.equal('agentsMd' in withBlock.installed, false);
  assert.throws(() => upgradeV1({ ...sampleV1(), version: 2 }), /unsupported version 2/);
  assert.throws(() => upgradeV1({ ...sampleV1(), installed: { ...sampleV1().installed, agentsMd: undefined } }), /installed.agentsMd/);
});

test('read order: root first, legacy as a fallback; both present marks the legacy file stale', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'cfg-'));
  await mkdir(join(cwd, '.agents'));
  await writeFile(legacyConfigPath(cwd), JSON.stringify(sampleV1()));
  const legacy = readConfig(cwd);
  assert.deepEqual([legacy.source, legacy.staleLegacy, legacy.config.version, legacy.config.agents], ['legacy', false, 2, []]);

  await writeFile(configPath(cwd), JSON.stringify({ ...sample(), packageVersion: '9.9.9' }));
  const both = readConfig(cwd);
  assert.deepEqual([both.source, both.staleLegacy, both.config.packageVersion], ['root', true, '9.9.9']);
});

test('writeConfig with source legacy writes the root, then deletes the legacy file and an empty .agents/', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'cfg-'));
  await mkdir(join(cwd, '.agents'));
  await writeFile(legacyConfigPath(cwd), JSON.stringify(sampleV1()));
  assert.equal(writeConfig(cwd, sample(), { source: 'legacy' }), true);
  assert.deepEqual(await readdir(cwd), ['.pa-skills.json']);

  // a non-empty .agents/ stays
  const busy = await mkdtemp(join(tmpdir(), 'cfg-'));
  await mkdir(join(busy, '.agents', 'skills'), { recursive: true });
  await writeFile(legacyConfigPath(busy), JSON.stringify(sampleV1()));
  writeConfig(busy, sample(), { source: 'legacy' });
  assert.equal(await exists(legacyConfigPath(busy)), false);
  assert.deepEqual(await readdir(join(busy, '.agents')), ['skills']);

  // a failing root write keeps the legacy file
  const blocked = await mkdtemp(join(tmpdir(), 'cfg-'));
  await mkdir(join(blocked, '.agents'));
  await writeFile(legacyConfigPath(blocked), 'v1');
  await mkdir(configPath(blocked)); // a directory where the root file should go
  assert.throws(() => writeConfig(blocked, sample(), { source: 'legacy' }));
  assert.equal(await readFile(legacyConfigPath(blocked), 'utf8'), 'v1');

  // without source legacy, a legacy file is never touched
  const stale = await mkdtemp(join(tmpdir(), 'cfg-'));
  await mkdir(join(stale, '.agents'));
  await writeFile(legacyConfigPath(stale), 'old');
  writeConfig(stale, sample(), { source: 'root' });
  assert.equal(await readFile(legacyConfigPath(stale), 'utf8'), 'old');
});

// Line endings: a CRLF checkout (core.autocrlf) turns the committed config into CRLF; only real content changes rewrite it.
const crlfOf = (text) => Buffer.from(text.replaceAll('\n', '\r\n'), 'utf8');
const hasBareLf = (buf) => /(^|[^\r])\n/.test(buf.toString('utf8'));

test('a CRLF config with the same content is not rewritten and keeps its bytes', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'cfg-'));
  writeConfig(cwd, sample());
  const crlf = crlfOf(await readFile(configPath(cwd), 'utf8'));
  await writeFile(configPath(cwd), crlf);
  assert.equal(writeConfig(cwd, sample()), false);
  assert.deepEqual(await readFile(configPath(cwd)), crlf);
});

test('a CRLF config with a real change is rewritten with CRLF only; an LF config stays LF', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'cfg-'));
  writeConfig(cwd, sample());
  await writeFile(configPath(cwd), crlfOf(await readFile(configPath(cwd), 'utf8')));
  assert.equal(writeConfig(cwd, { ...sample(), packageVersion: '0.2.0' }), true);
  const crlf = await readFile(configPath(cwd));
  assert.ok(crlf.includes('\r\n'));
  assert.equal(hasBareLf(crlf), false);
  assert.equal(JSON.parse(crlf.toString('utf8')).packageVersion, '0.2.0');

  const lf = await mkdtemp(join(tmpdir(), 'cfg-'));
  writeConfig(lf, sample());
  assert.equal(writeConfig(lf, { ...sample(), packageVersion: '0.2.0' }), true);
  const text = await readFile(configPath(lf), 'utf8');
  assert.equal(text.includes('\r'), false);
  assert.equal(text, serializeConfig(readConfig(lf).config));
  assert.equal(readConfig(lf).config.packageVersion, '0.2.0');
});
