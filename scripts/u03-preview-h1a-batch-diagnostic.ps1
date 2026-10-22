param([switch]$ChildProbeOnly)

$ErrorActionPreference = 'Stop'
$repo = (Get-Location).Path
Import-Module (Join-Path $PSScriptRoot 'u03-preview-window-vault.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'u03-preview-h1a-batch-compare.psm1') -Force

try {
  $branch = (& git -C $repo branch --show-current 2>$null).Trim()
  $remote = (& git -C $repo remote get-url origin 2>$null).Trim()
  $batch = Get-U03WindowBatch
  if ($branch -cne 'codex/h1a-integral-20261022' -or
      $remote -cne 'https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO.git' -or
      $batch.ProjectId -cne 'prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook' -or
      $batch.SupabaseRef -cne 'rhnnplewqsekrnaousyl' -or
      $batch.Branch -cne $branch -or
      $batch.Sha -cne '0c06a300f3870af9cca5e5468a9401ccf7488b41' -or
      $batch.RunId -cne 'f7ee4d0a-edb4-4276-88fc-03bbab570a19') {
    throw 'H1A_RECOVERY_VAULT_IDENTITY_MISMATCH'
  }
  Write-Output 'H1A_RECOVERY_TRANSPORT stage=DPAPI category=PRESENT_MATCH'
  $stage = if ($ChildProbeOnly) { 'CHILD_ENV' } else { 'PROCESS_ENV' }
  $rows = @(Compare-H1ABatchValues -Expected $batch.Values -ReadValue {
      param($name) [Environment]::GetEnvironmentVariable($name)
    } -Stage $stage)
  foreach ($row in $rows) {
    Write-Output "H1A_RECOVERY_TRANSPORT stage=$($row.Stage) name=$($row.Name) category=$($row.Category)"
  }
  if ($rows.Category -ccontains 'ABSENT' -or $rows.Category -ccontains 'EMPTY' -or
      $rows.Category -ccontains 'PRESENT_MISMATCH') { exit 2 }
  if (-not $ChildProbeOnly) {
    $child = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -ChildProbeOnly 2>$null
    $childExit = $LASTEXITCODE
    foreach ($line in @($child)) {
      if ($line -cmatch '^H1A_RECOVERY_TRANSPORT stage=(?:DPAPI category=PRESENT_MATCH|CHILD_ENV name=(?:U03_PREVIEW_WRITER_WINDOW|U03_PREVIEW_WRITER_WINDOW_REF|U03_PREVIEW_WRITER_WINDOW_SHA|U03_PREVIEW_WRITER_WINDOW_RUN_ID|U03_PREVIEW_WRITER_WINDOW_SECRET|RUBIK_AUDIT_DATABASE_URL|PROVENANCE_SIGNING_KEYS|PROVENANCE_ACTIVE_KEY_ID) category=(?:ABSENT|EMPTY|PRESENT_MATCH|PRESENT_MISMATCH))$') {
        Write-Output $line
      }
    }
    if ($childExit -ne 0) { exit 3 }
  }
} catch {
  Write-Output 'H1A_RECOVERY_TRANSPORT stage=DIAGNOSTIC category=BLOCKED'
  exit 4
} finally { $batch = $null }
