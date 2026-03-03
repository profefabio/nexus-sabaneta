// api/stats.js — Estadísticas filtradas por docente o globales para admin
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
    return res.status(200).json({ error: "Faltan variables de entorno" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { docente_id, role } = req.query;

  try {
    const [{ count: totalEstudiantes }, { count: totalDocentes }] = await Promise.all([
      supabase.from("estudiantes").select("*", { count: "exact", head: true }),
      supabase.from("docentes").select("*", { count: "exact", head: true }),
    ]);

    // ── Siempre filtrar por docente_id (admin y teacher igual) ──
    // Cada usuario ve SOLO las misiones y estudiantes que le corresponden
    let misionIds = null;
    let misionesMap = {};

    if (docente_id) {
      const { data: misMisiones } = await supabase
        .from("nexus_misiones")
        .select("id, title, docente_nombre")
        .eq("docente_id", docente_id)
        .order("created_at", { ascending: true });

      misionIds = (misMisiones || []).map(m => m.id);
      (misMisiones || []).forEach(m => { misionesMap[m.id] = m; });

      if (misionIds.length === 0) {
        return res.status(200).json({
          resumen: { totalEstudiantes: totalEstudiantes ?? 0, totalDocentes: totalDocentes ?? 0, estudiantesActivos: 0, xpTotal: 0 },
          topEstudiantes: [], actividadReciente: [], porMision: {}, porGrado: {},
          misiones: [], progresoDetalle: [], sinMisiones: true,
        });
      }
    } else {
      // Sin docente_id: fallback — cargar todas (solo para uso interno/debug)
      const { data: todasMisiones } = await supabase
        .from("nexus_misiones")
        .select("id, title, docente_nombre")
        .order("created_at", { ascending: true });
      (todasMisiones || []).forEach(m => { misionesMap[m.id] = m; });
    }

    // ── Queries de progreso ───────────────────────────────────
    // progresoDetalle: TODAS las filas (una por estudiante×misión)
    let qDetalle = supabase
      .from("nexus_progreso")
      .select("estudiante_id, nombre_estudiante, grado, grupo, xp_total, nota, mision_id, nivel, updated_at")
      .order("nombre_estudiante", { ascending: true })
      .limit(2000); // ← Protector: evita descargar miles de filas en un solo request

    let qTop = supabase
      .from("nexus_progreso")
      .select("estudiante_id, nombre_estudiante, grado, grupo, xp_total, mision_id, nivel")
      .order("xp_total", { ascending: false })
      .limit(200);

    let qActividad = supabase
      .from("nexus_progreso")
      .select("nombre_estudiante, grado, grupo, mision_id, xp_total, updated_at")
      .order("updated_at", { ascending: false })
      .limit(20);

    if (misionIds !== null) {
      qDetalle   = qDetalle.in("mision_id", misionIds);
      qTop       = qTop.in("mision_id", misionIds);
      qActividad = qActividad.in("mision_id", misionIds);
    }

    const [
      { data: progresoDetalle },
      { data: topRaw },
      { data: actividadReciente },
    ] = await Promise.all([qDetalle, qTop, qActividad]);

    // ── Top estudiantes: agregar XP y calcular nota promedio ──
    const estudianteMap = {};
    (progresoDetalle || []).forEach(p => {
      const k = String(p.estudiante_id);
      if (!estudianteMap[k]) {
        estudianteMap[k] = {
          estudiante_id: p.estudiante_id,
          nombre_estudiante: p.nombre_estudiante,
          grado: p.grado, grupo: p.grupo, nivel: p.nivel || 1,
          misiones: {},
          xp_total: 0,
        };
      }
      estudianteMap[k].xp_total += (p.xp_total || 0);
      if (p.mision_id) {
        estudianteMap[k].misiones[p.mision_id] = {
          xp: p.xp_total || 0,
          nota: p.nota || 1.0,
        };
      }
    });

    // Nota definitiva = promedio de notas de misiones completadas
    Object.values(estudianteMap).forEach(est => {
      const notas = Object.values(est.misiones).map(m => m.nota).filter(n => n > 0);
      est.nota_definitiva = notas.length > 0
        ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10
        : 1.0;
    });

    const topEstudiantes = Object.values(estudianteMap)
      .sort((a, b) => b.nota_definitiva - a.nota_definitiva || b.xp_total - a.xp_total);

    // ── Resumen ───────────────────────────────────────────────
    const estudiantesActivos = Object.keys(estudianteMap).length;
    const xpTotal = (progresoDetalle || []).reduce((s, p) => s + (p.xp_total || 0), 0);

    const porGrado = {};
    (progresoDetalle || []).forEach(p => {
      const g = p.grado || "Sin grado";
      if (!porGrado[g]) porGrado[g] = { count: 0, xp: 0 };
      porGrado[g].count++;
      porGrado[g].xp += p.xp_total || 0;
    });

    const porMision = {};
    (progresoDetalle || []).forEach(p => {
      const m = p.mision_id || "libre";
      if (!porMision[m]) porMision[m] = { count: 0, xp: 0 };
      porMision[m].count++;
      porMision[m].xp += p.xp_total || 0;
    });

    return res.status(200).json({
      resumen: { totalEstudiantes: totalEstudiantes ?? 0, totalDocentes: totalDocentes ?? 0, estudiantesActivos, xpTotal },
      topEstudiantes,
      actividadReciente: actividadReciente || [],
      porMision, porGrado,
      misiones: Object.values(misionesMap),       // lista ordenada de misiones con títulos
      progresoDetalle: progresoDetalle || [],      // filas crudas para el Excel
    });

  } catch (error) {
    return res.status(200).json({ error: "Error en stats: " + error.message });
  }
};
