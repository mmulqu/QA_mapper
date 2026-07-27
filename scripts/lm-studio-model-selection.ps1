function Get-LmStudioAvailableModels {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][string]$LmsPath)

  $availableJson = (& $LmsPath ls --llm --json | Out-String)
  if ($LASTEXITCODE -ne 0) {
    throw 'LM Studio could not report its installed LLM models.'
  }
  try {
    $parsedModels = $availableJson | ConvertFrom-Json
    $availableModels = @($parsedModels)
  } catch {
    throw "LM Studio returned an unreadable installed-model list: $($_.Exception.Message)"
  }

  return @(
    $availableModels |
      Where-Object { $_.type -eq 'llm' -and $_.modelKey } |
      Group-Object modelKey |
      ForEach-Object { $_.Group | Select-Object -First 1 } |
      Sort-Object @{ Expression = { [string]$_.displayName } }, @{ Expression = { [string]$_.modelKey } }
  )
}

function Format-LmStudioModelChoice {
  param([Parameter(Mandatory = $true)]$Model)

  $details = @(
    [string]$Model.paramsString
    [string]$Model.quantization.name
    if ($Model.trainedForToolUse -eq $true) { 'tools' }
    if ($Model.vision -eq $true) { 'vision' }
  ) | Where-Object { $_ }
  $name = if ($Model.displayName) { [string]$Model.displayName } else { [string]$Model.modelKey }
  $suffix = if ($details.Count) { " [$($details -join ', ')]" } else { '' }
  return "$name$suffix - $($Model.modelKey)"
}

function Select-LmStudioModel {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][object[]]$AvailableModels,
    [string]$RequestedModel,
    [string]$PreferredModel,
    [scriptblock]$ReadSelection = { param($Prompt) Read-Host $Prompt }
  )

  $models = @($AvailableModels)
  if (-not $models.Count) {
    throw 'No LLM models were found in LM Studio. Download at least one model and start the workbench again.'
  }

  if (-not [string]::IsNullOrWhiteSpace($RequestedModel)) {
    $requested = $RequestedModel.Trim()
    $selected = $models | Where-Object {
      $_.modelKey -eq $requested -or
      $_.indexedModelIdentifier -eq $requested -or
      $_.path -eq $requested
    } | Select-Object -First 1
    if (-not $selected) {
      $availableKeys = ($models | ForEach-Object { $_.modelKey }) -join ', '
      throw "LM Studio model '$requested' was not found. Available model keys: $availableKeys"
    }
    Write-Host "Using requested LM Studio model: $(Format-LmStudioModelChoice -Model $selected)"
    return [string]$selected.modelKey
  }

  if ($models.Count -eq 1) {
    Write-Host "One LM Studio model found; selecting it automatically:"
    Write-Host "  $(Format-LmStudioModelChoice -Model $models[0])"
    return [string]$models[0].modelKey
  }

  Write-Host ''
  Write-Host 'Available LM Studio models:'
  $preferredIndex = -1
  for ($index = 0; $index -lt $models.Count; $index += 1) {
    $isPreferred = (
      -not [string]::IsNullOrWhiteSpace($PreferredModel) -and
      $models[$index].modelKey -eq $PreferredModel
    )
    if ($isPreferred) { $preferredIndex = $index }
    $suffix = if ($isPreferred) { ' (currently running)' } else { '' }
    Write-Host "  [$($index + 1)] $(Format-LmStudioModelChoice -Model $models[$index])$suffix"
  }
  Write-Host ''
  while ($true) {
    $prompt = if ($preferredIndex -ge 0) {
      "Choose a model [1-$($models.Count)] or press Enter to keep $($models[$preferredIndex].modelKey)"
    } else {
      "Choose a model [1-$($models.Count)]"
    }
    $answer = & $ReadSelection $prompt
    if ([string]::IsNullOrWhiteSpace([string]$answer) -and $preferredIndex -ge 0) {
      $selected = $models[$preferredIndex]
      Write-Host "Keeping the running LM Studio model: $(Format-LmStudioModelChoice -Model $selected)"
      return [string]$selected.modelKey
    }
    $selection = 0
    if (
      [int]::TryParse([string]$answer, [ref]$selection) -and
      $selection -ge 1 -and
      $selection -le $models.Count
    ) {
      $selected = $models[$selection - 1]
      Write-Host "Selected LM Studio model: $(Format-LmStudioModelChoice -Model $selected)"
      return [string]$selected.modelKey
    }
    Write-Host "Enter a number from 1 through $($models.Count)."
  }
}
