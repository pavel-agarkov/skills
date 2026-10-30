import { AGENTS_MD, applyBlock, removeBlock } from './agents-md.js';
import { CONFIG_REL_PATH, LEGACY_CONFIG_REL_PATH, PACKAGE_NAME, writeConfig } from './config.js';
import { resolveSelection } from './resolve.js';
import { syncSkills } from './sync.js';

/**
 * Shared by add, remove, update and check: sync the disk to {skills, tags, agentsMd} (`prev` is null on a first add) and (unless
 * dryRun) persist the config. With dryRun nothing at all is written, which is what `check` relies on. `source` is where
 * readConfig found `prev`; 'legacy' means the write moves the config to the root.
 * Returns { resolved, result, agentsState, agentsAction, agentsRecreated, agentsGone, config, source }.
 */
export function reconcile({ cwd, catalog, prev, source = 'root', agents, skills, tags, agentsMd, packageVersion, force = false, dryRun = false }) {
  const resolved = resolveSelection(catalog, { skills, tags });
  const prevRule = prev?.installed.rules[AGENTS_MD];
  const prevAgents = { present: prevRule !== undefined, createdFile: prevRule?.createdFile ?? false };
  const indexSkills = resolved.map((n) => ({ name: n, description: catalog.skills.get(n).description }));

  // Validate AGENTS.md first: an unpaired marker aborts before any skill file is touched.
  if (agentsMd) applyBlock({ cwd, skills: indexSkills, createdFile: prevAgents.createdFile, dryRun: true });
  else if (prevAgents.present) removeBlock({ cwd, createdFile: prevAgents.createdFile, dryRun: true });

  const result = syncSkills({ cwd, catalog, skills: resolved, prev, force, dryRun });

  let agentsState = { present: false, createdFile: false };
  let agentsAction = 'none';
  if (agentsMd) {
    const r = applyBlock({ cwd, skills: indexSkills, createdFile: prevAgents.createdFile, dryRun });
    agentsState = { present: true, createdFile: r.createdFile };
    agentsAction = r.action;
  } else if (prevAgents.present) {
    agentsAction = removeBlock({ cwd, createdFile: prevAgents.createdFile, dryRun }).action;
  }
  const agentsRecreated = prevAgents.present && agentsMd && (agentsAction === 'create' || agentsAction === 'append');
  const agentsGone = prevAgents.present && !agentsMd && agentsAction === 'none';

  const config = {
    version: 2,
    package: PACKAGE_NAME,
    packageVersion,
    agents: [...agents].sort(),
    skills: [...skills].sort(),
    tags: [...tags].sort(),
    agentsMd,
    installed: {
      skills: resolved,
      files: result.files,
      rules: agentsState.present ? { [AGENTS_MD]: { createdFile: agentsState.createdFile } } : {},
    },
  };
  if (!dryRun) writeConfig(cwd, config, { source });
  return { resolved, result, agentsState, agentsAction, agentsRecreated, agentsGone, config, source };
}

/** Would a real (non-dry) run change anything on disk or in the config? */
export function isPending({ result, agentsAction, agentsGone, source, dropped = [] }) {
  const fileChanges = result.added.length + result.updated.length + result.removed.length + result.modified.length + result.missing.length;
  return fileChanges + dropped.length > 0 || agentsAction !== 'none' || agentsGone || source === 'legacy';
}

/** The warning for a legacy config left beside the root one. */
export const STALE_LEGACY_WARNING = `warning: ignoring ${LEGACY_CONFIG_REL_PATH}; ${CONFIG_REL_PATH} is used (delete the old file)\n`;

/** Print the shared summary. `mode` is 'apply' or 'check'. */
export function printSummary(out, run, { prefix = '', mode = 'apply', dryRun = false, dropped = [], staleLegacy = false } = {}) {
  const { resolved, result, agentsAction, agentsRecreated, agentsGone } = run;
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
  if (agentsRecreated) out(`warning: ${AGENTS_MD} skills block was missing; recreated\n`);
  if (agentsGone) out(`warning: ${AGENTS_MD} skills block was already gone\n`);
  if (run.config.agentsMd || agentsAction !== 'none') out(`${prefix}${AGENTS_MD} index: ${agentsAction}\n`);
  if (run.source === 'legacy') out(`${mode === 'check' ? 'pending: ' : prefix}config: moved ${LEGACY_CONFIG_REL_PATH} → ${CONFIG_REL_PATH}\n`);
  if (mode === 'check') return;
  const changed = result.added.length + result.updated.length + result.removed.length;
  out(
    changed === 0
      ? `${prefix}Nothing to change (config: ${CONFIG_REL_PATH}).\n`
      : `${prefix}Done: ${result.added.length} added, ${result.updated.length} updated, ${result.removed.length} removed.\n`,
  );
}
