---
name: qa-evidence-brief
description: Produce a short, evidence-based field brief for one MAD QA case.
triggers:
  - "QA Evidence Brief"
  - "field evidence brief"
  - "use the QA evidence brief skill"
---

# QA Evidence Brief

Use this skill only when the reviewer explicitly asks for a QA Evidence Brief or field evidence brief. Do not load it for ordinary case questions.

## Required evidence

1. Call `get_case` before writing the brief.
2. If the reviewer asks about a named feature or relationship, call `get_feature` or `get_related` for that item before making a claim.
3. Cite only the returned case evidence. Do not infer imagery, geometry, or database facts that the tools did not return.

## Response format

Use Markdown with exactly these sections:

### QA finding

State the issue type, affected address, and confidence in one or two sentences.

### Evidence reviewed

Provide a short bulleted list. Each item must name its source dataset or report.

### Reviewer action

State either the recommended controlled draft action or the specific evidence that must be obtained before a draft can be considered.

## Guardrails

- Never say that an edit was applied, accepted, or published.
- Evidence-only cases must be held; do not call `stage_fixture_draft`.
- A controlled draft, if one exists, is only staged for human review.
