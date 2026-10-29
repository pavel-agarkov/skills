import { UsageError } from '../args.js';
import { applyBlock, removeBlock } from '../agents-md.js';
import { CONFIG_REL_PATH, PACKAGE_NAME, readConfig, writeConfig } from '../config.js';
import { pickSelection } from '../picker.js';
import { resolveSelection } from '../resolve.js';
import { syncSkills } from '../sync.js';

const sortedUnique = (list) => [...new Set(list)].sort();

/**
 * install: additive over any saved selection.
 * ctx: { cwd, catalog, packageVersion, out (string => void), isTTY, input?, output? }
 * Returns the sync result plus { config, agentsMd }.
 */
export async function install(opts, ctx) {
  const { cwd, catalog, packageVersion } = ctx;
  const out = ctx.out ?? ((s) => process.stdout.write(s));
  const prev = readConfig(cwd);

  let flagSkills = opts.skills ?? [];
  let flagTags = opts.tags ?? [];
  if (flagSkills.length === 0 && flagTags.length === 0 && opts.agentsMd === undefined) {
    if (!ctx.isTTY) {
      throw new UsageError('install needs --skill and/or --tag (or run it in an interactive terminal to pick)');
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

  const skillsSel = sortedUnique([...keepSkills, ...flagSkills]);
  const tagsSel = sortedUnique([...keepTags, ...flagTags]);
  const resolved = resolveSelection(catalog, { skills: skillsSel, tags: tagsSel });
  if (resolved.length === 0) throw new UsageError('nothing selected; pass --skill and/or --tag');

  const agentsMd = opts.agentsMd ?? prev?.agentsMd ?? false;
  const prevAgents = prev?.installed.agentsMd ?? { present: false, createdFile: false };
  const indexSkills = resolved.map((n) => ({ name: n, description: catalog.skills.get(n).description }));

  // Validate AGENTS.md first (unpaired markers abort before any skill file is written).
  if (agentsMd) applyBlock({ cwd, skills: indexSkills, createdFile: prevAgents.createdFile, dryRun: true });
  else if (prevAgents.present) removeBlock({ cwd, createdFile: prevAgents.createdFile, dryRun: true });

  const result = syncSkills({ cwd, catalog, skills: resolved, prev, force: opts.force, dryRun: opts.dryRun });

  let agentsState = { present: false, createdFile: false };
  let agentsAction = 'none';
  if (agentsMd) {
    const r = applyBlock({ cwd, skills: indexSkills, createdFile: prevAgents.createdFile, dryRun: opts.dryRun });
    agentsState = { present: true, createdFile: r.createdFile };
    agentsAction = r.action;
  } else if (prevAgents.present) {
    agentsAction = removeBlock({ cwd, createdFile: prevAgents.createdFile, dryRun: opts.dryRun }).action;
  }

  const config = {
    version: 1,
    package: PACKAGE_NAME,
    packageVersion,
    skills: skillsSel,
    tags: tagsSel,
    agentsMd,
    installed: { skills: resolved, files: result.files, agentsMd: agentsState },
  };
  if (!opts.dryRun) writeConfig(cwd, config);

  const prefix = opts.dryRun ? '[dry-run] ' : '';
  out(`${prefix}Skills: ${resolved.join(', ')}\n`);
  const listing = [
    ['added', result.added],
    ['updated', result.updated],
    ['removed', result.removed],
  ];
  for (const [label, paths] of listing) for (const p of paths) out(`${prefix}${label}: ${p}\n`);
  for (const p of result.restored) out(`warning: ${p} was missing; restored
`);
  for (const p of result.missing) out(`warning: ${p} was already removed; dropped from config
`);
  for (const p of result.modified) out(`warning: ${p} was modified locally; left untouched${opts.dryRun ? '' : ' and no longer tracked'}\n`);
  if (prevAgents.present && agentsAction === 'create') out(`warning: ${'AGENTS.md'} was missing; recreated
`);
  if (!agentsMd && prevAgents.present && agentsAction === 'none') out(`warning: ${'AGENTS.md'} skills block was already gone
`);
  if (agentsMd || prevAgents.present) out(`${prefix}AGENTS.md index: ${agentsAction}\n`);
  const changed = result.added.length + result.updated.length + result.removed.length;
  out(changed === 0 ? `${prefix}Nothing to change (config: ${CONFIG_REL_PATH}).\n` : `${prefix}Done: ${result.added.length} added, ${result.updated.length} updated, ${result.removed.length} removed.\n`);

  return { ...result, config, agentsMd: { state: agentsState, action: agentsAction } };
}
