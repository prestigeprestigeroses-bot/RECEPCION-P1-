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
      const consulta = await pool.query(`
        WITH catalogo AS (
          SELECT tipo, variedad, bloque, tamano, tallos
          FROM public.tipos_variedad WHERE tipo = $2 LIMIT 1
        ), insertado AS (
          INSERT INTO public.registros
          (barcode, tipo, serial, variedad, bloque, tamano, tallos, etapa, viaje, form, solicitud_escaneo)
          SELECT $1, tipo, $3, variedad, bloque, tamano, tallos, 'Ingreso', $4, $5, $6
          FROM catalogo
          ON CONFLICT (barcode) DO NOTHING RETURNING *
        )
        SELECT (SELECT row_to_json(i) FROM insertado i) AS insertado,
          (SELECT row_to_json(r) FROM public.registros r WHERE barcode = $1 LIMIT 1) AS existente,
          EXISTS(SELECT 1 FROM catalogo) AS tipo_valido
      `, [barcode, tipo, barcode.slice(2), viaje, form, solicitud]);
      const datos = consulta.rows[0];
      let row = datos.insertado || datos.existente;
      if (!row) {
        if (!datos.tipo_valido) {
          return res.json({ ok: true, resultado: 'NO_EXISTE', data: { barcode, tipo }, mensaje: `El tipo ${tipo} no existe en el catalogo` });
        }
        return res.status(409).json({ ok: false, error: 'El registro cambio durante el envio. Se reintentara.' });
      }
      const mismoEnvio = row.solicitud_escaneo === solicitud;
      const resultado = datos.insertado || mismoEnvio ? 'OK' : 'YA_REGISTRADO';
      return res.json({
        ok: true, resultado, recuperado: !datos.insertado && mismoEnvio,
        data: { ...row, fecha: row.created_at, fechaAnterior: row.created_at, resultado,
          observacion: resultado === 'OK' ? 'Confirmado en la base de datos' : 'El codigo ya existe en la base de datos' }
      });
    } catch (error) {
      console.error('Error confirmando escaneo:', error);
      return res.status(500).json({ ok: false, error: 'No se pudo confirmar en Postgres. El registro permanece guardado localmente.' });
    }
  };
};
