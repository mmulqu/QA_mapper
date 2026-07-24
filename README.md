# MAD QA Workbench

A map-first training MVP for reviewing AI-agent proposals against a safe, synthetic snapshot of the MassGIS Master Address Database workflow.

The current app focuses on the geometry-and-record inspection loop without connecting to production:

- select an address QA case;
- view address-point, structure, parcel, road, and nearby-address vectors on a Leaflet map;
- switch between street and imagery basemaps and control vector visibility;
- click a vector to open its full attribute table;
- follow preset relations between address points, Master Address, MAD structure, structure lookup, address variants, and parcel;
- accept an eligible address-point proposal locally in the training workspace.

## Run it

```powershell
npm install
npm run dev
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

```powershell
npm test
npm run build
```

## Demonstrated feature relationships

1. Address point → Master Address → structure → structure lookup → address variant.
2. Address point → parcel and road-context records.
3. Neighboring address points as clickable sequence context.
4. A no-proposal state for cases that need municipal evidence.

All displayed records and geometries are synthetic. Street and imagery tiles are referenced from public services; no private MassGIS service or credential is embedded in the client.

## Agent-facing contract

The controlled changeset helper remains in `src/lib/geometry.js` and follows [schemas/changeset.schema.json](schemas/changeset.schema.json). It is deliberately outside the default review screen; a future agent/Case API should use it after the human finishes feature inspection, rather than requiring reviewers to read raw JSON.

Case snapshots live in `src/data/cases.js`. Each case includes:

- spatial context and related records;
- the source version and row hash;
- a proposed geometry, or an explicit decision to withhold one;
- values used to build the on-demand feature tables and preset relates.

## Production integration boundary

The **Accept proposal** action intentionally writes only to `localStorage`. A production implementation should replace that action with an authenticated Case API call, not direct browser access to MAD.

The publisher should:

1. freeze and sign the approved changeset;
2. retrieve affected production rows again;
3. compare source version, edit date, and row hashes;
4. open one transactional ArcPy edit session or child geodatabase version;
5. apply only allow-listed operations;
6. rerun schema, relational, spatial, address-logic, and locator checks;
7. commit on success or roll back completely;
8. append the result and reviewer identity to the case audit history.

See [docs/ARCPY_BRIDGE.md](docs/ARCPY_BRIDGE.md) for the proposed handoff contract.
