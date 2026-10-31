---
name: pa-skills
description: Drive the @pavel-agarkov/skills CLI for the user. Use when the user wants to install, add, remove, uninstall, update, sync, check or list the project's agent skills from @pavel-agarkov/skills, asks whether those skills are up to date, or wants to read their release notes or changelog.
tags: [cli]
argument-hint: "<add|remove|update|check|changes|list> [--skill a,b] [--tag x,y] [--agent a,b] [--agents-md] [--dry-run]"
---

# pa-skills

Run the `@pavel-agarkov/skills` CLI on the user's behalf and read its results. The CLI copies catalog skills into the project (`.claude/skills/<name>/` for `claude-code`, `.agents/skills/<name>/` for `universal`) and records the selection in `.pa-skills.json` at the project root. This skill wraps the CLI; it never edits those files by hand.

## Command routing

The frontmatter `argument-hint` is the invocation syntax. Natural-language requests ("add the dotnet skills", "are my skills up to date?", "what changed?") route to the same commands.

| Command | npx form | What it does |
|---|---|---|
| `add` | `npx @pavel-agarkov/skills add --skill <name>` | Adds the selected skills; merged with the saved selection. Writes files. |
| `remove` | `npx @pavel-agarkov/skills remove --skill <name>` | Removes the selected skills; with no flags removes everything `add` installed. Deletes files. |
| `update` | `npx @pavel-agarkov/skills@latest update` | Re-syncs the saved selection with the package catalog. Writes files. |
| `check` | `npx @pavel-agarkov/skills@latest check` | Read-only: reports what `update` would change. |
| `changes` | `npx @pavel-agarkov/skills@latest changes` | Read-only: release notes since the version recorded in `.pa-skills.json`. |
| `list` | `npx @pavel-agarkov/skills list` | Read-only: available skills and their tags. |

Do not route to `help` for the user; read the help text yourself only when you need it (`--help` / `-h`). `--version` / `-v` prints the package version.

Flags (from the CLI help):

| Flag | Meaning |
|---|---|
| `--skill a,b` | Skill names, repeatable and comma-separated. |
| `--tag x,y` | Tags, repeatable and comma-separated; selects every skill with the tag. |
| `--agent a,b`, `-a a,b` | Agents: `claude-code`, `universal`, or `'*'` for both. `add`: added to the saved agents. `remove`: drop that agent and its unmodified copies; cannot be combined with `--skill` / `--tag`. |
| `--agents-md` | `add`: maintain a skills index block in `AGENTS.md` / `CLAUDE.md`. `remove`: remove that block. |
| `--force` | Overwrite a skill folder not tracked by the config, or a file the user modified. |
| `--dry-run` | Print what would change and write nothing (`add`, `remove`, `update`). |
| `--cwd <dir>` | Project root (default: current directory). |
| `--help`, `-h` / `--version`, `-v` | Help text / package version. |

## Shared rules

These apply to every command.

1. **Resolve names with `list` first.** Map the user's words ("the dotnet ones", "the interview skill") to real skill and tag names from `npx @pavel-agarkov/skills list` output. Never guess a name; an unknown name is a usage error (exit 2).
2. **Always pass explicit `--skill` / `--tag`.** You have no interactive terminal, so a bare `add` is a usage error instead of a picker.
3. **Dry run, show, then ask.** For `add`, `remove` and `update`, first run the exact same command with `--dry-run` added. Show the user its output. Run the real command (the same command without `--dry-run`) only after the user explicitly says yes. If the user changes the request, dry-run the new command again.
4. **No `--force`, no chosen `--agent`.** Never add `--force`, and never choose `--agent` values yourself, unless the user asked for that exact flag. When the CLI refuses because of a collision, or skips a modified file, report it and let the user decide whether to pass `--force`.
5. **Extra warning before deleting.** A bare `remove` (no flags) and `remove --agent ...` delete installed files, and any `remove` whose dry run ends with `config .pa-skills.json would be deleted` removes everything (for example removing the last selected skill, or dropping the last agent). Before asking for the yes, say plainly that these files will be deleted and list them from the dry-run output.
6. **`--cwd` only on request.** Add `--cwd <dir>` only when the user names another project root. Otherwise run from the current project root.

## Version rule

- `update`, `check` and `changes` run with the `@latest` package spec (`@pavel-agarkov/skills@latest`), because `npx` may otherwise serve a cached older version.
- `add`, `remove` and `list` run with the plain package spec (`@pavel-agarkov/skills`, no version).
- The dry-run preview and the real run use the same form, so they resolve the same version.

## Exit codes

| Code | Meaning | What you do |
|---|---|---|
| 0 | OK (for `check`: nothing pending). | Report the result. |
| 1 | Error, for example no saved selection for `update` / `check`. | Report the stderr message to the user. Do not retry with other flags. |
| 2 | Usage error: unknown command, flag, skill, tag or agent, or no selection. | Fix the arguments (re-check names with `list`), or, when the CLI suggests `--agent` values, pass that suggestion on and ask the user. |
| 3 | `check` only: changes are pending. | Report what is pending. This is not a failure; offer `update`. |

## Refusals to pass on

When the CLI cannot choose the agents, quote its message and its suggested commands verbatim, ask the user which one to run, and do not choose for them.

- **Both agents detected on `add` (exit 2).** A new install finds both a Claude Code marker (`.claude/` or a root `CLAUDE.md`) and a universal marker (`.agents/` or `AGENTS.md`). The message says the agents "cannot be chosen automatically" and names the `--agent claude-code`, `--agent universal` and `--agent claude-code,universal` options. Nothing is written. After the user picks, dry-run the original `add` with that `--agent` value, then ask again before the real run.

## Per-command recipes

### add

1. Resolve names with `list`.
2. Dry-run, show the output, ask.
3. On yes, run the same command without `--dry-run`, then report.

```sh
npx @pavel-agarkov/skills add --skill interview-trainer --dry-run
npx @pavel-agarkov/skills add --tag dotnet,backend --dry-run
npx @pavel-agarkov/skills add --skill <name> --tag <tag>
```

Add `--agents-md` only when the user wants the skills index in `AGENTS.md` / `CLAUDE.md`: `npx @pavel-agarkov/skills add --skill interview-trainer --agents-md --dry-run`.

### remove

`--skill` removes that skill; `--tag` removes every skill with the tag. A skill still selected through another tag stays installed, and the CLI says which tag keeps it. Modified files and files the user added stay in place and are reported.

```sh
npx @pavel-agarkov/skills remove --skill interview-trainer --dry-run
npx @pavel-agarkov/skills remove --agents-md --dry-run
```

Deleting paths (extra warning, see Shared rules): a bare remove deletes everything `add` installed, the rules-file block and `.pa-skills.json`; `--agent` deletes that agent's unmodified copies. Use `--agent` only with the value the user named. A `--skill` / `--tag` remove that leaves nothing selected, or an `--agent` that drops the last agent, removes everything like a bare remove; the dry run says so.

```sh
npx @pavel-agarkov/skills remove --dry-run
npx @pavel-agarkov/skills remove --agent <agent> --dry-run
```

### update

Re-syncs the saved selection: adds skills that gained a selected tag, removes skills that left the catalog or lost the tag, and refreshes unmodified files. Modified files are skipped with a warning. After a real run it prints the release notes since the previous version; pass them on.

```sh
npx @pavel-agarkov/skills@latest update --dry-run
npx @pavel-agarkov/skills@latest update
```

### check

Read-only, so no dry run or confirmation is needed. Exit 3 means updates are pending: report what is pending and offer `update` (which then follows the dry-run rule).

```sh
npx @pavel-agarkov/skills@latest check
```

### changes

Read-only. Shows the release notes between the version recorded in `.pa-skills.json` and the running version. Summarize them for the user.

```sh
npx @pavel-agarkov/skills@latest changes
```

### list

Read-only. Use it to resolve names, or to answer "what skills are there?". Filter with `--tag`.

```sh
npx @pavel-agarkov/skills list
npx @pavel-agarkov/skills list --tag dotnet
```

## Reporting

After a real `add`, `remove` or `update`:

- Summarize what changed from the CLI output: skills added, updated or removed, files skipped as modified, and warnings.
- Remind the user to commit `.pa-skills.json`, the installed skill files (`.claude/skills/` and/or `.agents/skills/`), and the skills block in `AGENTS.md` / `CLAUDE.md` if one was written or changed.
- Do not commit for the user unless they ask.
