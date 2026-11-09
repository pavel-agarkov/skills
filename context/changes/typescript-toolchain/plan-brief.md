# TypeScript Toolchain — Plan Brief

> Full plan: `context/changes/typescript-toolchain/plan.md`
> Research: `context/changes/typescript-toolchain/research.md`

## What & Why

The CLI, the repo scripts and the tests move to TypeScript, checked by `tsc` 7 and bundled by esbuild. The package keeps shipping plain JavaScript, because Node refuses to strip types under `node_modules`, which is where `npx` runs the CLI. The same toolchain gets a skill-script pipeline that supports shared modules from day one, so `storage-access` can add interview-trainer scripts without new build work.

## Starting Point

Plain Node ESM: 1,603 lines of CLI code, 3,194 lines of tests, no devDependencies, no lockfile and no build or install step in CI or publish. Three entry points find the package root one directory up (`bin/cli.js:16`), and the tests import `../src/*.js` and spawn `bin/cli.js` by path.

## Desired End State

All sources are `.ts` and pass `tsc --noEmit` under `strict`. `npm run build` writes a single gitignored `bin/cli.js` and bundles each `src/skills/<skill>/scripts/*.ts` into a self-contained, committed `dist/skills/<skill>/scripts/<name>.mjs`. CI installs with `npm ci`, type-checks, builds and proves that committed bundles match a fresh build. 0.5.1 ships with the same CLI behaviour on any Node ≥22.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Ship format | Compiled JS, `engines >=22` unchanged | Type stripping is refused under `node_modules` | Research |
| Tests shipped? | No; tests live under `test/` | Every file in a skill folder is installed and hashed | Research (user) |
| Shared skill code | Bundled per skill, `src/shared/` from day one | Installed skill folders must be self-contained | Research (user) |
| Source extension | `.ts` sources, `.mjs` skill output | `.mjs` is ESM in any consumer repo; the bundler sets the extension | Research (user) |
| CLI layout | esbuild bundles `src/cli.ts` → `bin/cli.js` | Root lookup, `bin` and `files` (minus `src/`) stay unchanged | Plan |
| Tests | Ported to `.ts`, run via Node type stripping | The whole repo is typed and tsc catches test drift | Plan |
| Bundler | esbuild 0.28.2, exact pin | Smallest dependency surface; `outExtension`/`metafile` built in | Plan |
| Type checker | TypeScript 7.0.2 (`--noEmit` only) | Current line; no tool needs the missing compiler API | Plan |
| `scripts/` | Ported to `.ts`, run as `node scripts/*.ts` | No build needed before `changelog` or `release-check` | Plan |
| Lockfile | Commit `package-lock.json`, `npm ci` | Reproducible esbuild output makes the freshness check meaningful | Plan |
| Release | Patch 0.5.1 | The package layout changes; behaviour does not | Plan |

## Scope

**In scope:**
- devDependencies, lockfile, `tsconfig.json`, `scripts/build.ts`
- the skill-entry convention with a self-containment guard
- porting `src/`, `scripts/` and `test/`
- workflow install steps, README development notes, the 0.5.1 release

**Out of scope:** real skill scripts (`storage-access`), CLI behaviour changes, an `engines` change, minification, source maps, a linter, `noUncheckedIndexedAccess`, `.gitattributes`.

## Architecture / Approach

```
src/cli.ts ──esbuild──▶ bin/cli.js                       (gitignored, npm only)
src/skills/<s>/scripts/*.ts ─┐
src/skills/<s>/lib/*.ts      ├─esbuild (bundle, no splitting, node:-only imports)
src/shared/*.ts ─────────────┘     ▶ dist/skills/<s>/scripts/*.mjs  (committed)
tsc --noEmit over src/ scripts/ test/      node --test "test/**/*.test.ts"
```

Sources import with `.ts` extensions, so Node runs them directly (tests and repo scripts) and esbuild bundles the same files. `pretest` runs the type check and the build, then the tests spawn the shipped `bin/cli.js`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Toolchain and skill-bundle pipeline | Deps, lockfile, tsconfig, build script, CI `npm ci`, fixture-proven bundling | TS 7 rejecting an option; esbuild dropping the shebang; CI Node 22 below 22.18 |
| 2. Port the runtime code | `src/`, `src/cli.ts`, `scripts/` in TS; bundled `bin/cli.js`; JS tests re-pointed | Behaviour drift in the port; missed path assertions |
| 3. Port the tests | `test/` in TS under tsc; committed-bundle freshness test | Test count drop or weakened assertions |
| 4. Release readiness | README, tarball check, 0.5.1, packed-CLI smoke test | Tarball missing `bin/cli.js` if `prepack` doesn't run |

**Prerequisites:** none; this change lands before `storage-access`.
**Estimated effort:** ~3–4 sessions across 4 phases, with Phase 2 the largest.

## Open Risks & Assumptions

- Not yet confirmed that TS 7.0.2 accepts `erasableSyntaxOnly`, `allowImportingTsExtensions` and `verbatimModuleSyntax`. The fallback, `typescript@~5.9.3`, needs user confirmation.
- Not yet confirmed that esbuild preserves an entry's shebang. The fallback is `banner`.
- Assumed: CI `node-version: '22'` resolves to ≥22.18 (checked in Phase 1). Contributors need Node ≥22.18; users don't.
- Assumed: esbuild output is byte-stable across OSes for a pinned version. The freshness test on the Windows runner checks this.

## Success Criteria (Summary)

- `npx @pavel-agarkov/skills@0.5.1` behaves exactly like 0.5.0 on Node ≥22, and the tarball has no `src/`, tests or `.ts`.
- All code is TypeScript under `strict`, and CI type-checks, builds and tests on Linux and Windows.
- A skill script added under `src/skills/<skill>/scripts/` with imports from `src/shared/` produces one committed, self-contained `.mjs`, with no build-config change.
