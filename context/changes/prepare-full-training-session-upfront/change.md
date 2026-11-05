---
change_id: prepare-full-training-session-upfront
title: Prepare full training sessions upfront to reduce waits between questions
status: planned
created: 2026-11-05
updated: 2026-11-05
archived_at: null
---

## Notes

### Problem

Users spend too much time waiting for the next question during interview training. Where possible, prepare the full training session upfront rather than repeating research and question preparation between answers.

### Desired outcome

- Once the session length and configuration are known, prepare enough verified, source-backed question material for the full session where feasible.
- Prepare a larger candidate pool rather than an exact session sequence, so questions can be selected as progress and levels change.
- Persist compatible candidates between sessions for reuse; session completion must not automatically discard unused prepared material. Retention, freshness, and repetition policies must bound reuse.
- Add `/interview-trainer prepare` to prepare or top up the pool independently. Ask for a target count, default 25.
- Reuse a usable pool automatically. If none is usable, offer preparation before a new session; declining retains existing on-demand behavior.
- Retire exact questions on presentation while retaining unused candidates across sessions.
- Consider parallel research subagents for independent topics when available and beneficial. Parallel execution is an optimization, not a requirement for using the trainer.
- Reuse prepared material between turns so that grading and presenting the next question do not normally require fresh research.
- Preserve adaptive selection: preparing material upfront must not force a fixed question order or prevent adjustment to the user's answers.
- If full preparation is not feasible, reuse what is ready and prepare missing material as needed. Do not silently relax source verification or grading requirements.
- Keep preparation private and continue presenting exactly one question at a time; do not reveal future questions, expected answers, or private rubrics.

### Relevant current behavior

- [Session lifecycle](../../../dist/skills/interview-trainer/references/sessions.md) currently selects, verifies, persists, and asks the first question after session setup, then selects the next question as the session progresses.
- [Interview trainer](../../../dist/skills/interview-trainer/SKILL.md) requires verified sources, persistence before presentation, private preparation, and reference reuse across turns.

### Planning considerations

- Decide what to prepare upfront: a full candidate pool, verified topic research, or both, while retaining adaptive scheduling.
- Define how prepared material is persisted and reused on resume, and how configuration changes invalidate affected material.
- Bound parallel research and coordinate persistence so workers do not overwrite shared training state.
- Balance the initial preparation delay against the reduction in between-question waits; avoid duplicating research already available in verified source records.

### Acceptance goals

- For a session whose material can be fully prepared upfront, subsequent questions reuse prepared material without repeated research when that material remains suitable.
- Adaptive selection, source verification, private rubrics, transcript behavior, and resume/recovery remain intact.
- Sessions still work without subagents or when only part of the material can be prepared, with additional preparation only where needed.
- Validate the reduction in between-question preparation work on a representative multi-topic session, including the initial preparation cost rather than merely moving an unbounded delay to startup.
- Update package version and changelog, publish through the existing release workflow, and verify the npm artifact, tag, and GitHub Release.
- Install the exact new package version in another authorized repository and validate it with actual training, including cross-session pool reuse and on-demand opt-out.

### Suggested next step

Research is recorded in [research.md](research.md). The subsequent [frame.md](frame.md) incorporates the reusable-pool clarification. [plan.md](plan.md) and [plan-brief.md](plan-brief.md) additionally incorporate the preparation command, pre-session opt-in, confirmed sizing/retirement choices, package release, and actual-training validation in another repository. No trainer behavior has been changed or package published.

Implement [plan.md](plan.md) after approval.
