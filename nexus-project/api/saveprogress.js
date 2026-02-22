// api/saveprogress.js — Guarda/actualiza el progreso XP del estudiante
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: "Faltan variables de entorno" });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { estudiante_id, nombre_estudiante, grado, grupo, xp_total, nivel, mision_id } = req.body;

  if (!estudiante_id) {
    return res.status(400).json({ error: "Falta estudiante_id" });
  }

  try {
    // Upsert: actualiza si existe, inserta si no
    const { data, error } = await supabase
      .from("nexus_progreso")
      .upsert({
        estudiante_id,
        nombre_estudiante,
        grado,
        grupo,
        xp_total,
        nivel,
        mision_id: mision_id || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "estudiante_id",
      });

    if (error) {
      return res.status(500).json({ error: "Error guardando progreso: " + error.message });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
