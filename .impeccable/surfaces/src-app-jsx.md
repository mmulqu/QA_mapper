---
version: 1
slug: "src-app-jsx"
primary_target: "src/App.jsx"
related_targets: ["src/components/MapWorkspace.jsx","src/styles.css"]
---

# MAD QA Workbench surface brief

- Scope: `src/App.jsx` and its map/review components.
- Mode: Operate.
- Audience: MassGIS MAD QA staff reviewing agent-prepared address corrections during routine production maintenance.
- Task: Select a case, click a vector feature, read its attributes, and traverse its preset related records without leaving the map.
- Proof/content: Synthetic vector exports for address points, parcels, structures, road context, and the related Master Address, lookup, and address-variant records.
- Constraints: The map remains the largest region; the case docket stays on the left; attributes appear only after selection; no production credential enters the browser; keyboard and reduced-motion operation remain supported.
- Direction: The Survey Evidence Dossier, distilled. A persistent case docket and one large vector map are the default. The feature inspector is a single on-demand record sheet.
- Unresolved: Real MAD field mappings, identity provider, Case API, imagery endpoints, validator definitions, ArcPy worker hosting, enterprise versioning strategy, and production audit storage.
