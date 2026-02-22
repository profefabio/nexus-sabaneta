// api/usuarios.js — Gestión de usuarios (solo admin)
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
    return res.status(500).json({ error: "Faltan variables de entorno" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  if (req.method === "GET") {
    // Columnas reales: nombres, apellidos, fecha_registro
    const [
      { data: docentes,    error: e1 },
      { data: estudiantes, error: e2 },
    ] = await Promise.all([
      supabase.from("docentes")
        .select("id, institucion_id, nombres, apellidos, email, asignatura, fecha_registro")
        .order("nombres"),
      supabase.from("estudiantes")
        .select("id, institucion_id, nombres, apellidos, grado, grupo, fecha_registro")
        .order("nombres"),
    ]);

    if (e1) console.error("Error docentes:", e1.message);
    if (e2) console.error("Error estudiantes:", e2.message);

    return res.status(200).json({
      docentes:    docentes    || [],
      estudiantes: estudiantes || [],
    });
  }

  if (req.method === "DELETE") {
    const { id, tipo } = req.query;
    if (!id || !tipo) return res.status(400).json({ error: "Faltan id y tipo" });

    const tabla = tipo === "docente" ? "docentes" : "estudiantes";
    const { error } = await supabase.from(tabla).delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });

    // Borrar progreso si es estudiante
    if (tipo === "estudiante") {
      await supabase.from("nexus_progreso").delete().eq("estudiante_id", String(id));
    }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
