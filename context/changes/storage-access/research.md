---
date: 2026-11-06T11:11:14+01:00
researcher: Pavel Agarkov (with Claude Opus 5.5)
git_commit: 7a9205ef0aa055a2482a7796461c556a9efad974
branch: claude/10x-new-storage-access-26f352
repository: pavel-agarkov/skills
topic: "interview-trainer: scriptable JSON storage, script runtime choice, and per-skill versioning"
tags: [research, interview-trainer, storage, scripting, versioning, catalog, sync]
status: complete
last_updated: 2026-11-06
last_updated_by: Pavel Agarkov (with Claude Opus 5.5)
last_updated_note: "Follow-up: exact Node TypeScript version history from the official docs; option to author in TS and ship built JS, for the skill scripts and the CLI"
---

# Research: interview-trainer storage, scripting runtime and skill versioning

**Date**: 2026-11-06T11:11:14+01:00
**Researcher**: Pavel Agarkov (with Claude Opus 5.5)
**Git Commit**: 7a9205ef0aa055a2482a7796461c556a9efad974
**Branch**: claude/10x-new-storage-access-26f352
**Repository**: pavel-agarkov/skills

## Research Question

The interview-trainer skill has agents write ad hoc scripts every session to check and change its state (see [session-scripts-summary.md](session-scripts-summary.md)). Its state is Markdown, which neither the user nor agents really need to read. The questions are:

1. Should the state move to a deterministic, script-friendly format such as JSON?
2. Which scripting runtime is most likely already installed on users' machines, while staying easy for a .NET/TypeScript backend developer to review?
3. Skills have no version of their own; only the CLI package is versioned. How lightly can a breaking storage change be handled? The constraint: nobody uses the skill yet, so the old storage can be dropped.

## Summary

- **Storage.** All 10 storage locations are Markdown with `key: value` lines and pipe tables ([storage.md:5-14](../../../dist/skills/interview-trainer/references/storage.md)). Only the transcript and archive are meant for a person to read; the skill must never read those back ([SKILL.md:74](../../../dist/skills/interview-trainer/SKILL.md)). Everything else is machine state. Most state changes are already specified as fixed, ordered steps:
  - grading: [grading.md:11-18](../../../dist/skills/interview-trainer/references/grading.md)
  - presenting a question: [questions.md:40-46](../../../dist/skills/interview-trainer/references/questions.md)
  - starting, completing and archiving a session: [sessions.md:20](../../../dist/skills/interview-trainer/references/sessions.md), [sessions.md:83-89](../../../dist/skills/interview-trainer/references/sessions.md)

  Because these steps are fixed, they can be scripts that take their inputs from the agent. The session report shows the cost of not having such scripts: four separate ad hoc steps (check, preflight, append-then-move, re-check), one of which failed on a regex and had to be redone ([session-scripts-summary.md:102](session-scripts-summary.md)).
- **Runtime.** Use Node ES modules (`.mjs`) that import only `node:` built-ins. Reasons:
  - The CLI that installs the skill requires Node ≥22 ([package.json](../../../package.json) `engines`).
  - The installer copies every file in the skill folder, `scripts/` included ([src/catalog.js:43-51](../../../src/catalog.js), [src/sync.js:117-119](../../../src/sync.js)).
  - The sibling 10x skills already use this exact pattern.

  The other runtimes are weaker:
  - Python is missing by default on Windows.
  - PowerShell 7 is missing by default on macOS and Linux.
  - Running `.ts` files directly would need Node ≥22.18 (general knowledge, not verified here).
- **Versioning.** Nothing in the CLI tracks a version per skill:
  - The catalog reads only `name`, `description` and `tags` ([src/catalog.js:62-80](../../../src/catalog.js)).
  - The project config records one `packageVersion` ([src/lifecycle.js:51-60](../../../src/lifecycle.js)).
  - `update` silently overwrites files the user has not modified ([src/sync.js:131-132](../../../src/sync.js)).
  - The CLI never touches `.training/` (worker search of src/, bin/ and scripts/).

  So versioning of runtime state already belongs to the skill. The lightest approach that still works: a **new storage root** with its own `schemaVersion`, a script that refuses any version it does not support, the old `.training/` left alone (neither read nor migrated), and a breaking-change note in `changelog.json`. This also gives rollback for free: an older package version keeps using the old `.training/`.
- **Two prior decisions are reversed:**
  - The last trainer change said "The package has no trainer execution engine. Implement the workflow in the shipped Markdown" ([prepare-full-training-session-upfront/plan.md:24](../prepare-full-training-session-upfront/plan.md)).
  - [test/interview-trainer.test.js](../../../test/interview-trainer.test.js) checks the Markdown text only (line 7: "static instruction/packaging contracts") and requires specific Markdown schema examples (lines 63-104). Those assertions would need rewriting.

## Detailed Findings

### Current storage: who reads it and how it changes

The storage locations ([storage.md:5-14](../../../dist/skills/interview-trainer/references/storage.md)), with their readers:

| Path | Read by | Can be JSON? |
|---|---|---|
| `config.md` (schema v3, [storage.md:35](../../../dist/skills/interview-trainer/references/storage.md)) | agent | yes |
| `session.md` (counters, pending op/presentation, current question snapshot, review links) | agent | yes |
| `progress.md` (table) | agent; read in full only by `stats` | yes |
| `history/<topic>.md` | agent, one subtopic record at a time | yes |
| `sources/<topic>.md` | agent | yes |
| `pool/index.md` (schema v1) and `pool/questions/<id>.md` (record schema v1) | agent | yes. The body's `## Criterion Support` notes are free text but fit a JSON string array. |
| `presented.md` (ledger, schema v1) | agent | yes |
| `transcript.md` | append-only; the agent never reads it back ([sessions.md:79](../../../dist/skills/interview-trainer/references/sessions.md)) | **keep Markdown**: it becomes the user-facing archive |
| `archive/<sessionId>.md` | user only; the agent never reads it ([SKILL.md:74](../../../dist/skills/interview-trainer/SKILL.md)) | **keep Markdown** |

Many rules exist only to limit token use while reading Markdown, for example "read only that subtopic's record" ([storage.md:21-28](../../../dist/skills/interview-trainer/references/storage.md)). If a script does the reads and returns a compact JSON answer, those rules shrink to "call the script".

**Deterministic transitions.** These specified operations have no judgment step once their inputs are known, so they are script candidates:

- **Grading bookkeeping** (`grade`), [grading.md:11-18](../../../dist/skills/interview-trainer/references/grading.md):
  - Input: the score, which the agent judges.
  - The script then does steps 1-4, 6, 7 and 8: increment asked/earned, update the diagnostic and level, increment the session counters, add the review link, append the answer block to the transcript, clear the current question and persist. Step 5, the answer summary, is written by the agent and passed in as an input.
  - Supporting rules: diagnostic status ([storage.md:146](../../../dist/skills/interview-trainer/references/storage.md), [questions.md:5](../../../dist/skills/interview-trainer/references/questions.md)), level adaptation ([questions.md:15](../../../dist/skills/interview-trainer/references/questions.md)), and quarter-point scoring ([grading.md:6](../../../dist/skills/interview-trainer/references/grading.md)), which can be validated.
- **Presentation bookkeeping** (`present`), [questions.md:40-46](../../../dist/skills/interview-trainer/references/questions.md):
  - Input: the question snapshot the agent builds.
  - The script appends to history and keeps the newest 5 ([questions.md:28](../../../dist/skills/interview-trainer/references/questions.md)), updates `lastAsked`, increments the format count, appends the question to the transcript, records the ledger entry and fingerprint, and sets the staged→committed marker ([storage.md:236](../../../dist/skills/interview-trainer/references/storage.md)).
  - A single script run that writes these atomically could remove most of the staged/committed recovery prose ([storage.md:232-256](../../../dist/skills/interview-trainer/references/storage.md)). This is my inference: "atomic" here means each file is written via temp-file-and-rename, not a transaction across several files.
- **Session init, complete and abandon.** Session init is [sessions.md:20-28](../../../dist/skills/interview-trainer/references/sessions.md). Complete and abandon are [sessions.md:83-89](../../../dist/skills/interview-trainer/references/sessions.md); they append a summary to the transcript, move it to the archive and clear the session state. This is exactly what ad hoc scripts 2-4 did ([session-scripts-summary.md:32-120](session-scripts-summary.md)).
- **Scheduling inputs.** These include:
  - the weak/medium/strong buckets and the 70/20/10 split ([questions.md:11](../../../dist/skills/interview-trainer/references/questions.md))
  - the diagnostic need ([questions.md:5](../../../dist/skills/interview-trainer/references/questions.md))
  - the format-mix deficit
  - pool eligibility counts ([preparation.md:17](../../../dist/skills/interview-trainer/references/preparation.md))

  A `next-need` command could return the scheduled need. The agent would still apply the judgment-based repetition rules ("materially different" reasoning, [questions.md:28](../../../dist/skills/interview-trainer/references/questions.md)).
- **Validation and recovery checks.** These cover malformed state, counter consistency, unsupported versions ([SKILL.md:76](../../../dist/skills/interview-trainer/SKILL.md)), and pool/ledger corruption cases ([storage.md:230](../../../dist/skills/interview-trainer/references/storage.md)). This was ad hoc script 1.
- **Statistics** ([statistics.md:3-14](../../../dist/skills/interview-trainer/references/statistics.md)): pure aggregation, including the zero-denominator rule.

**Stays with the agent:** question construction, source research and verification, rubric authoring, the score judgment itself, feedback text, taxonomy proposals, and all prompts to the user. Scripts must never present questions or talk to the user. They only take JSON or CLI arguments in and return JSON out.

### The scripting runtime

Evidence from this repo:

- `dist/skills/*` currently contains only `.md` files, so nothing executable has shipped from this repo yet (worker inventory).
- The installer copies every file recursively, with no extension filter ([src/catalog.js:43-51](../../../src/catalog.js)). It writes the bytes without preserving the file mode ([src/sync.js:117-119](../../../src/sync.js)), so `SKILL.md` must call `node <path>`, never `./script`.
- File hashes normalise CRLF ([src/sync.js:17-21](../../../src/sync.js)), so a script checked out on Windows is not flagged as user-modified.
- There are two install targets, `.claude/skills` and `.agents/skills` ([src/agents.js:6-9](../../../src/agents.js)). Scripts must therefore resolve paths from the skill's own folder, not the repository root.
- The sibling skills set a pattern to copy:
  - `10x-research/scripts/metadata-guard.mjs` uses `node:` built-ins only, writes JSON to stdout, exits 1 with the reason on stderr, and replaces files atomically after a SHA-256 check.
  - `10x-ray/SKILL.md` resolves `<this skill's base directory>/scripts/xray.mjs` and takes the base directory from the harness's "Base directory for this skill" line.

General knowledge, not verified in this session:

| Runtime | Default availability | Fit |
|---|---|---|
| Node `.mjs`, `node:` built-ins | Present wherever this CLI or `npx skills` was used to install. Not guaranteed elsewhere: the Claude Code native installer and the Codex binary do not need it. | Best fit. `JSON.parse` is built in. Reads like TypeScript. Testable with the existing `node --test`. |
| Node `.ts` (type stripping) | Version history now verified, see [Follow-up](#follow-up-2026-11-06-node-typescript-support-and-ts-build-option). Enabled by default from 22.18.0 / 23.6.0; stable from 24.12.0 / 25.2.0. | Only if the floor is raised to `>=22.18`. Erasable syntax only: no enums, `import type` required. Refused under `node_modules`. |
| PowerShell | 5.1 is built into Windows; pwsh 7 is absent by default on macOS and Linux | Windows-only unless an install is added |
| Python | Not on Windows by default (the `python` alias opens the Store) | Weakest for Windows users |
| bash / jq | Not native on Windows | Poor |

**Recommendation.** Use `.mjs` with `// @ts-check` and JSDoc types. That gives TypeScript-style checking in an editor and, optionally, `tsc --checkJs` in this repo's CI, with no build step and no extra dependency. If Node is missing at run time, stop and tell the user. Do not fall back to editing state by hand: a hand-editing fallback would reintroduce the non-determinism this change removes.

### Per-skill versioning

- **The catalog ignores extra frontmatter.** The CLI never reads a version per skill ([src/catalog.js:62-80](../../../src/catalog.js)). The frontmatter test only requires string `name` and `description` ([test/vercel-compat.test.js:17-25](../../../test/vercel-compat.test.js)). Adding `version:` to SKILL.md is therefore harmless, but the CLI would do nothing with it.
- **The project config tracks only package-level state:**
  - `packageVersion`
  - per-file SHA-256 hashes
  - the config's own format `version: 2` ([src/lifecycle.js:51-60](../../../src/lifecycle.js))

  The config format is the one thing that has ever been migrated (v1→v2, [src/config.js:93-146](../../../src/config.js)).
- **`update` and `changes` work at package level:**
  - Unmodified files are overwritten.
  - Files the user modified are kept, a warning is printed, and they stop being tracked ([src/sync.js:131-137](../../../src/sync.js)).
  - Files no longer shipped are deleted if unmodified ([src/sync.js:142-159](../../../src/sync.js)).
  - After an update, changelog notes between the old and new package versions are printed ([src/commands/update.js:45-55](../../../src/commands/update.js)).

  There are no hooks or migration steps (worker search for postinstall, migrate and hook).
- **The skill already versions its own runtime state.** Config is v3, and the pool, records and ledger are v1. The rule is to "accept only supported versions… do not guess at or silently upgrade" ([storage.md:152](../../../dist/skills/interview-trainer/references/storage.md)). This is the right layer for the breaking change. The CLI has no role to play.

**Minimal approach for this change:**

1. **New root directory.** For example `.interview-trainer/` holding `state/*.json`, `transcript.md` and `archive/`. Using a new name, not `.training/v4/`, avoids any ambiguity with a legacy `.training/`. Directory name to be confirmed in the plan.
2. **One `schemaVersion` for all JSON files,** or a single `meta.json`. Every script command checks it first and refuses an unknown or newer version, reporting both versions.
3. **Legacy `.training/` handling.** If `.training/` exists and the new root does not, the skill prints one line ("legacy state detected, not migrated; starting fresh") and never reads, moves or deletes it. This is the "set from scratch without touching the old one" requirement.
4. **Changelog.** Bump the package version (minor while it is 0.x) and add a `changelog.json` note saying the change is breaking with no migration. `update` already shows that note to users.
5. **Rollback:** reinstall the previous package version. It still finds its own `.training/` untouched. No extra work is needed.
6. **Optional:** a `version` frontmatter field, or a `SKILL_VERSION` constant in the script that is echoed in its JSON output, purely for diagnostics. Deferring a per-skill version in the CLI loses nothing as long as the storage `schemaVersion` exists.

### Tests and docs that constrain the change

- [test/interview-trainer.test.js](../../../test/interview-trainer.test.js) reads `SKILL.md`, `README.md` and seven reference files (lines 10-18). It requires fenced `markdown` examples and specific Markdown fields (lines 22-28, 63-104). Lines 106-140 hold privacy, recovery and lifecycle invariants that should still be asserted, rephrased around JSON.
- The README talks about pool behaviour, not file formats ([README.md:23-25](../../../dist/skills/interview-trainer/README.md)), so little changes there.
- New script tests could run under `node --test`. If they sit next to the scripts in `dist/skills/interview-trainer/scripts/`, they would also ship to every user. The alternative is to put them in `test/` (decision for the plan).

## Code References

- `dist/skills/interview-trainer/references/storage.md:5-14` - storage file inventory
- `dist/skills/interview-trainer/references/storage.md:152` - version acceptance rule
- `dist/skills/interview-trainer/references/storage.md:232-256` - staged/committed presentation recovery
- `dist/skills/interview-trainer/references/grading.md:11-18` - grading bookkeeping sequence
- `dist/skills/interview-trainer/references/questions.md:40-46` - presentation bookkeeping sequence
- `dist/skills/interview-trainer/references/sessions.md:20-28,83-89` - session init and archival
- `dist/skills/interview-trainer/SKILL.md:72-78` - state access rules
- `src/catalog.js:43-51,62-80` - recursive file listing; frontmatter fields used
- `src/sync.js:17-21,111-139,142-159` - hashing, overwrite/keep policy, removal
- `src/lifecycle.js:51-60` - `.pa-skills.json` shape
- `src/agents.js:6-9` - install targets
- `test/interview-trainer.test.js:7,63-104` - static Markdown contracts
- `context/changes/storage-access/session-scripts-summary.md:9-133` - ad hoc script evidence

## Architecture Insights

- The split to aim for: **the agent judges, the scripts keep the books.** The agent supplies the judged values (question snapshot, score, summary text, taxonomy). A script validates them, applies the specified transitions, persists them and returns compact JSON. This keeps the non-negotiable rules ([SKILL.md:12-21](../../../dist/skills/interview-trainer/SKILL.md)) with the agent while removing hand-edited counters.
- The ad hoc scripts map to commands:
  - script 1 → `validate`
  - scripts 2-3 → `complete` / `abandon`
  - script 4 → post-conditions checked inside every command

  Hand edits made with `apply_patch` ([session-scripts-summary.md:124](session-scripts-summary.md)) become `grade` and `present`.
- Atomicity scope: write each file through a temp file and rename it. Several files cannot be updated as one transaction. Keep a small pending marker, or put all mutable state in one `state.json`, which makes each command a single-file atomic replace. Transcript appends stay separate. A single file is the simplest way to get determinism, and the pool bodies can stay as separate files.

## Historical Context (from prior changes)

- `context/changes/prepare-full-training-session-upfront/plan.md:24`: "no trainer execution engine… not a JavaScript simulation". This change deliberately reverses that decision. Note the difference: that line rejected *simulating* agent behaviour in tests. Shipping bookkeeping scripts is a different thing, so the old rationale only partly applies.
- `context/changes/prepare-full-training-session-upfront/plan.md:78-79,119`: separate pool schema version and "no migration work" when no pool exists. This is the precedent for independent schema versions, now superseded by a single new root.
- `context/changes/multi-harness-install/plan.md:20,67`: the one migration the CLI has done (config v1→v2), with "old CLI fails safely". Same principle: refuse an unknown version rather than guess.
- `context/changes/vercel-skills-research/research.md:34,57-58` and `frame.md:33`: Vercel tracks per-skill folder hashes; this repo adopted only per-file SHA-256 hashes. Per-skill versioning was never decided, and no change deferred it explicitly.

## Related Research

- [context/changes/prepare-full-training-session-upfront/research.md](../prepare-full-training-session-upfront/research.md)
- [context/changes/multi-harness-install/research.md](../multi-harness-install/research.md)
- [context/changes/vercel-skills-research/research.md](../vercel-skills-research/research.md)

## Open Questions

1. **Storage shape.** One `state.json` (simplest atomicity) or per-concern JSON files mirroring today's layout? Pool records most likely stay as separate files.
2. **Root name.** `.interview-trainer/` or something else? Should a legacy `.training/` produce a one-line notice or be silently ignored?
3. **Script granularity.** Commands such as `validate | init | present | grade | complete | abandon | stats | next-need | pool-*`, or a smaller first cut (`validate`, `grade`, `present`, `complete`)?
4. **Script tests.** Ship them next to the scripts, or keep them under `test/`?
5. **TypeScript.** ~~Accept `.mjs` + JSDoc + `@ts-check`, or raise `engines` to `>=22.18` and ship `.ts`?~~ Superseded by the follow-up below: author in TS, compile, and ship JS. Decided 2026-11-06: the toolchain and CLI port are a separate change, `typescript-toolchain`, which lands first.
6. **Non-Claude harnesses.** Not verified: whether Codex and Cursor give the skill a "base directory" the way Claude Code does. The fallback is to try `.claude/skills/interview-trainer` and then `.agents/skills/interview-trainer` relative to the workspace.

## Follow-up 2026-11-06: Node TypeScript support and TS-build option

### Verified: Node's TypeScript version history

Source: the official [Modules: TypeScript](https://nodejs.org/api/typescript.html) page (read 2026-11-06, docs for v26.13.0). These are the History table entries, quoted as listed:

| Version | Change |
|---|---|
| v22.6.0 | Type stripping added (behind `--experimental-strip-types`) |
| v22.7.0 | `--experimental-transform-types` flag added |
| v23.6.0, v22.18.0 | Type stripping is enabled by default |
| v24.3.0, v22.18.0 | Type stripping no longer emits an experimental warning |
| v25.2.0, v24.12.0 | Type stripping is now stable (Stability: 2) |
| v26.0.0 | `--experimental-transform-types` flag removed |

The same page states these constraints:

- **Erasable syntax only.** It errors on enums, namespaces with runtime code, parameter properties, import aliases and decorators. Type imports must use the `type` keyword.
- **tsconfig is ignored.** That means no `paths` and no downlevel compilation.
- **File extensions are mandatory** (`./file.ts`).
- **The parser needs WebAssembly**, and there is no fallback when it is unavailable.
- **It refuses `.ts` files under any `node_modules` path.**

What this means here:

- **Skill scripts as raw `.ts`:** they would need `engines` raised to `>=22.18`, and `>=24.12` to be on a "stable" release.
- **The CLI cannot ship raw `.ts` at any Node version.** `npx @pavel-agarkov/skills` runs the package from inside a `node_modules` cache directory, so the CLI must ship JavaScript.
- **Installed skill scripts are unaffected by that rule.** They are copied to `.claude/skills/` or `.agents/skills/` ([src/agents.js:6-9](../../../src/agents.js)), which is not `node_modules`.

### Option: author in TS, compile, ship `.mjs`/`.js`

This option holds up for both the skill scripts and the CLI, and it removes the Node-version constraint entirely: users run plain JavaScript on any Node ≥22. Repo facts that shape it:

- **The package has no runtime `dependencies`** ([package.json](../../../package.json)). A build adds only a `typescript` devDependency, and users install nothing new.
- **Size:** about 1,600 lines across `bin/cli.js`, `src/**/*.js` and `scripts/*.js` (line count at commit 7a9205e).
- **Tests import `../src/*.js` directly** (for example [test/add.test.js:9-12](../../../test/add.test.js)). They would import from the build output, or be written as `.ts` and run with Node's own stripping, since CI already uses Node 22 and `latest` ([.github/workflows/ci.yml:15-16](../../../.github/workflows/ci.yml)). Plain `node --test` on 22.0-22.17 would need the flag, so building before testing is simpler.
- **Neither workflow has a build step.** Both CI and publish run `npm test` then `npm publish` ([.github/workflows/publish.yml](../../../.github/workflows/publish.yml)). A `prepack` or `prepublishOnly` script, or an explicit `npm run build` step, would be needed. `files` in package.json would point at the build output.
- **Skill scripts must be built and committed in git**, not only generated at publish time. The skills.sh / `npx skills` route installs straight from the GitHub repo's `dist/skills/` ([skills.sh.json](../../../skills.sh.json); [vercel-skills-research/research.md:60](../vercel-skills-research/research.md)). So the TS sources live outside `dist/skills/`, for example `src/skills/interview-trainer/scripts/*.ts`, and the compiled `.mjs` is committed under `dist/skills/interview-trainer/scripts/`. CI should check that the committed output matches a fresh build. This is an inference from the install route; the skills.sh build behaviour was not checked.
- **The CLI's own output can be gitignored.** It reaches users only through npm. One `tsc` configuration can serve both, using `outDir` mappings or two `tsconfig` project references.
- **Suggested tsconfig:** the docs recommend `erasableSyntaxOnly`, `verbatimModuleSyntax`, `module: nodenext`, `rewriteRelativeImportExtensions` and TS ≥5.8. Using them would let tests run as raw `.ts` on Node ≥22.18 while the shipped output stays plain JS.

### Scope note: rewriting the CLI

Rewriting the CLI in TS does not depend on the storage change. It touches different files (`bin/`, `src/`, `test/`, the workflows, `package.json`) and has its own release risk: the package layout changes, while user-visible behaviour stays the same. The storage change needs only the shared build setup. A reasonable order:

1. **A separate change for the TS toolchain and CLI port.** It sets up the build, the `tsconfig`, the CI committed-output check, and a mechanical port with all tests green.
2. **Then this change,** which adds the skill's `.ts` scripts on that toolchain.

The other order also works: this change adds the toolchain only for skill scripts, and the CLI port follows. In either order, the toolchain decisions are made once.
