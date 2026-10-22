Set-StrictMode -Version Latest
$script:WindowBranch = 'codex/u03-final-gates-20261020'
$script:WindowNames = @('U03_PREVIEW_WRITER_WINDOW','U03_PREVIEW_WRITER_WINDOW_REF','U03_PREVIEW_WRITER_WINDOW_SHA',
  'U03_PREVIEW_WRITER_WINDOW_RUN_ID','U03_PREVIEW_WRITER_WINDOW_SECRET','RUBIK_AUDIT_DATABASE_URL',
  'PROVENANCE_SIGNING_KEYS','PROVENANCE_ACTIVE_KEY_ID')

function Get-U03WindowEnvironmentSnapshot($Result) {
  if ($null -eq $Result -or $Result.ExitCode -ne 0 -or [string]::IsNullOrEmpty($Result.Output)) { return $null }
  try {
    $start = $Result.Output.IndexOf('{')
    if ($start -lt 0) { return $null }
    $parsed = $Result.Output.Substring($start) | ConvertFrom-Json -ErrorAction Stop
    $envProperty = $parsed.PSObject.Properties['envs']
    if ($null -eq $envProperty) { return $null }
    if ($null -eq $envProperty.Value) { return ,([object[]]@()) }
    return ,([object[]]@($envProperty.Value))
  } catch { return $null }
}

function Remove-U03WindowDeploymentConfigurationSafe([string]$DeploymentId,[scriptblock]$Cli,[string[]]$Names = $script:WindowNames,
  [scriptblock]$RemoveDeployment) {
  if ($DeploymentId -cnotmatch '^dpl_[A-Za-z0-9]+$' -or $null -eq $Cli -or $null -eq $RemoveDeployment -or
      $Names.Count -ne $script:WindowNames.Count -or @($script:WindowNames | Where-Object { $_ -notin $Names }).Count -gt 0) {
    return [pscustomobject]@{ Passed=$false; Code='WINDOW_TEARDOWN_INPUT_REJECTED' }
  }
  $beforeResult = $null
  try { $beforeResult = & $Cli -Arguments @('env','ls','preview',$script:WindowBranch,'--format=json') -InputText '' } catch { }
  $before = Get-U03WindowEnvironmentSnapshot $beforeResult
  if ($null -eq $before) { return [pscustomobject]@{ Passed=$false; Code='WINDOW_TEARDOWN_LIST_FAILED' } }
  foreach ($name in $Names) {
    $matches = @($before | Where-Object { $_.key -ceq $name })
    if ($matches.Count -gt 1) { return [pscustomobject]@{ Passed=$false; Code='WINDOW_TEARDOWN_DUPLICATE_NAME' } }
    if ($matches.Count -eq 1) {
      $targets = @($matches[0].target)
      $target = if ($matches[0].target -is [string]) { [string]$matches[0].target } elseif ($targets.Count -eq 1) { [string]$targets[0] } else { '' }
      if ($matches[0].type -cne 'sensitive' -or $target -cne 'preview' -or $matches[0].gitBranch -cne $script:WindowBranch) {
        return [pscustomobject]@{ Passed=$false; Code='WINDOW_TEARDOWN_SCOPE_MISMATCH' }
      }
      # CLI stderr/banner and a non-zero race result are deliberately ignored;
      # only a fresh metadata listing can prove that the name is absent.
      try { $null = & $Cli -Arguments @('env','rm',$name,'preview',$script:WindowBranch,'--yes') -InputText '' } catch { }
    }
  }
  $afterResult = $null
  try { $afterResult = & $Cli -Arguments @('env','ls','preview',$script:WindowBranch,'--format=json') -InputText '' } catch { }
  $after = Get-U03WindowEnvironmentSnapshot $afterResult
  if ($null -eq $after) { return [pscustomobject]@{ Passed=$false; Code='WINDOW_TEARDOWN_VERIFY_FAILED' } }
  if (@($after | Where-Object { $_.key -cin $Names }).Count -gt 0) {
    return [pscustomobject]@{ Passed=$false; Code='WINDOW_TEARDOWN_NAMES_REMAIN' }
  }
  $removed = $null
  try { $removed = & $RemoveDeployment -Id $DeploymentId } catch { }
  if ($null -eq $removed -or $removed.ExitCode -ne 0) { return [pscustomobject]@{ Passed=$false; Code='WINDOW_TEARDOWN_DEPLOYMENT_REMOVE_FAILED' } }
  return [pscustomobject]@{ Passed=$true; Code='NONE' }
}
Export-ModuleMember -Function Remove-U03WindowDeploymentConfigurationSafe
