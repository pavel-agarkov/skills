import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../src/catalog.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('skills.sh.json declares ./dist/skills/', () => {
  const cfg = JSON.parse(readFileSync(join(repoRoot, 'skills.sh.json'), 'utf8'));
  assert.ok(cfg.paths.includes('./dist/skills/'));
  for (const p of cfg.paths) assert.ok(p.startsWith('./') && !p.includes('\\'));
  assert.ok(existsSync(join(repoRoot, 'dist', 'skills')));
});

test('every SKILL.md has string name and description', () => {
  const base = join(repoRoot, 'dist', 'skills');
  const dirs = readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory());
  assert.ok(dirs.length > 0);
  for (const d of dirs) {
    const fm = parseFrontmatter(readFileSync(join(base, d.name, 'SKILL.md'), 'utf8'));
    assert.equal(typeof fm.name, 'string', d.name);
    assert.equal(typeof fm.description, 'string', d.name);
  }
});
