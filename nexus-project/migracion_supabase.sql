-- =============================================================
-- NEXUS SABANETA — Script de Migración Supabase
-- I.E. de Sabaneta · Fabio Alberto Ortiz M.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- =============================================================

-- ── 1. DOCENTES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS docentes (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombres       TEXT NOT NULL,
  apellidos     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  asignatura    TEXT DEFAULT '',
  clave         TEXT NOT NULL,  -- bcrypt hash, nunca texto plano
  fecha_registro TIMESTAMPTZ DEFAULT now()
);

-- ── 2. ESTUDIANTES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estudiantes (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombres        TEXT NOT NULL,
  apellidos      TEXT NOT NULL,
  grado          TEXT NOT NULL,
  grupo          TEXT NOT NULL,
  docente_id     UUID REFERENCES docentes(id) ON DELETE SET NULL,
  fecha_registro TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estudiantes_grado_grupo ON estudiantes(grado, grupo);
CREATE INDEX IF NOT EXISTS idx_estudiantes_docente ON estudiantes(docente_id);

-- ── 3. NEXUS_MISIONES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nexus_misiones (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  docente_id     TEXT NOT NULL,
  docente_nombre TEXT DEFAULT '',
  title          TEXT NOT NULL,
  icon           TEXT DEFAULT '🎯',
  color          TEXT DEFAULT '#00b4d8',
  description    TEXT DEFAULT '',
  retos          JSONB DEFAULT '[]',   -- [{id, title, descripcion, duracion_seg, tipo_duracion}]
  grados         JSONB DEFAULT '[]',   -- ["6", "7", "8"]
  colaboradores  TEXT DEFAULT '[]',    -- JSON array de docente_ids
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_misiones_docente ON nexus_misiones(docente_id);

-- ── 4. NEXUS_PROGRESO ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nexus_progreso (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  estudiante_id     TEXT NOT NULL,
  nombre_estudiante TEXT DEFAULT '',
  grado             TEXT DEFAULT '',
  grupo             TEXT DEFAULT '',
  xp_total          INTEGER DEFAULT 0,
  nota              NUMERIC(3,1) DEFAULT 1.0,
  nivel             INTEGER DEFAULT 1,
  mision_id         UUID REFERENCES nexus_misiones(id) ON DELETE SET NULL,
  equipo_nombre     TEXT,              -- columna opcional para equipos
  updated_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (estudiante_id, mision_id)   -- CRÍTICO: permite upsert por conflicto
);

CREATE INDEX IF NOT EXISTS idx_progreso_estudiante ON nexus_progreso(estudiante_id);
CREATE INDEX IF NOT EXISTS idx_progreso_mision ON nexus_progreso(mision_id);

-- ── 5. NEXUS_CHATS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nexus_chats (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  estudiante_id     TEXT NOT NULL,
  nombre_estudiante TEXT DEFAULT '',
  mision_id         UUID REFERENCES nexus_misiones(id) ON DELETE SET NULL,
  mision_title      TEXT,
  reto_id           TEXT,
  role              TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content           TEXT NOT NULL,
  xp_at_time        INTEGER DEFAULT 0,
  equipo_nombre     TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chats_estudiante ON nexus_chats(estudiante_id);
CREATE INDEX IF NOT EXISTS idx_chats_mision ON nexus_chats(mision_id);
CREATE INDEX IF NOT EXISTS idx_chats_equipo ON nexus_chats(equipo_nombre) WHERE equipo_nombre IS NOT NULL;

-- ── 6. NEXUS_TIMERS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nexus_timers (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  estudiante_id TEXT NOT NULL,
  reto_id       TEXT NOT NULL,
  mision_id     TEXT NOT NULL DEFAULT '',
  inicio_ts     BIGINT NOT NULL,       -- timestamp UNIX ms. -777 = sentinel de bloqueo docente
  duracion_seg  INTEGER NOT NULL,      -- duración total del timer en segundos
  updated_at    TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (estudiante_id, reto_id, mision_id)   -- CRÍTICO: permite upsert por conflicto
);

CREATE INDEX IF NOT EXISTS idx_timers_estudiante ON nexus_timers(estudiante_id);

-- ── 7. NEXUS_ANUNCIOS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nexus_anuncios (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  docente_id     TEXT NOT NULL,
  docente_nombre TEXT DEFAULT '',
  mensaje        TEXT NOT NULL,
  grado          TEXT,                 -- NULL = todos los grados
  grupo          TEXT,                 -- NULL = todos los grupos
  prioridad      TEXT DEFAULT 'normal' CHECK (prioridad IN ('normal', 'importante', 'urgente')),
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anuncios_docente ON nexus_anuncios(docente_id);

-- =============================================================
-- DATOS INICIALES — Docente admin
-- IMPORTANTE: Reemplaza 'TU_PASSWORD_AQUI' con tu contraseña real.
-- Para generar el hash bcrypt de tu contraseña, ejecuta en la terminal:
--   node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('miClave123', 10).then(h => console.log(h));"
-- Luego pega el hash generado en el campo 'clave' abajo.
-- =============================================================

-- INSERT INTO docentes (nombres, apellidos, email, asignatura, clave)
-- VALUES (
--   'Fabio Alberto',
--   'Ortiz M.',
--   'fabioortiz37422@sabaneta.edu.co',
--   'Tecnología e Informática',
--   '$2b$10$REEMPLAZA_CON_TU_HASH_BCRYPT'  -- ← genera con el comando de arriba
-- );

-- =============================================================
-- VERIFICACIÓN — Ejecuta esto al final para confirmar las tablas
-- =============================================================
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('docentes','estudiantes','nexus_misiones','nexus_progreso','nexus_chats','nexus_timers','nexus_anuncios')
ORDER BY table_name;
