Set-StrictMode -Version Latest
$script:Branch='codex/u03-final-gates-20261020'
$script:Flag='U03_PREVIEW_WRITER_WINDOW'
function Test-U03WindowEnvSnapshot($Result,[string[]]$Names,[bool]$RequireSensitive) {
  if ($Result.ExitCode -ne 0) { return $false }
  try {
    $start = $Result.Output.IndexOf('{')
    if ($start -lt 0) { return $false }
    $snapshot = $Result.Output.Substring($start) | ConvertFrom-Json -ErrorAction Stop
    $envs = @($snapshot.envs)
    foreach ($name in $Names) {
      $matches = @($envs | Where-Object { $_.key -ceq $name })
      if ($RequireSensitive) {
        $targets = @($matches[0].target)
        $targetValue = if ($matches[0].target -is [string]) { [string]$matches[0].target } elseif ($targets.Count -eq 1) { [string]$targets[0] } else { '' }
        if ($matches.Count -ne 1 -or $matches[0].type -cne 'sensitive' -or
            $targets.Count -ne 1 -or $targetValue -cne 'preview' -or
            $matches[0].gitBranch -cne $script:Branch) { return $false }
      } elseif ($matches.Count -ne 0) { return $false }
    }
    return $true
  } catch { return $false }
}
function Get-U03WindowEnvRows($Result) {
  if ($null -eq $Result -or $Result.ExitCode -ne 0 -or [string]::IsNullOrEmpty($Result.Output)) { return $null }
  try {
    $start=$Result.Output.IndexOf('{'); if ($start -lt 0) { return $null }
    $parsed=$Result.Output.Substring($start) | ConvertFrom-Json -ErrorAction Stop
    if ($null -eq $parsed.PSObject.Properties['envs']) { return $null }
    if ($null -eq $parsed.envs) { return ,([object[]]@()) }
    return ,([object[]]@($parsed.envs))
  } catch { return $null }
}
function Invoke-U03WindowRotation([Parameter(Mandatory)]$Batch,[Parameter(Mandatory)][scriptblock]$Cli,[string[]]$Names) {
  if ($Batch.Branch -cne $script:Branch -or $Batch.SupabaseRef -cne 'rhnnplewqsekrnaousyl' -or
      $Batch.Sha -cnotmatch '^[0-9a-f]{40}$' -or $Batch.RunId -cnotmatch '^[0-9a-f-]{36}$' -or $Names -notcontains $script:Flag) { throw 'WINDOW_ROTATION_IDENTITY_REJECTED' }
  $rotationStarted = $false
  try {
    $before = & $Cli -Arguments @('env','ls','preview',$script:Branch,'--format=json') -InputText ''
    $rows = Get-U03WindowEnvRows $before
    if ($null -eq $rows) { throw 'WINDOW_ROTATION_SOURCE_UNCONFIRMED' }
    $present = @()
    foreach ($name in $Names) {
      $matches = @($rows | Where-Object { $_.key -ceq $name })
      if ($matches.Count -gt 1) { throw 'WINDOW_ROTATION_SCOPE_UNCONFIRMED' }
      if ($matches.Count -eq 1) {
        $targets=@($matches[0].target)
        $target=if ($matches[0].target -is [string]) { [string]$matches[0].target } elseif ($targets.Count -eq 1) { [string]$targets[0] } else { '' }
        if ($matches[0].type -cne 'sensitive' -or $target -cne 'preview' -or $matches[0].gitBranch -cne $script:Branch) { throw 'WINDOW_ROTATION_SCOPE_UNCONFIRMED' }
        $present += $name
      }
    }
    $rotationStarted = $true
    if ($present.Count -gt 0) {
      foreach ($name in $present) { try { $null = & $Cli -Arguments @('env','rm',$name,'preview',$script:Branch,'--yes') -InputText '' } catch { } }
      $afterRemove = & $Cli -Arguments @('env','ls','preview',$script:Branch,'--format=json') -InputText ''
      if (-not (Test-U03WindowEnvSnapshot $afterRemove $Names $false)) { throw 'WINDOW_ROTATION_REMOVE_VERIFY_FAILED' }
    }
    $ordered = @($Names | Where-Object { $_ -ne $script:Flag }) + @($script:Flag)
    foreach ($name in $ordered) {
      $value = $Batch.Values[$name]
      if ([string]::IsNullOrWhiteSpace([string]$value)) { throw 'WINDOW_ROTATION_VALUE_MISSING' }
      $result = & $Cli -Arguments @('env','add',$name,'preview',$script:Branch,'--yes','--sensitive') -InputText ([string]$value)
      $value = $null
      if ($result.ExitCode -ne 0) { throw 'WINDOW_ROTATION_ADD_FAILED' }
    }
    $after = & $Cli -Arguments @('env','ls','preview',$script:Branch,'--format=json') -InputText ''
    if (-not (Test-U03WindowEnvSnapshot $after $Names $true)) { throw 'WINDOW_ROTATION_VERIFY_FAILED' }
    return [pscustomobject]@{ Passed=$true; ArmedFlagPresent=$true; Code='NONE' }
  } catch {
    $cause = if ($_.Exception.Message -match '^WINDOW_ROTATION_[A-Z_]+$') { $_.Exception.Message } else { 'WINDOW_ROTATION_FAILED' }
    if ($rotationStarted) {
      foreach ($name in $Names) { try { $null = & $Cli -Arguments @('env','rm',$name,'preview',$script:Branch,'--yes') -InputText '' } catch { } }
    }
    $afterFailure = $null
    try { $afterFailure = & $Cli -Arguments @('env','ls','preview',$script:Branch,'--format=json') } catch { }
    $allAbsent = $null -ne $afterFailure -and (Test-U03WindowEnvSnapshot $afterFailure $Names $false)
    return [pscustomobject]@{ Passed=$false; ArmedFlagPresent=(-not $allAbsent); Code=if ($allAbsent) { 'ROTATION_FAILED_ARMED_FLAG_ABSENT' } else { 'ROTATION_FAILED_ARMED_STATE_UNVERIFIED' }; Cause=$cause }
  }
}
Export-ModuleMember -Function Invoke-U03WindowRotation
