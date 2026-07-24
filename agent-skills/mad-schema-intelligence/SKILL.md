---
name: mad-schema-intelligence
description: Use this skill when users need MAD layer/table relationships, join reasoning, or data-model context from mad_schema_metadata_optimized.json.
---

# MAD Schema Intelligence

Use this skill for:
- Explaining how MAD and GISDATA layers fit together.
- Identifying the right join keys between tables.
- Producing relationship-aware table context before writing SQL/Python.

## Workflow

1. Refresh generated references from metadata:
```powershell
python scripts/build_mad_agent_assets.py
```

2. Use MCP-ready schema helpers:
```powershell
python agent_mcp/mad_schema_tools.py list-tables --schema MAD
python agent_mcp/mad_schema_tools.py describe-table MAD.MAD_MASTER_ADDRESS
python agent_mcp/mad_schema_tools.py find-join-path MAD.MAD_ADDRESS_POINTM MAD.MAD_MASTER_STREET_NAME
```

3. Load references only as needed:
- `references/schema_snapshot.md` for table/column inventory.
- `references/relationship_map.md` for parent-child graph and join hubs.

4. Return outputs with:
- Exact table names (`SCHEMA.TABLE`).
- Explicit join clauses with key fields.
- Any assumptions where relationship intent is unclear.

## Guardrails

- Do not invent joins when an explicit relationship exists in metadata.
- Prefer `MAD.MAD_MASTER_ADDRESS` for address-record context and `MAD.MAD_ADDRESS_POINTM` for point geometry context.
- Treat `SOURCE_NAME_ID`, `COMMUNITY_ID`, `STREET_NAME_ID`, `SITE_ID`, and `LOC_ID` as high-value linkage fields.
