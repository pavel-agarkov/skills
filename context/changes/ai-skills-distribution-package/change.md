---
change_id: ai-skills-distribution-package
title: Public GitHub npm package for distributing AI skills by name or tag
status: implementing
created: 2026-10-29
updated: 2026-10-29
archived_at: null
---

## Notes

prepare a GitHub npm package
that is publicly available
packages all the skills into one package
if necessary move skills to a dedicated folder but we cannot call it `skills` since that's already a repo name
we need to provide to user a way to install:

- just a custom subset of skills
- just one skill
- a custom subset of tags linked to some skills (each skill should have a set of tags and user can install by selecting a subset of tags thus getting all skills that are marked with that tag)
- just one tag and all its skills

all those options should be possible by direct commands/flags passed for example to `npx` so we can have readmes for each skill showing how to instal that one or a group by one or multiple its tags

update should be performed for the selected subset by default so we should persist user configuration

we should have a dedicated command/flag for subset and other options reconfiguration

uninstall also should remove only those skills that we have in the user configuration

in the first version we should support only the standard .agents folder and AGENTS.md file
