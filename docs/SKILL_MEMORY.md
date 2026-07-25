# QA skill reviewer memory

The workbench asks the local LM Studio agent to turn a human rejection into scoped, auditable guidance for the matching MAD QA category. It does not rewrite a core `SKILL.md` with unconstrained model output.

## Storage model

Each category owns two files:

- `agent-skills\mad-qa-<category>\SKILL.md` — stable rules, workflow, and safety constraints reviewed in source control.
- `agent-skills\mad-qa-<category>\references\reviewer-memory.md` — append-only, agent-authored lessons with the original human correction retained as provenance.

The allow-listed categories are `MA`, `AV`, `AP`, `APC`, `BRV`, `BSA`, `MSN`, `SNV`, `ESZ`, `SN`, and `ASL`. Routing uses the exact QA view prefix or report group. The model cannot select a path, invent a category, or write an arbitrary file.

Every memory entry records:

- a UUID and UTC timestamp;
- QA category and view;
- case and rejected proposal;
- the exact LM Studio model ID;
- an agent-authored title and lesson;
- applicability conditions, required checks, an avoid rule, and confidence;
- the source reviewer feedback; and
- an applicability warning that limits reuse to matching evidence.

The bridge also appends a machine-readable write event to `.runtime\skill-memory-events.jsonl`. A SHA-256 fingerprint of category, case, proposal, and feedback prevents the same rejection from being appended twice.

## Agent-authoring turn

Rejection starts a separate, bounded LM Studio turn. The model receives the selected category skill, complete case snapshot, complete staged draft, quoted reviewer feedback, and the proposal-linked prior agent run. That prior run contains the original user prompt, any earlier reviewer feedback the proposal was responding to, final agent response, tool-call names and arguments, tool results, and browser-safe tool summaries. Hidden model reasoning is not treated as evidence or persisted. The memory editor therefore sees what the previous agent actually proposed, said, and inspected without relying on an inferred narrative.

The tool is required. The model must author the structured lesson fields; the server does not manufacture a lesson from a template or simply paste feedback into the skill. The bridge validates lengths, lists, confidence, category routing, and the server-owned destination before appending anything. If LM Studio is unavailable, omits the tool call, or returns invalid fields, the write fails visibly and the dialog keeps the reviewer text for retry.

Proposal context is keyed by the exact `proposal_id`, so a descendant proposal cannot accidentally inherit the tool transcript of its rejected parent. The local MVP retains up to 200 proposal contexts in bridge memory. A bridge restart clears those transcripts; in that fallback state the memory editor still receives the full case and staged proposal and is explicitly told not to infer missing prior activity.

## When memory enters model context

The baseline agent prompt contains only the compact skill index. A category's memory stays out of context until that exact category skill is loaded with `load_skill`.

When loaded, the bridge adds at most the 12 most recent entries after the core skill instructions. Both the agent-authored lesson and its source reviewer text are labeled untrusted, category-scoped data. They cannot override system safety, tool allow-lists, current source rows, MAD schemas, or authoritative domains. If old memory conflicts with present evidence, the agent must follow present evidence and escalate the ambiguity.

Automatic QA investigations are required to load both the exact category skill and MAD Schema Intelligence. The combined evidence packet refuses to open until both requirements are met.

## Reviewer-visible states

Before a rejection is submitted, the dialog shows the target core skill and memory file. While the localhost request is active, a spinner announces `Local agent is authoring <category> memory` beside the exact path. After completion, the Agent panel shows the agent-authored title, lesson, written path, or a clear failure/already-recorded status.

The automatic investigation transcript also reports how many reviewer memories were loaded and the source file whenever the category skill is invoked.

## Audit and maintenance

The category Markdown sidecars are human-readable and reviewable in Git. The JSONL file is local runtime evidence and is ignored by Git. Proposal lineage remains separately recorded in `.runtime\proposal-history.csv`.

As the sidecars grow, a data steward should periodically consolidate repeated corrections into tested, stable rules in the core `SKILL.md`, mark obsolete memory entries as superseded, and add regression fixtures. The runtime loader intentionally caps recent memory so accumulated anecdotes do not crowd out current case evidence.
