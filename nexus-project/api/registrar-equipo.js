// api/registrar-equipo.js — Registra un equipo en la BD cuando el líder lo activa
// Usa SOLO las columnas que definitivamente existen en nexus_chats y nexus_progreso
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(200).end();

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { equipo_nombre, lider_id, mision_id, mision_title, integrantes } = req.body;
  // integrantes: [{ id, nombre, grado, grupo }, ...] — incluye al líder

  if (!equipo_nombre || !lider_id || !mision_id || !integrantes?.length)
    return res.status(200).json({ error: "Faltan campos requeridos" });

  // ── Validar nombre de equipo único (para esta misión) ─────────
  // Evita que dos equipos diferentes tengan el mismo nombre en la misma misión
  try {
    const { data: existente } = await supabase
      .from("nexus_chats")
      .select("equipo_nombre")
      .eq("equipo_nombre", equipo_nombre.trim())
      .eq("mision_id", mision_id)
      .limit(1);

    if (existente && existente.length > 0) {
      return res.status(200).json({
        error: `El nombre de equipo "${equipo_nombre}" ya existe para esta misión. Elige un nombre diferente.`
      });
    }
  } catch (_) {
    // Si la verificación falla, continuar — no bloquear el registro
  }

  // ── Validar que ningún integrante ya esté en otro equipo activo ──
  try {
    const hace90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const integrantesIds = integrantes.map(m => String(m.id));
    const { data: yaEnEquipo } = await supabase
      .from("nexus_chats")
      .select("estudiante_id, equipo_nombre")
      .in("estudiante_id", integrantesIds)
      .not("equipo_nombre", "is", null)
      .neq("equipo_nombre", equipo_nombre.trim()) // permitir re-registro del mismo equipo
      .gte("created_at", hace90)
      .limit(10);

    if (yaEnEquipo && yaEnEquipo.length > 0) {
      const conflicto = yaEnEquipo[0];
      return res.status(200).json({
        error: `Un integrante ya pertenece al equipo "${conflicto.equipo_nombre}". Cada estudiante solo puede estar en un equipo activo.`
      });
    }
  } catch (_) {
    // Si la verificación falla, continuar
  }

  const ahora = new Date().toISOString();
  const errores = [];

  for (const m of integrantes) {
    // 1. Guardar en nexus_chats usando role='assistant' (seguro, siempre existe)
    //    El content especial permite detectarlo como registro de equipo
    const chatRow = {
      estudiante_id:    String(m.id),
      nombre_estudiante: m.nombre || "",
      mision_id:        mision_id,
      mision_title:     mision_title || null,
      role:             "assistant",
      content:          `__equipo_registrado__:${equipo_nombre}:lider:${lider_id}:mision:${mision_id}`,
      xp_at_time:       0,
      equipo_nombre:    equipo_nombre,
      created_at:       ahora,
    };

    const { error: e1 } = await supabase.from("nexus_chats").insert(chatRow);
    if (e1) errores.push(`chat_${m.id}: ${e1.message}`);

    // 2. Guardar en nexus_progreso con xp=0 para que aparezca en panel Equipos
    //    Intentar con equipo_nombre (si la columna existe) y sin ella (fallback)
    const progresoRow = {
      estudiante_id:    String(m.id),
      nombre_estudiante: m.nombre || "",
      grado:            m.grado || "",
      grupo:            m.grupo || "",
      xp_total:         0,
      nota:             1.0,
      nivel:            1,
      mision_id:        mision_id,
      updated_at:       ahora,
    };

    // Intentar upsert con equipo_nombre
    const progresoRowConEquipo = { ...progresoRow, equipo_nombre };
    const { error: ep1 } = await supabase
      .from("nexus_progreso")
      .upsert(progresoRowConEquipo, { onConflict: "estudiante_id,mision_id" });

    if (ep1) {
      // Fallback sin equipo_nombre (por si la columna no existe)
      const { error: ep2 } = await supabase
        .from("nexus_progreso")
        .upsert(progresoRow, { onConflict: "estudiante_id,mision_id" });

      if (ep2) {
        // Último fallback: insert directo
        await supabase.from("nexus_progreso").insert(progresoRow).then(({ error: ep3 }) => {
          if (ep3) errores.push(`progreso_${m.id}: ${ep3.message}`);
        });
      }
    }
  }

  return res.status(200).json({
    success: true,
    registrados: integrantes.length,
    errores: errores.length > 0 ? errores : undefined,
  });
};
