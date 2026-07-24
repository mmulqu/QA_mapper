# ArcPy publishing bridge

The browser must never execute ArcPy, arbitrary SQL, or direct feature-service edits. It submits an approved, immutable changeset to a separate write-enabled worker.

## Suggested endpoints

### `POST /api/cases/{case_id}/accept`

Freezes the current draft, validates its allow-listed operations and source snapshot preconditions, writes an immutable handoff JSON, and invokes `scripts/arcpy_publish.py`. The browser does not send an arbitrary changeset and never receives MAD credentials.

`POST /api/cases/{case_id}/reject` records a short human comment. The local agent receives that comment as case-scoped context on its next request; it does not make a production edit.

### `POST /publish-jobs`

Accepts the approval identifier, not a new client-authored changeset. A server-side allow-list converts each controlled operation into the corresponding ArcPy function.

### `GET /publish-jobs/{job_id}`

Returns queued, preflight, applying, validating, committed, rolled-back, stale, or failed state plus an append-only event log.

## Worker rules

- Resolve every target from a stable production identifier.
- Recompute the affected-record closure on the server.
- Reject unknown operation names and unexpected payload fields.
- Compare source hashes and edit dates before opening an edit session.
- Use `arcpy.da.Editor` or an enterprise geodatabase version so related table and feature edits are atomic.
- Generate production IDs server-side for temporary references such as `new-point-1`.
- Rerun the validation bundle after edits but before commit.
- Roll back the complete transaction when any required postcondition fails.
- Store the frozen request, resolved targets, exact before/after values, worker version, validator versions, approver, timestamps, and final disposition.

## Initial adapter surface

The first adapter needs only four functions:

```text
create_address_point(operation, resolved_context)
move_address_point(operation, resolved_context)
link_address_to_point(operation, resolved_context)
link_point_to_structure(operation, resolved_context)
```

Each function should return a structured before/after record for the audit log. It should not commit independently; the job owns the transaction.

## Current local behavior

The workbench now sends an accepted fixture draft to the publisher script in **validate** mode. It stores the frozen job under `.runtime/mad-publisher-jobs/` (ignored by Git) and checks the handoff schema, validation result, source hash, and allow-listed operation names. Validate mode makes no MAD edit and does not require ArcPy.

`MAD_PUBLISH_MODE=apply` may be used only after the real adapter is approved. Point `MAD_ARCPY_PYTHON` to the ArcGIS Pro Python executable and provide the real connection/version, MAD field map, relationship rules, GlobalID policy, validators, and audit destination. The supplied script fails closed in apply mode until that MAD-specific adapter exists.
