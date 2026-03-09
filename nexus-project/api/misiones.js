// api/misiones.js — v2: CRUD + duración por reto + misiones colaborativas
// Requiere columna `colaboradores` TEXT en nexus_misiones (ver README)
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
    return res.status(200).json({ error: "Faltan variables de entorno" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // ──────────────────────────────────────────────────────
  // GET — obtener misiones (por docente, colaborador, o admin)
  // ──────────────────────────────────────────────────────
  if (req.method === "GET") {
    const { docente_id, role } = req.query;

    let query = supabase
      .from("nexus_misiones")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(300);

    if (role === "admin") {
      // Admin ve TODAS las misiones — sin filtro

    } else if (role === "student") {
      // ✅ FIX: Estudiantes ven TODAS las misiones sin filtro por docente_id.
      // El filtro por grado se aplica en el frontend (App.jsx) usando el campo
      // `grados` de cada misión vs el grado del estudiante que está logueado.
      // Esto permite que múltiples docentes publiquen misiones para el mismo grado.
      // (sin filtro — trae todas)

    } else if (docente_id) {
      // Docente: sus propias misiones SOLO — el filtro de colaboraciones
      // se hace después de traer todo para no complicar la query
      query = query.eq("docente_id", docente_id);
    }

    const { data: misPropias, error: e1 } = await query;
    if (e1) return res.status(200).json({ error: e1.message });

    let todasMisiones = misPropias || [];

    // BUG FIX + NUEVO: Si es docente, también cargar misiones donde es colaborador
    if (docente_id && role !== "admin" && role !== "student") {
      // Traer misiones donde este docente aparece en el campo colaboradores
      // (filtramos en JS porque Supabase JSON contains puede variar)
      const { data: todas } = await supabase
        .from("nexus_misiones")
        .select("*")
        .neq("docente_id", docente_id)
        .order("created_at", { ascending: true })
        .limit(300);

      const colabs = (todas || []).filter(m => {
        try {
          const arr = typeof m.colaboradores === "string"
            ? JSON.parse(m.colaboradores)
            : (m.colaboradores || []);
          return arr.includes(String(docente_id));
        } catch { return false; }
      }).map(m => ({ ...m, es_colaborador: true }));

      todasMisiones = [...todasMisiones, ...colabs];
    }

    const parse = (m) => ({
      ...m,
      retos:        typeof m.retos        === "string" ? JSON.parse(m.retos)        : (m.retos        || []),
      grados:       typeof m.grados       === "string" ? JSON.parse(m.grados)       : (m.grados       || []),
      colaboradores:typeof m.colaboradores=== "string" ? JSON.parse(m.colaboradores): (m.colaboradores|| []),
      glow: m.color + "59",
    });

    return res.status(200).json({ misiones: todasMisiones.map(parse) });
  }

  // ──────────────────────────────────────────────────────
  // POST — crear misión
  // ──────────────────────────────────────────────────────
  if (req.method === "POST") {
    const { docente_id, docente_nombre, title, icon, color, description, retos, grados, colaboradores } = req.body;
    if (!docente_id || !title) return res.status(200).json({ error: "Faltan campos requeridos" });

    // Validar máximo de retos por misión (límite razonable para el prompt de IA)
    const retosArr = Array.isArray(retos) ? retos : [];
    if (retosArr.length > 20) return res.status(200).json({ error: "Máximo 20 retos por misión." });

    const payload = {
      docente_id, docente_nombre, title, icon, color, description,
      retos:  JSON.stringify(retos  || []),
      grados: JSON.stringify(grados || []),
      created_at: new Date().toISOString(),
    };

    // Colaboradores: guardar solo si la columna existe (no lanzar error si no)
    let colaboradoresArr = [];
    try { colaboradoresArr = Array.isArray(colaboradores) ? colaboradores : []; } catch {}
    payload.colaboradores = JSON.stringify(colaboradoresArr);

    let data, error;
    try {
      const result = await supabase.from("nexus_misiones").insert(payload).select().single();
      data = result.data; error = result.error;
    } catch {
      // Si falla con colaboradores (columna no existe), reintentar sin ella
      delete payload.colaboradores;
      const result2 = await supabase.from("nexus_misiones").insert(payload).select().single();
      data = result2.data; error = result2.error;
    }
    if (error) return res.status(200).json({ error: error.message });
    return res.status(200).json({ mision: {
      ...data,
      retos: retos || [], grados: grados || [], colaboradores: colaboradoresArr,
      glow: color + "59",
    }});
  }

  // ──────────────────────────────────────────────────────
  // PUT — actualizar misión
  // ──────────────────────────────────────────────────────
  if (req.method === "PUT") {
    const { id, docente_id, title, icon, color, description, retos, grados, colaboradores } = req.body;
    if (!id) return res.status(200).json({ error: "Falta el id de la misión" });

    const payload = {
      title, icon, color, description,
      retos:  JSON.stringify(retos  || []),
      grados: JSON.stringify(grados || []),
    };

    let colaboradoresArr = [];
    try { colaboradoresArr = Array.isArray(colaboradores) ? colaboradores : []; } catch {}
    payload.colaboradores = JSON.stringify(colaboradoresArr);

    let data, error;
    try {
      const result = await supabase.from("nexus_misiones")
        .update(payload).eq("id", id).eq("docente_id", docente_id).select().single();
      data = result.data; error = result.error;
    } catch {
      delete payload.colaboradores;
      const result2 = await supabase.from("nexus_misiones")
        .update(payload).eq("id", id).eq("docente_id", docente_id).select().single();
      data = result2.data; error = result2.error;
    }
    if (error) return res.status(200).json({ error: error.message });
    return res.status(200).json({ mision: {
      ...data,
      retos: retos || [], grados: grados || [], colaboradores: colaboradoresArr,
      glow: color + "59",
    }});
  }

  // ──────────────────────────────────────────────────────
  // DELETE — eliminar misión
  // ──────────────────────────────────────────────────────
  if (req.method === "DELETE") {
    const { id, docente_id, role } = req.query;
    if (!id) return res.status(200).json({ error: "Falta el id" });
    let query = supabase.from("nexus_misiones").delete().eq("id", id);
    if (role !== "admin") query = query.eq("docente_id", docente_id);
    const { error } = await query;
    if (error) return res.status(200).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(200).json({ error: "Method not allowed" });
};
