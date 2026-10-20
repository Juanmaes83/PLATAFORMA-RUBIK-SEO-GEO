param([switch]$ForeignIssuerOnly)

$ErrorActionPreference = 'Stop'
$repo = (Get-Location).Path
$runner = Join-Path $repo 'scripts\u03-preview-s5-foreign-issuer.mjs'
$orchestrator = Join-Path $repo 'scripts\u03-preview-b4-orchestrator.mjs'
$credentialModule = Join-Path $PSScriptRoot 'u03-preview-b4-clipboard.psm1'
$linkFile = Join-Path $repo '.vercel\project.json'
$expectedRemote = 'https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO.git'
$expectedBranch = 'codex/u03-final-gates-20261020'
$issuerRoot = $null
$issuerProject = $null
$issuerStarted = $false
$cleanupBlocked = $false
$credentials = $null
$localStatus = $null
$statusOutput = $null
$startOutput = $null
$campaignRunId = $null
$currentStage = 'operator_preflight'

function Stop-S5([string]$Code) { throw "U03 S-5 BLOCKED: $Code" }
function Clear-S5Environment {
  foreach ($name in @('U03_PREVIEW_PUBLIC_KEY','U03_FOREIGN_ISSUER_URL','U03_FOREIGN_ISSUER_ANON_KEY','U03_FOREIGN_ISSUER_SERVICE_KEY','U03_FOREIGN_ISSUER_STATUS','U03_VERCEL_CLI','U03_SUPABASE_CLI','VERCEL_OIDC_TOKEN')) {
    Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
  }
}
function Add-S5Ledger([string]$Status, [string]$CaseId = 's5-foreign-issuer-stack-cleanup', [string]$Code = '') {
  if (-not $campaignRunId) { return }
  $ledgerPath = Join-Path $repo "test-results\u03-hosted\$campaignRunId.jsonl"
  $null = New-Item -ItemType Directory -Path (Split-Path -Parent $ledgerPath) -Force
  $row = [ordered]@{ utc=[DateTime]::UtcNow.ToString('o'); runId=$campaignRunId; deploymentId='dpl_Hmpevn3Vds4pFUzbiiFFB3vVGCKD'; sha='28fd3927f9acce8ba9b27b43d3afb86b12aa0a86'; ref='rhnnplewqsekrnaousyl'; caseId=$CaseId; status=$Status; stage=$currentStage; issuerProject=$issuerProject }
  if ($Code) { $row.code = $Code }
  Add-Content -LiteralPath $ledgerPath -Value ($row | ConvertTo-Json -Compress) -Encoding UTF8
}

try {
  if (-not $ForeignIssuerOnly) { Stop-S5 'EXPLICIT_MODE_REQUIRED' }
  if (-not (Test-Path -LiteralPath $runner) -or -not (Test-Path -LiteralPath $orchestrator)) { Stop-S5 'RUNNER_MISSING' }
  if (-not (Test-Path -LiteralPath $linkFile)) { Stop-S5 'VERCEL_PROJECT_NOT_LINKED' }
  $branch = (& git -C $repo branch --show-current 2>$null).Trim()
  $remote = (& git -C $repo remote get-url origin 2>$null).Trim()
  if ($branch -cne $expectedBranch -or $remote -cne $expectedRemote) { Stop-S5 'WRONG_REPOSITORY_OR_BRANCH' }
  $link = Get-Content -LiteralPath $linkFile -Raw | ConvertFrom-Json
  if ($link.projectId -cne 'prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook' -or $link.orgId -cne 'team_hLhdb3M9MviTIysXD9whFF2c') { Stop-S5 'VERCEL_LINK_MISMATCH' }
  if ([string]::IsNullOrWhiteSpace($env:VERCEL_OIDC_TOKEN)) { Stop-S5 'VERCEL_OIDC_TOKEN_MISSING' }

  $npx = Get-Command npx.cmd -ErrorAction SilentlyContinue
  if (-not $npx) { Stop-S5 'SUPABASE_CLI_NOT_FOUND' }
  $vercel = Get-Command vercel.cmd -ErrorAction SilentlyContinue
  if (-not $vercel) { Stop-S5 'VERCEL_CLI_NOT_FOUND' }
  $env:U03_SUPABASE_CLI = $npx.Source
  $env:U03_VERCEL_CLI = $vercel.Source

  # Keep only the protected-deployment transport, OS runtime, proxy and required CLIs in Node children.
  $proxyNames = @('HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy')
  $keep = @('PATH','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','ProgramFiles','HOMEDRIVE','HOMEPATH','COMSPEC','PATHEXT','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS','OS','VERCEL_OIDC_TOKEN','U03_SUPABASE_CLI','U03_VERCEL_CLI','NODE_USE_ENV_PROXY','NODE_USE_SYSTEM_CA','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR') + $proxyNames
  Get-ChildItem Env: | Where-Object { $_.Name -notin $keep } | ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" -ErrorAction SilentlyContinue }

  Import-Module -Name $credentialModule -Force -ErrorAction Stop
  try { $credentials = Get-B4PreviewCredentials } catch { Stop-S5 'PREVIEW_PUBLIC_CREDENTIAL_UNAVAILABLE' }
  if ($credentials.ProjectRef -cne 'rhnnplewqsekrnaousyl' -or [string]::IsNullOrWhiteSpace($credentials.PublicKey)) { Stop-S5 'PREVIEW_CREDENTIAL_REF_MISMATCH' }
  $env:U03_PREVIEW_PUBLIC_KEY = $credentials.PublicKey
  $currentStage = 'preview_identity_preflight'
  & node $runner --preflight-only
  if ($LASTEXITCODE -ne 0) { Stop-S5 'PREVIEW_IDENTITY_PREFLIGHT_FAILED' }

  $runId = [guid]::NewGuid().ToString('D')
  $campaignRunId = $runId
  $issuerName = 'rubik-u03-foreign-issuer-' + $runId.Replace('-', '')
  $issuerRoot = Join-Path $env:TEMP $issuerName
  $issuerProject = $issuerName
  if (Test-Path -LiteralPath $issuerRoot) { Stop-S5 'TEMP_PROJECT_COLLISION' }
  $null = New-Item -ItemType Directory -Path $issuerRoot
  $currentStage = 'local_issuer_init'
  $initOutput = & $env:U03_SUPABASE_CLI --yes supabase@2.118.0 init --workdir $issuerRoot --force 2>&1
  if ($LASTEXITCODE -ne 0) { Stop-S5 'LOCAL_ISSUER_INIT_FAILED' }

  $configPath = Join-Path $issuerRoot 'supabase\config.toml'
  $config = [IO.File]::ReadAllText($configPath)
  $config = $config.Replace('port = 54321', 'port = 55421').Replace('port = 54322', 'port = 55422')
  $config = $config.Replace('shadow_port = 54320', 'shadow_port = 55420').Replace('port = 54323', 'port = 55423')
  $config = $config.Replace('port = 54324', 'port = 55424').Replace('port = 54329', 'port = 55429')
  $config = $config.Replace('port = 54327', 'port = 55427').Replace('enabled = true`r`n# Set enabled = false to fall back to the legacy migra engine.', 'enabled = false`r`n# Set enabled = false to fall back to the legacy migra engine.')
  $config = $config.Replace('sql_paths = ["./seed.sql"]', 'sql_paths = []')
  [IO.File]::WriteAllText($configPath, $config, [Text.UTF8Encoding]::new($false))

  # Capture all CLI output; local service keys are never echoed or stored in the repo.
  $currentStage = 'local_issuer_start'
  $issuerStarted = $true
  $startOutput = & $env:U03_SUPABASE_CLI --yes supabase@2.118.0 start --workdir $issuerRoot --exclude realtime,storage-api,imgproxy,studio,edge-runtime,logflare,vector,supavisor 2>&1
  if ($LASTEXITCODE -ne 0) { Stop-S5 'LOCAL_ISSUER_START_FAILED' }
  $currentStage = 'local_issuer_status'
  $statusOutput = & $env:U03_SUPABASE_CLI --yes supabase@2.118.0 status --workdir $issuerRoot --output env 2>$null
  if ($LASTEXITCODE -ne 0) { Stop-S5 'LOCAL_ISSUER_STATUS_FAILED' }
  $statusText = $statusOutput -join "`n"
  $localStatus = $null
  try { $localStatus = $statusText | ConvertFrom-Json } catch { }
  if (-not $localStatus) {
    $kv = @{}
    foreach ($line in $statusOutput) { if ($line -match '^([A-Z_]+)=(.*)$') { $kv[$Matches[1]] = $Matches[2].Trim('"', "'") } }
    $localStatus = [pscustomobject]@{ API_URL=$kv.API_URL; ANON_KEY=$kv.ANON_KEY; SERVICE_ROLE_KEY=$kv.SERVICE_ROLE_KEY }
  }
  if ($localStatus.API_URL -cne 'http://127.0.0.1:55421' -or -not $localStatus.ANON_KEY -or -not $localStatus.SERVICE_ROLE_KEY) { Stop-S5 'LOCAL_ISSUER_STATUS_INVALID' }

  $env:U03_FOREIGN_ISSUER_URL = $localStatus.API_URL
  $env:U03_FOREIGN_ISSUER_ANON_KEY = $localStatus.ANON_KEY
  $env:U03_FOREIGN_ISSUER_SERVICE_KEY = $localStatus.SERVICE_ROLE_KEY
  $currentStage = 'foreign_issuer_campaign'
  $runnerOutput = @(& node $runner --run-id $runId 2>&1)
  $runnerExit = $LASTEXITCODE
  if ($runnerExit -ne 0) {
    $safeCode = 'S5_SAFE_FAILURE'
    foreach ($line in $runnerOutput) {
      if ([string]$line -match 'S5_FOREIGN_ISSUER: BLOCKED code=([A-Z0-9_]+)') { $safeCode = $Matches[1]; break }
    }
    Stop-S5 $safeCode
  }
  Write-Output "S5_FOREIGN_ISSUER: PASS label=emisor-ajeno-aislado runId=$runId"
} catch {
  $safeFailureCode = switch ($currentStage) {
    'local_issuer_init' { 'LOCAL_ISSUER_INIT_PROCESS_FAILED'; break }
    'local_issuer_start' { 'LOCAL_ISSUER_START_PROCESS_FAILED'; break }
    'local_issuer_status' { 'LOCAL_ISSUER_STATUS_PROCESS_FAILED'; break }
    'foreign_issuer_campaign' { 'S5_RUNNER_PROCESS_FAILED'; break }
    'preview_identity_preflight' { 'S5_PREVIEW_PREFLIGHT_PROCESS_FAILED'; break }
    default { 'S5_SAFE_FAILURE' }
  }
  if ($_.Exception.Message -match 'U03 S-5 BLOCKED: ([A-Z0-9_]+)') { $safeFailureCode = $Matches[1] }
  Add-S5Ledger 'BLOCKED' 's5-diagnostic' $safeFailureCode
  Write-Output "S5_FOREIGN_ISSUER: BLOCKED code=$safeFailureCode stage=$currentStage; review the sanitized run ledger and local stack status."
  throw 'S5_OPERATOR_SAFE_FAILURE'
} finally {
  if ($issuerStarted -and $issuerRoot) {
    $stopOutput = & $env:U03_SUPABASE_CLI --yes supabase@2.118.0 stop --no-backup --workdir $issuerRoot 2>&1
    if ($LASTEXITCODE -ne 0) {
      $cleanupBlocked = $true
      Add-S5Ledger 'BLOCKED'
      Write-Warning 'S5_LOCAL_ISSUER_CLEANUP_BLOCKED: temporary stack and ledger retained for recovery.'
    } else {
      $remaining = @(docker ps -a --format '{{.Names}}' | Where-Object { $_ -like "*${issuerProject}" })
      $resolvedRoot = [IO.Path]::GetFullPath($issuerRoot)
      $resolvedTemp = [IO.Path]::GetFullPath($env:TEMP)
      if ($remaining.Count -eq 0 -and [IO.Path]::GetDirectoryName($resolvedRoot) -eq $resolvedTemp -and [IO.Path]::GetFileName($resolvedRoot) -ceq $issuerProject) {
        Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
        Add-S5Ledger 'PASS'
        Write-Output 'S5_LOCAL_ISSUER_CLEANUP: PASS'
      } else { $cleanupBlocked = $true; Add-S5Ledger 'BLOCKED'; Write-Warning 'S5_LOCAL_ISSUER_CLEANUP_BLOCKED: temporary root retained for reconciliation.' }
    }
  } elseif ($issuerRoot -and (Test-Path -LiteralPath $issuerRoot)) {
    $resolvedRoot = [IO.Path]::GetFullPath($issuerRoot)
    $resolvedTemp = [IO.Path]::GetFullPath($env:TEMP)
    if ([IO.Path]::GetDirectoryName($resolvedRoot) -eq $resolvedTemp -and [IO.Path]::GetFileName($resolvedRoot) -ceq $issuerProject) {
      Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
      Add-S5Ledger 'PASS'
      Write-Output 'S5_LOCAL_ISSUER_CLEANUP: PASS'
    } else { $cleanupBlocked = $true; Add-S5Ledger 'BLOCKED'; Write-Warning 'S5_LOCAL_ISSUER_CLEANUP_BLOCKED: temporary root retained for reconciliation.' }
  }
  Clear-S5Environment
  if ($credentials) { $credentials.AdminKey = $null; $credentials.PublicKey = $null }
  $credentials = $null
  $localStatus = $null
  $statusOutput = $null
  $startOutput = $null
  $statusText = $null
  $runId = $null
  if ($cleanupBlocked) { throw 'S5_LOCAL_ISSUER_CLEANUP_FAILED' }
}
