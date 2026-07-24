from __future__ import annotations

import argparse
import json
import traceback
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve()
SKILL_ROOT = HERE.parents[1]
DEFAULT_CATALOG = SKILL_ROOT / "data" / "layer_index.json"
DEFAULT_WORKSPACE = Path.cwd() / "massgis_data"
DEFAULT_GEOSERVER_WFS = "https://gis-prod.digital.mass.gov/geoserver/wfs"
REQUEST_USER_AGENT = "AI_MM massgis-geoserver-skill/1.0"
REQUEST_TAG_HEADERS = {
    "User-Agent": REQUEST_USER_AGENT,
    "X-Requested-By": "AI_MM",
    "X-Agent-Name": "AI_MM",
}

SUMMARY_ROWS = 20
SUMMARY_COLS = 12
DEFAULT_MAX_FEATURES = 5000


def _to_json(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, indent=2, ensure_ascii=False))


def run_and_print(callable_fn) -> int:
    try:
        result = callable_fn()
        _to_json({"ok": True, "result": result})
        return 0
    except Exception as exc:  # pragma: no cover
        _to_json(
            {
                "ok": False,
                "error": str(exc),
                "detail": {"traceback": traceback.format_exc(limit=8)},
            }
        )
        return 1


def add_common_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--catalog",
        default=str(DEFAULT_CATALOG),
        help=f"Path to layer_index.json (default: {DEFAULT_CATALOG})",
    )
    parser.add_argument(
        "--workspace",
        default=str(DEFAULT_WORKSPACE),
        help=f"Directory for saved GeoJSON files (default: {DEFAULT_WORKSPACE})",
    )
    parser.add_argument(
        "--geoserver-wfs",
        default=DEFAULT_GEOSERVER_WFS,
        help=f"GeoServer WFS endpoint (default: {DEFAULT_GEOSERVER_WFS})",
    )


def build_client_from_args(args: argparse.Namespace) -> "MassGISGeoServerClient":
    return MassGISGeoServerClient(
        catalog_path=Path(args.catalog),
        workspace_dir=Path(args.workspace),
        geoserver_wfs=args.geoserver_wfs,
    )


class MassGISGeoServerClient:
    def __init__(
        self,
        catalog_path: Path = DEFAULT_CATALOG,
        workspace_dir: Path = DEFAULT_WORKSPACE,
        geoserver_wfs: str = DEFAULT_GEOSERVER_WFS,
    ) -> None:
        self.catalog_path = catalog_path
        self.workspace_dir = workspace_dir
        self.geoserver_wfs = geoserver_wfs

        self.layer_catalog: dict[str, dict[str, Any]] = {}
        self.inv_index: dict[str, list[str]] = {}
        self.categories: dict[str, int] = {}
        self.schema_cache: dict[str, list[tuple[str, str]]] = {}
        self.geom_col_cache: dict[str, str] = {}

        self._load_catalog()

    def _load_catalog(self) -> None:
        if not self.catalog_path.exists():
            raise FileNotFoundError(f"Layer catalog not found: {self.catalog_path}")

        with self.catalog_path.open("r", encoding="utf-8") as f:
            index = json.load(f)

        self.layer_catalog = index.get("layer_catalog", {})
        self.inv_index = index.get("inv_index", {})
        self.categories = {}

        for info in self.layer_catalog.values():
            category = info.get("category") or "uncategorized"
            self.categories[category] = self.categories.get(category, 0) + 1

    def workspace_info(self) -> dict[str, str]:
        return {"workspace_dir": str(self.workspace_dir.resolve())}

    def _normalize_layer_id(self, layer_id: str) -> str:
        layer_id = layer_id.strip()
        if layer_id in self.layer_catalog:
            return layer_id

        if ":" not in layer_id:
            with_prefix = f"massgis:{layer_id}"
            if with_prefix in self.layer_catalog:
                return with_prefix

        if layer_id.startswith("massgis:"):
            without_prefix = layer_id[8:]
            if without_prefix in self.layer_catalog:
                return without_prefix

        layer_id_lower = layer_id.lower()
        for catalog_lid in self.layer_catalog.keys():
            if catalog_lid.lower() == layer_id_lower:
                return catalog_lid

        return layer_id

    def _to_typename(self, layer_id: str) -> str:
        return layer_id if ":" in layer_id else f"massgis:{layer_id}"

    def _default_geom_col(self, layer_id: str) -> str:
        if layer_id in self.geom_col_cache:
            return self.geom_col_cache[layer_id]

        info = self.layer_catalog.get(layer_id, {})
        geometry_column = info.get("geometry_column")
        if geometry_column:
            self.geom_col_cache[layer_id] = geometry_column
            return geometry_column
        return "shape"

    def _build_wfs_url(self, params: dict[str, Any]) -> str:
        merged = {
            "service": "WFS",
            "version": "1.1.0",
            **params,
        }
        return f"{self.geoserver_wfs}?{urllib.parse.urlencode(merged)}"

    def _http_get_text(self, url: str) -> tuple[str, str]:
        req = urllib.request.Request(url, headers={**REQUEST_TAG_HEADERS, "Accept": "*/*"})
        with urllib.request.urlopen(req, timeout=120) as response:
            content_type = response.headers.get("content-type", "")
            body = response.read()
        return body.decode("utf-8", errors="replace"), content_type

    def _http_get_json(self, url: str) -> tuple[dict[str, Any], str]:
        req = urllib.request.Request(url, headers={**REQUEST_TAG_HEADERS, "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=120) as response:
            content_type = response.headers.get("content-type", "")
            body = response.read()

        text = body.decode("utf-8", errors="replace")
        if "application/json" not in content_type.lower():
            raise RuntimeError(f"GeoServer error:\n{text[:1000]}")

        return json.loads(text), content_type

    def search_layers(self, query: str, category: str | None = None, limit: int = 10) -> dict[str, Any]:
        q_words = set(query.lower().split())
        scored: list[tuple[int, str, dict[str, Any]]] = []

        for layer_id, info in self.layer_catalog.items():
            if category and category != "all" and info.get("category") != category:
                continue

            score = 0
            search_terms = set(t.lower() for t in info.get("search_terms", []))
            for word in q_words:
                if word in search_terms:
                    score += 7

            col_tokens = set(str(info.get("column_summary", "")).lower().replace(",", " ").split())
            for word in q_words:
                if word in col_tokens:
                    score += 5

            blob = f"{info.get('title', '')} {info.get('description', '')}".lower()
            for word in q_words:
                if word in blob:
                    score += 2

            if category and info.get("category") == category:
                score += 3

            if score > 0:
                scored.append((score, layer_id, info))

        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[:limit]

        results = []
        for score, layer_id, info in top:
            results.append(
                {
                    "layer_id": layer_id,
                    "title": info.get("title", layer_id),
                    "category": info.get("category"),
                    "layer_type": info.get("layer_type"),
                    "description": info.get("description"),
                    "column_summary": info.get("column_summary"),
                    "key_fields": info.get("key_fields", []),
                    "score": score,
                }
            )

        return {
            "query": query,
            "category": category,
            "count": len(results),
            "results": results,
            "note": "Catalog column names can differ from WFS casing; run massgis-describe-schema before querying.",
        }

    def list_categories(self) -> dict[str, Any]:
        categories = [
            {"category": cat, "layer_count": count}
            for cat, count in sorted(self.categories.items(), key=lambda x: x[0].lower())
        ]
        return {"count": len(categories), "categories": categories}

    def layer_info(self, layer_id: str) -> dict[str, Any]:
        lid = self._normalize_layer_id(layer_id)
        info = self.layer_catalog.get(lid)
        if not info:
            raise ValueError(f"Layer '{layer_id}' not found in catalog.")

        return {
            "layer_id": lid,
            "title": info.get("title", lid),
            "category": info.get("category"),
            "subcategory": info.get("subcategory"),
            "layer_type": info.get("layer_type"),
            "description": info.get("description"),
            "column_summary": info.get("column_summary"),
            "geometry_column": info.get("geometry_column"),
            "native_srid": info.get("native_srid"),
            "key_fields": info.get("key_fields", []),
        }

    def describe_schema(self, layer_id: str) -> dict[str, Any]:
        lid = self._normalize_layer_id(layer_id)
        if lid not in self.layer_catalog:
            raise ValueError(f"Layer '{layer_id}' not found in catalog.")

        if lid in self.schema_cache:
            fields = self.schema_cache[lid]
            return self._schema_payload(lid, fields, from_cache=True)

        url = self._build_wfs_url(
            {
                "request": "DescribeFeatureType",
                "typeName": self._to_typename(lid),
            }
        )
        xml_text, _ = self._http_get_text(url)
        fields = self._parse_schema_xml(xml_text)

        if not fields:
            raise RuntimeError("Schema returned no attributes.")

        self.schema_cache[lid] = fields
        return self._schema_payload(lid, fields, from_cache=False)

    def _parse_schema_xml(self, xml_text: str) -> list[tuple[str, str]]:
        fields: list[tuple[str, str]] = []
        root = ET.fromstring(xml_text)

        for elem in root.iter():
            tag = elem.tag
            local = tag.split("}", 1)[-1] if "}" in tag else tag
            if local != "element":
                continue
            name = elem.attrib.get("name")
            field_type = elem.attrib.get("type")
            if not name or not field_type:
                continue
            fields.append((name, field_type.split(":")[-1]))

        return fields

    def _schema_payload(self, layer_id: str, fields: list[tuple[str, str]], from_cache: bool) -> dict[str, Any]:
        geometry_field = None
        for field_name, field_type in fields:
            lower_type = field_type.lower()
            if (
                "geometry" in lower_type
                or "point" in lower_type
                or "polygon" in lower_type
                or "line" in lower_type
            ):
                geometry_field = field_name
                break

        if geometry_field:
            self.geom_col_cache[layer_id] = geometry_field

        return {
            "layer_id": layer_id,
            "total_fields": len(fields),
            "geometry_column": geometry_field or "shape",
            "from_cache": from_cache,
            "fields": [{"name": name, "type": field_type} for name, field_type in fields],
        }

    def query(
        self,
        layer_id: str,
        cql_filter: str | None = None,
        max_features: int = DEFAULT_MAX_FEATURES,
        start_index: int = 0,
        sort_by: str | None = None,
        file_suffix: str | None = None,
    ) -> dict[str, Any]:
        lid = self._normalize_layer_id(layer_id)
        if lid not in self.layer_catalog:
            raise ValueError(f"Layer '{layer_id}' not found in catalog.")

        params: dict[str, Any] = {
            "request": "GetFeature",
            "typeName": self._to_typename(lid),
            "outputFormat": "application/json",
            "srsName": "EPSG:4326",
            "maxFeatures": max_features,
            "startIndex": start_index,
        }
        if cql_filter:
            params["cql_filter"] = cql_filter
        if sort_by:
            params["sortBy"] = sort_by

        url = self._build_wfs_url(params)
        data, _ = self._http_get_json(url)

        features = data.get("features") or []
        total_features = data.get("totalFeatures")
        columns = list((features[0].get("properties") or {}).keys()) if features else []

        if not features:
            return {
                "layer_id": lid,
                "query_url": url,
                "feature_count": 0,
                "total_features": total_features,
                "file_path": "",
                "file_size_mb": 0,
                "columns": columns,
                "preview": {"columns": [], "rows": [], "shown_rows": 0, "total_rows": 0},
                "summary": "No features returned.",
            }

        file_info = self._save_geojson(data, lid, file_suffix=file_suffix)
        preview = self._build_preview(features)

        return {
            "layer_id": lid,
            "query_url": url,
            "feature_count": len(features),
            "total_features": total_features,
            "file_path": file_info["file_path"],
            "file_size_mb": file_info["file_size_mb"],
            "columns": columns,
            "preview": preview,
            "summary": f"Saved {len(features)} feature(s) to {file_info['file_path']}",
        }

    def _save_geojson(self, geojson: dict[str, Any], layer_id: str, file_suffix: str | None = None) -> dict[str, Any]:
        self.workspace_dir.mkdir(parents=True, exist_ok=True)
        clean_layer = layer_id.replace("massgis:", "").replace("GISDATA.", "").lower()
        stamp = datetime.utcnow().strftime("%Y-%m-%dT%H-%M-%S")
        suffix = f"_{file_suffix}" if file_suffix else ""
        file_name = f"{clean_layer}{suffix}_{stamp}.geojson"
        file_path = self.workspace_dir / file_name

        with file_path.open("w", encoding="utf-8") as f:
            json.dump(geojson, f, ensure_ascii=False)

        size_mb = round(file_path.stat().st_size / (1024 * 1024), 4)
        return {"file_path": str(file_path.resolve()), "file_size_mb": size_mb}

    def _build_preview(self, features: list[dict[str, Any]]) -> dict[str, Any]:
        if not features:
            return {"columns": [], "rows": [], "shown_rows": 0, "total_rows": 0}

        sample_props = features[0].get("properties") or {}
        all_keys = [
            k
            for k in sample_props.keys()
            if "shape" not in k.lower() and "geom" not in k.lower()
        ]
        keys = all_keys[:SUMMARY_COLS]
        shown = min(SUMMARY_ROWS, len(features))

        rows: list[dict[str, Any]] = []
        for i in range(shown):
            props = features[i].get("properties") or {}
            row: dict[str, Any] = {"_row": i + 1}
            for key in keys:
                value = props.get(key)
                if value is None:
                    row[key] = None
                else:
                    text = str(value)
                    row[key] = text if len(text) <= 50 else f"{text[:47]}..."
            rows.append(row)

        return {"columns": keys, "rows": rows, "shown_rows": shown, "total_rows": len(features)}

    def find_in_town(self, layer_id: str, municipality: str, max_features: int = DEFAULT_MAX_FEATURES) -> dict[str, Any]:
        lid = self._normalize_layer_id(layer_id)
        geom_col = self._default_geom_col(lid)
        town = municipality.upper().replace("'", "''")
        town_filter = f"\"town\" = ''{town}''"
        subquery = (
            "collectGeometries("
            f"queryCollection('massgis:GISDATA.TOWNSSURVEY_POLYM','shape','{town_filter}')"
            ")"
        )
        cql = f"INTERSECTS(\"{geom_col}\", {subquery})"
        result = self.query(lid, cql_filter=cql, max_features=max_features, file_suffix=town.lower())
        result["municipality"] = town
        result["generated_cql_filter"] = cql
        return result

    def find_nearby(
        self,
        layer_id: str,
        latitude: float,
        longitude: float,
        radius_meters: float = 1000,
        max_features: int = DEFAULT_MAX_FEATURES,
    ) -> dict[str, Any]:
        lid = self._normalize_layer_id(layer_id)
        geom_col = self._default_geom_col(lid)
        # The service evaluates CQL against each layer's native spatial reference.
        # Marking the point as WGS84 lets GeoServer transform it before the distance
        # check; an unqualified POINT() is interpreted as native layer coordinates.
        point_wkt = f"SRID=4326;POINT({longitude} {latitude})"
        cql = f"DWITHIN(\"{geom_col}\", {point_wkt}, {radius_meters}, meters)"
        result = self.query(lid, cql_filter=cql, max_features=max_features, file_suffix="nearby")
        result["search_center"] = {"latitude": latitude, "longitude": longitude}
        result["radius_meters"] = radius_meters
        result["generated_cql_filter"] = cql
        return result

    def get_bbox(self, municipality: str) -> dict[str, Any]:
        town = municipality.upper().replace("'", "''")
        cql_filter = f"\"town\" = '{town}'"
        url = self._build_wfs_url(
            {
                "request": "GetFeature",
                "typeName": "massgis:GISDATA.TOWNSSURVEY_POLYM",
                "outputFormat": "application/json",
                "srsName": "EPSG:4326",
                "maxFeatures": 1,
                "cql_filter": cql_filter,
            }
        )
        data, _ = self._http_get_json(url)
        bbox = data.get("bbox")
        if not bbox:
            raise ValueError(f"Could not find municipality '{municipality}' in TOWNSSURVEY_POLYM.")
        return {
            "municipality": town,
            "bbox": ",".join(str(x) for x in bbox),
            "bbox_array": bbox,
            "format": "minLon, minLat, maxLon, maxLat (EPSG:4326)",
            "query_url": url,
        }
