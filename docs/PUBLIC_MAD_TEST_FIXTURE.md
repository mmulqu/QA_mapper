# Public MAD test fixture

The workbench can optionally display a small, local-only snapshot of public MassGIS Master Address Database products. It is a test fixture, not a production case workspace and not a writable source.

## Current fixture

- Municipality: Brookline (`TOWN_ID` 46).
- Geometry: Basic Address Points shapefile.
- Related table: Advanced Address List workbook.
- Relationship exercised: `ADDRESS_ID` from the point product to `ADDRESS_ID` in the advanced list.
- Native data coordinate system: NAD83 Massachusetts Mainland State Plane, EPSG:26986.
- Browser geometry: reprojected by the fixture builder to WGS 84, EPSG:4326.

The builder uses a small radius around `ADDR_PT_ID` `M_230601_899373`, which retains stacked address points and nearby features for inspection. It is intentionally not a randomly sampled statewide extract.

## Build locally

First download the two public Brookline archives to `.data/mad/brookline/raw/` and extract them under `.data/mad/brookline/extracted/`. Then run:

```powershell
python scripts/build_public_mad_fixture.py
```

The output is `public/test-data/brookline-mad-snapshot.json`. It is ignored by Git because it is a dated external export. Vite serves it at `/test-data/brookline-mad-snapshot.json` during local development.

## Provenance and limits

The official product metadata says Basic Address Points is a weekly export from the MAD spatial view and contains reduced point-level attributes. It is **not** the full relational MAD: it does not supply MAD structures, structure lookup rows, address variants, parcels, or QA results. The Advanced Address List enriches the local test fixture with address status and parsed components, but it remains an exported public product.

### Metadata findings used by the fixture

- The point source is a point shapefile in NAD83 Massachusetts Mainland State Plane, EPSG:26986. Leaflet receives only its WGS 84 conversion.
- `ADDRESS_ID` is the unique standardized address-record identifier and is the join key to the Advanced Address List.
- `ADDR_PT_ID` identifies the associated address multipoint/location. It is **not** unique: stacked points can share it when multiple addresses occupy one location.
- `POINT_TYPE` is meaningful QA evidence, not display decoration. The downloaded Brookline export includes building centroids (`BC`), building multipoints (`BMP`), parcel centroids (`PC`), building entry points (`BEP`), and other documented types.
- The public Basic Address Points product is created from MAD and has a deliberately reduced field set; the full relational MAD model must be supplied separately for controlled editing.

The app must label this data as a public snapshot, retain its download URL/hash/generation time, and never offer an approval or publishing action for it. A later Case API will ingest a secured, relational MAD test version to exercise actual edits.

Sources: [Basic Address Points metadata](https://www.mass.gov/info-details/massgis-data-master-address-data-basic-address-points) and [Advanced Address List metadata](https://www.mass.gov/info-details/massgis-data-master-address-data-advanced-address-list).
