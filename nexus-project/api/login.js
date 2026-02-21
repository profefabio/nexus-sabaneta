// api/login.js — Login seguro conectado a Supabase
// Busca el usuario en las tablas docentes/estudiantes y verifica bcrypt

import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Correo y contraseña requeridos" });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const emailClean = email.toLowerCase().trim();

  // ─── 1. Buscar en tabla docentes ──────────────────────────────
  const { data: docentes } = await supabase
    .from("docentes")
    .select("*")
    .ilike("correo", emailClean)
    .limit(1);

  if (docentes && docentes.length > 0) {
    const docente = docentes[0];
    const isValid = await bcrypt.compare(password, docente.clave);
    if (!isValid) return res.status(401).json({ error: "Credenciales incorrectas" });

    const isAdmin = emailClean === "fabioortiz37422@sabaneta.edu.co";
    return res.status(200).json({
      user: {
        id: docente.id,
        email: docente.correo,
        name: docente.nombre,
        role: isAdmin ? "admin" : "teacher",
        subject: docente.asignatura || "",
      }
    });
  }

  // ─── 2. Buscar en tabla estudiantes ───────────────────────────
  const { data: estudiantes } = await supabase
    .from("estudiantes")
    .select("*")
    .ilike("correo", emailClean)
    .limit(1);

  if (estudiantes && estudiantes.length > 0) {
    const est = estudiantes[0];
    const isValid = await bcrypt.compare(password, est.clave);
    if (!isValid) return res.status(401).json({ error: "Credenciales incorrectas" });

    return res.status(200).json({
      user: {
        id: est.id,
        email: est.correo,
        name: est.nombre,
        role: "student",
        grade: est.grupo || est.grado || "",
      }
    });
  }

  return res.status(401).json({ error: "Credenciales incorrectas" });
}
