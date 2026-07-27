# QA Issue Atlas

The QA Issue Atlas is the map-first entry point for the MAD review workflow. It turns the current spatially resolvable QA result rows into one versioned GeoJSON dataset, renders them as clickable red affected features, and lets a reviewer open or queue the exact QA record.

## Current implementation

`scripts/qa-issue-atlas.mjs` performs the refresh pipeline:

1. Read the non-zero QA catalog.
2. Ask the current QA provider for record-level cases.
3. Follow each case's declared map relation to its affected address point, structure polygon, parcel polygon, or base street arc.
4. Convert the bounded case geometry to GeoJSON.
5. Write a versioned GeoJSON artifact.
6. Atomically replace the JSON manifest after the data is complete.

Generated files are local and ignored by Git:

```text
.runtime/
  qa-atlas/
    manifest.json
    issues-<version>.geojson
```

The local bridge exposes:

- `GET /api/qa/atlas` — return the current manifest; build it if none exists.
- `POST /api/qa/atlas/refresh` — rerun the provider and GeoJSON pipeline.

The browser uses the same Leaflet renderer as the existing detailed town and case maps. This removes the WebGL, PMTiles, Tippecanoe, and WSL startup dependencies. The atlas code remains lazy-loaded, so opening the normal QA list does not initialize another map.

The visual stack draws red point, line, and polygon evidence layers over either
MassGIS basemap. The atlas never carries a statewide MAD copy. A click opens the
exact issue card, zooms to it, and asks the shared bridge for one deterministic
250 m public evidence window containing:

- MassGIS Level 3 property-tax parcels;
- MassGIS two-dimensional building structures;
- MassGIS Master Address Points.

The bridge uses fixed, read-only ArcGIS FeatureServer endpoints and an attribute
allowlist. It accepts no client-supplied service URL, caps each layer at 750
features, caches the same bounded request for five minutes across reviewers, and
returns partial results if one public service is unavailable. The red QA layer
is always drawn above these subdued reference layers.

Each returned public feature is clickable. The atlas highlights the selected
parcel, structure, or address point and opens an on-demand attribute inspector
with the allow-listed FeatureServer fields and a link to the official layer
metadata. Parcel owner and mailing-address fields are deliberately excluded.
Closing the public inspector returns to the selected QA issue card.

`GET /api/massgis/context?bbox=<west,south,east,north>&zoom=18&layers=parcels,structures,addresses`
is the only browser contract for these public vectors. It does not expose a MAD
database credential or download an entire municipality or state.

If basemap tiles or public context are unavailable, the local issue vectors
remain visible and the textual issue index remains usable.

## Refresh semantics

The authoritative QA source controls whether an issue exists. Accepting or publishing a proposal does not hide its map feature by itself.

After a change is applied to MAD:

1. Run or refresh the QA SQL views.
2. Click **Refresh QA map**.
3. The pipeline creates a new GeoJSON dataset and manifest.
4. The browser swaps to the new versioned feature collection.
5. A fixed issue disappears only if the refreshed QA source no longer returns it.

This prevents the review app from claiming an issue is fixed when only a proposal status changed. Old versioned GeoJSON files may remain under `.runtime/qa-atlas/` until a later retention cleanup is added; they are audit/debug artifacts and are not queried by the current manifest.

## Current test scope

The current provider maps the seven Rockport QA rows that have real extract-backed or controlled-fault cases:

- four address-point features;
- one base street arc;
- two structure polygons.

The manifest clearly labels this as Rockport fixture scope. The production provider still needs to replace the fixture adapter with the live QA SQL views and resolve each nonspatial row through the same relationship rules used by pre-agent map preview:

- BRV → `BASE_STREET_ARC` through `BASE_SEGMENT_ID`;
- ASL → structure polygon through `STRUCTURE_ID`;
- Master Address / Address Variant → address point through their declared MAD relationships.

## Setup and operations

The double-click launcher resolves a Python interpreter that already has GeoPandas, pandas, and Shapely. It passes that exact interpreter to the local bridge, avoiding the Windows Store `python` alias.

Manual refresh build:

```powershell
npm run atlas:build
```

No WSL compiler or extra browser map package is required. The public context
proxy uses Node's built-in `fetch`; it adds no Python dependency.

## Next production steps

- Implement the live QA SQL provider with bounded paging or server-side cursors.
- Materialize every supported relationship to a stable geometric target.
- Add category/severity/town filters to the feature properties and UI.
- Decide refresh cadence and whether the SQL QA views refresh inside the pipeline or immediately before it.
- Add data retention and per-run metrics: input rows, related/unmapped rows, dataset bytes, build duration, and QA source watermark.
- Add an authenticated production deployment path; the current refresh endpoint is localhost-only.
