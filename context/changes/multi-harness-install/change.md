---
change_id: multi-harness-install
title: Install skills for Claude Code and two other main harnesses, plus custom paths
status: implementing
created: 2026-10-30
updated: 2026-10-30
archived_at: null
---

## Notes

claude cannot see skills in .agents/
we need to support multiple harnesses similar to vercel (see its research) but just 3 main would be enough + custom option to specify in cli relative path to skills folder and agents.md file
but for that to work we should move our config to root
all changes should be do the way that existing installation would be able to update without problems
