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

function New-U03PreviewAdminPoolerUrl {
  [CmdletBinding()]
  param([Parameter(Mandatory)][System.Security.SecureString]$DatabasePassword)

  Assert-U03PreviewPoolerTarget -HostName $script:U03PreviewPoolerHost -Port $script:U03PreviewPoolerPort `
    -UserName $script:U03PreviewPoolerUser -ProjectRef $script:U03PreviewRef -Database $script:U03PreviewDatabase
  if ($DatabasePassword.Length -eq 0) { throw 'V4_DATABASE_PASSWORD_REQUIRED' }

  $bstr = [IntPtr]::Zero
  $plainPassword = $null
  try {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($DatabasePassword)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    $escapedUser = [Uri]::EscapeDataString("$($script:U03PreviewPoolerUser).$($script:U03PreviewRef)")
    $escapedPassword = [Uri]::EscapeDataString($plainPassword)
    # Keep URI user-info RFC 3986-safe even on Windows PowerShell/.NET Framework,
    # whose EscapeDataString may leave these reserved characters unescaped.
    $escapedPassword = $escapedPassword.Replace('!', '%21').Replace("'", '%27').Replace('(', '%28').Replace(')', '%29').Replace('*', '%2A')
    return "postgresql://${escapedUser}:${escapedPassword}@$($script:U03PreviewPoolerHost):$($script:U03PreviewPoolerPort)/$($script:U03PreviewDatabase)"
  }
  finally {
    $plainPassword = $null
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  }
}

Export-ModuleMember -Function Assert-U03PreviewPoolerTarget, New-U03PreviewAdminPoolerUrl
