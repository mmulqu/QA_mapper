# MAD QA Workbench roadmap

Last updated: 2026-07-24

This is the running implementation record for the workbench. Check off a gate only when the listed acceptance test is demonstrably true; a production MAD edit never originates in the browser.

## Current foundation

- [x] Leaflet review workspace with a persistent case list, vector feature selection, readable attribute tables, and preset record relates.
- [x] Map-level identify workflow that returns all overlapping features from enabled town layers, highlights the chosen geometry, and preserves back navigation to earlier records and the original result list.
- [x] Safe synthetic case snapshots that demonstrate the address point, Master Address, structure, structure lookup, variant, parcel, and road relationships.
- [x] Human accept/reject review controls on the complete diff: acceptance freezes a server-side ArcPy publisher handoff; rejection becomes case-scoped revision context for the local agent.
- [x] Local append-only proposal registry: unique proposal IDs, parent/descendant lineage, category, summary, reviewer feedback, status events, and LM Studio model IDs in `.runtime/proposal-history.csv`.
- [x] On-demand agent change sheet: every existing source value is red, every draft value is green, and new address records are green-only.
- [x] Localhost-only LM Studio agent bridge with case-scoped read tools, controlled fixture-draft staging, validation, and a map-side agent panel.
- [x] Model-agnostic live investigation transcript in the center workspace, with exposed reasoning/output plus tagged skill and tool activity.
- [x] On-demand MAD QA AP, MAD schema, and public MassGIS GeoServer skills; the bridge exposes only bounded, read-only schema and GeoServer evidence tools.
- [x] Public MassGIS basemap and 2025 natural-color imagery tile services in Leaflet.
- [x] Parse the supplied daily QA report into data-category buckets and show only non-zero checks.
- [x] Run a selected QA category through the local agent, resolve its issue town through MAD community/town identifiers, and load that town's read-only vector extract.
- [x] Reproduce the Rockport `MADV_QA_ASL_DUPES` issue at 8 Alpaca Court and stage its controlled review-only duplicate-row proposal.
- [ ] Replace the synthetic case source with a server-backed case API.

## Gate 1 — test-data sandbox

**Outcome:** Codex and the application can inspect and manipulate a small, isolated MAD-like dataset without touching production.

- [ ] Obtain a scrubbed, non-production test extract or test enterprise-geodatabase version containing the six core MAD entities and their relationship keys.
- [ ] Load the extract into a dedicated sandbox database: PostGIS for the long-lived service, or a versioned File Geodatabase/GeoPackage only for the first local import.
- [ ] Preserve a source identifier, source edit date, source row hash, geometry, and the relationship keys on every imported record.
- [ ] Seed representative QA cases: missing point, move point, link address to point, incorrect structure link, and duplicate candidate.
- [ ] Provide a resettable test-case workspace so every automated test begins from a known snapshot.

**Acceptance test:** A person can open a test case, drag/edit only its draft copy, view the generated changeset, reset it, and verify that the source snapshot did not change.

### Current Gate 1 progress

- [x] Load the supplied Rockport MAD shapefile/DBF extract into a read-only local adapter with address points, centroids, structures, parcels, streets, communities, and related MAD tables.
- [x] Expose full Rockport vectors in Leaflet and bounded attribute/preset-relate requests through the localhost bridge.
- [ ] Replace the Rockport shapefile/DBF export with an ID-preserving format; the current lookup table omits `OBJECTID`, so duplicate-row approval is intentionally blocked.
- [x] Downloaded the public Brookline Basic Address Points and Advanced Address List exports on 2026-07-24.
- [x] Built a local 400-point map fixture near a known stacked-point location, preserving original attributes and joining every selected row to the Advanced Address List on `ADDRESS_ID`.
- [x] Exposed the fixture in the app as a **read-only** public snapshot with full point and advanced-address attribute tables.
- [ ] Obtain the secured relational MAD test version required to test structures, variants, lookup records, QA cases, draft operations, and publication preconditions.

The public point export is valuable for browser/display and metadata testing, but it is not a substitute for the relational test MAD. In particular, `ADDR_PT_ID` identifies a location and is shared by stacked points; `ADDRESS_ID` identifies the individual address record and is the fixture's unique feature key.

## Gate 2 — Case API and real MAD read path

**Outcome:** The browser receives small, purpose-built case snapshots, not direct database access.

- [ ] Build a server-side Case API with read-only MAD extraction and case storage.
- [ ] Create relational closure for every case: spatial AOI plus Master Address, point/centroid, structure, lookup, variants, and any shared relationships just outside the AOI.
- [ ] Add API endpoints for cases, selected features, related records, rendered map evidence, draft operations, validation results, audit events, and case reset.
- [ ] Keep all ArcPy/database credentials and enterprise versioning server-side.
- [ ] Map the actual MAD fields, domains, relationship classes, GlobalIDs, and edit-date/hash rule into a versioned data contract.

**Acceptance test:** Selecting a real test case in the app calls the Case API and retrieves the same relational closure that a reviewer sees in ArcGIS Pro.

## Gate 3 — QA SQL result connector

**Outcome:** Existing QA output feeds a triage queue without exposing SQL credentials to the browser.

- [ ] Define one approved read-only SQL view or stored procedure for QA intake.
- [ ] Require a stable `qa_issue_id`, rule/issue type, severity, status, source run date, affected MAD identifiers, issue geometry or AOI, and evidence/message fields.
- [ ] Poll or ingest incrementally through a server-side connector; record the source-run watermark and deduplicate repeat results.
- [ ] Translate each eligible SQL row into a case request; retain a link back to the QA result and rule version.
- [ ] Implement assignment, defer, and close dispositions in the Case API—not the source QA table unless that workflow is explicitly approved.

### Current Gate 3 progress

- [x] Parse `data/MAD_QA_20260724.txt` into 10 non-zero data buckets and 75 selectable QA checks.
- [x] Add the production-facing endpoint shape for category investigation and town-extract loading.
- [x] Implement one local record-level view adapter for `MADV_QA_ASL_DUPES`.
- [ ] Replace the report-file parser and single-view local adapter with the approved QA SQL view connection.

**Acceptance test:** A new QA SQL result appears as one deduplicated case, opens with its affected features and evidence, and retains its original QA-result link.

## Gate 4 — MAD skills and validators

**Outcome:** The agent has versioned, constrained editing knowledge rather than free-form database access.

First skills:

1. Create a missing address point.
2. Move an existing address point.
3. Link a Master Address to an existing point.
4. Link a point to the correct structure.
5. Resolve a probable duplicate.

Each skill must specify its allowed operations, required evidence, preconditions, placement and relationship rules, post-edit validation, human-escalation conditions, and worked examples. Pair each with executable validators and changeset JSON schemas.

- [ ] Confirm actual MAD field mappings and edit policies with the data steward.
- [ ] Create the skills and fixtures against the Gate 1 sandbox.
- [ ] Add regression cases for correct, incorrect, and ambiguous proposals.
- [ ] Require all changeset operations to be allow-listed and preconditioned by source hashes/edit dates.

**Acceptance test:** For every fixture, a skill produces an explainable draft changeset or explicitly withholds a proposal; it never edits the sandbox source records directly.

## Gate 5 — Codex and in-app assistant

**Outcome:** Codex can work through the same restricted tools as the app, and later staff can ask questions or request a draft inside the app.

### Local Codex testing

Codex can already read and change local files in this workspace, including synthetic case fixtures. To test data operations properly, expose the Gate 1 sandbox through narrow tools such as `get_case`, `get_feature`, `get_related_records`, `search_nearby_addresses`, `stage_draft_operation`, `validate_draft`, and `reset_test_case`. Codex should use those tools rather than raw SQL or ArcPy writes.

- [x] Add a local LM Studio bridge backed by the synthetic case fixtures. It exposes `get_case`, `get_feature`, `get_related`, controlled fixture-draft staging, and draft validation on localhost only.
- [x] Exercise the bridge with the local `qwen3-4b-thinking-2507` model: explain a case, stage the eligible draft, and withhold an evidence-only draft.
- [x] Add an allow-listed, on-demand skill loader. The model sees only a compact skill index and loads a full `SKILL.md` only when a prompt explicitly calls for it.
- [x] Stream automatic category investigations over a localhost event channel; normalize common LM Studio reasoning/content formats without tying the UI to one model ID.
- [ ] Replace fixture-draft staging with `stage_draft_operation` against the resettable relational Gate 1 sandbox.
- [ ] Exercise each initial skill as Codex against resettable fixtures.
- [ ] Record every tool call, proposed operation, validator result, and human decision in the test audit trail.

### In-app assistant

The eventual browser chat must call an authenticated server-side agent service. It cannot directly call Codex or hold an OpenAI API key in JavaScript.

`Browser → Case API / agent service → restricted MAD tools → test or production read path → draft changeset → human approval → publisher`

- [ ] Add read-only question answering first: explain a flag, summarize case evidence, and find related records.
- [ ] Add draft-authoring requests second: propose, never publish.
- [ ] Send the assistant a case-scoped toolset and current case snapshot, not the entire MAD database.
- [x] Require a human approval event before a publisher handoff can be queued.

**Acceptance test:** A reviewer can ask why a case was flagged and request a draft; the assistant cites its case evidence, produces a reviewable changeset, and cannot publish it.

## Gate 6 — validation and production publishing

**Outcome:** An approved draft is safely and audibly applied to the intended MAD environment.

- [ ] Run schema, relationship, spatial, address-logic, change-impact, locator-regression, and production-concurrency validation.
- [ ] Freeze the approved changeset and re-read affected production rows before publishing.
- [ ] Apply only allow-listed edits in one ArcPy edit session or child version; roll back as a unit on failure.
- [ ] Store approver, skill/rule versions, tool evidence, preconditions, exact operations, execution output, and final validation results in append-only audit history.
- [ ] Pilot in a test version before any production workflow is considered.

### Current Gate 6 progress

- [x] The browser has no production credentials and cannot directly edit MAD.
- [x] An accepted fixture draft is frozen into an ignored local handoff file, checked for allow-listed operations and snapshot preconditions, then passed to `scripts/arcpy_publish.py` in validate mode.
- [x] A rejected draft collects reviewer context and blocks acceptance until the local agent stages a revised draft.
- [ ] Replace validate-only handoffs with a MAD-specific ArcPy adapter and pilot it in a secured test version.

**Acceptance test:** A stale source hash blocks publication; a valid approval applies transactionally in a test version and leaves an independently reviewable audit record.

## Inputs needed before real-data work starts

1. A safe test extract or test geodatabase connection and approved access method.
2. The MAD entity/field map, domains, relationship classes, GlobalID policy, and geometry SRID.
3. The existing QA SQL result query/view, its owner, and the intended refresh cadence.
4. Written placement, link, merge, retirement, and escalation policies for the first five skills.
5. The preferred authentication, deployment host, audit-retention requirement, and ArcPy/enterprise-version publishing model.

## Public map services now in use

- Basemap: `MassGISBasemap` public ArcGIS Online tile cache.
- Imagery: `Massachusetts_Aerial_Imagery_2025` public natural-color tile cache.

The services are browser-referenced only; no credential is stored in the client. See the official [MassGIS basemap service](https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/MassGISBasemap/MapServer) and [2025 aerial-imagery page](https://www.mass.gov/info-details/massgis-data-2025-aerial-imagery).
