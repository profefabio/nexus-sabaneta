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

  // GET — listar docentes y estudiantes
  if (req.method === "GET") {
    const [
      { data: docentes, error: e1 },
      { data: estudiantes, error: e2 },
    ] = await Promise.all([
      supabase.from("docentes").select("id, nombre, email, rol, created_at").order("nombre"),
      supabase.from("estudiantes").select("id, nombre, apellido, grado, grupo, email, created_at").order("nombre"),
    ]);
    if (e1 || e2) return res.status(500).json({ error: (e1||e2).message });
    return res.status(200).json({ docentes: docentes||[], estudiantes: estudiantes||[] });
  }

  // DELETE — eliminar usuario
  if (req.method === "DELETE") {
    const { id, tipo } = req.query;
    if (!id || !tipo) return res.status(400).json({ error: "Faltan id y tipo" });
    const tabla = tipo === "docente" ? "docentes" : "estudiantes";
    const { error } = await supabase.from(tabla).delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    // Si es estudiante, borrar también su progreso
    if (tipo === "estudiante") {
      await supabase.from("nexus_progreso").delete().eq("estudiante_id", id);
    }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
