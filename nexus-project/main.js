/**
 * NEXUS HUB — Proceso Principal Electron  v2
 * Centro de Control Educativo · I.E. Sabaneta
 * Prof. Fabio Alberto Ortiz M.
 *
 * NUEVO v2:
 *  ✅ Doble BD: evaluaciones_db + escapeedu
 *  ✅ Exportar notas a PDF (Electron printToPDF)
 *  ✅ Exportar notas a Excel profesional con colores
 *  ✅ Editar / corregir nota de estudiante
 *  ✅ Vista unificada o separada por origen
 */

require('dotenv').config();
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path   = require('path');
const { spawn } = require('child_process');
const { Pool }  = require('pg');
const bcrypt    = require('bcryptjs');
const ExcelJS   = require('exceljs');
const fs        = require('fs');

// ══════════════════════════════════════════════════════════════
// CONFIG APPS
// ══════════════════════════════════════════════════════════════
const APPS_CONFIG = {
  kahoot: {
    nombre: 'Kahoot STEM+', icon: '🎮', color: '#4f7ef7', port: 3003,
    cwd:  process.env.KAHOOT_PATH  || 'C:\\AplicacionesAcademicas\\kahoot',
    cmd: 'node', args: ['server.js'],
    url: () => `http://localhost:${APPS_CONFIG.kahoot.port}`,
    pid: null, proceso: null,
  },
  evaluaciones: {
    nombre: 'Evaluaciones Saber', icon: '📝', color: '#00d4aa', port: 3001,
    cwd:  process.env.EVAL_PATH    || 'C:\\AplicacionesAcademicas\\evaluaciones-saber-app',
    cmd: 'node', args: ['server.js'],
    url: () => `http://localhost:${APPS_CONFIG.evaluaciones.port}`,
    pid: null, proceso: null,
  },
  escapeedu: {
    nombre: 'EscapeEdu', icon: '🔐', color: '#fd9644', port: 3002,
    cwd:  process.env.ESCAPE_PATH  || 'C:\\AplicacionesAcademicas\\escapeedu',
    cmd: 'node', args: ['server.js'],
    url: () => `http://localhost:${APPS_CONFIG.escapeedu.port}`,
    pid: null, proceso: null,
  },
  nexus: {
    nombre: 'Nexus Sabaneta', icon: '🌐', color: '#a29bfe', port: null,
    cwd: null, cmd: null, args: [],
    url: () => 'https://nexus-sabaneta-gamma.vercel.app/',
    pid: null, proceso: null,
  },
};

// ══════════════════════════════════════════════════════════════
// POOLS PostgreSQL — evaluaciones_db  +  escapeedu
// ══════════════════════════════════════════════════════════════
const EVAL_CFG = {
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'evaluaciones_db',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '040803',
  max: 3, idleTimeoutMillis: 20000, connectionTimeoutMillis: 6000,
};

const ESCAPE_CFG = {
  host:     process.env.ESCAPE_DB_HOST     || process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.ESCAPE_DB_PORT || process.env.DB_PORT || '5432'),
  database: process.env.ESCAPE_DB_NAME     || 'escapeedu',
  user:     process.env.ESCAPE_DB_USER     || process.env.DB_USER     || 'postgres',
  password: process.env.ESCAPE_DB_PASSWORD || process.env.DB_PASSWORD || '040803',
  max: 2, idleTimeoutMillis: 20000, connectionTimeoutMillis: 6000,
};

let poolEval   = null;
let poolEscape = null;

function getPoolEval() {
  if (!poolEval) {
    poolEval = new Pool(EVAL_CFG);
    poolEval.on('error', (e) => { console.error('[EVAL DB]', e.message); poolEval = null; });
  }
  return poolEval;
}
function getPoolEscape() {
  if (!poolEscape) {
    poolEscape = new Pool(ESCAPE_CFG);
    poolEscape.on('error', (e) => { console.error('[ESCAPE DB]', e.message); poolEscape = null; });
  }
  return poolEscape;
}

async function qEval(sql, p = [])   { const c = await getPoolEval().connect();   try { return await c.query(sql, p); } finally { c.release(); } }
async function qEscape(sql, p = []) { const c = await getPoolEscape().connect(); try { return await c.query(sql, p); } finally { c.release(); } }

// ══════════════════════════════════════════════════════════════
// VENTANA
// ══════════════════════════════════════════════════════════════
let mainWindow = null;
let pdfWindow  = null;   // ventana oculta para generar PDFs

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1100, minHeight: 700,
    title: 'Nexus Hub — Centro de Control Educativo · I.E. Sabaneta',
    backgroundColor: '#080c18',
    frame: false, titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      webSecurity: false,          // evita bloqueos CSP locales en Electron
      allowRunningInsecureContent: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // FIX F12: before-input-event es más confiable que globalShortcut con frame:false
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('✅ Nexus Hub cargado correctamente');
  });
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('❌ Error cargando renderer:', errorCode, errorDescription);
  });
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('❌ Render process gone:', details.reason);
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (pdfWindow && !pdfWindow.isDestroyed()) pdfWindow.destroy();
    Object.values(APPS_CONFIG).forEach(a => { if (a.proceso) { a.proceso.kill(); a.proceso = null; } });
  });
}

app.whenReady().then(async () => {
  createWindow();
  await initNexusTables();
  // F12 = DevTools para debugging
  const { globalShortcut } = require('electron');
  globalShortcut.register('F12', () => {
    if (mainWindow) mainWindow.webContents.toggleDevTools();
  });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── Ventana/titlebar ──────────────────────────────────────────
ipcMain.handle('window-minimize', () => mainWindow?.minimize());
ipcMain.handle('window-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.handle('window-close',    () => mainWindow?.close());

// ══════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════
ipcMain.handle('login', async (_e, { email, clave }) => {
  try {
    const { rows } = await qEval('SELECT * FROM docentes WHERE TRIM(LOWER(email))=TRIM(LOWER($1))', [email]);
    const d = rows[0];
    if (!d) return { success: false, error: 'Email no encontrado' };
    let ok = false;
    try { ok = await bcrypt.compare(clave, d.clave); } catch { ok = d.clave === clave; }
    if (!ok && d.clave !== clave) return { success: false, error: 'Contraseña incorrecta' };
    const isAdmin = d.email.toLowerCase().includes('fabioortiz') || d.id === 1;
    return { success: true, docente: { id: d.id, nombres: d.nombres, apellidos: d.apellidos, email: d.email, isAdmin } };
  } catch (err) { return { success: false, error: 'Error DB: ' + err.message }; }
});

ipcMain.handle('test-db', async () => {
  const r = { eval: false, escape: false };
  try { await qEval('SELECT 1'); r.eval = true; } catch {}
  try { await qEscape('SELECT 1'); r.escape = true; } catch {}
  return r;
});

// ══════════════════════════════════════════════════════════════
// SERVIDORES
// ══════════════════════════════════════════════════════════════
ipcMain.handle('server-start', (_e, key) => new Promise(resolve => {
  const cfg = APPS_CONFIG[key];
  if (!cfg?.cmd)    return resolve({ ok: false, error: 'App no local' });
  if (cfg.proceso)  return resolve({ ok: false, error: 'Ya corriendo' });
  if (!fs.existsSync(cfg.cwd)) return resolve({ ok: false, error: `Ruta no encontrada: ${cfg.cwd}` });

  const proc = spawn(cfg.cmd, cfg.args, { cwd: cfg.cwd, shell: true, detached: false });
  cfg.proceso = proc; cfg.pid = proc.pid;
  let started = false;
  const t = setTimeout(() => { if (!started) { started = true; resolve({ ok: true, pid: proc.pid, msg: `${cfg.nombre} iniciado` }); } }, 2500);

  proc.stdout.on('data', d => {
    const msg = d.toString();
    mainWindow?.webContents.send('server-log', { key, msg, type: 'info' });
    if (!started && /listen|300[0-9]/.test(msg)) { started = true; clearTimeout(t); resolve({ ok: true, pid: proc.pid, msg: `${cfg.nombre} listo (:${cfg.port})` }); }
  });
  proc.stderr.on('data', d => mainWindow?.webContents.send('server-log', { key, msg: d.toString(), type: 'error' }));
  proc.on('error', err => { cfg.proceso = null; cfg.pid = null; if (!started) { started = true; clearTimeout(t); resolve({ ok: false, error: err.message }); } });
  proc.on('exit', code => { cfg.proceso = null; cfg.pid = null; mainWindow?.webContents.send('server-stopped', { key, code }); });
}));

ipcMain.handle('server-stop', (_e, key) => {
  const cfg = APPS_CONFIG[key];
  if (!cfg?.proceso) return { ok: false, error: 'No corriendo' };
  cfg.proceso.kill('SIGTERM'); cfg.proceso = null; cfg.pid = null;
  return { ok: true, msg: `${cfg.nombre} detenido` };
});

ipcMain.handle('all-server-status', () => {
  const r = {};
  for (const [k, c] of Object.entries(APPS_CONFIG))
    r[k] = { running: !!c.proceso, pid: c.pid, port: c.port, nombre: c.nombre, icon: c.icon, color: c.color, url: c.url() };
  return r;
});

ipcMain.handle('update-app-path', (_e, { appKey, newPath }) => {
  if (APPS_CONFIG[appKey]) { APPS_CONFIG[appKey].cwd = newPath; return { ok: true }; }
  return { ok: false };
});

ipcMain.handle('open-external', (_e, url) => { shell.openExternal(url); return { ok: true }; });

// ══════════════════════════════════════════════════════════════
// DATOS — evaluaciones_db (Kahoot)
// ══════════════════════════════════════════════════════════════
ipcMain.handle('get-grados', async () => {
  try { const { rows } = await qEval('SELECT DISTINCT grado FROM estudiantes WHERE grado IS NOT NULL ORDER BY grado'); return { ok: true, data: rows.map(r => r.grado) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('get-grupos', async (_e, { grado }) => {
  try { const { rows } = await qEval('SELECT DISTINCT grupo FROM estudiantes WHERE grado=$1 AND grupo IS NOT NULL ORDER BY grupo', [grado]); return { ok: true, data: rows.map(r => r.grupo) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('get-actividades', async (_e, { docenteId }) => {
  try {
    const sql = docenteId
      ? `SELECT DISTINCT titulo_presentacion AS titulo FROM calificaciones_kahoot
         WHERE titulo_presentacion IN (SELECT titulo FROM presentaciones WHERE docente_id=$1) ORDER BY titulo_presentacion`
      : `SELECT DISTINCT titulo_presentacion AS titulo FROM calificaciones_kahoot ORDER BY titulo_presentacion`;
    const { rows } = await qEval(sql, docenteId ? [docenteId] : []);
    return { ok: true, data: rows };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('get-notas', async (_e, filtros) => {
  try {
    const { grado, grupo, actividad, fechaDesde, fechaHasta, docenteId } = filtros || {};
    const cond = []; const params = []; let pi = 1;
    if (grado)      { cond.push(`e.grado=$${pi++}`);        params.push(grado); }
    if (grupo)      { cond.push(`e.grupo=$${pi++}`);        params.push(grupo); }
    if (actividad)  { cond.push(`c.titulo_presentacion ILIKE $${pi++}`); params.push(`%${actividad}%`); }
    if (fechaDesde) { cond.push(`c.fecha>=$${pi++}`);  params.push(fechaDesde); }
    if (fechaHasta) { cond.push(`c.fecha<=$${pi++}`);  params.push(fechaHasta + ' 23:59:59'); }
    if (docenteId)  {
      cond.push(`c.titulo_presentacion IN (SELECT titulo FROM presentaciones WHERE docente_id=$${pi++})`);
      params.push(docenteId);
    }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const sql = `
      SELECT e.id AS estudiante_id, e.nombres, e.apellidos, e.grado, e.grupo,
             c.id AS calificacion_id,
             c.titulo_presentacion AS actividad, c.nota,
             NULL::numeric AS porcentaje,
             0 AS correctas, 0 AS total, 0 AS puntos, 0 AS posicion,
             c.modo,
             TO_CHAR(c.fecha,'DD/MM/YYYY HH24:MI') AS fecha,
             COALESCE(p.tipo_juego,'kahoot') AS tipo_juego,
             'kahoot' AS origen
      FROM calificaciones_kahoot c
      JOIN estudiantes e ON c.estudiante_id=e.id
      LEFT JOIN presentaciones p ON p.titulo=c.titulo_presentacion
      ${where}
      ORDER BY e.grado,e.grupo,e.apellidos,e.nombres,c.fecha DESC`;
    const { rows } = await qEval(sql, params);
    return { ok: true, data: rows };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ── EDITAR NOTA (evaluaciones_db) ────────────────────────────
ipcMain.handle('update-nota', async (_e, { calificacionId, nuevaNota, motivo, docenteId }) => {
  try {
    const nota = parseFloat(nuevaNota);
    if (isNaN(nota) || nota < 1.0 || nota > 5.0) return { ok: false, error: 'Nota debe estar entre 1.0 y 5.0' };
    // Guardar en calificaciones_kahoot
    await qEval(`UPDATE calificaciones_kahoot SET nota=$1 WHERE id=$2`, [nota, calificacionId]);
    // Registrar en log de cambios (tabla que creamos si no existe)
    await qEval(`
      CREATE TABLE IF NOT EXISTS log_cambios_notas (
        id SERIAL PRIMARY KEY,
        calificacion_id INTEGER,
        nota_anterior NUMERIC,
        nota_nueva NUMERIC,
        motivo TEXT,
        docente_id INTEGER,
        fecha TIMESTAMP DEFAULT NOW()
      )`);
    await qEval(`INSERT INTO log_cambios_notas(calificacion_id,nota_nueva,motivo,docente_id) VALUES($1,$2,$3,$4)`,
      [calificacionId, nota, motivo || 'Corrección manual', docenteId]);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ── RESUMEN POR ESTUDIANTE ────────────────────────────────────
ipcMain.handle('get-resumen-estudiantes', async (_e, filtros) => {
  try {
    const { grado, grupo, docenteId } = filtros || {};
    const cond = [`c.estudiante_id IS NOT NULL`]; const params = []; let pi = 1;
    if (grado) { cond.push(`e.grado=$${pi++}`); params.push(grado); }
    if (grupo) { cond.push(`e.grupo=$${pi++}`); params.push(grupo); }
    if (docenteId) {
      cond.push(`c.titulo_presentacion IN (SELECT titulo FROM presentaciones WHERE docente_id=$${pi++})`);
      params.push(docenteId);
    }
    const where = `WHERE ${cond.join(' AND ')}`;
    const sql = `
      SELECT e.id AS estudiante_id, e.nombres, e.apellidos, e.grado, e.grupo,
             COUNT(c.id) AS total_actividades,
             ROUND(AVG(c.nota)::numeric,2) AS promedio_simple,
             ROUND(MAX(c.nota)::numeric,2) AS nota_maxima,
             ROUND(MIN(c.nota)::numeric,2) AS nota_minima,
             0 AS total_correctas,
             0 AS total_preguntas,
             ROUND(AVG(c.nota)::numeric,2) AS nota_global,
             STRING_AGG(c.titulo_presentacion||':'||ROUND(c.nota::numeric,1),' | ' ORDER BY c.fecha) AS detalle_actividades
      FROM calificaciones_kahoot c
      JOIN estudiantes e ON c.estudiante_id=e.id
      ${where}
      GROUP BY e.id,e.nombres,e.apellidos,e.grado,e.grupo
      ORDER BY e.grado,e.grupo,e.apellidos,e.nombres`;
    const { rows } = await qEval(sql, params);
    return { ok: true, data: rows };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ══════════════════════════════════════════════════════════════
// DATOS — escapeedu (segunda BD)
// Estructura detectada: notas, partidas, escape_rooms,
//   intentos, equipos, miembros_equipo, pantallas
// ══════════════════════════════════════════════════════════════
ipcMain.handle('get-notas-escape', async (_e, filtros) => {
  try {
    const { grado, grupo, actividad, fechaDesde, fechaHasta } = filtros || {};

    // Primero detectar estructura de la tabla notas en escapeedu
    const { rows: cols } = await qEscape(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='notas' AND table_schema='public' ORDER BY ordinal_position`);
    const colNames = cols.map(c => c.column_name);

    // Construir query adaptativo según columnas disponibles
    // Columnas típicas: id, partida_id, equipo_id/estudiante_id, nota, porcentaje, created_at
    const tieneEstId  = colNames.includes('estudiante_id');
    const tieneEquipo = colNames.includes('equipo_id');
    const tieneNota   = colNames.includes('nota');
    const tienePct    = colNames.includes('porcentaje');
    const tienePartida= colNames.includes('partida_id');

    let sql = '';
    const params = []; const cond = []; let pi = 1;

    if (tieneEstId) {
      // Tiene FK directa a estudiante
      sql = `
        SELECT
          e.id AS estudiante_id,
          e.nombres, e.apellidos, e.grado, e.grupo,
          n.id AS calificacion_id,
          COALESCE(er.nombre, p.escape_room_id::text, 'EscapeEdu') AS actividad,
          ${tieneNota   ? 'n.nota'       : '0'} AS nota,
          ${tienePct    ? 'n.porcentaje' : '0'} AS porcentaje,
          0 AS correctas, 0 AS total, 0 AS puntos, 0 AS posicion,
          'individual' AS modo,
          TO_CHAR(n.created_at,'DD/MM/YYYY HH24:MI') AS fecha,
          'escape_room' AS tipo_juego,
          'escapeedu' AS origen
        FROM notas n
        JOIN estudiantes_escape e ON n.estudiante_id=e.id
        ${tienePartida ? 'LEFT JOIN partidas p ON n.partida_id=p.id' : ''}
        ${tienePartida ? 'LEFT JOIN escape_rooms er ON p.escape_room_id=er.id' : ''}`;
    } else if (tieneEquipo) {
      // A través de equipos/miembros
      sql = `
        SELECT
          me.estudiante_nombre AS nombres,
          '' AS apellidos,
          '' AS grado, '' AS grupo,
          n.id AS calificacion_id,
          COALESCE(er.nombre,'EscapeEdu') AS actividad,
          ${tieneNota ? 'n.nota' : '0'} AS nota,
          ${tienePct  ? 'n.porcentaje' : '0'} AS porcentaje,
          0 AS correctas, 0 AS total, 0 AS puntos, 0 AS posicion,
          'equipo' AS modo,
          TO_CHAR(n.created_at,'DD/MM/YYYY HH24:MI') AS fecha,
          'escape_room' AS tipo_juego,
          'escapeedu' AS origen
        FROM notas n
        JOIN equipos eq ON n.equipo_id=eq.id
        LEFT JOIN miembros_equipo me ON me.equipo_id=eq.id
        ${tienePartida ? 'LEFT JOIN partidas p ON n.partida_id=p.id' : ''}
        ${tienePartida ? 'LEFT JOIN escape_rooms er ON p.escape_room_id=er.id' : ''}`;
    } else {
      // Fallback: leer notas tal como están
      sql = `
        SELECT
          NULL AS estudiante_id,
          COALESCE(n.nombre_participante,'–') AS nombres,
          '' AS apellidos, '' AS grado, '' AS grupo,
          n.id AS calificacion_id,
          'EscapeEdu' AS actividad,
          ${tieneNota ? 'n.nota' : '0'} AS nota,
          ${tienePct  ? 'n.porcentaje' : '0'} AS porcentaje,
          0 AS correctas, 0 AS total, 0 AS puntos, 0 AS posicion,
          'individual' AS modo,
          TO_CHAR(n.created_at,'DD/MM/YYYY HH24:MI') AS fecha,
          'escape_room' AS tipo_juego,
          'escapeedu' AS origen
        FROM notas n`;
    }

    // Agregar filtros de fecha si se piden
    if (fechaDesde) { cond.push(`n.created_at>=$${pi++}`); params.push(fechaDesde); }
    if (fechaHasta) { cond.push(`n.created_at<=$${pi++}`); params.push(fechaHasta + ' 23:59:59'); }

    if (cond.length) sql += ` WHERE ${cond.join(' AND ')}`;
    sql += ` ORDER BY n.created_at DESC LIMIT 500`;

    const { rows } = await qEscape(sql, params);

    // Filtros del lado Node.js para grado/grupo/actividad (evita complejidad SQL cross-table)
    let data = rows;
    if (grado)    data = data.filter(r => r.grado     === grado);
    if (grupo)    data = data.filter(r => r.grupo     === grupo);
    if (actividad)data = data.filter(r => (r.actividad||'').toLowerCase().includes(actividad.toLowerCase()));

    return { ok: true, data, columnas: colNames };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Actividades EscapeEdu
ipcMain.handle('get-actividades-escape', async () => {
  try {
    const { rows } = await qEscape(`
      SELECT DISTINCT nombre FROM escape_rooms WHERE nombre IS NOT NULL ORDER BY nombre
      LIMIT 50`);
    return { ok: true, data: rows.map(r => ({ titulo: r.nombre, origen: 'escapeedu' })) };
  } catch (e) {
    return { ok: false, error: e.message, data: [] };
  }
});

// ══════════════════════════════════════════════════════════════
// NOTAS UNIFICADAS (kahoot + escapeedu)
// ══════════════════════════════════════════════════════════════
ipcMain.handle('get-notas-unificadas', async (_e, filtros) => {
  const results = { kahoot: [], escape: [], errores: [] };

  // Kahoot
  try {
    const r = await ipcMain.emit; // workaround — llamar directo la función
    const { grado, grupo, actividad, fechaDesde, fechaHasta, docenteId } = filtros || {};
    const cond = []; const params = []; let pi = 1;
    if (grado)     { cond.push(`e.grado=$${pi++}`);       params.push(grado); }
    if (grupo)     { cond.push(`e.grupo=$${pi++}`);       params.push(grupo); }
    if (docenteId) {
      cond.push(`c.titulo_presentacion IN (SELECT titulo FROM presentaciones WHERE docente_id=$${pi++})`);
      params.push(docenteId);
    }
    if (fechaDesde){ cond.push(`c.created_at>=$${pi++}`); params.push(fechaDesde); }
    if (fechaHasta){ cond.push(`c.created_at<=$${pi++}`); params.push(fechaHasta + ' 23:59:59'); }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const { rows } = await qEval(`
      SELECT e.id AS estudiante_id, e.nombres, e.apellidos, e.grado, e.grupo,
             c.id AS calificacion_id,
             c.titulo_presentacion AS actividad, c.nota,
             NULL::numeric AS porcentaje,
             0 AS correctas, 0 AS total, 0 AS puntos, 0 AS posicion,
             c.modo,
             TO_CHAR(c.fecha,'DD/MM/YYYY HH24:MI') AS fecha,
             COALESCE(p.tipo_juego,'kahoot') AS tipo_juego, 'kahoot' AS origen
      FROM calificaciones_kahoot c
      JOIN estudiantes e ON c.estudiante_id=e.id
      LEFT JOIN presentaciones p ON p.titulo=c.titulo_presentacion
      ${where} ORDER BY e.apellidos,e.nombres,c.created_at DESC`, params);
    results.kahoot = rows;
  } catch (e) { results.errores.push('kahoot: ' + e.message); }

  // EscapeEdu
  try {
    const { rows: cols } = await qEscape(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='notas' AND table_schema='public'`);
    const cn = cols.map(c => c.column_name);
    const tieneNota = cn.includes('nota');
    const tienePct  = cn.includes('porcentaje');

    const { rows } = await qEscape(`
      SELECT NULL AS estudiante_id,
             COALESCE(n.nombre_participante,'Equipo') AS nombres,
             '' AS apellidos, '' AS grado, '' AS grupo,
             n.id AS calificacion_id,
             COALESCE(er.nombre,'EscapeEdu') AS actividad,
             ${tieneNota ? 'n.nota' : '0'} AS nota,
             ${tienePct  ? 'n.porcentaje' : '0'} AS porcentaje,
             0 AS correctas, 0 AS total, 0 AS puntos, 0 AS posicion,
             'individual' AS modo,
             TO_CHAR(n.created_at,'DD/MM/YYYY HH24:MI') AS fecha,
             'escape_room' AS tipo_juego, 'escapeedu' AS origen
      FROM notas n
      LEFT JOIN partidas p   ON n.partida_id=p.id
      LEFT JOIN escape_rooms er ON p.escape_room_id=er.id
      ORDER BY n.created_at DESC LIMIT 500`);
    results.escape = rows;
  } catch (e) { results.errores.push('escapeedu: ' + e.message); }

  return {
    ok: true,
    kahoot:  results.kahoot,
    escape:  results.escape,
    unified: [...results.kahoot, ...results.escape].sort((a, b) =>
      (a.apellidos || a.nombres || '').localeCompare(b.apellidos || b.nombres || '')
    ),
    errores: results.errores,
  };
});


// ══════════════════════════════════════════════════════════════
// DATOS — evaluaciones_db · Evaluaciones Saber (tabla resultados)
// ══════════════════════════════════════════════════════════════
ipcMain.handle('get-notas-evaluaciones', async (_e, filtros) => {
  try {
    const { grado, grupo, actividad, fechaDesde, fechaHasta, docenteId } = filtros || {};
    const cond = []; const params = []; let pi = 1;
    if (grado)     { cond.push(`e.grado=$${pi++}`);         params.push(grado); }
    if (grupo)     { cond.push(`e.grupo=$${pi++}`);         params.push(grupo); }
    if (actividad) { cond.push(`ev.titulo ILIKE $${pi++}`); params.push('%'+actividad+'%'); }
    // fechaDesde/fechaHasta no aplica (tabla resultados no tiene created_at)
    if (docenteId) { cond.push(`ev.docente_id=$${pi++}`);   params.push(docenteId); }
    const where = cond.length ? 'WHERE '+cond.join(' AND ') : '';
    const sql = `
      SELECT r.id AS calificacion_id, e.id AS estudiante_id,
             e.nombres, e.apellidos, e.grado, e.grupo,
             ev.titulo AS actividad,
             r.nota,
             ROUND((r.respuestas_correctas::numeric/NULLIF(r.total_preguntas,0))*100,1) AS porcentaje,
             r.respuestas_correctas AS correctas,
             r.total_preguntas AS total,
             0 AS puntos, 0 AS posicion, 'evaluacion' AS modo,
             COALESCE(TO_CHAR(r.fecha_presentacion,'DD/MM/YYYY HH24:MI'),'') AS fecha,
             'evaluacion_saber' AS tipo_juego,
             'evaluaciones' AS origen
      FROM resultados r
      JOIN estudiantes e   ON r.estudiante_id=e.id
      JOIN evaluaciones ev ON r.evaluacion_id=ev.id
      ${where}
      ORDER BY e.grado,e.grupo,e.apellidos,e.nombres,r.id DESC`;
    const { rows } = await qEval(sql, params);
    return { ok: true, data: rows };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('get-actividades-evaluaciones', async (_e, args) => {
  try {
    const docenteId = args?.docenteId;
    const sql = docenteId
      ? 'SELECT DISTINCT titulo FROM evaluaciones WHERE docente_id=$1 ORDER BY titulo'
      : 'SELECT DISTINCT titulo FROM evaluaciones ORDER BY titulo';
    const { rows } = await qEval(sql, docenteId ? [docenteId] : []);
    return { ok: true, data: rows.map(r => ({ titulo: r.titulo, origen: 'evaluaciones' })) };
  } catch (e) { return { ok: false, error: e.message, data: [] }; }
});

// ══════════════════════════════════════════════════════════════
// EXPORTAR EXCEL PROFESIONAL
// ══════════════════════════════════════════════════════════════
ipcMain.handle('export-excel', async (_e, { tipo, data, filename, titulo, docenteNombre }) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename || 'reporte_notas.xlsx',
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (!filePath) return { ok: false, cancelled: true };

    const wb = new ExcelJS.Workbook();
    wb.creator  = 'Nexus Hub — I.E. Sabaneta';
    wb.created  = new Date();
    wb.modified = new Date();

    // ── HOJA PRINCIPAL ────────────────────────────────────────
    const ws = wb.addWorksheet(tipo === 'resumen' ? 'Resumen' : 'Notas Detalle', {
      views: [{ state:'frozen', ySplit: 4 }]
    });

    // Portada (filas 1-3)
    const lastColLetter = tipo === 'resumen' ? 'J' : 'L';
    ws.mergeCells(`A1:${lastColLetter}1`);
    const t1 = ws.getCell('A1');
    t1.value     = '🏫  I.E. SABANETA — REGISTRO DE NOTAS';
    t1.fill      = { type:'pattern', pattern:'solid', fgColor:{argb:'FF1E3A6E'} };
    t1.font      = { name:'Calibri', size:16, bold:true, color:{argb:'FFFFFFFF'} };
    t1.alignment = { horizontal:'center', vertical:'middle' };
    ws.getRow(1).height = 36;

    ws.mergeCells(`A2:${lastColLetter}2`);
    const t2 = ws.getCell('A2');
    t2.value     = `${docenteNombre || 'Docente'} · ${titulo || ''} · Exportado: ${new Date().toLocaleDateString('es-CO')}`;
    t2.fill      = { type:'pattern', pattern:'solid', fgColor:{argb:'FF2E5EBF'} };
    t2.font      = { name:'Calibri', size:11, color:{argb:'FFFFFFFF'} };
    t2.alignment = { horizontal:'center', vertical:'middle' };
    ws.getRow(2).height = 24;

    ws.getRow(3).height = 8; // spacer

    // Columnas y encabezados
    if (tipo === 'resumen') {
      ws.columns = [
        { key:'apellidos',          width:22 },
        { key:'nombres',            width:22 },
        { key:'grado',              width:8  },
        { key:'grupo',              width:8  },
        { key:'total_actividades',  width:14 },
        { key:'promedio_simple',    width:12 },
        { key:'nota_global',        width:13 },
        { key:'nota_maxima',        width:11 },
        { key:'nota_minima',        width:11 },
        { key:'detalle_actividades',width:65 },
      ];
      const heads = ['Apellidos','Nombres','Grado','Grupo','Actividades','Promedio','Nota Global','Máxima','Mínima','Detalle por Actividad'];
      const hr = ws.getRow(4);
      heads.forEach((h, i) => {
        const cell = hr.getCell(i + 1);
        cell.value     = h;
        cell.fill      = { type:'pattern', pattern:'solid', fgColor:{argb:'FF0D2137'} };
        cell.font      = { name:'Calibri', size:10, bold:true, color:{argb:'FFE8F0FF'} };
        cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
        cell.border    = { bottom:{style:'medium',color:{argb:'FF3D7BF5'}} };
      });
      hr.height = 28;

      data.forEach((row, i) => {
        const wr  = ws.addRow([row.apellidos, row.nombres, row.grado+'°', row.grupo,
          row.total_actividades, parseFloat(row.promedio_simple),
          parseFloat(row.nota_global)||0, parseFloat(row.nota_maxima),
          parseFloat(row.nota_minima), row.detalle_actividades]);
        const bg   = i % 2 === 0 ? 'FFFFFFFF' : 'FFF0F4FF';
        wr.eachCell(cell => {
          cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:bg} };
          cell.font = { name:'Calibri', size:10 };
          cell.border = { bottom:{style:'thin',color:{argb:'FFDDDDDD'}} };
        });
        // Color de nota
        const prom = parseFloat(row.promedio_simple);
        const nc   = wr.getCell(6);
        const gc   = wr.getCell(7);
        const color = prom >= 4.0 ? 'FF00B894' : prom >= 3.0 ? 'FFFD9644' : 'FFE74C3C';
        [nc, gc].forEach(c => { c.font = { name:'Calibri', size:10, bold:true, color:{argb:color} }; c.numFmt = '0.00'; });
        wr.getCell(8).numFmt = '0.00'; wr.getCell(9).numFmt = '0.00';
        wr.height = 20;
      });

      // Fila de totales
      const totalRow = ws.addRow(['TOTAL / PROMEDIO GENERAL','','','',
        data.length,
        data.length ? +(data.reduce((s,d)=>s+parseFloat(d.promedio_simple||0),0)/data.length).toFixed(2) : 0,
        '', '', '', '']);
      totalRow.eachCell(c => {
        c.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF1E3A6E'} };
        c.font = { name:'Calibri', size:10, bold:true, color:{argb:'FFFFFFFF'} };
      });
      totalRow.height = 22;

    } else {
      // Detalle
      ws.columns = [
        { key:'apellidos',  width:22 }, { key:'nombres',   width:22 },
        { key:'grado',      width:8  }, { key:'grupo',     width:8  },
        { key:'actividad',  width:35 }, { key:'nota',      width:8  },
        { key:'porcentaje', width:8  }, { key:'correctas', width:10 },
        { key:'total',      width:8  }, { key:'posicion',  width:10 },
        { key:'tipo_juego', width:14 }, { key:'fecha',     width:17 },
      ];
      const heads = ['Apellidos','Nombres','Grado','Grupo','Actividad','Nota','%','Correctas','Total','Posición','Tipo Juego','Fecha'];
      const hr    = ws.getRow(4);
      heads.forEach((h, i) => {
        const cell = hr.getCell(i+1);
        cell.value     = h;
        cell.fill      = { type:'pattern', pattern:'solid', fgColor:{argb:'FF0D2137'} };
        cell.font      = { name:'Calibri', size:10, bold:true, color:{argb:'FFE8F0FF'} };
        cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
        cell.border    = { bottom:{style:'medium',color:{argb:'FF3D7BF5'}} };
      });
      hr.height = 28;

      // Agrupar por estudiante visualmente
      let prevEstud = null;
      data.forEach((row, i) => {
        const estud = (row.apellidos||'') + (row.nombres||'');
        const isNew = estud !== prevEstud;
        prevEstud   = estud;
        const bg    = i % 2 === 0 ? 'FFFFFFFF' : 'FFF0F4FF';
        const nota  = parseFloat(row.nota);
        const wr    = ws.addRow([row.apellidos, row.nombres, (row.grado||'')+' °', row.grupo,
          row.actividad, nota, parseFloat(row.porcentaje||0),
          row.correctas, row.total, row.posicion, row.tipo_juego, row.fecha]);
        wr.eachCell(cell => {
          cell.fill   = { type:'pattern', pattern:'solid', fgColor:{argb: isNew ? 'FFFAFBFF' : bg} };
          cell.font   = { name:'Calibri', size:10 };
          cell.border = { bottom:{style:'thin',color:{argb:'FFDDDDDD'}} };
        });
        const nc    = wr.getCell(6);
        const color = nota >= 4.0 ? 'FF00B894' : nota >= 3.0 ? 'FFFD9644' : 'FFE74C3C';
        nc.font     = { name:'Calibri', size:10, bold:true, color:{argb:color} };
        nc.numFmt   = '0.0';
        wr.getCell(7).numFmt = '0.0';
        wr.height   = 20;
        if (isNew) wr.getCell(1).font = { name:'Calibri', size:10, bold:true };
      });
    }

    // ── HOJA ESTADÍSTICAS ─────────────────────────────────────
    const wsS = wb.addWorksheet('📊 Estadísticas');
    wsS.mergeCells('A1:D1');
    wsS.getCell('A1').value = 'ESTADÍSTICAS DEL GRUPO';
    wsS.getCell('A1').fill  = { type:'pattern', pattern:'solid', fgColor:{argb:'FF1E3A6E'} };
    wsS.getCell('A1').font  = { name:'Calibri', size:13, bold:true, color:{argb:'FFFFFFFF'} };
    wsS.getRow(1).height    = 28;
    wsS.columns = [{width:25},{width:15},{width:15},{width:15}];

    const notas = data.map(d => parseFloat(d.nota || d.promedio_simple || 0)).filter(n => n > 0);
    if (notas.length) {
      const prom    = (notas.reduce((a,b)=>a+b,0)/notas.length).toFixed(2);
      const maxN    = Math.max(...notas).toFixed(1);
      const minN    = Math.min(...notas).toFixed(1);
      const aprobados = notas.filter(n=>n>=3.0).length;
      const superior  = notas.filter(n=>n>=4.5).length;
      const alto      = notas.filter(n=>n>=4.0&&n<4.5).length;
      const basicoA   = notas.filter(n=>n>=3.0&&n<4.0).length;
      const bajo      = notas.filter(n=>n<3.0).length;
      const stats = [
        ['INDICADOR','VALOR','',''],
        ['Total registros', notas.length,'',''],
        ['Promedio general', +prom,'',''],
        ['Nota máxima', +maxN,'',''],
        ['Nota mínima', +minN,'',''],
        ['','','',''],
        ['DESEMPEÑO','CANTIDAD','%',''],
        ['Superior (4.5 – 5.0)', superior, (superior/notas.length*100).toFixed(1)+'%',''],
        ['Alto    (4.0 – 4.4)', alto,     (alto/notas.length*100).toFixed(1)+'%',''],
        ['Básico  (3.0 – 3.9)', basicoA,  (basicoA/notas.length*100).toFixed(1)+'%',''],
        ['Bajo    (1.0 – 2.9)', bajo,     (bajo/notas.length*100).toFixed(1)+'%',''],
        ['','','',''],
        ['APROBACIÓN', aprobados+' / '+notas.length, (aprobados/notas.length*100).toFixed(1)+'%',''],
      ];
      stats.forEach((row, i) => {
        const wr = wsS.addRow(row);
        const isSectionHead = row[0]==='INDICADOR'||row[0]==='DESEMPEÑO'||row[0]==='APROBACIÓN';
        wr.eachCell(cell => {
          if (isSectionHead) {
            cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF2E5EBF'} };
            cell.font = { name:'Calibri', size:10, bold:true, color:{argb:'FFFFFFFF'} };
          } else if (row[0]) {
            cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb: i%2===0?'FFFAFBFF':'FFF0F4FF'} };
            cell.font = { name:'Calibri', size:10 };
          }
          cell.border = { bottom:{style:'thin',color:{argb:'FFDDDDDD'}} };
        });
        wr.height = 20;
      });
    }

    await wb.xlsx.writeFile(filePath);
    return { ok: true, filePath };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ══════════════════════════════════════════════════════════════
// EXPORTAR PDF (Electron printToPDF → archivo)
// ══════════════════════════════════════════════════════════════
ipcMain.handle('export-pdf', async (_e, { htmlContent, filename }) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename || 'reporte_notas.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (!filePath) return { ok: false, cancelled: true };

    // Crear ventana invisible para renderizar el HTML
    if (pdfWindow && !pdfWindow.isDestroyed()) pdfWindow.destroy();
    pdfWindow = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });

    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    await new Promise(r => setTimeout(r, 800)); // esperar render

    const pdfData = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape: true,
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
    });

    fs.writeFileSync(filePath, pdfData);
    pdfWindow.destroy(); pdfWindow = null;
    return { ok: true, filePath };
  } catch (e) {
    if (pdfWindow && !pdfWindow.isDestroyed()) { pdfWindow.destroy(); pdfWindow = null; }
    return { ok: false, error: e.message };
  }
});

// Abrir archivo en explorador
ipcMain.handle('show-in-folder', (_e, filePath) => { shell.showItemInFolder(filePath); return { ok: true }; });
