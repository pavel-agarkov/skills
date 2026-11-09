<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: TypeScript Toolchain

- **Plan**: context/changes/typescript-toolchain/plan.md
- **Scope**: Full plan (Phases 1–4 of 4)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-11-09
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Verification run locally (Node 26.12.1): `npm run typecheck` exit 0; `npm run build` wrote `bin/cli.js` (line 1 is the shebang) and no files under `dist/skills/`; `npm test` 220 pass / 0 fail; `npm run changelog` left the tree clean; `node scripts/release-check.ts 0.5.0` printed `0.5.0 -> 0.5.1 will be published on merge`; `npm pack --dry-run --json` lists 22 files including `bin/cli.js` and 17 under `dist/`, with no `src/`, `test/`, `scripts/` or `.ts`. No `.js` files remain under `src/`, `scripts/`, `bin/` or `test/` in git. CI results (1.5, 2.6, 3.5), 1.6, 2.7 and 4.4 are not re-verifiable from the repo. 4.5 is pending until after merge, as expected.

## Findings

### F1 — Bundle freshness test is self-fulfilling in `npm test`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: test/skill-bundles.test.ts; package.json `pretest`
- **Detail**: `pretest` runs `npm run build`, which rewrites the real `dist/skills`. The freshness test then compares `dist/skills` with a fresh build of the same sources, so it always passes. Stale committed bundles are overwritten in CI before the test runs, and the "run npm run build and commit" hint can never fire. A PR could merge with out-of-date committed bundles. Harmless today (zero entries), but it becomes binding when `storage-access` adds scripts, which is the purpose stated in the plan.
- **Fix A ⭐ Recommended**: Add a `git diff --exit-code -- dist/skills` (plus an untracked-file check) step after the build in CI.
  - Strength: Catches stale commits at the exact point where the build rewrites them; the test stays as a local guard.
  - Tradeoff: One more CI step; the guarantee lives in the workflow, not in `npm test`.
  - Confidence: HIGH — the failure mode follows directly from `pretest` ordering.
  - Blind spot: Windows runner CRLF handling for `git diff`; limit it to the ubuntu job.
- **Fix B**: Make `pretest` build only the CLI and leave `dist/skills` to an explicit `npm run build`.
  - Strength: The test then compares committed bytes with a fresh build, as the plan intended.
  - Tradeoff: Contributors must remember `npm run build` after editing skill scripts; `prepack` still builds both.
  - Confidence: MEDIUM — changes the `pretest` contract the plan fixed.
  - Blind spot: Not checked whether anything else relies on `pretest` regenerating bundles.
- **Decision**: FIXED via Fix A (CI step in ci.yml: git status --porcelain on dist/skills after npm test, ubuntu/Node 22 only)

### F2 — Self-containment guard has gaps

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/build.ts (guard on `metafile.outputs[*].imports`, around lines 84–90)
- **Detail**: The guard reads only esbuild's recorded imports. Computed `import(expr)`, `createRequire(import.meta.url)(x)` and `process.getBuiltinModule` load code at runtime and pass it. esbuild warnings are printed but do not fail the build. Bare builtins without `node:` (for example `fs` from a CJS dependency) are rejected, which is strict but not a hole.
- **Fix**: Set `packages: 'bundle'` and `external: ['node:*']` explicitly, fail the build when `result.warnings.length > 0`, and add a test for a computed dynamic import.
- **Decision**: FIXED (packages: bundle, external: node:*, esbuild warnings and runtime-load patterns fail the build; test added in test/build.test.ts)

### F3 — Non-null assertions and an explicit `any` hide latent crashes

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/commands/changes.ts:25; scripts/release-check.ts:32
- **Detail**: `entriesBetween(changelog!, ...)` hides an optional `ctx.changelog` that the original would also have crashed on (behaviour unchanged). `update.ts` guards the same case. `release-check.ts` uses `(e: any)` on `unknown` entries, the only `any` in src and scripts. Runtime checks were kept.
- **Fix**: Add `if (!changelog) return` in `changes.ts` as `update.ts` does, and use a minimal `{ version?: unknown; notes?: unknown }` guard type in `release-check.ts`.
- **Decision**: FIXED (changes.ts uses changelog ?? [] instead of a non-null assertion, so a missing changelog prints no entries rather than crashing; release-check find() predicate typed instead of any)

### F4 — Publish job runs unpinned actions and `npm@latest` with dev dependencies installed

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/publish.yml
- **Detail**: Actions are pinned by tag, not SHA, and `npm install -g npm@latest` is unpinned. This is pre-existing, but the publish job now also runs `npm ci` and executes dev-dependency code, so the exposure is larger. Permissions are narrow and `id-token: write` is limited to the publish job.
- **Fix**: Pin actions by SHA and pin the npm version.
- **Decision**: FIXED (actions pinned to v4.4.0 SHAs, npm pinned to 12.2.2 in publish.yml)
