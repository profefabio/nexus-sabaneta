// api/savechat.js — v5: soporta reto_id para conversaciones por reto
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // ── GET: historial de un estudiante (filtro por misión y/o reto) ──
  if (req.method === "GET") {
    const { estudiante_id, mision_id, reto_id } = req.query;
    if (!estudiante_id) return res.status(200).json({ error: "Falta estudiante_id" });

    let q = supabase
      .from("nexus_chats")
      .select("id, role, content, xp_at_time, reto_id, mision_id, mision_title, created_at")
      .eq("estudiante_id", String(estudiante_id))
      .order("created_at", { ascending: true })
      .limit(500);

    if (mision_id) q = q.eq("mision_id", mision_id);

    // Filtro por reto: si reto_id="__libre__" traer los que tienen reto_id null
    if (reto_id !== undefined && reto_id !== null && reto_id !== "") {
      if (reto_id === "__libre__") q = q.is("reto_id", null);
      else q = q.eq("reto_id", String(reto_id));
    }

    const { data, error } = await q;
    if (error) return res.status(200).json({ error: error.message });
    return res.status(200).json({ msgs: data || [] });
  }

  // ── POST: guardar un mensaje ──
  if (req.method === "POST") {
    const { estudiante_id, nombre_estudiante, mision_id, mision_title,
            role, content, xp_at_time, equipo_nombre, reto_id } = req.body;

    if (!estudiante_id || !role || !content)
      return res.status(200).json({ error: "Faltan campos requeridos" });

    const safeContent = String(content).slice(0, 8000);

    const row = {
      estudiante_id:    String(estudiante_id),
      nombre_estudiante: nombre_estudiante || "",
      mision_id:        mision_id || null,
      mision_title:     mision_title || null,
      reto_id:          reto_id ? String(reto_id) : null,
      role,
      content:          safeContent,
      xp_at_time:       xp_at_time || 0,
      equipo_nombre:    equipo_nombre || null,
      created_at:       new Date().toISOString(),
    };

    const { error } = await supabase.from("nexus_chats").insert(row);
    if (error) return res.status(200).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(200).end();
};
