import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { UsageError } from './errors.js';

/** The install targets: where each agent reads skills from, and the folder that holds that dir. */
export const AGENTS = {
  'claude-code': { skillsDir: '.claude/skills', rootDir: '.claude' },
  universal: { skillsDir: '.agents/skills', rootDir: '.agents' },
};

export const AGENT_IDS = Object.keys(AGENTS).sort();

/** The registry skills dir a project-relative manifest path lives under, or null when it is outside every one. */
export function skillsDirOf(path) {
  for (const id of AGENT_IDS) {
    const { skillsDir } = AGENTS[id];
    if (path.startsWith(`${skillsDir}/`)) return skillsDir;
  }
  return null;
}

/** The ids as given (`*` expanded to every id), sorted and unique. An unknown id is a UsageError that lists the valid ids. */
export function expandAgents(list) {
  const bad = [...new Set(list)].filter((a) => a !== '*' && !AGENT_IDS.includes(a));
  if (bad.length > 0) throw new UsageError(`unknown agent${bad.length > 1 ? 's' : ''}: ${bad.join(', ')} (valid: ${AGENT_IDS.join(', ')}, or '*' for all)`);
  return list.includes('*') ? [...AGENT_IDS] : [...new Set(list)].sort();
}

/** What marks an agent as already used by the project: its folder or its root rules file. */
const MARKERS = {
  'claude-code': ['.claude/', 'CLAUDE.md'],
  universal: ['.agents/', 'AGENTS.md'],
};

function markersFound(cwd) {
  const found = {};
  for (const id of AGENT_IDS) found[id] = MARKERS[id].filter((m) => existsSync(join(cwd, m.replace(/\/$/, ''))));
  return found;
}

/** The ids whose folder or root rules file exists in `cwd`, sorted. */
export function detectAgents(cwd) {
  const found = markersFound(cwd);
  return AGENT_IDS.filter((id) => found[id].length > 0);
}

/** Both harnesses are present, so the default cannot be guessed. `found` names the markers, e.g. ".claude/ and AGENTS.md". */
export class AgentChoiceError extends Error {
  constructor(found) {
    super(`found ${found}, so the agents cannot be chosen automatically; re-run with --agent claude-code, --agent universal or --agent claude-code,universal`);
    this.found = found;
  }
}

/**
 * The agents to use when none are saved and none are given: the single detected one, or universal when none is detected.
 * Throws AgentChoiceError when both are detected. Call it before writing anything, so our own writes do not change the answer.
 */
export function defaultAgents(cwd) {
  const found = markersFound(cwd);
  const present = AGENT_IDS.filter((id) => found[id].length > 0);
  if (present.length === 0) return ['universal'];
  if (present.length === 1) return present;
  const names = AGENT_IDS.flatMap((id) => found[id]);
  throw new AgentChoiceError(`${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
}
