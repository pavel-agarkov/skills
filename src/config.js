import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const PACKAGE_NAME = '@pavel-agarkov/skills';
export const CONFIG_REL_PATH = '.agents/.pa-skills-config.json';

export function configPath(cwd) {
  return join(cwd, ...CONFIG_REL_PATH.split('/'));
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

/** Throws a descriptive Error when the shape is wrong. */
export function validateConfig(config) {
  const fail = (why) => {
    throw new Error(`invalid config ${CONFIG_REL_PATH}: ${why}`);
  };
  if (config === null || typeof config !== 'object' || Array.isArray(config)) fail('expected a JSON object');
  if (config.version !== 1) fail(`unsupported version ${JSON.stringify(config.version)}`);
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
  }
  const a = inst.agentsMd;
  if (!a || typeof a.present !== 'boolean' || typeof a.createdFile !== 'boolean') {
    fail('"installed.agentsMd" needs boolean "present" and "createdFile"');
  }
  return config;
}

/** Returns the parsed config, or null when none exists. A corrupt file throws and nothing is changed. */
export function readConfig(cwd) {
  const file = configPath(cwd);
  if (!existsSync(file)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`cannot parse ${CONFIG_REL_PATH}: ${err.message}. Fix or delete the file and retry; nothing was changed.`);
  }
  return validateConfig(parsed);
}

/** Writes the config only when the bytes change. Returns true when written. */
export function writeConfig(cwd, config) {
  validateConfig(config);
  const normalized = {
    ...config,
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
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return false;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return true;
}
