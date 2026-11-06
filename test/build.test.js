import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { buildSkills } from '../scripts/build.ts';
import { tmpProject } from './helpers.js';

const SHEBANG = '#!/usr/bin/env node';

async function writeTree(root, files) {
  for (const [rel, text] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, text);
  }
}

test('buildSkills bundles a skill entry with its shared module into one self-contained .mjs', async (t) => {
  const root = await tmpProject('build-');
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeTree(root, {
    'src/shared/greet.ts': "export const greet = (name: string): string => `hello, ${name} from shared`;\n",
    'src/skills/demo/scripts/run.ts': [
      SHEBANG,
      "import { existsSync } from 'node:fs';",
      "import { greet } from '../../../shared/greet.ts';",
      'console.log(`${greet(process.argv[2] ?? "nobody")} ${existsSync(process.argv[1] ?? "")}`);',
      '',
    ].join('\n'),
    'src/skills/demo/scripts/run.test.ts': 'throw new Error("tests are not entries");\n',
    'src/skills/demo/scripts/types.d.ts': 'export type Unused = string;\n',
    'src/skills/demo/lib/private.ts': 'export const unused = 1;\n',
  });

  const written = await buildSkills({ root, srcDir: 'src/skills', outDir: 'dist/skills' });

  const out = join(root, 'dist', 'skills', 'demo', 'scripts', 'run.mjs');
  assert.deepEqual(written, [out]);
  const text = await readFile(out, 'utf8');
  assert.equal(text.split('\n')[0], SHEBANG);
  assert.match(text, /from shared/, 'the shared module is inlined');
  assert.doesNotMatch(text, /greet\.ts['"]/, 'no import of the shared source remains');
  assert.equal(existsSync(join(root, 'dist', 'skills', 'demo', 'lib')), false);
  assert.equal(execFileSync(process.execPath, [out, 'demo'], { encoding: 'utf8' }), 'hello, demo from shared true\n');
});

test('buildSkills rejects a skill entry that imports a bare package and writes nothing', async (t) => {
  const root = await tmpProject('build-');
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeTree(root, {
    'src/skills/demo/scripts/pad.ts': "import leftPad from 'left-pad';\nconsole.log(leftPad('x', 3));\n",
  });

  await assert.rejects(buildSkills({ root }), /left-pad/);
  assert.equal(existsSync(join(root, 'dist')), false);
});

test('buildSkills rejects a skill entry that imports a builtin without the node: prefix', async (t) => {
  const root = await tmpProject('build-');
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeTree(root, {
    'src/skills/demo/scripts/fs.ts': "import { existsSync } from 'fs';\nconsole.log(existsSync('.'));\n",
  });

  await assert.rejects(buildSkills({ root }), /imports "fs" \(only node: builtins are allowed\)/);
  assert.equal(existsSync(join(root, 'dist')), false);
});

test('buildSkills with no entries writes nothing', async (t) => {
  const root = await tmpProject('build-');
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(await buildSkills({ root }), []);
  assert.equal(existsSync(join(root, 'dist')), false);
});
