# Rockport local-agent benchmark

Last updated: 2026-07-25

The benchmark applies a reversible fault overlay while reading the supplied Rockport MAD export. It never writes the source shapefiles or DBFs. The default double-click launcher enables the overlay and restarts the local bridge whenever the source, scenario manifest, model, or fault mode changes.

## Scenario set

| QA view | Category | Controlled fault | Expected correction |
|---|---|---|---|
| `MADV_QA_MA_DOM_ADDRSTAT` | MA | `14 Rowe Avenue` has an invalid `ADDRESS_STATUS` | Restore `ACTIVE` after confirming the related address context |
| `MADV_QA_AP_DOM_PTTYPE` | AP | `5 Doyles Cove Road` has `POINT_TYPE=ROOFTOP` | Restore `BC` after confirming its single-building relationship |
| `MADV_QA_AV_APID_MISMATCH` | AV | The `1 Ridgewood Road` variant points to a different address point | Match the variant to its Master Address point |
| `MADV_QA_AP_NO_STRUCT_LUT` | AP | The `10 Railroad Avenue` building point has no lookup row | Link the point to the intersecting same-parcel structure |
| `MADV_QA_ASL_BAD_TOWN_ID` | ASL | The `8 Smith Street` lookup has `STRUCTURE_TOWN_ID=999` | Restore Rockport town ID `252` |
| `MADV_QA_BRV_PARITY_EOM` | BRV | The Laurel Acres left range is even but its parity is `O` | Restore parity `E` after checking the complete range |
| `MADV_QA_ASL_DUPES` | ASL | The source export already contains a duplicate lookup at `8 Alpaca Court` | Retain one relationship; publication remains blocked without a stable row ID |

The versioned scenario definition and hidden evaluation values are in `data/rockport_qa_faults.json`. QA evidence sent to the model contains current broken values and related records, but not the manifest's expected answer.

## Evaluation loop

1. Open one marked **Rockport controlled fault** QA check.
2. Inspect its bounded map before running the agent.
3. Run only the real Rockport row, not the adjacent mock rows.
4. Record whether the model loaded the correct category skill, read the combined evidence packet, used map evidence when spatial interpretation mattered, classified the issue correctly, and staged or withheld appropriately.
5. Reject an incorrect proposal with a specific evidence-based explanation.
6. Confirm the model-authored memory entry targets the exact category skill.
7. Run the same case again and compare its descendant proposal with the first attempt.
8. Test a second case in the same category to determine whether the lesson generalizes without being over-applied.

Proposal IDs, parent/descendant relationships, model IDs, summaries, feedback, and statuses continue to append to `.runtime/proposal-history.csv`.

## Initial Qwen baseline

- Model: `qwen3-4b-thinking-2507`
- Run date: 2026-07-25
- Fault mode: enabled
- Reviewer memories: none loaded for the tested categories

| QA view | Skill/evidence behavior | Proposal result | Baseline finding |
|---|---|---|---|
| `MADV_QA_AP_DOM_PTTYPE` | Loaded MAD QA AP and MAD Schema Intelligence, then read the combined packet | No draft; blank final response | The model gathered the correct evidence but did not make a decision |
| `MADV_QA_AP_NO_STRUCT_LUT` | Loaded MAD QA AP and MAD Schema Intelligence, then read the combined packet | No draft; wrote a literal `<stage_fixture_draft>` fragment in prose | The model identified the missing relationship but did not use the native tool protocol |
| `MADV_QA_BRV_PARITY_EOM` | Loaded MAD QA BRV, recovered from one malformed packet call, loaded schema context, and read the packet | No draft; blank final response | The model recovered its evidence call but did not complete the proposal workflow |

These are intentionally retained as cold-run observations rather than converted into skill memory. Category memory must be authored only after a human reviewer rejects a staged proposal and supplies feedback. The result also distinguishes fixture quality from model behavior: all three cases resolved to real Rockport records and returned the expected bounded relationship evidence, while the model failed at the decision/tool-call step.

## Fault mode and reset

The source dataset is always unchanged. To temporarily read the original Rockport export without controlled faults:

```powershell
.\scripts\start-local-workbench.ps1 -RockportFaults disabled -NoBrowser
```

Re-enable the benchmark:

```powershell
.\scripts\start-local-workbench.ps1 -RockportFaults enabled -NoBrowser
```

The local bridge reports the active mode from `/api/health`. The adapter reports the fixture and scenario count with:

```powershell
python scripts\mad_fixture_adapter.py fault-status
```

## Interpretation limit

The agent decides whether the evidence justifies a proposal. When it stages, the server supplies the scenario's controlled, non-publishable draft operation. This benchmark therefore measures investigation, skill use, tool use, classification, explanation, rejection recovery, and memory transfer; it does not yet measure free-form changeset generation.
