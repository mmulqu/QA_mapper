[CmdletBinding()]
param(
  [string]$Model,
  [ValidateSet('enabled', 'disabled')]
  [string]$RockportFaults = 'enabled',
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$agentPort = 8787
$appPort = 4173
$lmStudioPort = 1234
. (Join-Path $PSScriptRoot 'lm-studio-model-selection.ps1')

function Test-LocalUrl {
  param([Parameter(Mandatory = $true)][string]$Url)

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
  } catch {
    return $false
  }
}

function Wait-ForLocalUrl {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$ServiceName,
    [int]$TimeoutSeconds = 45
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-LocalUrl -Url $Url) { return }
    Start-Sleep -Milliseconds 350
  }
  throw "$ServiceName did not become ready at $Url within $TimeoutSeconds seconds."
}

function Test-PortListener {
  param([Parameter(Mandatory = $true)][int]$Port)
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Resolve-MadPython {
  $candidatePaths = @()
  if ($env:MAD_AGENT_PYTHON) {
    $candidatePaths += $env:MAD_AGENT_PYTHON
  }
  if ($env:USERPROFILE) {
    $candidatePaths += (Join-Path $env:USERPROFILE 'miniconda3\python.exe')
    $candidatePaths += (Join-Path $env:USERPROFILE 'anaconda3\python.exe')
  }
  if ($env:LOCALAPPDATA) {
    $candidatePaths += (Join-Path $env:LOCALAPPDATA 'miniconda3\python.exe')
    $candidatePaths += (Join-Path $env:LOCALAPPDATA 'anaconda3\python.exe')
  }
  if ($env:CONDA_PREFIX) {
    $candidatePaths += (Join-Path $env:CONDA_PREFIX 'python.exe')
  }
  $pathPython = Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($pathPython) {
    $candidatePaths += $pathPython.Source
  }

  foreach ($candidatePath in ($candidatePaths | Where-Object { $_ } | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $candidatePath)) { continue }
    try {
      & $candidatePath -c 'import geopandas, pandas, shapely' *> $null
      if ($LASTEXITCODE -eq 0) {
        return (Resolve-Path -LiteralPath $candidatePath).Path
      }
    } catch {
      continue
    }
  }

  throw 'A Python environment with GeoPandas, pandas, and Shapely was not found. Install requirements-local.txt into one environment, set MAD_AGENT_PYTHON to that environment''s python.exe, and start the workbench again.'
}

function Get-AgentSourceVersion {
  $sourceRoots = @(
    (Join-Path $projectRoot 'scripts'),
    (Join-Path $projectRoot 'agent-skills'),
    (Join-Path $projectRoot 'src\data'),
    (Join-Path $projectRoot 'src\lib'),
    (Join-Path $projectRoot 'data')
  )
  $sourceFiles = $sourceRoots |
    Where-Object { Test-Path -LiteralPath $_ } |
    ForEach-Object { Get-ChildItem -LiteralPath $_ -Recurse -File } |
    Sort-Object FullName
  $manifest = $sourceFiles | ForEach-Object {
    $relativePath = $_.FullName.Substring($projectRoot.Length).TrimStart('\')
    "$relativePath|$($_.Length)|$($_.LastWriteTimeUtc.Ticks)"
  }
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($manifest -join "`n"))
    return ([BitConverter]::ToString($sha256.ComputeHash($bytes))).Replace('-', '').Substring(0, 16).ToLowerInvariant()
  } finally {
    $sha256.Dispose()
  }
}

function Get-AgentBridgeHealth {
  try {
    return Invoke-RestMethod -Uri "http://127.0.0.1:$agentPort/api/health" -TimeoutSec 3
  } catch {
    return $null
  }
}

function Reset-LmStudioModel {
  param(
    [Parameter(Mandatory = $true)][string]$LmsPath,
    [Parameter(Mandatory = $true)][string]$Model
  )

  $loadedJson = (& $LmsPath ps --json | Out-String)
  if ($LASTEXITCODE -ne 0) {
    throw 'LM Studio could not report its loaded models.'
  }
  try {
    $parsedLoadedModels = $loadedJson | ConvertFrom-Json
    $loadedModels = @($parsedLoadedModels)
  } catch {
    throw "LM Studio returned an unreadable loaded-model list: $($_.Exception.Message)"
  }

  $modelLeaf = ($Model -split '[/\\]')[-1]
  $matchingModels = @($loadedModels | Where-Object {
    $baseIdentifier = [string]$_.identifier -replace ':\d+$', ''
    $_.type -eq 'llm' -and (
      $_.modelKey -eq $Model -or
      $_.modelKey -eq $modelLeaf -or
      $_.identifier -eq $Model -or
      $baseIdentifier -eq $Model -or
      $baseIdentifier -eq $modelLeaf -or
      $_.indexedModelIdentifier -eq $Model
    )
  })
  foreach ($loadedModel in $matchingModels) {
    Write-Host "Unloading existing LM Studio instance $($loadedModel.identifier)..."
    & $LmsPath unload $loadedModel.identifier
    if ($LASTEXITCODE -ne 0) {
      throw "LM Studio could not unload $($loadedModel.identifier)."
    }
  }

  Write-Host "Loading one fresh LM Studio instance for $Model..."
  & $LmsPath load $Model --identifier $Model --yes
  if ($LASTEXITCODE -ne 0) {
    throw "LM Studio could not load model $Model."
  }
}

function Stop-StaleAgentBridge {
  $listeners = @(Get-NetTCPConnection -LocalPort $agentPort -State Listen -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
    $commandLine = [string]$process.CommandLine
    if ($process.Name -ne 'node.exe' -or $commandLine -notmatch 'scripts[\\/]agent-server\.mjs') {
      throw "Port $agentPort is occupied by another application (PID $($listener.OwningProcess)). Close it before starting the MAD QA Workbench."
    }
    Write-Host 'Refreshing the local MAD agent bridge...'
    Stop-Process -Id $listener.OwningProcess -Force
  }

  $deadline = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $deadline) {
    if (-not (Test-PortListener -Port $agentPort)) { return }
    Start-Sleep -Milliseconds 150
  }
  throw "The previous MAD agent bridge did not release port $agentPort."
}

try {
  $node = Get-Command node.exe -ErrorAction Stop
  $npm = Get-Command npm.cmd -ErrorAction Stop
  $lms = Get-Command lms.exe -ErrorAction Stop
  $python = Resolve-MadPython
  $env:MAD_AGENT_PYTHON = $python
  Write-Host "Using the MAD Python environment at $python"

  $nodeModules = Join-Path $projectRoot 'node_modules'
  $mapRendererPackage = Join-Path $nodeModules 'sharp'
  if (-not (Test-Path $nodeModules) -or -not (Test-Path $mapRendererPackage)) {
    Write-Host 'Installing app packages for the local workbench...'
    & $npm.Source install
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
  }

  if (-not (Test-LocalUrl -Url "http://127.0.0.1:$lmStudioPort/v1/models")) {
    Write-Host 'Starting the local LM Studio server...'
    Start-Process -FilePath $lms.Source -ArgumentList @('server', 'start', '--port', $lmStudioPort) -WindowStyle Hidden | Out-Null
    Wait-ForLocalUrl -Url "http://127.0.0.1:$lmStudioPort/v1/models" -ServiceName 'LM Studio'
  }

  $agentSourceVersion = Get-AgentSourceVersion
  $agentHealth = Get-AgentBridgeHealth
  $agentBridgeReusable = (Test-PortListener -Port $agentPort) -and
    $agentHealth -and
    $agentHealth.serviceId -eq 'mad-qa-agent-bridge' -and
    $agentHealth.sourceVersion -eq $agentSourceVersion -and
    $agentHealth.rockportFaults -eq $RockportFaults
  $availableModels = @(Get-LmStudioAvailableModels -LmsPath $lms.Source)
  $preferredModel = if ($agentBridgeReusable) { [string]$agentHealth.model } else { '' }
  $Model = Select-LmStudioModel `
    -AvailableModels $availableModels `
    -RequestedModel $Model `
    -PreferredModel $preferredModel

  $env:LM_STUDIO_MODEL = $Model
  $env:MAD_ROCKPORT_FAULTS = if ($RockportFaults -eq 'enabled') { '1' } else { '0' }
  $env:MAD_AGENT_SOURCE_VERSION = $agentSourceVersion
  $agentBridgeCurrent = $agentHealth -and
    $agentHealth.serviceId -eq 'mad-qa-agent-bridge' -and
    $agentHealth.sourceVersion -eq $agentSourceVersion -and
    $agentHealth.model -eq $Model -and
    $agentHealth.rockportFaults -eq $RockportFaults
  if ((Test-PortListener -Port $agentPort) -and -not $agentBridgeCurrent) {
    Stop-StaleAgentBridge
  }
  if (-not (Test-PortListener -Port $agentPort)) {
    Reset-LmStudioModel -LmsPath $lms.Source -Model $Model
    Write-Host 'Starting the local MAD agent bridge...'
    Start-Process -FilePath $node.Source -ArgumentList @('scripts/agent-server.mjs') -WorkingDirectory $projectRoot -WindowStyle Hidden | Out-Null
  } else {
    Write-Host "Using the model already owned by the running MAD agent bridge: $Model"
  }
  Wait-ForLocalUrl -Url "http://127.0.0.1:$agentPort/api/health" -ServiceName 'Local MAD agent bridge'

  if (-not (Test-PortListener -Port $appPort)) {
    Write-Host 'Starting the MAD QA Workbench...'
    Start-Process -FilePath $npm.Source -ArgumentList @('run', 'dev') -WorkingDirectory $projectRoot -WindowStyle Hidden | Out-Null
  }
  Wait-ForLocalUrl -Url "http://127.0.0.1:$appPort" -ServiceName 'MAD QA Workbench'

  if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$appPort" }
  Write-Host 'MAD QA Workbench is ready.'
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
