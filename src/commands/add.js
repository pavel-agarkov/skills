import { UsageError } from '../args.js';
import { readConfig } from '../config.js';
import { isPending, printSummary, reconcile } from '../lifecycle.js';
import { pickSelection } from '../picker.js';
import { resolveSelection } from '../resolve.js';

const sortedUnique = (list) => [...new Set(list)].sort();

/**
 * add: additive over any saved selection; --agents-md enables the AGENTS.md index (the saved option
 * is used when the flag is not given).
 * ctx: { cwd, catalog, packageVersion, out (string => void), isTTY, input?, output? }
 * Returns the sync result fields plus the reconcile details ({ result, config, ... }).
 */
export async function add(opts, ctx) {
  const { cwd, catalog, packageVersion } = ctx;
  const out = ctx.out ?? ((s) => process.stdout.write(s));
  const read = readConfig(cwd);
  const prev = read?.config ?? null;

  let flagSkills = opts.skills ?? [];
  let flagTags = opts.tags ?? [];
  if (flagSkills.length === 0 && flagTags.length === 0 && opts.agentsMd === undefined) {
    if (!ctx.isTTY) {
      throw new UsageError('add needs --skill and/or --tag (or run it in an interactive terminal to pick)');
    }
    ({ skills: flagSkills, tags: flagTags } = await pickSelection(catalog, {
      input: ctx.input,
      output: ctx.output,
      preselected: prev?.installed.skills ?? [],
    }));
  }

  // Validate the new flags strictly; saved names that left the catalog are dropped with a warning.
  resolveSelection(catalog, { skills: flagSkills, tags: flagTags });
  const keepSkills = (prev?.skills ?? []).filter((n) => catalog.skills.has(n));
  const keepTags = (prev?.tags ?? []).filter((t) => catalog.tags.has(t));
  for (const n of (prev?.skills ?? []).filter((n) => !catalog.skills.has(n))) out(`warning: saved skill "${n}" is no longer in the package; ignoring it\n`);
  for (const t of (prev?.tags ?? []).filter((t) => !catalog.tags.has(t))) out(`warning: saved tag "${t}" is no longer in the package; ignoring it\n`);

  const skills = sortedUnique([...keepSkills, ...flagSkills]);
  const tags = sortedUnique([...keepTags, ...flagTags]);
  if (resolveSelection(catalog, { skills, tags }).length === 0) throw new UsageError('nothing selected; pass --skill and/or --tag');

  const run = reconcile({
    cwd,
    catalog,
    prev,
    source: read?.source,
    agents: ['universal'],
    skills,
    tags,
    agentsMd: opts.agentsMd ?? prev?.agentsMd ?? false,
    packageVersion,
    force: opts.force,
    dryRun: opts.dryRun,
  });
  printSummary(out, run, { prefix: opts.dryRun ? '[dry-run] ' : '', dryRun: opts.dryRun, staleLegacy: read?.staleLegacy });
  return { ...run.result, ...run, pending: isPending(run) };
}
