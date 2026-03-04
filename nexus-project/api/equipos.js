// api/equipos.js — Equipos con grado/grupo para filtros + DELETE con borrado total
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
    return res.status(200).json({ error: "Faltan variables de entorno" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // ═══════════════════════════════════════════════════════
  // DELETE — Eliminar equipo: chats + progreso de todos los integrantes
  // ═══════════════════════════════════════════════════════
  if (req.method === "DELETE") {
    const { nombre, docente_id } = req.body;
    if (!nombre) return res.status(200).json({ error: "Falta el nombre del equipo" });

    try {
      // 1. Obtener todas las misiones del docente para filtrar correctamente
      let misionIds = null;
      if (docente_id) {
        const { data: misiones } = await supabase
          .from("nexus_misiones")
          .select("id")
          .eq("docente_id", docente_id);
        misionIds = (misiones || []).map(m => m.id);
      }

      // 2. Obtener los estudiante_id únicos del equipo desde nexus_chats
      let qIds = supabase
        .from("nexus_chats")
        .select("estudiante_id")
        .eq("equipo_nombre", nombre);
      if (misionIds && misionIds.length > 0) qIds = qIds.in("mision_id", misionIds);

      const { data: chatRows, error: idErr } = await qIds;
      if (idErr) return res.status(200).json({ error: idErr.message });

      const estudianteIds = [...new Set((chatRows || []).map(r => String(r.estudiante_id)))];

      // 3. Borrar todos los mensajes del chat del equipo
      let qDelChats = supabase
        .from("nexus_chats")
        .delete()
        .eq("equipo_nombre", nombre);
      if (misionIds && misionIds.length > 0) qDelChats = qDelChats.in("mision_id", misionIds);

      const { error: chatDelErr } = await qDelChats;
      if (chatDelErr) return res.status(200).json({ error: "Error al borrar chats: " + chatDelErr.message });

      // 4. Borrar el progreso de todos los integrantes del equipo
      if (estudianteIds.length > 0) {
        let qDelProg = supabase
          .from("nexus_progreso")
          .delete()
          .in("estudiante_id", estudianteIds);
        if (misionIds && misionIds.length > 0) qDelProg = qDelProg.in("mision_id", misionIds);

        const { error: progDelErr } = await qDelProg;
        if (progDelErr) return res.status(200).json({ error: "Error al borrar progreso: " + progDelErr.message });
      }

      return res.status(200).json({
        success: true,
        mensaje: `Equipo "${nombre}" eliminado. ${estudianteIds.length} integrante(s) afectados.`,
        integrantes_afectados: estudianteIds.length,
      });

    } catch (err) {
      return res.status(200).json({ error: err.message });
    }
  }

  // ═══════════════════════════════════════════════════════
  // GET — Lista de equipos con grado/grupo
  // ═══════════════════════════════════════════════════════
  if (req.method !== "GET")
    return res.status(200).json({ error: "Método no permitido", equipos: [] });

  const { docente_id } = req.query;

  try {
    let misionIds = null;
    let misionesMap = {};
    if (docente_id) {
      const { data: misiones } = await supabase
        .from("nexus_misiones")
        .select("id, title, color, icon")
        .eq("docente_id", docente_id);
      misionIds = (misiones || []).map(m => m.id);
      (misiones || []).forEach(m => { misionesMap[m.id] = m; });
      if (misionIds.length === 0)
        return res.status(200).json({ equipos: [], sinMisiones: true });
    }

    let qChats = supabase
      .from("nexus_chats")
      .select("estudiante_id, nombre_estudiante, equipo_nombre, mision_id, mision_title, xp_at_time, created_at")
      .not("equipo_nombre", "is", null)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (misionIds) qChats = qChats.in("mision_id", misionIds);

    const { data: chats, error: chatError } = await qChats;
    if (chatError) return res.status(200).json({ error: chatError.message, equipos: [] });
    if (!chats || chats.length === 0) return res.status(200).json({ equipos: [] });

    const equipoMap = {};
    chats.forEach(c => {
      const key = c.equipo_nombre;
      if (!equipoMap[key]) {
        equipoMap[key] = { nombre: key, integrantes: {}, misiones: {}, ultima_actividad: c.created_at };
      }
      const eq = equipoMap[key];
      if (!eq.integrantes[c.estudiante_id]) {
        eq.integrantes[c.estudiante_id] = { id: c.estudiante_id, nombre: c.nombre_estudiante, xp_max: 0, grado: null, grupo: null };
      }
      const int = eq.integrantes[c.estudiante_id];
      if ((c.xp_at_time || 0) > int.xp_max) int.xp_max = c.xp_at_time || 0;

      const mId = c.mision_id || "libre";
      if (!eq.misiones[mId]) {
        eq.misiones[mId] = {
          id: mId,
          title: c.mision_title || misionesMap[mId]?.title || "Misión libre",
          color: misionesMap[mId]?.color || "#00c8ff",
          icon:  misionesMap[mId]?.icon  || "📋",
          mensajes: 0,
        };
      }
      eq.misiones[mId].mensajes++;
      if (c.created_at > eq.ultima_actividad) eq.ultima_actividad = c.created_at;
    });

    const todosIds = [...new Set(chats.map(c => c.estudiante_id))];
    let progresoMap = {};
    let gradoGrupoMap = {};

    if (todosIds.length > 0) {
      let qProg = supabase
        .from("nexus_progreso")
        .select("estudiante_id, xp_total, nota, nivel, mision_id, grado, grupo")
        .in("estudiante_id", todosIds.map(String))
        .limit(2000);
      if (misionIds) qProg = qProg.in("mision_id", misionIds);

      const { data: progreso } = await qProg;
      (progreso || []).forEach(p => {
        if (!progresoMap[`total_${p.estudiante_id}`]) progresoMap[`total_${p.estudiante_id}`] = 0;
        progresoMap[`total_${p.estudiante_id}`] += (p.xp_total || 0);
        if (!gradoGrupoMap[p.estudiante_id] && (p.grado || p.grupo))
          gradoGrupoMap[p.estudiante_id] = { grado: p.grado || "", grupo: p.grupo || "" };
      });

      const { data: ests } = await supabase
        .from("nexus_estudiantes")
        .select("id, grado, grupo")
        .in("id", todosIds.map(String))
        .limit(500);
      (ests || []).forEach(e => {
        if (e.grado || e.grupo) gradoGrupoMap[e.id] = { grado: e.grado || "", grupo: e.grupo || "" };
      });
    }

    const equipos = Object.values(equipoMap).map(eq => {
      const integrantes = Object.values(eq.integrantes).map((int, i) => {
        const gg = gradoGrupoMap[int.id] || { grado: "", grupo: "" };
        const xpTotal = progresoMap[`total_${int.id}`] || int.xp_max;
        return { id: int.id, nombre: int.nombre, xp_total: xpTotal, nota: calcNota(xpTotal), grado: gg.grado, grupo: gg.grupo, es_lider: i === 0 };
      });

      const gradoCounts = {};
      const grupoCounts = {};
      integrantes.forEach(i => {
        if (i.grado) gradoCounts[i.grado] = (gradoCounts[i.grado] || 0) + 1;
        if (i.grupo) grupoCounts[i.grupo] = (grupoCounts[i.grupo] || 0) + 1;
      });
      const gradoEquipo = Object.entries(gradoCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || "";
      const grupoEquipo = Object.entries(grupoCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || "";

      const xpEquipo = integrantes.reduce((s, i) => s + i.xp_total, 0);
      const notaProm = integrantes.length > 0
        ? Math.round((integrantes.reduce((s,i) => s + i.nota, 0) / integrantes.length) * 10) / 10
        : 1.0;

      return {
        nombre: eq.nombre, grado: gradoEquipo, grupo: grupoEquipo,
        integrantes: integrantes.sort((a,b) => b.xp_total - a.xp_total),
        misiones: Object.values(eq.misiones),
        xp_equipo: xpEquipo, nota_promedio: notaProm,
        num_integrantes: integrantes.length, ultima_actividad: eq.ultima_actividad,
      };
    }).sort((a,b) => b.nota_promedio - a.nota_promedio || b.xp_equipo - a.xp_equipo);

    return res.status(200).json({ equipos });

  } catch (err) {
    console.error("EQUIPOS ERROR:", err.message);
    return res.status(200).json({ error: err.message, equipos: [] });
  }
};

function calcNota(xp) {
  const bp = [{x:0,n:1.0},{x:25,n:2.0},{x:75,n:3.0},{x:150,n:4.0},{x:250,n:5.0}];
  if (!xp || xp <= 0) return 1.0;
  if (xp >= 250) return 5.0;
  for (let i = 0; i < bp.length - 1; i++) {
    if (xp >= bp[i].x && xp <= bp[i+1].x) {
      const t = (xp - bp[i].x) / (bp[i+1].x - bp[i].x);
      return Math.round((bp[i].n + t*(bp[i+1].n - bp[i].n)) * 10) / 10;
    }
  }
  return 5.0;
}
