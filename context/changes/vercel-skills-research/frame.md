# Frame Brief: Own skills CLI vs Vercel `skills` CLI

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

We have a plan (`context/changes/ai-skills-distribution-package/plan.md`) for a custom npm CLI, `@pavel-agarkov/skills`. Vercel's `skills` CLI (vercel-labs/skills) appears to cover similar ground. The question as stated: "does it even make sense to have our own cli", and "can vercel option be used for internal/private packages/repos".

## Initial Framing (preserved)

- **User's stated cause or approach**: "I suppose we might be forced to implement our own solution by the lesson" (M5L4). The alternative is to use both: Vercel's CLI does the real work, ours exists "just for the certificate" with a simplified surface.
- **User's proposed direction**: Compare the plan with what Vercel's CLI can do, then decide whether our own CLI is worth having.
- **Pre-dispatch narrowing**:
  - Audience is **public / anyone**, not private.
  - "Certificate" means the **course completion badge** (10xChampion), not signing or access control.
  - First question to answer: the **capability gap** with Vercel's CLI.

## Dimension Map

1. **Capability gap**: what Vercel's CLI covers of the plan's install/update/configure/uninstall/manifest behavior.  ← initial framing
2. **Private/internal sources**: whether Vercel's CLI works for non-public skills (a future concern, since the audience is public).
3. **Course deliverable**: what the badge requires as evidence, and whether a wrapper around a third-party CLI satisfies it.
4. **Lesson requirements**: the five distribution needs and the installer properties the lesson expects.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Capability gap: Vercel's CLI already provides most of the plan | v1.7.4, MIT, active (last commit 2026-10-29). YES: install by name, copy vs symlink, `.agents/skills` target, non-interactive flags, 75+ agents. PARTIAL: update, remove, Windows. NO: tags, `configure`, AGENTS.md block, collision refusal, zero deps (`tar`, `yaml`). `installer.ts` does `rm(recursive, force)` on the whole skill dir before writing. It covers about half, **but not the plan's hard rules**. | WEAK as "most of the plan"; STRONG as "overlaps the basics" |
| Private/internal sources | Supports private GitHub/GitLab/SSH/local sources through the user's git credentials. No npm-registry source. Telemetry skips private GitHub repos, but non-GitHub sources are still reported unless `DISABLE_TELEMETRY=1`. | STRONG (answered) but **not decision-relevant** while the audience is public |
| Course deliverable needs our own installer | Badge evidence is 3 screenshots: workflow, package definition, released versions (lesson L461). Lines L50 and L52 make install/update/uninstall and multi-tool the installer's job. The lesson never mentions wrapping a third-party CLI. A wrapper without its own manifest/uninstall/multi-tool logic would plausibly miss L50/L52. | MEDIUM (inference, no explicit prohibition and no rubric found) |
| Lesson requirements: our plan vs the five | Met: single source of truth, install/update/uninstall. Partial: versioning (a single 0.1.0). Weak: authentication (a deliberate deviation, public npm) and multi-tool (`.agents/` only). | STRONG |

## Narrowing Signals

- Audience is public, so the Vercel CLI's private-repo handling does not affect the decision today.
- "Certificate" is the course badge. The deciding constraint is therefore what the course accepts, not what is technically optimal.
- The plan is already consumable by Vercel's CLI for free in a basic form. Plain `SKILL.md` folders in a public repo work with `npx skills add <repo> --skill x` (agent report; not tested).

## Cross-System Convention

The lesson treats marketplaces and similar channels as a legitimate shortcut for single-tool teams (L102-106). It expects a distribution package plus installer as the deliverable (L467, L473-486). It says nothing for or against delegating to a third-party CLI.

Limited pressure-testing: no independent no-hypothesis search was run, and the badge conclusion rests on one reading of the lesson. Several Vercel behaviors were read from docs and one source file (`installer.ts`), not run.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: the decision is not "Vercel or ours" on technical merit. It is **what minimum own-installer surface satisfies the course's installer requirements (lines L50 and L52, and the three-screenshot evidence), given that Vercel's CLI already serves the public-install case and the plan's hard rules are the part it lacks.**

Two framing assumptions did not hold. First, "forced by the lesson" is only an inference: no rule against wrapping a third-party CLI was found. Second, "ours just for the certificate" would likely under-deliver, because manifest-driven uninstall and multi-tool delivery have to live in the installer. The "both" idea survives in a narrower form: Vercel's CLI is a free alternative channel for the same `SKILL.md` folders, while our CLI stays the deliverable. The open question is how small that CLI can be while keeping the plan's hard rules, which is a scope question for /10x-plan.

## Confidence

**MEDIUM.** The capability gap and the private-source behavior are evidenced from docs and one source file. The course-requirement conclusion is an inference with no explicit rubric. To raise it to HIGH: (a) confirm with the course (Mission Log or the lesson authors) whether a project that delegates to a third-party CLI is accepted, and (b) check the Vercel `remove` and lock behavior by running it, since that part is documented rather than tested.

## What Changes for /10x-plan

The existing plan holds up as the deliverable. What it needs is a decision on scope trimming (which of tags, `configure`, the AGENTS.md block and the cleanup logic stay), plus two additions the investigation found. One is an explicit step for the three evidence screenshots and a second released version. The other is a short README note on how the plan answers the authentication and multi-tool requirements, and on how the same folders can be installed through Vercel's CLI.

## References

- Source files: `context/changes/ai-skills-distribution-package/plan.md` (P5, P33, P36, P159-167, P208-230, P297); `shared-ai-registry-skills-commands-and-rules-for-your-team.md` (L42-54, L102-106, L461, L467-469, L506-512)
- External: https://github.com/vercel-labs/skills (README.md, docs/commands.md, src/installer.ts, src/source-parser.ts, src/git.ts, src/telemetry.ts)
- Investigation: three parallel sub-agents (capability gap, private sources, course deliverable); no TaskCreate IDs
