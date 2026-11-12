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
  assert.strictEqual(callCharge(0, 0.2625), 0);
});

test('the charge is the billed minutes at the agent rate', () => {
  // A 35 s call is billed one whole minute, like Twilio bills it.
  assert.strictEqual(callCharge(35, 0.2625), 0.2625);
  assert.strictEqual(callCharge(61, 0.15), 0.3);
  assert.strictEqual(callCharge(30, undefined), 0);
});
