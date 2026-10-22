$ErrorActionPreference = 'Stop'
$files = @((Join-Path $PSScriptRoot 'u03-preview-b4-owner.ps1'), (Join-Path $PSScriptRoot 'u03-preview-window-vault.psm1'), (Join-Path $PSScriptRoot 'u03-preview-window-rotation.psm1'))
foreach ($file in $files) {
  $tokens = $null; $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors) | Out-Null
  if ($errors.Count -gt 0) { throw 'U03_WINDOW_PS_PARSE_FAILED' }
}
'U03_WINDOW_PS51_PARSE_PASS'
