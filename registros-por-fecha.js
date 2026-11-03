const crypto = require("crypto");

function fechaValida(fecha) {
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) &&
    !Number.isNaN(Date.parse(fecha)) && new Date(fecha).toISOString().slice(0, 10) === fecha;
}

module.exports = (app, pool) => {
  app.get("/api/historico-dia", async (req, res) => {
    const fecha = String(req.query.fecha || "");
    if (!fechaValida(fecha)) return res.status(400).json({ ok: false, error: "Fecha invalida" });
    try {
      const result = await pool.query(`
        SELECT bloque, variedad, tamano, COALESCE(form, '') AS form,
          tallos, etapa, COUNT(*)::int AS tabacos,
          COALESCE(SUM(tallos), 0)::int AS total_tallos
        FROM public.registros
        WHERE (created_at AT TIME ZONE 'America/Bogota')::date = $1::date
        GROUP BY bloque, variedad, tamano, COALESCE(form, ''), tallos, etapa
        ORDER BY bloque, variedad, tamano, form
      `, [fecha]);
      res.json({ ok: true, data: result.rows });
    } catch (err) {
      console.error("Error consulta historica:", err);
      res.status(500).json({ ok: false, error: "No se pudo consultar el dia" });
    }
  });

  app.post("/api/ingreso-por-fecha", async (req, res) => {
    const { fecha, tipo } = req.body;
    const cantidad = Number(req.body.cantidad);
    const form = String(req.body.form || "").trim();
    if (!fechaValida(String(fecha || "")) || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 5000 || form.length > 100) {
      return res.status(400).json({ ok: false, error: "Revisa fecha y cantidad (1 a 5000)" });
    }
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query("SET LOCAL TIME ZONE 'America/Bogota'");
      const today = await client.query("SELECT CURRENT_DATE::text AS hoy");
      if (fecha > today.rows[0].hoy) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: "No se permiten fechas futuras" });
      }
      const catalogo = await client.query("SELECT * FROM public.tipos_variedad WHERE tipo::text = $1 LIMIT 1", [String(tipo || "")]);
      if (!catalogo.rowCount) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, error: "Selecciona una combinacion valida del catalogo" });
      }
      const t = catalogo.rows[0];
      const seriales = Array.from({ length: cantidad }, () => String(crypto.randomInt(100000000, 1000000000)));
      await client.query(`
        INSERT INTO public.registros
          (barcode, tipo, serial, variedad, bloque, tamano, tallos, etapa, viaje, form, es_reregistro, created_at)
        SELECT $1::text || s, $1, s, $2, $3, $4, $5, 'Ingreso', NULL, $6, false,
          ($7::date + TIME '12:00:00') AT TIME ZONE 'America/Bogota'
        FROM unnest($8::text[]) AS s
      `, [String(t.tipo), t.variedad, t.bloque, t.tamano, t.tallos, form, fecha, seriales]);
      await client.query("COMMIT");
      res.json({ ok: true, cantidad });
    } catch (err) {
      if (client) await client.query("ROLLBACK");
      console.error("Error ingreso por fecha:", err);
      res.status(500).json({ ok: false, error: "No se guardo el lote. Revisa la conexion e intenta nuevamente." });
    } finally {
      if (client) client.release();
    }
  });
};
