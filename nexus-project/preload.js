/**
 * Preload — Puente seguro IPC  v2
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexus', {
  minimize:    () => ipcRenderer.invoke('window-minimize'),
  maximize:    () => ipcRenderer.invoke('window-maximize'),
  close:       () => ipcRenderer.invoke('window-close'),
  login:       (d)  => ipcRenderer.invoke('login', d),
  testDB:      ()   => ipcRenderer.invoke('test-db'),
  serverStart:  (k) => ipcRenderer.invoke('server-start', k),
  serverStop:   (k) => ipcRenderer.invoke('server-stop', k),
  allStatus:    ()  => ipcRenderer.invoke('all-server-status'),
  updatePath:   (d) => ipcRenderer.invoke('update-app-path', d),
  openExternal: (u) => ipcRenderer.invoke('open-external', u),
  showInFolder: (p) => ipcRenderer.invoke('show-in-folder', p),
  getGrados:     (d) => ipcRenderer.invoke('get-grados', d),
  getGrupos:     (d) => ipcRenderer.invoke('get-grupos', d),
  getActividades:(d) => ipcRenderer.invoke('get-actividades', d),
  getNotas:      (f) => ipcRenderer.invoke('get-notas', f),
  getResumen:    (f) => ipcRenderer.invoke('get-resumen-estudiantes', f),
  updateNota:    (d) => ipcRenderer.invoke('update-nota', d),
  getNotasEscape:      (f) => ipcRenderer.invoke('get-notas-escape', f),
  getActividadesEscape:()  => ipcRenderer.invoke('get-actividades-escape'),
  getNotasUnificadas:  (f) => ipcRenderer.invoke('get-notas-unificadas', f),
  exportExcel: (d) => ipcRenderer.invoke('export-excel', d),
  exportPDF:   (d) => ipcRenderer.invoke('export-pdf', d),
  getNotasEvaluaciones:      (f) => ipcRenderer.invoke('get-notas-evaluaciones', f),
  getActividadesEvaluaciones:()  => ipcRenderer.invoke('get-actividades-evaluaciones'),
  onServerLog:     (cb) => ipcRenderer.on('server-log',     (_e, d) => cb(d)),
  onServerStopped: (cb) => ipcRenderer.on('server-stopped', (_e, d) => cb(d)),
  removeAll:       (ch) => ipcRenderer.removeAllListeners(ch),

  // ── Nexus Misiones: Progreso secuencial + Evaluaciones IA ────
  nexusUpdateReto:     (d) => ipcRenderer.invoke('nexus-update-reto',     d),
  nexusGetUnlocked:    (d) => ipcRenderer.invoke('nexus-get-unlocked',    d),
  nexusSaveEvaluacion: (d) => ipcRenderer.invoke('nexus-save-evaluacion', d),
  getNotasNexus:       (f) => ipcRenderer.invoke('get-notas-nexus',       f),
  getProgresoNexus:    (f) => ipcRenderer.invoke('get-progreso-nexus',    f),
});
