import { existsSync, readdirSync, rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS, AGENT_IDS } from '../agents.js';
import { UsageError } from '../args.js';
import { removeBlock } from '../agents-md.js';
import { CONFIG_REL_PATH, configPath, legacyConfigPath, readConfig } from '../config.js';
import { STALE_LEGACY_WARNING, isPending, printSummary, reconcile } from '../lifecycle.js';
import { resolveSelection } from '../resolve.js';
import { syncSkills } from '../sync.js';

/** Throws a UsageError listing the valid values when a name or tag is unknown to the catalog and to the saved selection. */
function validateNames(opts, catalog, prev) {
  const knownSkills = new Set([...catalog.skills.keys(), ...(prev?.skills ?? []), ...(prev?.installed.skills ?? [])]);
  const knownTags = new Set([...catalog.tags.keys(), ...(prev?.tags ?? [])]);
  const badSkills = [...new Set(opts.skills)].filter((n) => !knownSkills.has(n));
  const badTags = [...new Set(opts.tags)].filter((t) => !knownTags.has(t));
  const problems = [];
  if (badSkills.length > 0) problems.push(`unknown skill${badSkills.length > 1 ? 's' : ''}: ${badSkills.join(', ')} (valid: ${[...knownSkills].sort().join(', ')})`);
  if (badTags.length > 0) problems.push(`unknown tag${badTags.length > 1 ? 's' : ''}: ${badTags.join(', ')} (valid: ${[...knownTags].sort().join(', ')})`);
  if (problems.length > 0) throw new UsageError(problems.join('; '));
}

/** Removes the project-relative `rel` dir when it exists and is empty; a dir that holds anything is left in place. */
function removeIfEmpty(cwd, rel) {
  const dir = join(cwd, ...rel.split('/'));
  try {
    if (existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
  } catch {
    // not removable: leave it
  }
}

/** For every registry agent: its skills dir when empty, then its root folder (`.claude/`, `.agents/`) when empty. */
function pruneAgentDirs(cwd) {
  for (const id of AGENT_IDS) {
    removeIfEmpty(cwd, AGENTS[id].skillsDir);
    removeIfEmpty(cwd, AGENTS[id].rootDir);
  }
}

/**
 * Remove everything recorded in the manifest, the block in every recorded rules file and the config: the root one and, when it was read
 * from there, the legacy one. A stale legacy file beside the root config is not ours to delete and is only warned about.
 */
function removeAll(opts, ctx, read) {
  const { cwd, catalog } = ctx;
  const out = ctx.out ?? ((s) => process.stdout.write(s));
  const prefix = opts.dryRun ? '[dry-run] ' : '';
  const prev = read.config;
  const rules = Object.entries(prev.installed.rules).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const present = (file) => existsSync(join(cwd, ...file.split('/')));
  if (read.staleLegacy) out(STALE_LEGACY_WARNING);

  // An unpaired marker in any recorded rules file must abort before anything is deleted.
  for (const [file, { createdFile }] of rules) if (present(file)) removeBlock({ cwd, file, createdFile, dryRun: true });

  const result = syncSkills({ cwd, catalog, skills: [], prev, dryRun: opts.dryRun });
  for (const p of result.removed) out(`${prefix}removed: ${p}\n`);
  for (const p of result.missing) out(`warning: ${p} was already removed\n`);
  for (const p of result.modified) out(`warning: ${p} was modified locally; left in place\n`);

  const rulesActions = [];
  for (const [file, { createdFile }] of rules) {
    if (!present(file)) {
      out(`warning: ${file} was already removed\n`);
      rulesActions.push({ file, action: 'none' });
      continue;
    }
    const { action } = removeBlock({ cwd, file, createdFile, dryRun: opts.dryRun });
    rulesActions.push({ file, action });
    if (action === 'none') out(`warning: ${file} skills block was already gone\n`);
    else out(`${prefix}${file} index: ${action}\n`);
  }

  if (!opts.dryRun) {
    rmSync(configPath(cwd), { force: true });
    if (read.source === 'legacy') rmSync(legacyConfigPath(cwd), { force: true });
    pruneAgentDirs(cwd);
  }
  out(`${prefix}Removed: ${result.removed.length} files removed, ${result.modified.length} left in place (config ${CONFIG_REL_PATH} ${opts.dryRun ? 'would be ' : ''}deleted).\n`);
  return { ...result, rulesActions, full: true };
}

/**
 * remove: mirror of add.
 *  - no flags: remove the whole saved selection (manifest files, rules-file blocks, config, empty agent folders)
 *  - --skill / --tag: remove those skills and every skill carrying a named tag; the last one leaving means full removal
 *  - --agents-md: remove the index block and store agentsMd false; alone it leaves all skills installed
 * Only unmodified manifest files are deleted; anything already deleted by hand is a warning.
 * ctx as in add. Returns null when nothing was installed.
 */
export async function remove(opts, ctx) {
  const { cwd, catalog, packageVersion } = ctx;
  const out = ctx.out ?? ((s) => process.stdout.write(s));
  const read = readConfig(cwd);
  const prev = read?.config ?? null;
  validateNames(opts, catalog, prev); // before anything is deleted
  if (!read) {
    out('Nothing to remove: no saved selection found.\n');
    return null;
  }

  const bySelection = opts.skills.length > 0 || opts.tags.length > 0;
  if (!bySelection && opts.agentsMd === undefined) return removeAll(opts, ctx, read);

  const dropped = [];
  const warnings = [];
  let skills = [];
  let tags = [];
  let removedTags = [];
  const selectedBy = (name, tagList) => tagList.filter((t) => catalog.tags.get(t)?.includes(name));

  if (bySelection) {
    // Saved names that left the catalog are dropped, unless the user is removing them right now.
    for (const n of prev.skills) {
      if (!catalog.skills.has(n) && !opts.skills.includes(n)) dropped.push(`saved skill "${n}" is no longer in the package; dropped from the selection`);
    }
    for (const t of prev.tags) {
      if (!catalog.tags.has(t) && !opts.tags.includes(t)) dropped.push(`saved tag "${t}" is no longer in the package; dropped from the selection`);
    }
    const savedSkills = prev.skills.filter((n) => catalog.skills.has(n));
    const savedTags = prev.tags.filter((t) => catalog.tags.has(t));

    removedTags = [...new Set(opts.tags)].filter((t) => prev.tags.includes(t));
    for (const t of new Set(opts.tags)) {
      if (!prev.tags.includes(t)) warnings.push(`tag "${t}" is not in the saved selection; nothing to remove`);
    }
    for (const n of new Set(opts.skills)) {
      if (!prev.skills.includes(n) && !prev.installed.skills.includes(n)) warnings.push(`skill "${n}" is not in the saved selection; nothing to remove`);
    }

    tags = savedTags.filter((t) => !removedTags.includes(t));
    skills = savedSkills.filter((n) => !opts.skills.includes(n) && selectedBy(n, removedTags).length === 0);
  } else {
    skills = prev.skills.filter((n) => catalog.skills.has(n));
    tags = prev.tags.filter((t) => catalog.tags.has(t));
  }

  const resolved = resolveSelection(catalog, { skills, tags });
  if (resolved.length === 0) return removeAll(opts, ctx, read);

  // Skills the user asked to remove (by name, or via a removed tag) that another selected tag still covers.
  const asked = new Set(opts.skills);
  for (const t of removedTags) for (const n of catalog.tags.get(t) ?? []) asked.add(n);
  const covered = [...asked].filter((n) => resolved.includes(n)).sort();

  const run = reconcile({
    cwd,
    catalog,
    prev,
    source: read.source,
    agents: ['universal'],
    skills,
    tags,
    agentsMd: opts.agentsMd ? false : prev.agentsMd,
    packageVersion,
    force: false,
    dryRun: opts.dryRun,
  });
  for (const w of warnings) out(`warning: ${w}\n`);
  printSummary(out, run, { prefix: opts.dryRun ? '[dry-run] ' : '', dryRun: opts.dryRun, dropped, staleLegacy: read.staleLegacy });
  for (const n of covered) {
    const via = selectedBy(n, tags);
    const hint = via.map((t) => `remove --tag ${t}`).join(' / ');
    out(`warning: skill "${n}" is still selected by tag ${via.map((t) => `"${t}"`).join(', ')}; it stays installed (run ${hint} to remove it)\n`);
  }
  return { ...run.result, ...run, covered, pending: isPending({ ...run, dropped }), full: false };
}
