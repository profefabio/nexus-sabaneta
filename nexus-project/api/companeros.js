// api/companeros.js — SIEMPRE devuelve 200 (Vercel intercepta 4xx/5xx)
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

  const { grado, grupo, exclude_id } = req.query;
  if (!grado || !grupo) return res.status(200).json({ error: "Faltan grado y grupo", companeros: [] });

  try {
    const { data, error } = await supabase
      .from("estudiantes")
      .select("id, nombres, apellidos, grado, grupo")
      .eq("grado", grado)
      .eq("grupo", grupo)
      .order("apellidos")
      .order("nombres");

    if (error) return res.status(200).json({ error: error.message, companeros: [] });

    const lista = (data || []).filter(e => String(e.id) !== String(exclude_id));
    return res.status(200).json({ companeros: lista });
  } catch (err) {
    return res.status(200).json({ error: err.message, companeros: [] });
  }
};
