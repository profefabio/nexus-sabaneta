// api/equipos.js — Equipos con grado/grupo para filtros
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")
    return res.status(200).json({ error: "Método no permitido", equipos: [] });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
    return res.status(200).json({ error: "Faltan variables de entorno", equipos: [] });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { docente_id } = req.query;

  try {
    // 1. Misiones del docente
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

    // 2. Chats con equipo_nombre
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

    // 3. Agrupar por equipo_nombre
    const equipoMap = {};
    chats.forEach(c => {
      const key = c.equipo_nombre;
      if (!equipoMap[key]) {
        equipoMap[key] = {
          nombre: key,
          integrantes: {},
          misiones: {},
          ultima_actividad: c.created_at,
        };
      }
      const eq = equipoMap[key];

      if (!eq.integrantes[c.estudiante_id]) {
        eq.integrantes[c.estudiante_id] = {
          id: c.estudiante_id,
          nombre: c.nombre_estudiante,
          xp_max: 0,
          grado: null,
          grupo: null,
        };
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

    // 4. Progreso real + grado/grupo de cada estudiante
    const todosIds = [...new Set(chats.map(c => c.estudiante_id))];
    let progresoMap = {};
    let gradoGrupoMap = {}; // { estudiante_id → { grado, grupo } }

    if (todosIds.length > 0) {
      let qProg = supabase
        .from("nexus_progreso")
        .select("estudiante_id, xp_total, nota, nivel, mision_id, grado, grupo")
        .in("estudiante_id", todosIds.map(String));
      if (misionIds) qProg = qProg.in("mision_id", misionIds);

      const { data: progreso } = await qProg;
      (progreso || []).forEach(p => {
        // XP acumulado por estudiante
        if (!progresoMap[`total_${p.estudiante_id}`])
          progresoMap[`total_${p.estudiante_id}`] = 0;
        progresoMap[`total_${p.estudiante_id}`] += (p.xp_total || 0);

        // Guardar grado/grupo (tomamos el primero que tenga datos)
        if (!gradoGrupoMap[p.estudiante_id] && (p.grado || p.grupo)) {
          gradoGrupoMap[p.estudiante_id] = { grado: p.grado || "", grupo: p.grupo || "" };
        }
      });
    }

    // 5. También buscar grado/grupo desde nexus_estudiantes si existe
    if (todosIds.length > 0) {
      const { data: ests } = await supabase
        .from("nexus_estudiantes")
        .select("id, grado, grupo")
        .in("id", todosIds.map(String));
      (ests || []).forEach(e => {
        if (e.grado || e.grupo) {
          gradoGrupoMap[e.id] = { grado: e.grado || "", grupo: e.grupo || "" };
        }
      });
    }

    // 6. Construir respuesta final
    const equipos = Object.values(equipoMap).map(eq => {
      const integrantes = Object.values(eq.integrantes).map((int, i) => {
        const gg = gradoGrupoMap[int.id] || { grado: "", grupo: "" };
        const xpTotal = progresoMap[`total_${int.id}`] || int.xp_max;
        return {
          id: int.id,
          nombre: int.nombre,
          xp_total: xpTotal,
          nota: calcNota(xpTotal),
          grado: gg.grado,
          grupo: gg.grupo,
          es_lider: i === 0,   // el primero registrado en chats es el líder
        };
      });

      // Grado/grupo del equipo = el más frecuente entre integrantes
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
        nombre: eq.nombre,
        grado: gradoEquipo,
        grupo: grupoEquipo,
        integrantes: integrantes.sort((a,b) => b.xp_total - a.xp_total),
        misiones: Object.values(eq.misiones),
        xp_equipo: xpEquipo,
        nota_promedio: notaProm,
        num_integrantes: integrantes.length,
        ultima_actividad: eq.ultima_actividad,
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
