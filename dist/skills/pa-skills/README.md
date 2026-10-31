# pa-skills

Lets an agent run this package's CLI for you (`add`, `remove`, `update`, `check`, `changes`, `list`): it previews every write with `--dry-run` and asks before running it.

Install this skill into a project:

```sh
npx @pavel-agarkov/skills add --skill pa-skills
```

Install it together with every skill that shares one of its tags:

```sh
npx @pavel-agarkov/skills add --tag cli
npx @pavel-agarkov/skills add --tag cli,learning
```

Remove it again with `npx @pavel-agarkov/skills remove --skill pa-skills`. See the package README for all commands.
