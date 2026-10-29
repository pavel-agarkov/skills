# Source retrieval

Source files contain metadata only:

```markdown
# Official Sources: .NET

| ID | Title | URL | Coverage | Stability | Verified at | Retrieval |
|---|---|---|---|---|---|---|
| dotnet-loh | The large object heap on Windows systems | https://learn.microsoft.com/... | Runtime and memory management | stable-foundational | 2026-01-01T12:00:00Z | section=How an object ends up on the LOH |
```

Cache only source ID, official title, URL, topic/subtopic coverage, stability, `verifiedAt`, and bounded retrieval metadata. Never cache claims, answers, rubrics, templates, user answers, or scores.

Classify metadata as `stable-foundational` or `version-sensitive`.

- Reuse stable-foundational metadata for 180 days.
- Reuse version-sensitive metadata for 30 days.
- Revalidate regardless of age for current/latest behavior, materially changeable security guidance, a newer named product version, conflicting guidance, a failed link, or loss of subtopic support.

Retrieval order:

1. Consult the source cache.
2. Reuse a fresh entry when no mandatory trigger applies.
3. If stale, fetch the known official URL first.
4. Search official documentation only if the URL fails or no longer covers the topic.
5. Retrieve an anchored section or bounded excerpt when supported.
6. Update metadata only after successful verification.

If no reliable source is available, silently choose another candidate.
