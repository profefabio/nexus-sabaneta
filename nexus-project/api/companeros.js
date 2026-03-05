// api/companeros.js — Compañeros del mismo grado/grupo
// v2: Marca si cada compañero ya está en un equipo activo (para bloquear selección)
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
    // 1. Obtener compañeros del mismo grado y grupo
    const { data, error } = await supabase
      .from("estudiantes")
      .select("id, nombres, apellidos, grado, grupo")
      .eq("grado", grado)
      .eq("grupo", grupo)
      .order("apellidos")
      .order("nombres")
      .limit(60);

    if (error) return res.status(200).json({ error: error.message, companeros: [] });

    let lista = (data || []).filter(e => String(e.id) !== String(exclude_id));

    if (lista.length === 0) return res.status(200).json({ companeros: [] });

    // 2. Verificar cuáles ya están en un equipo activo
    // Un estudiante "en equipo" = tiene un chat con equipo_nombre != null en los últimos 60 días
    const listaIds = lista.map(e => String(e.id));
    const hace60Dias = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const { data: equipoRows } = await supabase
      .from("nexus_chats")
      .select("estudiante_id, equipo_nombre")
      .not("equipo_nombre", "is", null)
      .in("estudiante_id", listaIds)
      .gte("created_at", hace60Dias)
      .order("created_at", { ascending: false })
      .limit(200);

    // Construir mapa: estudiante_id → nombre_equipo (el más reciente)
    const equipoActivoMap = {};
    (equipoRows || []).forEach(row => {
      const id = String(row.estudiante_id);
      if (!equipoActivoMap[id]) equipoActivoMap[id] = row.equipo_nombre;
    });

    // 3. Enriquecer la lista con el flag `equipo_activo`
    lista = lista.map(e => ({
      ...e,
      equipo_activo: equipoActivoMap[String(e.id)] || null,
    }));

    return res.status(200).json({ companeros: lista });
  } catch (err) {
    return res.status(200).json({ error: err.message, companeros: [] });
  }
};
