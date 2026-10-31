---
change_id: hash-line-endings
title: Make installed-file hashes immune to CRLF/LF line-ending conversion
status: impl_reviewed
created: 2026-10-30
updated: 2026-10-31
archived_at: null
---

## Notes

make @pavel-agarkov/skills hashes immune to line-ending conversion

You are working in the `pavel-agarkov/skills` repository (the `@pavel-agarkov/skills` npm CLI, currently 0.3.0). Fix the problem below, add tests and ship it as a patch release following the README's "Publishing" section (bump `package.json`, add a `changelog.json` entry, run `npm run changelog`).

### Problem

The CLI records a SHA-256 for every installed file in `.pa-skills.json` (`installed.files[].sha256`) and treats any file whose current hash differs as "modified by you": `update` and `remove` skip it with a warning, and only `--force` overwrites it.

The packaged skill files use LF. When a consumer commits the installed files and the repo is checked out on Windows with `core.autocrlf=true` (Git for Windows' default), or with a `* text=auto` / `eol=crlf` rule, Git writes them to disk with CRLF. The bytes on disk no longer match the recorded hash, so every installed file looks user-modified, even though the user changed nothing. Result: `update` silently stops updating skills on Windows checkouts, and `check` gives misleading results.

Today the only workaround is for consumers to add their own `.gitattributes` rules, for example:

```
.agents/** text eol=lf
.claude/skills/** text eol=lf
```

A consumer repo had to do exactly this by hand. Nothing in the README tells them to, and anyone who misses it gets the silent failure above.

Not yet verified: a repro (converting an installed `SKILL.md` to CRLF, then running `check` / `update --dry-run`) was planned but not run. Start by reproducing it in a test and confirm that the current code reports the file as modified. If it doesn't, stop and report back before changing anything.

### Proposed fix

1. **Hash line-ending-normalized content (main fix).** Before hashing, for both the recorded hash and the on-disk comparison, normalize text content by converting `\r\n` to `\n` (and optionally a lone `\r` to `\n`). A file then counts as modified only when its content changes, not when its line endings change.
   - Treat files that contain a NUL byte in the first 8 KB as binary and hash them as raw bytes.
   - Keep the recorded hash format unchanged so existing `.pa-skills.json` files remain valid: the packaged files are LF, so their normalized hash equals today's raw hash. Add a test that proves this for the current catalog.
   - When the CLI writes or refreshes a file, keep writing the packaged bytes (LF). Don't try to match the consumer's line-ending style.
2. **Document it.** In the README "Hard rules" list, state that line-ending differences (CRLF/LF) are not counted as modifications. Remove any need for consumer `.gitattributes` rules, or mention them only as optional.
3. **`.pa-skills.json` itself.** The README promises the config is deterministic and byte-identical on re-run. On a CRLF checkout, the CLI rewrites it with LF. Make sure an unchanged run either detects "content unchanged, ignoring line endings" and skips the write, or preserves the existing file's line-ending style. Either way, an unchanged `add` / `update` must not touch the file.

Considered and not recommended as the primary fix: having the CLI write or maintain a `.gitattributes` block, similar to the `AGENTS.md` markers. It only helps Git users, adds another file the CLI owns, and does nothing for files that are already checked out with CRLF. At most, offer it as an opt-in flag later.

### Tests to add (run on both the Linux and Windows CI jobs)

- An installed file converted to CRLF: `check` exits 0, `update` reports nothing changed and doesn't skip the file.
- An installed file converted to CRLF and given a real content edit: still detected as modified and skipped without `--force`.
- `update` refreshing a CRLF copy of an outdated file: the file is updated (it is not considered user-modified).
- A binary file with `\r\n` byte sequences: hashed raw, and still detected as modified if its bytes change.
- Back-compat: a `.pa-skills.json` written by 0.3.0 for an LF install passes `check` unchanged.
- `.pa-skills.json` with CRLF endings and an unchanged `update`: the file is not rewritten.

### Done when

- All the tests above pass on Linux and Windows in CI.
- The README "Hard rules" section documents the line-ending behaviour.
- The version is bumped and the changelog entry describes the fix.
- A consumer repo can drop its `.gitattributes` `eol=lf` rules and still get a clean `check` on a Windows checkout with `core.autocrlf=true`.
