# Source retrieval

Source files contain source metadata only. This prohibition applies to `.training/sources/`; it does not prohibit the separate, private verified question records in `.training/pool/questions/`:

```markdown
# Official Sources: .NET

| ID | Title | URL | Coverage | Stability | Verified at | Retrieval |
|---|---|---|---|---|---|---|
| dotnet-loh | The large object heap on Windows systems | https://learn.microsoft.com/... | Runtime and memory management | stable-foundational | 2026-01-01T12:00:00Z | section=How an object ends up on the LOH |
```

Cache only source ID, official title, URL, topic/subtopic coverage, stability, source-metadata `verifiedAt`, and bounded retrieval metadata. Never cache claims, answers, rubrics, templates, user answers, or scores in source files.

Candidate evidence is separate from this source cache. A fresh URL or refreshed source metadata proves neither the claims in a question nor support for its rubric. Each prepared candidate stores its own `verifiedAt` and concise criterion-to-section support notes in its question record. A source refresh, even for the same URL, does not refresh another candidate's support or freshness. Revalidate each criterion and update candidate-specific evidence and time before using a stale candidate; follow the workflow in [preparation.md](preparation.md) and schemas in [storage.md](storage.md).

Classify metadata as `stable-foundational` or `version-sensitive`.

- Reuse stable-foundational metadata for 180 days.
- Reuse version-sensitive metadata for 30 days.
- Revalidate regardless of age for current/latest behavior, materially changeable security guidance, a newer named product version, conflicting guidance, a failed link, or loss of subtopic support.

These age limits apply only to source metadata. They do not waive mandatory triggers or make a candidate fresh by association. Candidate compatibility, exact identity retirement, and criterion-level evidence are checked independently.

Refreshing source metadata or revalidating a candidate does not rewrite an awaiting question's snapshot in `session.md`. Grade that question against its persisted rubric and source; use updated source/candidate information only for future candidates and selections.

Retrieval order:

1. Consult the source cache.
2. Reuse a fresh entry when no mandatory trigger applies.
3. If stale, fetch the known official URL first.
4. Search official documentation only if the URL fails or no longer covers the topic.
5. Retrieve an anchored section or bounded excerpt when supported.
6. Update metadata only after successful verification.

If no reliable source is available, silently choose another candidate.
