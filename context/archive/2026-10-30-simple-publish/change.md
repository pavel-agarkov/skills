---
change_id: simple-publish
title: Publish a new package version automatically when a PR is merged, with required release notes
status: archived
created: 2026-10-30
updated: 2026-10-30
archived_at: 2026-10-30T12:34:57Z
---

## Notes

we need a way to automatically publish a new version when PR is merged without any manual commands or edits - PR should have a committed version in the `package.json` only
we also need a release notes to be required

### Current state (what exists today)

- `.github/workflows/publish.yml` runs on a pushed `v*` tag or a manual `workflow_dispatch`. Publishing today needs a manual step: push a tag or run the workflow.
- The workflow runs `npm test` on Ubuntu and Windows (Node 22 and latest), checks that the tag matches `package.json` `version`, refuses a version that is already on npm, then runs `npm publish --provenance --access public`.
- Publishing uses npm trusted publishing (GitHub OIDC). The npm Trusted Publisher is bound to this repository and the `publish.yml` file name, so renaming the workflow file means updating the npm package settings.
- There is no release-notes file or convention yet (no `CHANGELOG.md`, no GitHub Releases).
- `README.md` "Publishing" section documents the tag-based flow.

### Open questions for research

- Trigger: `push` to `main` (merge commit) vs `pull_request: closed` with `merged == true`. The `push` trigger also covers direct pushes to `main`.
- When the merged PR did not bump the version (docs-only change), should the workflow skip publishing quietly or fail?
- Where release notes live: a `CHANGELOG.md` section per version, a file per version, or the PR body. They must be checked in the PR (a required check) before merge, not only after.
- Whether the workflow should also create the `v<version>` git tag and a GitHub Release from the notes.
- Branch protection: the PR check must be required so a missing bump or missing notes blocks the merge.

### Suggested next step

`/10x-research simple-publish`
