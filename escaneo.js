const crypto = require('crypto');

module.exports = function crearEscaneo(pool) {
  let esquema;
  function preparar() {
    if (!esquema) {
      esquema = pool.query('ALTER TABLE public.registros ADD COLUMN IF NOT EXISTS solicitud_escaneo text')
        .catch(error => { esquema = null; throw error; });
    }
    return esquema;
  }

  return async (req, res) => {
    const barcode = String(req.body.barcode || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const viaje = String(req.body.viaje || '').trim();
    const form = String(req.body.form || '').trim();
    const solicitud = String(req.body.solicitud_escaneo || crypto.randomUUID());
    if (!viaje || barcode.length < 2 || solicitud.length > 100 || form.length > 100) {
      return res.status(400).json({ ok: false, error: 'Codigo, viaje o solicitud invalida' });
    }
    try {
      await preparar();
      const tipo = barcode.slice(0, 2);
      const catalogo = await pool.query('SELECT tipo, variedad, bloque, tamano, tallos FROM public.tipos_variedad WHERE tipo = $1 LIMIT 1', [tipo]);
      if (!catalogo.rowCount) {
        return res.json({ ok: true, resultado: 'NO_EXISTE', data: { barcode, tipo }, mensaje: `El tipo ${tipo} no existe en el catalogo` });
      }
      const t = catalogo.rows[0];
      const insert = await pool.query(`
        INSERT INTO public.registros
          (barcode, tipo, serial, variedad, bloque, tamano, tallos, etapa, viaje, form, solicitud_escaneo)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'Ingreso',$8,$9,$10)
        ON CONFLICT (barcode) DO NOTHING RETURNING *
      `, [barcode, tipo, barcode.slice(2), t.variedad, t.bloque, t.tamano, t.tallos, viaje, form, solicitud]);
      let row = insert.rows[0];
      if (!row) {
        const existente = await pool.query('SELECT * FROM public.registros WHERE barcode = $1 LIMIT 1', [barcode]);
        row = existente.rows[0];
        if (!row) {
          return res.status(409).json({ ok: false, error: 'El registro cambio durante el envio. Se reintentara.' });
        }
      }
      const mismoEnvio = row.solicitud_escaneo === solicitud;
      const resultado = insert.rowCount || mismoEnvio ? 'OK' : 'YA_REGISTRADO';
      return res.json({
        ok: true, resultado, recuperado: !insert.rowCount && mismoEnvio,
        data: { ...row, fecha: row.created_at, fechaAnterior: row.created_at, resultado,
          observacion: resultado === 'OK' ? 'Confirmado en la base de datos' : 'El codigo ya existe en la base de datos' }
      });
    } catch (error) {
      console.error('Error confirmando escaneo:', error);
      return res.status(500).json({ ok: false, error: 'No se pudo confirmar en Postgres. El registro permanece guardado localmente.' });
    }
  };
};
