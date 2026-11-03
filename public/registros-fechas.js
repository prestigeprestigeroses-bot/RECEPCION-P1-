(() => {
  const el = (id) => document.getElementById(id);
  let catalogo = [];
  let cargandoCatalogo = false;
  const hoy = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota' }).format(new Date());
  for (const id of ['ingreso-fecha', 'historico-fecha']) {
    el(id).value = hoy;
    el(id).max = hoy;
  }

  function opciones(select, values, placeholder) {
    select.replaceChildren(new Option(placeholder, ''));
    values.forEach(([value, label]) => select.add(new Option(label, value)));
  }

  function cargarTipos() {
    const tipos = catalogo.filter(t => String(t.bloque) === el('ingreso-bloque').value && t.variedad === el('ingreso-variedad').value);
    opciones(el('ingreso-tipo'), tipos.map(t => [String(t.tipo), `${t.tamano || 'NA'} / ${t.tallos} tallos (${t.tipo})`]), 'Seleccionar tamano y tallos');
  }

  el('ingreso-bloque').addEventListener('change', () => {
    const variedades = [...new Set(catalogo.filter(t => String(t.bloque) === el('ingreso-bloque').value).map(t => t.variedad))].sort();
    opciones(el('ingreso-variedad'), variedades.map(v => [v, v]), 'Seleccionar variedad');
    cargarTipos();
  });
  el('ingreso-variedad').addEventListener('change', cargarTipos);
  el('ingreso-fecha-panel').addEventListener('toggle', async () => {
    if (!el('ingreso-fecha-panel').open || catalogo.length || cargandoCatalogo) return;
    cargandoCatalogo = true;
    try {
      const res = await fetch('/api/tipos-variedad');
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error('No se pudo cargar el catalogo');
      catalogo = json.data;
      const bloques = [...new Set(catalogo.map(t => String(t.bloque)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      opciones(el('ingreso-bloque'), bloques.map(b => [b, b]), 'Seleccionar bloque');
    } catch (err) {
      el('ingreso-fecha-estado').textContent = err.message;
    } finally {
      cargandoCatalogo = false;
    }
  });

  async function consultar() {
    const fecha = el('historico-fecha').value;
    el('historico-fecha-estado').textContent = 'Consultando...';
    el('historico-filas').replaceChildren();
    el('historico-tabacos').textContent = '0';
    el('historico-tallos').textContent = '0';
    try {
      const res = await fetch(`/api/historico-dia?fecha=${encodeURIComponent(fecha)}`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'No se pudo consultar');
      if (el('historico-fecha').value !== fecha) return;
      let tabacos = 0;
      let tallos = 0;
      const fragment = document.createDocumentFragment();
      json.data.forEach(row => {
        const tr = document.createElement('tr');
        [row.bloque, row.variedad, row.tamano || 'NA', row.form || '-', row.tallos, row.etapa, row.tabacos, row.total_tallos].forEach(value => {
          const td = document.createElement('td');
          td.textContent = value ?? '';
          tr.appendChild(td);
        });
        fragment.appendChild(tr);
        tabacos += Number(row.tabacos);
        tallos += Number(row.total_tallos);
      });
      el('historico-filas').replaceChildren(fragment);
      el('historico-tabacos').textContent = tabacos;
      el('historico-tallos').textContent = tallos;
      el('historico-fecha-estado').textContent = `${fecha}: ${tabacos ? 'Solo lectura' : 'Sin registros'}`;
    } catch (err) {
      el('historico-fecha-estado').textContent = err.message;
    }
  }

  el('historico-fecha-form').addEventListener('submit', event => {
    event.preventDefault();
    consultar();
  });

  el('ingreso-fecha-form').addEventListener('submit', async event => {
    event.preventDefault();
    const boton = el('guardar-ingreso-fecha');
    if (boton.disabled) return;
    const fecha = el('ingreso-fecha').value;
    const cantidad = Number(el('ingreso-cantidad').value);
    const tipo = el('ingreso-tipo').value;
    if (!confirm(`Guardar ${cantidad} tabacos de ${el('ingreso-variedad').value}, bloque ${el('ingreso-bloque').value}, con fecha ${fecha}?`)) return;
    boton.disabled = true;
    el('ingreso-fecha-estado').textContent = 'Guardando...';
    try {
      const res = await fetch('/api/ingreso-por-fecha', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, cantidad, tipo, form: el('ingreso-form').value })
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'No se pudo guardar');
      el('ingreso-fecha-estado').textContent = `${json.cantidad} tabacos guardados el ${fecha}.`;
      el('ingreso-cantidad').value = '';
      el('historico-fecha').value = fecha;
      await consultar();
      if (fecha === hoy) programarRefrescoConsultaGeneral();
    } catch (err) {
      el('ingreso-fecha-estado').textContent = err.message;
    } finally {
      boton.disabled = false;
    }
  });
})();
