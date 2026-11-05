# Session lifecycle

## Starting

Before a new start, resolve an existing incomplete session using these choices:

- `Resume`: continue the existing session without starting a new one or repeating pre-session pool choices.
- `Abandon and start new`: archive the old session as abandoned, then continue this new-start workflow.

If no session is active but `.training/transcript.md` already exists, stop before asking for a length or inspecting/preparing the pool; report the recovery conflict and ask one recovery question without reading the transcript. When ready and inactive, ask the user to select exactly **5, 10, 25, or 50** or a custom value from 1 to 99 questions. A clear natural-language request may supply one of these values directly. Persist the pending start and selected length before asking or continuing. Do not initialize the active session or create its transcript until the pre-session pool decision and any preparation have resolved.

After resolving any incomplete-session or transcript-recovery conflict, check the pool only after the length is known. Use the existing scheduler state to identify a presently schedulable need. A usable pool has at least one ready, unpresented, compatible, source-fresh candidate for that need; a pool file, unrelated candidates, and stale-but-repairable candidates do not qualify. Inspect index metadata first and only the specific candidate records needed to establish eligibility. If a usable candidate exists, select from the pool without a consent prompt or whole-pool top-up; a pool smaller than the planned session is valid partial coverage.

If no usable candidate exists, persist the pending start and ask one generic choice: prepare a reusable pool first, or start now with the existing on-demand path. A clear request to start without preparation is the decline. On consent, ask separately for the pool target (default 25, range 1–99); accept a clear requested count directly. The pool target is not the session length. Follow [preparation.md](preparation.md) for bounded preparation. Do not create the session or transcript before these choices and work finish.

Remember a decline for this pending start/session by setting `poolMode: on-demand`; do not ask again on subsequent turns or resume. Decline skips pool creation, stale-pool bulk revalidation, and batch research, and follows the original per-question path. Consent or an already usable pool sets `poolMode: prefer-pool`. If consented preparation yields some usable candidates, start with them and use targeted on-demand questions for gaps. If it yields none, report that no usable material was prepared and ask whether to proceed on demand, retry preparation, or cancel; do not claim success or initialize the session until the user chooses. Proceed sets `poolMode: on-demand`; retry retains the session length and repeats only the target/preparation steps; cancel clears the pending start without creating a session or transcript.

For `start --improve`, retain the existing after-session proposal behavior; preparation performed as part of this start does not make an immediate proposal.

After all choices resolve, initialize the active session exactly once: generate a filesystem-safe UTC `sessionId`, set `startedAt`, set the session active, set `planned`, zero `completed`, `earned`, and format counts, preserve `improveAfterSession`, set the resolved `poolMode`, clear review links and pending-operation fields. Create `.training/transcript.md` once:

```markdown
# Interview Trainer Transcript

sessionId: 2026-01-01T120000Z
startedAt: 2026-01-01T12:00:00Z
planned: 10
```

If the transcript already exists while state says no session is active, do not overwrite it; report the recovery conflict and ask one recovery question. Then select, verify, persist, and ask the first question.

Never silently replace an active session.

On `resume`, honor any persisted pending operation before ordinary scheduling. Continue from its recorded phase and values without repeating an answered prompt, changing the session length or pool target, creating another transcript, or offering consent again. A decline stays in on-demand mode. For an active legacy session with no `poolMode`, preserve on-demand behavior until the user explicitly invokes `prepare`; do not insert a setup/consent prompt mid-session.

## Resuming

If a current question awaits an answer, present the persisted question without selecting or persisting it again. If active without a current question, ask the next question unless `completed == planned`. If no incomplete session exists, say so and suggest `start`. Treat a complete session as inactive on the next `start`.

An explicit `prepare` during an active session takes precedence over interpreting the message as an answer. Persist its pending operation and return action, but do not modify the active counters, awaiting-question snapshot, current question identity, transcript, progress, history, scores, or retirement ledger. After preparation, clear the pending operation and return to the exact unanswered question. Only a successful explicit preparation enables `poolMode: prefer-pool` for subsequent questions; it never replaces the current question.

## Transcript appends

Before presenting each question, append:

```markdown
## Question 1 of 10 — .NET

topic: .NET
subtopic: Runtime and memory management
format: open-ended
askedAt: 2026-01-01T12:01:00Z

### Question

What is ...?
```

For single-choice, append a `### Choices` section containing the choices exactly as presented. Do not append `conceptId`, `angleId`, source metadata, the expected answer, or the private rubric at question time.

After grading and before feedback, append:

```markdown
### Your answer

<verbatim user answer>

### Answer summary

<concise assessment that states what was correct and what should be revised>

score: 0.75

### Recommended source

- [The large object heap on Windows systems](https://learn.microsoft.com/dotnet/standard/garbage-collection/large-object-heap)
```

Preserve the answer verbatim, including code. Append exactly one recommended source. Never read, parse, search, or rewrite the transcript.

## Abandoning and completing

Use `.training/archive/<sessionId>.md`. If explicitly abandoning, ask for confirmation, append a summary with `status: abandoned`, completed and planned counts, and active review links, then move or rename the transcript. Preserve accumulated progress. Do not create an archive for setup interactions or a session that never started.

At normal completion, calculate the final summary from active state and progress. Append the final score, strongest concepts, revision priorities, and deduplicated active review links. Move or rename the transcript without reading or reconstructing it. Set status to `complete` and show earned score, weakest and strongest concepts, a next-revision recommendation, and concise review links. Summarize concepts, never question text. Ask no quiz question.

When `improveAfterSession` is true, append a concise **Skill improvement proposal** after the normal summary. Base it only on observed trainer behavior and persisted outcomes. State the observed problem, exact proposed skill change, and expected benefit. Keep private rubrics, answers, and scheduling details out. Propose only; never edit automatically.

Completion and abandonment archive only the active transcript by the move/rename described above. Clear session-local operation fields and current-question state as appropriate, but preserve progress, history, source metadata, unused pool records and index, and the complete presentation-identity ledger. An exposed question remains retired even when its session is abandoned; unused candidates remain available to later sessions. Do not sweep, delete, or rewrite unrelated learner files.
