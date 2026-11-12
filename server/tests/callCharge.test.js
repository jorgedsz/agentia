const test = require('node:test');
const assert = require('node:assert');
const { billableMinutes, callCharge } = require('../src/utils/pricingUtils');

test('every started minute is billed whole, like Twilio', () => {
  assert.strictEqual(billableMinutes(1), 1);
  assert.strictEqual(billableMinutes(35), 1);
  assert.strictEqual(billableMinutes(60), 1);
  assert.strictEqual(billableMinutes(61), 2);
  assert.strictEqual(billableMinutes(130.4), 3);
});

test('a call that never connected is not billed', () => {
  assert.strictEqual(billableMinutes(0), 0);
  assert.strictEqual(billableMinutes(undefined), 0);
  assert.strictEqual(billableMinutes(-5), 0);
  assert.strictEqual(callCharge(0, 0.2625, true), 0);
  assert.strictEqual(callCharge(0, 0.15, false), 0);
});

test('outbound calls are billed by the started minute', () => {
  // A 35 s outbound call is billed one whole minute, like Twilio bills it.
  assert.strictEqual(callCharge(35, 0.2625, true), 0.2625);
  assert.strictEqual(callCharge(61, 0.15, true), 0.3);
  assert.strictEqual(callCharge(30, undefined, true), 0);
});

test('inbound calls keep the exact seconds', () => {
  assert.strictEqual(callCharge(30, 0.15, false), 0.075);
  assert.strictEqual(callCharge(90, 0.2, false), 0.30000000000000004);
  assert.strictEqual(callCharge(13, 0.15, undefined), 0.0325);
});
