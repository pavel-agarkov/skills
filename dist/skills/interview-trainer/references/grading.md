# Grading and feedback

Grade only against the persisted rubric and source.

- Single-choice: `1` for the correct label, otherwise `0`.
- Open-ended/code: sum satisfied independent rubric weights. Results are `0`, `0.25`, `0.5`, `0.75`, or `1`.
- "I don't know," refusal, or skip: `0`.

Every criterion and correction must be source-supported. Before responding:

1. Increment the subtopic `asked` and `earned`.
2. Update diagnostic status and adaptive level.
3. Increment session `completed` and `earned`.
4. Add the unique source to review links.
5. Prepare a concise answer summary from persisted state and the answer.
6. Append the verbatim answer, summary, score, and source to the transcript.
7. Clear the current question.
8. Persist all changes.

Always include a direct source link. Do not repeat the scenario, question, or choices unless minimal context is required or requested.

- Fully correct single-choice: verdict and source link only. Add at most one explanatory sentence when requested, the subtopic is weak, the answer appears uncertain, or a subtle distinction matters.
- Fully correct open-ended/code: concise confirmation of the key reason and source.
- Partial/incorrect: say what was correct, then give only the missing correction and source.
- "I don't know" or an explicit detail request: give a fuller but focused explanation and source.

Do not offer another attempt. If guidance changed, explain current practice neutrally. If questions remain, feedback may be followed by one persisted next question.

When feedback and the next question share a response:

1. Put all feedback, correction, and sources under `## Previous answer — result`.
2. Add a horizontal divider.
3. Put the next question under `## Question N of M — <root topic>`.
