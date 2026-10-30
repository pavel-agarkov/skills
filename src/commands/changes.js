import { readConfig } from '../config.js';
import { compareVersions, entriesBetween, isPlainVersion, printChanges } from '../changelog.js';

/**
 * changes: read-only. Prints the changelog entries between the packageVersion recorded in the
 * project config and the running version. ctx: { cwd, changelog, packageVersion, out }.
 */
export async function changes(opts, ctx) {
  const { cwd, changelog, packageVersion } = ctx;
  const out = ctx.out ?? ((s) => process.stdout.write(s));
  const config = readConfig(cwd)?.config;
  if (!config) {
    out('Nothing installed yet, so there are no changes to show.\n');
    return;
  }
  const recorded = config.packageVersion;
  if (recorded === packageVersion) {
    out(`You already have ${packageVersion}; no changes to show.\n`);
    return;
  }
  if (isPlainVersion(recorded) && compareVersions(recorded, packageVersion) > 0) {
    out(`This CLI (${packageVersion}) is older than the installed version (${recorded}). Run "npx @pavel-agarkov/skills@latest changes".\n`);
    return;
  }
  const entries = entriesBetween(changelog, recorded, packageVersion);
  if (entries.length === 0) {
    out(`No changelog entries between ${recorded} and ${packageVersion}.\n`);
    return;
  }
  printChanges(out, entries, recorded);
}
