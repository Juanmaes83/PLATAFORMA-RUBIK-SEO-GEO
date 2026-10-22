import test from 'node:test';
import assert from 'node:assert/strict';
import { googleGuardResult, sameOriginActionResponseReceived } from './u03-preview-provider-egress.mjs';

test('a completed same-origin Server Action counts even when CDP misses next-action classification', () => {
  // Next.js Flight POST returned HTTP 200; the guard's categorized server event is read
  // separately from Functions logs. Missing an optional route event must not erase request evidence.
  assert.equal(sameOriginActionResponseReceived(200), true);
  assert.equal(sameOriginActionResponseReceived(303), true);
  assert.equal(sameOriginActionResponseReceived(null), false);
  assert.equal(sameOriginActionResponseReceived(Number.NaN), false);
});

test('Google guard accepts the current Next.js Flight response and the visible disabled page', () => {
  assert.equal(googleGuardResult({ status: 200, pathname: '/proyectos/u03-run-a/a1/google', error: 'DISABLED', disabledTextVisible: true }), true);
  assert.equal(googleGuardResult({ status: 303, pathname: '/proyectos/u03-run-a/a1/google', error: 'DISABLED', disabledTextVisible: true }), true);
  assert.equal(googleGuardResult({ status: 200, pathname: '/proyectos/u03-run-a/a1/google', error: 'OTHER', disabledTextVisible: true }), false);
  assert.equal(googleGuardResult({ status: 200, pathname: '/proyectos/u03-run-a/a1/auditoria-tecnica', error: 'DISABLED', disabledTextVisible: true }), false);
  assert.equal(googleGuardResult({ status: 200, pathname: '/proyectos/u03-run-a/a1/google', error: 'DISABLED', disabledTextVisible: false }), false);
});
