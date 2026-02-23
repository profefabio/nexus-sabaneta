// api/stats.js — Estadísticas filtradas por docente o globales para admin
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
    return res.status(500).json({ error: "Faltan variables de entorno" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // docente_id y role vienen como query params
  const { docente_id, role } = req.query;
  const esDocente = role === "teacher" && docente_id;

  try {
    // ── Totales generales (siempre globales) ───────────────────
    const [{ count: totalEstudiantes }, { count: totalDocentes }] = await Promise.all([
      supabase.from("estudiantes").select("*", { count: "exact", head: true }),
      supabase.from("docentes").select("*", { count: "exact", head: true }),
    ]);

    // ── Si es docente: obtener solo IDs de sus misiones ────────
    let misionIds = null; // null = sin restricción (admin)
    if (esDocente) {
      const { data: misMisiones } = await supabase
        .from("nexus_misiones")
        .select("id")
        .eq("docente_id", docente_id);

      misionIds = (misMisiones || []).map(m => m.id);
      // Si el docente no tiene misiones, retornar vacío directamente
      if (misionIds.length === 0) {
        return res.status(200).json({
          resumen: {
            totalEstudiantes: totalEstudiantes ?? 0,
            totalDocentes:    totalDocentes    ?? 0,
            estudiantesActivos: 0,
            xpTotal: 0,
          },
          topEstudiantes:    [],
          actividadReciente: [],
          porMision:         {},
          porGrado:          {},
          sinMisiones:       true,
        });
      }
    }

    // ── Construir queries de progreso con o sin filtro ─────────
    let qProgreso      = supabase.from("nexus_progreso").select("*").order("updated_at", { ascending: false }).limit(500);
    let qTop           = supabase.from("nexus_progreso").select("estudiante_id,nombre_estudiante,grado,grupo,xp_total,mision_id,nivel").order("xp_total", { ascending: false }).limit(50);
    let qActividad     = supabase.from("nexus_progreso").select("nombre_estudiante,grado,grupo,mision_id,xp_total,updated_at").order("updated_at", { ascending: false }).limit(20);

    if (misionIds !== null) {
      // Filtrar solo registros relacionados con las misiones del docente
      qProgreso  = qProgreso.in("mision_id", misionIds);
      qTop       = qTop.in("mision_id", misionIds);
      qActividad = qActividad.in("mision_id", misionIds);
    }

    const [
      { data: progreso },
      { data: topEstudiantes },
      { data: actividadReciente },
    ] = await Promise.all([qProgreso, qTop, qActividad]);

    // ── Calcular resumen ───────────────────────────────────────
    const estudiantesActivos = progreso?.length ?? 0;
    const xpTotal = progreso?.reduce((s, p) => s + (p.xp_total || 0), 0) ?? 0;

    const porGrado = {};
    (progreso || []).forEach(p => {
      const g = p.grado || "Sin grado";
      if (!porGrado[g]) porGrado[g] = { count: 0, xp: 0 };
      porGrado[g].count++;
      porGrado[g].xp += p.xp_total || 0;
    });

    const porMision = {};
    (progreso || []).forEach(p => {
      const m = p.mision_id || "libre";
      if (!porMision[m]) porMision[m] = { count: 0, xp: 0 };
      porMision[m].count++;
      porMision[m].xp += p.xp_total || 0;
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
