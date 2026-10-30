<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Multi-harness install

- **Plan**: context/changes/multi-harness-install/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-10-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 4 observations

Phases 3 and 5 are code-complete. Only the manual checks 3.8 (Claude Code in a CLAUDE.md repo) and 5.6 (post-publish run) are still pending.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Success criteria were re-run on 2026-10-30. `npm test` passed 180/180. `node scripts/release-check.js 0.2.0` passed. `npm run changelog` left `CHANGELOG.md` unchanged. `npm pack --dry-run` lists `src/agents.js` and `src/rules.js`. Manual checks 3.8 and 5.6 are pending, not rubber-stamped.

## Findings

### F1 — `add` on a v0.2.0 install offers the destructive `--agent claude-code`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/commands/add.js:14-22
- **Detail**: Take a v1 config in a repo that also has `.claude/` or `CLAUDE.md`. A plain `add` exits 2 with the fresh-install message, which says to re-run with `--agent claude-code`, `--agent universal` or `--agent claude-code,universal`. On a v1 install, `--agent claude-code` alone saves only `claude-code`, so it deletes the unmodified `.agents/skills` copies. README and changelog warn against exactly this. `update`, `check` and `remove` use the safe upgrade wording from `savedAgents` (src/lifecycle.js) instead.
- **Fix**: In `chooseAgents`, when a config was read (`prev` is not null, so this is the v1 upgrade case), raise the upgrade wording instead. That wording names only `add --agent universal` and `add --agent claude-code,universal`. Keep exit 2 for `add`. Add a test.
- **Decision**: FIXED — chooseAgents uses upgradeChoiceMessage for a v1 config; test in test/update.test.js

### F2 — CLAUDE.md symlinked to AGENTS.md is rewritten twice on every run

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/rules.js:12-19, src/lifecycle.js (apply loop)
- **Detail**: With both agents selected and a root CLAUDE.md, `AGENTS.md` (listing `.agents/skills`) and `CLAUDE.md` (listing `.claude/skills`) are separate targets. If CLAUDE.md is a symlink or hard link to AGENTS.md, the second write replaces the first block. As a result, `update` reports a change on every run, `check` always exits 3, and `remove` warns that the second block "was already removed". No consumer text is lost. This was found by reading the code; it has not been reproduced.
- **Fix A ⭐ Recommended**: In `resolveRulesTargets`, treat a CLAUDE.md whose `realpathSync` equals AGENTS.md's as AGENTS.md, so the agents share one block. Add a symlink test, skipped where symlinks are unavailable.
  - Strength: Covers the common `ln -s AGENTS.md CLAUDE.md` setup with a small change in the one place that picks targets.
  - Tradeoff: Hard links are not detected (realpath differs); creating symlinks needs privileges on Windows, so tests may skip there.
  - Confidence: MED — the logic is simple, but it has not been reproduced.
  - Blind spot: How often consumers use hard links rather than symlinks.
- **Fix B**: Document the limitation in the README "AGENTS.md index" section.
  - Strength: No code change before 0.3.0 is released.
  - Tradeoff: `check` in CI exits 3 on every run for those consumers until it is fixed.
  - Confidence: HIGH — wording only.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A, strengthened: `sameFile` (dev+ino, covers symlinks and hard links) in src/rules.js, also applied to old-file computation in reconcile; 3 tests in test/rules.test.js

### F3 — Full remove prunes empty folders of agents that were never installed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/commands/remove.js:40-41, 81
- **Detail**: `removeAll` runs `pruneAgentDir` for every registry agent. A `universal`-only install therefore also removes a consumer's pre-existing empty `.claude/skills/` or `.claude/`, which breaks "uninstall removes exactly what install added". No file content can be lost, because only empty dirs are removed. The plan text ("handles every registry agent in turn") asked for this behaviour, so the flaw is in the plan, not the implementation.
- **Fix**: Prune only the saved agents (`prev.agents`, or `['universal']` for a v1 config), as the partial path at src/commands/remove.js:176 already does. Add a test with a pre-existing empty `.claude/`.
- **Decision**: FIXED — pruneAgentDirs prunes only the saved agents (universal for v1); test in test/remove.test.js

### F4 — Documented extras beyond the plan's contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/sync.js (collision exemption), src/commands/remove.js:176, src/lifecycle.js (isPending), src/commands/remove.js:117, README.md (rollback)
- **Detail**: Five behaviours go beyond the contract. All are benign and were reported during implementation:
  - (a) The collision check also exempts a folder when the skill and its agent were installed before.
  - (b) `remove --agent` prunes the dropped agent's empty folders.
  - (c) `isPending` counts an already-gone rules file.
  - (d) Partial `remove` on a v1 config runs detection.
  - (e) The README rollback steps add `--force` and manual deletion of `.claude/skills`.
  The plan, the source of truth for later reviews, does not record them.
- **Fix**: Add a short "Implementation addenda" note to plan.md listing (a)–(e).
- **Decision**: FIXED — "Implementation addenda" section added to plan.md (before Progress), also listing review fixes F1–F3

### F5 — README omits that `remove --agent` / `--agents-md` also fail once on v0.2.0

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: README.md, "Upgrading from 0.2.x"
- **Detail**: On a v1 install in a repo with both harnesses, `remove --agent X` and `remove --agents-md` fail the same way as `remove --skill` / `--tag`. The README names only `--skill` / `--tag`. A bare `remove` works.
- **Fix**: Change "as does `remove --skill` / `--tag`" to "as does a partial `remove`".
- **Decision**: FIXED — README upgrade section now says "a partial `remove`" and that a bare `remove` still works

### F6 — A hand-edited `createdFile: true` on CLAUDE.md could delete CLAUDE.md

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/config.js (validateConfig, `installed.rules`)
- **Detail**: We never create CLAUDE.md, so `installed.rules["CLAUDE.md"].createdFile` should never be true. A hand-edited config that sets it lets `removeBlock` delete the file when only our block remains.
- **Fix**: In `validateConfig`, reject `createdFile: true` for any key except `AGENTS.md`.
- **Decision**: FIXED — validateConfig rejects createdFile: true for any key but AGENTS.md; test in test/config.test.js

### F7 — A partial write failure leaves untracked copies that collide on retry

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lifecycle.js (reconcile), src/sync.js (collision check)
- **Detail**: Skill files are written before the rules blocks and the config. If a later write fails (EACCES, disk full, a Windows file lock), the new agent's copies are on disk but not in the manifest, so the next `add` reports a collision and needs `--force`. The legacy config is safe, because it is deleted only after the root write. The plan accepts non-atomic writes.
- **Fix**: Accept as-is; the collision error already names `--force`.
- **Decision**: ACCEPTED — the plan accepts non-atomic writes; the collision error already names --force

### F8 — Domain module imports `UsageError` from the CLI parser

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/agents.js:3
- **Detail**: `expandAgents` throws `UsageError` imported from src/args.js. Other non-command modules, such as src/config.js and src/resolve.js, throw plain `Error`, and the commands map errors to exit codes. There is no import cycle today.
- **Fix**: Leave as-is, or move `UsageError` into its own small module that both can import.
- **Decision**: FIXED — UsageError moved to src/errors.js (re-exported from src/args.js); src/agents.js imports it from there
