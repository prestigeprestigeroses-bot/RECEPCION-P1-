const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/app.js'), 'utf8');
const sync = source.slice(source.indexOf('async function sincronizarRegistrosOffline()'), source.indexOf('function setAcumuladoSeguro('));

function contexto(pendientes, resultado = 'OK') {
  const enviados = [];
  const eliminados = [];
  const duplicados = [];
  const cambios = [];
  const context = vm.createContext({
    sincronizandoOffline: false, navigator: { onLine: true }, crypto,
    crearSolicitudEscaneo: () => crypto.randomUUID(),
    viajeActivo: 'Viaje 1', cacheDetalle: [], erroresSesionActual: 0,
    console: { warn() {}, error() {} }, setTimeout() {},
    obtenerRegistrosOfflinePendientes: async () => pendientes.filter(i => !eliminados.includes(i.id) && !cambios.some(c => c.id === i.id && c.estado === 'RECHAZADO')),
    actualizarRegistroLocal: async (item, cambio) => { cambios.push({ id: item.id, ...cambio }); Object.assign(item, cambio); return item; },
    eliminarRegistroOffline: async id => eliminados.push(id),
    agregarYaRegistradoPanel: data => duplicados.push(data),
    renderDetalle() {}, refrescarResumenPorVariedad() {}, pintarDuplicadosYErrores() {}, setStatus() {}, programarRefrescoPostEscaneo() {}
  });
  vm.runInContext(sync, context);
  context.solicitarEscaneo = async item => {
    enviados.push({ ...item });
    return { ok: true, resultado, data: { barcode: item.barcode } };
  };
  return { context, enviados, eliminados, duplicados, cambios };
}

test('dos llamadas simultaneas no despachan el mismo pendiente dos veces', async () => {
  const state = contexto([{ id: 1, barcode: '12123', viaje: 'Viaje 1', solicitud_escaneo: 'id-1' }]);
  await Promise.all([state.context.sincronizarRegistrosOffline(), state.context.sincronizarRegistrosOffline()]);
  assert.equal(state.enviados.length, 1);
  assert.equal(state.duplicados.length, 0);
  assert.equal(state.context.sincronizandoOffline, false);
});

test('pendientes antiguos reciben identidad persistida antes del envio', async () => {
  const state = contexto([{ id: 1, barcode: '12123', viaje: 'Viaje 1' }]);
  await state.context.sincronizarRegistrosOffline();
  assert(state.cambios[0].solicitud_escaneo);
  assert.equal(state.enviados[0].solicitud_escaneo, state.cambios[0].solicitud_escaneo);
});

test('respuesta desconocida o error de red conserva el pendiente', async () => {
  const state = contexto([{ id: 1, barcode: '12123', viaje: 'Viaje 1', solicitud_escaneo: 'id-1' }], 'DESCONOCIDO');
  await state.context.sincronizarRegistrosOffline();
  assert.equal(state.eliminados.length, 0);
  state.context.solicitarEscaneo = async () => { throw new Error('Timeout'); };
  await state.context.sincronizarRegistrosOffline();
  assert.equal(state.eliminados.length, 0);
  assert.equal(state.context.sincronizandoOffline, false);
});

test('NO_EXISTE se conserva como rechazado en lugar de borrarse como confirmado', async () => {
  const state = contexto([{ id: 1, barcode: '12123', viaje: 'Viaje 1', solicitud_escaneo: 'id-1' }], 'NO_EXISTE');
  await state.context.sincronizarRegistrosOffline();
  assert.equal(state.eliminados.length, 0);
  assert.equal(state.cambios[0].estado, 'RECHAZADO');
});

test('solo YA_REGISTRADO confirmado por servidor aparece en duplicados', async () => {
  const state = contexto([{ id: 1, barcode: '12123', viaje: 'Viaje 1', solicitud_escaneo: 'id-1' }], 'YA_REGISTRADO');
  await state.context.sincronizarRegistrosOffline();
  assert.equal(state.duplicados.length, 1);
  assert.equal(state.eliminados.length, 1);
});
