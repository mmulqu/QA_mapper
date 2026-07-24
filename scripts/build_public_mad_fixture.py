"""Build a small, browser-safe test snapshot from public MassGIS MAD exports.

This never alters an input export. It reads the downloaded Brookline Basic Address
Points shapefile and Advanced Address List workbook, joins selected records by
ADDRESS_ID, reprojects geometry to WGS 84, and writes a local Vite-served JSON
fixture. The generated file is ignored by Git because it is a dated public export.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from datetime import date, datetime
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

import geopandas as gpd


DEFAULT_ROOT = Path('.data/mad/brookline')
DEFAULT_POINT_PATH = DEFAULT_ROOT / 'extracted/address-points/AddressPts_M046.shp'
DEFAULT_ADDRESS_PATH = DEFAULT_ROOT / 'extracted/advanced-addresses/AdvancedAddresses_M046.xlsx'
DEFAULT_OUTPUT = Path('public/test-data/brookline-mad-snapshot.json')
DEFAULT_CENTER_POINT_ID = 'M_230601_899373'


def scalar(value):
    """Return a JSON-safe scalar while retaining real nulls."""
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if hasattr(value, 'item'):
        return scalar(value.item())
    return value


def column_index(cell_reference: str) -> int:
    match = re.match(r'([A-Z]+)', cell_reference)
    if not match:
        raise ValueError(f'Invalid worksheet cell reference: {cell_reference}')
    value = 0
    for char in match.group(1):
        value = value * 26 + ord(char) - ord('A') + 1
    return value - 1


def inline_cell_value(cell, namespace):
    inline = cell.find('x:is', namespace)
    if inline is not None:
        return ''.join(inline.itertext())
    value = cell.findtext('x:v', default=None, namespaces=namespace)
    if value is None:
        return None
    if cell.attrib.get('t') == 'n':
        try:
            numeric = float(value)
            return int(numeric) if numeric.is_integer() else numeric
        except ValueError:
            return value
    return value


def advanced_addresses_by_id(workbook_path: Path, address_ids: set[int]) -> dict[int, dict]:
    """Read only required rows from MassGIS's inline-string XLSX export."""
    namespace = {'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with ZipFile(workbook_path) as workbook:
        stream = workbook.open('xl/worksheets/sheet1.xml')
        rows = ET.iterparse(stream, events=('end',))
        headers: list[str] | None = None
        matches: dict[int, dict] = {}
        for _, element in rows:
            if element.tag != f"{{{namespace['x']}}}row":
                continue
            row_values: dict[int, object] = {}
            for cell in element.findall('x:c', namespace):
                row_values[column_index(cell.attrib['r'])] = inline_cell_value(cell, namespace)
            if headers is None:
                headers = [str(row_values.get(index, '')).strip() for index in range(max(row_values) + 1)]
            else:
                address_id = row_values.get(0)
                try:
                    address_id = int(address_id)
                except (TypeError, ValueError):
                    address_id = None
                if address_id in address_ids:
                    matches[address_id] = {
                        header: scalar(row_values.get(index))
                        for index, header in enumerate(headers)
                        if header
                    }
            element.clear()
    return matches


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return f'sha256:{digest.hexdigest()}'


def build_snapshot(point_path: Path, advanced_path: Path, output_path: Path, radius_m: float, max_points: int):
    points = gpd.read_file(point_path)
    if points.crs is None:
        raise RuntimeError('The MassGIS point extract has no coordinate reference system.')
    center_matches = points.loc[points['ADDR_PT_ID'] == DEFAULT_CENTER_POINT_ID]
    if center_matches.empty:
        raise RuntimeError(f'Could not find the fixture center point {DEFAULT_CENTER_POINT_ID}.')

    fixture_center = center_matches.geometry.iloc[0]
    nearby = points.loc[points.geometry.distance(fixture_center) <= radius_m].copy()
    nearby['_distance_m'] = nearby.geometry.distance(fixture_center)
    nearby = nearby.sort_values(['_distance_m', 'ADDRESS_ID']).head(max_points).copy()
    nearby_wgs84 = nearby.to_crs(4326)
    selected_address_ids = {int(value) for value in nearby['ADDRESS_ID'].dropna()}
    advanced_by_id = advanced_addresses_by_id(advanced_path, selected_address_ids)

    features = []
    for source_row, wgs84_row in zip(nearby.to_dict('records'), nearby_wgs84.to_dict('records'), strict=True):
        address_id = int(source_row['ADDRESS_ID'])
        attributes = {
            field: scalar(value)
            for field, value in source_row.items()
            if field not in {'geometry', '_distance_m'}
        }
        geometry = wgs84_row['geometry']
        features.append({
            'key': f'public-address-point:{address_id}',
            'id': str(source_row['ADDR_PT_ID']),
            'addressId': address_id,
            'address': ' '.join(
                part for part in (str(source_row.get('ADDR_NUM') or '').strip(), str(source_row.get('STREETNAME') or '').strip()) if part
            ),
            'position': [round(geometry.y, 7), round(geometry.x, 7)],
            'distanceMeters': round(float(source_row['_distance_m']), 1),
            'attributes': attributes,
            'advancedAddress': advanced_by_id.get(address_id),
        })

    center_wgs84 = gpd.GeoSeries([fixture_center], crs=points.crs).to_crs(4326).iloc[0]
    raw_root = point_path.parents[2] / 'raw'
    point_zip = raw_root / 'AddressPts_M046.zip'
    advanced_zip = raw_root / 'AdvancedAddresses_M046.zip'
    snapshot = {
        'kind': 'public-mad-test-snapshot',
        'metadata': {
            'title': 'Brookline public MAD test snapshot',
            'municipality': 'BROOKLINE',
            'townId': 46,
            'sourceCrs': 'EPSG:26986',
            'browserCrs': 'EPSG:4326',
            'pointProduct': 'MassGIS Master Address Data — Basic Address Points',
            'addressProduct': 'MassGIS Master Address Data — Advanced Address List',
            'pointSourceUrl': 'https://s3.us-east-1.amazonaws.com/download.massgis.digital.mass.gov/shapefiles/mad/town_exports/addr_pts/AddressPts_M046.zip',
            'addressSourceUrl': 'https://s3.us-east-1.amazonaws.com/download.massgis.digital.mass.gov/shapefiles/mad/town_exports/adv_addr/AdvancedAddresses_M046.zip',
            'pointArchiveSha256': sha256(point_zip),
            'addressArchiveSha256': sha256(advanced_zip),
            'sourcePointCount': int(len(points)),
            'fixturePointCount': int(len(features)),
            'advancedJoinCount': int(sum(feature['advancedAddress'] is not None for feature in features)),
            'joinKey': 'ADDRESS_ID',
            'centerPointId': DEFAULT_CENTER_POINT_ID,
            'radiusMeters': radius_m,
            'generatedAt': datetime.now().astimezone().isoformat(timespec='seconds'),
            'usage': 'Local test fixture only. Public MassGIS export; not an editable MAD source or production case snapshot.',
        },
        'center': [round(center_wgs84.y, 7), round(center_wgs84.x, 7)],
        'zoom': 17,
        'features': features,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    return snapshot


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--points', type=Path, default=DEFAULT_POINT_PATH)
    parser.add_argument('--advanced-addresses', type=Path, default=DEFAULT_ADDRESS_PATH)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--radius-m', type=float, default=250)
    parser.add_argument('--max-points', type=int, default=400)
    args = parser.parse_args()
    snapshot = build_snapshot(args.points, args.advanced_addresses, args.output, args.radius_m, args.max_points)
    metadata = snapshot['metadata']
    print(
        f"Wrote {args.output}: {metadata['fixturePointCount']} of {metadata['sourcePointCount']} points; "
        f"{metadata['advancedJoinCount']} joined Advanced Address records."
    )


if __name__ == '__main__':
    main()
