from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
from pyproj import Geod
from shapely.ops import unary_union


def _geom_area_m2(geod: Geod, geom) -> float:
    area, _ = geod.geometry_area_perimeter(geom)
    area = abs(float(area))
    if not math.isfinite(area):
        return 0.0
    return area


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="massgis-area-by-type",
        description="Compute area and percent-by-type from target polygons clipped to a boundary polygon.",
    )
    p.add_argument("--boundary-geojson", required=True, help="Boundary GeoJSON path")
    p.add_argument("--target-geojson", required=True, help="Target polygon GeoJSON path")
    p.add_argument("--class-field", required=True, help="Field used for category names (e.g., it_valdesc)")
    p.add_argument("--code-field", help="Optional code field (e.g., it_valc)")
    p.add_argument("--name", default="Area-by-type report", help="Name shown in output payload")
    p.add_argument("--output-json", help="Optional output JSON path")
    p.add_argument("--output-csv", help="Optional output CSV path")
    return p


def main() -> int:
    args = build_parser().parse_args()

    boundary_path = Path(args.boundary_geojson)
    target_path = Path(args.target_geojson)

    if not boundary_path.exists():
        raise SystemExit(f"Boundary file not found: {boundary_path}")
    if not target_path.exists():
        raise SystemExit(f"Target file not found: {target_path}")

    boundary = gpd.read_file(boundary_path)
    target = gpd.read_file(target_path)

    if args.class_field not in target.columns:
        raise SystemExit(f"Class field not found in target: {args.class_field}")
    if args.code_field and args.code_field not in target.columns:
        raise SystemExit(f"Code field not found in target: {args.code_field}")

    boundary = boundary[~boundary.geometry.isna()].copy()
    target = target[~target.geometry.isna()].copy()

    # Keep analysis in EPSG:4326 and use geodesic area to avoid projection overflow edge-cases.
    if str(boundary.crs) != "EPSG:4326":
        boundary = boundary.to_crs(4326)
    if str(target.crs) != "EPSG:4326":
        target = target.to_crs(4326)

    boundary_union = unary_union(list(boundary.geometry))
    if boundary_union.is_empty:
        raise SystemExit("Boundary geometry is empty after union.")

    geod = Geod(ellps="WGS84")
    boundary_area_m2 = _geom_area_m2(geod, boundary_union)
    if boundary_area_m2 <= 0:
        raise SystemExit("Boundary area is zero; cannot compute percentages.")

    rows: list[dict[str, Any]] = []
    for feature in target.itertuples(index=False):
        geom = getattr(feature, "geometry", None)
        if geom is None or geom.is_empty:
            continue
        clipped = geom.intersection(boundary_union)
        if clipped.is_empty:
            continue

        area_m2 = _geom_area_m2(geod, clipped)
        if area_m2 <= 0:
            continue

        row: dict[str, Any] = {
            "class_value": getattr(feature, args.class_field),
            "area_m2": area_m2,
            "area_acres": area_m2 / 4046.8564224,
        }
        if args.code_field:
            row["code_value"] = getattr(feature, args.code_field)
        rows.append(row)

    if not rows:
        raise SystemExit("No intersecting area found between target and boundary.")

    frame = pd.DataFrame(rows)
    group_cols = ["class_value"] + (["code_value"] if args.code_field else [])
    summary = (
        frame.groupby(group_cols, dropna=False)[["area_m2", "area_acres"]]
        .sum()
        .reset_index()
        .sort_values("area_acres", ascending=False)
    )
    summary["class_value"] = summary["class_value"].fillna("(null)")
    if "code_value" in summary.columns:
        summary["code_value"] = summary["code_value"].fillna("(null)")

    total_target_area_acres = float(summary["area_acres"].sum())
    summary["pct_of_total_target_area_in_boundary"] = (
        summary["area_acres"] / total_target_area_acres * 100.0
    )

    boundary_area_acres = boundary_area_m2 / 4046.8564224
    coverage_pct = total_target_area_acres / boundary_area_acres * 100.0

    payload = {
        "name": args.name,
        "method": "geodesic_area_epsg4326",
        "boundary_geojson": str(boundary_path.resolve()),
        "target_geojson": str(target_path.resolve()),
        "boundary_feature_count": int(len(boundary)),
        "target_feature_count": int(len(target)),
        "boundary_area_acres": float(boundary_area_acres),
        "total_target_area_within_boundary_acres": float(total_target_area_acres),
        "target_coverage_pct_of_boundary_area": float(coverage_pct),
        "breakdown": [
            {
                **({"code_value": str(r.code_value)} if "code_value" in summary.columns else {}),
                "class_value": str(r.class_value),
                "area_acres": float(r.area_acres),
                "pct_of_total_target_area_in_boundary": float(r.pct_of_total_target_area_in_boundary),
            }
            for r in summary.itertuples(index=False)
        ],
    }

    if args.output_csv:
        csv_path = Path(args.output_csv)
        summary.to_csv(csv_path, index=False)
    if args.output_json:
        json_path = Path(args.output_json)
        json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(json.dumps({"ok": True, "result": payload}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
