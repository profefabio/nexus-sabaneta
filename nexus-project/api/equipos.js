// api/equipos.js — v2: Muestra TODOS los equipos (misiones + libre)
//                     + endpoint de detalle por equipo con informe de actividad
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
  // DELETE — Eliminar equipo
  // ═══════════════════════════════════════════════════════
  if (req.method === "DELETE") {
    const { nombre, docente_id } = req.body;
    if (!nombre) return res.status(200).json({ error: "Falta el nombre del equipo" });
    try {
      let misionIds = null;
      if (docente_id) {
        const { data: misiones } = await supabase.from("nexus_misiones").select("id").eq("docente_id", docente_id);
        misionIds = (misiones || []).map(m => m.id);
      }
      const { data: chatRows, error: idErr } = await supabase.from("nexus_chats").select("estudiante_id").eq("equipo_nombre", nombre);
      if (idErr) return res.status(200).json({ error: idErr.message });
      const estudianteIds = [...new Set((chatRows || []).map(r => String(r.estudiante_id)))];
      const { error: chatDelErr } = await supabase.from("nexus_chats").delete().eq("equipo_nombre", nombre);
      if (chatDelErr) return res.status(200).json({ error: "Error al borrar chats: " + chatDelErr.message });
      if (estudianteIds.length > 0) {
        let qDelProg = supabase.from("nexus_progreso").delete().in("estudiante_id", estudianteIds);
        if (misionIds && misionIds.length > 0) qDelProg = qDelProg.in("mision_id", misionIds);
        const { error: progDelErr } = await qDelProg;
        if (progDelErr) return res.status(200).json({ error: "Error al borrar progreso: " + progDelErr.message });
      }
      return res.status(200).json({ success: true, mensaje: `Equipo "${nombre}" eliminado. ${estudianteIds.length} integrante(s) afectados.`, integrantes_afectados: estudianteIds.length });
    } catch (err) {
      return res.status(200).json({ error: err.message });
    }
  }

  if (req.method !== "GET")
    return res.status(200).json({ error: "Método no permitido", equipos: [] });

  const { docente_id, equipo: equipoDetalle } = req.query;

  // ═══════════════════════════════════════════════════════
  // GET ?equipo=NOMBRE — Detalle completo de un equipo
  // ═══════════════════════════════════════════════════════
  if (equipoDetalle) {
    try {
      const nombreEquipo = decodeURIComponent(equipoDetalle);

      const { data: chats, error: chatErr } = await supabase
        .from("nexus_chats")
        .select("estudiante_id, nombre_estudiante, mision_id, mision_title, role, xp_at_time, created_at")
        .eq("equipo_nombre", nombreEquipo)
        .order("created_at", { ascending: true })
        .limit(3000);

      if (chatErr) return res.status(200).json({ error: chatErr.message });

      const estudianteIds = [...new Set((chats || []).map(c => String(c.estudiante_id)))];

      let progresoData = [];
      if (estudianteIds.length > 0) {
        const { data: prog } = await supabase
          .from("nexus_progreso")
          .select("estudiante_id, nombre_estudiante, grado, grupo, xp_total, nota, mision_id, nivel, updated_at")
          .in("estudiante_id", estudianteIds)
          .limit(500);
        progresoData = prog || [];
      }

      const estudianteMap = {};
      (chats || []).forEach(c => {
        const id = String(c.estudiante_id);
        if (!estudianteMap[id]) {
          estudianteMap[id] = { id, nombre: c.nombre_estudiante, misiones: {}, mensajes_total: 0, ultima_actividad: c.created_at, primera_actividad: c.created_at };
        }
        const est = estudianteMap[id];
        if (c.role === "user") est.mensajes_total++;
        const mId = c.mision_id || "libre";
        if (!est.misiones[mId]) est.misiones[mId] = { id: mId, title: c.mision_title || "Modo libre", mensajes: 0, xp_max: 0 };
        if (c.role === "user") est.misiones[mId].mensajes++;
        if ((c.xp_at_time || 0) > est.misiones[mId].xp_max) est.misiones[mId].xp_max = c.xp_at_time || 0;
        if (c.created_at > est.ultima_actividad) est.ultima_actividad = c.created_at;
        if (c.created_at < est.primera_actividad) est.primera_actividad = c.created_at;
      });

      progresoData.forEach(p => {
        const id = String(p.estudiante_id);
        if (!estudianteMap[id]) {
          estudianteMap[id] = { id, nombre: p.nombre_estudiante, misiones: {}, mensajes_total: 0, ultima_actividad: p.updated_at, primera_actividad: p.updated_at };
        }
        if (!estudianteMap[id].grado) estudianteMap[id].grado = p.grado;
        if (!estudianteMap[id].grupo) estudianteMap[id].grupo = p.grupo;
        estudianteMap[id].xp_total = Math.max(estudianteMap[id].xp_total || 0, p.xp_total || 0);
        estudianteMap[id].nota = p.nota;
        estudianteMap[id].nivel = p.nivel;
      });

      const detalleEstudiantes = Object.values(estudianteMap).map(e => {
        const misionesArr = Object.values(e.misiones);
        const xpFinal = e.xp_total || Math.max(...misionesArr.map(m => m.xp_max), 0);
        return { ...e, misiones: misionesArr, xp_total: xpFinal, nota: e.nota || calcNota(xpFinal) };
      }).sort((a, b) => (b.xp_total || 0) - (a.xp_total || 0));

      const misionesEquipo = {};
      (chats || []).forEach(c => {
        const mId = c.mision_id || "libre";
        if (!misionesEquipo[mId]) misionesEquipo[mId] = { id: mId, title: c.mision_title || "Modo libre", mensajes: 0, participantes: new Set() };
        if (c.role === "user") { misionesEquipo[mId].mensajes++; misionesEquipo[mId].participantes.add(c.estudiante_id); }
      });

      const actividadDiaria = {};
      (chats || []).forEach(c => {
        if (c.role !== "user") return;
        const dia = c.created_at.slice(0, 10);
        actividadDiaria[dia] = (actividadDiaria[dia] || 0) + 1;
      });

      return res.status(200).json({
        detalle: {
          nombre: nombreEquipo,
          estudiantes: detalleEstudiantes,
          misiones: Object.values(misionesEquipo).map(m => ({ ...m, participantes: m.participantes.size })),
          actividad_diaria: actividadDiaria,
          total_mensajes: (chats || []).filter(c => c.role === "user").length,
          primera_actividad: (chats || [])[0]?.created_at || null,
          ultima_actividad: (chats || []).slice(-1)[0]?.created_at || null,
        }
      });
    } catch (err) {
      return res.status(200).json({ error: err.message });
    }
  }

  // ═══════════════════════════════════════════════════════
  // GET — Lista completa de equipos (misiones + modo libre)
  // ═══════════════════════════════════════════════════════
  try {
    let misionIds = null;
    let misionesMap = {};
    let estudianteIdsDocente = null;

    if (docente_id) {
      // Propias
      const { data: misionesPropias } = await supabase
        .from("nexus_misiones")
        .select("id, title, color, icon, colaboradores")
        .eq("docente_id", docente_id);

      // Colaborativas: misiones de otros docentes donde aparezco en colaboradores
      const { data: todasParaColab } = await supabase
        .from("nexus_misiones")
        .select("id, title, color, icon, colaboradores")
        .neq("docente_id", docente_id)
        .limit(300);

      const misionesColab = (todasParaColab || []).filter(m => {
        try {
          const arr = typeof m.colaboradores === "string" ? JSON.parse(m.colaboradores) : (m.colaboradores || []);
          return arr.includes(String(docente_id));
        } catch { return false; }
      });

      const todasMisiones = [...(misionesPropias || []), ...misionesColab];
      misionIds = todasMisiones.map(m => m.id);
      todasMisiones.forEach(m => { misionesMap[m.id] = m; });

      // BUG FIX: Obtener IDs de estudiantes del docente para incluir sus chats en modo libre
      if (misionIds.length > 0) {
        const { data: progDocente } = await supabase
          .from("nexus_progreso")
          .select("estudiante_id")
          .in("mision_id", misionIds)
          .limit(2000);
        if (progDocente && progDocente.length > 0) {
          estudianteIdsDocente = [...new Set(progDocente.map(p => String(p.estudiante_id)))];
        }
      }

      if (misionIds.length === 0 && !estudianteIdsDocente) {
        return res.status(200).json({ equipos: [], sinMisiones: true });
      }
    }

    let todosChats = [];

    // A) Chats de las misiones del docente
    if (misionIds && misionIds.length > 0) {
      const { data: chatsA } = await supabase
        .from("nexus_chats")
        .select("estudiante_id, nombre_estudiante, equipo_nombre, mision_id, mision_title, xp_at_time, created_at")
        .not("equipo_nombre", "is", null)
        .in("mision_id", misionIds)
        .order("created_at", { ascending: false })
        .limit(5000);
      todosChats = todosChats.concat(chatsA || []);
    }

    // B) BUG FIX: Chats en modo libre de los estudiantes del docente
    if (estudianteIdsDocente && estudianteIdsDocente.length > 0) {
      const { data: chatsB } = await supabase
        .from("nexus_chats")
        .select("estudiante_id, nombre_estudiante, equipo_nombre, mision_id, mision_title, xp_at_time, created_at")
        .not("equipo_nombre", "is", null)
        .is("mision_id", null)
        .in("estudiante_id", estudianteIdsDocente)
        .order("created_at", { ascending: false })
        .limit(2000);
      todosChats = todosChats.concat(chatsB || []);
    }

    if (!docente_id) {
      const { data: chatsAll, error: chatError } = await supabase
        .from("nexus_chats")
        .select("estudiante_id, nombre_estudiante, equipo_nombre, mision_id, mision_title, xp_at_time, created_at")
        .not("equipo_nombre", "is", null)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (chatError) return res.status(200).json({ error: chatError.message, equipos: [] });
      todosChats = chatsAll || [];
    }

    if (todosChats.length === 0) return res.status(200).json({ equipos: [] });

    const equipoMap = {};
    todosChats.forEach(c => {
      const key = c.equipo_nombre;
      if (!equipoMap[key]) equipoMap[key] = { nombre: key, integrantes: {}, misiones: {}, ultima_actividad: c.created_at };
      const eq = equipoMap[key];
      if (!eq.integrantes[c.estudiante_id]) eq.integrantes[c.estudiante_id] = { id: c.estudiante_id, nombre: c.nombre_estudiante, xp_max: 0, grado: null, grupo: null };
      const int_ = eq.integrantes[c.estudiante_id];
      if ((c.xp_at_time || 0) > int_.xp_max) int_.xp_max = c.xp_at_time || 0;
      const mId = c.mision_id || "libre";
      if (!eq.misiones[mId]) eq.misiones[mId] = { id: mId, title: c.mision_title || misionesMap[mId]?.title || "Modo libre", color: misionesMap[mId]?.color || "#8b5cf6", icon: misionesMap[mId]?.icon || "🆓", mensajes: 0 };
      eq.misiones[mId].mensajes++;
      if (c.created_at > eq.ultima_actividad) eq.ultima_actividad = c.created_at;
    });

    const todosIds = [...new Set(todosChats.map(c => c.estudiante_id))];
    let progresoMap = {};
    let gradoGrupoMap = {};

    if (todosIds.length > 0) {
      let qProg = supabase.from("nexus_progreso").select("estudiante_id, xp_total, nota, nivel, mision_id, grado, grupo").in("estudiante_id", todosIds.map(String)).limit(3000);
      if (misionIds && misionIds.length > 0) qProg = qProg.in("mision_id", misionIds);
      const { data: progreso } = await qProg;
      (progreso || []).forEach(p => {
        const k = `total_${p.estudiante_id}`;
        if (!progresoMap[k]) progresoMap[k] = 0;
        progresoMap[k] += (p.xp_total || 0);
        if (!gradoGrupoMap[p.estudiante_id] && (p.grado || p.grupo)) gradoGrupoMap[p.estudiante_id] = { grado: p.grado || "", grupo: p.grupo || "" };
      });
      const { data: ests } = await supabase.from("nexus_estudiantes").select("id, grado, grupo").in("id", todosIds.map(String)).limit(1000);
      (ests || []).forEach(e => { if (e.grado || e.grupo) gradoGrupoMap[e.id] = { grado: e.grado || "", grupo: e.grupo || "" }; });
    }

    const equipos = Object.values(equipoMap).map(eq => {
      const integrantes = Object.values(eq.integrantes).map((int_, i) => {
        const gg = gradoGrupoMap[int_.id] || { grado: "", grupo: "" };
        const xpTotal = progresoMap[`total_${int_.id}`] || int_.xp_max;
        return { id: int_.id, nombre: int_.nombre, xp_total: xpTotal, nota: calcNota(xpTotal), grado: gg.grado, grupo: gg.grupo, es_lider: i === 0 };
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
      const notaProm = integrantes.length > 0 ? Math.round((integrantes.reduce((s,i) => s + i.nota, 0) / integrantes.length) * 10) / 10 : 1.0;
      return { nombre: eq.nombre, grado: gradoEquipo, grupo: grupoEquipo, integrantes: integrantes.sort((a,b) => b.xp_total - a.xp_total), misiones: Object.values(eq.misiones), xp_equipo: xpEquipo, nota_promedio: notaProm, num_integrantes: integrantes.length, ultima_actividad: eq.ultima_actividad };
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
