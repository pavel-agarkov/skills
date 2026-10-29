import { existsSync, readdirSync, rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { UsageError } from '../args.js';
import { AGENTS_MD, removeBlock } from '../agents-md.js';
import { CONFIG_REL_PATH, configPath, readConfig } from '../config.js';
import { syncSkills } from '../sync.js';

/**
 * uninstall: remove exactly the recorded, unmodified files, the AGENTS.md block and the config.
 * Anything already deleted by hand is a warning. ctx as in install. Returns the sync result (null when
 * nothing was installed).
 */
export async function uninstall(opts, ctx) {
  if ((opts.skills ?? []).length > 0 || (opts.tags ?? []).length > 0) {
    throw new UsageError('uninstall takes no --skill/--tag; it removes the whole saved selection. Use configure to shrink it.');
  }
  const { cwd, catalog } = ctx;
  const out = ctx.out ?? ((s) => process.stdout.write(s));
  const prev = readConfig(cwd);
  const prefix = opts.dryRun ? '[dry-run] ' : '';
  if (!prev) {
    out('Nothing to uninstall: no saved selection found.\n');
    return null;
  }
  const agents = prev.installed.agentsMd;

  // An unpaired marker must abort before anything is deleted.
  if (agents.present && existsSync(join(cwd, AGENTS_MD))) removeBlock({ cwd, createdFile: agents.createdFile, dryRun: true });

  const result = syncSkills({ cwd, catalog, skills: [], prev, dryRun: opts.dryRun });
  for (const p of result.removed) out(`${prefix}removed: ${p}\n`);
  for (const p of result.missing) out(`warning: ${p} was already removed\n`);
  for (const p of result.modified) out(`warning: ${p} was modified locally; left in place\n`);

  let agentsAction = 'none';
  if (agents.present) {
    if (!existsSync(join(cwd, AGENTS_MD))) {
      out(`warning: ${AGENTS_MD} was already removed\n`);
    } else {
      agentsAction = removeBlock({ cwd, createdFile: agents.createdFile, dryRun: opts.dryRun }).action;
      if (agentsAction === 'none') out(`warning: ${AGENTS_MD} skills block was already gone\n`);
      else out(`${prefix}${AGENTS_MD} index: ${agentsAction}\n`);
    }
  }

  if (!opts.dryRun) {
    rmSync(configPath(cwd), { force: true });
    const agentsDir = join(cwd, '.agents');
    try {
      if (existsSync(agentsDir) && readdirSync(agentsDir).length === 0) rmdirSync(agentsDir);
    } catch {
      // not removable: leave it
    }
  }
  out(`${prefix}Uninstalled: ${result.removed.length} files removed, ${result.modified.length} left in place (config ${CONFIG_REL_PATH} ${opts.dryRun ? 'would be ' : ''}deleted).\n`);
  return { ...result, agentsAction };
}
