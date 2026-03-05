// api/savechat.js — v5b: soporta reto_id con fallback si la columna no existe
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // ── GET: historial de un estudiante ──────────────────────────
  if (req.method === "GET") {
    const { estudiante_id, mision_id, reto_id } = req.query;
    if (!estudiante_id) return res.status(200).json({ error: "Falta estudiante_id" });

    let q = supabase
      .from("nexus_chats")
      .select("id, role, content, xp_at_time, mision_id, mision_title, created_at")
      .eq("estudiante_id", String(estudiante_id))
      .neq("role", "system")
      .order("created_at", { ascending: true })
      .limit(500);

    if (mision_id) q = q.eq("mision_id", mision_id);

    const { data, error } = await q;
    if (error) return res.status(200).json({ error: error.message });

    // Intentar filtrar por reto_id si se especifica (columna puede no existir aún)
    let msgs = data || [];
    if (reto_id !== undefined && reto_id !== null && reto_id !== "") {
      try {
        let q2 = supabase
          .from("nexus_chats")
          .select("id, role, content, xp_at_time, reto_id, mision_id, mision_title, created_at")
          .eq("estudiante_id", String(estudiante_id))
          .neq("role", "system")
          .order("created_at", { ascending: true })
          .limit(500);
        if (mision_id) q2 = q2.eq("mision_id", mision_id);
        if (reto_id === "__libre__") q2 = q2.is("reto_id", null);
        else q2 = q2.eq("reto_id", String(reto_id));
        const { data: d2, error: e2 } = await q2;
        if (!e2) msgs = d2 || [];
      } catch(_) { /* reto_id columna no existe, usar msgs sin filtro */ }
    }

    return res.status(200).json({
      msgs: msgs.map(m => ({ role: m.role, content: m.content, reto_id: m.reto_id || null }))
    });
  }

  // ── POST: guardar un mensaje ──────────────────────────────────
  if (req.method === "POST") {
    const { estudiante_id, nombre_estudiante, mision_id, mision_title,
            role, content, xp_at_time, equipo_nombre, reto_id } = req.body;

    if (!estudiante_id || !role || !content)
      return res.status(200).json({ error: "Faltan campos requeridos" });

    const safeContent = String(content).slice(0, 8000);

    // Intentar insertar CON reto_id primero
    const rowFull = {
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

    const { error: e1 } = await supabase.from("nexus_chats").insert(rowFull);

    if (!e1) return res.status(200).json({ success: true });

    // Fallback: insertar SIN reto_id (columna puede no existir en Supabase aún)
    const rowBasic = {
      estudiante_id:    String(estudiante_id),
      nombre_estudiante: nombre_estudiante || "",
      mision_id:        mision_id || null,
      mision_title:     mision_title || null,
      role,
      content:          safeContent,
      xp_at_time:       xp_at_time || 0,
      equipo_nombre:    equipo_nombre || null,
      created_at:       new Date().toISOString(),
    };

    const { error: e2 } = await supabase.from("nexus_chats").insert(rowBasic);
    if (e2) return res.status(200).json({ error: e2.message });
    return res.status(200).json({ success: true, fallback: true });
  }

  return res.status(200).end();
};
