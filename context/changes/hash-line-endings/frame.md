# Frame Brief: Line-ending conversion makes installed files and the config look changed

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

On a consumer checkout where Git writes the committed skill files with CRLF (Windows, `core.autocrlf=true`, or a
`text=auto` / `eol=crlf` rule), every installed file is reported as "modified by you": `update` and `remove` skip it,
and `check` reports pending changes. Separately, `.pa-skills.json` gets rewritten on an unchanged run, which breaks
the README's "byte-identical on re-run" promise.

## Initial Framing (preserved)

- **User's stated cause or approach**: The CLI hashes raw bytes. The packaged files are LF, so a CRLF copy on disk no
  longer matches the recorded SHA-256. The config is compared and written as raw LF text.
- **User's proposed direction**: Hash line-ending-normalized content (`\r\n` → `\n`; NUL in the first 8 KB means
  binary, hashed raw) with the hash format unchanged, and keep writing the packaged bytes. Document this in README
  "Hard rules". Make an unchanged `add` / `update` leave a CRLF `.pa-skills.json` untouched. No CLI-managed
  `.gitattributes`.
- **Pre-dispatch narrowing**: Both symptoms (skill files flagged as modified, config rewritten) are of equal concern
  and are treated as one class. Scope: a fresh CRLF checkout whose manifest still lists every file. Repos where an
  earlier `update` already dropped "modified" entries are out of scope.

## Dimension Map

1. **On-disk vs recorded hash comparison**: the raw-byte hash makes an EOL-only difference count as a content change. ← initial framing
2. **Config change detection**: `writeConfig` compares raw text, so a CRLF config is never "equal" and gets rewritten. ← initial framing (part 3)
3. **Producer-side premise "packaged files are LF"**: holds only if the bytes the CLI reads from `dist/` are LF.
4. **Rules-file block (`AGENTS.md` / `CLAUDE.md`)**: a CRLF rules file could make the marker block look changed too.
5. **Manifest attrition after the first bad run**: "modified" files are dropped from the manifest, so the damage persists after a fix (out of scope by narrowing).

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| 1. Raw-byte hash flags EOL-only changes | `hashOnDisk` = `sha256(readFileSync(abs))`, raw bytes (`src/sync.js:15-22`). Compared against `d.sha256` and `recorded` (`src/sync.js:114,118,137`), otherwise `modified` (`:124,:144`). **Repro** (LF copy of the package, `SKILL.md` → CRLF): `check` exits 3 with `modified: .agents/skills/interview-trainer/SKILL.md`; `update --dry-run` warns "modified locally; left untouched". | STRONG |
| 2. Config rewritten on a CRLF checkout | `readFileSync(file,'utf8') !== text`, with `text` always LF (`src/config.js:33-35,170-173`). **Repro**: `.pa-skills.json` → CRLF, unchanged `update` rewrites it to LF and still prints "Nothing to change". | STRONG |
| 3. `dist/` is not LF on Windows checkouts | This repo has no `.gitattributes`. `git ls-files --eol dist` shows `i/lf w/crlf` here (autocrlf=true), and the `dist/**/SKILL.md` bytes contain CR. The Windows CI job runs `npm test` on the same kind of checkout (`.github/workflows/ci.yml`, `publish.yml` matrix). Publishing runs on `ubuntu-latest`, so the published tarball is LF (inferred from the workflow; the tarball was not inspected). Today's tests pass on Windows only because the catalog and the installed copies are both CRLF. | STRONG (as a constraint on the fix, not a cause of the reported bug) |
| 4. Rules-file block | `applyBlock` / `removeBlock` already detect and keep the file's EOL (`src/agents-md.js:9-11,63-76,90`). Covered by `test/agents-md.test.js:45` "preserves CRLF files". | NONE |
| 5. Manifest attrition | A file found "modified" is not put in the new manifest (`src/sync.js:123-125`, README "no longer tracked"). With normalized hashes, an unchanged CRLF copy is re-adopted through the `disk === d.sha256` branch (`:114-117`). A CRLF copy of an *outdated* file whose entry was dropped would stay "modified". This comes from reading the code and was not tested. | WEAK (out of scope; noted) |

## Narrowing Signals

- The repro reproduces both symptoms on the current code, so the brief's "stop if it doesn't reproduce" gate is cleared.
- Dimension 4 is ruled out: the repo already handles CRLF for rules files.
- Dimension 3 changes how the fix must be tested. The brief's premise "packaged files are LF, so normalized hash ==
  today's raw hash" holds for the **published package**, not for `dist/` as read on the Windows CI job or a Windows
  dev checkout. A test that asserts `normalizedHash(file) === sha256(rawDiskBytes)` over the catalog would fail on
  Windows CI. The back-compat property has to be stated against the LF form (the git index / published bytes), and
  "write the packaged bytes" means CRLF when the CLI runs from a Windows checkout.

## Cross-System Convention

The repo already treats line endings as non-content in two places: the rules-file block keeps the file's EOL
(`src/agents-md.js:9`), and the `CHANGELOG.md` test compares the LF form because "git may check the file out with CRLF on
Windows" (`test/changelog.test.js:81-82`). Git (`text=auto` normalization) and most lock/manifest tools compare text
in normalized form. The proposed direction matches both the repo's own convention and the wider one.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: the CLI's two equality checks (installed file vs recorded hash, and
> config text vs serialized text) compare raw bytes, so a line-ending-only difference is treated as a change.

The initial framing was correct, so proceed with the proposed direction. One premise needs tightening. The packaged
files are LF in the published tarball, but not in this repo's Windows checkouts, including the Windows CI job that
must run the new tests. The fix and its tests must not assume `dist/` bytes on disk are LF.

## Confidence

**HIGH**: both symptoms reproduced against the current code, the cause is pinned to `src/sync.js:21` and
`src/config.js:170`, and the fix matches the existing in-repo convention. Unverified: the LF claim for the published
0.3.0 tarball. It is inferred from `publish.yml` running on Ubuntu, not from inspecting the registry tarball.

## What Changes for /10x-plan

Plan the fix as proposed, with two additions. (1) Decide how the catalog back-compat test and the CRLF/LF fixtures
stay correct when `dist/` is checked out with CRLF on the Windows CI job. A producer-side `.gitattributes` for `dist/`
is one option, normalizing in the test is another; that choice belongs to the plan. (2) A rewritten config currently
reports "Nothing to change", so the config test should assert the bytes, not the message.

## References

- Source files: `src/sync.js:6-22,98-146`, `src/config.js:33-35,151-177`, `src/agents-md.js:9-11,62-76`,
  `src/lifecycle.js:91-95`, `test/agents-md.test.js:45`, `test/changelog.test.js:80-84`,
  `.github/workflows/publish.yml` (test matrix + `ubuntu-latest` publish)
- Repro script (scratch, not committed): run from this session's scratchpad `repro.mjs` against an LF copy of the package
- Related research: none
