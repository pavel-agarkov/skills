# Scripts Used During This Session

## Scope

This report records the ad hoc scripts visible in the available session context, primarily the final grading and archival steps for the five-question interview session. Earlier skill-update and question-pool preparation work is represented only by a conversation summary, so its exact commands cannot be reproduced here. No scripts were recovered from or copied out of the training transcript.

## Scripts and commands

### 1. Python state consistency check

An inline Python script read `session.md`, `presented.md`, `history/architecture.md`, and `progress.md`. It asserted the session score/counters and question format counts, checked that the fifth question was committed in the presentation ledger, and checked architecture history/progress before grading.

```python
from pathlib import Path
root = Path(r'C:\Projects\Personal\training\.training')
s = (root / 'session.md').read_text(encoding='utf-8')
p = (root / 'presented.md').read_text(encoding='utf-8')
h = (root / 'history' / 'architecture.md').read_text(encoding='utf-8')
pr = (root / 'progress.md').read_text(encoding='utf-8')

assert 'completed: 4' in s and 'earned: 2' in s
assert 'formatCounts: openEnded=3; singleChoice=2; codeWriting=0' in s
assert 'status: committed' in s
assert 'currentQuestionId: q-architecture-event-stream-replay' in s
assert '| q-architecture-event-stream-replay | sha256:d36f9f17df0ed1e8b48e52d4a8f826c81237d988a694c20a679a28dc82eb8e58 | session-20261106T090833Z | 2026-11-06T09:21:38Z |' in p
assert 'event-stream-durable-replay/consumer-position-recovery' in h
assert '| DevOps Engineering | CI/CD pipeline engineering and reusable automation | 3 | 0 | architect | 2026-11-06T09:18:50Z | complete |' in pr
```

The check explicitly did not read the append-only transcript.

### 2. PowerShell archive-path preflight

Checked that the active transcript existed and the intended archive destination did not:

```powershell
$transcript = 'C:\Projects\Personal\training\.training\transcript.md'
$archive = 'C:\Projects\Personal\training\.training\archive\session-20261106T090833Z.md'
if (!(Test-Path -LiteralPath $transcript -PathType Leaf)) {
    throw 'Active transcript is missing.'
}
if (Test-Path -LiteralPath $archive) {
    throw 'Archive destination already exists.'
}
```

### 3. PowerShell transcript append and move

Appended the final answer, score, source, and session summary to the transcript using `File.AppendAllText`, then moved it into `.training\archive\` without reopening it. Verified the source was gone and destination existed.

```powershell
$transcript = 'C:\Projects\Personal\training\.training\transcript.md'
$archive = 'C:\Projects\Personal\training\.training\archive\session-20261106T090833Z.md'
$append = @'

### Your answer

D)

### Answer summary

Correct: D identifies durable, partition-ordered events and consumer-managed replay position.

score: 1

### Recommended source

- [Event-Driven Architecture Style](https://learn.microsoft.com/azure/architecture/guide/architecture-styles/event-driven)

## Session complete

score: 3/5

Strongest concepts: distributed-systems event replay, API rate limiting, and Azure resiliency.

Revision priorities: reusable CI/CD workflow references and SQL Server transaction-log recovery.

Next revision: revisit those two areas, focusing on immutable workflow references and the active transaction-log range.

## Review links

- [.NET — ASP.NET Core and API design](https://learn.microsoft.com/aspnet/core/performance/rate-limit?view=aspnetcore-10.0)
- [Azure — Reliability, resiliency, and disaster recovery](https://learn.microsoft.com/azure/architecture/patterns/circuit-breaker)
- [SQL Server — Storage engine, transactions, and I/O](https://learn.microsoft.com/sql/relational-databases/sql-server-transaction-log-architecture-and-management-guide?view=sql-server-ver17)
- [DevOps Engineering — CI/CD pipeline engineering and reusable automation](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)
- [Architecture — Distributed systems and integration](https://learn.microsoft.com/azure/architecture/guide/architecture-styles/event-driven)
'@
[System.IO.File]::AppendAllText(
    $transcript,
    $append,
    [System.Text.UTF8Encoding]::new($false)
)
Move-Item -LiteralPath $transcript -Destination $archive
if ((Test-Path -LiteralPath $transcript) -or
    !(Test-Path -LiteralPath $archive -PathType Leaf)) {
    throw 'Transcript archival verification failed.'
}
```

### 4. PowerShell final-state verification

An initial check using multiline regular expressions against `session.md` failed even though a visual read showed the expected values. A diagnostic check using string containment confirmed the values, and the final check used `String.Contains` for the expected session fields, a literal progress-row match, and filesystem checks for the archived transcript. It passed.

```powershell
$base = 'C:\Projects\Personal\training\.training'
$session = [System.IO.File]::ReadAllText((Join-Path $base 'session.md'))
$progress = [System.IO.File]::ReadAllText((Join-Path $base 'progress.md'))
foreach ($value in @('status: complete', 'completed: 5',
                     'earned: 3', 'currentQuestionId: none')) {
    if (!$session.Contains($value)) { throw "Missing session state: $value" }
}
if (!$progress.Contains('| Architecture | Distributed systems and integration | 2 | 2 | architect | 2026-11-06T09:23:26Z | complete |')) {
    throw 'Final subtopic progress is inconsistent.'
}
$archive = Join-Path (Join-Path $base 'archive') 'session-20261106T090833Z.md'
if (!(Test-Path -LiteralPath $archive -PathType Leaf) -or
    (Test-Path -LiteralPath (Join-Path $base 'transcript.md'))) {
    throw 'Archive state is inconsistent.'
}
```

## Other state changes

- Used `apply_patch` to update the session counters/status, clear the awaiting-question fields, and update the Architecture progress row.
- Used file-view tools to inspect state and skill reference documentation.
- No standalone `.ps1`/`.py` script, JSON state file, package script, or automated test was created or run for these steps.

## Evidence for a workflow improvement proposal

- State validation and archival were implemented as one-off inline scripts in separate tool calls.
- The transcript mutation needed sequencing: preflight, append, move, then verify.
- State edits were manual while checks and archival were scripted, so the workflow spans multiple mechanisms.
- One regex-based verification failed; switching to simpler literal checks succeeded. A persisted validator could centralize parsing, schema checks, and diagnostics rather than relying on ad hoc text matching.
- This report documents observed behavior only; it does not prescribe JSON or another storage format. Evaluate persisted scripts and structured state as separate design choices, including migration cost, human readability, atomic updates, recovery, and compatibility with existing Markdown state.
