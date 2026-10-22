// Read-only transport diagnostic for the already blocked U03 role.
import { createPreviewRolePool, previewWindowRolePassword } from './u03-window-role-preflight.mjs';

const allowed = new Set(['28P01','28000','08P01','57P03','53300','42501']);
let pool;
try {
  const password = previewWindowRolePassword(process.env);
  pool = createPreviewRolePool(password);
  let client;
  try {
    client = await pool.connect();
    process.stdout.write('U03_NOLOGIN_PROBE BLOCKED code=UNEXPECTED_LOGIN_SUCCESS\n');
    process.exitCode = 1;
  } catch (error) {
    const sqlstate = typeof error?.code === 'string' && allowed.has(error.code.toUpperCase())
      ? error.code.toUpperCase() : null;
    const classCandidate = String(error?.constructor?.name ?? '');
    const errorClass = /^[A-Za-z]{1,32}(?:Error|Exception)$/.test(classCandidate) ? classCandidate : 'OTHER_CLASS';
    const category = sqlstate?.startsWith('28') ? 'AUTH_REJECTED'
      : sqlstate ? 'SQLSTATE_REJECTED'
        : error?.name === 'ClientError' ? 'POOLER_CLIENT_REJECTED' : 'OTHER_REJECTION';
    process.stdout.write(`U03_NOLOGIN_PROBE PASS category=${category} code=${sqlstate ?? 'NO_SQLSTATE'} class=${errorClass}\n`);
  } finally { client?.release(); }
} catch {
  process.stdout.write('U03_NOLOGIN_PROBE BLOCKED code=PREPARATION_FAILED\n');
  process.exitCode = 1;
} finally { await pool?.end().catch(() => {}); }
