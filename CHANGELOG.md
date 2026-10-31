# Changelog

## 0.4.0

- New `pa-skills` skill (tag `cli`) lets your agent run this CLI for you: `npx @pavel-agarkov/skills add --skill pa-skills`. It previews every write with `--dry-run` and asks before running it.
- Line endings no longer count as a modification: CRLF copies of installed files (Windows `core.autocrlf`, `text=auto`, `eol=crlf`) are no longer reported as modified, so `update`, `remove` and `check` work on Windows checkouts. Files with a NUL byte are still compared as raw bytes.
- `.pa-skills.json` is no longer rewritten on an unchanged run when it is checked out with CRLF; a real change keeps the file's line endings.
- Consumer `.gitattributes` `eol=lf` rules for the skill folders are no longer needed and can be removed.

## 0.3.0

- Claude Code support: `--agent claude-code` installs skills to `.claude/skills/`, `--agent universal` to `.agents/skills/` (as before), and `--agent claude-code,universal` to both. Without `--agent`, a new install detects the agent from `.claude/` / `CLAUDE.md` and `.agents/` / `AGENTS.md`.
- The config moves from `.agents/.pa-skills-config.json` to `.pa-skills.json` at the project root. The next `update` moves it automatically and changes no skill file; commit the new file and the deletion.
- If the project also has `.claude/` or a root `CLAUDE.md`, `update` and `check` fail once with an error that both are present, and change nothing. Run `npx @pavel-agarkov/skills@latest add --agent universal` to keep `.agents/skills/` only, or `npx @pavel-agarkov/skills@latest add --agent claude-code,universal` to also install for Claude Code. `add --agent claude-code` alone would delete the unmodified `.agents/skills/` copies.
- With `--agents-md`, the Claude Code skills index goes into the root `CLAUDE.md` when that file exists, otherwise into `AGENTS.md`. `CLAUDE.md` is never created.
- New `remove --agent claude-code` / `remove --agent universal` drops one agent and deletes its unmodified copies.
- 0.2.x cannot read `.pa-skills.json`.

## 0.2.0

- New `changes` command shows the release notes between the version recorded in your config and the running version.
- After a real update, `update` prints the release notes between your previous version and the new one.
- The package now ships `changelog.json` and `CHANGELOG.md` with the release notes.

## 0.1.0

- Initial release.
