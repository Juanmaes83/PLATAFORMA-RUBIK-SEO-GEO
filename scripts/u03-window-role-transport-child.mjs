const PASS_ID = 'a8f2d946-07ab-4bb9-8901-35f7993f1266';
const FAILURE_ID = 'f9c7f203-3f09-4eb2-bcc0-37db2cc6a782';
const FAKE_PASSWORD = `Ficticia-\u00f1-\u6771\u4eac-\u{1f510}`;
const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  try {
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
    } else process.exitCode = 42;
  } catch {
    process.exitCode = 43;
  }
});
