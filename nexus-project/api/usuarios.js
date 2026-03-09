// api/usuarios.js — Gestión de usuarios (solo admin)
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
    return res.status(200).json({ error: "Faltan variables de entorno" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // ── GET: listar docentes y estudiantes ──────────────────────
  if (req.method === "GET") {
    const [
      { data: docentes,    error: e1 },
      { data: estudiantes, error: e2 },
    ] = await Promise.all([
      supabase.from("docentes")
        .select("id, nombres, apellidos, email, asignatura, fecha_registro")
        .order("nombres"),
      supabase.from("estudiantes")
        .select("id, nombres, apellidos, grado, grupo, docente_id, fecha_registro")
        .order("nombres"),
    ]);
    if (e1) console.error("Error docentes:", e1.message);
    if (e2) console.error("Error estudiantes:", e2.message);
    return res.status(200).json({ docentes: docentes||[], estudiantes: estudiantes||[] });
  }

  // ── POST: crear docente, estudiante o asignar docente_id ────
  if (req.method === "POST") {
    const { accion } = req.body;

    // Limpiar progreso (admin — borra todo)
    if (accion === "limpiar_progreso") {
      const { error: e1 } = await supabase.from("nexus_progreso").delete().neq("id", 0);
      const { error: e2 } = await supabase.from("nexus_chats").delete().neq("id", 0);
      if (e1 || e2) return res.status(200).json({ error: (e1||e2).message });
      return res.status(200).json({ success: true });
    }

    // Limpiar progreso de un docente específico (teacher — borra solo sus estudiantes)
    if (accion === "limpiar_progreso_docente") {
      const { docente_id } = req.body;
      if (!docente_id) return res.status(200).json({ error: "Falta docente_id" });

      // Misiones del docente
      const { data: misiones } = await supabase
        .from("nexus_misiones").select("id").eq("docente_id", String(docente_id));
      const misionIds = (misiones || []).map(m => m.id);
      if (misionIds.length === 0) return res.status(200).json({ success: true, estudiantesAfectados: 0 });

      // IDs de estudiantes
      const { data: progRows } = await supabase
        .from("nexus_progreso").select("estudiante_id").in("mision_id", misionIds).limit(3000);
      const estIds = [...new Set((progRows||[]).map(p=>String(p.estudiante_id)))];

      // Borrar progreso
      await supabase.from("nexus_progreso").delete().in("mision_id", misionIds);

      // Borrar chats de esas misiones + chats libres de esos estudiantes
      await supabase.from("nexus_chats").delete().in("mision_id", misionIds);
      if (estIds.length > 0) {
        await supabase.from("nexus_chats").delete().is("mision_id", null).in("estudiante_id", estIds);
      }

      return res.status(200).json({ success: true, estudiantesAfectados: estIds.length });
    }

    // ── Reiniciar progreso de un Grado (y opcionalmente Grupo) ─
    if (accion === "limpiar_progreso_grado") {
      const { docente_id, grado, grupo } = req.body;
      if (!docente_id || !grado)
        return res.status(200).json({ error: "Faltan docente_id o grado" });

      // Estudiantes del docente con ese grado/grupo
      let estQuery = supabase.from("estudiantes").select("id, grado, grupo")
        .eq("docente_id", String(docente_id))
        .eq("grado", String(grado));
      if (grupo) estQuery = estQuery.eq("grupo", String(grupo));

      const { data: estudiantes } = await estQuery.limit(3000);
      const estIds = (estudiantes || []).map(e => String(e.id));

      if (estIds.length === 0)
        return res.status(200).json({ success: true, estudiantesAfectados: 0 });

      // Misiones del docente
      const { data: misiones } = await supabase
        .from("nexus_misiones").select("id").eq("docente_id", String(docente_id));
      const misionIds = (misiones || []).map(m => m.id);

      // Borrar progreso de esos estudiantes
      await supabase.from("nexus_progreso")
        .delete().in("estudiante_id", estIds);

      // Borrar chats de esos estudiantes (en misiones del docente y libres)
      if (misionIds.length > 0) {
        await supabase.from("nexus_chats")
          .delete().in("estudiante_id", estIds).in("mision_id", misionIds);
      }
      await supabase.from("nexus_chats")
        .delete().in("estudiante_id", estIds).is("mision_id", null);

      // Borrar timers de esos estudiantes
      try {
        await supabase.from("nexus_timers")
          .delete().in("estudiante_id", estIds);
      } catch(e) {} // la tabla puede no existir aún

      return res.status(200).json({ success: true, estudiantesAfectados: estIds.length });
    }

    // ── Eliminar TODOS los equipos (chats + progreso) ──────────
    // Elimina físicamente los chats con equipo_nombre != null
    // y el progreso asociado. Reset total para empezar de cero.
    if (accion === "limpiar_equipos") {
      const { docente_id } = req.body;
      let misionIds = [];
      let estIds = [];

      if (docente_id) {
        // Misiones propias del docente
        const { data: misiones } = await supabase
          .from("nexus_misiones").select("id").eq("docente_id", String(docente_id));
        misionIds = (misiones || []).map(m => m.id);

        // IDs de estudiantes del docente
        if (misionIds.length > 0) {
          const { data: ests } = await supabase
            .from("nexus_progreso").select("estudiante_id").in("mision_id", misionIds).limit(3000);
          estIds = [...new Set((ests||[]).map(e=>String(e.estudiante_id)))];
        }
      }

      // 1. Obtener nombres de equipos a eliminar
      let qNombres = supabase.from("nexus_chats")
        .select("equipo_nombre, estudiante_id")
        .not("equipo_nombre", "is", null)
        .limit(5000);
      if (misionIds.length > 0) qNombres = qNombres.in("mision_id", misionIds);
      const { data: chatConEquipo } = await qNombres;

      // También chats modo libre de los estudiantes del docente
      if (estIds.length > 0) {
        const { data: chatLibre } = await supabase.from("nexus_chats")
          .select("equipo_nombre, estudiante_id")
          .not("equipo_nombre", "is", null).is("mision_id", null)
          .in("estudiante_id", estIds).limit(2000);
        if (chatLibre && chatLibre.length > 0) {
          (chatLibre).forEach(r => (chatConEquipo || []).push(r));
        }
      }

      const estudiantesAfectados = [...new Set((chatConEquipo||[]).map(r=>String(r.estudiante_id)))];

      // 2. Eliminar TODOS los chats de esos estudiantes (reset completo)
      let errores = [];
      if (docente_id && misionIds.length > 0) {
        const { error: e1 } = await supabase.from("nexus_chats").delete().in("mision_id", misionIds);
        if (e1) errores.push(e1.message);
        // Modo libre
        if (estIds.length > 0) {
          const { error: e2 } = await supabase.from("nexus_chats").delete()
            .is("mision_id", null).in("estudiante_id", estIds);
          if (e2) errores.push(e2.message);
        }
      } else if (!docente_id) {
        // Admin: borrar todos los chats
        const { error: e3 } = await supabase.from("nexus_chats").delete().neq("id", 0);
        if (e3) errores.push(e3.message);
      }

      // 3. Eliminar progreso de los estudiantes afectados
      if (estudiantesAfectados.length > 0) {
        let qDelProg = supabase.from("nexus_progreso").delete().in("estudiante_id", estudiantesAfectados);
        if (misionIds.length > 0) qDelProg = qDelProg.in("mision_id", misionIds);
        const { error: e4 } = await qDelProg;
        if (e4) errores.push(e4.message);
      }

      if (errores.length > 0) return res.status(200).json({ error: errores.join(" | ") });
      return res.status(200).json({ success: true, estudiantesAfectados: estudiantesAfectados.length });
    }

    // ── Crear docente nuevo ──────────────────────────────────
    if (accion === "crear_docente") {
      const { nombres, apellidos, email, asignatura, password } = req.body;
      if (!nombres || !apellidos || !email || !password)
        return res.status(200).json({ error: "Faltan campos requeridos" });

      // Verificar si ya existe
      const { data: existe } = await supabase.from("docentes")
        .select("id").ilike("email", email.trim()).limit(1);
      if (existe?.length > 0)
        return res.status(200).json({ error: "Ya existe un docente con ese correo" });

      const clave = await bcrypt.hash(password, 10);
      const { data, error } = await supabase.from("docentes").insert({
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        email: email.toLowerCase().trim(),
        asignatura: asignatura?.trim() || "",
        clave,
        fecha_registro: new Date().toISOString(),
      }).select("id, nombres, apellidos, email, asignatura").single();

      if (error) return res.status(200).json({ error: error.message });
      return res.status(200).json({ success: true, docente: data });
    }

    // ── Crear estudiante nuevo ───────────────────────────────
    if (accion === "crear_estudiante") {
      const { nombres, apellidos, grado, grupo, docente_id } = req.body;
      if (!nombres || !apellidos || !grado || !grupo)
        return res.status(200).json({ error: "Faltan campos requeridos" });

      const { data, error } = await supabase.from("estudiantes").insert({
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        grado: String(grado),
        grupo: String(grupo),
        docente_id: docente_id || null,
        fecha_registro: new Date().toISOString(),
      }).select("id, nombres, apellidos, grado, grupo, docente_id").single();

      if (error) return res.status(200).json({ error: error.message });
      return res.status(200).json({ success: true, estudiante: data });
    }

    // ── Asignar docente_id a estudiantes por grado/grupo ────
    if (accion === "asignar_docente") {
      const { docente_id, grados, grupos } = req.body;
      // grados: array de strings ["6","7","8"] o null para todos
      // grupos: array de strings ["1","2"] o null para todos
      if (!docente_id)
        return res.status(200).json({ error: "Falta docente_id" });

      let query = supabase.from("estudiantes")
        .update({ docente_id: String(docente_id) });

      if (grados?.length > 0) query = query.in("grado", grados);
      if (grupos?.length > 0) query = query.in("grupo", grupos);

      const { error, count } = await query;
      if (error) return res.status(200).json({ error: error.message });
      return res.status(200).json({ success: true, actualizados: count });
    }

    return res.status(200).json({ error: "Acción no reconocida" });
  }

  // ── DELETE: eliminar docente o estudiante ────────────────────
  if (req.method === "DELETE") {
    const { id, tipo } = req.query;
    if (!id || !tipo) return res.status(200).json({ error: "Faltan id y tipo" });

    if (tipo === "estudiante") {
      // Borrar registros relacionados PRIMERO (respeta FK constraints de Supabase)
      await supabase.from("nexus_progreso").delete().eq("estudiante_id", String(id));
      await supabase.from("nexus_chats").delete().eq("estudiante_id", String(id));
      // Ahora sí eliminar el estudiante
      const { error } = await supabase.from("estudiantes").delete().eq("id", id);
      if (error) return res.status(200).json({ error: error.message });
    }

    if (tipo === "docente") {
      // Liberar estudiantes asignados antes de eliminar docente
      await supabase.from("estudiantes").update({ docente_id: null }).eq("docente_id", String(id));
      const { error } = await supabase.from("docentes").delete().eq("id", id);
      if (error) return res.status(200).json({ error: error.message });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(200).json({ error: "Method not allowed" });
};
