$ErrorActionPreference = 'Stop'
$modulePath = Join-Path $PSScriptRoot 'u03-preview-b4-clipboard.psm1'
Import-Module $modulePath -Force -ErrorAction Stop
Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop

# This test runs in the Windows PowerShell child used by vercel.cmd env run.
# Every clipboard value here is fictitious and is never written to output.
$fakeStale = [Guid]::NewGuid().ToString('N')
$fakeAdmin = 'sb_secret_' + [Guid]::NewGuid().ToString('N')
$fakePublic = 'sb_publishable_' + [Guid]::NewGuid().ToString('N')
$apartment = [Threading.Thread]::CurrentThread.GetApartmentState().ToString()
$state = [pscustomobject]@{ Confirmations = 0; Clears = 0; PromptAfterFailure = $false; PostClears = 0 }
$confirmation = {
  param($Text)
  if (-not [string]::IsNullOrEmpty((Get-Clipboard -Raw -ErrorAction Stop))) { throw 'Clipboard was not cleared before confirmation.' }
  $state.Confirmations++
  if ($state.Confirmations -eq 1) { Set-Clipboard -Value $fakeAdmin -ErrorAction Stop }
  elseif ($state.Confirmations -eq 2) { Set-Clipboard -Value $fakePublic -ErrorAction Stop }
  else { throw 'Unexpected confirmation.' }
  $expected = if ($state.Confirmations -eq 1) { $fakeAdmin } else { $fakePublic }
  $visible = $false
  for ($probe = 0; $probe -lt 12; $probe++) {
    if ((Get-Clipboard -Raw -ErrorAction Stop) -ceq $expected) { $visible = $true; break }
    Start-Sleep -Milliseconds 25
  }
  if (-not $visible) { throw 'Synthetic clipboard write was not visible.' }
  'LISTO'
}.GetNewClosure()

try {
  if ($apartment -ne 'STA') { throw 'Provisioning PowerShell child is not STA.' }

  # Reproduce the original command's failure without printing clipboard data.
  Set-Clipboard -Value $fakeStale -ErrorAction Stop
  $originalFailure = $false
  try { Set-Clipboard -Value '' -ErrorAction Stop }
  catch {
    $originalFailure = $true
    Write-Output ('OriginalExceptionClass=' + $_.Exception.GetType().FullName)
    Write-Output ('OriginalErrorCode=' + $_.FullyQualifiedErrorId)
    Write-Output ('OriginalHResult=' + $_.Exception.HResult)
  }
  if (-not $originalFailure) { throw 'Original empty-string command did not reproduce its failure.' }

  # The first clear and both reads use the real Windows clipboard.
  Set-Clipboard -Value $fakeStale -ErrorAction Stop
  Clear-B4Clipboard
  if (-not [string]::IsNullOrEmpty((Get-Clipboard -Raw -ErrorAction Stop))) { throw 'Initial clear was not verified.' }
  $actualAdmin = Read-B4ClipboardSecret -Prompt 'Synthetic admin read' -ExpectedPrefix 'sb_secret_' -ConfirmationReader $confirmation
  if ($actualAdmin -cne $fakeAdmin -or -not [string]::IsNullOrEmpty((Get-Clipboard -Raw -ErrorAction Stop))) { throw 'Admin read did not clear the clipboard.' }
  $actualAdmin = $null
  $actualPublic = Read-B4ClipboardSecret -Prompt 'Synthetic publishable read' -ExpectedPrefix 'sb_publishable_' -ConfirmationReader $confirmation
  if ($actualPublic -cne $fakePublic -or -not [string]::IsNullOrEmpty((Get-Clipboard -Raw -ErrorAction Stop))) { throw 'Publishable read did not clear the clipboard.' }
  $actualPublic = $null
  if ($state.Confirmations -ne 2) { throw 'Expected exactly two synthetic reads.' }
  Write-Output 'PASS STA child, initial clear, and both verified post-read clears'

  # A busy clipboard can reject the first clear; a short retry must recover.
  Set-Clipboard -Value $fakeStale -ErrorAction Stop
  $flakyClearer = {
    $state.Clears++
    if ($state.Clears -eq 1) { throw [Runtime.InteropServices.ExternalException]::new('Synthetic clipboard busy', -2147221040) }
    [System.Windows.Forms.Clipboard]::Clear()
  }.GetNewClosure()
  $warnings = @(Clear-B4Clipboard -Clearer $flakyClearer 3>&1)
  $warningText = $warnings -join ' '
  if ($state.Clears -ne 2 -or -not [string]::IsNullOrEmpty((Get-Clipboard -Raw -ErrorAction Stop)) -or
      $warningText -notmatch 'System.Runtime.InteropServices.ExternalException' -or $warningText -notmatch '0x800401D0' -or
      $warningText.Contains($fakeStale)) { throw 'Busy clipboard retry or sanitized diagnosis failed.' }
  Write-Output 'PASS synthetic busy failure, sanitized class/code, and retry recovery'

  # If every clear fails, no value may be accepted or returned.
  Set-Clipboard -Value $fakeStale -ErrorAction Stop
  $failedClosed = $false
  try { Clear-B4Clipboard -Clearer { throw [Runtime.InteropServices.ExternalException]::new('Synthetic clipboard busy', -2147221040) } 3>&1 | Out-Null }
  catch { $failedClosed = $_.Exception.Message -match 'CLIPBOARD_CLEAR_FAILED' }
  if (-not $failedClosed) { throw 'Unverifiable clear did not fail closed.' }
  Write-Output 'PASS persistent failure closes safely'

  # A failed initial clear cannot reach a prompt or clipboard read.
  $blockedBeforePrompt = $false
  try {
    Read-B4ClipboardSecret -Prompt 'Synthetic blocked read' -ExpectedPrefix 'sb_secret_' `
      -Clearer { throw [Runtime.InteropServices.ExternalException]::new('Synthetic clipboard busy', -2147221040) } `
      -ConfirmationReader { $state.PromptAfterFailure = $true; 'LISTO' } 3>&1 | Out-Null
  }
  catch { $blockedBeforePrompt = $_.Exception.Message -match 'CLIPBOARD_CLEAR_FAILED' }
  if (-not $blockedBeforePrompt -or $state.PromptAfterFailure) { throw 'Initial clear failure reached the prompt.' }
  Write-Output 'PASS failed initial clear blocks before the first key'

  # A failed clear after a read must suppress the function's return value.
  $postClearer = {
    $state.PostClears++
    if ($state.PostClears -eq 1) { [System.Windows.Forms.Clipboard]::Clear(); return }
    throw [Runtime.InteropServices.ExternalException]::new('Synthetic clipboard busy', -2147221040)
  }.GetNewClosure()
  $postConfirmation = {
    param($Text)
    Set-Clipboard -Value $fakeAdmin -ErrorAction Stop
    for ($probe = 0; $probe -lt 12; $probe++) {
      if ((Get-Clipboard -Raw -ErrorAction Stop) -ceq $fakeAdmin) { return 'LISTO' }
      Start-Sleep -Milliseconds 25
    }
    throw 'Synthetic clipboard write was not visible.'
  }.GetNewClosure()
  $blockedAfterRead = $false
  $unexpectedReturn = $null
  try { $unexpectedReturn = Read-B4ClipboardSecret -Prompt 'Synthetic blocked post-read' -ExpectedPrefix 'sb_secret_' -Clearer $postClearer -ConfirmationReader $postConfirmation 3>&1 }
  catch { $blockedAfterRead = $_.Exception.Message -match 'CLIPBOARD_CLEAR_FAILED' }
  if (-not $blockedAfterRead -or $state.PostClears -lt 2 -or $unexpectedReturn) { throw 'Failed post-read clear returned a value.' }
  Write-Output 'PASS failed post-read clear suppresses the key'
}
finally {
  [System.Windows.Forms.Clipboard]::Clear()
  if (-not [string]::IsNullOrEmpty((Get-Clipboard -Raw -ErrorAction Stop))) { throw 'Synthetic clipboard cleanup was not verified.' }
  $fakeStale = $null
  $fakeAdmin = $null
  $fakePublic = $null
  $actualAdmin = $null
  $actualPublic = $null
  $warnings = $null
  $warningText = $null
  Write-Output 'PASS final synthetic clipboard cleanup verified'
}
