const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

function iniciar() {
  const enviados = [];
  const eventos = {};
  const input = { tagName: 'INPUT', value: '', focus(options) { this.options = options; context.document.activeElement = this; } };
  const context = vm.createContext({
    barcodeInput: input, lectorBuffer: '',
    document: { activeElement: null, hidden: false, addEventListener(name, callback, capture) { eventos[name] = { callback, capture }; } },
    window: { addEventListener(name, callback, capture) { eventos[name] = { callback, capture }; } },
    setTimeout(callback) { callback(); },
    obtenerCaracterDesdeTecla: e => /^[a-zA-Z0-9]$/.test(e.key) ? e.key.toUpperCase() : null,
    mostrarLectorGlobal() {},
    limpiarLectorGlobal() { context.lectorBuffer = ''; input.value = ''; },
    encolarCodigo: codigo => enviados.push(codigo)
  });
  const teclado = source.slice(source.indexOf('function esCampoManualLector('), source.indexOf('if (barcodeInput) {', source.indexOf('function esCampoManualLector(')));
  const foco = source.slice(source.indexOf('function focusBarcodeSeguro('), source.indexOf('function conservarPosicionPantalla('));
  const recuperar = source.slice(source.indexOf('function puedeRecuperarFoco('), source.indexOf('document.addEventListener("change", e =>'));
  const interacciones = source.slice(source.indexOf('document.addEventListener("change", e =>'), source.indexOf('async function activarViajeInicialAutomatico('));
  vm.runInContext(teclado + '\n' + foco + '\n' + recuperar + '\n' + interacciones, context);
  function tecla(key, target = input, extra = {}) {
    const event = { key, target, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra };
    eventos.keydown.callback(event);
    return event;
  }
  return { context, enviados, eventos, input, tecla };
}

test('escanea desde un boton sin disparar su accion al recibir Enter', () => {
  const s = iniciar();
  const button = { tagName: 'BUTTON' };
  for (const key of '1212345') s.tecla(key, button);
  const enter = s.tecla('Enter', button);
  assert.deepEqual(s.enviados, ['1212345']);
  assert(enter.prevented && enter.stopped);
  assert.equal(s.eventos.keydown.capture, true);
});

test('dos escaneos consecutivos con Enter o Tab entran una sola vez cada uno', () => {
  const s = iniciar();
  for (const key of '12123') s.tecla(key);
  s.tecla('Enter');
  s.tecla('Tab');
  for (const key of '12456') s.tecla(key);
  s.tecla('Tab');
  assert.deepEqual(s.enviados, ['12123', '12456']);
});

test('al terminar de seleccionar bloque recupera foco antes de las consultas', () => {
  const s = iniciar();
  const select = { tagName: 'SELECT', closest() { return null; }, blur() { s.context.document.activeElement = null; } };
  s.context.document.activeElement = select;
  s.eventos.change.callback({ target: select });
  assert.equal(s.context.document.activeElement, s.input);
  assert.equal(s.input.options.preventScroll, true);
  assert.equal(s.eventos.change.capture, true);
});

test('inicio y regreso a la ventana recuperan el foco', () => {
  const s = iniciar();
  s.eventos.pageshow.callback();
  assert.equal(s.context.document.activeElement, s.input);
  s.context.document.activeElement = null;
  s.eventos.focus.callback();
  assert.equal(s.context.document.activeElement, s.input);
});

test('respeta escritura manual y controles del formulario por fecha', () => {
  const s = iniciar();
  const manual = { tagName: 'INPUT' };
  s.context.document.activeElement = manual;
  assert.equal(s.tecla('5', manual).prevented, false);
  s.eventos.focusout.callback();
  assert.equal(s.context.document.activeElement, manual);
  assert.equal(s.context.lectorBuffer, '');
  const select = { tagName: 'SELECT', closest() { return {}; } };
  s.context.document.activeElement = select;
  s.eventos.change.callback({ target: select });
  assert.equal(s.context.document.activeElement, select);
});
