# LLM Agent Installation Guide

This runbook is written for an LLM or coding agent helping a person install the MAD QA Workbench on Windows. Follow it in order, report evidence for every completed stage, and do not install duplicate runtimes when a compatible one already exists.

## 1. Installation contract

The target is a training-only deployment on one Windows machine. It supports
either one local developer or several trusted Windows users logged into the
same AWS WorkSpace:

- the shared built app and Node bridge both listen on `127.0.0.1:8787`;
- Vite on `127.0.0.1:4173` is used only for single-user development;
- LM Studio's OpenAI-compatible API listens on `127.0.0.1:1234`;
- exactly one Node bridge process owns all QA and LLM work;
- one existing Python environment supplies GeoPandas, pandas, and Shapely;
- Node's built-in `fetch` retrieves only fixed, bounded public MassGIS context;
- local generated state stays under ignored `.runtime/`;
- each reviewer enters 2–6 initials for coordination and audit attribution;
- no production MAD credential enters the browser;
- ArcPy and an enterprise geodatabase are not required for local installation.

Before changing the machine, inspect it. Reuse a working Node installation, LM Studio installation, model, and Python environment whenever possible.

Do not:

- invoke the Microsoft Store `python.exe` alias;
- install the same Python geospatial stack into several Conda environments;
- install MapLibre, PMTiles, Tippecanoe, or WSL for the issue atlas;
- enable `MAD_PUBLISH_MODE=apply`;
- expose ports `1234`, `4173`, or `8787` beyond the AWS WorkSpace;
- start a second Node bridge process against the same `.runtime/` directory;
- delete `.runtime/` unless the user explicitly approves losing local queues, proposal history, and generated evidence;
- stop an unknown process merely because it owns one of the expected ports.

## 2. Current multi-user status

The current release supports coordinated use by trusted people whose separate
Windows sessions all run on the **same AWS WorkSpace machine**. Windows
loopback is machine-wide, so every session can open
<http://127.0.0.1:8787> and reach the one shared bridge. Do not deploy this
design across several machines or run more than one bridge process.

| Capability | Current behavior |
| --- | --- |
| Users in separate sessions on this AWS WorkSpace | Supported. They see the same queue, inbox, claims, decisions, and follow-up conversation through one bridge. |
| Users on different machines | Not supported. The bridge intentionally binds to `127.0.0.1`. |
| Reviewer identity | The browser requires 2–6 initials. Initials are coordination metadata, not authenticated SSO, and duplicate initials are possible. |
| One sequential LLM worker | Every issue investigation, case follow-up, and reviewer-memory request shares one persistent FIFO sequence and concurrency is exactly `1`. |
| Queue position | The global queue and each streaming follow-up show exact position, total, and work ahead. |
| “Who is working on this?” | Jobs carry their creator. Review items use a 60-minute claim lease and show the claimant's initials. |
| Duplicate-work prevention | A `(viewId, recordId)` already active, reviewable, accepted, or rejected cannot be queued again. A batch also rejects duplicate rows. |
| Safe concurrent decisions | Claim versions provide optimistic concurrency. A stale tab or a person without the claim cannot accept/reject. Only a batch creator can pause, resume, or cancel it. |
| Shared durable state | Queue, requests, transcripts, claims, and decisions persist in `.runtime\qa-batch-jobs.json`. |
| Activity attribution | `.runtime\reviewer-agent-activity.jsonl` appends the actor initials for issues, claims, every follow-up prompt, revisions, decisions, and rejected-to-accepted recoveries. |
| Public map context | Every user sees the same sparse QA atlas. Selecting an issue requests the same fixed 250 m MassGIS parcel, structure, and address-point window through the one shared bridge cache. |
| Multiple API or worker processes | Not supported or needed on this one machine. Local JSON/JSONL stores require exactly one Node owner. |

This is a trusted-workspace coordination model, not a security boundary. Anyone
who can use the WorkSpace can choose any initials and call the loopback API.
Back up `.runtime/`, restrict access to the WorkSpace, and use one approved
service account to run the bridge.

A future deployment across several machines needs, at minimum:

1. one centrally hosted internal web/API deployment over HTTPS, rather than Vite's development server;
2. organizational SSO through OIDC/SAML or an approved reverse-proxy identity layer;
3. user and role records for reviewer, approver, administrator, and service identities;
4. a transactional shared database for QA issues, assignments, jobs, results, decisions, and audit events;
5. an atomic claim/lease operation with `claimed_by`, `claimed_at`, expiration, status, and release/reassignment rules;
6. one stable issue key such as `(source_run_id, view_id, record_id)` plus a database uniqueness rule that prevents more than one active claim or queued/running investigation;
7. idempotency keys on enqueue and decision requests;
8. optimistic concurrency/version checks so a stale browser cannot accept, reject, pause, or reassign newer state;
9. one centralized sequential LLM worker, or database-backed worker locking that guarantees global concurrency `1` across service replicas;
10. reviewer-visible assignee, activity, timestamps, and resolution state refreshed through SSE/WebSocket or polling;
11. append-only audit records containing authenticated actor identity and before/after state;
12. shared evidence/object storage where more than one service process can read generated artifacts.

Until those controls exist, keep the application on one trusted AWS WorkSpace
and treat initials as self-asserted coordination identity.

## 3. Supported platform and validated stack

The automated launcher is Windows PowerShell code. The currently validated workstation stack is:

| Component | Validated version | Requirement |
| --- | --- | --- |
| Windows | Windows 10/11 x64 | PowerShell 5.1 or newer |
| Git | 2.43 | Any current Git for Windows |
| Node.js | 22.19 | Use a supported LTS release; Node 22 or 24 is preferred |
| npm | 10.9 | Installed with Node |
| LM Studio | Current desktop release | Must expose the `lms` CLI |
| Python | 3.13.9 | One environment with the packages below |
| GeoPandas | 1.1.2 | Required by the local MAD fixture adapter |
| pandas | 2.3.3 | Required |
| Shapely | 2.1.2 | Required |

LM Studio's Windows guidance recommends at least 16 GB RAM and 4 GB dedicated VRAM; x64 CPUs require AVX2. Check the current upstream requirements before buying or provisioning hardware:

- <https://lmstudio.ai/docs/app/system-requirements>
- <https://lmstudio.ai/docs/cli>
- <https://nodejs.org/en/download>

The selected local model must support OpenAI-compatible tool calling. Vision support is also needed for map-image evidence. The launcher discovers installed LM Studio LLMs, automatically selects a sole model, and prompts when several are available. An exact installed model key may still be supplied with `-Model` for unattended startup.

The WorkSpace must permit outbound HTTPS to these public service hosts:

- `tiles.arcgis.com` for the MassGIS basemap, L3/structure tile metadata, and
  2025 imagery;
- `services1.arcgis.com` for bounded parcel and structure features;
- `arcgisserver.digital.mass.gov` for bounded Master Address Points.

No API key is required. Browsers load basemap/imagery tiles directly; the one
Node bridge loads the three vector services. If workplace policy requires a
proxy, configure it for the approved service account before starting the bridge.

## 4. Inspect the machine first

Run these read-only commands in PowerShell:

```powershell
Get-Command git.exe, node.exe, npm.cmd, lms.exe -ErrorAction SilentlyContinue |
  Select-Object Name, Source

git --version
node --version
npm.cmd --version
lms.exe --help
lms.exe ls

Get-Command conda, python.exe -ErrorAction SilentlyContinue |
  Select-Object Name, Source

if (Get-Command conda -ErrorAction SilentlyContinue) {
  conda env list
}
```

Interpret the results:

1. If Git, Node, npm, or LM Studio is missing, install only the missing component.
2. LM Studio ships with `lms`. Launch LM Studio once before concluding that `lms` is unavailable.
3. If LM Studio is installed but `lms` is still absent, use the current official CLI instructions. The upstream fallback is:

   ```powershell
   npx lmstudio install-cli
   ```

4. Do not trust `Get-Command python.exe` alone. A path under `WindowsApps` may be the Microsoft Store alias rather than Python.
5. Search existing Conda base and named environments for the required imports before installing packages.

## 5. Obtain the repository

If the repository is not already present:

```powershell
git clone https://github.com/mmulqu/QA_mapper.git
Set-Location -LiteralPath '.\QA_mapper'
```

If it is present:

```powershell
Set-Location -LiteralPath 'C:\path\to\QA_mapper'
git status -sb
git remote -v
```

Do not discard or overwrite an existing dirty worktree. Ask the user before switching branches, pulling across local changes, or cleaning generated files.

The clone includes the Rockport fixture under `data\MAD_data_rockport\` and the QA catalog at `data\MAD_QA_20260724.txt`. Confirm both exist:

```powershell
Test-Path -LiteralPath '.\data\MAD_data_rockport'
Test-Path -LiteralPath '.\data\MAD_QA_20260724.txt'
```

Both results must be `True`.

## 6. Select one working Python environment

The launcher searches these candidates and uses the first interpreter that successfully imports GeoPandas, pandas, and Shapely:

1. `MAD_AGENT_PYTHON`;
2. `%USERPROFILE%\miniconda3\python.exe`;
3. `%USERPROFILE%\anaconda3\python.exe`;
4. equivalent installations under `%LOCALAPPDATA%`;
5. the active `CONDA_PREFIX`;
6. `python.exe` from `PATH`.

The project's complete minimal Python install request is [requirements-local.txt](../requirements-local.txt):

```text
geopandas==1.1.2
```

GeoPandas declares the runtime dependency set needed here, including pandas,
Shapely, pyproj, pyogrio, NumPy, and packaging. ArcPy, Jupyter, matplotlib,
SciPy, PostGIS drivers, and Python web frameworks are not required for the
local workbench.

Probe a candidate directly:

```powershell
$madPython = Join-Path $env:USERPROFILE 'miniconda3\python.exe'
& $madPython -c "import sys, geopandas, pandas, shapely, pyproj, pyogrio; print(sys.executable); print(geopandas.__version__, pandas.__version__, shapely.__version__, pyproj.__version__, pyogrio.__version__)"
```

If that fails, inspect other existing environments:

```powershell
conda env list
conda run -n <environment-name> python -c "import sys, geopandas, pandas, shapely, pyproj, pyogrio; print(sys.executable)"
```

When one succeeds, either let the launcher discover it or set the exact path for the current session:

```powershell
$env:MAD_AGENT_PYTHON = 'C:\exact\environment\python.exe'
```

Only when no existing environment works, ask the user which single environment should own the packages.

On a clean target workstation with Conda available, create one project-specific environment:

```powershell
conda create -n mad-qa -c conda-forge python=3.13 geopandas=1.1.2
conda run -n mad-qa python -c "import sys, geopandas, pandas, shapely, pyproj, pyogrio; print(sys.executable)"
conda run -n mad-qa python -c "import sys; print(sys.executable)"
```

Use the final command's output as `MAD_AGENT_PYTHON`.

For a clean machine using standard Python instead of Conda:

```powershell
py -3.13 -m venv .venv
& '.\.venv\Scripts\python.exe' -m pip install --upgrade pip
& '.\.venv\Scripts\python.exe' -m pip install -r '.\requirements-local.txt'
& '.\.venv\Scripts\python.exe' -c "import sys, geopandas, pandas, shapely, pyproj, pyogrio; print(sys.executable)"
$env:MAD_AGENT_PYTHON = (Resolve-Path '.\.venv\Scripts\python.exe').Path
```

Do not run both installation paths. Re-run the import probe after installation. Do not install `arcpy`; it is optional and reserved for a future approved production publisher.

For the shared AWS WorkSpace, install under the same Windows account that will
run the bridge, or grant that service account read/execute access to the chosen
interpreter. Record the absolute `python.exe` path in the service configuration;
do not rely on an activated Conda shell or a prior developer machine's
environment name. On a clean work machine, the repository-local `.venv` recipe
above is the most self-describing choice. It installs the one declared package
from `requirements-local.txt`; pip resolves its required pandas, Shapely,
pyproj, pyogrio, NumPy, and packaging dependencies.

## 7. Install JavaScript dependencies

From the repository root:

```powershell
npm.cmd install
```

The double-click launcher also runs `npm install` when `node_modules` or the `sharp` map renderer is absent. Running it explicitly during installation makes failures easier to diagnose.

Do not add extra map packages. The detailed maps and QA Issue Atlas use the
existing Leaflet and React-Leaflet dependencies. The issue atlas data is
versioned local GeoJSON, and public MassGIS evidence uses Node's built-in
`fetch`. It does not require PMTiles, an Esri SDK, or another Python package.

## 8. Prepare LM Studio

1. Install and launch LM Studio.
2. Download a tool-capable, vision-capable model that fits the workstation.
3. Confirm that at least one LLM is listed by:

   ```powershell
   lms.exe ls --llm
   ```

The launcher performs the remaining work:

- starts `lms server` on port `1234` when needed;
- discovers installed LLMs and prompts for a choice when more than one is available;
- unloads and freshly loads the selected model when starting the bridge;
- starts or refreshes the local Node bridge;
- starts Vite;
- opens the app unless `-NoBrowser` is supplied.

LM Studio documents `lms server start`, model management, and server status here:

- <https://lmstudio.ai/docs/cli/serve/server-start>
- <https://lmstudio.ai/docs/cli/serve/server-status>

Keep the server bound to `127.0.0.1`. CORS is unnecessary because the browser communicates through the local Node bridge.

## 9. Start the workbench

### Shared AWS WorkSpace service

Run this path once under the approved service account. Other users must not run
the local launcher or start their own bridge:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File '.\scripts\start-shared-workbench.ps1' `
  -PythonPath 'C:\absolute\path\to\python.exe' `
  -Model '<installed-model-key>'
```

The script validates the exact Python interpreter, installs the JavaScript
lockfile dependencies, builds the React app, starts or reuses LM Studio, loads
the selected model, and then runs the single Node bridge in the foreground.
Keep `-Model` in unattended Task Scheduler commands so a machine with multiple
installed models never pauses for interactive input.
The bridge serves both the API and the built app at
<http://127.0.0.1:8787>. All Windows users on that AWS WorkSpace open that same
URL and enter their own 2–6 initials.

For unattended operation, configure Windows Task Scheduler to invoke that exact
PowerShell command:

- run under one approved service account;
- set **Start in** to the repository root;
- select **Run whether user is logged on or not**;
- trigger at machine startup;
- do not enable parallel task instances;
- redirect normal task output according to the workplace's log-retention
  policy.

The task must own a single long-running `node.exe scripts/agent-server.mjs`
process. If port `8787` is already occupied, the shared launcher fails closed
instead of stopping an unknown or existing bridge. During an upgrade, stop the
scheduled task, back up `.runtime/`, update and test the repository, then start
the task once.

The shared state that must survive restarts is:

| Path | Contents |
| --- | --- |
| `.runtime\qa-batch-jobs.json` | FIFO requests, batch items, transcripts, claims, versions, results, and decisions |
| `.runtime\reviewer-agent-activity.jsonl` | Append-only initials attribution, exact follow-up prompts, revisions, decisions, and recovery credit |
| `.runtime\proposal-history.csv` | Proposal lineage events |
| `.runtime\map-evidence\` and related evidence folders | Generated review evidence |

Back up the entire `.runtime/` directory while the bridge is stopped. Restoring
only one of these files can separate attribution from the work it describes.

### Single-user local development

Normal user path:

```text
Double-click Start MAD QA Workbench.cmd
```

Agent-friendly PowerShell path with machine-readable output and no browser launch:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File '.\scripts\start-local-workbench.ps1' `
  -RockportFaults enabled `
  -NoBrowser
```

When several models are installed, this interactive command prompts for one.
For an unattended or preselected launch, pass its exact LM Studio model key:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File '.\scripts\start-local-workbench.ps1' `
  -Model '<identifier-from-lms-ls>' `
  -NoBrowser
```

Expected final message:

```text
MAD QA Workbench is ready.
```

Open <http://127.0.0.1:4173>.

## 10. Verify the installation

Run all checks from the repository root.

### Service checks

```powershell
$lmModels = Invoke-RestMethod -Uri 'http://127.0.0.1:1234/v1/models' -TimeoutSec 10
$health = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/health' -TimeoutSec 10
$app = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8787' -TimeoutSec 10
$atlas = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/qa/atlas' -TimeoutSec 120
$context = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/massgis/context?bbox=-70.630,42.650,-70.615,42.662&zoom=18&layers=parcels,structures,addresses' -TimeoutSec 30
$activity = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/audit/reviewer-activity' -TimeoutSec 10

[pscustomobject]@{
  LmModelCount = @($lmModels.data).Count
  BridgeService = $health.serviceId
  BridgeModel = $health.model
  AppStatus = $app.StatusCode
  AtlasFormat = $atlas.dataFormat
  AtlasFeatures = $atlas.featureCollection.features.Count
  ContextKind = $context.kind
  ContextLayers = @($context.layers).Count
  ContextErrors = @($context.errors).Count
  ActivityLog = $activity.relativePath
}
```

Expected signals:

- `LmModelCount` is at least `1`;
- `BridgeService` is `mad-qa-agent-bridge`;
- `BridgeModel` matches the requested model;
- `AppStatus` is `200`;
- `AtlasFormat` is `geojson`;
- the supplied Rockport fixture currently returns `7` atlas features when controlled faults are enabled.
- `ContextKind` is `massgis-public-context`, `ContextLayers` is `3`, and
  `ContextErrors` is `0` when all three public services are reachable;
- `ActivityLog` is `.runtime\reviewer-agent-activity.jsonl`.

For a Vite development run, use port `4173` for `$app` and `$atlas`. The shared
service verification above deliberately uses only port `8787`.

### Automated checks

```powershell
npm.cmd test
npm.cmd run build
```

The build may report a non-fatal bundle-size advisory. A test failure or nonzero build exit code is not a successful installation.

### Browser smoke test

1. Open **Issue map** and confirm red QA point, line, or polygon features are visible.
2. Click a feature and confirm its QA issue card opens and the map zooms in.
3. Confirm **MassGIS public evidence** reports parcels, structures, and address
   points for a 250 m window; use **Public context** to toggle each layer. Click
   one feature in each public layer and confirm the read-only attribute sheet
   opens with an **Open official service metadata** link.
4. Switch to **2025 imagery** and confirm the same red QA issue remains above the
   public reference layers.
5. Expand **Browse mapped issues without the map** and confirm the textual fallback is populated.
6. Click **Refresh QA map** and confirm it completes without a Python or Microsoft Store message.
7. Open one QA category and confirm its bounded row preview loads.
8. Do not accept or publish a proposal as part of an installation smoke test.

### Two-user coordination smoke test

Use two separate Windows sessions on the same AWS WorkSpace:

1. User A opens <http://127.0.0.1:8787>, enters their initials, and queues one
   issue.
2. User B opens the same URL, enters different initials, and confirms the issue,
   owner, current status, and global queue position are visible.
3. User B attempts to queue that same issue and confirms the bridge rejects the
   duplicate.
4. One user claims the completed review item. Confirm the other sees the
   claimant and cannot claim or decide it.
5. Queue a case follow-up while other work exists. Confirm its panel shows
   `position X of Y` and the shared queue shows the same FIFO order.
6. Confirm the prompt author appears in the shared case conversation and a
   `followup_prompt_queued` line with those initials and the exact prompt exists
   in `.runtime\reviewer-agent-activity.jsonl`.

Do not run a second bridge for this test.

## 11. Troubleshooting

### “Python was not found” or Microsoft Store alias

Cause: a Node subprocess inherited the Windows `python.exe` alias.

Recovery:

```powershell
$env:MAD_AGENT_PYTHON = 'C:\exact\working\python.exe'
& $env:MAD_AGENT_PYTHON -c "import geopandas, pandas, shapely"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File '.\scripts\start-local-workbench.ps1' -NoBrowser
```

The bridge must be restarted after changing `MAD_AGENT_PYTHON`; an already-running Node process retains its old environment.

### `ModuleNotFoundError: geopandas`

The selected interpreter is real Python but lacks the geospatial stack. Search other existing Conda environments first. If none works, install `requirements-local.txt` into one agreed environment, set `MAD_AGENT_PYTHON`, and restart the launcher.

### `lms.exe` is missing

Launch LM Studio once, open a new PowerShell window, and retry `lms --help`. If it remains unavailable, follow <https://lmstudio.ai/docs/cli> or run the documented CLI installer:

```powershell
npx lmstudio install-cli
```

### No model is available, or a requested model is not found

Run:

```powershell
lms.exe ls --llm
```

Download at least one LLM in LM Studio. For unattended startup, use an exact
installed model key with `-Model`; otherwise omit `-Model` and choose from the
launcher's discovered list. The launcher does not silently substitute a
materially different model.

### LM Studio is installed but port 1234 is down

```powershell
lms.exe server status
lms.exe server start --port 1234
Invoke-RestMethod -Uri 'http://127.0.0.1:1234/v1/models'
```

### Port 4173 or 8787 is occupied

Inspect ownership before stopping anything:

```powershell
$listeners = Get-NetTCPConnection -State Listen |
  Where-Object LocalPort -In 4173, 8787, 1234 |
  Select-Object LocalAddress, LocalPort, OwningProcess
$listeners

$processIds = @($listeners.OwningProcess)
Get-CimInstance Win32_Process |
  Where-Object { $_.ProcessId -in $processIds } |
  Select-Object ProcessId, Name, CommandLine
```

The launcher safely refreshes its own `scripts\agent-server.mjs` process on port `8787`. It refuses to replace an unknown process there. Ask the user before stopping unrelated software.

### The app loads but the map is blank

Check the local data before blaming the public basemap:

```powershell
$atlas = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/qa/atlas' -TimeoutSec 120
$atlas.dataFormat
$atlas.featureCollection.features.Count
$atlas.bounds
$context = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/massgis/context?bbox=-70.630,42.650,-70.615,42.662&zoom=18&layers=parcels,structures,addresses' -TimeoutSec 30
$context.layers | Select-Object id, featureCount, truncated, cacheHit
$context.errors
```

If features exist:

1. hard-refresh the browser;
2. open **Browse mapped issues without the map**;
3. check whether a firewall or proxy blocks `tiles.arcgis.com`,
   `services1.arcgis.com`, or `arcgisserver.digital.mass.gov`;
4. switch between the MassGIS basemap and 2025 imagery;
5. click a red issue before expecting public vectors—the app deliberately makes
   no statewide parcel, structure, or address-point request.

The local red issue vectors and textual index are designed to remain useful when public basemap tiles fail.

### Refresh fails after source changes

Run the launcher again. It fingerprints bridge source files and restarts a stale bridge. Then retry:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri 'http://127.0.0.1:8787/api/qa/atlas/refresh' `
  -Headers @{ 'x-mad-local-action' = 'refresh-qa-atlas' } `
  -TimeoutSec 120
```

### npm installation fails

Record `node --version`, `npm --version`, and the complete npm error. Prefer a supported Node LTS version, remove no lockfile without approval, and retry `npm install` once after correcting the concrete cause.

## 12. Production boundary

Local installation validates publisher handoffs without editing MAD. Production apply mode is intentionally incomplete and out of scope.

Do not set:

```powershell
$env:MAD_PUBLISH_MODE = 'apply'
```

Do not install ArcGIS Pro or ArcPy solely for the local workbench. A future production deployment must separately provide an approved ArcGIS Pro Python path through `MAD_ARCPY_PYTHON`, enterprise connection/version details, field mappings, authentication, transactional editing, validators, and audit storage. See [ARCPY_BRIDGE.md](ARCPY_BRIDGE.md).

### Minimum production read contract

Do **not** copy the entire MAD into the web application. The production machine
needs a read-only database/API adapter with these bounded interfaces:

| Proposed database object or API | Required purpose and fields |
| --- | --- |
| `MADV_QA_ISSUE_INDEX` | One sparse row per current exception, built from the approved `MADV_QA_*` checks. Required fields: `source_run_id`, `view_id`, `record_id`, category, description, severity, town/community ID, status, source watermark/edit date, stable row hash, and either the affected geometry or an anchor layer plus stable anchor ID. Unique key: `(source_run_id, view_id, record_id)`. |
| `MADV_QA_ISSUE_ANCHOR` | Resolves nonspatial QA rows to one approved address point, structure, parcel, street arc, centroid, site, or community geometry. Return the relationship path used; do not let the browser invent joins. |
| `MAD_QA_GET_CASE_EVIDENCE` (read-only procedure or Case API query) | Given one issue key, return only its current source row, relationship closure, nearby address sequence, and geometry inside an approved radius. Include stable IDs, edit dates, row hashes, relationship IDs, source database/version, and extraction time. |
| `MADV_QA_SOURCE_WATERMARK` | Reports the QA run/version and the source edit watermark so atlas refresh and stale-proposal checks are reproducible. |

`MADV_QA_ISSUE_INDEX`, `MADV_QA_ISSUE_ANCHOR`, and
`MADV_QA_SOURCE_WATERMARK` are recommended adapter names, not claims about
objects that already exist. The existing source checks retain their real names
from the supplied report—such as `MADV_QA_MA_DUPES`,
`MADV_QA_AV_APID_MISMATCH`, `MADV_QA_AP_DUPES`,
`MADV_QA_ASL_DUPES`, `MADV_QA_BRV_LINKFEAT`,
`MADV_QA_BSA_NO_BRV`, `MADV_QA_MSN_AP_ONLY`,
`MADV_QA_SNV_DOM_STNMID`, and `MADV_QA_ESZ_PSAP_NAME`. The production owner
must confirm every enabled `MADV_QA_*` view, its stable record key, and refresh
cadence rather than relying on those examples alone.

The case-evidence adapter needs read access only to the relevant relationship
tables/views, including Master Address, Address Variants, Address Points,
Address Point Centroids, Point–Structure Lookup, MAD Structures, Base Range
Variants, Base Street Arcs, Master Street Names, Street Name Variants, Sites,
communities, and parcels. It must query by the selected issue's stable keys and
radius—not export the whole town or state.

Public MassGIS parcels, structures, address points, basemap, and imagery remain
read-only external context. They do not replace secured MAD relationship data,
do not establish a production edit target, and require no database view.

Production writes stay in a separate publisher identity and process. The
publisher re-reads only the approved affected rows, verifies row hashes/edit
dates, applies the allow-listed changes transactionally, validates, and appends
an immutable audit event. The web/API service account must not inherit that
write credential.

Moving the code to one shared AWS WorkSpace supports the trusted, initials-based
coordination described in [Current multi-user status](#2-current-multi-user-status).
It does not supply organizational authentication, authorization, a
multi-machine database, or distributed worker locking. Complete those remaining
requirements before exposing the app beyond that one machine or treating its
initials as verified identity.

## 13. Agent completion report

At the end, report:

```text
Repository:
Branch/commit:
Reused components:
Installed components:
Python executable:
Python package versions:
LM Studio model:
Service checks (1234/8787, plus 4173 only for development):
Atlas format/feature count:
Reviewer activity log:
npm test:
npm run build:
Remaining user action:
```

Do not claim success from process existence alone. Success requires healthy endpoints, a populated issue atlas, and passing automated checks.
