# Reusable Training Question Pool - Plan Brief

Full plan: [plan.md](plan.md). Context: [frame.md](frame.md), [research.md](research.md).

## What and why

Separate source-backed question preparation from adaptive selection to reduce waits between training questions. Persist unused candidates across sessions; do not generate a fixed quiz script or require preparation to train.

## Desired end state

- `/interview-trainer prepare` prepares or tops up a reusable pool without starting a session.
- Ask for a target pool count, default 25; it may exceed the session length.
- New sessions reuse a usable pool automatically. Only when no usable pool exists, offer preparation or the existing on-demand flow.
- Declining preparation retains existing question construction and scheduling; it does not trigger a smaller implicit preparation batch.
- Progress, level, format, repetition, compatibility, and source rules determine the next question. A missing suitable candidate falls back to existing on-demand preparation.
- Exact questions are retired on presentation. Unused compatible candidates survive completion and abandonment.

## Confirmed decisions

| Decision | Choice |
|---|---|
| Startup offer | Only when no usable pool exists; otherwise reuse automatically |
| Sizing | Ask for a target count, default 25, independent of session length |
| Exact-question reuse | Retire on presentation; do not recycle after a session/history-window reset |
| New command | `prepare`, no command-specific flags |
| Parallel research | Optional, bounded, independent topic batches; coordinator owns persistence |

The first three choices were explicitly confirmed during planning. Detailed storage and recovery contracts in the full plan are implementation decisions.

## Approach

Add one preparation reference and workspace-local pool storage, separate from metadata-only sources and learner state. Keep a compact index, addressable candidate records, and compact presented-question identities. Promote the selected record into the existing current-question schema; never grade against a mutable pool record.

Before creating a new active session/transcript, persist the pending start choices so an interrupted preparation prompt can resume. A missing optional pool is normal; malformed state is an explicit recovery error, not a silent fallback.

## Phases

1. Define pool, preparation, pending-start, and recovery contracts.
2. Wire `prepare`, startup opt-in, automatic pool lookup, and on-demand fallback.
3. Align lifecycle, configuration invalidation, privacy, and user documentation.
4. Validate command/storage contracts, scripted adaptive traces, and cold/warm waiting times.
5. Update package version/changelog, verify package contents and release tests, publish through the existing workflow, and verify npm/tag/GitHub Release.
6. Install the exact published version in a separately authorized consumer repository and validate actual user training, cross-session reuse, and on-demand opt-out.

## Scope and validation

The trainer skill/references, its README, directly related tests, package version/changelog/generated release notes, the existing publishing process, and post-publication consumer validation. No installer API change, new service, dependency, global bank, or background worker requirement.

Existing Node tests can check packaging and instruction consistency, not prove agent behavior. Require scripted trainer traces for opt-out parity, cross-session reuse, retirement, level changes, source revalidation, failures, and interrupted setup. Measure initial and total waiting as well as between-question waiting; no speedup is claimed before measurement.

Release is not complete at merge: verify the registry artifact and matching tag/release. End-to-end completion additionally requires installing that exact release in another real repository and conducting actual training with the user. Select the consumer repository/agent with permission at execution time; preserve learner state and local modifications. If live validation is unavailable, report it as blocked. Published defects require a new patch and revalidation, not a local-only fix.

Next: implement [plan.md](plan.md) after approval.
