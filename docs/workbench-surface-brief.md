# MAD QA Workbench surface brief

- Scope: `src/App.jsx` and its map/review components.
- Mode: Operate.
- Audience: MassGIS MAD QA staff reviewing agent-prepared address corrections during routine production maintenance.
- Task: Select an exception case, inspect spatial and relational evidence, adjust a bounded proposal, understand every controlled operation, rerun validation, and make a human decision.
- Proof/content: Synthetic case snapshots with stable IDs, source hashes, evidence registers, relationship closure, map overlays, validation results, and append-only audit events; plus one explicitly read-only public Brookline address-point snapshot joined to its Advanced Address List export.
- Constraints: The map remains the largest region; no production credential enters the browser; approval is unmistakably a sandbox simulation; map-only evidence always has a textual counterpart; keyboard and reduced-motion operation remain supported.
- Direction: The Survey Evidence Dossier. A narrow case docket, dominant map, and evidence folio meet as one laid-flat review desk. Numbered evidence tags and decision stamps create the memorable review moment.
- Implemented map context: public MassGIS basemap and MassGIS 2025 natural-color imagery tile services.
- Implemented test data: optional public Brookline Basic Address Points and Advanced Address List fixture, loaded locally and labeled as a no-edit snapshot.
- Unresolved: Real MAD field mappings, identity provider, Case API, validator definitions, ArcPy worker hosting, enterprise versioning strategy, and production audit storage.
