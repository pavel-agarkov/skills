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

## Prepared-pool selection and fallback

Run the existing scheduler first on the latest persisted progress and session state. Preserve its diagnostic needs, weak/medium/strong priorities, level adaptation, topic alternation, format mix, and repetition rules; candidates never decide what the learner should practice. In `prefer-pool` mode, inspect pool index metadata and choose only a ready, unpresented candidate compatible with that scheduled need and current configuration. Check the selected candidate body, its own evidence freshness, and the selected subtopic history before use. Do not select a convenient candidate for a different level, topic, format, or need.

If the scheduled need has no eligible candidate, use the existing targeted construction and source-verification path for that exact need. Revalidate a stale candidate only as targeted work for that need; if it fails, reject it and follow the existing alternative-candidate policy. Never perform a whole-pool refill during a session or prompt to prepare a pool mid-session. In `on-demand` mode, including a declined start and a legacy active session, use only the established on-demand path and do not read candidate bodies, bulk-revalidate stale pool entries, or create pool records. After a successful explicit `prepare` during an active session, use `prefer-pool` on subsequent selections; leave an awaiting current question untouched.

When a ready pool record is selected, promote its complete question into the existing current-question snapshot, preserving the exact text, choices, rubric, source, and stable `questionId`. Use that snapshot for grading; never later replace it from the candidate body. Assign an identity and fingerprint to every newly constructed on-demand question too, so both paths share exact-question retirement and future preparation cannot import something already exposed.

Before asking:

1. Append the pair and retain the newest five.
2. Persist complete current-question state.
3. Update `lastAsked`.
4. Increment the selected format count.
5. Append the numbered question block to the transcript.
6. Record the question identity and fingerprint in `.training/presented.md` before sending, whether it came from the pool or on-demand construction. Keep the existing history/count/transcript ordering; set the pending-presentation marker to `committed` only when these pre-send writes are complete.
7. Send the question.

Do not increment `asked` until grading.
Retirement occurs on presentation, not grading. On resume, a committed awaiting question is shown from the current snapshot without selecting, appending, counting, or retiring it again. A staged/inconsistent presentation follows the explicit recovery rules in [storage.md](storage.md); never resend or choose a replacement speculatively.

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
