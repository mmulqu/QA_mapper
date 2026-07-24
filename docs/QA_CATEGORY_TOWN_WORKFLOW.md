# QA category and town-extract workflow

Last updated: 2026-07-24

The workbench now starts from the supplied daily MAD QA report instead of opening directly on a synthetic case. The local implementation is a test adapter for the Rockport export; its interfaces are intended to remain stable when the data source is replaced by production QA views and ID-preserving town extracts.

## Current review flow

1. `data/MAD_QA_20260724.txt` is parsed into the left-hand QA queue.
2. Checks are grouped by the report's data category, and only checks with a non-zero count are shown.
3. Selecting a check starts a case-scoped LM Studio investigation.
4. The bridge narrows the selected view through the local read-only adapter.
5. When issue records are available, the agent reads the record evidence and town-resolution evidence before staging a controlled proposal.
6. The selected town's vectors load in Leaflet with the MassGIS basemap or 2025 imagery.
7. A reviewer can click an address, centroid, structure, parcel, road, or community polygon to open its attributes. Preset relates open the associated Master Address, lookup, structure, parcel, and address-variant records.
8. The red/current and green/proposed change sheet remains the only place where a proposal can be accepted or rejected.

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
- `POST /api/qa/issues/:viewId/investigate` — narrow the selected category, run the local agent, resolve a town, and stage a controlled draft when supported.
- `GET /api/towns/:townId/extract` — read-only town vector layers for Leaflet.
- `GET /api/towns/:townId/records?key=:recordKey` — one feature's full attributes and bounded preset related records.
- Existing `/api/cases/:caseId/*` endpoints continue to provide agent chat, proposal lineage, reject/revise, and protected publisher handoff behavior.

The local source adapter is [mad_fixture_adapter.py](../scripts/mad_fixture_adapter.py). It is intentionally allow-listed to Rockport and currently implements record-level narrowing only for `MADV_QA_ASL_DUPES`. Other non-zero checks remain visible, but the agent withholds a proposal and identifies the missing production QA-view connection.

## Production replacement

The production connector should keep the browser contract and replace the local adapter with:

1. An approved read-only query for the selected QA view.
2. A stable issue ID and the affected MAD stable identifiers.
3. Town resolution using the available `COMMUNITY_ID`, `ADDRESS_TOWN_ID`, or `GEOGRAPHIC_TOWN_ID`, verified against `MAD_MSAG_COMMUNITY_POLYM`.
4. An ID-preserving town export containing relational closure.
5. A source version, edit date, and row hash for every proposed target.
6. Server-side paging or AOI filtering when a full municipal vector layer is too large for one browser response.

No QA SQL credential, MAD database credential, or production write capability is sent to the browser.
