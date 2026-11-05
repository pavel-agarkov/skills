# Reusable Training Question Pool Implementation Plan

## Overview

Add an optional, persistent pool of verified interview questions. Prepare a larger choice set independently of any one session, then select using current progress and level. Preserve the existing on-demand trainer when no usable pool exists and the user declines preparation.

This is a plan, not an implementation. The research's session-local lifetime and the frame's exclusion of new commands are superseded by subsequent user input.

## Inputs and confirmed decisions

- [Change request](change.md), [research](research.md), and [frame](frame.md).
- Latest request: add a separate skill command for preparation, use an existing pool, offer preparation before a session, and retain existing logic when declined.
- Planning confirmation: offer only when no usable pool exists; ask for a target count with default 25; retire exact questions on presentation and retain unused candidates across sessions.

## Current state

- [SKILL.md](../../../dist/skills/interview-trainer/SKILL.md) and [cli.md](../../../dist/skills/interview-trainer/references/cli.md) define a strict command grammar and global `--improve`.
- [sessions.md](../../../dist/skills/interview-trainer/references/sessions.md) initializes a session/transcript after session-length selection and then prepares one question.
- [questions.md](../../../dist/skills/interview-trainer/references/questions.md) defines diagnostic/adaptive scheduling, level movement, repetition, and presentation side effects.
- [storage.md](../../../dist/skills/interview-trainer/references/storage.md) defines configuration schema 3, selective reads, and one persisted current question; no pool exists.
- [sources.md](../../../dist/skills/interview-trainer/references/sources.md) permits metadata-only caching, with 180/30-day freshness and mandatory revalidation triggers.
- [grading.md](../../../dist/skills/interview-trainer/references/grading.md) grades the persisted current question and updates progress before the next selection.

The package has no trainer execution engine. Implement the workflow in the shipped Markdown, not a JavaScript simulation that only appears to test agent behavior.

## Non-goals

No fixed sequence, exhaustive branching tree, guaranteed coverage of every future answer, globally shared bank, public installer command, new dependency, model override, background execution requirement, score-model change, or transcript reads. Package versioning, changelog, publishing, and validation of the published package in another repository are included in phases 5-6; this planning update itself performs none of those actions.

## User-facing workflow

### Standalone preparation

Canonical invocation: `/interview-trainer prepare [--improve]`.

1. Route natural-language requests to prepare/top up a question pool to the same operation. Update all usage strings, frontmatter hints, command tables, and reference routing.
2. Require accepted, ready configuration. If setup is incomplete, report the prerequisite and offer the existing configuration workflow; do not research an unaccepted taxonomy.
3. Ask exactly one question for the target total of compatible, unused, verified candidates, default 25. Reuse the trainer's 1-99 integer range for this first version; a clear natural-language count supplies the value directly. State that this is a pool target, not a session length.
4. Count suitable existing entries before generating. Top up to the target, not by the target. A smaller requested target does not delete surplus valid candidates.
5. Prepare bounded batches, preserving verified partial results if the target cannot be reached. Explain incomplete preparation generically without revealing question/topic/level/source/rubric details; do not report the pool as fully prepared when it is not.
6. Finish with generic ready/partial counts and known readiness limitations, not a quiz question. Do not create a transcript/session, change scores/history, or consume a question.
7. Honor global `--improve` as an immediate-command proposal, not an automatic skill edit or a new session improvement flag.
8. Allow explicit preparation while a question awaits an answer, but preserve the exact awaiting-question snapshot and all active-session state. The preparation command takes routing precedence over answer grading.

### Starting a new session

Resolve existing incomplete-session and transcript-recovery conflicts first, using current rules.

1. Obtain the session length using the existing choices/range. A natural-language supplied length avoids this question.
2. Inspect pool metadata and current scheduling state. A **usable pool** has at least one currently compatible, unpresented, source-fresh candidate for a presently schedulable need. File existence or a count of unrelated candidates is not enough. Distinguish stale repairable candidates from ready ones.
3. If a usable pool exists, reuse it automatically without another preparation prompt. Partial coverage is allowed; do not silently top up a whole pool just because it has fewer entries than the session length.
4. Otherwise ask one generic choice: prepare a reusable pool first, or start now using on-demand questions. This prompt contains no candidate details. A clear request to start without preparation supplies the decline; a clear request to prepare supplies consent.
5. On consent, ask the separate pool-target question (default 25), then perform preparation. Session length and pool size remain independent.
6. On decline, skip pool creation, stale-pool bulk revalidation, and batch research. Continue with the existing per-question path. Remember the choice for this pending start/session; do not ask again on every turn or resume.
7. If consented preparation yields some usable material, continue with it and on-demand gaps. If it yields none, explicitly report the result and ask whether to proceed on demand or retry/cancel; never claim successful pool preparation.
8. Only after pre-session choices/preparation resolve, initialize the active session and create the transcript once, then select and present one question.

Completion does not automatically start another session. A later new start evaluates the remaining pool afresh; declining once is not a permanent preference.

### During a session and on resume

Run the existing scheduler after grading. Pool availability must not change weak/medium/strong priorities, diagnostic needs, level adaptation, topic alternation, or format mix.

- If pool use is enabled, try a suitable prepared record for the scheduled need. Validate current compatibility, repetition, retirement, and source triggers.
- If none is eligible, perform the existing targeted on-demand preparation for that need, not a whole-pool refill and not a different level/topic merely because it has ready records.
- Never ask a mid-session "prepare a pool?" question just because it ran out.
- A source-stale candidate may be revalidated as targeted work; record the updated support for every criterion before use. If unusable, follow the current alternative-candidate policy.
- An awaiting question always resumes unchanged and is not appended/presented-as-new or retired twice.
- Legacy active sessions without pool-mode fields keep the old on-demand mode until the user explicitly requests preparation; do not insert a new setup prompt mid-session.
- After successful explicit preparation during an active session, pool use can be enabled for subsequent questions. Do not replace the awaiting question.

## Storage and identity contract

Document these additions in [storage.md](../../../dist/skills/interview-trainer/references/storage.md). All paths below are consumer-workspace state, not files to commit into this repository.

| State | Purpose |
|---|---|
| `.training/pool/index.md` | Pool schema version 1; target/top-up operation status; compact candidate metadata, paths, verification/compatibility context, and partial/ready status |
| `.training/pool/questions/<questionId>.md` | One complete private question, choices, weighted rubric, source identity, criterion-support notes, and verification/version context |
| `.training/presented.md` | Compact exact-question IDs/identity fingerprints, with presentation session/time; no learner answer, score, or rubric; separate from optional pool storage |
| Existing `session.md`, optional pending-start/preparation sections | Persist current operation, session-length/pool choices, target, `--improve` intent, and return action before asking a setup question |
| Existing active-session fields, optional `poolMode` and current `questionId` | Record on-demand versus prefer-pool behavior and retirement linkage without replacing the existing current-question grading snapshot |

Keep configuration schema 3: these are additive optional session sections and an independently versioned optional pool, not a reinterpretation of existing score/config fields. Specify defaults only for absent legacy fields; unsupported pool versions or malformed present sections require explicit recovery. Preserve unknown valid fields.

### Candidate records and eligibility

- Persist stable question identity independently of session ID. Record topic/subtopic, language, applicable level, format, concept/angle, product/version assumptions, text, choices, complete rubric, source ID/title/URL, candidate-specific `verifiedAt`, and bounded original support notes linking each criterion to the verified section.
- Support notes are concise original assessments, not wholesale documentation copies. Source files remain metadata-only; explicitly scope their cache prohibition so the separate question pool is permitted.
- Do not infer candidate freshness solely from another question refreshing the same source URL. Revalidation updates candidate-specific support and timestamps.
- Index metadata allows selecting a small set without loading every body/rubric. Read selected topic history and candidate records only as needed; do not read transcripts/archives or all pool records every turn.
- A candidate is ready only after construction/rubric/source checks succeed. Draft/partial records are never eligible.
- Check taxonomy, language, actual permitted level, format/code allowance, product/version, and source requirements on use. A changed format distribution alters scheduling, not necessarily candidate validity.
- A base-level shift does not invalidate every question: retain candidates that are compatible with the new allowed range. Unchanged/equivalent topic renames preserve identity only when mapping is unambiguous; otherwise ask rather than silently remap progress.

### Preparation and pool sizing

The target counts verified compatible unpresented records, not drafts, presented identities, stale records, or every format/level combination. Aim for diverse candidates across likely scheduling needs and permitted adjacent levels; count alone is not a guarantee of session coverage.

Reuse before generation; stop when the target is met or a bounded attempt budget is exhausted. For implementation, cap candidate construction/repair attempts at twice the requested target per invocation and parallel workers at three independent topic batches. These are conservative work bounds, not measured performance optima; do not expose new flags for them.

Do not prune valid surplus candidates simply because a later invocation asks for fewer. Remove obsolete bodies only during explicit preparation maintenance when clearly invalid or presented; preserve identities needed to prevent exact repetition. A target is a growth stopping condition, not permission to generate an unlimited bank. Existing surplus can exceed 99 if accumulated by later configuration changes; do not destroy compatible user state to enforce an arbitrary cap.

### Exact-question retirement and interruption safety

Retire exact questions when presented, not after grading. Abandoning a session does not make its exposed question new.

- Assign IDs/fingerprints for on-demand questions as well as pool questions, so a later preparation pass cannot re-import an already exposed question as unused.
- The presentation ledger is the only new content-identity bookkeeping on the declined/on-demand path. It does not create pool records, change selection/grading, or trigger research; retaining identities outside the optional pool makes later preparation safe without altering the no-pool UX.
- Preserve identity through revalidation, wording-only edits, formatting changes, and topic renames. Semantic duplicate checks supplement stable concept/angle identity; paraphrasing is not a new question.
- Stage a selected candidate in persisted current-question state and record its ID as presented before sending. Keep the existing pre-presentation history/count/transcript ordering and add a documented pending-presentation marker so interrupted stages can be reconciled without rereading the transcript.
- A fully committed awaiting question resumes unchanged. An incomplete staged presentation is a recovery condition, not a reason to append or count again speculatively. False retirement after an interrupted send is safer than exposing the same question as new.
- Keep retired identities separate from removable bodies. Normal completion/abandonment preserves unused candidates and the presentation ledger; never reset retirement with the recent-five concept window.
- Ledger growth is one compact identity per presented question. Do not silently drop old identities to achieve a fixed bound, which would violate confirmed no-exact-reuse. This deliberate small cumulative index is the trade-off; no perpetual retention of retired question bodies is required.
- Legacy transcripts cannot be reconstructed or searched to backfill exact identities. Before deployment, history-only records continue to enforce current concept rules, but lifetime exact deduplication can only be guaranteed for questions assigned identities after this change. State this limitation.

### Missing, stale, and malformed state

- No pool directory/index: normal absence, no migration work or filesystem creation merely to answer the consent prompt.
- Present malformed/unsupported index, malformed selected record, missing referenced record, or inconsistent retirement linkage: name the exact problem and ask one recovery question. Do not silently treat corruption as empty or overwrite it.
- Stale/incompatible candidates: valid state but not eligible; revalidate/replace only within the chosen preparation/targeted operation.
- Persist accepted batches before marking them ready; index only durable records. Interrupted preparation may leave identifiable unindexed drafts. Resume the recorded operation and validate/reconcile those drafts, never silently assume they are ready.
- Completing/abandoning a session clears session-local preparation choices/links, not the pool or presentation ledger. Keep existing transcript summaries and move/rename archival behavior.

## Parallel preparation

Add a new `preparation.md` file under the existing [references directory](../../../dist/skills/interview-trainer/references/).

Define portable instructions rather than harness-specific APIs:

1. Use direct preparation for small work or unavailable delegation; parallelize only independent topic batches when tools/permissions allow.
2. Give workers self-contained configuration, level/format coverage, bounded count/attempt budgets, excluded identities/concepts, and source requirements.
3. Workers return candidate data, source evidence, and explicit gaps; they do not ask the learner, grade answers, read transcripts/archives, spawn workers, or write shared state.
4. The coordinator validates support, quarter-point rubrics/unique single-choice correctness, privacy, identity, and deduplication before persisting.
5. Share the total invocation budget across workers; do not multiply it per worker. Preserve successful results if a worker fails, report partial readiness, and use direct work for bounded gaps.
6. Do not rely on workers surviving between user turns or perform a duplicate blanket source-research pass solely to recheck worker output.

## Implementation phases and dependencies

### Phase 1 - Preparation/state contract

**Prerequisite:** none.

- Add the preparation reference with workflow, budgets, candidate lifecycle, evidence, and worker contract.
- Extend storage with independently versioned pool schemas, optional pending operations/mode, IDs, retirement ledger, and interrupted-presentation recovery.
- Align source-cache rules and candidate verification/freshness without relaxing mandatory revalidation.
- Add fixtures/contract assertions for complete versus partial records and explicit recovery paths using the existing Node test runner; do not add a runtime parser solely for these tests.

**Exit:** every new state field has absent-legacy semantics and a recovery rule; candidate support cannot be mistaken for URL metadata freshness.

### Phase 2 - Command/start/select integration

**Prerequisite:** phase 1.

- Update frontmatter discovery/argument hint, command table, bare-help example, and natural-language routing for `prepare`.
- Update CLI reference routing and lazy one-load-per-conversation behavior. `stats`, bare help, and topic listing do not load pool bodies.
- Wire standalone preparation and `--improve`; persist prompt/operation state before responses.
- Wire new-start length -> usable-pool check -> optional consent -> optional target -> preparation -> active session initialization.
- Wire latest-progress-first pool selection, current-question promotion/retirement, and targeted on-demand fallback. Preserve decline mode and resume behavior.

**Exit:** prepare alone creates no session; opt-out produces the old on-demand path; existing usable material is consumed without a consent prompt or bulk refill.

### Phase 3 - Lifecycle and documentation alignment

**Prerequisite:** phase 2.

- Align configuration/topic changes with selective compatibility and awaiting-question preservation.
- Ensure grading reads only the existing current snapshot; reconcile source updates without mutating that snapshot.
- Preserve unused pool and retirement identities across completion/abandonment; remove no unrelated learner files.
- Extend acceptance checklist with all new command, recovery, consent, retirement, and performance cases.
- Update the trainer README with `prepare`, default target, automatic use, opt-out, initial-cost expectations, and cross-session retention. Do not expose private record content.

**Exit:** no command or lifecycle surface contradicts the pool/preparation rules.

### Phase 4 - Validation

**Prerequisite:** phases 1-3.

Use the existing test runner for instruction/packaging checks and actual agent traces for behavioral claims.

1. Add `test/interview-trainer.test.js` using `node:test` for bounded static contracts: synchronized usage/hints and `prepare` routing, global flag behavior, new-reference reachability, schema examples/quarter-point rubric shape, no-pool fallback and privacy rules present across affected references. Label these tests as instruction contracts, not execution tests.
2. Run `node --test test\\interview-trainer.test.js test\\catalog.test.js test\\docs.test.js` for the targeted change. Use existing file/Node conventions, no new dependency. Broaden only if packaging/regressions require it.
3. Perform the scripted behavioral checks below in disposable named fixture workspaces. Keep traces and timing results in session artifacts, not learner transcripts or new repository planning files.

| Trace | Required result |
|---|---|
| Bare help / invalid command / invalid pool count | Correct one-line usage/no state reads for bare help; explicit invalid input; no new flags |
| `prepare` only, explicit/default target, repeat prepare | Default 25 confirmed via one prompt; direct value honored; top-up rather than duplicate batch; no active session/transcript/score effects |
| No pool, start, decline | One consent question after length; old source/construction path; no pool/batch creation, repeat offer, or extra session-counter changes |
| No pool, consent, interrupted choice/count/preparation | Separate single-question prompts resume with recorded length, target, and improvement intent; no duplicate session/transcript |
| Usable partial pool and larger session | No preparation offer; compatible records reused; exhausted/missing needs use targeted original path |
| Empty/stale/incompatible-only pool | Not treated as usable; consent offered; decline avoids bulk repair; malformed pool reports recovery instead |
| Adaptive responses | Weak/medium/strong priorities, diagnostics, third question, level changes, formats, and reinforcement follow learner state, not candidate convenience |
| Cross-session reuse / abandonment | Unused records survive; new session can use them without reconstruction; exposed exact questions stay retired |
| Resume / explicit prepare during awaiting answer | Same current question/rubric; no new transcript block, grading, retirement duplication, or score reset |
| Freshness and invalidation | 179/181 and 29/31-day behavior preserved; latest/version/conflict/security/failed-link triggers validated; shared-URL refresh cannot freshen unsupported rubrics |
| Worker disabled / failed / partial | Same verification/privacy contract; bounded direct fallback; successful records survive without competing writes |
| Malformed/index-record mismatch/presentation interruption | Explicit recovery; no silent empty-pool fallback, re-asking, overwrite, transcript reads, or speculative counters |

### Performance acceptance

Run paired scripted multi-topic sessions from equal configuration/progress/source state and equal answers:

- Baseline on-demand, cold-pool preparation plus training, and warm-pool reuse in a later session.
- Record preparation time, time to first question, answer-to-feedback/next-question median and maximum, total waiting, research/construction calls, unused candidates, and worker/token cost when available.
- For a covered turn without a source trigger, require zero new research and zero question/rubric construction. On gaps, verify targeted work only.
- Confirm warm-pool traces reuse persisted candidates after conversation/context loss rather than relying on in-memory research.
- Repeat timing runs because model/network behavior varies. Report measured comparisons and regression cases; do not replace latency evidence with candidate counts or passing static tests.

No defensible wall-clock threshold is available yet. Collect the baseline before claiming performance completion; any numeric acceptance bound should be agreed from that baseline, not invented as a result. If no live trainer execution is available, mark behavioral/performance validation blocked and report static checks separately.

### Phase 5 - Package update, changelog, and publishing

**Prerequisite:** phases 1-4 pass, including pre-release behavioral checks. Post-publication validation in phase 6 is an additional gate, not a substitute for pre-release verification.

Follow the [Publishing instructions](../../../README.md#publishing) and existing [publish workflow](../../../.github/workflows/publish.yml); do not introduce a second publishing mechanism.

1. Recheck the base branch and npm version at release time. Select the next available minor release for this additive command/workflow (currently 0.4.0 would imply 0.5.0 if no intervening release). Use a plain, increasing `x.y.z`; do not hardcode a version already published.
2. Update [package.json](../../../package.json) and prepend matching notes to [changelog.json](../../../changelog.json). Describe `prepare`, default target 25, reusable cross-session pool, automatic use, preparation consent/on-demand opt-out, retirement, and compatibility/migration implications. Distinguish intended latency improvements from measured results.
3. Run `npm run changelog` to regenerate [CHANGELOG.md](../../../CHANGELOG.md). Do not manually diverge generated release notes from the JSON source.
4. Run `npm test` as the release gate, including changelog/release checks. Inspect `npm pack --dry-run --json` for the expected trainer files, including the new preparation reference, and absence of learner state or private test artifacts. Build a local tarball with `npm pack` and smoke-install it in a disposable named consumer workspace to verify that the actual package includes the version and new command; clean up only the known tarball/fixture created for this check.
5. Commit the implementation/release metadata together and open/update the release PR through the normal workflow. Observe the aggregate `ci` check, including the Linux/Windows and Node matrix and version/changelog comparison. Merge only through the authorized repository workflow; if credentials, permissions, or approval are unavailable, record the blocker instead of claiming publication.
6. After merge to `main`, observe the publish workflow through completion. It reruns tests, publishes through trusted publishing with provenance, and creates the version tag and GitHub Release. Do not run a separate local `npm publish` or add registry credentials.
7. Verify npm returns the exact new version, expected distribution metadata, and the intended `latest` tag; verify the matching Git tag and GitHub Release notes identify the merged release. Download/inspect the registry package or install its exact version to confirm that the published artifact, not only the local checkout, contains the trainer changes.
8. Record release version, source commit, PR/workflow links, npm artifact/integrity, tag, and release URL in session evidence. If npm publication succeeds but tag/release creation fails, explicitly repair the missing metadata through the approved workflow: the current workflow skips all publishing/release steps once npm reports the version already present, so a rerun alone does not repair that partial failure.

**Exit:** the intended version is published and discoverable, the registry artifact contains the complete skill, and its tag/release/notes agree. Local tests, a successful merge, or a successful tarball smoke test alone do not satisfy this phase.

### Phase 6 - Published-package validation in another repository with actual training

**Prerequisite:** phase 5 publication and registry-artifact verification pass.

Use an actual separate consumer repository, not this skills repository, its worktree, or only a generated fixture. At execution time, ask the user to select/authorize the repository path, target agent, and a short real training session. The path is not yet specified; this does not block implementation or release preparation. Never select an unrelated repository or modify its learner state without consent.

1. Inspect the consumer working tree, existing installation/manifest, agent instructions, and active-session status. Preserve unrelated edits and user training state. Do not silently abandon a session, overwrite locally modified skills with `--force`, or switch installation targets.
2. Install or update from npm using the **exact phase-5 release version** to avoid stale `npx` caching and moving `latest`. For a new consumer use `npx @pavel-agarkov/skills@<released-version> add --skill interview-trainer` with the authorized agent target; for an existing tracked installation preview with that version's `update --dry-run`, then apply `update` only after review. These placeholders must be replaced with the recorded version before execution.
3. Verify the installed manifest/package version, all selected agent copies, reference files, and discovered command grammar match the registry artifact. Run the exact version's `check`; account explicitly for pre-existing local modifications rather than treating them as successful updates. Reload/restart the consumer agent context as required so it reads the new skill, not instructions cached from the older installation.
4. In the actual agent harness, configure or reuse accepted topics with the user's consent and invoke `/interview-trainer prepare`. Verify the target-count interaction (including default 25), source-backed persisted candidates, and no new active session/transcript or score/history effects from preparation alone.
5. Run a short real training session with the user providing answers. Verify pool reuse without an unnecessary consent prompt, concise grading with sources, private rubrics, exactly one question at a time, persisted retirement, and normal completion. Record real answer-to-next-question waits; do not substitute scripted/generated answers for the claim of actual training.
6. Start a later short session in a fresh conversation/context and confirm unused candidates survive and are reused, while exposed exact questions are not repeated. Observe a genuine level/progress change or a targeted gap if it occurs; otherwise retain phase-4 scripted evidence for that branch and state that it was not exercised in the live session.
7. Also exercise the no-usable-pool offer and decline path in an authorized isolated consumer worktree/state area, without deleting or hiding the user's existing pool. Confirm training remains on demand and preparation is not repeated mid-session. Reuse phase-4 evidence for destructive/corrupt-state cases rather than damaging the live learner state.
8. Keep validation notes/timing/tool evidence in session artifacts. Record repository/agent/version and pass/fail observations, not private answers, rubric contents, or unrelated repository code. Do not publish learner data to issues, release notes, or third-party services. Never read transcripts/archives back for execution or timing analysis.
9. Leave the installed skill and learner state as agreed with the user. Remove only explicitly identified temporary validation files/worktrees with approval; do not revert unrelated consumer changes or automatically commit training state.

**Exit:** the released npm package has been installed in another real repository and used for actual training, with warm cross-session pool reuse and opt-out behavior evidenced separately from static tests. If the repository, user participation, or harness access is unavailable, mark this phase blocked with the exact missing prerequisite; do not claim end-to-end completion.

**Failure handling:** distinguish release artifact/installation failures from trainer UX/behavior failures. Fix confirmed defects surgically, rerun affected pre-release checks, publish a new patch version through phase 5 when the published content changes, and repeat affected consumer/live checks against that exact patch. Never replace an already published version or declare the local fix validated while the consumer still runs the older release.

## Risks and decisions revisited during implementation

- Metadata-only source rules must explicitly permit the separate pool without making every cached claim reusable forever.
- Durable presentation staging improves recovery but is not a transaction engine; interrupted state must be surfaced rather than guessed from forbidden transcript reads.
- The target/attempt/concurrency bounds are work controls, not evidence that every adaptive path is covered.
- Exact duplicate detection includes stable identity and semantic review; a hash of wording alone is insufficient.
- Retirement fingerprints accumulate; dropping them would re-enable exact repetition. If stronger bounded lifetime storage is needed later, it requires a separately approved reuse policy.
- No extra user decisions remain for starting implementation. Storage details above are proposed implementation contracts; significant deviations should be raised rather than silently changing the confirmed UX.

## Definition of done

All command/state/docs surfaces are aligned; targeted and release tests pass; scripted traces show pool reuse, opt-out parity, source correctness, cross-session retirement, and explicit recovery; performance measurements distinguish cold/warm/startup/total waiting and support the claimed benefit. Version/changelog metadata is shipped through the existing publish workflow, npm/tag/GitHub Release agree, and the exact released package has been validated through actual training in a separate authorized repository, including cross-session reuse and the opt-out path. Unverified behavior or blocked release/consumer steps are explicitly reported, not counted as complete.
