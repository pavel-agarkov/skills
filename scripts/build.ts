#!/usr/bin/env node
// Bundles the CLI and every skill script with esbuild. Usage: node scripts/build.ts
//
// Skill-script convention:
// - Entries: src/skills/<skill>/scripts/*.ts (not *.test.ts, not *.d.ts). Each becomes one self-contained
//   dist/skills/<skill>/scripts/<name>.mjs, and a leading `#!/usr/bin/env node` is kept.
// - Shared modules live in src/shared/ and skill-private modules in src/skills/<skill>/lib/. Neither is an entry:
//   entries import them with explicit `.ts` specifiers and esbuild inlines them into each bundle.
// - A skill bundle may import only `node:` builtins and must be a single output file; anything else fails the build.
//   So do esbuild warnings and runtime loads the metafile cannot see (computed import(), createRequire, getBuiltinModule).
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Skill-script entries under srcDir, sorted, as absolute paths. */
function skillEntries(srcDir: string): string[] {
  const list = (dir: string) => {
    try {
      return readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  };
  const entries: string[] = [];
  for (const skill of list(srcDir)) {
    if (!skill.isDirectory()) continue;
    const scripts = join(srcDir, skill.name, 'scripts');
    for (const file of list(scripts)) {
      const name = file.name;
      if (!file.isFile() || !name.endsWith('.ts') || name.endsWith('.test.ts') || name.endsWith('.d.ts')) continue;
      entries.push(join(scripts, name));
    }
  }
  return entries.sort();
}

/**
 * Bundles every skill-script entry under srcDir into outDir and returns the written paths (absolute).
 * Nothing is written when a bundle breaks self-containment.
 */
export async function buildSkills({
  root = repoRoot,
  srcDir = 'src/skills',
  outDir = 'dist/skills',
}: { root?: string; srcDir?: string; outDir?: string } = {}): Promise<string[]> {
  const src = resolve(root, srcDir);
  const out = resolve(root, outDir);
  const entryPoints = skillEntries(src);
  if (entryPoints.length === 0) return [];

  const result = await build({
    entryPoints,
    outbase: src,
    outdir: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outExtension: { '.js': '.mjs' },
    packages: 'bundle',
    external: ['node:*'],
    splitting: false,
    metafile: true,
    absWorkingDir: root,
    logLevel: 'warning',
    minify: false,
    write: false,
  });

  const problems: string[] = result.warnings.map((w) => `esbuild warning: ${w.text}`);
  for (const file of result.outputFiles) {
    // The metafile cannot see loads whose target is computed at runtime.
    if (/\bcreateRequire\b|\bgetBuiltinModule\b|\bimport\s*\(\s*(?!["'`])/.test(file.text)) {
      problems.push(`${file.path}: loads code at runtime (computed import(), createRequire or getBuiltinModule)`);
    }
  }
  const outputs = Object.entries(result.metafile.outputs);
  for (const [path, meta] of outputs) {
    if (!meta.entryPoint) problems.push(`${path}: not an entry bundle (each skill script must be one file)`);
    for (const imp of meta.imports) {
      if (!imp.path.startsWith('node:')) problems.push(`${path}: imports "${imp.path}" (only node: builtins are allowed)`);
    }
  }
  if (outputs.length !== entryPoints.length) {
    problems.push(`expected ${entryPoints.length} output file(s), esbuild emitted ${outputs.length}`);
  }
  if (problems.length > 0) throw new Error(`skill bundles are not self-contained:\n  ${problems.join('\n  ')}`);

  const written: string[] = [];
  for (const file of result.outputFiles) {
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.contents);
    written.push(file.path);
  }
  return written.sort();
}

/**
 * Bundles src/cli.ts into the single file bin/cli.js (the package `bin`) and returns the written path (absolute).
 * bin/ sits one level below the root like src/, so the CLI's `'..'` package-root lookup holds in both.
 */
export async function buildCli({ root = repoRoot }: { root?: string } = {}): Promise<string[]> {
  const result = await build({
    entryPoints: [resolve(root, 'src/cli.ts')],
    outfile: resolve(root, 'bin/cli.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    splitting: false,
    metafile: true,
    absWorkingDir: root,
    logLevel: 'warning',
    minify: false,
    write: false,
  });

  const written: string[] = [];
  for (const file of result.outputFiles) {
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.contents);
    written.push(file.path);
  }
  return written.sort();
}

async function main() {
  try {
    const written = [...(await buildCli({ root: repoRoot })), ...(await buildSkills({ root: repoRoot }))];
    for (const path of written) console.log(`wrote ${relative(repoRoot, path).replaceAll('\\', '/')}`);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}

// Run only when executed directly, so tests can import the builders without side effects.
// Windows paths are case-insensitive, so compare the file URLs case-insensitively there.
const norm = (url: string) => (process.platform === 'win32' ? url.toLowerCase() : url);
if (process.argv[1] && norm(import.meta.url) === norm(pathToFileURL(resolve(process.argv[1])).href)) await main();
