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

The browser receives the staged `changes` object and shows it in the existing red/current and green/proposed diff sheet. Human acceptance remains a separate, local training action.

## Verified local run

On 2026-07-24, the bridge was exercised against the local LM Studio model `qwen3-4b-thinking-2507`:

- It explained why `MAD-2026-1842` was flagged after reading its case snapshot.
- It staged the controlled two-field point-move draft and passed local validation.
- It withheld a draft for the evidence-only case `MAD-2026-1804`.

This confirms the browser proxy, local bridge, LM Studio tool loop, draft validation, and response contract. It is not a test against production MAD data.
