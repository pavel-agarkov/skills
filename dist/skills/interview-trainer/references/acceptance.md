# Acceptance checklist

## State and lifecycle

- Grading reads the existing current-question snapshot, one progress record, and only the needed source metadata; it never grades from a pool body.
- Grading uses the existing current-question snapshot as the sole authority for the awaiting question; pool or source refreshes do not mutate it.
- Scheduling reads the progress index and only selected history.
- Active transcripts are created once, then only appended to.
- Every question is appended before presentation; every graded answer is appended verbatim with summary, score, and source before feedback.
- Completed and abandoned transcripts are archived by move or rename without reading or reconstruction.
- Archives are never read during execution.
- Transcripts contain no private rubric, expected answer, concept ID, angle ID, or scheduling rationale.
- Completion and abandonment retain unused pool records and every retired identity, including identities for questions exposed in abandoned sessions; cleanup touches no unrelated learner files.
- Configuration and topic edits preserve compatible progress/pool records and the exact awaiting-question snapshot; only affected future candidates are reevaluated.

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
- `prepare` defaults to 25, honors a supplied target, tops up rather than duplicates, and never starts a session or changes an awaiting question.
- Start asks for pool consent only after session length and only when no usable compatible candidate exists; a decline remains on-demand for that start, while consent asks separately for the pool target.
- Interrupted consent, target, or preparation resumes the persisted phase and values without duplicate prompts, sessions, or transcripts.
- A partial usable pool is used without a preparation prompt; uncovered needs use targeted fallback. Malformed pool or presentation state raises explicit recovery rather than being treated as empty.
- Every presented question is retired once before sending; resume does not retire it again, and future preparation cannot import it as unused.
- `stats` reads only compact state and handles zero denominators.
- `--improve` works for every command, persists only for the applicable session when required, and never edits the skill automatically.
- Each active-session reference is loaded at most once per conversation, on first use, and is not reread for each question.

## Preparation performance evidence

- Evaluate paired on-demand/cold-preparation/warm-reuse sessions from equal learner state and answers; report preparation time, time to first question, between-question and total waiting, research/construction calls, unused candidates, and worker/token cost when available.
- A covered warm-pool turn without a source trigger performs no new research or question/rubric construction; a coverage gap uses targeted work only.
- Confirm reuse after conversation/context loss from persisted records, not in-memory work.
- Repeat timing runs and report measured results and regressions. Do not claim a speedup or invent a numeric latency threshold without baseline evidence; if live traces are unavailable, mark behavioral/performance evidence blocked.
