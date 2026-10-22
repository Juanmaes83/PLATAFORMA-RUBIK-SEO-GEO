import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function parseStatus(raw) {
  try {
    const json = JSON.parse(raw);
    return { url: json.API_URL, anon: json.ANON_KEY, service: json.SERVICE_ROLE_KEY };
  } catch {
    const values = Object.fromEntries(String(raw).split(/\r?\n/).map(line => {
      const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      return match ? [match[1], match[2].replace(/^['"]|['"]$/g, '')] : [];
    }));
    return { url: values.API_URL, anon: values.ANON_KEY, service: values.SERVICE_ROLE_KEY };
  }
}

const local = parseStatus(process.env.U03_FOREIGN_ISSUER_STATUS);
assert.ok(local.url && local.anon && local.service, 'isolated Supabase status is unavailable');
const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const client = createClient(local.url, local.anon, authOptions);
const admin = createClient(local.url, local.service, authOptions);
const runId = randomUUID();
const email = `u03-s5-${runId}@example.test`;
const password = randomBytes(32).toString('base64url');
let userId;
try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { testRunId: runId } });
  assert.equal(created.error, null);
  userId = created.data.user.id;
  const loggedIn = await client.auth.signInWithPassword({ email, password });
  assert.equal(loggedIn.error, null);
  const token = loggedIn.data.session?.access_token;
  assert.equal(typeof token, 'string');
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  assert.ok(claims.iss && !claims.iss.includes('rhnnplewqsekrnaousyl'));
  assert.ok(Number.isSafeInteger(claims.exp) && claims.exp > Math.floor(Date.now() / 1000));
  console.log(`PASS: isolated Auth issued a live JWT; issuer=${claims.iss}; exp-present=true`);
} finally {
  if (userId) {
    const removed = await admin.auth.admin.deleteUser(userId);
    assert.equal(removed.error, null, 'isolated Auth fixture cleanup failed');
  }
  console.log(`PASS: isolated Auth fixture cleanup=${userId ? 'deleted' : 'not-created'}`);
}
