[CmdletBinding()]
param(
  [string]$Model = 'qwen3-4b-thinking-2507',
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$agentPort = 8787
$appPort = 4173
$lmStudioPort = 1234

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

try {
  $node = Get-Command node.exe -ErrorAction Stop
  $npm = Get-Command npm.cmd -ErrorAction Stop
  $lms = Get-Command lms.exe -ErrorAction Stop

  if (-not (Test-LocalUrl -Url "http://127.0.0.1:$lmStudioPort/v1/models")) {
    Write-Host 'Starting the local LM Studio server...'
    Start-Process -FilePath $lms.Source -ArgumentList @('server', 'start', '--port', $lmStudioPort) -WindowStyle Hidden | Out-Null
    Wait-ForLocalUrl -Url "http://127.0.0.1:$lmStudioPort/v1/models" -ServiceName 'LM Studio'
  }

  $modelStatus = (& $lms.Source ls | Out-String)
  if ($modelStatus -notmatch "(?m)^\s*$([regex]::Escape($Model)).*LOADED") {
    Write-Host "Loading LM Studio model $Model..."
    & $lms.Source load $Model | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "LM Studio could not load model $Model." }
  }

  $env:LM_STUDIO_MODEL = $Model
  if (-not (Test-PortListener -Port $agentPort)) {
    Write-Host 'Starting the local MAD agent bridge...'
    Start-Process -FilePath $node.Source -ArgumentList @('scripts/agent-server.mjs') -WorkingDirectory $projectRoot -WindowStyle Hidden | Out-Null
  }
  Wait-ForLocalUrl -Url "http://127.0.0.1:$agentPort/api/health" -ServiceName 'Local MAD agent bridge'

  if (-not (Test-Path (Join-Path $projectRoot 'node_modules'))) {
    Write-Host 'Installing app packages for the first run...'
    & $npm.Source install
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
  }

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
