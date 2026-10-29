import { readConfig } from '../config.js';
import { isPending, printSummary, reconcile } from '../lifecycle.js';

/**
 * Re-expand the saved selection against the current catalog. Shared by update and check
 * (`check: true` forces a dry run and ignores --force). Returns { ...reconcileResult, dropped, pending }.
 */
export function runSaved(opts, ctx, { check = false } = {}) {
  const { cwd, catalog, packageVersion } = ctx;
  const out = ctx.out ?? ((s) => process.stdout.write(s));
  const prev = readConfig(cwd);
  if (!prev) throw new Error('nothing installed: no saved selection found (run "install" first)');

  const dropped = [];
  const skills = prev.skills.filter((n) => {
    if (catalog.skills.has(n)) return true;
    dropped.push(`saved skill "${n}" is no longer in the package; dropped from the selection`);
    return false;
  });
  const tags = prev.tags.filter((t) => {
    if (catalog.tags.has(t)) return true;
    dropped.push(`saved tag "${t}" is no longer in the package; dropped from the selection`);
    return false;
  });

  const dryRun = check || Boolean(opts.dryRun);
  const run = reconcile({ cwd, catalog, prev, skills, tags, agentsMd: prev.agentsMd, packageVersion, force: check ? false : opts.force, dryRun });
  const prefix = !check && opts.dryRun ? '[dry-run] ' : '';
  printSummary(out, run, { prefix, mode: check ? 'check' : 'apply', dryRun, dropped });
  return { ...run, dropped, pending: isPending({ ...run, dropped }) };
}

/** update: sync to the saved selection against the current catalog. ctx as in install. */
export async function update(opts, ctx) {
  return runSaved(opts, ctx);
}
