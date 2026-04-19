/**
 * ═══════════════════════════════════════════════════════════════
 * NEXUS — Módulo de Gestión de Equipo (Panel del Estudiante)
 * Prof. Fabio Alberto Ortiz M. · I.E. Sabaneta
 *
 * FUNCIONALIDADES:
 *  ✅ Ver los miembros actuales del equipo
 *  ✅ Agregar compañeros al equipo (por nombre o ID)
 *  ✅ Eliminar compañeros del equipo
 *  ✅ Crear o unirse a un equipo existente
 *  ✅ Cambiar entre modo individual y grupal
 *  ✅ Persiste en sessionStorage y sincroniza con window.__NEXUS_USER__
 *  ✅ Notifica cambios a window.NexusMissions si está activo
 *
 * INTEGRACIÓN:
 *  1. Agregar al HTML del panel del estudiante:
 *     <script src="/nexus-team-manager.js"></script>
 *
 *  2. Mostrar el panel con un botón:
 *     <button onclick="NexusTeam.abrirPanel()">👥 Mi Equipo</button>
 *
 *  3. El usuario debe estar configurado antes de abrir el panel:
 *     window.__NEXUS_USER__ = { id, nombre, grado, grupo, modo, teamId, teamNombre }
 *     // o bien
 *     NexusTeam.setUsuario({ id, nombre, grado, grupo })
 *
 * ESTRUCTURA DE EQUIPO (persistida en sessionStorage):
 *  nexus_team_<teamId> = { id, nombre, miembros: [{id, nombre}] }
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  // ─── ESTADO ──────────────────────────────────────────────────
  const STATE = {
    usuario: null,   // { id, nombre, grado, grupo, modo, teamId, teamNombre }
    equipo: null,    // { id, nombre, miembros: [{id, nombre}] }
  };

  // ─── PERSISTENCIA ────────────────────────────────────────────
  const STORE = {
    keyUsuario: 'nexus_user',
    keyEquipo: (tid) => `nexus_team_${tid}`,

    guardarUsuario() {
      try { sessionStorage.setItem(this.keyUsuario, JSON.stringify(STATE.usuario)); } catch {}
      try { window.__NEXUS_USER__ = STATE.usuario; } catch {}
    },

    guardarEquipo() {
      if (!STATE.equipo) return;
      try { sessionStorage.setItem(this.keyEquipo(STATE.equipo.id), JSON.stringify(STATE.equipo)); } catch {}
    },

    cargarEquipo(teamId) {
      try { return JSON.parse(sessionStorage.getItem(this.keyEquipo(teamId)) || 'null'); } catch { return null; }
    },
  };

  // ─── HELPERS ─────────────────────────────────────────────────
  function genId() {
    return 'team-' + Math.random().toString(36).slice(2, 9);
  }

  function notificarNexusMissions() {
    if (window.NexusMissions?.setUsuario && STATE.usuario) {
      window.NexusMissions.setUsuario({ ...STATE.usuario });
    }
  }

  function toast(msg, tipo = 'info') {
    const existing = document.getElementById('ntm-toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'ntm-toast';
    el.className = `ntm-toast ntm-toast-${tipo}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('visible'), 10);
    setTimeout(() => { el.classList.remove('visible'); setTimeout(() => el.remove(), 350); }, 3000);
  }

  // ─── LÓGICA DE EQUIPO ─────────────────────────────────────────

  function crearEquipo(nombreEquipo) {
    const teamId = genId();
    STATE.equipo = {
      id: teamId,
      nombre: nombreEquipo.trim(),
      miembros: [{ id: STATE.usuario.id, nombre: STATE.usuario.nombre }],
    };
    STATE.usuario.modo = 'grupal';
    STATE.usuario.teamId = teamId;
    STATE.usuario.teamNombre = STATE.equipo.nombre;
    STORE.guardarEquipo();
    STORE.guardarUsuario();
    notificarNexusMissions();
  }

  function unirseEquipo(teamId) {
    const equipo = STORE.cargarEquipo(teamId);
    if (!equipo) return false;
    // Agregar si no está
    const yaEsta = equipo.miembros.some(m => m.id === STATE.usuario.id);
    if (!yaEsta) {
      equipo.miembros.push({ id: STATE.usuario.id, nombre: STATE.usuario.nombre });
    }
    STATE.equipo = equipo;
    STATE.usuario.modo = 'grupal';
    STATE.usuario.teamId = equipo.id;
    STATE.usuario.teamNombre = equipo.nombre;
    STORE.guardarEquipo();
    STORE.guardarUsuario();
    notificarNexusMissions();
    return true;
  }

  function agregarMiembro(idMiembro, nombreMiembro) {
    if (!STATE.equipo) return false;
    if (!idMiembro || !nombreMiembro) return false;
    const yaEsta = STATE.equipo.miembros.some(m => m.id === idMiembro.trim());
    if (yaEsta) return 'duplicado';
    STATE.equipo.miembros.push({ id: idMiembro.trim(), nombre: nombreMiembro.trim() });
    STORE.guardarEquipo();
    notificarNexusMissions();
    return true;
  }

  function eliminarMiembro(idMiembro) {
    if (!STATE.equipo) return;
    if (idMiembro === STATE.usuario.id) return; // no puede eliminarse a sí mismo
    STATE.equipo.miembros = STATE.equipo.miembros.filter(m => m.id !== idMiembro);
    STORE.guardarEquipo();
    notificarNexusMissions();
  }

  function salirDeEquipo() {
    if (!STATE.equipo) return;
    eliminarMiembro(STATE.usuario.id);
    STATE.equipo = null;
    STATE.usuario.modo = 'individual';
    STATE.usuario.teamId = null;
    STATE.usuario.teamNombre = null;
    STORE.guardarUsuario();
    notificarNexusMissions();
  }

  // ─── RENDER DEL PANEL ────────────────────────────────────────

  function renderPanel() {
    document.getElementById('ntm-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ntm-overlay';
    overlay.className = 'ntm-overlay';
    overlay.innerHTML = buildPanelHTML();
    document.body.appendChild(overlay);

    // Cerrar al click fuera del modal
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cerrarPanel();
    });

    // Bind de eventos
    bindEvents();
  }

  function buildPanelHTML() {
    const u = STATE.usuario;
    const eq = STATE.equipo;
    const esGrupal = u?.modo === 'grupal' && eq;

    return `
    <div class="ntm-modal">
      <!-- HEADER -->
      <div class="ntm-header">
        <div>
          <div class="ntm-header-title">👥 Mi Equipo</div>
          <div class="ntm-header-sub">
            ${u ? `${u.nombre} · Grado ${u.grado}° ${u.grupo || ''}` : 'Panel del Estudiante'}
          </div>
        </div>
        <button class="ntm-close" onclick="NexusTeam.cerrarPanel()">✕</button>
      </div>

      <!-- MODO ACTUAL -->
      <div class="ntm-modo-bar">
        <span class="ntm-modo-label">Modo actual:</span>
        <span class="ntm-modo-badge ${esGrupal ? 'grupal' : 'individual'}">
          ${esGrupal ? `👥 Grupal — ${eq.nombre}` : '👤 Individual'}
        </span>
        ${esGrupal ? `<button class="ntm-btn-ghost ntm-btn-salir" onclick="NexusTeam._salir()">Salir del equipo</button>` : ''}
      </div>

      <!-- CUERPO -->
      <div class="ntm-body">

        ${esGrupal ? buildSeccionEquipo(eq) : buildSeccionSinEquipo()}

      </div>

      <!-- ID DEL EQUIPO (para compartir) -->
      ${esGrupal ? `
      <div class="ntm-footer-info">
        <span class="ntm-footer-label">🔑 ID del equipo:</span>
        <code class="ntm-team-id">${eq.id}</code>
        <button class="ntm-btn-copy" onclick="NexusTeam._copiarId('${eq.id}')">Copiar</button>
      </div>` : ''}
    </div>`;
  }

  function buildSeccionEquipo(eq) {
    const miembros = eq.miembros || [];
    const filas = miembros.map(m => {
      const esSelf = m.id === STATE.usuario.id;
      return `
      <div class="ntm-miembro-row ${esSelf ? 'self' : ''}">
        <div class="ntm-miembro-avatar">${m.nombre.charAt(0).toUpperCase()}</div>
        <div class="ntm-miembro-info">
          <span class="ntm-miembro-nombre">${m.nombre}</span>
          ${esSelf ? '<span class="ntm-badge-tu">Tú</span>' : ''}
        </div>
        ${!esSelf ? `
        <button class="ntm-btn-eliminar" onclick="NexusTeam._eliminar('${m.id}')" title="Eliminar del equipo">
          ✕
        </button>` : ''}
      </div>`;
    }).join('');

    return `
    <section class="ntm-section">
      <div class="ntm-section-title">Miembros del equipo <span class="ntm-count">${miembros.length}</span></div>
      <div class="ntm-miembros-list">${filas}</div>
    </section>

    <section class="ntm-section">
      <div class="ntm-section-title">Agregar compañero</div>
      <div class="ntm-agregar-form">
        <div class="ntm-field">
          <label class="ntm-label">Nombre completo</label>
          <input id="ntm-nuevo-nombre" class="ntm-input" type="text" placeholder="Ej: Juan Pérez" maxlength="60" />
        </div>
        <div class="ntm-field">
          <label class="ntm-label">ID del compañero</label>
          <input id="ntm-nuevo-id" class="ntm-input" type="text" placeholder="Ej: est-001 o correo" maxlength="80" />
        </div>
        <button class="ntm-btn-primary" onclick="NexusTeam._agregar()">+ Agregar</button>
      </div>
    </section>`;
  }

  function buildSeccionSinEquipo() {
    return `
    <div class="ntm-tabs">
      <button class="ntm-tab active" onclick="NexusTeam._tab(this,'ntm-tab-crear')">Crear equipo</button>
      <button class="ntm-tab" onclick="NexusTeam._tab(this,'ntm-tab-unirse')">Unirse a equipo</button>
    </div>

    <div id="ntm-tab-crear" class="ntm-tab-panel active">
      <section class="ntm-section">
        <div class="ntm-section-desc">
          Crea un nuevo equipo y comparte el ID con tus compañeros para que se unan.
        </div>
        <div class="ntm-field">
          <label class="ntm-label">Nombre del equipo</label>
          <input id="ntm-nombre-equipo" class="ntm-input" type="text"
            placeholder="Ej: Los Circuitos" maxlength="40" />
        </div>
        <button class="ntm-btn-primary" onclick="NexusTeam._crear()">🚀 Crear equipo</button>
      </section>
    </div>

    <div id="ntm-tab-unirse" class="ntm-tab-panel">
      <section class="ntm-section">
        <div class="ntm-section-desc">
          Ingresa el ID del equipo que tu compañero creó para unirte.
        </div>
        <div class="ntm-field">
          <label class="ntm-label">ID del equipo</label>
          <input id="ntm-join-id" class="ntm-input" type="text"
            placeholder="Ej: team-abc1234" maxlength="40" />
        </div>
        <button class="ntm-btn-primary" onclick="NexusTeam._unirse()">🔗 Unirse</button>
      </section>
    </div>`;
  }

  function bindEvents() {
    // Enter en campos de texto
    ['ntm-nuevo-nombre', 'ntm-nuevo-id'].forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', e => {
        if (e.key === 'Enter') NexusTeam._agregar();
      });
    });
    document.getElementById('ntm-nombre-equipo')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') NexusTeam._crear();
    });
    document.getElementById('ntm-join-id')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') NexusTeam._unirse();
    });
  }

  // ─── ACCIONES EXPUESTAS ───────────────────────────────────────

  function abrirPanel() {
    // Intentar leer usuario si no está configurado
    if (!STATE.usuario) {
      const stored = sessionStorage.getItem('nexus_user');
      if (stored) {
        try { STATE.usuario = JSON.parse(stored); } catch {}
      } else if (window.__NEXUS_USER__) {
        STATE.usuario = window.__NEXUS_USER__;
      }
    }
    // Cargar equipo si aplica
    if (STATE.usuario?.teamId && !STATE.equipo) {
      STATE.equipo = STORE.cargarEquipo(STATE.usuario.teamId);
    }
    renderPanel();
  }

  function cerrarPanel() {
    document.getElementById('ntm-overlay')?.remove();
  }

  // ─── ACCIONES INTERNAS (usadas en el HTML generado) ──────────

  const _acciones = {
    _tab(btn, tabId) {
      document.querySelectorAll('.ntm-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.ntm-tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(tabId)?.classList.add('active');
    },

    _crear() {
      const nombre = document.getElementById('ntm-nombre-equipo')?.value?.trim();
      if (!nombre) { toast('Escribe un nombre para el equipo', 'error'); return; }
      crearEquipo(nombre);
      toast(`✅ Equipo "${nombre}" creado`, 'success');
      renderPanel();
    },

    _unirse() {
      const id = document.getElementById('ntm-join-id')?.value?.trim();
      if (!id) { toast('Ingresa el ID del equipo', 'error'); return; }
      const ok = unirseEquipo(id);
      if (!ok) {
        toast('No se encontró ese equipo. Verifica el ID', 'error');
        return;
      }
      toast(`✅ Te uniste a "${STATE.equipo.nombre}"`, 'success');
      renderPanel();
    },

    _agregar() {
      const nombre = document.getElementById('ntm-nuevo-nombre')?.value?.trim();
      const id = document.getElementById('ntm-nuevo-id')?.value?.trim();
      if (!nombre || !id) { toast('Completa nombre e ID del compañero', 'error'); return; }
      const res = agregarMiembro(id, nombre);
      if (res === 'duplicado') { toast('Ese compañero ya está en el equipo', 'error'); return; }
      if (!res) { toast('Error al agregar compañero', 'error'); return; }
      toast(`✅ ${nombre} agregado al equipo`, 'success');
      renderPanel();
    },

    _eliminar(idMiembro) {
      eliminarMiembro(idMiembro);
      toast('Compañero eliminado del equipo', 'info');
      renderPanel();
    },

    _salir() {
      if (!confirm('¿Seguro que quieres salir del equipo? Pasarás a modo individual.')) return;
      salirDeEquipo();
      toast('Saliste del equipo', 'info');
      renderPanel();
    },

    _copiarId(teamId) {
      navigator.clipboard?.writeText(teamId)
        .then(() => toast('ID copiado al portapapeles 📋', 'success'))
        .catch(() => toast(`ID: ${teamId}`, 'info'));
    },
  };

  // ─── ESTILOS ─────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('ntm-styles')) return;
    const style = document.createElement('style');
    style.id = 'ntm-styles';
    style.textContent = `
/* ═══ NEXUS TEAM MANAGER ═══════════════════════════════════════ */

/* Overlay */
.ntm-overlay {
  position: fixed; inset: 0; z-index: 99999;
  background: rgba(5,10,25,0.90); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  animation: ntmFade .22s ease;
}
@keyframes ntmFade { from{opacity:0} to{opacity:1} }

/* Modal */
.ntm-modal {
  background: #0d1b2a;
  border: 1px solid #1e3a5f;
  border-radius: 20px;
  width: min(520px, 96vw);
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 30px 80px #000c;
  animation: ntmSlide .25s ease;
}
@keyframes ntmSlide { from{transform:translateY(16px);opacity:0} to{transform:none;opacity:1} }
.ntm-modal::-webkit-scrollbar { width: 5px; }
.ntm-modal::-webkit-scrollbar-track { background: transparent; }
.ntm-modal::-webkit-scrollbar-thumb { background: #1e3a5f; border-radius: 3px; }

/* Header */
.ntm-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 22px 26px 18px;
  background: linear-gradient(135deg,#0f2744,#1a3a6b);
  border-radius: 20px 20px 0 0;
}
.ntm-header-title { font-size: 1.15rem; font-weight: 700; color: #e0f0ff; }
.ntm-header-sub { font-size: .8rem; color: #7eb3ff; margin-top: 4px; }
.ntm-close {
  background: none; border: none; color: #7eb3ff; font-size: 1.2rem;
  cursor: pointer; padding: 2px 6px; border-radius: 6px; transition: all .2s;
  line-height: 1;
}
.ntm-close:hover { background: #1e3a5f; color: #e0f0ff; }

/* Barra de modo */
.ntm-modo-bar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 12px 26px;
  background: #09172a;
  border-bottom: 1px solid #1e3a5f;
}
.ntm-modo-label { font-size: .78rem; color: #7eb3ff; text-transform: uppercase; letter-spacing: .06em; }
.ntm-modo-badge {
  font-size: .82rem; font-weight: 600; padding: 4px 12px;
  border-radius: 20px;
}
.ntm-modo-badge.grupal  { background: #0a2b22; color: #00d4aa; border: 1px solid #00d4aa44; }
.ntm-modo-badge.individual { background: #1a2a40; color: #7eb3ff; border: 1px solid #3d7bf544; }

/* Body */
.ntm-body { padding: 20px 26px; display: flex; flex-direction: column; gap: 20px; }

/* Secciones */
.ntm-section { display: flex; flex-direction: column; gap: 12px; }
.ntm-section-title {
  font-size: .82rem; font-weight: 700; color: #7eb3ff;
  text-transform: uppercase; letter-spacing: .07em;
  display: flex; align-items: center; gap: 8px;
}
.ntm-section-desc { font-size: .85rem; color: #6a8fa8; line-height: 1.55; }
.ntm-count {
  background: #1e3a5f; color: #a0c4e8; font-size: .75rem;
  padding: 2px 8px; border-radius: 20px;
}

/* Lista de miembros */
.ntm-miembros-list { display: flex; flex-direction: column; gap: 8px; }
.ntm-miembro-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; border-radius: 12px;
  background: #0a1e35; border: 1px solid #1e3a5f;
  transition: border-color .2s;
}
.ntm-miembro-row.self { border-color: #00d4aa44; background: #071d14; }
.ntm-miembro-row:hover { border-color: #2a5080; }
.ntm-miembro-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: linear-gradient(135deg,#1a3a6b,#0f2744);
  border: 2px solid #2a5080;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: .95rem; color: #7eb3ff;
  flex-shrink: 0;
}
.ntm-miembro-row.self .ntm-miembro-avatar {
  background: linear-gradient(135deg,#0a2b22,#0f3a2e);
  border-color: #00d4aa44; color: #00d4aa;
}
.ntm-miembro-info { flex: 1; display: flex; align-items: center; gap: 8px; }
.ntm-miembro-nombre { font-size: .9rem; color: #c0d8f0; font-weight: 500; }
.ntm-badge-tu {
  font-size: .7rem; padding: 2px 7px; border-radius: 10px;
  background: #00d4aa22; color: #00d4aa; font-weight: 600;
}
.ntm-btn-eliminar {
  background: none; border: 1px solid #2a1020; border-radius: 8px;
  color: #ff6b6b; font-size: .8rem; cursor: pointer;
  padding: 4px 8px; transition: all .2s; opacity: .6;
}
.ntm-btn-eliminar:hover { background: #2b0a0a; border-color: #ff6b6b44; opacity: 1; }

/* Formulario agregar */
.ntm-agregar-form { display: flex; flex-direction: column; gap: 10px; }
.ntm-field { display: flex; flex-direction: column; gap: 5px; }
.ntm-label { font-size: .75rem; color: #7eb3ff; text-transform: uppercase; letter-spacing: .06em; }
.ntm-input {
  background: #0a1e35; border: 1px solid #1e3a5f; border-radius: 10px;
  color: #e0f0ff; font-size: .9rem; padding: 10px 14px;
  outline: none; transition: border-color .2s; font-family: inherit;
}
.ntm-input::placeholder { color: #3a5a7a; }
.ntm-input:focus { border-color: #3d7bf5; }

/* Tabs */
.ntm-tabs {
  display: flex; gap: 0;
  border-bottom: 1px solid #1e3a5f;
  margin-bottom: -4px;
}
.ntm-tab {
  flex: 1; padding: 11px 16px;
  background: none; border: none; border-bottom: 3px solid transparent;
  color: #6a8fa8; font-size: .87rem; font-weight: 600;
  cursor: pointer; transition: all .2s; font-family: inherit;
}
.ntm-tab.active { color: #00d4aa; border-bottom-color: #00d4aa; }
.ntm-tab:hover:not(.active) { color: #a0c4e8; }
.ntm-tab-panel { display: none; }
.ntm-tab-panel.active { display: flex; flex-direction: column; gap: 12px; }

/* Botones */
.ntm-btn-primary {
  padding: 11px 20px; border-radius: 10px; border: none;
  background: linear-gradient(135deg,#00d4aa,#00a889);
  color: #001a14; font-size: .9rem; font-weight: 700;
  cursor: pointer; transition: all .2s; align-self: flex-start;
  font-family: inherit;
}
.ntm-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px #00d4aa44; }
.ntm-btn-ghost {
  background: none; border: 1px solid #2a3a5a; border-radius: 8px;
  color: #6a8fa8; font-size: .8rem; cursor: pointer;
  padding: 4px 12px; transition: all .2s; font-family: inherit;
}
.ntm-btn-ghost:hover { border-color: #7eb3ff; color: #a0c4e8; }
.ntm-btn-salir { color: #ff9a9a; border-color: #3a1020; }
.ntm-btn-salir:hover { border-color: #ff6b6b; color: #ff6b6b; background: #2b0a0a11; }

/* Footer info del ID */
.ntm-footer-info {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 14px 26px;
  border-top: 1px solid #1e3a5f;
  background: #09172a;
  border-radius: 0 0 20px 20px;
}
.ntm-footer-label { font-size: .78rem; color: #7eb3ff; }
.ntm-team-id {
  font-family: monospace; font-size: .82rem;
  color: #a0c4e8; background: #0a1e35;
  padding: 3px 10px; border-radius: 6px; border: 1px solid #1e3a5f;
}
.ntm-btn-copy {
  background: #1e3a5f; border: none; color: #a0c4e8;
  font-size: .78rem; padding: 4px 10px; border-radius: 6px;
  cursor: pointer; transition: all .2s; font-family: inherit;
}
.ntm-btn-copy:hover { background: #2a5080; color: #e0f0ff; }

/* Toast */
.ntm-toast {
  position: fixed; bottom: 24px; right: 24px; z-index: 999999;
  padding: 12px 20px; border-radius: 12px; font-size: .88rem; font-weight: 600;
  opacity: 0; transform: translateY(10px); transition: all .3s;
  box-shadow: 0 10px 30px #0009; pointer-events: none;
}
.ntm-toast.visible { opacity: 1; transform: translateY(0); }
.ntm-toast-success { background: #0a2b22; color: #00d4aa; border: 1px solid #00d4aa44; }
.ntm-toast-error   { background: #2b0a0a; color: #ff6b6b; border: 1px solid #ff6b6b44; }
.ntm-toast-info    { background: #0a1e35; color: #7eb3ff; border: 1px solid #3d7bf544; }
`;
    document.head.appendChild(style);
  }

  // ─── API PÚBLICA ─────────────────────────────────────────────

  window.NexusTeam = {
    /**
     * Configura el usuario actual (llamar tras el login del estudiante)
     * @param {{id:string, nombre:string, grado:string, grupo:string, modo?:string, teamId?:string, teamNombre?:string}} usuario
     */
    setUsuario(usuario) {
      STATE.usuario = { modo: 'individual', ...usuario };
      STORE.guardarUsuario();
      if (STATE.usuario.teamId) {
        STATE.equipo = STORE.cargarEquipo(STATE.usuario.teamId);
      }
    },

    /** Abre el panel de gestión de equipo */
    abrirPanel,

    /** Cierra el panel */
    cerrarPanel,

    /** Estado actual (solo lectura) */
    getEstado: () => ({ usuario: { ...STATE.usuario }, equipo: STATE.equipo ? { ...STATE.equipo } : null }),

    // Acciones internas expuestas para el HTML del template
    ..._acciones,
  };

  // ─── INICIALIZACIÓN ──────────────────────────────────────────

  injectStyles();

  // Leer usuario desde sessionStorage o window si ya existe
  const stored = sessionStorage.getItem('nexus_user');
  if (stored) {
    try { STATE.usuario = JSON.parse(stored); } catch {}
  } else if (window.__NEXUS_USER__) {
    STATE.usuario = window.__NEXUS_USER__;
  }
  if (STATE.usuario?.teamId) {
    STATE.equipo = STORE.cargarEquipo(STATE.usuario.teamId);
  }

  console.log('[NexusTeam] ✅ Módulo cargado. Usuario:', STATE.usuario?.nombre || '(no configurado)');

})();
