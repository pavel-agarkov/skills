import type { Catalog } from './catalog.ts';
import type { Entry } from './changelog.ts';
import type { add } from './commands/add.ts';
import type { changes } from './commands/changes.ts';
import type { check } from './commands/check.ts';
import type { remove } from './commands/remove.ts';
import type { update } from './commands/update.ts';
import { UsageError } from './errors.ts';

export { UsageError };

export const COMMANDS = ['add', 'remove', 'update', 'check', 'changes', 'list', 'help'];

/** Parsed command-line options. */
export interface Opts {
  command: string | undefined;
  skills: string[];
  tags: string[];
  /** As given: may hold a literal `*` and unknown ids, which the commands expand and check. */
  agents: string[];
  agentsMd: true | undefined;
  force: boolean;
  dryRun: boolean;
  cwd: string | undefined;
  help: boolean;
  version: boolean;
}

/** What the CLI hands every command handler. */
export interface Ctx {
  cwd: string;
  catalog: Catalog;
  changelog?: Entry[];
  packageVersion: string;
  out?: (s: string) => void;
  isTTY?: boolean;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

/** The result union of the command handlers: the CLI maps `check`'s `pending` to exit 3. */
export type HandlerResult = Awaited<ReturnType<typeof add | typeof remove | typeof update | typeof check | typeof changes>>;

/** A command handler as dispatched by the CLI. */
export type Handler = (opts: Opts, ctx: Ctx) => Promise<HandlerResult>;

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/**
 * Parse argv (without node and script) into { command, skills, tags, agents, agentsMd, force, dryRun, cwd, help, version }.
 * agentsMd is true or undefined (not given). agents keeps a literal `*` and unknown ids; the commands expand and check
 * them. Throws UsageError on invalid input.
 */
export function parseArgs(argv: string[]): Opts {
  const out: Opts = {
    command: undefined,
    skills: [],
    tags: [],
    agents: [],
    agentsMd: undefined,
    force: false,
    dryRun: false,
    cwd: undefined,
    help: false,
    version: false,
  };

  const takeValue = (flag: string, inline: string | undefined, i: number): [string, number] => {
    if (inline !== undefined) return [inline, i];
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) throw new UsageError(`${flag} requires a value`);
    return [next, i + 1];
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h') {
      out.help = true;
      continue;
    }
    if (arg === '-v') {
      out.version = true;
      continue;
    }
    if (arg === '-a') {
      let value: string;
      [value, i] = takeValue(arg, undefined, i);
      out.agents.push(...splitList(value));
      continue;
    }
    if (!arg.startsWith('--')) {
      if (out.command !== undefined) throw new UsageError(`unexpected argument "${arg}"`);
      if (!COMMANDS.includes(arg)) throw new UsageError(`unknown command "${arg}"`);
      out.command = arg;
      continue;
    }
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? undefined : arg.slice(eq + 1);
    const noValue = (name: string) => {
      if (inline !== undefined) throw new UsageError(`${name} does not take a value`);
    };
    let value: string;
    switch (flag) {
      case '--skill':
        [value, i] = takeValue(flag, inline, i);
        out.skills.push(...splitList(value));
        break;
      case '--tag':
        [value, i] = takeValue(flag, inline, i);
        out.tags.push(...splitList(value));
        break;
      case '--agent':
        [value, i] = takeValue(flag, inline, i);
        out.agents.push(...splitList(value));
        break;
      case '--cwd':
        [value, i] = takeValue(flag, inline, i);
        out.cwd = value;
        break;
      case '--agents-md':
        noValue(flag);
        out.agentsMd = true;
        break;
      case '--force':
        noValue(flag);
        out.force = true;
        break;
      case '--dry-run':
        noValue(flag);
        out.dryRun = true;
        break;
      case '--help':
        noValue(flag);
        out.help = true;
        break;
      case '--version':
        noValue(flag);
        out.version = true;
        break;
      default:
        throw new UsageError(`unknown option "${flag}"`);
    }
  }
  return out;
}
