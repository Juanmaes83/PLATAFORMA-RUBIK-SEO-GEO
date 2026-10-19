$ErrorActionPreference = 'Stop'
$repo = (Get-Location).Path
$runner = Join-Path $repo 'scripts\u03-preview-b4-orchestrator.mjs'
$linkFile = Join-Path $repo '.vercel\project.json'

function Stop-B4([string]$Code) { throw "U03 B-4 BLOCKED: $Code. No fixtures will be created unless every preflight passes." }
function Read-B4Secret([string]$Prompt) {
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
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
try {
  # Ask only for Preview Admin/Auth and publishable keys. They stay in this
  # process environment, never enter arguments, and are removed on every exit.
  $env:U03_PREVIEW_ADMIN_KEY = Read-B4Secret 'Supabase Preview Admin/Auth key (solo rhnnplewqsekrnaousyl)'
  $env:U03_PREVIEW_PUBLIC_KEY = Read-B4Secret 'Supabase Preview publishable key (solo rhnnplewqsekrnaousyl)'
  if ([string]::IsNullOrWhiteSpace($env:U03_PREVIEW_ADMIN_KEY) -or [string]::IsNullOrWhiteSpace($env:U03_PREVIEW_PUBLIC_KEY)) { Stop-B4 'PREVIEW_KEYS_REQUIRED' }

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
  $keep = @('PATH','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','ProgramFiles','HOMEDRIVE','HOMEPATH','COMSPEC','PATHEXT','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS','OS','VERCEL_OIDC_TOKEN','U03_VERCEL_CLI','U03_SUPABASE_CLI','U03_PREVIEW_ADMIN_KEY','U03_PREVIEW_PUBLIC_KEY','NODE_USE_ENV_PROXY','NODE_USE_SYSTEM_CA','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR') + $proxyNames
  Get-ChildItem Env: | Where-Object { $_.Name -notin $keep } | ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" -ErrorAction SilentlyContinue }

  Push-Location -LiteralPath $repo
  $pushed = $true
  & node $runner
  if ($LASTEXITCODE -ne 0) { Stop-B4 'U03_B4_CAMPAIGN_FAILED_OR_CLEANUP_UNVERIFIED' }
} finally {
  if ($pushed) { Pop-Location }
  Get-ChildItem Env: | Where-Object { $_.Name -like 'U03_*' -or $_.Name -eq 'VERCEL_OIDC_TOKEN' } | ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" -ErrorAction SilentlyContinue }
  Remove-Variable -Name secure -ErrorAction SilentlyContinue
  Remove-Variable -Name adminKey,publicKey -ErrorAction SilentlyContinue
}
