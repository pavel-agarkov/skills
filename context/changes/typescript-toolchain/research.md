---
date: 2026-11-06T11:45:02+01:00
researcher: Pavel Agarkov (with Claude Opus 5.5)
git_commit: 3a0c580e42597b90972a59afb6958cea2c37739f
branch: claude/10x-new-storage-access-26f352
repository: pavel-agarkov/skills
topic: "TypeScript toolchain: author bin/, src/, scripts/ in TS and ship compiled JS, reusable for skill scripts"
tags: [research, typescript, build, ci, publish, tests, layout, line-endings, bundler, esbuild]
status: complete
last_updated: 2026-11-06
last_updated_by: Pavel Agarkov (with Claude Opus 5.5)
last_updated_note: "Follow-up: user decisions (no shipped tests, per-skill bundles, shared-module architecture from day one); bundler options and the .mts question"
---

# Research: TypeScript toolchain for the CLI and skill scripts

**Date**: 2026-11-06T11:45:02+01:00
**Researcher**: Pavel Agarkov (with Claude Opus 5.5)
**Git Commit**: 3a0c580e42597b90972a59afb6958cea2c37739f
**Branch**: claude/10x-new-storage-access-26f352
**Repository**: pavel-agarkov/skills

## Research Question

What does the codebase constrain, and what must the plan decide, to set up a TypeScript build (devDependencies only), port `bin/`, `src/`, `scripts/` (1,603 lines) with unchanged CLI behaviour and all tests green, ship compiled JS on `engines >=22`, wire the build into CI and publish, and leave a toolchain that `storage-access` can reuse for skill scripts compiled into `dist/skills/<skill>/scripts/` with a committed-output check ([change.md:14-17](change.md))?

## Summary

- **Layout is the main risk; the types are not.** Three entry points find the package root as exactly one directory above their own file: `bin/cli.js:16`, `scripts/changelog.js:8` and `scripts/release-check.js:35`. Under `outDir: build` with the TS 7 default `rootDir: ./`, the emitted `build/bin/cli.js` would resolve the root to `build/`. It would then miss `package.json`, `changelog.json` and `dist/skills/`, and `scripts/changelog.js` would write `CHANGELOG.md` into `build/`. Nothing under `src/` locates itself; it receives the root from its caller (`src/catalog.js:53-54`).
- **Tests are coupled to source paths.** 17 of the 18 `test/*.test.js` files (all but `interview-trainer.test.js`) and `test/helpers.js` import `../src/*.js` or `../scripts/release-check.js` by literal path. Six test files (add, changes, check, remove, update, edge-cases) spawn `bin/cli.js` through `test/helpers.js:10` or their own path (`test/add.test.js:168,229`). `test/docs.test.js:126` reads the `bin/cli.js` **source text** to check the help block.
- **`dist/` cannot be the output dir.** `dist/skills/` is hand-written source of truth ([ai-skills-distribution-package/plan.md:75](../ai-skills-distribution-package/plan.md)), and `test/catalog.test.js:34-37` fails if `.gitignore` ignores `dist`.
- **Two devDependencies, not one.** The code uses `node:` built-ins and the `Buffer`/`process` globals. TypeScript 7 changed the `types` default to `[]`, so the build needs `@types/node` plus `"types": ["node"]`.
- **There is no lockfile and no install step.** No `package-lock.json` exists, and neither workflow runs `npm ci`/`npm install` for the project (`.github/workflows/ci.yml:17-21`, `publish.yml:18-22,30-63`). Adding devDependencies forces a lockfile decision and an install step in both workflows.
- **TypeScript `latest` is 7.0.2** (the native Go compiler), per `npm view typescript dist-tags` on 2026-11-06. Its removed options (ES5 target, `node10`/`classic` resolution, AMD/UMD/System, `baseUrl`) are not needed here. The relevant default changes are `strict: true`, `rootDir: ./` and `types: []`. 7.0 ships no JS compiler API, which only matters to tools such as typescript-eslint, and none are in use.
- **Type effort is moderate.** There is no JSDoc, no `@ts-check` and no CommonJS in bin/src/scripts. Real type design is concentrated in config validation, catalog, changelog, sync results, lifecycle and command context/return types. 9 of 20 files look trivial.
- **The committed skill-script output check has a known line-ending trap and a known fix.** Windows CI checks out with CRLF, and the repo deliberately has no `.gitattributes`. `test/changelog.test.js:81-82` already compares committed generated output in LF form. Compiled `.mjs` under `dist/skills/` will be installed and hashed by the catalog like any skill file (`src/catalog.js:43-51`, `src/sync.js:13-20`).

## Detailed Findings

### 1. Self-locating code and output layout

Observed (all inspected via full reads of bin/ and scripts/, grep of src/):

- `bin/cli.js:16` `packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')`. It is used for `package.json` (`:83`, `:105`), `loadCatalog(packageRoot)` (`:64`, `:103`, which reads `<root>/dist/skills`, `src/catalog.js:54`) and `loadChangelog(packageRoot)` (`:104`; `src/changelog.js:49-57`).
- `scripts/changelog.js:8`: the same one-level root. It reads changelog/package and **writes** `<root>/CHANGELOG.md` (`:14`).
- `scripts/release-check.js:35`: the same one-level root inside `main()`. Its direct-run guard at `:64-65` compares `import.meta.url` with `argv[1]` and works from any location if node runs the emitted file.
- In bin/, src/ and scripts/ the grep found no `import.meta.dirname`, `__dirname`, `new URL(…, import.meta.url)`, `createRequire`, JSON import attributes, dynamic `import()` or child processes. `package.json` is always read through `readFileSync` + `JSON.parse`.
- Every relative import has an explicit `.js` extension. `bin/` and `src/` are siblings (`bin/cli.js` imports `../src/…`), so any output that keeps them siblings keeps the specifiers valid.
- `#!/usr/bin/env node` is line 1 of all three entry points. `bin/cli.js:118-123` uses top-level `await` and `process.exitCode`, so the output must be ESM (`"type": "module"` in `package.json:5`).

Layout options the plan must choose between (inference from the anchors above):

| Option | What changes | Cost |
|---|---|---|
| A. `outDir: build`, sources in `bin/ src/ scripts/` as `.ts` | Root lookup becomes `'../..'` or a walk up to `package.json`. `bin` → `build/bin/cli.js`, `files` → `build/` (minus `build/scripts`) | Tests must import or spawn `build/…` (or run against `.ts`, see §2). Two-level depth is true only for compiled output, so running the `.ts` source directly under Node stripping would break unless a walk-up is used |
| B. In-place emit (`.ts` and gitignored `.js` side by side in `bin/`, `src/`) | Nothing in runtime paths or test specifiers changes | `.gitignore` has to exclude generated `.js` next to sources, and the tree is noisy. `files` would need to exclude `.ts`, or ship it harmlessly |
| C. Sources move (e.g. `ts/bin`, `ts/src`), emit to `bin/`, `src/` (gitignored) | Runtime paths, `package.json` `bin`/`files` and test specifiers stay as they are | Large move. `bin/`/`src/` become ignored build dirs, and `test/docs.test.js:126` must read the new source location |

A walk-up-to-`package.json` lookup removes the depth assumption under every option. It is the smallest behaviour-neutral change if the depth changes.

### 2. Test coupling

- Imports: every test file except `interview-trainer.test.js` imports `../src/*.js`. `release-check.test.js:3` imports `../scripts/release-check.js`. `add.test.js:222-223` dynamically imports `../src/sync.js` and `../src/config.js`. `test/helpers.js:6-7` imports catalog/changelog.
- Spawns: `spawnSync(process.execPath, [cli, …])` with `cli = join(repoRoot,'bin','cli.js')` (`test/helpers.js:9-10`). Used in add, changes, check, remove, update and edge-cases. `add.test.js:168,229` builds the path itself. No test spawns `scripts/`.
- Repo-file assertions affected by the change:
  - `test/docs.test.js:126` regex-parses `Options:` from the `bin/cli.js` source text. It must point at the TS source, or at the emitted file, since the template literal survives emit.
  - `test/docs.test.js:150-165` requires `publish.yml` to contain `scripts/changelog.js notes`.
  - `test/docs.test.js:172-177` requires `ci.yml` to contain `scripts/release-check.js`.
  - `test/changelog.test.js:86-90` requires `files` to include `changelog.json` and `CHANGELOG.md`, no `files` entry starting with `scripts`, and `scripts.changelog === 'node scripts/changelog.js'`.
  - `test/catalog.test.js:23-24` requires `dist/skills/` top-level entries to be exactly the three skills. `test/docs.test.js:14,26` requires a README for every `dist/skills/` entry. Neither is affected by files inside a skill folder.
- `scripts/` is not shipped (`test/changelog.test.js:89`). It runs only in-repo and in CI, so a stripped-`.ts` run there is not blocked by the node_modules rule.
- Ways to keep tests green, for the plan to choose (inference):
  1. Tests stay `.js` and target the build output. Every specifier and the `cli` path change, and `npm test` must build first (e.g. a `pretest` script).
  2. Tests become `.ts` and import `../src/*.ts` under Node's type stripping. `rewriteRelativeImportExtensions` keeps the emitted output importing `.js`. This needs Node ≥22.18 for `npm test`. CI's `node-version: '22'` resolves to the newest 22.x (inference: setup-node semantics), but a contributor on 22.0–22.17 could not run tests. Tests would also exercise sources rather than shipped JS, so a smoke test of the emitted `bin/cli.js` (or `npm pack` contents) is still needed.
- Test discovery (from Node docs, not run): plain `node --test` matches `**/*.test.{cjs,mjs,js}`, `**/test/**/*.{cjs,mjs,js}` and more, excluding `node_modules`. On Node versions with default type stripping it also matches `.ts`/`.mts`. A `build/test/…` output or compiled skill scripts named `*.test.mjs` would be picked up as well. Keep test files out of the emit, or give `node --test` explicit globs.

### 3. Types and porting effort

- No JSDoc types, no `@ts-check` and no `require`/`module.exports` in bin/src/scripts (full read of all 20 files).
- Needs real type design:
  - `src/config.js:41-110` validates raw `JSON.parse` output (parsed at `:114`) through a `failer` closure. It needs `(why: string) => never` for narrowing, and `:102` destructures a v1 shape.
  - `src/changelog.js:25-57` validates unknown entries.
  - `src/catalog.js:15-82` builds frontmatter as `string | string[]`.
  - Results in `src/sync.js:68-163` are keyed by bucket string.
  - `src/lifecycle.js:16,101-106` has large options bags.
  - The command handler map in `bin/cli.js:14,101-108` has heterogeneous return types (`remove` returns null or two shapes; `check` returns `{pending}`).
- Agent ids: `AGENTS[id]`/`MARKERS[id]` at `src/agents.js:6-38` with `AGENT_IDS = Object.keys(…)` (`:11`) need an `AgentId` union (`as const`/`satisfies`). They are used at `src/sync.js:75`, `src/commands/remove.js:35-36` and `src/rules.js:29`.
- `erasableSyntaxOnly` impact: `AgentChoiceError.found` (`src/agents.js:48-53`) must be a declared field, not a parameter property. No enums, namespaces or decorators are in use.
- `catch (err)` with `err.message` under strict (`useUnknownInCatchVariables`): `src/changelog.js:54`, `src/config.js:116`, `scripts/release-check.js:45,57`, `scripts/changelog.js:28`. No `err.code` checks exist.
- `noUncheckedIndexedAccess` is not part of `strict`. Turning it on would add many index-access errors (e.g. `argv[i]` in `src/args.js`).
- Trivial: errors, resolve, rules, picker, agents-md, commands/check, commands/changes, commands/update, scripts/changelog (9 files). Moderate: args, agents, scripts/release-check.

### 4. Toolchain facts (external, verified 2026-11-06)

- `npm view typescript dist-tags` returned `latest: 7.0.2`, `rc: 7.0.1-rc`, `beta: 7.1.0-beta`. The newest 5.x is 5.9.3. `typescript@7.0.2` ships a `tsc` bin, has `engines.node >=16.20.0`, and pulls platform binaries as optional dependencies (`@typescript/typescript-win32-x64`, `-linux-x64`, …).
- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) (published 2026-09-03):
  - It lists these default changes: `strict` true, `module` esnext, `target` latest stable ES, `noUncheckedSideEffectImports` true, `rootDir` `./`, `types` `[]`.
  - It lists these removals: ES5 target, `downlevelIteration`, `moduleResolution node/node10/classic`, `module amd/umd/systemjs/none`, `baseUrl`.
  - 7.0 ships no compiler API. `@typescript/typescript6` (`tsc6`) is offered for side-by-side use.
- The page did not mention `rewriteRelativeImportExtensions`, `erasableSyntaxOnly` or `verbatimModuleSyntax`. They are TS 5.7/5.8 options and are not on the removal list. That they still work in 7.0 is an inference to verify with a first `tsc` run.
- `@types/node` latest is 26.6.6. To keep the types honest against `engines >=22`, pin a `22.x` major (inference).
- Node constraints on type stripping, including the refusal under `node_modules`, are in [storage-access/research.md:210-235](../storage-access/research.md).

### 5. CI and publish

- `ci.yml:9-21`: a test matrix of ubuntu/windows × Node `22`/`latest` runs `npm test` with no install step. `release-check` (`:23-38`) runs `node scripts/release-check.js` on Node 22, and the aggregate `ci` job (`:41-53`) is the required check.
- `publish.yml:12-22`: the same test matrix. Then publish on Node 24 (`:30-63`): `npm publish --provenance --access public` (`:55`), then `node scripts/changelog.js notes` (`:58`). Trusted publishing is bound to the `publish.yml` filename ([archive/2026-10-30-simple-publish/plan.md:11](../../archive/2026-10-30-simple-publish/plan.md)).
- Needed (inference): an install step in every job that runs `tsc` or tests, and a build before `npm test` and before `npm publish`. That can be explicit steps or `prepack`/`prepublishOnly`. A `prepack` build differs from the rejected "prepack copy of skills" ([ai-skills-distribution-package/plan.md:65](../ai-skills-distribution-package/plan.md)), but the plan should say so explicitly. Paths `scripts/release-check.js` and `scripts/changelog.js notes` are asserted by `test/docs.test.js:150-177`. They stay valid only if those scripts still run from `scripts/` (stripped `.ts` in-repo, or in-place emit).
- No lockfile: `npm ci` requires one. `npm install` without one makes CI resolve devDependency versions on each run.

### 6. Committed skill-script output (for `storage-access` reuse)

- The catalog installs every file in a skill folder (`src/catalog.js:43-51`) and hashes it with CRLF→LF normalisation for text (`src/sync.js:13-20`). Compiled `.mjs` under `dist/skills/<skill>/scripts/` therefore become installed, hash-tracked skill content. Any change in emitted bytes, for example from a TS version bump, shows consumers an update.
- Windows CI checks out the repo with CRLF (no `.gitattributes` by decision: [hash-line-endings/plan-brief.md:28](../hash-line-endings/plan-brief.md)). A byte-exact "committed matches fresh build" check would fail on Windows. The precedent is `test/changelog.test.js:81-82`, which compares the LF form, so the check should do the same and `tsconfig` should set `newLine: "lf"`.
- `test/sync.test.js:226` asserts that every packaged file's LF form hashes as raw sha256. That holds for LF-emitted text `.mjs`.
- Skill scripts as `.mts` → `.mjs` need their own `rootDir`/`outDir` mapping. Use either a second `tsconfig` (project references) or a separate `tsc -p`, because one `outDir` cannot map `src/skills/x/scripts` onto `dist/skills/x/scripts` while the CLI emits elsewhere (inference). This change only has to leave the mechanism in place; `storage-access` adds the sources.

## Code References

- `bin/cli.js:1` - shebang
- `bin/cli.js:16` - package root = one level above the file
- `bin/cli.js:83,105` - reads `package.json` version
- `bin/cli.js:118-123` - top-level await, `process.exitCode`
- `scripts/changelog.js:8,14` - root lookup; writes `CHANGELOG.md`
- `scripts/release-check.js:35,64-65` - root lookup; direct-run guard
- `src/catalog.js:43-54` - `listFiles` includes every file; catalog at `<root>/dist/skills`
- `src/sync.js:13-20` - line-ending-insensitive content hash
- `src/config.js:41-116` - JSON validation that needs type guards
- `src/agents.js:6-53` - agent maps and `AgentChoiceError.found`
- `test/helpers.js:9-10` - `repoRoot` and `cli` path
- `test/docs.test.js:126,150-177` - reads CLI source; asserts workflow script paths
- `test/changelog.test.js:81-90` - LF comparison precedent; `files`/`scripts` assertions
- `test/catalog.test.js:34-37` - `dist` must not be gitignored
- `.github/workflows/ci.yml:9-38`, `.github/workflows/publish.yml:12-63` - no install or build steps
- `package.json:5-17,30-32` - `type`, `bin`, `files`, `engines`, scripts; no `devDependencies`

## Architecture Insights

- Runtime code takes the package root as a parameter everywhere except the three entry points. That leaves a single choke point for a layout change.
- The repo prefers checked-in generated artifacts with a test that proves they are fresh (`CHANGELOG.md` from `changelog.json`). The committed skill-script check fits that pattern and can be a `node --test` assertion rather than a separate CI script.
- Cross-platform byte stability is handled by normalising at comparison time, not by `.gitattributes`.

## Historical Context (from prior changes)

- [ai-skills-distribution-package/plan.md:71](../ai-skills-distribution-package/plan.md) "No runtime dependencies, no TypeScript build." The runtime-dependency half still holds and is restated in [change.md:14](change.md). The "no TypeScript build" half was superseded on 2026-11-06 ([storage-access/research.md:205](../storage-access/research.md)).
- [ai-skills-distribution-package/plan.md:75](../ai-skills-distribution-package/plan.md): `dist/skills/` is source of truth "despite the name `dist`". This still holds. The planned committed `.mjs` is generated content inside it, which is a new kind of file there.
- [ai-skills-distribution-package/plan.md:65](../ai-skills-distribution-package/plan.md): no `prepack` copy step for skills. It is not a ban on a `prepack` build, but it is adjacent.
- [archive/2026-10-30-simple-publish/plan.md:11](../../archive/2026-10-30-simple-publish/plan.md): `npm publish` must stay in `publish.yml`.
- [storage-access/research.md:241](../storage-access/research.md) "A build adds only a `typescript` devDependency". This is partly superseded: `@types/node` is also required under TS 7's `types: []` default (§4).
- [storage-access/research.md:247](../storage-access/research.md): the suggested tsconfig (`erasableSyntaxOnly`, `verbatimModuleSyntax`, `module: nodenext`, `rewriteRelativeImportExtensions`, TS ≥5.8) is still applicable. Add `rootDir`, `types: ["node"]` and `newLine: "lf"` for TS 7.
- Lockfiles: no prior decision found in `context/changes/**` or `context/archive/**` (keyword grep).

## Related Research

- [context/changes/storage-access/research.md](../storage-access/research.md), section "Follow-up 2026-11-06" (Node TS history, ship-JS rationale).
- [context/changes/vercel-skills-research/research.md](../vercel-skills-research/research.md) (`npx skills` installs from git `dist/skills/`).

## Open Questions

1. **Output layout:** A (`build/` + walk-up root lookup), B (in-place emit) or C (move sources, emit into `bin/`/`src/`)? §1 has the table.
2. **Tests:** keep `.js` against build output, or port to `.ts` on Node stripping (≥22.18 for local runs) plus a compiled-CLI smoke test?
3. **`scripts/`:** port to TS (and how it runs in CI given `test/docs.test.js:150-177`), or leave the two in-repo-only scripts as JS?
4. **Lockfile:** commit `package-lock.json` and use `npm ci`, or `npm install` without a lock? No prior decision exists.
5. **TS version:** pin `typescript@7` (native, current `latest`) or `~5.9`? TS 7's option support for `rewriteRelativeImportExtensions`/`erasableSyntaxOnly` is not yet confirmed by a run.
6. **Build trigger:** explicit workflow steps, or `prepack`/`pretest` npm scripts?
7. Not verified: whether `node --test` discovery descends into dot-directories such as the ignored `.claude/`, which contains `*.test.mjs` skill scripts locally.

## Follow-up 2026-11-06: how the 10x skills bundle and use scripts

**Question:** how do the 10x skills used in this session ship and call scripts, and what does that prior art imply for the skill scripts this toolchain must compile (`storage-access`)?

**Inspected scope:** the installed skills under the main checkout's `C:/Projects/Personal/skills/.claude/skills/` (35 folders, gitignored by `.gitignore:1` `.claude/`). These are local installed copies, not repo files, so the anchors below are paths inside that folder and are not reproducible from git. The provenance of the install was not traced beyond the marker `.10x-cli.json` (`{"version":1,"course":"10xdevs4"}`).

### Observed

- **5 of 35 skills bundle scripts, 10 files in all:**
  - `10x-research/scripts/`: `metadata-guard.mjs` (315 lines), `prose-json-check.mjs` (82) and `prose-json-check.test.mjs` (91).
  - `10x-plan/scripts/`: `metadata-guard.mjs` (315) and `metadata-guard.test.mjs` (295).
  - `10x-repo-map/scripts/`: `graph-metrics.mjs` (460) and `graph-metrics.test.mjs` (178).
  - `10x-ray/scripts/`: `xray.mjs` (866), which reads `../assets/xray.html`.
  - `10x-observability-audit/scripts/`: `fake-ingest.mjs` (61).
  - No `.ts`, `.js`, `package.json` or `tsconfig` exists in any skill folder (search for `*.{mjs,js,ts,mts,py,sh,ps1}`, `package.json`, `tsconfig*.json` across all 35).
- **The same file is copied into two skills, with no shared library.** `10x-plan/scripts/metadata-guard.mjs` and `10x-research/scripts/metadata-guard.mjs` are byte-identical (`cmp`). Each skill folder is self-contained.
- **Plain JS, zero dependencies, `node:` built-ins only.** Every script starts with `#!/usr/bin/env node` and imports only `node:*` modules (e.g. `metadata-guard.mjs:16-31`, `graph-metrics.mjs:13`, `fake-ingest.mjs:8-10`). There are 0 JSDoc `@param`/`@typedef`/`@ts-check` annotations across the 10 files. Headers state "No dependencies." (`metadata-guard.mjs:5`, `graph-metrics.mjs:4`, `prose-json-check.mjs:5`) or "Zero dependencies." (`fake-ingest.mjs:4`).
- **All use the `.mjs` extension.** That makes them ESM regardless of the consumer project's `package.json` `type` (inference from Node module rules: a `.js` file next to a `"type": "commonjs"` package.json would load as CJS). The skill copy sits inside the consumer's repo (`.claude/skills/…`), where any `package.json` may apply.
- **Invocation contract: the agent runs `node <skill-dir>/scripts/<name>.mjs`.**
  - The skill directory is the absolute "Base directory for this skill" the harness prints when the skill loads.
  - `10x-ray/SKILL.md:34-37` spells it out: the skill may live in a project `.claude/skills/` or in `~/.claude/skills/`, so "never derive it from the current repo".
  - Other examples: `10x-research/SKILL.md:127,140-141`, `10x-repo-map/references/agent-structure.md:58`, `10x-observability-audit/references/runtime-probes.md:27`.
  - `10x-plan/references/plan-persistence.md:59` resolves `../scripts/metadata-guard.mjs` "from this reference or the actual loaded skill directory".
- **Scripts find their own files relative to themselves.** `xray.mjs:28-33` locates `../assets/xray.html` via `fileURLToPath(import.meta.url)`. Tests locate their script with `new URL("./<name>.mjs", import.meta.url)` (`metadata-guard.test.mjs:19`, `graph-metrics.test.mjs:10`, `prose-json-check.test.mjs:10`).
- **Output protocol.** Machine-readable JSON on stdout; a refusal or report on stderr with exit code 1, set via `process.exitCode = 1` (`metadata-guard.mjs:5`, `:311`; `prose-json-check.mjs:5-6`, `:72`, `:78`). `graph-metrics.mjs` uses `process.exit(1)` for errors (`:40`) and `--help` (`:77`). `xray.mjs:378` exits 2 on a bad command.
- **Every Node-dependent step in the SKILL.md text has a manual fallback** for when Node is unavailable (`10x-research/SKILL.md:132`, `:147`; `10x-plan/references/plan-persistence.md:61`). One script states a floor: "Requires Node 18+" (`10x-ray/SKILL.md:37`).
- **Tests ship inside the skill, next to the script**, as `*.test.mjs` on `node:test`. They are black-box: each spawns `process.execPath` on the real script (`metadata-guard.test.mjs:1,31`; `graph-metrics.test.mjs:1,19`; `prose-json-check.test.mjs:1,19`). 3 of the 7 scripts have tests.
- **Line endings are preserved, not normalised, by the writer.** `metadata-guard.mjs:200-208` reuses the existing line terminator when inserting `updated:` and rejoins the original lines byte-for-byte.

### Implications for this toolchain (inference)

1. *(Partly superseded by the next follow-up: sources are `.ts`, the bundler emits `.mjs`.)* **Emit `.mjs` from `.mts` for skill scripts**, not `.js`, so they run as ESM inside any consumer repo. This settles the extension question for skill scripts and leaves the CLI free to emit `.js` under its own `"type": "module"`.
2. *(Resolved by the next follow-up: bundle per skill.)* **Each compiled skill script must be self-contained within its skill folder.** Install copies skill folders independently (`src/catalog.js:43-54`, `src/sync.js`), and `tsc` does not bundle. A shared TS helper imported from outside the skill would therefore emit as a relative import that breaks once installed. Options: duplicate the source per skill (the 10x precedent), keep shared code inside one skill, or add a copy/bundle step. The plan should state which; nothing requires it before `storage-access` has more than one script-bearing skill.
3. **Keep the entry contract the 10x skills use:**
   - shebang, `node:` built-ins only, JSON on stdout, refusal on stderr with exit 1 via `process.exitCode`
   - self-relative asset lookup via `import.meta.url`
   - SKILL.md calls `node <skill-dir>/scripts/<x>.mjs` and documents a fallback.

   `tsc` keeps a leading shebang in emitted output. That is long-standing tsc behaviour, not re-checked on 7.0.
4. **Self-relative lookups survive compilation only if the emitted `.mjs` keeps the source's position relative to the skill's assets.** If sources live outside `dist/skills/` (e.g. `src/skills/<skill>/scripts/x.mts` → `dist/skills/<skill>/scripts/x.mjs`), a `../assets/…` lookup must be written against the output location, not the source location.
5. **Where script tests live is still open** (storage-access research open question 4). The 10x skills ship `*.test.mjs` next to the scripts. In this repo every file in a skill folder is installed and hashed (`src/catalog.js:43-51`), so shipped tests become consumer-visible content. Keeping them under `test/` avoids that. Whether a consumer's plain `node --test` would pick up `.claude/skills/**/*.test.mjs` is still not verified (open question 7 below; a local check was not run).
6. **The Node floor stays consistent.** None of the inspected scripts needs anything beyond the repo's `engines >=22`. Compiled output targeting the TS 7 default (latest stable ES) would need a `target` no newer than what Node 22 supports. Set `target` explicitly (e.g. `es2023`) instead of relying on the TS 7 default (inference; no per-feature check was made).

### Effect on earlier findings

- §6 ("Committed skill-script output") still holds. This follow-up adds the `.mjs` extension rule, the self-contained-folder rule and the explicit `target` recommendation.
- Open questions 1–6 are unchanged. Two are added:
  8. **Shared code across skill scripts:** duplicate per skill, or add a copy/bundle step?
  9. **Script tests:** ship them next to the scripts (10x precedent) or keep them under `test/`? This merges with storage-access open question 4.

## Follow-up 2026-11-06: decisions on skill scripts, bundling and shared modules

### Decisions (from the user, 2026-11-06)

1. **Tests are not shipped.** Script tests stay outside `dist/skills/`. This resolves open question 9 and storage-access open question 4 (tests under `test/`).
2. **Shared code is bundled per skill.** Each skill's scripts are bundled so that the installed skill folder is self-contained. This resolves open question 8 in favour of a bundle step.
3. **The architecture supports shared modules from day one.** At first, only `interview-trainer` will have scripts, with isolated TS sources. The layout and build must still accept modules shared by several skills without restructuring later.
4. **Open, raised by the user:** whether `.mts` sources are needed once a bundle step exists. Answered below.

### Do sources need `.mts`? No, but the output still needs `.mjs`

- The `.mjs` requirement applies to the **emitted file**, not the source. The installed script runs inside the consumer's repo, where a `.js` file would follow that repo's `package.json` `type` (follow-up above, implication 1).
- A bundler names the output independently of the source extension. esbuild's "Out extension" option is documented as customising the generated extension, noting that ".mjs and .cjs file extensions have special meaning in node" ([esbuild API](https://esbuild.github.io/api/), read 2026-11-06). So sources can be plain `.ts`, emitted as `.mjs` (e.g. `outExtension: { '.js': '.mjs' }`).
- `tsc` reads `.ts` files as ESM here because the repo's `package.json:5` has `"type": "module"`, under `module: nodenext` (inference from TS module-detection rules; not re-checked on 7.0).
- **Superseded:** "Emit `.mjs` from `.mts`" in the previous follow-up's implication 1. The rule is now **`.ts` sources, `.mjs` output**.

### Bundler candidates (npm registry metadata, `npm view`, 2026-11-06)

| Package | `latest` | `engines.node` | Install footprint |
|---|---|---|---|
| `esbuild` | 0.28.2 | `>=18` | One package plus platform binaries as optional dependencies (`@esbuild/<platform>`) |
| `rolldown` | 1.3.0 | `^20.19.0 \|\| >=22.12.0` | JS dependencies `@oxc-project/types` and `@rolldown/pluginutils`, plus platform bindings |
| `tsdown` (wraps rolldown) | 0.23.7 | `^22.18.0 \|\| ^24.11.0 \|\| >=26.0.0` | Several JS dependencies (`cac`, `defu`, `obug`, `tinyps`, …) |

- **esbuild does not type-check.** Its docs say to "run tsc -noEmit in parallel with esbuild" and to enable `isolatedModules` ([esbuild content types](https://esbuild.github.io/content-types/)). So the toolchain is `tsc --noEmit` for types and the bundler for output. That matches the earlier tsconfig plan: `verbatimModuleSyntax` already implies the isolated-module discipline (inference).
- **tsdown's engines floor (22.18) is higher than the package's `engines >=22`.** That affects only contributors building locally, not users. esbuild's `>=18` floor does not constrain the repo.
- **Recommendation (inference):** esbuild. It has the smallest dependency surface, a floor below the repo's own, and the options needed here: `bundle`, `platform: 'node'`, `format: 'esm'`, `target`, `outExtension`, `metafile`. With `platform: 'node'`, `node:` built-ins stay external. Not verified in the docs: that esbuild preserves an entry file's leading shebang. The API page lists `hashbang` only as a syntax feature name, so a first build must confirm it, with `banner` as the fallback.

### Proposed layout for skill scripts (inference, for /10x-plan)

```
src/skills/<skill>/scripts/<name>.ts     entry points (one per shipped script)
src/skills/<skill>/lib/*.ts              skill-private modules (optional)
src/shared/*.ts                          modules usable by any skill's scripts
dist/skills/<skill>/scripts/<name>.mjs   committed bundle, self-contained
test/skills/<skill>/*.test.ts|js         tests, never under dist/skills/
```

- **Entries come from convention, not a list.** Every `src/skills/<skill>/scripts/*.ts` is an entry. Its output is `dist/skills/<skill>/scripts/<name>.mjs` (`outbase: src/skills`, `outdir: dist/skills`). Adding a skill or a shared module needs no build-config change. This is the "day one" requirement.
- **Use `splitting: false`.** Every entry inlines what it imports, `src/shared/*` included. Code splitting would emit shared chunk files that one skill's install would not contain (`src/catalog.js:43-54` installs per skill folder). The cost is duplicated code when one skill has several scripts that share modules. That is acceptable at this size.
- **Self-containment can be enforced mechanically.** esbuild's `metafile` lists each output's imports. A test (or the build script) can assert that every bundle imports only `node:` specifiers, so no relative import can escape the skill folder.
- **Committed-output check.** Rebuild into a temp dir and compare against the committed `dist/skills/**/scripts/*.mjs` in LF form, as `test/changelog.test.js:81-82` does. Also flag committed bundles that have no source entry. Byte stability across runs and OSes is assumed for the same pinned esbuild version, but not verified: the first CI run on the Windows/Linux matrix (`.github/workflows/ci.yml:9-16`) will show it. Pinning the exact esbuild version, plus a lockfile (open question 4), makes this check meaningful. This strengthens the case for committing `package-lock.json`.
- **Asset lookups are written against the output location.** A script reading `../assets/x` via `import.meta.url` resolves from `dist/skills/<skill>/scripts/`, not from `src/` (follow-up above, implication 4). Bundling does not change this.

### Effect on the CLI questions (inference)

Once the toolchain has a bundler, a CLI option opens up that keeps the layout problem from §1 away:

- **Option D:** bundle `src/cli.ts` (or `bin/cli.ts`) into a single `bin/cli.js` at the same depth as today. `bin/cli.js:16`'s one-level root lookup, `package.json` `bin`, and the `bin/` entry in `files` all stay unchanged. `src/` drops out of `files`. `bin/cli.js` becomes generated and gitignored, and the shebang question is the same as for skill scripts.
  - The tests' coupling (§2) remains. Tests would import `src/*.ts` under Node's type stripping (≥22.18 locally), or the plan keeps a `tsc` emit for tests only.
  - `test/docs.test.js:126` would read the TS source of the help text.
- Options A–C (§1) remain valid. Option D is listed because it reuses the bundler that the skill scripts need anyway. It is not a decision.

### Open questions after this follow-up

- Resolved: 8 (bundle per skill), 9 (tests not shipped).
- Unchanged: 1 (CLI layout; now A–D), 2 (tests: `.js` against build, or `.ts` via stripping), 3 (`scripts/`), 4 (lockfile; now more important), 5 (TS version), 6 (build trigger), 7 (`node --test` dot-dir discovery; still unverified).
- New:
  - 10. Bundler choice: esbuild (recommended) or rolldown.
  - 11. The name and location of the shared-module folder (`src/shared/` proposed).
