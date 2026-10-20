import test from 'node:test';
import assert from 'node:assert/strict';
import { sameOriginActionResponseReceived } from './u03-preview-provider-egress.mjs';

test('a completed same-origin Server Action counts even when CDP misses next-action classification', () => {
  // Next.js Flight POST returned HTTP 200; the guard's categorized server event is read
  // separately from Functions logs. Missing an optional route event must not erase request evidence.
  assert.equal(sameOriginActionResponseReceived(200), true);
  assert.equal(sameOriginActionResponseReceived(303), true);
  assert.equal(sameOriginActionResponseReceived(null), false);
  assert.equal(sameOriginActionResponseReceived(Number.NaN), false);
});
