import type { Ctx, Opts } from '../args.ts';
import { compareVersions, entriesBetween, isPlainVersion, printChanges, type Entry } from '../changelog.ts';
import { readConfig } from '../config.ts';
import { isPending, printSummary, reconcile, savedAgents, type ReconcileResult } from '../lifecycle.ts';

/**
 * Re-expand the saved selection against the current catalog, for the saved agents (detected for a v1 config). Shared by
 * update and check (`check: true` forces a dry run and ignores --force; --agent is ignored like --skill). Returns { ...reconcileResult, dropped, pending }.
 */
export function runSaved(
  opts: Opts,
  ctx: Ctx,
  { check = false }: { check?: boolean } = {},
): ReconcileResult & { dropped: string[]; pending: boolean } {
  const { cwd, catalog, packageVersion } = ctx;
  const out = ctx.out ?? ((s: string) => process.stdout.write(s));
  const read = readConfig(cwd);
  if (!read) throw new Error('nothing installed: no saved selection found (run "add" first)');

  const { config: prev, source, staleLegacy } = read;
  const agents = savedAgents(cwd, prev); // before anything is written
  const dropped: string[] = [];
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
  const run = reconcile({
    cwd,
    catalog,
    prev,
    source,
    agents,
    skills,
    tags,
    agentsMd: prev.agentsMd,
    packageVersion,
    force: check ? false : opts.force,
    dryRun,
  });
  const prefix = !check && opts.dryRun ? '[dry-run] ' : '';
  printSummary(out, run, { prefix, mode: check ? 'check' : 'apply', dryRun, dropped, staleLegacy });
  if (!dryRun) printUpgradeNotes(out, ctx.changelog, prev.packageVersion, packageVersion);
  return { ...run, dropped, pending: isPending({ ...run, dropped }) };
}

/** After a real update: the notes between the version recorded before the write and the running one. */
function printUpgradeNotes(out: (s: string) => void, changelog: Entry[] | undefined, from: string, to: string): void {
  if (!changelog || from === to) return;
  if (isPlainVersion(from) && compareVersions(from, to) > 0) return;
  const entries = entriesBetween(changelog, from, to);
  if (entries.length > 0) printChanges(out, entries, from);
}

/** update: sync to the saved selection against the current catalog. ctx as in add. */
export async function update(opts: Opts, ctx: Ctx): Promise<ReturnType<typeof runSaved>> {
  return runSaved(opts, ctx);
}
