# TypeScript Toolchain Implementation Plan

## Overview

Author the CLI, the repo scripts and the tests in TypeScript, type-checked by `tsc` 7 (`--noEmit`) and bundled by esbuild. Ship plain JavaScript with no runtime dependencies and unchanged CLI behaviour. In the same toolchain, add a skill-script pipeline: `.ts` entries under `src/skills/<skill>/scripts/` become self-contained, committed `.mjs` bundles under `dist/skills/<skill>/scripts/`, and modules shared across skills (`src/shared/`) work from day one. `storage-access` lands after this change and adds the first real skill scripts.

## Current State Analysis

- Plain Node ESM: 1,603 lines in `bin/cli.js`, `src/**/*.js` and `scripts/*.js`, plus 3,194 lines of tests in `test/*.js`. There is no JSDoc typing, no `@ts-check` and no CommonJS (research §3).
- `package.json` has `"type": "module"`, `bin: bin/cli.js`, `files` = `bin/ src/ dist/skills/ README.md changelog.json CHANGELOG.md`, `engines >=22`, no `devDependencies` and no lockfile (`package.json:5-17,30-32`).
- Neither workflow installs dependencies or builds. CI runs `npm test` on ubuntu/windows × Node `22`/`latest` (`.github/workflows/ci.yml:9-21`). Publish runs the same matrix, then `npm publish` on Node 24 (`.github/workflows/publish.yml:12-63`).
- The npm `files` list includes `dist/skills/` (`package.json:9-16`), and the skills.sh route installs it straight from git (`skills.sh.json`). Skill folders are installed and hashed file by file (`src/catalog.js:43-54`, `src/sync.js:13-20`).

## Desired End State

- `src/**/*.ts`, `scripts/*.ts` and `test/**/*.ts` are the only sources. `tsc` reports zero errors under `strict`.
- `npm run build` produces a gitignored, single-file `bin/cli.js` (with shebang) and bundles every `src/skills/<skill>/scripts/*.ts` into `dist/skills/<skill>/scripts/<name>.mjs`. Today that is zero entries; the pipeline is proven by a fixture test.
- The published tarball contains `bin/cli.js`, `dist/skills/`, `README.md`, `changelog.json`, `CHANGELOG.md` and `package.json`, with no `src/` and no tests. `npx @pavel-agarkov/skills` behaves exactly as 0.5.0 on any Node ≥22.
- CI and publish run `npm ci`, a type check and the build. A test proves that the committed skill bundles match a fresh build.
- Version 0.5.1 is published with a changelog note.

### Key Discoveries:

- The package root is found one directory above the entry file (`bin/cli.js:16`, `scripts/changelog.js:8`, `scripts/release-check.js:35`). With `src/cli.ts` as the source and `bin/cli.js` as the bundle, `'..'` resolves to the repo root in both. The lookup stays byte-identical.
- Tests import `../src/*.js` by literal path. 17 of the 18 test files do; `interview-trainer.test.js` does not. Six test files spawn `bin/cli.js` through `test/helpers.js:10` or `test/add.test.js:168,229` (research §2).
- Repo-text assertions that must follow the renames:
  - `test/docs.test.js:126` reads the CLI source text.
  - `test/docs.test.js:150-177` requires the workflows to contain `scripts/changelog.js notes` and `scripts/release-check.js`.
  - `test/changelog.test.js:90` requires `scripts.changelog === 'node scripts/changelog.js'`.
- `dist/` must not be gitignored (`test/catalog.test.js:34-37`). `dist/skills/` top-level entries must be exactly the three skills (`test/catalog.test.js:23-24`), which bundles inside skill folders do not affect.
- Committed generated output is already compared in LF form because Windows checks out with CRLF and the repo has no `.gitattributes` (`test/changelog.test.js:81-82`).
- TS 7 defaults: `types: []`, `rootDir: ./`, `strict: true`, and `target` is the latest ES version. These need explicit `types: ["node"]` and a `target` that Node 22 supports. TS 7 has no compiler API, which is fine because only the `tsc` CLI is used (research §4).
- esbuild does not type-check. Its docs require `tsc --noEmit` and isolated-module discipline, and `outExtension` gives `.mjs` output from `.ts` sources (research follow-up "decisions").

## What We're NOT Doing

- No interview-trainer scripts and no real skill-script entries; `storage-access` adds them.
- No CLI behaviour, output, exit-code or config-format changes. No `engines` change.
- No shipping of tests, source maps, `.ts` sources or `src/`.
- No minification of shipped bundles. They stay readable, like the 10x skill scripts.
- No `noUncheckedIndexedAccess` or other options beyond `strict`. No linter or formatter.
- No `.gitattributes`. Line-ending stability is handled at comparison time, as today.
- No code splitting. Each bundle inlines everything it imports.

## Implementation Approach

One esbuild-based build script serves both outputs, and `tsc --noEmit` is the type gate. Sources import each other with explicit `.ts` extensions (`allowImportingTsExtensions`). Node's type stripping (≥22.18) then runs the sources, tests and repo scripts directly, while esbuild resolves the same specifiers when bundling. Each phase ends green.

1. Add the toolchain and prove the skill pipeline on a fixture.
2. Port the runtime code, keeping the JS tests and only re-pointing their specifiers.
3. Port the tests and add the committed-bundle freshness test.
4. Release.

## Critical Implementation Details

- **Order inside `npm test`.** CLI tests spawn the built `bin/cli.js`. `pretest` must type-check and build before `node --test` runs, and CI runs `npm ci` before `npm test`.
- **Byte-stable bundles.** esbuild writes input-path comments into bundles. The freshness test builds into a temp `outdir` and must use the same `absWorkingDir` (the repo root) as the real build, so the comments match. Exact pins plus the lockfile keep esbuild's output stable across machines. Compare in LF form.
- **Self-containment is a build invariant, not a convention.** The build reads esbuild's `metafile` and fails if any skill bundle imports anything other than a `node:` specifier, or if a skill bundle emits more than one output file.
- **Node ≥22.18 is a contributor requirement only.** Running `.ts` directly (build script, repo scripts, tests) needs type stripping by default. CI's `node-version: '22'` is expected to resolve to the newest 22.x. Phase 1's first CI run is the check. Users run only the bundled JS.

## Phase 1: Toolchain and skill-bundle pipeline

### Overview

Install the toolchain with a lockfile, configure `tsc`, write the build script with the skill-entry convention and its guards, and wire install, type check and build into CI and publish. Prove the skill pipeline on a temp fixture. The CLI stays plain JS in this phase, and the CLI bundle entry is added in Phase 2.

### Changes Required:

#### 1. Dev dependencies and lockfile

**File**: `package.json`, `package-lock.json` (new)

**Intent**: Add the three build-only dependencies with exact versions, and commit the lockfile so CI and the freshness check are reproducible.

**Contract**:
- `devDependencies`: `typescript` `7.0.2`, `esbuild` `0.28.2`, `@types/node` `22.20.5`, all exact with no range.
- `dependencies` stays absent.
- The lockfile is committed. npm must resolve the platform optional dependencies for both linux-x64 and win32-x64.

#### 2. TypeScript configuration

**File**: `tsconfig.json` (new)

**Intent**: A single type-check-only project covering every TS source in the repo.

**Contract**:
- `noEmit: true`, `allowImportingTsExtensions: true`, `strict: true`, `erasableSyntaxOnly: true`, `verbatimModuleSyntax: true`.
- `module: nodenext`, `moduleResolution: nodenext`, `target: es2023`, `types: ["node"]`, `skipLibCheck: true`.
- `include` grows per phase: `scripts/**/*.ts`, `src/**/*.ts`, `test/**/*.ts`.
- If TS 7.0.2 rejects any of these options, stop and confirm the fallback (`typescript@~5.9.3`) with the user before changing it.

#### 3. Build script

**File**: `scripts/build.ts` (new)

**Intent**: Bundle the CLI and every skill-script entry with esbuild, enforce self-containment, and be importable by tests.

**Contract**:
- Exports `buildSkills({ root, srcDir, outDir })`, which returns the list of written output paths. It also exports `buildCli({ root })`, which is a no-op until Phase 2 adds `src/cli.ts`.
- Running `node scripts/build.ts` builds both into the repo.
- Skill entries:
  - Glob `<srcDir>/<skill>/scripts/*.ts`, excluding `*.test.ts` and `*.d.ts`.
  - Output to `<outDir>/<skill>/scripts/<name>.mjs` with `outbase` = `srcDir`.
  - esbuild options: `bundle: true`, `platform: 'node'`, `format: 'esm'`, `target: 'node22'`, `outExtension: { '.js': '.mjs' }`, `splitting: false`, `metafile: true`, `absWorkingDir: root`, `logLevel: 'warning'`, `minify: false`.
  - The build fails if any output imports a non-`node:` specifier.
  - Defaults: `srcDir = src/skills`, `outDir = dist/skills`.
- Shared modules live in `src/shared/` and skill-private modules in `src/skills/<skill>/lib/`. Neither is an entry. They are documented in a short header comment in `scripts/build.ts`.
- An entry's leading `#!/usr/bin/env node` must survive into the output. If esbuild drops it, prepend it via `banner`.

#### 4. npm scripts and ignores

**File**: `package.json`, `.gitignore`

**Intent**: One command path for contributors and CI.

**Contract**:
- `scripts.typecheck` = `tsc`.
- `scripts.build` = `node scripts/build.ts`.
- `scripts.pretest` = `npm run typecheck && npm run build`.
- `scripts.test` = `node --test "test/**/*.test.js"` (Phase 3 switches it to `.ts`).
- `.gitignore` adds `node_modules/` (`bin/` follows in Phase 2).

#### 5. Workflows

**File**: `.github/workflows/ci.yml`, `.github/workflows/publish.yml`

**Intent**: Install from the lockfile before anything builds or tests.

**Contract**:
- Add `- run: npm ci` before `npm test` in both `test` matrices, and before `npm publish` in the publish job.
- Leave the `release-check` job without an install: it runs a script that imports only `node:` modules and repo sources.
- `npm publish` stays in `publish.yml` (trusted publishing is bound to that filename).

#### 6. Fixture test for the skill pipeline

**File**: `test/build.test.js` (new; becomes `.ts` in Phase 3)

**Intent**: Prove the shared-module and self-containment architecture before any real skill uses it.

**Contract**:
- In a temp root, write `src/skills/demo/scripts/run.ts` with a shebang that imports `src/shared/greet.ts` and `node:fs`.
- Run `buildSkills` and assert:
  - exactly one output, `dist/skills/demo/scripts/run.mjs`
  - its first line is the shebang
  - the shared code is inlined
  - running it with `process.execPath` prints the expected text
- A second case imports a bare package specifier (e.g. `left-pad`). Assert that the build rejects it rather than leaving an external import.

### Success Criteria:

#### Automated Verification:

- `npm ci` installs on a clean checkout and `package-lock.json` is committed
- `npm run typecheck` passes with TS 7.0.2 and the tsconfig options above
- `npm run build` exits 0 and writes no files under `dist/skills/` (no real entries yet)
- `npm test` passes, including `test/build.test.js` (shebang, inlined shared module, single `.mjs` output, non-`node:` import rejected)
- CI passes on ubuntu and windows with Node `22` and `latest`

#### Manual Verification:

- The CI log for the Node `22` job shows a Node version ≥22.18

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Port the runtime code

### Overview

Convert `src/**` and `scripts/*` to TypeScript and move the CLI entry to `src/cli.ts`, bundled to a gitignored `bin/cli.js`. Re-point the still-JS tests at the `.ts` sources and the built CLI, and update every repo-text assertion so the suite stays green.

### Changes Required:

#### 1. Library modules

**File**: `src/**/*.js` → `src/**/*.ts` (all 18 files)

**Intent**: A mechanical port under `strict`, with relative imports switched to `.ts` and no behaviour change.

**Contract**:
- Shared types, declared once and imported with `import type`:
  - `Catalog`/`Skill` (`src/catalog.ts`)
  - `ConfigV1`/`ConfigV2` with assertion validators and a `(why: string) => never` fail helper (`src/config.ts`)
  - changelog `Entry` (`src/changelog.ts`)
  - the sync result and manifest entry (`src/sync.ts`)
  - the `reconcile` input/output (`src/lifecycle.ts`)
  - command `Opts`/`Ctx` and the handler return union (`src/args.ts` or a `src/types.ts`)
- `AgentId` is a union derived from `AGENTS` via `as const`/`satisfies` (`src/agents.ts`).
- `AgentChoiceError.found` becomes a declared field, with no parameter property.
- `catch` variables are narrowed before `.message`.
- Exported names and signatures stay the same.

#### 2. CLI entry

**File**: `bin/cli.js` → `src/cli.ts`; `.gitignore`; `scripts/build.ts`

**Intent**: The source moves into `src/`, and `bin/cli.js` becomes the generated single-file bundle at today's depth.

**Contract**:
- `src/cli.ts` keeps line 1 `#!/usr/bin/env node`, the `'..'` root lookup, the HELP text, top-level `await` and the `process.exitCode` handling.
- `buildCli` bundles it to `bin/cli.js` with the same esbuild options as skills, except `outfile` replaces `outExtension`.
- `.gitignore` adds `/bin/`, and `bin/cli.js` is removed from git.

#### 3. Repo scripts

**File**: `scripts/changelog.js` → `scripts/changelog.ts`, `scripts/release-check.js` → `scripts/release-check.ts`

**Intent**: Typed, run directly by Node's type stripping, with no build step.

**Contract**:
- Same CLI arguments and output.
- Imports become `../src/changelog.ts`.
- The direct-run guard (`release-check.js:64-65`) keeps working with the `.ts` path.

#### 4. Package manifest and workflow paths

**File**: `package.json`, `.github/workflows/ci.yml`, `.github/workflows/publish.yml`

**Intent**: Point every command at the new paths. The tarball loses `src/`.

**Contract**:
- `files` drops `src/` and keeps `bin/`.
- `bin` stays `bin/cli.js`.
- `scripts.changelog` = `node scripts/changelog.ts`.
- `scripts.prepack` = `npm run build`.
- `ci.yml` runs `node scripts/release-check.ts`.
- `publish.yml` runs `node scripts/changelog.ts notes`.

#### 5. Re-point the JS tests

**File**: `test/*.js`, `test/helpers.js`

**Intent**: Keep the existing tests unchanged in substance. Only the paths and the asserted strings move.

**Contract**:
- `../src/*.js` → `../src/*.ts`, including the dynamic imports at `test/add.test.js:222-223`.
- `../scripts/release-check.js` → `.ts`.
- `cli` stays `bin/cli.js`, now the build output.
- `test/docs.test.js:126` reads `src/cli.ts`. `:150-177` expect `scripts/changelog.ts notes` and `scripts/release-check.ts`.
- `test/changelog.test.js:90` expects `node scripts/changelog.ts`.
- Add an assertion that `files` excludes `src/` and includes `bin/`.

### Success Criteria:

#### Automated Verification:

- No `.js` files remain under `src/`, `scripts/` or `bin/` in git (`git ls-files src scripts bin`)
- `npm run typecheck` passes with `include` covering `src/**/*.ts` and `scripts/**/*.ts`
- `npm run build` produces `bin/cli.js` whose first line is `#!/usr/bin/env node`
- `npm test` passes with the JS tests importing `../src/*.ts` and spawning the built `bin/cli.js`
- `npm run changelog` leaves `CHANGELOG.md` unchanged and `node scripts/release-check.ts 0.5.0` exits 0
- CI passes on ubuntu and windows with Node `22` and `latest`

#### Manual Verification:

- `node bin/cli.js --help` output is identical to 0.5.0's `--help`

(Compare against `npx @pavel-agarkov/skills@0.5.0 --help`.)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Port the tests

### Overview

Convert `test/**` to TypeScript under the same `tsc` project and add the committed-bundle freshness test that `storage-access` will rely on.

### Changes Required:

#### 1. Test files

**File**: `test/*.js` → `test/*.ts` (18 test files, `helpers.ts`, `build.test.ts`)

**Intent**: Typed tests that catch signature drift. Assertions stay the same.

**Contract**:
- Import the shared types from `src/` with `import type`.
- Fixture builders in `helpers.ts` return typed `Catalog`/`Ctx` objects.
- No test is deleted or weakened. The test count after the port is ≥ the count before.

#### 2. Committed-bundle freshness test

**File**: `test/skill-bundles.test.ts` (new)

**Intent**: Guarantee that committed `dist/skills/**/scripts/*.mjs` equals a fresh build, on Linux and Windows.

**Contract**:
- Run `buildSkills` into a temp `outDir` with the real `root` and `srcDir`.
- Assert that the set of relative output paths equals the set of committed `dist/skills/*/scripts/*.mjs`. A committed bundle with no source fails, and so does a source with no committed bundle.
- Assert that each pair is equal after CRLF→LF normalisation, as in `test/changelog.test.js:81-82`.
- On failure, the message says to run `npm run build` and commit.
- This test passes trivially today (zero entries) and becomes binding when `storage-access` adds scripts.

#### 3. Test runner and tsconfig

**File**: `package.json`, `tsconfig.json`

**Intent**: Run and type-check the `.ts` tests.

**Contract**:
- `scripts.test` = `node --test "test/**/*.test.ts"`.
- `tsconfig.json` `include` adds `test/**/*.ts`.

### Success Criteria:

#### Automated Verification:

- No `.js` files remain under `test/` in git
- `npm run typecheck` passes with `test/**/*.ts` included
- `npm test` passes, and the reported test count is ≥ the Phase 2 count
- `test/skill-bundles.test.ts` fails on a stray committed bundle and passes once it is removed

(Check with a local `dist/skills/x/scripts/y.mjs`.)
- CI passes on ubuntu and windows with Node `22` and `latest`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Release readiness

### Overview

Document the contributor workflow, verify the tarball and the packed CLI, and cut 0.5.1.

### Changes Required:

#### 1. README

**File**: `README.md`

**Intent**: Contributors know how to build and test. The "Publishing" section reflects the install and build steps.

**Contract**:
- Add a short "Development" subsection near "Publishing" covering:
  - Node ≥22.18 for development (users still need only `>=22`)
  - `npm ci`, `npm test` (type check and build run first), `npm run build`
  - where skill-script sources (`src/skills/<skill>/scripts/`) and shared modules (`src/shared/`) live
  - that the bundles under `dist/skills/` are committed
- Update the `test` bullet in "Publishing" to mention the type check and build.

#### 2. Version and changelog

**File**: `package.json`, `changelog.json`, `CHANGELOG.md`

**Intent**: Publish the new package layout as a patch release.

**Contract**:
- `version` `0.5.1`.
- A new top `changelog.json` entry says the CLI is now built from TypeScript into a single bundled `bin/cli.js`, with no behaviour change and the same `engines`.
- `CHANGELOG.md` is regenerated by `npm run changelog`.

### Success Criteria:

#### Automated Verification:

- `npm pack --dry-run --json` lists `bin/cli.js` and `dist/skills/**`, and no `src/`, `test/`, `scripts/` or `.ts` files
- `npm test` passes, including `committed CHANGELOG.md matches changelog.json`
- `node scripts/release-check.ts 0.5.0` reports `0.5.0 -> 0.5.1 will be published on merge`

#### Manual Verification:

- A packed-tarball install on Node 22.x runs `add interview-trainer` and `update` as 0.5.0 did
- After merge, the publish workflow publishes 0.5.1 and `npx @pavel-agarkov/skills@0.5.1 --help` works

(For the tarball check, run `npx <path-to-packed-tarball>` in a temp project.)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- The existing suite, ported unchanged in substance. It is the behaviour-preservation proof for the port.
- `build.test`: shebang preservation, shared-module inlining, single `.mjs` output per entry, rejection of non-`node:` imports.

### Integration Tests:

- The CLI tests spawn the bundled `bin/cli.js`, so they exercise the shipped artifact rather than the sources.
- `skill-bundles.test`: committed bundles equal a fresh build, with LF-normalised comparison on the Windows runner.

### Manual Testing Steps:

1. Diff `--help` output of the bundled CLI against 0.5.0.
2. Install from the packed tarball into a temp project on Node 22.x, then run `add`, `update` and `check`.
3. Confirm that the CI Node 22 job runs ≥22.18.

## Performance Considerations

None for users: one bundled file replaces 19 module loads. `pretest` adds a type check and a build to `npm test`; both are fast at this size with TS 7 and esbuild.

## Migration Notes

- Users: none. The `bin` path, `engines` and behaviour are unchanged. The tarball no longer contains `src/`, and no consumer imports from it (the package has no `exports` and documents only the CLI).
- Contributors: run `npm ci` once and use Node ≥22.18. `bin/cli.js` is now generated; run `npm run build` (or `npm test`) before `node bin/cli.js`.

## References

- Research: `context/changes/typescript-toolchain/research.md` (§1–6 and both follow-ups)
- Change notes: `context/changes/typescript-toolchain/change.md`
- Node TS history and the node_modules rule: `context/changes/storage-access/research.md` ("Follow-up 2026-11-06")
- LF comparison precedent: `test/changelog.test.js:81-82`
- Root lookup: `bin/cli.js:16`
- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), [esbuild API](https://esbuild.github.io/api/), [esbuild content types](https://esbuild.github.io/content-types/)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Toolchain and skill-bundle pipeline

#### Automated

- [x] 1.1 `npm ci` installs on a clean checkout and `package-lock.json` is committed — 1e21f04
- [x] 1.2 `npm run typecheck` passes with TS 7.0.2 and the tsconfig options above — 1e21f04
- [x] 1.3 `npm run build` exits 0 and writes no files under `dist/skills/` (no real entries yet) — 1e21f04
- [x] 1.4 `npm test` passes, including `test/build.test.js` (shebang, inlined shared module, single `.mjs` output, non-`node:` import rejected) — 1e21f04
- [ ] 1.5 CI passes on ubuntu and windows with Node `22` and `latest`

#### Manual

- [ ] 1.6 The CI log for the Node `22` job shows a Node version ≥22.18

### Phase 2: Port the runtime code

#### Automated

- [x] 2.1 No `.js` files remain under `src/`, `scripts/` or `bin/` in git (`git ls-files src scripts bin`) — 2114a1c
- [x] 2.2 `npm run typecheck` passes with `include` covering `src/**/*.ts` and `scripts/**/*.ts` — 2114a1c
- [x] 2.3 `npm run build` produces `bin/cli.js` whose first line is `#!/usr/bin/env node` — 2114a1c
- [x] 2.4 `npm test` passes with the JS tests importing `../src/*.ts` and spawning the built `bin/cli.js` — 2114a1c
- [x] 2.5 `npm run changelog` leaves `CHANGELOG.md` unchanged and `node scripts/release-check.ts 0.5.0` exits 0 — 2114a1c
- [ ] 2.6 CI passes on ubuntu and windows with Node `22` and `latest`

#### Manual

- [x] 2.7 `node bin/cli.js --help` output is identical to 0.5.0's `--help` — 2114a1c

### Phase 3: Port the tests

#### Automated

- [x] 3.1 No `.js` files remain under `test/` in git
- [x] 3.2 `npm run typecheck` passes with `test/**/*.ts` included
- [x] 3.3 `npm test` passes, and the reported test count is ≥ the Phase 2 count
- [x] 3.4 `test/skill-bundles.test.ts` fails on a stray committed bundle and passes once it is removed
- [ ] 3.5 CI passes on ubuntu and windows with Node `22` and `latest`

### Phase 4: Release readiness

#### Automated

- [ ] 4.1 `npm pack --dry-run --json` lists `bin/cli.js` and `dist/skills/**`, and no `src/`, `test/`, `scripts/` or `.ts` files
- [ ] 4.2 `npm test` passes, including `committed CHANGELOG.md matches changelog.json`
- [ ] 4.3 `node scripts/release-check.ts 0.5.0` reports `0.5.0 -> 0.5.1 will be published on merge`

#### Manual

- [ ] 4.4 A packed-tarball install on Node 22.x runs `add interview-trainer` and `update` as 0.5.0 did
- [ ] 4.5 After merge, the publish workflow publishes 0.5.1 and `npx @pavel-agarkov/skills@0.5.1 --help` works
