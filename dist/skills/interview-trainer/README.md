# interview-trainer

Install this skill into a project's `.agents/skills/` folder:

```sh
npx @pavel-agarkov/skills add --skill interview-trainer
```

Install it together with every skill that shares one of its tags:

```sh
npx @pavel-agarkov/skills add --tag learning
npx @pavel-agarkov/skills add --tag interview
npx @pavel-agarkov/skills add --tag learning,interview
```

Remove it again with `npx @pavel-agarkov/skills remove --skill interview-trainer`. See the package README for all commands.

## Reusable question preparation

Run `/interview-trainer prepare` to build or top up a private, reusable pool of source-verified questions without starting a session. The default target is 25 usable questions; a clear requested count from 1 to 99 can be supplied in natural language. The target is independent of session length. Consent-based preparation happens before the first quiz question, so a cold start may take longer while sources and questions are checked; it does not guarantee that every future session need will be covered.

When starting a session, the trainer automatically uses compatible questions already in the pool. If none can serve the current training need, it asks whether to prepare a pool first or start on demand. Choosing on-demand opts out of preparation for that start and follows the existing per-question workflow. If preparation is chosen, the trainer separately asks for a pool target, defaulting to 25.

Unused compatible questions persist across sessions, including after completion or abandonment. Presented questions remain retired to prevent exact repeats. Pool records are private workspace state; preparation documentation does not include their question, answer, source-support notes, or rubric content. A warm pool can reduce research and construction between covered questions, while gaps or mandatory source updates may still require targeted work.
