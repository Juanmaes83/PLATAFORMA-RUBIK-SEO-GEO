Set-StrictMode -Version Latest
$script:WindowRef = 'rhnnplewqsekrnaousyl'
$script:WindowBranch = 'codex/h1a-integral-20261022'
$script:WindowProject = 'prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook'
$script:WindowOrg = 'team_hLhdb3M9MviTIysXD9whFF2c'
$script:WindowRole = 'rubik_preview_u03_writer'
$script:WindowPooler = 'aws-1-eu-west-3.pooler.supabase.com'
$script:WindowNames = @('U03_PREVIEW_WRITER_WINDOW','U03_PREVIEW_WRITER_WINDOW_REF','U03_PREVIEW_WRITER_WINDOW_SHA',
  'U03_PREVIEW_WRITER_WINDOW_RUN_ID','U03_PREVIEW_WRITER_WINDOW_SECRET','RUBIK_AUDIT_DATABASE_URL',
  'PROVENANCE_SIGNING_KEYS','PROVENANCE_ACTIVE_KEY_ID')

function Stop-U03WindowVault([string]$Code) { throw "U03_WINDOW_VAULT:$Code" }
function Get-U03WindowSid {
  try { return [Security.Principal.WindowsIdentity]::GetCurrent().User.Value }
  catch { Stop-U03WindowVault 'IDENTITY_UNAVAILABLE' }
}
function Get-U03WindowVaultPath([string]$ProfileRoot = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)) {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or [string]::IsNullOrWhiteSpace($ProfileRoot)) { Stop-U03WindowVault 'WINDOWS_PROFILE_REQUIRED' }
  $base = [IO.Path]::GetFullPath($ProfileRoot)
  $temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if ($base.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase)) { Stop-U03WindowVault 'VAULT_PATH_REJECTED' }
  return Join-Path $base 'Rubik\H1A-Window\v2\window-batch.json'
}
function Initialize-U03WindowDpapi {
  foreach ($assembly in @('System.Security.Cryptography.ProtectedData','System.Security')) {
    if ('System.Security.Cryptography.ProtectedData' -as [type]) { break }
    try { Add-Type -AssemblyName $assembly -ErrorAction Stop } catch { }
  }
  if (-not ('System.Security.Cryptography.ProtectedData' -as [type])) { Stop-U03WindowVault 'DPAPI_UNAVAILABLE' }
}
function Get-U03WindowEntropy([string]$Sid, [string]$Sha, [string]$RunId) {
  return [Text.Encoding]::UTF8.GetBytes("rubik-h1a-window|v2|$script:WindowProject|$script:WindowRef|$script:WindowBranch|$Sha|$RunId|$Sid")
}
function Set-U03WindowAcl([string]$Path, [bool]$Directory) {
  try {
    $sid = Get-U03WindowSid
    $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
    if ($acl.Owner -ne ([Security.Principal.SecurityIdentifier]::new($sid)).Translate([Security.Principal.NTAccount]).Value) { Stop-U03WindowVault 'VAULT_OWNER_MISMATCH' }
    $writeMask = [Security.AccessControl.FileSystemRights]::WriteData -bor [Security.AccessControl.FileSystemRights]::AppendData -bor
      [Security.AccessControl.FileSystemRights]::WriteExtendedAttributes -bor [Security.AccessControl.FileSystemRights]::WriteAttributes -bor
      [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::Delete -bor
      [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership
    $hasOwnerFullControl = $false
    foreach ($entry in $acl.Access) {
      if ($entry.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) { continue }
      $entrySid = $entry.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
      $rights = [Security.AccessControl.FileSystemRights]$entry.FileSystemRights
      if ($entrySid -eq $sid -and (($rights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl)) { $hasOwnerFullControl = $true }
      if (($rights -band $writeMask) -ne 0 -and $entrySid -notin @($sid,'S-1-5-18','S-1-5-32-544')) { Stop-U03WindowVault 'VAULT_ACL_TOO_BROAD' }
    }
    if (-not $hasOwnerFullControl) { Stop-U03WindowVault 'VAULT_OWNER_ACCESS_MISSING' }
  } catch {
    if ($_.Exception.Message -like 'U03_WINDOW_VAULT:*') { throw }
    Stop-U03WindowVault 'VAULT_ACL_VERIFICATION_FAILED'
  }
}
function New-U03WindowRandom([int]$Bytes, [string]$Encoding = 'base64url') {
  $buffer = New-Object byte[] $Bytes
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buffer); $text = [Convert]::ToBase64String($buffer) }
  finally { $rng.Dispose(); [Array]::Clear($buffer, 0, $buffer.Length) }
  if ($Encoding -eq 'base64url') { return $text.TrimEnd('=').Replace('+','-').Replace('/','_') }
  return $text
}
function New-U03WindowBatch([string]$Sha, [string]$RunId = [guid]::NewGuid().ToString()) {
  if ($Sha -cnotmatch '^[0-9a-f]{40}$' -or $RunId -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') { Stop-U03WindowVault 'INPUT_INVALID' }
  $rolePassword = New-U03WindowRandom 36
  $windowSecret = New-U03WindowRandom 48
  $signingKey = New-U03WindowRandom 48 'base64'
  $url = 'postgresql://{0}.{1}:{2}@{3}:5432/postgres' -f $script:WindowRole,$script:WindowRef,[Uri]::EscapeDataString($rolePassword),$script:WindowPooler
  $values = [ordered]@{
    U03_PREVIEW_WRITER_WINDOW = 'armed-run-capability'
    U03_PREVIEW_WRITER_WINDOW_REF = $script:WindowRef
    U03_PREVIEW_WRITER_WINDOW_SHA = $Sha
    U03_PREVIEW_WRITER_WINDOW_RUN_ID = $RunId
    U03_PREVIEW_WRITER_WINDOW_SECRET = $windowSecret
    RUBIK_AUDIT_DATABASE_URL = $url
    PROVENANCE_SIGNING_KEYS = "u03-preview-window:$signingKey"
    PROVENANCE_ACTIVE_KEY_ID = 'u03-preview-window'
  }
  return [pscustomobject]@{ Version = 1; ProjectId = $script:WindowProject; SupabaseRef = $script:WindowRef; Branch = $script:WindowBranch; Sha = $Sha; RunId = $RunId; UserSid = Get-U03WindowSid; Values = $values }
}
function Save-U03WindowBatch([Parameter(Mandatory)]$Batch, [string]$ProfileRoot = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)) {
  $plain = $null; $plainBytes = $null; $entropy = $null; $cipher = $null; $stage = $null
  try {
    if ($Batch.Version -ne 1 -or $Batch.ProjectId -cne $script:WindowProject -or $Batch.SupabaseRef -cne $script:WindowRef -or $Batch.Branch -cne $script:WindowBranch -or $Batch.UserSid -cne (Get-U03WindowSid)) { Stop-U03WindowVault 'IDENTITY_MISMATCH' }
    Test-U03WindowBatch -Batch $Batch | Out-Null
    Initialize-U03WindowDpapi
    $path = Get-U03WindowVaultPath $ProfileRoot
    $directory = Split-Path -Parent $path
    [void][IO.Directory]::CreateDirectory($directory)
    Set-U03WindowAcl $directory $true
    $plain = ConvertTo-Json -InputObject $Batch.Values -Compress
    $plainBytes = [Text.Encoding]::UTF8.GetBytes($plain)
    $entropy = Get-U03WindowEntropy $Batch.UserSid $Batch.Sha $Batch.RunId
    $cipher = [Security.Cryptography.ProtectedData]::Protect($plainBytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    $record = [ordered]@{ version=1; projectId=$Batch.ProjectId; supabaseRef=$Batch.SupabaseRef; branch=$Batch.Branch; sha=$Batch.Sha; runId=$Batch.RunId; userSid=$Batch.UserSid; ciphertext=[Convert]::ToBase64String($cipher) }
    $stage = Join-Path $directory ('.window-' + [guid]::NewGuid().ToString('N') + '.pending')
    [IO.File]::WriteAllText($stage,(ConvertTo-Json $record -Compress),[Text.UTF8Encoding]::new($false))
    Set-U03WindowAcl $stage $false
    Move-Item -LiteralPath $stage -Destination $path -Force -ErrorAction Stop
    Set-U03WindowAcl $path $false
    return $path
  } catch {
    if ($_.Exception.Message -like 'U03_WINDOW_VAULT:*') { throw }
    Stop-U03WindowVault 'VAULT_WRITE_FAILED'
  } finally {
    if ($plainBytes) { [Array]::Clear($plainBytes,0,$plainBytes.Length) }; if ($entropy) { [Array]::Clear($entropy,0,$entropy.Length) }; if ($cipher) { [Array]::Clear($cipher,0,$cipher.Length) }
    $plain=$null; $plainBytes=$null; $entropy=$null; $cipher=$null; if ($stage -and (Test-Path -LiteralPath $stage)) { Remove-Item -LiteralPath $stage -Force -ErrorAction SilentlyContinue }
  }
}
function Test-U03WindowBatch([Parameter(Mandatory)]$Batch) {
  $v = $Batch.Values
  if ($null -eq $v) { Stop-U03WindowVault 'BATCH_INCOMPLETE' }
  $required = $script:WindowNames
  foreach ($name in $required) {
    $value = $null
    if ($v -is [System.Collections.IDictionary]) { if ($v.Contains($name)) { $value = $v[$name] } }
    else { $property = $v.PSObject.Properties[$name]; if ($null -ne $property) { $value = $property.Value } }
    if ([string]::IsNullOrWhiteSpace([string]$value)) { Stop-U03WindowVault 'BATCH_INCOMPLETE' }
  }
  if ($v.U03_PREVIEW_WRITER_WINDOW -cne 'armed-run-capability' -or $v.U03_PREVIEW_WRITER_WINDOW_REF -cne $script:WindowRef -or $v.U03_PREVIEW_WRITER_WINDOW_SHA -cne $Batch.Sha -or $v.U03_PREVIEW_WRITER_WINDOW_RUN_ID -cne $Batch.RunId -or $v.PROVENANCE_ACTIVE_KEY_ID -cne 'u03-preview-window' -or $v.PROVENANCE_SIGNING_KEYS -cnotmatch '^u03-preview-window:[A-Za-z0-9+/]+={0,2}$') { Stop-U03WindowVault 'BATCH_FORMAT_INVALID' }
  try { $url = [Uri]$v.RUBIK_AUDIT_DATABASE_URL } catch { Stop-U03WindowVault 'BATCH_FORMAT_INVALID' }
  if ($url.Scheme -cne 'postgresql' -or $url.Host -cne $script:WindowPooler -or $url.Port -ne 5432 -or $url.AbsolutePath -cne '/postgres' -or $url.Query -ne '' -or $url.UserInfo -notmatch '^rubik_preview_u03_writer\.rhnnplewqsekrnaousyl:.+$' -or $v.U03_PREVIEW_WRITER_WINDOW_SECRET -notmatch '^[A-Za-z0-9_-]{64}$') { Stop-U03WindowVault 'BATCH_FORMAT_INVALID' }
  return $true
}
function Get-U03WindowBatch([string]$ProfileRoot = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)) {
  $plainBytes=$null; $entropy=$null; $cipher=$null
  try {
    $path = Get-U03WindowVaultPath $ProfileRoot
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Stop-U03WindowVault 'VAULT_ABSENT' }
    try { $record = Get-Content -LiteralPath $path -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop } catch { Stop-U03WindowVault 'VAULT_CORRUPT' }
    $sid = Get-U03WindowSid
    if ($record.version -ne 1 -or $record.projectId -cne $script:WindowProject -or $record.supabaseRef -cne $script:WindowRef -or $record.branch -cne $script:WindowBranch -or $record.userSid -cne $sid -or $record.sha -cnotmatch '^[0-9a-f]{40}$' -or $record.runId -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') { Stop-U03WindowVault 'IDENTITY_MISMATCH' }
    Initialize-U03WindowDpapi
    try { $cipher = [Convert]::FromBase64String($record.ciphertext) } catch { Stop-U03WindowVault 'VAULT_CORRUPT' }
    $entropy = Get-U03WindowEntropy $sid $record.sha $record.runId
    try { $plainBytes = [Security.Cryptography.ProtectedData]::Unprotect($cipher,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser) } catch { Stop-U03WindowVault 'VAULT_UNPROTECT_FAILED' }
    try { $parsedValues = [Text.Encoding]::UTF8.GetString($plainBytes) | ConvertFrom-Json -ErrorAction Stop } catch { Stop-U03WindowVault 'VAULT_CORRUPT' }
    $values = [ordered]@{}
    foreach ($name in $script:WindowNames) { $values[$name] = $parsedValues.$name }
    $parsedValues = $null
    $batch = [pscustomobject]@{ Version=1; ProjectId=$record.projectId; SupabaseRef=$record.supabaseRef; Branch=$record.branch; Sha=$record.sha; RunId=$record.runId; UserSid=$sid; Values=$values }
    Test-U03WindowBatch $batch | Out-Null
    return $batch
  } finally { if ($plainBytes) { [Array]::Clear($plainBytes,0,$plainBytes.Length) }; if ($entropy) { [Array]::Clear($entropy,0,$entropy.Length) }; if ($cipher) { [Array]::Clear($cipher,0,$cipher.Length) } }
}
function Remove-U03WindowBatch([string]$ProfileRoot = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)) {
  $path=Get-U03WindowVaultPath $ProfileRoot
  if (Test-Path -LiteralPath $path -PathType Leaf) { Remove-Item -LiteralPath $path -Force -ErrorAction Stop; return $true }; return $false
}
function Get-U03WindowVariableNames { return ,$script:WindowNames.Clone() }
Export-ModuleMember -Function Get-U03WindowVaultPath,New-U03WindowBatch,Save-U03WindowBatch,Get-U03WindowBatch,Test-U03WindowBatch,Remove-U03WindowBatch,Get-U03WindowVariableNames
