# Topic management

## List

`topics list` displays configured topics and their accepted subtopics. It is read-only and does not enter configuration.

## Add

`topics add <topic>`:

1. Reject an exact or normalized duplicate.
2. Build 5-8 practical subtopics using current official documentation.
3. Persist the topic as pending review.
4. Review and correct only that topic until accepted.
5. Initialize zeroed progress and an addressable history file only after acceptance.

## Remove

`topics remove <topic>` shows whether progress exists and asks for confirmation. After confirmation, remove the topic from active scheduling but preserve its historical progress rather than silently deleting it. Never remove the final configured topic unless another is added first. If the current schema cannot represent inactive progress without ambiguity, ask whether to retain the files unchanged or permanently delete the topic records; never choose silently.

## Update

`topics update <topic>` starts interactive subtopic reconfiguration for that topic:

1. Show its current subtopics.
2. Ask whether to edit them or generate a new proposal.
3. Review the revised taxonomy.
4. Preserve progress for unchanged or clearly equivalent renamed subtopics.
5. Ask before discarding progress for removed or ambiguously renamed subtopics.

Topic operations never silently reset scores, history, or an active session.
