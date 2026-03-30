/**
 * ═══════════════════════════════════════════════════════════════
 * NEXUS — API Routes: Progreso + Evaluaciones
 * Archivo: /api/evaluacion.js  y  /api/progress.js (Vercel)
 * 
 * Variables de entorno en Vercel:
 *   POSTGRES_URL = postgresql://user:pass@host/database
 * ═══════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────
// ARCHIVO 1: /api/evaluacion.js — Guardar resultado de evaluación
// ─────────────────────────────────────────────────────────────────
// import { sql } from '@vercel/postgres';  // ← si usas Vercel Postgres

export async function POST_evaluacion(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const {
    misionId, misionTitulo,
    preguntas, respuestasDadas, correctas, totalPreguntas, tiempoSegundos,
    usuario,
  } = req.body;

  const porcentaje = totalPreguntas > 0 ? (correctas / totalPreguntas * 100) : 0;
  const nota       = parseFloat((correctas / totalPreguntas * 4 + 1).toFixed(2));
  const aprobada   = nota >= 3.0;

  try {
    // ── Si usas Vercel Postgres (recomendado) ──────────────────
    // await sql`
    //   INSERT INTO nexus_evaluaciones
    //     (mission_id, mission_titulo, student_id, student_nombre, grado, grupo,
    //      modo, team_id, team_nombre, preguntas, respuestas_dadas,
    //      total_preguntas, correctas, incorrectas, nota, porcentaje, aprobada,
    //      tiempo_segundos)
    //   VALUES (
    //     ${misionId}, ${misionTitulo}, ${usuario.id}, ${usuario.nombre},
    //     ${usuario.grado}, ${usuario.grupo}, ${usuario.modo || 'individual'},
    //     ${usuario.teamId || null}, ${usuario.teamNombre || null},
    //     ${JSON.stringify(preguntas)}, ${JSON.stringify(respuestasDadas)},
    //     ${totalPreguntas}, ${correctas}, ${totalPreguntas - correctas},
    //     ${nota}, ${porcentaje}, ${aprobada}, ${tiempoSegundos || null}
    //   )
    // `;
    //
    // if (aprobada) {
    //   await sql`
    //     UPDATE nexus_mission_progress
    //     SET evaluacion_completada = true, nota_evaluacion = ${nota}, fecha_evaluacion = NOW()
    //     WHERE mission_id = ${misionId} AND student_id = ${usuario.id}
    //   `;
    // }

    // ── Fallback: responder OK (guardar en localStorage del cliente) ──
    return res.status(200).json({
      ok: true, nota, porcentaje, aprobada,
      intento: 1,
      mensaje: aprobada ? '¡Evaluación aprobada!' : 'Sigue practicando',
    });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

export default POST_evaluacion;


// ─────────────────────────────────────────────────────────────────
// ARCHIVO 2: /api/progress.js — Guardar / leer progreso de misiones
// ─────────────────────────────────────────────────────────────────

export async function handler_progress(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { studentId } = req.query;
    // Leer desde DB
    // const { rows } = await sql`
    //   SELECT mission_id, orden_mision, retos_completados, total_retos,
    //          mision_completada, evaluacion_completada, nota_evaluacion
    //   FROM nexus_mission_progress WHERE student_id = ${studentId}
    // `;
    // const progreso = {};
    // rows.forEach(r => { progreso[r.mission_id] = { ...r }; });
    return res.status(200).json({ ok: true, progreso: {} });
  }

  if (req.method === 'POST') {
    const { misionId, misionTitulo, ordenMision, totalRetos, retosCompletados, usuario } = req.body;
    const completada = retosCompletados >= totalRetos;
    // await sql`
    //   INSERT INTO nexus_mission_progress
    //     (mission_id, mission_titulo, orden_mision, total_retos,
    //      student_id, student_nombre, grado, grupo, modo, team_id, team_nombre,
    //      retos_completados, mision_completada)
    //   VALUES (${misionId}, ${misionTitulo}, ${ordenMision}, ${totalRetos},
    //     ${usuario.id}, ${usuario.nombre}, ${usuario.grado}, ${usuario.grupo},
    //     ${usuario.modo||'individual'}, ${usuario.teamId||null}, ${usuario.teamNombre||null},
    //     ${retosCompletados}, ${completada})
    //   ON CONFLICT (mission_id, student_id)
    //   DO UPDATE SET
    //     retos_completados = GREATEST(nexus_mission_progress.retos_completados, EXCLUDED.retos_completados),
    //     mision_completada = EXCLUDED.mision_completada
    // `;
    return res.status(200).json({ ok: true, completada });
  }

  return res.status(405).json({ error: 'Método no soportado' });
}
