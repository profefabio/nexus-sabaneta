// api/savechat.js — Guarda mensajes del chat por estudiante y misión
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // ── GET: traer historial de un estudiante (con filtro opcional de misión)
  if (req.method === "GET") {
    const { estudiante_id, mision_id, docente_view } = req.query;
    if (!estudiante_id) return res.status(200).json({ error: "Falta estudiante_id" });

    let q = supabase
      .from("nexus_chats")
      .select("*")
      .eq("estudiante_id", String(estudiante_id))
      .order("created_at", { ascending: true })
      .limit(500);

    if (mision_id) q = q.eq("mision_id", mision_id);

    const { data, error } = await q;
    if (error) return res.status(200).json({ error: error.message });
    return res.status(200).json({ msgs: data || [] });
  }

  // ── POST: guardar un mensaje o bloque de mensajes
  if (req.method === "POST") {
    const { estudiante_id, nombre_estudiante, mision_id, mision_title,
            role, content, xp_at_time, equipo_nombre } = req.body;

    if (!estudiante_id || !role || !content)
      return res.status(200).json({ error: "Faltan campos requeridos" });

    const { error } = await supabase.from("nexus_chats").insert({
      estudiante_id: String(estudiante_id),
      nombre_estudiante: nombre_estudiante || "",
      mision_id: mision_id || null,
      mision_title: mision_title || null,
      role,
      content,
      xp_at_time: xp_at_time || 0,
      equipo_nombre: equipo_nombre || null,
      created_at: new Date().toISOString(),
    });

    if (error) return res.status(200).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(200).end();
};
