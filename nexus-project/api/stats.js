// api/stats.js — Estadísticas de uso de la plataforma NEXUS
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: "Faltan variables de entorno" });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    // Contar estudiantes
    const { count: totalEstudiantes } = await supabase
      .from("estudiantes")
      .select("*", { count: "exact", head: true });

    // Contar docentes
    const { count: totalDocentes } = await supabase
      .from("docentes")
      .select("*", { count: "exact", head: true });

    // Obtener progreso de estudiantes
    const { data: progreso } = await supabase
      .from("nexus_progreso")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(100);

    // Obtener top 10 estudiantes por XP
    const { data: topEstudiantes } = await supabase
      .from("nexus_progreso")
      .select("estudiante_id, nombre_estudiante, grado, xp_total, mision_id, nivel")
      .order("xp_total", { ascending: false })
      .limit(10);

    // Actividad reciente (últimas 20 interacciones)
    const { data: actividadReciente } = await supabase
      .from("nexus_progreso")
      .select("nombre_estudiante, grado, mision_id, xp_total, updated_at")
      .order("updated_at", { ascending: false })
      .limit(20);

    // XP total de la plataforma
    const xpTotal = progreso?.reduce((sum, p) => sum + (p.xp_total || 0), 0) || 0;

    // Agrupar por misión
    const porMision = {};
    progreso?.forEach(p => {
      const m = p.mision_id || "libre";
      if (!porMision[m]) porMision[m] = { count: 0, xp: 0 };
      porMision[m].count++;
      porMision[m].xp += p.xp_total || 0;
    });

    // Agrupar por grado
    const porGrado = {};
    progreso?.forEach(p => {
      const g = p.grado || "Sin grado";
      if (!porGrado[g]) porGrado[g] = { count: 0, xp: 0 };
      porGrado[g].count++;
      porGrado[g].xp += p.xp_total || 0;
    });

    return res.status(200).json({
      resumen: {
        totalEstudiantes: totalEstudiantes || 0,
        totalDocentes: totalDocentes || 0,
        estudiantesActivos: progreso?.length || 0,
        xpTotal,
      },
      topEstudiantes: topEstudiantes || [],
      actividadReciente: actividadReciente || [],
      porMision,
      porGrado,
    });

  } catch (error) {
    return res.status(500).json({ error: "Error obteniendo estadísticas: " + error.message });
  }
};
