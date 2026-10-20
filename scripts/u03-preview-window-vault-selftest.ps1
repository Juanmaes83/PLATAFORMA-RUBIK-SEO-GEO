param([Parameter(Mandatory)][ValidateSet('write','read','corrupt','identity','remove','rotation')][string]$Mode,
  [Parameter(Mandatory)][string]$ProfileRoot)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'u03-preview-window-vault.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'u03-preview-window-rotation.psm1') -Force
$path = Get-U03WindowVaultPath $ProfileRoot
switch ($Mode) {
  'write' {
    $batch = New-U03WindowBatch -Sha ('a' * 40) -RunId 'd9c4f0a2-2db8-4c85-a42b-4af3e12e87a2'
    Save-U03WindowBatch -Batch $batch -ProfileRoot $ProfileRoot | Out-Null
    $batch.Values = $null
    $batch = $null
    'VAULT_WRITE_PASS'
  }
  'read' {
    $batch = Get-U03WindowBatch $ProfileRoot
    if ($batch.Sha -cne ('a' * 40) -or $batch.Values.U03_PREVIEW_WRITER_WINDOW_RUN_ID -cne $batch.RunId) { throw 'SELFTEST_BATCH_MISMATCH' }
    if ($batch.Values.U03_PREVIEW_WRITER_WINDOW_SECRET -cnotmatch '^[A-Za-z0-9_-]{64}$') { throw 'SELFTEST_FORMAT_MISMATCH' }
    $batch.Values = $null; $batch = $null
    'VAULT_READ_PASS'
  }
  'corrupt' {
    try { $null = Get-U03WindowBatch $ProfileRoot; throw 'SELFTEST_CORRUPTION_ACCEPTED' }
    catch { if ($_.Exception.Message -notmatch 'VAULT_(?:CORRUPT|UNPROTECT_FAILED)') { throw 'SELFTEST_CORRUPTION_CLASSIFICATION_FAILED' } }
    'VAULT_CORRUPT_REJECTED'
  }
  'identity' {
    $record = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    $original = $record.supabaseRef
    $record.supabaseRef = 'wrong-ref'
    [IO.File]::WriteAllText($path,(ConvertTo-Json $record -Compress),[Text.UTF8Encoding]::new($false))
    try { $null = Get-U03WindowBatch $ProfileRoot; throw 'SELFTEST_IDENTITY_ACCEPTED' }
    catch { if ($_.Exception.Message -notmatch 'IDENTITY_MISMATCH') { throw 'SELFTEST_IDENTITY_CLASSIFICATION_FAILED' } }
    $record.supabaseRef = $original
    [IO.File]::WriteAllText($path,(ConvertTo-Json $record -Compress),[Text.UTF8Encoding]::new($false))
    'VAULT_IDENTITY_REJECTED'
  }
  'remove' { Remove-U03WindowBatch $ProfileRoot | Out-Null; 'VAULT_REMOVE_PASS' }
  'rotation' {
    $names = Get-U03WindowVariableNames
    $batch = New-U03WindowBatch -Sha ('a' * 40) -RunId 'd9c4f0a2-2db8-4c85-a42b-4af3e12e87a2'
    $successState = [pscustomobject]@{ Store=@{}; Adds=New-Object 'System.Collections.Generic.List[string]'; Count=0; FailAt=0 }
    foreach ($name in $names) { $successState.Store[$name] = $true }
    $successCli = { param($Arguments,$InputText)
      if ($Arguments[1] -eq 'ls') { $envs=@($successState.Store.Keys | ForEach-Object { [pscustomobject]@{key=$_;type='sensitive';target=@('preview');gitBranch='codex/u03-final-gates-20261020'} }); return [pscustomobject]@{ ExitCode=0; Output=(ConvertTo-Json -InputObject @{envs=$envs} -Compress) } }
      if ($Arguments[1] -eq 'rm') { $successState.Store.Remove($Arguments[2]) | Out-Null; return [pscustomobject]@{ ExitCode=0; Output='' } }
      if ($Arguments[1] -eq 'add') { $successState.Count++; $successState.Adds.Add($Arguments[2]) | Out-Null; $successState.Store[$Arguments[2]]=$true; return [pscustomobject]@{ ExitCode=0; Output='' } }
      throw 'SELFTEST_UNEXPECTED_CLI'
    }.GetNewClosure()
    $success = Invoke-U03WindowRotation -Batch $batch -Cli $successCli -Names $names
    if (-not $success.Passed -or $successState.Adds[-1] -cne 'U03_PREVIEW_WRITER_WINDOW') { throw ('SELFTEST_ROTATION_ORDER_FAILED:' + $success.Code + ':' + $success.Cause + ':' + $successState.Adds.Count + ':' + $successState.Adds[-1]) }
    $scopeState = [pscustomobject]@{ Store=@{}; Adds=0; Removes=0 }
    foreach ($name in $names) { $scopeState.Store[$name] = $true }
    $badScopeCli = { param($Arguments,$InputText)
      if ($Arguments[1] -eq 'ls') { $envs=@($scopeState.Store.Keys | ForEach-Object { [pscustomobject]@{key=$_;type=if ($_ -eq 'PROVENANCE_SIGNING_KEYS') {'plain'} else {'sensitive'};target=@('preview');gitBranch='codex/u03-final-gates-20261020'} }); return [pscustomobject]@{ ExitCode=0; Output=(ConvertTo-Json -InputObject @{envs=$envs} -Compress) } }
      if ($Arguments[1] -eq 'rm') { $scopeState.Removes++; return [pscustomobject]@{ExitCode=0;Output=''} }
      if ($Arguments[1] -eq 'add') { $scopeState.Adds++; return [pscustomobject]@{ExitCode=0;Output=''} }
      throw 'SELFTEST_UNEXPECTED_CLI'
    }.GetNewClosure()
    $badScope = Invoke-U03WindowRotation -Batch $batch -Cli $badScopeCli -Names $names
    if ($badScope.Passed -or $scopeState.Adds -ne 0 -or $scopeState.Removes -ne 0) { throw 'SELFTEST_ROTATION_SENSITIVE_SCOPE_NOT_ENFORCED' }
    $failedState = [pscustomobject]@{ Store=@{}; Adds=New-Object 'System.Collections.Generic.List[string]'; Count=0; FailAt=4 }
    foreach ($name in $names) { $failedState.Store[$name] = $true }
    $failedCli = { param($Arguments,$InputText)
      if ($Arguments[1] -eq 'ls') { $envs=@($failedState.Store.Keys | ForEach-Object { [pscustomobject]@{key=$_;type='sensitive';target=@('preview');gitBranch='codex/u03-final-gates-20261020'} }); return [pscustomobject]@{ ExitCode=0; Output=(ConvertTo-Json -InputObject @{envs=$envs} -Compress) } }
      if ($Arguments[1] -eq 'rm') { $failedState.Store.Remove($Arguments[2]) | Out-Null; return [pscustomobject]@{ ExitCode=0; Output='' } }
      if ($Arguments[1] -eq 'add') { $failedState.Count++; $failedState.Adds.Add($Arguments[2]) | Out-Null; if ($failedState.Count -eq $failedState.FailAt) { return [pscustomobject]@{ ExitCode=1; Output='' } }; $failedState.Store[$Arguments[2]]=$true; return [pscustomobject]@{ ExitCode=0; Output='' } }
      throw 'SELFTEST_UNEXPECTED_CLI'
    }.GetNewClosure()
    $failed = Invoke-U03WindowRotation -Batch $batch -Cli $failedCli -Names $names
    if ($failed.Passed -or $failed.ArmedFlagPresent -or $failedState.Store.Count -ne 0) { throw 'SELFTEST_ROTATION_ROLLBACK_FAILED' }
    $failedState.Count=0; $failedState.FailAt=0
    $retry = Invoke-U03WindowRotation -Batch $batch -Cli $failedCli -Names $names
    if (-not $retry.Passed -or $failedState.Adds[-1] -cne 'U03_PREVIEW_WRITER_WINDOW') { throw 'SELFTEST_ROTATION_RETRY_AFTER_CLEAN_ROLLBACK_FAILED' }
    $batch.Values=$null; $batch=$null
    'WINDOW_ROTATION_SUCCESS_PARTIAL_ROLLBACK_AND_RETRY_PASS'
  }
}
