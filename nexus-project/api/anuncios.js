// api/anuncios.js — Mensajes del docente para estudiantes
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // ── GET: obtener anuncios para un estudiante (filtrado por grado/grupo) ──
  if (req.method === "GET") {
    const { docente_id, grado, grupo } = req.query;
    try {
      let q = supabase
        .from("nexus_anuncios")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (docente_id) q = q.eq("docente_id", String(docente_id));
      const { data, error } = await q;
      if (error) return res.status(200).json({ anuncios: [], error: error.message });

      // Filtrar: si el anuncio tiene grado/grupo, solo mostrarlo al grupo correcto
      const filtrados = (data || []).filter(a => {
        const okGrado = !a.grado || a.grado === "" || a.grado === String(grado);
        const okGrupo = !a.grupo || a.grupo === "" || a.grupo === String(grupo);
        return okGrado && okGrupo;
      });
      return res.status(200).json({ anuncios: filtrados });
    } catch (err) {
      return res.status(200).json({ anuncios: [], error: err.message });
    }
  }

  // ── POST: crear anuncio ──
  if (req.method === "POST") {
    const { docente_id, docente_nombre, mensaje, grado, grupo, prioridad } = req.body || {};
    if (!docente_id || !mensaje)
      return res.status(400).json({ error: "docente_id y mensaje requeridos" });
    try {
      const { data, error } = await supabase
        .from("nexus_anuncios")
        .insert({
          docente_id: String(docente_id),
          docente_nombre: docente_nombre || "Docente",
          mensaje,
          grado: grado || null,
          grupo: grupo || null,
          prioridad: prioridad || "normal",
        })
        .select()
        .single();
      if (error) return res.status(200).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, anuncio: data });
    } catch (err) {
      return res.status(200).json({ ok: false, error: err.message });
    }
  }

  // ── DELETE: eliminar anuncio ──
  if (req.method === "DELETE") {
    const { id, docente_id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id requerido" });
    try {
      const { error } = await supabase
        .from("nexus_anuncios")
        .delete()
        .eq("id", id)
        .eq("docente_id", String(docente_id));
      if (error) return res.status(200).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(200).json({ ok: false, error: err.message });
    }
  }

  return res.status(200).end();
};
