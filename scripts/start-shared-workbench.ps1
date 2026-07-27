[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$PythonPath,
  [string]$Model,
  [ValidateSet('enabled', 'disabled')]
  [string]$RockportFaults = 'enabled',
  [switch]$SkipInstall,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$agentPort = 8787
$lmStudioPort = 1234
. (Join-Path $PSScriptRoot 'lm-studio-model-selection.ps1')

function Test-LocalUrl {
  param([Parameter(Mandatory = $true)][string]$Url)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
  } catch {
    return $false
  }
}

function Wait-ForLocalUrl {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$ServiceName,
    [int]$TimeoutSeconds = 60
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-LocalUrl -Url $Url) { return }
    Start-Sleep -Milliseconds 350
  }
  throw "$ServiceName did not become ready at $Url within $TimeoutSeconds seconds."
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

try {
  $resolvedPython = (Resolve-Path -LiteralPath $PythonPath -ErrorAction Stop).Path
  & $resolvedPython -c 'import geopandas, pandas, shapely, pyproj, pyogrio'
  if ($LASTEXITCODE -ne 0) {
    throw 'The selected Python interpreter does not contain the minimal geospatial packages.'
  }

  $node = Get-Command node.exe -ErrorAction Stop
  $npm = Get-Command npm.cmd -ErrorAction Stop
  $lms = Get-Command lms.exe -ErrorAction Stop
  Set-Location -LiteralPath $projectRoot

  if (-not $SkipInstall) {
    & $npm.Source install
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
  }
  if (-not $SkipBuild) {
    & $npm.Source run build
    if ($LASTEXITCODE -ne 0) { throw 'npm run build failed.' }
  }

  if (-not (Test-LocalUrl -Url "http://127.0.0.1:$lmStudioPort/v1/models")) {
    Start-Process -FilePath $lms.Source `
      -ArgumentList @('server', 'start', '--port', $lmStudioPort) `
      -WindowStyle Hidden | Out-Null
    Wait-ForLocalUrl `
      -Url "http://127.0.0.1:$lmStudioPort/v1/models" `
      -ServiceName 'LM Studio'
  }

  if (Get-NetTCPConnection -LocalPort $agentPort -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $agentPort already has a listener. Keep exactly one shared bridge; inspect the existing process before starting another."
  }

  $availableModels = @(Get-LmStudioAvailableModels -LmsPath $lms.Source)
  $Model = Select-LmStudioModel -AvailableModels $availableModels -RequestedModel $Model
  Reset-LmStudioModel -LmsPath $lms.Source -Model $Model

  $env:MAD_AGENT_PYTHON = $resolvedPython
  $env:LM_STUDIO_MODEL = $Model
  $env:MAD_ROCKPORT_FAULTS = if ($RockportFaults -eq 'enabled') { '1' } else { '0' }
  Write-Host "Shared MAD QA Workbench starting at http://127.0.0.1:$agentPort"
  Write-Host "Python: $resolvedPython"
  Write-Host 'Keep this process running; all Windows sessions on this AWS WorkSpace use it.'
  & $node.Source 'scripts/agent-server.mjs'
  exit $LASTEXITCODE
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
