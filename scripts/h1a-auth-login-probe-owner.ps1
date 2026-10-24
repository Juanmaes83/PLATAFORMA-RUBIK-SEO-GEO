param(
  [Parameter(Mandatory)][string]$RunId,
  [Parameter(Mandatory)][string]$DeploymentId,
  [Parameter(Mandatory)][string]$DeploymentHost,
  [Parameter(Mandatory)][string]$DeploymentSha,
  [switch]$TeardownOnly,
  [switch]$TransportSelfTestOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repo=(Get-Location).Path
$expectedRepo='C:\Users\temp123\Documents\ChatGPT\rubik-h1a-20261022'
$branch='codex/h1a-integral-20261022'
$owner=Join-Path $PSScriptRoot 'u03-preview-b4-owner.ps1'
$child=Join-Path $PSScriptRoot 'h1a-auth-login-probe.mjs'
$transportChild=Join-Path $PSScriptRoot 'h1a-auth-login-transport-child.mjs'
Import-Module (Join-Path $PSScriptRoot 'u03-preview-b4-clipboard.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'u03-preview-window-vault.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'u03-preview-window-configuration.psm1') -Force

function Stop-Probe([string]$Code) { throw "H1A_AUTH_LOGIN_PROBE BLOCKED code=$Code" }
function Invoke-SafeVercel([string[]]$Arguments) {
  $process=$null
  try {
    $cli=(Get-Command vercel.cmd -ErrorAction Stop).Source
    $psi=[Diagnostics.ProcessStartInfo]::new()
    $psi.FileName=$env:ComSpec
    $psi.Arguments='/d /s /c ""' + $cli + '" ' + ($Arguments -join ' ') + '"'
    $psi.WorkingDirectory=$repo
    $psi.UseShellExecute=$false; $psi.CreateNoWindow=$true
    $psi.RedirectStandardInput=$true; $psi.RedirectStandardOutput=$true; $psi.RedirectStandardError=$true
    $process=[Diagnostics.Process]::new(); $process.StartInfo=$psi
    if (-not $process.Start()) { return [pscustomobject]@{ExitCode=1;Output='';DeploymentNotFound=$false} }
    $outTask=$process.StandardOutput.ReadToEndAsync(); $errTask=$process.StandardError.ReadToEndAsync()
    $process.StandardInput.Close()
    if (-not $process.WaitForExit(120000)) { try { $process.Kill() } catch {}; return [pscustomobject]@{ExitCode=1;Output='';DeploymentNotFound=$false} }
    $output=$outTask.GetAwaiter().GetResult()
    $errorText=$errTask.GetAwaiter().GetResult()
    $notFound=$process.ExitCode -ne 0 -and ($errorText -match 'Deployment not found \(404\)' -or $output -match 'Deployment not found \(404\)')
    return [pscustomobject]@{ExitCode=$process.ExitCode;Output=$output;DeploymentNotFound=[bool]$notFound}
  } catch { return [pscustomobject]@{ExitCode=1;Output='';DeploymentNotFound=$false} }
  finally { if ($process) { $process.Dispose() } }
}
function Invoke-ProbeChild([string]$AdminKey,[bool]$CleanupOnly,[string]$ChildPath=$child) {
  $process=$null; $bytes=$null; $payload=$null
  try {
    $node=(Get-Command node.exe -ErrorAction Stop).Source
    $psi=[Diagnostics.ProcessStartInfo]::new()
    $psi.FileName=$node
    if ($ChildPath -cnotin @($child,$transportChild)) { return [pscustomobject]@{Status='BLOCKED';Code='CHILD_PATH_REJECTED';Cleanup='BLOCKED'} }
    $psi.Arguments='--conditions=react-server "' + $ChildPath + '"' + $(if ($CleanupOnly) { ' --cleanup-only' } else { '' })
    $psi.WorkingDirectory=$repo
    $psi.UseShellExecute=$false; $psi.CreateNoWindow=$true
    $psi.RedirectStandardInput=$true; $psi.RedirectStandardOutput=$true; $psi.RedirectStandardError=$true
    $psi.EnvironmentVariables.Clear()
    foreach ($name in @('PATH','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','HOMEDRIVE','HOMEPATH','COMSPEC','PATHEXT',
      'HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','NODE_USE_ENV_PROXY','NODE_USE_SYSTEM_CA','VERCEL_OIDC_TOKEN')) {
      $value=[Environment]::GetEnvironmentVariable($name)
      if (-not [string]::IsNullOrEmpty($value)) { $psi.EnvironmentVariables[$name]=$value }
    }
    $psi.EnvironmentVariables['U03_PIN_DEPLOYMENT_ID']=$DeploymentId
    $psi.EnvironmentVariables['U03_PIN_DEPLOYMENT_HOST']=$DeploymentHost
    $psi.EnvironmentVariables['U03_PIN_DEPLOYMENT_SHA']=$DeploymentSha
    $psi.EnvironmentVariables['U03_PIN_DEPLOYMENT_BRANCH']=$branch
    $payload=@{runId=$RunId;adminKey=$AdminKey} | ConvertTo-Json -Compress
    $bytes=[Text.UTF8Encoding]::new($false).GetBytes($payload + "`n")
    $process=[Diagnostics.Process]::new(); $process.StartInfo=$psi
    if (-not $process.Start()) { return [pscustomobject]@{Status='BLOCKED';Code='CHILD_START_FAILED';Cleanup='BLOCKED'} }
    $outTask=$process.StandardOutput.ReadToEndAsync(); $errTask=$process.StandardError.ReadToEndAsync()
    $stream=$process.StandardInput.BaseStream; $stream.Write($bytes,0,$bytes.Length); $stream.Flush(); $process.StandardInput.Close()
    if (-not $process.WaitForExit(120000)) { try { $process.Kill() } catch {}; return [pscustomobject]@{Status='BLOCKED';Code='CHILD_TIMEOUT';Cleanup='BLOCKED'} }
    $output=$outTask.GetAwaiter().GetResult(); $null=$errTask.GetAwaiter().GetResult()
    $lines=@($output -split "`r?`n" | Where-Object { $_ -cmatch '^H1A_AUTH_LOGIN_PROBE \{' })
    if (@($lines).Count -ne 1) { return [pscustomobject]@{Status='BLOCKED';Code='CHILD_RESULT_MISSING';Cleanup='BLOCKED'} }
    $result=$lines[0].Substring('H1A_AUTH_LOGIN_PROBE '.Length) | ConvertFrom-Json
    if ([string]::IsNullOrEmpty([string]$result.runId)) { return [pscustomobject]@{Status='BLOCKED';Code='CHILD_RUN_EMPTY';Cleanup='BLOCKED'} }
    if ($result.runId -cne $RunId) { return [pscustomobject]@{Status='BLOCKED';Code='CHILD_RUN_MISMATCH';Cleanup='BLOCKED'} }
    if ($result.deploymentId -cne $DeploymentId) { return [pscustomobject]@{Status='BLOCKED';Code='CHILD_DEPLOYMENT_MISMATCH';Cleanup='BLOCKED'} }
    if ($result.sha -cne $DeploymentSha) { return [pscustomobject]@{Status='BLOCKED';Code='CHILD_SHA_MISMATCH';Cleanup='BLOCKED'} }
    if ($result.ref -cne 'rhnnplewqsekrnaousyl') { return [pscustomobject]@{Status='BLOCKED';Code='CHILD_REF_MISMATCH';Cleanup='BLOCKED'} }
    if ($result.status -cnotin @('PASS','BLOCKED') -or $result.cleanup -cnotin @('PASS','BLOCKED')) {
      return [pscustomobject]@{Status='BLOCKED';Code='CHILD_STATUS_INVALID';Cleanup='BLOCKED'}
    }
    if ($result.status -ceq 'PASS' -and $process.ExitCode -ne 0) {
      return [pscustomobject]@{Status='BLOCKED';Code='CHILD_EXIT_MISMATCH';Cleanup='BLOCKED'}
    }
    $allowedCodes=@('PRECHECK_FAILED','AUTH_CREATE_FAILED','LOGIN_POST_FAILED','SESSION_NOT_CONFIRMED','XHR_NOT_OBSERVED',
      'XHR_INCOMPLETE','XHR_INTERCEPTION_BLOCKED','XHR_EXTERNAL','XHR_PROTOCOL_INVALID','AUTH_CLEANUP_FAILED','LEDGER_FAILED','PROBE_FAILED','AUTH_CLEANUP_ONLY')
    $code=if ($result.code -in $allowedCodes) { [string]$result.code } else { 'NONE' }
    return [pscustomobject]@{Status=[string]$result.status;Code=$code;Cleanup=[string]$result.cleanup;ExitCode=$process.ExitCode}
  } catch { return [pscustomobject]@{Status='BLOCKED';Code='CHILD_TRANSPORT_FAILED';Cleanup='BLOCKED'} }
  finally {
    if ($bytes) { [Array]::Clear($bytes,0,$bytes.Length) }
    $payload=$null; $AdminKey=$null
    if ($process) { $process.Dispose() }
  }
}

if ([IO.Path]::GetFullPath($repo) -cne [IO.Path]::GetFullPath($expectedRepo)) { Stop-Probe 'CHECKOUT_MISMATCH' }
if ($RunId -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' -or
    $DeploymentId -cnotmatch '^dpl_[A-Za-z0-9]+$' -or
    $DeploymentHost -cnotmatch '^[a-z0-9-]+\.vercel\.app$' -or
    $DeploymentSha -cnotmatch '^[0-9a-f]{40}$') { Stop-Probe 'PIN_FORMAT_INVALID' }
$head=(& git -C $repo rev-parse HEAD).Trim()
$actualBranch=(& git -C $repo branch --show-current).Trim()
$dirty=(& git -C $repo status --porcelain --untracked-files=no | Out-String).Trim()
if ($TransportSelfTestOnly) {
  if ($actualBranch -cne $branch) { Stop-Probe 'GIT_BRANCH_MISMATCH' }
  $fake='fictional-only-' + [char]0x00f1 + [char]0x6771 + [char]0x4eac + '-:/?&%'
  $test=Invoke-ProbeChild -AdminKey $fake -CleanupOnly $false -ChildPath $transportChild
  if ($test.Status -cne 'PASS' -or $test.Cleanup -cne 'PASS') { Stop-Probe ('TRANSPORT_SELFTEST_' + $test.Code) }
  $recover=Invoke-ProbeChild -AdminKey $fake -CleanupOnly $true -ChildPath $transportChild
  if ($recover.Status -cne 'PASS' -or $recover.Cleanup -cne 'PASS') { Stop-Probe ('TRANSPORT_RECOVERY_SELFTEST_' + $recover.Code) }
  Write-Output 'H1A_AUTH_LOGIN_PROBE_TRANSPORT PASS powershell=5.1 encoding=UTF8 stdin=memory child=real'
  return
}
if ($head -cne $DeploymentSha -or $actualBranch -cne $branch -or $dirty) { Stop-Probe 'GIT_PIN_MISMATCH' }
$batch=Get-U03WindowBatch
if ($batch.Sha -cne $head -or $batch.RunId -cne $RunId -or $batch.Branch -cne $branch -or
    $batch.SupabaseRef -cne 'rhnnplewqsekrnaousyl') { Stop-Probe 'BATCH_PIN_MISMATCH' }

if ($TeardownOnly) {
  $cli={ param($Arguments,$InputText) Invoke-SafeVercel -Arguments $Arguments }
  $remove={ param($Id) Invoke-SafeVercel -Arguments @('remove',$Id,'--yes') }
  $result=Remove-U03WindowDeploymentConfigurationSafe -DeploymentId $DeploymentId -Cli $cli -RemoveDeployment $remove
  if (-not $result.Passed) { Stop-Probe $result.Code }
  $gone=Invoke-SafeVercel -Arguments @('api',"/v13/deployments/${DeploymentId}?teamId=team_hLhdb3M9MviTIysXD9whFF2c")
  if (-not $gone.DeploymentNotFound) { Stop-Probe 'DEPLOYMENT_ABSENCE_UNVERIFIED' }
  if (-not (Remove-U03WindowBatch)) { Stop-Probe 'VAULT_REMOVE_FAILED' }
  if (Test-Path -LiteralPath (Get-U03WindowVaultPath)) { Stop-Probe 'VAULT_ABSENCE_UNVERIFIED' }
  Write-Output "H1A_AUTH_LOGIN_PROBE_TEARDOWN PASS runId=$RunId variables=ABSENT deployment=ABSENT vault=ABSENT"
  return
}

$credentials=$null; $cleanup=$null; $result=$null; $phase='ATTESTATION'
try {
  & $owner -WindowBatchAttestationOnly -DeploymentId $DeploymentId -DeploymentHost $DeploymentHost -DeploymentSha $DeploymentSha -RunId $RunId | Out-Null
  $phase='CREDENTIAL_LOAD'
  $credentials=Get-B4PreviewCredentials
  if ($credentials.ProjectRef -cne 'rhnnplewqsekrnaousyl') { Stop-Probe 'PREVIEW_KEY_REF_MISMATCH' }
  $phase='CHILD_PROBE'
  $result=Invoke-ProbeChild -AdminKey ([string]$credentials.AdminKey) -CleanupOnly $false
  Write-Output "H1A_AUTH_LOGIN_PROBE_RESULT status=$($result.Status) code=$($result.Code) cleanup=$($result.Cleanup) runId=$RunId"
} catch {
  Write-Output "H1A_AUTH_LOGIN_PROBE_WRAPPER BLOCKED phase=$phase code=WRAPPER_PHASE_FAILED runId=$RunId"
  throw 'H1A_AUTH_LOGIN_PROBE_WRAPPER_BLOCKED'
} finally {
  if ($credentials) {
    $cleanup=Invoke-ProbeChild -AdminKey ([string]$credentials.AdminKey) -CleanupOnly $true
    $credentials.AdminKey=$null; $credentials.PublicKey=$null
  }
  if ($cleanup) { Write-Output "H1A_AUTH_LOGIN_PROBE_CONTAINMENT status=$($cleanup.Status) code=$($cleanup.Code) cleanup=$($cleanup.Cleanup) runId=$RunId" }
}
if (-not $result -or $result.Status -cne 'PASS' -or -not $cleanup -or $cleanup.Cleanup -cne 'PASS') { Stop-Probe 'PROBE_OR_CLEANUP_BLOCKED' }
