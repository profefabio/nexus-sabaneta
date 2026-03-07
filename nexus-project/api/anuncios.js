const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // ── GET: obtener anuncios para un estudiante o todos los del docente ──
  if (req.method === "GET") {
    const { docente_id, grado, grupo, estudiante_id } = req.query;

    try {
      let q = supabase.from("nexus_anuncios").select("*").order("created_at", { ascending: false });

      if (docente_id && !estudiante_id) {
        // Docente: ver sus propios anuncios
        q = q.eq("docente_id", String(docente_id));
      } else if (estudiante_id && grado) {
        // Estudiante: ver anuncios que le aplican (global, de su grado, o de su grupo)
        // No podemos filtrar fácilmente en SQL, lo hacemos en JS
        const { data: todos } = await q;
        const anunciosVisibles = (todos || []).filter(a => {
          // Sin filtro de grado → todos lo ven
          if (!a.grado) return true;
          if (a.grado !== String(grado)) return false;
          // Con grado coincidente, verificar grupo
          if (!a.grupo) return true; // sin filtro de grupo
          return a.grupo === String(grupo || "");
        });
        return res.status(200).json({ anuncios: anunciosVisibles });
      }

      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json({ anuncios: data || [] });
    } catch (err) {
      return res.status(200).json({ anuncios: [], error: err.message });
    }
  }

  // ── POST: crear anuncio ──
  if (req.method === "POST") {
    const { accion, docente_id, docente_nombre, mensaje, grado, grupo, prioridad } = req.body;

    if (accion === "marcar_leido") {
      // Marcar anuncio como leído por un estudiante
      const { anuncio_id, estudiante_id } = req.body;
      try {
        // Guardamos en nexus_chats como registro de lectura
        await supabase.from("nexus_chats").insert({
          estudiante_id: String(estudiante_id),
          role: "assistant",
          content: `__anuncio_leido__:${anuncio_id}`,
          equipo_nombre: null,
        }).select();
        return res.status(200).json({ success: true });
      } catch (err) {
        return res.status(200).json({ success: false, error: err.message });
      }
    }

    if (!docente_id || !mensaje) {
      return res.status(400).json({ error: "docente_id y mensaje son requeridos" });
    }

    try {
      const { data, error } = await supabase.from("nexus_anuncios").insert({
        docente_id: String(docente_id),
        docente_nombre: docente_nombre || "",
        mensaje: mensaje.trim(),
        grado: grado || null,
        grupo: grupo || null,
        prioridad: prioridad || "normal",
      }).select().single();

      if (error) throw error;
      return res.status(200).json({ success: true, anuncio: data });
    } catch (err) {
      // Si la tabla no existe, devolver error útil
      if (err.message && err.message.includes("does not exist")) {
        return res.status(200).json({
          success: false,
          error: "tabla_no_existe",
          sql: `CREATE TABLE IF NOT EXISTS nexus_anuncios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  docente_id TEXT NOT NULL,
  docente_nombre TEXT,
  mensaje TEXT NOT NULL,
  grado TEXT,
  grupo TEXT,
  prioridad TEXT DEFAULT 'normal',
  created_at TIMESTAMPTZ DEFAULT now()
);`
        });
      }
      return res.status(200).json({ success: false, error: err.message });
    }
  }

  // ── DELETE: eliminar anuncio ──
  if (req.method === "DELETE") {
    const { id, docente_id } = req.query;
    if (!id || !docente_id) return res.status(400).json({ error: "id y docente_id requeridos" });
    try {
      const { error } = await supabase.from("nexus_anuncios")
        .delete().eq("id", id).eq("docente_id", String(docente_id));
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(200).json({ success: false, error: err.message });
    }
  }

  return res.status(200).end();
};
