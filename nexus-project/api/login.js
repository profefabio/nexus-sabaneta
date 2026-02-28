// api/login.js — Columnas reales de Supabase:
// docentes:    id, nombres, apellidos, email, asignatura, clave
// estudiantes: id, nombres, apellidos, grado, grupo, clave

const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: "Faltan variables SUPABASE_URL y SUPABASE_SERVICE_KEY en Vercel" });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { type } = req.body;

  // ══════════════════════════════════════════════
  // DOCENTE — busca por columna "email"
  // ══════════════════════════════════════════════
  if (type === "teacher") {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Correo y contraseña requeridos" });

    const { data: docentes, error } = await supabase
      .from("docentes")
      .select("id, nombres, apellidos, email, asignatura, clave")
      .ilike("email", email.toLowerCase().trim())
      .limit(1);

    if (error) return res.status(500).json({ error: "Error BD: " + error.message });
    if (!docentes || docentes.length === 0)
      return res.status(401).json({ error: "Correo no registrado" });

    const doc = docentes[0];
    const isValid = await bcrypt.compare(password, doc.clave);
    if (!isValid) return res.status(401).json({ error: "Contraseña incorrecta" });

    const isAdmin = doc.email.toLowerCase() === "fabioortiz37422@sabaneta.edu.co";
    return res.status(200).json({
      user: {
        id: doc.id,
        email: doc.email,
        name: `${doc.nombres} ${doc.apellidos}`,
        role: isAdmin ? "admin" : "teacher",
        subject: doc.asignatura || "",
      }
    });
  }

  // ══════════════════════════════════════════════
  // ESTUDIANTE — busca por nombres + apellidos + grado + grupo
  // ══════════════════════════════════════════════
  if (type === "student") {
    const { nombre, apellido, grado, grupo } = req.body;
    if (!nombre || !apellido || !grado || !grupo)
      return res.status(400).json({ error: "Completa todos los campos" });

    const { data: estudiantes, error } = await supabase
      .from("estudiantes")
      .select("id, nombres, apellidos, grado, grupo, docente_id")
      .eq("grado", grado)
      .eq("grupo", grupo);

    if (error) return res.status(500).json({ error: "Error BD: " + error.message });
    if (!estudiantes || estudiantes.length === 0)
      return res.status(401).json({ error: `No hay estudiantes en grado ${grado} grupo ${grupo}` });

    const nombreInput   = nombre.toLowerCase().trim();
    const apellidoInput = apellido.toLowerCase().trim();

    const est = estudiantes.find(e => {
      const n = (e.nombres   || "").toLowerCase();
      const a = (e.apellidos || "").toLowerCase();
      return n.includes(nombreInput) && a.includes(apellidoInput);
    });

    if (!est)
      return res.status(401).json({
        error: `No encontramos "${nombre} ${apellido}" en grado ${grado} grupo ${grupo}. Verifica cómo está escrito tu nombre.`
      });

    return res.status(200).json({
      user: {
        id: est.id,
        email: `est${est.id}@nexus.sabaneta`,
        name: `${est.nombres} ${est.apellidos}`,
        role: "student",
        grade: est.grado,
        group: est.grupo,
        docente_id: est.docente_id || null, // ← filtra misiones del docente asignado
      }
    });
  }

  return res.status(400).json({ error: "Tipo de login no válido" });
};
