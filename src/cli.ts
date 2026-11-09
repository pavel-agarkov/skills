#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseArgs, UsageError, type Handler, type Opts } from './args.ts';
import { loadCatalog } from './catalog.ts';
import { loadChangelog } from './changelog.ts';
import { changes } from './commands/changes.ts';
import { add } from './commands/add.ts';
import { check } from './commands/check.ts';
import { remove } from './commands/remove.ts';
import { update } from './commands/update.ts';

const COMMAND_HANDLERS: Record<'add' | 'remove' | 'update' | 'check' | 'changes', Handler> = { add, remove, update, check, changes };

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `Usage: skills <command> [options]

Commands:
  add          Add skills selected by --skill / --tag to the project
  remove       Remove the given --skill / --tag selection (no flags: remove everything add installed)
  update       Re-sync installed skills with the package catalog
  check        Report pending changes without writing (exit 3 if any)
  changes      Show release notes since the version recorded in the project config
  list         List available skills and their tags
  help         Show this help

Options:
  --skill a,b       Skill names (repeatable, comma-separated)
  --tag x,y         Tags (repeatable, comma-separated)
  --agent, -a a,b   Agents: claude-code, universal, or '*' (repeatable, comma-separated; default: detected)
  --agents-md       add: maintain the skills index in AGENTS.md / CLAUDE.md; remove: remove it
  --force           Overwrite a skill directory not tracked by the manifest
  --dry-run         Show what would change and write nothing
  --cwd <dir>       Project root (default: current directory)
  --help, -h        Show this help
  --version, -v     Show the package version

Exit codes: 0 ok, 1 error, 2 usage error, 3 check found pending changes.

Examples:
  npx @pavel-agarkov/skills list
  npx @pavel-agarkov/skills list --tag dotnet
  npx @pavel-agarkov/skills add --skill interview-trainer
  npx @pavel-agarkov/skills add --tag dotnet,backend --agents-md
  npx @pavel-agarkov/skills add --skill interview-trainer --agent claude-code,universal
  npx @pavel-agarkov/skills remove --skill interview-trainer
  npx @pavel-agarkov/skills remove --tag dotnet
  npx @pavel-agarkov/skills remove --agents-md
  npx @pavel-agarkov/skills remove --agent claude-code
  npx @pavel-agarkov/skills check
  npx @pavel-agarkov/skills update --dry-run
  npx @pavel-agarkov/skills changes
  npx @pavel-agarkov/skills remove
`;

function fail(message: string, code: number): number {
  process.stderr.write(`skills: ${message}\n`);
  return code;
}

function listCommand(opts: Opts): number {
  const { skills } = loadCatalog(packageRoot);
  const wanted = new Set(opts.tags);
  const rows = [...skills.values()].filter((s) => wanted.size === 0 || s.tags.some((t) => wanted.has(t)));
  for (const s of rows) {
    process.stdout.write(`${s.name}  [${s.tags.join(', ')}]\n  ${s.description}\n`);
  }
  if (rows.length === 0) process.stdout.write('No skills match.\n');
  return 0;
}

async function main(argv: string[]): Promise<number> {
  let opts: Opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    if (err instanceof UsageError) return fail(`${err.message} (see "skills --help")`, 2);
    throw err;
  }
  if (opts.version) {
    const pkg = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }
  if (opts.help || opts.command === 'help' || opts.command === undefined) {
    process.stdout.write(HELP);
    return opts.command === undefined && !opts.help ? 2 : 0;
  }
  const cwd = resolve(opts.cwd ?? process.cwd());
  switch (opts.command) {
    case 'list':
      return listCommand(opts);
    case 'add':
    case 'remove':
    case 'update':
    case 'check':
    case 'changes':
      try {
        const result = await COMMAND_HANDLERS[opts.command](opts, {
          cwd,
          catalog: loadCatalog(packageRoot),
          changelog: loadChangelog(packageRoot),
          packageVersion: JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')).version,
          isTTY: Boolean(process.stdin.isTTY),
        });
        return opts.command === 'check' && result && 'pending' in result && result.pending ? 3 : 0;
      } catch (err) {
        if (err instanceof UsageError) return fail(`${err.message} (see "skills --help")`, 2);
        throw err;
      }
    default:
      return fail(`unknown command "${opts.command}"`, 2);
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (err) {
  process.stderr.write(`skills: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
}
