import assert from 'node:assert/strict';
import test from 'node:test';
import { PIN, GateError } from './u03-preview-b4-runner.mjs';
import { jwtTiming, sessionFromCookies, tamperSessionCookies, waitForExpiry } from './u03-preview-session-providers.mjs';

const claim = (iss = `https://${PIN.supabaseRef}.supabase.co/auth/v1`) =>
  `x.${Buffer.from(JSON.stringify({ iat: 1000, exp: 4600, iss })).toString('base64url')}.sig`;
const cookieName = `sb-${PIN.supabaseRef}-auth-token`;
const cookie = value => ({ name: cookieName, value, domain: PIN.host, path: '/' });

test('JWT timing requires the pinned Preview issuer and valid claims', () => {
  assert.deepEqual(jwtTiming(claim()), { iat: 1000, exp: 4600 });
  assert.throws(() => jwtTiming(claim('https://other.supabase.co/auth/v1')), /SESSION_JWT_ISSUER_OR_TIMING_INVALID/);
  assert.throws(() => jwtTiming('not-a-token'), /SESSION_JWT_UNAVAILABLE/);
});

test('session reader supports the Preview cookie and ordered chunks but rejects alien domains', () => {
  const raw = `base64-${Buffer.from(JSON.stringify({ access_token: claim(), refresh_token: 'hidden' })).toString('base64url')}`;
  const value = sessionFromCookies([cookie(raw)]);
  assert.equal(value.token, claim());
  const chunks = [
    { ...cookie(raw.slice(17)), name: `${cookieName}.1` },
    { ...cookie(raw.slice(0, 17)), name: `${cookieName}.0` },
  ];
  assert.equal(sessionFromCookies(chunks).token, claim());
  assert.throws(() => sessionFromCookies([{ ...cookie(raw), domain: 'other.example' }]), /SESSION_COOKIE_UNAVAILABLE/);
  assert.throws(() => sessionFromCookies([chunks[0]]), /SESSION_COOKIE_UNAVAILABLE/);
});

test('tampering changes a meaningful byte in a copy, including base64 sessions', () => {
  const original = cookie(`base64-${Buffer.from(JSON.stringify({ access_token: claim() })).toString('base64url')}`);
  const [changed] = tamperSessionCookies([original]);
  assert.equal(changed.value.slice(0, 7), 'base64-');
  assert.notEqual(changed.value[7], original.value[7]);
  assert.equal(original.value[7], 'e');
  assert.throws(() => sessionFromCookies([changed]), GateError);
});

test('expiry wait is bounded and can be driven without a real hour delay', async () => {
  let clock = 4599_000;
  const pauses = [];
  await waitForExpiry(4600, { now: () => clock, sleep: async ms => { pauses.push(ms); clock += ms; } });
  assert.deepEqual(pauses, [3000]);
  await assert.rejects(waitForExpiry(10, { now: () => 10_000_000 }), /SESSION_EXPIRY_OUT_OF_RANGE/);
});
