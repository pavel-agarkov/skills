import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS_MD, applyBlock, removeBlock } from './agents-md.js';
import { CONFIG_REL_PATH, PACKAGE_NAME, writeConfig } from './config.js';
import { resolveSelection } from './resolve.js';
import { syncSkills } from './sync.js';

/**
 * Shared by add, remove, update and check: sync the disk to {skills, tags, agentsMd} (`prev` is null on a first add) and (unless
 * dryRun) persist the config. With dryRun nothing at all is written, which is what `check` relies on.
 * Returns { resolved, result, agentsState, agentsAction, agentsRecreated, agentsGone, config }.
 */
export function reconcile({ cwd, catalog, prev, skills, tags, agentsMd, packageVersion, force = false, dryRun = false }) {
  const resolved = resolveSelection(catalog, { skills, tags });
  const prevAgents = prev?.installed.agentsMd ?? { present: false, createdFile: false };
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
    version: 1,
    package: PACKAGE_NAME,
    packageVersion,
    skills: [...skills].sort(),
    tags: [...tags].sort(),
    agentsMd,
    installed: { skills: resolved, files: result.files, agentsMd: agentsState },
  };
  if (!dryRun) writeConfig(cwd, config);
  return { resolved, result, agentsState, agentsAction, agentsRecreated, agentsGone, config };
}

/** Would a real (non-dry) run change anything on disk or in the config? */
export function isPending({ result, agentsAction, agentsGone, dropped = [] }) {
  const fileChanges = result.added.length + result.updated.length + result.removed.length + result.modified.length + result.missing.length;
  return fileChanges + dropped.length > 0 || agentsAction !== 'none' || agentsGone;
}

/** Print the shared summary. `mode` is 'apply' or 'check'. */
export function printSummary(out, run, { prefix = '', mode = 'apply', dryRun = false, dropped = [] } = {}) {
  const { resolved, result, agentsAction, agentsRecreated, agentsGone } = run;
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
  if (mode === 'check') return;
  const changed = result.added.length + result.updated.length + result.removed.length;
  out(
    changed === 0
      ? `${prefix}Nothing to change (config: ${CONFIG_REL_PATH}).\n`
      : `${prefix}Done: ${result.added.length} added, ${result.updated.length} updated, ${result.removed.length} removed.\n`,
  );
}
