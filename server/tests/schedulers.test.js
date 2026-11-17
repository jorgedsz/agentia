const test = require('node:test');
const assert = require('node:assert');
const { startSchedulers } = require('../src/utils/schedulers');

function arrancadores() {
  const llamados = [];
  const s = ['callbacks', 'followUps', 'chatbotFollowUps', 'recurring', 'autoRecharge', 'calendarMeta']
    .map((nombre) => ({ nombre, start: () => llamados.push(nombre) }));
  return { s, llamados };
}

test('arranca las seis tareas por defecto', () => {
  const { s, llamados } = arrancadores();
  assert.strictEqual(startSchedulers({}, s, {}), true);
  assert.strictEqual(llamados.length, 6);
});

test('con TAREAS=off no arranca ninguna', () => {
  const { s, llamados } = arrancadores();
  assert.strictEqual(startSchedulers({}, s, { TAREAS: 'off' }), false);
  assert.strictEqual(llamados.length, 0);
});

test('acepta OFF en mayúsculas y con espacios', () => {
  const { s, llamados } = arrancadores();
  startSchedulers({}, s, { TAREAS: ' OFF ' });
  assert.strictEqual(llamados.length, 0);
});

test('cualquier otro valor deja las tareas encendidas', () => {
  const { s, llamados } = arrancadores();
  startSchedulers({}, s, { TAREAS: 'on' });
  assert.strictEqual(llamados.length, 6);
});
