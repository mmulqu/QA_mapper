# Local LM Studio agent bridge

The workbench can now use a local LM Studio model for one synthetic QA case at a time. It is a training-only integration: it can explain case evidence and stage a controlled fixture draft for review, but it cannot access MAD, ArcPy, a database, or production credentials.

## Run locally

For the normal local workflow, double-click **Start MAD QA Workbench.cmd** in the project root. It starts LM Studio when necessary, loads the configured model, starts the local agent bridge and Vite, then opens the browser.

For manual development:

1. In LM Studio, load a tool-capable model and start its local server. The current workstation has `qwen3-4b-thinking-2507` available at `http://127.0.0.1:1234/v1`.
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

## Configuration

The defaults are intentionally local:

```text
LM_STUDIO_URL=http://127.0.0.1:1234/v1
LM_STUDIO_MODEL=qwen3-4b-thinking-2507
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
- `get_feature`
- `get_related`
- `stage_fixture_draft`
- `validate_draft`

`stage_fixture_draft` is deliberately narrow for this MVP: it stages the predeclared, synthetic fixture proposal from `src/data/cases.js`, retains its source snapshot hash, and runs local validation. It does not create arbitrary geometry or attributes, write any source record, or publish an edit. Evidence-only cases always withhold a draft.

The browser receives the staged `changes` object and shows it in the existing red/current and green/proposed diff sheet. The reviewer can accept only from that complete sheet: acceptance freezes a server-side publisher handoff and validates it through `scripts/arcpy_publish.py`. The default local mode does not edit MAD. Rejecting a draft captures a short comment that the next case-scoped agent request receives as revision context.

## On-demand skills

The local agent has an allow-listed skill registry under `agent-skills/`. It receives only a compact index—skill ID, purpose, and triggers—with its baseline prompt. It does **not** receive every `SKILL.md` on every request.

When a reviewer explicitly names a skill or uses one of its declared triggers, the model may call the restricted `load_skill` tool. The bridge reads only the registered `SKILL.md`, returns it to that one agent turn, and records the load in the browser's tool trail. The model cannot request an arbitrary file path or discover files outside this registry.

The initial test skill is [QA Evidence Brief](../agent-skills/qa-evidence-brief/SKILL.md). Ask: “Use the QA Evidence Brief skill to give me a field evidence brief.” The expected tool sequence is `load_skill` then `get_case`, followed by the skill's Markdown brief. A normal question, such as “What is the case ID?”, should not load it.

## Local proposal registry

Every staged fixture proposal receives a UUID-based `proposal-*` identifier. The local bridge appends proposal events to `.runtime/proposal-history.csv`: staged, rejected, and accepted. Each row carries the case ID, proposal and parent IDs, root proposal ID, category, concise edit summary, reviewer feedback when present, provider, and the exact LM Studio model ID.

When a reviewer rejects a proposal, the next eligible agent draft becomes its descendant. The agent is told to read the case-scoped proposal lineage before it proposes that revision. The diff sheet displays the lineage, including the rejected parent, its feedback, and the model used for each proposal. The file is local and ignored by Git; it is a lightweight audit aid, not the eventual production audit store.

## Verified local run

On 2026-07-24, the bridge was exercised against the local LM Studio model `qwen3-4b-thinking-2507`:

- It explained why `MAD-2026-1842` was flagged after reading its case snapshot.
- It staged the controlled two-field point-move draft and passed local validation.
- It withheld a draft for the evidence-only case `MAD-2026-1804`.
- It loaded `qa-evidence-brief` only after an explicit skill request, then read the case and returned the required three-section Markdown brief.
- It answered a routine case-ID question without loading the skill.

This confirms the browser proxy, local bridge, LM Studio tool loop, draft validation, and response contract. It is not a test against production MAD data.
