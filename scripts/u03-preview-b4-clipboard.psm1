Set-StrictMode -Version Latest

function Clear-B4Clipboard {
  [CmdletBinding()]
  param([scriptblock]$Clearer = { Set-Clipboard -Value '' -ErrorAction Stop })

  try { & $Clearer }
  catch { throw 'U03 B-4 BLOCKED: CLIPBOARD_CLEAR_FAILED. No fixtures will be created unless every preflight passes.' }
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
    if ($confirmation -cne 'LISTO') {
      throw 'U03 B-4 BLOCKED: CLIPBOARD_CONFIRMATION_REQUIRED. No fixtures will be created unless every preflight passes.'
    }

    try { $clipboardValue = & $Reader }
    catch { throw 'U03 B-4 BLOCKED: CLIPBOARD_READ_FAILED. No fixtures will be created unless every preflight passes.' }
    finally { Clear-B4Clipboard -Clearer $Clearer }

    if ($clipboardValue -isnot [string] -or $clipboardValue -match '[\r\n]' -or
        $clipboardValue -cnotmatch ('^' + [regex]::Escape($ExpectedPrefix) + '[A-Za-z0-9_-]+$')) {
      throw 'U03 B-4 BLOCKED: CLIPBOARD_VALUE_INVALID. No fixtures will be created unless every preflight passes.'
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

Export-ModuleMember -Function Clear-B4Clipboard, Read-B4ClipboardSecret
