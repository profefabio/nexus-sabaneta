// api/misiones.js — CRUD de misiones por docente
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: "Faltan variables de entorno" });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // GET — obtener misiones (por docente, por estudiante o todas si es admin)
  if (req.method === "GET") {
    const { docente_id, role } = req.query;
    let query = supabase.from("nexus_misiones").select("*").order("created_at", { ascending: true });

    if (role === "admin") {
      // Admin ve TODAS las misiones — sin filtro
    } else if (role === "student") {
      // Estudiante ve solo las misiones del docente asignado.
      // Si docente_id es vacío/null, ve todas (fallback para compatibilidad).
      if (docente_id) {
        query = query.eq("docente_id", docente_id);
      }
    } else if (docente_id) {
      // Docente: solo ve y edita las suyas
      query = query.eq("docente_id", docente_id);
    }
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    // Parsear retos (guardados como JSON string)
    const misiones = (data || []).map(m => ({
      ...m,
      retos: typeof m.retos === "string" ? JSON.parse(m.retos) : (m.retos || []),
      glow: m.color + "59",
    }));
    return res.status(200).json({ misiones });
  }

  // POST — crear misión
  if (req.method === "POST") {
    const { docente_id, docente_nombre, title, icon, color, description, retos } = req.body;
    if (!docente_id || !title) return res.status(400).json({ error: "Faltan campos requeridos" });
    const { data, error } = await supabase.from("nexus_misiones").insert({
      docente_id, docente_nombre, title, icon, color, description,
      retos: JSON.stringify(retos || []),
      created_at: new Date().toISOString(),
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ mision: { ...data, retos: retos || [], glow: color + "59" } });
  }

  // PUT — actualizar misión
  if (req.method === "PUT") {
    const { id, docente_id, title, icon, color, description, retos } = req.body;
    if (!id) return res.status(400).json({ error: "Falta el id de la misión" });
    const { data, error } = await supabase.from("nexus_misiones")
      .update({ title, icon, color, description, retos: JSON.stringify(retos || []) })
      .eq("id", id).eq("docente_id", docente_id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ mision: { ...data, retos: retos || [], glow: color + "59" } });
  }

  // DELETE — eliminar misión
  if (req.method === "DELETE") {
    const { id, docente_id, role } = req.query;
    if (!id) return res.status(400).json({ error: "Falta el id" });
    let query = supabase.from("nexus_misiones").delete().eq("id", id);
    if (role !== "admin") query = query.eq("docente_id", docente_id);
    const { error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
