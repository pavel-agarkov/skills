# Frame Brief: Reusable question pool for low-wait adaptive training

**Planning update (2026-11-05):** The user subsequently requested a standalone preparation command and a pre-session offer when no usable pool exists, with the old on-demand path when declined. [plan.md](plan.md) supersedes this frame's exclusion of new commands and defines the confirmed sizing and retirement choices.

## Reported observation

The user spends too much time waiting for the next training question. Research and question construction currently happen as questions are needed, rather than producing a reusable supply of verified material.

The waiting-time report is user-provided. No live-session timing baseline has been collected; the relative cost of retrieval, construction, grading, and persistence remains unmeasured.

## Initial framing and clarification

- **Original direction:** prepare a full training session upfront where feasible, optionally researching different topics with parallel subagents.
- **Research recommendation:** a session-local candidate pool rather than a fixed question sequence.
- **User clarification:** "we don't have to prepare exact session - it can be a longer set of questions to chose from depending on user progress and level changes - probably we can even persist that pool of questions between sessions".

The clarified direction supersedes the research's session-local lifetime recommendation. The pool may exceed the current session length and persist between sessions. Session length informs coverage needs; it does not define the pool's lifetime or impose an exact candidate count.

Cross-session persistence is included as the proposed scope, consistent with the user's suggestion, not as a requirement to keep every question forever.

## Dimension map

| Dimension | Evidence / constraint | Framing consequence |
|---|---|---|
| Preparation versus scheduling | Diagnosis, score buckets, level changes, and repetition depend on answers. [questions.md](../../../dist/skills/interview-trainer/references/questions.md) | Prepare alternatives early; decide what to ask using current learner state. Do not prepare a fixed session script. |
| Pool lifetime versus session lifetime | Current storage has no prepared-question pool; session counters and transcript have separate lifecycles. [storage.md](../../../dist/skills/interview-trainer/references/storage.md) | Reusable content should survive session completion/abandonment without carrying session counters, answers, or transcripts into the pool. |
| Pool versus source cache | Source records explicitly exclude answers, rubrics, and templates. [sources.md](../../../dist/skills/interview-trainer/references/sources.md) | Define a separate pool contract and explicitly reconcile the cache prohibition. Do not silently put questions into source files. |
| Stored versus eligible | Source freshness expires and mandatory revalidation triggers apply regardless of age. [sources.md](../../../dist/skills/interview-trainer/references/sources.md) | Persistence does not make a question permanently verified or suitable. Recheck source validity and configuration compatibility before use. |
| Content availability versus learner eligibility | Recent concept/angle history restricts repetition across sessions. [questions.md](../../../dist/skills/interview-trainer/references/questions.md) | A new session must not reset repetition eligibility. Distinguish an unused candidate from an already presented question. |
| Preparation versus asking | History, last-asked, format counts, and transcript change only when presenting; scores change only on grading. [questions.md](../../../dist/skills/interview-trainer/references/questions.md) | Pool creation/revalidation must have no asking/scoring side effects. |
| Throughput versus startup delay | Parallel delegation has overhead; supported session lengths extend to 99. [research.md](research.md) | Bound initial work, reserves, and concurrency. Reuse an existing compatible pool before generating more. |

## Hypothesis investigation

| Hypothesis | Evidence | Verdict |
|---|---|---|
| A fixed sequence is needed to eliminate repeated preparation | No fixed sequence is required by the current rules; adaptive selection explicitly uses updated progress. | Rejected as the target model. |
| A larger verified pool can supply different questions as level/progress changes | Current question records already persist text, choices, rubric, concept/angle IDs, and source identity. Extending this to addressable candidates is compatible in principle, provided selection remains adaptive. [storage.md](../../../dist/skills/interview-trainer/references/storage.md) | Supported as a design direction; behavioral validation still required. |
| Pool persistence can avoid repeating preparation in later sessions | The user explicitly permits it; current state already preserves progress/history/source metadata across sessions. There is no existing pool contract. | Plausible and in scope; benefit depends on eligible coverage and source freshness. |
| More stored questions alone guarantee faster training | Stale, repeated, wrong-level, or incompatible candidates cannot satisfy a selected need. No timing baseline exists. | Not established; measure eligible coverage and waiting time, not raw pool size. |
| Parallel research is required | The current skill is portable Markdown; delegation availability differs by harness. [research.md](research.md) | Rejected as a dependency; retain as an optional optimization. |

## Reframed problem statement

> The trainer lacks a durable, reusable supply of verified questions independent of the current session. Separate preparation from asking: build and retain a bounded pool with enough diversity for likely progress and level changes, then select eligible material using current learner state. Reuse compatible material across sessions and replenish demonstrated coverage gaps instead of routinely researching and constructing each next question.

The objective is reduced user-visible waiting, not an exact precomputed session or an exhaustive bank of every possible adaptive path.

## Scope and guardrails

### In scope

- A workspace-local persistent pool of complete, verified question candidates, including private grading criteria and source/version context, separate from source metadata and learner progress.
- A compact index and selective candidate reads so a larger pool does not force all question bodies/rubrics into every turn.
- Upfront preparation with alternatives across relevant subtopics, permitted levels, formats, and distinct reasoning; pool size may exceed session length.
- Reuse before generation at session start, with targeted replenishment when the adaptive scheduler encounters a real gap.
- Bounded parallel topic research when available and worthwhile, with coordinator-only shared-state writes and direct preparation otherwise.
- Cross-session lifecycle: retain compatible candidates on completion/abandonment, revalidate stale material, and invalidate or retire incompatible content selectively.
- Legacy-session compatibility and explicit recovery for malformed pool state without silently overwriting current questions, progress, history, or transcripts.

### Preserved behavior

- Diagnosis, adaptive priorities and levels, topic rotation, configured format mix, and anti-repetition remain authoritative over pool convenience.
- A persisted awaiting question remains the grading authority; subsequent pool updates cannot silently change its text or rubric.
- One question at a time; no future-question, rubric, source, or concept disclosure during preparation. Workspace files are not a secrecy boundary.
- Only presented questions affect asking history/counters; only graded answers affect scores.
- Transcripts remain append-only, contain no private pool data, and are never read back during execution. Archives remain user-facing only.
- Source freshness and mandatory revalidation rules remain in force across session boundaries.

### Out of scope

- Fixed question order, exhaustive adaptive decision trees, or guaranteed zero preparation for every possible answer path.
- An unbounded or globally shared question bank, cross-workspace synchronization, or a new training service/runtime.
- A requirement for subagents, background workers between user turns, or new public commands/flags.
- Changing the scoring model, loosening source verification, or resetting history to make old questions eligible.
- Pre-generating every combination of topic, format, language, and level.

## Pool reuse is not automatic question repetition

Persist unused candidates so later sessions can consume them without reconstruction. Preserve stable question and concept/angle identity when material is revised or revalidated; do not make an old question appear new by changing its identifier.

Already presented questions must not be reintroduced merely because a session ended or a recent-history window rotated. Planning must define a bounded presented/retired policy separately from current concept-history rules, and state whether deliberate later reuse is permitted. Until that is defined, retaining content is not authorization to present the exact question again. New distinct-reasoning questions remain subject to the existing repetition rules.

Keep answers and learner scores in their existing state, not inside reusable content records. A small presentation/retirement index may reference candidate IDs if needed for deduplication; its schema and retention belong to planning.

## Success criteria

1. A representative session uses a pool larger than the requested session where useful, and score-driven level changes select eligible alternatives rather than following a frozen sequence.
2. A later session reuses compatible, unasked candidates from the same pool without reconstructing or researching them when no revalidation trigger applies.
3. Session completion/abandonment does not erase reusable material or reset progress/history; an awaiting question survives resume unchanged.
4. Stale, incompatible, repeated, or unsupported material is excluded or revalidated before presentation. Only real coverage gaps trigger new preparation.
5. Covered turns require no new research or question/rubric construction absent a revalidation trigger. Behavior is correct without subagents and with partial preparation failures.
6. Measure startup, between-question, and total waiting in cold-pool and warm-pool runs, alongside preparation/tool cost and unused/retired material. Show reduced between-question waits without hiding excessive upfront work or unbounded pool growth.

No wall-clock improvement is claimed yet. Numeric latency and pool-size thresholds need a baseline and an explicit planning decision.

## Confidence and remaining decisions

**High confidence** in the problem boundary: the current instructions store only one question and lack a reusable-pool lifecycle; fixed ordering would conflict with adaptation. **Unverified**: actual speedup, sufficient reserve size, and long-term reuse efficiency.

Decisions for `/10x-plan`:

1. Exact pool/index schema, stable identity, versioning, migration, and selective-read paths.
2. Initial coverage/reserve budget, growth cap, replenishment trigger, and stale/retired pruning policy.
3. Source-verification evidence sufficient to reuse persisted rubrics after context loss; a fresh URL alone is not proof of every criterion.
4. Presented-question retention/reuse policy and its relationship to bounded recent-concept history.
5. Selective compatibility rules for taxonomy, language, format/code preferences, level range, and named product versions.
6. Baseline scenarios and quantitative acceptance targets for cold and warm pool performance.

Suggested next step: `/10x-plan prepare-full-training-session-upfront`.
