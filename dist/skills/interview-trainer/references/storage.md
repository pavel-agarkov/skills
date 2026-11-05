# Storage and schemas

## Files

- `.training/config.md`: schema version, setup, preferences, taxonomy, and taxonomy review only.
- `.training/session.md`: active-session counters, current question, and active-session review links.
- `.training/transcript.md`: append-only transcript for the active session.
- `.training/progress.md`: compact per-subtopic scoring and scheduling index.
- `.training/history/`: addressable topic files containing recent `conceptId/angleId` pairs.
- `.training/archive/`: completed or explicitly abandoned transcripts for user review only.
- `.training/sources/`: lazy topic files containing official source metadata only.
- `.training/pool/index.md`: optional pool index, versioned independently from configuration.
- `.training/pool/questions/<questionId>.md`: optional private candidate records, each independently versioned.
- `.training/presented.md`: optional compact retirement ledger for exact question identities, including on-demand questions.

Do not create history or source files before the taxonomy is accepted.
An absent pool or presentation ledger is normal legacy state; do not create or migrate either merely to read state. Keep configuration schema version 3.

## Selective reads

1. Read `config.md` and `session.md` at the start of a stateful command or normal training turn.
2. When grading, read only the current subtopic record from `progress.md` and the current source metadata.
3. When scheduling, read the compact records in `progress.md`.
4. After selecting a candidate subtopic, read only that subtopic's record in its history file.
5. Read source metadata only while constructing a candidate or preparing feedback.
6. Read all progress only for statistics or session completion. Read the pool index for preparation or pool scheduling, but load only selected candidate bodies. Fully read state only for setup, recovery, reconfiguration, or taxonomy changes.
7. Never read `.training/transcript.md` after creating it.
8. Never scan transcripts or archives to reconstruct candidate identities or recover an interrupted presentation.

## `config.md`

```markdown
# Interview Trainer Configuration

schemaVersion: 3
updatedAt: 2026-01-01T12:00:00Z
status: configuring | ready
setupStep: language | topics | goal | difficulty | style | code | taxonomy-review | complete

## Preferences

language: English
topics: [.NET]
goal: both
baseDifficulty: senior
questionStyle: mixed
allowCodeQuestions: true
mix: openEnded=0.50; singleChoice=0.30; codeWriting=0.20

## Taxonomy

| Topic | Subtopics |
|---|---|
| .NET | Runtime and memory management; Concurrency and asynchronous programming |

## Taxonomy Review

currentTopic: none
acceptedTopics: [.NET]
```

While setup is incomplete, uncollected values may be `pending`.

## `session.md`

```markdown
# Interview Trainer Session

updatedAt: 2026-01-01T12:00:00Z
status: none | active | complete
sessionId: none
startedAt: none
planned: 0
completed: 0
earned: 0
formatCounts: openEnded=0; singleChoice=0; codeWriting=0
improveAfterSession: false
poolMode: on-demand | prefer-pool
currentQuestionId: none

## Pending Operation

operation: none | start | prepare
phase: none | awaiting-session-length | awaiting-pool-consent | awaiting-pool-target | preparing | awaiting-preparation-result | returning
sessionLength: none
poolTarget: none
improveRequested: false
returnAction: none | continue-start | return-to-session | return-to-current-question | return-to-inactive

## Pending Presentation

status: none | staged | committed
questionId: none
sessionId: none
stagedAt: none

## Current Question

status: none

## Review Links

- none
```

An awaiting question uses:

```markdown
## Current Question

status: awaiting-answer
topic: .NET
subtopic: Runtime and memory management
format: open-ended
text: What is ...?
choices: none
conceptId: large-object-heap
angleId: allocation-pressure
rubric: allocation=0.25; collection-impact=0.25; diagnosis=0.25; mitigation=0.25
sourceId: dotnet-loh
sourceTitle: The large object heap on Windows systems
sourceUrl: https://learn.microsoft.com/dotnet/standard/garbage-collection/large-object-heap
askedAt: 2026-01-01T12:00:00Z
```

For single-choice, `choices` contains the labeled choices exactly as shown and `rubric` contains only `correct=B; reason=<compact supported reason>`. Open-ended and code rubrics contain short, independently scorable weighted criteria totaling `1`. Each weight must be a multiple of `0.25`. Clear current-question state immediately after grading.

Review links are unique active-session source links labeled with topic and subtopic. Clear them when starting a session.

All fields above `poolMode`, `currentQuestionId`, `Pending Operation`, and `Pending Presentation` are legacy fields. Their absence means on-demand behavior, no pending operation, and no staged presentation; do not rewrite old session files just to add defaults. A present but malformed pending section or presentation marker requires explicit recovery. Preserve unknown valid fields when updating state.

`poolMode` is optional: absent means `on-demand`, preserving the existing path. `prefer-pool` permits compatible ready records to be selected but does not override scheduling, mandatory source revalidation, or targeted on-demand fallback. `currentQuestionId` links the existing grading snapshot to its stable identity; never replace the snapshot's text, choices, or rubric from a pool record.

Persist pending operation and presentation state before asking a setup, consent, target, or recovery question or sending a selected question. A `start` operation keeps its selected session length, consent/decline, target, improvement intent, and return phase until preparation and pre-session choices resolve. A standalone `prepare` operation keeps its target and return action; it must not alter active counters or current-question state. On a completed operation, clear its pending fields. An interrupted operation resumes from its persisted phase after reconciliation; do not repeat a prompt, create a second session/transcript, or infer completion from an absent optional field.

## `progress.md`

```markdown
# Interview Trainer Progress

| Topic | Subtopic | Asked | Earned | Level | Last asked | Diagnostic |
|---|---|---:|---:|---|---|---|
| .NET | Runtime and memory management | 0 | 0 | senior | never | pending |
```

`Diagnostic` is `pending` until two answers, `needs-third` when two answers average from `0.25` through `0.75`, and `complete` otherwise. After a third answer it is always `complete`.

Values containing `|` must be escaped.

## Pool schemas

These paths are consumer-workspace state, not repository files. The pool is optional and separately versioned; it does not change `config.md` schema version 3. `schemaVersion` in the index and `recordSchemaVersion` in each question body are independent. Accept only supported versions. Preserve unknown valid fields when updating a supported version, but do not guess at or silently upgrade an unsupported version.

### `.training/pool/index.md`

```markdown
# Interview Trainer Question Pool

schemaVersion: 1
updatedAt: 2026-01-01T12:00:00Z
target: 25
operationStatus: ready | partial
operationId: prep-20260101T120000Z
attemptsUsed: 2
attemptLimit: 50

## Candidates

| questionId | path | status | topic | subtopic | language | level | format | conceptId | angleId | sourceId | verifiedAt | sourceVersion | compatibility |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| q-dotnet-loh-allocation | questions/q-dotnet-loh-allocation.md | ready | .NET | Runtime and memory management | English | senior | open-ended | large-object-heap | allocation-pressure | dotnet-loh | 2026-01-01T12:00:00Z | .NET 10 | ready |
```

`target` is the requested total of compatible, unused, ready records, not a session length or a maximum retained pool size. `attemptLimit` is at most twice the requested target for the invocation. Index only durable records. `ready` means the record is complete and verified; `draft`/`partial` records may be listed for recovery but never count toward the target or eligibility. `operationStatus: partial` means bounded preparation ended without reaching its target; it does not make the accepted ready entries unusable.

### `.training/pool/questions/<questionId>.md`

```markdown
# Prepared Interview Question

recordSchemaVersion: 1
questionId: q-dotnet-loh-allocation
status: ready
topic: .NET
subtopic: Runtime and memory management
language: English
level: senior
format: open-ended
conceptId: large-object-heap
angleId: allocation-pressure
productVersion: .NET 10
text: What factors determine whether an allocation is placed on the large object heap?
choices: none
rubric: threshold=0.25; allocation-kind=0.25; collection-impact=0.25; implication=0.25
sourceId: dotnet-loh
sourceTitle: The large object heap on Windows systems
sourceUrl: https://learn.microsoft.com/dotnet/standard/garbage-collection/large-object-heap
verifiedAt: 2026-01-01T12:00:00Z
sourceVersion: .NET 10

## Criterion Support

- threshold: official section “When an object is allocated on the LOH”; supports the applicable threshold.
- allocation-kind: official section “When an object is allocated on the LOH”; distinguishes allocation cases.
- collection-impact: official section “Large object heap size thresholds”; supports collection behavior.
- implication: official section “Large object heap size thresholds”; supports the stated consequence.
```

Each record has a stable `questionId` independent of session identity, plus stable concept/angle IDs. IDs and identity fingerprints survive revalidation, formatting or wording-only edits, and unambiguous topic renames; semantic review supplements IDs to detect paraphrased duplicates. Keep evidence as concise original support assessments linked to the exact official section, not copied documentation. Do not put source claims, answers, rubrics, or candidate text in source metadata files.

The complete example is eligible only while its status is `ready`, all required fields and criterion support are present, checks pass, and it is currently compatible and source-fresh. An incomplete record is explicitly non-eligible:

```markdown
# Prepared Interview Question

recordSchemaVersion: 1
questionId: q-dotnet-loh-allocation-draft
status: partial
topic: .NET
subtopic: Runtime and memory management
format: open-ended
conceptId: large-object-heap
angleId: allocation-pressure
text: What factors determine whether an allocation is placed on the large object heap?
sourceId: dotnet-loh
verifiedAt: 2026-01-01T12:00:00Z
missing: [language, level, rubric, sourceUrl, criterionSupport]
```

Missing fields are not defaulted on a present record. A missing referenced record, a `ready` index row pointing to a partial body, duplicate or mismatched IDs, invalid rubric, absent support for a criterion, or inconsistent retirement linkage is corruption: stop using the affected state, describe the specific mismatch without exposing private candidate content, and ask one explicit recovery question. Do not silently drop it, overwrite it, or treat it as an empty pool. A valid stale or incompatible record is not corrupt; leave it in place and revalidate/replace only within the chosen preparation or targeted operation.

## Pending operations and presentation recovery

The optional `Pending Operation` fields in `session.md` record the operation and phase before asking for session length or pool target. Absent fields on legacy state mean no pending operation. A present incomplete/malformed operation is not treated as absent: ask for explicit recovery and do not start a second operation. After a response, persist the next phase before continuing. On restart, resume the recorded phase and its original values; do not ask for a new target or lose the return action.

The optional `Pending Presentation` marker protects the existing current-question snapshot during send interruption. Stage the complete current question and its `questionId`, then record that identity in `.training/presented.md` before sending it. Keep the existing question-presentation ordering for history, counts, and transcript. Set the marker to `committed` only after those existing pre-send writes are complete; the marker enables reconciliation without reading the transcript:

```markdown
# Presented Question Identities

schemaVersion: 1

| questionId | identityFingerprint | sessionId | presentedAt |
|---|---|---|---|
| q-dotnet-loh-allocation | sha256:example-fingerprint | session-20260101T120000Z | 2026-01-01T12:00:00Z |
```

The ledger contains identity and presentation metadata only—no question text, answers, scores, or rubric. Record every presented pool or on-demand question; this is the only new identity bookkeeping required on the no-pool path. Never remove old identities to bound ledger growth. On recovery:

- If the marker is `committed`, the current question is `awaiting-answer`, the question IDs match, and the ledger contains the identity, clear only the pending marker and resume that exact snapshot; do not append, present, count, or retire it again.
- If staged state or ledger linkage is incomplete or inconsistent, stop and ask one recovery question. Do not resend or select a replacement speculatively; conservatively retain any already recorded retirement.
- If sending may have been interrupted after identity retirement, do not assume it was unseen. Keep the identity retired and let the user explicitly resume the persisted snapshot or discard the interrupted presentation; do not reread transcript/archive content.
- A `staged` marker is not a committed question, even if the snapshot or ledger already exists. Never repeat uncertain history, count, or transcript writes; ask for explicit recovery and reconcile only from persisted state.
- If no staged marker exists, follow ordinary legacy resume behavior. Do not infer missing markers from transcript contents.

Legacy questions have no recoverable identity: do not read transcripts/archives to backfill them. Recent concept history continues to apply, but lifetime exact-identity retirement is guaranteed only for questions assigned IDs after this contract is introduced.

Session completion and abandonment do not prune the optional pool or presentation ledger. Keep unused candidate records and all retired identities across sessions; retire an exposed question even if its session is abandoned. Archive only the active transcript and update the intended session/progress state. Do not delete unrelated learner files as cleanup.
