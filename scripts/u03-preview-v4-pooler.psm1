Set-StrictMode -Version Latest

$script:U03PreviewRef = 'rhnnplewqsekrnaousyl'
$script:U03PreviewPoolerHost = 'aws-1-eu-west-3.pooler.supabase.com'
$script:U03PreviewPoolerPort = 5432
$script:U03PreviewPoolerUser = 'postgres'
$script:U03PreviewDatabase = 'postgres'

function Assert-U03PreviewPoolerTarget {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$HostName,
    [Parameter(Mandatory)][int]$Port,
    [Parameter(Mandatory)][string]$UserName,
    [Parameter(Mandatory)][string]$ProjectRef,
    [Parameter(Mandatory)][string]$Database
  )

  if ($HostName -cne $script:U03PreviewPoolerHost -or $Port -ne $script:U03PreviewPoolerPort -or
      $UserName -cne $script:U03PreviewPoolerUser -or $ProjectRef -cne $script:U03PreviewRef -or
      $Database -cne $script:U03PreviewDatabase) {
    throw 'V4_SESSION_POOLER_TARGET_REJECTED'
  }
}

function New-U03PreviewAdminPoolerUrlFromPlaintext {
  [CmdletBinding()]
  param([Parameter(Mandatory)][AllowEmptyString()][string]$PasswordText)
  Assert-U03PreviewPoolerTarget -HostName $script:U03PreviewPoolerHost -Port $script:U03PreviewPoolerPort `
    -UserName $script:U03PreviewPoolerUser -ProjectRef $script:U03PreviewRef -Database $script:U03PreviewDatabase
  if ($PasswordText.Length -eq 0) { throw 'V4_DATABASE_PASSWORD_REQUIRED' }

  $escapedUser = [Uri]::EscapeDataString("$($script:U03PreviewPoolerUser).$($script:U03PreviewRef)")
  $escapedPassword = [Uri]::EscapeDataString($PasswordText)
  # Keep URI user-info RFC 3986-safe even on Windows PowerShell/.NET Framework,
  # whose EscapeDataString may leave these reserved characters unescaped.
  $escapedPassword = $escapedPassword.Replace('!', '%21').Replace("'", '%27').Replace('(', '%28').Replace(')', '%29').Replace('*', '%2A')
  return "postgresql://${escapedUser}:${escapedPassword}@$($script:U03PreviewPoolerHost):$($script:U03PreviewPoolerPort)/$($script:U03PreviewDatabase)"
}

function New-U03PreviewAdminPoolerUrl {
  [CmdletBinding()]
  param([Parameter(Mandatory)][System.Security.SecureString]$DatabasePassword)

  if ($DatabasePassword.Length -eq 0) { throw 'V4_DATABASE_PASSWORD_REQUIRED' }
  $bstr = [IntPtr]::Zero
  $plainPassword = $null
  try {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($DatabasePassword)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    return New-U03PreviewAdminPoolerUrlFromPlaintext -PasswordText $plainPassword
  } finally {
    $plainPassword = $null
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  }
}

function ConvertFrom-U03PsqlDiagnostic {
  [CmdletBinding()]
  param([string]$ErrorText, [int]$ExitCode, [string]$OutputText)

  if ($ExitCode -eq 0 -and $OutputText.Trim() -eq 'postgres|postgres|postgres') {
    return [pscustomobject]@{ Status = 'PASS'; Category = 'DATABASE'; Code = 'PREVIEW_POOLER_IDENTITY_VERIFIED' }
  }
  if ($ErrorText -match '(?i)could not translate host|could not resolve|name or service not known|no such host') {
    return [pscustomobject]@{ Status = 'FAIL'; Category = 'DNS'; Code = 'DNS_RESOLUTION_FAILED' }
  }
  if ($ErrorText -match '(?i)connection timed out|connection refused|could not connect|no route to host') {
    return [pscustomobject]@{ Status = 'FAIL'; Category = 'TCP'; Code = 'TCP_CONNECTION_FAILED' }
  }
  if ($ErrorText -match '(?i)certificate verify failed|certificate.*(invalid|verify)|root certificate file|SSL error|SSL SYSCALL|tls') {
    return [pscustomobject]@{ Status = 'FAIL'; Category = 'TLS'; Code = 'TLS_CERTIFICATE_OR_HANDSHAKE_REJECTED' }
  }
  if ($ErrorText -match '(?i)password authentication failed|no password supplied|28P01') {
    return [pscustomobject]@{ Status = 'FAIL'; Category = 'AUTHENTICATION'; Code = 'DATABASE_AUTHENTICATION_REJECTED' }
  }
  if ($ErrorText -match '(?i)permission denied|42501') {
    return [pscustomobject]@{ Status = 'FAIL'; Category = 'PERMISSION'; Code = 'SQL_PERMISSION_DENIED' }
  }
  return [pscustomobject]@{ Status = 'FAIL'; Category = 'DATABASE'; Code = 'PSQL_CONNECTION_OR_IDENTITY_FAILED' }
}

Export-ModuleMember -Function Assert-U03PreviewPoolerTarget, New-U03PreviewAdminPoolerUrl, New-U03PreviewAdminPoolerUrlFromPlaintext, ConvertFrom-U03PsqlDiagnostic
