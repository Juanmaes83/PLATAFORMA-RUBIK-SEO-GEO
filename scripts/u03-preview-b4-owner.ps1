param(
  [switch]$ReadOnlyPreflightOnly,
  [switch]$V4ConnectionDiagnosticOnly,
  [switch]$PlaywrightOnly,
  [switch]$RolesInvitationsOnly,
  [switch]$CrossSurfaceOnly,
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
$v4PoolerModule = Join-Path $PSScriptRoot 'u03-preview-v4-pooler.psm1'
$linkFile = Join-Path $repo '.vercel\project.json'
$clipboardModule = Join-Path $PSScriptRoot 'u03-preview-b4-clipboard.psm1'
Import-Module -Name $clipboardModule -Force -ErrorAction Stop
Import-Module -Name $v4PoolerModule -Force -ErrorAction Stop

function Stop-B4([string]$Code) { throw "U03 B-4 BLOCKED: $Code. No fixtures will be created unless every preflight passes." }

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
$campaignModes = @($ReadOnlyPreflightOnly.IsPresent, $V4ConnectionDiagnosticOnly.IsPresent,
  $PlaywrightOnly.IsPresent, $MembershipRevocationOnly.IsPresent, $RolesInvitationsOnly.IsPresent,
  $CrossSurfaceOnly.IsPresent) | Where-Object { $_ }
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
    'codex/u03-cross-surface-20261019') -or
    $remote -ne 'https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO.git') { Stop-B4 'WRONG_REPOSITORY_OR_BRANCH' }
$link = Get-Content -LiteralPath $linkFile -Raw | ConvertFrom-Json
if ($link.projectId -ne 'prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook' -or $link.orgId -ne 'team_hLhdb3M9MviTIysXD9whFF2c') { Stop-B4 'VERCEL_LINK_MISMATCH' }
if ([string]::IsNullOrWhiteSpace($env:VERCEL_OIDC_TOKEN)) { Stop-B4 'VERCEL_ENV_RUN_DID_NOT_PROVIDE_OIDC_TOKEN' }

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

$pushed = $false
$previewCredentials = $null
$adminKey = $null
$publicKey = $null
$clipboardSessionActive = $false
$operatorRunId = $null
$operatorContainFailed = $false
$secureDatabasePassword = $null
$adminDatabaseUrl = $null
try {
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
  $keep = @('PATH','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','ProgramFiles','HOMEDRIVE','HOMEPATH','COMSPEC','PATHEXT','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS','OS','VERCEL_OIDC_TOKEN','U03_VERCEL_CLI','U03_SUPABASE_CLI','NODE_USE_ENV_PROXY','NODE_USE_SYSTEM_CA','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR') + $proxyNames
  Get-ChildItem Env: | Where-Object { $_.Name -notin $keep } | ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" -ErrorAction SilentlyContinue }

  Push-Location -LiteralPath $repo
  $pushed = $true
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
  elseif ($PlaywrightOnly) { & node $runner --playwright-only }
  else { & node $runner }
  if ($LASTEXITCODE -ne 0) { Stop-B4 'U03_B4_CAMPAIGN_FAILED_OR_CLEANUP_UNVERIFIED' }
} finally {
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
  $secureDatabasePassword = $null
  if ($previewCredentials) { $previewCredentials.AdminKey = $null; $previewCredentials.PublicKey = $null }
  $previewCredentials = $null
  Remove-Variable -Name previewCredentials, clipboardSessionActive, adminKey, publicKey, clipboardValue, confirmation, secureDatabasePassword, adminDatabaseUrl -ErrorAction SilentlyContinue
}
if ($operatorContainFailed) { Stop-B4 'V4_OPERATOR_CONTAINMENT_FAILED_PRESERVE_LEDGER' }
