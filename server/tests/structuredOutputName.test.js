const test = require('node:test');
const assert = require('node:assert');
const { structuredOutputName, MAX_NAME } = require('../src/utils/structuredOutputName');

test('VAPI caps the name at 40 characters', () => {
  assert.strictEqual(MAX_NAME, 40);
});

test('a short agent name keeps the " extraction" suffix', () => {
  assert.strictEqual(structuredOutputName('Camila JH'), 'Camila JH extraction');
});

test('a long agent name is trimmed so name + suffix fit in 40', () => {
  const name = structuredOutputName('JDL Cobranzas – Seguimiento de promesas de pago');
  assert.ok(name.length <= 40, `${name.length}: ${name}`);
  assert.ok(name.endsWith(' extraction'));
  assert.ok(name.startsWith('JDL Cobranzas'));
});

test('no trailing spaces or dashes are left before the suffix', () => {
  const name = structuredOutputName('Agente de cobranzas de la empresa – principal');
  assert.ok(!/[\s\-–]\sextraction$/.test(name), name);
});

test('an empty or missing name falls back to "Agent extraction"', () => {
  assert.strictEqual(structuredOutputName(''), 'Agent extraction');
  assert.strictEqual(structuredOutputName(null), 'Agent extraction');
  assert.strictEqual(structuredOutputName('   '), 'Agent extraction');
});

test('the result is never empty and never over 40', () => {
  for (const n of ['a', 'x'.repeat(200), '–'.repeat(60), 'Señora Ñandú ' .repeat(10)]) {
    const r = structuredOutputName(n);
    assert.ok(r.length >= 1 && r.length <= 40, `${r.length}: ${r}`);
  }
});
