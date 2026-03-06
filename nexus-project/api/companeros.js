// api/companeros.js — v4 (fix: equipo_activo en try separado, no bloquea la lista)
// GET ?grado=X&grupo=Y&exclude_id=Z  → lista compañeros + flag equipo_activo
// GET ?restaurar=1&estudiante_id=X   → equipo activo del estudiante (restaurar sesión)
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(200).json({ error: "Método no permitido", companeros: [] });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
    return res.status(200).json({ error: "Faltan variables de entorno", companeros: [] });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // ── RESTAURAR EQUIPO AL INICIAR SESIÓN ──────────────────────
  if (req.query.restaurar === "1") {
    const { estudiante_id } = req.query;
    if (!estudiante_id) return res.status(200).json({ equipo: null });
    try {
      const hace90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data: rows } = await supabase
        .from("nexus_chats")
        .select("equipo_nombre, nombre_estudiante, created_at")
        .eq("estudiante_id", String(estudiante_id))
        .not("equipo_nombre", "is", null)
        .gte("created_at", hace90)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!rows || rows.length === 0) return res.status(200).json({ equipo: null });
      const nombreEquipo = rows[0].equipo_nombre;

      // Extraer liderId y misionId del mensaje de sistema
      let liderId = null;
      let misionId = null;
      try {
        // Buscar el mensaje de registro (puede ser role=assistant o system)
        const { data: sysMsg } = await supabase
          .from("nexus_chats")
          .select("content")
          .eq("equipo_nombre", nombreEquipo)
          .like("content", "__equipo_registrado__%")
          .order("created_at", { ascending: true })
          .limit(1);
        if (sysMsg?.length > 0) {
          // formato: __equipo_registrado__:NOMBRE:lider:ID:mision:MISION_ID
          const partes = (sysMsg[0].content || "").split(":");
          liderId = partes[3] || null;
          misionId = partes[5] || null;
        }
      } catch(_) {}

      const { data: integrantesRows } = await supabase
        .from("nexus_chats")
        .select("estudiante_id, nombre_estudiante")
        .eq("equipo_nombre", nombreEquipo)
        .neq("estudiante_id", String(estudiante_id))
        .like("content", "__equipo_registrado__%")
        .order("created_at", { ascending: true })
        .limit(100);

      const seen = new Set();
      const integrantes = [];
      (integrantesRows || []).forEach(r => {
        if (!seen.has(String(r.estudiante_id))) {
          seen.add(String(r.estudiante_id));
          const partes = (r.nombre_estudiante || "").split(" ");
          integrantes.push({
            id: r.estudiante_id,
            nombres: partes.slice(0, Math.ceil(partes.length / 2)).join(" "),
            apellidos: partes.slice(Math.ceil(partes.length / 2)).join(" "),
          });
        }
      });
      return res.status(200).json({ equipo: { nombre: nombreEquipo, integrantes, liderId, misionId } });
    } catch (err) {
      return res.status(200).json({ equipo: null });
    }
  }

  // ── LISTA DE COMPAÑEROS ──────────────────────────────────────
  const { grado, grupo, exclude_id } = req.query;
  if (!grado || !grupo) return res.status(200).json({ error: "Faltan grado y grupo", companeros: [] });

  // 1. Obtener lista de estudiantes del mismo grado/grupo
  let lista = [];
  try {
    const { data, error } = await supabase
      .from("estudiantes")
      .select("id, nombres, apellidos, grado, grupo")
      .eq("grado", grado)
      .eq("grupo", grupo)
      .order("apellidos")
      .order("nombres")
      .limit(60);

    if (error) return res.status(200).json({ error: error.message, companeros: [] });
    lista = (data || []).filter(e => String(e.id) !== String(exclude_id));
  } catch (err) {
    return res.status(200).json({ error: err.message, companeros: [] });
  }

  if (lista.length === 0) return res.status(200).json({ companeros: [] });

  // 2. Detectar equipo activo — doble verificación: chats sistema + progreso
  const equipoActivoMap = {};
  const listaIds = lista.map(e => String(e.id));

  // 2a. Buscar en nexus_chats cualquier mensaje con equipo_nombre (bloqueo inmediato)
  try {
    const hace90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: chatRows } = await supabase
      .from("nexus_chats")
      .select("estudiante_id, equipo_nombre")
      .not("equipo_nombre", "is", null)
      .in("estudiante_id", listaIds)
      .gte("created_at", hace90)
      .order("created_at", { ascending: false })
      .limit(200);
    (chatRows || []).forEach(row => {
      const id = String(row.estudiante_id);
      if (!equipoActivoMap[id]) equipoActivoMap[id] = row.equipo_nombre;
    });
  } catch (_) {}

  // 2b. Verificar también en nexus_progreso (captura equipos con cualquier XP)
  try {
    const { data: progRows } = await supabase
      .from("nexus_progreso")
      .select("estudiante_id, equipo_nombre")
      .not("equipo_nombre", "is", null)
      .in("estudiante_id", listaIds)
      .limit(200);
    (progRows || []).forEach(row => {
      const id = String(row.estudiante_id);
      if (!equipoActivoMap[id]) equipoActivoMap[id] = row.equipo_nombre;
    });
  } catch (_) {}

  const result = lista.map(e => ({
    ...e,
    equipo_activo: equipoActivoMap[String(e.id)] || null,
  }));

  return res.status(200).json({ companeros: result });
};
