# LLM Agent Installation Guide

This runbook is written for an LLM or coding agent helping a person install the MAD QA Workbench on Windows. Follow it in order, report evidence for every completed stage, and do not install duplicate runtimes when a compatible one already exists.

## 1. Installation contract

The target is a local, training-only workstation deployment:

- the React/Vite app listens on `127.0.0.1:4173`;
- the Node agent bridge listens on `127.0.0.1:8787`;
- LM Studio's OpenAI-compatible API listens on `127.0.0.1:1234`;
- one existing Python environment supplies GeoPandas, pandas, and Shapely;
- local generated state stays under ignored `.runtime/`;
- no production MAD credential enters the browser;
- ArcPy and an enterprise geodatabase are not required for local installation.

Before changing the machine, inspect it. Reuse a working Node installation, LM Studio installation, model, and Python environment whenever possible.

Do not:

- invoke the Microsoft Store `python.exe` alias;
- install the same Python geospatial stack into several Conda environments;
- install MapLibre, PMTiles, Tippecanoe, or WSL for the issue atlas;
- enable `MAD_PUBLISH_MODE=apply`;
- expose ports `1234`, `4173`, or `8787` beyond localhost;
- delete `.runtime/` unless the user explicitly approves losing local queues, proposal history, and generated evidence;
- stop an unknown process merely because it owns one of the expected ports.

## 2. Supported platform and validated stack

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

The selected local model must support OpenAI-compatible tool calling. Vision support is also needed for map-image evidence. The launcher's default model identifier is `gemma-4-e4b-it`, but another installed model may be supplied with `-Model`.

## 3. Inspect the machine first

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

## 4. Obtain the repository

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

## 5. Select one working Python environment

The launcher searches these candidates and uses the first interpreter that successfully imports GeoPandas, pandas, and Shapely:

1. `MAD_AGENT_PYTHON`;
2. `%USERPROFILE%\miniconda3\python.exe`;
3. `%USERPROFILE%\anaconda3\python.exe`;
4. equivalent installations under `%LOCALAPPDATA%`;
5. the active `CONDA_PREFIX`;
6. `python.exe` from `PATH`.

Probe a candidate directly:

```powershell
$madPython = Join-Path $env:USERPROFILE 'miniconda3\python.exe'
& $madPython -c "import sys, geopandas, pandas, shapely; print(sys.executable); print(geopandas.__version__, pandas.__version__, shapely.__version__)"
```

If that fails, inspect other existing environments:

```powershell
conda env list
conda run -n <environment-name> python -c "import sys, geopandas, pandas, shapely; print(sys.executable)"
```

When one succeeds, either let the launcher discover it or set the exact path for the current session:

```powershell
$env:MAD_AGENT_PYTHON = 'C:\exact\environment\python.exe'
```

Only when no existing environment works, ask the user which single environment should own the packages. For a Conda environment:

```powershell
conda install -n <environment-name> -c conda-forge geopandas pandas shapely
```

For a non-Conda virtual environment, use its interpreter rather than bare `pip`:

```powershell
& 'C:\exact\environment\python.exe' -m pip install geopandas pandas shapely
```

Re-run the import probe after installation. Do not install `arcpy`; it is optional and reserved for a future approved production publisher.

## 6. Install JavaScript dependencies

From the repository root:

```powershell
npm.cmd install
```

The double-click launcher also runs `npm install` when `node_modules` or the `sharp` map renderer is absent. Running it explicitly during installation makes failures easier to diagnose.

Do not add extra map packages. The detailed maps and QA Issue Atlas use the existing Leaflet and React-Leaflet dependencies. The issue atlas data is versioned local GeoJSON.

## 7. Prepare LM Studio

1. Install and launch LM Studio.
2. Download a tool-capable, vision-capable model that fits the workstation.
3. Record the identifier shown by:

   ```powershell
   lms.exe ls
   ```

4. If using the default identifier, confirm `gemma-4-e4b-it` is present. Otherwise pass the installed identifier to the launcher.

The launcher performs the remaining work:

- starts `lms server` on port `1234` when needed;
- loads the requested model when it is not already loaded;
- starts or refreshes the local Node bridge;
- starts Vite;
- opens the app unless `-NoBrowser` is supplied.

LM Studio documents `lms server start`, model management, and server status here:

- <https://lmstudio.ai/docs/cli/serve/server-start>
- <https://lmstudio.ai/docs/cli/serve/server-status>

Keep the server bound to `127.0.0.1`. CORS is unnecessary because the browser communicates through the local Node bridge.

## 8. Start the workbench

Normal user path:

```text
Double-click Start MAD QA Workbench.cmd
```

Agent-friendly PowerShell path with machine-readable output and no browser launch:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File '.\scripts\start-local-workbench.ps1' `
  -Model 'gemma-4-e4b-it' `
  -RockportFaults enabled `
  -NoBrowser
```

Replace the model identifier when needed:

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

## 9. Verify the installation

Run all checks from the repository root.

### Service checks

```powershell
$lmModels = Invoke-RestMethod -Uri 'http://127.0.0.1:1234/v1/models' -TimeoutSec 10
$health = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/health' -TimeoutSec 10
$app = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4173' -TimeoutSec 10
$atlas = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/api/qa/atlas' -TimeoutSec 120

[pscustomobject]@{
  LmModelCount = @($lmModels.data).Count
  BridgeService = $health.serviceId
  BridgeModel = $health.model
  AppStatus = $app.StatusCode
  AtlasFormat = $atlas.dataFormat
  AtlasFeatures = $atlas.featureCollection.features.Count
}
```

Expected signals:

- `LmModelCount` is at least `1`;
- `BridgeService` is `mad-qa-agent-bridge`;
- `BridgeModel` matches the requested model;
- `AppStatus` is `200`;
- `AtlasFormat` is `geojson`;
- the supplied Rockport fixture currently returns `7` atlas features when controlled faults are enabled.

### Automated checks

```powershell
npm.cmd test
npm.cmd run build
```

The build may report a non-fatal bundle-size advisory. A test failure or nonzero build exit code is not a successful installation.

### Browser smoke test

1. Open **Issue map** and confirm red QA point, line, or polygon features are visible.
2. Click a feature and confirm its QA issue card opens.
3. Expand **Browse mapped issues without the map** and confirm the textual fallback is populated.
4. Click **Refresh QA map** and confirm it completes without a Python or Microsoft Store message.
5. Open one QA category and confirm its bounded row preview loads.
6. Do not accept or publish a proposal as part of an installation smoke test.

## 10. Troubleshooting

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

The selected interpreter is real Python but lacks the geospatial stack. Search other existing Conda environments first. Install into one agreed environment only, set `MAD_AGENT_PYTHON`, and restart the launcher.

### `lms.exe` is missing

Launch LM Studio once, open a new PowerShell window, and retry `lms --help`. If it remains unavailable, follow <https://lmstudio.ai/docs/cli> or run the documented CLI installer:

```powershell
npx lmstudio install-cli
```

### Requested model is not available

Run:

```powershell
lms.exe ls
```

Use an exact installed identifier with `-Model`, or have the user download the intended model in LM Studio. Do not silently substitute a materially different model.

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
$atlas = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/api/qa/atlas' -TimeoutSec 120
$atlas.dataFormat
$atlas.featureCollection.features.Count
$atlas.bounds
```

If features exist:

1. hard-refresh the browser;
2. open **Browse mapped issues without the map**;
3. check whether a firewall or proxy blocks `tiles.arcgis.com`;
4. switch between the MassGIS basemap and 2025 imagery.

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

## 11. Optional production boundary

Local installation validates publisher handoffs without editing MAD. Production apply mode is intentionally incomplete and out of scope.

Do not set:

```powershell
$env:MAD_PUBLISH_MODE = 'apply'
```

Do not install ArcGIS Pro or ArcPy solely for the local workbench. A future production deployment must separately provide an approved ArcGIS Pro Python path through `MAD_ARCPY_PYTHON`, enterprise connection/version details, field mappings, authentication, transactional editing, validators, and audit storage. See [ARCPY_BRIDGE.md](ARCPY_BRIDGE.md).

## 12. Agent completion report

At the end, report:

```text
Repository:
Branch/commit:
Reused components:
Installed components:
Python executable:
Python package versions:
LM Studio model:
Service checks (1234/8787/4173):
Atlas format/feature count:
npm test:
npm run build:
Remaining user action:
```

Do not claim success from process existence alone. Success requires healthy endpoints, a populated issue atlas, and passing automated checks.
