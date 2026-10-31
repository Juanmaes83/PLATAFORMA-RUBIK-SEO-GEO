$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'u03-preview-h1a-batch-compare.psm1') -Force
$names = @('U03_PREVIEW_WRITER_WINDOW','U03_PREVIEW_WRITER_WINDOW_REF','U03_PREVIEW_WRITER_WINDOW_SHA',
  'U03_PREVIEW_WRITER_WINDOW_RUN_ID','U03_PREVIEW_WRITER_WINDOW_SECRET','RUBIK_AUDIT_DATABASE_URL',
  'PROVENANCE_SIGNING_KEYS','PROVENANCE_ACTIVE_KEY_ID')
$expected = @{}; foreach ($name in $names) { $expected[$name] = "fictional-$name" }
$observed = @{}; foreach ($name in $names) { $observed[$name] = $expected[$name] }
$read = { param($name) $observed[$name] }
$pass = @(Compare-H1ABatchValues -Expected $expected -ReadValue $read)
if ($pass.Count -ne 8 -or @($pass | Where-Object Category -ne 'PRESENT_MATCH').Count -ne 0) { throw 'MATCH_REGRESSION_FAILED' }
$observed.Remove($names[0]); $missing = @(Compare-H1ABatchValues -Expected $expected -ReadValue $read)
if ($missing[0].Category -ne 'ABSENT') { throw 'ABSENT_REGRESSION_FAILED' }
$observed[$names[0]] = ''; $empty = @(Compare-H1ABatchValues -Expected $expected -ReadValue $read)
if ($empty[0].Category -ne 'EMPTY') { throw 'EMPTY_REGRESSION_FAILED' }
$observed[$names[0]] = 'fictional-different'; $different = @(Compare-H1ABatchValues -Expected $expected -ReadValue $read)
if ($different[0].Category -ne 'PRESENT_MISMATCH') { throw 'MISMATCH_REGRESSION_FAILED' }
$expected.Remove($names[0]); try { $null = Compare-H1ABatchValues -Expected $expected -ReadValue $read; throw 'INCOMPLETE_REGRESSION_FAILED' }
catch { if ($_.Exception.Message -ne 'H1A_BATCH_EXPECTATION_INCOMPLETE') { throw } }
$metadata = @($names | ForEach-Object { [pscustomobject]@{key=$_;type='sensitive';gitBranch='codex/h1a-integral-20261022';target=@('preview')} })
$metaPass = @(Compare-H1ABatchMetadata $metadata)
if ($metaPass.Count -ne 8 -or @($metaPass | Where-Object Category -ne 'PRESENT_MATCH').Count) { throw 'METADATA_MATCH_REGRESSION_FAILED' }
$wrongBranch = @($metadata | ForEach-Object { $_.PSObject.Copy() }); $wrongBranch[0].gitBranch='other-branch'
if ((@(Compare-H1ABatchMetadata $wrongBranch))[0].Category -ne 'PRESENT_MISMATCH') { throw 'BRANCH_REGRESSION_FAILED' }
$missingMetadata = @($metadata | Select-Object -Skip 1)
if ((@(Compare-H1ABatchMetadata $missingMetadata))[0].Category -ne 'ABSENT') { throw 'METADATA_ABSENT_REGRESSION_FAILED' }
if (-not (Test-H1ABatchDelivery @($pass)) -or -not (Test-H1ABatchDelivery @($missing)) -or
    -not (Test-H1ABatchDelivery @($empty)) -or (Test-H1ABatchDelivery @($different))) { throw 'DELIVERY_GATE_REGRESSION_FAILED' }
'H1A_BATCH_COMPARE_TEST PASS cases=match,absent,empty,mismatch,incomplete,branch,metadata,delivery'
