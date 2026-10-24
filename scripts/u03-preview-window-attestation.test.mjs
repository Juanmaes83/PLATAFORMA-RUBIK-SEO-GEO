import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewWindowAttestation, verifyPreviewWindowAttestationProof, previewWindowAttestationContext } from '../src/lib/provenance/keyring.ts';

const runId = 'd9c4f0a2-2db8-4c85-a42b-4af3e12e87a2';
const nonce = 'm2t9j_vYIu6TbYX8q9QpYqzmfE3wC5KsWJWc9A7hN1s';
const host = 'preview-abc.vercel.app';
const env = {
  VERCEL_ENV:'preview', VERCEL_DEPLOYMENT_ID:'dpl_Abc123', VERCEL_URL:host,
  VERCEL_GIT_COMMIT_REF:'codex/h1a-integral-20261022', VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),
  U03_PREVIEW_WRITER_WINDOW:'armed-run-capability', U03_PREVIEW_WRITER_WINDOW_REF:'rhnnplewqsekrnaousyl',
  U03_PREVIEW_WRITER_WINDOW_SHA:'a'.repeat(40), U03_PREVIEW_WRITER_WINDOW_RUN_ID:runId,
  U03_PREVIEW_WRITER_WINDOW_SECRET:'fictional-window-secret',
  RUBIK_AUDIT_DATABASE_URL:'postgresql://rubik_preview_u03_writer.rhnnplewqsekrnaousyl:fictional%3Apassword@aws-1-eu-west-3.pooler.supabase.com:5432/postgres',
  PROVENANCE_SIGNING_KEYS:'u03-preview-window:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  PROVENANCE_ACTIVE_KEY_ID:'u03-preview-window',
  RUBIK_RECOVERY_SCHEMA_ATTESTATION:'pre-n2-through-20261015210000',
};

test('protected deployment attestation proves the exact four local batch fields without echoing them', () => {
  const attestation = createPreviewWindowAttestation(env,host,{runId,nonce});
  assert.ok(attestation);
  const context = previewWindowAttestationContext({runId,nonce},env.VERCEL_DEPLOYMENT_ID,host,env.VERCEL_GIT_COMMIT_SHA);
  assert.equal(verifyPreviewWindowAttestationProof(env.U03_PREVIEW_WRITER_WINDOW_SECRET,context,attestation.proofs.window),true);
  assert.equal(verifyPreviewWindowAttestationProof(env.RUBIK_AUDIT_DATABASE_URL,context,attestation.proofs.databaseUrl),true);
  assert.equal(verifyPreviewWindowAttestationProof(env.PROVENANCE_SIGNING_KEYS,context,attestation.proofs.signingKeys),true);
  assert.equal(verifyPreviewWindowAttestationProof(env.PROVENANCE_ACTIVE_KEY_ID,context,attestation.proofs.activeKeyId),true);
  assert.equal(verifyPreviewWindowAttestationProof(env.RUBIK_RECOVERY_SCHEMA_ATTESTATION,context,attestation.proofs.schemaAttestation),true);
  const serialized = JSON.stringify(attestation);
  for (const secret of [env.U03_PREVIEW_WRITER_WINDOW_SECRET,env.RUBIK_AUDIT_DATABASE_URL,env.PROVENANCE_SIGNING_KEYS]) assert.equal(serialized.includes(secret),false);
  assert.deepEqual(attestation.databaseIdentity,{host:'aws-1-eu-west-3.pooler.supabase.com',port:5432,
    role:'rubik_preview_u03_writer',ref:'rhnnplewqsekrnaousyl'});
});

test('attestation fails closed for wrong host, deployment identity, ref, runId, or malformed pooler target', () => {
  assert.equal(createPreviewWindowAttestation(env,'other.vercel.app',{runId,nonce}),null);
  for (const [key,value] of [['VERCEL_GIT_COMMIT_REF','other'],['U03_PREVIEW_WRITER_WINDOW_REF','wrong'],
    ['U03_PREVIEW_WRITER_WINDOW_RUN_ID','other'],['RUBIK_RECOVERY_SCHEMA_ATTESTATION','wrong'],
    ['RUBIK_AUDIT_DATABASE_URL',env.RUBIK_AUDIT_DATABASE_URL.replace('aws-1-eu-west-3','other')],
    ['RUBIK_AUDIT_DATABASE_URL',`${env.RUBIK_AUDIT_DATABASE_URL}?options=-c%20role%3Drubik_audit_writer`]])
    assert.equal(createPreviewWindowAttestation({...env,[key]:value},host,{runId,nonce}),null,key);
});
