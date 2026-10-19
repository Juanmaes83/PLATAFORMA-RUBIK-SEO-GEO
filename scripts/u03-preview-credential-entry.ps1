param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $PSScriptRoot 'u03-preview-preflight.mjs'
$matrix = Join-Path $PSScriptRoot 'u03-preview-data-api.mjs'
if (-not (Test-Path -LiteralPath $runner)) { throw 'Falta el preflight U03.' }
if (-not (Test-Path -LiteralPath $matrix)) { throw 'Falta la matriz Data API U03.' }

function Read-Secret([string]$Prompt) {
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

try {
  $env:U03_PREVIEW_ADMIN_KEY = Read-Secret 'Clave Admin/Auth exclusiva de Preview'
  $env:U03_PREVIEW_PUBLIC_KEY = Read-Secret 'Clave publicable de Preview'
  $env:U03_VERCEL_BYPASS = Read-Secret 'Bypass de Vercel (Enter si no disponible)'
  if ([string]::IsNullOrWhiteSpace($env:U03_PREVIEW_ADMIN_KEY) -or
      [string]::IsNullOrWhiteSpace($env:U03_PREVIEW_PUBLIC_KEY)) {
    throw 'Faltan claves de Preview.'
  }
  Push-Location -LiteralPath $root
  try {
    & node $runner
    if ($LASTEXITCODE -ne 0) { throw 'Preflight U03 fallido. No se crearon fixtures.' }
    & node $matrix
    if ($LASTEXITCODE -ne 0) { throw 'Matriz Data API U03 fallida; revisar ledger y limpieza.' }
  } finally { Pop-Location }
} finally {
  Remove-Item Env:U03_PREVIEW_ADMIN_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:U03_PREVIEW_PUBLIC_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:U03_VERCEL_BYPASS -ErrorAction SilentlyContinue
}
