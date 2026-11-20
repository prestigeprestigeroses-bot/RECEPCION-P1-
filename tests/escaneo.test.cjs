const { test } = require('node:test');
const assert = require('node:assert/strict');
const crearEscaneo = require('../escaneo');

function respuesta() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
}
function base() {
  const registros = new Map();
  let catalogo = true;
  return {
    registros, sinCatalogo() { catalogo = false; },
    async query(sql, params = []) {
      if (sql.startsWith('ALTER TABLE')) return {};
      if (sql.includes('WITH catalogo')) {
        if (registros.has(params[0])) return { rows: [{ insertado: null, existente: registros.get(params[0]), tipo_valido: catalogo }] };
        if (!catalogo) return { rows: [{ insertado: null, existente: null, tipo_valido: false }] };
        const row = { barcode: params[0], viaje: params[3], form: params[4], solicitud_escaneo: params[5], created_at: '2026-11-20T15:00:00Z' };
        registros.set(row.barcode, row);
        return { rows: [{ insertado: row, existente: null, tipo_valido: true }] };
      }
      return { rows: registros.has(params[0]) ? [registros.get(params[0])] : [] };
    }
  };
}
const request = (id = 'envio-1') => ({ body: { barcode: '12123456789', viaje: 'Viaje 1', form: 'Nacional', solicitud_escaneo: id } });

test('respuesta perdida y reintento del mismo envio confirman OK sin duplicado', async () => {
  const db = base();
  const handler = crearEscaneo(db);
  await handler(request(), respuesta());
  const res = respuesta();
  await handler(request(), res);
  assert.equal(db.registros.size, 1);
  assert.equal(res.body.resultado, 'OK');
  assert.equal(res.body.recuperado, true);
  assert.equal(res.body.data.form, 'Nacional');
});

test('nuevo escaneo de barcode existente devuelve duplicado con fecha y viaje reales', async () => {
  const db = base();
  const handler = crearEscaneo(db);
  await handler(request(), respuesta());
  const res = respuesta();
  await handler(request('otro-envio'), res);
  assert.equal(res.body.resultado, 'YA_REGISTRADO');
  assert.equal(res.body.data.viaje, 'Viaje 1');
  assert.equal(res.body.data.fechaAnterior, '2026-11-20T15:00:00Z');
});

test('barcode eliminado puede registrarse otra vez sin cache de duplicados', async () => {
  const db = base();
  const handler = crearEscaneo(db);
  await handler(request(), respuesta());
  db.registros.clear();
  const res = respuesta();
  await handler(request('nuevo-envio'), res);
  assert.equal(res.body.resultado, 'OK');
  assert.equal(db.registros.size, 1);
});

test('tipo desconocido no confirma un registro inexistente', async () => {
  const db = base();
  db.sinCatalogo();
  const res = respuesta();
  await crearEscaneo(db)(request(), res);
  assert.equal(res.body.resultado, 'NO_EXISTE');
  assert.equal(db.registros.size, 0);
});
