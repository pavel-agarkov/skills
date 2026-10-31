# @pavel-agarkov/skills

A personal catalogue of agent skills, published as an npm package. The CLI copies the skills you pick into your project for Claude Code (`.claude/skills/`), for the agents that read `.agents/skills/`, or both. It remembers the selection and keeps it in sync on `update`. Zero runtime dependencies, Node 22 or newer.

## Skills

| Skill | Tags | Description |
| --- | --- | --- |
| [aspnet-layered-service-scaffold](dist/skills/aspnet-layered-service-scaffold/SKILL.md) | `dotnet`, `backend`, `scaffold` | Scaffold a dedicated ASP.NET Core Minimal API service with its own solution, layered Api/Application/Domain/Persistence projects, OpenAPI and health endpoints, and unit/integration/architecture tests. |
| [interview-trainer](dist/skills/interview-trainer/SKILL.md) | `learning`, `interview` | Run an adaptive, source-backed technical knowledge training session: quizzes, interview practice, revision. |
| [pa-skills](dist/skills/pa-skills/SKILL.md) | `cli` | Let your agent run this CLI for you (`add`, `remove`, `update`, `check`, `changes`, `list`): it previews every write with `--dry-run` and asks before running it. |

`dist/skills/` is the source of truth, not build output: edit the skills there, there is no build step, and the same folders are what ships in the npm package.

## Quick start

```sh
npx @pavel-agarkov/skills list
npx @pavel-agarkov/skills add --skill interview-trainer
npx @pavel-agarkov/skills add --skill pa-skills
npx @pavel-agarkov/skills add --tag dotnet,backend
npx @pavel-agarkov/skills add --skill interview-trainer --agent claude-code,universal
```

Each skill is copied once per agent: to `.claude/skills/<name>/` for `claude-code` and to `.agents/skills/<name>/` for `universal`. Without `--agent`, a new install detects the agent: `claude-code` when the project has `.claude/` or a root `CLAUDE.md`, `universal` when it has `.agents/` or `AGENTS.md`, and `universal` when it has neither. When both are found, `add` refuses (exit 2), writes nothing and names the `--agent` values to pass. Run `npx @pavel-agarkov/skills --help` for the full help text.

## Commands

| Command | What it does |
| --- | --- |
| `add` | Add the skills selected by `--skill` / `--tag`. Additive: the new selection is merged with the saved one. With no flags in an interactive terminal it opens a picker; without a terminal it is a usage error. |
| `remove` | Mirror of `add`. `--skill` / `--tag` remove that selection; with no flags it removes everything `add` installed. |
| `update` | Re-resolve the saved names and tags against the package catalog and sync the files. |
| `check` | Read-only: report what `update` would change. Exit code 3 when something is pending. |
| `changes` | Read-only: show the release notes between the version recorded in the config and the running version. |
| `list` | List available skills with tags; `list --tag x` filters. |
| `help` | Show the help text. |

Flags:

| Flag | Meaning |
| --- | --- |
| `--skill a,b` | Skill names, repeatable and comma-separated. |
| `--tag x,y` | Tags, repeatable and comma-separated; selects every skill carrying the tag. |
| `--agent a,b`, `-a a,b` | Agents: `claude-code`, `universal`, or `'*'` for both; repeatable and comma-separated. `add`: added to the saved agents (default: detected, see above). `remove`: drop that agent and its unmodified copies; cannot be combined with `--skill` / `--tag`. `update` and `check` use the saved agents. |
| `--agents-md` | `add`: maintain a skills index in `AGENTS.md` / `CLAUDE.md` (opt-in). `remove`: remove the index block. |
| `--force` | Overwrite a skill folder that is not tracked by the config, or a file you modified. |
| `--dry-run` | Print what would change and write nothing. |
| `--cwd <dir>` | Project root (default: current directory). |
| `--help`, `-h` / `--version`, `-v` | Help / package version. |

Unknown skill, tag or agent names fail before anything is written, with a list of valid values.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success (for `check`: nothing pending). |
| 1 | Handled error, for example no config for `update` / `check`. |
| 2 | Usage error: unknown command or flag, unknown skill or tag. |
| 3 | `check` only: changes are pending. |

Example CI gate: `npx @pavel-agarkov/skills check` fails the job (exit 3) when an `update` would change anything.

## What gets written

The selection is stored in `.pa-skills.json` at the project root (`version: 2`): the chosen `agents`, `skills` and `tags`, the `agentsMd` option, and under `installed` a manifest of every installed file with its SHA-256 (`installed.files`) and the rules files that hold a skills block (`installed.rules`). The file is deterministic (sorted keys and lists, no timestamps), so it is safe to commit and re-running an unchanged command leaves it byte-identical: an unchanged run does not write the file at all, and a changed one keeps the file's line endings (CRLF or LF).

Hard rules the installer follows:

- It only touches files listed in its own manifest, and only text between its own markers in `AGENTS.md` / `CLAUDE.md`. Files you add next to the installed ones are never touched.
- A tracked file whose content no longer matches the recorded hash counts as modified by you. `update` and `remove` skip it with a warning and leave it in place; `--force` overwrites it with the packaged version.
- Line endings are not a modification: a copy that differs from the packaged file only in CRLF vs LF (for example after a Windows checkout with `core.autocrlf`) still counts as unmodified. Files with a NUL byte are compared as raw bytes. The CLI writes the packaged files as they are.
- A skill folder that the config does not track is a collision: the command refuses and names the folder unless you pass `--force`. The check is per agent folder: our copy in `.agents/skills/<name>/` does not make your own `.claude/skills/<name>/` ours.
- Files or folders you deleted by hand are a warning, never an error. Still-wanted files are restored by `add` / `update`; otherwise they are just dropped from the config.

### Updating

```sh
npx @pavel-agarkov/skills@latest update
```

Use `@latest`: `npx` may serve a cached older version of the package. `update` adds skills that gained a selected tag, removes skills that left the catalog or lost the tag, drops explicit skill names that no longer exist (with a warning), and refreshes unmodified files. Preview with `update --dry-run` or `check`.

After a real update, `update` prints the release notes between your previous version (the one recorded in the config) and the new one. To read them before updating:

```sh
npx @pavel-agarkov/skills@latest changes
```

### Removing

`remove` is the mirror of `add`:

```sh
npx @pavel-agarkov/skills remove --skill interview-trainer
npx @pavel-agarkov/skills remove --tag dotnet
npx @pavel-agarkov/skills remove --agent claude-code
npx @pavel-agarkov/skills remove
```

- `--skill` removes that skill; `--tag` removes every skill carrying the tag, including one you added by name.
- A skill that is still selected through another tag stays installed; the command says which tag still selects it.
- A name or tag that exists in the catalog but is not in your selection is a warning; one that exists nowhere is a usage error.
- `--agent` drops that agent: its unmodified copies are deleted and the other agent keeps its own. Dropping the last agent removes everything. It cannot be combined with `--skill` / `--tag`, because every agent gets the same skills.
- When nothing remains selected, or with no flags, everything goes: manifest files for both agents, the block in every rules file it was written to (and `AGENTS.md` itself, if the installer created it and it is now empty), the config, and `.claude/skills/`, `.claude/`, `.agents/skills/` and `.agents/` when they are empty.
- Modified files and files you added stay in place and are reported.

### AGENTS.md index

Off by default. `add --agents-md` writes a skills index (name, description, path) between `<!-- BEGIN @pavel-agarkov/skills -->` and `<!-- END @pavel-agarkov/skills -->`, and saves `agentsMd: true`. The file depends on the agents:

- `universal`: `AGENTS.md`, created if needed. The block lists `.agents/skills/` paths.
- `claude-code`: the root `CLAUDE.md` when it exists, with `.claude/skills/` paths. Otherwise `AGENTS.md`, which Claude Code reads when there is no `CLAUDE.md`. `CLAUDE.md` is never created.
- Both agents and no `CLAUDE.md`: one block in `AGENTS.md`, with `.agents/skills/` paths.

When a root `CLAUDE.md` appears later, the next `add`, `remove` or `update` moves Claude Code's block from `AGENTS.md` to `CLAUDE.md`. Only the root `CLAUDE.md` counts: `.claude/CLAUDE.md` and `CLAUDE.local.md` are not checked. In a repo where Claude Code reads one of those instead, the block goes into `AGENTS.md`, which Claude Code may then not read.

While it is on, the block is rewritten after every `add`, `remove` and `update`, and removed when no skills remain. `remove --agents-md` alone drops the block and keeps all skills. Text outside the markers is never changed, and an unpaired marker aborts the change with an error.

## Using Vercel's skills CLI instead

The same folders are readable by Vercel's `skills` CLI (declared in `skills.sh.json`):

```sh
npx skills add pavel-agarkov/skills --skill interview-trainer
```

Its telemetry is on by default; set `DISABLE_TELEMETRY=1` to turn it off. Comparison, based on Vercel CLI v1.7.4:

| Area | Vercel CLI | This CLI |
| --- | --- | --- |
| Tag selection and a saved selection | None | `--tag`, selection kept in the config |
| Consumer files inside a skill folder | Deleted when `add` replaces an existing same-name skill folder, and on `update` / `remove`; no per-file list is recorded | Preserved: per-file manifest, only unmodified tracked files are changed or deleted |
| `AGENTS.md` index block | None | Opt-in, sentinel-delimited |
| Runtime dependencies | `tar`, `yaml` | None |
| Content hash | Folder SHA-256 in its lock | Per-file SHA-256 in the config |
| Committable, deterministic lock | Yes (sorted, no timestamps) | Yes (sorted, no timestamps) |
| CI gate | `check` exits 1 when an update exists | `check` exits 3 when changes are pending |
| Preview without writing | `--dry-run` (sync) | `--dry-run` on `add`, `remove`, `update` |
| Agent targets (75+), symlinks to a canonical copy | Yes | claude-code + universal (copies) |
| Global scope `-g`, installs from any repo, `find` | Yes | No |
| Telemetry | On by default (`DISABLE_TELEMETRY=1`) | None |

Choose Vercel's CLI for many agent targets or global installs; choose this one when you want a tag-based, committable selection that never overwrites your own edits.

## Publishing

Every pull request runs `.github/workflows/ci.yml`. Its `ci` check is the one to require in branch protection, and it passes only when both of these pass:

- `test`: `npm test` on Linux and Windows, with Node 22 and the latest Node.
- `release-check`: compares the PR's `version` with the base branch. An unchanged version passes. A changed version must be a plain `x.y.z` (no `v`, no prerelease), greater than the base, and have an entry with notes in `changelog.json`.

To release, in the PR:

1. Bump `version` in `package.json`.
2. Add an entry for that version at the top of `changelog.json`.
3. Run `npm run changelog` to regenerate `CHANGELOG.md`, and commit it.

On a merge to `main`, `.github/workflows/publish.yml` runs the tests again. It then checks npm: if the version is new, it publishes with provenance and creates the `v<version>` tag and a GitHub Release with that version's notes. A merge that does not change the version publishes nothing. Running the workflow manually (`workflow_dispatch`) is a safe retry: an already-published version is skipped.

Publishing uses npm trusted publishing (GitHub OIDC): the package's Trusted Publisher stays bound to this repository and `publish.yml`, so there is no token or `.npmrc` anywhere.
