---
name: massgis-geoserver
description: Use this skill when users need standalone CLI access to MassGIS GeoServer tools (schema, layer search/info, ECQL querying, town intersection, proximity search, municipality bbox, and workspace info) without running an MCP stdio server.
---

# MassGIS GeoServer CLI

Run MassGIS geospatial tool operations as standalone Python CLI scripts.

## Workflow

1. Search and inspect candidate layers:
```powershell
python scripts/massgis-search-layers.py --query wetlands
python scripts/massgis-layer-info.py --layer-id massgis:GISDATA.WETLANDS_DEP_POLY
```

2. Confirm exact WFS field names before writing ECQL:
```powershell
python scripts/massgis-describe-schema.py --layer-id massgis:GISDATA.WETLANDS_DEP_POLY
```

3. Query and save full GeoJSON output:
```powershell
python scripts/massgis-query.py --layer-id massgis:GISDATA.WETLANDS_DEP_POLY --cql-filter "\"wetland_typ\" = 'B'"
python scripts/massgis-find-in-town.py --layer-id massgis:GISDATA.WETLANDS_DEP_POLY --municipality CONCORD
python scripts/massgis-find-nearby.py --layer-id massgis:GISDATA.SCHOOLS_PT --latitude 42.3601 --longitude -71.0589 --radius-meters 1000
```

4. Use supporting lookups:
```powershell
python scripts/massgis-get-bbox.py --municipality CAMBRIDGE
python scripts/massgis-list-categories.py
python scripts/massgis-workspace-info.py
```

5. For area/percentage summaries from saved GeoJSON files, use the geodesic analyzer:
```powershell
python scripts/massgis-area-by-type.py `
  --boundary-geojson massgis_data\\openspace_poly_2026-02-19T19-05-48.geojson `
  --target-geojson massgis_data\\wetlandsdep_poly_2026-02-19T19-05-53.geojson `
  --class-field it_valdesc `
  --code-field it_valc `
  --output-json massgis_data\\belle_isle_wetland_percent.json `
  --output-csv massgis_data\\belle_isle_wetland_percent.csv
```

## Script Mapping

- `scripts/massgis-describe-schema.py`
- `scripts/massgis-find-in-town.py`
- `scripts/massgis-find-nearby.py`
- `scripts/massgis-get-bbox.py`
- `scripts/massgis-layer-info.py`
- `scripts/massgis-list-categories.py`
- `scripts/massgis-query.py`
- `scripts/massgis-search-layers.py`
- `scripts/massgis-workspace-info.py`
- `scripts/massgis-area-by-type.py` (post-query area/percentage summaries)

## Guardrails

- Outbound GeoServer WFS requests are tagged for MassGIS filtering with `User-Agent: AI_MM massgis-geoserver-skill/1.0`, `X-Requested-By: AI_MM`, and `X-Agent-Name: AI_MM`.
- Run `massgis-describe-schema` before ECQL queries.
- Keep column names exact and case-sensitive.
- Use fully qualified layer IDs (`massgis:SCHEMA.LAYER`) for cross-layer ECQL clarity.
- Query scripts save full GeoJSON to `massgis_data` unless `--workspace` is provided; the directory is created only when a query actually saves output.
- For area math, prefer geodesic area from EPSG:4326 coordinates instead of relying on reprojection.
- If you reproject for area (`to_crs`), verify no `Infinity`/`NaN` coordinates and valid geometries first.
