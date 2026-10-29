<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 5, Lesson 4 (Shared AI Registry)

Distribute team skills, prompts and rules as a versioned package on a registry your org already has. GitHub Packages is the default path; AWS CodeArtifact with Terraform is the optional managed-infra path.

```
m5l4-shared-* -> m5l4-github-packages-spec-* + config templates -> publish -> npm install in consumer repos
```

### Task Router - Where to start

| Skill / prompt / template | Use it when |
| --- | --- |
| `m5l4-shared-conventions`, `m5l4-shared-spec-skill` (prompts) | Defining the team's first shared skill and its conventions. |
| `m5l4-github-packages-spec-pack`, `m5l4-github-packages-spec-cicd` (prompts) + `m5l4-github-packages-*.template` | Building the default package: package.json, installer and uninstaller, consumer `.npmrc`, starter `rules/CLAUDE.md` and the publish workflow. |
| `/pack-init` -> `/tf-registry` -> `/setup-cicd` | Optional CodeArtifact path: scaffold the package, provision the registry with Terraform, then add CI/CD. They read the `m5l4-*` specs from your tool's prompts directory. |

### Hard rules

- **Never overwrite what the consumer wrote.** Installers touch only files they track in their manifest and only the text between their sentinel markers.
- **Uninstall removes exactly what install added**, using the manifest.
- **Publish only a new version.** Bump the version before publishing; the registry rejects a version that already exists.
- **Tokens stay in CI secrets or local env**, never in a committed `.npmrc`.

<!-- END @przeprogramowani/10x-cli -->
