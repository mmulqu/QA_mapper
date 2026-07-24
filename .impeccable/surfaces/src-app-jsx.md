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
- Proof/content: The supplied non-zero statewide QA report, a read-only Rockport MAD town extract with spatial and related records, one reproducible duplicate structure-lookup proposal at 8 Alpaca Court, synthetic training cases, and an optional public Brookline address snapshot.
- Constraints: The map remains the largest region; the case docket stays on the left; attributes appear only after selection; no production credential enters the browser; keyboard and reduced-motion operation remain supported.
- Direction: The Survey Evidence Dossier, distilled. A persistent case docket and one large vector map are the default. The feature inspector is a single on-demand record sheet.
- Unresolved: Secured relational MAD field mappings, identity provider, Case API, validator definitions, ArcPy worker hosting, enterprise versioning strategy, and production audit storage.
