# 🚀 NEXUS MISIONES — Guía de Integración
## Desbloqueo Secuencial + Evaluación IA + Modos Individual/Grupal
**Prof. Fabio Alberto Ortiz M. · I.E. Sabaneta**

---

## ¿Qué hace este paquete?

| Feature | Descripción |
|---------|-------------|
| 🔒 **Misiones secuenciales** | La misión 2 se activa solo al terminar la evaluación de la misión 1 |
| 🧠 **Evaluación IA** | Al finalizar todos los retos, Claude genera 10–20 preguntas tipo Prueba Saber |
| 💾 **Guarda en BD** | Resultados en PostgreSQL vía Nexus Hub o directo a Vercel Postgres |
| 👤/👥 **Individual + Grupal** | Si el equipo pasa la evaluación, todos sus miembros se desbloquean |
| ⭐ **Nota 1–5** | Calculada como `(correctas/total × 4) + 1`, igual que Saber |

---

## PASO 1 — Base de Datos (ejecutar 1 vez)

```bash
# En pgAdmin o psql, ejecutar el archivo:
sql/nexus_missions_schema.sql
```

Crea las tablas:
- `nexus_mission_progress` — progreso de cada estudiante por misión
- `nexus_evaluaciones` — preguntas, respuestas y notas de cada evaluación

---

## PASO 2 — Nexus Hub (app Electron)

### 2a. Agregar handlers al final de `main.js`:
```
Copiar todo el contenido de: main_nexus_missions.js → al final de main.js
```

### 2b. Actualizar `app.whenReady()` en `main.js`:
```javascript
app.whenReady().then(async () => {
  createWindow();
  await initNexusTables();   // ← AGREGAR ESTA LÍNEA
  // ... resto del código
});
```

### 2c. El `preload.js` ya fue actualizado automáticamente ✅

---

## PASO 3 — Nexus Web App (nexus-sabaneta-gamma.vercel.app)

### 3a. Subir el módulo a tu repo de Vercel:
```
nexus-web/nexus-missions-eval.js  → /public/nexus-missions-eval.js
nexus-web/api/generar-evaluacion.js → /api/generar-evaluacion.js
```

### 3b. Agregar la variable de entorno en Vercel:
```
ANTHROPIC_API_KEY = sk-ant-api03-...tu-clave...
```
_(Dashboard de Vercel → Settings → Environment Variables)_

### 3c. Incluir el script en tu HTML principal (antes de `</body>`):
```html
<script src="/nexus-missions-eval.js"></script>
```

### 3d. Agregar `data-mission-id` y `data-mision-orden` a tus tarjetas de misión:
```html
<!-- Misión 1 (siempre desbloqueada) -->
<div class="mision-card" data-mission-id="m-001" data-mision-orden="1">
  <h3>Circuitos Eléctricos</h3>
  <button>Iniciar ▶</button>
</div>

<!-- Misión 2 (se desbloquea al terminar la evaluación de la misión 1) -->
<div class="mision-card" data-mission-id="m-002" data-mision-orden="2">
  <h3>Guerras Mundiales</h3>
  <button>Iniciar ▶</button>
</div>
```

### 3e. Setear el usuario después del login:
```javascript
// En tu función de login, después de autenticar:
window.NexusMissions.setUsuario({
  id:          usuario.id,          // ID único del estudiante
  nombre:      usuario.nombre,
  grado:       usuario.grado,       // '11'
  grupo:       usuario.grupo,       // 'A'
  modo:        'individual',        // 'individual' | 'grupal'
  teamId:      null,                // ID del equipo (si es grupal)
  teamNombre:  null,                // Nombre del equipo (si es grupal)
});
```

### 3f. Notificar al completar un reto:
```javascript
// Cuando el estudiante termina un reto:
window.NexusMissions.onRetoCompletado({
  misionId:         'circuitos-electricos',
  misionTitulo:     'Circuitos Eléctricos',
  ordenMision:      1,
  totalRetos:       3,
  retosCompletados: 2,  // ← actualizar según avance
});

// Cuando completa el ÚLTIMO reto (retosCompletados === totalRetos):
// → La evaluación IA se lanza AUTOMÁTICAMENTE después de 1.2 segundos
```

---

## MODO GRUPAL — Cómo funciona

```javascript
// Si el estudiante trabaja en equipo:
window.NexusMissions.setUsuario({
  id:         'est-sara-001',
  nombre:     'Sara López',
  grado:      '11',
  grupo:      'A',
  modo:       'grupal',          // ← GRUPAL
  teamId:     'equipo-alpha',    // ← ID compartido del equipo
  teamNombre: 'Equipo Alpha',
});
```

**Comportamiento grupal:**
- Cualquier miembro del equipo puede completar los retos
- Al hacer la evaluación, el resultado se aplica a TODO el equipo
- Si el equipo aprueba → todos los miembros desbloquean la siguiente misión
- Máximo 2 intentos por equipo (no individual)

---

## Ver resultados en Nexus Hub

El Hub mostrará las notas de Nexus junto a las de Kahoot y EscapeEdu.

Para agregarlo a la vista de notas del Hub, en `app.js` del renderer agregar 'nexus' como fuente:
```javascript
const APPS_META = {
  // ... existentes ...
  nexus: { nombre: 'Nexus Evaluaciones', icon: '🏫', color: '#a29bfe', ... }
};
// En setSource() agregar caso 'nexus':
// if (currentSource === 'nexus') { const r = await nexus.getNotasNexus(filtros); ... }
```

---

## Estructura de archivos entregados

```
nexus-hub/
├── sql/
│   └── nexus_missions_schema.sql        ← Ejecutar en PostgreSQL
├── main_nexus_missions.js               ← Copiar al final de main.js
├── preload.js                           ← Ya actualizado ✅
└── nexus-web/
    ├── nexus-missions-eval.js           ← Subir a /public/ en Vercel
    └── api/
        ├── generar-evaluacion.js        ← Subir a /api/ en Vercel
        └── evaluacion-y-progress.js     ← Referencia endpoints /api/
```

---

## Preguntas frecuentes

**¿Funciona sin conexión a internet?**
Sí. El progreso se guarda en `localStorage` como fallback. Las evaluaciones se generan con Claude API (requiere internet), pero el módulo puede funcionar con preguntas cacheadas.

**¿Cuántos intentos tiene el estudiante?**
Máximo 2 intentos por misión (configurable en `CFG.maxIntentos`).

**¿Qué pasa si el estudiante no termina la evaluación?**
Puede cerrar el navegador y retomar. El progreso de retos completados se guarda. La evaluación se reinicia (no se guardan respuestas parciales).

**¿Cómo cambio el número de preguntas?**
```javascript
window.NexusMissions.config({
  minPreguntas: 10,  // mínimo
  maxPreguntas: 20,  // máximo (el sistema elige al azar entre min y max)
  tiempoLimite: 30,  // minutos (0 = sin límite)
  notaMinima:   3.0, // nota mínima para aprobar (escala 1–5)
});
```
