# CLI routing

Use this table to dispatch commands and load only the required references:

| Command | Behavior | Read |
|---|---|---|
| `configure` | Start or resume the interactive configuration workflow. Accept no command-specific arguments or flags. | `configuration.md` |
| `start` | Start a session. If one is incomplete, ask whether to resume it or abandon it and start a new one. | `sessions.md`, then question references when starting |
| `resume` | Resume the unanswered question or prepare the next question. | `sessions.md`, then grading or question references |
| `abandon` | Confirm, summarize, and archive an incomplete session. | `sessions.md` |
| `stats` | Show current session and lifetime topic/subtopic statistics. | `statistics.md` |
| `topics list` | Show configured topics and subtopics. | `topics.md` |
| `topics add <topic>` | Propose and review subtopics for one new topic. | `topics.md`, `configuration.md` |
| `topics remove <topic>` | Confirm removal while preserving historical progress. | `topics.md` |
| `topics update <topic>` | Interactively reconfigure one topic's subtopics. | `topics.md`, `configuration.md` |

`<topic>` is one positional value and may be quoted when it contains spaces. Match configured topic names case-insensitively only when unambiguous.

Do not add command-specific flags. Configuration values, question counts, confirmations, topic corrections, migration choices, and other decisions use the existing one-question-at-a-time workflow. Natural-language requests may include values directly; for example, "start a five-question session" or "change my difficulty to architect" should perform the focused operation without forcing unrelated configuration.

For invalid input, state the exact problem and the shortest valid usage. Do not print the full command list unless the command itself is missing or unknown.
