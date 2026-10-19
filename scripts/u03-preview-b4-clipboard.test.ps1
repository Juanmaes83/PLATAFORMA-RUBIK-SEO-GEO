$ErrorActionPreference = 'Stop'
$modulePath = Join-Path $PSScriptRoot 'u03-preview-b4-clipboard.psm1'
$ownerPath = Join-Path $PSScriptRoot 'u03-preview-b4-owner.ps1'
foreach ($path in @($modulePath, $ownerPath, $PSCommandPath)) {
  $tokens = $null
  $parseErrors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$parseErrors) | Out-Null
  if ($parseErrors.Count -gt 0) { throw 'PowerShell parser rejected a B-4 script.' }
}

Import-Module $modulePath -Force
$state = [pscustomobject]@{ Value = ''; Reads = 0; Clears = 0; Pending = [System.Collections.Generic.Queue[string]]::new() }
$reader = { $state.Reads++; return $state.Value }.GetNewClosure()
$clearer = { $state.Value = ''; $state.Clears++ }.GetNewClosure()
$confirm = {
  param($Text)
  if ($Text -notmatch 'no pegues') { throw 'Unexpected confirmation prompt.' }
  if ($state.Pending.Count -gt 0) { $state.Value = $state.Pending.Dequeue() }
  return 'LISTO'
}.GetNewClosure()

# A clipboard containing two lines is rejected and cleared without exposing its contents.
$state.Pending.Enqueue(('sb_' + 'secret_' + 'synthetic-one' + "`n" + 'sb_' + 'secret_' + 'synthetic-two'))
$rejected = $false
try {
  Read-B4ClipboardSecret -Prompt 'Test de una clave' -ExpectedPrefix 'sb_secret_' -Reader $reader -Clearer $clearer -ConfirmationReader $confirm | Out-Null
} catch {
  $rejected = $_.Exception.Message -match 'CLIPBOARD_VALUE_INVALID'
}
if (-not $rejected -or $state.Value -ne '' -or $state.Reads -ne 1) { throw 'Two-line clipboard regression test failed.' }

# One copied secret is consumed and cleared. A second prompt cannot reuse it to fill the next key.
$expectedFirst = 'sb_' + 'secret_' + 'synthetic-once'
$state.Pending.Enqueue($expectedFirst)
$first = Read-B4ClipboardSecret -Prompt 'Test secuencial 1' -ExpectedPrefix 'sb_secret_' -Reader $reader -Clearer $clearer -ConfirmationReader $confirm
if ($first -cne $expectedFirst -or $state.Value -ne '') { throw 'First clipboard read did not clear its source.' }
$secondRejected = $false
try {
  Read-B4ClipboardSecret -Prompt 'Test secuencial 2' -ExpectedPrefix 'sb_publishable_' -Reader $reader -Clearer $clearer -ConfirmationReader $confirm | Out-Null
} catch {
  $secondRejected = $_.Exception.Message -match 'CLIPBOARD_VALUE_INVALID'
}
if (-not $secondRejected -or $state.Reads -ne 3 -or $state.Value -ne '') { throw 'Single-copy reuse regression test failed.' }

Write-Output 'PASS PowerShell parser: owner, clipboard module, and clipboard tests'
Write-Output 'PASS two-line clipboard rejected and cleared'
Write-Output 'PASS one clipboard copy cannot populate both sequential keys'
