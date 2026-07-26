# MAD QA Workbench

A map-first QA workbench for reviewing AI-agent proposals against local MAD extracts before any controlled publisher handoff.

The current app focuses on the geometry-and-record inspection loop without connecting to production:

- browse the current daily QA checks by data category, with zero-count checks omitted;
- open a QA category, inspect a bounded preview of its record-level issues, and select up to 10 rows for the local agent;
- run selected issues sequentially, with a visible Stop action that cancels the active LM Studio request and leaves the remaining queue unrun;
- resolve the affected town through MAD community/town identifiers and load that town's extract;
- view address-point, structure, parcel, road, and nearby-address vectors on a Leaflet map;
- switch between the public MassGIS basemap and MassGIS 2025 natural-color imagery, and control vector visibility;
- click the map to list every feature from the enabled vector layers at that location, then open its full attribute table;
- keep the selected feature highlighted on the map and use the attribute-table back arrow to return to the prior feature or click-result list;
- follow preset relations between address points, Master Address, MAD structure, structure lookup, address variants, and parcel;
- ask a local LM Studio agent to explain the selected evidence or stage its controlled review draft;
- watch the automatic investigation live in the center workspace, including model output and tagged on-demand skill/tool activity;
- coordinate several trusted reviewers on one AWS WorkSpace through initials,
  shared FIFO positions, exclusive review claims, and duplicate-work checks;
- attribute every follow-up prompt and rejected-to-accepted proposal recovery in
  an append-only reviewer activity log;
- have the local agent turn rejected-proposal feedback into a structured lesson in the exact QA category's append-only reviewer memory, with the target and active authoring state visible in the UI;
- inspect staged field changes as red/current and green/proposed values;
- accept an eligible address-point proposal locally in the training workspace.
- open the append-only proposal audit CSV directly from the persistent left panel.

## Run it

The easiest local start is to double-click **Start MAD QA Workbench.cmd** in this folder. It starts LM Studio when needed, loads the configured local model, starts the agent bridge and app, then opens the workbench in your browser.

For a new-machine install assisted by an LLM or coding agent, use [docs/AGENT_INSTALLATION_GUIDE.md](docs/AGENT_INSTALLATION_GUIDE.md). It covers dependency discovery, the minimal pinned Python entry point in [requirements-local.txt](requirements-local.txt), one-environment setup, LM Studio/model preparation, startup, verification, and recovery from common Windows failures.

> [!IMPORTANT]
> The current release supports trusted users in separate Windows sessions on
> one AWS WorkSpace, using one bridge and self-entered initials. It is not an
> authenticated, multi-machine intranet service: initials are not SSO and the
> local state requires exactly one Node process. See
> [Current multi-user status](docs/AGENT_INSTALLATION_GUIDE.md#2-current-multi-user-status)
> for the exact boundary and deployment runbook.

Proposal events are recorded in `.runtime\proposal-history.csv`. The left-panel **Proposal audit CSV** control shows this path and, on Windows, opens the file selected in File Explorer through a fixed localhost-only action.

Shared reviewer activity is appended to
`.runtime\reviewer-agent-activity.jsonl`. It records issue ownership, claims,
every case follow-up prompt, staged revisions, human decisions, and recovery
credit when a rejected proposal is revised and later accepted.

The local agent authors lessons from human corrections under `agent-skills\mad-qa-<category>\references\reviewer-memory.md`; they are loaded only with the matching skill. See [docs/SKILL_MEMORY.md](docs/SKILL_MEMORY.md) for the forced memory-tool turn, routing, provenance, validation, deduplication, safety, and audit behavior.

For development, use two PowerShell windows:

First window:

```powershell
npm install
npm run agent
```

Second window:

```powershell
npm run dev
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

For several users on one AWS WorkSpace, run one shared service under an approved
account and have everyone open
[http://127.0.0.1:8787](http://127.0.0.1:8787):

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File '.\scripts\start-shared-workbench.ps1' `
  -PythonPath 'C:\absolute\path\to\python.exe' `
  -Model 'gemma-4-e4b-it'
```

```powershell
npm test
npm run build
```

## Optional local LM Studio agent

The app can connect to a model already running in LM Studio through a localhost-only bridge. The double-click launcher starts it for you; for manual development, run `npm run agent` in a second terminal. See [docs/LOCAL_LM_STUDIO_AGENT.md](docs/LOCAL_LM_STUDIO_AGENT.md) for setup, configuration, allowed tools, and the important training-only limits.

## Demonstrated feature relationships

1. Address point → Master Address → structure → structure lookup → address variant.
2. Address point → parcel and road-context records.
3. Neighboring address points as clickable sequence context.
4. A no-proposal state for cases that need municipal evidence.

The primary queue is parsed from the supplied daily QA report. Rockport currently provides the first real town-extract proof case; the older examples remain under **Training examples**. Basemap and imagery tiles are referenced from public MassGIS services, and no private credential is embedded in the client. See [docs/QA_CATEGORY_TOWN_WORKFLOW.md](docs/QA_CATEGORY_TOWN_WORKFLOW.md) for the current data contract and limitations.

## Optional public MAD test fixture

This workspace can also show a read-only, public Brookline MAD snapshot in the left-hand list. It contains Basic Address Points joined to the Advanced Address List by `ADDRESS_ID`; it has no edit or publish action.

```powershell
python scripts/build_public_mad_fixture.py
```

The generator expects the downloaded MassGIS Brookline archives under `.data/mad/brookline/` and writes an ignored local file at `public/test-data/brookline-mad-snapshot.json`. See [docs/PUBLIC_MAD_TEST_FIXTURE.md](docs/PUBLIC_MAD_TEST_FIXTURE.md) for download, metadata, provenance, and limitations.

## Agent-facing contract

The controlled changeset helper remains in `src/lib/geometry.js` and follows [schemas/changeset.schema.json](schemas/changeset.schema.json). It is deliberately outside the default review screen; a future agent/Case API should use it after the human finishes feature inspection, rather than requiring reviewers to read raw JSON.

Case snapshots live in `src/data/cases.js`. Each case includes:

- spatial context and related records;
- the source version and row hash;
- a proposed geometry, or an explicit decision to withhold one;
- values used to build the on-demand feature tables and preset relates.

## Production integration boundary

The **Accept proposal** action calls the localhost bridge, which freezes a server-side publisher handoff and runs the ArcPy adapter in validate mode by default. A production implementation must retain that authenticated server boundary; the browser never receives direct MAD access.

The publisher should:

1. freeze and sign the approved changeset;
2. retrieve affected production rows again;
3. compare source version, edit date, and row hashes;
4. open one transactional ArcPy edit session or child geodatabase version;
5. apply only allow-listed operations;
6. rerun schema, relational, spatial, address-logic, and locator checks;
7. commit on success or roll back completely;
8. append the result and reviewer identity to the case audit history.

See [docs/ARCPY_BRIDGE.md](docs/ARCPY_BRIDGE.md) for the proposed handoff contract.
