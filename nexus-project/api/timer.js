// api/timer.js — Persiste el tiempo de inicio de cada reto en Supabase
// GET  ?estudiante_id=X&reto_id=Y&mision_id=Z  → devuelve timer guardado
// POST { estudiante_id, reto_id, mision_id, inicio_ts, duracion_seg }  → guarda timer
// DELETE ?estudiante_id=X&reto_id=Y&mision_id=Z  → borra timer (al expirar)

const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
    return res.status(200).json({ error: "Faltan variables de entorno" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // ── GET: obtener timer guardado ─────────────────────────────
  if (req.method === "GET") {
    const { estudiante_id, reto_id, mision_id } = req.query;
    if (!estudiante_id || !reto_id)
      return res.status(200).json({ timer: null });

    try {
      let q = supabase
        .from("nexus_timers")
        .select("inicio_ts, duracion_seg, created_at")
        .eq("estudiante_id", String(estudiante_id))
        .eq("reto_id",       String(reto_id));
      if (mision_id) q = q.eq("mision_id", String(mision_id));

      const { data, error } = await q.maybeSingle();

      if (error) {
        // Si la tabla no existe aún, devolver null en lugar de error
        if (error.message?.includes("does not exist") || error.message?.includes("schema cache"))
          return res.status(200).json({ timer: null, tableNotFound: true });
        return res.status(200).json({ timer: null, error: error.message });
      }

      return res.status(200).json({ timer: data || null });
    } catch (err) {
      return res.status(200).json({ timer: null, error: err.message });
    }
  }

  // ── POST: guardar timer ─────────────────────────────────────
  if (req.method === "POST") {
    const { estudiante_id, reto_id, mision_id, inicio_ts, duracion_seg } = req.body;
    if (!estudiante_id || !reto_id || !inicio_ts || !duracion_seg)
      return res.status(200).json({ error: "Faltan campos requeridos" });

    try {
      const row = {
        estudiante_id: String(estudiante_id),
        reto_id:       String(reto_id),
        mision_id:     String(mision_id || ""),
        inicio_ts:     Number(inicio_ts),
        duracion_seg:  Number(duracion_seg),
        updated_at:    new Date().toISOString(),
      };

      // Intentar upsert con constraint única
      const { error: e1 } = await supabase
        .from("nexus_timers")
        .upsert(row, { onConflict: "estudiante_id,reto_id,mision_id" });

      if (!e1) return res.status(200).json({ success: true });

      // Fallback: buscar y actualizar manualmente
      const { data: existing } = await supabase
        .from("nexus_timers")
        .select("id")
        .eq("estudiante_id", row.estudiante_id)
        .eq("reto_id",       row.reto_id)
        .eq("mision_id",     row.mision_id)
        .maybeSingle();

      if (existing?.id) {
        await supabase.from("nexus_timers").update(row).eq("id", existing.id);
      } else {
        await supabase.from("nexus_timers").insert(row);
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(200).json({ error: err.message });
    }
  }

  // ── DELETE: borrar timer (expirado o reto completado) ───────
  if (req.method === "DELETE") {
    const { estudiante_id, reto_id, mision_id } = req.query;
    if (!estudiante_id || !reto_id)
      return res.status(200).json({ error: "Faltan campos" });

    try {
      let q = supabase
        .from("nexus_timers")
        .delete()
        .eq("estudiante_id", String(estudiante_id))
        .eq("reto_id",       String(reto_id));
      if (mision_id) q = q.eq("mision_id", String(mision_id));

      await q;
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(200).json({ error: err.message });
    }
  }

  return res.status(200).end();
};
