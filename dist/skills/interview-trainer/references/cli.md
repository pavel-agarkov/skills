# CLI routing

Use this table to dispatch commands and load only the required references:

| Command | Behavior | Read |
|---|---|---|
| `configure` | Start or resume the interactive configuration workflow. Accept no command-specific arguments or flags. | `configuration.md` |
| `start` | Start a session. If one is incomplete, ask whether to resume it or abandon it and start a new one. | `sessions.md`, `preparation.md` for the pre-session pool decision, then question references when starting |
| `resume` | Resume the unanswered question or prepare the next question. | `sessions.md`, `preparation.md` if resuming a pending preparation, then grading or question references |
| `abandon` | Confirm, summarize, and archive an incomplete session. | `sessions.md` |
| `stats` | Show current session and lifetime topic/subtopic statistics. | `statistics.md` |
| `prepare` | Prepare or top up a reusable pool of verified questions without starting a session. | `preparation.md`, `storage.md`; `configuration.md` only if setup is incomplete |
| `topics list` | Show configured topics and subtopics. | `topics.md` |
| `topics add <topic>` | Propose and review subtopics for one new topic. | `topics.md`, `configuration.md` |
| `topics remove <topic>` | Confirm removal while preserving historical progress. | `topics.md` |
| `topics update <topic>` | Interactively reconfigure one topic's subtopics. | `topics.md`, `configuration.md` |

`<topic>` is one positional value and may be quoted when it contains spaces. Match configured topic names case-insensitively only when unambiguous.

Do not add command-specific flags. Configuration values, question counts, confirmations, topic corrections, migration choices, and other decisions use the existing one-question-at-a-time workflow. Natural-language requests may include values directly; for example, "start a five-question session" or "change my difficulty to architect" should perform the focused operation without forcing unrelated configuration.

`prepare` accepts no positional arguments. A clear natural-language request to prepare, build, or top up the question pool routes to the same operation; a supplied target from 1 to 99 is used directly, otherwise ask the single pool-target question. This target is independent of session length. `--improve` is global: for `prepare`, make any supported proposal after preparation completes; it does not start a session or change `improveAfterSession`.

Load `cli.md` once per conversation after recognizing a command or operational request, then load each referenced file at most once when first needed. `stats`, bare help, and `topics list` must not load the pool index or candidate bodies. `prepare` reads the index and selected records as needed; it does not load every candidate body. During `start`, check pool metadata only after resolving an existing incomplete-session choice and obtaining session length. Read candidate bodies only when selected or when preparation needs to inspect/repair a specific candidate.

For invalid input, state the exact problem and the shortest valid usage. Do not print the full command list unless the command itself is missing or unknown.
