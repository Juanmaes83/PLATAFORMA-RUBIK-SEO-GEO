Set-StrictMode -Version Latest

$script:B4PreviewRef = 'rhnnplewqsekrnaousyl'

function Stop-B4Credential([string]$Code) {
  throw "U03 B-4 BLOCKED: $Code. No fixtures will be created unless every preflight passes."
}

function Clear-B4Clipboard {
  [CmdletBinding()]
  param([scriptblock]$Clearer = { Set-Clipboard -Value '' -ErrorAction Stop })

  try { & $Clearer }
  catch { Stop-B4Credential 'CLIPBOARD_CLEAR_FAILED' }
}

function Read-B4ClipboardSecret {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$Prompt,
    [Parameter(Mandatory)][ValidateSet('sb_secret_', 'sb_publishable_')][string]$ExpectedPrefix,
    [scriptblock]$Reader = { Get-Clipboard -Raw -ErrorAction Stop },
    [scriptblock]$Clearer = { Set-Clipboard -Value '' -ErrorAction Stop },
    [scriptblock]$ConfirmationReader = { param($Text) Read-Host -Prompt $Text }
  )

  $clipboardValue = $null
  $confirmation = $null
  try {
    Clear-B4Clipboard -Clearer $Clearer
    Write-Host $Prompt
    $confirmation = & $ConfirmationReader 'Escribe LISTO para leer la clave copiada; no pegues la clave aquí'
    if ($confirmation -cne 'LISTO') { Stop-B4Credential 'CLIPBOARD_CONFIRMATION_REQUIRED' }

    try { $clipboardValue = & $Reader }
    catch { Stop-B4Credential 'CLIPBOARD_READ_FAILED' }
    finally { Clear-B4Clipboard -Clearer $Clearer }

    if ($clipboardValue -isnot [string] -or $clipboardValue -match '[\r\n]' -or
        $clipboardValue -cnotmatch ('^' + [regex]::Escape($ExpectedPrefix) + '[A-Za-z0-9_-]+$')) {
      Stop-B4Credential 'CLIPBOARD_VALUE_INVALID'
    }

    return $clipboardValue
  }
  finally {
    $clipboardValue = $null
    $confirmation = $null
    Clear-B4Clipboard -Clearer $Clearer
    Remove-Variable -Name clipboardValue, confirmation -ErrorAction SilentlyContinue
  }
}

function Get-B4CurrentUserSid {
  try {
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    if ([string]::IsNullOrWhiteSpace($sid)) { Stop-B4Credential 'CREDENTIAL_PROFILE_UNAVAILABLE' }
    return $sid
  }
  catch { Stop-B4Credential 'CREDENTIAL_PROFILE_UNAVAILABLE' }
}

function Get-B4PreviewCredentialPath {
  [CmdletBinding()]
  param([scriptblock]$ProfilePathProvider = { [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData) })

  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { Stop-B4Credential 'WINDOWS_DPAPI_REQUIRED' }
  try { $profileRoot = & $ProfilePathProvider }
  catch { Stop-B4Credential 'CREDENTIAL_PROFILE_UNAVAILABLE' }
  if ([string]::IsNullOrWhiteSpace($profileRoot) -or -not (Test-Path -LiteralPath $profileRoot -PathType Container)) {
    Stop-B4Credential 'CREDENTIAL_PROFILE_UNAVAILABLE'
  }

  try {
    $root = [IO.Path]::GetFullPath($profileRoot)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $path = [IO.Path]::GetFullPath((Join-Path $root 'Rubik\U03-B4\preview-rhnnplewqsekrnaousyl.json'))
    if ($path.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) { Stop-B4Credential 'CREDENTIAL_STORE_LOCATION_REJECTED' }
    return $path
  }
  catch { Stop-B4Credential 'CREDENTIAL_PROFILE_UNAVAILABLE' }
}

function Set-B4PrivateStoreDirectory([string]$Directory) {
  try {
    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) { [void][IO.Directory]::CreateDirectory($Directory) }
    $currentSid = Get-B4CurrentUserSid
    $acl = Get-Acl -LiteralPath $Directory -ErrorAction Stop
    $hasCurrentUserAccess = @($acl.Access | Where-Object {
      try { $_.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -eq $currentSid }
      catch { $false }
    }).Count -gt 0
    if (-not $hasCurrentUserAccess) { Stop-B4Credential 'CREDENTIAL_STORE_ACCESS_FAILED' }
  }
  catch { Stop-B4Credential 'CREDENTIAL_STORE_ACCESS_FAILED' }
}

function Test-B4PreviewKeyFormat([string]$AdminKey, [string]$PublicKey) {
  if ($AdminKey -cnotmatch '^sb_secret_[A-Za-z0-9_-]+$' -or $PublicKey -cnotmatch '^sb_publishable_[A-Za-z0-9_-]+$') {
    Stop-B4Credential 'CREDENTIAL_FORMAT_INVALID'
  }
}

function Get-B4PreviewDpapiEntropy([string]$UserSid) {
  return [Text.Encoding]::UTF8.GetBytes(('rubik-u03-b4|rhnnplewqsekrnaousyl|' + $UserSid))
}

function Initialize-B4DpapiRuntime {
  foreach ($assemblyName in @('System.Security.Cryptography.ProtectedData', 'System.Security')) {
    if ('System.Security.Cryptography.ProtectedData' -as [type]) { break }
    try { Add-Type -AssemblyName $assemblyName -ErrorAction Stop } catch { }
  }
  if (-not ('System.Security.Cryptography.ProtectedData' -as [type]) -or -not ('System.Security.Cryptography.DataProtectionScope' -as [type])) {
    Stop-B4Credential 'DPAPI_RUNTIME_UNAVAILABLE'
  }
}

function Protect-B4PreviewKey([string]$PlainText, [string]$UserSid) {
  $plainBytes = $null
  $entropy = $null
  $protectedBytes = $null
  try {
    Initialize-B4DpapiRuntime
    $plainBytes = [Text.Encoding]::UTF8.GetBytes($PlainText)
    $entropy = Get-B4PreviewDpapiEntropy -UserSid $UserSid
    $protectedBytes = [System.Security.Cryptography.ProtectedData]::Protect($plainBytes, $entropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    return [Convert]::ToBase64String($protectedBytes)
  }
  catch {
    if ($_.Exception.Message -match 'DPAPI_RUNTIME_UNAVAILABLE') { throw }
    Stop-B4Credential 'CREDENTIAL_PROTECT_FAILED'
  }
  finally {
    if ($plainBytes) { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
    if ($entropy) { [Array]::Clear($entropy, 0, $entropy.Length) }
    if ($protectedBytes) { [Array]::Clear($protectedBytes, 0, $protectedBytes.Length) }
    $PlainText = $null
  }
}

function Unprotect-B4PreviewKey([string]$CipherText, [string]$UserSid) {
  $cipherBytes = $null
  $entropy = $null
  $plainBytes = $null
  try {
    Initialize-B4DpapiRuntime
    $cipherBytes = [Convert]::FromBase64String($CipherText)
    $entropy = Get-B4PreviewDpapiEntropy -UserSid $UserSid
    $plainBytes = [System.Security.Cryptography.ProtectedData]::Unprotect($cipherBytes, $entropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    return [Text.Encoding]::UTF8.GetString($plainBytes)
  }
  catch {
    if ($_.Exception.Message -match 'DPAPI_RUNTIME_UNAVAILABLE') { throw }
    Stop-B4Credential 'CREDENTIAL_PROFILE_UNAVAILABLE'
  }
  finally {
    if ($cipherBytes) { [Array]::Clear($cipherBytes, 0, $cipherBytes.Length) }
    if ($entropy) { [Array]::Clear($entropy, 0, $entropy.Length) }
    if ($plainBytes) { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
    $CipherText = $null
  }
}

function Save-B4PreviewCredentials {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$AdminKey,
    [Parameter(Mandatory)][string]$PublicKey,
    [switch]$Replace,
    [scriptblock]$ProfilePathProvider = { [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData) }
  )

  $adminProtected = $null
  $publicProtected = $null
  $stagingPath = $null
  try {
    Test-B4PreviewKeyFormat -AdminKey $AdminKey -PublicKey $PublicKey
    $path = Get-B4PreviewCredentialPath -ProfilePathProvider $ProfilePathProvider
    if ((Test-Path -LiteralPath $path) -and -not $Replace) { Stop-B4Credential 'CREDENTIALS_ALREADY_PRESENT' }
    $userSid = Get-B4CurrentUserSid
    $adminProtected = Protect-B4PreviewKey -PlainText $AdminKey -UserSid $userSid
    $publicProtected = Protect-B4PreviewKey -PlainText $PublicKey -UserSid $userSid
    $directory = [IO.Path]::GetDirectoryName($path)
    Set-B4PrivateStoreDirectory -Directory $directory
    $record = [ordered]@{
      version = 1
      projectRef = $script:B4PreviewRef
      userSid = $userSid
      adminProtected = $adminProtected
      publicProtected = $publicProtected
    }
    $json = ConvertTo-Json -InputObject $record -Compress
    $stagingPath = Join-Path $directory ('.preview-credentials-' + [Guid]::NewGuid().ToString('N') + '.pending')
    [IO.File]::WriteAllText($stagingPath, $json, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $stagingPath -Destination $path -Force -ErrorAction Stop
    $stagingPath = $null
  }
  catch {
    if ($_.Exception.Message -match 'U03 B-4 BLOCKED:') { throw }
    Stop-B4Credential 'CREDENTIAL_STORE_WRITE_FAILED'
  }
  finally {
    $AdminKey = $null
    $PublicKey = $null
    $adminProtected = $null
    $publicProtected = $null
    $json = $null
    if ($stagingPath -and (Test-Path -LiteralPath $stagingPath)) { Remove-Item -LiteralPath $stagingPath -Force -ErrorAction SilentlyContinue }
    Remove-Variable -Name AdminKey, PublicKey, adminProtected, publicProtected, json -ErrorAction SilentlyContinue
  }
}

function Get-B4PreviewCredentials {
  [CmdletBinding()]
  param([scriptblock]$ProfilePathProvider = { [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData) })

  $adminKey = $null
  $publicKey = $null
  try {
    $path = Get-B4PreviewCredentialPath -ProfilePathProvider $ProfilePathProvider
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Stop-B4Credential 'PREVIEW_CREDENTIALS_REQUIRED' }
    try { $record = Get-Content -LiteralPath $path -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop }
    catch { Stop-B4Credential 'CREDENTIAL_STORE_INVALID' }
    if ($record.version -ne 1 -or $record.projectRef -cne $script:B4PreviewRef -or $record.userSid -cne (Get-B4CurrentUserSid) -or
        [string]::IsNullOrWhiteSpace($record.adminProtected) -or [string]::IsNullOrWhiteSpace($record.publicProtected)) {
      Stop-B4Credential 'CREDENTIAL_IDENTITY_MISMATCH'
    }
    $currentSid = Get-B4CurrentUserSid
    $adminKey = Unprotect-B4PreviewKey -CipherText $record.adminProtected -UserSid $currentSid
    $publicKey = Unprotect-B4PreviewKey -CipherText $record.publicProtected -UserSid $currentSid
    Test-B4PreviewKeyFormat -AdminKey $adminKey -PublicKey $publicKey
    return [pscustomobject]@{ ProjectRef = $script:B4PreviewRef; UserSid = $record.userSid; AdminKey = $adminKey; PublicKey = $publicKey }
  }
  finally {
    $adminKey = $null
    $publicKey = $null
    Remove-Variable -Name adminKey, publicKey -ErrorAction SilentlyContinue
  }
}

function Test-B4PreviewCredentials {
  [CmdletBinding()]
  param([scriptblock]$ProfilePathProvider = { [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData) })

  $credentials = $null
  try {
    $credentials = Get-B4PreviewCredentials -ProfilePathProvider $ProfilePathProvider
    return $true
  }
  finally {
    if ($credentials) { $credentials.AdminKey = $null; $credentials.PublicKey = $null }
    Remove-Variable -Name credentials -ErrorAction SilentlyContinue
  }
}

function Remove-B4PreviewCredentials {
  [CmdletBinding()]
  param([scriptblock]$ProfilePathProvider = { [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData) })

  $path = Get-B4PreviewCredentialPath -ProfilePathProvider $ProfilePathProvider
  if (Test-Path -LiteralPath $path -PathType Leaf) {
    try { Remove-Item -LiteralPath $path -Force -ErrorAction Stop }
    catch { Stop-B4Credential 'CREDENTIAL_STORE_DELETE_FAILED' }
    return $true
  }
  return $false
}

Export-ModuleMember -Function Clear-B4Clipboard, Read-B4ClipboardSecret, Get-B4PreviewCredentialPath, Save-B4PreviewCredentials, Get-B4PreviewCredentials, Test-B4PreviewCredentials, Remove-B4PreviewCredentials
