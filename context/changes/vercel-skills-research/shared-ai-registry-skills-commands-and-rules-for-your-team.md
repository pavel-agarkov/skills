---
title: "Shared AI Registry: Skills, Commands, and Rules for Your Team"
course: "10xdevs-4"
language: "en"
source: "Przeprogramowani.pl"
exported: "2026-10-29"
format: "markdown"
---

![Image 1](https://images.przeprogramowani.pl/lessons/m5-l4/assets/cover.jpg)

You’ve completed five weeks of the course. Over that time, you’ve built a whole toolkit for working with AI: skills that handle recurring tasks, prompts tailored to your stack, rules that keep the Agent in check, and your own ways of guiding it through larger changes. These are no longer isolated interactions with AI. This is your workflow.

If all of this works for you, how do you bring it to the rest of the team?

In module four, we established that when working with AI, maintenance and synchronization are bigger problems than copying things over. This is most apparent in a multi-repo setup, where each project lives in isolation. After a month, nobody knows which version of a skill is the current one.

We need a single source of truth for how we work with AI, along with a distribution mechanism suited to your environment. There are three ways to build such a mechanism, and we’ll cover each of them in this lesson.

All three rest on the same premise: AI artifacts are code.

## AI artifacts are code

We sometimes treat skills, rules, and commands like notes: something you keep in a notebook, paste into Slack, or put on the company wiki.

But they control how the Agent writes code and conducts reviews in your project. They are instructions executed with every change.

An outdated or inconsistent version of an artifact introduces an error into the system that may go unnoticed. That’s why AI artifacts need the same things as any other code: versioning, change control, and controlled distribution.

Let’s go back to the world before **npm**, **pip**, or **maven**. Back then, libraries were copied manually, file by file, between projects. That worked as long as there was only one project. Today, that’s exactly where we are with AI artifacts: we copy them between repos and pretend it works.

Package registries such as npm, PyPI, and Maven Central solved this years ago: someone publishes a versioned package, you declare a dependency, and the package manager handles all the tedious work. You know this from your day-to-day work as a package user. This time, you’ll be on the publisher’s side.

Two properties matter to us here, and they’re easy to overlook in this familiar mechanism. The first is access control: a package can be public or private, available only to your organization. The second is a single source of truth with a complete version history and control over who downloads what—exactly what the copy-and-paste approach was missing.

The registry doesn’t care what’s in the package: an **index.js** script or a **SKILL.md** file with instructions for the Agent. To the registry, they’re simply versioned files. Since AI artifacts are files, and we want to share, version, and update them, we can use proven package infrastructure to do it.

You can take advantage of this whether or not you work in JavaScript. We demonstrate the mechanism using npm because that’s the stack our toolkit uses, but every ecosystem has its own registry, whether it’s PyPI, Maven, or Cargo. And the artifact itself, such as **SKILL.md**, is just a plain text file in an open standard, independent of any language or tool.

## What AI artifact distribution needs

Before we look at the solutions, let’s establish what such a mechanism must provide:

- **A single source of truth** — one place the artifact comes from. Without it, six months from now, three versions of a skill will be circulating, and nobody will know which one is current.

- **Versioning** — every change has a semantic version number. Without it, you don’t know whether the version in the repo you’re currently working on is up to date, what has changed along the way, or how much work an update will involve.

- **Authentication** — control over who can read and who can publish. Without it, either everything is public or nobody has access.

- **Installation, updates, and uninstallation** — you can install, update, and remove an artifact without leaving unnecessary files behind. Without controlled uninstallation, after a year your repo contains remnants of five versions of a skill.

- **Multi-tool delivery** — the same artifact reaches Claude Code, Cursor, or Codex. Without it, each tool on the team gets its own copy, which gradually diverges from the others.

We’ll evaluate each model against these five points.

## The source-of-truth repository

The models differ in their infrastructure, but each relies on the same separation.

You have a **source-of-truth repository**: a single repo where your AI artifacts live and from which you publish them. You make changes here, in one place. You also have **consumer repositories**: all the team’s projects that download these artifacts and apply them locally.

An **installer** operates between them: code that runs on the consumer side, downloads the artifacts, places them where your tool reads them, and can later update or remove them without leaving unnecessary files behind. In the simplest model, the installer is a script run by the package manager after downloading the package from the registry. In the subsequent models, this layer takes on more responsibilities.

![Image 2](https://images.przeprogramowani.pl/diagrams/lessons-m5-l4-lesson-draft-1-10x.png)

What does the source-of-truth repository look like inside? In practice, it’s simply a single package, with artifacts organized by type:

```
ai-toolkit/
├── package.json          # package metadata + publishing configuration
├── skills/
│   ├── 10x-plan/         # SKILL.md: planning a change
│   └── 10x-research/     # SKILL.md: research in the codebase
├── rules/
│   └── CLAUDE.md         # rules appended to the consumer project
├── prompts/              # ready-made prompts for specific tasks
└── config-templates/     # tool settings templates
```

Each folder represents one category of artifact. You can collect all the skills, prompts, and rules you’ve accumulated over the last five weeks here. To add another artifact, you add a file and bump the version number, and the rest of the team gets it on their next **install**.

Later in the lesson, we’ll explore the best way to connect these two types of repositories in your environment. We’ll look at three models.

## Three distribution models

These three approaches differ primarily in their audience and infrastructure.

The first is **the registry you already have**. If your team keeps its code on GitHub, it’s easy to use GitHub Packages. All the “infrastructure setup” boils down to one field in the package configuration. This is the model we recommend by default for most teams, and it’s where we’ll start.

The second is **a registry as ready-made cloud infrastructure**, such as AWS CodeArtifact deployed using Terraform. This is a deliberate choice for an organization that needs extensive service management capabilities or uses its own registry, such as Nexus. With AWS, the infrastructure is ready, but you need to configure much more than in the first model.

The third is **an API and CLI**. If you don’t have a shared registry, or your consumers use multiple technology stacks, a registry is no longer the simplest answer. In that case, a solution like **10x-cli**, which we use in the course, makes sense: the API controls access, while the CLI writes artifacts into your project, bypassing the registry.

Before we discuss the first model, two questions remain: how do we know this is a good direction, and what about existing marketplaces? The idea of distributing skills from a single source of truth through a package or CLI is also used outside this course. More and more developers are arriving at it independently. In June, Matt Pocock described on X the exact recipe we cover below: an npm package containing skills, plus a **postinstall** script that creates links to them for the appropriate tools. He summed it up as simple, versioned, and intuitive skill distribution.

![Image 3](https://images.przeprogramowani.pl/lessons/m5-l4/assets/matt-pocock-skill-distribution.png)

## What about marketplaces?

One question might be on your mind. You’ve seen plugin marketplaces in Claude Code or Cursor and are thinking: why use a registry when there’s a ready-made catalog? It’s a simple option that requires minimal effort, so it’s worth taking seriously.

A marketplace in Claude Code is a catalog in a Git repo that the team connects through project settings, so new team members are prompted to install it. For a team working with a single tool, this is a sensible approach.

The catch is dependence on a single ecosystem (vendor lock-in). The marketplace format is starting to be partly shared (GitHub Copilot CLI reads Claude Code’s **.claude-plugin/marketplace.json**), but the schemas and supported plugin sources still differ. AI tools change too frequently today to base your team’s entire distribution setup on one. When you change your default tool, or a second tool appears on the team, the distribution channel is no longer consistent. **SKILL.md** itself is portable, while its *delivery* through a marketplace is only partly so.

If you all work with one tool, a marketplace can be a reasonable shortcut. If you want a portable standard for your team, let’s return to the three models and walk through each one, starting with the simplest.

## Model 1: GitHub Packages

If your team keeps its code on GitHub, you already have a package registry. It's called GitHub Packages, and it requires no infrastructure setup.

You're already familiar with the source-of-truth repository, consumer repositories, and the installer between them from the previous section.

The entire infrastructure setup comes down to one field in **package.json** in the source-of-truth repository:

```
{
  "name": "@your-team/ai-toolkit",
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

That's all the configuration on the producer side: **publishConfig** only specifies *where* to publish. CI handles publishing authentication separately, because we never commit a token to the repo.

On the consumer side, there's a second, equally short file. It's **.npmrc**, which maps your scope to GitHub Packages so that only the **@your-team/\*** scope uses the private registry, while everything else continues to use public npm. This file is committed to the consumer repo and contains just this one line, with no secrets:

```
@your-team:registry=https://npm.pkg.github.com
```

You don't put the token line (**//npm.pkg.github.com/:\_authToken=${GH\_PKG\_TOKEN}**) in this file in the repo. You add it only during installation, using an environment variable in CI. That leaves only the mapping in the repo, and the secret never enters Git history.

That's enough to move from configuration to a standard npm package pipeline.

![Image 4](https://images.przeprogramowani.pl/diagrams/lessons-m5-l4-lesson-draft-2-10x.png)

In the source-of-truth repository, you bundle the artifacts into a single npm package. CI publishes it to the registry on a merge to the main branch. Each consumer repo installs it like any other dependency. Changed a rule or refined a skill? Bump the version, merge, and the rest of the team gets the update with a single **install**. These are still the same two contexts: the change originates in the source-of-truth repo, and all the consumer repos pull it in.

This is the approach I recommend for most teams. It's exactly how we distribute our internal toolkit today: the source-of-truth repository from the previous section is a single npm package with the **publishConfig** you just saw, and the rest of the team downloads it like any other dependency.

The same set of artifacts can reach different audiences through different channels. Our team pulls the toolkit straight from the registry, exactly as in this model. As a course participant, you get the same artifacts differently, through a CLI. For a different type of audience, the registry is no longer a good fit, but that doesn't make it a worse solution. We'll explain this in the third model.

### Where the only real difficulty lies

If it's this simple, what's the catch? Authentication—and, specifically, a rather surprising asymmetry between writing and reading.

**Writing is free and temporary.** When CI publishes a package, it uses the **GITHUB\_TOKEN** that GitHub Actions automatically provides for a single run. All you need to do is add **permissions: packages: write** to the workflow file. No secrets to manage.

**Reading is more troublesome.** To download a private package, you need a token that you must manually provide everywhere you install that package: on a developer's machine, in the CI of every consumer repo, and sometimes on an external build platform (such as Cloudflare). This isn't a token for a single run, but a long-lived secret.

If you use GitHub's organization features, a consumer repo in the same organization can download the package using a temporary **GITHUB\_TOKEN**, just as it does when writing. First, though, grant that repository access in the package settings (Package settings → Manage Actions access), because without it **npm ci** gets a 403 or 404 error. A persistent PAT becomes unavoidable only outside the organization: in a repo belonging to another owner or on an external CI system that has no access to that token.

What about costs? Public packages are completely free. Private packages fall within the allowance included in your GitHub plan and only incur charges once you exceed it. You then pay for storage and data transfer, but downloads in GitHub Actions using **GITHUB\_TOKEN** are free. For most teams, that means zero cost. We provide links to the specific limits at the end of the lesson, since they can change.

What does handling this token look like in practice? There's quite a bit of code below, but you only need to remember one thing: the token never enters the repo, and the installer does the rest for you. It all starts with a single line that the installer adds to the consumer repo's **package.json** as a **preinstall** script:

```
[ -n "$GH_PKG_TOKEN" ] && echo '//npm.pkg.github.com/:_authToken=${GH_PKG_TOKEN}' >> .npmrc || true
```

This line appends the token entry to **.npmrc** only when the **GH\_PKG\_TOKEN** variable is set. npm 7+ runs the root project's **preinstall** only after the dependencies are installed, so this line doesn't authenticate the install it runs in. It protects later commands in the same environment, such as a second install or a build that installs again. In CI, the current install is authenticated by **actions/setup-node** with **registry-url** and **scope**, plus the **NODE\_AUTH\_TOKEN** variable on the **npm ci** step (I describe this workflow patch below). Locally, the variable usually isn't set: the developer logs in once with `npm login --scope=@your-team --auth-type=legacy --registry=https://npm.pkg.github.com`, entering a PAT (classic) with the **read:packages** scope as the password. The token lands in their **~/.npmrc**, the condition is false, and **|| true** prevents the script from blocking installation.

Things are trickier on external build platforms such as Cloudflare Pages or Workers, which have no access to GitHub secrets. There, the installer adds a step that synchronizes the token with the project through the platform's API, for both the production and preview environments right away; otherwise, the preview build will fail because the token is missing.

The environment variable alone isn't enough, for the same reason as in CI: **preinstall** runs too late. That's why the repo also gets an **.npmrc** with the entry `//npm.pkg.github.com/:_authToken=${GH_PKG_TOKEN}`. npm substitutes environment variables in **.npmrc**, so the file contains no secret, and the token is in place before the install starts. In a repo with such a file, this entry takes precedence over the token that **npm login** stored in **~/.npmrc**, and with the variable unset npm sends the literal text `${GH_PKG_TOKEN}`. So set **GH\_PKG\_TOKEN** locally as well, or keep this entry out of the committed **.npmrc** and set it only in the build. Check how pnpm, yarn, and the Cloudflare build image behave in your environment.

In a production toolkit, this logic isn't an instruction in the README—it's installer code. You don't need to read that code line by line, either. Three properties matter: idempotency (run it twice and get the same result), no secrets in the repo, and careful handling of the user's existing **package.json**. The installer first appends the registry mapping to **.npmrc**, then adds **preinstall** only if it isn't already there:

```
const REGISTRY_LINE = "@your-team:registry=https://npm.pkg.github.com";
const PREINSTALL_SCRIPT =
  "[ -n \"$GH_PKG_TOKEN\" ] && echo '//npm.pkg.github.com/:_authToken=${GH_PKG_TOKEN}' >> .npmrc || true";

function ensureGitHubPackagesAuth(projectRoot: string) {
  ensureLine(path.join(projectRoot, ".npmrc"), REGISTRY_LINE);

  const pkg = readPackageJson(projectRoot);
  const existing = (pkg.scripts?.preinstall ?? "").trim();
  pkg.scripts ??= {};
  pkg.scripts.preinstall = existing.includes("GH_PKG_TOKEN")
    ? existing
    : existing
      ? `${existing}; ${PREINSTALL_SCRIPT}`
      : PREINSTALL_SCRIPT;
  writePackageJson(projectRoot, pkg);
}
```

Distributing AI artifacts quickly becomes standard product engineering: besides the shell command itself, we need installer code.

The same installer also patches workflows where it finds **actions/setup-node** and **npm ci**, adding **registry-url**, **scope**, and **NODE\_AUTH\_TOKEN**. This patch authenticates the install in GitHub Actions. The consumer doesn't have to remember the whole checklist: the package itself prepares the repo to pull in its future versions.

With GitHub Packages, instead of configuring infrastructure, you focus on making tokens available in your environments. You don't pay for infrastructure. In the self-hosted registry model, you'll do that work earlier, during infrastructure setup.

### Versioning without manual bumps

Since CI publishes on every merge, manually bumping versions quickly becomes a bottleneck. You can automate this, but with one safeguard.

We recommend versioning based on conventional commits: the commit type (**fix:**, **feat:**, **feat!:**) indicates whether it's a patch, minor, or major release. This works great as long as the commit types are correct. In practice, they can be wrong, whether we commit on our own or with AI assistance. Someone labels a documentation typo fix as **feat:**, and suddenly there's a release with a new version, even though no actual change made it into the package. Or the opposite: they label an actual skill change as **chore:**, and no release is created at all.

That's why it's worth adding a second check in CI/CD: use **git diff** to check whether the files included in the package have actually changed since the last tag. A commit can misrepresent its intent; **git diff** shows what really changed. This check prevents spurious releases caused by incorrectly labeled commits.

You don't have to write all this logic yourself. [semantic-release](https://semantic-release.org/) calculates the version from commit messages and publishes right away. [release-please](https://github.com/googleapis/release-please) also uses commits, but instead of publishing, it opens a release PR for approval. You can also write your own logic in CI/CD to have full control over the process.

### ⚠️ Model 1 — what to watch out for

A handful of pitfalls from our production deployment. Knowing about them will save you hours of debugging:

- **Read access requires a PAT (classic), as of October 2026.** Apart from **GITHUB\_TOKEN** in Actions, the GitHub Packages npm registry currently supports only a classic PAT with the **read:packages** scope, and fine-grained tokens don't work here. This is the detail in this section most likely to become outdated, so check the current status in GitHub's documentation before you base read access in CI on a particular token type.

- **External build platforms can't access GitHub secrets.** CF Pages/Workers will only build the project once you synchronize the token with the project in their own secrets system. This is the synchronization step described above (on other platforms, you perform the equivalent step yourself).

- **GitHub Packages rejects duplicate versions** (a 409-class error). The starter from `10x get m5l4` checks whether the version already exists and skips publishing if it does, but it doesn't bump the version itself, so if you forget the bump, your change silently doesn't ship. You can add automatic bumping with a tool from the previous section (semantic-release, release-please) or your own script.

## Model 2: A registry as ready-made infrastructure

Model 2 is a ready-made, managed cloud registry—in our case, AWS CodeArtifact. Before I show you how it works and when to choose it, let me briefly explain why I chose it. This is the solution I built during the webinar promoting the previous edition of 10xDevs.

Why was my first instinct to use packages and a CLI? Experience. As a platform engineer at SmartRecruiters, I was responsible for sharing ways of working across the organization: libraries, frameworks, and a design system. All of these reached teams through packages and CLI tools. When I looked at skills and rules, I saw the same distribution problem, just with different content.

So before choosing GitHub Packages for the toolkit, I built a platform-based version: a private registry on AWS CodeArtifact, created entirely with Terraform, with CI authentication via OIDC—exchanging short-lived identity tokens instead of using a long-lived AWS key.

You don't have to maintain a registry server here, and you get more control over permissions and the registry's behavior than in the first model.

The most complex and impractical solution for most teams is setting up your own registry from scratch—for example, Nexus or Verdaccio on your own cluster. In that case, you're responsible for the process, storage, and availability. CodeArtifact is a middle-ground solution because the cloud takes care of all that management.

As with GitHub Packages, the cost for most teams will be zero thanks to AWS CA's free tier. By comparison, running your own Verdaccio on ECS means an actual bill of several dozen dollars a month and considerably more code to maintain. You'll find authentication details in the [CodeArtifact documentation](https://docs.aws.amazon.com/codeartifact/latest/ug/tokens-authentication.html), and the free tier and rates on the [CodeArtifact pricing page](https://aws.amazon.com/codeartifact/pricing/).

So why do we ultimately recommend GitHub Packages rather than CodeArtifact? We want you to start with the solution that has the lowest barrier to entry and works for a team already using GitHub, without creating an AWS account or writing Terraform code. Both solutions are valid, but choose the one that requires the least work while meeting your needs and fitting your environment.

I recorded a complete, step-by-step walkthrough of this pipeline during the webinar: creating a CodeArtifact registry with Terraform, OIDC, and CI/CD from start to finish. Treat the recording as the story of how I arrived at today's recommendation. Not everyone needs to start down that path.

<div style="padding:56.25% 0 0 0;position:relative;"><iframe src="https://www.youtube-nocookie.com/embed/hbuCLvwbMVg" title="YouTube video player" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"></iframe></div>

So when does model 2 make sense? When your organization already uses AWS, or when you need registry-level management capabilities that GitHub doesn't provide. It's a deliberate choice for specific circumstances. We don't recommend it as the default for everyone.

### What this registry looks like on the inside

Let's start with terminology, because CodeArtifact uses the word “repository” differently from what you're used to. To you, a repository is where you keep code—a GitHub repo. In CodeArtifact, a repository is a package store inside the registry. The hierarchy looks like this: one domain (in our case, **devs10x**) contains package repositories. Our configuration has two: a private one for your own packages, and another that acts as a proxy for public npm. This gives developers a single endpoint for everything, both company packages and those from the public registry.

Also watch out for two names that look similar but mean different things. A package scope (**@10xdevs**) is a prefix in an npm package name. A domain (**devs10x**) is the name of a resource in CodeArtifact. You specify the domain when logging in, while the scope only determines which packages you download through the private registry and which still come from public npm. These are two different things that are easy to confuse in a single login command.

You declare the rest of the configuration in the CI/CD process. The registry resources themselves take about 70 lines of Terraform code, while the full configuration, including permission policies and remote state, grows to 250–400 lines. CI authentication uses OIDC, so no long-lived AWS key ends up in the repo, and access tokens expire after a few hours. The IAM role and OIDC provider are deliberately separated out as a one-time bootstrap, much like creating the bucket for Terraform state. This isn't “manual work outside the pipeline,” but an explicit boundary between what you manage with Terraform code and what you create once at the start of the project, outside the CI/CD process.

You'll find the prompts and specifications I used during the webinar in the materials for this lesson.

### ⚠️ Model 2 — what to watch out for

Issues worth knowing about in advance:

- **The domain name must start with a lowercase letter.** **10xdevs** will be rejected, which is why our configuration uses **devs10x**. Keep this in mind if your company or team name starts with a digit.

- **Version 5 of the AWS provider (the one in the recording; the current version is 6) is about 700 MB**, so the first **terraform plan** tends to time out. Set **TF\_PLUGIN\_TIMEOUT=300** before the first run.

- **The CI/CD pipeline must have `permissions: id-token: write`.** Without it, OIDC stops working and the error is misleading. The step fails with missing credentials, while the hint about `id-token` gets lost in the log as a plain info message. The publishing process then cannot authenticate.

You can see each of these pitfalls in the webinar recording above, in the context of an actual configuration.

## Patterns that work across every model

Some design decisions don't depend on where the registry runs. Whether you choose GitHub Packages, CodeArtifact, or something else, you can use three patterns in any of these models.

**Sentinel markers for rules.** You put a skill in a separate folder, and it doesn't get in anyone's way. But project rules often live in a file that people edit in every project, such as **CLAUDE.md** or **AGENTS.md**. How do you add team conventions to it without overwriting what the team has already prepared? The installer handles this—the same one that downloaded artifacts on the consumer side in the first model. Instead of overwriting the entire file, it appends its own section between a pair of markers:

```
<!-- BEGIN @your-team/ai-toolkit -->
... team rules ...
<!-- END @your-team/ai-toolkit -->
```

This operation is idempotent. On every update, the installer finds that pair of markers, replaces only the block between them, and leaves the rest of the file alone. Your own notes in the same **CLAUDE.md** will survive every **install**. You'll see this in your own course project: open the rules file, find the **10x-cli** markers, and add something outside them. When you download the package for the next lesson, the content between the markers will change, but your addition will remain untouched.

In the simplest version, this update comes down to: find the block, remove the old content inside it, and insert the new content. That's enough to make the installer predictable:

```
const BEGIN = "<!-- BEGIN @your-team/ai-toolkit -->";
const END = "<!-- END @your-team/ai-toolkit -->";

function applyRules(existing: string, teamRules: string) {
  const block = `${BEGIN}\n${teamRules.trim()}\n${END}`;
  const start = existing.indexOf(BEGIN);
  const end = existing.indexOf(END);

  if (start !== -1 && end !== -1) {
    return existing.slice(0, start) + block + existing.slice(end + END.length);
  }

  return existing.trimEnd() + "\n\n" + block + "\n";
}
```

If one marker exists but the other disappeared after a manual edit, a production installer doesn't ignore the problem. A damaged block like this needs to be handled separately so that the next installation doesn't duplicate the rules.

**Installation manifest.** The installer records exactly what it installed in a small manifest file: which package, which version, and for which tool, along with a complete list of files broken down by skill. In your course project, this is **.claude/.10x-cli-manifest.json** (written by **10x-cli**):

```
{
  "package": "@przeprogramowani/10x-cli",
  "version": "1.30.0",
  "manifestVersion": 3,
  "lastApplied": "2026-09-14T08:00:00.000Z",
  "lessonId": "m1l5",
  "course": "10xdevs4",
  "tool": "claude-code",
  "files": {
    "skills": {
      "10x-init": { "files": ["SKILL.md"], "contentHashes": { "SKILL.md": "<sha256>" } },
      "10x-shape": { "files": ["references/prd-schema.md", "SKILL.md"] }
    },
    "prompts": [],
    "configs": ["settings.json.template", "mcp.json.template"]
  }
}
```

Thanks to this list, the installer removes exactly the files it previously added during uninstallation, rather than guessing based on the directory's contents. The manifest is self-contained. Cleanup doesn't depend on whether **node\_modules** still exists or on package manager hooks, which don't always run when dependencies are removed.

**`SKILL.md` as a portable standard.** Remember that this standard doesn't belong to any particular tool. It should work equally well in Claude Code, Cursor, and Codex. That's why the same artifact can be delivered to multiple tools at once: since the format is neutral, the tools differ only in their destination directory. The installer (or, as you'll see in the third model, tool profiles in the CLI) puts the same file wherever the given tool expects to find it.

This means your work from the past five weeks isn't tied to today's choice of tool. The content stays the same when you change the delivery channel. It's the same boundary you saw with marketplaces: **SKILL.md** itself is portable, while its distribution mechanism can still be tied to a specific tool, even as marketplace formats start to partly overlap.

## Model 3: A Full Product with an API and CLI

The third model is a fully fledged product with its own API and CLI. You choose it when you want to be independent of your users' technology stacks. This is how the solution you use in this course works: **10x-cli**, which you have been using to download lesson materials since the start of the course.

Why aren't the course materials simply an npm package?

- **Users work with different stacks.** A registry that supports multiple ecosystems at once is *more* complicated than a single CLI communicating with a single API. It's easier to handle diverse stacks through tool profiles in the CLI than by multiplying registries.

- **You want precise control over artifact delivery.** With the package model, material is either published or it isn't. In **10x-cli**, I decide what is available to whom, and in what order and portions it reaches users. This kind of staged delivery is much harder with a registry.

For these two reasons, the CLI takes responsibility for distribution instead of package configuration.

The architecture of this product consists of three interchangeable layers.

![Image 5](https://images.przeprogramowani.pl/diagrams/lessons-m5-l4-lesson-draft-3-10x.png)

The **source of truth** is where the built artifact bundles live. In this course, it's private content built from **10x-toolkit**, but in a company it could be any repository containing artifacts.

The **API** checks who is making the request and whether they are entitled to receive a given resource at that moment, then delivers the appropriate bundle over REST. It is responsible for protecting and distributing content.

The **CLI** saves the received content in the appropriate directory for the user's tool. This is where things get very practical: one API returns a tool-neutral bundle, and the CLI decides whether a skill goes into **.claude/skills**, **.cursor/skills**, **.agents/skills**, or somewhere else.

In **10x-cli**, that decision comes from a straightforward tool profile configuration:

```
export const PROFILES = {
  "claude-code": {
    skillPath: (name) => `.claude/skills/${name}/SKILL.md`,
    promptPath: (name) => `.claude/prompts/${name}.md`,
    rulesFile: "CLAUDE.md",
    manifestDir: ".claude",
  },
  cursor: {
    skillPath: (name) => `.cursor/skills/${name}/SKILL.md`,
    promptPath: (name) => `.cursor/prompts/${name}.md`,
    rulesFile: ".cursor/rules/10x-course.mdc",
    manifestDir: ".cursor",
  },
  codex: {
    skillPath: (name) => `.agents/skills/${name}/SKILL.md`,
    promptPath: (name) => `.agents/prompts/${name}.md`,
    rulesFile: "AGENTS.md",
    manifestDir: ".agents",
  },
  // ...oraz copilot, devin-desktop, factory, gemini, kiro i generic
};
```

Above, you can see three of the nine profiles, shortened to the fields relevant here. **10x-cli** supports **claude-code** (the default), **cursor**, **copilot**, **codex**, **devin-desktop**, **factory**, **gemini**, **kiro**, and **generic**. Each has the same structure: it specifies where skills, prompts, the rules file, and the manifest go.

The CLI is therefore responsible for putting content in the right place. You don't need to teach the API the conventions of every tool. The API handles access and content, while the CLI handles local file conventions.

Let's look inside the product you use in this course. One caveat: in this example, **you are the recipient** at the end of the chain. This is the 10xDevs context, which differs from the company context we've been discussing throughout the lesson. In your team, colleagues from other projects will be at the end of that chain.

### API: Access Control Beyond What a Registry Can Handle

Login starts with a magic link, and under the hood the CLI receives a short-lived access token: a JWT valid for about an hour, refreshed in the background. The API checks permissions every time the token is refreshed, including after login.

In a team, this means you revoke access in one place, and the token expires within an hour at most, without manually cleaning up tokens scattered across repositories.

How does the API know whether you're entitled to the content? Your business system is the source of truth for permissions: an employee database, a membership system, or a subscription list. In 10xDevs, that system is Circle.so, and the local store is Cloudflare KV, because we don't want to query Circle every time someone downloads material (Circle has monthly API request limits).

In practice: *fetch permissions from the business system into a local store and check them locally, rather than querying that system on every request.* A local lookup is fast and doesn't fail when the source system has a temporary outage. If your company's permissions system has no such limitations, which is often the case, the local store is unnecessary.

The API also supports **releasing content over time**, something a standard registry doesn't handle. A module unlocks only when it is meant to become available, and the API controls who gets what and when. In a registry, a package is either published for everyone or doesn't exist at all; releasing it in stages is much more complicated.

### The CLI as a Security Boundary

The CLI writes files to disk, but if it is going to accept content from an API and modify the user's workspace, it needs a few safeguards. We'll show them using real **10x-cli** code: this is our course distribution client, and your team's equivalent would look the same, just under a different name.

**Package signing (Ed25519).** The API signs every bundle with an Ed25519 key, and the CLI verifies the signature before writing anything to disk. The public key is compiled into the CLI, so compromising the API alone isn't enough to serve you tampered content. Verification is mandatory (**REQUIRE\_SIGNATURES = true**): the CLI rejects a package without a valid signature and writes nothing to disk. This protects against a man-in-the-middle attack on your AI artifact supply chain.

![Image 6](https://images.przeprogramowani.pl/lessons/m5-l4/assets/signing.png)

There's nothing magical about the simplified code. The CLI hashes the raw response, compares it against the header, and only then verifies the signature over the canonical string:

```
function verifyBundleSignature(rawBody, signature, keyId, headerHash) {
  const computedHash = sha256(rawBody);
  if (computedHash !== headerHash) {
    throw new Error("Bundle content hash mismatch");
  }

  const canonical = `v1:${keyId}:${computedHash}`;
  const valid = verifyEd25519(canonical, signature, publicKeyFor(keyId));
  if (!valid) {
    throw new Error("Bundle signature verification failed");
  }
}
```

First, content integrity; then, sender authenticity. Without this, the CLI would just be a convenient **curl | write**.

**API host allowlist.** The CLI communicates only with its own API endpoint: the production host over HTTPS, or localhost in development mode. If the API address could be freely overridden with an environment variable, an attacker could redirect login to their own server and capture the token. That's why an allowlist of hosts is essential.

![Image 7](https://images.przeprogramowani.pl/lessons/m5-l4/assets/api-allowlist.png)

**Sentinel-injection guard.** Remember the sentinel markers from the previous section? The tool adds them around the block of team rules. If the delivered rule content itself *contains* those markers, that's a warning sign: the next time the rules are applied, the CLI could mistake an injected marker for a real one and delete your content outside the block. That's why the CLI refuses to write a rule that itself contains sentinel markers.

## Decision Table and Alternatives

Let's bring the three models together in one place. The rows in this table are the selection criteria that have come up throughout the lesson: from authentication and multi-tool delivery in the requirements list to the audience, access revocation, and costs that distinguish the models in practice.

- Audience | **Model 1: GitHub Packages**: a team on GitHub | **Model 2: CodeArtifact + Terraform**: a team on AWS | **Model 3: API + CLI**: any team

- Authentication | **Model 1: GitHub Packages**: PAT / **GITHUB\_TOKEN** | **Model 2: CodeArtifact + Terraform**: IAM / OIDC | **Model 3: API + CLI**: magic link + short-lived token

- Permissions | **Model 1: GitHub Packages**: org/repo membership | **Model 2: CodeArtifact + Terraform**: IAM policy | **Model 3: API + CLI**: check in the business system

- Access revocation | **Model 1: GitHub Packages**: removal from the organization | **Model 2: CodeArtifact + Terraform**: policy detachment | **Model 3: API + CLI**: removal from the business system

- Releasing content over time | **Model 1: GitHub Packages**: no | **Model 2: CodeArtifact + Terraform**: no | **Model 3: API + CLI**: yes

- Multi-tool delivery | **Model 1: GitHub Packages**: handled by the installer | **Model 2: CodeArtifact + Terraform**: handled by the installer | **Model 3: API + CLI**: tool profiles in the CLI

- Setup cost | **Model 1: GitHub Packages**: ~zero (one field) | **Model 2: CodeArtifact + Terraform**: ~70 lines of Terraform + an AWS account | **Model 3: API + CLI**: a full product (API, authentication, CLI)

- Maintenance cost | **Model 1: GitHub Packages**: tokens in other people's CI | **Model 2: CodeArtifact + Terraform**: token rotation, keeping IAM tidy | **Model 3: API + CLI**: maintaining the API, authentication, and client

The audience in the first row determines the model; the remaining rows simply refine the choice.

You can treat this choice like a simple router:

![Image 8](https://images.przeprogramowani.pl/diagrams/lessons-m5-l4-lesson-draft-4-10x.png)

### The Most Common Mistake

The most common trap is choosing a distribution model to boost your résumé. The team chooses the most impressive model rather than the one that fits its audience. It builds an API with a CLI or sets up a registry with Terraform, when the actual audience is "our team, which uses only GitHub."

To make it easier to move from a decision to your own starter setup, we provide descriptions and ready-to-use starting materials for this lesson through **10x get m5l4**: prompt specifications, review conventions, a sample **package.json**, an installer and uninstaller outline, an **.npmrc** for the consuming repository, and a GitHub Actions workflow that publishes the package to GitHub Packages. Treat them as materials to adapt to your needs.

If you already know what your company needs, you can go straight through the standard process: **/10x-new** → **/10x-research** → **/10x-plan** → **/10x-implement**. If you're not sure which distribution model makes sense, first gather requirements using **/10x-shape**, **/10x-prd**, and **/10x-roadmap**. Solid context before you build helps you avoid foolish compromises later. Yes, the kind where "we built a platform because it sounds cool."

This completes the foundation for working with AI as a team. You have agreed standards, pipelines that enforce them, and a registry from which the entire team gets the same context. Once that foundation is in place, we move from *building the workshop* to *getting the most out of it*: working with Agents remotely and asynchronously. You delegate a task, get on with something else, and the Agent works in the background. And that's exactly what we'll cover in the final lesson of 10xDevs 4.0.

## 🧑🏻‍💻 Practical exercises

You earn the **10xChampion** badge for **one** practical project: the team distribution package from this lesson (Task 3 below), or the code review pipeline from the lessons on the Team Agent (M5L2) and Code Review in a Pipeline (M5L3). Choose the path that best fits your daily work. Once you publish the package, take screenshots as evidence for earning 10xChampion: the repository/registry showing the workflow, the package definition, and the list of released versions (the same categories outlined in Step 4 of the AI Internal Builders lesson, M5L1).

1. **Apply the decision table to your organization.** Answer the question in the first row: who will use your AI artifacts? A team on GitHub, a team on AWS, or an external user with limited access? Based on that, choose a model and explain your reasoning in two or three sentences. If you are tempted to choose a model that is more complex than your users' needs require, pause and write down why you actually need it.

2. **If you are unsure about your decision, clarify the requirements.** Use **/10x-shape**, **/10x-prd**, and **/10x-roadmap** to describe your users, access restrictions, stacks, the team's AI tools, how access is revoked, and the minimum MVP scope. The result should be a short PRD or roadmap that justifies your choice of model. Only then should you start building.

3. **Build a minimal team package with AI.** Use **npx @przeprogramowani/10x-cli@latest get m5l4** to download a set of specifications, prompts, and configuration starters. Based on these, work through **/10x-new** → **/10x-research** → **/10x-plan** → **/10x-implement** to generate and validate the skeleton of your own package or API+CLI.

The goal is not to copy the templates verbatim. The goal is to give the Agent concrete examples of an installer, an uninstaller, package configuration, and a CI/CD pipeline, while you control the decisions: names, scope, which artifacts to include, and readiness criteria.

The minimal starter you are aiming for looks roughly like this:

```
ai-toolkit/
├── package.json
├── install.js
├── uninstall.js
├── skills/
│   └── code-review/
│       └── SKILL.md
├── rules/
│   └── CLAUDE.md
└── .github/
    └── workflows/
        └── publish-ai-toolkit.yml
```

> The package also includes three skills that automate model 2 (AWS, CodeArtifact) and save you from manually rewriting specifications: **/pack-init** (an npm package skeleton), **/tf-registry** (Terraform for a CodeArtifact registry), and **/setup-cicd** (a publishing pipeline using OIDC). They do not generate a ready-made solution in a vacuum—you run them based on the associated specifications, and your job is to fill in values specific to your setup: the domain name and scope, AWS region, repository names, and permission policies. You can see this flow in the webinar recording linked in the lesson.

## Claim your badge

After completing this lesson, claim your badge in the [10xDevs Mission Log](https://platforma.przeprogramowani.pl/mission-log) section, then share your achievement!

## 🔎 Deep Dive

In this Deep Dive, we will take a closer look at selected topics from the lesson:

- **Anatomy of an installer** — symlink vs. copy modes, the manifest, presets, dependency resolution, and clean uninstallation.

- **The contract between a private repo and a public CLI** — how OpenAPI and generated types let two repos evolve without breaking each other.

This section of the lesson is optional, but worth exploring if you want to become an expert.

### Anatomy of an installer

The installer in models 1 and 2 is a layer of scripts within the package: code responsible for installing, updating, and uninstalling artifacts. It involves more than just copying files, even when everything fits into a single npm package. Let's look at a few decisions:

- **Two installation modes.** Symlink mode (**npm install**) links artifacts into the **.claude/** directory so they travel with the repo. Copy mode (**npx ... install**) physically copies files and works in any project, including those without a **package.json** (Python, Go, Rust). Copy mode is required here because the **npx** cache is ephemeral, so symlinks would break after the command finishes.

- **A manifest instead of guesswork.** The installer records the mode and the exact list of installed files in **.claude/.10x-toolkit-manifest.json**. The uninstaller reads the manifest and removes exactly what the installer added, without relying on **node\_modules** still being present. Cleanup must work independently, because you cannot count on the package manager's uninstall hooks in every dependency removal scenario.

- **Migration from older versions.** The installer cleans up artifacts left behind by previous toolkit versions, but if the manifest is corrupted, it prefers to leave files alone rather than risk data loss.

### The contract between a private repo and a public CLI

In model 3, the private content repo and the public CLI are two separate repositories with different visibility settings. They are connected by an explicit contract: the API publishes a generated OpenAPI 3.1 specification, from which the CLI generates its types at build time. This means an API change that would break client compatibility is caught during CLI compilation, before it reaches the user. This pattern applies to any two repos that can evolve independently but must stay in sync.

## 📚 Additional resources

None of these resources are required. This collection will help you deepen your knowledge if you want to build your own distribution mechanism.

- [Webinar: From Chaos to AI-Native Infrastructure](https://www.youtube.com/watch?v=hbuCLvwbMVg) — a full walkthrough of model 2 (CodeArtifact + Terraform) as a deliberately chosen enterprise option.

- [Agent Skills — an open standard](https://agentskills.io/): what SKILL.md is and which tools support it.

- [Working with the npm registry — GitHub Packages](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry) — **publishConfig**, scope mapping, and the classic PAT limitation.

- [About billing for GitHub Packages](https://docs.github.com/en/billing/concepts/product-billing/github-packages): current limits included in your plan.

- [Create and distribute a plugin marketplace — Claude Code](https://code.claude.com/docs/en/plugin-marketplaces) — a marketplace as a zero-infrastructure alternative for a single tool.

- [Cursor Marketplace](https://cursor.com/marketplace) — Cursor's official plugin marketplace.

- [Matt Pocock: an npm-based skill distribution mechanism](https://x.com/mattpocockuk/status/2062129440558047545): independently arriving at the same pattern (an npm package + a **postinstall** symlink to **.claude/skills**), June 2026.

- [Claude Skills are awesome, maybe a bigger deal than MCP](https://simonwillison.net/2025/Oct/16/claude-skills/): Simon Willison on why delivering files works better than a protocol for static artifacts.

- Prework [\[3.2\]](https://platforma.przeprogramowani.pl/courses/10xdevs-foundations/pl/10) *Prompting Patterns and Anti-Patterns*: the instruction hierarchy as terminology we assume you already know in this lesson.
