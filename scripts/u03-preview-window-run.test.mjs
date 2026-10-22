import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createWindowLedger, pinIsExact, preflightSequencePreviewKeys, runPreviewWindowSequence, validateWindowRuntimeConfiguration, verifyH1ADiagnosticIntervals, verifyProtectedWindowBatch, verifyWindowLedgerComplete } from './u03-preview-window-run.mjs';
import { createPreviewWindowAttestation } from '../src/lib/provenance/keyring.ts';

const RUN = 'c14f4c11-570f-4e03-a3a1-33a702b85baa';
const PIN = { deploymentId: 'dpl_Fictional123', host: 'preview-fixed.example', sha: 'a'.repeat(40), branch: 'codex/h1a-integral-20261022' };
const ROLE_URL = new URL('postgresql://placeholder@aws-1-eu-west-3.pooler.supabase.com:5432/postgres');
ROLE_URL.username = 'rubik_preview_u03_writer.rhnnplewqsekrnaousyl';
ROLE_URL.password = 'FictionalRolePassword_123456789012345678901234';
const ENV = { U03_PIN_DEPLOYMENT_ID: PIN.deploymentId, U03_PIN_DEPLOYMENT_HOST: PIN.host,
  U03_PIN_DEPLOYMENT_SHA: PIN.sha, U03_PIN_DEPLOYMENT_BRANCH: PIN.branch, U03_FUNCTIONAL_SHA: PIN.sha,
  U03_PREVIEW_WRITER_WINDOW: 'armed-run-capability', U03_PREVIEW_WRITER_WINDOW_REF: 'rhnnplewqsekrnaousyl',
  U03_PREVIEW_WRITER_WINDOW_SHA: PIN.sha, U03_PREVIEW_WRITER_WINDOW_RUN_ID: RUN,
  U03_PREVIEW_WRITER_WINDOW_SECRET: 'fictional-only-window-secret', RUBIK_AUDIT_DATABASE_URL: ROLE_URL.toString() };
const VERIFIED = { vercel: { deploymentId: PIN.deploymentId, host: PIN.host, sha: PIN.sha, supabaseRef: 'rhnnplewqsekrnaousyl' },
  initial: { projectRef: 'rhnnplewqsekrnaousyl', migrationCount: 27, writerLocked: true, outboxTotal: 0, pendingOutbox: 0 } };

test('H1-A ledger verifier requires every diagnostic boundary and reconciles deltas to each gate', async () => {
  const empty = () => ({ console: {}, http: {}, requestFailures: {}, routeEvents: {} });
  const rows = [];
  const visualGroups = [
    ['before-login','after-login','before-navigation','after-navigation','before-measurement','after-measurement'],
    ['before-navigation','after-navigation','before-measurement','after-measurement'],
    ['before-navigation','after-navigation','before-measurement','after-measurement'],
    ['before-navigation','after-navigation','before-measurement','after-measurement'],
  ];
  for (const [groupIndex, boundaries] of visualGroups.entries()) {
    let cumulative = empty();
    for (const interval of boundaries) {
      const before = structuredClone(cumulative);
      if (interval === 'after-navigation') cumulative.http['200:preview'] = 1;
      const after = structuredClone(cumulative);
      const delta = empty();
      for (const name of Object.keys(delta)) for (const [key, value] of Object.entries(after[name]))
        delta[name][key] = value - (before[name][key] ?? 0);
      rows.push({ caseId: 'h1a-diagnostic-boundary', status: interval.startsWith('before-') ? 'ATTEMPTED' : 'PASS',
        diagnosticInterval: interval, diagnosticsBefore: before, diagnosticsAfter: after, diagnosticsDelta: delta });
    }
    rows.push({ caseId: groupIndex % 2 ? 'visual-h1a-report' : 'visual-h1a-measurement', status: 'PASS',
      viewport: groupIndex < 2 ? 'desktop' : 'mobile', consoleErrorCount: 0, diagnostics: { ...cumulative, http: { '200:preview': 1 } } });
  }
  assert.equal(verifyH1ADiagnosticIntervals(rows), true);
  const missingStage = structuredClone(rows);
  missingStage.splice(0, 1);
  assert.equal(verifyH1ADiagnosticIntervals(missingStage), false);
  const mismatched = structuredClone(rows);
  mismatched[1].diagnosticsDelta.console['error:preview'] = 1;
  assert.equal(verifyH1ADiagnosticIntervals(mismatched), false);
  const freeText = structuredClone(rows);
  freeText[0].diagnosticsAfter.console['error:preview https://private.invalid/?token=x'] = 132;
  assert.equal(verifyH1ADiagnosticIntervals(freeText), false);
});

test('H1-A window ledger persists interval maps and strips free text', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'h1a-interval-ledger-'));
  try {
    const path = join(dir, 'run.jsonl');
    const ledger = await createWindowLedger(path, { runId: RUN, functionalSha: PIN.sha,
      deploymentId: PIN.deploymentId, host: PIN.host, ref: 'rhnnplewqsekrnaousyl' });
    const maps = { console: { 'error:preview': 132 }, http: { '503:external': 2 }, requestFailures: { external: 1 }, routeEvents: { 'external-navigation-blocked': 1 } };
    await ledger('h1a-diagnostic-boundary', 'PASS', { diagnosticInterval: 'after-navigation', diagnosticsAfter: maps,
      diagnosticsBefore: { console: {}, http: {}, requestFailures: {}, routeEvents: {} }, diagnosticsDelta: maps,
      message: 'must-not-persist', url: 'https://private.invalid/?token=secret' });
    const text = await readFile(path, 'utf8');
    const row = JSON.parse(text.trim());
    assert.deepEqual(row.diagnosticsAfter, maps);
    assert.deepEqual(row.diagnosticsDelta, maps);
    assert.equal(row.diagnosticInterval, 'after-navigation');
    assert.doesNotMatch(text, /must-not-persist|private\.invalid|token=secret/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
const ROLE = { runId: RUN, pooler: { clientTlsVerified: true, sessionUser: 'rubik_preview_u03_writer',
  currentUser: 'rubik_preview_u03_writer', denyPoliciesVerified: true } };
const CLEAN = { rolePresent: false, policies: 0, activeSessions: 0, inventoryZero: true, outboxTotal: 0, pendingOutbox: 0 };

test('sequence child preflight rejects the former missing-key state and malformed values without exposing them', () => {
  assert.equal(preflightSequencePreviewKeys({ env: { U03_PREVIEW_ADMIN_KEY:'header.payload.signature', U03_PREVIEW_PUBLIC_KEY:'header.payload.signature' } }), true);
  assert.throws(() => preflightSequencePreviewKeys({ env: {} }), { message:'SEQUENCE_PREVIEW_KEYS_REQUIRED' });
  assert.throws(() => preflightSequencePreviewKeys({ env: { U03_PREVIEW_ADMIN_KEY:'not-a-key-secret', U03_PREVIEW_PUBLIC_KEY:'header.payload.signature' } }), { message:'SEQUENCE_PREVIEW_KEYS_FORMAT_INVALID' });
});

async function execute(dir, failure = null) {
  const calls = [];
  const ledgerPath = join(dir, 'run.jsonl');
  const result = await runPreviewWindowSequence({ databasePassword: 'fictional password', runId: RUN, env: ENV, pin: PIN, ledgerPath,
    configFn: async () => ({ runId: RUN }),
    preflightFn: async () => { calls.push('preflight'); if (failure === 'preflight') throw new Error('private detail'); return VERIFIED; },
    installFn: async ({ ledger: roleLedger }) => {
      calls.push('install');
      if (failure === 'install') throw Object.assign(new Error('private detail'), { code: 'INJECTED_INSTALL_FAILURE' });
      await roleLedger('security_definer_allowlist', 'PASS', 'PREFLIGHT');
      await roleLedger('writer_rls', 'PASS', 'PREFLIGHT');
      return ROLE;
    },
    runtimeFn: async () => { calls.push('runtime'); if (failure === 'runtime') throw new Error('private detail'); return { passed: true, status: 200 }; },
    campaignFn: async ({ mode, ledger: campaignLedger }) => { assert.equal(mode, 'window-i2-i5'); calls.push('campaign'); if (failure === 'campaign') return { status: 'BLOCKED', cleanupResult: { ok: false } };
      for (const [caseId, status] of [
        ['fixture-user-ownerA','CREATED'], ['auth-login-ownerA','PASS'], ['fixture-user-ownerB','CREATED'], ['auth-login-ownerB','PASS'],
        ['fixture-organizations','CREATED'], ['fixture-projects','CREATED'],
        ['window-fixture-audit','PASS'], ['window-fixture-result','PASS'], ['window-fixture-import','PASS'],
        ['i5-populated-audit_events','PASS'], ['i5-populated-provider_results','PASS'], ['i5-populated-imports','PASS'],
        ['i5-populated-signed-rows','PASS'], ['i2-protected-routes','PASS'], ['window-i2-i5-populated-surfaces','PASS'],
        ['window-cleanup-a1','PASS'], ['window-cleanup-a2','PASS'], ['window-cleanup-b1','PASS'],
        ['fixture-cleanup','PASS'], ['final-inventory','PASS'], ['outbox-final','PASS'], ['capabilities-final','PASS'],
      ]) await campaignLedger(caseId, status);
      return { status: 'PASS', cleanupResult: { ok: true }, finalCheck: { inventoriesClear: true, outboxClear: true } }; },
    containFn: async () => { calls.push('contain'); if (failure === 'contain') throw new Error('private admin detail'); return CLEAN; },
  });
  return { result, calls, ledger: await readFile(ledgerPath, 'utf8') };
}

test('deployment/branch/ref/SHA/run mismatches block before role installation', () => {
  assert.equal(pinIsExact(ENV, RUN, PIN), true);
  for (const key of ['U03_PIN_DEPLOYMENT_ID','U03_PIN_DEPLOYMENT_HOST','U03_PIN_DEPLOYMENT_SHA',
    'U03_PIN_DEPLOYMENT_BRANCH','U03_FUNCTIONAL_SHA','U03_PREVIEW_WRITER_WINDOW_RUN_ID']) {
    assert.equal(pinIsExact({ ...ENV, [key]: 'wrong' }, RUN, PIN), false, key);
  }
});

test('local configuration preflight validates TLS-pooler URL shape and signing keyring before password prompt', async () => {
  const writerUrl = new URL('postgresql://placeholder@aws-1-eu-west-3.pooler.supabase.com:5432/postgres');
  writerUrl.username = 'rubik_preview_u03_writer.rhnnplewqsekrnaousyl';
  writerUrl.password = 'FictionalRolePassword_123456789012345678901234';
  const env = { ...ENV, VERCEL_OIDC_TOKEN: 'fictional-oidc-token-long-enough', RUBIK_AUDIT_DATABASE_URL: writerUrl.toString(),
    PROVENANCE_SIGNING_KEYS: 'u03-preview-window:' + Buffer.alloc(32, 4).toString('base64'),
    PROVENANCE_ACTIVE_KEY_ID: 'u03-preview-window' };
  const result = await validateWindowRuntimeConfiguration({ env, runId: RUN, pin: PIN });
  assert.equal(result.ref, 'rhnnplewqsekrnaousyl');
  assert.equal(result.sha, PIN.sha);
  await assert.rejects(validateWindowRuntimeConfiguration({ env: { ...env, RUBIK_AUDIT_DATABASE_URL: writerUrl.toString().replace('aws-1-eu-west-3', 'elsewhere') }, runId: RUN, pin: PIN }), /TEMP_ROLE_CREDENTIAL_INVALID/);
});

test('attestation compares every secret field with the fixed protected deployment before password prompt', async () => {
  const writerUrl = new URL('postgresql://rubik_preview_u03_writer.rhnnplewqsekrnaousyl:FictionalRolePassword_123456789012345678901234@aws-1-eu-west-3.pooler.supabase.com:5432/postgres');
  const env = { ...ENV, VERCEL_OIDC_TOKEN:'fictional-oidc-token-long-enough', RUBIK_AUDIT_DATABASE_URL:writerUrl.toString(),
    PROVENANCE_SIGNING_KEYS:'u03-preview-window:' + Buffer.alloc(32,7).toString('base64'), PROVENANCE_ACTIVE_KEY_ID:'u03-preview-window' };
  const nonce = Buffer.alloc(32,9).toString('base64url');
  const serverEnv = { ...env, VERCEL_ENV:'preview', VERCEL_DEPLOYMENT_ID:PIN.deploymentId,
    VERCEL_URL:PIN.host, VERCEL_GIT_COMMIT_REF:PIN.branch, VERCEL_GIT_COMMIT_SHA:PIN.sha };
  const attestation = createPreviewWindowAttestation(serverEnv,PIN.host,{runId:RUN,nonce});
  const preflightFn = async () => ({deploymentId:PIN.deploymentId,host:PIN.host,sha:PIN.sha,supabaseRef:'rhnnplewqsekrnaousyl'});
  const fetchImpl = async (url,init) => { assert.equal(url,`https://${PIN.host}/api/u03/window-challenge`); assert.equal(init.redirect,'manual'); return {status:200,headers:{get:()=>null},json:async()=>attestation}; };
  const passed = await verifyProtectedWindowBatch({env,pin:PIN,nonce,preflightFn,fetchImpl});
  assert.equal(passed.runId,RUN);
  const wrongUrl = new URL(writerUrl); wrongUrl.password = 'AnotherFictionalPassword_12345678901234567890';
  await assert.rejects(verifyProtectedWindowBatch({env:{...env,RUBIK_AUDIT_DATABASE_URL:wrongUrl.toString()},pin:PIN,nonce,preflightFn,fetchImpl}),/WINDOW_BATCH_DEPLOYMENT_MISMATCH/);
  for (const [response,statusCode] of [
    [{status:303,headers:{get:(name)=>name==='location'?'/login':null}},'WINDOW_CHALLENGE_PROTECTION_REDIRECT'],
    [{status:403,headers:{get:()=>null}},'WINDOW_CHALLENGE_PROTECTION_DENIED'],
    [{status:404,headers:{get:()=>null}},'WINDOW_CHALLENGE_ROUTE_OR_WINDOW_NOT_READY'],
  ]) {
    const rejectedFetch = async () => response;
    await assert.rejects(verifyProtectedWindowBatch({env,pin:PIN,nonce,preflightFn,fetchImpl:rejectedFetch}),new RegExp(statusCode));
  }
});

test('successful operator orders all gates, campaign, then independent containment', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'u03-window-sequence-pass-'));
  try {
    const { result, calls, ledger } = await execute(dir);
    assert.equal(result.status, 'PASS', result.failure);
    assert.deepEqual(calls, ['preflight','install','runtime','campaign','contain']);
    assert.match(ledger, /independent-containment-and-final-read.*PASS/);
    assert.match(ledger, /u03-sql-final-result.*PASS/);
    assert.match(ledger, /sequence-complete.*PASS/);
    assert.match(ledger, /h1a-global-result.*NOT_RUN/);
    assert.doesNotMatch(ledger, /preview-http-export|restore-local-twice/);
    assert.doesNotMatch(ledger, /fictional password|fictional-only-window-secret|private detail/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('H1-A mode requires export, tamper rejection, double local restore, captures, and never marks U03', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'h1a-window-sequence-pass-'));
  try {
    const path = join(dir, 'h1a.jsonl');
    const result = await runPreviewWindowSequence({ databasePassword:'fictional password', runId:RUN, env:ENV, pin:PIN,
      ledgerPath:path, campaignMode:'window-h1a', configFn:async()=>({}), preflightFn:async()=>VERIFIED,
      installFn:async ({ledger})=>{
        await ledger('security_definer_allowlist','PASS','PREFLIGHT');
        await ledger('writer_rls','PASS','PREFLIGHT');
        return ROLE;
      }, runtimeFn:async()=>({passed:true,status:200}),
      campaignFn:async ({mode,ledger})=>{
        assert.equal(mode,'window-h1a');
        const basic = [
          ['h1a-runtime-pooler-preflight','PASS'],['h1a-receipt-processor-preflight','PASS'],
          ['fixture-user-ownerA','CREATED'],['auth-login-ownerA','PASS'],['fixture-user-ownerB','CREATED'],['auth-login-ownerB','PASS'],
          ['fixture-organizations','CREATED'],['fixture-projects','CREATED'],['window-fixture-audit','PASS'],
          ['window-fixture-result','PASS'],['window-fixture-import','PASS'],['h1a-source-and-date-evidence','PASS'],
          ['h1a-permission-grant-withdraw-and-receipt','PASS'],['h1a-measurement-report-ui','PASS'],
          ['h1a-protected-views','PASS'],['h1a-auth-login','PASS'],['h1a-logout','PASS'],
          ['window-cleanup-a1','PASS'],['window-cleanup-a2','PASS'],['window-cleanup-b1','PASS'],
          ['fixture-cleanup','PASS'],['final-inventory','PASS'],['outbox-final','PASS'],['capabilities-final','PASS'],
        ];
        for (const [caseId,status] of basic) await ledger(caseId,status);
        for (const surface of ['audit-events','provider-results','imports']) {
          await ledger(`h1a-isolation-${surface}`,'PASS',{actor:'ownerA',stage:'OWN_READ',expectedCount:1,observedCount:1});
          await ledger(`h1a-isolation-${surface}`,'PASS',{actor:'ownerB',stage:'CROSS_READ',expectedCount:0,observedCount:0});
        }
        for (const viewport of ['desktop','mobile']) for (const page of ['measurement','report'])
          await ledger(`h1a-capture-${viewport}-${page}`,'SAVED',{path:`test-results/u03-hosted/${RUN}/${'33333333-3333-4333-8333-333333333333'}-${viewport}-h1a-${page}.png`,viewport});
        const groups = [
          { viewport:'desktop', page:'measurement', boundaries:['before-login','after-login','before-navigation','after-navigation','before-measurement','after-measurement'] },
          { viewport:'desktop', page:'report', boundaries:['before-navigation','after-navigation','before-measurement','after-measurement'] },
          { viewport:'mobile', page:'measurement', boundaries:['before-navigation','after-navigation','before-measurement','after-measurement'] },
          { viewport:'mobile', page:'report', boundaries:['before-navigation','after-navigation','before-measurement','after-measurement'] },
        ];
        for (const group of groups) {
          let cumulative={console:{},http:{},requestFailures:{},routeEvents:{}};
          for (const interval of group.boundaries) {
            const before=structuredClone(cumulative);
            if (interval==='after-navigation') cumulative.http['200:preview']=1;
            const after=structuredClone(cumulative);
            const delta={console:{},http:{},requestFailures:{},routeEvents:{}};
            for (const name of Object.keys(delta)) for (const [key,count] of Object.entries(after[name])) delta[name][key]=count-(before[name][key]??0);
            await ledger('h1a-diagnostic-boundary',interval.startsWith('before-')?'ATTEMPTED':'PASS',{
              diagnosticInterval:interval,diagnosticsBefore:before,diagnosticsAfter:after,diagnosticsDelta:delta});
          }
          const screen=group.page==='measurement'?'visual-h1a-measurement':'visual-h1a-report';
          await ledger(screen,'PASS',{viewport:group.viewport,consoleErrorCount:0,
            diagnostics:{console:{},http:{'200:preview':1},requestFailures:{},routeEvents:{}}});
        }
        await ledger('h1a-export-consistency-limit','PASS',{fixtureWritesConcurrent:0,category:'READS_NOT_TRANSACTIONAL'});
        for (const caseId of ['h1a-http-export-request','h1a-offline-export-verification','h1a-tamper-rejection','h1a-local-double-restore'])
          await ledger(caseId,'PASS',{httpStatus:200,restoreCount:2,contentVerified:true,signaturesPreserved:true,offlineVerified:true,tamperRejected:true});
        await ledger('h1a-http-export-verify-tamper-restore','PASS',{httpStatus:200,restoreCount:2,contentVerified:true,signaturesPreserved:true});
        await ledger('h1a-integral-campaign','PASS',{cases:1});
        return {status:'PASS',cleanupResult:{ok:true},finalCheck:{inventoriesClear:true,outboxClear:true}};
      }, containFn:async()=>CLEAN });
    const text = await readFile(path,'utf8');
    assert.equal(result.status,'PASS',result.failure);
    assert.match(text, /"caseId":"h1a-global-result","status":"PASS"/);
    assert.doesNotMatch(text, /"caseId":"i2-final-result"|"caseId":"i5-final-result"|"caseId":"u03-sql-final-result"/);
    assert.equal(await verifyWindowLedgerComplete(path,{runId:RUN,pin:PIN,mode:'window-h1a'}),true);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('Windows 5.1 wrapper records U03 global PASS only after independent containment and teardown', async () => {
  const script = await readFile(new URL('./u03-preview-b4-owner.ps1', import.meta.url), 'utf8');
  const containment = script.indexOf("Invoke-U03WindowRoleChild -Mode 'contain'");
  const teardown = script.indexOf('Remove-U03WindowDeploymentConfiguration -DeploymentId $DeploymentId', containment);
  const globalPass = script.indexOf("Write-U03WindowGlobalResult -RunId $windowRoleRunId -Status 'PASS'", teardown);
  assert.ok(containment >= 0 && teardown > containment && globalPass > teardown);
  assert.match(script, /if \(\$windowSequencePassed\) \{[\s\S]*Write-U03WindowGlobalResult -RunId \$windowRoleRunId -Status 'PASS'/);
  const sequence = await readFile(new URL('./u03-preview-window-run.mjs', import.meta.url), 'utf8');
  assert.match(sequence, /verifyWindowLedgerComplete\(ledgerPath, \{ runId, pin, includeFinal: false, mode: campaignMode \}\)/);
  assert.match(sequence, /sequence-complete', 'PASS'[\s\S]*verifyWindowLedgerComplete\(ledgerPath, \{ runId, pin, mode: campaignMode \}\)/);
});

test('fixture ledger failures remain BLOCKED and cannot become wrapper PASS', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'u03-window-incomplete-ledger-'));
  try {
    const ledgerPath = join(dir, 'run.jsonl');
    const ledgerFactory = async (path, metadata) => {
      const base = await createWindowLedger(path, metadata);
      return async (caseId, status, detail) => {
        if (caseId === 'fixture-user-ownerA') return; // emulate a writer that silently omitted a row
        return base(caseId, status, detail);
      };
    };
    const result = await runPreviewWindowSequence({ databasePassword:'fictional password', runId:RUN, env:ENV, pin:PIN,
      ledgerPath, ledgerFactory, configFn:async()=>({}), preflightFn:async()=>VERIFIED,
      installFn:async ({ledger: roleLedger})=>{ await roleLedger('security_definer_allowlist','PASS','PREFLIGHT'); await roleLedger('writer_rls','PASS','PREFLIGHT'); return ROLE; },
      runtimeFn:async()=>({passed:true,status:200}),
      campaignFn:async ({ledger: campaignLedger})=>{
        for (const [caseId,status] of [['fixture-user-ownerB','CREATED'],['auth-login-ownerA','PASS'],['auth-login-ownerB','PASS'],
          ['fixture-organizations','CREATED'],['fixture-projects','CREATED'],['window-fixture-audit','PASS'],['window-fixture-result','PASS'],['window-fixture-import','PASS'],
          ['i5-populated-audit_events','PASS'],['i5-populated-provider_results','PASS'],['i5-populated-imports','PASS'],['i5-populated-signed-rows','PASS'],
          ['i2-protected-routes','PASS'],['window-i2-i5-populated-surfaces','PASS'],['window-cleanup-a1','PASS'],['window-cleanup-a2','PASS'],['window-cleanup-b1','PASS'],
          ['fixture-cleanup','PASS'],['final-inventory','PASS'],['outbox-final','PASS'],['capabilities-final','PASS']]) await campaignLedger(caseId,status);
        return {status:'PASS',cleanupResult:{ok:true},finalCheck:{inventoriesClear:true,outboxClear:true}};
      }, containFn:async()=>CLEAN });
    const ledger = await readFile(ledgerPath,'utf8');
    assert.equal(result.status,'BLOCKED');
    assert.equal(result.failure,'WINDOW_LEDGER_INCOMPLETE',JSON.stringify({ ledger:ledger.slice(-900) }));
    assert.match(ledger,/"caseId":"i2-final-result","status":"BLOCKED"/);
    assert.doesNotMatch(ledger,/"caseId":"sequence-complete","status":"PASS"/);
    assert.equal(await verifyWindowLedgerComplete(ledgerPath,{runId:RUN,pin:PIN}),false);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('every prefixture boundary blocks campaign and contains an attempted role', async () => {
  for (const failure of ['preflight','install','runtime']) {
    const dir = await mkdtemp(join(tmpdir(), 'u03-window-sequence-block-'));
    try {
      const { result, calls } = await execute(dir, failure);
      assert.equal(result.status, 'BLOCKED', failure);
      assert.equal(calls.includes('campaign'), false, failure);
      assert.equal(calls.includes('contain'), failure !== 'preflight', failure);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});

test('campaign failure still contains and a failed independent admin connection remains blocked', async () => {
  for (const failure of ['campaign','contain']) {
    const dir = await mkdtemp(join(tmpdir(), 'u03-window-sequence-finally-'));
    try {
      const { result, calls, ledger } = await execute(dir, failure);
      assert.equal(result.status, 'BLOCKED');
      assert.equal(calls.at(-1), 'contain');
      if (failure === 'contain') assert.match(ledger, /ADMIN_CONTAINMENT_UNVERIFIED/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});

test('window ledger preserves owned UUIDs for reconciliation and only numeric cleanup counters', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'u03-window-owned-ledger-'));
  try {
    const path = join(dir, 'owned.jsonl');
    const ledger = await createWindowLedger(path, { runId: RUN, functionalSha: PIN.sha,
      deploymentId: PIN.deploymentId, host: PIN.host, ref: 'rhnnplewqsekrnaousyl' });
    const id = '6739e760-420f-4ad3-b2d0-9d3aa674e802';
    await ledger('fixture-created', 'PASS', { id, userIds: [id], email: 'owner@fixture.invalid', password: 'fictional-password' });
    await ledger('security-definer-allowlist', 'BLOCKED', { category: 'PREFLIGHT',
      code: 'SECDEF_QUERY_FAILED', sqlstate: '42501', message: 'private fixture error' });
    await ledger('writer-rls', 'BLOCKED', { category: 'PREFLIGHT',
      code: 'RLS_QUERY_FAILED', sqlstate: 'XX999' });
    await ledger('cleanup', 'PASS', { resultRowsErased: 1, importsErased: 1, receiptsProcessed: 1, message: 'private free text' });
    const text = await readFile(path, 'utf8');
    assert.match(text, new RegExp(id));
    assert.match(text, /"receiptsProcessed":1/);
    assert.match(text, /"code":"SECDEF_QUERY_FAILED","sqlstate":"42501"/);
    assert.doesNotMatch(text, /XX999|owner@fixture.invalid|fictional-password|private free text|private fixture error/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('window ledger preserves only sanitized visual diagnostic counters', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'u03-window-visual-diagnostics-'));
  try {
    const path = join(dir, 'visual.jsonl');
    const ledger = await createWindowLedger(path, { runId: RUN, functionalSha: PIN.sha,
      deploymentId: PIN.deploymentId, host: PIN.host, ref: 'rhnnplewqsekrnaousyl' });
    await ledger('visual-h1a-measurement', 'FAIL', {
      viewport: 'desktop', consoleErrorCount: 132, pageErrorCount: 0,
      diagnostics: {
        console: { 'error:preview': 100, 'error:external': 32, 'error:https://secret.invalid/path?token=hidden': 9 },
        http: { '200:preview': 12, '500:external': 1, '200:https://secret.invalid': 99 },
        requestFailures: { preview: 2, external: 1, 'https://secret.invalid': 8 },
        routeEvents: { 'pinned-navigation': 1, 'external-navigation-blocked': 1, 'secret-free-text': 3 },
        message: 'secret-free-text',
      },
    });
    const text = await readFile(path, 'utf8');
    const row = JSON.parse(text.trim());
    assert.deepEqual(row.diagnostics, {
      console: { 'error:preview': 100, 'error:external': 32 },
      http: { '200:preview': 12, '500:external': 1 },
      requestFailures: { preview: 2, external: 1 },
      routeEvents: { 'pinned-navigation': 1, 'external-navigation-blocked': 1 },
    });
    assert.equal(Object.values(row.diagnostics.console).reduce((sum, value) => sum + value, 0), 132);
    assert.equal(row.consoleErrorCount, 132);
    assert.doesNotMatch(text, /secret[.]invalid|token=hidden|secret-free-text|message/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('real campaign fixture phase names are normalized, bounded, and owner names stay distinct', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'u03-window-case-normalization-'));
  try {
    const path = join(dir,'cases.jsonl');
    const ledger = await createWindowLedger(path,{runId:RUN,functionalSha:PIN.sha,deploymentId:PIN.deploymentId,host:PIN.host,ref:'rhnnplewqsekrnaousyl'});
    for (const [caseId,status] of [['fixture-user-ownerA','PLANNED'],['auth-login-ownerA','PASS'],['fixture-user-ownerB','PLANNED'],
      ['auth-login-ownerB','PASS'],['fixture-user-reconcile','RECOVERED'],['cleanup-user','PASS'],['cleanup-ids-verified','PASS']])
      await ledger(caseId,status);
    const rows = (await readFile(path,'utf8')).trim().split(/\r?\n/).map(line=>JSON.parse(line));
    assert.deepEqual(rows.map(row=>row.caseId),['fixture-user-ownera','auth-login-ownera','fixture-user-ownerb',
      'auth-login-ownerb','fixture-user-reconcile','cleanup-user','cleanup-ids-verified']);
    assert.notEqual(rows.find(row=>row.caseId==='fixture-user-ownera').caseId,rows.find(row=>row.caseId==='fixture-user-ownerb').caseId);
    await assert.rejects(ledger('fixture-user-ownerA/extra','PASS'),{message:'WINDOW_LEDGER_FIELD_REJECTED'});
    await assert.rejects(ledger('x'.repeat(81),'PASS'),{message:'WINDOW_LEDGER_FIELD_REJECTED'});
    await assert.rejects(ledger(null,'PASS'),{message:'WINDOW_LEDGER_FIELD_REJECTED'});
    await assert.rejects(ledger('valid-case','bad-status'),{message:'WINDOW_LEDGER_FIELD_REJECTED'});
  } finally { await rm(dir,{recursive:true,force:true}); }
});
