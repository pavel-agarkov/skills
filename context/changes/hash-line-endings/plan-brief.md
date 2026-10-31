# Line-Ending-Immune Hashes — Plan Brief

> Full plan: `context/changes/hash-line-endings/plan.md`
> Frame brief: `context/changes/hash-line-endings/frame.md`

## What & Why

The CLI's two equality checks (installed file vs recorded hash, and config text vs serialized text) compare raw bytes, so a line-ending-only difference counts as a change. On Windows checkouts (`core.autocrlf=true`, `text=auto`, `eol=crlf`), every installed skill file then looks "modified by you": `update` stops updating it, `remove` keeps it, and `check` reports pending changes. On top of that, `.pa-skills.json` is rewritten on every unchanged run.

## Starting Point

`hashOnDisk` and the desired hash in `src/sync.js` are raw SHA-256. `writeConfig` in `src/config.js` compares raw text that is always LF. The frame reproduced both symptoms. The rules-file block (`src/agents-md.js`) already keeps the existing file's line endings, which is the convention to follow.

## Desired End State

A CRLF copy of an unchanged skill file is treated as unchanged by `check`, `update` and `remove`. A real edit is still detected. An unchanged run leaves a CRLF `.pa-skills.json` byte-identical. 0.3.0 configs stay valid. Consumers can drop their `.gitattributes` `eol=lf` workarounds. Shipped as 0.3.1.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Main fix | Hash content after `\r\n` → `\n` | Only real content changes count as modifications. | Frame |
| Binary files | A NUL byte in the first 8 KB → hash raw | Normalizing binary data would hide real byte changes. | Frame |
| Hash format | Unchanged | The published files are LF, so their normalized hash equals 0.3.0's raw hash. | Frame |
| Written bytes | The packaged bytes as they are | Don't try to match the consumer's EOL style for skill files. | Frame |
| CLI-managed `.gitattributes` | Not done | Git-only, one more file the CLI owns, and no help for existing CRLF checkouts. | Frame |
| Lone `\r` | Kept as content (only CRLF is converted) | Matches what Git's conversion produces; edits that add lone CRs are still caught. | Plan |
| `dist/` CRLF on Windows checkouts | No repo `.gitattributes`; tests build their own LF/CRLF fixtures | Smallest change; tests pass on any checkout. | Plan |
| Config write | Skip when equal ignoring EOL; on a real change keep the file's EOL | No churn and only meaningful diffs on CRLF checkouts, same as `agents-md.js`. | Plan |

## Scope

**In scope:**
- `contentHash` in `src/sync.js`, used for the desired and on-disk hashes
- An EOL-aware `writeConfig`
- Tests for every scenario in the change brief, plus `remove` and back-compat
- The README "Hard rules" line
- 0.3.1 version bump, `changelog.json` entry and regenerated `CHANGELOG.md`

**Out of scope:**
- Any `.gitattributes`, in this repo or written by the CLI
- Conversion of lone CRs
- Matching the consumer's EOL for skill files
- Re-adopting manifest entries that an earlier bad `update` dropped
- Schema changes

## Architecture / Approach

One pure function, `contentHash(bytes)`, does both jobs: if it finds a NUL byte in the first 8 KB it hashes the bytes raw, otherwise it converts `\r\n` → `\n` (byte-exact, no UTF-8 decode) and then hashes. Every manifest hash goes through it, so the comparison branches in `syncSkills` stay as they are. `writeConfig` mirrors `eolOf` from `agents-md.js`: it compares in LF form and writes in the existing file's EOL.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Hashes that ignore line endings | `contentHash` plus CRLF/binary/back-compat tests for check/update/remove | Fixtures built from CRLF `dist/` bytes on Windows CI record different hashes; tests must build their own EOL |
| 2. Config writes that ignore line endings | `writeConfig` skips EOL-only differences and keeps the EOL on a real change; byte-level tests | A test that asserts the "Nothing to change" message instead of the bytes would miss a rewrite |
| 3. Docs and release | README Hard rules line, 0.3.1, changelog | Release check and changelog tests must agree with the new entry |

**Prerequisites:** none beyond the current `main` (0.3.0). CI already runs on Linux and Windows.
**Estimated effort:** about one session across 3 small phases.

## Open Risks & Assumptions

- Assumption: the published 0.3.0 tarball is LF. This is inferred from `publish.yml` running on Ubuntu and was not checked against the registry. The catalog back-compat test proves the property for the LF form.
- Existing tests that use `writeLegacyInstall` on Windows record raw CRLF hashes. After the fix, their manifest entries are rewritten with the content hash, which may break a byte-identical config assertion on Windows only.

## Success Criteria (Summary)

- On a Windows checkout with `core.autocrlf=true`, `check` is clean and `update` keeps updating skills, with no consumer `.gitattributes` rules.
- An unchanged `add` / `update` never touches `.pa-skills.json`, whatever its line endings.
- All new tests pass on both the Linux and the Windows CI jobs.
