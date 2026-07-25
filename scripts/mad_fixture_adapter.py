"""Read-only adapter for the local MAD town export used by the QA workbench.

The production replacement for this module will query secured QA views and create
town exports with stable enterprise identifiers. This adapter deliberately knows
about only the files supplied in ``data/MAD_data_rockport`` and returns JSON.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
from shapely.ops import unary_union


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ROCKPORT_ROOT = PROJECT_ROOT / "data" / "MAD_data_rockport"
ROCKPORT_TOWN_ID = 252

SPATIAL_LAYERS = {
    "addresses": {
        "file": "MAD_ADDRESS_POINTM.shp",
        "id_field": "ADDRESS_PO",
        "label": "Address points",
        "town_field": "GEOGRAPHIC",
    },
    "centroids": {
        "file": "MAD_ADDRESS_POINTM_CENTROID.shp",
        "id_field": "CENTROID_I",
        "label": "Address centroids",
        "town_field": "GEOGRAPHIC",
    },
    "structures": {
        "file": "MAD_STRUCTURES_POLY.shp",
        "id_field": "STRUCTURE_",
        "label": "MAD structures",
        "town_field": "GEOGRAPHIC",
    },
    "parcels": {
        "file": "L3_TAXPAR_POLY_ASSESS.shp",
        "id_field": "LOC_ID",
        "label": "Tax parcels",
        "town_field": "TOWN_ID",
    },
    "roads": {
        "file": "MAD_BASE_STREET_ARC.shp",
        "id_field": "BASE_SEGME",
        "fallback_id_field": "LINK_FEAT_",
        "label": "Base street arcs",
        "town_field": None,
    },
    "communities": {
        "file": "MAD_MSAG_COMMUNITY_POLYM.shp",
        "id_field": "COMMUNITY_",
        "label": "MSAG communities",
        "town_field": "ADDRESS_TO",
    },
}

TABLE_FILES = {
    "structure-lookup": "MAD_ADDPT_STRUCT_LUT.dbf",
    "master-address": "MAD_MASTER_ADDRESS.dbf",
    "master-address-street": "MADV_MASTER_ADDRESS_STNAME.dbf",
    "address-variant": "MAD_ADDRESS_VARIANTS.dbf",
    "street-name": "MAD_MASTER_STREET_NAME.dbf",
    "range-variant": "MAD_BASE_RANGE_VARIANTS.dbf",
}

FIELD_ALIASES = {
    "ADDRESS_PO": "ADDRESS_POINT_ID",
    "STRUCTURE_": "STRUCTURE_ID",
    "STRUCTURE1": "STRUCTURE_TOWN_ID",
    "MASTER_ADD": "MASTER_ADDRESS_ID",
    "FULL_NUMBE": "FULL_NUMBER_STANDARDIZED",
    "STREET_NAM": "STREET_NAME_ID",
    "STREET_N_1": "STREET_NAME",
    "COMMUNITY_": "COMMUNITY_ID",
    "COMMUNITY1": "COMMUNITY_NAME",
    "ADDRESS_TO": "ADDRESS_TOWN_ID",
    "GEOGRAPHIC": "GEOGRAPHIC_TOWN_ID",
    "CENTROID_I": "CENTROID_ID",
    "BASE_SEGME": "BASE_SEGMENT_ID",
    "LINK_FEAT_": "LINK_FEAT_ID",
    "BUILDING_C": "BUILDING_COUNT",
    "BUILDING_A": "BUILDING_AREA_SQ_FT",
    "ADDRESS_ST": "ADDRESS_STATUS",
}


def fail(message: str) -> None:
    print(json.dumps({"ok": False, "error": message}))
    raise SystemExit(1)


def scalar(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        value = value.item()
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def clean_properties(row: pd.Series, excluded: set[str] | None = None) -> dict[str, Any]:
    excluded = excluded or set()
    properties: dict[str, Any] = {}
    for field, value in row.items():
        if field in excluded or field == "geometry":
            continue
        cleaned = scalar(value)
        if cleaned is not None and cleaned != "":
            properties[field] = cleaned
    return properties


def read_frame(filename: str) -> gpd.GeoDataFrame | pd.DataFrame:
    path = ROCKPORT_ROOT / filename
    if not path.exists():
        raise FileNotFoundError(f"Missing Rockport export file: {path.name}")
    return gpd.read_file(path)


def town_community(town_id: int) -> dict[str, Any]:
    communities = read_frame(SPATIAL_LAYERS["communities"]["file"])
    matches = communities[communities["ADDRESS_TO"] == town_id]
    if matches.empty:
        raise ValueError(f"No MSAG community polygon has ADDRESS_TOWN_ID {town_id}.")
    row = matches.iloc[0]
    return {
        "name": str(row["COMMUNITY1"]).title(),
        "addressTownId": int(row["ADDRESS_TO"]),
        "communityIds": sorted(int(value) for value in matches["COMMUNITY_"].dropna().unique()),
        "sourceLayer": "MAD_MSAG_COMMUNITY_POLYM",
        "lookup": "ADDRESS_TOWN_ID → COMMUNITY_ID / COMMUNITY_NAME",
    }


def coordinate_list(geometry: Any) -> Any:
    if geometry is None or geometry.is_empty:
        return None
    projected = gpd.GeoSeries([geometry], crs=26986).to_crs(4326).iloc[0]
    interface = projected.__geo_interface__
    return interface["coordinates"]


def latlng_ring(geometry: Any) -> list[list[float]]:
    coordinates = coordinate_list(geometry)
    if not coordinates:
        return []
    if geometry.geom_type == "Polygon":
        ring = coordinates[0]
    elif geometry.geom_type == "MultiPolygon":
        ring = coordinates[0][0]
    elif geometry.geom_type == "LineString":
        ring = coordinates
    elif geometry.geom_type == "MultiLineString":
        ring = coordinates[0]
    else:
        return []
    return [[float(latitude), float(longitude)] for longitude, latitude in ring]


def representative_latlngs(geometry: Any) -> list[list[float]]:
    coordinates = coordinate_list(geometry)
    if not coordinates:
        return []
    if geometry.geom_type == "Point":
        longitude, latitude = coordinates
        return [[float(latitude), float(longitude)]]
    if geometry.geom_type == "MultiPoint":
        return [[float(latitude), float(longitude)] for longitude, latitude in coordinates]
    point = geometry.representative_point()
    longitude, latitude = coordinate_list(point)
    return [[float(latitude), float(longitude)]]


def row_hash(payload: Any) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf8")
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def find_duplicate_structure_lookups() -> list[dict[str, Any]]:
    lookup = read_frame(TABLE_FILES["structure-lookup"])
    keys = ["ADDRESS_PO", "LOC_ID", "STRUCTURE_", "STRUCTURE1"]
    duplicated = lookup[lookup.duplicated(keys, keep=False)]
    if duplicated.empty:
        return []

    address_points = read_frame(SPATIAL_LAYERS["addresses"]["file"])
    master_addresses = read_frame(TABLE_FILES["master-address"])
    address_street = read_frame(TABLE_FILES["master-address-street"])
    structures = read_frame(SPATIAL_LAYERS["structures"]["file"])
    parcels = read_frame(SPATIAL_LAYERS["parcels"]["file"])
    roads = read_frame(SPATIAL_LAYERS["roads"]["file"])
    communities = read_frame(SPATIAL_LAYERS["communities"]["file"])

    cases: list[dict[str, Any]] = []
    for values, rows in duplicated.groupby(keys, dropna=False):
        address_point_id, loc_id, structure_id, structure_town_id = values
        ap_matches = address_points[address_points["ADDRESS_PO"] == address_point_id]
        if ap_matches.empty:
            continue
        ap = ap_matches.iloc[0]
        ap_geometry = ap.geometry
        ap_latlngs = representative_latlngs(ap_geometry)
        center = [
            sum(point[0] for point in ap_latlngs) / len(ap_latlngs),
            sum(point[1] for point in ap_latlngs) / len(ap_latlngs),
        ]

        ma_matches = master_addresses[master_addresses["ADDRESS_PO"] == address_point_id]
        street_matches = address_street[address_street["ADDRESS_PO"] == address_point_id]
        structure_matches = structures[structures["STRUCTURE_"] == structure_id]
        parcel_matches = parcels[parcels["LOC_ID"] == loc_id]

        address_number = str(street_matches.iloc[0]["FULL_NUMBE"]) if not street_matches.empty else ""
        street_name = str(street_matches.iloc[0]["STREET_N_1"]) if not street_matches.empty else ""
        address = " ".join(part for part in [address_number, street_name.title()] if part).strip() or str(address_point_id)

        geographic_town_id = scalar(ap.get("GEOGRAPHIC"))
        address_town_id = scalar(ma_matches.iloc[0].get("ADDRESS_TO")) if not ma_matches.empty else None
        community_id = scalar(ap.get("COMMUNITY_"))
        community_match = communities[
            (communities["ADDRESS_TO"] == int(address_town_id or structure_town_id))
            & (communities["COMMUNITY_"] == int(community_id))
        ]
        if community_match.empty:
            community_match = communities[communities["ADDRESS_TO"] == int(address_town_id or structure_town_id)]
        town_name = str(community_match.iloc[0]["COMMUNITY1"]).title() if not community_match.empty else "Unknown"

        road_geometry: Any = None
        if not roads.empty:
            distances = roads.geometry.distance(ap_geometry.centroid)
            road_geometry = roads.loc[distances.idxmin()].geometry

        nearby = address_points[address_points.geometry.distance(ap_geometry.centroid) <= 120].copy()
        nearby = nearby[nearby["ADDRESS_PO"] != address_point_id].head(10)
        nearby_points = []
        for _, nearby_row in nearby.iterrows():
            positions = representative_latlngs(nearby_row.geometry)
            if not positions:
                continue
            nearby_points.append({
                "id": str(nearby_row["ADDRESS_PO"]),
                "address": str(nearby_row.get("LABEL_TEXT") or nearby_row["ADDRESS_PO"]),
                "position": positions[0],
            })

        structure_geometry = structure_matches.iloc[0].geometry if not structure_matches.empty else None
        parcel_geometry = parcel_matches.iloc[0].geometry if not parcel_matches.empty else None
        duplicate_rows = [clean_properties(row) for _, row in rows.iterrows()]
        relation = {
            "ADDRESS_POINT_ID": str(address_point_id),
            "LOC_ID": str(loc_id),
            "STRUCTURE_ID": str(structure_id),
            "STRUCTURE_TOWN_ID": int(structure_town_id),
        }
        case_id = f"MADV_QA_ASL_DUPES-{int(structure_town_id)}-{str(address_point_id).replace('_', '-')}"
        master_address_id = (
            str(int(ma_matches.iloc[0]["MASTER_ADD"]))
            if not ma_matches.empty and pd.notna(ma_matches.iloc[0]["MASTER_ADD"])
            else "Unavailable"
        )

        case_payload = {
            "id": case_id,
            "address": address,
            "municipality": town_name,
            "issueType": "Duplicate structure lookup",
            "issueCode": "MADV_QA_ASL_DUPES",
            "status": "ready",
            "priority": "Medium",
            "confidence": 99,
            "reportedBy": "MADV_QA_ASL_DUPES",
            "reportedAt": None,
            "due": "Review",
            "operationKind": "remove-duplicate",
            "recommendation": "Delete exactly one of the two identical address-point/structure lookup rows.",
            "rationale": (
                "The Rockport extract contains two lookup rows with identical ADDRESS_POINT_ID, "
                "LOC_ID, STRUCTURE_ID, and STRUCTURE_TOWN_ID values. One relationship should remain."
            ),
            "publishEligible": False,
            "publishBlocker": (
                "The shapefile/DBF export omitted the lookup OBJECTID. Reload this case from an "
                "ID-preserving geodatabase or GeoJSON export before approval can target one row safely."
            ),
            "center": center,
            "zoom": 19,
            "geometry": {
                "current": ap_latlngs[0] if ap_latlngs else center,
                "currentParts": ap_latlngs,
                "proposed": None,
                "parcel": latlng_ring(parcel_geometry),
                "structure": latlng_ring(structure_geometry),
                "road": latlng_ring(road_geometry),
                "nearby": nearby_points,
            },
            "records": {
                "addressPoint": {"id": str(address_point_id), "globalId": "Not present in shapefile export"},
                "masterAddress": {"id": master_address_id, "globalId": "MA_UUID retained; GlobalID unavailable"},
                "structure": {"id": str(structure_id), "globalId": "Not present in shapefile export"},
                "variant": {"id": "Related variants available in town extract", "value": address.upper()},
            },
            "operations": [{
                "id": "OP-1",
                "type": "remove_duplicate_structure_lookup",
                "target": f"{address_point_id} → {structure_id}",
                "detail": "Remove one duplicate row while retaining one identical relationship.",
                "preconditions": {
                    "matchingRowCount": len(rows),
                    "stableRowId": None,
                },
            }],
            "changes": [{
                "id": "CHG-1",
                "entityLabel": "Structure lookup relationship",
                "entityId": f"{address_point_id} → {structure_id}",
                "mapTarget": f"addresses:{address_point_id}",
                "summary": "Reduce two identical lookup rows to one",
                "fields": [
                    {"field": "MATCHING_RELATIONSHIP_ROWS", "before": len(rows), "after": 1},
                    {"field": "RELATIONSHIP_STATUS", "before": "DUPLICATE", "after": "UNIQUE"},
                ],
            }],
            "evidence": [
                {
                    "source": "MADV_QA_ASL_DUPES logic",
                    "date": "2026-07-24",
                    "detail": "Duplicate partition over the four relationship fields.",
                    "tone": "orange",
                },
                {
                    "source": "Rockport MAD export",
                    "date": "2026-07-24",
                    "detail": f"Two matching lookup rows for {address_point_id}.",
                    "tone": "blue",
                },
                {
                    "source": "MAD_MSAG_COMMUNITY_POLYM",
                    "date": "2026-07-24",
                    "detail": f"ADDRESS_TOWN_ID {address_town_id} resolves to {town_name}.",
                    "tone": "blue",
                },
            ],
            "snapshot": {
                "exportedAt": "2026-07-24T13:02:00-04:00",
                "source": "MAD_data_rockport shapefile/DBF export",
                "version": "rockport-local-2026-07-24",
                "rowHash": row_hash(duplicate_rows),
                "wkid": 26986,
                "stableIdsRetained": False,
            },
            "qaEvidence": {
                "viewId": "MADV_QA_ASL_DUPES",
                "viewPurpose": "Find functionally duplicative MAD_ADDPT_STRUCT_LUT rows.",
                "relationship": relation,
                "matchingRowCount": len(rows),
                "matchingRows": duplicate_rows,
                "fieldAliases": {
                    "ADDRESS_PO": "ADDRESS_POINT_ID",
                    "STRUCTURE_": "STRUCTURE_ID",
                    "STRUCTURE1": "STRUCTURE_TOWN_ID",
                },
                "masterAddresses": [clean_properties(row) for _, row in ma_matches.iterrows()],
                "townResolution": {
                    "selectedTown": town_name,
                    "addressTownId": address_town_id,
                    "geographicTownId": geographic_town_id,
                    "communityId": community_id,
                    "structureTownId": scalar(structure_town_id),
                    "lookupLayer": "MAD_MSAG_COMMUNITY_POLYM",
                    "lookupResult": clean_properties(community_match.iloc[0]) if not community_match.empty else None,
                },
            },
            "townExtractSummary": {
                "town": town_name,
                "townId": int(address_town_id or structure_town_id),
                "communityId": int(community_id),
                "sourceDirectory": "data/MAD_data_rockport",
                "selectionRule": (
                    "ADDRESS_TOWN_ID from the related Master Address was matched to "
                    "MAD_MSAG_COMMUNITY_POLYM.ADDRESS_TOWN_ID; COMMUNITY_ID confirmed ROCKPORT."
                ),
            },
        }
        cases.append(case_payload)
    return cases


def build_town_extract(town_id: int) -> dict[str, Any]:
    if town_id != ROCKPORT_TOWN_ID:
        raise ValueError(f"The local fixture currently contains only town ID {ROCKPORT_TOWN_ID} (Rockport).")

    town = town_community(town_id)
    layers = []
    all_bounds: list[float] | None = None

    for layer_id, definition in SPATIAL_LAYERS.items():
        frame = read_frame(definition["file"])
        town_field = definition["town_field"]
        if town_field:
            frame = frame[frame[town_field] == town_id]
        if frame.empty:
            continue

        if layer_id in {"structures", "parcels", "roads", "communities"}:
            frame = frame.copy()
            frame.geometry = frame.geometry.simplify(0.35, preserve_topology=True)
        frame = frame.to_crs(4326)

        feature_collection = {"type": "FeatureCollection", "features": []}
        for index, row in frame.iterrows():
            stable_id = scalar(row.get(definition["id_field"]))
            if stable_id in (None, "") and definition.get("fallback_id_field"):
                stable_id = scalar(row.get(definition["fallback_id_field"]))
            if stable_id in (None, ""):
                stable_id = f"row-{index}"
            record_key = f"{layer_id}:{stable_id}"
            properties = clean_properties(row)
            properties["__layer"] = layer_id
            properties["__id"] = str(stable_id)
            properties["__recordKey"] = record_key
            feature_collection["features"].append({
                "type": "Feature",
                "id": record_key,
                "properties": properties,
                "geometry": row.geometry.__geo_interface__,
            })

        bounds = [float(value) for value in frame.total_bounds]
        if all_bounds is None:
            all_bounds = bounds
        else:
            all_bounds = [
                min(all_bounds[0], bounds[0]),
                min(all_bounds[1], bounds[1]),
                max(all_bounds[2], bounds[2]),
                max(all_bounds[3], bounds[3]),
            ]
        layers.append({
            "id": layer_id,
            "label": definition["label"],
            "count": len(frame),
            "idField": definition["id_field"],
            "source": definition["file"],
            "geojson": feature_collection,
        })

    return {
        "kind": "mad-town-extract",
        "town": town,
        "bounds": all_bounds,
        "center": [
            (all_bounds[1] + all_bounds[3]) / 2,
            (all_bounds[0] + all_bounds[2]) / 2,
        ],
        "zoom": 14,
        "layers": layers,
        "fieldAliases": FIELD_ALIASES,
        "metadata": {
            "source": "data/MAD_data_rockport",
            "exportedAt": "2026-07-24T13:02:00-04:00",
            "readOnly": True,
            "stableIdsRetained": False,
        },
    }


QA_PREVIEW_BUFFER_METERS = 120
QA_PREVIEW_LAYER_LIMIT = 50
QA_PREVIEW_TOTAL_LIMIT = 200
QA_PREVIEW_LAYERS = {
    "MADV_QA_ASL_DUPES": ["addresses", "centroids", "structures", "parcels", "roads"],
}


def feature_collection_for_frame(layer_id: str, definition: dict[str, Any], frame: gpd.GeoDataFrame) -> dict[str, Any]:
    feature_collection: dict[str, Any] = {"type": "FeatureCollection", "features": []}
    for index, row in frame.iterrows():
        stable_id = scalar(row.get(definition["id_field"]))
        if stable_id in (None, "") and definition.get("fallback_id_field"):
            stable_id = scalar(row.get(definition["fallback_id_field"]))
        if stable_id in (None, ""):
            stable_id = f"row-{index}"
        record_key = f"{layer_id}:{stable_id}"
        properties = clean_properties(row)
        properties["__layer"] = layer_id
        properties["__id"] = str(stable_id)
        properties["__recordKey"] = record_key
        feature_collection["features"].append({
            "type": "Feature",
            "id": record_key,
            "properties": properties,
            "geometry": row.geometry.__geo_interface__,
        })
    return feature_collection


def build_qa_map_preview(view_id: str, record_id: str) -> dict[str, Any]:
    if view_id not in QA_PREVIEW_LAYERS:
        raise ValueError(
            f"{view_id} does not have local record geometry. Production must resolve its approved QA-to-feature relate first."
        )
    cases = find_duplicate_structure_lookups()
    case_item = next((candidate for candidate in cases if candidate["id"] == record_id), None)
    if case_item is None:
        raise ValueError("The selected QA row has no authoritative geometry in the local fixture.")

    address_point_id = str(case_item["records"]["addressPoint"]["id"])
    structure_id = str(case_item["records"]["structure"]["id"])
    address_frame = read_frame(SPATIAL_LAYERS["addresses"]["file"])
    structure_frame = read_frame(SPATIAL_LAYERS["structures"]["file"])
    if structure_frame.crs != address_frame.crs:
        structure_frame = structure_frame.to_crs(address_frame.crs)
    structure_matches = find_row(structure_frame, "STRUCTURE_", structure_id)
    anchor_geometries = [
        geometry
        for geometry in (structure_matches.geometry.tolist() if not structure_matches.empty else [])
        if geometry is not None and not geometry.is_empty
    ]
    if not anchor_geometries:
        raise ValueError("The approved QA relationship did not resolve STRUCTURE_ID to a structure polygon.")

    anchor_geometry = unary_union(anchor_geometries)
    preview_area = anchor_geometry.buffer(QA_PREVIEW_BUFFER_METERS)
    preview_area_wgs84 = gpd.GeoSeries([preview_area], crs=address_frame.crs).to_crs(4326)
    preview_bounds = [float(value) for value in preview_area_wgs84.total_bounds]
    layers = []
    remaining = QA_PREVIEW_TOTAL_LIMIT

    for layer_id in QA_PREVIEW_LAYERS[view_id]:
        if remaining <= 0:
            break
        definition = SPATIAL_LAYERS[layer_id]
        frame = read_frame(definition["file"])
        if not isinstance(frame, gpd.GeoDataFrame) or frame.empty:
            continue
        if frame.crs != address_frame.crs:
            frame = frame.to_crs(address_frame.crs)
        town_field = definition["town_field"]
        if town_field:
            frame = frame[frame[town_field] == ROCKPORT_TOWN_ID]
        frame = frame[frame.geometry.intersects(preview_area)].copy()
        if frame.empty:
            continue

        frame["__preview_distance"] = frame.geometry.distance(anchor_geometry.centroid)
        frame = frame.sort_values("__preview_distance").head(min(QA_PREVIEW_LAYER_LIMIT, remaining))
        frame = frame.drop(columns=["__preview_distance"])
        if layer_id in {"structures", "parcels", "roads"}:
            frame.geometry = frame.geometry.simplify(0.35, preserve_topology=True)
        frame = frame.to_crs(4326)
        feature_collection = feature_collection_for_frame(layer_id, definition, frame)
        count = len(feature_collection["features"])
        remaining -= count
        layers.append({
            "id": layer_id,
            "label": definition["label"],
            "count": count,
            "idField": definition["id_field"],
            "source": definition["file"],
            "geojson": feature_collection,
        })

    record_bundle = build_record_bundle(
        ROCKPORT_TOWN_ID,
        f"addresses:{address_point_id}",
    )
    preview_case = {
        **case_item,
        "status": "preview",
        "recommendation": "No agent investigation has run. Review the bounded map context first.",
        "operations": [],
        "changes": [],
        "publishEligible": False,
        "publishBlocker": "A pre-agent map preview cannot be accepted or published.",
    }
    relation = {
        "qaEntity": "MAD_ADDPT_STRUCT_LUT",
        "anchorEntity": "MAD_STRUCTURES_POLY",
        "anchorFeatureKeys": [
            f"structures:{structure_id}",
        ],
        "path": [
            {
                "from": "MAD_ADDPT_STRUCT_LUT.STRUCTURE_ID",
                "to": "MAD_STRUCTURES_POLY.STRUCTURE_ID",
            },
        ],
        "description": (
            "The nonspatial lookup row is mapped through STRUCTURE_ID to its structure polygon. "
            "The address point remains nearby relational context."
        ),
    }
    extract = {
        "kind": "mad-qa-map-preview-extract",
        "town": town_community(ROCKPORT_TOWN_ID),
        "bounds": preview_bounds,
        "center": [
            (preview_bounds[1] + preview_bounds[3]) / 2,
            (preview_bounds[0] + preview_bounds[2]) / 2,
        ],
        "zoom": 18,
        "layers": layers,
        "metadata": {
            "source": "data/MAD_data_rockport",
            "readOnly": True,
            "preAgent": True,
            "bufferMeters": QA_PREVIEW_BUFFER_METERS,
            "maxFeaturesPerLayer": QA_PREVIEW_LAYER_LIMIT,
            "maxTotalFeatures": QA_PREVIEW_TOTAL_LIMIT,
            "loadedFeatureCount": sum(layer["count"] for layer in layers),
            "relation": relation,
        },
    }
    return {
        "kind": "mad-qa-map-preview",
        "viewId": view_id,
        "recordId": record_id,
        "caseItem": preview_case,
        "extract": extract,
        "records": record_bundle["records"],
        "selectedFeatureKey": f"structures:{structure_id}",
        "relation": relation,
        "limits": {
            "bufferMeters": QA_PREVIEW_BUFFER_METERS,
            "maxFeaturesPerLayer": QA_PREVIEW_LAYER_LIMIT,
            "maxTotalFeatures": QA_PREVIEW_TOTAL_LIMIT,
        },
    }


def record_shape(key: str, label: str, stable_id: str, row: pd.Series) -> dict[str, Any]:
    properties = clean_properties(row)
    attributes = [
        {
            "field": FIELD_ALIASES.get(field, field),
            "sourceField": field,
            "value": value,
        }
        for field, value in properties.items()
    ]
    return {
        "key": key,
        "label": label,
        "id": stable_id,
        "attributes": attributes,
        "related": [],
    }


def find_row(frame: pd.DataFrame, field: str, value: str) -> pd.DataFrame:
    return frame[frame[field].astype(str) == str(value)]


def build_record_bundle(town_id: int, record_key: str) -> dict[str, Any]:
    if town_id != ROCKPORT_TOWN_ID:
        raise ValueError(f"The local fixture currently contains only town ID {ROCKPORT_TOWN_ID}.")
    if ":" not in record_key:
        raise ValueError("Record key must contain a layer and ID.")
    layer_id, stable_id = record_key.split(":", 1)
    if layer_id not in SPATIAL_LAYERS:
        raise ValueError(f"Unsupported spatial record layer: {layer_id}")

    definition = SPATIAL_LAYERS[layer_id]
    frame = read_frame(definition["file"])
    id_field = definition["id_field"]
    matches = find_row(frame, id_field, stable_id)
    if matches.empty and definition.get("fallback_id_field"):
        matches = find_row(frame, definition["fallback_id_field"], stable_id)
    if matches.empty:
        raise ValueError(f"Record not found: {record_key}")

    records: dict[str, dict[str, Any]] = {}
    selected = record_shape(record_key, definition["label"][:-1] if definition["label"].endswith("s") else definition["label"], stable_id, matches.iloc[0])
    records[record_key] = selected

    def add_record(key: str, label: str, identifier: Any, row: pd.Series) -> None:
        if key not in records:
            records[key] = record_shape(key, label, str(identifier), row)
        if record_key not in records[key]["related"]:
            records[key]["related"].append(record_key)
        if key not in selected["related"]:
            selected["related"].append(key)

    if layer_id == "addresses":
        address_point_id = stable_id
        address_row = matches.iloc[0]
        loc_id = scalar(address_row.get("LOC_ID"))

        masters = find_row(read_frame(TABLE_FILES["master-address-street"]), "ADDRESS_PO", address_point_id)
        for _, row in masters.head(50).iterrows():
            identifier = int(row["MASTER_ADD"]) if pd.notna(row["MASTER_ADD"]) else "unknown"
            add_record(f"master-address:{identifier}", "Master Address", identifier, row)

        lookups = find_row(read_frame(TABLE_FILES["structure-lookup"]), "ADDRESS_PO", address_point_id)
        for index, row in lookups.head(50).iterrows():
            identifier = f"{address_point_id}|{scalar(row.get('STRUCTURE_'))}|{index}"
            add_record(f"structure-lookup:{identifier}", "Structure lookup", identifier, row)
            structure_id = scalar(row.get("STRUCTURE_"))
            if structure_id:
                structure_matches = find_row(read_frame(SPATIAL_LAYERS["structures"]["file"]), "STRUCTURE_", structure_id)
                if not structure_matches.empty:
                    add_record(f"structures:{structure_id}", "MAD structure", structure_id, structure_matches.iloc[0])

        if loc_id:
            parcels = find_row(read_frame(SPATIAL_LAYERS["parcels"]["file"]), "LOC_ID", loc_id)
            if not parcels.empty:
                add_record(f"parcels:{loc_id}", "Tax parcel", loc_id, parcels.iloc[0])

        variants = find_row(read_frame(TABLE_FILES["address-variant"]), "ADDRESS_PO", address_point_id)
        for index, row in variants.head(50).iterrows():
            variant_id = scalar(row.get("ADDRESS_VA")) or f"{address_point_id}|{index}"
            add_record(f"address-variant:{variant_id}", "Address variant", variant_id, row)

    elif layer_id == "structures":
        lookups = find_row(read_frame(TABLE_FILES["structure-lookup"]), "STRUCTURE_", stable_id)
        for index, row in lookups.head(50).iterrows():
            address_point_id = scalar(row.get("ADDRESS_PO"))
            identifier = f"{address_point_id}|{stable_id}|{index}"
            add_record(f"structure-lookup:{identifier}", "Structure lookup", identifier, row)
            if address_point_id:
                address_matches = find_row(read_frame(SPATIAL_LAYERS["addresses"]["file"]), "ADDRESS_PO", address_point_id)
                if not address_matches.empty:
                    add_record(f"addresses:{address_point_id}", "Address point", address_point_id, address_matches.iloc[0])

    elif layer_id == "parcels":
        address_matches = find_row(read_frame(SPATIAL_LAYERS["addresses"]["file"]), "LOC_ID", stable_id)
        for _, row in address_matches.head(50).iterrows():
            address_point_id = scalar(row.get("ADDRESS_PO"))
            add_record(f"addresses:{address_point_id}", "Address point", address_point_id, row)

    elif layer_id == "centroids":
        loc_id = scalar(matches.iloc[0].get("LOC_ID"))
        if loc_id:
            address_matches = find_row(read_frame(SPATIAL_LAYERS["addresses"]["file"]), "LOC_ID", loc_id)
            for _, row in address_matches.head(50).iterrows():
                address_point_id = scalar(row.get("ADDRESS_PO"))
                add_record(f"addresses:{address_point_id}", "Address point", address_point_id, row)

    elif layer_id == "roads":
        segment_id = scalar(matches.iloc[0].get("BASE_SEGME"))
        if segment_id:
            range_matches = find_row(read_frame(TABLE_FILES["range-variant"]), "BASE_SEGME", segment_id)
            for index, row in range_matches.head(50).iterrows():
                range_id = scalar(row.get("BASE_RANGE")) or f"{segment_id}|{index}"
                add_record(f"range-variant:{range_id}", "Base range variant", range_id, row)

    return {
        "kind": "mad-record-bundle",
        "townId": town_id,
        "selectedKey": record_key,
        "records": records,
        "truncatedRelations": any(len(record["related"]) >= 50 for record in records.values()),
        "readOnly": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    investigate = subparsers.add_parser("investigate")
    investigate.add_argument("--view-id", required=True)

    town_extract = subparsers.add_parser("town-extract")
    town_extract.add_argument("--town-id", required=True, type=int)

    record = subparsers.add_parser("record")
    record.add_argument("--town-id", required=True, type=int)
    record.add_argument("--record-key", required=True)

    preview = subparsers.add_parser("map-preview")
    preview.add_argument("--view-id", required=True)
    preview.add_argument("--record-id", required=True)

    args = parser.parse_args()
    try:
        if args.command == "investigate":
            if args.view_id != "MADV_QA_ASL_DUPES":
                result = {
                    "viewId": args.view_id,
                    "supported": False,
                    "cases": [],
                    "message": (
                        "The statewide count is available, but this local adapter does not have "
                        "the production QA view rows for this category."
                    ),
                }
            else:
                cases = find_duplicate_structure_lookups()
                result = {
                    "viewId": args.view_id,
                    "supported": True,
                    "cases": cases,
                    "message": f"Found {len(cases)} duplicate relationship group(s) in the Rockport export.",
                }
        elif args.command == "town-extract":
            result = build_town_extract(args.town_id)
        elif args.command == "map-preview":
            result = build_qa_map_preview(args.view_id, args.record_id)
        else:
            result = build_record_bundle(args.town_id, args.record_key)
        print(json.dumps({"ok": True, "result": result}, separators=(",", ":"), default=str))
    except Exception as error:  # pragma: no cover - surfaced through the local bridge
        fail(str(error))


if __name__ == "__main__":
    main()
