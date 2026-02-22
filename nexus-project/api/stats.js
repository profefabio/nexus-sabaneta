// api/stats.js — Estadísticas de uso de la plataforma NEXUS
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
    return res.status(500).json({ error: "Faltan variables de entorno" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    const [
      { count: totalEstudiantes },
      { count: totalDocentes },
      { data: progreso },
      { data: topEstudiantes },
      { data: actividadReciente },
    ] = await Promise.all([
      supabase.from("estudiantes").select("*", { count:"exact", head:true }),
      supabase.from("docentes").select("*", { count:"exact", head:true }),
      supabase.from("nexus_progreso").select("*").order("updated_at", { ascending:false }).limit(200),
      supabase.from("nexus_progreso").select("estudiante_id,nombre_estudiante,grado,grupo,xp_total,mision_id,nivel").order("xp_total", { ascending:false }).limit(50),
      supabase.from("nexus_progreso").select("nombre_estudiante,grado,grupo,mision_id,xp_total,updated_at").order("updated_at", { ascending:false }).limit(20),
    ]);

    // Siempre numérico, nunca null
    const estudiantesActivos = progreso?.length ?? 0;
    const xpTotal = progreso?.reduce((s, p) => s + (p.xp_total || 0), 0) ?? 0;

    const porMision = {};
    (progreso || []).forEach(p => {
      const m = p.mision_id || "libre";
      if (!porMision[m]) porMision[m] = { count:0, xp:0 };
      porMision[m].count++;
      porMision[m].xp += p.xp_total || 0;
    });

    const porGrado = {};
    (progreso || []).forEach(p => {
      const g = p.grado || "Sin grado";
      if (!porGrado[g]) porGrado[g] = { count:0, xp:0 };
      porGrado[g].count++;
      porGrado[g].xp += p.xp_total || 0;
    });

    return res.status(200).json({
      resumen: {
        totalEstudiantes: totalEstudiantes ?? 0,
        totalDocentes:    totalDocentes    ?? 0,
        estudiantesActivos,
        xpTotal,
      },
      topEstudiantes:    topEstudiantes    || [],
      actividadReciente: actividadReciente || [],
      porMision,
      porGrado,
    });

  } catch (error) {
    return res.status(500).json({ error: "Error en stats: " + error.message });
  }
};
