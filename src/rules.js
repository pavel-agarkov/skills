import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS_MD, CLAUDE_MD } from './agents-md.js';
import { AGENTS } from './agents.js';

/**
 * Which rules files get a skills block, and which skills dir each block lists, as Map<file, skillsDir> (sorted by
 * file). universal reads AGENTS.md; claude-code reads the root CLAUDE.md when it exists, else AGENTS.md. Agents that
 * share a file share one block: AGENTS.md lists .agents/skills when it serves universal, .claude/skills when it
 * serves only claude-code. CLAUDE.md is a target only when it already exists, so it is never created.
 */
export function resolveRulesTargets(cwd, agents) {
  const ids = new Set(agents);
  const targets = new Map();
  if (ids.has('claude-code')) {
    targets.set(existsSync(join(cwd, CLAUDE_MD)) ? CLAUDE_MD : AGENTS_MD, AGENTS['claude-code'].skillsDir);
  }
  if (ids.has('universal')) targets.set(AGENTS_MD, AGENTS.universal.skillsDir);
  return new Map([...targets].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
