import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { AGENT_IDS } from './agents.js';
import { eolOf } from './agents-md.js';

export const PACKAGE_NAME = '@pavel-agarkov/skills';
export const CONFIG_REL_PATH = '.pa-skills.json';
/** Where v0.1.0/v0.2.0 kept the (version 1) config. Read as a fallback and retired on the first real write. */
export const LEGACY_CONFIG_REL_PATH = '.agents/.pa-skills-config.json';

const RULES_FILES = ['AGENTS.md', 'CLAUDE.md'];

const relToAbs = (cwd, rel) => join(cwd, ...rel.split('/'));

export function configPath(cwd) {
  return relToAbs(cwd, CONFIG_REL_PATH);
}

export function legacyConfigPath(cwd) {
  return relToAbs(cwd, LEGACY_CONFIG_REL_PATH);
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

/** Deterministic text form: sorted keys, 2-space indent, trailing newline, no timestamps. */
export function serializeConfig(config) {
  return `${JSON.stringify(sortKeys(config), null, 2)}\n`;
}

const isStringArray = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const failer = (rel) => (why) => {
  throw new Error(`invalid config ${rel}: ${why}`);
};

/** The checks v1 and v2 share. `fail` throws. */
function validateCommon(config, fail) {
  if (typeof config.package !== 'string') fail('"package" must be a string');
  if (typeof config.packageVersion !== 'string') fail('"packageVersion" must be a string');
  if (!isStringArray(config.skills)) fail('"skills" must be an array of strings');
  if (!isStringArray(config.tags)) fail('"tags" must be an array of strings');
  if (typeof config.agentsMd !== 'boolean') fail('"agentsMd" must be a boolean');
  const inst = config.installed;
  if (inst === null || typeof inst !== 'object') fail('"installed" must be an object');
  if (!isStringArray(inst.skills)) fail('"installed.skills" must be an array of strings');
  if (!Array.isArray(inst.files)) fail('"installed.files" must be an array');
  for (const f of inst.files) {
    if (!f || typeof f.path !== 'string' || typeof f.sha256 !== 'string') {
      fail('"installed.files" entries need string "path" and "sha256"');
    }
    // Manifest paths are project-relative with forward slashes; anything else would be resolved
    // differently per OS (or escape the project) and could delete the wrong file.
    if (f.path.includes('\\') || f.path.startsWith('/') || /^[A-Za-z]:/.test(f.path) || f.path.split('/').includes('..')) {
      fail(`"installed.files" path ${JSON.stringify(f.path)} must be project-relative with forward slashes (no backslashes, absolute paths or ".."); fix or delete the config`);
    }
  }
}

/**
 * Validates a version 2 config; throws a descriptive Error when the shape is wrong. An empty `agents`
 * ("not chosen yet", from a v1 upgrade) is valid here; writeConfig refuses it. `rel` names the file in errors.
 */
export function validateConfig(config, rel = CONFIG_REL_PATH) {
  const fail = failer(rel);
  if (!isObject(config)) fail('expected a JSON object');
  if (config.version !== 2) fail(`unsupported version ${JSON.stringify(config.version)}`);
  validateCommon(config, fail);
  const { agents } = config;
  if (!isStringArray(agents) || agents.some((a) => !AGENT_IDS.includes(a)) || new Set(agents).size !== agents.length) {
    fail(`"agents" must be an array of unique agent ids (${AGENT_IDS.join(', ')})`);
  }
  const rules = config.installed.rules;
  if (!isObject(rules)) fail('"installed.rules" must be an object');
  for (const [file, state] of Object.entries(rules)) {
    if (!RULES_FILES.includes(file)) fail(`"installed.rules" key ${JSON.stringify(file)} must be one of ${RULES_FILES.join(', ')}`);
    if (!isObject(state) || typeof state.createdFile !== 'boolean') fail(`"installed.rules.${file}" needs boolean "createdFile"`);
    // Only AGENTS.md is ever created by us; a true flag elsewhere would let removeBlock delete the consumer's file.
    if (state.createdFile && file !== 'AGENTS.md') fail(`"installed.rules.${file}.createdFile" must be false (${file} is never created by this package)`);
  }
  return config;
}

/** Validates a version 1 config and returns it as version 2 with `agents: []` (to be chosen by the caller). */
export function upgradeV1(v1, rel = LEGACY_CONFIG_REL_PATH) {
  const fail = failer(rel);
  if (!isObject(v1)) fail('expected a JSON object');
  if (v1.version !== 1) fail(`unsupported version ${JSON.stringify(v1.version)}`);
  validateCommon(v1, fail);
  const a = v1.installed.agentsMd;
  if (!a || typeof a.present !== 'boolean' || typeof a.createdFile !== 'boolean') {
    fail('"installed.agentsMd" needs boolean "present" and "createdFile"');
  }
  const { agentsMd: _agentsMd, ...installed } = v1.installed;
  const v2 = {
    ...v1,
    version: 2,
    agents: [],
    installed: { ...installed, rules: a.present ? { 'AGENTS.md': { createdFile: a.createdFile } } : {} },
  };
  return validateConfig(v2, rel);
}

function parseFile(file, rel) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`cannot parse ${rel}: ${err.message}. Fix or delete the file and retry; nothing was changed.`);
  }
}

/**
 * Returns { config, source: 'root' | 'legacy', staleLegacy } or null when no config exists. The root
 * config wins; the legacy v1 file is read (and upgraded in memory) only when there is no root one.
 * `staleLegacy` is true when both exist. A corrupt file throws, naming the file it read; nothing is changed.
 */
export function readConfig(cwd) {
  const root = configPath(cwd);
  const legacy = legacyConfigPath(cwd);
  if (existsSync(root)) {
    const config = validateConfig(parseFile(root, CONFIG_REL_PATH), CONFIG_REL_PATH);
    return { config, source: 'root', staleLegacy: existsSync(legacy) };
  }
  if (!existsSync(legacy)) return null;
  const config = upgradeV1(parseFile(legacy, LEGACY_CONFIG_REL_PATH), LEGACY_CONFIG_REL_PATH);
  return { config, source: 'legacy', staleLegacy: false };
}

/** Deletes the legacy config, then `.agents/` when that left it empty. */
export function retireLegacyConfig(cwd) {
  rmSync(legacyConfigPath(cwd), { force: true });
  const agentsDir = join(cwd, '.agents');
  try {
    if (existsSync(agentsDir) && readdirSync(agentsDir).length === 0) rmdirSync(agentsDir);
  } catch {
    // not removable: leave it
  }
}

/**
 * Writes the root config only when the content changes, ignoring line endings; keeps the existing file's
 * line endings (a new file is LF). Returns true when written. With `source: 'legacy'` the legacy file is
 * then deleted, so it is still there if the root write fails.
 */
export function writeConfig(cwd, config, { source } = {}) {
  validateConfig(config);
  if (config.agents.length === 0) throw new Error(`refusing to write ${CONFIG_REL_PATH} with an empty "agents" list`);
  const normalized = {
    ...config,
    agents: [...config.agents].sort(),
    skills: [...config.skills].sort(),
    tags: [...config.tags].sort(),
    installed: {
      ...config.installed,
      skills: [...config.installed.skills].sort(),
      files: [...config.installed.files]
        .map((f) => ({ path: f.path, sha256: f.sha256 }))
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    },
  };
  const text = serializeConfig(normalized);
  const file = configPath(cwd);
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : null;
  const written = existing === null || existing.replaceAll('\r\n', '\n') !== text;
  if (written) {
    const eol = existing === null ? '\n' : eolOf(existing);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, eol === '\n' ? text : text.replaceAll('\n', eol));
  }
  if (source === 'legacy') retireLegacyConfig(cwd);
  return written;
}
