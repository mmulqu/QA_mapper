# Local LM Studio agent bridge

The workbench can use a local LM Studio model for one bounded QA investigation at a time. It can read the supplied Rockport test export through restricted tools, explain case evidence, and stage a controlled review draft, but it cannot access production MAD credentials or publish without a human-approved server-side handoff.

## Run locally

For the normal local workflow, double-click **Start MAD QA Workbench.cmd** in the project root. It starts LM Studio when necessary, loads the configured model, starts the local agent bridge and Vite, then opens the browser.

For manual development:

1. In LM Studio, load a vision- and tool-capable model and start its local server. The default on this workstation is `gemma-4-e4b-it` at `http://127.0.0.1:1234/v1`; another OpenAI-compatible vision model can be selected with `LM_STUDIO_MODEL`.
2. In one PowerShell window, start the local agent bridge:

   ```powershell
   npm run agent
   ```

3. In another PowerShell window, start the Vite app:

   ```powershell
   npm run dev
   ```

4. Open the workbench and select **Agent** on the map. Ask a question or select **Review the evidence and stage a draft if it is safe.**

The bridge listens only on `127.0.0.1:8787`; Vite proxies browser `/api/*` requests to it. The browser never connects directly to LM Studio on port 1234.

## Live investigation stream

Selecting a QA category first opens a bounded record preview. The reviewer selects up to 10 rows; only **Run selected** opens the center-screen activity transcript. Selected rows run sequentially through `POST /api/qa/issues/:viewId/investigate-stream`, one explicit `recordId` per request. The transcript returns server-sent events for:

- model turns and final output;
- reasoning/thinking text when the active model exposes it;
- on-demand skill loads;
- controlled tool calls and their bounded result summaries; and
- QA-evidence, town-resolution, proposal, and town-extract phases.

The stream adapter is model-name agnostic. It recognizes OpenAI-compatible `reasoning_content`, `reasoning`, `thinking`, and `analysis` deltas, typed reasoning content blocks, and common `<think>`, `<analysis>`, or `<reasoning>` template tags. A model that exposes no reasoning still streams its ordinary output and tool activity. The chosen model must still support the tool-calling behavior required by the QA agent.

The browser receives only display-safe summaries for tools; full tool results remain inside the server-side agent loop. The stream sends keep-alives during long local generations. **Stop agent** aborts the browser request, closes the server stream, cancels the upstream LM Studio generation, and prevents later selected rows from starting.

## Configuration

The defaults are intentionally local:

```text
LM_STUDIO_URL=http://127.0.0.1:1234/v1
LM_STUDIO_MODEL=gemma-4-e4b-it
MAD_AGENT_HOST=127.0.0.1
MAD_AGENT_PORT=8787
```

Set a variable in the same PowerShell session before starting the bridge when a different loaded model or port is needed:

```powershell
$env:LM_STUDIO_MODEL = 'your-loaded-model-id'
npm run agent
```

Use `http://127.0.0.1:8787/api/health` to confirm that the bridge sees the configured model.

## Allowed local tools

The model is limited to the selected case and receives these tools:

- `get_case`
- `get_qa_issue_evidence`
- `get_town_extract_summary`
- `get_qa_investigation_packet` — combined case, QA-row, town-resolution, and relationship context for an automatic category investigation
- `get_feature`
- `get_related`
- `capture_map_evidence` — render one active-case point, structure, or road segment over the MassGIS basemap or 2025 orthoimagery and attach the PNG to the next model turn
- `stage_fixture_draft`
- `validate_draft`
- `get_mad_schema_context` — a narrow read of approved MAD relationship metadata
- `massgis_search_layers`
- `massgis_describe_layer`
- `massgis_find_in_town`
- `massgis_find_nearby`

The MassGIS GeoServer tools are read-only and query only public MassGIS WFS evidence. They run from the local bridge, save any returned GeoJSON only under the ignored `.runtime/geoserver-evidence/` directory, and never receive MAD credentials. The agent describes a GeoServer layer before interpreting it and treats the result as supporting evidence, never as the sole basis for an edit.

`capture_map_evidence` accepts a feature key from the active case, not an arbitrary coordinate, path, or map-service URL. The bridge calculates a bounded viewport, zooms out only enough to fit the selected geometry, mosaics the configured MassGIS tiles, draws the current case vectors and labels, and saves a 768-by-768 PNG under `.runtime/map-evidence/`. Red is current geometry, green is proposed geometry, and gold identifies the selected feature. Only the path, background, feature, and viewport metadata enter the audit transcript; the base64 image is kept out of browser events and attached directly to the model's next turn.

Image delivery uses the OpenAI-compatible multimodal content shape with `text` and `image_url` parts. There is no Qwen-, Gemma-, or model-ID branch. The selected LM Studio model must nevertheless be a vision-language model that supports both image input and the tool-calling behavior used by the workbench. Exact coordinates and MAD identifiers continue to come from vector and relationship tools, never from model estimates based on pixels.

`stage_fixture_draft` is deliberately narrow for this MVP: it stages the case's server-declared proposal, retains its source snapshot hash, and runs local validation. It does not create arbitrary geometry or attributes, write any source record, or publish an edit. Evidence-only cases always withhold a draft. A real-data proposal may also be marked reviewable but not publishable when an export omitted the stable identifier required to target the edit safely.

The browser receives the staged `changes` object and shows it in the existing red/current and green/proposed diff sheet. The reviewer can accept only from that complete sheet: acceptance freezes a server-side publisher handoff and validates it through `scripts/arcpy_publish.py`. The default local mode does not edit MAD. Rejecting a draft captures a short comment that the next case-scoped agent request receives as revision context.

## On-demand skills

The local agent has an allow-listed skill registry under `agent-skills/`. It receives only a compact index—skill ID, purpose, and triggers—with its baseline prompt. It does **not** receive every `SKILL.md` on every request.

When a reviewer explicitly names a skill or uses one of its declared triggers, the model may call the restricted `load_skill` tool. The bridge reads only the registered `SKILL.md`, returns it to that one agent turn, and records the load in the browser's tool trail. The model cannot request an arbitrary file path or discover files outside this registry.

The initial test skill is [QA Evidence Brief](../agent-skills/qa-evidence-brief/SKILL.md). Ask: “Use the QA Evidence Brief skill to give me a field evidence brief.” The expected tool sequence is `load_skill` then `get_case`, followed by the skill's Markdown brief. A normal question, such as “What is the case ID?”, should not load it.

The three additional registered skills are [MAD QA AP](../agent-skills/mad-qa-ap/SKILL.md), [MAD Schema Intelligence](../agent-skills/mad-schema-intelligence/SKILL.md), and [MassGIS GeoServer](../agent-skills/massgis-geoserver/SKILL.md). For external evidence, ask: “Use MassGIS GeoServer to find public open-space polygons near this coordinate.” The expected sequence is `load_skill`, `massgis_search_layers`, `massgis_describe_layer`, then the bounded town or proximity lookup.

## Category reviewer memory

MAD category skills are registered for MA, AV, AP, APC, BRV, BSA, MSN, SNV, ESZ, SN, and ASL. Rejecting a proposal starts a separate LM Studio memory-authoring turn. The model receives the category skill, complete case snapshot, complete staged draft, quoted human correction, and the exact proposal-linked prior run: original prompt, final answer, tool calls/arguments, and tool results. Its only available tool is the required `write_category_skill_memory` call. The structured lesson is appended to the matching category's `references\reviewer-memory.md` sidecar only after server validation.

The model authors the lesson but cannot choose its path. The bridge routes the QA view through an exact allow-list, stamps the entry with its case, proposal, model, timestamp, and source feedback, deduplicates repeat submissions, and records a local JSONL audit event. Only the 12 most recent entries are injected, and only when that exact skill is loaded. The UI shows the active authoring state, target path, and generated lesson. See [SKILL_MEMORY.md](SKILL_MEMORY.md) for the complete contract.

## Local proposal registry

Every staged fixture proposal receives a UUID-based `proposal-*` identifier. The local bridge appends proposal events to `.runtime/proposal-history.csv`: staged, rejected, and accepted. Each row carries the case ID, proposal and parent IDs, root proposal ID, category, concise edit summary, reviewer feedback when present, provider, and the exact LM Studio model ID.

The persistent **Proposal audit CSV** control in the app shows that relative path and opens the fixed file selected in Windows File Explorer. The localhost endpoint accepts no client-supplied path and requires the app's explicit local-action header.

When a reviewer rejects a proposal, the next eligible agent draft becomes its descendant. The agent is told to read the case-scoped proposal lineage before it proposes that revision. The diff sheet displays the lineage, including the rejected parent, its feedback, and the model used for each proposal. The file is local and ignored by Git; it is a lightweight audit aid, not the eventual production audit store.

## Verified local run

On 2026-07-24, the bridge was exercised against the local LM Studio model `qwen3-4b-thinking-2507`:

- It explained why `MAD-2026-1842` was flagged after reading its case snapshot.
- It staged the controlled two-field point-move draft and passed local validation.
- It withheld a draft for the evidence-only case `MAD-2026-1804`.
- It loaded `qa-evidence-brief` only after an explicit skill request, then read the case and returned the required three-section Markdown brief.
- It answered a routine case-ID question without loading the skill.
- It investigated `MADV_QA_ASL_DUPES`, read the Rockport record evidence, resolved Rockport through the town/community lookup, and staged the controlled two-to-one lookup-row proposal.
- It kept that proposal's Accept action blocked because the DBF export did not retain the lookup `OBJECTID`.
- It rendered real MassGIS 2025 imagery around structure `STR-44108`, attached the PNG through the generic multimodal message contract, and `gemma-4-e4b-it` correctly read the selected feature ID from the image.

This confirms the browser proxy, local bridge, LM Studio tool and image loop, Rockport town-extract adapter, draft validation, and response contract. It is not a test against production MAD.
