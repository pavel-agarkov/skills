---
date: 2026-10-29T21:42:47+01:00
researcher: pavel-agarkov
git_commit: 4102620e0cf31d1c1f973105ee22c4619136b60a
branch: main
repository: pavel-agarkov/skills
topic: "What Vercel's `skills` CLI does on disk vs the ai-skills-distribution-package plan"
tags: [research, vercel-skills, skills-cli, distribution, installer]
status: partial
last_updated: 2026-10-29
last_updated_by: pavel-agarkov
---

# Research: Vercel `skills` CLI vs our planned `@pavel-agarkov/skills`

**Date**: 2026-10-29T21:42:47+01:00
**Researcher**: pavel-agarkov
**Git Commit**: 4102620e0cf31d1c1f973105ee22c4619136b60a
**Branch**: main
**Repository**: pavel-agarkov/skills

## Research Question

Follow-up to `frame.md`: verify, from the Vercel source rather than its docs, what `skills add/remove/update` do to files, what they record, how skills are discovered, and which of the plan's hard rules (tags, AGENTS.md block, manifest-exact uninstall, collision refusal, zero dependencies) the CLI covers. Plan under comparison: `context/changes/ai-skills-distribution-package/plan.md`.

All Vercel references below are to vercel-labs/skills at commit `92a9a34` (v1.7.4, committed 2026-10-29), read from a shallow clone in the session scratchpad. Nothing from that repo was executed.

## Summary

- **Overwrite and removal are directory-level, not manifest-exact.** In the inspected `add` path, an existing target skill directory is deleted and recreated, and `remove` recursively deletes the agent skill paths and the canonical `.agents/skills/<name>` directory. Consumer files inside those directories are lost (`src/installer.ts:198-205`, `src/remove.ts:257-320`; both checked directly). This conflicts with the repo hard rules in `CLAUDE.md` ("never overwrite what the consumer wrote", "uninstall removes exactly what install added").
- **Neither lock file lists files.** The global and project locks record source, ref, path and a folder hash, not per-file lists (`src/skill-lock.ts:13-40`, `src/local-lock.ts:194-233`).
- **No `--force` on `add`, no collision refusal.** `--force` exists only for `experimental_install` (`src/install.ts:29`, `:62`).
- **No tags, no `configure`, no AGENTS.md feature.** Selection is by name only (`src/skills.ts:357`). Unknown frontmatter keys such as `tags` are ignored, not rejected (`src/skills.ts` `parseSkillMd`). No inspected code writes an AGENTS.md or CLAUDE.md block.
- **`update` is per-skill from the lock, not from a saved selection.** It re-runs the same destructive reinstall as `add` (`src/update.ts:827-845`, `:1039-1047`).
- **Our layout needs one extra file to be discoverable.** `catalog/<name>/SKILL.md` is found only through a fallback scan unless `skills.sh.json` declares `{"paths":["./catalog/"]}` (`src/skills.ts:268-345`, `src/skills-sh-config.ts:8-30`).
- **The overlap is real on basics**: name selection, copy/symlink, `.agents/skills` target, non-interactive flags, a Windows CI matrix, provenance publishing.
- **Course acceptance of a delegating wrapper is still unverified** (see Open Questions).

## Detailed Findings

### `add`: what happens to an existing skill directory

- `cleanAndCreateDirectory` runs `rm(path, {recursive: true, force: true})` then `mkdir` (`src/installer.ts:198-205`). It is called for copy mode, for the canonical directory in symlink mode, and for the copy fallback after a failed symlink (worker report: `:373`, `:404`, `:447`; not individually re-read).
- In `createSymlink`, an existing non-symlink agent directory is also removed before linking (worker report, `src/installer.ts:267-269`; not re-read).
- The only guard found is a source-overlap check: if the source path overlaps the target, the install is skipped (worker report, `src/installer.ts:362-369`, `:383-392`; asserted in `tests/installer-symlink.test.ts:60`).
- The summary prints an "overwrites:" label, informational, not a prompt (worker report, `src/add.ts:956-990`).
- Open upstream issues describe the same behavior: #1906 (no conflict prompt), #1802 (same-name skills overwrite), #1723 (directory overwrite on collision), #897 and #606 (collision protection), #455 (request for a preserve-local mode on update). All were open when listed; comments and fixes were not read.

### `remove`

- For each selected skill and target agent, `remove` runs recursive `rm` on the install path and on the agent-native path, then on the canonical `.agents/skills/<name>` unless another installed agent still has that skill (`src/remove.ts:257-320`, read directly).
- By default every known agent is targeted (worker report, `src/remove.ts:223-227`).
- The lock entry is dropped only when the canonical directory was removed (worker report, `src/remove.ts:328-343`). Issue #2469 (open) reports that a `remove` without `-g` in the home directory deletes global installs without cleaning the global lock.

### Lock files and `update`

- **Global lock** `~/.agents/.skill-lock.json`, version 3: `source`, `sourceType`, `sourceUrl`, `ref`, `skillPath`, `skillFolderHash`, timestamps. Older lock versions are silently wiped, and a parse error is treated as an empty lock (worker report, `src/skill-lock.ts:13-40`, `:96-104`).
- **Project lock** `skills-lock.json`, version 1, committed to version control, with `computedHash` (SHA-256 of sorted relative paths plus bytes) and no timestamps (worker report, `src/local-lock.ts:5-66`, `:194-233`). Project-scope `add` writes it, except for direct-download installs (worker report, `src/add.ts:2554-2586`).
- `update` rebuilds a source argument per skill from the lock entry and reinstalls that skill when its hash differs or it is missing on disk; entries without `skillPath` are skipped with a manual `add` hint (worker report, `src/update.ts:641-650`, `:827-845`, `:1026-1047`). It does not store or re-expand a name-plus-tag selection.
- Update tracking via tree SHA is GitHub-backed (`AGENTS.md:79-88` of the Vercel repo, per worker report). Open issues #162 and #1441 report update failures for private GitHub repos.

### Discovery, tags and frontmatter

- Search order: repo root, `skills/`, `skills/.curated|.experimental|.system`, then about 30 agent project directories including `.agents/skills`, `.claude/skills` (`src/skills.ts:268-274`, `:13-43`). Containers from `skills.sh.json` `paths` are added (`src/skills.ts:277-278`).
- Recursive fallback (max depth 5) runs only when nothing was found, or with `--full-depth` (`src/skills.ts:329-345`). A SKILL.md at the repo root short-circuits discovery (`src/skills.ts:250-262`).
- **For our repo today**: `interview-trainer/` and `aspnet-layered-service-scaffold/` sit at the repo root, which is reachable at depth 1 by the root pass (worker report, `src/skills.ts:325`). After the plan's move to `catalog/`, discovery works through the fallback only while no skill exists in a standard location. Adding `skills.sh.json` makes it explicit.
- `parseSkillMd` requires string `name` and `description`; other keys are ignored, `rawContent` is preserved. Only `metadata.internal === true` changes behavior (hidden unless `INSTALL_INTERNAL_SKILLS=1`).
- Tag requests exist upstream and are open: #1109 (`--tag` in `find`), #505, #1933; #2528 reports a two-level catalog layout silently drops skills.

### AGENTS.md and instruction files

- Grep of src, docs, README, `skills/` and the root `AGENTS.md` found no code that writes or edits an AGENTS.md or CLAUDE.md block. The root `AGENTS.md` is the project's own contributor guide; the `<!-- ...:start -->` markers in it are doc-generation markers (`AGENTS.md:179`).
- Issue #776 (open) requests `skills add --instructions`.

### npm-package route: `experimental_sync`

- The consumer's `package.json` must list the package as a dependency, and it must resolve in `node_modules` (`src/sync.ts:272-333`, `:174`). Discovery inside the package reads a root `SKILL.md`, `skills/<name>/SKILL.md` or `dist/skills/<name>/SKILL.md`, one level only (`src/sync.ts:133-168`). A `catalog/` folder is not searched.
- Sync links into `.agents/skills/` (symlink, or copy with `--copy`) and writes `skills-lock.json` with `sourceType: 'node_modules'`. It never replaces a directory it did not create, and prunes only what it owns (`src/sync.ts:385-500`, `docs/commands.md:319-330`). This is the only inspected path with collision protection, and it is marked experimental.
- `experimental_install` restores the lock; it does not install npm packages (`docs/commands.md:357-370`). In CI, sync defaults to a frozen lockfile.
- Private npm registries are not a supported source; upstream request #1176 is open.

### Private and non-GitHub sources (carried from the frame, plus issues)

- Auth uses existing git/gh/SSH credentials (`docs/commands.md`, `src/git.ts`). Open issues: #12, #162, #1441 (private GitHub), #306, #345 (SSH), #474 (private self-hosted GitLab). Not relevant to a public audience.
- Telemetry is on by default and disabled by `DISABLE_TELEMETRY` or `DO_NOT_TRACK` (README, `src/telemetry.ts`).

### CI, tests, release

- CI matrix: ubuntu-latest and windows-latest by Node 22.20.0, 24, 26, running `pnpm build` and `pnpm test` (`.github/workflows/ci.yml:14-19`, `:44-45`, per worker report).
- Release: manual `workflow_dispatch`, `npm publish --provenance --access public` (`.github/workflows/publish.yml:73`, per worker report).
- Runtime dependencies: `tar` and `yaml`; Node >=22.20.0; bins `skills` and `add-skill` (`package.json`).
- Tests found: installer copy/symlink, remove-canonical, local-lock, update, sync, sanitize, traversal. **No test found** that consumer-authored files inside a skill directory survive install, remove or update. No manifest or sentinel-marker concept exists.
- Windows: symlinks use a `junction` with an absolute target and fall back to copy (`src/installer.ts:290-293`, `:443-457`, per worker report). Open Windows issues: #2613 (filename too long), #1119, #941, #840 (update failures), #1010.

## Code References

- `src/installer.ts:198-205` (Vercel) - `cleanAndCreateDirectory`, recursive delete before write (read directly)
- `src/remove.ts:257-320` (Vercel) - recursive delete of agent and canonical paths (read directly)
- `src/skills.ts:268-345` (Vercel) - discovery order, depth limits, fallback
- `src/sync.ts:133-168`, `:385-500` (Vercel) - npm-package discovery and foreign-directory protection
- `src/local-lock.ts:194-233` (Vercel) - project lock `computedHash`
- `context/changes/ai-skills-distribution-package/plan.md:159-167`, `:208-230` - our manifest-tracked sync and uninstall
- `CLAUDE.md` - hard rules on consumer files and uninstall

## Architecture Insights

- The two tools make opposite state choices. Vercel tracks **source plus folder hash** and treats a skill directory as wholly owned. Our plan tracks **a per-file manifest** and treats a skill directory as shared with the consumer. That difference, not feature count, is where the plan's hard rules and Vercel's behavior diverge.
- Vercel's one safer path (`experimental_sync`) uses the same ownership idea as our manifest (never replace what it did not create), but only for npm-dependency discovery and with fixed folder names.
- Plain `SKILL.md` folders remain the shared format, so the same repo content can be consumed by both tools.

## Historical Context (from prior changes)

- `context/changes/ai-skills-distribution-package/plan.md` - the plan under comparison (status `planned`). It already rules out `.claude/`, `postinstall` and GitHub Packages (plan lines 33-37), and deliberately chose a public npm package (plan line 29).
- `context/changes/vercel-skills-research/frame.md` - framing and the MEDIUM-confidence reframe; this document supplies the source-level verification the frame listed as missing for `remove` and the lock.
- No archived changes exist (`context/archive/` holds only `README.md`).

## Related Research

- None under `context/changes/**/research.md` or `context/archive/**/research.md`.

## Open Questions

- **Course acceptance** of a project that delegates installation to a third-party CLI is not verifiable from the repository; the lesson text neither allows nor forbids it, and no rubric was found (carried from `frame.md`).
- Behavior was read, not run. No `add`, `remove` or `update` was executed against a scratch project, so the deletion behavior rests on code reading plus two directly read functions.
- The full interactive `add` flow (`src/add.ts` prompts, `installFetched`) was not read; the worker saw nothing there that would change overwrite behavior but did not confirm it.
- Issue comments and fixes were not read; "open" states come from keyword searches and may have newer activity.
- `src/plugin-manifest.ts` was only skimmed; plugin manifests add discovery paths at depth 1 only (worker report).
- `experimental_sync` is experimental and its stability across versions is unknown.
