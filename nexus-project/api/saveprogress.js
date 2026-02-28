// api/saveprogress.js — Guarda progreso XP por estudiante POR MISIÓN
const { createClient } = require("@supabase/supabase-js");

// ─── Fórmula XP → Nota (escala progresiva original) ─────────────
//   0  XP = 1.0 · 25 XP = 2.0 · 75 XP = 3.0 · 150 XP = 4.0 · 250 XP = 5.0
function xpToNota(xp) {
  const bp = [
    { xp:   0, nota: 1.0 },
    { xp:  25, nota: 2.0 },
    { xp:  75, nota: 3.0 },
    { xp: 150, nota: 4.0 },
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

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
    return res.status(500).json({ error: "Faltan variables de entorno" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { estudiante_id, nombre_estudiante, grado, grupo, xp_total, nivel, mision_id } = req.body;
  if (!estudiante_id) return res.status(400).json({ error: "Falta estudiante_id" });

  const nota = xpToNota(xp_total || 0);

  try {
    // ── Una fila por (estudiante_id, mision_id) ──────────────
    // onConflict usa la constraint única: uq_progreso_est_mision
    // Si mision_id es null → fila de modo libre (sin misión)
    const { data, error } = await supabase
      .from("nexus_progreso")
      .upsert({
        estudiante_id: String(estudiante_id),
        nombre_estudiante,
        grado,
        grupo,
        xp_total:  xp_total || 0,
        nota,
        nivel:     nivel    || 1,
        mision_id: mision_id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "estudiante_id,mision_id" });

    if (error) return res.status(500).json({ error: "Error guardando progreso: " + error.message });
    return res.status(200).json({ success: true, nota });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
