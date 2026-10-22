param(
  [switch]$ReadOnlyPreflightOnly,
  [switch]$V4ConnectionDiagnosticOnly,
  [switch]$WindowRolePreflightOnly,
  [switch]$WindowRoleReadOnlyDiagnosticOnly,
  [switch]$WindowRecoveryOnly,
  [switch]$H1ARecoveryOnly,
  [switch]$H1ARecoveryTransportOnly,
  [switch]$WindowI2I5H1A,
  [switch]$WindowH1A,
  [switch]$WindowBatchAttestationOnly,
  [switch]$ProvisionWindowSecrets,
  [switch]$WindowTransportSelfTestOnly,
  [switch]$WindowRoleTransportSelfTestOnly,
  [switch]$PlaywrightOnly,
  [switch]$RolesInvitationsOnly,
  [switch]$CrossSurfaceOnly,
  [switch]$SessionProvidersOnly,
  [switch]$ProviderEgressOnly,
  [string]$DeploymentId,
  [string]$DeploymentHost,
  [string]$DeploymentSha,
  [string]$RunId,
  [switch]$MembershipRevocationOnly,
  [switch]$ProvisionPreviewKeys,
  [switch]$CheckPreviewKeys,
  [switch]$ReplacePreviewKeys,
  [switch]$DeletePreviewKeys
)

$ErrorActionPreference = 'Stop'
$repo = (Get-Location).Path
$runner = Join-Path $repo 'scripts\u03-preview-b4-orchestrator.mjs'
$v4Operator = Join-Path $repo 'scripts\u03-preview-v4-operator.mjs'
$windowRoleOperator = Join-Path $repo 'scripts\u03-window-role-preflight.mjs'
$windowSequenceOperator = Join-Path $repo 'scripts\u03-preview-window-run.mjs'
$h1aRecoveryOperator = Join-Path $repo 'scripts\u03-preview-h1a-recovery.mjs'
$v4PoolerModule = Join-Path $PSScriptRoot 'u03-preview-v4-pooler.psm1'
$linkFile = Join-Path $repo '.vercel\project.json'
$clipboardModule = Join-Path $PSScriptRoot 'u03-preview-b4-clipboard.psm1'
$windowVaultModule = Join-Path $PSScriptRoot 'u03-preview-window-vault.psm1'
$windowRotationModule = Join-Path $PSScriptRoot 'u03-preview-window-rotation.psm1'
Import-Module -Name $clipboardModule -Force -ErrorAction Stop
Import-Module -Name $v4PoolerModule -Force -ErrorAction Stop
Import-Module -Name $windowVaultModule -Force -ErrorAction Stop
Import-Module -Name $windowRotationModule -Force -ErrorAction Stop
$windowConfigurationModule = Join-Path $PSScriptRoot 'u03-preview-window-configuration.psm1'
Import-Module -Name $windowConfigurationModule -Force -ErrorAction Stop
$h1aBatchCompareModule = Join-Path $PSScriptRoot 'u03-preview-h1a-batch-compare.psm1'
Import-Module -Name $h1aBatchCompareModule -Force -ErrorAction Stop

function Stop-B4([string]$Code) { throw "U03 B-4 BLOCKED: $Code. No fixtures will be created unless every preflight passes." }

function Write-U03WindowGlobalResult([string]$RunId, [string]$Status, [string]$CaseId = 'u03-global-result') {
  if ($RunId -cnotmatch '^[0-9a-fA-F-]{36}$' -or $Status -notin @('PASS','BLOCKED')) { return $false }
  $path = Join-Path $repo "test-results\u03-hosted-window\$RunId.jsonl"
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $false }
  try {
    if ($CaseId -notin @('u03-global-result','h1a-global-result')) { return $false }
    $row = @{ utc=[DateTime]::UtcNow.ToString('o'); runId=$RunId; caseId=$CaseId; status=$Status;
      ref='rhnnplewqsekrnaousyl' } | ConvertTo-Json -Compress
    [System.IO.File]::AppendAllText($path, $row + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
    return $true
  } catch { return $false }
}

function Write-H1ARecoveryEvent([string]$CaseId, [string]$Status, [string]$Code = '') {
  if ($CaseId -notin @('recovery-configuration-teardown','recovery-vault-teardown') -or
      $Status -notin @('ATTEMPTED','PASS','BLOCKED') -or
      ($Code -and $Code -notin @('RECOVERY_TEARDOWN_UNVERIFIED','RECOVERY_VAULT_UNVERIFIED'))) { return $false }
  $run = 'f7ee4d0a-edb4-4276-88fc-03bbab570a19'
  $path = Join-Path $repo "test-results\u03-hosted-recovery\$run-recovery.jsonl"
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $false }
  try {
    $row = @{ utc=[DateTime]::UtcNow.ToString('o'); runId=$run; ref='rhnnplewqsekrnaousyl';
      caseId=$CaseId; status=$Status; code=$Code } | ConvertTo-Json -Compress
    [System.IO.File]::AppendAllText($path,$row + [Environment]::NewLine,[Text.UTF8Encoding]::new($false))
    return $true
  } catch { return $false }
}

function Remove-U03WindowDeploymentConfiguration([string]$DeploymentId) {
  if ($DeploymentId -cnotmatch '^dpl_[A-Za-z0-9]+$') { return $false }
  $names = @('U03_PREVIEW_WRITER_WINDOW','U03_PREVIEW_WRITER_WINDOW_REF','U03_PREVIEW_WRITER_WINDOW_SHA',
    'U03_PREVIEW_WRITER_WINDOW_RUN_ID','U03_PREVIEW_WRITER_WINDOW_SECRET','RUBIK_AUDIT_DATABASE_URL',
    'PROVENANCE_SIGNING_KEYS','PROVENANCE_ACTIVE_KEY_ID')
  $cli = { param($Arguments,$InputText) Invoke-U03WindowVercelCli -Arguments $Arguments -InputText $InputText }
  $removeDeployment = { param($Id) Invoke-U03WindowVercelCli -Arguments @('remove',$Id,'--yes') -InputText '' }
  $result = Remove-U03WindowDeploymentConfigurationSafe -DeploymentId $DeploymentId -Cli $cli -RemoveDeployment $removeDeployment -Names $names
  return [bool]$result.Passed
}

function Invoke-U03WindowRoleChild([string]$Mode, [string]$RunId, [string]$PasswordText, [string]$ChildPath = $windowRoleOperator,
  [System.Collections.IDictionary]$PreviewKeys = $null, [string]$CampaignMode = 'window-i2-i5',
  [string]$FunctionalShaOverride = '') {
  $process = $null
  $payload = $null
  $payloadBytes = $null
  try {
    if ($Mode -notin @('run','contain','diagnose','recover','h1a-recover','sequence','attest','local','keys') -or $RunId -cnotmatch '^[0-9a-fA-F-]{36}$' -or
        (($Mode -notin @('attest','local','keys')) -and [string]::IsNullOrWhiteSpace($PasswordText)) -or
        ($Mode -in @('sequence','h1a-recover') -and ($null -eq $PreviewKeys -or [string]::IsNullOrWhiteSpace([string]$PreviewKeys.AdminKey) -or [string]::IsNullOrWhiteSpace([string]$PreviewKeys.PublicKey))) -or
        -not (Test-Path -LiteralPath $ChildPath -PathType Leaf) -or
        ($FunctionalShaOverride -and ($Mode -ne 'attest' -or $RunId -cne 'f7ee4d0a-edb4-4276-88fc-03bbab570a19' -or
          $FunctionalShaOverride -cne '0c06a300f3870af9cca5e5468a9401ccf7488b41'))) {
      return [pscustomobject]@{ Passed = $false; SafeLine = $null; Code = 'SAFE_CHILD_PREPARATION_FAILED' }
    }
    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    $psi = [Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $nodePath
    $psi.Arguments = '--conditions=react-server "' + $ChildPath + '"' + $(if ($Mode -eq 'attest') { ' --attest-window-batch-only' } elseif ($Mode -eq 'local') { ' --local-preflight-only' } elseif ($Mode -eq 'keys') { ' --preview-key-preflight-only' } else { '' })
    $psi.WorkingDirectory = $repo
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.EnvironmentVariables.Clear()
    foreach ($name in @('PATH','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','ProgramFiles')) {
      $value = [Environment]::GetEnvironmentVariable($name)
      if (-not [string]::IsNullOrEmpty($value)) { $psi.EnvironmentVariables[$name] = $value }
    }
    if ($Mode -in @('sequence','h1a-recover','attest','local')) {
      foreach ($name in @('VERCEL_OIDC_TOKEN','U03_VERCEL_CLI','U03_SUPABASE_CLI','U03_PIN_DEPLOYMENT_ID',
          'U03_PIN_DEPLOYMENT_HOST','U03_PIN_DEPLOYMENT_SHA','U03_PIN_DEPLOYMENT_BRANCH','U03_FUNCTIONAL_SHA',
          'U03_PREVIEW_WRITER_WINDOW','U03_PREVIEW_WRITER_WINDOW_REF',
          'U03_PREVIEW_WRITER_WINDOW_SHA','U03_PREVIEW_WRITER_WINDOW_RUN_ID','U03_PREVIEW_WRITER_WINDOW_SECRET',
          'RUBIK_AUDIT_DATABASE_URL','PROVENANCE_SIGNING_KEYS','PROVENANCE_ACTIVE_KEY_ID','NODE_USE_ENV_PROXY',
          'NODE_USE_SYSTEM_CA','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR','HTTP_PROXY','HTTPS_PROXY',
          'ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy')) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if (-not [string]::IsNullOrEmpty($value)) { $psi.EnvironmentVariables[$name] = $value }
      }
    } elseif (($Mode -eq 'contain') -and -not [string]::IsNullOrEmpty($env:RUBIK_AUDIT_DATABASE_URL)) {
      $psi.EnvironmentVariables['RUBIK_AUDIT_DATABASE_URL'] = $env:RUBIK_AUDIT_DATABASE_URL
    }
    if ($Mode -in @('keys','sequence','h1a-recover') -and $null -ne $PreviewKeys) {
      $psi.EnvironmentVariables['U03_PREVIEW_ADMIN_KEY'] = [string]$PreviewKeys.AdminKey
      $psi.EnvironmentVariables['U03_PREVIEW_PUBLIC_KEY'] = [string]$PreviewKeys.PublicKey
    }
    $psi.EnvironmentVariables['U03_FUNCTIONAL_SHA'] = if ($FunctionalShaOverride) { $FunctionalShaOverride }
      else { (& git -C $repo rev-parse HEAD).Trim() }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $psi
    if (-not $process.Start()) { return [pscustomobject]@{ Passed = $false; SafeLine = $null; Code = 'SAFE_CHILD_START_FAILED' } }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $payload = if ($Mode -in @('attest','keys','local')) { '{}' } else { @{ mode = $Mode; runId = $RunId; databasePassword = $PasswordText;
      campaignMode = if ($CampaignMode -eq 'window-h1a') { 'window-h1a' } else { 'window-i2-i5' } } | ConvertTo-Json -Compress }
    $payloadBytes = [Text.UTF8Encoding]::new($false).GetBytes($payload + "`n")
    $stdin = $process.StandardInput.BaseStream
    $stdin.Write($payloadBytes, 0, $payloadBytes.Length)
    $stdin.Flush()
    $stdin.Close()
    $timeout = if ($Mode -in @('sequence','h1a-recover')) { 1200000 } else { 240000 }
    if (-not $process.WaitForExit($timeout)) {
      try { $process.Kill(); $null = $process.WaitForExit(5000) } catch { }
      return [pscustomobject]@{ Passed = $false; SafeLine = $null; Code = 'SAFE_CHILD_TIMEOUT' }
    }
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    $pattern = if ($Mode -eq 'keys') {
      '^U03_PREVIEW_KEYS_CHILD_PREFLIGHT (?:PASS keys=present-format-valid|BLOCKED code=(?:SEQUENCE_PREVIEW_KEYS_REQUIRED|SEQUENCE_PREVIEW_KEYS_FORMAT_INVALID); no database password was requested)$'
    } elseif ($Mode -eq 'local') {
      '^U03_PREVIEW_WINDOW_LOCAL_PREFLIGHT (?:PASS runId=[0-9a-fA-F-]{36} deploymentId=dpl_[A-Za-z0-9]+ sha=[0-9a-f]{40}|BLOCKED; no database operation was attempted)$'
    } elseif ($Mode -eq 'attest') {
      '^U03_WINDOW_BATCH_ATTESTATION (?:PASS runId=[0-9a-fA-F-]{36} deploymentId=dpl_[A-Za-z0-9]+ sha=[0-9a-f]{40}|BLOCKED code=[A-Z][A-Z0-9_]{1,79}; no database password was requested)$'
    } elseif ($Mode -eq 'h1a-recover') {
      '^H1A_RECOVERY (?:PASS runId=f7ee4d0a-edb4-4276-88fc-03bbab570a19 ledger=[^\r\n]+|BLOCKED code=RECOVERY_[A-Z_]+)$'
    } elseif ($Mode -eq 'sequence') {
      '^U03_PREVIEW_WINDOW_SEQUENCE (PASS|BLOCKED) runId=[0-9a-fA-F-]{36} ledger=[^\r\n]+$'
    } elseif ($Mode -eq 'run') {
      '^U03_WINDOW_ROLE_RESULT (PASS|BLOCKED) runId=[0-9a-fA-F-]{36} roleRemoved=(?:true|false|True|False) policies=\d+ inventoryZero=(?:true|false|True|False) outboxTotal=\d+ pending=\d+$'
    } elseif ($Mode -eq 'recover') {
      '^U03_WINDOW_RECOVERY PASS runId=840261c6-e410-4e25-893a-9206fd3f74ef rolePresent=false policies=0 sessions=0 inventoryZero=true outboxTotal=0 pending=0 guardOriginal=true writerLocked=true$'
    } elseif ($Mode -eq 'contain') {
      '^U03_WINDOW_ROLE_CONTAINMENT PASS runId=[0-9a-fA-F-]{36} rolePresent=(?:true|false|True|False) roleLocked=(?:true|false|True|False|null) policies=\d+ activeSessions=\d+ inventoryZero=(?:true|false|True|False) outboxTotal=\d+ pending=\d+$'
    } else {
      '^U03_WINDOW_ROLE_READONLY_DIAGNOSTIC (PASS runId=[0-9a-fA-F-]{36} checks=IDENTITY,MIGRATIONS,WRITER_LOCK,ADMIN_CAPABILITIES,INVENTORY,OUTBOX,TLS|BLOCKED runId=[0-9a-fA-F-]{36} category=(?:DNS|TCP|TLS|AUTHENTICATION|PERMISSION|DATABASE|PREFLIGHT) code=(?:ENOTFOUND|EAI_AGAIN|EAI_FAIL|ETIMEDOUT|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|EPIPE|ENETDOWN|ECONNABORTED|ERR_TLS_CERT_ALTNAME_INVALID|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT_LOCALLY|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED|ERR_TLS_HANDSHAKE_TIMEOUT|ERR_SSL_WRONG_VERSION_NUMBER|TLS_ERROR_UNCLASSIFIED|SQLSTATE_(?:42501|28P01|28000|57P01|0A000|42704|42710)|DATABASE_ERROR_UNCLASSIFIED|PREVIEW_READ_ONLY_RESULT_SCHEMA_INCOMPLETE|DATABASE_IDENTITY_MISMATCH|PREVIEW_IDENTITY_MISMATCH|MIGRATION_SET_MISMATCH|GENERAL_WRITER_NOT_LOCKED|ADMIN_CAPABILITY_MISSING|WRITER_SESSION_RESIDUE|TEMPORARY_ROLE_RESIDUE|TEMPORARY_POLICY_RESIDUE|TLS_VERIFICATION_FAILED|INVENTORY_NOT_EMPTY|PENDING_OUTBOX_NOT_EMPTY|ROLE_OWNERSHIP_UNVERIFIED|ROLE_ABSENCE_NOT_VERIFIED|ROLE_POLICY_RESIDUE|ROLE_SESSION_RESIDUE|FINAL_INVENTORY_NOT_EMPTY) sqlstate=(?:NONE|42501|28P01|28000|57P01|0A000|42704|42710) condition=(?:NONE|PREVIEW_READ_ONLY_RESULT_SCHEMA_INCOMPLETE|DATABASE_IDENTITY_MISMATCH|PREVIEW_IDENTITY_MISMATCH|MIGRATION_SET_MISMATCH|GENERAL_WRITER_NOT_LOCKED|ADMIN_CAPABILITY_MISSING|WRITER_SESSION_RESIDUE|TEMPORARY_ROLE_RESIDUE|TEMPORARY_POLICY_RESIDUE|TLS_VERIFICATION_FAILED|INVENTORY_NOT_EMPTY|PENDING_OUTBOX_NOT_EMPTY|ROLE_OWNERSHIP_UNVERIFIED|ROLE_ABSENCE_NOT_VERIFIED|ROLE_POLICY_RESIDUE|ROLE_SESSION_RESIDUE|FINAL_INVENTORY_NOT_EMPTY))$'
    }
    $combinedOutput = $stdout + "`n" + $stderr
    $safeLine = @($combinedOutput -split "`r?`n" | Where-Object { $_ -cmatch $pattern } | Select-Object -Last 1)
    if ($safeLine.Count -eq 0) {
      $missingCode = if ($Mode -eq 'attest' -and $stderr -match 'This module cannot be imported from a Client Component module') { 'SERVER_ONLY_IMPORT_REJECTED' }
        elseif (-not [string]::IsNullOrWhiteSpace($stderr)) { 'SAFE_CHILD_STDERR_NONEMPTY' } else { 'SAFE_CHILD_RESULT_MISSING' }
      return [pscustomobject]@{ Passed = $false; SafeLine = $null; Code = $missingCode }
    }
    $lineText = [string]$safeLine[0]
    $keyBlocked = if ($Mode -eq 'keys') { [regex]::Match($lineText,'BLOCKED code=(SEQUENCE_PREVIEW_KEYS_REQUIRED|SEQUENCE_PREVIEW_KEYS_FORMAT_INVALID); no database password was requested') } else { $null }
    $attestBlocked = if ($Mode -eq 'attest') { [regex]::Match($lineText,'BLOCKED code=([A-Z][A-Z0-9_]{1,79})') } else { $null }
    return [pscustomobject]@{ Passed = ($process.ExitCode -eq 0 -and $lineText -match ' PASS '); SafeLine = $lineText; Code = if ($keyBlocked -and $keyBlocked.Success) { $keyBlocked.Groups[1].Value } elseif ($attestBlocked -and $attestBlocked.Success) { $attestBlocked.Groups[1].Value } else { 'NONE' } }
  } catch {
    return [pscustomobject]@{ Passed = $false; SafeLine = $null; Code = 'SAFE_CHILD_FAILURE' }
  } finally {
    if ($payloadBytes) { [Array]::Clear($payloadBytes, 0, $payloadBytes.Length) }
    $payload = $null
    $stderr = $null
    $combinedOutput = $null
    if ($process) { try { $process.Dispose() } catch { } }
  }
}

function Invoke-U03WindowVercelCli([string[]]$Arguments, [string]$InputText = '') {
  $process = $null; $inputBytes = $null
  try {
    $cli = $env:U03_VERCEL_CLI
    if ([string]::IsNullOrWhiteSpace($cli) -or $Arguments.Count -lt 2) { Stop-B4 'WINDOW_VERCEL_CLI_INPUT_REJECTED' }
    $psi = [Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $env:ComSpec
    $psi.Arguments = '/d /s /c ""' + $cli + '" ' + ($Arguments -join ' ') + '"'
    $psi.WorkingDirectory = $repo
    $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
    $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
    $psi.EnvironmentVariables.Clear()
    foreach ($name in @('PATH','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','ProgramFiles','HOMEDRIVE','HOMEPATH','COMSPEC','PATHEXT','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy')) {
      $value = [Environment]::GetEnvironmentVariable($name)
      if (-not [string]::IsNullOrEmpty($value)) { $psi.EnvironmentVariables[$name] = $value }
    }
    $process = [Diagnostics.Process]::new(); $process.StartInfo = $psi
    if (-not $process.Start()) { Stop-B4 'WINDOW_VERCEL_CHILD_START_FAILED' }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync(); $stderrTask = $process.StandardError.ReadToEndAsync()
    if (-not [string]::IsNullOrEmpty($InputText)) {
      $inputBytes = [Text.UTF8Encoding]::new($false).GetBytes($InputText + "`n")
      $stream = $process.StandardInput.BaseStream; $stream.Write($inputBytes,0,$inputBytes.Length); $stream.Flush()
    }
    $process.StandardInput.Close()
    if (-not $process.WaitForExit(120000)) { try { $process.Kill() } catch { }; Stop-B4 'WINDOW_VERCEL_CHILD_TIMEOUT' }
    $stdout = $stdoutTask.GetAwaiter().GetResult(); $stderrText = $stderrTask.GetAwaiter().GetResult()
    $notFound = ($process.ExitCode -ne 0 -and ($stderrText -match 'Deployment not found \(404\)' -or $stdout -match 'Deployment not found \(404\)'))
    return [pscustomobject]@{ ExitCode=$process.ExitCode; Output=$stdout; DeploymentNotFound=[bool]$notFound }
  } catch {
    if ($_.Exception.Message -like 'U03 B-4 BLOCKED:*') { throw }
    return [pscustomobject]@{ ExitCode=1; Output='' }
  } finally {
    if ($inputBytes) { [Array]::Clear($inputBytes,0,$inputBytes.Length) }
    if ($process) { $process.Dispose() }
    $InputText = $null
  }
}

function Invoke-U03WindowBatchProvision {
  $head = (& git -C $repo rev-parse HEAD 2>$null).Trim()
  $dirty = (& git -C $repo status --porcelain 2>$null | Out-String).Trim()
  if ($branch -cne 'codex/h1a-integral-20261022' -or $head -cnotmatch '^[0-9a-f]{40}$' -or $dirty) { Stop-B4 'WINDOW_PROVISION_GIT_PIN_REJECTED' }
  $vaultPath = Get-U03WindowVaultPath
  if (Test-Path -LiteralPath $vaultPath -PathType Leaf) {
    try { $previousBatch = Get-U03WindowBatch } catch { Stop-B4 'WINDOW_BATCH_EXISTING_VAULT_UNAVAILABLE' }
    if ($previousBatch.Sha -ceq $head -and $previousBatch.Branch -ceq $branch) { $batch = $previousBatch }
    else {
      foreach ($name in @($previousBatch.Values.Keys)) { $previousBatch.Values[$name] = '' }
      $previousBatch = $null
      $batch = New-U03WindowBatch -Sha $head
      $null = Save-U03WindowBatch -Batch $batch
    }
  } else {
    $batch = New-U03WindowBatch -Sha $head
    $null = Save-U03WindowBatch -Batch $batch
  }
  $windowVariableNames = Get-U03WindowVariableNames
  try {
    $cliInvoker = { param($Arguments,$InputText) Invoke-U03WindowVercelCli -Arguments $Arguments -InputText $InputText }
    $rotation = Invoke-U03WindowRotation -Batch $batch -Cli $cliInvoker -Names $windowVariableNames
    if (-not $rotation.Passed) { Stop-B4 $rotation.Code }
    Write-Output "U03_WINDOW_BATCH_PROVISIONED runId=$($batch.RunId) branch=$($batch.Branch) sha=$($batch.Sha) ref=$($batch.SupabaseRef) count=8 vault=DPAPI_CURRENT_USER deployment=REDEPLOY_REQUIRED"
  } catch {
    $failure = [regex]::Match($_.Exception.Message,'(?:BLOCKED:\s*|)(ROTATION_[A-Z_]+|WINDOW_[A-Z_]+)')
    $failureCode = if ($failure.Success) { $failure.Groups[1].Value } else { 'ROTATION_INCOMPLETE' }
    Write-Output "U03_WINDOW_BATCH_PROVISION BLOCKED code=$failureCode vault=RETAINED runId=$($batch.RunId)"
    throw
  } finally {
    foreach ($name in @($batch.Values.Keys)) { $batch.Values[$name] = '' }
    $batch = $null
  }
}

function Test-U03WindowVercelStdinTransport {
  $name = 'U03_WINDOW_TRANSPORT_SELFTEST_' + [guid]::NewGuid().ToString('N')
  $value = 'fake-only-' + [char]0x00f1 + '-' + [char]0x6771 + [char]0x4eac + '-' + [char]0xd83d + [char]0xdd10 + '-:/?&%'
  $ownedName = $false; $verifiedAbsent = $false
  try {
    $before = Invoke-U03WindowVercelCli -Arguments @('env','ls','preview','codex/h1a-integral-20261022')
    if ($before.ExitCode -ne 0 -or $before.Output -match ('\b' + [regex]::Escape($name) + '\b')) { Stop-B4 'WINDOW_TRANSPORT_SELFTEST_PRECONDITION_FAILED' }
    $ownedName = $true
    $add = Invoke-U03WindowVercelCli -Arguments @('env','add',$name,'preview','codex/h1a-integral-20261022','--yes','--sensitive') -InputText $value
    if ($add.ExitCode -ne 0) { Stop-B4 'WINDOW_TRANSPORT_SELFTEST_STDIN_FAILED' }
    $middle = Invoke-U03WindowVercelCli -Arguments @('env','ls','preview','codex/h1a-integral-20261022')
    if ($middle.ExitCode -ne 0 -or $middle.Output -notmatch ('\b' + [regex]::Escape($name) + '\b')) { Stop-B4 'WINDOW_TRANSPORT_SELFTEST_PERSISTENCE_FAILED' }
  } finally {
    if ($ownedName) { $null = Invoke-U03WindowVercelCli -Arguments @('env','rm',$name,'preview','codex/h1a-integral-20261022','--yes') }
    $after = Invoke-U03WindowVercelCli -Arguments @('env','ls','preview','codex/h1a-integral-20261022')
    $verifiedAbsent = $after.ExitCode -eq 0 -and $after.Output -notmatch ('\b' + [regex]::Escape($name) + '\b')
    $value = $null
    if (-not $verifiedAbsent) { Stop-B4 'WINDOW_TRANSPORT_SELFTEST_CLEANUP_UNVERIFIED' }
  }
  Write-Output 'U03_WINDOW_VERCEL_STDIN_SELFTEST PASS transport=ProcessStartInfo.BaseStream encoding=UTF8 sensitive=true scope=PreviewBranch cleanup=verified'
}

function Invoke-U03PreviewAdminConnectionComparison([System.Security.SecureString]$SecurePassword) {
  $psql = Get-Command psql.exe -ErrorAction SilentlyContinue
  if (-not $psql) {
    $psql = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending |
      ForEach-Object { Join-Path $_.FullName 'bin\psql.exe' } |
      Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  } else { $psql = $psql.Source }
  if (-not $psql -or -not (Test-Path -LiteralPath $psql)) { Stop-B4 'PSQL_CLIENT_NOT_FOUND' }

  $sourceRootCa = Join-Path $PSScriptRoot '..\src\lib\provenance\supabase-root-ca.ts'
  $caSource = [IO.File]::ReadAllText([IO.Path]::GetFullPath($sourceRootCa))
  $caMatch = [regex]::Match($caSource, 'SUPABASE_ROOT_2021_CA\s*=\s*`([^`]*)`', [Text.RegularExpressions.RegexOptions]::Singleline)
  if (-not $caMatch.Success) { Stop-B4 'PINNED_DATABASE_CA_UNAVAILABLE' }

  $bstr = [IntPtr]::Zero
  $plainPassword = $null
  $caPath = Join-Path ([IO.Path]::GetTempPath()) ('u03-preview-pooler-ca-' + [guid]::NewGuid().ToString('N') + '.pem')
  try {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    $env:U03_PREVIEW_ADMIN_DATABASE_URL = New-U03PreviewAdminPoolerUrlFromPlaintext -PasswordText $plainPassword
    $env:U03_PREVIEW_ADMIN_PASSWORD_EXPECTED = $plainPassword
    [IO.File]::WriteAllText($caPath, $caMatch.Groups[1].Value.Trim() + "`n", [Text.Encoding]::ASCII)

    $env:PGHOST = 'aws-1-eu-west-3.pooler.supabase.com'
    $env:PGPORT = '5432'
    $env:PGUSER = 'postgres.rhnnplewqsekrnaousyl'
    $env:PGDATABASE = 'postgres'
    $env:PGPASSWORD = $plainPassword
    $env:PGSSLMODE = 'verify-full'
    $env:PGSSLROOTCERT = $caPath
    $psqlOutput = ''
    $psqlError = ''
    try {
      $psqlOutput = (& $psql -X -A -t -v ON_ERROR_STOP=1 -c "select current_database() || '|' || session_user || '|' || current_user;" 2>&1 | Out-String)
      $psqlExit = $LASTEXITCODE
      if ($psqlExit -ne 0) { $psqlError = $psqlOutput }
    } catch {
      $psqlExit = 1
      # Exception text is inspected only for allowlisted patterns; never emitted.
      $psqlError = $_.Exception.Message
    }
    $psqlResult = ConvertFrom-U03PsqlDiagnostic -ErrorText $psqlError -ExitCode $psqlExit -OutputText $psqlOutput
    Write-Output "V4_PSQL_DIAGNOSTIC: $($psqlResult.Status) category=$($psqlResult.Category) code=$($psqlResult.Code)"
    foreach ($name in @('PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD','PGSSLMODE','PGSSLROOTCERT')) {
      Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
    }

    $nodeOutput = @(& node $v4Operator --diagnose-connection 2>&1)
    $nodeExit = $LASTEXITCODE
    $nodeLine = $nodeOutput | ForEach-Object { [regex]::Match([string]$_, '^V4_CONNECTION_DIAGNOSTIC: (PASS|FAIL) category=([A-Z_]+) code=([A-Z0-9_]+)$') } |
      Where-Object { $_.Success } | Select-Object -First 1
    if ($nodeLine) {
      Write-Output $nodeLine.Value
      $nodePass = $nodeLine.Groups[1].Value -eq 'PASS' -and $nodeExit -eq 0
    } else {
      Write-Output 'V4_CONNECTION_DIAGNOSTIC: FAIL category=DIAGNOSTIC code=SAFE_DIAGNOSTIC_FAILURE'
      $nodePass = $false
    }
    return ($psqlResult.Status -eq 'PASS' -and $nodePass)
  } finally {
    foreach ($name in @('PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD','PGSSLMODE','PGSSLROOTCERT')) {
      Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $caPath) { Remove-Item -LiteralPath $caPath -Force -ErrorAction SilentlyContinue }
    $plainPassword = $null
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  }
}

$credentialOperations = 0
foreach ($requested in @($ProvisionPreviewKeys.IsPresent, $CheckPreviewKeys.IsPresent, $ReplacePreviewKeys.IsPresent, $DeletePreviewKeys.IsPresent)) {
  if ($requested) { $credentialOperations++ }
}
$campaignModes = @($ReadOnlyPreflightOnly.IsPresent, $V4ConnectionDiagnosticOnly.IsPresent, $WindowRolePreflightOnly.IsPresent,
  $WindowRoleReadOnlyDiagnosticOnly.IsPresent, $WindowRecoveryOnly.IsPresent, $H1ARecoveryOnly.IsPresent, $H1ARecoveryTransportOnly.IsPresent, $WindowI2I5H1A.IsPresent, $WindowH1A.IsPresent, $WindowBatchAttestationOnly.IsPresent,
  $ProvisionWindowSecrets.IsPresent,
  $WindowTransportSelfTestOnly.IsPresent,
  $WindowRoleTransportSelfTestOnly.IsPresent,
  $PlaywrightOnly.IsPresent, $MembershipRevocationOnly.IsPresent, $RolesInvitationsOnly.IsPresent,
  $CrossSurfaceOnly.IsPresent, $SessionProvidersOnly.IsPresent, $ProviderEgressOnly.IsPresent) | Where-Object { $_ }
if ($credentialOperations -gt 1 -or ($credentialOperations -gt 0 -and $campaignModes.Count -gt 0) -or
    $campaignModes.Count -gt 1) { Stop-B4 'CREDENTIAL_OPERATION_ARGUMENTS_INVALID' }
if ($CheckPreviewKeys) {
  try {
    if (Test-B4PreviewCredentials) { Write-Output 'PREVIEW_CREDENTIALS_PRESENT' }
  }
  catch {
    Write-Output 'PREVIEW_CREDENTIALS_MISSING_OR_UNAVAILABLE'
  }
  return
}
if ($DeletePreviewKeys) {
  if (Remove-B4PreviewCredentials) { Write-Output 'PREVIEW_CREDENTIALS_DELETED' }
  else { Write-Output 'PREVIEW_CREDENTIALS_NOT_PRESENT' }
  return
}

if (-not (Test-Path -LiteralPath $runner)) { Stop-B4 'B4_ORCHESTRATOR_MISSING' }
if (-not (Test-Path -LiteralPath $linkFile)) { Stop-B4 'VERCEL_PROJECT_NOT_LINKED' }
$branch = (& git -C $repo branch --show-current 2>$null).Trim()
$remote = (& git -C $repo remote get-url origin 2>$null).Trim()
if ($branch -notin @('codex/u02-preview-isolation-20261017', 'codex/u03-roles-invitations-20261019',
    'codex/u03-cross-surface-20261019', 'codex/u03-session-gates-20261020', 'codex/u03-final-gates-20261020', 'codex/h1a-integral-20261022') -or
    $remote -ne 'https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO.git') { Stop-B4 'WRONG_REPOSITORY_OR_BRANCH' }
if ($CrossSurfaceOnly -and $branch -ne 'codex/u03-cross-surface-20261019') { Stop-B4 'WRONG_MODE_BRANCH' }
if ($SessionProvidersOnly -and $branch -ne 'codex/u03-session-gates-20261020') { Stop-B4 'WRONG_MODE_BRANCH' }
if ($ProviderEgressOnly -and $branch -ne 'codex/u03-final-gates-20261020') { Stop-B4 'WRONG_MODE_BRANCH' }
if ($WindowRolePreflightOnly -and $branch -ne 'codex/u03-final-gates-20261020') { Stop-B4 'WRONG_MODE_BRANCH' }
if ($WindowRoleReadOnlyDiagnosticOnly -and $branch -ne 'codex/u03-final-gates-20261020') { Stop-B4 'WRONG_MODE_BRANCH' }
if ($WindowRecoveryOnly -and $branch -ne 'codex/u03-final-gates-20261020') { Stop-B4 'WRONG_MODE_BRANCH' }
if (($H1ARecoveryOnly -or $H1ARecoveryTransportOnly) -and $branch -ne 'codex/h1a-integral-20261022') { Stop-B4 'WRONG_MODE_BRANCH' }
if ($WindowI2I5H1A -and $branch -ne 'codex/u03-final-gates-20261020') { Stop-B4 'WRONG_MODE_BRANCH' }
if ($WindowH1A -and $branch -ne 'codex/h1a-integral-20261022') { Stop-B4 'WRONG_MODE_BRANCH' }
if (($WindowBatchAttestationOnly -or $ProvisionWindowSecrets) -and $branch -ne 'codex/h1a-integral-20261022') { Stop-B4 'WRONG_MODE_BRANCH' }
if ($WindowTransportSelfTestOnly -and $branch -ne 'codex/u03-final-gates-20261020') { Stop-B4 'WRONG_MODE_BRANCH' }
if ($RolesInvitationsOnly -and $branch -notin @('codex/u03-roles-invitations-20261019',
    'codex/u03-cross-surface-20261019')) { Stop-B4 'WRONG_MODE_BRANCH' }
$link = Get-Content -LiteralPath $linkFile -Raw | ConvertFrom-Json
if ($link.projectId -ne 'prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook' -or $link.orgId -ne 'team_hLhdb3M9MviTIysXD9whFF2c') { Stop-B4 'VERCEL_LINK_MISMATCH' }
if (-not $WindowRoleTransportSelfTestOnly -and [string]::IsNullOrWhiteSpace($env:VERCEL_OIDC_TOKEN)) { Stop-B4 'VERCEL_ENV_RUN_DID_NOT_PROVIDE_OIDC_TOKEN' }

$vercelCommand = Get-Command vercel.cmd -ErrorAction SilentlyContinue
if (-not $vercelCommand) { $vercelCommand = Get-Command vercel -ErrorAction SilentlyContinue }
if ($vercelCommand) { $env:U03_VERCEL_CLI = $vercelCommand.Source }
else {
  $fallbackCli = Join-Path $env:APPDATA 'npm\vercel.cmd'
  if (-not (Test-Path -LiteralPath $fallbackCli)) { Stop-B4 'VERCEL_CLI_NOT_FOUND' }
  $env:U03_VERCEL_CLI = $fallbackCli
}
$supabaseCommand = Get-Command npx.cmd -ErrorAction SilentlyContinue
if (-not $supabaseCommand) { $supabaseCommand = Get-Command npx -ErrorAction SilentlyContinue }
if ($supabaseCommand) { $env:U03_SUPABASE_CLI = $supabaseCommand.Source }
else {
  $fallbackNpx = Join-Path $env:ProgramFiles 'nodejs\npx.cmd'
  if (-not (Test-Path -LiteralPath $fallbackNpx)) { Stop-B4 'SUPABASE_NPX_NOT_FOUND' }
  $env:U03_SUPABASE_CLI = $fallbackNpx
}

if ($ProviderEgressOnly) {
  $head = (& git -C $repo rev-parse HEAD 2>$null).Trim()
  if ($DeploymentId -cnotmatch '^dpl_[A-Za-z0-9]+$' -or
      $DeploymentHost -cnotmatch '^[a-z0-9][a-z0-9.-]+\.vercel\.app$' -or
      $DeploymentSha -cne $head -or $DeploymentSha -cnotmatch '^[0-9a-f]{40}$' -or
      $RunId -cnotmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') {
    Stop-B4 'PROVIDER_EGRESS_DEPLOYMENT_OR_RUN_PIN_INVALID'
  }
  $env:U03_PIN_DEPLOYMENT_ID = $DeploymentId
  $env:U03_PIN_DEPLOYMENT_HOST = $DeploymentHost
  $env:U03_PIN_DEPLOYMENT_SHA = $DeploymentSha
  $env:U03_PIN_DEPLOYMENT_BRANCH = 'codex/u03-final-gates-20261020'
}

$pushed = $false
$isH1AWindow = $WindowH1A.IsPresent
$windowExpectedBranch = if ($isH1AWindow -or $H1ARecoveryOnly -or $H1ARecoveryTransportOnly -or $WindowBatchAttestationOnly -or $ProvisionWindowSecrets) { 'codex/h1a-integral-20261022' } else { 'codex/u03-final-gates-20261020' }
$previewCredentials = $null
$adminKey = $null
$publicKey = $null
$clipboardSessionActive = $false
$operatorRunId = $null
$operatorContainFailed = $false
$secureDatabasePassword = $null
$adminDatabaseUrl = $null
$windowRoleRunId = $null
$windowRoleContainFailed = $false
$windowRolePlainPassword = $null
$windowRoleTransportSelfTestPassed = $false
$windowRoleChildOverride = $null
$windowBatch = $null
$windowBatchAttested = $false
$windowSequencePassed = $false
$sequencePreviewCredentials = $null
$sequencePreviewKeys = $null
try {
  if ($WindowTransportSelfTestOnly) {
    Test-U03WindowVercelStdinTransport
    return
  }
  if ($ProvisionWindowSecrets) {
    Invoke-U03WindowBatchProvision
    return
  }
  if ($WindowRoleTransportSelfTestOnly) {
    $testChild = Join-Path $PSScriptRoot 'u03-window-role-transport-child.mjs'
    $fakePassword = 'Ficticia-' + [char]0x00f1 + '-' + [char]0x6771 + [char]0x4eac + '-' + [char]0xd83d + [char]0xdd10
    $successId = 'a8f2d946-07ab-4bb9-8901-35f7993f1266'
    $windowRoleRunId = 'f9c7f203-3f09-4eb2-bcc0-37db2cc6a782'
    $successChild = Invoke-U03WindowRoleChild -Mode 'run' -RunId $successId -PasswordText $fakePassword -ChildPath $testChild
    if (-not $successChild.Passed -or $successChild.SafeLine -notmatch '^U03_WINDOW_ROLE_RESULT PASS ') { Stop-B4 'WINDOW_ROLE_UTF8_TRANSPORT_TEST_FAILED' }
    $windowRolePlainPassword = $fakePassword
    $windowRoleChildOverride = $testChild
    $failedChild = Invoke-U03WindowRoleChild -Mode 'run' -RunId $windowRoleRunId -PasswordText $fakePassword -ChildPath $testChild
    if ($failedChild.Passed -or $failedChild.SafeLine -notmatch '^U03_WINDOW_ROLE_RESULT BLOCKED ') { Stop-B4 'WINDOW_ROLE_CHILD_FAILURE_TEST_FAILED' }
    $diagnosticChild = Invoke-U03WindowRoleChild -Mode 'diagnose' -RunId $windowRoleRunId -PasswordText $fakePassword -ChildPath $testChild
    if ($diagnosticChild.Passed -or $diagnosticChild.SafeLine -notmatch '^U03_WINDOW_ROLE_READONLY_DIAGNOSTIC BLOCKED .*category=DNS code=EAI_AGAIN sqlstate=NONE condition=NONE$') { Stop-B4 'WINDOW_ROLE_DIAGNOSTIC_OUTPUT_TEST_FAILED' }
    $recoveryChild = Invoke-U03WindowRoleChild -Mode 'recover' -RunId '840261c6-e410-4e25-893a-9206fd3f74ef' -PasswordText $fakePassword -ChildPath $testChild
    if (-not $recoveryChild.Passed -or $recoveryChild.SafeLine -notmatch '^U03_WINDOW_RECOVERY PASS .*guardOriginal=true writerLocked=true$') { Stop-B4 'WINDOW_RECOVERY_UTF8_TRANSPORT_TEST_FAILED' }
    $prepareFailure = Invoke-U03WindowRoleChild -Mode 'run' -RunId $windowRoleRunId -PasswordText $fakePassword -ChildPath (Join-Path $env:TEMP 'u03-missing-child-test.mjs')
    if ($prepareFailure.Passed) { Stop-B4 'WINDOW_ROLE_CHILD_PREPARATION_FAILURE_TEST_FAILED' }
    $sequenceOperator = Join-Path $PSScriptRoot 'u03-preview-window-run.mjs'
    $fakeKeys = @{ AdminKey='header.payload.signature'; PublicKey='header.payload.signature' }
    $keyPreflight = Invoke-U03WindowRoleChild -Mode 'keys' -RunId $windowRoleRunId -PasswordText '' -ChildPath $sequenceOperator -PreviewKeys $fakeKeys
    if (-not $keyPreflight.Passed -or $keyPreflight.SafeLine -ne 'U03_PREVIEW_KEYS_CHILD_PREFLIGHT PASS keys=present-format-valid') { Stop-B4 'WINDOW_ROLE_KEYS_CHILD_PREFLIGHT_TEST_FAILED' }
    $keyMissing = Invoke-U03WindowRoleChild -Mode 'keys' -RunId $windowRoleRunId -PasswordText '' -ChildPath $sequenceOperator
    if ($keyMissing.Passed -or $keyMissing.Code -ne 'SEQUENCE_PREVIEW_KEYS_REQUIRED') { Stop-B4 'WINDOW_ROLE_KEYS_MISSING_REGRESSION_FAILED' }
    $fakeCli = Join-Path $env:TEMP ('u03-vercel-stderr-' + [guid]::NewGuid().ToString('N') + '.cmd')
    try {
      [IO.File]::WriteAllText($fakeCli,"@echo off`r`necho Vercel CLI fictional banner 1>&2`r`nexit /b 23`r`n",[Text.Encoding]::ASCII)
      $previousCli = $env:U03_VERCEL_CLI; $env:U03_VERCEL_CLI = $fakeCli
      $stderrResult = Invoke-U03WindowVercelCli -Arguments @('env','rm','FAKE_NAME','preview','--yes') -InputText ''
      if ($stderrResult.ExitCode -ne 23 -or $stderrResult.Output -ne '') { Stop-B4 'WINDOW_CLI_STDERR_TRANSPORT_REGRESSION_FAILED' }
      [IO.File]::WriteAllText($fakeCli,"@echo off`r`necho Error: Deployment not found (404) 1>&2`r`nexit /b 1`r`n",[Text.Encoding]::ASCII)
      $absentResult = Invoke-U03WindowVercelCli -Arguments @('api','/v13/deployments/dpl_Fake123') -InputText ''
      if (-not $absentResult.DeploymentNotFound) { Stop-B4 'WINDOW_DEPLOYMENT_ABSENCE_CLASSIFIER_FAILED' }
    } finally {
      if ($null -eq $previousCli) { Remove-Item Env:U03_VERCEL_CLI -ErrorAction SilentlyContinue } else { $env:U03_VERCEL_CLI = $previousCli }
      Remove-Item -LiteralPath $fakeCli -Force -ErrorAction SilentlyContinue
    }
    $cleanupState = @{ Names=@('U03_PREVIEW_WRITER_WINDOW_REF','U03_PREVIEW_WRITER_WINDOW_SHA','U03_PREVIEW_WRITER_WINDOW_RUN_ID',
      'U03_PREVIEW_WRITER_WINDOW_SECRET','RUBIK_AUDIT_DATABASE_URL','PROVENANCE_SIGNING_KEYS','PROVENANCE_ACTIVE_KEY_ID'); Removed=$false }
    $cleanupCli = {
      param($Arguments,$InputText)
      if ($Arguments[1] -eq 'ls') {
        $envRows = @($cleanupState.Names | ForEach-Object { [pscustomobject]@{ key=$_; type='sensitive'; target=@('preview'); gitBranch='codex/h1a-integral-20261022' } })
        return [pscustomobject]@{ ExitCode=0; Output=(ConvertTo-Json -InputObject @{envs=$envRows} -Depth 5 -Compress) }
      }
      if ($Arguments[1] -eq 'rm') {
        $cleanupState.Names = @($cleanupState.Names | Where-Object { $_ -cne $Arguments[2] })
        return [pscustomobject]@{ ExitCode=1; Output='' } # banner/non-zero despite successful removal
      }
      return [pscustomobject]@{ ExitCode=1; Output='' }
    }.GetNewClosure()
    $removeDeployment = { param($Id) $cleanupState.Removed=$true; [pscustomobject]@{ExitCode=0} }.GetNewClosure()
    $cleanupResult = Remove-U03WindowDeploymentConfigurationSafe -DeploymentId 'dpl_Fake123' -Cli $cleanupCli -RemoveDeployment $removeDeployment
    if (-not $cleanupResult.Passed -or -not $cleanupState.Removed -or $cleanupState.Names.Count -ne 0) { Stop-B4 'WINDOW_CLEANUP_IDEMPOTENCE_TEST_FAILED' }
    $rotationNames = Get-U03WindowVariableNames
    $rotationState = @{ Rows=@($rotationNames | Select-Object -Skip 1 | ForEach-Object { [pscustomobject]@{key=$_;type='sensitive';target=@('preview');gitBranch='codex/h1a-integral-20261022'} }); Operations=@() }
    $rotationCli = {
      param($Arguments,$InputText)
      $rotationState.Operations += ,@($Arguments[1],$Arguments[2])
      if ($Arguments[1] -eq 'ls') { return [pscustomobject]@{ExitCode=0;Output=(ConvertTo-Json -InputObject @{envs=@($rotationState.Rows)} -Depth 5 -Compress)} }
      if ($Arguments[1] -eq 'rm') {
        $rotationState.Rows=@($rotationState.Rows|Where-Object{$_.key -cne $Arguments[2]})
        return [pscustomobject]@{ExitCode=1;Output=''}
      }
      if ($Arguments[1] -eq 'add') {
        $rotationState.Rows+=,[pscustomobject]@{key=$Arguments[2];type='sensitive';target=@('preview');gitBranch='codex/h1a-integral-20261022'}
        return [pscustomobject]@{ExitCode=0;Output=''}
      }
      return [pscustomobject]@{ExitCode=1;Output=''}
    }.GetNewClosure()
    $fakeBatchValues = [ordered]@{}
    foreach ($name in $rotationNames) { $fakeBatchValues[$name] = 'fictional-placeholder' }
    $fakeBatchValues.U03_PREVIEW_WRITER_WINDOW='armed-run-capability'
    $fakeBatchValues.U03_PREVIEW_WRITER_WINDOW_REF='rhnnplewqsekrnaousyl'
    $fakeBatchValues.U03_PREVIEW_WRITER_WINDOW_SHA=('a'*40)
    $fakeBatchValues.U03_PREVIEW_WRITER_WINDOW_RUN_ID=$windowRoleRunId
    $fakeBatchValues.U03_PREVIEW_WRITER_WINDOW_SECRET=('a'*64)
    $fakeBatchValues.RUBIK_AUDIT_DATABASE_URL='postgresql://fictional@aws-1-eu-west-3.pooler.supabase.com:5432/postgres'
    $fakeBatchValues.PROVENANCE_SIGNING_KEYS='u03-preview-window:ZmFrZQ=='
    $fakeBatchValues.PROVENANCE_ACTIVE_KEY_ID='u03-preview-window'
    $fakeBatch=[pscustomobject]@{Branch='codex/h1a-integral-20261022';SupabaseRef='rhnnplewqsekrnaousyl';Sha=('a'*40);RunId=$windowRoleRunId;Values=$fakeBatchValues}
    $rotationResult=Invoke-U03WindowRotation -Batch $fakeBatch -Cli $rotationCli -Names $rotationNames
    if (-not $rotationResult.Passed -or @($rotationState.Rows).Count -ne 8 -or $rotationState.Operations[-2][0] -ne 'add' -or $rotationState.Operations[-2][1] -ne $rotationNames[0]) { Stop-B4 'WINDOW_PARTIAL_ROTATION_RECOVERY_TEST_FAILED' }
    $windowRoleTransportSelfTestPassed = $true
  } else {
  # Preserve the machine's authorized proxy route for Node fetch and CLI reads.
  # Never print these values; they may contain proxy authentication material.
  $proxyNames = @('HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy')
  $proxyRouteNames = @('HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy')
  $hasProxy = @($proxyRouteNames | Where-Object { -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) }).Count -gt 0
  if ([string]::IsNullOrWhiteSpace($env:HTTPS_PROXY) -and [string]::IsNullOrWhiteSpace($env:https_proxy)) {
    if (-not [string]::IsNullOrWhiteSpace($env:ALL_PROXY)) { $env:HTTPS_PROXY = $env:ALL_PROXY }
    elseif (-not [string]::IsNullOrWhiteSpace($env:all_proxy)) { $env:HTTPS_PROXY = $env:all_proxy }
  }
  if ($hasProxy) {
    # Node 24/22.21+ uses these startup switches to honor HTTP(S)_PROXY.
    $env:NODE_USE_ENV_PROXY = '1'
    $env:NODE_USE_SYSTEM_CA = '1'
  }

  # Strip unrelated Vercel project values and inherited credentials before Node.
  # Keep the isolated OIDC token, OS runtime and network route only.
  $keep = @('PATH','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','ProgramFiles','HOMEDRIVE','HOMEPATH','COMSPEC','PATHEXT','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS','OS','VERCEL_OIDC_TOKEN','U03_VERCEL_CLI','U03_SUPABASE_CLI','U03_PIN_DEPLOYMENT_ID','U03_PIN_DEPLOYMENT_HOST','U03_PIN_DEPLOYMENT_SHA','U03_PIN_DEPLOYMENT_BRANCH','U03_PREVIEW_WRITER_WINDOW','U03_PREVIEW_WRITER_WINDOW_REF','U03_PREVIEW_WRITER_WINDOW_SHA','U03_PREVIEW_WRITER_WINDOW_RUN_ID','U03_PREVIEW_WRITER_WINDOW_SECRET','RUBIK_AUDIT_DATABASE_URL','PROVENANCE_SIGNING_KEYS','PROVENANCE_ACTIVE_KEY_ID','NODE_USE_ENV_PROXY','NODE_USE_SYSTEM_CA','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR') + $proxyNames
  Get-ChildItem Env: | Where-Object { $_.Name -notin $keep } | ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" -ErrorAction SilentlyContinue }

  Push-Location -LiteralPath $repo
  $pushed = $true
  if ($WindowRecoveryOnly) {
    $recoveryRun = '840261c6-e410-4e25-893a-9206fd3f74ef'
    $recoveryDeployment = 'dpl_BG4ZUh8Az77KcHNi7tv9ezexqzz5'
    if ($RunId -and $RunId -cne $recoveryRun) { Stop-B4 'WINDOW_RECOVERY_RUN_MISMATCH' }
    try { $recoveryBatch = Get-U03WindowBatch } catch { Stop-B4 'WINDOW_RECOVERY_VAULT_UNAVAILABLE' }
    if ($recoveryBatch.RunId -cne $recoveryRun -or $recoveryBatch.Sha -cne 'd8883c6944a33982e31135784ed20a6e2ff056c8' -or
        $recoveryBatch.ProjectId -cne 'prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook' -or
        $recoveryBatch.SupabaseRef -cne 'rhnnplewqsekrnaousyl' -or
        $recoveryBatch.Branch -cne 'codex/u03-final-gates-20261020') { Stop-B4 'WINDOW_RECOVERY_VAULT_IDENTITY_MISMATCH' }
    $recoveryBatch = $null
    $secureDatabasePassword = Read-Host -Prompt 'Recuperación del run 840261c6: Database password existente de Supabase Preview (entrada oculta)' -AsSecureString
    $passwordBstr = [IntPtr]::Zero
    try {
      $passwordBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureDatabasePassword)
      $windowRolePlainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordBstr)
      if ([string]::IsNullOrEmpty($windowRolePlainPassword)) { Stop-B4 'WINDOW_RECOVERY_PASSWORD_EMPTY' }
      $result = Invoke-U03WindowRoleChild -Mode 'recover' -RunId $recoveryRun -PasswordText $windowRolePlainPassword
      if ($result.SafeLine) { Write-Output $result.SafeLine }
      if (-not $result.Passed) { Stop-B4 'WINDOW_RECOVERY_SQL_OR_FINAL_READ_BLOCKED' }
    } finally {
      if ($passwordBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordBstr) }
      if ($secureDatabasePassword) { $secureDatabasePassword.Dispose(); $secureDatabasePassword = $null }
      $windowRolePlainPassword = $null
    }
    if (-not (Remove-U03WindowDeploymentConfiguration -DeploymentId $recoveryDeployment)) {
      Stop-B4 'WINDOW_RECOVERY_BRANCH_VARIABLE_OR_DEPLOYMENT_TEARDOWN_BLOCKED'
    }
    $inspection = Invoke-U03WindowVercelCli -Arguments @('api',"/v13/deployments/$recoveryDeployment") -InputText ''
    if (-not $inspection.DeploymentNotFound) { Stop-B4 'WINDOW_RECOVERY_DEPLOYMENT_ABSENCE_UNVERIFIED' }
    if (-not (Remove-U03WindowBatch)) { Stop-B4 'WINDOW_RECOVERY_VAULT_REMOVE_FAILED' }
    Write-Output 'U03_WINDOW_RECOVERY_TEARDOWN PASS branchVariablesAbsent=true deploymentAbsent=true vaultRemoved=true'
    return
  }
  if ($H1ARecoveryOnly -or $H1ARecoveryTransportOnly) {
    $recoveryRun = 'f7ee4d0a-edb4-4276-88fc-03bbab570a19'
    $recoveryDeployment = 'dpl_HR7dit3yEnunZWCHi4cXUNS7Vrn9'
    $recoveryHost = 'plataforma-rubik-seo-a0b46g2ws-juanma-espinosas-projects.vercel.app'
    $recoverySha = '0c06a300f3870af9cca5e5468a9401ccf7488b41'
    if ($RunId -cne $recoveryRun -or $DeploymentId -cne $recoveryDeployment -or
        $DeploymentHost -cne $recoveryHost -or $DeploymentSha -cne $recoverySha -or
        -not (Test-Path -LiteralPath $h1aRecoveryOperator -PathType Leaf)) { Stop-B4 'H1A_RECOVERY_PIN_REJECTED' }
    $metadataResult = Invoke-U03WindowVercelCli -Arguments @('env','ls','preview','codex/h1a-integral-20261022','--format=json') -InputText ''
    if ($metadataResult.ExitCode -ne 0) { Stop-B4 'H1A_RECOVERY_METADATA_UNAVAILABLE' }
    try {
      $metadataStart = $metadataResult.Output.IndexOf('{')
      if ($metadataStart -lt 0) { throw 'MISSING_JSON' }
      $metadata = $metadataResult.Output.Substring($metadataStart) | ConvertFrom-Json -ErrorAction Stop
      if ($null -eq $metadata.PSObject.Properties['envs']) { throw 'MISSING_ENVS' }
      $metadataRows = @(Compare-H1ABatchMetadata @($metadata.envs))
    } catch { Stop-B4 'H1A_RECOVERY_METADATA_UNAVAILABLE' }
    foreach ($row in $metadataRows) {
      Write-Output "H1A_RECOVERY_TRANSPORT stage=$($row.Stage) name=$($row.Name) category=$($row.Category)"
    }
    if (@($metadataRows | Where-Object Category -ne 'PRESENT_MATCH').Count -ne 0) {
      Stop-B4 'H1A_RECOVERY_METADATA_SCOPE_MISMATCH'
    }
    try { $recoveryBatch = Get-U03WindowBatch } catch { Stop-B4 'H1A_RECOVERY_VAULT_UNAVAILABLE' }
    if ($recoveryBatch.RunId -cne $recoveryRun -or $recoveryBatch.Sha -cne $recoverySha -or
        $recoveryBatch.ProjectId -cne 'prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook' -or
        $recoveryBatch.SupabaseRef -cne 'rhnnplewqsekrnaousyl' -or
        $recoveryBatch.Branch -cne 'codex/h1a-integral-20261022') { Stop-B4 'H1A_RECOVERY_VAULT_IDENTITY_MISMATCH' }
    Write-Output 'H1A_RECOVERY_TRANSPORT stage=DPAPI category=PRESENT_MATCH'
    $deliveryRows = @(Compare-H1ABatchValues -Expected $recoveryBatch.Values -ReadValue {
        param($name) [Environment]::GetEnvironmentVariable($name)
      })
    foreach ($row in $deliveryRows) {
      Write-Output "H1A_RECOVERY_TRANSPORT stage=$($row.Stage) name=$($row.Name) category=$($row.Category)"
    }
    if (-not (Test-H1ABatchDelivery $deliveryRows)) { Stop-B4 'H1A_RECOVERY_BRANCH_BATCH_MISMATCH' }
    foreach ($name in (Get-U03WindowVariableNames)) {
      Set-Item -LiteralPath "Env:$name" -Value ([string]$recoveryBatch.Values.$name)
    }
    $hydrated = @(Compare-H1ABatchValues -Expected $recoveryBatch.Values -ReadValue {
        param($name) [Environment]::GetEnvironmentVariable($name)
      } -Stage 'HYDRATED_ENV')
    if (@($hydrated | Where-Object Category -ne 'PRESENT_MATCH').Count -ne 0) { Stop-B4 'H1A_RECOVERY_HYDRATION_FAILED' }
    foreach ($row in $hydrated) {
      Write-Output "H1A_RECOVERY_TRANSPORT stage=$($row.Stage) name=$($row.Name) category=$($row.Category)"
    }
    $env:U03_PIN_DEPLOYMENT_ID = $recoveryDeployment
    $env:U03_PIN_DEPLOYMENT_HOST = $recoveryHost
    $env:U03_PIN_DEPLOYMENT_SHA = $recoverySha
    $env:U03_PIN_DEPLOYMENT_BRANCH = 'codex/h1a-integral-20261022'
    $recoveryBatch = $null
    $attestation = Invoke-U03WindowRoleChild -Mode 'attest' -RunId $recoveryRun -PasswordText '' -ChildPath $windowSequenceOperator -FunctionalShaOverride $recoverySha
    if ($attestation.SafeLine) { Write-Output $attestation.SafeLine }
    if (-not $attestation.Passed) { Stop-B4 'H1A_RECOVERY_DEPLOYMENT_ATTESTATION_FAILED' }
    foreach ($name in (Get-U03WindowVariableNames)) {
      Write-Output "H1A_RECOVERY_TRANSPORT stage=CHILD_ENV name=$name category=PRESENT_MATCH"
    }
    if ($H1ARecoveryTransportOnly) {
      Write-Output 'H1A_RECOVERY_TRANSPORT PASS metadata=8 dpapi=8 child=8 attestation=true passwordPrompt=false'
      return
    }
    try {
      $recoveryCredentials = Get-B4PreviewCredentials
      if ($recoveryCredentials.ProjectRef -cne 'rhnnplewqsekrnaousyl') { Stop-B4 'H1A_RECOVERY_PREVIEW_KEYS_REF_MISMATCH' }
      $recoveryKeys = @{ AdminKey=[string]$recoveryCredentials.AdminKey; PublicKey=[string]$recoveryCredentials.PublicKey }
      if ([string]::IsNullOrWhiteSpace($recoveryKeys.AdminKey) -or [string]::IsNullOrWhiteSpace($recoveryKeys.PublicKey)) {
        Stop-B4 'H1A_RECOVERY_PREVIEW_KEYS_UNAVAILABLE'
      }
      $secureDatabasePassword = Read-Host -Prompt 'Recuperación H1-A: Database password existente de Supabase Preview (entrada oculta)' -AsSecureString
      $passwordBstr = [IntPtr]::Zero
      try {
        $passwordBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureDatabasePassword)
        $windowRolePlainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordBstr)
        if ([string]::IsNullOrEmpty($windowRolePlainPassword)) { Stop-B4 'H1A_RECOVERY_PASSWORD_EMPTY' }
        $result = Invoke-U03WindowRoleChild -Mode 'h1a-recover' -RunId $recoveryRun -PasswordText $windowRolePlainPassword -ChildPath $h1aRecoveryOperator -PreviewKeys $recoveryKeys
        if ($result.SafeLine) { Write-Output $result.SafeLine }
        if (-not $result.Passed) { Stop-B4 'H1A_RECOVERY_DATABASE_OR_FINAL_READ_BLOCKED' }
      } finally {
        if ($passwordBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordBstr) }
        if ($secureDatabasePassword) { $secureDatabasePassword.Dispose(); $secureDatabasePassword=$null }
        $windowRolePlainPassword=$null
      }
      if (-not (Write-H1ARecoveryEvent -CaseId 'recovery-configuration-teardown' -Status 'ATTEMPTED')) { Stop-B4 'H1A_RECOVERY_LEDGER_UNAVAILABLE' }
      if (-not (Remove-U03WindowDeploymentConfiguration -DeploymentId $recoveryDeployment)) {
        [void](Write-H1ARecoveryEvent -CaseId 'recovery-configuration-teardown' -Status 'BLOCKED' -Code 'RECOVERY_TEARDOWN_UNVERIFIED')
        Stop-B4 'H1A_RECOVERY_BRANCH_VARIABLE_OR_DEPLOYMENT_TEARDOWN_BLOCKED'
      }
      $inspection = Invoke-U03WindowVercelCli -Arguments @('api',"/v13/deployments/$recoveryDeployment") -InputText ''
      if (-not $inspection.DeploymentNotFound) {
        [void](Write-H1ARecoveryEvent -CaseId 'recovery-configuration-teardown' -Status 'BLOCKED' -Code 'RECOVERY_TEARDOWN_UNVERIFIED')
        Stop-B4 'H1A_RECOVERY_DEPLOYMENT_ABSENCE_UNVERIFIED'
      }
      if (-not (Write-H1ARecoveryEvent -CaseId 'recovery-configuration-teardown' -Status 'PASS')) { Stop-B4 'H1A_RECOVERY_LEDGER_UNAVAILABLE' }
      if (-not (Write-H1ARecoveryEvent -CaseId 'recovery-vault-teardown' -Status 'ATTEMPTED')) { Stop-B4 'H1A_RECOVERY_LEDGER_UNAVAILABLE' }
      if (-not (Remove-U03WindowBatch)) {
        [void](Write-H1ARecoveryEvent -CaseId 'recovery-vault-teardown' -Status 'BLOCKED' -Code 'RECOVERY_VAULT_UNVERIFIED')
        Stop-B4 'H1A_RECOVERY_VAULT_REMOVE_FAILED'
      }
      try { $null = Get-U03WindowBatch; Stop-B4 'H1A_RECOVERY_VAULT_ABSENCE_UNVERIFIED' }
      catch {
        if ($_.Exception.Message -notlike 'U03_WINDOW_VAULT:VAULT_ABSENT') { throw }
      }
      if (-not (Write-H1ARecoveryEvent -CaseId 'recovery-vault-teardown' -Status 'PASS')) { Stop-B4 'H1A_RECOVERY_LEDGER_UNAVAILABLE' }
      Write-Output 'H1A_RECOVERY_TEARDOWN PASS branchVariablesAbsent=true deploymentAbsent=true vaultRemoved=true'
    } finally {
      if ($recoveryCredentials) { $recoveryCredentials.AdminKey=$null; $recoveryCredentials.PublicKey=$null }
      if ($recoveryKeys) { $recoveryKeys.AdminKey=$null; $recoveryKeys.PublicKey=$null }
      foreach ($name in (Get-U03WindowVariableNames)) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
      $recoveryCredentials=$null; $recoveryKeys=$null
    }
    return
  }
  if ($WindowRolePreflightOnly -or $WindowRoleReadOnlyDiagnosticOnly -or $WindowI2I5H1A -or $WindowH1A -or $WindowBatchAttestationOnly) {
    if (-not (Test-Path -LiteralPath $windowRoleOperator)) { Stop-B4 'WINDOW_ROLE_OPERATOR_MISSING' }
    if ($WindowI2I5H1A -or $WindowH1A -or $WindowBatchAttestationOnly) {
      $head = (& git -C $repo rev-parse HEAD 2>$null).Trim()
      if ($DeploymentId -cnotmatch '^dpl_[A-Za-z0-9]+$' -or
          $DeploymentHost -cnotmatch '^[a-z0-9][a-z0-9.-]+\.vercel\.app$' -or
          $DeploymentSha -cne $head -or $DeploymentSha -cnotmatch '^[0-9a-f]{40}$') { Stop-B4 'WINDOW_ROLE_DEPLOYMENT_PIN_REJECTED' }
      try { $windowBatch = Get-U03WindowBatch } catch {
        $vaultCode = [regex]::Match($_.Exception.Message,'U03_WINDOW_VAULT:([A-Z0-9_]+)').Groups[1].Value
        if ($vaultCode -in @('VAULT_ABSENT','IDENTITY_MISMATCH','BATCH_INCOMPLETE','BATCH_FORMAT_INVALID','VAULT_CORRUPT','VAULT_UNPROTECT_FAILED')) { Stop-B4 "WINDOW_BATCH_$vaultCode" }
        Stop-B4 'WINDOW_BATCH_STORE_UNAVAILABLE'
      }
      if ($windowBatch.ProjectId -cne 'prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook' -or $windowBatch.SupabaseRef -cne 'rhnnplewqsekrnaousyl' -or
          $windowBatch.Branch -cne $branch -or $windowBatch.Sha -cne $DeploymentSha -or $windowBatch.RunId -cnotmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') { Stop-B4 'WINDOW_BATCH_IDENTITY_MISMATCH' }
      foreach ($name in (Get-U03WindowVariableNames)) { Set-Item -LiteralPath "Env:$name" -Value ([string]$windowBatch.Values.$name) }
      $env:U03_FUNCTIONAL_SHA = $head
      $env:U03_PIN_DEPLOYMENT_BRANCH = $windowExpectedBranch
    } elseif ($DeploymentId -cne 'dpl_FX2BbLxBZPg38hYqikhhsEprGdPL' -or
        $DeploymentHost -cne 'plataforma-rubik-seo-9lkzlkvr1-juanma-espinosas-projects.vercel.app' -or
        $DeploymentSha -cne '85f93a5b7f7b9db26a2ade4f75fdf3d12aaf18d4') { Stop-B4 'WINDOW_ROLE_DEPLOYMENT_PIN_REJECTED' }
    $env:U03_PIN_DEPLOYMENT_ID = $DeploymentId
    $env:U03_PIN_DEPLOYMENT_HOST = $DeploymentHost
    $env:U03_PIN_DEPLOYMENT_SHA = $DeploymentSha
    $env:U03_PIN_DEPLOYMENT_BRANCH = $windowExpectedBranch
    & node $runner --readonly-preflight
    if ($LASTEXITCODE -ne 0) { Stop-B4 'WINDOW_ROLE_PROTECTED_DEPLOYMENT_PREFLIGHT_FAILED' }
  if ($WindowRolePreflightOnly -or $WindowI2I5H1A -or $WindowH1A -or $WindowBatchAttestationOnly) {
      try { $previewCredentials = Get-B4PreviewCredentials }
      catch { Stop-B4 'WINDOW_ROLE_PREVIEW_CREDENTIALS_UNAVAILABLE' }
      if ($previewCredentials.ProjectRef -cne 'rhnnplewqsekrnaousyl') { Stop-B4 'PREVIEW_CREDENTIAL_REF_MISMATCH' }
      $env:U03_PREVIEW_ADMIN_KEY = $previewCredentials.AdminKey
      $env:U03_PREVIEW_PUBLIC_KEY = $previewCredentials.PublicKey
      & node $runner --credential-preflight-only
      $credentialPreflightExit = $LASTEXITCODE
      Remove-Item Env:U03_PREVIEW_ADMIN_KEY -ErrorAction SilentlyContinue
      Remove-Item Env:U03_PREVIEW_PUBLIC_KEY -ErrorAction SilentlyContinue
      $previewCredentials.AdminKey = $null
      $previewCredentials.PublicKey = $null
      $previewCredentials = $null
      if ($credentialPreflightExit -ne 0) { Stop-B4 'WINDOW_ROLE_CREDENTIAL_PREFLIGHT_FAILED' }
    }

    if ($WindowI2I5H1A -or $WindowH1A -or $WindowBatchAttestationOnly) {
      if (-not (Test-Path -LiteralPath $windowSequenceOperator)) { Stop-B4 'WINDOW_SEQUENCE_OPERATOR_MISSING' }
      $localConfiguration = Invoke-U03WindowRoleChild -Mode 'local' -RunId $windowBatch.RunId -PasswordText '' -ChildPath $windowSequenceOperator
      if ($localConfiguration.SafeLine) { Write-Output $localConfiguration.SafeLine }
      if (-not $localConfiguration.Passed) { Stop-B4 'WINDOW_SEQUENCE_LOCAL_CONFIGURATION_REJECTED' }
      $windowRoleRunId = $windowBatch.RunId
      $attestResult = Invoke-U03WindowRoleChild -Mode 'attest' -RunId $windowRoleRunId -PasswordText '' -ChildPath $windowSequenceOperator
      if ($attestResult.SafeLine) { Write-Output $attestResult.SafeLine }
      if (-not $attestResult.Passed) {
        if ($attestResult.Code -match '^(?:WINDOW|SAFE_CHILD)_[A-Z0-9_]+$') { Stop-B4 $attestResult.Code }
        Stop-B4 'WINDOW_BATCH_CHILD_TRANSPORT_FAILED'
      }
      $windowBatchAttested = $true
      try {
        $sequencePreviewCredentials = Get-B4PreviewCredentials
        if ($sequencePreviewCredentials.ProjectRef -cne 'rhnnplewqsekrnaousyl') { Stop-B4 'PREVIEW_CREDENTIAL_REF_MISMATCH' }
        $sequencePreviewKeys = @{ AdminKey=[string]$sequencePreviewCredentials.AdminKey; PublicKey=[string]$sequencePreviewCredentials.PublicKey }
        if ([string]::IsNullOrWhiteSpace($sequencePreviewKeys.AdminKey) -or [string]::IsNullOrWhiteSpace($sequencePreviewKeys.PublicKey)) { Stop-B4 'PREVIEW_KEYS_REQUIRED' }
        $keyPreflight = Invoke-U03WindowRoleChild -Mode 'keys' -RunId $windowRoleRunId -PasswordText '' -ChildPath $windowSequenceOperator -PreviewKeys $sequencePreviewKeys
        if ($keyPreflight.SafeLine) { Write-Output $keyPreflight.SafeLine }
        if (-not $keyPreflight.Passed) { Stop-B4 $keyPreflight.Code }
      } catch {
        if ($_.Exception.Message -like 'U03 B-4 BLOCKED:*') { throw }
        Stop-B4 'WINDOW_SEQUENCE_PREVIEW_KEYS_CHILD_PREFLIGHT_FAILED'
      } finally {
        if ($sequencePreviewCredentials) { $sequencePreviewCredentials.AdminKey=$null; $sequencePreviewCredentials.PublicKey=$null }
        $sequencePreviewCredentials=$null
      }
      if ($WindowBatchAttestationOnly) {
        return
      }
    }

    $secureDatabasePassword = Read-Host -Prompt 'Database password existente de Supabase Preview rhnnplewqsekrnaousyl (entrada oculta)' -AsSecureString
    $passwordBstr = [IntPtr]::Zero
    try {
      $passwordBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureDatabasePassword)
      $windowRolePlainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordBstr)
      if ([string]::IsNullOrEmpty($windowRolePlainPassword)) { Stop-B4 'WINDOW_ROLE_DATABASE_PASSWORD_EMPTY' }
      if (-not ($WindowI2I5H1A -or $WindowH1A)) { $windowRoleRunId = [guid]::NewGuid().ToString() }
      Write-Output "U03_WINDOW_ROLE_RUN_ID: $windowRoleRunId"
      $childMode = if ($WindowI2I5H1A -or $WindowH1A) { 'sequence' } elseif ($WindowRoleReadOnlyDiagnosticOnly) { 'diagnose' } else { 'run' }
      $childPath = if ($WindowI2I5H1A -or $WindowH1A) { $windowSequenceOperator } else { $windowRoleOperator }
      $runResult = if ($childMode -eq 'sequence') {
        $campaignMode = if ($WindowH1A) { 'window-h1a' } else { 'window-i2-i5' }
        Invoke-U03WindowRoleChild -Mode $childMode -RunId $windowRoleRunId -PasswordText $windowRolePlainPassword -ChildPath $childPath -PreviewKeys $sequencePreviewKeys -CampaignMode $campaignMode
      } else {
        Invoke-U03WindowRoleChild -Mode $childMode -RunId $windowRoleRunId -PasswordText $windowRolePlainPassword -ChildPath $childPath
      }
      if ($runResult.SafeLine) { Write-Output $runResult.SafeLine }
      if (-not $runResult.Passed) {
        if ($WindowRoleReadOnlyDiagnosticOnly) { Stop-B4 'WINDOW_ROLE_READONLY_DIAGNOSTIC_BLOCKED_NO_WRITES' }
        Stop-B4 'WINDOW_ROLE_PREFLIGHT_BLOCKED_NO_FIXTURES'
      }
      if ($WindowI2I5H1A -or $WindowH1A) { $windowSequencePassed = $true }
    } finally {
      if ($passwordBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordBstr) }
      if ($secureDatabasePassword) { $secureDatabasePassword.Dispose(); $secureDatabasePassword = $null }
    }
  }
  if (-not $WindowRolePreflightOnly -and -not $WindowRoleReadOnlyDiagnosticOnly -and -not $WindowI2I5H1A -and -not $WindowH1A -and -not $WindowBatchAttestationOnly -and -not $WindowRoleTransportSelfTestOnly) {
  # Deployment protection and database identity/counts/migrations do not need
  # Auth keys. Fail here before loading credentials if any read-only gate is not exact.
  & node $runner --readonly-preflight
  if ($LASTEXITCODE -ne 0) { Stop-B4 'READ_ONLY_PREFLIGHT_FAILED' }
  if ($ReadOnlyPreflightOnly) { return }

  if ($V4ConnectionDiagnosticOnly) {
    if (-not (Test-Path -LiteralPath $v4Operator)) { Stop-B4 'V4_OPERATOR_MISSING' }
    $secureDatabasePassword = Read-Host -Prompt 'Database password de Supabase Preview rhnnplewqsekrnaousyl (entrada oculta)' -AsSecureString
    try {
      $connectionsPass = Invoke-U03PreviewAdminConnectionComparison -SecurePassword $secureDatabasePassword
      if (-not $connectionsPass) { Stop-B4 'V4_CONNECTION_DIAGNOSTIC_FAILED' }
    } finally { $secureDatabasePassword.Dispose(); $secureDatabasePassword = $null }
    return
  }

  if ($ProvisionPreviewKeys -or $ReplacePreviewKeys) {
    if ($ProvisionPreviewKeys -and (Test-Path -LiteralPath (Get-B4PreviewCredentialPath))) { Stop-B4 'CREDENTIALS_ALREADY_PRESENT_USE_REPLACE' }
    $clipboardSessionActive = $true
    $adminKey = Read-B4ClipboardSecret `
      -Prompt 'Paso 1/2: copia del Dashboard Preview rhnnplewqsekrnaousyl la clave Admin/Auth y escribe solo LISTO.' `
      -ExpectedPrefix 'sb_secret_'
    $publicKey = Read-B4ClipboardSecret `
      -Prompt 'Paso 2/2: copia del mismo Preview la clave publishable y escribe solo LISTO.' `
      -ExpectedPrefix 'sb_publishable_'
    $env:U03_PREVIEW_ADMIN_KEY = $adminKey
    $env:U03_PREVIEW_PUBLIC_KEY = $publicKey
    & node $runner --credential-preflight-only
    if ($LASTEXITCODE -ne 0) { Stop-B4 'CREDENTIAL_PREFLIGHT_FAILED' }
    Save-B4PreviewCredentials -AdminKey $adminKey -PublicKey $publicKey -Replace:$ReplacePreviewKeys
    if ($ReplacePreviewKeys) { Write-Output 'PREVIEW_CREDENTIALS_REPLACED' }
    else { Write-Output 'PREVIEW_CREDENTIALS_PROVISIONED' }
    return
  }

  # Each run binds the encrypted record to this Windows SID and Preview ref,
  # validates formats, then the Node preflight verifies the credentials against
  # the actual pinned project before any fixture can be created.
  try { $previewCredentials = Get-B4PreviewCredentials }
  catch { Stop-B4 'PREVIEW_CREDENTIALS_UNAVAILABLE' }
  if ($previewCredentials.ProjectRef -cne 'rhnnplewqsekrnaousyl') { Stop-B4 'PREVIEW_CREDENTIAL_REF_MISMATCH' }
  $env:U03_PREVIEW_ADMIN_KEY = $previewCredentials.AdminKey
  $env:U03_PREVIEW_PUBLIC_KEY = $previewCredentials.PublicKey
  if ([string]::IsNullOrWhiteSpace($env:U03_PREVIEW_ADMIN_KEY) -or [string]::IsNullOrWhiteSpace($env:U03_PREVIEW_PUBLIC_KEY)) { Stop-B4 'PREVIEW_KEYS_REQUIRED' }

  if ($MembershipRevocationOnly) {
    if (-not (Test-Path -LiteralPath $v4Operator)) { Stop-B4 'V4_OPERATOR_MISSING' }
    # Ask only for the existing Preview database password. The endpoint is fixed
    # here and revalidated by both this helper and the Node operator.
    $secureDatabasePassword = Read-Host -Prompt 'Database password de Supabase Preview rhnnplewqsekrnaousyl (entrada oculta)' -AsSecureString
    try {
      $connectionsPass = Invoke-U03PreviewAdminConnectionComparison -SecurePassword $secureDatabasePassword
      if (-not $connectionsPass) { Stop-B4 'V4_CONNECTION_DIAGNOSTIC_FAILED_NO_FIXTURES' }
    } finally { $secureDatabasePassword.Dispose(); $secureDatabasePassword = $null }
    $operatorRunId = [guid]::NewGuid().ToString()
    & node $v4Operator --run --run-id $operatorRunId
    if ($LASTEXITCODE -ne 0) { Stop-B4 'V4_OPERATOR_CAMPAIGN_OR_CLEANUP_FAILED' }
  }
  elseif ($RolesInvitationsOnly) { & node $runner --roles-invitations-only }
  elseif ($CrossSurfaceOnly) { & node $runner --cross-surface-only }
  elseif ($SessionProvidersOnly) { & node $runner --session-providers-only }
  elseif ($ProviderEgressOnly) {
    Write-Output "P1_RUN_ID: $RunId"
    & node $runner --provider-egress-only --run-id $RunId
  }
  elseif ($PlaywrightOnly) { & node $runner --playwright-only }
  else { & node $runner }
  if ($LASTEXITCODE -ne 0) { Stop-B4 'U03_B4_CAMPAIGN_FAILED_OR_CLEANUP_UNVERIFIED' }
  }
  }
} finally {
  if (($WindowRolePreflightOnly -or $WindowRoleTransportSelfTestOnly -or $WindowI2I5H1A -or $WindowH1A) -and $windowRoleRunId -and -not [string]::IsNullOrEmpty($windowRolePlainPassword)) {
    try {
      $containPath = if ($windowRoleChildOverride) { $windowRoleChildOverride } else { $windowRoleOperator }
      $containResult = Invoke-U03WindowRoleChild -Mode 'contain' -RunId $windowRoleRunId -PasswordText $windowRolePlainPassword -ChildPath $containPath
      if ($containResult.SafeLine) { Write-Output $containResult.SafeLine }
      if (-not $containResult.Passed) { $windowRoleContainFailed = $true }
    } catch {
      $windowRoleContainFailed = $true
    }
    if ($windowRoleContainFailed) {
      if ($WindowI2I5H1A) { [void](Write-U03WindowGlobalResult -RunId $windowRoleRunId -Status 'BLOCKED') }
      if ($WindowH1A) { [void](Write-U03WindowGlobalResult -RunId $windowRoleRunId -Status 'BLOCKED' -CaseId 'h1a-global-result') }
      Write-Warning 'U03_WINDOW_ROLE_CONTAINMENT BLOCKED; keep the sanitized ledger and do not create fixtures.'
    } elseif (($WindowI2I5H1A -or $WindowH1A) -and $windowBatchAttested) {
      if ($containResult.SafeLine -notmatch '^U03_WINDOW_ROLE_CONTAINMENT PASS .*rolePresent=(?:false|False) roleLocked=(?:null|true|True) policies=0 activeSessions=0 inventoryZero=(?:true|True) outboxTotal=0 pending=0$') {
        [void](Write-U03WindowGlobalResult -RunId $windowRoleRunId -Status 'BLOCKED')
        Write-Warning 'U03_WINDOW_TEARDOWN BLOCKED; temporary deployment variables retained because final Preview state was not clean.'
      } elseif ((Remove-U03WindowDeploymentConfiguration -DeploymentId $DeploymentId) -and (Remove-U03WindowBatch)) {
        if ($windowSequencePassed) {
          if ($WindowH1A) {
            if (-not (Write-U03WindowGlobalResult -RunId $windowRoleRunId -Status 'PASS' -CaseId 'h1a-global-result')) { $windowRoleContainFailed = $true }
          } elseif (-not (Write-U03WindowGlobalResult -RunId $windowRoleRunId -Status 'PASS')) { $windowRoleContainFailed = $true }
        } else {
          if ($WindowH1A) { [void](Write-U03WindowGlobalResult -RunId $windowRoleRunId -Status 'BLOCKED' -CaseId 'h1a-global-result') }
          else { [void](Write-U03WindowGlobalResult -RunId $windowRoleRunId -Status 'BLOCKED') }
        }
        Write-Output 'U03_WINDOW_TEARDOWN PASS branchVariablesRemoved=true deploymentRemoved=true'
      } else {
        [void](Write-U03WindowGlobalResult -RunId $windowRoleRunId -Status 'BLOCKED')
        Write-Warning 'U03_WINDOW_TEARDOWN BLOCKED; inspect the exact run ledger and Vercel variable inventory.'
      }
    } elseif ($WindowRoleTransportSelfTestOnly -and $windowRoleTransportSelfTestPassed) {
      Write-Output 'U03_WINDOW_ROLE_TRANSPORT_SELFTEST PASS utf8NonAscii=true childKeysPresent=true missingKeysRegression=true simulatedChildFailure=true diagnosticOutputSanitized=true finallyContainment=true preparationFailureSafe=true vercelStderrCaptured=true cleanupIdempotent=true partialRotationRecovery=true'
    }
  }
  if ($MembershipRevocationOnly) {
    $installAttempted = $false
    $ledgerPath = if ($operatorRunId) { Join-Path $repo "test-results\u03-hosted\$operatorRunId.jsonl" } else { $null }
    if ($ledgerPath -and (Test-Path -LiteralPath $ledgerPath)) {
      try {
        foreach ($entry in Get-Content -LiteralPath $ledgerPath) {
          $record = $entry | ConvertFrom-Json
          if ($record.caseId -eq 'receipt-role-install' -and $record.status -in @('ATTEMPTED','PASS')) { $installAttempted = $true }
        }
      } catch { }
    }
    if ($installAttempted -and $operatorRunId -and -not [string]::IsNullOrWhiteSpace($env:U03_PREVIEW_ADMIN_DATABASE_URL)) {
      & node $v4Operator --contain --run-id $operatorRunId
      if ($LASTEXITCODE -ne 0) {
        $operatorContainFailed = $true
        Write-Warning 'V4_OPERATOR_CONTAINMENT_BLOCKED: preserve the run ledger and IDs; do not remove pending receipts or fixtures manually.'
      }
    }
  }
  if ($pushed) { Pop-Location }
  Get-ChildItem Env: | Where-Object { $_.Name -like 'U03_*' -or $_.Name -eq 'VERCEL_OIDC_TOKEN' } | ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" -ErrorAction SilentlyContinue }
  if ($clipboardSessionActive) { Clear-B4Clipboard }
  $adminKey = $null
  $publicKey = $null
  $adminDatabaseUrl = $null
  $windowRolePlainPassword = $null
  if ($sequencePreviewKeys) { $sequencePreviewKeys.AdminKey=$null; $sequencePreviewKeys.PublicKey=$null }
  $sequencePreviewKeys = $null
  if ($sequencePreviewCredentials) { $sequencePreviewCredentials.AdminKey=$null; $sequencePreviewCredentials.PublicKey=$null }
  $sequencePreviewCredentials = $null
  $secureDatabasePassword = $null
  if ($previewCredentials) { $previewCredentials.AdminKey = $null; $previewCredentials.PublicKey = $null }
  $previewCredentials = $null
  Remove-Variable -Name previewCredentials, sequencePreviewCredentials, sequencePreviewKeys, clipboardSessionActive, adminKey, publicKey, clipboardValue, confirmation, secureDatabasePassword, adminDatabaseUrl -ErrorAction SilentlyContinue
}
if ($operatorContainFailed) { Stop-B4 'V4_OPERATOR_CONTAINMENT_FAILED_PRESERVE_LEDGER' }
if ($windowRoleContainFailed) { Stop-B4 'WINDOW_ROLE_CONTAINMENT_FAILED_PRESERVE_LEDGER' }
