# AI Skills Distribution Package — Plan Brief

> Full plan: `context/changes/ai-skills-distribution-package/plan.md`
> Frame brief: `context/changes/vercel-skills-research/frame.md`
> Research: `context/changes/vercel-skills-research/research.md`

## What & Why

Ship the repo's skills as one public npm package, `@pavel-agarkov/skills`, so anyone can run `npx` to install just the skills they want, by name or by tag, into the standard `.agents/` layout. The selection is remembered so update, reconfigure and uninstall act on exactly that subset.

This revision follows the Vercel `skills` CLI research. The problem to plan around is the smallest own installer that meets the lesson's installer requirements, given that Vercel's CLI covers only the basics and deletes whole skill directories. So the plan keeps our installer, makes the same skill folders readable by Vercel's CLI, and adopts the Vercel behaviors that are better.

## Starting Point

Two skills are tracked in git (`interview-trainer`, `aspnet-layered-service-scaffold`) at the repo root, with no tags, no `package.json`, no `AGENTS.md` and no CI. The ~37 course skills in `.claude/skills` are gitignored. A manifest-and-sentinel installer template in `.claude/config-templates` is prior art. Vercel's CLI (v1.7.4) finds our skills today only at the repo root; it overwrites on `add` and removes whole directories on `remove`.

## Desired End State

`npx @pavel-agarkov/skills install --skill x` or `--tag y` copies the matching skills into `.agents/skills/`, saves a deterministic `.agents/.pa-skills-config.json`, and `update`, `configure`, `uninstall` and `check` act only on that saved selection and the hashed files in its manifest. `npx skills add pavel-agarkov/skills --list` also lists the skills. A follow-up change for fuller Vercel support exists.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Own CLI vs Vercel's | Keep our CLI | Vercel has no tags, `configure` or AGENTS.md block and deletes consumer files inside skill folders. | Research |
| Plan home | Revise this plan in place | One plan stays the source of truth for `/10x-implement`. | Plan |
| Skills folder | `dist/skills/<name>/` plus root `skills.sh.json` | Vercel's npm route reads `dist/skills/` and its git route reads the declared path, with no build step. | Plan |
| Vercel strengths adopted now | Per-file SHA-256, deterministic config, `check`, `--dry-run` | They catch edited files and give CI an update gate without breaking the zero-dependency rule. | Plan |
| Modified installed files | Skipped on update, kept on uninstall, `--force` overwrites | Never overwrite what the consumer wrote. | Plan |
| `check` exit codes | 0 clean, 3 pending, 1 error, 2 usage | Keeps 1 for errors while still giving CI a gate. | Plan |
| Multi-agent targets, symlinks, global scope | Deferred to a follow-up change | Your v1 instruction is `.agents/` and `AGENTS.md` only. | Plan |
| Registry | npmjs.com, published from GitHub Actions with provenance | GitHub Packages forces a token on every consumer. | Plan |
| Tag storage | `tags:` in each `SKILL.md` frontmatter | Vercel's parser ignores unknown keys, so it is safe. | Research |
| `install` vs `configure` | `install` adds; `configure` replaces | README one-liners stay safe to repeat. | Plan |
| Collisions | Refuse unmanaged existing skill folders unless `--force` | Never overwrite consumer content. | Plan |

## Scope

**In scope:** skills layout and tags, `skills.sh.json`, the CLI with six commands, hashed manifest and deterministic config, the opt-in AGENTS.md block, tests, READMEs with a Vercel comparison, the publish workflow, and creating the `vercel-skills-support` change.

**Out of scope:** other agent layouts and `--target`, symlinks, global scope, wrapping Vercel's CLI, writing `skills-lock.json`, the course skills, GitHub Packages, a `postinstall` hook, partial uninstall flags.

## Architecture / Approach

A zero-dependency Node ESM CLI. Small modules load the catalog from `dist/skills/`, resolve names and tags to a skill set, sync files against a hashed manifest, and edit the `AGENTS.md` block between markers. The saved config stores intent (skills, tags, options) plus the installed-file manifest, so update re-expands tags and touches only files whose hash still matches what we installed.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Skills layout and tags | Skills in `dist/skills/`, tags, `skills.sh.json`, loader | A root `SKILL.md` or missing string `description` would break Vercel discovery |
| 2. Package scaffold | `package.json`, CLI dispatch and parser | Wrong `files` list in the tarball |
| 3. Install and config | Resolver, hashed sync, deterministic config, AGENTS.md block | Clobbering consumer files or text |
| 4. Lifecycle and check | update, configure, uninstall, `check` | Deleting something we did not install or that was edited |
| 5. Test hardening | Edge-case suite, Vercel discovery check | Windows path differences |
| 6. Docs and publishing | READMEs with comparison, publish workflow, badge evidence | npm scope and token setup outside the repo |
| 7. Follow-up change | `vercel-skills-support` change with seeded notes | Notes too thin to plan from later |

**Prerequisites:** an npm account with access to the `@pavel-agarkov` scope and an `NPM_TOKEN` repo secret.
**Estimated effort:** about 4 sessions across 7 phases.

## Open Risks & Assumptions

- A folder named `dist` normally means build output; the README must say it is source here, and nobody should add it to `.gitignore`.
- `npx` can serve a cached older version, so the READMEs recommend `@latest` for `update`.
- Vercel's behavior was read from its source at commit `92a9a34`, not run; Phase 5 includes one real `--list` run.
- Whether the course accepts a project that delegates to a third-party CLI is unverified, which is why the plan keeps an own installer.
- The npm scope `@pavel-agarkov` is assumed to exist or be creatable by the user.

## Success Criteria (Summary)

- Each of the four install modes works from a single `npx` command, and the same skills list through Vercel's CLI.
- `update`, `configure` and `uninstall` touch only the saved selection and leave consumer-authored and consumer-modified content byte-identical; `check` never writes.
- The package publishes publicly to npm from CI, with more than one released version for the course evidence.
