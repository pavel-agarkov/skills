# CLI Control Skill (`pa-skills`) — Plan Brief

> Full plan: `context/changes/cli-skills/plan.md`

## What & Why

Ship a catalog skill, `pa-skills`, that lets an AI agent in a consumer project run this package's CLI (`add`, `remove`, `update`, `check`, `changes`, `list`) for the user. Users ask in plain words ("add the dotnet skills", "are my skills up to date?") instead of remembering flags. The agent previews every write first, so nothing changes without the user saying yes.

## Starting Point

The CLI is complete and agent-friendly: clear exit codes, `--dry-run`, and a read-only `check`. But no skill teaches an agent to use it. Agents also have no TTY, so a bare `add` fails. Some commands delete files (a bare `remove`, `remove --agent`, and `add --agent claude-code` before the 0.3.0 migration). The catalog has two skills, and the tests hard-code that count.

## Desired End State

`pa-skills` (tag `cli`) installs like any other skill. An agent with it installed:
- resolves names with `list`,
- runs every write with `--dry-run` first and asks before the real run,
- reads exit code 3 from `check` as "pending",
- passes on the CLI's own `--agent` suggestions instead of choosing.

CI fails when the CLI gains a command or flag that the skill doesn't mention. The skill ships in 0.4.0.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Audience | Catalog skill for consumers | Uses the existing distribution path and works for both agents. |
| Packaging | One skill (`pa-skills`) with subcommands | One install and one place for the shared safety rules, the same pattern as interview-trainer. |
| Scope | All six commands | The read commands (list/check/changes) are what the agent needs before it writes. |
| Safety | Dry-run, then confirm; no `--force` or `--agent` unless asked | Some commands delete files, so every write is previewed and approved. |
| Version | `@latest` for update, check and changes; plain for add, remove and list | Follows the README's npx-cache caveat without upgrading on every `add`. |
| Drift guard | Extend `docs.test.js` | A new command or flag fails CI until the skill mentions it, and no build step is added. |
| Name / release | `pa-skills`, tag `cli`, 0.4.0 | A name that won't clash with Vercel's `skills`; a minor bump for a new catalog entry. |

## Scope

**In scope:**
- `dist/skills/pa-skills/SKILL.md` and `README.md`
- Drift tests in `test/docs.test.js` and the updated skill count in `test/catalog.test.js`
- Root README row, the 0.4.0 bump, `changelog.json` and `CHANGELOG.md`

**Out of scope:**
- Any change to CLI behavior
- Installing `pa-skills` automatically
- A repo-local maintainer copy
- One skill per command
- Generating the skill from `HELP`
- Vercel CLI commands

## Architecture / Approach

The skill has a frontmatter `argument-hint` and a routing table, then shared rules (resolve names with `list`, always pass explicit flags, dry-run → show → confirm → run, never `--force` or `--agent` unasked, the version rule, exit codes, passing on refusals), then short per-command recipes. Tests reuse `commandsIn`. Placeholders are replaced before parsing, flags are read from the `HELP` text in `bin/cli.js`, and the commands come from `COMMANDS` in `src/args.js`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Skill content | pa-skills SKILL.md + README.md | The description doesn't trigger for all six intents |
| 2. Drift and catalog tests | CI fails on command/flag drift; three-skill catalog test | Checking flags against `HELP` text is brittle if its layout changes |
| 3. Docs and release | Root README row, 0.4.0, changelog | Version conflict if another PR releases first |

**Prerequisites:** none; it builds on 0.3.0 as merged in main.
**Estimated effort:** ~1 session across 3 small phases.

## Open Risks & Assumptions

- Agents follow the dry-run-then-confirm rule from the skill text. Nothing in the CLI enforces it.
- Users must run the CLI once (`add --skill pa-skills`) before an agent can drive it.
- Read commands use the cached version, so `list` may not show skills added in a newer release. `check` and `update` use `@latest`.

## Success Criteria (Summary)

- An agent with `pa-skills` turns "add interview-trainer" into `list` → `add --dry-run` → a question → `add`.
- "Are my skills up to date?" runs `check` with `@latest` and reads exit code 3 correctly.
- `npm test` fails when the CLI and the skill disagree on commands or flags.
