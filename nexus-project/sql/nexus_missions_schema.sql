-- ═══════════════════════════════════════════════════════════════
-- NEXUS SABANETA — Tablas para Progreso de Misiones y Evaluaciones IA
-- Prof. Fabio Alberto Ortiz M. · I.E. Sabaneta
-- Ejecutar en la base de datos: evaluaciones_db
-- ═══════════════════════════════════════════════════════════════

-- 1. Progreso de misiones por estudiante (individual o grupal)
CREATE TABLE IF NOT EXISTS nexus_mission_progress (
  id                    SERIAL PRIMARY KEY,
  mission_id            TEXT NOT NULL,          -- ID de la misión en Nexus web
  mission_titulo        TEXT NOT NULL,
  student_id            TEXT NOT NULL,          -- ID del estudiante en Nexus web
  student_nombre        TEXT,
  grado                 TEXT,
  grupo                 TEXT,
  modo                  TEXT NOT NULL DEFAULT 'individual', -- 'individual' | 'grupal'
  team_id               TEXT,                  -- ID del equipo si es modo grupal
  team_nombre           TEXT,
  retos_completados     INTEGER DEFAULT 0,
  total_retos           INTEGER NOT NULL DEFAULT 1,
  mision_completada     BOOLEAN DEFAULT FALSE,
  evaluacion_completada BOOLEAN DEFAULT FALSE,
  nota_evaluacion       NUMERIC(3,2),
  orden_mision          INTEGER DEFAULT 1,      -- Orden secuencial de la misión
  fecha_inicio          TIMESTAMPTZ DEFAULT NOW(),
  fecha_completada      TIMESTAMPTZ,
  fecha_evaluacion      TIMESTAMPTZ,
  UNIQUE(mission_id, student_id)               -- Un registro por estudiante por misión
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_nmp_student   ON nexus_mission_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_nmp_mission   ON nexus_mission_progress(mission_id);
CREATE INDEX IF NOT EXISTS idx_nmp_team      ON nexus_mission_progress(team_id);
CREATE INDEX IF NOT EXISTS idx_nmp_grado     ON nexus_mission_progress(grado, grupo);
CREATE INDEX IF NOT EXISTS idx_nmp_completada ON nexus_mission_progress(mision_completada);

-- 2. Evaluaciones IA generadas al finalizar cada misión
CREATE TABLE IF NOT EXISTS nexus_evaluaciones (
  id                SERIAL PRIMARY KEY,
  mission_id        TEXT NOT NULL,
  mission_titulo    TEXT NOT NULL,
  student_id        TEXT NOT NULL,
  student_nombre    TEXT,
  grado             TEXT,
  grupo             TEXT,
  modo              TEXT NOT NULL DEFAULT 'individual',
  team_id           TEXT,
  team_nombre       TEXT,
  -- Preguntas y respuestas en formato JSON
  preguntas         JSONB NOT NULL,             -- Array de {id, enunciado, opciones:[A,B,C,D], respuesta_correcta, explicacion}
  respuestas_dadas  JSONB NOT NULL DEFAULT '{}', -- {id_pregunta: opcion_elegida}
  -- Resultados
  total_preguntas   INTEGER NOT NULL,
  correctas         INTEGER DEFAULT 0,
  incorrectas       INTEGER DEFAULT 0,
  nota              NUMERIC(3,2),               -- Escala 1.0 – 5.0
  porcentaje        NUMERIC(5,2),               -- 0 – 100
  aprobada          BOOLEAN DEFAULT FALSE,
  -- Metadata
  intento           INTEGER DEFAULT 1,          -- Número de intento (máx 2)
  tiempo_segundos   INTEGER,                    -- Tiempo empleado en segundos
  fecha             TIMESTAMPTZ DEFAULT NOW(),
  -- Relación con progress
  progress_id       INTEGER REFERENCES nexus_mission_progress(id)
);

CREATE INDEX IF NOT EXISTS idx_ne_student  ON nexus_evaluaciones(student_id);
CREATE INDEX IF NOT EXISTS idx_ne_mission  ON nexus_evaluaciones(mission_id);
CREATE INDEX IF NOT EXISTS idx_ne_grado    ON nexus_evaluaciones(grado, grupo);
CREATE INDEX IF NOT EXISTS idx_ne_fecha    ON nexus_evaluaciones(fecha DESC);

-- 3. Vista resumen para el docente (combina ambas tablas)
CREATE OR REPLACE VIEW nexus_resumen_misiones AS
SELECT
  p.student_nombre                              AS estudiante,
  p.grado,
  p.grupo,
  p.modo,
  p.team_nombre                                 AS equipo,
  p.mission_titulo                              AS mision,
  p.orden_mision,
  p.retos_completados || '/' || p.total_retos   AS retos,
  CASE WHEN p.mision_completada THEN '✅' ELSE '⏳' END AS completada,
  CASE WHEN p.evaluacion_completada THEN '✅' ELSE '–' END AS evaluada,
  p.nota_evaluacion                             AS nota,
  TO_CHAR(p.fecha_completada, 'DD/MM/YYYY HH24:MI') AS fecha_completada,
  e.correctas || '/' || e.total_preguntas       AS aciertos,
  e.intento
FROM nexus_mission_progress p
LEFT JOIN nexus_evaluaciones e ON e.progress_id = p.id AND e.intento = (
  SELECT MAX(e2.intento) FROM nexus_evaluaciones e2 WHERE e2.progress_id = p.id
)
ORDER BY p.grado, p.grupo, p.student_nombre, p.orden_mision;

-- ═══════════════════════════════════════════════════════════════
-- DATOS DE PRUEBA (comentar en producción)
-- ═══════════════════════════════════════════════════════════════
-- INSERT INTO nexus_mission_progress (mission_id, mission_titulo, student_id, student_nombre, grado, grupo, total_retos, orden_mision)
-- VALUES ('m-001', 'Circuitos eléctricos', 'est-sara-001', 'Sara López', '11', 'A', 3, 1);
