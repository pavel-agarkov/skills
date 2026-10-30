# Multi-harness install — Plan Brief

> Full plan: `context/changes/multi-harness-install/plan.md`
> Research: `context/changes/multi-harness-install/research.md`

## What & Why

Claude Code cannot see skills in `.agents/skills`; it reads only `.claude/skills`. It also ignores `AGENTS.md` when a `CLAUDE.md` exists. This change lets one install target `claude-code`, `universal` (`.agents/skills`, read by Codex, Copilot, OpenCode and Gemini), or both. For that to work the config must stop living inside `.agents/`. Existing v0.1.0/v0.2.0 installs must keep updating safely.

## Starting Point

The CLI writes only to `.agents/skills` and an optional `AGENTS.md` block. Its v1 config lives at `.agents/.pa-skills-config.json`. The file-level, hash-guarded sync (`src/sync.js:114-131`) already deletes only unmodified tracked files, so moving or dropping a target needs no new delete logic.

## Desired End State

- `npx @pavel-agarkov/skills add --skill x --agent claude-code,universal` installs plain copies into both folders. The selection is saved in a root `.pa-skills.json` (`version: 2`).
- Without `--agent`, the CLI detects which harness the repo uses. When both are present it stops with a clear "pass `--agent`" message.
- The index block lands in `CLAUDE.md` when that file exists, so Claude sees it.
- Upgrading from 0.2.x moves the config automatically. Upgraders whose repos also contain Claude markers get one explicit, harmless error.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Targets | `claude-code` (`.claude/skills`) and `universal` (`.agents/skills`), copies only, no custom paths | Two folders cover all six checked harnesses; copies need no new manifest type. | Research (D1, D5) |
| Multi-target | One install can target both; `--agent a,b`, repeatable, `-a`, `*` | Matches Vercel's multi-agent selection with our existing comma-list parser. | Research (D3, D4) + Plan |
| Config | Root `.pa-skills.json`, `version: 2`; legacy file read as a fallback, deleted after the first real write | Not tied to `.agents/`; a version bump stops old CLIs from silently dropping new keys. | Plan |
| Default agents | Detect: claude-code if `.claude/` or `CLAUDE.md`; universal if `.agents/` or `AGENTS.md`; one → it, none → universal, both → fail | Uses the repo's own harness footprint; refuses to guess when ambiguous. | Plan |
| Upgrade | Same detection, with our `.agents/` counted as universal; both present → `update`/`check` fail with nothing changed | User's rule applied literally; the one-time fix is `add --agent …`. | Plan |
| `add` / `remove` | `add --agent` is additive; `remove --agent` narrows; removing the last agent = full removal; no per-agent skill sets | Same mental model as `--skill`/`--tag`. | Plan |
| Claude rules file | Root `CLAUDE.md` only (not `.claude/CLAUDE.md` or `CLAUDE.local.md`), else `AGENTS.md`; `CLAUDE.md` is never created | Simplest rule; the remaining gaps are documented. | Research (D2) + Plan |
| Block content / move | One block per file; a block serving universal lists `.agents/skills` paths; blocks move when the resolved file changes | Every `AGENTS.md` reader can use the listed paths; the index follows the file Claude reads. | Plan |
| Release | Version 0.3.0 with changelog notes that `update` prints to upgraders | Hard rule: publish only a new version; upgraders see what to run. | Plan |

## Scope

**In scope:**
- v2 root config and v1 migration
- Per-agent sync, collision checks and pruning
- Per-file rules blocks
- The `--agent`/`-a` flag and detection
- README, help text, changelog and version bump

**Out of scope:**
- Custom paths or a third target
- Symlinks
- Vercel per-tool aliases
- Per-agent skill selection
- Global scope and `skills-lock.json`
- An interactive agent prompt
- `--agent` on `update`/`check`
- Renaming `--agents-md`

## Architecture / Approach

A new `src/agents.js` registry owns the ids, their folders and detection. `syncSkills` builds desired files per agent × skill, and checks collisions per `<skillsDir>/<name>`. A new `src/rules.js` maps the selected agents to rules files; the generalised `applyBlock`/`removeBlock` write them, one block per file. `readConfig` reads the root file first, then the legacy one, upgrading v1 to v2 in memory. `writeConfig` writes the root file and only then deletes the legacy one. All the ambiguity checks and rules-file validation run before any file is written.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Root config v2 + legacy migration | `.pa-skills.json`, v1 upgrade, `check` reports the move | Deleting the legacy file before the root write succeeds |
| 2. Multi-target sync | Copies per agent, per-folder collisions, pruning | Pruning a `.claude/` folder that holds consumer files |
| 3. Per-file rules blocks | `CLAUDE.md`/`AGENTS.md` resolution, one block per file, block moves | A repeated marker when two agents share `AGENTS.md` |
| 4. `--agent` CLI + detection | Flags, detection matrix, fail-on-both, add/remove semantics | Detection reacting to our own writes within one run |
| 5. Docs and release | README, help, 0.3.0 notes, version bump | Upgraders missing the one-time `add --agent` step |

**Prerequisites:** none beyond the current `main`. The publish workflow from `simple-publish` is in place.
**Estimated effort:** ~3-4 sessions across 5 phases. Phases 1 and 3 are the heaviest.

## Open Risks & Assumptions

- Many Claude-using repos upgrading from 0.2.x will hit one failed `update` (a deliberate trade-off). The 0.3.0 notes and the README must make the fix obvious.
- In a repo whose Claude rules live only in `.claude/CLAUDE.md` or `CLAUDE.local.md`, an `AGENTS.md` block is invisible to Claude. This is documented, not handled.
- Cursor coverage by `.agents/skills` relies on Vercel's source, not on Cursor's docs (research, open Q7).
- A project upgraded by 0.3.0 cannot be read by 0.2.x. Such a CLI fails safely ("nothing installed") and deletes nothing.

## Success Criteria (Summary)

- A Claude Code user runs one `add --agent claude-code` and sees the skills in Claude.
- A 0.2.x install updates to 0.3.0 with byte-identical skill files, or fails once with an exact next command and nothing changed.
- No consumer file outside our manifest and markers is ever modified, and a full `remove` leaves no folders of ours behind.
