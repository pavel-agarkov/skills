# Configuration

Configuration follows the one-question-per-message rule. Persist each answer with `status: configuring` and advance `setupStep`.

Ask in order: conversation language; technical topics; goal (`learn`, `revise`, or `both`); base difficulty (`junior`, `middle`, `senior`, or `architect`); style (`open-ended`, `single-choice`, or `mixed`); and code allowance when relevant.

For mixed style with code, default to 50% open-ended, 30% single-choice, and 20% code. Without code, redistribute proportionally. Allow a requested distribution.

After preferences:

1. Build 5-8 practical subtopics per topic using current official documentation.
2. Persist the proposed taxonomy and zeroed progress.
3. Review one topic per message in configured order and persist each acceptance.
4. Apply corrections only to the current topic and request acceptance again.
5. After all topics are accepted, set `status: ready`, `setupStep: complete`, and initialize addressable history files.

Do not ask a quiz question in a taxonomy-approval message.

`configure` with no additional natural-language request starts or resumes this complete interactive workflow. It accepts no configuration flags. A focused natural-language request changes only the named preference and asks a clarification only if required. Preserve compatible progress and the active session.

Preference and base-difficulty changes preserve scores. Clamp levels only when outside a new allowed range. Never silently reset scores, history, or an active session.
