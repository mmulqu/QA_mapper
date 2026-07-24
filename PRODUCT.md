# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

MassGIS Master Address Database (MAD) QA staff and their coworkers review address-quality issues during routine data maintenance. An autonomous QA agent prepares evidence and a proposed correction; a human reviewer inspects, adjusts, and explicitly approves the change.

## Product Purpose

The MAD QA Workbench turns address-maintenance issues into isolated, evidence-rich cases. It gives an AI agent a safe snapshot of the relevant spatial and relational data, lets the agent express a proposed correction as a controlled changeset, and gives a human a map-first review and approval workflow before any edit can reach MAD.

Success means reviewers spend their time resolving ambiguity instead of gathering context, while every accepted change remains understandable, validated, attributable, and reproducible.

## Positioning

The product is not a general GIS editor or an autonomous production-writing agent. Its distinguishing mechanism is a case workspace that combines spatial context, relational closure, declarative MAD operations, automated validation, a human approval gate, and an audit trail.

## Operating Context

- Inputs may include existing MAD QA issues, Notify911-derived cases, Master Address records, address points and centroids, MAD structures, structure lookup records, address variants, and nearby reference data.
- Reviewers need imagery, roads, parcels, building footprints, municipal boundaries, and neighboring address sequences to understand an issue.
- The agent may render and inspect map context, but proposed coordinates and links must be based on vector data and controlled operations.
- The intended production integration may use ArcPy, enterprise geodatabase versioning, or a suitable ArcGIS feature service.
- Case notifications may link coworkers directly to the prepared review workspace.

## Capabilities and Constraints

- Each case must preserve production stable identifiers, source edit dates or row hashes, relationship identifiers, export time, source database/version, and an audit history.
- Agent edits are declarative operations such as moving or creating an address point and linking a Master Address; the browser never receives production database credentials.
- Human reviewers can inspect before/after states, see changed features and relationships, edit the draft, rerun validation, and approve or reject it.
- Publishing must freeze the approved changeset, recheck production preconditions, apply related edits transactionally, validate the result, and roll back on failure.
- The first demonstrable release supports moving an existing point, linking a Master Address to an existing point, and creating/linking a new point.
- Until real MAD schemas, services, authentication, and ArcPy workers are supplied, publishing is a clearly labeled simulation against synthetic case data.
- Exact production database schema, identity provider, deployment environment, and publishing mechanism remain open implementation decisions.

## Evidence on Hand

The user supplied a detailed workflow and architecture brief in the project conversation. No production MAD extracts, field schemas, imagery credentials, visual identity assets, testimonials, benchmarks, or deployment claims are present in the workspace. Demonstration cases must therefore be clearly labeled synthetic.

## Product Principles

- Review exceptions, not whole datasets.
- Show evidence and reasoning beside every proposed edit.
- Preserve spatial and relational context together.
- Give the agent narrow operations and the human final authority.
- Make every decision auditable, reproducible, and safe to reject.

## Accessibility & Inclusion

The workbench must remain operable with keyboard navigation, provide visible focus and non-color status cues, and support reduced motion. Dense map review should retain a useful list/table alternative to purely visual inspection.
