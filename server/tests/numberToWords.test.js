const test = require('node:test');
const assert = require('node:assert');
const { amountToSpanishWords } = require('../src/utils/numberToWords');

test('a round amount', () => {
  assert.strictEqual(amountToSpanishWords(127), 'CIENTO VEINTISIETE DÓLARES CON 00/100');
});

test('cents are shown as a fraction, not words', () => {
  assert.strictEqual(amountToSpanishWords(15.88), 'QUINCE DÓLARES CON 88/100');
});

test('one is singular', () => {
  assert.strictEqual(amountToSpanishWords(1), 'UN DÓLAR CON 00/100');
});

test('exactly one hundred is CIEN, not CIENTO', () => {
  assert.strictEqual(amountToSpanishWords(100), 'CIEN DÓLARES CON 00/100');
});

test('the twenties contract', () => {
  assert.strictEqual(amountToSpanishWords(21), 'VEINTIUN DÓLARES CON 00/100');
  assert.strictEqual(amountToSpanishWords(16), 'DIECISEIS DÓLARES CON 00/100');
});

test('thousands', () => {
  assert.strictEqual(amountToSpanishWords(1000), 'MIL DÓLARES CON 00/100');
  assert.strictEqual(amountToSpanishWords(2500.5), 'DOS MIL QUINIENTOS DÓLARES CON 50/100');
});

test('zero', () => {
  assert.strictEqual(amountToSpanishWords(0), 'CERO DÓLARES CON 00/100');
});

// Correction (a): cents must come from round2 (cash-register rounding), not a
// flat Number.EPSILON nudge, which is wrong at exactly this magnitude.
test('half a cent rounds up like a cash register, not float-truncated', () => {
  assert.strictEqual(amountToSpanishWords(1.005), 'UN DÓLAR CON 01/100');
  assert.strictEqual(amountToSpanishWords(0.145), 'CERO DÓLARES CON 15/100');
});

// Correction (b): a million or more must not silently produce wrong output
// (the undocumented old behavior would garble to something like "... MIL MIL
// ..." because underThousand() only covers 0-999). It must fail loudly instead.
test('a million or more is out of scope and rejected loudly', () => {
  assert.throws(() => amountToSpanishWords(1000000), /out of (scope|range)/i);
  assert.throws(() => amountToSpanishWords(1500000.5), /out of (scope|range)/i);
});

test('just under a million still works', () => {
  assert.strictEqual(amountToSpanishWords(999999.99), 'NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE DÓLARES CON 99/100');
});
