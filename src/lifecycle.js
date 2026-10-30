import { applyBlock, removeBlock } from './agents-md.js';
import { AgentChoiceError, defaultAgents } from './agents.js';
import { CONFIG_REL_PATH, LEGACY_CONFIG_REL_PATH, PACKAGE_NAME, writeConfig } from './config.js';
import { resolveSelection } from './resolve.js';
import { resolveRulesTargets } from './rules.js';
import { syncSkills } from './sync.js';

/**
 * Shared by add, remove, update and check: sync the disk to {skills, tags, agentsMd} (`prev` is null on a first add) and (unless
 * dryRun) persist the config. With dryRun nothing at all is written, which is what `check` relies on. `source` is where
 * readConfig found `prev`; 'legacy' means the write moves the config to the root.
 * With agentsMd on, every rules file resolveRulesTargets picks gets a block; a recorded rules file that is no longer a
 * target loses its block (so a block moves when CLAUDE.md appears).
 * Returns { resolved, result, rulesActions: [{ file, action }], rulesRecreated: [file], rulesGone: [file], config, source }.
 */
export function reconcile({ cwd, catalog, prev, source = 'root', agents, skills, tags, agentsMd, packageVersion, force = false, dryRun = false }) {
  const resolved = resolveSelection(catalog, { skills, tags });
  const prevRules = prev?.installed.rules ?? {};
  const createdOf = (file) => prevRules[file]?.createdFile ?? false;
  const targets = agentsMd ? resolveRulesTargets(cwd, agents) : new Map();
  const oldFiles = Object.keys(prevRules)
    .filter((file) => !targets.has(file))
    .sort();
  const indexSkills = resolved.map((n) => ({ name: n, description: catalog.skills.get(n).description }));
  const apply = (file, skillsDir, dry) => applyBlock({ cwd, file, skills: indexSkills, skillsDir, createdFile: createdOf(file), dryRun: dry });
  const unapply = (file, dry) => removeBlock({ cwd, file, createdFile: createdOf(file), dryRun: dry });

  // Validate every rules file first: an unpaired marker in any of them aborts before any skill file is touched.
  for (const [file, skillsDir] of targets) apply(file, skillsDir, true);
  for (const file of oldFiles) unapply(file, true);

  const result = syncSkills({ cwd, catalog, skills: resolved, agents, prev, force, dryRun });

  const rules = {};
  const rulesActions = [];
  const rulesRecreated = [];
  const rulesGone = [];
  for (const [file, skillsDir] of targets) {
    const r = apply(file, skillsDir, dryRun);
    rules[file] = { createdFile: r.createdFile };
    rulesActions.push({ file, action: r.action });
    if (prevRules[file] !== undefined && (r.action === 'create' || r.action === 'append')) rulesRecreated.push(file);
  }
  for (const file of oldFiles) {
    const { action } = unapply(file, dryRun);
    rulesActions.push({ file, action });
    if (action === 'none') rulesGone.push(file);
  }

  const config = {
    version: 2,
    package: PACKAGE_NAME,
    packageVersion,
    agents: [...agents].sort(),
    skills: [...skills].sort(),
    tags: [...tags].sort(),
    agentsMd,
    installed: { skills: resolved, files: result.files, rules },
  };
  if (!dryRun) writeConfig(cwd, config, { source });
  return { resolved, result, rulesActions, rulesRecreated, rulesGone, config, source };
}

/**
 * The saved agents, or for a v1 config (none saved yet) the detected default. Our own `.agents/` counts there, so detection
 * yields universal or fails; the failure is a plain Error naming the `add --agent` to run, raised before anything is written.
 */
export function savedAgents(cwd, prev) {
  if (prev.agents.length > 0) return prev.agents;
  try {
    return defaultAgents(cwd);
  } catch (err) {
    if (!(err instanceof AgentChoiceError)) throw err;
    throw new Error(
      `found ${err.found}, so the agents for this install cannot be chosen automatically; run "add --agent universal" ` +
        `(keep .agents/skills only) or "add --agent claude-code,universal" (also install to .claude/skills). Nothing was changed.`,
    );
  }
}

/** Would a real (non-dry) run change anything on disk or in the config? */
export function isPending({ result, rulesActions, rulesGone, source, dropped = [] }) {
  const fileChanges = result.added.length + result.updated.length + result.removed.length + result.modified.length + result.missing.length;
  const rulesChanges = rulesActions.filter((r) => r.action !== 'none').length + rulesGone.length;
  return fileChanges + dropped.length + rulesChanges > 0 || source === 'legacy';
}

/** The warning for a legacy config left beside the root one. */
export const STALE_LEGACY_WARNING = `warning: ignoring ${LEGACY_CONFIG_REL_PATH}; ${CONFIG_REL_PATH} is used (delete the old file)\n`;

/** Print the shared summary. `mode` is 'apply' or 'check'. */
export function printSummary(out, run, { prefix = '', mode = 'apply', dryRun = false, dropped = [], staleLegacy = false } = {}) {
  const { resolved, result, rulesActions, rulesRecreated, rulesGone } = run;
  if (staleLegacy) out(STALE_LEGACY_WARNING);
  for (const w of dropped) out(`warning: ${w}\n`);
  out(`${prefix}Skills: ${resolved.length === 0 ? '(none)' : resolved.join(', ')}\n`);
  for (const [label, paths] of [['added', result.added], ['updated', result.updated], ['removed', result.removed]]) {
    for (const p of paths) out(`${prefix}${label}: ${p}\n`);
  }
  for (const p of result.modified) {
    out(mode === 'check' ? `modified: ${p}\n` : `warning: ${p} was modified locally; left untouched${dryRun ? '' : ' and no longer tracked'}\n`);
  }
  for (const p of result.restored) out(`warning: ${p} was missing; restored\n`);
  for (const p of result.missing) out(`warning: ${p} was already removed; dropped from config\n`);
  for (const file of rulesRecreated) out(`warning: ${file} skills block was missing; recreated\n`);
  for (const file of rulesGone) out(`warning: ${file} skills block was already gone\n`);
  for (const { file, action } of rulesActions) {
    if (run.config.agentsMd || action !== 'none') out(`${prefix}${file} index: ${action}\n`);
  }
  if (run.source === 'legacy') out(`${mode === 'check' ? 'pending: ' : prefix}config: moved ${LEGACY_CONFIG_REL_PATH} → ${CONFIG_REL_PATH}\n`);
  if (mode === 'check') return;
  const changed = result.added.length + result.updated.length + result.removed.length;
  out(
    changed === 0
      ? `${prefix}Nothing to change (config: ${CONFIG_REL_PATH}).\n`
      : `${prefix}Done: ${result.added.length} added, ${result.updated.length} updated, ${result.removed.length} removed.\n`,
  );
}
