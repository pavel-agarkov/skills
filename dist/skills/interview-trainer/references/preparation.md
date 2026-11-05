# Question-pool preparation

Preparation produces reusable, private candidates; it does not start or alter a training session. The source files remain metadata-only; complete candidate content belongs only in `.training/pool/questions/`. See [storage.md](storage.md) for schemas, compatibility, retirement, and recovery contracts.

## Command and operation state

The standalone command is `/interview-trainer prepare [--improve]`. A clear natural-language request to prepare or top up the pool routes here. Require accepted, ready configuration; if setup is incomplete, stop and offer the existing configuration workflow. Persist the pending operation and its return action before asking for the target. Use `return-to-current-question` when a question awaits an answer, `return-to-session` for an active session without a current question, and `return-to-inactive` when no session is active. For a standalone invocation, ask exactly one target question unless a clear count from 1–99 was supplied. Persist that answer and the `preparing` phase before research begins. An interrupted operation resumes from its saved operation, target, improvement intent, and return action rather than asking again.

Preparation does not create or initialize a session, append to or read a transcript, grade an answer, change progress/history/counters, or consume/retire a question. If a question is awaiting an answer, explicit preparation takes precedence over grading; preserve the exact current-question snapshot and return to it after the operation. Successful explicit preparation in an active session enables `prefer-pool` for later selections only. A decline during a new-session offer is different: preserve `on-demand` for that start and do not bulk-prepare or revalidate the pool.

For `prepare --improve`, complete the preparation first, then make a supported improvement proposal as an immediate-command result. Do not set `improveAfterSession` or edit the skill. Preparation performed with `start --improve` instead follows the start command's existing after-session proposal behavior.

## Workflow

1. Require accepted, ready configuration before researching. If setup is incomplete, stop and offer the existing configuration workflow; do not prepare against an unaccepted taxonomy.
2. Obtain one target total of compatible, unused, verified candidates. Default to 25; accept a clear requested count directly within 1–99. A target is a pool size, not session length.
3. Inspect the index and count only complete, currently compatible, unused, source-fresh ready candidates. Reuse those first. A smaller later target does not delete surplus valid candidates. Do not treat drafts, stale records, presented identities, or incompatible candidates as ready.
4. Fill only the gap to the target, stopping when it is met or the shared attempt budget is exhausted. Aim for diversity across schedulable topics, permitted levels, and formats; a target count does not guarantee every session need is covered.
5. Validate each candidate and its evidence before persisting a complete record as ready and indexing it. Persist successful batches as they finish. Keep incomplete work explicitly `draft`/`partial`; it never becomes eligible through index membership alone.
6. If a bounded attempt or worker fails, retain valid completed records and use remaining budget for bounded direct work where practical. Report generic ready/partial counts and known readiness limitations, not question, topic, level, source, answer, or rubric details. Preparation does not ask a quiz question or consume a candidate.

## Budgets and bounded work

- Cap construction and repair attempts at **twice the requested target per invocation**, including work by all workers. The budget is shared, not multiplied by worker count.
- Use no more than **three independent topic-batch workers**. Delegate only when tools and permissions allow and the batches do not depend on one another. Do small work directly; never require delegation.
- Give each worker a self-contained assignment: accepted configuration details needed for the batch, topic/subtopic and level/format coverage, candidate count and remaining attempt allocation, excluded identities/concepts, and source/evidence requirements.
- A worker may return fewer candidates or explicit gaps. Do not ask it to expand scope, exceed its budget, or continue in a later user turn. Preserve successful independent results when another batch fails.
- Do not perform a duplicate blanket source-research pass solely to recheck worker output. The coordinator checks every returned candidate against its claimed evidence and performs targeted verification only where a criterion is unsupported or ambiguous.

## Candidate lifecycle and validation

A candidate moves through `draft`/`partial` to `ready` only after all checks pass. The index is metadata for selective choice; it is not evidence that the body is complete. A ready candidate must contain:

- Stable `questionId`, `conceptId`, and `angleId`, independent of session ID; topic/subtopic, language, permitted level, format, product/version assumptions, text, and choices (or explicit `none`).
- A complete private rubric: short independently scorable criteria totaling `1` with each weight a multiple of `0.25`; for single-choice, concise parallel plausible choices and exactly one correct label with a supported reason.
- Source ID/title/official URL, candidate-specific `verifiedAt` and applicable product/version, and bounded original support notes linking **each** rubric criterion to an exact verified section.
- Passing construction, compatibility, privacy, source, and duplicate checks; identity-ledger comparison must cover exact IDs/fingerprints and semantic paraphrases. Never make a candidate new by changing wording, format, or a topic label.

Recheck compatibility at use: accepted taxonomy, language, allowed level, format and code allowance, product/version, repetition rules, and current source requirements. A changed format mix affects scheduling, not automatically candidate validity. A base-level shift preserves records still in the allowed range. Unambiguous equivalent topic renames may preserve identity; do not silently map ambiguous changes.

A record can become stale, incompatible, invalid, or retired after preparation. These are different states: stale material needs candidate-specific revalidation within the chosen operation; incompatible material is not eligible; invalid material is rejected; presented identities stay retired even if their bodies are removed. A failed operation does not turn partial records into ready ones or erase successfully verified candidates.

## Evidence and freshness

Retrieve official documentation and verify the actual section supporting each criterion. Store concise original support assessments and section identifiers in the candidate body, not wholesale documentation excerpts or copied answers. Source-cache metadata may locate and freshness-check a URL, but it does not verify a candidate's claims, rubric, support, or current applicability.

Give every candidate its own `verifiedAt` and support notes. Refreshing a shared source URL or another candidate does not freshen this candidate. Revalidation must check every criterion again and update this candidate's support and timestamp only after successful verification. Preserve mandatory source revalidation triggers and 180-day stable-foundational / 30-day version-sensitive freshness from [sources.md](sources.md): current/latest behavior, materially changeable security guidance, newer named product versions, conflicting guidance, failed links, and loss of subtopic support require revalidation regardless of age. If support fails, reject or repair the candidate; do not claim freshness from URL metadata.

## Worker contract

Workers are bounded researchers, not coordinators or agents of the learner. They return candidate data, source evidence and exact section references, criterion-by-criterion support notes, identity/concept exclusions considered, and explicit coverage gaps. Return candidates as drafts for coordinator validation; workers do not write the shared pool/index, source cache, session, ledger, or transcript.

Workers must not ask the learner questions, grade answers, read transcripts or archives, inspect learner answers/scores, spawn other workers, broaden assigned topics, or persist shared state. The coordinator is solely responsible for verifying all support and checks, deduplicating candidates, assigning final stable IDs, and committing complete records. Do not rely on workers surviving between user turns.
