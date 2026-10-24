// Windows PowerShell 5.1 stdin transport self-test. Fictional text only.
import { readFileSync } from 'node:fs';
let input=null;
try { input=JSON.parse(readFileSync(0,'utf8')); } catch { /* closed result */ }
const expected='fictional-only-ñ東京-:/?&%';
const oidcValid=process.env.H1A_TEST_REQUIRE_OIDC!=='1' ||
  process.env.VERCEL_OIDC_TOKEN==='fictional-oidc-only';
const valid=oidcValid && input?.adminKey===expected && /^[0-9a-f-]{36}$/i.test(input?.runId??'') &&
  /^dpl_[A-Za-z0-9]+$/.test(process.env.U03_PIN_DEPLOYMENT_ID??'') &&
  /^[0-9a-f]{40}$/.test(process.env.U03_PIN_DEPLOYMENT_SHA??'');
process.stdout.write(`H1A_AUTH_LOGIN_PROBE ${JSON.stringify({status:valid?'PASS':'BLOCKED',
  code:valid?'AUTH_CLEANUP_ONLY':'PRECHECK_FAILED',cleanup:valid?'PASS':'BLOCKED',
  runId:input?.runId??'',ref:'rhnnplewqsekrnaousyl',
  deploymentId:process.env.U03_PIN_DEPLOYMENT_ID??'',sha:process.env.U03_PIN_DEPLOYMENT_SHA??''})}\n`);
if (!valid) process.exitCode=1;
