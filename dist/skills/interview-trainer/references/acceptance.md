# Acceptance checklist

## State and lifecycle

- Grading reads only current state, one progress record, and its source metadata.
- Scheduling reads the progress index and only selected history.
- Active transcripts are created once, then only appended to.
- Every question is appended before presentation; every graded answer is appended verbatim with summary, score, and source before feedback.
- Completed and abandoned transcripts are archived by move or rename without reading or reconstruction.
- Archives are never read during execution.
- Transcripts contain no private rubric, expected answer, concept ID, angle ID, or scheduling rationale.

## Questions and grading

- Architect diagnostics stay narrow and multi-concern prompts are split.
- Choices have one supported answer and weighted rubrics yield only quarter points.
- Feedback follows the brevity rules.
- Exact history pairs and equivalent repeated reasoning are rejected; allowed exceptions are bounded; rotation retains five.
- Pre-question text reveals no selection, concept, source, rubric, expected answer, or answer-narrowing detail.
- Combined feedback/question responses separate complete feedback from the labeled next question.

## Sources

- Source ages at 179/181 and 29/31 days behave as specified.
- "Latest" forces validation.
- Stale known URLs are fetched before search.

## CLI

- Bare invocation displays only one-line usage and reads no training state.
- Commands precede arguments and `--improve`; unknown input is rejected explicitly.
- Natural-language operations use the same workflows.
- `start` never silently replaces an incomplete session.
- `stats` reads only compact state and handles zero denominators.
- `--improve` works for every command, persists only for the applicable session when required, and never edits the skill automatically.
- Each active-session reference is loaded at most once per conversation, on first use, and is not reread for each question.
