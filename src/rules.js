import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS_MD, CLAUDE_MD } from './agents-md.js';
import { AGENTS } from './agents.js';

/** Are the two project-relative files the same file on disk (a symlink or hard link)? False when either is missing. */
export function sameFile(cwd, a, b) {
  try {
    const sa = statSync(join(cwd, a), { bigint: true });
    const sb = statSync(join(cwd, b), { bigint: true });
    return sa.dev === sb.dev && sa.ino === sb.ino;
  } catch {
    return false;
  }
}

/**
 * Which rules files get a skills block, and which skills dir each block lists, as Map<file, skillsDir> (sorted by
 * file). universal reads AGENTS.md; claude-code reads the root CLAUDE.md when it exists, else AGENTS.md. Agents that
 * share a file share one block: AGENTS.md lists .agents/skills when it serves universal, .claude/skills when it
 * serves only claude-code. A CLAUDE.md linked to AGENTS.md counts as AGENTS.md, so the two blocks never overwrite each
 * other. CLAUDE.md is a target only when it already exists, so it is never created.
 */
export function resolveRulesTargets(cwd, agents) {
  const ids = new Set(agents);
  const targets = new Map();
  if (ids.has('claude-code')) {
    const ownClaudeMd = existsSync(join(cwd, CLAUDE_MD)) && !sameFile(cwd, CLAUDE_MD, AGENTS_MD);
    targets.set(ownClaudeMd ? CLAUDE_MD : AGENTS_MD, AGENTS['claude-code'].skillsDir);
  }
  if (ids.has('universal')) targets.set(AGENTS_MD, AGENTS.universal.skillsDir);
  return new Map([...targets].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
