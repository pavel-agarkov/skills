import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../src/catalog.js';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const cli = join(repoRoot, 'bin', 'cli.js');
export const realCatalog = loadCatalog(repoRoot);
export const TRAINER = 'interview-trainer';
export const ASPNET = 'aspnet-layered-service-scaffold';

export const tmpProject = (prefix = 'proj-') => mkdtemp(join(tmpdir(), prefix));
export const ctxFor = (cwd, catalog = realCatalog, extra = {}) => ({ cwd, catalog, packageVersion: '0.1.0', out: () => {}, isTTY: false, ...extra });

/** Every file under dir as { relPath: base64 }. */
export async function snapshot(dir, base = dir) {
  const out = {};
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) Object.assign(out, await snapshot(abs, base));
    else out[abs.slice(base.length + 1).replaceAll('\\', '/')] = (await readFile(abs)).toString('base64');
  }
  return out;
}

export const readConfigJson = async (cwd) => JSON.parse(await readFile(join(cwd, '.agents', '.pa-skills-config.json'), 'utf8'));

/** Build a temp package root with dist/skills/<name>/SKILL.md for each { name: [tags...] } and load it. */
export async function makeCatalog(spec) {
  const root = await mkdtemp(join(tmpdir(), 'catalog-'));
  for (const [name, tags] of Object.entries(spec)) {
    const dir = join(root, 'dist', 'skills', name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: Skill ${name}\ntags: [${tags.join(', ')}]\n---\n\nBody of ${name}\n`);
  }
  return { root, catalog: loadCatalog(root) };
}
