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
        .select("id, institucion_id, nombres, apellidos, email, asignatura, fecha_registro")
        .order("nombres"),
      supabase.from("estudiantes")
        .select("id, institucion_id, nombres, apellidos, grado, grupo, docente_id, fecha_registro")
        .order("nombres"),
    ]);
    if (e1) console.error("Error docentes:", e1.message);
    if (e2) console.error("Error estudiantes:", e2.message);
    return res.status(200).json({ docentes: docentes||[], estudiantes: estudiantes||[] });
  }

  // ── POST: crear docente, estudiante o asignar docente_id ────
  if (req.method === "POST") {
    const { accion } = req.body;

    // Limpiar progreso (acción existente)
    if (accion === "limpiar_progreso") {
      const { error } = await supabase.from("nexus_progreso").delete().neq("id", 0);
      if (error) return res.status(200).json({ error: error.message });
      return res.status(200).json({ success: true });
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
