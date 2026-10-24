Set-StrictMode -Version Latest

$script:BatchNames = @('U03_PREVIEW_WRITER_WINDOW','U03_PREVIEW_WRITER_WINDOW_REF',
  'U03_PREVIEW_WRITER_WINDOW_SHA','U03_PREVIEW_WRITER_WINDOW_RUN_ID',
  'U03_PREVIEW_WRITER_WINDOW_SECRET','RUBIK_AUDIT_DATABASE_URL',
  'PROVENANCE_SIGNING_KEYS','PROVENANCE_ACTIVE_KEY_ID')

function Compare-H1ABatchValues([System.Collections.IDictionary]$Expected, [scriptblock]$ReadValue,
    [string]$Stage = 'PROCESS_ENV') {
  if ($null -eq $Expected -or $null -eq $ReadValue -or $Stage -notin @('PROCESS_ENV','HYDRATED_ENV','CHILD_ENV')) {
    throw 'H1A_BATCH_COMPARISON_INPUT_REJECTED'
  }
  foreach ($name in $script:BatchNames) {
    if (-not $Expected.Contains($name) -or [string]::IsNullOrEmpty([string]$Expected[$name])) {
      throw 'H1A_BATCH_EXPECTATION_INCOMPLETE'
    }
    $observed = & $ReadValue $name
    $category = if ($null -eq $observed) { 'ABSENT' }
      elseif ([string]$observed -ceq '') { 'EMPTY' }
      elseif ([string]::Equals([string]$observed,[string]$Expected[$name],[StringComparison]::Ordinal)) { 'PRESENT_MATCH' }
      else { 'PRESENT_MISMATCH' }
    [pscustomobject]@{ Stage=$Stage; Name=$name; Category=$category }
  }
}

function Compare-H1ABatchMetadata([object[]]$Rows) {
  if ($null -eq $Rows) { throw 'H1A_BATCH_METADATA_UNAVAILABLE' }
  foreach ($name in $script:BatchNames) {
    $matches = @($Rows | Where-Object { $_.key -ceq $name })
    $category = if ($matches.Count -eq 0) { 'ABSENT' }
      elseif ($matches.Count -ne 1) { 'PRESENT_MISMATCH' }
      else {
        $row = $matches[0]
        $targets = @($row.target)
        if ($row.type -ceq 'sensitive' -and $row.gitBranch -ceq 'codex/h1a-integral-20261022' -and
            $targets.Count -eq 1 -and $targets[0] -ceq 'preview') { 'PRESENT_MATCH' }
        else { 'PRESENT_MISMATCH' }
      }
    [pscustomobject]@{ Stage='VERCEL_METADATA'; Name=$name; Category=$category }
  }
}

function Test-H1ABatchDelivery([object[]]$Rows) {
  return $Rows.Count -eq $script:BatchNames.Count -and
    @($Rows | Where-Object { $_.Category -notin @('ABSENT','EMPTY','PRESENT_MATCH') }).Count -eq 0
}

Export-ModuleMember -Function Compare-H1ABatchValues,Compare-H1ABatchMetadata,Test-H1ABatchDelivery
