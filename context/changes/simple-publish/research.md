---
date: 2026-10-30T09:40:35+01:00
researcher: Pavel Agarkov
git_commit: dc23486059ee6bdfe98a45e4d73aa2e914dfbdb1
branch: claude/auto-publish-pr-merge-ede5c8
repository: pavel-agarkov/skills
topic: "Publish a new package version automatically when a PR is merged, with required release notes"
tags: [research, ci, github-actions, npm, trusted-publishing, release-notes]
status: partial
last_updated: 2026-10-30
last_updated_by: Pavel Agarkov
last_updated_note: "Follow-up: user decisions on Open Questions 1-4, plus a CLI command that shows the changelog since the installed version"
---

# Research: Auto-publish on PR merge with required release notes

**Date**: 2026-10-30T09:40:35+01:00
**Researcher**: Pavel Agarkov
**Git Commit**: dc23486059ee6bdfe98a45e4d73aa2e914dfbdb1
**Branch**: claude/auto-publish-pr-merge-ede5c8
**Repository**: pavel-agarkov/skills

## Research Question

From `change.md`: publish a new version of `@pavel-agarkov/skills` automatically when a PR is merged, with no manual commands. The only manual edit in the PR is the `version` in `package.json`, and release notes are required. Open questions:

- which trigger to use;
- what happens when a PR has no version bump;
- where the release notes live, and how a check enforces them before merge;
- whether to create a tag and a GitHub Release;
- how branch protection makes the check required.

External facts come from current npm and GitHub docs, read on 2026-10-30 by two research sub-agents. Their links are given inline. Nothing was run against the live repo settings or the npm package settings: `gh` is not installed in this environment.

## Summary

- **The trigger can change without touching npm settings, as long as the file stays `publish.yml`.** An npm Trusted Publisher binds the owner, the repository, the workflow *filename* and an optional environment. It has no trigger, branch or ref field ([npm trusted publishers](https://docs.npmjs.com/trusted-publishers)). Renaming the file or publishing from a second workflow needs a new Trusted Publisher entry, because existing entries cannot be edited.
- **Recommended trigger: `push: branches: [main]`.** It fires for each of the three merge methods (merge commit, squash, rebase). It runs with the base repo's permissions, so `id-token: write` is available even when the PR came from a fork. `pull_request: closed` + `merged == true` also works, but a fork PR gets a read-only token, so OIDC may fail there (an inference, not documented). The push trigger also fires on direct pushes to `main`. The user states `main` is already protected, but this was not verified here.
- **Release notes belong in a checked-in `CHANGELOG.md` section per version, not in the PR body.** A PR check can read the section from the PR's merged tree. The publish job then reads the same bytes from the merged commit, with no API call to find the PR. A body-based check would need `edited` in the trigger types, a PR lookup from a `push` event, and safe handling of untrusted body text. `CHANGELOG.md` is not packed into the npm tarball unless it is added to `files` (`package.json:9-14`).
- **A new PR-check workflow is needed. Today no workflow runs on pull requests.** The only workflow is `.github/workflows/publish.yml`, which fires on `v*` tags and `workflow_dispatch` (`publish.yml:3-7`). The required check must not use `paths` filters or job-level `if:` skips: a filtered-out workflow stays "Pending", and an `if:`-skipped job counts as success.
- **Tag and GitHub Release are cheap and safe to add.** They need `contents: write` on the publish job. A tag created with `GITHUB_TOKEN` does not start new workflow runs, so it cannot re-trigger publishing.
- **Existing tests pin the old trigger.** `test/docs.test.js:80-81` asserts `tags: - 'v*'` and `workflow_dispatch`, and the README "Publishing" section describes the tag flow (`README.md:125-127`). Both must change with the workflow.
- **Gaps:**
  - It is unknown whether the Trusted Publisher is configured, and whether it allows direct `npm publish`. npm lists only `0.0.0-stage` and `0.1.0`, `0.1.0` has no attestations, and plan tasks 7.3–7.6 are unchecked.
  - It is unknown which npm version the Node 24 runner bundles. Trusted publishing needs npm ≥ 11.5.1.
  - It is unknown whether the current branch protection already requires status checks and applies to admins.

## Detailed Findings

### Current workflow and tests

- The workflow triggers on `push: tags: ['v*']` and `workflow_dispatch` ([publish.yml:3-7](.github/workflows/publish.yml)).
- The `test` job runs a matrix of `ubuntu-latest`/`windows-latest` × Node `22`/`latest` and runs `npm test` ([publish.yml:10-22](.github/workflows/publish.yml)).
- The `publish` job has `needs: test` and the permissions `contents: read` and `id-token: write`. It uses Node 24 with `registry-url` set ([publish.yml:24-35](.github/workflows/publish.yml)). It then runs three steps:
  - a tag-matches-version guard, run only when `github.ref_type == 'tag'` ([publish.yml:36-43](.github/workflows/publish.yml));
  - an already-published guard via `npm view` ([publish.yml:44-50](.github/workflows/publish.yml));
  - `npm publish --provenance --access public` ([publish.yml:51-52](.github/workflows/publish.yml)).
- With a push-to-main trigger, the tag guard step is dead code. The `npm view` guard stays useful: it becomes the "is this a new version?" decision.
- `test/docs.test.js:71-86` statically checks the workflow:
  - required: `npm view`, the publish command, `id-token: write`, both OSes, `'22'`, the `v*` tag trigger (line 80), `workflow_dispatch` (line 81), `needs: test`, and the registry URL;
  - forbidden: tokens and `secrets.`.
- Lines 80-81 will fail after a trigger change. Line 76 forbids `secrets.` anywhere in `publish.yml`, so a `gh` step there would have to pass the token as `${{ github.token }}`, not `${{ secrets.GITHUB_TOKEN }}`.
- `package.json` `version` is `0.1.0` (`package.json:3`). `publishConfig` already sets `access: public` and `provenance: true` (`package.json:18-21`). `repository.url` is `git+https://github.com/pavel-agarkov/skills.git` (`package.json:22-25`). npm requires this to match the publishing repo exactly.
- No `CHANGELOG.md`, no PR workflow and no release tooling exist among the tracked files (`git ls-files` at `dc23486`).

### Observed repository and registry state (2026-10-30)

- **npm:** `npm view @pavel-agarkov/skills versions` returns exactly `0.0.0-stage` and `0.1.0`, both published on 2026-10-30 around 07:48–07:49Z. `dist.attestations` for `0.1.0` printed nothing. That fits the plan's "0.1.0 published once from a local machine" step (`context/changes/ai-skills-distribution-package/plan.md:438`), but this is an inference.
- **Remote:** `git ls-remote --tags origin` returns no tags. PRs #1 and #2 landed as merge commits (`6b6ca0a`, `060cee2` on `origin/main`), so the repo currently uses the merge-commit method.
- **Branch protection:** the user states `main` is protected. Which rules are on (required checks, "do not allow bypassing", required PRs) was not inspected.

### npm trusted publishing constraints

Source: [docs.npmjs.com/trusted-publishers](https://docs.npmjs.com/trusted-publishers), as reported by a sub-agent.

- **Bound fields:** owner, repository, workflow filename (filename only, e.g. `publish.yml`) and an optional environment. No event, branch or tag field is documented. So moving from tags to merge-to-main needs no npm change. This is an inference from the field list; the docs do not say so explicitly.
- **Editing:** existing connections cannot be changed. A rename means delete and re-create. The limit is 10 publishers per package.
- **Allowed actions:** newer configurations default to allowing only `npm stage publish`; direct `npm publish` is a separate opt-in. The doc cites cut-off dates (May 20 and Sep 03, 2026). The existence of `0.0.0-stage` suggests the stage flow was tried. **The user must confirm that the package's Trusted Publisher allows direct `npm publish`.** Otherwise the CI publish fails whatever the trigger.
- **A new configuration expires** if it has no successful publish within 2 days.
- **Requirements:** npm CLI ≥ 11.5.1, Node ≥ 22.14.0, GitHub-hosted runners only.
  - Which npm version setup-node's Node 24 provides was not verified.
  - Mitigation for the plan: print `npm -v`, or run `npm install -g npm@latest` before publishing.
- **Provenance** is generated automatically with trusted publishing for a public repo and public package. `--provenance` is redundant but harmless.
- **Prerelease versions** (e.g. `0.2.0-beta.1`) fail without `--tag` on npm 11+ (npm/cli `lib/commands/publish.js`, commit `16b73672`). So does publishing a version lower than the current `latest`. The workflow must either reject prerelease versions in the PR check or pass `--tag <preid>`.
- **There is no npm option to attach release notes** (`npm publish` options in the v11 docs).
- **Tarball contents:** always included are `package.json`, README, LICENSE/LICENCE, and the `main`/`bin` files. CHANGELOG is not force-included (npm-packlist `lib/index.js`).

### Trigger choice

Source: [events-that-trigger-workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), as reported by a sub-agent.

| | `push: branches: [main]` | `pull_request: types: [closed]` + `merged == true` |
| --- | --- | --- |
| Fires on | Every push to `main`: all merge methods, plus direct pushes | Only merged PRs |
| SHA / ref | Tip commit pushed / `refs/heads/main` | Merge commit on base / `refs/heads/main` |
| `id-token: write` for fork PRs | Available (base-repo context) | Read-only token for forks, so OIDC likely unavailable (inference) |
| PR number and body | Needs `GET /repos/{o}/{r}/commits/{sha}/pulls` | In `github.event.pull_request` |
| Docs caveat | — | The page also says the payload is "empty for merged pull requests and pull requests that come from forked repositories", which contradicts its own `merged` example. Unresolved. |

- With release notes in `CHANGELOG.md`, the push variant never needs the PR payload. That removes the push trigger's only disadvantage.
- The direct-push exposure depends on branch protection. Under classic protection, admins bypass rules unless "Do not allow bypassing the above settings" is enabled ([about-protected-branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)).
- `workflow_dispatch` can stay as a manual retry path for a failed publish. The `npm view` guard makes a rerun safe, because an already-published version fails it.
- **Concurrency:** use a fixed group such as `publish`, with `cancel-in-progress: false`. A sub-agent reports a newer `queue: max` option. Under the default `queue: single`, a pending run is cancelled when a newer one queues, and that would drop a merge's publish ([control-workflow-concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)). The `queue` option was not verified independently.

### PR check (version bump + release notes)

- **Name:** the required check is the job's check-run name, and it must have run once before it can be selected in the protection UI ([status-checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks)). Job names should be unique across workflows.
- **Pitfalls** ([troubleshooting-required-status-checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks)):
  - a workflow skipped by a `paths` or branch filter leaves the required check "Pending";
  - a job skipped by `if:` reports success;
  - a job skipped because its `needs` failed may not block the merge.
  - So the check should run unconditionally and `exit 1` on failure.
- **Version comparison:** `actions/checkout` fetches a single commit (the PR merge ref) by default. Fetch the base explicitly, then read the old version from it:

  ```sh
  git fetch --depth=1 origin "$BASE_REF"
  git show FETCH_HEAD:package.json
  ```

  Compare as semver and require a strictly greater version. Comparing against the npm `latest` version instead is also possible and is authoritative for "not yet published". The package is public on npmjs.com, so no token is needed.
- **Racing PRs:** two open PRs can bump to the same version. Strict "require branches to be up to date before merging" forces the second PR to rebase and re-run the check. The publish-time `npm view` guard stays as the backstop.
- **Release-notes check:** with a `CHANGELOG.md` convention, the check extracts the section whose heading matches the new version and fails if it is missing or empty. The heading format, e.g. `## 0.2.0`, is a plan decision. The same extraction gives the GitHub Release body at publish time.
- **If PR-body notes are chosen instead:**
  - `edited` must be added to the trigger types, because the defaults are `opened`, `synchronize` and `reopened`.
  - The body must be passed through `env:`, never interpolated into `run:`, to avoid script injection.
  - The notes would not be versioned in the repo.
- **No-bump PRs:** this is a product decision, see Open Questions. If the check passes without a bump, the publish job must skip quietly when `npm view` finds the version, instead of failing as it does today (`publish.yml:44-50`).

### Tag and GitHub Release

- `contents: write` allows creating a release and pushing a tag ([workflow-syntax permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)). Today the publish job has `contents: read` (`publish.yml:28`).
- "Events triggered by the `GITHUB_TOKEN` will not create a new workflow run" ([trigger-a-workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)). A `v<version>` tag created by the publish job therefore cannot re-run publishing. The `v*` tag trigger can be removed or kept; keeping it would let a manually pushed tag publish too.
- `gh` is on the Ubuntu 24.04 runner image (reported as 2.103.2). `gh release create v<ver> --notes-file <file> --target <sha>` creates both the tag and the release.
- **Unverified:** a sub-agent reports that the REST docs say `GITHUB_TOKEN` cannot create a release whose new tag targets a commit that changes `.github/workflows`. That would hit the very PR that introduces this change. Verify on the first run, or create that release by hand.
- Order: publish to npm first, then tag and release. A failed release then leaves a published version that can be tagged later. The reverse order would leave a tag with no package.

## Code References

- `.github/workflows/publish.yml:3-7` — current triggers (`v*` tag, `workflow_dispatch`)
- `.github/workflows/publish.yml:10-22` — test matrix
- `.github/workflows/publish.yml:27-29` — permissions (`contents: read`, `id-token: write`)
- `.github/workflows/publish.yml:36-43` — tag/version guard (tag runs only)
- `.github/workflows/publish.yml:44-50` — already-published guard (fails today; a skip candidate)
- `.github/workflows/publish.yml:51-52` — `npm publish --provenance --access public`
- `test/docs.test.js:71-86` — static workflow assertions; lines 80-81 pin the old trigger, line 76 forbids `secrets.`
- `package.json:3` — `version: 0.1.0`
- `package.json:9-14` — `files` allowlist (no CHANGELOG)
- `README.md:125-127` — "Publishing" section describing the tag flow

## Architecture Insights

- The repo's guard style is a shell step per invariant with a clear `exit 1` message (`publish.yml:36-50`), plus a static test that greps the workflow (`test/docs.test.js:71-86`). New checks fit the same pattern, and a script under `scripts/` or inline Node keeps the zero-dependency rule.
- The CLAUDE.md hard rules "Publish only a new version" and "Tokens stay in CI secrets or local env" are already enforced by the `npm view` guard and the no-secret test. Trusted publishing plus `GITHUB_TOKEN` keeps the new design token-free.

## Historical Context (from prior changes)

- `context/changes/ai-skills-distribution-package/plan.md:421-441` defines the publish workflow contract: tag or manual dispatch, Trusted Publisher bound to `publish.yml`, the `npm view` guard, no token. It also lists manual steps 7.3–7.6, including publishing `0.1.0` locally and configuring the Trusted Publisher.
  - Verdict on "0.1.0 published": supported (npm lists it).
  - Verdict on "Trusted Publisher configured": unverified.
  - Verdict on "a second version (0.1.1) published": not yet. npm lists no `0.1.1`, and `plan.md:600` is unchecked.
- `context/changes/ai-skills-distribution-package/plan-brief.md:32` chose npmjs.com over GitHub Packages because GitHub Packages forces a token on consumers. This is unaffected by this change.
- `change.md` "Current state" bullets:
  - The trigger, guards and test matrix are supported (`publish.yml:3-52`).
  - "Trusted Publisher is bound to this repository and the `publish.yml` file name" is supported as the documented design, but the live configuration is unverified.
  - "No release-notes file or convention" is supported (no `CHANGELOG.md` among the tracked files; no remote tags).
  - "README documents the tag-based flow" is supported (`README.md:127`).

## Related Research

- `context/changes/vercel-skills-research/research.md` — unrelated topic (Vercel CLI behaviour); not applicable.

## Open Questions

Product decisions for `/10x-plan`:

1. **PR without a version bump** (docs-only, CI-only changes). Two options:
   - (a) The check fails, so every PR must bump the version and add notes. This is the simplest reading of "PR should have a committed version". But each merge then publishes, even for changes outside the package, such as `context/` or tests.
   - (b) The check passes only when nothing inside the package's `files` changed, and publish skips quietly. This needs a changed-files comparison, and the skip must not hide a missing bump for a package change.
2. **Release-notes location:** a `CHANGELOG.md` section (recommended above) or the PR body. Also: should `CHANGELOG.md` ship in the tarball (add it to `files`)?
3. **Tag and GitHub Release:** create both from the publish job (recommended), or neither. Also: keep or drop the `v*` tag trigger and the dead tag guard.
4. **Prerelease versions:** reject them in the check, or map them to `--tag <preid>`.

Facts to confirm outside the repo (user actions):

5. The Trusted Publisher on npmjs.com exists for `pavel-agarkov/skills` + `publish.yml` and allows direct `npm publish`, not stage-only.
6. Branch protection for `main`:
   - "Require status checks to pass" includes the new check job, ideally with "require branches to be up to date";
   - "Do not allow bypassing" (or a ruleset without an admin bypass) blocks direct pushes, if the push trigger is used.
7. The npm version on the publish runner is ≥ 11.5.1.

## Follow-up 2026-10-30: decisions and a changelog command

### User decisions

These settle Open Questions 1–4 above.

1. **Unchanged version:** do not publish. The PR check still runs all tests and is a required check.
   - This supersedes option (a) in Open Question 1. There is no changed-files comparison.
2. **Release notes:**
   - shipped in the package;
   - a new CLI command shows the changes since the version recorded in the project config;
   - when there is no config, it says nothing is installed yet, so there are no changes;
   - when the recorded version equals the running version, it says the user already has this version, so there are no changes.
   - The user suggested a JSON master file, with `CHANGELOG.md` generated from it during publish. This is evaluated below.
3. **Tag trigger:** drop the `v*` trigger. The tag-guard step goes away with it (`publish.yml:4-6`, `publish.yml:36-43`).
4. **Prereleases:** none. The PR check should reject versions that are not plain `x.y.z`. This also removes the npm 11 `--tag` requirement for prereleases.

### What the CLI already records

- The config already stores the version the CLI ran with: `packageVersion` is a required string field (`src/config.js:36`).
- Each real `add`, `update` and partial `remove` writes it (`src/lifecycle.js:36-45`). The value comes from the running package's `package.json` (`bin/cli.js:96`).
- So after `npx @pavel-agarkov/skills@latest update`, the config holds the new version. The new command must therefore be run *before* `update` to show what an update brings. After `update`, it reports "same version".
  - This is a UX point for the plan. One option: `update` prints the changes itself, using the config's version from before the write (`src/commands/update.js:20`).
- `writeConfig` skips the write only when the bytes are identical (`src/config.js:89-91`). A run that changes nothing but the package version still rewrites the config with the new `packageVersion`.
- `check` does not count a version-only difference as pending (`src/lifecycle.js:50-53`), so `check` still prints "Up to date." in that case.
- No config exists when there was never an `add`, or after a full `remove`, which deletes the file (`src/commands/remove.js:58-60`). `readConfig` returns `null` when the file is missing (`src/config.js:62-64`). That is the "nothing installed yet" branch.
  - `update`/`check` throw an error in that case (`src/commands/update.js:21`). The new command should print the message and exit 0 instead.
- A corrupt config throws from `readConfig` (`src/config.js:66-71`). The new command inherits that error. That is consistent with the other commands, but it is not a "no changes" case.

### Comparing the recorded and running versions

The running version means the running package's `package.json` `version`.

| Recorded `packageVersion` vs running | Output |
| --- | --- |
| no config | "nothing installed yet": predefined text |
| equal | "already on this version": predefined text |
| recorded < running | changelog entries with `recorded < v ≤ running`, newest first |
| recorded > running | not covered by the user's text. This happens when `npx` serves a cached older package (`README.md:77`). Suggested: say the running CLI is older and point to `@latest`. Product decision. |
| recorded not a plain `x.y.z` (e.g. `0.0.0-stage`, which exists on npm) | not covered. Suggested: treat it as older than every entry. Product decision. |

- Without prereleases, a zero-dependency comparison of three integers is enough. It keeps the "zero runtime dependencies" rule (`package.json` has no `dependencies`).

### JSON master vs `CHANGELOG.md` only

Recommendation: a JSON master read by the CLI, plus a generated `CHANGELOG.md`. Comparison:

| Concern | `changelog.json` (master) + generated `CHANGELOG.md` | `CHANGELOG.md` only |
| --- | --- | --- |
| CLI reads it | `JSON.parse`, the same pattern as `package.json` (`bin/cli.js:76`) | Needs a heading/section parser in `src/`, sensitive to formatting |
| PR check "notes exist for the new version" | Structural: an entry with `version === package.json version` and a non-empty list | Regex on headings, the same fragility |
| Validation in `npm test` | Easy: unique versions, newest first, top entry ≤ package version, plain `x.y.z` only | Possible, but via text parsing |
| GitHub Release body | Rendered from one entry | Section extracted from the file |
| Human readability on GitHub | Only via the generated MD | Native |

- `package.json` `files` must list both shipped files (`package.json:9-14`). npm does not force-include either one (see "npm trusted publishing constraints" above).
- **Generate at publish time or commit the MD?** This is a plan decision.
  - Generating only in the publish job ships the MD in the tarball, but the repo never shows it. `CHANGELOG.md` would then need to be in `.gitignore`.
  - Generating in the PR, with a test that the committed MD matches the JSON, shows it on GitHub and keeps the tarball equal to the commit.
  - Either way, the generator lives in the repo and is tested. With the second option, the publish job does not modify the tree before `npm publish`.
- **Seeding:** `0.1.0` is already published and has no notes. The first `changelog.json` needs a `0.1.0` entry, or the check must allow history to start at the first bumped version. Plan decision.
- **Release dates:** the release date is unknown when the PR is written. Leave dates out of the JSON, or let the publish job add them to the generated MD or the GitHub Release only.

### PR check shape after the decisions

- **Same PR check for every PR:** run the full test matrix (`publish.yml:10-22` today), plus a changelog/version check:
  - version unchanged against the base → pass;
  - version changed → it must be a plain `x.y.z`, strictly greater than the base version, with a non-empty changelog entry for it.
  - Lowering the version, or bumping it without an entry, fails.
  - Open: should an unchanged-version PR be allowed to edit existing entries?
- **Required-check naming:** each matrix leg is its own check run, e.g. `test (ubuntu-latest, 22)`. Branch protection would need every leg listed. A common pattern is one aggregate job: `needs: [test, changelog]` with `if: always()`, failing unless every needed job succeeded. That gives one stable name to require. This applies the GitHub required-check guidance quoted in "PR check" above, not a separately sourced rule.
- **Publish on push to `main`:**
  - the `npm view` guard changes from fail (`publish.yml:44-50`) to "skip the remaining steps" when the version exists;
  - then `npm publish`;
  - then tag and GitHub Release from the changelog entry.
- **One workflow file or two:** a single `publish.yml` with `on: [pull_request, push: main]` and `if: github.event_name == 'push'` on the publish job keeps the Trusted Publisher binding untouched and the tests in one place. A separate `ci.yml` for PRs also works, because only the file that runs `npm publish` must be named `publish.yml`. Plan decision.
- **Tests that change:**
  - `test/docs.test.js:80-81` (trigger assertions);
  - the `COMMANDS` list (`src/args.js:1`) and `HELP` (`bin/cli.js:16-49`) gain the new command;
  - `test/docs.test.js:28-41` parses every README `npx` example with `parseArgs`, so a README example of the new command must parse.

### Open Questions (updated)

Superseded: Open Questions 1–4 above (decided). Still open:

- Command name: e.g. `changes` or `changelog`. Should `update` also print the changes?
- Behaviour when the recorded version is newer than the running one, or is not plain `x.y.z`.
- `CHANGELOG.md`: committed with a drift test, or generated only at publish time.
- Whether to seed a `0.1.0` entry, and whether release dates are recorded.
- One workflow file or a separate PR workflow; the aggregate required-check job name.
- The external confirmations in Open Questions 5–7 above are unchanged.
