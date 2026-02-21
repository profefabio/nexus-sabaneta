// api/login.js — Login dual: docentes (correo+clave) y estudiantes (nombres+apellidos+grado+grupo)

import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { type } = req.body;

  // ══════════════════════════════════════════════════
  // INGRESO DOCENTE — correo + contraseña bcrypt
  // ══════════════════════════════════════════════════
  if (type === "teacher") {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Correo y contraseña requeridos" });

    const { data: docentes, error } = await supabase
      .from("docentes")
      .select("*")
      .ilike("correo", email.toLowerCase().trim())
      .limit(1);

    if (error || !docentes || docentes.length === 0)
      return res.status(401).json({ error: "Correo no registrado" });

    const doc = docentes[0];
    const isValid = await bcrypt.compare(password, doc.clave);
    if (!isValid)
      return res.status(401).json({ error: "Contraseña incorrecta" });

    const isAdmin = doc.correo.toLowerCase() === "fabioortiz37422@sabaneta.edu.co";
    return res.status(200).json({
      user: {
        id: doc.id,
        email: doc.correo,
        name: doc.nombre || doc.nombres || "",
        role: isAdmin ? "admin" : "teacher",
        subject: doc.asignatura || "",
      }
    });
  }

  // ══════════════════════════════════════════════════
  // INGRESO ESTUDIANTE — nombres + apellidos + grado + grupo
  // Columnas reales en Supabase: nombres, apellidos, grado, grupo
  // ══════════════════════════════════════════════════
  if (type === "student") {
    const { nombre, apellido, grado, grupo } = req.body;
    if (!nombre || !apellido || !grado || !grupo)
      return res.status(400).json({ error: "Completa todos los campos" });

    // Buscar por grado Y grupo primero (reduce el conjunto)
    const { data: estudiantes, error } = await supabase
      .from("estudiantes")
      .select("id, nombres, apellidos, grado, grupo, clave")
      .eq("grado", grado)
      .eq("grupo", grupo);

    if (error || !estudiantes || estudiantes.length === 0)
      return res.status(401).json({
        error: `No hay estudiantes registrados en grado ${grado} grupo ${grupo}`
      });

    // Buscar coincidencia flexible en nombres y apellidos por separado
    const nombreInput = nombre.toLowerCase().trim();
    const apellidoInput = apellido.toLowerCase().trim();

    const est = estudiantes.find(e => {
      const nombresDB   = (e.nombres   || "").toLowerCase().trim();
      const apellidosDB = (e.apellidos || "").toLowerCase().trim();
      // Acepta coincidencia parcial para nombres compuestos
      const nombreOk   = nombresDB.includes(nombreInput)   || nombreInput.includes(nombresDB.split(" ")[0]);
      const apellidoOk = apellidosDB.includes(apellidoInput) || apellidoInput.includes(apellidosDB.split(" ")[0]);
      return nombreOk && apellidoOk;
    });

    if (!est)
      return res.status(401).json({
        error: `No encontramos a "${nombre} ${apellido}" en grado ${grado} grupo ${grupo}. Verifica cómo está escrito tu nombre en el sistema.`
      });

    return res.status(200).json({
      user: {
        id: est.id,
        email: `est${est.id}@nexus.sabaneta.edu.co`,
        name: `${est.nombres} ${est.apellidos}`,
        role: "student",
        grade: est.grado,
        group: est.grupo,
      }
    });
  }

  return res.status(400).json({ error: "Tipo de login no válido" });
}
