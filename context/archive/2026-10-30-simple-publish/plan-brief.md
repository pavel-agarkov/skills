# Auto-publish on PR merge with required release notes — Plan Brief

> Full plan: `context/changes/simple-publish/plan.md`
> Research: `context/changes/simple-publish/research.md`

## What & Why

Publishing `@pavel-agarkov/skills` today needs a manual tag push or workflow run. This change makes a merged PR publish on its own whenever it bumped `package.json` `version`. Release notes become mandatory and ship in the package, so users can see what an update brings.

## Starting Point

`.github/workflows/publish.yml` runs on `v*` tags or manual dispatch, tests on Linux and Windows, and fails when the version is already on npm. It then publishes through npm trusted publishing, which is bound to the file name `publish.yml`. No workflow runs on PRs, and there are no release notes. The CLI already records the package version in the project config (`packageVersion`).

## Desired End State

A PR author bumps `version`, adds a `changelog.json` entry and runs `npm run changelog`. A required `ci` check enforces this. Merging to `main` then:

- publishes the new version;
- creates the `v<version>` tag and a GitHub Release with that version's notes.

A merge with an unchanged version publishes nothing. `npx @pavel-agarkov/skills changes` shows the notes since the installed version, and `update` prints them after updating.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Trigger | `push` to `main` (+ `workflow_dispatch` retry) | Covers every merge method and keeps OIDC available. | Research |
| Unchanged version | Do not publish; the PR check still runs all tests | Docs- and CI-only PRs stay possible. | Research |
| Tag trigger | Dropped, together with its guard | The workflow now creates the tag itself. | Research |
| Prereleases | Rejected; plain `x.y.z` only | Avoids the npm 11 `--tag` requirement. | Research |
| Notes format | `changelog.json` master, shipped; committed `CHANGELOG.md` kept in sync by a drift test | The CLI reads JSON, GitHub shows Markdown, and the tarball equals the commit. | Plan |
| Seed / dates | Seed `0.1.0` ("Initial release."); no dates | Validation stays uniform; the Release carries the date. | Plan |
| Command | `skills changes`; `update` also prints the range on a real run | Users see the notes when it matters, using the version from before the write. | Plan |
| Edge versions | Recorded newer → hint to use `@latest`; non-plain → treated as oldest | An informational command never errors on harmless states. | Plan |
| Workflows | New `ci.yml` for PRs with an aggregate `ci` job; `publish.yml` for releases | Clear separation; one stable check name to require. | Plan |
| Editing old notes | Allowed, as long as the structure stays valid | Typos are fixable without base-vs-head diff logic. | Plan |

## Scope

**In scope:**
- `changelog.json`, `src/changelog.js`, `scripts/changelog.js`, the committed `CHANGELOG.md`, and both files in `files`
- the `changes` command, `update` printing the notes, HELP and README
- `ci.yml` (test matrix, `release-check`, aggregate `ci`) and the reworked `publish.yml` (skip if already published, npm ≥ 11.5.1, publish, tag and Release)
- updated docs tests; `0.2.0` released through the new path

**Out of scope:** prereleases and dist-tags, release dates, freezing published notes, path filters and changed-files detection, PR-body notes, Trusted Publisher changes, change output in `check` or `--dry-run`.

## Architecture / Approach

`src/changelog.js` is the shared core: validate, compare, select a range, render. Four places use it:

- the CLI (`changes`, `update`);
- the generator (writes `CHANGELOG.md`, or prints one version's notes);
- `scripts/release-check.js`, which compares the PR's version with the base branch;
- the tests.

On a PR, `ci.yml` runs the tests and `release-check`, and the aggregate `ci` job reports one result. On push to `main`, `publish.yml` tests, checks `npm view`, then either skips or runs `npm publish` followed by `gh release create v<version>`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Changelog data and tooling | Master JSON, helpers, generator, `CHANGELOG.md`, validation and drift tests | Validation rules too strict or too loose |
| 2. `changes` command + update prints | User-facing release notes, in every version case | Output noise in `update` |
| 3. CI and publish workflows | `ci.yml` with a required `ci` check; auto-publish, tag and Release | YAML only provable on GitHub |
| 4. First release and repo settings | `0.2.0` published through the new path; protection turned on | Trusted Publisher stage-only, or a first-run tag refusal |

**Prerequisites:** access to the npm package settings and the GitHub branch protection settings.
**Estimated effort:** about 2–3 sessions across 4 phases. Phase 4 is mostly manual verification.

## Open Risks & Assumptions

- The Trusted Publisher may be missing, or may allow only `npm stage publish`. Then the CI publish fails whatever the trigger, so this must be confirmed in Phase 4.
- `GITHUB_TOKEN` may refuse to tag the `0.2.0` merge because it changes `.github/workflows` (unverified). Fallback: create the tag and Release by hand from `scripts/changelog.js notes 0.2.0`.
- The npm version bundled with the runner's Node 24 is unknown. The workflow upgrades npm before publishing.
- If branch protection allows a bypass, a direct push to `main` with a bumped version publishes without `ci`.

## Success Criteria (Summary)

- Merging a PR that bumps the version publishes it to npm with provenance and creates `v<version>` and a Release. No manual step is needed.
- A PR without a valid bump-plus-notes pair, or with a lowered or prerelease version, cannot merge.
- Users run `changes` or `update` and see exactly the notes between their recorded version and the running one.
