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
