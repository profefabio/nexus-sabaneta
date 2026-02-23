// api/saveprogress.js — Guarda progreso XP y calcula nota académica
const { createClient } = require("@supabase/supabase-js");

// ─── Fórmula XP → Nota (1.0 – 5.0) ──────────────────────────
// Escala progresiva:
//   0  XP = 1.0  (apenas comienza)
//   25 XP = 2.0
//   75 XP = 3.0
//  150 XP = 4.0
//  250 XP = 5.0  (máximo)
function xpToNota(xp) {
  const breakpoints = [
    { xp:   0, nota: 1.0 },
    { xp:  25, nota: 2.0 },
    { xp:  75, nota: 3.0 },
    { xp: 150, nota: 4.0 },
    { xp: 250, nota: 5.0 },
  ];
  if (xp <= 0)  return 1.0;
  if (xp >= 250) return 5.0;

  // Interpolación lineal entre tramos
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const a = breakpoints[i];
    const b = breakpoints[i + 1];
    if (xp >= a.xp && xp <= b.xp) {
      const t = (xp - a.xp) / (b.xp - a.xp);
      const nota = a.nota + t * (b.nota - a.nota);
      return Math.round(nota * 10) / 10; // 1 decimal
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
    const { data, error } = await supabase
      .from("nexus_progreso")
      .upsert({
        estudiante_id,
        nombre_estudiante,
        grado,
        grupo,
        xp_total:  xp_total || 0,
        nota,               // ← nueva columna
        nivel:     nivel    || 1,
        mision_id: mision_id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "estudiante_id" });

    if (error) return res.status(500).json({ error: "Error guardando progreso: " + error.message });

    return res.status(200).json({ success: true, nota, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
