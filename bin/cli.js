#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseArgs, UsageError } from '../src/args.js';
import { loadCatalog } from '../src/catalog.js';
import { add } from '../src/commands/add.js';
import { check } from '../src/commands/check.js';
import { remove } from '../src/commands/remove.js';
import { update } from '../src/commands/update.js';

const COMMAND_HANDLERS = { add, remove, update, check };

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `Usage: skills <command> [options]

Commands:
  add          Add skills selected by --skill / --tag to the project
  remove       Remove the given --skill / --tag selection (no flags: remove everything add installed)
  update       Re-sync installed skills with the package catalog
  check        Report pending changes without writing (exit 3 if any)
  list         List available skills and their tags
  help         Show this help

Options:
  --skill a,b       Skill names (repeatable, comma-separated)
  --tag x,y         Tags (repeatable, comma-separated)
  --agents-md       add: maintain the AGENTS.md skills index; remove: remove it
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
  npx @pavel-agarkov/skills remove --skill interview-trainer
  npx @pavel-agarkov/skills remove --tag dotnet
  npx @pavel-agarkov/skills remove --agents-md
  npx @pavel-agarkov/skills check
  npx @pavel-agarkov/skills update --dry-run
  npx @pavel-agarkov/skills remove
`;

function fail(message, code) {
  process.stderr.write(`skills: ${message}\n`);
  return code;
}

function listCommand(opts) {
  const { skills } = loadCatalog(packageRoot);
  const wanted = new Set(opts.tags);
  const rows = [...skills.values()].filter((s) => wanted.size === 0 || s.tags.some((t) => wanted.has(t)));
  for (const s of rows) {
    process.stdout.write(`${s.name}  [${s.tags.join(', ')}]\n  ${s.description}\n`);
  }
  if (rows.length === 0) process.stdout.write('No skills match.\n');
  return 0;
}

async function main(argv) {
  let opts;
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
      try {
        const result = await COMMAND_HANDLERS[opts.command](opts, {
          cwd,
          catalog: loadCatalog(packageRoot),
          packageVersion: JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')).version,
          isTTY: Boolean(process.stdin.isTTY),
        });
        return opts.command === 'check' && result?.pending ? 3 : 0;
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
