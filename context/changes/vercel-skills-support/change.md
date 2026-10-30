---
change_id: vercel-skills-support
title: Vercel skills CLI support for our skills package
status: new
created: 2026-10-30
updated: 2026-10-30
archived_at: null
---

## Notes

Follow-up to `ai-skills-distribution-package`. That plan shipped a standalone installer and deliberately deferred the Vercel-related work. This change collects the deferred items so they are planned on purpose and do not creep into the first change.

### Current state (what exists today)

- Our CLI is `add | remove | update | check | list`. The command names intentionally mirror Vercel's `skills` CLI.
- The saved selection and the manifest of installed files live in `.agents/.pa-skills-config.json`.
- The package is published as `@pavel-agarkov/skills` on npmjs.com.
- The skills are plain folders in `dist/skills/`, declared to Vercel through a root `skills.sh.json`.
- v1 writes to `.agents/` and `AGENTS.md` only. There is no `--target` flag.
- Compared against Vercel `skills` v1.7.4 (see the decision record in the plan). Our hard rules stay: never overwrite consumer files, uninstall removes exactly what install added.

### Items to decide or build

1. **Multi-agent targets and profiles.** Add a `--target` flag over per-agent skill directories. The lesson's tool profiles are the model: one profile per tool says where skills and the rules file go (`shared-ai-registry-skills-commands-and-rules-for-your-team.md` in the repo root, the "tool profile" section). The `SKILL.md` format is neutral, so only the destination directory differs.
2. **Symlink to a canonical copy.** Keep one canonical copy and link the other agent directories to it. Fall back to a plain copy when linking fails. Define the Windows behavior: Vercel uses a junction with an absolute target and falls back to copy. The manifest must still track exactly what we created, including links.
3. **Verify `npx skills experimental_sync -y` against the published package.** The `dist/skills/` layout is already compatible with its discovery. This has only been read in the source, never run. The command is experimental, so its stability is unknown.
4. **`skills-lock.json`.** Decide whether we write it, interoperate with it, or ignore it. The plan currently says we do not write it.
5. **Global scope.** Vercel supports `-g`. We have none. Decide if we need it and what it does to the manifest.
6. **`check` and Vercel's lock.** Decide whether `check` should accept Vercel's `skills-lock.json` as input.
7. **Re-verify Vercel behavior since v1.7.4.** The comparison was made from source at v1.7.4 (commit `92a9a34`) and nothing was executed. Re-read and, where possible, run `add`, `remove` and `update` against a scratch project.

### Upstream issues to watch

These were open when the research was done. Comments and fixes were not read.

- **#1906**: no conflict prompt when a same-name skill is overwritten.
- **#455**: request for a preserve-local mode on `update`.
- **#2469**: `remove` without `-g` in the home directory deletes global installs without cleaning the global lock (remove scope).

If these get fixed upstream, the gap that justifies our own installer shrinks. Re-check them before planning.

### Links

- Plan of the first change: `context/changes/ai-skills-distribution-package/plan.md`
- Framing of the comparison: `context/changes/vercel-skills-research/frame.md`
- Source-level research on Vercel's CLI: `context/changes/vercel-skills-research/research.md`

### Suggested next step

`/10x-research vercel-skills-support`
