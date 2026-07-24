#!/usr/bin/env python3
"""Validate and, when explicitly configured later, publish an approved MAD QA handoff.

This script deliberately performs no edit in its default ``validate`` mode.  It is
the only process boundary intended to receive approved browser drafts.  Production
application is blocked until a MAD-specific connection, field map, relationship
policy, and ArcPy adapter are approved and supplied.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


ALLOWED_OPERATION_TYPES = {
    "create_address_point",
    "move_address_point",
    "link_address_to_point",
    "link_point_to_structure",
}


def result(status: str, message: str, *, production_applied: bool = False, errors: list[str] | None = None) -> int:
    print(json.dumps({
        "status": status,
        "message": message,
        "productionApplied": production_applied,
        "errors": errors or [],
    }))
    return 0 if not errors else 2


def load_handoff(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as source:
        payload = json.load(source)
    if not isinstance(payload, dict):
        raise ValueError("Publisher handoff must be a JSON object.")
    return payload


def validate_handoff(handoff: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    if handoff.get("kind") != "mad-qa-publisher-handoff":
        errors.append("Unsupported handoff kind.")
    if handoff.get("schemaVersion") != "0.1.0":
        errors.append("Unsupported handoff schema version.")
    if not handoff.get("jobId") or not handoff.get("caseId"):
        errors.append("Handoff requires jobId and caseId.")

    decision = handoff.get("decision")
    if not isinstance(decision, dict) or decision.get("type") != "accept" or not decision.get("approvalId"):
        errors.append("Handoff requires an immutable acceptance decision.")

    draft = handoff.get("draft")
    if not isinstance(draft, dict) or not draft.get("id"):
        errors.append("Handoff requires a staged draft identifier.")
    elif not draft.get("validation", {}).get("passed"):
        errors.append("Draft validation did not pass.")

    snapshot = handoff.get("sourceSnapshot")
    if not isinstance(snapshot, dict) or not snapshot.get("rowHash") or not snapshot.get("version"):
        errors.append("Handoff requires source snapshot version and row hash preconditions.")

    operations = handoff.get("operations")
    if not isinstance(operations, list) or not operations:
        errors.append("Handoff requires at least one controlled operation.")
    else:
        for index, operation in enumerate(operations, start=1):
            if not isinstance(operation, dict):
                errors.append(f"Operation {index} is not an object.")
                continue
            if operation.get("type") not in ALLOWED_OPERATION_TYPES:
                errors.append(f"Operation {index} is not allow-listed.")
            if not operation.get("target") or not operation.get("detail"):
                errors.append(f"Operation {index} requires a target and detail.")

    changes = handoff.get("changes")
    if not isinstance(changes, list) or not changes:
        errors.append("Handoff requires a non-empty reviewed change list.")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="MAD QA ArcPy publisher handoff")
    parser.add_argument("--handoff", required=True, type=Path, help="Frozen publisher handoff JSON")
    parser.add_argument("--mode", choices=("validate", "apply"), default="validate")
    args = parser.parse_args()

    try:
        handoff = load_handoff(args.handoff)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return result("invalid-handoff", f"Could not read publisher handoff: {error}", errors=[str(error)])

    errors = validate_handoff(handoff)
    if errors:
        return result("invalid-handoff", "Publisher handoff failed validation.", errors=errors)

    if args.mode == "validate":
        return result(
            "validated-handoff",
            "Publisher handoff is structurally valid. Validate mode made no MAD edit.",
        )

    # Deliberately fail closed. A real implementation must be supplied by the MAD
    # data steward after the actual SDE/service connection, versioning strategy,
    # field mappings, relationship classes, GlobalID policy, and QA validators are
    # known. It should use arcpy.da.Editor (or an approved child version) to apply
    # every operation atomically, re-check source hashes, and roll back on failure.
    return result(
        "blocked",
        "Apply mode is disabled until an approved MAD ArcPy adapter is configured; no production edit was made.",
        errors=["MAD production adapter is not configured."],
    )


if __name__ == "__main__":
    sys.exit(main())
