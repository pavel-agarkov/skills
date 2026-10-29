import { UsageError } from '../args.js';
import { readConfig } from '../config.js';
import { isPending, printSummary, reconcile } from '../lifecycle.js';
import { pickSelection } from '../picker.js';
import { resolveSelection } from '../resolve.js';

const sortedUnique = (list) => [...new Set(list)].sort();

/**
 * configure: replace the saved selection and/or options, then sync.
 * Replacement is per kind: --skill replaces the saved skills and keeps the saved tags, --tag replaces
 * the saved tags and keeps the saved skills. With neither, the saved selection is kept (e.g. --agents-md alone).
 */
export async function configure(opts, ctx) {
  const { cwd, catalog, packageVersion } = ctx;
  const out = ctx.out ?? ((s) => process.stdout.write(s));
  const prev = readConfig(cwd);
  if (!prev) throw new Error('nothing installed: no saved selection found (run "install" first)');

  let skills = prev.skills.filter((n) => catalog.skills.has(n));
  let tags = prev.tags.filter((t) => catalog.tags.has(t));
  const dropped = [
    ...prev.skills.filter((n) => !catalog.skills.has(n)).map((n) => `saved skill "${n}" is no longer in the package; dropped from the selection`),
    ...prev.tags.filter((t) => !catalog.tags.has(t)).map((t) => `saved tag "${t}" is no longer in the package; dropped from the selection`),
  ];

  if (opts.skills.length > 0 || opts.tags.length > 0) {
    if (opts.skills.length > 0) skills = sortedUnique(opts.skills);
    if (opts.tags.length > 0) tags = sortedUnique(opts.tags);
  } else if (opts.agentsMd === undefined) {
    if (!ctx.isTTY) {
      throw new UsageError('configure needs --skill, --tag and/or --agents-md/--no-agents-md (or run it in an interactive terminal to pick)');
    }
    const picked = await pickSelection(catalog, { input: ctx.input, output: ctx.output, preselected: prev.installed.skills });
    skills = sortedUnique(picked.skills);
    tags = sortedUnique(picked.tags);
  }
  if (resolveSelection(catalog, { skills, tags }).length === 0) throw new UsageError('nothing selected; pass --skill and/or --tag');

  const run = reconcile({
    cwd,
    catalog,
    prev,
    skills,
    tags,
    agentsMd: opts.agentsMd ?? prev.agentsMd,
    packageVersion,
    force: opts.force,
    dryRun: opts.dryRun,
  });
  printSummary(out, run, { prefix: opts.dryRun ? '[dry-run] ' : '', dryRun: opts.dryRun, dropped });
  return { ...run, dropped, pending: isPending({ ...run, dropped }) };
}
