export const COMMANDS = ['install', 'update', 'configure', 'uninstall', 'check', 'list', 'help'];

export class UsageError extends Error {}

function splitList(value) {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/**
 * Parse argv (without node and script) into { command, skills, tags, agentsMd, force, dryRun, cwd, help, version }.
 * agentsMd is true / false / undefined (not given). Throws UsageError on invalid input.
 */
export function parseArgs(argv) {
  const out = {
    command: undefined,
    skills: [],
    tags: [],
    agentsMd: undefined,
    force: false,
    dryRun: false,
    cwd: undefined,
    help: false,
    version: false,
  };

  const takeValue = (flag, inline, i) => {
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
    if (!arg.startsWith('--')) {
      if (out.command !== undefined) throw new UsageError(`unexpected argument "${arg}"`);
      if (!COMMANDS.includes(arg)) throw new UsageError(`unknown command "${arg}"`);
      out.command = arg;
      continue;
    }
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? undefined : arg.slice(eq + 1);
    const noValue = (name) => {
      if (inline !== undefined) throw new UsageError(`${name} does not take a value`);
    };
    let value;
    switch (flag) {
      case '--skill':
        [value, i] = takeValue(flag, inline, i);
        out.skills.push(...splitList(value));
        break;
      case '--tag':
        [value, i] = takeValue(flag, inline, i);
        out.tags.push(...splitList(value));
        break;
      case '--cwd':
        [value, i] = takeValue(flag, inline, i);
        out.cwd = value;
        break;
      case '--agents-md':
        noValue(flag);
        out.agentsMd = true;
        break;
      case '--no-agents-md':
        noValue(flag);
        out.agentsMd = false;
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
