import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../src/catalog.js';
import { loadChangelog } from '../src/changelog.js';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const cli = join(repoRoot, 'bin', 'cli.js');
export const realCatalog = loadCatalog(repoRoot);
export const realChangelog = loadChangelog(repoRoot);
export const TRAINER = 'interview-trainer';
export const ASPNET = 'aspnet-layered-service-scaffold';

export const tmpProject = (prefix = 'proj-') => mkdtemp(join(tmpdir(), prefix));
export const ctxFor = (cwd, catalog = realCatalog, extra = {}) => ({ cwd, catalog, packageVersion: '0.1.0', changelog: realChangelog, out: () => {}, isTTY: false, ...extra });

// Line endings: fixtures build their own bytes, never the checkout's (byte-exact `latin1` round trip, no UTF-8 decode).
export const toLf = (buf) => Buffer.from(buf.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');
export const toCrlf = (buf) => Buffer.from(toLf(buf).toString('latin1').replaceAll('\n', '\r\n'), 'latin1');

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

export const CONFIG_FILE = '.pa-skills.json';
export const LEGACY_CONFIG_FILE = '.agents/.pa-skills-config.json';
export const readConfigJson = async (cwd) => JSON.parse(await readFile(join(cwd, CONFIG_FILE), 'utf8'));

const sortKeysDeep = (v) =>
  Array.isArray(v) ? v.map(sortKeysDeep) : v !== null && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeysDeep(v[k])])) : v;

/**
 * Reproduce, byte for byte, what `add --skill <skills> [--agents-md]` of the published v0.2.0 leaves on disk: copies under
 * .agents/skills, an optional AGENTS.md block (appended to `agentsMdText` when given, else in a created file) and the
 * version 1 config at .agents/.pa-skills-config.json. Written by hand so later source changes cannot shift the fixture.
 */
export async function writeLegacyInstall(cwd, { agentsMd = false, agentsMdText, skills = [TRAINER], catalog = realCatalog, packageVersion = '0.2.0' } = {}) {
  const names = [...skills].sort();
  const files = [];
  for (const name of names) {
    const skill = catalog.skills.get(name);
    for (const file of skill.files) {
      // v0.2.0 wrote and hashed the published (LF) bytes; a Windows checkout may hold `dist/` as CRLF, so use the LF
      // form (the catalog is text) rather than the checkout's bytes.
      const lf = toLf(await readFile(join(skill.dir, ...file.split('/'))));
      const rel = `.agents/skills/${name}/${file}`;
      await mkdir(dirname(join(cwd, ...rel.split('/'))), { recursive: true });
      await writeFile(join(cwd, ...rel.split('/')), lf);
      files.push({ path: rel, sha256: createHash('sha256').update(lf).digest('hex') });
    }
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  let createdFile = false;
  if (agentsMd) {
    const lines = ['<!-- BEGIN @pavel-agarkov/skills -->', '## Skills', ''];
    for (const n of names) lines.push(`- **${n}**: ${catalog.skills.get(n).description} (\`.agents/skills/${n}/SKILL.md\`)`);
    lines.push('<!-- END @pavel-agarkov/skills -->');
    const block = lines.join('\n');
    createdFile = agentsMdText === undefined;
    const before = agentsMdText ?? '';
    const sep = before === '' ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    await writeFile(join(cwd, 'AGENTS.md'), `${before}${sep}${block}\n`);
  }
  const config = {
    version: 1,
    package: '@pavel-agarkov/skills',
    packageVersion,
    skills: names,
    tags: [],
    agentsMd,
    installed: { skills: names, files, agentsMd: { present: agentsMd, createdFile } },
  };
  await writeFile(join(cwd, '.agents', '.pa-skills-config.json'), `${JSON.stringify(sortKeysDeep(config), null, 2)}\n`);
}

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
