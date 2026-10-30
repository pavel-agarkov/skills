# Multi-harness install Implementation Plan

## Overview

Install skills for Claude Code as well as the `.agents/skills` harnesses. There are two agent ids, matching Vercel's `skills` CLI: `claude-code` installs to `.claude/skills` and `universal` installs to `.agents/skills`. One install can target either or both. The config moves from `.agents/.pa-skills-config.json` to a root `.pa-skills.json` with a `version: 2` schema. Existing v0.1.0/v0.2.0 installs upgrade in place on their next `add`/`update` and never lose or overwrite consumer files.

## Current State Analysis

The installer knows exactly one destination and one rules file:

- The skills dir `.agents/skills` is hardcoded (`src/sync.js:5`). It is used for desired paths (`src/sync.js:60`), the collision check (`src/sync.js:67-70`), the prune bound (`src/sync.js:28`) and the index line (`src/agents-md.js:17`).
- The config lives only at `.agents/.pa-skills-config.json` (`src/config.js:5,62-72`). Only `version: 1` is accepted (`src/config.js:34`).
- `reconcile` rebuilds the config on every write from a fixed key set with `version: 1` hard-coded (`src/lifecycle.js:36-44`).
- Rules state is a single `installed.agentsMd: {present, createdFile}` (`src/config.js:54-57`). `applyBlock`/`removeBlock` always write `AGENTS.md` (`src/agents-md.js:49,78`).
- The full `remove` prunes only `.agents/` (`src/commands/remove.js:23-30`).
- The CLI has no agent flag. Value flags use `takeValue` + `splitList`, which is comma-separated and repeatable (`src/args.js:5-10,29-34`).

Claude Code reads only `.claude/skills/<name>/SKILL.md`. It reads `AGENTS.md` only when no `CLAUDE.md` exists (research, finding 1 and "Claude Code and the rules file"). So today Claude sees neither the skills nor the index in a repo that has a `CLAUDE.md`.

v0.1.0 and v0.2.0 are published (`changelog.json`), so a migration is required.

## Desired End State

### Config

- **Location.** The config is a root `.pa-skills.json`: `{ version: 2, package, packageVersion, agents, skills, tags, agentsMd, installed: { skills, files, rules } }`.
  - `agents` is a non-empty subset of `["claude-code", "universal"]`.
  - `installed.rules` maps a rules-file path (`"AGENTS.md"` or `"CLAUDE.md"`) to `{ createdFile }`.
- **Reading a v1 config.** The legacy `.agents/.pa-skills-config.json` is read when no root config exists, upgraded in memory to v2, and written to the root on the next real `add`/`update`/`remove`. The legacy file is then deleted, and `.agents/` is removed if it is empty.
  - `check` and `changes` read the legacy file but never move it.
  - `check` reports the move as pending (exit 3).
- **Both files present.** If a root and a legacy config both exist, the root one wins. A warning names the ignored legacy file, and the legacy file is not deleted.

### Agents and detection

- **`--agent`.** `--agent claude-code,universal`, `--agent claude-code --agent universal`, `-a universal` and `--agent '*'` all work. An unknown id is a usage error that lists the valid ids.
- **Flags on `add` and `remove`.**
  - `add --agent X` adds X to the saved agents.
  - `remove --agent X` drops X and deletes X's unmodified copies.
  - Dropping the last agent is a full removal.
  - Combining `remove --agent` with `--skill`/`--tag` is a usage error.
- **Detection.** Detection runs only when no agents are saved and no `--agent` is given, that is on a fresh `add` or a v1 upgrade. claude-code counts as present when `.claude/` or `CLAUDE.md` exists. universal counts as present when `.agents/` or `AGENTS.md` exists.
  - Exactly one present → use it.
  - None present → `universal`.
  - Both present → fail before anything is written, and name the `--agent` values to pass.
  - On a v1 upgrade our own `.agents/` counts as universal. So a v1 repo that also has `.claude/` or `CLAUDE.md` fails `update`/`check` once: the config is not moved and no file changes. The error suggests `add --agent universal` or `add --agent claude-code,universal`.

### Rules blocks

- **Where each block goes.** With `agentsMd` on, claude-code's block goes into the root `CLAUDE.md` when that file exists, otherwise into `AGENTS.md`. universal's block always goes into `AGENTS.md`.
- **One block per file.** When several agents resolve to the same file, that file gets one block.
- **What a block lists.** A block that serves universal lists `.agents/skills/<name>/SKILL.md` paths. A block that serves only claude-code lists `.claude/skills/<name>/SKILL.md` paths.
- **Moving a block.** When the resolved file changes between runs (for example a `CLAUDE.md` was added), the block is removed from the old file and written to the new one.
- **`CLAUDE.md` is never created.**

### Verification

`npm test` passes on Linux and Windows CI. A v0.2.0-shaped fixture project upgrades with byte-identical skill files and `AGENTS.md`.

### Key Discoveries:

- **Moves need no new delete logic.** The hash-guarded deletion of no-longer-wanted tracked files (`src/sync.js:114-131`) already handles dropping a target: unmodified copies go, modified ones stay and are warned about.
- **Manifest paths survive the move.** They are project-relative (`src/config.js:50`), so v1 `.agents/skills/...` entries stay valid after the config moves.
- **The collision check is name-only.** It keys on the skill name alone (`src/sync.js:67-70`). It must key on `<skillsDir>/<name>`, or a consumer's own `.claude/skills/<name>` gets silently adopted when our copy already exists under `.agents/skills`.
- **A repeated block throws.** `findBlock` throws on a repeated marker (`src/agents-md.js:29-34`), so blocks must be deduplicated per file before `applyBlock` runs.
- **Rules first, then files.** The block is validated with a dry run before any skill file is touched (`src/lifecycle.js:18-20`). Keep that ordering for every rules file.
- **Old CLIs fail safely.** An old pinned CLI after the migration fails loudly ("nothing installed", or a collision on re-`add`) and deletes nothing (research finding 3). No stub at the legacy path is needed.
- **One test helper pins the old path.** `test/helpers.js:29` reads the legacy config path. About 100 test lines pin `.agents/` paths across 11 files.

## What We're NOT Doing

- No custom skills dir or rules file, and no third target (D1).
- No symlinks or junctions. Every target gets plain copies (research finding 7; deferred item 2 in `vercel-skills-support`).
- No Vercel per-tool aliases (`codex`, `github-copilot`, …) for `universal`, and no `claude` alias for `claude-code`.
- No per-agent skill selection. Every selected agent gets the same skill set, so `remove --skill x --agent y` is rejected.
- No global (`-g`) scope, no `skills-lock.json`, no `-s` short alias.
- `.claude/CLAUDE.md` and `CLAUDE.local.md` do not count as Claude's rules file. Only the root `CLAUDE.md` does. In a repo where Claude reads one of those instead, the `AGENTS.md` block may be invisible to Claude. This is documented and not handled.
- No interactive agent prompt. The both-present case fails with instructions.
- No `--agent` on `update`/`check`. They use the saved agents, or detection for a v1 config. They ignore `--agent` the same way they ignore `--skill` today.
- No renaming of the `--agents-md` flag or the `agentsMd` key. The flag now also covers `CLAUDE.md`, and only its help text changes.

## Implementation Approach

Generalise the existing single-target pipeline instead of adding a parallel one. A small agent registry module owns the two ids, their skills dirs and their root folders. `syncSkills` produces desired paths for each selected agent. Per-file rules resolution feeds the existing `applyBlock`/`removeBlock`, which take a file argument. The config gets a versioned reader: root first, then legacy, with v1 upgraded to v2 in memory. Writing always targets the root and retires the legacy file.

Phases go bottom-up: config → sync → rules → CLI. Each phase keeps `npm test` green. Phases 1-3 call `reconcile` with `agents: ['universal']`, so behaviour is unchanged until phase 4 exposes the flag and detection.

## Critical Implementation Details

**State sequencing.**

1. **Before any write:** agent detection, and its fail-on-both check, runs after `readConfig`. The rules-file dry-run validation then runs for every target and old file.
2. **Then the skill sync.**
3. **Last, the config write.** Only after the root config is written may the legacy file be deleted. If the root write fails, the legacy file must still be there.

A dry run (`check`, `--dry-run`) must not migrate, delete the legacy file, or create a dir.

**Detection must not see our own writes.** Detection runs once per command, before anything is written. Otherwise a fresh `add` that creates `AGENTS.md` or `.agents/` would change its own answer within the run.

## Phase 1: Root config v2 + legacy migration

### Overview

Introduce the v2 schema at the root path, read the legacy v1 file as a fallback with an in-memory upgrade, retire the legacy file on the first real write, and surface the pending move in `check`. Install behaviour is otherwise unchanged: every caller still uses `universal` and `AGENTS.md`.

### Changes Required:

#### 1. Config module

**File**: `src/config.js`

**Intent**: Move the config to the root and add v2 with a v1 upgrade path, so upgraded installs keep working and old shapes are never written again.

**Contract**:
- **Path constants.** `CONFIG_REL_PATH = '.pa-skills.json'` and `LEGACY_CONFIG_REL_PATH = '.agents/.pa-skills-config.json'`.
- **`validateConfig`.**
  - It accepts `version: 2` only. `version: 1` reaches it only after the upgrade. Any other version is rejected with the existing "unsupported version" message.
  - v2 requires `agents` (an array of known ids, unique) and `installed.rules`: an object whose keys are `AGENTS.md` or `CLAUDE.md`, each `{ createdFile: boolean }`. `installed.agentsMd` is no longer part of v2.
  - The manifest-path safety check is unchanged.
- **`upgradeV1(v1)`.** It validates the v1 shape and returns v2 with `agents: []`. An empty `agents` means "not chosen; detect", and is allowed only in memory, never on write. `installed.rules` is `{ "AGENTS.md": { createdFile } }` when `installed.agentsMd.present`, else `{}`. All other fields are carried over.
- **`readConfig(cwd)`.** It returns `{ config, source, staleLegacy }` or `null`.
  - `source` is `'root'` or `'legacy'`.
  - `staleLegacy` is true when both files exist and the root one was read.
  - A corrupt file throws and names the file it read. Update every caller.
- **`writeConfig(cwd, config, { source })`.** It writes the root file (only when the bytes change, as today) and rejects an empty `agents`. When `source === 'legacy'`, it then deletes the legacy file and removes `.agents/` if it is empty.

#### 2. Lifecycle

**File**: `src/lifecycle.js`

**Intent**: Build v2 configs and report the config move, so `check` exits 3 on a legacy install and `update` says what it did.

**Contract**:
- `reconcile` takes `agents` and the `source` from `readConfig`, and writes `version: 2` with `agents`.
- For now it maps the single AGENTS.md state onto `installed.rules["AGENTS.md"]`. Phase 3 generalises this.
- `isPending` is true when `source === 'legacy'`.
- `printSummary` prints `config: moved .agents/.pa-skills-config.json → .pa-skills.json`. In check mode the line is prefixed as pending. When `staleLegacy` is set it prints `warning: ignoring .agents/.pa-skills-config.json; .pa-skills.json is used (delete the old file)`.
- The "Nothing to change" text names the root path.

#### 3. Commands

**Files**: `src/commands/add.js`, `src/commands/update.js`, `src/commands/remove.js`, `src/commands/changes.js`

**Intent**: Adapt the commands to the new `readConfig` return shape. Pass `agents: ['universal']` until phase 4. Make the full removal retire both config locations.

**Contract**:
- `removeAll` deletes the root config and, when `source === 'legacy'`, the legacy file, then prunes `.agents/` as today. Its message names the root path. A stale legacy file is left alone and warned about.
- `changes` reads from either location and never writes.

#### 4. Tests

**Files**: `test/helpers.js`, `test/config.test.js`, `test/update.test.js`, `test/check.test.js`, `test/remove.test.js`, plus the path updates elsewhere

**Intent**: Point the shared helper at the root config, and add a v1 fixture writer that reproduces a v0.2.0 install byte-for-byte. Use it for the migration tests.

**Contract**:
- `readConfigJson` reads `.pa-skills.json`.
- New helper `writeLegacyInstall(cwd, { agentsMd })` writes `.agents/skills/...` files, an optional `AGENTS.md` block and a v1 config exactly as v0.2.0 would.
- `test/config.test.js:57-58` flips: `version: 2` is accepted, and `version: 3` is rejected.

### Success Criteria:

#### Automated Verification:

- Full suite passes: `npm test`
- Upgrade: running `update` on a v0.2.0 fixture writes `.pa-skills.json` with `version: 2` and `agents: ["universal"]`. It deletes the legacy file, leaves skill files and `AGENTS.md` byte-identical, and a second `update` writes nothing.
- `check` on a v0.2.0 fixture exits pending, reports the config move and changes no byte on disk.
- A corrupt legacy config fails with an error naming `.agents/.pa-skills-config.json`, and nothing is changed.
- With both configs present, the root one is used, a warning names the legacy file and the legacy file is kept.
- Full `remove` on a legacy-sourced install deletes both config locations and the empty `.agents/`.

#### Manual Verification:

- Run `node bin/cli.js update` against a copy of a real project installed with the published v0.2.0. Confirm that the summary line for the config move reads clearly and that `git status` in that project shows only the config move.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Multi-target sync

### Overview

Teach the sync and the full removal about more than one skills dir. Introduce the agent registry. Behaviour for `universal` alone is unchanged.

### Changes Required:

#### 1. Agent registry

**File**: `src/agents.js` (new)

**Intent**: Put the agent ids, their skills dirs and their root folders in one place, so no module hardcodes `.agents/skills` again.

**Contract**:
- `AGENTS = { 'claude-code': { skillsDir: '.claude/skills', rootDir: '.claude' }, universal: { skillsDir: '.agents/skills', rootDir: '.agents' } }`.
- `AGENT_IDS` lists them in sorted order.
- `skillsDirOf(path)` returns the registry skills dir that a manifest path lives under, or `null`.

#### 2. Sync

**File**: `src/sync.js`

**Intent**: Build desired files per selected agent, check collisions per target folder, and prune empty folders within each target's own skills dir.

**Contract**:
- `syncSkills({ cwd, catalog, skills, agents, prev, force, dryRun })` produces one desired entry per agent × skill × file, at `<skillsDir>/<name>/<file>`.
- **Collision.** A skill folder `<skillsDir>/<name>` is a collision when it exists on disk and no previous manifest path starts with `<skillsDir>/<name>/`. The error lists every colliding folder path.
- **Pruning.** `pruneEmptyDirs` is bounded by `skillsDirOf(path)`. A path outside the registry prunes nothing.
- `SKILLS_REL_DIR` is removed. Its other importer, `agents-md.js`, uses `AGENTS.universal.skillsDir` until phase 3.

#### 3. Full removal pruning

**File**: `src/commands/remove.js`

**Intent**: Leave no empty folders behind for any target, and never delete a `.claude/` folder that still holds consumer files.

**Contract**:
- After the config is deleted, the full removal handles every registry agent in turn. It removes `skillsDir` if empty, then `rootDir` if empty. For `universal` this replaces `pruneAgentsDir`.
- A folder that is not empty is always left in place.

#### 4. Lifecycle wiring and tests

**Files**: `src/lifecycle.js`, `test/sync.test.js`, `test/remove.test.js`, `test/edge-cases.test.js`

**Intent**: Pass `agents` through `reconcile` to the sync. Cover both agents at the sync level before the CLI exposes them.

**Contract**: `reconcile({ ..., agents })` forwards `agents` to `syncSkills`.

### Success Criteria:

#### Automated Verification:

- Full suite passes: `npm test`
- With `agents: ['claude-code', 'universal']`, every skill file exists under both `.claude/skills/<name>/` and `.agents/skills/<name>/`, and both are in the manifest.
- A consumer's own `.claude/skills/<name>/` fails with a collision naming `.claude/skills/<name>` while ours exists under `.agents/skills/<name>/`. No file is written. `--force` takes it over.
- Dropping `claude-code` from the agents deletes its unmodified copies, keeps and warns about a modified one, and removes the empty `.claude/skills/`. A `.claude/` that holds a consumer `settings.json` is kept.
- Full removal with both agents leaves no `.claude/skills/` or `.agents/` behind. It leaves `.claude/` when that folder holds other files.

#### Manual Verification:

- Read the collision error text for a two-target case and confirm it says clearly which folder to move.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Per-file rules blocks

### Overview

Track rules state per file. Resolve which file each agent's block goes into, deduplicate, render the right paths and move blocks when the resolution changes. Everything stays validated before any skill file is touched.

### Changes Required:

#### 1. Block writer

**File**: `src/agents-md.js`

**Intent**: Make the block writer work on any rules file and with any skills dir, and make its errors name the actual file.

**Contract**:
- `renderBlock(skills, skillsDir, eol)`.
- `applyBlock({ cwd, file, skills, skillsDir, createdFile, dryRun })` and `removeBlock({ cwd, file, createdFile, dryRun })`. `file` is a project-relative rules-file path.
- `applyBlock` may create a missing file only when `file === 'AGENTS.md'`. For any other missing file it throws, as a guard against ever creating `CLAUDE.md`.
- `findBlock` error messages use `file`. The markers are unchanged.

#### 2. Rules resolution

**File**: `src/rules.js` (new)

**Intent**: Decide, at run time, which rules files get a block and which skills dir each block lists.

**Contract**:
- `resolveRulesTargets(cwd, agents)` returns `Map<file, skillsDir>`.
  - `universal` → `AGENTS.md`.
  - `claude-code` → `CLAUDE.md` if the root `CLAUDE.md` exists, else `AGENTS.md`.
  - When `AGENTS.md` serves `universal`, its skills dir is `.agents/skills`. When it serves only `claude-code`, it is `.claude/skills`. `CLAUDE.md` always lists `.claude/skills`.

#### 3. Lifecycle

**File**: `src/lifecycle.js`

**Intent**: Reconcile several rules files at once: write the resolved targets and remove blocks from recorded files that are no longer targets. Keep the existing "rules validation first" ordering.

**Contract**:
- When `agentsMd` is on, the targets are `resolveRulesTargets(cwd, agents)`. When it is off, there are none. The old files are `Object.keys(prev.installed.rules)` minus the targets.
- **Validation.** A dry-run `applyBlock` runs on every target and a dry-run `removeBlock` on every old file. All of them run before `syncSkills`.
- **Writes.** After the sync, the real apply and remove run.
- **Recorded state.** `installed.rules` gets the targets, each with a `createdFile` flag. The flag stays true if the previous record had it, or becomes true when this run created the file.
- **Results.** Per-file actions are returned as `rulesActions: [{ file, action }]`.
- **Warnings.** The "recreated" and "already gone" warnings and the `<file> index: <action>` lines are emitted per file.
- `isPending` counts any non-`none` per-file action.

#### 4. Full removal

**File**: `src/commands/remove.js`

**Intent**: Remove the block from every recorded rules file, validating all of them before anything is deleted.

**Contract**: `removeAll` iterates `prev.installed.rules`. It runs a dry-run `removeBlock` for every existing file before `syncSkills`, then the real removal. A recorded file that is missing triggers the existing "was already removed" warning, with the file name.

### Success Criteria:

#### Automated Verification:

- Full suite passes: `npm test`
- `agents: ['claude-code','universal']`, `agentsMd` on, no `CLAUDE.md`: `AGENTS.md` gets exactly one block, which lists `.agents/skills/...` paths. `CLAUDE.md` is not created.
- The same with an existing `CLAUDE.md`: `CLAUDE.md` gets a block listing `.claude/skills/...` and `AGENTS.md` gets one listing `.agents/skills/...`. Text outside the markers in both files is byte-identical.
- `agents: ['claude-code']` with no `CLAUDE.md`: `AGENTS.md` is created and lists `.claude/skills/...` paths.
- After a `CLAUDE.md` is added, `update` moves claude-code's block: it is removed from `AGENTS.md` (the file is deleted if we created it and it is now empty) and appended to `CLAUDE.md`.
- An unpaired marker in `CLAUDE.md` aborts before any skill file changes, with an error that names `CLAUDE.md`.
- A v1 install with the `AGENTS.md` block upgrades with `AGENTS.md` byte-identical.

#### Manual Verification:

- Open a scratch repo that has a `CLAUDE.md`, install with both agents and `--agents-md`, start Claude Code and confirm it lists the skills and can see the index block.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: `--agent` CLI, detection and upgrade rule

### Overview

Expose agent selection on the CLI. Implement presence detection with the fail-on-both rule for fresh installs and v1 upgrades. Wire additive `add` and narrowing `remove`.

### Changes Required:

#### 1. Argument parser

**File**: `src/args.js`

**Intent**: Accept `--agent` with the same comma-list, repeatable shape as `--skill`, plus a Vercel-compatible `-a` alias and `*`.

**Contract**:
- `out.agents: string[]`.
- `--agent` and `--agent=` use `takeValue` + `splitList`.
- `-a <value>` is handled beside `-h`/`-v` and requires a value.
- The literal `*` is kept as-is. The commands expand it.
- An unknown id is not rejected here. The commands do that, so the error can list the valid ids.

#### 2. Detection

**File**: `src/agents.js`

**Intent**: Pick the default agents from the project's own harness footprint, and refuse to guess when both harnesses are present.

**Contract**:
- `expandAgents(list)` expands `*` to `AGENT_IDS` and throws `UsageError` on an unknown id, listing the valid ids.
- `detectAgents(cwd)` returns the present ids. `claude-code` is present if `.claude/` or the root `CLAUDE.md` exists. `universal` is present if `.agents/` or the root `AGENTS.md` exists.
- `defaultAgents(cwd)` returns the single present id, or `['universal']` when none is present. When both are present it throws an error naming what it found (for example `.claude/ and AGENTS.md`) and the values to pass.

#### 3. Commands

**Files**: `src/commands/add.js`, `src/commands/update.js`, `src/commands/remove.js`

**Intent**: Apply the agreed agent semantics on each command.

**Contract**:
- **`add`.**
  - With `--agent`, the agents are the saved agents plus the flag agents, sorted and unique.
  - Without `--agent`, the saved agents are used. If none are saved (a fresh install or a v1 config), it uses `defaultAgents(cwd)`, and the both-present case is a `UsageError` (exit 2).
  - `add --agent X` alone, with no skills or tags, keeps the saved skills and does not open the picker. It mirrors `--agents-md` alone (`src/commands/add.js:22`).
- **`update` and `check` (`runSaved`).** They use `prev.agents`. If it is empty (v1), they use `defaultAgents(cwd)`. The both-present case is a plain error (exit 1) that suggests `add --agent universal` or `add --agent claude-code,universal`. It is raised before anything is written, so the config is not moved.
- **`remove`.**
  - `--agent X` drops X from the saved agents, so the next reconcile deletes its unmodified copies.
  - An id that is not saved produces the warning `agent "X" is not in the saved selection; nothing to remove`.
  - When no agents remain, `removeAll` runs.
  - `--agent` together with `--skill`/`--tag` is a `UsageError`.
  - `--agent` with `--agents-md` is allowed.
- **Saved agents.** A v1 config upgraded through `add --agent …` saves exactly the flag agents, because the saved list starts empty.

#### 4. Help text

**File**: `bin/cli.js`

**Intent**: Document `--agent`/`-a`, the detection default and the broader meaning of `--agents-md`.

**Contract**:
- New option line: `--agent, -a a,b   Agents: claude-code, universal, or '*' (repeatable, comma-separated; default: detected)`.
- `--agents-md` is described as maintaining the skills index in AGENTS.md / CLAUDE.md.
- New examples: `add --skill interview-trainer --agent claude-code,universal` and `remove --agent claude-code`.

#### 5. Tests

**Files**: `test/args.test.js`, `test/add.test.js`, `test/update.test.js`, `test/check.test.js`, `test/remove.test.js`

**Intent**: Cover the parser forms, the detection matrix, the upgrade rule and the add/remove semantics through both the command functions and the CLI exit codes.

**Contract**: `test/add.test.js:44` is generalised: manifest paths start with one of the selected agents' skills dirs.

### Success Criteria:

#### Automated Verification:

- Full suite passes: `npm test`
- The parser accepts `--agent claude-code,universal`, a repeated `--agent`, `--agent=*` and `-a universal`. `-a` without a value is a usage error.
- An unknown id exits 2 and lists `claude-code, universal`.
- Fresh-`add` detection matrix:
  - nothing present → `universal`;
  - only `.claude/` → `claude-code`;
  - only `CLAUDE.md` → `claude-code`;
  - only `AGENTS.md` → `universal`;
  - `.claude/` + `AGENTS.md` → exit 2, nothing written, and the message names both markers and the `--agent` values.
- Upgrade matrix:
  - v0.2.0 fixture alone → `update` saves `agents: ["universal"]` with no skill-file change;
  - v0.2.0 fixture + `.claude/` → `update` exits 1 and `check` exits 1, both with no byte changed and the legacy config still in place;
  - then `add --agent claude-code,universal` → both copies, the root config, and the legacy file gone.
- `add --agent claude-code` on a `universal` install adds `.claude/skills` copies and keeps the `.agents` copies.
- `remove --agent universal` on a two-agent install deletes the `.agents/skills` copies only. `remove --agent claude-code` afterwards is a full removal.
- `remove --agent claude-code --skill x` exits 2.

#### Manual Verification:

- Run `node bin/cli.js --help` and confirm the agent option and examples read clearly.
- In a scratch repo with `.claude/` and `AGENTS.md`, run `add --skill interview-trainer` and confirm the error says exactly what to type next.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Docs and release

### Overview

Document the new targets, detection, config location and upgrade path. Add the 0.3.0 changelog entry that `update` prints to upgraders, and bump the version so the merge publishes.

### Changes Required:

#### 1. README

**File**: `README.md`

**Intent**: Replace the ".agents/ only" story with the two-agent model, and give upgraders a short, explicit section.

**Contract**:
- The install-location text (`README.md:3,22`) covers both agents.
- An options-table row for `--agent`/`-a`.
- The config section (`README.md:63`) names `.pa-skills.json` and the v2 keys `agents` and `installed.rules`.
- The safety rules (`README.md:67-70`) say collisions are per agent folder.
- The removal text (`README.md:99`) covers both agents.
- The "AGENTS.md index" section covers the `CLAUDE.md` placement rule and the limitation for `.claude/CLAUDE.md` and `CLAUDE.local.md`.
- A new "Upgrading from 0.2.x" subsection covers the config move, the one-time detection failure in repos with `.claude/`, and the command to enable Claude.
- The Vercel comparison row (`README.md:126`) becomes `claude-code + universal (copies)`.
- Every `npx @pavel-agarkov/skills …` example still parses (`test/docs.test.js`).

#### 2. Changelog and version

**Files**: `changelog.json`, `CHANGELOG.md`, `package.json`

**Intent**: Publish a new version with notes that tell upgraders what changed and what to run.

**Contract**:
- `package.json` version `0.3.0`.
- A `changelog.json` entry for `0.3.0` with notes on:
  - Claude Code support via `--agent claude-code`;
  - the config moving to `.pa-skills.json`, done automatically on the next `update`;
  - the one-time "both present" error and the exact `add --agent …` command;
  - the index block going into `CLAUDE.md` when that file exists.
- `CHANGELOG.md` is regenerated with `npm run changelog`.

#### 3. Docs test

**File**: `test/docs.test.js`

**Intent**: Stop the README from drifting back to the old location.

**Contract**: Assert that the README mentions `.pa-skills.json`, `--agent`, `claude-code` and `universal`, and does not mention `.agents/.pa-skills-config.json` outside the upgrade section.

### Success Criteria:

#### Automated Verification:

- Full suite passes: `npm test`
- Release check passes against the base version: `node scripts/release-check.js 0.2.0`
- `npm run changelog` leaves `CHANGELOG.md` unchanged after regeneration (it is committed up to date).
- `npm pack --dry-run` lists `src/agents.js` and `src/rules.js`.

#### Manual Verification:

- Read the README "Upgrading from 0.2.x" section and the 0.3.0 notes as an upgrader, and confirm the next step is obvious.
- After merge and publish, run `npx @pavel-agarkov/skills@0.3.0 update` in a real v0.2.0 project and confirm the upgrade notes print and the config moves.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Config: v2 validation (agents, `installed.rules` keys, empty agents rejected on write), the `upgradeV1` mapping with and without an AGENTS.md block, and the read order root → legacy.
- Sync: per-agent desired paths, the per-folder collision check, the prune bound per skills dir.
- Rules: the `resolveRulesTargets` matrix (agents × CLAUDE.md present), deduplication, and the paths listed per block.
- Args: every `--agent` form and `-a`.

### Integration Tests:

- A v0.2.0 fixture (`writeLegacyInstall`), with and without `--agents-md`, run through `update`, `check`, `add --agent`, a full `remove` and `changes`.
- Fresh `add` detection matrix through the CLI, with exit codes.
- Two-agent install, then a `CLAUDE.md` added, then `update`: the block moves. Then `remove --agent claude-code`, then a full `remove`, leaving a clean tree except consumer files.

### Manual Testing Steps:

1. Copy a real project installed with v0.2.0, run `node bin/cli.js update`, and inspect `git status`.
2. In a repo with `CLAUDE.md`, run `add --tag dotnet --agent claude-code,universal --agents-md`, open Claude Code and confirm it lists the skills.
3. In a repo with `.claude/` and `AGENTS.md`, run `add` without `--agent` and confirm the error is actionable.

## Migration Notes

- A v1 config is upgraded in memory and persisted to `.pa-skills.json` on the first real write. The legacy file is deleted only after the root write succeeds.
- Detection on upgrade can only yield `universal` or fail, because our own `.agents/` always counts as present. A v1 repo with `.claude/` or `CLAUDE.md` therefore fails `update`/`check` once and needs one explicit `add --agent …`. This is intentional (user decision) and is announced in the 0.3.0 notes and the README.
- **Rollback.** A project upgraded by 0.3.0 cannot be read by 0.2.x: it reports "nothing installed" and deletes nothing. To roll back, delete `.pa-skills.json` and re-`add` with 0.2.x. This is documented in the README upgrade section.

## References

- Related research: `context/changes/multi-harness-install/research.md` (findings 1-7, Follow-ups 1-2, decisions D1-D5)
- Prior plan, v1 config contract: `context/changes/ai-skills-distribution-package/plan.md:206`
- Release and changelog flow: `context/archive/2026-10-30-simple-publish/plan.md`
- Deferred Vercel items: `context/changes/vercel-skills-support/change.md`
- Hash-guarded deletion to reuse: `src/sync.js:114-131`
- Rules-before-files ordering to keep: `src/lifecycle.js:18-20`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Root config v2 + legacy migration

#### Automated

- [x] 1.1 Full suite passes: `npm test`
- [x] 1.2 v0.2.0 fixture `update` moves config to `.pa-skills.json` v2 with no skill or AGENTS.md change; second `update` writes nothing
- [x] 1.3 `check` on v0.2.0 fixture exits pending, reports the move, changes nothing
- [x] 1.4 Corrupt legacy config fails naming the legacy file; nothing changed
- [x] 1.5 Both configs present: root wins, legacy warned and kept
- [x] 1.6 Full `remove` on legacy-sourced install deletes both config locations and empty `.agents/`

#### Manual

- [x] 1.7 Real v0.2.0 project copy: `update` summary is clear and `git status` shows only the config move

### Phase 2: Multi-target sync

#### Automated

- [ ] 2.1 Full suite passes: `npm test`
- [ ] 2.2 Both agents: every skill file under `.claude/skills` and `.agents/skills`, all in the manifest
- [ ] 2.3 Consumer `.claude/skills/<name>` collides while ours is in `.agents/skills`; `--force` takes over
- [ ] 2.4 Dropping `claude-code` deletes unmodified copies, keeps modified, prunes `.claude/skills`, keeps non-empty `.claude/`
- [ ] 2.5 Full removal with both agents leaves no `.claude/skills` or `.agents/`; keeps non-empty `.claude/`

#### Manual

- [ ] 2.6 Two-target collision error names the folder to move clearly

### Phase 3: Per-file rules blocks

#### Automated

- [ ] 3.1 Full suite passes: `npm test`
- [ ] 3.2 Both agents, no CLAUDE.md: one AGENTS.md block with `.agents/skills` paths; CLAUDE.md not created
- [ ] 3.3 Both agents with CLAUDE.md: CLAUDE.md block lists `.claude/skills`, AGENTS.md block lists `.agents/skills`; outside text byte-identical
- [ ] 3.4 claude-code only, no CLAUDE.md: AGENTS.md created listing `.claude/skills` paths
- [ ] 3.5 CLAUDE.md added later: `update` moves the block from AGENTS.md to CLAUDE.md
- [ ] 3.6 Unpaired marker in CLAUDE.md aborts before any skill file change, naming CLAUDE.md
- [ ] 3.7 v1 install with AGENTS.md block upgrades with AGENTS.md byte-identical

#### Manual

- [ ] 3.8 Claude Code in a CLAUDE.md repo lists the skills and sees the index block

### Phase 4: `--agent` CLI, detection and upgrade rule

#### Automated

- [ ] 4.1 Full suite passes: `npm test`
- [ ] 4.2 Parser accepts comma, repeated, `=*` and `-a` forms; `-a` without value is a usage error
- [ ] 4.3 Unknown agent id exits 2 listing valid ids
- [ ] 4.4 Fresh-add detection matrix (none, `.claude/`, CLAUDE.md, AGENTS.md, both → exit 2 with nothing written)
- [ ] 4.5 Upgrade matrix (fixture alone → universal; fixture + `.claude/` → update/check exit 1 with nothing changed; then `add --agent claude-code,universal` migrates)
- [ ] 4.6 `add --agent claude-code` on a universal install adds copies and keeps `.agents` copies
- [ ] 4.7 `remove --agent universal` removes only `.agents` copies; removing the last agent is a full removal
- [ ] 4.8 `remove --agent` combined with `--skill` exits 2

#### Manual

- [ ] 4.9 `--help` agent option and examples read clearly
- [ ] 4.10 Both-present error in a scratch repo says exactly what to type next

### Phase 5: Docs and release

#### Automated

- [ ] 5.1 Full suite passes: `npm test`
- [ ] 5.2 Release check passes: `node scripts/release-check.js 0.2.0`
- [ ] 5.3 `npm run changelog` leaves `CHANGELOG.md` unchanged
- [ ] 5.4 `npm pack --dry-run` lists `src/agents.js` and `src/rules.js`

#### Manual

- [ ] 5.5 README upgrade section and 0.3.0 notes make the next step obvious
- [ ] 5.6 After publish, `npx @pavel-agarkov/skills@0.3.0 update` in a real v0.2.0 project prints notes and moves the config
