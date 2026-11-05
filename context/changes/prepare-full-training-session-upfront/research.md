---
date: 2026-11-05
repository: pavel-agarkov/skills
git_commit: df61752a4e012c81190f6b020d8d28968bd213e2
branch: agents/full-training-session-upfront-prep
topic: Prepare full training sessions upfront
tags: [research, interview-trainer, preparation, latency, subagents]
status: complete
last_updated: 2026-11-05
---

# Research: Prepare full training sessions upfront

## Research question

How can the interview trainer prepare a full session where feasible, optionally researching independent topics in parallel, without sacrificing adaptive scheduling, verified grading, or resumability?

## Summary

**Framing clarification (2026-11-05):** The user subsequently clarified that preparation should produce a larger adaptive candidate pool and may persist that pool between sessions. [frame.md](frame.md) supersedes this research's session-local lifetime recommendation and its proposed completion-time cleanup. The observations about current behavior remain applicable; retention, freshness, deduplication, and compatibility now need a cross-session contract.

Upfront preparation is feasible as a trainer-skill change, not an installer feature. The strongest approach is a **session-local pool of verified question candidates**, with bounded alternative coverage and selection deferred until each turn. Reuse shared source metadata, but do not turn the source cache into a permanent answer bank.

The existing instructions do not define a future-question store or parallel research protocol. They also cannot guarantee that a fixed set of questions will cover every possible answer-dependent path. Full preparation should therefore be a best-effort coverage goal, with targeted replenishment when a genuinely new requirement arises.

No latency benchmark or live training session was run for this research. The user's waiting-time report is the problem statement; the findings below establish workflow constraints, not a measured speedup.

## Evidence and current behavior

| Area | Verified behavior | Consequence |
|---|---|---|
| Startup | Length is selected before the first question; supported lengths include custom values from 1 to 99. Startup then selects, verifies, persists, and asks the first question. [sessions.md:5](../../../dist/skills/interview-trainer/references/sessions.md#L5) | Preparation can start after accepted configuration and length are known. Work must scale with requested length, not every possible question. |
| Diagnosis | Two questions per subtopic, with an answer-dependent third; broad topics alternate where possible. [questions.md:5](../../../dist/skills/interview-trainer/references/questions.md#L5) | A fixed ordered script can waste work or change diagnostic behavior. |
| Adaptation | Lifetime weak/medium/strong buckets target approximately 70/20/10; oldest last-asked wins within a bucket. Levels can change after grading. [questions.md:11](../../../dist/skills/interview-trainer/references/questions.md#L11) | Candidate eligibility and priority must be checked against the latest progress, not frozen at startup. |
| Repetition | History retains five concept/angle pairs per subtopic; same-concept reuse is restricted, with a different-angle reinforcement exception after a score at or below 0.50. [questions.md:17](../../../dist/skills/interview-trainer/references/questions.md#L17) | Distinct wording is not sufficient diversity. Prepared alternatives need stable IDs and materially different reasoning. |
| Presentation effects | History, current-question state, last-asked, format counts, and transcript are updated immediately before presentation. Asked count changes only on grading. [questions.md:30](../../../dist/skills/interview-trainer/references/questions.md#L30) | Preparing a candidate must not count as asking it or consume history. |
| Source cache | Only metadata is allowed; claims, answers, rubrics, and templates are explicitly excluded. Freshness is 180 days for stable foundations and 30 for version-sensitive material, with mandatory revalidation triggers. [sources.md:13](../../../dist/skills/interview-trainer/references/sources.md#L13) | Any candidate store needs an explicit distinction from source metadata. A fresh URL record alone does not persist the candidate's grading criteria. |
| Persistence | The documented files include one current question, but no prepared pool. Configuration has schema version 3. Reads are deliberately selective. [storage.md:3](../../../dist/skills/interview-trainer/references/storage.md#L3), [storage.md:15](../../../dist/skills/interview-trainer/references/storage.md#L15), [storage.md:86](../../../dist/skills/interview-trainer/references/storage.md#L86) | A durable pool and compact selection index need a documented schema and compatible recovery behavior. Loading all future rubrics every turn would defeat selective reads. |
| Grading | Grade only against the persisted rubric and source; update progress and session before feedback, then clear the current question. [grading.md:3](../../../dist/skills/interview-trainer/references/grading.md#L3) | Promote a selected candidate into the existing current-question representation; do not grade against a mutable pool entry. |
| Resume | An awaiting question is presented unchanged without selecting or persisting it again. [sessions.md:26](../../../dist/skills/interview-trainer/references/sessions.md#L26) | Pool preparation or repair must not replace an unanswered question or append it twice. |
| Configuration | Focused preference changes preserve compatible progress and the active session; topic operations also preserve session/history. [configuration.md:19](../../../dist/skills/interview-trainer/references/configuration.md#L19), [topics.md:31](../../../dist/skills/interview-trainer/references/topics.md#L31) | Prepared material needs compatibility checks and selective invalidation. Do not silently restart a session. |
| Privacy | Preparation details and rubrics stay out of pre-question messages and transcripts. References are already reused within a conversation. [SKILL.md:14](../../../dist/skills/interview-trainer/SKILL.md#L14), [SKILL.md:56](../../../dist/skills/interview-trainer/SKILL.md#L56), [sessions.md:47](../../../dist/skills/interview-trainer/references/sessions.md#L47) | No future-question previews or topic-specific progress narration. Reference reuse alone does not solve research/construction work. |

### Package boundary

The trainer is shipped as Markdown instructions and references. The catalog discovers skill folders and includes their files recursively; it does not execute training logic. See [catalog.js:43](../../../src/catalog.js#L43) and [catalog.js:53](../../../src/catalog.js#L53). No dedicated trainer runtime or behavioral test harness was found in the repository's JavaScript source/tests.

The existing [acceptance checklist](../../../dist/skills/interview-trainer/references/acceptance.md) is the relevant behavioral contract. [Catalog tests](../../../test/catalog.test.js#L22) validate packaging, while [documentation tests](../../../test/docs.test.js#L25) cover README commands and other package contracts, not adaptive training or latency. Passing those tests would not demonstrate this improvement.

## Options

| Option | Benefits | Limitations |
|---|---|---|
| Research sources upfront, construct questions on demand | Smallest storage change; less duplicate retrieval/search | Question/rubric construction remains between turns; only a partial answer to the request |
| Generate exactly N questions in fixed order | Simple and predictable for non-adaptive quizzes | Changes existing diagnostic, bucket, level, format, and reinforcement behavior; not recommended |
| Session-local candidate pool with bounded alternatives | Moves both verification and construction earlier; supports resume and answer-dependent selection | Requires a new storage contract, compatibility checks, and targeted replenishment |
| Exhaustive tree of every possible adaptive path | Theoretical coverage of many future branches | Combinatorial work, large context/storage, and excessive startup delay; not recommended |

**Recommendation for planning:** the session-local pool. Upfront research is a useful partial result when complete candidate preparation is not feasible, but should not be described as a fully prepared session.

## Proposed preparation and selection contract

These are recommendations, not implemented behavior.

1. After configuration and length are known, inspect compact progress and relevant history, reuse eligible source records, and allocate preparation across likely diagnostic/adaptive needs.
2. Aim to cover the remaining question count with usable candidates plus bounded alternatives for plausible level changes, formats, and reinforcement. Do not precompute every combination of topic, format, level, and answer.
3. Keep a compact session-linked index and addressable candidate records separate from source metadata, transcripts, and archives. Record compatibility inputs such as taxonomy, language, allowed formats/code, difficulty range, and verification context.
4. Each ready candidate needs a stable ID, topic/subtopic, applicable level, format, concept/angle IDs, question text, choices where relevant, complete private rubric, and verified source identity. Retain the source verification timestamp and version/stability context needed to apply existing freshness rules.
5. Define partial versus ready material explicitly. An unverified draft or source-only result is not eligible for presentation. If claims/rubrics need reverification after context loss, count that work honestly rather than assuming a source metadata entry contains the evidence.
6. Only the coordinator admits verified candidates and writes shared training state. Preparing candidates does not change counters, history, review links, or the transcript.
7. After each grade, run the existing scheduler using updated progress and history. Select an eligible prepared candidate, rechecking compatibility and mandatory source revalidation triggers. Do not choose an unsuitable topic merely because its preparation finished first.
8. Promote the selected candidate to the normal persisted current-question state, then apply the existing pre-presentation side effects exactly once. Discarded and unasked candidates have no scoring/history effects.
9. If no suitable candidate exists, prepare the missing material for the selected need. Preserve verified work from other topics; do not rebuild the whole pool. If source verification fails, choose another candidate under the existing source policy.
10. On resume, an awaiting question takes precedence. Reuse compatible prepared records for later turns; legacy sessions with no pool remain valid and can prepare material without losing progress.
11. Configuration/topic changes invalidate only incompatible future material. Define how to handle an already awaiting question explicitly; do not silently rewrite it. Completion/abandonment must define cleanup of session-local preparation without changing transcript archival behavior.

### Meaning of "full"

Having N stored drafts is not proof of readiness: some may become ineligible after repetition filtering or a level change. Report preparation coverage internally as verified eligible material and known gaps, not just file count. A promise of zero preparation for every possible answer path is not supported by bounded preparation.

Private here means excluded from normal chat/transcript output, not hidden from a workspace owner who can inspect files. The current question already stores a rubric on disk. A pool extends that existing trust model; it does not provide filesystem secrecy.

## Parallel topic research

Official documentation supports scoped delegation, but harness capabilities differ:

- [VS Code subagents](https://code.visualstudio.com/docs/agents/run/subagents), accessed 2026-11-05: separate contexts, explicit self-contained tasks, tool-dependent availability, and read-only coordinator/worker examples. The Local harness does not pass the main conversation history, and its invocations are stateless. Delegation adds usage and coordination overhead.
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents), accessed 2026-11-05: separate context, tool access, independent permissions, and requests counting toward shared usage limits.

These sources establish delegation feasibility, not identical concurrency semantics across supported consumers or a measured training speedup. Do not embed one harness's tool names, agent identifiers, model selection, or background APIs into the portable trainer.

Recommended worker boundary:

- Assign independent, bounded topic/subtopic coverage, including required language, levels/formats, forbidden recent concepts, and official-source requirements.
- Request structured candidate material and source verification evidence, with explicit gaps. Workers do not ask the learner questions, grade answers, read transcripts/archives, or mutate shared state.
- The coordinator validates returned evidence and rubrics, deduplicates concepts/source records, and persists accepted material. A worker's unsupported assertion of verification is not sufficient.
- Use a small bounded number of workers only when tools and permissions allow and the workload warrants the overhead. No nested delegation or one worker per question by default.
- Keep successful partial results if another worker fails; prepare remaining needs directly. Do not repeatedly retry the same failed delegation.
- Do not assume workers keep running while the user answers. Background continuation is an optional harness capability, not a correctness dependency.

No custom worker agent or additional tool dependency is necessary to define this behavior in the skill. Whether worker files are worthwhile should depend on an actual repeated need, not this optimization alone.

## Affected surfaces for a later implementation

| Surface | Required alignment |
|---|---|
| [SKILL.md](../../../dist/skills/interview-trainer/SKILL.md) | Preparation privacy, reference routing/reuse, separation of candidate state from source metadata |
| [sessions.md](../../../dist/skills/interview-trainer/references/sessions.md) | Startup preparation, resume precedence, legacy sessions, completion/abandonment cleanup |
| [questions.md](../../../dist/skills/interview-trainer/references/questions.md) | Candidate eligibility, adaptive selection, bounded alternatives, side-effect-free preparation, targeted replenishment |
| [sources.md](../../../dist/skills/interview-trainer/references/sources.md) | Metadata-only cache retained; candidate verification and revalidation distinguished explicitly |
| [storage.md](../../../dist/skills/interview-trainer/references/storage.md) | Pool/index schema, selective reads, session identity, compatibility, partial preparation, recovery/migration |
| [grading.md](../../../dist/skills/interview-trainer/references/grading.md) | Existing persisted-current-question grading retained; next selection uses updated progress |
| [configuration.md](../../../dist/skills/interview-trainer/references/configuration.md), [topics.md](../../../dist/skills/interview-trainer/references/topics.md) | Selective invalidation and preservation of compatible progress/session state |
| [cli.md](../../../dist/skills/interview-trainer/references/cli.md) | Load preparation instructions only for operations that need them; no new user command/flag is necessary |
| [acceptance.md](../../../dist/skills/interview-trainer/references/acceptance.md), [README.md](../../../dist/skills/interview-trainer/README.md) | New lifecycle/performance checks and brief expectations for initial preparation versus subsequent turns |

## Validation strategy

Use the existing checklist plus representative controlled training runs. Collect timings/tool traces outside user transcripts; do not read transcripts back to measure the trainer.

| Scenario | Required observation |
|---|---|
| Fully covered multi-topic session | Initial preparation cost recorded; all subsequent eligible prepared questions selected without new search, retrieval, or rubric construction absent a revalidation trigger |
| Score-driven branch | Low-score reinforcement, diagnostic third question, and permitted level changes still obey scheduling; replenish only a demonstrated gap |
| Repetition and format mix | Prepared candidates rejected when their reasoning is no longer eligible; only actually presented questions affect history, last-asked, and format counts |
| Source boundaries | 179/181-day and 29/31-day cases retain existing behavior; current/latest, version change, conflicting guidance, failed link, and lost coverage still force validation |
| Parallel versus direct preparation | Same readiness/verification requirements with and without workers; deduplicated sources, bounded delegation, no competing writes |
| Partial failure | One failed worker or unavailable source does not destroy accepted work or allow an unverified question |
| Resume/recovery | Same unanswered question, no duplicate transcript append; compatible pool reuse across conversations; missing optional pool in legacy sessions handled without resetting progress; malformed new state reported explicitly |
| Preference/topic change | Incompatible future records rejected while compatible progress and current-session identity survive |
| Completion/abandonment | No unused draft in transcript/history; cleanup and existing archive behavior preserved |

Measure time to first question, answer-to-feedback/next-question median and maximum, total user-visible waiting, research calls after startup, preparation calls/tokens, and unused candidate count. Compare equal-length sessions with the same configuration, initial state, and scripted answers; include both cold-source and reusable-source cases and repeat runs because model/network latency varies.

No existing timing baseline supports a numeric wall-clock target. A precise first acceptance target is **zero new research or question/rubric construction on covered turns without a revalidation trigger**. Timing measurements must additionally show reduced between-question waits and expose startup/total cost rather than declaring success from tool counts alone.

## Decisions left for framing/planning

1. Preparation budget and coverage policy for long sessions: how much startup work and reserve coverage are justified before falling back to targeted preparation?
2. Exact candidate/index layout, schema compatibility rules, and retention/cleanup policy. Keep the source cache metadata-only and avoid a cross-session permanent question bank unless separately requested.
3. How to preserve sufficient verification context for resumed candidates without creating a general document-content cache.
4. A measurable latency acceptance threshold after collecting a baseline.

## Scope and limitations

Research inspected shipped trainer instructions, package catalog behavior, relevant test coverage, and the official delegation documentation above. No trainer files, installer behavior, dependency manifests, release metadata, or real learner state were changed. No adaptive-session execution, concurrency experiment, or performance claim has been verified yet.

Suggested next step: `/10x-frame prepare-full-training-session-upfront`.
