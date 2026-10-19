param(
  [switch]$ReadOnlyPreflightOnly,
  [switch]$PlaywrightOnly,
  [switch]$ProvisionPreviewKeys,
  [switch]$CheckPreviewKeys,
  [switch]$ReplacePreviewKeys,
  [switch]$DeletePreviewKeys
)

$ErrorActionPreference = 'Stop'
$repo = (Get-Location).Path
$runner = Join-Path $repo 'scripts\u03-preview-b4-orchestrator.mjs'
$linkFile = Join-Path $repo '.vercel\project.json'
$clipboardModule = Join-Path $PSScriptRoot 'u03-preview-b4-clipboard.psm1'
Import-Module -Name $clipboardModule -Force -ErrorAction Stop

function Stop-B4([string]$Code) { throw "U03 B-4 BLOCKED: $Code. No fixtures will be created unless every preflight passes." }

$credentialOperations = 0
foreach ($requested in @($ProvisionPreviewKeys.IsPresent, $CheckPreviewKeys.IsPresent, $ReplacePreviewKeys.IsPresent, $DeletePreviewKeys.IsPresent)) {
  if ($requested) { $credentialOperations++ }
}
if ($credentialOperations -gt 1 -or ($credentialOperations -gt 0 -and ($ReadOnlyPreflightOnly -or $PlaywrightOnly)) -or ($ReadOnlyPreflightOnly -and $PlaywrightOnly)) { Stop-B4 'CREDENTIAL_OPERATION_ARGUMENTS_INVALID' }
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
if ($branch -ne 'codex/u02-preview-isolation-20261017' -or $remote -ne 'https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO.git') { Stop-B4 'WRONG_REPOSITORY_OR_BRANCH' }
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

  if ($PlaywrightOnly) { & node $runner --playwright-only }
  else { & node $runner }
  if ($LASTEXITCODE -ne 0) { Stop-B4 'U03_B4_CAMPAIGN_FAILED_OR_CLEANUP_UNVERIFIED' }
} finally {
  if ($pushed) { Pop-Location }
  Get-ChildItem Env: | Where-Object { $_.Name -like 'U03_*' -or $_.Name -eq 'VERCEL_OIDC_TOKEN' } | ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" -ErrorAction SilentlyContinue }
  if ($clipboardSessionActive) { Clear-B4Clipboard }
  $adminKey = $null
  $publicKey = $null
  if ($previewCredentials) { $previewCredentials.AdminKey = $null; $previewCredentials.PublicKey = $null }
  $previewCredentials = $null
  Remove-Variable -Name previewCredentials, clipboardSessionActive, adminKey, publicKey, clipboardValue, confirmation -ErrorAction SilentlyContinue
}
