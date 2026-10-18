$ErrorActionPreference = 'Stop'
$repo = (Get-Location).Path
$runner = Join-Path $repo 'scripts\u03-preview-b4-runner.mjs'
$linkFile = Join-Path $repo '.vercel\project.json'

function Stop-B4([string]$Code) { throw "U03 B-4 BLOCKED: $Code. No se abrirá Chromium." }
function Read-B4Secret([string]$Prompt) {
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

if (-not (Test-Path -LiteralPath $runner)) { Stop-B4 'B4_RUNNER_MISSING' }
if (-not (Test-Path -LiteralPath $linkFile)) { Stop-B4 'VERCEL_PROJECT_NOT_LINKED' }
$branch = (& git -C $repo branch --show-current 2>$null).Trim()
$remote = (& git -C $repo remote get-url origin 2>$null).Trim()
if ($branch -ne 'codex/u02-preview-isolation-20261017' -or $remote -ne 'https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO.git') { Stop-B4 'WRONG_REPOSITORY_OR_BRANCH' }
$link = Get-Content -LiteralPath $linkFile -Raw | ConvertFrom-Json
if ($link.projectId -ne 'prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook' -or $link.orgId -ne 'team_hLhdb3M9MviTIysXD9whFF2c') { Stop-B4 'VERCEL_LINK_MISMATCH' }
$oidc = $env:VERCEL_OIDC_TOKEN
if ([string]::IsNullOrWhiteSpace($oidc)) { Stop-B4 'VERCEL_ENV_RUN_DID_NOT_PROVIDE_OIDC_TOKEN' }
$vercelCommand = Get-Command vercel.cmd -ErrorAction SilentlyContinue
if (-not $vercelCommand) { $vercelCommand = Get-Command vercel -ErrorAction SilentlyContinue }
if ($vercelCommand) { $env:U03_VERCEL_CLI = $vercelCommand.Source }
else {
  $fallbackCli = Join-Path $env:APPDATA 'npm\vercel.cmd'
  if (-not (Test-Path -LiteralPath $fallbackCli)) { Stop-B4 'VERCEL_CLI_NOT_FOUND' }
  $env:U03_VERCEL_CLI = $fallbackCli
}

# Keep the child environment to OS runtime values, the ephemeral OIDC token and the
# explicitly entered test accounts. Preview project secrets are not forwarded to Node/Chromium.
$keep = @('PATH','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','HOMEDRIVE','HOMEPATH','COMSPEC','PATHEXT','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS','OS','U03_VERCEL_CLI')
Get-ChildItem Env: | Where-Object { $_.Name -notin $keep -and $_.Name -ne 'VERCEL_OIDC_TOKEN' } | ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" -ErrorAction SilentlyContinue }
$env:VERCEL_OIDC_TOKEN = $oidc
Remove-Variable oidc

Push-Location -LiteralPath $repo
try {
  & node $runner --preflight
  if ($LASTEXITCODE -ne 0) { Stop-B4 'PROTECTED_PREVIEW_PREFLIGHT_FAILED' }

  $env:U03_B4_A_EMAIL = Read-Host 'Correo de la cuenta ficticia autorizada de A'
  $env:U03_B4_A_PASSWORD = Read-B4Secret 'Contraseña de esa cuenta A'
  $env:U03_B4_A1_PATH = Read-Host 'Ruta exacta del proyecto A1 (por ejemplo /proyectos/organizacion/proyecto)'
  $env:U03_B4_A2_PATH = Read-Host 'Ruta exacta del proyecto A2'
  $env:U03_B4_B_EMAIL = Read-Host 'Correo de la cuenta ficticia autorizada de B'
  $env:U03_B4_B_PASSWORD = Read-B4Secret 'Contraseña de esa cuenta B'
  $env:U03_B4_B1_PATH = Read-Host 'Ruta exacta del proyecto B1'

  $env:U03_B4_REVOKED_EMAIL = Read-Host 'Cuenta ficticia con membresía ya retirada (Enter para omitir)'
  if (-not [string]::IsNullOrWhiteSpace($env:U03_B4_REVOKED_EMAIL)) {
    $env:U03_B4_REVOKED_PASSWORD = Read-B4Secret 'Contraseña de la cuenta con membresía retirada'
    $env:U03_B4_REVOKED_PATH = Read-Host 'Ruta exacta del proyecto cuya membresía fue retirada'
  }

  & node $runner --browser
  if ($LASTEXITCODE -ne 0) { Stop-B4 'BROWSER_SUITE_FAILED' }
} finally {
  Pop-Location
  Get-ChildItem Env: | Where-Object { $_.Name -like 'U03_B4_*' -or $_.Name -in @('VERCEL_OIDC_TOKEN','U03_VERCEL_CLI') } | ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" -ErrorAction SilentlyContinue }
}
