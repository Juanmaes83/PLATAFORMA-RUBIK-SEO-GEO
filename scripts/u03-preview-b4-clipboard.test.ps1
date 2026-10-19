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
$testProfileRoot = Join-Path $env:LOCALAPPDATA ('Rubik\U03-B4\test-' + [Guid]::NewGuid().ToString('N'))
$profileProvider = { $testProfileRoot }.GetNewClosure()
$state = [pscustomobject]@{ Value = ''; Reads = 0; Clears = 0; Pending = [System.Collections.Generic.Queue[string]]::new(); Confirmations = 0 }
$reader = { $state.Reads++; return $state.Value }.GetNewClosure()
$clearer = { $state.Value = ''; $state.Clears++ }.GetNewClosure()
$verifier = { $state.Value -eq '' }.GetNewClosure()
$confirm = {
  param($Text)
  if ($Text -notmatch 'no pegues') { throw 'Unexpected confirmation prompt.' }
  $state.Confirmations++
  if ($state.Pending.Count -gt 0) { $state.Value = $state.Pending.Dequeue() }
  return 'LISTO'
}.GetNewClosure()

$suffix = [Guid]::NewGuid().ToString('N')
$adminSynthetic = 'sb_' + 'secret_' + $suffix
$publicSynthetic = 'sb_' + 'publishable_' + $suffix
$replacementAdmin = 'sb_' + 'secret_' + [Guid]::NewGuid().ToString('N')
$replacementPublic = 'sb_' + 'publishable_' + [Guid]::NewGuid().ToString('N')
$firstAdmin = $null
$firstPublic = $null
$stored = $null
$secondRun = $null
try {
  [void][IO.Directory]::CreateDirectory($testProfileRoot)
  $storePath = Get-B4PreviewCredentialPath -ProfilePathProvider $profileProvider
  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if ($storePath.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Credential test path entered the temp directory.' }

  # Multiline values fail closed and are cleared before any save.
  $state.Pending.Enqueue(('sb_' + 'secret_' + 'synthetic-one' + "`n" + 'sb_' + 'secret_' + 'synthetic-two'))
  $rejected = $false
  try {
    Read-B4ClipboardSecret -Prompt 'Test multiline' -ExpectedPrefix 'sb_secret_' -Reader $reader -Clearer $clearer -Verifier $verifier -ConfirmationReader $confirm | Out-Null
  } catch { $rejected = $_.Exception.Message -match 'CLIPBOARD_VALUE_INVALID' }
  if (-not $rejected -or $state.Value -ne '') { throw 'Two-line clipboard regression test failed.' }

  # Initial provisioning consumes one clipboard value for each ordered prefix.
  $state.Pending.Enqueue($adminSynthetic)
  $firstAdmin = Read-B4ClipboardSecret -Prompt 'Test admin provisioning' -ExpectedPrefix 'sb_secret_' -Reader $reader -Clearer $clearer -Verifier $verifier -ConfirmationReader $confirm
  $state.Pending.Enqueue($publicSynthetic)
  $firstPublic = Read-B4ClipboardSecret -Prompt 'Test publishable provisioning' -ExpectedPrefix 'sb_publishable_' -Reader $reader -Clearer $clearer -Verifier $verifier -ConfirmationReader $confirm
  Save-B4PreviewCredentials -AdminKey $firstAdmin -PublicKey $firstPublic -ProfilePathProvider $profileProvider
  if (-not (Test-Path -LiteralPath $storePath -PathType Leaf)) { throw 'Initial credential provision did not create the local record.' }
  $encryptedRecord = Get-Content -LiteralPath $storePath -Raw | ConvertFrom-Json
  $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if ($encryptedRecord.projectRef -cne 'rhnnplewqsekrnaousyl' -or $encryptedRecord.userSid -cne $currentSid) { throw 'Stored record is not bound to the expected Preview ref and Windows SID.' }
  $originalRecordText = Get-Content -LiteralPath $storePath -Raw
  $wrongRefRecord = $originalRecordText | ConvertFrom-Json
  $wrongRefRecord.projectRef = 'another-preview-ref'
  [IO.File]::WriteAllText($storePath, (ConvertTo-Json -InputObject $wrongRefRecord -Compress), [Text.UTF8Encoding]::new($false))
  $wrongRefRejected = $false
  try { Get-B4PreviewCredentials -ProfilePathProvider $profileProvider | Out-Null }
  catch { $wrongRefRejected = $_.Exception.Message -match 'CREDENTIAL_IDENTITY_MISMATCH' }
  if (-not $wrongRefRejected) { throw 'A record for another project ref was accepted.' }
  [IO.File]::WriteAllText($storePath, $originalRecordText, [Text.UTF8Encoding]::new($false))
  $encryptedText = Get-Content -LiteralPath $storePath -Raw
  if ($encryptedText.Contains($adminSynthetic) -or $encryptedText.Contains($publicSynthetic)) { throw 'Credential record contains a plaintext key.' }
  $directoryAcl = Get-Acl -LiteralPath ([IO.Path]::GetDirectoryName($storePath))
  $currentUserAclEntries = @($directoryAcl.Access | Where-Object {
    try { $_.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -eq $currentSid }
    catch { $false }
  })
  if ($currentUserAclEntries.Count -eq 0) { throw 'Credential directory does not inherit access for the current Windows user.' }

  # First campaign load and a second load use DPAPI without invoking prompts or clipboard.
  $stored = Get-B4PreviewCredentials -ProfilePathProvider $profileProvider
  if ($stored.ProjectRef -cne 'rhnnplewqsekrnaousyl' -or $stored.AdminKey -cne $adminSynthetic -or $stored.PublicKey -cne $publicSynthetic) { throw 'DPAPI first load did not recover the provisioned Preview credentials.' }
  $stored.AdminKey = $null; $stored.PublicKey = $null; $stored = $null
  $confirmationsBeforeSecondRun = $state.Confirmations
  $secondRun = Get-B4PreviewCredentials -ProfilePathProvider $profileProvider
  if ($secondRun.AdminKey -cne $adminSynthetic -or $secondRun.PublicKey -cne $publicSynthetic -or $state.Confirmations -ne $confirmationsBeforeSecondRun) {
    throw 'Second campaign load prompted or failed to recover the saved credentials.'
  }
  $secondRun.AdminKey = $null; $secondRun.PublicKey = $null; $secondRun = $null

  # An invalid admin value is rejected before replacement and leaves the existing record usable.
  $wrongKeyRejected = $false
  try { Save-B4PreviewCredentials -AdminKey $publicSynthetic -PublicKey $publicSynthetic -Replace -ProfilePathProvider $profileProvider }
  catch { $wrongKeyRejected = $_.Exception.Message -match 'CREDENTIAL_FORMAT_INVALID' }
  if (-not $wrongKeyRejected -or -not (Test-B4PreviewCredentials -ProfilePathProvider $profileProvider)) { throw 'Wrong-key format was not rejected safely.' }

  Save-B4PreviewCredentials -AdminKey $replacementAdmin -PublicKey $replacementPublic -Replace -ProfilePathProvider $profileProvider
  $stored = Get-B4PreviewCredentials -ProfilePathProvider $profileProvider
  if ($stored.AdminKey -cne $replacementAdmin -or $stored.PublicKey -cne $replacementPublic) { throw 'Explicit replacement did not persist the new protected values.' }
  $stored.AdminKey = $null; $stored.PublicKey = $null; $stored = $null

  # Missing user profile is classified safely and never falls back to another store.
  $profileUnavailable = $false
  try { Get-B4PreviewCredentials -ProfilePathProvider { '' } | Out-Null }
  catch { $profileUnavailable = $_.Exception.Message -match 'CREDENTIAL_PROFILE_UNAVAILABLE' }
  if (-not $profileUnavailable) { throw 'Unavailable Windows profile was not rejected.' }

  # The explicit delete operation removes the protected record and leaves no fixture store.
  if (-not (Remove-B4PreviewCredentials -ProfilePathProvider $profileProvider) -or (Test-Path -LiteralPath $storePath)) { throw 'Credential cleanup did not remove the protected record.' }
  Write-Output 'PASS PowerShell parser: owner, credential module, and credential tests'
  Write-Output 'PASS first DPAPI CurrentUser provision, SID/ref binding, and encrypted-at-rest record'
  Write-Output 'PASS second credential load has no clipboard read or prompt'
  Write-Output 'PASS wrong Preview ref is rejected before decryption'
  Write-Output 'PASS multiline/wrong-format keys rejected; unavailable profile fails closed'
  Write-Output 'PASS explicit valid replacement'
  Write-Output 'PASS explicit deletion and test-store cleanup'
}
finally {
  if ($stored) { $stored.AdminKey = $null; $stored.PublicKey = $null }
  if ($secondRun) { $secondRun.AdminKey = $null; $secondRun.PublicKey = $null }
  $firstAdmin = $null
  $firstPublic = $null
  $adminSynthetic = $null
  $publicSynthetic = $null
  $replacementAdmin = $null
  $replacementPublic = $null
  if (Test-Path -LiteralPath $testProfileRoot) { Remove-Item -LiteralPath $testProfileRoot -Recurse -Force -ErrorAction SilentlyContinue }
  Remove-Variable -Name firstAdmin, firstPublic, adminSynthetic, publicSynthetic, replacementAdmin, replacementPublic, stored, secondRun, encryptedText, encryptedRecord, originalRecordText, wrongRefRecord -ErrorAction SilentlyContinue
}
