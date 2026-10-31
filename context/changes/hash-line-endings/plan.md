# Line-Ending-Immune Hashes Implementation Plan

## Overview

Make the CLI's two equality checks ignore CRLF/LF differences. The checks are: installed file vs recorded SHA-256, and `.pa-skills.json` text vs serialized text. With that, a Windows checkout (`core.autocrlf=true`, `text=auto`, `eol=crlf`) no longer makes every installed file look "modified by you", and an unchanged run no longer rewrites the config. Ship as patch release 0.3.1.

## Current State Analysis

The frame (`context/changes/hash-line-endings/frame.md`) reproduced both symptoms on the current code:

- `hashOnDisk` hashes raw bytes (`src/sync.js:15-22`). The desired hash is also raw (`src/sync.js:68`). Any EOL-only difference falls through to the `modified` bucket (`src/sync.js:124`, `:144`), so `update` / `remove` skip the file and `check` exits pending.
- `writeConfig` compares `readFileSync(file,'utf8') !== text`, and `text` is always LF (`src/config.js:170-173`). A CRLF config is rewritten on every run, while the CLI still prints "Nothing to change".
- The rules-file block already handles CRLF: `eolOf` + keep the file's EOL (`src/agents-md.js:9-11`, covered by `test/agents-md.test.js:45`).

### Key Discoveries:

- The catalog has 14 `.md` files. In the git index they are all LF, with no lone `\r` and no NUL byte in the first 8 KB. Normalization is therefore the identity on the published bytes, so every hash 0.3.0 recorded stays valid.
- This repo has no `.gitattributes`. On a Windows checkout (`autocrlf=true`, including the Windows CI job), `dist/**` is CRLF on disk, and `realCatalog` / `writeLegacyInstall` (`test/helpers.js:11,46-55`) read those bytes as they are. New tests must build their CRLF/LF fixtures explicitly and must never assume the line endings of the checkout.
- `sha256` is exported and used by `test/sync.test.js:7,32,165`. Keep it as the raw primitive.
- `isPending` (`src/lifecycle.js:91-95`) counts `modified`, so fixing the hash also fixes `check`. No change is needed there.

## Desired End State

- An installed file that differs from the packaged one only by `\r\n` vs `\n` counts as unchanged everywhere: `check` exits 0, `update` reports nothing changed and keeps it tracked, `remove` deletes it.
- A real content edit is still detected, whatever the file's line endings.
- Files with a NUL byte in the first 8 KB are hashed as raw bytes.
- The recorded hash format is unchanged, so a 0.3.0 `.pa-skills.json` for an LF install passes `check` as is.
- `.pa-skills.json` is not written when it differs only in line endings. When its content really changes, it is written with the existing file's line endings.
- The README "Hard rules" section states the line-ending rule. The version is 0.3.1, with a changelog entry.

## What We're NOT Doing

- No `.gitattributes` in this repo, and no CLI-managed `.gitattributes` in consumer repos (the latter at most as a future opt-in).
- No conversion of lone `\r`: only `\r\n` → `\n`. A lone CR is content.
- No matching of the consumer's EOL style for skill files. The CLI keeps writing the packaged bytes as they are.
- No re-adoption of files that an earlier bad `update` already dropped from the manifest (frame dimension 5, out of scope).
- No change to the manifest/config schema or the hash encoding.

## Implementation Approach

Add one content-hash function in `src/sync.js` and route every manifest hash through it: the desired hash of each packaged file, and the on-disk hash of each installed file. Mirror the `agents-md.js` EOL convention in `writeConfig`: compare in LF form, and write in the existing file's EOL. Tests construct CRLF and LF bytes themselves, so they pass on both the Linux and the Windows CI jobs.

## Critical Implementation Details

- **Byte-exact normalization.** Do the `\r\n` → `\n` replacement on bytes, or through a byte-preserving round trip such as `latin1`. Never decode as UTF-8, because invalid sequences become U+FFFD and change the hash of content that has no CR at all, which would break the back-compat guarantee.
- **Windows dev/CI checkouts.** After the fix, hashes that fixtures record from CRLF `dist/` bytes (for example `writeLegacyInstall`, which hashes raw on-disk bytes) differ from the new normalized desired hash. Such files fall into the `unchanged` branch, but their manifest entry is rewritten. If an existing test then asserts that the config bytes did not change, it will fail on Windows only. Adjust the fixture to record the content hash, not the test's expectation.

## Phase 1: Hashes that ignore line endings

### Overview

Introduce the content hash and use it for both sides of every manifest comparison, with tests that cover all EOL scenarios from the change brief.

### Changes Required:

#### 1. Content hash

**File**: `src/sync.js`

**Intent**: Hash text files after converting `\r\n` to `\n`, and hash binary files (a NUL byte in the first 8 KB) raw, so a line-ending-only difference no longer counts as a modification.

**Contract**: New exported `contentHash(bytes) → hex string`, the same 64-char SHA-256 hex as today. `hashOnDisk` returns `contentHash(readFileSync(abs))`. In `syncSkills`, `desired[].sha256 = contentHash(bytes)`, and `d.bytes` is still written unchanged. `sha256(bytes)` stays exported as the raw primitive. Update the `syncSkills` doc comment ("on-disk SHA-256 equals the recorded one") to say "content hash (line endings ignored)".

#### 2. Tests

**File**: `test/sync.test.js` (unit), plus `test/check.test.js` / `test/update.test.js` / `test/remove.test.js` for the command-level cases (place each where the similar existing tests live).

**Intent**: Prove each scenario from the change brief on both operating systems. Every fixture writes its own bytes: it converts `dist/` content to LF (`\r\n` → `\n`) or to CRLF explicitly, and never relies on the checkout.

**Contract**: Tests to add:
- `contentHash` unit cases:
  - LF and CRLF forms of the same text give the same hash;
  - a lone `\r` is kept, so `a\rb` and `a\nb` give different hashes;
  - a buffer with a NUL byte in the first 8 KB is hashed raw, so the same binary with `\r\n` vs `\n` gives different hashes;
  - a NUL byte only after 8 KB still counts as text.
- An installed `SKILL.md` converted to CRLF: `check` is not pending (exit 0). `update` reports nothing changed, does not warn "modified", and keeps the file in `installed.files`.
- A CRLF copy that also has a real content edit: `check` shows `modified:`. `update` skips it without `--force` and overwrites it with `--force`.
- `update` against a newer catalog version of the file, where the on-disk copy is the old content in CRLF: the file is updated to the new packaged bytes and is not reported as modified.
- `remove` of a skill whose installed copy is CRLF: the file is deleted, not kept as modified.
- A binary file containing `\r\n` byte sequences, in a temp catalog built like `makeCatalog` plus an extra file with a NUL byte: an unchanged install is clean. Changing `\r\n` to `\n` in the installed copy is detected as modified.
- Catalog back-compat: for every file in `realCatalog`, take the LF form (on-disk bytes with `\r\n` → `\n`) and assert `contentHash(lf) === sha256(lf)`. This passes on any checkout and proves that 0.3.0's raw hashes of the published LF files still match.
- 0.3.0 install back-compat: a hand-written v2 `.pa-skills.json` (`packageVersion: '0.3.0'`, raw `sha256` of the LF bytes, LF files on disk, same shape as `writeLegacyInstall` but version 2 at the root). `check` is not pending, and an unchanged `update` leaves the whole project snapshot byte-identical.

### Success Criteria:

#### Automated Verification:

- Full test suite passes: `npm test`
- New `contentHash` unit tests pass (CRLF = LF, lone CR kept, binary raw, NUL after 8 KB is text)
- New check/update/remove CRLF scenario tests pass
- Catalog and 0.3.0-config back-compat tests pass

#### Manual Verification:

- In a scratch project, convert an installed `SKILL.md` to CRLF: `node bin/cli.js check` exits 0 and `update --dry-run` prints no "modified locally" warning

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Config writes that ignore line endings

### Overview

Make `writeConfig` treat a line-ending-only difference as "unchanged", and keep the existing file's EOL when the content really changes.

### Changes Required:

#### 1. EOL-aware config write

**File**: `src/config.js`

**Intent**: Keep the README promise that an unchanged run leaves `.pa-skills.json` byte-identical, also on CRLF checkouts, and avoid whole-file diffs when the content really changes.

**Contract**: `writeConfig(cwd, config, { source }) → boolean` keeps its signature. When the file exists: read it, detect its EOL (CRLF if it contains `\r\n`, else LF, same rule as `eolOf` in `src/agents-md.js:9`; export and reuse it, or mirror it), and compare `existing` with `\r\n` → `\n` against `text`. If they are equal, skip the write and return `false`. Otherwise write `text` converted to the detected EOL and return `true`. A new file is written as LF. `serializeConfig` stays LF-only. Retiring the legacy config is unchanged. Update the doc comment ("only when the bytes change" → "only when the content changes, ignoring line endings; keeps the existing file's line endings").

#### 2. Tests

**File**: `test/config.test.js` (unit), plus one command-level case in `test/update.test.js`

**Intent**: Assert the file bytes, not the printed message, because "Nothing to change" is printed even when the config was rewritten.

**Contract**: Tests to add:
- `.pa-skills.json` converted to CRLF, then an unchanged `update`: the config bytes are identical to before (compare with `readFile` as a Buffer or a snapshot), and `writeConfig` returns `false`.
- A CRLF config with a real change (for example `add` of another skill): the new content is written, every line ending is `\r\n`, and there is no bare `\n`.
- An LF config with a real change: it is written as LF (no regression).

### Success Criteria:

#### Automated Verification:

- Full test suite passes: `npm test`
- CRLF config with an unchanged `update` is not rewritten (bytes asserted)
- CRLF config with a real change is written with CRLF; LF config stays LF

#### Manual Verification:

- In a scratch project, convert `.pa-skills.json` to CRLF and run `node bin/cli.js update`: the file's bytes and mtime are unchanged

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Docs and release

### Overview

Document the behaviour and prepare the 0.3.1 patch release following the README "Publishing" section.

### Changes Required:

#### 1. README

**File**: `README.md`

**Intent**: Tell consumers that line endings never count as a modification, so they no longer need `.gitattributes` `eol=lf` rules.

**Contract**: In "Hard rules the installer follows" (`README.md:67-72`), extend the hash bullet or add one: line-ending differences (CRLF vs LF) are not modifications; files with a NUL byte are compared as raw bytes; the CLI writes the packaged files as they are. If the config paragraph (`README.md:65`) says "byte-identical", add that an unchanged run leaves the file untouched and a changed one keeps its line endings. Do not recommend `.gitattributes`. If `test/docs.test.js` checks README content, keep it passing.

#### 2. Release

**Files**: `package.json`, `changelog.json`, `CHANGELOG.md`

**Intent**: Ship the fix as a patch release.

**Contract**: `version` → `0.3.1`. A new top entry in `changelog.json` for `0.3.1`, with notes saying:
- CRLF copies of installed files (Windows `core.autocrlf`, `text=auto`, `eol=crlf`) are no longer reported as modified, so `update` / `remove` / `check` work on Windows checkouts;
- `.pa-skills.json` is no longer rewritten on an unchanged run when it is checked out with CRLF;
- consumer `.gitattributes` `eol=lf` rules for the skill folders are no longer needed.

Regenerate `CHANGELOG.md` with `npm run changelog`.

### Success Criteria:

#### Automated Verification:

- Full test suite passes: `npm test` (includes the changelog and docs tests)
- Release check passes against 0.3.0: `node scripts/release-check.js 0.3.0`
- `CHANGELOG.md` is up to date: `npm run changelog` leaves no diff

#### Manual Verification:

- README "Hard rules" reads clearly and mentions the CRLF/LF rule
- After the merge, the CI `test` job is green on both `ubuntu-latest` and `windows-latest`
- A consumer repo on Windows (`core.autocrlf=true`) drops its `.agents/**` / `.claude/skills/**` `eol=lf` rules, re-checks out, and `npx @pavel-agarkov/skills@0.3.1 check` is clean

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `contentHash`: CRLF = LF; lone CR kept; binary with a NUL in the first 8 KB hashed raw; a NUL only after 8 KB is treated as text.
- `writeConfig`: EOL-only difference → not written; real change → written with the existing EOL; new file → LF.

### Integration Tests:

- `check` / `update` / `remove` against CRLF installed copies (unchanged, edited, outdated).
- Back-compat: catalog LF hashes equal raw hashes; a hand-written 0.3.0 v2 config passes `check` and an unchanged `update` changes no bytes.

### Manual Testing Steps:

1. Scratch project: `add --skill interview-trainer`, convert `SKILL.md` to CRLF, then `check` → exit 0.
2. Same project: convert `.pa-skills.json` to CRLF, then `update` → the file is unchanged.
3. Edit the CRLF `SKILL.md` content, then `update` → "modified locally; left untouched".

## Migration Notes

None needed. 0.3.0 hashes of LF files equal the new content hashes. Consumers whose earlier `update` dropped "modified" entries from the manifest are out of scope (frame dimension 5). Their files stay untracked until `add --force`.

## References

- Frame brief: `context/changes/hash-line-endings/frame.md`
- EOL convention: `src/agents-md.js:9-11,62-76`, `test/agents-md.test.js:45`
- Hash comparison: `src/sync.js:15-22,62-70,98-146`
- Config write: `src/config.js:151-177`
- Test helpers: `test/helpers.js:11,46-55,82-88`
- CI matrix: `.github/workflows/ci.yml`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Hashes that ignore line endings

#### Automated

- [x] 1.1 Full test suite passes: `npm test` — 0dc7b6e
- [x] 1.2 New `contentHash` unit tests pass (CRLF = LF, lone CR kept, binary raw, NUL after 8 KB is text) — 0dc7b6e
- [x] 1.3 New check/update/remove CRLF scenario tests pass — 0dc7b6e
- [x] 1.4 Catalog and 0.3.0-config back-compat tests pass — 0dc7b6e

#### Manual

- [x] 1.5 In a scratch project, convert an installed `SKILL.md` to CRLF: `node bin/cli.js check` exits 0 and `update --dry-run` prints no "modified locally" warning — 0dc7b6e

### Phase 2: Config writes that ignore line endings

#### Automated

- [x] 2.1 Full test suite passes: `npm test`
- [x] 2.2 CRLF config with an unchanged `update` is not rewritten (bytes asserted)
- [x] 2.3 CRLF config with a real change is written with CRLF; LF config stays LF

#### Manual

- [x] 2.4 In a scratch project, convert `.pa-skills.json` to CRLF and run `node bin/cli.js update`: the file's bytes and mtime are unchanged

### Phase 3: Docs and release

#### Automated

- [ ] 3.1 Full test suite passes: `npm test` (includes the changelog and docs tests)
- [ ] 3.2 Release check passes against 0.3.0: `node scripts/release-check.js 0.3.0`
- [ ] 3.3 `CHANGELOG.md` is up to date: `npm run changelog` leaves no diff

#### Manual

- [ ] 3.4 README "Hard rules" reads clearly and mentions the CRLF/LF rule
- [ ] 3.5 After the merge, the CI `test` job is green on both `ubuntu-latest` and `windows-latest`
- [ ] 3.6 A consumer repo on Windows (`core.autocrlf=true`) drops its `.agents/**` / `.claude/skills/**` `eol=lf` rules, re-checks out, and `npx @pavel-agarkov/skills@0.3.1 check` is clean
