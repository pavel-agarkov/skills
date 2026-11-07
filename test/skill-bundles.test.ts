import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSkills } from '../scripts/build.ts';

// Not from helpers.ts: loading the real catalog there would fail first on a stray dist/skills/<name>/ with no SKILL.md.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const HINT = 'run `npm run build` and commit dist/skills';

/** Every dist/skills/<skill>/scripts/*.mjs on disk under base, as sorted forward-slash paths relative to base. */
function bundlesUnder(base: string): string[] {
  const list = (dir: string) => {
    try {
      return readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  };
  const out: string[] = [];
  for (const skill of list(base)) {
    if (!skill.isDirectory()) continue;
    for (const file of list(join(base, skill.name, 'scripts'))) {
      if (file.isFile() && file.name.endsWith('.mjs')) out.push(`${skill.name}/scripts/${file.name}`);
    }
  }
  return out.sort();
}

// The fresh build uses the real root (esbuild's absWorkingDir), so the input-path comments match the committed bundles.
// git may check the bundles out with CRLF on Windows; compare the LF form esbuild writes.
test('committed skill bundles equal a fresh build of src/skills', async (t) => {
  const outDir = await mkdtemp(join(tmpdir(), 'skill-bundles-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));

  const written = await buildSkills({ root: repoRoot, srcDir: 'src/skills', outDir });
  const fresh = written.map((p) => relative(outDir, p).replaceAll('\\', '/')).sort();
  assert.deepEqual(fresh, bundlesUnder(outDir), 'every bundle is a <skill>/scripts/<name>.mjs');

  const committedDir = join(repoRoot, 'dist', 'skills');
  const committed = bundlesUnder(committedDir);
  const stale = committed.filter((p) => !fresh.includes(p));
  const missing = fresh.filter((p) => !committed.includes(p));
  assert.deepEqual(stale, [], `committed bundles with no source in src/skills: ${stale.join(', ')}; delete them, or ${HINT}`);
  assert.deepEqual(missing, [], `skill scripts with no committed bundle: ${missing.join(', ')}; ${HINT}`);

  for (const rel of fresh) {
    const read = (base: string) => readFileSync(join(base, ...rel.split('/')), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(read(committedDir), read(outDir), `dist/skills/${rel} is out of date; ${HINT}`);
  }
});
