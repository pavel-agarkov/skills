# CLI Control Skill (`pa-skills`) Implementation Plan

## Overview

Ship one new catalog skill, `pa-skills` (tag `cli`), that lets an AI agent in a consumer project drive this package's CLI on the user's behalf: `add`, `remove`, `update`, `check`, `changes` and `list`. Users can then say "add the dotnet skills" or "are my skills up to date?" instead of remembering flags. The skill wraps the existing CLI and does not change it. Tests keep the skill text in line with the real command surface, and the skill ships in release 0.4.0.

## Current State Analysis

- The package ships skills from `dist/skills/<name>/`. That folder is the source of truth, has no build step, and is what npm publishes (`package.json` `files`).
- `loadCatalog` requires `name` equal to the folder name, a non-empty `description`, and at least one kebab-case tag (`src/catalog.js:63-77`).
- `test/docs.test.js` requires each skill to have a `README.md` with its `add --skill` command, an `add --tag` for every tag, and one multi-tag example (`test/docs.test.js:43-50`). Every `npx @pavel-agarkov/skills ...` command in a README must parse and must name only real skills and tags, and placeholders (`<`) are rejected (`test/docs.test.js:28-41`).
- `test/catalog.test.js:22-24` hard-codes exactly two skills.
- The CLI contract is easy for an agent to drive: exit codes 0/1/2/3 (`bin/cli.js:40`), `--dry-run` on `add`/`remove`/`update` (`README.md:47`), and `check` as a read-only preview with exit 3 when changes are pending.
- An agent has no terminal: a bare `add` with no flags is a usage error without a TTY (`README.md:29`, `bin/cli.js:106`). The agent must always pass explicit `--skill` / `--tag`.
- Dangerous paths exist: a bare `remove` removes everything. `remove --agent` deletes copies. Before the 0.3.0 config migration, `add --agent claude-code` deletes the `.agents/skills/` copies (`README.md:107`). When both agent markers are present, `add` refuses with exit 2 and names the `--agent` values to pass (`README.md:23`).
- `update`, `check` and `changes` should use `@latest`, because `npx` may serve a cached older version (`README.md:80`).
- The pattern for a skill with subcommands already exists: `interview-trainer` has an `argument-hint` frontmatter field and a routing table (`dist/skills/interview-trainer/SKILL.md:5-36`).

## Desired End State

- `npx @pavel-agarkov/skills list` shows `pa-skills [cli]`, and `add --skill pa-skills` installs it like any other skill.
- In a consumer project, an agent with `pa-skills` installed can:
  - resolve skill and tag names with `list`,
  - preview every writing command with `--dry-run`,
  - show the preview, and run the real command only after the user says yes,
  - read exit codes correctly (3 from `check` means "pending", not "failure"),
  - pass on, verbatim, the CLI's own instructions when it refuses (agent ambiguity, upgrade case).
- `npm test` fails when the CLI gains a command or flag that the skill does not mention, or when a command in the skill no longer parses.
- `package.json` is `0.4.0`, `changelog.json` has a 0.4.0 entry, and `CHANGELOG.md` is regenerated.

### Key Discoveries:

- `commandsIn` in `test/docs.test.js:16-22` already extracts `npx @pavel-agarkov/skills[@ver] ...` commands, so reuse it for the skill files.
- `COMMANDS` is exported from `src/args.js:5`. The flag list lives only in the `HELP` string in `bin/cli.js:29-38` (not exported), so the test has to read it from the file text.
- The `readmes` list in `test/docs.test.js:13` is built from `dist/skills/*`, so the new README is checked automatically.
- The root README test needs every skill name and every tag in backticks (`test/docs.test.js:52-55`), so the new row must show `` `cli` ``.

## What We're NOT Doing

- No change to CLI behavior, flags or the config format.
- `add` does not install `pa-skills` automatically. Users select it like any other skill.
- No repo-local `.claude/skills/` copy for maintainers.
- No one-skill-per-command split, and no read/write split.
- No generation of the skill from `HELP`. `dist/skills/` keeps having no build step.
- Vercel `skills` CLI commands are not covered (that work belongs to `vercel-skills-support`).
- The skill never adds `--force` and never chooses `--agent` values unless the user explicitly asks.

## Implementation Approach

The skill is a self-contained `SKILL.md`. It has a frontmatter `argument-hint` and a routing table, like interview-trainer, followed by one "shared rules" section and short per-command recipes. Safety lives in the shared rules, so it is written once. Drift is caught by test assertions over the skill's own files instead of generated content. The release follows the existing PR flow.

## Critical Implementation Details

- **Version predicate:** `update`, `check` and `changes` run `npx @pavel-agarkov/skills@latest ...`. `add`, `remove` and `list` run plain `npx @pavel-agarkov/skills ...`. The dry-run preview and the real run use the same form, so they resolve the same version.
- **Placeholders in the skill:** the skill needs template commands such as `--skill <name>`, which `commandsIn` treats as an error in READMEs. The skill-file check replaces each `<...>` token with a dummy value before calling `parseArgs`, and checks skill and tag names against the catalog only for tokens that were not placeholders.

## Phase 1: Skill content

### Overview

Write the `pa-skills` skill and its README so that the catalog loads it and the existing README tests pass.

### Changes Required:

#### 1. Skill definition

**File**: `dist/skills/pa-skills/SKILL.md`

**Intent**: Teach an agent to run the six CLI commands safely and to read their results, using one shared rule set.

**Contract**:
- Frontmatter:
  - `name: pa-skills`
  - a `description` that triggers on installing, removing, updating, checking or listing project skills, or on reading their release notes
  - `tags: [cli]`
  - `argument-hint: "<add|remove|update|check|changes|list> [--skill a,b] [--tag x,y] [--agent a,b] [--agents-md] [--dry-run]"`
- Sections:
  - **Command routing** table: command → npx form → what it does.
  - **Shared rules**:
    - Resolve names with `list` first.
    - Always pass explicit `--skill` / `--tag`, because there is no TTY.
    - For `add` / `remove` / `update`, run the same command with `--dry-run`, show its output, and run it for real only after the user explicitly says yes.
    - Never add `--force`, and never choose `--agent` values, unless the user asked for that exact flag.
    - A bare `remove` and `remove --agent` get an extra warning that files will be deleted.
    - Mention `--cwd` only when the user names another project root.
  - **Version rule**: the predicate from Critical Implementation Details.
  - **Exit codes**: 0 ok; 1 error (report stderr); 2 usage error (fix the arguments, or pass on the CLI's own `--agent` suggestion and ask the user); 3 `check` pending (report, not a failure).
  - **Refusals to pass on**: the both-agents detection on `add` and the 0.2.x upgrade error on `update` / `check`. Quote the CLI's message and its suggested commands, ask the user which one, and never pick `add --agent claude-code` alone in that state.
  - **Per-command recipes** (`add`, `remove`, `update`, `check`, `changes`, `list`), each with one or two concrete command examples.
  - **Reporting**: after a write, summarize what changed and remind the user to commit `.pa-skills.json`, plus the installed files and any rules-file block.

#### 2. Skill README

**File**: `dist/skills/pa-skills/README.md`

**Intent**: Match the other skill READMEs and satisfy the README tests.

**Contract**:
- Contains `npx @pavel-agarkov/skills add --skill pa-skills`.
- Contains `npx @pavel-agarkov/skills add --tag cli`.
- Contains a multi-tag example such as `npx @pavel-agarkov/skills add --tag cli,learning`.
- Gives one line on what the skill does and points to the package README.

### Success Criteria:

#### Automated Verification:

- The catalog loads the new skill: `node bin/cli.js list` prints `pa-skills  [cli]`
- `node bin/cli.js list --tag cli` lists only `pa-skills`
- The existing README tests pass: `node --test test/docs.test.js`

#### Manual Verification:

- SKILL.md states the dry-run-then-confirm rule, the no-`--force` / no-`--agent` rule and the version predicate exactly as decided
- SKILL.md covers all six commands with at least one concrete example each

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Drift and catalog tests

### Overview

Make CI fail when the skill and the CLI disagree, and update the hard-coded skill count.

### Changes Required:

#### 1. Skill drift checks

**File**: `test/docs.test.js`

**Intent**: Catch a new command or flag that the skill doesn't mention, or a skill command that stops parsing.

**Contract**: New tests over every file in `dist/skills/pa-skills/` (`SKILL.md` and any `references/*.md`):
- Every `npx @pavel-agarkov/skills[@ver] ...` command, with `<...>` placeholders replaced by a dummy value, parses with `parseArgs`. Every non-placeholder `--skill` / `--tag` value exists in the catalog. There are at least six such commands.
- Every entry of `COMMANDS` except `help` appears as a routed command.
- Every long and short flag in the `Options:` block of `bin/cli.js` `HELP` (read from the file text) appears in `SKILL.md`.
- Exit codes `0`, `1`, `2` and `3` are each documented.
- `update`, `check` and `changes` examples use `@latest`, and `add`, `remove` and `list` examples do not.

#### 2. Catalog expectation

**File**: `test/catalog.test.js`

**Intent**: The real-repo test expects exactly the shipped skills.

**Contract**: The expected folder list becomes `['aspnet-layered-service-scaffold', 'interview-trainer', 'pa-skills']`, and it asserts that `tags.get('cli')` is `['pa-skills']`.

### Success Criteria:

#### Automated Verification:

- The full suite passes: `npm test`
- The drift test fails when a dummy flag (for example `--foo`) is added temporarily to the `HELP` options in `bin/cli.js`. Revert afterwards.
- The version test fails when `@latest` is removed temporarily from one `update` example in SKILL.md. Revert afterwards.

#### Manual Verification:

- The failure messages name the missing flag, command or offending command line clearly enough to fix without reading the test

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Docs and release

### Overview

List the skill in the package README and prepare the 0.4.0 release.

### Changes Required:

#### 1. Root README

**File**: `README.md`

**Intent**: Advertise the skill and its tag.

**Contract**: A new row in the `## Skills` table: `pa-skills` | `` `cli` `` | a short description. Add one Quick start example, `npx @pavel-agarkov/skills add --skill pa-skills`.

#### 2. Version and changelog

**Files**: `package.json`, `changelog.json`, `CHANGELOG.md`

**Intent**: Publish the skill as a minor release through the existing PR flow.

**Contract**:
- `version` becomes `0.4.0`.
- A new top entry in `changelog.json` for `0.4.0` notes the new `pa-skills` skill (tag `cli`) and that it previews every write with `--dry-run` and asks before running it.
- `CHANGELOG.md` is regenerated with `npm run changelog`.

### Success Criteria:

#### Automated Verification:

- The full suite passes: `npm test`
- The release check passes against main: `node scripts/release-check.js 0.3.0` (the base version, as CI passes it)
- `CHANGELOG.md` is up to date: `npm run changelog` leaves `git diff --exit-code CHANGELOG.md` clean
- `node bin/cli.js --version` prints `0.4.0`

#### Manual Verification:

- In a scratch project, `node <repo>/bin/cli.js add --skill pa-skills` installs the skill. An agent asked to "add interview-trainer" then runs `list`, then `add --skill interview-trainer --dry-run`, asks, and only then runs the real `add`
- In the same scratch project, asking "are my skills up to date?" makes the agent run `check` with `@latest` and read exit code 3 as "updates pending"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Drift tests in `test/docs.test.js` (commands parse, full command and flag coverage, exit codes, version predicate)
- Catalog count and tag index in `test/catalog.test.js`

### Integration Tests:

- None new. The existing `add` / `remove` tests already cover installing any catalog skill.

### Manual Testing Steps:

1. Install `pa-skills` into a scratch project, ask the agent to add a skill, and confirm that a dry run and a question come before any write.
2. Ask the agent to "remove everything" and confirm the extra deletion warning.
3. In a scratch project with both `.claude/` and `.agents/`, ask the agent to add a skill. Confirm that it passes on the CLI's `--agent` suggestion and asks the user instead of choosing.

## Performance Considerations

None. The skill is static Markdown, and the tests read a few files.

## Migration Notes

None. This is an additive catalog entry, and existing installs are unaffected until a user selects `pa-skills`.

## References

- Pattern for routing subcommands: `dist/skills/interview-trainer/SKILL.md:5-36`
- README command checks: `test/docs.test.js:16-50`
- CLI help and exit codes: `bin/cli.js:18-40`
- Dangerous paths and the version caveat: `README.md:23`, `README.md:80`, `README.md:96-107`
- Previous change: `context/changes/multi-harness-install/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Skill content

#### Automated

- [x] 1.1 The catalog loads the new skill: `node bin/cli.js list` prints `pa-skills  [cli]` — ae2ff05
- [x] 1.2 `node bin/cli.js list --tag cli` lists only `pa-skills` — ae2ff05
- [x] 1.3 The existing README tests pass: `node --test test/docs.test.js` — ae2ff05

#### Manual

- [x] 1.4 SKILL.md states the dry-run-then-confirm rule, the no-`--force` / no-`--agent` rule and the version predicate exactly as decided — ae2ff05
- [x] 1.5 SKILL.md covers all six commands with at least one concrete example each — ae2ff05

### Phase 2: Drift and catalog tests

#### Automated

- [x] 2.1 The full suite passes: `npm test` — 9679877
- [x] 2.2 The drift test fails when a dummy flag (for example `--foo`) is added temporarily to the `HELP` options in `bin/cli.js`. Revert afterwards. — 9679877
- [x] 2.3 The version test fails when `@latest` is removed temporarily from one `update` example in SKILL.md. Revert afterwards. — 9679877

#### Manual

- [x] 2.4 The failure messages name the missing flag, command or offending command line clearly enough to fix without reading the test — 9679877

### Phase 3: Docs and release

#### Automated

- [x] 3.1 The full suite passes: `npm test` — 4aff8f9
- [x] 3.2 The release check passes against main: `node scripts/release-check.js 0.3.0` (the base version, as CI passes it) — 4aff8f9
- [x] 3.3 `CHANGELOG.md` is up to date: `npm run changelog` leaves `git diff --exit-code CHANGELOG.md` clean — 4aff8f9
- [x] 3.4 `node bin/cli.js --version` prints `0.4.0` — 4aff8f9

#### Manual

- [x] 3.5 In a scratch project, `node <repo>/bin/cli.js add --skill pa-skills` installs the skill. An agent asked to "add interview-trainer" then runs `list`, then `add --skill interview-trainer --dry-run`, asks, and only then runs the real `add` — 4aff8f9
- [x] 3.6 In the same scratch project, asking "are my skills up to date?" makes the agent run `check` with `@latest` and read exit code 3 as "updates pending" — 4aff8f9
