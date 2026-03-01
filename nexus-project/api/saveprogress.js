// api/saveprogress.js — Guarda XP y nota por estudiante × misión
// Robusto: funciona con o sin la constraint única en Supabase
const { createClient } = require("@supabase/supabase-js");

function xpToNota(xp) {
  const bp = [
    { xp:   0, nota: 1.0 }, { xp:  25, nota: 2.0 },
    { xp:  75, nota: 3.0 }, { xp: 150, nota: 4.0 },
    { xp: 250, nota: 5.0 },
  ];
  if (!xp || xp <= 0) return 1.0;
  if (xp >= 250) return 5.0;
  for (let i = 0; i < bp.length - 1; i++) {
    const a = bp[i], b = bp[i + 1];
    if (xp >= a.xp && xp <= b.xp) {
      const t = (xp - a.xp) / (b.xp - a.xp);
      return Math.round((a.nota + t * (b.nota - a.nota)) * 10) / 10;
    }
  }
  return 5.0;
}

async function guardarProgreso(supabase, payload) {
  const nota = xpToNota(payload.xp_total || 0);
  const row = {
    estudiante_id:    String(payload.estudiante_id),
    nombre_estudiante: payload.nombre_estudiante || "",
    grado:            payload.grado || "",
    grupo:            payload.grupo || "",
    xp_total:         payload.xp_total || 0,
    nota,
    nivel:            payload.nivel || 1,
    mision_id:        payload.mision_id || null,
    updated_at:       new Date().toISOString(),
  };

  // 1er intento: upsert con constraint compuesta (si ya está migrado)
  const { error: e1 } = await supabase
    .from("nexus_progreso")
    .upsert(row, { onConflict: "estudiante_id,mision_id" });

  if (!e1) return { nota };

  // 2do intento: buscar y actualizar manualmente (fallback si no hay constraint)
  const { data: existing } = await supabase
    .from("nexus_progreso")
    .select("id")
    .eq("estudiante_id", String(payload.estudiante_id))
    .eq("mision_id", payload.mision_id || null)
    .maybeSingle();

  if (existing?.id) {
    await supabase.from("nexus_progreso").update(row).eq("id", existing.id);
  } else {
    await supabase.from("nexus_progreso").insert(row);
  }
  return { nota };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
    return res.status(500).json({ error: "Faltan variables de entorno" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { estudiante_id, nombre_estudiante, grado, grupo,
          xp_total, nivel, mision_id, equipo } = req.body;

  if (!estudiante_id) return res.status(400).json({ error: "Falta estudiante_id" });

  try {
    // Guardar para el estudiante/líder
    const { nota } = await guardarProgreso(supabase, {
      estudiante_id, nombre_estudiante, grado, grupo, xp_total, nivel, mision_id
    });

    // Si hay equipo, guardar el mismo XP para cada integrante
    if (equipo?.integrantes?.length > 0) {
      await Promise.all(equipo.integrantes.map(m =>
        guardarProgreso(supabase, {
          estudiante_id: String(m.id),
          nombre_estudiante: `${m.nombres} ${m.apellidos}`,
          grado, grupo, xp_total, nivel, mision_id,
        })
      ));
    }

    return res.status(200).json({ success: true, nota });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
