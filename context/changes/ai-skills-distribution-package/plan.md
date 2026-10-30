# AI Skills Distribution Package Implementation Plan

## Overview

Publish `@pavel-agarkov/skills`, a public npm package (zero runtime dependencies, Node >=22) that bundles every tracked skill and installs a chosen subset into a consumer project's `.agents/skills/`. Skills are selected by name or by tag, the selection is persisted in `.agents/.pa-skills-config.json`, and `update`, `configure`, `uninstall` and `check` all operate on that saved selection. An `AGENTS.md` skills index is available, but only when the user opts in.

Phase 5 renames the commands to `add` / `remove` (mirror images, both accepting `--skill`/`--tag`/`--agents-md`) and drops `configure` and `--no-agents-md`; Phases 3-4 are written and committed with the original `install` / `configure` / `uninstall` names, and the sections below keep those names until Phase 5 supersedes them.

This revision (from `vercel-skills-research`) changes three things. The skills live in `dist/skills/<name>/` plus a `skills.sh.json`, so the same folders also install with Vercel's `skills` CLI. The installer adopts the Vercel behaviors that are better than what we had: per-file content hashes, a deterministic committable config, a `check` command and `--dry-run`. A final phase creates the follow-up change for full Vercel support.

## Current State Analysis

- Only two skills are tracked in git: `interview-trainer/` and `aspnet-layered-service-scaffold/`, each at the repo root with a `SKILL.md`. Frontmatter carries `name`, `description` and sometimes `argument-hint`; there is no `tags` key.
- `.claude/` is gitignored (`.gitignore` contains only `.claude/`), so the ~37 `10x-*` / `pack-init` / `setup-cicd` / `tf-registry` skills there are course material and are not tracked or shipped.
- No `package.json`, `AGENTS.md`, `.agents/`, `skills.sh.json` or CI workflow exists. The root `README.md` lists only `interview-trainer`.
- Prior art for a manifest-tracked installer with BEGIN/END sentinel markers exists in `.claude/config-templates/m5l4-github-packages-install.js.template` and its uninstall twin. We reuse the manifest and sentinel logic, not the paths or the `postinstall` trigger.
- The repo `CLAUDE.md` hard rules apply: never overwrite what the consumer wrote, uninstall removes exactly what install added (via manifest), publish only a new version, and keep tokens in CI secrets.
- The origin request fixed one constraint: the skills folder cannot be called `skills`, because that is the repo name (`change.md` of this change).

## Desired End State

From any project, `npx @pavel-agarkov/skills install --skill interview-trainer` or `install --tag dotnet,backend` copies the selected skills into `.agents/skills/<name>/` and writes `.agents/.pa-skills-config.json`. Then:

- `update` re-resolves the saved names and tags against the newer package and syncs the files.
- `configure` changes the subset or options.
- `uninstall` removes exactly the recorded, unmodified files and the `AGENTS.md` block, and nothing else.
- `check` reports pending changes without writing, and exits 3 when there are any.
- Every mutating command accepts `--dry-run`.
- `npx skills add pavel-agarkov/skills --list` (Vercel's CLI) lists the same skills from the git repo.

Verify by running the CLI in a temp project through the full lifecycle, with consumer-authored and consumer-modified files present, and checking they are untouched.

### Key Discoveries:

- Vercel's CLI deletes and recreates an existing skill directory on `add` (`src/installer.ts:198-205`) and recursively deletes on `remove` (`src/remove.ts:257-320`); neither records per-file lists. That is the gap our manifest fills (`research.md`, Detailed Findings).
- Vercel finds skills in the repo root, `skills/`, ~30 agent directories and any container declared in `skills.sh.json` `paths` (`src/skills.ts:268-345`, `src/skills-sh-config.ts:8-30`). Its npm route, `experimental_sync`, reads a package's root `SKILL.md`, `skills/<name>/` or `dist/skills/<name>/` (`src/sync.ts:147`). So `dist/skills/` plus `skills.sh.json` is readable by both routes with no build step.
- Vercel's parser requires string `name` and `description` and ignores other keys, so our `tags:` frontmatter is safe (`src/skills.ts` `parseSkillMd`). A root-level `SKILL.md` would short-circuit its discovery (`src/skills.ts:250-262`), so the repo must not have one.
- Vercel's project lock is sorted, timestamp-free and content-hashed (`src/local-lock.ts:15-66`, `:194-233`). We adopt the same properties for our config, with hashes per file.
- `.gitignore` ignores only `.claude/`, so a tracked `dist/` needs no ignore change.
- GitHub Packages would force a token on every consumer, which breaks plain `npx`; npmjs.com avoids that, so publishing goes to npmjs.com from GitHub Actions.

### Vercel `skills` CLI comparison (decision record)

| Area | Vercel CLI (v1.7.4) | Our CLI | Decision in this plan |
| --- | --- | --- | --- |
| Tag selection, `configure`, saved selection | None | Yes | Ours stays; this is why we build it |
| Consumer files inside a skill dir | Deleted on `add`/`update`/`remove` | Preserved via per-file manifest | Ours stays (repo hard rule) |
| AGENTS.md index block | None | Opt-in sentinel block | Ours stays |
| Runtime dependencies | `tar`, `yaml` | None | Ours stays |
| Content hash of installed skills | Folder SHA-256 in lock | None in the old plan | **Adopt**: per-file SHA-256 in the manifest |
| Committable, deterministic lock | Sorted, no timestamps | Not specified | **Adopt**: config written sorted, no timestamps |
| CI update gate | `check` exits 1 when an update exists | None | **Adopt**: `check`, exit 3 on pending changes |
| Preview without writing | `--dry-run` (sync) | None | **Adopt**: `--dry-run` on all mutating commands |
| Windows and Linux CI matrix, provenance publish | Yes | Planned | Keep as planned |
| Multi-agent targets (75+), symlink to canonical copy | Yes | `.agents/` only (v1 instruction) | **Defer** to follow-up change |
| Global scope `-g`, any-repo sources, `find` | Yes | No | **Defer** / not planned |
| Private repo sources | Via git credentials | n/a (public audience) | Not needed |
| Telemetry | On by default (`DISABLE_TELEMETRY=1` to stop) | None | Document in README |

## What We're NOT Doing

- No `.claude/`, `.cursor/`, `CLAUDE.md` or other target layouts, and no `--target` flag; v1 is `.agents/` and `AGENTS.md` only. Multi-agent targets move to the follow-up change (Phase 8).
- No symlinks, no global scope, no installs from arbitrary repos, no `find`; those belong to Vercel's CLI.
- No wrapping or shelling out to Vercel's CLI; our CLI stays a standalone installer.
- No `prepack` copy step and no second copy of the skills in the tarball.
- No writing of Vercel's `skills-lock.json`.
- No distribution of the gitignored `.claude/skills` course skills.
- No `postinstall` hook; installation is always an explicit CLI command.
- No GitHub Packages publish, and no tokens or `.npmrc` committed.
- No uninstall-by-skill/tag flags; uninstall removes the whole saved selection (use `configure` to shrink it).
- No runtime dependencies, no TypeScript build.

## Implementation Approach

Keep skills as plain folders under `dist/skills/`, declared to Vercel through a root `skills.sh.json`. The folder is source of truth despite the name `dist`; the README says so. The CLI is plain Node ESM built on `node:` built-ins, with small modules: catalog loader, selection resolver, file/manifest operations, AGENTS.md block, config store, command handlers. The selection is stored as intent (`skills`, `tags`, `agentsMd`) plus the manifest of installed files with hashes (`installed.skills`, `installed.files`), so `update` can re-expand tags and diff against the manifest.

Decisions fixed during planning:

- `install` is additive: it unions the flags with any existing selection. `configure` replaces the selection and options. Both then sync files to the resolved set.
- A skill folder that exists in `.agents/skills/` but is not in our manifest is a collision: refuse and name the folder, unless `--force`.
- A manifest file whose on-disk SHA-256 differs from the recorded one is **consumer-modified**. `update` skips it with a warning, drops it from the manifest and never touches it again; `--force` overwrites it and records the new hash. `uninstall` leaves it in place and reports it. A manifest file missing on disk is recreated by `update`.
- The config is written with sorted keys, sorted file lists, 2-space indentation, a trailing newline and no timestamps, so rewriting an unchanged selection produces identical bytes and the file can be committed.
- `check` never writes. It exits 0 when nothing is pending, 3 when `update` would add, remove or change anything (or modified files exist), 1 on a handled error and 2 on a usage error. No config means exit 1 with "nothing installed".
- `--dry-run` on `install`, `update`, `configure` and `uninstall` prints the planned additions, removals and skips and writes nothing.
- `AGENTS.md` index is off by default. Enable with `--agents-md` (stored as `agentsMd: true`), disable with `--no-agents-md`. When enabled it is rewritten on every sync; when switched off, the block is removed.
- An unpaired marker in `AGENTS.md` aborts that file's change with an actionable error and leaves it untouched.
- Manual deletion never breaks the CLI. A tracked file, a skill folder or `AGENTS.md` that the consumer deleted by hand is a warning, not an error, and the command continues. `install` and `update` recreate still-wanted files (`warning: <path> was missing; restored`) and recreate `AGENTS.md` when the index is on. When the missing item is no longer wanted (removed from the selection, index turned off, or `uninstall`), the command only drops it from the config and warns. `uninstall` removes whatever of the saved selection is still present, tolerates what is already gone, and exits 0. Consumer-modified files are still left in place (repo hard rule).
- With no selection flags on an interactive terminal, `install` and `configure` show a numbered picker (readline); with no TTY they exit with a usage error.
- Unknown skill or tag names fail the command before any file is written, listing the valid names.

## Phase 1: Skills layout and tags

### Overview

Move the tracked skills into `dist/skills/`, give each skill tags, declare the folder to Vercel, and add a loader that is the single source of truth for what the package contains.

### Changes Required:

#### 1. Move skills into `dist/skills/`

**File**: `dist/skills/interview-trainer/`, `dist/skills/aspnet-layered-service-scaffold/` (moved with `git mv` from the repo root)

**Intent**: A dedicated folder that is not called `skills`, readable by Vercel's npm route as `dist/skills/<name>/`; keeps history and leaves the repo root for the package and docs.

**Contract**: Each `dist/skills/<name>/SKILL.md` has a frontmatter `name` equal to its folder name and a string `description`. The repo root has no `SKILL.md` and no `skills/` folder. The root `README.md` table links update to the new paths.

#### 2. Add tags to skill frontmatter

**File**: `dist/skills/*/SKILL.md`

**Intent**: Each skill declares its tags so users can install by tag.

**Contract**: Frontmatter gains `tags: [a, b]` (inline YAML list, lowercase kebab-case). `interview-trainer` is tagged e.g. `learning`, `interview`; `aspnet-layered-service-scaffold` e.g. `dotnet`, `backend`, `scaffold`.

#### 3. Declare the folder to Vercel's CLI

**File**: `skills.sh.json`

**Intent**: Make `npx skills add pavel-agarkov/skills` find the skills by a declared path instead of its fallback scan.

**Contract**: `{"paths": ["./dist/skills/"]}`. Entries must start with `./` and use forward slashes (`src/skills-sh-config.ts:8-30`). The file lives at the repo root and is not part of the npm tarball.

#### 4. Catalog loader

**File**: `src/catalog.js`

**Intent**: Read `dist/skills/*/SKILL.md`, parse the minimal frontmatter (`name`, `description`, `tags`, handling the `>` folded scalar used by `aspnet-layered-service-scaffold`), and expose lookups.

**Contract**: `loadCatalog(root)` returns `{ skills: Map<name, {name, description, tags, dir, files}>, tags: Map<tag, name[]> }`. Throws on a missing `name`/`tags`, a name that differs from its folder, or an invalid tag format.

### Success Criteria:

#### Automated Verification:

- Catalog loader unit tests pass: `node --test test/catalog.test.js`
- `dist/skills/` contains exactly the two skills, and no folder named `skills` and no `SKILL.md` exists at the repo root and `.gitignore` has no `dist` entry (asserted in the same test file)
- Vercel compatibility test passes: `skills.sh.json` lists `./dist/skills/`, that folder exists, and every `SKILL.md` has string `name` and `description` frontmatter: `node --test test/vercel-compat.test.js`

#### Manual Verification:

- `git log --follow dist/skills/interview-trainer/SKILL.md` still shows prior history
- Each skill's tags read sensibly

---

## Phase 2: Package scaffold and CLI entry

### Overview

Make the repo a publishable npm package with a working command dispatcher and flag parser.

### Changes Required:

#### 1. package.json

**File**: `package.json`

**Intent**: Public scoped package exposing the CLI and shipping the skills in the layout Vercel's npm route reads.

**Contract**: `name: @pavel-agarkov/skills`, `version: 0.1.0`, `type: module`, `bin: { "skills": "bin/cli.js" }` (so `npx @pavel-agarkov/skills <cmd>` works), `files: ["bin/","src/","dist/skills/","README.md"]`, `engines.node: ">=22"`, `publishConfig: { access: "public", provenance: true }`, `repository`, `license`, `scripts.test: node --test`, and no `postinstall`.

#### 2. Entry and parser

**File**: `bin/cli.js`, `src/args.js`

**Intent**: Dispatch `install | update | configure | uninstall | check | list | help`, parse `--skill a,b` (repeatable and comma-separated), `--tag x,y`, `--agents-md` / `--no-agents-md`, `--force`, `--dry-run`, `--cwd <dir>`, `--help`, `--version`.

**Contract**: Exit code 0 on success, 1 on a handled error with a one-line message, 2 on usage errors, 3 only from `check` when changes are pending. `--cwd` sets the project root (default `process.cwd()`), which also makes tests hermetic. `list` prints skills with tags, and `list --tag x` filters.

### Success Criteria:

#### Automated Verification:

- Parser tests pass: `node --test test/args.test.js`
- `node bin/cli.js --help` and `node bin/cli.js list` exit 0
- Pack contents are exactly the intended files: `npm pack --dry-run`

#### Manual Verification:

- `--help` text is clear enough to copy examples from

---

## Phase 3: Install, config and AGENTS.md block

### Overview

The core: resolve a selection, copy files, persist a deterministic config and a hashed manifest, and optionally maintain the `AGENTS.md` index.

### Changes Required:

#### 1. Selection resolver

**File**: `src/resolve.js`

**Intent**: Turn `{skills, tags}` into the final ordered, deduplicated skill-name list.

**Contract**: Tag selection expands to every skill carrying the tag; names and tags union. Unknown names/tags throw an error listing valid values before any write.

#### 2. Config store

**File**: `src/config.js`

**Intent**: Read, validate and write `.agents/.pa-skills-config.json` deterministically.

**Contract**: `{ version: 1, package, packageVersion, skills: string[], tags: string[], agentsMd: boolean, installed: { skills: string[], files: { path: string, sha256: string }[] (project-relative, forward slashes, sorted by path), agentsMd: { present: boolean, createdFile: boolean } } }`. Output has sorted keys, 2-space indentation, a trailing newline and no timestamps. The config file itself is not listed in `installed.files`; uninstall removes it explicitly. A corrupt config yields a clear error and no changes.

#### 3. Sync engine

**File**: `src/sync.js`

**Intent**: Make the disk match the resolved set: copy each skill folder into `.agents/skills/<name>/`, delete previously installed unmodified files no longer wanted, and prune empty directories.

**Contract**: Only paths in the previous manifest may be deleted or overwritten, and only when the on-disk SHA-256 equals the recorded one. A target skill dir not in the manifest is a collision unless `--force`. Files copied are recorded individually with their SHA-256 in `installed.files`. Consumer-modified files follow the policy in Implementation Approach. Tracked files missing on disk are reported as `restored` (still wanted) or `missing` (no longer wanted) and never cause an error. In `--dry-run` mode the engine returns the plan and performs no writes.

#### 4. AGENTS.md sentinel block

**File**: `src/agents-md.js`

**Intent**: Maintain the opt-in skills index between `<!-- BEGIN @pavel-agarkov/skills -->` and `<!-- END @pavel-agarkov/skills -->`.

**Contract**: The block lists each installed skill (name, description, relative path to its `SKILL.md`). Rewrites replace only text between the markers; text outside is preserved byte-for-byte. A missing `AGENTS.md` is created (recorded as `createdFile`). An unpaired marker throws. Removal deletes the block and the blank line it introduced, and deletes the file only if the installer created it and nothing else remains.

#### 5. install command

**File**: `src/commands/install.js`

**Intent**: Union flags with any existing config, resolve, sync, update AGENTS.md, write config, and print a summary of added files and skills.

**Contract**: Additive over the existing selection. No flags plus TTY opens the picker; no flags without TTY exits with a usage error. `--dry-run` prints the summary and writes nothing.

### Success Criteria:

#### Automated Verification:

- Resolver, config, sync and agents-md unit tests pass: `node --test test/resolve.test.js test/config.test.js test/sync.test.js test/agents-md.test.js`
- Install integration test passes (single skill, multiple skills, single tag, multiple tags, mixed names and tags): `node --test test/install.test.js`
- Re-running an identical install is a no-op with identical file bytes, including the config file
- `install --dry-run` leaves the project directory byte-identical (asserted in `test/install.test.js`)

#### Manual Verification:

- Running the interactive picker in a real terminal selects and installs correctly
- A hand-written `AGENTS.md` with existing content keeps that content after enabling the index

---

## Phase 4: Update, configure, uninstall and check

### Overview

Lifecycle commands that operate strictly on the saved selection and respect file hashes.

### Changes Required:

#### 1. update

**File**: `src/commands/update.js`

**Intent**: Re-expand saved `skills` and `tags` against the current catalog, sync, and refresh `packageVersion`.

**Contract**: Skills newly carrying a selected tag are added; skills removed from the catalog or no longer carrying a selected tag are removed through the manifest. A saved explicit skill name that no longer exists is dropped with a printed warning. Consumer-modified files are skipped with a warning unless `--force`. The summary lists added, removed, updated and skipped items. No config means "nothing installed", exit 1. Because `npx` may serve a cached version, the README documents `npx @pavel-agarkov/skills@latest update`. Tracked files or `AGENTS.md` deleted by hand are recreated with a warning when still wanted, and only dropped from the config when not. Supports `--dry-run`.

#### 2. configure

**File**: `src/commands/configure.js`

**Intent**: Replace the saved selection and options (including `--agents-md` / `--no-agents-md`) and sync.

**Contract**: Replacement is per kind: `--skill` replaces the saved `skills` and keeps the saved `tags`, `--tag` replaces the saved `tags` and keeps the saved `skills`; flags omitted keep them (e.g. `--agents-md` alone changes only that option). No flags plus TTY opens the picker preselected with the current values. Supports `--dry-run`.

#### 3. uninstall

**File**: `src/commands/uninstall.js`

**Intent**: Remove exactly what was installed and is still unmodified.

**Contract**: Deletes manifest files whose hash matches, prunes emptied directories, removes the `AGENTS.md` block (and the file if installer-created and now empty), then deletes the config file. Consumer-modified files and files the consumer added are left in place and reported, and so is their directory. `.agents/` is removed only if empty. Items already deleted by hand (skill files, skill folders, `AGENTS.md` or its block) produce a warning and the command continues; whatever remains of the saved selection is removed and the command exits 0. `--skill`/`--tag` are rejected with a usage error (exit 2) before anything is read or deleted, because uninstall always removes the whole saved selection. Non-existent config exits 0 with a "nothing to uninstall" message. Supports `--dry-run`.

#### 4. check

**File**: `src/commands/check.js`

**Intent**: Give CI and users a read-only answer to "would `update` change anything?".

**Contract**: Runs the same resolution as `update` without writing. Exit 0 when nothing is pending, 3 when `update` would add, remove or change files or when modified files exist, 1 on a handled error. Prints the same added/removed/updated/modified lists as `update`.

### Success Criteria:

#### Automated Verification:

- Lifecycle tests pass: `node --test test/update.test.js test/configure.test.js test/uninstall.test.js test/check.test.js`
- A test with consumer-authored and consumer-modified files beside installed ones shows those files and `AGENTS.md` text outside the markers byte-identical after update, configure and uninstall, and `--force` overwrites the modified file and re-records its hash
- A test simulating a catalog change (a new skill gaining a selected tag) shows `update` picks it up and `check` exits 3 before the update and 0 after, with no writes by `check`

#### Manual Verification:

- Full lifecycle against a real project folder via `npm pack` + `npx ./<tarball>` behaves as the README describes

---

## Phase 5: Add/remove command model

### Overview

Rename the commands to Vercel's vocabulary and make them mirror images. `add` replaces `install`, `remove` replaces `uninstall` and accepts the same `--skill`/`--tag` flags to remove a subset, and `configure` goes away. `--agents-md` becomes a plain opt-in flag on both `add` and `remove`, so `--no-agents-md` goes away too. `update`, `check` and `list` keep their behavior. Nothing is published yet, so there are no aliases for the old names.

### Changes Required:

#### 1. Rename install to add

**File**: `src/commands/add.js` (renamed from `src/commands/install.js`), `bin/cli.js`, `src/args.js`

**Intent**: Use `add` as the command name everywhere (dispatcher, `--help`, messages, tests).

**Contract**: `add` keeps the install behavior: additive over the saved selection, interactive picker with no flags and a TTY, usage error (exit 2) without a TTY. `install`, `uninstall` and `configure` are unknown commands (usage error, exit 2) and are not listed in `--help`.

#### 2. remove command

**File**: `src/commands/remove.js` (replaces `src/commands/uninstall.js`)

**Intent**: Mirror of `add`: `remove --skill a` removes that skill, `remove --tag t` removes every skill carrying `t`, and `remove` with no flags removes the whole saved selection.

**Contract**:
- With `--skill`/`--tag`, the named skills and every skill carrying a named tag are removed through the manifest, using the same hash rules as today (only unmodified manifest files are deleted; consumer-modified and consumer-added files stay and are reported, and so are their directories).
- Config: removed skill names leave `skills`; removed tag names leave `tags`; and every explicit name in `skills` that carries a removed tag leaves `skills` too, so a skill added by name and later removed by its tag is gone from disk and from the config.
- A skill that is still selected through another tag stays installed. `remove` prints which tag still selects it (suggesting `remove --tag <tag>`) and does not drop that skill. Explicit names never re-appear on `update`.
- A name or tag that is in the catalog but not in the saved selection is a warning (nothing to remove). A name that exists in neither the catalog nor the saved selection is a usage error listing valid values, raised before anything is read or deleted.
- When nothing remains selected (or `remove` has no selection flags), the result is a full removal: the manifest files go, then the `AGENTS.md` block (and the file if installer-created and now empty), then the config, then `.agents/` if empty. Exit 0.
- Everything already deleted by hand remains a warning, never an error, as in Implementation Approach. A missing config exits 0 with "nothing to remove". An unpaired `AGENTS.md` marker aborts before anything is deleted.
- Supports `--dry-run` and prints the same added/removed/skipped style summary as the other commands.

#### 3. AGENTS.md flag semantics

**File**: `src/args.js`, `src/commands/add.js`, `src/commands/remove.js`, `src/lifecycle.js`

**Intent**: One flag, one meaning, no negation.

**Contract**: `--no-agents-md` is removed (unknown flag, exit 2). The saved `agentsMd` option is used when the flag is not given. With no config yet, `AGENTS.md` is not used or created. `add --agents-md` enables the index and stores `agentsMd: true`. `remove --agents-md` removes the index block and stores `agentsMd: false`; combined with skill flags it also removes those skills, and `remove --agents-md` alone leaves all skills installed. Plain `remove` removes the block as part of the full removal. While `agentsMd` is true, the block is rewritten to match the remaining skills after every `add`, `remove` and `update`, and is removed when no skills remain.

#### 4. Remove configure and rewire the rest

**File**: `src/commands/configure.js` (deleted), `src/commands/update.js`, `src/commands/check.js`, `src/lifecycle.js`, `src/picker.js`

**Intent**: The surface is `add | remove | update | check | list | help`.

**Contract**: `configure` and its tests are removed; the shared `reconcile()` keeps serving the remaining commands. `update` and `check` behave as in Phase 4 on the saved selection. The picker is used by `add` only. Users who want to shrink a selection use `remove`. Phase 4's rule that `uninstall` rejects `--skill`/`--tag` no longer applies: `remove` accepts them.

### Success Criteria:

#### Automated Verification:

- Command tests pass: `node --test test/add.test.js test/remove.test.js test/update.test.js test/check.test.js test/args.test.js`
- `remove --skill` / `--tag` tests cover: single skill, several skills, one tag, several tags, mixed; removing by tag also removes an explicitly added skill from disk and config; a skill still covered by another selected tag stays and is reported; unknown name aborts with nothing changed; removing the last remaining skill triggers the full removal; consumer-added and consumer-modified files and `AGENTS.md` text outside the markers stay byte-identical
- `add` and `remove` are mirror images: for each selection shape, `add X` followed by `remove X` leaves the project byte-identical to before (asserted in `test/remove.test.js`)
- `--agents-md` tests: not created without the flag or a saved option; created by `add --agents-md`; kept in sync after `remove --skill`; removed by `remove --agents-md` while skills stay; `--no-agents-md`, `install`, `uninstall` and `configure` exit 2
- CLI exit codes via the real binary: `add` 0, `remove` 0 with and without a config, `check` 0/3/1, unknown command 2
- Full suite passes: `node --test`

#### Manual Verification:

- `--help` shows only `add`, `remove`, `update`, `check`, `list`, and the copy-pasteable examples use them
- `npm pack` + `npx ./<tarball>`: `add --tag dotnet`, `remove --skill <one>`, `remove --tag dotnet` and plain `remove` behave as described in a scratch repo

---

## Phase 6: Test hardening

### Overview

Consolidate edge-case coverage, confirm Vercel's CLI can read the repo, and make the suite the release gate.

### Changes Required:

#### 1. Edge-case tests

**File**: `test/*.test.js`, `test/helpers.js`

**Intent**: Cover the cases most likely to harm a consumer.

**Contract**: Temp-dir fixtures via `node:test` and `fs.mkdtemp`. Cases: unknown skill/tag aborts with nothing written; collision with an unmanaged `.agents/skills/<name>`; unpaired `AGENTS.md` marker; corrupt config; Windows-style path separators in the manifest; `--force` overwrite; non-TTY with no flags; manifest file missing on disk; manifest hash mismatch.

#### 2. Vercel discovery check

**File**: none (manual procedure, recorded in `README.md` Phase 7)

**Intent**: Prove, once, that the declared layout works with the real Vercel CLI rather than only with our assertions.

**Contract**: In a scratch directory, with `DISABLE_TELEMETRY=1`, run `npx skills add <path-to-this-repo> --list` and confirm both skills appear. Observation only; nothing in the repo changes.

### Success Criteria:

#### Automated Verification:

- Full suite passes on Node 22 and the current Node: `npm test`
- Tests run on Linux and Windows in CI (matrix in the workflow from Phase 7)

#### Manual Verification:

- Collision and unpaired-marker messages are actionable when read
- Vercel's CLI lists both skills from this repo: `DISABLE_TELEMETRY=1 npx skills add <path-to-this-repo> --list`

---

## Phase 7: Docs and publishing

### Overview

Make installation discoverable per skill, document how our CLI and Vercel's CLI differ, and automate publishing to npmjs.com.

### Changes Required:

#### 1. READMEs

**File**: `README.md`, `dist/skills/*/README.md`

**Intent**: Root README documents commands, flags, exit codes, config file, `AGENTS.md` index and update/uninstall behavior, plus a table of skills and tags. It also explains that `dist/skills/` is source, not build output. Each skill gets a short install section.

**Contract**: Each skill README shows `npx @pavel-agarkov/skills install --skill <name>` and one line per tag, e.g. `npx @pavel-agarkov/skills install --tag <tag>` and a multi-tag example. The root README adds a section "Using Vercel's skills CLI instead" with `npx skills add pavel-agarkov/skills --skill <name>`, and the comparison table from this plan (what each CLI does better, including that Vercel's `add` replaces an existing same-name skill folder and records no per-file list, and that its telemetry is on by default and disabled with `DISABLE_TELEMETRY=1`). A test asserts every command in the READMEs references valid skill names and tags. Per-skill READMEs live in `dist/skills/<name>/README.md` and are copied with the skill.

#### 2. Publish workflow

**File**: `.github/workflows/publish.yml`

**Intent**: Test on Linux and Windows, then publish on a version tag or manual dispatch.

**Contract**: Publish job runs `npm publish --provenance --access public` with npm trusted publishing (the package's Trusted Publisher is set to this repo and `publish.yml`; no `NPM_TOKEN`/`NODE_AUTH_TOKEN`), `id-token: write` permission, and a preceding step that fails if `npm view @pavel-agarkov/skills@<version>` already exists (publish only a new version). No token or `.npmrc` entry is committed.

### Success Criteria:

#### Automated Verification:

- Docs check test passes: `node --test test/docs.test.js`
- Workflow YAML parses and the version-exists guard step is present (static check in the same test)

#### Manual Verification:

- 0.1.0 published once from a local machine, then the Trusted Publisher (GitHub Actions, this repo, `publish.yml`) configured on the package page (user action)
- First publish of 0.1.0 succeeds and `npx @pavel-agarkov/skills list` works from an empty directory
- A second version (0.1.1) is published after a real change, so the registry shows more than one released version
- Three course-badge screenshots are captured: the repository showing the workflow, `package.json`, and the list of released versions

---

## Phase 8: Follow-up change for Vercel support

### Overview

Record the deferred Vercel work as its own change so it is planned deliberately later instead of creeping into this one.

### Changes Required:

#### 1. Create the follow-up change

**File**: `context/changes/vercel-skills-support/change.md`

**Intent**: Create a new change folder with `/10x-new` semantics (frontmatter per the change schema, `status: new`) whose Notes seed the future work.

**Contract**: Change id `vercel-skills-support`. Notes list: multi-agent targets and profiles (a `--target` flag over per-agent skill directories, as in the lesson's tool profiles); symlink-to-canonical-copy with a copy fallback and Windows junction behavior; verify `npx skills experimental_sync -y` against the published package (`dist/skills/` layout is already compatible); decide on writing or interoperating with `skills-lock.json`; global scope; whether `check` should accept Vercel's lock; re-verify Vercel behavior since v1.7.4; upstream issues to watch (#1906 same-name overwrite, #455 preserve-local on update, #2469 remove scope). Links to `context/changes/vercel-skills-research/frame.md` and `research.md`. The next step suggested for it is `/10x-research`.

### Success Criteria:

#### Automated Verification:

- The follow-up change exists with the right identity: `context/changes/vercel-skills-support/change.md` has `change_id: vercel-skills-support` and `status: new`

#### Manual Verification:

- The seeded Notes cover the deferred items listed above and read clearly to someone who skipped this plan

---

## Testing Strategy

### Unit Tests:

- Frontmatter parsing (inline lists, folded scalar), tag expansion, config validation and deterministic output, hash comparison, marker replace/remove with byte-exact preservation

### Integration Tests:

- Full lifecycle in a temp project: install (name, names, tag, tags, mixed) → check → update → configure → uninstall, asserting the directory tree and file bytes at each step, with consumer-authored and consumer-modified files present

### Manual Testing Steps:

1. `npm pack`, then `npx ./<tarball> install --tag dotnet` in a scratch repo with its own `AGENTS.md`.
2. `configure --agents-md`, verify the block, then `configure --no-agents-md`, verify removal.
3. Edit an installed skill file, run `check` (expect exit 3), run `update` (expect the edit kept and a warning), then `uninstall` and confirm only the edited file remains.
4. `DISABLE_TELEMETRY=1 npx skills add <path-to-this-repo> --list` and confirm both skills appear.

## Performance Considerations

None material; a handful of small files per run. Hashing adds one SHA-256 per installed file.

## Migration Notes

Moving skills to `dist/skills/` changes their paths in the repo. The root `README.md` links are updated in Phase 1; nothing else references the old paths. Nothing has been implemented yet, so this revision replaces the earlier `catalog/` layout without a migration.

## References

- Prior-art installer: `.claude/config-templates/m5l4-github-packages-install.js.template`
- Hard rules: `CLAUDE.md`
- Framing: `context/changes/vercel-skills-research/frame.md`
- Vercel CLI research: `context/changes/vercel-skills-research/research.md`
- Lesson: `shared-ai-registry-skills-commands-and-rules-for-your-team.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Skills layout and tags

#### Automated

- [x] 1.1 Catalog loader unit tests pass — c40357d
- [x] 1.2 `dist/skills/` contains exactly the two skills, and no folder named `skills` and no `SKILL.md` exists at the repo root and `.gitignore` has no `dist` entry — c40357d
- [x] 1.3 Vercel compatibility test passes: `skills.sh.json` lists `./dist/skills/`, that folder exists, and every `SKILL.md` has string `name` and `description` frontmatter — c40357d

#### Manual

- [x] 1.4 `git log --follow dist/skills/interview-trainer/SKILL.md` still shows prior history — c40357d
- [x] 1.5 Each skill's tags read sensibly — c40357d

### Phase 2: Package scaffold and CLI entry

#### Automated

- [x] 2.1 Parser tests pass — 6e7fe00
- [x] 2.2 `node bin/cli.js --help` and `node bin/cli.js list` exit 0 — 6e7fe00
- [x] 2.3 Pack contents are exactly the intended files — 6e7fe00

#### Manual

- [x] 2.4 `--help` text is clear enough to copy examples from — 6e7fe00

### Phase 3: Install, config and AGENTS.md block

#### Automated

- [x] 3.1 Resolver, config, sync and agents-md unit tests pass — 1ec21f2
- [x] 3.2 Install integration test passes (single skill, multiple skills, single tag, multiple tags, mixed names and tags) — 1ec21f2
- [x] 3.3 Re-running an identical install is a no-op with identical file bytes, including the config file — 1ec21f2
- [x] 3.4 `install --dry-run` leaves the project directory byte-identical — 1ec21f2

#### Manual

- [x] 3.5 Running the interactive picker in a real terminal selects and installs correctly — 1ec21f2
- [x] 3.6 A hand-written `AGENTS.md` with existing content keeps that content after enabling the index — 1ec21f2

### Phase 4: Update, configure, uninstall and check

#### Automated

- [x] 4.1 Lifecycle tests pass — 907db9e
- [x] 4.2 A test with consumer-authored and consumer-modified files beside installed ones shows those files and `AGENTS.md` text outside the markers byte-identical after update, configure and uninstall, and `--force` overwrites the modified file and re-records its hash — 907db9e
- [x] 4.3 A test simulating a catalog change (a new skill gaining a selected tag) shows `update` picks it up and `check` exits 3 before the update and 0 after, with no writes by `check` — 907db9e

#### Manual

- [x] 4.4 Full lifecycle against a real project folder via `npm pack` + `npx ./<tarball>` behaves as the README describes — 907db9e

### Phase 5: Add/remove command model

#### Automated

- [x] 5.1 Command tests pass — 5132b68
- [x] 5.2 `remove --skill` / `--tag` tests cover single, several, tag, mixed, tag-removes-explicit, still-covered-by-another-tag, unknown name, last-skill full removal and consumer file preservation — 5132b68
- [x] 5.3 `add` followed by `remove` of the same selection leaves the project byte-identical — 5132b68
- [x] 5.4 `--agents-md` semantics tests pass and the removed flags and commands exit 2 — 5132b68
- [x] 5.5 CLI exit codes via the real binary — 5132b68
- [x] 5.6 Full suite passes — 5132b68

#### Manual

- [x] 5.7 `--help` shows only `add`, `remove`, `update`, `check`, `list` and the examples use them — 5132b68
- [x] 5.8 `npm pack` + `npx ./<tarball>` lifecycle with `add` and `remove` behaves as described — 5132b68

### Phase 6: Test hardening

#### Automated

- [ ] 6.1 Full suite passes on Node 22 and the current Node
- [ ] 6.2 Tests run on Linux and Windows in CI

#### Manual

- [ ] 6.3 Collision and unpaired-marker messages are actionable when read
- [ ] 6.4 Vercel's CLI lists both skills from this repo

### Phase 7: Docs and publishing

#### Automated

- [x] 7.1 Docs check test passes
- [x] 7.2 Workflow YAML parses and the version-exists guard step is present

#### Manual

- [ ] 7.3 0.1.0 published once from a local machine, then the Trusted Publisher configured on the package page (user action)
- [ ] 7.4 First publish of 0.1.0 succeeds and `npx @pavel-agarkov/skills list` works from an empty directory
- [ ] 7.5 A second version (0.1.1) is published after a real change, so the registry shows more than one released version
- [ ] 7.6 Three course-badge screenshots are captured: the repository showing the workflow, `package.json`, and the list of released versions

### Phase 8: Follow-up change for Vercel support

#### Automated

- [ ] 8.1 The follow-up change exists with the right identity: `context/changes/vercel-skills-support/change.md` has `change_id: vercel-skills-support` and `status: new`

#### Manual

- [ ] 8.2 The seeded Notes cover the deferred items listed above and read clearly to someone who skipped this plan
