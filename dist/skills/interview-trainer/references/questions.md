# Question selection and construction

## Diagnostic phase

Ask two narrow questions in every subtopic. After two answers, mark diagnosis complete when the average is below `0.25` or above `0.75`; otherwise ask a third question. After the third, mark complete. Resume across sessions and alternate broad topics when possible.

Diagnostic questions remain narrow at every difficulty. Architect-level difficulty comes from judgment, subtle trade-offs, failure modes, and decision criteria, not combining many concerns.

## Adaptive phase

Classify lifetime scores as weak (`<= 0.50`), medium (`> 0.50` and `< 0.80`), or strong (`>= 0.80`). Target approximately 70%, 20%, and 10%, redistributing empty buckets proportionally. Within a bucket, prioritize oldest `lastAsked`.

Prefer stable-foundational material when candidates have equal diagnostic value. Keep version-sensitive material when current product competence requires it. After mastery, limited integration of closely related concepts is allowed if the question still has one primary concept.

Store a level per subtopic. Adapt at most one adjacent level from the configured base on `junior < middle < senior < architect`. After at least three scored answers, move one allowed level up at score `>= 0.80`, down at `<= 0.40`, otherwise retain it. Never move more than one level after one answer.

## Repetition

History files use one compact record per subtopic:

```markdown
# Recent Concepts: .NET

Runtime and memory management: large-object-heap/allocation-pressure, gc-modes/latency-tradeoff
Concurrency and asynchronous programming: none
```

Entries are oldest to newest; retain at most five. Reject an exact recent `conceptId/angleId` pair. Reject the same concept by default even when the scenario or angle differs. Allow it only when key reasoning is materially different. One exception permits immediate reinforcement after a score `<= 0.50` using a materially different angle. IDs are stable readable kebab-case descriptions, not transient wording.

Before asking:

1. Append the pair and retain the newest five.
2. Persist complete current-question state.
3. Update `lastAsked`.
4. Increment the selected format count.
5. Append the numbered question block to the transcript.
6. Send the question.

Do not increment `asked` until grading.

## Construction

- Use one concise scenario, one explicit ask, and only facts needed to answer.
- Test one primary concept plus only tightly connected supporting elements.
- State assumptions when missing details allow multiple reasonable answers.
- Split independent diagnosis, mitigation, implementation, and trade-off asks unless inseparable.
- Keep single-choice options concise, parallel, plausible, and supported with exactly one correct label.
- Keep code requests focused; never require an entire application.
- Express advanced difficulty through decision quality and subtlety, not prompt breadth.
- Do not reveal answers through wording, titles, links, or hints.
- Do not provide source links, source titles, or concept labels before the answer.
- Present each question under `## Question N of M — <root topic>`.
- Assign stable `conceptId` and `angleId` before persistence.
- Reject and reconstruct a candidate that violates these rules.
