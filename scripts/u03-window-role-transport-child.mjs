const PASS_ID = 'a8f2d946-07ab-4bb9-8901-35f7993f1266';
const FAILURE_ID = 'f9c7f203-3f09-4eb2-bcc0-37db2cc6a782';
const RECOVERY_ID = '840261c6-e410-4e25-893a-9206fd3f74ef';
const FAKE_PASSWORD = `Ficticia-\u00f1-\u6771\u4eac-\u{1f510}`;
const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  try {
    if (process.argv.includes('--local-preflight-only')) {
      if (process.env.RUBIK_RECOVERY_SCHEMA_ATTESTATION === 'pre-n2-through-20261015210000')
        process.stdout.write(`U03_PREVIEW_WINDOW_LOCAL_PREFLIGHT PASS runId=${PASS_ID} deploymentId=dpl_Fictional123 sha=${process.env.U03_FUNCTIONAL_SHA}\n`);
      else { process.stdout.write('U03_PREVIEW_WINDOW_LOCAL_PREFLIGHT BLOCKED; no database operation was attempted\n'); process.exitCode = 1; }
      return;
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (input.databasePassword !== FAKE_PASSWORD) process.exitCode = 41;
    else if (input.mode === 'run' && input.runId === PASS_ID) {
      process.stdout.write(`U03_WINDOW_ROLE_RESULT PASS runId=${PASS_ID} roleRemoved=true policies=0 inventoryZero=true outboxTotal=0 pending=0\n`);
    } else if (input.mode === 'run' && input.runId === FAILURE_ID) {
      process.stdout.write(`U03_WINDOW_ROLE_RESULT BLOCKED runId=${FAILURE_ID} roleRemoved=false policies=0 inventoryZero=true outboxTotal=0 pending=0\n`);
      process.exitCode = 17;
    } else if (input.mode === 'contain' && input.runId === FAILURE_ID) {
      process.stdout.write(`U03_WINDOW_ROLE_CONTAINMENT PASS runId=${FAILURE_ID} rolePresent=false roleLocked=null policies=0 activeSessions=0 inventoryZero=true outboxTotal=0 pending=0\n`);
    } else if (input.mode === 'diagnose' && input.runId === FAILURE_ID) {
      process.stdout.write(`U03_WINDOW_ROLE_READONLY_DIAGNOSTIC BLOCKED runId=${FAILURE_ID} category=DNS code=EAI_AGAIN sqlstate=NONE condition=NONE\n`);
      process.exitCode = 1;
    } else if (input.mode === 'recover' && input.runId === RECOVERY_ID) {
      process.stdout.write(`U03_WINDOW_RECOVERY PASS runId=${RECOVERY_ID} rolePresent=false policies=0 sessions=0 inventoryZero=true outboxTotal=0 pending=0 guardOriginal=true writerLocked=true\n`);
    } else process.exitCode = 42;
  } catch {
    process.exitCode = 43;
  }
});
