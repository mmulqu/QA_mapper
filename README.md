# MAD QA Workbench

A map-first QA workbench for reviewing AI-agent proposals against local MAD extracts before any controlled publisher handoff.

The current app focuses on the geometry-and-record inspection loop without connecting to production:

- browse the current daily QA checks by data category, with zero-count checks omitted;
- select a QA category and let the local agent narrow it to issue records;
- resolve the affected town through MAD community/town identifiers and load that town's extract;
- view address-point, structure, parcel, road, and nearby-address vectors on a Leaflet map;
- switch between the public MassGIS basemap and MassGIS 2025 natural-color imagery, and control vector visibility;
- click the map to list every feature from the enabled vector layers at that location, then open its full attribute table;
- keep the selected feature highlighted on the map and use the attribute-table back arrow to return to the prior feature or click-result list;
- follow preset relations between address points, Master Address, MAD structure, structure lookup, address variants, and parcel;
- ask a local LM Studio agent to explain the selected evidence or stage its controlled review draft;
- watch the automatic investigation live in the center workspace, including model output and tagged on-demand skill/tool activity;
- inspect staged field changes as red/current and green/proposed values;
- accept an eligible address-point proposal locally in the training workspace.

## Run it

The easiest local start is to double-click **Start MAD QA Workbench.cmd** in this folder. It starts LM Studio when needed, loads the configured local model, starts the agent bridge and app, then opens the workbench in your browser.

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
