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
- Task: Select bounded QA rows, send them to a durable local-agent queue, return to a review inbox, then verify a proposal by clicking vector features, reading attributes, and traversing preset related records.
- Proof/content: The supplied non-zero statewide QA report, a localhost-owned persistent queue with stored review results, a read-only Rockport MAD town extract with spatial and related records, one reproducible duplicate structure-lookup proposal at 8 Alpaca Court, synthetic training cases, and an optional public Brookline address snapshot.
- Constraints: The map remains the largest region; the case docket stays on the left; attributes appear only after selection; no production credential enters the browser; keyboard and reduced-motion operation remain supported.
- Direction: The Survey Evidence Dossier, distilled. A persistent docket exposes the inbox and queue before the QA categories. The main workspace changes between a restrained operations ledger and the large vector map; the feature inspector remains a single on-demand record sheet.
- Unresolved: Secured relational MAD field mappings, identity provider, Case API, validator definitions, ArcPy worker hosting, enterprise versioning strategy, and production audit storage.
