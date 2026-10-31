<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Line-Ending-Immune Hashes Implementation Plan

- **Plan**: context/changes/hash-line-endings/plan.md
- **Scope**: Full plan (Phase 3 left out: its Progress still has the open manual checks 3.5 and 3.6)
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-31
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Evidence:
- **Plan adherence:** the drift check found every Phase 1 and 2 item and test scenario implemented as planned. There is no drift and nothing missing. Nothing in `src/` goes beyond the plan.
- **Accepted adaptations:** `eolOf` is now exported from `src/agents-md.js`, and `writeLegacyInstall` now records hashes of the LF form.
- **Success criteria:** `npm test` passes 201/201 on HEAD. All 28 targeted line-ending and back-compat tests pass.
- **Manual checks:** 1.5 and 2.4 were confirmed by the user during implementation.

Points checked and not raised as findings:
- **Edits that are now invisible:** a change that only touches line endings is no longer detected. This is the intended trade-off, and the README "Hard rules" section documents it (Phase 3).
- **CRLF in the published package:** a tarball can only carry CRLF bytes if it is packed on a Windows checkout. `publish.yml` runs `npm publish` on `ubuntu-latest`, so this cannot happen in CI.
- **Very large files:** `contentHash` copies the whole file as a string, so a file of about 512 MB or more would hit V8's maximum string length. Skill files are nowhere near that size, and read errors were already unhandled before this change.
- **Newlines inside config values:** `JSON.stringify` escapes `\n` inside string values, so converting the config's line endings cannot corrupt them.
- **Mixed-EOL configs:** a config with both line-ending styles is left alone when its content is unchanged. When its content changes, it is rewritten as pure CRLF, the same as `agents-md.js` does.
- **Other cases:** UTF-16, a `\r\n` pair split at the 8 KB boundary, and empty files all behave correctly. There is no import cycle.

## Findings

### F1 — Duplicated `toLf` / `toCrlf` test helpers

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: test/sync.test.js:176, test/update.test.js:312-313, test/check.test.js:88, test/remove.test.js:532, test/helpers.js:54
- **Detail**: The same latin1 conversion (`\r\n` → `\n`, and LF → CRLF) is written out in five places, in slightly different forms. Shared fixture code (`snapshot`, `tmpProject`, `readConfigJson`) already lives in `test/helpers.js`.
- **Fix**: Export `toLf` / `toCrlf` from `test/helpers.js` and import them in the four test files. Use `toLf` inside `writeLegacyInstall` too.
- **Decision**: FIXED — toLf / toCrlf exported from test/helpers.js and imported in sync, check, update and remove tests; writeLegacyInstall uses toLf

### F2 — `writeLegacyInstall` doc comment overstates "byte for byte"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: test/helpers.js:38-55
- **Detail**: The JSDoc says the fixture reproduces a v0.2.0 install "byte for byte". It now writes the checkout's raw bytes, which are CRLF on Windows, but records the hash of the LF form. On Windows it therefore simulates "a v0.2.0 install later converted to CRLF", not a pristine install. Tests still pass on both OSes, but the doc does not match what the fixture does.
- **Fix**: Write the LF bytes to disk as well, so the fixture is a pristine v0.2.0 install on every OS and the "byte for byte" claim holds.
- **Decision**: FIXED — writeLegacyInstall writes the LF bytes to disk as well, matching what v0.2.0 left on disk on every OS
