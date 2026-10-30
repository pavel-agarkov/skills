---
date: 2026-10-30T13:46:32+01:00
researcher: Pavel Agarkov (with Claude Code)
git_commit: 279a24e251720c3ff9bc4be551af2c17da5cc33c
branch: claude/auto-publish-pr-merge-ede5c8
repository: pavel-agarkov/skills
topic: "Multi-harness install (Claude Code + others + custom paths), config at the project root, safe upgrade of existing installs"
tags: [research, installer, config, manifest, agents-md, harness-targets, migration]
status: complete
last_updated: 2026-10-30
last_updated_by: Pavel Agarkov (with Claude Code)
last_updated_note: "Follow-up 2 amended: comma-separated --agent (no new parser); D5 agent ids claude-code and universal"
---

# Research: Multi-harness install, root config, safe upgrade

**Date**: 2026-10-30T13:46:32+01:00
**Researcher**: Pavel Agarkov (with Claude Code)
**Git Commit**: 279a24e251720c3ff9bc4be551af2c17da5cc33c
**Branch**: claude/auto-publish-pr-merge-ede5c8
**Repository**: pavel-agarkov/skills

## Research Question

From `change.md`:

- Claude Code cannot see skills in `.agents/`.
- Support multiple harnesses the way Vercel's `skills` CLI does, but 3 main ones are enough.
- Add a custom option: CLI flags for a project-relative skills folder and rules (`AGENTS.md`-style) file.
- Move our config to the project root so it is not tied to `.agents/`.
- Existing installations (v0.1.0 / v0.2.0) must keep updating without problems.

## Summary

> **Follow-up 1 (2026-10-30)** narrows the scope to two targets, `claude` and `agents`, with no custom paths. It fixes where Claude's rules block goes and requires installing to several targets at once. See "Follow-up 1" below; the profile discussion in this summary is kept for context.

### Which harnesses read which folders

Of the six harnesses checked, only Claude Code ignores `.agents/skills/`.

| Harness | Reads `.agents/skills/`? | Source |
|---|---|---|
| Claude Code | No. Reads only `.claude/skills/<name>/SKILL.md`. | `code.claude.com/docs/en/skills.md` (location table); Vercel `agents.ts:155-165` |
| Codex | Yes | Vercel `agents.ts:224-232`; OpenAI Codex skills docs |
| GitHub Copilot | Yes, along with `.github/skills` and `.claude/skills` | Vercel `agents.ts:370-378`; GitHub docs "about agent skills" |
| OpenCode | Yes | Vercel `agents.ts:553-561` |
| Gemini CLI | Yes | Vercel `agents.ts:361-369` |
| Cursor | Per Vercel, yes. Cursor's own docs could not be fetched. | Vercel `agents.ts:269-277` |

So three profiles cover the request. **`claude-code`**: `.claude/skills` + `CLAUDE.md`. **`agents`** (the universal one, today's behaviour): `.agents/skills` + `AGENTS.md`, which covers Codex, Copilot, OpenCode, Gemini and Cursor-per-Vercel. **`custom`**: a skills dir and a rules file from the CLI.

If "3 main harnesses" means Claude, Codex and Copilot by name, those two non-Claude profiles share the same paths. Only the rules-file default differs: Copilot also reads `AGENTS.md`.

### Claude Code and the rules file

Claude Code reads `AGENTS.md` only when the working directory has no `CLAUDE.md`/`CLAUDE.local.md`, at that level or above. Otherwise it reads `CLAUDE.md` files only, unless `CLAUDE.md` imports `@AGENTS.md` (`code.claude.com/docs/en/memory.md`, "AGENTS.md" table). Today's `AGENTS.md` block is therefore invisible to Claude in any repo that already has a `CLAUDE.md`.

### Upgrades

The code can migrate an existing install safely with modest changes. Manifest paths are already project-relative strings (`src/config.js:50`). The sync deletes only tracked, unmodified files (`src/sync.js:114-131`). So moving files to a new target works with the existing algorithm.

Four pieces need changes:

1. **Config lookup.** `readConfig` looks only at `.agents/.pa-skills-config.json` (`src/config.js:5,62-72`). The new version must read that legacy path as a fallback, write the root file and delete the legacy file.
2. **Hardcoded `.agents` paths.** `SKILLS_REL_DIR` is hardcoded in four places: `src/sync.js:5,28,60,69` and `src/agents-md.js:17`. `remove` also hardcodes the `.agents` dir it prunes (`src/commands/remove.js:23-30`).
3. **One rules file only.** The config models exactly one rules file (`installed.agentsMd: {present, createdFile}`, `src/config.js:54-57`; `src/lifecycle.js:15,26-34`).
4. **Collision check is name-only.** It keys on skill name alone (`src/sync.js:67-70`). With several targets it would skip checking a foreign `.claude/skills/<name>` whenever `<name>` is already installed under `.agents/skills/`.

## Detailed Findings

### 1. Harness profiles (verified against sources)

Vercel `skills` CLI is at commit `92a9a34`, the same commit `context/changes/vercel-skills-research/research.md` used. The source was fetched, not run. Fetched copies are in the session scratchpad and are not committed.

| Harness | Project skills dir | Rules file it reads | Confidence |
|---|---|---|---|
| Claude Code | `.claude/skills/<n>/SKILL.md`, discovered from the start dir up to the repo root | `CLAUDE.md` or `.claude/CLAUDE.md`. `AGENTS.md` only when no CLAUDE.md exists, or via an `@AGENTS.md` import. | High (official docs + Vercel `agents.ts:155-165`) |
| Codex | `.agents/skills` | `AGENTS.md` | High (`agents.ts:224-232`, OpenAI docs) |
| GitHub Copilot | `.github/skills`, `.claude/skills` or `.agents/skills` | `.github/copilot-instructions.md`, and `AGENTS.md` | High (`agents.ts:370-378`, GitHub docs) |
| OpenCode | `.opencode/skills`, `.agents/skills`, `.claude/skills` | `AGENTS.md` (not re-checked) | High for skills |
| Gemini CLI | `.gemini/skills` or `.agents/skills` (the alias takes precedence) | `GEMINI.md` (not re-checked) | High for skills |
| Cursor | `.agents/skills` per Vercel. The lesson profile says `.cursor/skills`. | `.cursor/rules/*.mdc` per the lesson | Medium (Cursor docs blocked by proxy) |

How Vercel does it:

- Any agent whose `skillsDir === '.agents/skills'` is "universal". Its skills are written straight into the canonical `.agents/skills/<n>` with no link (`installer.ts:147-165`).
- Agent-specific dirs such as `.claude/skills` get a symlink to the canonical copy.
  - On Windows the link is a junction with an absolute target (`installer.ts:290-293`). If linking fails, Vercel falls back to a copy (`installer.ts:440-450`).
  - Claude Code has `createProjectSkillsDirByDefault: true`, so `.claude/skills` is created even when `.claude/` does not yet exist (`agents.ts:161`, `installer.ts:100-117`).
- Detection checks only the user's home dir (`~/.claude`, `~/.codex`, `~/.copilot`), not project markers (`agents.ts:162-164,229-231`). It cannot tell which tools a given repo uses.

The lesson's tool-profile object is the model the earlier change pointed at. Its Claude entry is `.claude/skills/${name}/SKILL.md` + `rulesFile: "CLAUDE.md"` (`context/changes/vercel-skills-research/shared-ai-registry-skills-commands-and-rules-for-your-team.md:350-354`).

### 2. Where `.agents/` and `AGENTS.md` are hardcoded today

| Constant / literal | Defined | Used |
|---|---|---|
| `CONFIG_REL_PATH = '.agents/.pa-skills-config.json'` | `src/config.js:5` | `configPath` `src/config.js:7-9`; error text `src/config.js:30,70`; summary text `src/lifecycle.js:75`; remove text `src/commands/remove.js:62` |
| `SKILLS_REL_DIR = '.agents/skills'` | `src/sync.js:5` | prune bound `src/sync.js:28`; desired paths `src/sync.js:60`; collision check `src/sync.js:67-70`; AGENTS.md index line `src/agents-md.js:17` |
| `AGENTS_MD = 'AGENTS.md'` | `src/agents-md.js:7` | `applyBlock`/`removeBlock` file `src/agents-md.js:49,78`; messages in `src/lifecycle.js:68-70` and `src/commands/remove.js:40-54` |
| literal `'.agents'` | — | `pruneAgentsDir` `src/commands/remove.js:23-30` |

Other places that pin these paths:

- **CLI and args.** `--agents-md` is the only rules-file switch (`src/args.js:72-75`). It is described as "maintain the AGENTS.md skills index" (`bin/cli.js:30`). `parseArgs` has a `takeValue` helper for value flags (`src/args.js:29-34`), so `--target`, `--skills-dir` and `--rules-file` fit the existing pattern.
- **Tests.** 101 lines across 11 test files reference `.agents`, `pa-skills-config`, `CONFIG_REL_PATH` or `SKILLS_REL_DIR` (grep over `test/`). The shared helper `readConfigJson` reads the fixed path (`test/helpers.js:29`). `test/add.test.js:44` asserts every manifest path starts with `.agents/skills/`. `test/config.test.js:57-58` asserts `version: 2` is rejected.
- **Docs.** `README.md:3,22,63,69,99,126` names `.agents/` as the only location.

### 3. Config schema and what the upgrade has to handle

The v1 contract is defined in `context/changes/ai-skills-distribution-package/plan.md:206` and enforced in `src/config.js:29-59`:

```
{ version: 1, package, packageVersion, skills, tags, agentsMd,
  installed: { skills, files: [{path, sha256}], agentsMd: {present, createdFile} } }
```

Observed behaviours that matter for the upgrade:

- **Only version 1 is accepted.** `validateConfig` throws on any `version !== 1` (`src/config.js:34`). Unknown extra keys are *not* rejected: there is no allow-list in `src/config.js:29-59`.
- **The config is rebuilt from scratch on every write.** `reconcile` builds it from a fixed key set with `version: 1` hard-coded (`src/lifecycle.js:36-44`). An old CLI that tolerated a new `targets` key would therefore silently drop it on its next write. This argues for bumping to `version: 2` rather than adding keys under v1.
- **Manifest paths survive a move.** They are project-relative, forward-slash and `..`-free (`src/config.js:50`). Existing `.agents/skills/...` entries stay valid manifest entries after the config moves to the root.
- **Moving a target needs no new delete logic.** When the desired set no longer contains a tracked path, `syncSkills` deletes it only if the on-disk SHA-256 still matches. Otherwise it reports `modified` and leaves the file (`src/sync.js:114-131`). Switching an existing install from `agents` to `claude-code` therefore deletes untouched copies and keeps consumer-edited ones. This needs no new deletion code.
- **Empty-dir pruning stops at `.agents/skills`.** `pruneEmptyDirs` only walks up while the dir is under `SKILLS_REL_DIR` (`src/sync.js:26-40`). For `.claude/skills` or a custom dir it would leave empty skill folders behind. The prune bound has to become the manifest entry's own target skills dir.
- **`remove` (full) prunes only `.agents/`.** It deletes the config and then only the `.agents/` dir if empty (`src/commands/remove.js:58-61`). After the move, `.agents/` will usually be empty once the legacy config is gone. With other targets the equivalent `.claude/skills`, `.claude` or custom dirs are not pruned.
- **A config move leaves an old CLI safe.** A pinned or cached old CLI (v0.1.0/v0.2.0) reads only `.agents/.pa-skills-config.json` (`src/config.js:5`).
  - Once the new CLI has moved the config, `update`/`check` on the old CLI fail with "nothing installed" (`src/commands/update.js:13`).
  - A re-`add` on the old CLI refuses, because `.agents/skills/<name>` exists and is not in its (empty) manifest (`src/sync.js:64-77`).
  - Either way it fails loudly, nothing is deleted and no consumer file is overwritten. A stub or second copy of the config at the legacy path is not needed for safety.
- **The AGENTS.md block is not self-describing.** Its markers are generic (`src/agents-md.js:5-6`). The index line embeds the skills path (`src/agents-md.js:17`), so the block is regenerated whenever the target changes. The existing replace-between-markers path already handles that (`src/agents-md.js:61-63`). The same markers can be reused inside `CLAUDE.md` for the Claude profile, because `findBlock` is file-agnostic apart from the error message text (`src/agents-md.js:24-43`).

### 4. Collisions with more than one target

`syncSkills` treats a skill as "ours" when its *name* is in `prev.installed.skills` (`src/sync.js:67-70`). With one target that was equivalent to "the dir is ours".

With two targets, a user may have their own `.claude/skills/interview-trainer/` while ours exists under `.agents/skills/`. The check would then skip the collision test, and the per-file loop would adopt identical files or report differing ones as `modified` (`src/sync.js:99-110`). Nothing is overwritten (no `force`), so the hard rule holds. But the user gets a `modified` warning instead of a clear collision error, and identical files are silently adopted into our manifest.

The collision check should key on the target directory path (`<skillsDir>/<name>`): check whether any tracked manifest path starts with that prefix.

### 5. Rules file per target

`installed.agentsMd` holds one `{present, createdFile}` pair, and `applyBlock`/`removeBlock` always use `join(cwd, 'AGENTS.md')` (`src/agents-md.js:49,78`). Supporting `CLAUDE.md` or a custom rules file needs:

- a per-file state keyed by the rules-file path (e.g. `installed.rules: { "AGENTS.md": {createdFile}, "CLAUDE.md": {createdFile} }`);
- `applyBlock`/`removeBlock` taking a file path parameter.

If two targets share one rules file (`agents` and Copilot), they must write one block, not two. `findBlock` throws on a repeated marker (`src/agents-md.js:29-34`).

For Claude, there are two options for making the index visible:

- (a) a sentinel block inside `CLAUDE.md`;
- (b) a single `@AGENTS.md` line in `CLAUDE.md`.

Option (b) writes text outside a block and so conflicts with the "only text between sentinel markers" hard rule (`CLAUDE.md`, "Hard rules"), unless the import line sits inside the markers. Option (a) fits the existing code directly.

### 6. Custom paths

A custom skills dir and rules file must pass the same safety checks that manifest paths get. Those checks are project-relative, no backslashes, no absolute paths, no `..` (`src/config.js:50`). Without them, `remove` could delete outside the project.

On Windows the user may type backslashes. These should be normalized to `/` at parse time, before validation.

The custom paths must be persisted in the config, because `update`/`check` re-run only from the saved selection (`src/commands/update.js:11-28`).

### 7. Symlinks vs copies

Vercel links agent dirs to a canonical copy. Our manifest tracks regular files by SHA-256: `hashOnDisk` returns `'not-a-file'` for anything that is not a file (`src/sync.js:16-23`). A link-based design would need a new manifest entry type.

Copying the files into each target dir needs no manifest change; each copy is just more file entries. Symlinks are listed as a separate deferred item in `context/changes/vercel-skills-support/change.md` (item 2).

## Code References

- `src/config.js:5-9`: `CONFIG_REL_PATH` and `configPath`, the single config location
- `src/config.js:29-59`: `validateConfig`; `version !== 1` rejected at :32, manifest path safety at :46-49
- `src/config.js:62-72`: `readConfig`, no fallback location
- `src/sync.js:5`: `SKILLS_REL_DIR = '.agents/skills'`
- `src/sync.js:26-40`: `pruneEmptyDirs`, bounded by `SKILLS_REL_DIR`
- `src/sync.js:60`: desired manifest paths built from `SKILLS_REL_DIR`
- `src/sync.js:64-77`: name-only collision check
- `src/sync.js:114-131`: deletion of no-longer-wanted tracked files (hash-guarded)
- `src/agents-md.js:5-7,17`: markers, `AGENTS_MD`, skills path in index line
- `src/agents-md.js:48-95`: `applyBlock`/`removeBlock`, fixed to `AGENTS.md`
- `src/lifecycle.js:13-47`: `reconcile`, rebuilds the config with `version: 1`
- `src/commands/remove.js:22-31,56-59`: `.agents/` pruning after full removal
- `src/commands/update.js:9-35`: `runSaved`, re-runs from the saved selection only
- `src/args.js:29-34,72-75`: value-flag helper and `--agents-md`
- `test/helpers.js:29`: tests read config from the fixed legacy path
- `test/add.test.js:44`: asserts manifest paths start with `.agents/skills/`
- `test/config.test.js:57-58`: asserts `version: 2` is rejected

## Architecture Insights

- **The install is file-level and hash-guarded.** Every target is just a set of `{path, sha256}` entries. Multi-target support is mostly about generating desired paths per target, not about new deletion logic.
- **Intent and manifest are separate** (`skills`/`tags`/`agentsMd` vs `installed.*`). A new `targets` intent key and a per-rules-file `installed` state fit that split.
- **Bump the config version, don't extend v1.** Writes are deterministic and rebuilt from a fixed shape. A `version: 2` bump plus a v1→v2 upgrade in `readConfig` is the clean path, and it matches the existing "unsupported version" gate.
- **Upgrade-time defaults decide whether existing users see a change.** A v1 config has no `targets`, so it must map to `["agents"]` (today's paths). Then the first `update` on the new CLI is a no-op for files and only moves the config. Turning Claude on stays an explicit `add --target claude-code`, unless the plan decides otherwise.

## Historical Context (from prior changes)

- `context/changes/ai-skills-distribution-package/plan-brief.md:31,41` and `plan.md:55,62`: v1 deliberately shipped `.agents/` + `AGENTS.md` only, with no `--target`, symlinks or global scope. Supported: that is still the state of the code.
- `context/changes/ai-skills-distribution-package/plan.md:206`: v1 config contract. Supported, matches `src/config.js:29-59`.
- `context/changes/ai-skills-distribution-package/plan.md:496`: an earlier layout move needed no migration because nothing had shipped. This time v0.1.0 and v0.2.0 are published (`changelog.json`), so a migration is required.
- `context/archive/2026-10-30-simple-publish/plan.md:16,39,194`: `update` prints changelog notes between the recorded `packageVersion` and the running one. The config move should get a changelog entry so upgraders see it.
- `context/changes/vercel-skills-research/frame.md:33`: rates multi-tool coverage as weak with ".agents/ only". Partial: `.agents/skills` already reaches Codex, Copilot, OpenCode and Gemini, and Claude Code is the gap.
- `context/changes/vercel-skills-support/change.md:24`: places the lesson file "in the repo root". Contradicted: it is at `context/changes/vercel-skills-research/`.
- The lesson's Cursor profile (`shared-ai-registry-…md:356-360`, `.cursor/skills`) differs from Vercel's `.agents/skills`. Unresolved.

## Related Research

- `context/changes/vercel-skills-research/research.md`: source-level comparison with Vercel `skills` v1.7.4
- `context/changes/vercel-skills-support/change.md`: deferred list. This change covers its item 1 (multi-agent targets); items 2-7 stay deferred unless the plan pulls them in.

## Follow-up 1 (2026-10-30): decisions and their impact

The user decided three of the open questions on 2026-10-30. This follow-up records those decisions and what they mean in the code. Findings 1-7 above still stand, except where noted below.

### Decisions

| # | Decision | Resolves |
|---|---|---|
| D1 | There are exactly two targets: `claude` (`.claude/skills`) and `agents` (`.agents/skills`). There is **no custom target** and no custom paths. | Open Q2 and Q5. Finding 6 is no longer needed. |
| D2 | The Claude rules block goes into `CLAUDE.md` when that file exists. Otherwise it goes into `AGENTS.md`. When neither file exists, the installer creates only `AGENTS.md`, never `CLAUDE.md`. | Open Q4. This replaces both options in finding 5. |
| D3 | One install can target several destinations at once (`claude` and `agents` together). | Extends finding 4, which moves from a design risk to a requirement. |

### What D2 means

- **Where the block goes.** Placing the block in `AGENTS.md` when there is no `CLAUDE.md` matches Claude Code's documented loading rule: it reads `AGENTS.md` when there is no `CLAUDE.md`/`CLAUDE.local.md` (`code.claude.com/docs/en/memory.md`, "AGENTS.md" table). So under D2 the block is visible to Claude when it is written.
  - The rule as decided checks only for `CLAUDE.md`. Claude Code also skips `AGENTS.md` when only a `CLAUDE.local.md` exists (same table). The plan should decide whether to check for `CLAUDE.local.md` too.
- **Both targets can share one file.** With D3 and no `CLAUDE.md`, both targets resolve to `AGENTS.md`. The installer must write **one** block there, not one per target. `findBlock` throws on a repeated marker (`src/agents-md.js:29-34`). So rules files have to be deduplicated by path before `applyBlock` runs.
- **Several files need tracking.** With `CLAUDE.md` present and both targets selected, two files get a block: `CLAUDE.md` (for Claude) and `AGENTS.md` (for agents). The config therefore needs a rules-state entry per file. Today there is a single `installed.agentsMd` (`src/config.js:54-57`, `src/lifecycle.js:15,24-31`).
  - The `createdFile` flag stays meaningful per file. Under D2 only `AGENTS.md` can ever have `createdFile: true`, because the installer never creates `CLAUDE.md`.
- **The resolved file can change between runs.** D2 is decided at run time. If the user adds a `CLAUDE.md` after the install, the next `update` resolves Claude's block to `CLAUDE.md`, while the recorded block sits in `AGENTS.md`. Today's code handles one file only and cannot move a block. The plan needs a rule for this case, for example:
  - remove the block from the recorded file and write it to the newly resolved one;
  - or keep the recorded file until the next `add`.

  The installer may only edit text between its markers, so moving the block is allowed under the hard rules.
- **What the block lists.** The index line embeds one skills path (`src/agents-md.js:17`). When one `AGENTS.md` block serves both targets, the plan must choose:
  - list the `.agents/skills/...` path, which every reader of `AGENTS.md` can use;
  - or list both paths.

  Claude does not need the path to load the skill. It discovers `.claude/skills/` by itself (`code.claude.com/docs/en/skills.md`, location table).
- **Opt-in stays as it is.** The block is still opt-in through `--agents-md` (`src/args.js:72-75`; `opts.agentsMd ?? prev?.agentsMd ?? false` at `src/commands/add.js:50`). Nothing in D2 changes that. The flag name now also covers `CLAUDE.md`, which is a naming and docs question for the plan, not a behaviour change.

### What D3 means

- **Copies, not links.** The `claude` target gets plain copies, so each selected target adds its own file entries to the manifest. No new manifest entry type is needed (finding 7). Symlinks stay deferred.
- **The collision check must be per target.** It has to key on `<targetDir>/<name>`, not on the name alone (finding 4, `src/sync.js:67-70`). With both targets selected, the name-only check is the gap described there. It is no longer hypothetical.
- **Removing a target is the existing sync path.** Dropping a target from the selection leaves its tracked paths out of the desired set. `syncSkills` then deletes the ones that are still unmodified (`src/sync.js:114-131`).
  - Empty-dir pruning must cover every target root (finding 3, `src/sync.js:26-40`).
  - The full `remove` must prune `.claude/skills` the same way it prunes `.agents/`. It must not delete `.claude/` itself while that folder holds anything else, for example consumer `settings.json` or `CLAUDE.md`.
- **Targets are saved like skills.** They become part of the saved intent (e.g. `targets: ["agents", "claude"]`), so `update`/`check` re-run from them (`src/commands/update.js:11-28`). How `add`/`remove` combine target flags with saved targets is a CLI design choice. The existing `add` is additive over saved skills and tags (`src/commands/add.js:40-41`), so an additive `--target` would follow the same pattern.
- **Existing installs keep their behaviour.** A v1 config upgrades to `targets: ["agents"]`. The first `update` then changes no skill files and only moves the config (Architecture Insights).

## Follow-up 2 (2026-10-30): CLI shape modeled on Vercel

**Decision D4 (user, 2026-10-30).** The CLI shape follows Vercel's `skills` CLI. It must also support selecting several agents in one command, in case Vercel did not.

Vercel's CLI and source were fetched at the same commit `92a9a34`, but not run. The files were `src/cli.ts`, `src/add.ts` and `src/remove.ts`, copied into the session scratchpad; they are not committed.

### What Vercel does (observed in source)

- **Multiple agents are already supported.** `-a, --agent <agents>` takes one or more space-separated values (`cli.ts:183`). Its example is `skills add vercel-labs/agent-skills --agent claude-code cursor` (`cli.ts:112`). The parser collects every following argument that does not start with `-` (`add.ts:2869-2877`, the same loop at `remove.ts:437-445`). Repeating `-a` appends to the same list (`options.agent = options.agent || []`).
  - So the "if they don't" branch of D4 does not apply. Matching Vercel already gives multi-agent selection.
- **`'*'` selects every agent** (`add.ts:816-819`, `cli.ts:183`). `--all` is shorthand for `--skill '*' --agent '*' -y` (`add.ts:1766-1769`, `cli.ts:190`).
- **Unknown agent names are rejected.** The error lists the valid agents and exits 1 (`add.ts:820-827`).
- **Agent ids.** Claude Code is `claude-code` (`agents.ts:155-156`). The `.agents/skills` directory has its own id, `universal` (`agents.ts:819-826`). `universal` is never detected (`detectInstalled: async () => false`) and is hidden from the universal list.
  - Codex, Copilot, OpenCode, Gemini and Cursor are separate ids, but they all map to `.agents/skills` (finding 1).
- **`add` without `-a`:**
  - Vercel detects installed agents from the home dir (finding 1). With one detected agent, or with `-y`, it installs to the detected agents plus every universal agent (`add.ts:860-869`, `ensureUniversalAgents` at `add.ts:366-374`).
  - With none detected, `-y` installs to all agents (`add.ts:836-839`). Otherwise it prompts, preselecting the last selection saved globally (`add.ts:489,522`).
- **`remove` without `-a`** targets every known agent, so that leftover links get cleaned up (`remove.ts:219-226`). `-a` narrows the removal to the named agents (`cli.ts:201`).
- **Skill flag shape.** It is `-s, --skill <skills>`, space-separated in the same way (`cli.ts:184`).

### Our current flags compared

| Aspect | Vercel | Ours today |
|---|---|---|
| Agent flag | `-a, --agent a b`, repeatable, `'*'` | none |
| Skill flag | `-s, --skill a b` (space-separated) | `--skill a,b` (comma-separated, repeatable) (`src/args.js:5-10,60-63`) |
| Short flags | `-a`, `-s`, `-y`, `-g`, `-l` | only `-h`, `-v` (`src/args.js:38-45`) |
| Value parsing | takes values until the next `-…` | exactly one value per flag (`takeValue`, `src/args.js:29-34`) |

### What D4 means for this change

- **Flag shape (corrected 2026-10-30, after user review).** No new parser is needed.
  - `--agent` can use the same pattern as `--skill`/`--tag`: `takeValue` plus `splitList`, comma-separated and repeatable (`src/args.js:5-10,29-34,60-66`). For example `--agent claude-code,universal`, or `--agent claude-code --agent universal`. That already selects several agents, which is what D4 asks for, and it matches our documented comma-list convention.
  - The earlier suggestion to also take space-separated values, as Vercel does, is withdrawn. It would add a second list syntax to the parser only for one flag.
  - **Trade-off.** A Vercel-style `-a claude-code cursor` would fail in our parser with `unexpected argument "cursor"` (exit 2), because a bare word after the value is read as a second command (`src/args.js:46-50`). It fails loudly and does nothing, so it is safe. Adding a `-a` short alias needs one more `if` beside the existing `-h`/`-v` handling (`src/args.js:38-45`).
- **Agent ids.**
  - `claude-code` matches Vercel. Accepting `claude` as an alias is a choice for the plan.
  - Vercel names the `.agents/skills` destination `universal`; the user's notes call it `agents`. Picking `universal` matches Vercel. Optionally, Vercel's universal agent ids (`codex`, `github-copilot`, …) could be accepted as aliases that resolve to the same destination. Since D1 limits us to two destinations, every alias must resolve to one of them.
- **`remove` without `--agent`.** Removing from all saved agents mirrors Vercel's "omit to clean all" (`cli.ts:201`). Our full `remove` already removes every manifest file, so this matches our behaviour without changes.
- **Defaults.** Vercel's home-dir detection still does not fit a project-scoped tool (finding 1; open Q3). Vercel always adds universal agents when it auto-selects (`add.ts:366-374`). That supports `universal` being included by default on a fresh `add`.
- **Not part of D4.** Two Vercel flags are not implied by matching its `--agent` shape: `-g` (global) and symlink by default with `--copy` to opt out (`cli.ts:181,187`). Symlinks and global scope stay deferred (finding 7; `context/changes/vercel-skills-support/change.md`, items 2 and 5).

**Decision D5 (user, 2026-10-30).** The agent ids are `claude-code` (`.claude/skills`) and `universal` (`.agents/skills`), matching Vercel (`agents.ts:155-158,819-822`). The names `claude`/`agents` used in D1 and follow-up 1 refer to these same two destinations.

- No `claude` alias is implied, since Vercel has none.
- Accepting Vercel's other `.agents/skills` ids (`codex`, `github-copilot`, …) as aliases of `universal` is still optional (open Q11).
- With these ids, `--agent '*'` selects both destinations.

## Open Questions

Status after follow-up 1:

1. **Root config filename.** Still open. Keep `.pa-skills-config.json` at the root, or rename it (e.g. `skills.config.json`)?
2. ~~Which three profiles.~~ **Resolved (D1):** two targets, `claude` and `agents`.
3. **Default target on a fresh `add`.** Still open. The options are `agents` only (today), `claude` + `agents`, or auto-detect from project markers (`.claude/`, `CLAUDE.md`).
4. ~~Claude rules file.~~ **Resolved (D2):** a block in `CLAUDE.md` if it exists, otherwise in `AGENTS.md`. Only `AGENTS.md` is ever created.
5. ~~Custom flags.~~ **Resolved (D1):** there is no custom target.
6. **Old CLI after migration.** Still open. Is a changelog note enough?
7. **Cursor.** Deprioritized. It matters only for whether `agents` covers Cursor, and the design no longer has per-tool profiles beyond `claude`/`agents`.
8. **New (from D2): `CLAUDE.local.md`.** In a repo with only a `CLAUDE.local.md`, Claude skips `AGENTS.md`, and D2 never creates `CLAUDE.md`. Should the installer accept the block being invisible to Claude there, or treat `CLAUDE.local.md` as a target file? It is usually git-ignored and personal.
9. **New (from D2): the resolved file changes.** If the user adds `CLAUDE.md` later, should `update` move the block?
10. **New (from D2+D3): the shared `AGENTS.md` block.** When it serves both targets, which paths does it list?
11. ~~CLI shape.~~ **Resolved (D4):** `-a, --agent` as in Vercel (multi-value, repeatable, `'*'`). Still open:
    - ~~the agent ids~~ **resolved (D5):** `claude-code` and `universal`. Still open: whether Vercel's universal ids (`codex`, `github-copilot`, …) are accepted as aliases of `universal`;
    - whether a `-a` (and `-s`) short alias is added; values stay comma-separated, as in all our flags;
    - whether `add --agent` is additive over the saved agents, like skills.
