# Storage and schemas

## Files

- `.training/config.md`: schema version, setup, preferences, taxonomy, and taxonomy review only.
- `.training/session.md`: active-session counters, current question, and active-session review links.
- `.training/transcript.md`: append-only transcript for the active session.
- `.training/progress.md`: compact per-subtopic scoring and scheduling index.
- `.training/history/`: addressable topic files containing recent `conceptId/angleId` pairs.
- `.training/archive/`: completed or explicitly abandoned transcripts for user review only.
- `.training/sources/`: lazy topic files containing official source metadata only.

Do not create history or source files before the taxonomy is accepted.

## Selective reads

1. Read `config.md` and `session.md` at the start of a stateful command or normal training turn.
2. When grading, read only the current subtopic record from `progress.md` and the current source metadata.
3. When scheduling, read the compact records in `progress.md`.
4. After selecting a candidate subtopic, read only that subtopic's record in its history file.
5. Read source metadata only while constructing a candidate or preparing feedback.
6. Read all progress only for statistics or session completion. Fully read state only for setup, recovery, reconfiguration, or taxonomy changes.
7. Never read `.training/transcript.md` after creating it.

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

## `progress.md`

```markdown
# Interview Trainer Progress

| Topic | Subtopic | Asked | Earned | Level | Last asked | Diagnostic |
|---|---|---:|---:|---|---|---|
| .NET | Runtime and memory management | 0 | 0 | senior | never | pending |
```

`Diagnostic` is `pending` until two answers, `needs-third` when two answers average from `0.25` through `0.75`, and `complete` otherwise. After a third answer it is always `complete`.

Values containing `|` must be escaped.
