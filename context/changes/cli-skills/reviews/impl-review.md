<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: CLI Control Skill (`pa-skills`)

- **Plan**: context/changes/cli-skills/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-31
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

User-approved deviations, not counted as findings:
- The README row and the catalog test change moved into Phase 1.
- 0.2.x content removed from the skill and the README, with the docs test rewritten to match.

## Findings

### F1 — Deletion warning misses partial removes that delete everything

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: dist/skills/pa-skills/SKILL.md:48 (rule 5), :103
- **Detail**: Rule 5 gives the extra deletion warning only for a bare `remove` and for `remove --agent`. But `remove` also calls `removeAll` when a partial `--skill` / `--tag` leaves nothing selected (src/commands/remove.js:158), and when `--agent` drops the last agent (:125). That deletes every tracked file, the rules-file block and `.pa-skills.json`. So "remove my only skill" would get no extra warning.
- **Fix**: Base rule 5 on the dry-run output as well as the flags: if it prints `config .pa-skills.json would be deleted`, apply the extra warning.
- **Decision**: FIXED (rule 5 and the remove recipe updated)

### F2 — 0.3.0 changelog note links to the removed README section

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: changelog.json:16, CHANGELOG.md:14
- **Detail**: The 0.3.0 note says "to roll back, see \"Upgrading from 0.2.x\" in the README", but Phase 1 deleted that section. `update` and `changes` print these notes for projects recorded below 0.3.0 (src/commands/update.js:45, src/commands/changes.js:25). No test catches the broken reference.
- **Fix A ⭐ Recommended**: Reword the 0.3.0 note to drop the README pointer, then regenerate CHANGELOG.md.
  - Strength: Matches your decision that 0.2.x is not documented; no dangling links.
  - Tradeoff: Edits an already-published entry; the npm copy of 0.3.0 keeps the old text.
  - Confidence: HIGH — scripts/release-check.js:24 only validates the head version's entry, so editing older entries is allowed.
  - Blind spot: None significant.
- **Fix B**: Leave it as historical text.
  - Strength: Published history stays untouched.
  - Tradeoff: A 0.2.x user who upgrades would be pointed at a section that doesn't exist (you've said there are none).
  - Confidence: HIGH — no code impact.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A

### F3 — plan.md doesn't record the approved deviations

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/cli-skills/plan.md (Desired End State, Phase 1 contract, Phases 2 and 3)
- **Detail**: The plan still lists the 0.2.x upgrade refusal and the "never `add --agent claude-code` alone" rule. It also still places the README and catalog-test changes in Phases 3 and 2. Future reviews and the archive will read the plan as ground truth.
- **Fix**: Add a short "## Deviations" addendum to plan.md recording the two approved deviations; leave the phase blocks as written.
- **Decision**: FIXED (## Deviations added to plan.md)

### F4 — `@latest` reasoning also applies to add and remove

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: dist/skills/pa-skills/SKILL.md:53-55
- **Detail**: The skill says to use `@latest` because "npx may otherwise serve a cached older version". The same risk applies to plain `add` and `remove`. The plan's version rule is applied as decided. With no 0.2.x users, a stale cache only affects whether new catalog skills are visible.
- **Fix**: Keep the plan's rule as decided; revisit only if a stale `add` causes trouble.
  - Strength: Matches the plan and the README's Quick start, which uses plain `add`.
  - Tradeoff: A stale cache could hide a newly added skill from `list` / `add`.
  - Confidence: MED — depends on npx cache behavior in user environments.
  - Blind spot: How often npx serves a stale version in practice.
- **Decision**: ACCEPTED (kept the plan's version rule as decided; no edit)

### F5 — Example check for each command passes on the routing table alone

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: test/docs.test.js:116
- **Detail**: `used.has(c)` ("no example command for …") is always satisfied by the Command routing table, because its rows contain `npx …` commands. Removing a recipe's examples would not fail the test.
- **Fix**: Build `used` only from commands inside fenced code blocks, so the table rows don't count.
- **Decision**: FIXED (the example check counts only commands in fenced code blocks)

### F6 — `--agent` values in skill examples aren't validated

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: test/docs.test.js:104-108
- **Detail**: The drift test checks `--skill` and `--tag` values against the catalog, but not `--agent` values. A typo such as `--agent universl` would pass.
- **Fix**: Also assert that each `opts.agents` value is PLACEHOLDER, `*`, or a known agent id.
- **Decision**: FIXED (--agent values must be the placeholder, `*` or a known agent id)

### F7 — Rule 4 says the CLI refuses on a modified file

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: dist/skills/pa-skills/SKILL.md:47
- **Detail**: "When the CLI refuses because of a collision or a modified file…" A collision is a refusal (exit 1, src/sync.js:87), but a modified file is only skipped with a warning.
- **Fix**: Reword to: "When the CLI refuses because of a collision, or skips a modified file, report it and let the user decide whether to pass `--force`."
- **Decision**: FIXED (rule 4 reworded)

## Triage summary

- Fixed: F1, F2 (Fix A), F3, F5, F6, F7
- Accepted: F4
