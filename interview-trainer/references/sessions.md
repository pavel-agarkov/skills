# Session lifecycle

## Starting

When ready and inactive, initialize `improveAfterSession` from the invocation and ask the user to select exactly **5, 10, 25, or 50** or a custom value from 1 to 99 questions. A clear natural-language request may supply one of these values directly.

After selection, generate a filesystem-safe UTC `sessionId`, set `startedAt`, set the session active, set `planned`, zero `completed`, `earned`, and format counts, preserve `improveAfterSession`, and clear review links. Create `.training/transcript.md` once:

```markdown
# Interview Trainer Transcript

sessionId: 2026-01-01T120000Z
startedAt: 2026-01-01T12:00:00Z
planned: 10
```

If the transcript already exists while state says no session is active, do not overwrite it; report the recovery conflict and ask one recovery question. Then select, verify, persist, and ask the first question.

If `start` finds an incomplete session, ask one question with these choices:

- `Resume`
- `Abandon and start new`

The second choice archives the old session as abandoned and continues the start workflow. Never silently replace an active session.

## Resuming

If a current question awaits an answer, present the persisted question without selecting or persisting it again. If active without a current question, ask the next question unless `completed == planned`. If no incomplete session exists, say so and suggest `start`. Treat a complete session as inactive on the next `start`.

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
