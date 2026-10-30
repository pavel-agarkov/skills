import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../src/args.js';
import { loadCatalog } from '../src/catalog.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = loadCatalog(root);
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const readmes = ['README.md', ...readdirSync(join(root, 'dist', 'skills')).map((n) => `dist/skills/${n}/README.md`)];

/** Every `npx @pavel-agarkov/skills[@x] <args>` occurrence, as an argv array. */
function commandsIn(text) {
  const out = [];
  for (const m of text.matchAll(/npx @pavel-agarkov\/skills(?:@[\w.-]+)?([^\n`|]*)/g)) {
    out.push({ raw: m[0].trim(), argv: m[1].trim().split(/\s+/).filter(Boolean) });
  }
  return out;
}

test('every skill has a README', () => {
  for (const r of readmes) assert.ok(existsSync(join(root, r)), `${r} missing`);
});

test('npx commands in READMEs parse and reference valid skills and tags', () => {
  let total = 0;
  for (const rel of readmes) {
    for (const { raw, argv } of commandsIn(read(rel))) {
      total++;
      assert.ok(!raw.includes('<'), `${rel}: placeholder in command "${raw}"`);
      let opts;
      assert.doesNotThrow(() => (opts = parseArgs(argv)), `${rel}: "${raw}" does not parse`);
      for (const s of opts.skills) assert.ok(catalog.skills.has(s), `${rel}: unknown skill "${s}" in "${raw}"`);
      for (const t of opts.tags) assert.ok(catalog.tags.has(t), `${rel}: unknown tag "${t}" in "${raw}"`);
    }
  }
  assert.ok(total > 10, 'expected many commands to be checked');
});

test('skill READMEs show the skill install command, every tag and a multi-tag example', () => {
  for (const s of catalog.skills.values()) {
    const text = read(`dist/skills/${s.name}/README.md`);
    assert.ok(text.includes(`npx @pavel-agarkov/skills add --skill ${s.name}`), `${s.name}: skill command`);
    for (const t of s.tags) assert.ok(text.includes(`add --tag ${t}`), `${s.name}: tag ${t}`);
    assert.ok(commandsIn(text).some((c) => parseArgs(c.argv).tags.length > 1), `${s.name}: multi-tag example`);
  }
});

test('root README mentions each skill and tag, and the Vercel section', () => {
  const text = read('README.md');
  for (const s of catalog.skills.values()) assert.ok(text.includes(s.name), s.name);
  for (const t of catalog.tags.keys()) assert.ok(text.includes(`\`${t}\``), `tag ${t}`);
  assert.ok(text.includes("Using Vercel's skills CLI instead"));
  assert.ok(text.includes('npx skills add pavel-agarkov/skills --skill'));
  assert.ok(text.includes('DISABLE_TELEMETRY=1'));
  assert.ok(text.includes('dist/skills/'));
});

test('root README documents the agents and the root config; the legacy config path only in the upgrade section', () => {
  const text = read('README.md').replace(/\r\n/g, '\n');
  for (const s of ['.pa-skills.json', '--agent', 'claude-code', 'universal']) assert.ok(text.includes(s), `README must mention ${s}`);
  const start = text.indexOf('### Upgrading from 0.2.x\n');
  assert.ok(start >= 0, 'README needs an "Upgrading from 0.2.x" section');
  const body = text.indexOf('\n', start) + 1;
  const next = text.slice(body).search(/^#{1,3} /m);
  const end = next < 0 ? text.length : body + next;
  const outside = text.slice(0, start) + text.slice(end);
  assert.ok(text.slice(start, end).includes('.agents/.pa-skills-config.json'), 'the upgrade section names the old config path');
  assert.ok(!outside.includes('.agents/.pa-skills-config.json'), 'the old config path appears outside the upgrade section');
});

test('README command examples use only the current command surface', () => {
  for (const rel of readmes) {
    for (const { raw, argv } of commandsIn(read(rel))) {
      assert.ok(!['install', 'uninstall', 'configure'].includes(argv[0]), `${rel}: old command in "${raw}"`);
      assert.ok(!raw.includes('--no-agents-md'), `${rel}: --no-agents-md in "${raw}"`);
    }
  }
});

test('publish workflow has the required guards and no secrets', () => {
  const wf = read('.github/workflows/publish.yml');
  assert.match(wf, /npm view/);
  assert.match(wf, /npm publish --provenance --access public/);
  assert.match(wf, /id-token: write/);
  assert.doesNotMatch(wf, /NPM_TOKEN|NODE_AUTH_TOKEN|secrets\./); // trusted publishing: no token
  assert.match(wf, /ubuntu-latest/);
  assert.match(wf, /windows-latest/);
  assert.match(wf, /'22'/);
  assert.match(wf, /branches:\s*(\[\s*main\s*\]|\n\s*- main\b)/);
  assert.doesNotMatch(wf, /^\s*tags:/m); // no tag trigger: merges to main publish
  assert.match(wf, /workflow_dispatch/);
  assert.match(wf, /cancel-in-progress: false/);
  assert.match(wf, /needs: test/);
  assert.match(wf, /contents: write/);
  assert.match(wf, /registry-url: 'https:\/\/registry\.npmjs\.org'/);
  assert.match(wf, /scripts\/changelog\.js notes/);
  assert.match(wf, /gh release create/);
  assert.doesNotMatch(wf, /npm_[A-Za-z0-9]{20,}/);
  assert.doesNotMatch(wf, /NODE_AUTH_TOKEN:\s*(?!\$\{\{)\S/);
});

test('ci workflow runs on every PR and exposes one aggregate check', () => {
  const wf = read('.github/workflows/ci.yml');
  assert.match(wf, /pull_request/);
  assert.match(wf, /ubuntu-latest/);
  assert.match(wf, /windows-latest/);
  assert.match(wf, /'22'/);
  assert.match(wf, /scripts\/release-check\.js/);
  assert.match(wf, /^ {2}ci:/m);
  assert.match(wf, /if: always\(\)/);
  assert.match(wf, /needs: \[test, release-check\]/);
  assert.doesNotMatch(wf, /paths(-ignore)?:/); // a filtered-out workflow leaves the required check pending
  assert.doesNotMatch(wf, /NPM_TOKEN|NODE_AUTH_TOKEN|GH_TOKEN|secrets\./);
});

test('no .npmrc is committed', () => {
  const ignoredDirs = new Set(['node_modules', '.git', '.claude', 'context']);
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!ignoredDirs.has(e.name)) walk(join(dir, e.name));
      } else assert.notEqual(e.name, '.npmrc', `${join(dir, e.name)} must not be committed`);
    }
  };
  walk(root);
});
