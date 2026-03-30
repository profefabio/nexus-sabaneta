/**
 * ═══════════════════════════════════════════════════════════════
 * NEXUS MISIONES — Módulo de Desbloqueo Secuencial + Evaluación IA
 * Prof. Fabio Alberto Ortiz M. · I.E. Sabaneta
 *
 * FUNCIONALIDADES:
 *  ✅ Misiones desbloqueadas en orden (la 2 se activa al terminar la 1)
 *  ✅ Evaluación IA tipo Prueba Saber (10–20 preguntas) al finalizar
 *  ✅ Modo individual y grupal
 *  ✅ Resultados guardados en PostgreSQL (vía Nexus Hub IPC o fetch API)
 *  ✅ UI completa: modal de evaluación, temporizador, retroalimentación
 *
 * INTEGRACIÓN en la plataforma Nexus web (nexus-sabaneta-gamma.vercel.app):
 *  1. Agregar al final del HTML antes de </body>:
 *     <script src="/nexus-missions-eval.js"></script>
 *  2. El módulo se auto-inicializa y parchea las funciones de misiones existentes
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  // ─── CONFIGURACIÓN ───────────────────────────────────────────
  const CFG = {
    // URL del endpoint que guarda resultados (ajustar según tu backend en Vercel)
    apiBase: '/api',
    // Clave API de Anthropic (se puede pasar por variable de entorno en Vercel)
    // En Vercel: NEXT_PUBLIC_ANTHROPIC_KEY o manejarlo server-side
    anthropicKey: window.__NEXUS_ANTHROPIC_KEY__ || '',
    // Mínimo de preguntas para la evaluación
    minPreguntas: 10,
    maxPreguntas: 20,
    // Nota mínima para aprobar (escala 1–5)
    notaMinima: 3.0,
    // Intentos máximos por evaluación
    maxIntentos: 2,
    // Tiempo límite en minutos (0 = sin límite)
    tiempoLimite: 25,
  };

  // ─── ESTADO ──────────────────────────────────────────────────
  const STATE = {
    usuario: null,         // {id, nombre, grado, grupo, modo, teamId, teamNombre}
    misiones: [],          // Lista de misiones ordenadas
    progreso: {},          // {[misionId]: {retosCompletados, total, completada, evaluada, nota}}
    evalActiva: null,      // Evaluación en curso
    timerInterval: null,
    tiempoInicio: null,
  };

  // ─── PERSISTENCIA LOCAL (fallback sin conexión) ───────────────
  const LOCAL = {
    key: (uid) => `nexus_progress_${uid}`,
    save(userId, data) {
      try { localStorage.setItem(this.key(userId), JSON.stringify(data)); } catch {}
    },
    load(userId) {
      try { return JSON.parse(localStorage.getItem(this.key(userId)) || '{}'); } catch { return {}; }
    },
  };

  // ═══════════════════════════════════════════════════════════════
  // SECCIÓN 1 — DESBLOQUEO SECUENCIAL DE MISIONES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Determina si una misión está desbloqueada basándose en el progreso.
   * Regla: misión orden=1 → siempre desbloqueada.
   *        misión orden=N → desbloqueada si la misión orden=N-1 tiene evaluacion_completada=true
   */
  function isMisionUnlocked(ordenMision) {
    if (ordenMision <= 1) return true;
    const prev = Object.values(STATE.progreso).find(p => p.ordenMision === ordenMision - 1);
    return prev?.evaluacionCompletada === true;
  }

  /**
   * Refresca el estado visual de todas las tarjetas de misión en la UI.
   * Agrega clase "locked" a las bloqueadas y deshabilita el botón "Iniciar".
   */
  function refreshMisionCards() {
    const cards = document.querySelectorAll('[data-mission-id], .mision-card, .mission-card');
    cards.forEach(card => {
      const misionId = card.dataset.missionId || card.dataset.misionId;
      if (!misionId) return;

      const prog = STATE.progreso[misionId];
      const orden = prog?.ordenMision ?? getMisionOrden(misionId);
      const unlocked = isMisionUnlocked(orden);

      // Agregar/quitar clases visuales
      card.classList.toggle('nexus-locked',   !unlocked);
      card.classList.toggle('nexus-unlocked',  unlocked);
      card.classList.toggle('nexus-completed', !!prog?.misionCompletada);
      card.classList.toggle('nexus-evaluated', !!prog?.evaluacionCompletada);

      // Deshabilitar botón Iniciar si está bloqueada
      const btnIniciar = card.querySelector('button, .btn-iniciar, [data-action="iniciar"]');
      if (btnIniciar) {
        btnIniciar.disabled = !unlocked;
        if (!unlocked) {
          btnIniciar.title   = '🔒 Completa la misión anterior primero';
          btnIniciar.style.opacity = '0.45';
          btnIniciar.style.cursor  = 'not-allowed';
          // Insertar candado visual si no existe
          if (!card.querySelector('.nexus-lock-badge')) {
            const badge = document.createElement('div');
            badge.className   = 'nexus-lock-badge';
            badge.innerHTML   = `<span>🔒</span><small>Completa la misión anterior</small>`;
            card.appendChild(badge);
          }
        } else {
          btnIniciar.title   = '';
          btnIniciar.style.opacity = '';
          btnIniciar.style.cursor  = '';
          card.querySelector('.nexus-lock-badge')?.remove();
        }
      }

      // Agregar badge de nota si ya evaluó
      if (prog?.nota && !card.querySelector('.nexus-nota-badge')) {
        const nb = document.createElement('div');
        nb.className = 'nexus-nota-badge ' + (prog.nota >= 3 ? 'aprobada' : 'reprobada');
        nb.textContent = `⭐ ${prog.nota.toFixed(1)}`;
        card.appendChild(nb);
      }
    });
  }

  function getMisionOrden(misionId) {
    // Intentar obtener orden de atributo data o del array STATE.misiones
    const el  = document.querySelector(`[data-mission-id="${misionId}"]`);
    const ord = el?.dataset.misionOrden || el?.dataset.orden;
    if (ord) return parseInt(ord);
    const idx = STATE.misiones.findIndex(m => m.id === misionId);
    return idx >= 0 ? idx + 1 : 99;
  }

  // ═══════════════════════════════════════════════════════════════
  // SECCIÓN 2 — DETECCIÓN DE COMPLETION DE RETOS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Llamar esta función cuando un estudiante completa un reto.
   * La plataforma Nexus debería invocar: window.NexusMissions.onRetoCompletado(...)
   */
  async function onRetoCompletado({ misionId, misionTitulo, ordenMision, totalRetos, retosCompletados }) {
    if (!STATE.usuario) return;

    // Actualizar estado local
    if (!STATE.progreso[misionId]) {
      STATE.progreso[misionId] = { ordenMision, totalRetos, retosCompletados: 0, misionCompletada: false, evaluacionCompletada: false };
    }
    STATE.progreso[misionId].retosCompletados = retosCompletados;
    STATE.progreso[misionId].misionCompletada = retosCompletados >= totalRetos;

    // Guardar en servidor
    await guardarProgreso({ misionId, misionTitulo, ordenMision, totalRetos, retosCompletados });

    // Persistir localmente
    LOCAL.save(STATE.usuario.id, STATE.progreso);

    // Si completó TODOS los retos → lanzar evaluación
    if (retosCompletados >= totalRetos && !STATE.progreso[misionId].evaluacionCompletada) {
      setTimeout(() => lanzarEvaluacion({ misionId, misionTitulo }), 1200);
    }

    // Refrescar UI
    refreshMisionCards();
  }

  // ═══════════════════════════════════════════════════════════════
  // SECCIÓN 3 — GENERADOR DE EVALUACIÓN IA (CLAUDE API)
  // ═══════════════════════════════════════════════════════════════

  async function generarPreguntasIA(misionTitulo, numPreguntas = 15) {
    const prompt = `Eres un experto en evaluación educativa colombiana tipo Prueba Saber.
    
Genera exactamente ${numPreguntas} preguntas de selección múltiple con única respuesta sobre el tema: "${misionTitulo}".

REGLAS ESTRICTAS:
- Nivel de complejidad progresivo (preguntas 1-5: básico, 6-10: medio, 11+: avanzado)
- Cada pregunta debe tener 4 opciones (A, B, C, D)
- Solo una respuesta correcta por pregunta
- Incluir enunciados contextualizados (situaciones reales, datos, gráficas descritas en texto)
- Incluir preguntas de análisis, interpretación y aplicación (no solo memorización)
- Incluir breve explicación de por qué es correcta la respuesta

Responde SOLO con JSON válido en este formato exacto, sin texto adicional:
{
  "preguntas": [
    {
      "id": 1,
      "enunciado": "Texto de la pregunta...",
      "opciones": {
        "A": "Primera opción",
        "B": "Segunda opción",
        "C": "Tercera opción",
        "D": "Cuarta opción"
      },
      "respuesta_correcta": "B",
      "explicacion": "La respuesta correcta es B porque..."
    }
  ]
}`;

    // Intentar vía servidor proxy primero (recomendado para producción)
    try {
      const resp = await fetch(`${CFG.apiBase}/generar-evaluacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tema: misionTitulo, numPreguntas }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.preguntas?.length) return data.preguntas;
      }
    } catch {}

    // Fallback: llamar directo a Anthropic (solo si hay clave pública configurada)
    if (CFG.anthropicKey) {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':         'application/json',
          'x-api-key':             CFG.anthropicKey,
          'anthropic-version':     '2023-06-01',
          'anthropic-dangerous-direct-browser-ipc': 'true',
        },
        body: JSON.stringify({
          model:      'claude-sonnet-4-20250514',
          max_tokens: 4096,
          messages:   [{ role: 'user', content: prompt }],
        }),
      });
      const data = await resp.json();
      const texto = data.content?.[0]?.text || '';
      const json  = JSON.parse(texto.replace(/```json|```/g, '').trim());
      return json.preguntas || [];
    }

    throw new Error('No se pudo generar la evaluación. Configura el endpoint /api/generar-evaluacion en tu servidor.');
  }

  // ═══════════════════════════════════════════════════════════════
  // SECCIÓN 4 — UI DE EVALUACIÓN (Modal completo)
  // ═══════════════════════════════════════════════════════════════

  async function lanzarEvaluacion({ misionId, misionTitulo }) {
    // Verificar intentos
    const prog = STATE.progreso[misionId];
    if (prog?.evaluacionCompletada) {
      mostrarNotificacion('✅ Ya completaste la evaluación de esta misión', 'success');
      return;
    }

    // Mostrar pantalla de carga
    mostrarModalCarga(`🧠 Generando evaluación de "${misionTitulo}"...`);

    let preguntas;
    try {
      const numPreguntas = Math.floor(Math.random() * (CFG.maxPreguntas - CFG.minPreguntas + 1)) + CFG.minPreguntas;
      preguntas = await generarPreguntasIA(misionTitulo, numPreguntas);
      if (!preguntas?.length) throw new Error('Sin preguntas');
    } catch (err) {
      cerrarModalCarga();
      mostrarNotificacion('❌ Error generando evaluación: ' + err.message, 'error');
      return;
    }

    cerrarModalCarga();

    STATE.evalActiva = {
      misionId,
      misionTitulo,
      preguntas,
      respuestas: {},
      preguntaActual: 0,
      tiempoInicio: Date.now(),
    };

    renderModalEvaluacion();
  }

  function renderModalEvaluacion() {
    const ev = STATE.evalActiva;
    if (!ev) return;

    const total = ev.preguntas.length;
    const idx   = ev.preguntaActual;
    const preg  = ev.preguntas[idx];
    const respondidas = Object.keys(ev.respuestas).length;

    const html = `
<div id="nexus-eval-overlay" class="nexus-eval-overlay">
  <div class="nexus-eval-modal">

    <!-- Header -->
    <div class="nem-header">
      <div class="nem-titulo">
        <span>📝 Evaluación Tipo Saber</span>
        <small>${ev.misionTitulo}</small>
      </div>
      <div class="nem-meta">
        <div class="nem-timer" id="nemTimer">⏱ ${CFG.tiempoLimite}:00</div>
        <div class="nem-progress">${respondidas}/${total} respondidas</div>
      </div>
    </div>

    <!-- Barra de progreso -->
    <div class="nem-progress-bar">
      <div class="nem-progress-fill" style="width:${(respondidas/total)*100}%"></div>
    </div>

    <!-- Navegación de preguntas -->
    <div class="nem-nav-pills" id="nemNavPills">
      ${ev.preguntas.map((_, i) => {
        const resp = ev.respuestas[i] ? 'respondida' : '';
        const curr = i === idx ? 'actual' : '';
        return `<button class="nem-pill ${resp} ${curr}" onclick="NexusMissions._irPregunta(${i})">${i+1}</button>`;
      }).join('')}
    </div>

    <!-- Pregunta actual -->
    <div class="nem-pregunta-wrap" id="nemPregunta">
      <div class="nem-num">Pregunta ${idx + 1} de ${total}</div>
      <div class="nem-enunciado">${preg.enunciado}</div>
      <div class="nem-opciones">
        ${Object.entries(preg.opciones).map(([letra, texto]) => `
          <label class="nem-opcion ${ev.respuestas[idx] === letra ? 'selected' : ''}"
                 onclick="NexusMissions._seleccionar(${idx},'${letra}')">
            <span class="nem-letra">${letra}</span>
            <span class="nem-texto">${texto}</span>
          </label>`).join('')}
      </div>
    </div>

    <!-- Acciones -->
    <div class="nem-footer">
      <button class="nem-btn nem-btn-sec"
              onclick="NexusMissions._navEval(-1)" ${idx === 0 ? 'disabled' : ''}>
        ← Anterior
      </button>
      <button class="nem-btn nem-btn-sec"
              onclick="NexusMissions._navEval(1)"
              ${idx === total - 1 ? 'style="display:none"' : ''}>
        Siguiente →
      </button>
      ${idx === total - 1 || respondidas === total ? `
        <button class="nem-btn nem-btn-primary" onclick="NexusMissions._entregarEval()">
          ✅ Entregar Evaluación (${respondidas}/${total})
        </button>` : ''}
    </div>
  </div>
</div>`;

    // Remover modal anterior si existe
    document.getElementById('nexus-eval-overlay')?.remove();
    document.body.insertAdjacentHTML('beforeend', html);

    // Iniciar temporizador
    if (!STATE.timerInterval && CFG.tiempoLimite > 0) {
      iniciarTimer();
    }
  }

  function iniciarTimer() {
    const endTime = STATE.evalActiva.tiempoInicio + CFG.tiempoLimite * 60 * 1000;
    STATE.timerInterval = setInterval(() => {
      const restante = Math.max(0, endTime - Date.now());
      const min = Math.floor(restante / 60000);
      const seg = Math.floor((restante % 60000) / 1000);
      const el  = document.getElementById('nemTimer');
      if (el) {
        el.textContent = `⏱ ${String(min).padStart(2,'0')}:${String(seg).padStart(2,'0')}`;
        if (restante < 180000) el.classList.add('urgente');
      }
      if (restante === 0) { clearInterval(STATE.timerInterval); STATE.timerInterval = null; _entregarEval(true); }
    }, 1000);
  }

  // Seleccionar respuesta
  function _seleccionar(idx, letra) {
    if (!STATE.evalActiva) return;
    STATE.evalActiva.respuestas[idx] = letra;
    renderModalEvaluacion(); // Re-render con nueva selección
  }

  // Navegar entre preguntas
  function _irPregunta(idx) {
    if (!STATE.evalActiva) return;
    STATE.evalActiva.preguntaActual = idx;
    renderModalEvaluacion();
  }

  function _navEval(delta) {
    if (!STATE.evalActiva) return;
    const total = STATE.evalActiva.preguntas.length;
    STATE.evalActiva.preguntaActual = Math.max(0, Math.min(total - 1, STATE.evalActiva.preguntaActual + delta));
    renderModalEvaluacion();
  }

  // Entregar evaluación
  async function _entregarEval(porTiempo = false) {
    const ev = STATE.evalActiva;
    if (!ev) return;

    const total       = ev.preguntas.length;
    const respondidas = Object.keys(ev.respuestas).length;

    // Confirmar si quedan preguntas sin responder (excepto si fue por tiempo)
    if (!porTiempo && respondidas < total) {
      const confirmar = confirm(`⚠️ Tienes ${total - respondidas} pregunta(s) sin responder.\n¿Deseas entregar de todas formas?`);
      if (!confirmar) return;
    }

    // Detener timer
    if (STATE.timerInterval) { clearInterval(STATE.timerInterval); STATE.timerInterval = null; }

    // Calcular resultados
    let correctas = 0;
    const detalleRespuestas = {};
    ev.preguntas.forEach((preg, i) => {
      const dada  = ev.respuestas[i];
      const buena = preg.respuesta_correcta;
      detalleRespuestas[i] = { dada, correcta: buena, esCorrecta: dada === buena };
      if (dada === buena) correctas++;
    });

    const porcentaje = (correctas / total * 100).toFixed(1);
    const nota       = parseFloat((correctas / total * 4 + 1).toFixed(2));
    const aprobada   = nota >= CFG.notaMinima;
    const tiempoSeg  = Math.floor((Date.now() - ev.tiempoInicio) / 1000);

    // Guardar en servidor
    const guardado = await guardarEvaluacion({
      misionId:       ev.misionId,
      misionTitulo:   ev.misionTitulo,
      preguntas:      ev.preguntas,
      respuestasDadas: detalleRespuestas,
      correctas,
      totalPreguntas: total,
      tiempoSegundos: tiempoSeg,
    });

    // Actualizar estado local
    if (!STATE.progreso[ev.misionId]) STATE.progreso[ev.misionId] = {};
    if (aprobada || (guardado.intento || 1) >= CFG.maxIntentos) {
      STATE.progreso[ev.misionId].evaluacionCompletada = true;
    }
    STATE.progreso[ev.misionId].nota = nota;
    LOCAL.save(STATE.usuario?.id || 'anon', STATE.progreso);

    // Cerrar modal de evaluación
    document.getElementById('nexus-eval-overlay')?.remove();
    STATE.evalActiva = null;

    // Mostrar pantalla de resultados
    renderResultados({ ev, correctas, total, porcentaje, nota, aprobada, detalleRespuestas, guardado });

    // Refrescar tarjetas de misiones
    refreshMisionCards();
  }

  // ═══════════════════════════════════════════════════════════════
  // SECCIÓN 5 — PANTALLA DE RESULTADOS
  // ═══════════════════════════════════════════════════════════════

  function renderResultados({ ev, correctas, total, porcentaje, nota, aprobada, detalleRespuestas, guardado }) {
    const emoji   = nota >= 4.5 ? '🏆' : nota >= 4.0 ? '🌟' : nota >= 3.0 ? '✅' : '💪';
    const mensaje = aprobada
      ? nota >= 4.5 ? '¡Excelente dominio del tema!' : nota >= 4.0 ? '¡Muy buen desempeño!' : '¡Aprobaste la evaluación!'
      : (guardado.intento || 1) < CFG.maxIntentos
        ? 'Puedes intentarlo una vez más. ¡Tú puedes!'
        : 'Continúa practicando. ¡El conocimiento es un proceso!';

    const html = `
<div id="nexus-resultado-overlay" class="nexus-eval-overlay nexus-resultado">
  <div class="nexus-eval-modal">
    <div class="nr-hero ${aprobada ? 'aprobada' : 'reprobada'}">
      <div class="nr-emoji">${emoji}</div>
      <h2>${aprobada ? '¡Misión Evaluada!' : 'Sigue Intentando'}</h2>
      <p>${mensaje}</p>
    </div>

    <div class="nr-stats">
      <div class="nr-stat">
        <div class="nr-stat-val nota-${aprobada?'alta':'baja'}">${nota.toFixed(1)}</div>
        <div class="nr-stat-lbl">Nota (1–5)</div>
      </div>
      <div class="nr-stat">
        <div class="nr-stat-val">${porcentaje}%</div>
        <div class="nr-stat-lbl">Porcentaje</div>
      </div>
      <div class="nr-stat">
        <div class="nr-stat-val">${correctas}/${total}</div>
        <div class="nr-stat-lbl">Correctas</div>
      </div>
    </div>

    <!-- Revisión de respuestas -->
    <div class="nr-revision">
      <h3>📋 Revisión de Respuestas</h3>
      <div class="nr-preguntas-list">
        ${ev.preguntas.map((preg, i) => {
          const dr = detalleRespuestas[i];
          const ok = dr?.esCorrecta;
          return `
          <div class="nr-pregunta-item ${ok ? 'ok' : 'mal'}">
            <div class="nr-pi-head">
              <span class="nr-pi-num">${i+1}</span>
              <span class="nr-pi-enunciado">${preg.enunciado.substring(0, 120)}${preg.enunciado.length>120?'...':''}</span>
              <span class="nr-pi-icon">${ok ? '✅' : '❌'}</span>
            </div>
            ${!ok ? `
            <div class="nr-pi-detalle">
              <span class="nr-pi-dada">Tu respuesta: <strong>${dr?.dada || 'Sin responder'}</strong></span>
              <span class="nr-pi-correcta">Respuesta correcta: <strong>${preg.respuesta_correcta}</strong></span>
            </div>
            <div class="nr-pi-explicacion">💡 ${preg.explicacion}</div>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="nr-footer">
      ${!aprobada && (guardado.intento || 1) < CFG.maxIntentos ? `
        <button class="nem-btn nem-btn-secondary" onclick="NexusMissions._reintentar('${ev.misionId}','${ev.misionTitulo}')">
          🔄 Intentar de nuevo (${CFG.maxIntentos - (guardado.intento||1)} intento restante)
        </button>` : ''}
      <button class="nem-btn nem-btn-primary" onclick="document.getElementById('nexus-resultado-overlay').remove(); NexusMissions._refreshMisionCards();">
        ${aprobada ? '🚀 Continuar al siguiente nivel' : '📚 Seguir aprendiendo'}
      </button>
    </div>
  </div>
</div>`;

    document.getElementById('nexus-resultado-overlay')?.remove();
    document.body.insertAdjacentHTML('beforeend', html);
  }

  function _reintentar(misionId, misionTitulo) {
    document.getElementById('nexus-resultado-overlay')?.remove();
    lanzarEvaluacion({ misionId, misionTitulo });
  }

  // ═══════════════════════════════════════════════════════════════
  // SECCIÓN 6 — COMUNICACIÓN CON BACKEND
  // ═══════════════════════════════════════════════════════════════

  async function guardarProgreso(data) {
    try {
      // Vía Electron IPC (si está disponible el Hub)
      if (window.nexus?.nexusUpdateReto) {
        return await window.nexus.nexusUpdateReto({
          ...data,
          studentId:     STATE.usuario.id,
          studentNombre: STATE.usuario.nombre,
          grado:         STATE.usuario.grado,
          grupo:         STATE.usuario.grupo,
          modo:          STATE.usuario.modo || 'individual',
          teamId:        STATE.usuario.teamId,
          teamNombre:    STATE.usuario.teamNombre,
        });
      }
      // Vía fetch a endpoint de Vercel
      const resp = await fetch(`${CFG.apiBase}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, usuario: STATE.usuario }),
      });
      return await resp.json();
    } catch (e) {
      console.warn('[NexusMissions] guardarProgreso error:', e.message);
      return { ok: false };
    }
  }

  async function guardarEvaluacion(data) {
    try {
      if (window.nexus?.nexusSaveEvaluacion) {
        return await window.nexus.nexusSaveEvaluacion({
          ...data,
          studentId:     STATE.usuario.id,
          studentNombre: STATE.usuario.nombre,
          grado:         STATE.usuario.grado,
          grupo:         STATE.usuario.grupo,
          modo:          STATE.usuario.modo || 'individual',
          teamId:        STATE.usuario.teamId,
          teamNombre:    STATE.usuario.teamNombre,
        });
      }
      const resp = await fetch(`${CFG.apiBase}/evaluacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, usuario: STATE.usuario }),
      });
      return await resp.json();
    } catch (e) {
      console.warn('[NexusMissions] guardarEvaluacion error:', e.message);
      return { ok: false, intento: 1 };
    }
  }

  async function cargarProgreso() {
    if (!STATE.usuario) return;
    try {
      // Desde servidor
      if (window.nexus?.nexusGetUnlocked) {
        const r = await window.nexus.nexusGetUnlocked({
          studentId: STATE.usuario.id,
          teamId:    STATE.usuario.teamId,
          modo:      STATE.usuario.modo,
        });
        if (r.ok) { STATE.progreso = r.progreso || {}; return; }
      }
      // Fallback local
      const local = LOCAL.load(STATE.usuario.id);
      if (Object.keys(local).length) { STATE.progreso = local; return; }

      // Fetch a API de Vercel
      const resp = await fetch(`${CFG.apiBase}/progress?studentId=${STATE.usuario.id}`);
      if (resp.ok) { const d = await resp.json(); STATE.progreso = d.progreso || {}; }
    } catch (e) {
      // Usar datos locales si hay error de red
      STATE.progreso = LOCAL.load(STATE.usuario?.id || 'anon');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SECCIÓN 7 — MODO INDIVIDUAL / GRUPAL
  // ═══════════════════════════════════════════════════════════════

  /**
   * Detecta el modo de trabajo del estudiante actual.
   * La plataforma Nexus debe setear: window.__NEXUS_USER__ = { id, nombre, grado, grupo, modo, teamId, teamNombre }
   */
  function detectarModo() {
    if (window.__NEXUS_USER__) {
      STATE.usuario = window.__NEXUS_USER__;
      return STATE.usuario.modo || 'individual';
    }
    // Intentar leer del DOM o sessionStorage
    const stored = sessionStorage.getItem('nexus_user');
    if (stored) {
      try { STATE.usuario = JSON.parse(stored); return STATE.usuario.modo || 'individual'; } catch {}
    }
    return 'individual';
  }

  /**
   * En modo GRUPAL: el progreso se comparte entre todos los miembros del equipo.
   * Si UN miembro del equipo completa la misión y la evaluación, TODOS se benefician.
   * Esto se maneja en el backend (main_nexus_missions.js, handler nexus-save-evaluacion).
   */
  function esModoGrupal() {
    return STATE.usuario?.modo === 'grupal' && !!STATE.usuario?.teamId;
  }

  // ═══════════════════════════════════════════════════════════════
  // SECCIÓN 8 — HELPERS UI
  // ═══════════════════════════════════════════════════════════════

  function mostrarModalCarga(mensaje) {
    document.getElementById('nexus-carga-overlay')?.remove();
    document.body.insertAdjacentHTML('beforeend', `
      <div id="nexus-carga-overlay" class="nexus-eval-overlay nexus-carga">
        <div class="nexus-carga-box">
          <div class="nexus-spinner"></div>
          <p>${mensaje}</p>
        </div>
      </div>`);
  }

  function cerrarModalCarga() {
    document.getElementById('nexus-carga-overlay')?.remove();
  }

  function mostrarNotificacion(mensaje, tipo = 'info') {
    const n = document.createElement('div');
    n.className = `nexus-notif nexus-notif-${tipo}`;
    n.textContent = mensaje;
    document.body.appendChild(n);
    setTimeout(() => n.classList.add('visible'), 50);
    setTimeout(() => { n.classList.remove('visible'); setTimeout(() => n.remove(), 400); }, 4000);
  }

  // ═══════════════════════════════════════════════════════════════
  // SECCIÓN 9 — ESTILOS CSS
  // ═══════════════════════════════════════════════════════════════

  function injectStyles() {
    if (document.getElementById('nexus-missions-styles')) return;
    const style = document.createElement('style');
    style.id = 'nexus-missions-styles';
    style.textContent = `
/* ── Overlay base ── */
.nexus-eval-overlay {
  position:fixed; inset:0; z-index:99999;
  background:rgba(5,10,25,0.92); backdrop-filter:blur(8px);
  display:flex; align-items:center; justify-content:center;
  animation:nemFadeIn .25s ease;
}
@keyframes nemFadeIn { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:scale(1)} }

/* ── Modal principal ── */
.nexus-eval-modal {
  background:#0d1b2a; border:1px solid #1e3a5f;
  border-radius:20px; width:min(760px,96vw); max-height:90vh;
  overflow-y:auto; padding:0; box-shadow:0 30px 80px #000a;
}
.nexus-eval-modal::-webkit-scrollbar { width:6px; }
.nexus-eval-modal::-webkit-scrollbar-track { background:#0d1b2a; }
.nexus-eval-modal::-webkit-scrollbar-thumb { background:#1e3a5f; border-radius:3px; }

/* ── Header ── */
.nem-header {
  display:flex; align-items:center; justify-content:space-between;
  padding:20px 28px; background:linear-gradient(135deg,#0f2744,#1a3a6b);
  border-radius:20px 20px 0 0; gap:16px;
}
.nem-titulo span { font-size:1.15rem; font-weight:700; color:#e0f0ff; display:block; }
.nem-titulo small { font-size:.8rem; color:#7eb3ff; margin-top:2px; display:block; }
.nem-meta { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
.nem-timer {
  font-size:1.1rem; font-weight:700; color:#00d4aa;
  background:#0a1e35; padding:6px 14px; border-radius:20px;
  border:1px solid #00d4aa44;
}
.nem-timer.urgente { color:#ff6b6b; border-color:#ff6b6b44; animation:pulse 1s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.6} }
.nem-progress { font-size:.78rem; color:#7eb3ff; }

/* ── Barra progreso ── */
.nem-progress-bar { height:4px; background:#1e3a5f; }
.nem-progress-fill { height:100%; background:linear-gradient(90deg,#00d4aa,#3d7bf5); transition:width .4s; }

/* ── Pastillas de navegación ── */
.nem-nav-pills {
  display:flex; flex-wrap:wrap; gap:6px; padding:16px 28px;
  border-bottom:1px solid #1e3a5f;
}
.nem-pill {
  width:34px; height:34px; border-radius:50%; border:2px solid #1e3a5f;
  background:#0a1e35; color:#7eb3ff; font-size:.8rem; font-weight:600;
  cursor:pointer; transition:all .2s;
}
.nem-pill.respondida { background:#1a3a6b; border-color:#00d4aa; color:#00d4aa; }
.nem-pill.actual { border-color:#3d7bf5; background:#1e3a6b; color:#fff; transform:scale(1.15); }
.nem-pill:hover { border-color:#3d7bf5; }

/* ── Pregunta ── */
.nem-pregunta-wrap { padding:24px 28px; }
.nem-num { font-size:.8rem; color:#7eb3ff; text-transform:uppercase; letter-spacing:.06em; margin-bottom:10px; }
.nem-enunciado { font-size:1.02rem; color:#e0f0ff; line-height:1.65; margin-bottom:20px; }
.nem-opciones { display:flex; flex-direction:column; gap:10px; }
.nem-opcion {
  display:flex; align-items:center; gap:14px; padding:14px 18px;
  border:2px solid #1e3a5f; border-radius:12px; cursor:pointer;
  transition:all .2s; color:#c0d8f0;
}
.nem-opcion:hover { border-color:#3d7bf5; background:#0f2744; }
.nem-opcion.selected { border-color:#00d4aa; background:#0a2b22; color:#e0f0ff; }
.nem-letra {
  min-width:34px; height:34px; border-radius:50%;
  background:#1e3a5f; display:flex; align-items:center; justify-content:center;
  font-weight:700; font-size:.9rem; color:#7eb3ff;
}
.nem-opcion.selected .nem-letra { background:#00d4aa22; color:#00d4aa; }

/* ── Footer ── */
.nem-footer {
  display:flex; gap:10px; justify-content:flex-end;
  padding:16px 28px; border-top:1px solid #1e3a5f;
}
.nem-btn {
  padding:10px 22px; border-radius:10px; font-size:.9rem; font-weight:600;
  border:none; cursor:pointer; transition:all .2s;
}
.nem-btn:disabled { opacity:.4; cursor:not-allowed; }
.nem-btn-primary { background:linear-gradient(135deg,#00d4aa,#00a889); color:#001a14; }
.nem-btn-primary:hover { transform:translateY(-2px); box-shadow:0 6px 20px #00d4aa44; }
.nem-btn-sec, .nem-btn-secondary { background:#1e3a5f; color:#e0f0ff; border:1px solid #2a5080; }
.nem-btn-sec:hover { background:#2a5080; }

/* ── Pantalla resultados ── */
.nr-hero { padding:32px; text-align:center; border-radius:20px 20px 0 0; }
.nr-hero.aprobada { background:linear-gradient(135deg,#0a2b22,#0f3a2e); }
.nr-hero.reprobada { background:linear-gradient(135deg,#2b0a0a,#3a1414); }
.nr-emoji { font-size:3.5rem; margin-bottom:10px; }
.nr-hero h2 { color:#e0f0ff; font-size:1.6rem; margin:0 0 8px; }
.nr-hero p  { color:#9ab8d0; margin:0; }
.nr-stats { display:flex; justify-content:center; gap:24px; padding:24px; border-bottom:1px solid #1e3a5f; }
.nr-stat { text-align:center; }
.nr-stat-val { font-size:2rem; font-weight:800; color:#e0f0ff; }
.nr-stat-val.nota-alta { color:#00d4aa; }
.nr-stat-val.nota-baja { color:#ff6b6b; }
.nr-stat-lbl { font-size:.75rem; color:#7eb3ff; text-transform:uppercase; letter-spacing:.05em; }
.nr-revision { padding:20px 28px; max-height:35vh; overflow-y:auto; }
.nr-revision h3 { color:#7eb3ff; font-size:.9rem; margin:0 0 14px; }
.nr-preguntas-list { display:flex; flex-direction:column; gap:8px; }
.nr-pregunta-item {
  border-radius:10px; overflow:hidden;
  border-left:4px solid transparent;
}
.nr-pregunta-item.ok  { border-color:#00d4aa; background:#00d4aa0a; }
.nr-pregunta-item.mal { border-color:#ff6b6b; background:#ff6b6b0a; }
.nr-pi-head { display:flex; align-items:flex-start; gap:10px; padding:10px 14px; }
.nr-pi-num  { min-width:26px; height:26px; border-radius:50%; background:#1e3a5f; display:flex; align-items:center; justify-content:center; font-size:.75rem; font-weight:700; color:#7eb3ff; }
.nr-pi-enunciado { flex:1; font-size:.85rem; color:#c0d8f0; line-height:1.5; }
.nr-pi-icon { font-size:1.1rem; }
.nr-pi-detalle { display:flex; gap:14px; padding:0 14px 6px 50px; font-size:.8rem; }
.nr-pi-dada    { color:#ff9a9a; }
.nr-pi-correcta{ color:#9affd2; }
.nr-pi-explicacion { padding:4px 14px 12px 50px; font-size:.8rem; color:#8ab; font-style:italic; }
.nr-footer { display:flex; gap:10px; justify-content:center; padding:16px 28px; border-top:1px solid #1e3a5f; }

/* ── Carga ── */
.nexus-carga { }
.nexus-carga-box { background:#0d1b2a; border:1px solid #1e3a5f; border-radius:20px; padding:40px 50px; text-align:center; }
.nexus-carga-box p { color:#9ab8d0; margin-top:18px; font-size:.95rem; }
.nexus-spinner {
  width:50px; height:50px; margin:0 auto;
  border:4px solid #1e3a5f; border-top-color:#00d4aa;
  border-radius:50%; animation:spin 1s linear infinite;
}
@keyframes spin { to { transform:rotate(360deg); } }

/* ── Notificaciones ── */
.nexus-notif {
  position:fixed; bottom:24px; right:24px; z-index:999999;
  padding:14px 22px; border-radius:12px; font-size:.9rem; font-weight:600;
  opacity:0; transform:translateY(12px); transition:all .3s;
  box-shadow:0 10px 30px #0008;
}
.nexus-notif.visible { opacity:1; transform:translateY(0); }
.nexus-notif-success { background:#0a2b22; color:#00d4aa; border:1px solid #00d4aa44; }
.nexus-notif-error   { background:#2b0a0a; color:#ff6b6b; border:1px solid #ff6b6b44; }
.nexus-notif-info    { background:#0a1e35; color:#7eb3ff; border:1px solid #3d7bf544; }

/* ── Tarjetas de misión: bloqueo / progreso ── */
.nexus-locked  { opacity:.75; filter:grayscale(.4); }
.nexus-lock-badge {
  position:absolute; top:12px; right:12px;
  background:#0a1e35; border:1px solid #1e3a5f; border-radius:8px;
  padding:6px 10px; font-size:.78rem; color:#7eb3ff;
  display:flex; align-items:center; gap:6px; z-index:10;
}
.nexus-nota-badge {
  position:absolute; top:12px; left:12px;
  padding:4px 12px; border-radius:20px; font-size:.82rem; font-weight:700;
  z-index:10;
}
.nexus-nota-badge.aprobada { background:#0a2b22; color:#00d4aa; border:1px solid #00d4aa44; }
.nexus-nota-badge.reprobada { background:#2b0a0a; color:#ff6b6b; border:1px solid #ff6b6b44; }
`;
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════════════════════════
  // SECCIÓN 10 — INICIALIZACIÓN Y API PÚBLICA
  // ═══════════════════════════════════════════════════════════════

  async function init() {
    injectStyles();
    detectarModo();
    await cargarProgreso();

    // Esperar a que el DOM de misiones esté listo
    const observer = new MutationObserver(() => {
      const cards = document.querySelectorAll('[data-mission-id], .mision-card, .mission-card');
      if (cards.length) {
        observer.disconnect();
        refreshMisionCards();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Si ya hay misiones en el DOM
    refreshMisionCards();

    console.log('[NexusMissions] ✅ Módulo inicializado. Modo:', STATE.usuario?.modo || 'individual');
  }

  // API pública expuesta en window.NexusMissions
  window.NexusMissions = {
    // Llamar desde la plataforma Nexus cuando se completa un reto
    onRetoCompletado,
    // Llamar para forzar una evaluación
    lanzarEvaluacion,
    // Configurar usuario (llamar después del login en Nexus)
    setUsuario(usuario) {
      STATE.usuario = usuario;
      sessionStorage.setItem('nexus_user', JSON.stringify(usuario));
      cargarProgreso().then(refreshMisionCards);
    },
    // Recargar progreso (útil tras cambios de grupo/modo)
    async recargarProgreso() { await cargarProgreso(); refreshMisionCards(); },
    // Exponer para botones inline del template
    _seleccionar, _irPregunta, _navEval, _entregarEval,
    _reintentar, _refreshMisionCards: refreshMisionCards,
    // Estado actual (solo lectura)
    getEstado: () => ({ ...STATE }),
    // Configurar opciones
    config(opts) { Object.assign(CFG, opts); },
  };

  // Auto-init cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
