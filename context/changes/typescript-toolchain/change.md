---
change_id: typescript-toolchain
title: Author the CLI in TypeScript and ship compiled JavaScript
status: planned
created: 2026-11-06
updated: 2026-11-06
archived_at: null
---

## Notes

Split out of `storage-access` (decided 2026-11-06); lands before it.

- Set up a TypeScript build (devDependency only; no runtime dependencies) and port `bin/`, `src/`, `scripts/` (~1,600 lines) to TS with unchanged CLI behaviour and all tests green.
- Ship compiled JS: Node refuses type stripping under `node_modules`, and `npx` runs the CLI from there. Keep `engines` at `>=22`.
- Add the build to CI and publish; point `package.json` `files` at the output.
- Design the toolchain so `storage-access` can reuse it for skill scripts: TS sources outside `dist/skills/`, compiled `.mjs` committed under `dist/skills/<skill>/scripts/` (the `npx skills` route installs from git), CI check that committed output matches a fresh build.
- Evidence and Node version history: `context/changes/storage-access/research.md` ("Follow-up 2026-11-06").
