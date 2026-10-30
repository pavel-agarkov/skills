# Auto-publish on PR merge with required release notes — Implementation Plan

## Overview

Publish `@pavel-agarkov/skills` automatically when a PR that bumped `package.json` `version` is merged to `main`. No tag, command or manual dispatch is needed. Release notes become a required, shipped `changelog.json`, with a generated `CHANGELOG.md` committed next to it. A new `skills changes` command shows the notes since the version recorded in the project config, and `update` prints the same list after a real update.

## Current State Analysis

- [publish.yml:3-7](.github/workflows/publish.yml) triggers only on a `v*` tag and `workflow_dispatch`. No workflow runs on pull requests.
- The publish job ([publish.yml:24-52](.github/workflows/publish.yml)) has `contents: read`, a tag/version guard (dead once the tag trigger is gone), a `npm view` guard that **fails** when the version exists, and `npm publish --provenance --access public`.
- npm Trusted Publishing binds the owner, the repository and the workflow **filename** `publish.yml`. It has no trigger or branch field, so changing the trigger needs no npm change, but `npm publish` must stay in `publish.yml` (research, "npm trusted publishing constraints").
- [docs.test.js:71-86](test/docs.test.js:71) statically checks the workflow:
  - it pins `tags: - 'v*'` and `workflow_dispatch`;
  - it forbids `secrets.`, so a `gh` step must use `${{ github.token }}`.
- [docs.test.js:28-41](test/docs.test.js:28) parses every README `npx` example with `parseArgs`.
- The config already records `packageVersion` ([config.js:36](src/config.js:36)).
  - `readConfig` returns `null` when the file is missing ([config.js:62-64](src/config.js:62)).
  - The CLI passes the running version as `ctx.packageVersion` ([cli.js:96](bin/cli.js:96)).
  - `runSaved` reads `prev` before `reconcile` writes the new version ([update.js:12-29](src/commands/update.js:12)).
- There is no `CHANGELOG.md`, no `changelog.json`, no `scripts/` folder, and no remote tags. `package.json` `files` lists `bin/`, `src/`, `dist/skills/` and `README.md` ([package.json:9-14](package.json)).
- The repo has zero runtime dependencies. Tests run with `node --test`.

## Desired End State

- A PR author bumps `version` and adds a `changelog.json` entry, then runs `npm run changelog`, which regenerates `CHANGELOG.md`.
- On the PR, `ci.yml` runs the test matrix and `release-check`. One aggregate `ci` check is green only if both pass.
- On merge to `main`, `publish.yml`:
  - runs the tests;
  - skips quietly if that version is already on npm;
  - otherwise publishes with trusted publishing and creates the `v<version>` tag and GitHub Release, with that version's notes as the body.
- A merge that leaves the version unchanged publishes nothing.
- `npx @pavel-agarkov/skills changes` prints the entries newer than the recorded version, newest first, or one of the fixed messages below.
- `update` (not `--dry-run`, not `check`) prints the same entries for the range from the old recorded version to the running one.

Verification: `npm test` passes, and a test PR shows a required `ci` check. After merging the `0.2.0` PR, npm lists `0.2.0` with provenance, the repo shows the `v0.2.0` tag and Release, and `npx @pavel-agarkov/skills@0.2.0 changes` behaves as specified.

### Key Discoveries:

- `runSaved` has `prev.packageVersion` (old) and `ctx.packageVersion` (new) in scope before the write ([update.js:12](src/commands/update.js:12)). That is where `update` prints the changes.
- Commands receive injected `catalog` / `packageVersion` through `ctx`, and tests build `ctx` with `ctxFor` ([helpers.js:14](test/helpers.js:14)). The changelog follows the same injection.
- A required check skipped by `if:` counts as success, and a `paths`-filtered workflow stays "Pending". The aggregate job must run unconditionally (`if: always()`) and fail explicitly (research, "PR check").
- `actions/checkout` on a PR checks out the merge ref with depth 1. The base version needs an explicit `git fetch --depth=1 origin "$GITHUB_BASE_REF"` and then `git show FETCH_HEAD:package.json`.
- A tag or Release created with `GITHUB_TOKEN` does not trigger new workflow runs, so it cannot re-trigger publishing.

## What We're NOT Doing

- No prerelease versions or npm dist-tags. Only plain `x.y.z`, enforced by validation.
- No release dates in `changelog.json` or `CHANGELOG.md`. The GitHub Release carries the publish date.
- No freezing of published entries. Old entries may be edited, as long as the structure stays valid.
- No changed-files detection or path filters. Every PR runs the full check, and an unchanged version simply means no publish.
- No `v*` tag trigger. Manually pushed tags do not publish.
- No PR-body release notes.
- No changes to the npm Trusted Publisher (the file name stays `publish.yml`).
- `check` and `update --dry-run` do not print changes.

## Implementation Approach

The changelog is the shared core. `src/changelog.js` (shipped, zero dependencies) holds the parse/validate/compare/range/render functions, which are used by:

- the CLI;
- the generator script `scripts/changelog.js`, which writes `CHANGELOG.md` or prints one version's notes for the GitHub Release;
- the PR check script `scripts/release-check.js`;
- the tests.

Data and tooling come first. Then the user-facing command, then the CI wiring, then the first real release through the new path.

## Critical Implementation Details

- **Publish order:** run `npm publish` before `gh release create`. A failed Release then leaves a published version that can be tagged by hand. The reverse order would leave a tag with no package. Publishing is gated on a step output ("version not yet on npm"), not on a job-level `if:`, so a re-run of an already-published merge is a green no-op.
- **First run:** research reports, unverified, that `GITHUB_TOKEN` may be refused when creating a tag on a commit that changes `.github/workflows`. That is exactly the `0.2.0` merge. If the Release step fails there, create `v0.2.0` and its Release by hand from `node scripts/changelog.js notes 0.2.0`; npm has already published.

## Phase 1: Changelog data and tooling

### Overview

Introduce the release-notes master file, its shared helpers, the generated Markdown, and the tests that keep them consistent with `package.json`.

### Changes Required:

#### 1. Changelog master file

**File**: `changelog.json`

**Intent**: The single source of release notes, read by the CLI and the tooling. Seeded with the already-published `0.1.0`.

**Contract**: A JSON array of entries, newest first: `{ "version": "x.y.z", "notes": ["non-empty string", ...] }`. The seed is `[{ "version": "0.1.0", "notes": ["Initial release."] }]`. There are no other fields.

#### 2. Shared helpers

**File**: `src/changelog.js`

**Intent**: Zero-dependency functions shared by the CLI, the scripts and the tests.

**Contract**: These exports, which throw a descriptive `Error` on invalid input, matching the style of `validateConfig`:

- `PLAIN_VERSION`: the regex `^\d+\.\d+\.\d+$`, with no leading `v`.
- `isPlainVersion(v)`.
- `compareVersions(a, b)`: numeric three-part comparison returning -1, 0 or 1. Both arguments must be plain versions.
- `loadChangelog(packageRoot)`: reads `changelog.json` and returns the validated entries.
- `validateChangelog(entries, packageVersion)`. It requires:
  - a non-empty array;
  - every version plain and unique;
  - every `notes` a non-empty array of non-empty strings;
  - strictly descending order;
  - `entries[0].version === packageVersion`.
- `entriesBetween(entries, from, to)`: the entries with `from < v ≤ to`, newest first. A `from` that is not a plain version counts as older than every entry.
- `renderMarkdown(entries)`: the full `CHANGELOG.md` text, with a `# Changelog` title, `## <version>` headings, `- note` bullets and a trailing newline.
- `renderNotes(entry)`: the bullet list only, used for the GitHub Release body.

#### 3. Generator script

**File**: `scripts/changelog.js`, plus a `package.json` script `"changelog": "node scripts/changelog.js"`

**Intent**: Regenerate `CHANGELOG.md` from the JSON. It also prints one version's notes for the publish job.

**Contract**:

- No arguments: write `CHANGELOG.md` at the repo root and exit 0.
- `notes <version>`: print `renderNotes` for that entry to stdout; exit 1 if the entry is missing.
- `scripts/` is not added to `files`, so it does not ship.

#### 4. Committed Markdown and packaging

**File**: `CHANGELOG.md`, `package.json`

**Intent**: Human-readable history on GitHub and in the tarball, byte-equal to the generator output.

**Contract**: `CHANGELOG.md` is generated, never hand-edited. `package.json` `files` gains `changelog.json` and `CHANGELOG.md`.

#### 5. Tests

**File**: `test/changelog.test.js`

**Intent**: Lock in the helpers and keep the repo consistent.

**Contract**: The tests cover:

- `compareVersions` (including `0.10.0 > 0.9.0`) and `isPlainVersion` (rejects `0.0.0-stage`, `v1.0.0`, `1.0`);
- each `validateChangelog` failure: duplicate, wrong order, empty notes, non-plain version, top entry ≠ package version;
- `entriesBetween`: equal bounds give an empty result, and a non-plain `from` gives everything up to `to`;
- the real `changelog.json` validates against the real `package.json` version;
- the committed `CHANGELOG.md` equals `renderMarkdown(loadChangelog(root))` (the drift test), with an assertion message that says to run `npm run changelog`;
- `npm pack --dry-run --json` lists `changelog.json` and `CHANGELOG.md`, or alternatively a check of the `files` entries (the test must not need network access).

### Success Criteria:

#### Automated Verification:

- All tests pass: `npm test`
- The generator is idempotent: `npm run changelog`, then `git diff --exit-code CHANGELOG.md`
- `node scripts/changelog.js notes 0.1.0` prints `- Initial release.`, and `node scripts/changelog.js notes 9.9.9` exits 1
- `npm pack --dry-run` lists `changelog.json` and `CHANGELOG.md`

#### Manual Verification:

- `CHANGELOG.md` reads well when rendered on GitHub

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: `changes` command, and `update` prints the changes

### Overview

Show users what changed since the version their project config records, both on demand and right after an update.

### Changes Required:

#### 1. Command handler

**File**: `src/commands/changes.js`

**Intent**: A read-only command that compares the config's `packageVersion` with the running version and prints the matching entries or a fixed message. It never writes and always exits 0 (except for a corrupt config, which throws as other commands do).

**Contract**: `export async function changes(opts, ctx)`, where `ctx` has `{ cwd, changelog, packageVersion, out }`. The output by case:

| Case | Output |
| --- | --- |
| no config (`readConfig` returns `null`) | `Nothing installed yet, so there are no changes to show.` |
| recorded `===` running | `You already have <running>; no changes to show.` |
| recorded is plain and newer than running | `This CLI (<running>) is older than the installed version (<recorded>). Run "npx @pavel-agarkov/skills@latest changes".` |
| recorded is older, or not plain (e.g. `0.0.0-stage`) | `Changes since <recorded>:`, then for each entry from `entriesBetween(changelog, recorded, running)`: `<version>` and indented `- note` lines |
| range is empty (defensive) | `No changelog entries between <recorded> and <running>.` |

The entry-printing format is a small helper shared with `update`, for example `printChanges(out, entries, from)` exported from `src/changelog.js` or from this module.

#### 2. `update` prints the changes

**File**: `src/commands/update.js`

**Intent**: After a real update, show what the new package version brings, using the version recorded *before* the write.

**Contract**: In `runSaved`, when `!check && !opts.dryRun`, and `prev.packageVersion` differs from `packageVersion` and is older or not plain, print the entries for that range after `printSummary`, in the shared format. If `ctx.changelog` is absent, nothing is printed. That keeps existing callers working; the CLI always passes it.

#### 3. Wiring

**File**: `src/args.js`, `bin/cli.js`, `test/helpers.js`

**Intent**: Register the command and inject the changelog the same way as the catalog.

**Contract**:

- `COMMANDS` gains `'changes'`.
- `cli.js` gains a `changes` handler. `ctx` gains `changelog: loadChangelog(packageRoot)` for `changes`, `update` and the other commands that share the ctx block.
- `HELP` gains `changes       Show release notes since the version recorded in the project config` and the example `npx @pavel-agarkov/skills changes`.
- `ctxFor` defaults `changelog` to the real one loaded from `repoRoot`.

#### 4. Docs

**File**: `README.md`

**Intent**: Document the command and its place in the update flow.

**Contract**:

- The "Commands" section lists `changes`.
- The "Updating" subsection says that `update` prints the release notes between your previous and the new version, and that `npx @pavel-agarkov/skills@latest changes` previews them before updating.
- Every example must parse (checked by the existing docs test).

#### 5. Tests

**File**: `test/changes.test.js`, plus additions to `test/update.test.js` and `test/args.test.js`

**Intent**: Cover every row of the output table, and the `update` printing rules.

**Contract**:

- `changes` tests use an injected `changelog` (for example three entries) and `packageVersion`. They cover each table row, with the recorded version set by writing the config after `add`. Every case must leave the snapshot unchanged.
- `update` tests check that output contains the range after a version change. Nothing is printed when the version is unchanged, with `--dry-run`, or in `check`.
- The `args` test checks that `parseArgs(['changes'])` gives `command: 'changes'`.
- A CLI spawn test checks that `node bin/cli.js changes --cwd <empty dir>` exits 0 and prints the "nothing installed" message.

### Success Criteria:

#### Automated Verification:

- All tests pass: `npm test`
- `node bin/cli.js changes --cwd <new temp dir>` prints the "Nothing installed yet" message and exits 0
- `node bin/cli.js --help` lists `changes`

#### Manual Verification:

- In a scratch project: `add --skill interview-trainer`, then edit `packageVersion` in `.agents/.pa-skills-config.json` to `0.0.0-stage`. Check that `changes` lists all entries and that `update` prints them and then records the running version. A second `changes` says "You already have".

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: CI and publish workflows

### Overview

Add a PR workflow with one stable required check. Make `publish.yml` publish automatically on push to `main` when the version is new, then tag and release.

### Changes Required:

#### 1. Release check script

**File**: `scripts/release-check.js`

**Intent**: Decide on a PR whether the version change is allowed. The structure of the notes is already enforced by `npm test` through `validateChangelog`; this script adds the comparison with the base branch.

**Contract**:

- Invocation: `node scripts/release-check.js <baseVersion>`. It reads the head `package.json` and `changelog.json`.
- Unchanged version: print `version <v> unchanged; nothing will be published on merge` and exit 0.
- Otherwise it requires a plain head version, strictly greater than the base, and a `changelog.json` entry for it with non-empty notes. It then prints `<base> -> <head> will be published on merge` and exits 0.
- Any failure prints a clear message and exits 1.
- The core is an exported `checkRelease({ baseVersion, headVersion, entries })` that returns `{ ok, message }`, so tests do not spawn git. A non-plain base (for example from an old branch) only requires the head to be plain and have an entry.

#### 2. PR workflow

**File**: `.github/workflows/ci.yml`

**Intent**: Run on every PR, with no path filters, and expose one check to require in branch protection.

**Contract**: `on: pull_request` (default types). Jobs:

- `test`: the same matrix as today: `ubuntu-latest`/`windows-latest` × `'22'`/`latest`, `fail-fast: false`, `npm test`.
- `release-check`: on Ubuntu, Node `'22'`. It checks out, fetches the base, reads the base version from `FETCH_HEAD:package.json`, and runs `node scripts/release-check.js "$BASE_VERSION"`. `GITHUB_BASE_REF` is passed through `env:`.
- `ci`: `needs: [test, release-check]`, `if: always()`, `runs-on: ubuntu-latest`. It exits 1 unless both `needs.*.result` values are `success`, with the results passed through `env:`.

It uses no secrets and `permissions: contents: read`.

#### 3. Publish workflow

**File**: `.github/workflows/publish.yml` (the name must not change)

**Intent**: Publish automatically on merge to `main` when the version is new. `workflow_dispatch` stays as a manual retry.

**Contract**:

- `on: push: branches: [main]` plus `workflow_dispatch`. The `v*` tag trigger is removed.
- `concurrency: { group: publish, cancel-in-progress: false }`.
- The `test` job is unchanged.
- The `publish` job: `needs: test`, permissions `contents: write` and `id-token: write`, Node `'24'` with `registry-url: 'https://registry.npmjs.org'`. Its steps:
  1. A step named "Check whether this version is already published" sets `outputs.publish=true|false` through `npm view`. It exits 0 in both cases and logs "already published; skipping" when the version exists.
  2. The remaining steps run with `if: steps.<id>.outputs.publish == 'true'`:
     - ensure npm ≥ 11.5.1 (`npm install -g npm@latest`, then `npm -v`);
     - `npm publish --provenance --access public`;
     - `node scripts/changelog.js notes "$VERSION" > notes.md`;
     - `gh release create "v$VERSION" --notes-file notes.md --target "$GITHUB_SHA" --title "v$VERSION"`, with `GH_TOKEN: ${{ github.token }}`.
- The tag/version guard step is deleted.

#### 4. Docs tests

**File**: `test/docs.test.js`

**Intent**: Pin the new contracts and drop the old trigger assertions.

**Contract**:

- `publish.yml`:
  - keeps the asserts for `npm view`, the publish command, `id-token: write`, the OSes, `'22'`, `needs: test`, the registry URL, the no-token rules and the ban on `secrets.`;
  - adds asserts for `branches: [main]` (or the block form), `workflow_dispatch`, `contents: write`, `gh release create`, `scripts/changelog.js notes`, and `cancel-in-progress: false`;
  - asserts that there is no `tags:` trigger.
- A new test for `ci.yml` asserts `pull_request`, both OSes, `'22'`, `scripts/release-check.js`, a `ci:` job with `if: always()` and `needs: [test, release-check]`, no `paths:`, and no `secrets.`/token.
- `test/release-check.test.js` covers `checkRelease`:
  - unchanged → ok;
  - bump with an entry → ok;
  - bump without an entry → fail;
  - lower version → fail;
  - equal-but-reformatted version (for example `v0.2.0`) → fail;
  - prerelease head → fail;
  - non-plain base → ok when the head is valid.

#### 5. Publishing docs

**File**: `README.md`

**Intent**: Replace the tag-flow description with the merge flow and the author checklist.

**Contract**: The "Publishing" section covers:

- what `ci` checks;
- the author steps: bump `version`, add a `changelog.json` entry, run `npm run changelog`;
- what a merge to `main` does: publish if the version is new, then the `v<version>` tag and Release;
- that an unchanged version publishes nothing;
- that `workflow_dispatch` is a safe retry;
- that the Trusted Publisher stays bound to `publish.yml`.

### Success Criteria:

#### Automated Verification:

- All tests pass: `npm test`
- `git grep -n "secrets\." .github/` returns nothing
- `node scripts/release-check.js 0.1.0` exits 0 on the unchanged tree, and `node scripts/release-check.js 9.9.9` exits 1

#### Manual Verification:

- Workflow YAML is valid: after pushing the branch, the PR shows the `test` legs, `release-check` and `ci` checks, and all pass

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: First release and repo settings

### Overview

Ship this change as `0.2.0` through the new path, and turn on the repository and npm settings the design relies on.

### Changes Required:

#### 1. Version bump and notes

**File**: `package.json`, `changelog.json`, `CHANGELOG.md`

**Intent**: The PR that introduces the new command is itself a release, and this exercises the whole flow.

**Contract**:

- `version` becomes `0.2.0`.
- A new top entry `0.2.0` has notes covering the `changes` command, `update` printing the release notes, and the shipped changelog files.
- `CHANGELOG.md` is regenerated.

#### 2. External settings (user actions, no repo files)

**Intent**: Make the `ci` check blocking, and make sure the OIDC publish can succeed.

**Contract**:

- On npmjs.com, the package's Trusted Publisher for `pavel-agarkov/skills` + `publish.yml` exists and allows direct `npm publish`, not stage-only.
- Branch protection (or a ruleset) on `main`:
  - requires the `ci` status check (selectable after its first run on the PR);
  - requires branches to be up to date before merging;
  - allows no bypass, so direct pushes cannot skip `ci`.

### Success Criteria:

#### Automated Verification:

- All tests pass with the bumped version: `npm test`
- `node scripts/release-check.js 0.1.0` prints `0.1.0 -> 0.2.0 will be published on merge`

#### Manual Verification:

- The Trusted Publisher is confirmed to allow direct `npm publish` for `publish.yml`
- Branch protection on `main` requires `ci`, requires up-to-date branches, and allows no bypass
- After merge, the `publish.yml` run publishes `0.2.0`: `npm view @pavel-agarkov/skills@0.2.0` resolves with provenance
- The `v0.2.0` tag and GitHub Release exist with the `0.2.0` notes (or were created by hand if the first-run token limit hit)
- In a project with a `0.1.0` config, `npx @pavel-agarkov/skills@0.2.0 changes` lists `0.2.0`, and `update` prints the notes
- Re-running the publish workflow by dispatch on the same commit skips publishing and succeeds

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `src/changelog.js`:
  - version comparison;
  - validation failures, one per rule;
  - range selection, including non-plain `from`;
  - rendering.
- `checkRelease`: every pass/fail branch listed in Phase 3.
- `changes`: every row of the output table, and that it never writes.
- `update`: prints the range only on a real run with a version change.

### Integration Tests:

- A CLI spawn of `changes` on an empty directory.
- The drift test between `changelog.json` and `CHANGELOG.md`.
- Static workflow assertions for `ci.yml` and `publish.yml`.
- README examples parse.

### Manual Testing Steps:

1. Open the PR. Check that the `ci` check aggregates the test legs and `release-check`.
2. Temporarily remove the `0.2.0` entry on the branch and check that `ci` fails. Then restore the entry.
3. Merge, then verify the npm publish, the tag and Release, and the CLI behaviour from `0.2.0`.

## Migration Notes

- Existing configs keep their `packageVersion`. Users on `0.1.0` see the `0.2.0` notes on their next `update`. A `0.0.0-stage` config counts as older than everything.
- After this lands, any merged PR that bumps `version` publishes. Contributors must follow the README checklist, and the `ci` check enforces it.

## References

- Related research: `context/changes/simple-publish/research.md`
- Prior publish contract: `context/changes/ai-skills-distribution-package/plan.md:421-441`
- Current workflow: `.github/workflows/publish.yml:3-52`
- Static workflow test: `test/docs.test.js:71-86`
- Saved-selection flow: `src/commands/update.js:12-29`
- Config shape: `src/config.js:29-60`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Changelog data and tooling

#### Automated

- [x] 1.1 All tests pass: `npm test` — 6e45ccd
- [x] 1.2 The generator is idempotent: `npm run changelog`, then `git diff --exit-code CHANGELOG.md` — 6e45ccd
- [x] 1.3 `node scripts/changelog.js notes 0.1.0` prints `- Initial release.`, and `node scripts/changelog.js notes 9.9.9` exits 1 — 6e45ccd
- [x] 1.4 `npm pack --dry-run` lists `changelog.json` and `CHANGELOG.md` — 6e45ccd

#### Manual

- [x] 1.5 `CHANGELOG.md` reads well when rendered on GitHub — 6e45ccd

### Phase 2: `changes` command, and `update` prints the changes

#### Automated

- [x] 2.1 All tests pass: `npm test`
- [x] 2.2 `node bin/cli.js changes --cwd <new temp dir>` prints the "Nothing installed yet" message and exits 0
- [x] 2.3 `node bin/cli.js --help` lists `changes`

#### Manual

- [x] 2.4 Scratch project with a `0.0.0-stage` recorded version: `changes` lists all entries, `update` prints them and records the running version, and a second `changes` says "You already have"

### Phase 3: CI and publish workflows

#### Automated

- [ ] 3.1 All tests pass: `npm test`
- [ ] 3.2 `git grep -n "secrets\." .github/` returns nothing
- [ ] 3.3 `node scripts/release-check.js 0.1.0` exits 0 on the unchanged tree, and `node scripts/release-check.js 9.9.9` exits 1

#### Manual

- [ ] 3.4 Workflow YAML is valid: the PR shows the `test` legs, `release-check` and `ci` checks, and all pass

### Phase 4: First release and repo settings

#### Automated

- [ ] 4.1 All tests pass with the bumped version: `npm test`
- [ ] 4.2 `node scripts/release-check.js 0.1.0` prints `0.1.0 -> 0.2.0 will be published on merge`

#### Manual

- [ ] 4.3 The Trusted Publisher is confirmed to allow direct `npm publish` for `publish.yml`
- [ ] 4.4 Branch protection on `main` requires `ci`, requires up-to-date branches, and allows no bypass
- [ ] 4.5 After merge, the `publish.yml` run publishes `0.2.0` with provenance
- [ ] 4.6 The `v0.2.0` tag and GitHub Release exist with the `0.2.0` notes
- [ ] 4.7 From `0.2.0`, `changes` lists `0.2.0` for a `0.1.0` config, and `update` prints the notes
- [ ] 4.8 Re-running the publish workflow by dispatch on the same commit skips publishing and succeeds
