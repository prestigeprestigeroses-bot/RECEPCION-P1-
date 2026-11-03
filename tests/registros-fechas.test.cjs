const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function iniciar(fetch) {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', options: [], events: {}, open: true,
      addEventListener(event, callback) { this.events[event] = callback; },
      replaceChildren(...options) { this.options = options; this.value = options[0]?.value || ''; },
      add(option) { this.options.push(option); }
    });
    return elements.get(id);
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/registros-fechas.js'), 'utf8'), {
    document: { getElementById: get }, fetch, Intl, Date, Number, String, Set,
    AbortSignal, Option: function(text, value) { this.text = text; this.value = value; }
  });
  return get;
}

const esperar = () => new Promise(resolve => setImmediate(resolve));

test('bloque carga variedades y tamanos aunque catalogo tenga espacios y numeros', async () => {
  const get = iniciar(async () => ({ ok: true, json: async () => ({ ok: true, data: [
    { tipo: ' 12 ', bloque: 8, variedad: ' Tiffany ', tamano: ' Corto ', tallos: 20 },
    { tipo: '13', bloque: '8 ', variedad: 'Tiffany', tamano: 'Largo', tallos: 25 },
    { tipo: '14', bloque: 9, variedad: 'Mondial', tamano: null, tallos: 15 }
  ] }) }));
  assert.equal(get('ingreso-variedad').disabled, true);
  assert.equal(get('ingreso-tipo').disabled, true);
  get('ingreso-fecha-panel').events.toggle();
  await esperar();
  assert.equal(get('ingreso-bloque').options.length, 3);
  get('ingreso-bloque').value = '8';
  get('ingreso-bloque').events.change();
  assert.equal(get('ingreso-variedad').value, 'Tiffany');
  assert.equal(get('ingreso-tipo').options.length, 3);
  assert.match(get('ingreso-tipo').options[1].text, /Corto \/ 20 tallos/);
  get('ingreso-bloque').value = '9';
  get('ingreso-bloque').events.change();
  assert.equal(get('ingreso-variedad').value, 'Mondial');
  assert.equal(get('ingreso-tipo').value, '14');
});

test('error del catalogo ofrece reintento y recupera opciones', async () => {
  let intentos = 0;
  const get = iniciar(async () => {
    if (++intentos === 1) throw new Error('Sin conexion');
    return { ok: true, json: async () => ({ ok: true, data: [
      { tipo: '12', bloque: 8, variedad: 'Tiffany', tallos: 20 }
    ] }) };
  });
  get('ingreso-fecha-panel').events.toggle();
  await esperar();
  assert.equal(get('reintentar-catalogo').hidden, false);
  assert.equal(get('ingreso-bloque').disabled, true);
  await get('reintentar-catalogo').events.click();
  assert.equal(get('reintentar-catalogo').hidden, true);
  assert.equal(get('ingreso-bloque').disabled, false);
});
