# QA category and town-extract workflow

Last updated: 2026-07-25

The workbench now starts from the supplied daily MAD QA report instead of opening directly on a synthetic case. The local implementation is a test adapter for the Rockport export; its interfaces are intended to remain stable when the data source is replaced by production QA views and ID-preserving town extracts.

## Current review flow

1. `data/MAD_QA_20260724.txt` is parsed into the left-hand QA queue.
2. Checks are grouped by the report's data category, and only checks with a non-zero count are shown.
3. Selecting a check loads a bounded record preview; it does not start LM Studio.
4. Every row advertises its map status. A reviewer can choose **View map** before running the agent when the row has direct geometry or enough stable identifiers to reach an approved geometric MAD feature.
5. The map request resolves the category-specific relationship, centers on the affected feature, and loads only a 120-meter AOI. The local implementation caps each layer at 50 features and the entire response at 200 features.
6. The pre-agent map shows the relationship used, supports feature identify, full attributes, and preset relates, and provides **Back to rows** and **Run agent on this issue** actions.
7. The reviewer selects up to 10 specific issue rows and starts only that batch. Large counts such as 1,716 remain a triage queue rather than becoming one unbounded agent job.
8. Selected rows run sequentially. **Stop agent** aborts the active LM Studio stream and prevents every remaining selected row from starting.
9. The bridge narrows each selected row through the local read-only adapter.
10. When authoritative issue records are available, the agent reads the record evidence and town-resolution evidence before staging a controlled proposal. Visible mock rows exercise the workflow but remain evidence-only and can never be published.
11. After a proposal, the selected town's vectors load in Leaflet with the MassGIS basemap or 2025 imagery.
12. A reviewer can click one location to query every enabled vector layer there. The result list can include an address, centroid, structure, parcel, road, and community polygon instead of stopping at the topmost polygon.
13. Choosing a result opens its full attributes and highlights that geometry on the map. The back arrow returns through related-record selections and ultimately to the original click-result list. Preset relates open the associated Master Address, lookup, structure, parcel, and address-variant records.
14. The red/current and green/proposed change sheet remains the only place where a proposal can be accepted or rejected.

## QA row to map geometry

The map-preview contract is category-aware. A QA row must provide its own geometry or the stable keys needed to reach an approved geometric feature. The server performs the relationship traversal and returns the relationship description with the preview; the browser does not infer joins or search an entire town.

Examples:

- Address point and centroid checks map directly from their feature geometry.
- Master Address and Address Variant checks resolve to an address point through `ADDRESS_POINT_ID`.
- Address-structure lookup checks map `MAD_ADDPT_STRUCT_LUT.STRUCTURE_ID` to `MAD_STRUCTURES_POLY.STRUCTURE_ID`; the structure polygon is the spatial anchor and the address point remains relational context.
- Base Range Variant checks resolve `MAD_BASE_RANGE_VARIANTS.BASE_SEGMENT_ID` to `MAD_BASE_STREET_ARC.BASE_SEGMENT_ID`.
- Master Street Name and Street Name Variant checks traverse the approved street-name and range relationships before reaching the base street arc.

The local registry declares contracts for MA, AV, AP, APC, BRV, BSA, MSN, SNV, ESZ, and ASL. Only the supplied Rockport ASL row currently has authoritative fixture keys and geometry. Mock rows display **Needs keys** rather than inventing a map location.

## Local Rockport proof case

`MADV_QA_ASL_DUPES` reports 181 statewide duplicate structure-lookup rows. The Rockport DBF export reproduces one duplicate relationship group:

- Address: `8 Alpaca Court`
- Address point: `M_272655_933812`
- Parcel/LOC_ID: `F_894520_3063708`
- Structure: `272643_933827`
- Structure town ID: `252`
- Matching lookup rows: `2`
- Proposed logical result: retain one relationship row

Town selection uses the related Master Address `ADDRESS_TOWN_ID = 252`, confirms `GEOGRAPHIC_TOWN_ID = 252`, and resolves `COMMUNITY_ID = 270` through `MAD_MSAG_COMMUNITY_POLYM` to Rockport.

The proposal is reviewable but cannot be accepted from this export because `MAD_ADDPT_STRUCT_LUT.OBJECTID` was not retained. The app disables **Accept** and explains that an ID-preserving File Geodatabase, GeoPackage, or GeoJSON-style extract is required to identify exactly which duplicate row to remove.

## Local API

- `GET /api/qa/issues` — grouped, non-zero QA catalogue.
- `GET /api/qa/issues/:viewId/records` — bounded record-level preview with statewide count, loaded count, mock/fixture provenance, and the declared UI selection limit.
- `GET /api/qa/issues/:viewId/records/:recordId/map-preview` — pre-agent, relationship-resolved map context with a bounded AOI, feature caps, selected anchor features, and preloaded attribute relates.
- `POST /api/qa/issues/:viewId/investigate-stream` — investigate one explicitly selected `recordId` while streaming model output, optional exposed reasoning, on-demand skills, and controlled tool calls; resolve a town and stage a controlled draft when supported.
- `POST /api/qa/issues/:viewId/investigate` — non-streaming compatibility endpoint for scripted clients.
- `GET /api/towns/:townId/extract` — read-only town vector layers for Leaflet.
- `GET /api/towns/:townId/records?key=:recordKey` — one feature's full attributes and bounded preset related records.
- Existing `/api/cases/:caseId/*` endpoints continue to provide agent chat, proposal lineage, reject/revise, and protected publisher handoff behavior.

The local source adapter is [mad_fixture_adapter.py](../scripts/mad_fixture_adapter.py). It is intentionally allow-listed to Rockport and currently implements record-level narrowing only for `MADV_QA_ASL_DUPES`. Other non-zero checks remain visible, but the agent withholds a proposal and identifies the missing production QA-view connection.

## Production replacement

The production connector should keep the browser contract and replace the local adapter with:

1. An approved read-only query for the selected QA view.
2. A stable issue ID and the affected MAD stable identifiers.
3. Direct issue geometry or every stable key required by the category's registered relationship to a geometric feature.
4. Town resolution using the available `COMMUNITY_ID`, `ADDRESS_TOWN_ID`, or `GEOGRAPHIC_TOWN_ID`, verified against `MAD_MSAG_COMMUNITY_POLYM`.
5. An ID-preserving town export containing relational closure.
6. A source version, edit date, and row hash for every proposed target.
7. Server-side paging or AOI filtering when a full municipal vector layer is too large for one browser response.

No QA SQL credential, MAD database credential, or production write capability is sent to the browser.
