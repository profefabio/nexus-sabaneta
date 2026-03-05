import { useState, useRef, useEffect, useCallback } from "react";
import * as XLSX from "xlsx-js-style";

// ─── Responsive hook ──────────────────────────────────────────
// isMobile = true para teléfonos (<768px)  isMobile = true para tablets (<1024px)
// Se usa el mismo flag porque el diseño columnar funciona bien hasta 1024px
const useIsMobile = () => {
  const [mobile, setMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 1024 : false
  );
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 1024);
    window.addEventListener("resize", fn, { passive: true });
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mobile;
};

// ─── Sanitización de mensajes del chat (previene XSS) ───────
const sanitizeChat = (text) => {
  // 1. Escapar HTML nativo antes de cualquier procesado
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  // 2. Convertir markdown seguro a HTML
  return escaped
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code style='background:#0d1526;padding:1px 5px;border-radius:4px;font-size:12px'>$1</code>")
    .replace(/\n/g, "<br/>");
};

// ─── API helpers ──────────────────────────────────────────────
const callNexus = async (messages, system, _retries=1) => {
  try {
    const res = await fetch("/api/chat", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ messages, system }),
    });

    if (res.status === 301 || res.status === 302 || res.status === 401 || res.status === 403) {
      return "⚠️ Error de autenticación. El administrador debe verificar la API key en Vercel.";
    }

    const data = await res.json().catch(() => ({ error: "Respuesta inválida del servidor." }));
    if (data.error) {
      // Reintentar automáticamente una vez si Anthropic está sobrecargado
      const esRecuperable = /sobrecargado|529|503|tiempo|timeout/i.test(data.error);
      if (_retries > 0 && esRecuperable) {
        await new Promise(r => setTimeout(r, 3500));
        return callNexus(messages, system, 0);
      }
      return data.error;
    }
    return data.content?.[0]?.text || "⚠️ NEXUS no pudo generar una respuesta. Intenta de nuevo.";
  } catch (err) {
    return "⚠️ Sin conexión con NEXUS. Verifica tu internet e intenta de nuevo.";
  }
};

const saveProgress = async (user, xp, nivel, misionId, equipo=null) => {
  try {
    await fetch("/api/saveprogress", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        estudiante_id: user.id,
        nombre_estudiante: user.name,
        grado: user.grade||"", grupo: user.group||"",
        xp_total: xp, nivel, mision_id: misionId||null,
        equipo: equipo || null,
      }),
    });
  } catch(_) {}
};

// Guardar un mensaje en el historial de chat
const saveChatMsg = async (user, role, content, misionId, misionTitle, xp, equipoNombre=null, retoId=null) => {
  try {
    await fetch("/api/savechat", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        estudiante_id: user.id,
        nombre_estudiante: user.name,
        mision_id: misionId||null,
        mision_title: misionTitle||null,
        reto_id: retoId ? String(retoId) : null,
        role, content,
        xp_at_time: xp||0,
        equipo_nombre: equipoNombre||null,
      }),
    });
  } catch(_) {}
};

// Cargar historial de chat (por misión y opcionalmente por reto)
const loadChatHistory = async (estudianteId, misionId, retoId) => {
  try {
    const params = new URLSearchParams({ estudiante_id: estudianteId });
    if (misionId) params.append("mision_id", misionId);
    if (retoId !== undefined && retoId !== null)
      params.append("reto_id", retoId === null ? "__libre__" : String(retoId));
    const res = await fetch("/api/savechat?" + params);
    const data = await res.json();
    return (data.msgs || []).map(m => ({ role: m.role, content: m.content, retoId: m.reto_id }));
  } catch(_) { return []; }
};

// ─── Fórmula XP → Nota (escala progresiva original) ─────────────
//   0  XP = 1.0 · 25 XP = 2.0 · 75 XP = 3.0 · 150 XP = 4.0 · 250 XP = 5.0
const xpToNota = (xp) => {
  const bp = [{x:0,n:1.0},{x:25,n:2.0},{x:75,n:3.0},{x:150,n:4.0},{x:250,n:5.0}];
  if (!xp || xp <= 0) return 1.0;
  if (xp >= 250) return 5.0;
  for (let i = 0; i < bp.length - 1; i++) {
    if (xp >= bp[i].x && xp <= bp[i+1].x) {
      const t = (xp - bp[i].x) / (bp[i+1].x - bp[i].x);
      return Math.round((bp[i].n + t * (bp[i+1].n - bp[i].n)) * 10) / 10;
    }
  }
  return 5.0;
};
const notaColor = (n) => n>=4.5?"#10d98a":n>=4.0?"#22c55e":n>=3.5?"#eab308":n>=3.0?"#f97316":"#ef4444";

// ─── Misiones API ─────────────────────────────────────────────
const getMisiones = async (docente_id, role) => {
  const params = new URLSearchParams({ docente_id: docente_id||"", role: role||"teacher" });
  const res = await fetch(`/api/misiones?${params}`);
  const data = await res.json();
  return data.misiones || [];
};
const createMision = async (docente_id, docente_nombre, misionData) => {
  const res = await fetch("/api/misiones", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ docente_id, docente_nombre, ...misionData }) });
  return (await res.json()).mision || null;
};
const updateMision = async (docente_id, misionData) => {
  const res = await fetch("/api/misiones", { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ docente_id, ...misionData }) });
  return (await res.json()).mision || null;
};
const deleteMision = async (id, docente_id, role) => {
  await fetch(`/api/misiones?${new URLSearchParams({id, docente_id:docente_id||"", role:role||"teacher"})}`, { method:"DELETE" });
};

// ─── Colores para notas ──────────────────────────────────────
const notaXlsxColor = (n) =>
  n >= 4.5 ? "10D98A" : n >= 4.0 ? "22C55E" : n >= 3.0 ? "EAB308" : n >= 2.0 ? "F97316" : "EF4444";

// ─── XLSX elegante ────────────────────────────────────────────
const downloadExcelMisiones = (topEstudiantes, misiones, filename = "notas_nexus", docenteNombre = "") => {
  if (!topEstudiantes?.length) return;

  const sorted = [...topEstudiantes].sort((a, b) => {
    const ap = s => (s || "").split(" ").slice(1).join(" ") || s || "";
    return ap(a.nombre_estudiante).localeCompare(ap(b.nombre_estudiante), "es");
  });

  const wb = XLSX.utils.book_new();
  const misionesConDatos = (misiones || []).filter(m =>
    sorted.some(e => e.misiones?.[m.id])
  );

  // ── Estilos base ─────────────────────────────────────────
  const sTitle = { font:{ name:"Arial", sz:16, bold:true, color:{rgb:"00C8FF"} }, alignment:{ horizontal:"left" } };
  const sSub   = { font:{ name:"Arial", sz:10, color:{rgb:"4A6080"} } };
  const sHdr   = {
    font:{ name:"Arial", sz:11, bold:true, color:{rgb:"FFFFFF"} },
    fill:{ fgColor:{rgb:"0D1526"} },
    alignment:{ horizontal:"center", vertical:"center", wrapText:true },
    border:{ bottom:{style:"medium",color:{rgb:"00C8FF"}} }
  };
  const sHdrMision = (color) => ({
    font:{ name:"Arial", sz:10, bold:true, color:{rgb:"FFFFFF"} },
    fill:{ fgColor:{rgb: color.replace("#","").toUpperCase() || "8B5CF6"} },
    alignment:{ horizontal:"center", vertical:"center", wrapText:true },
    border:{ bottom:{style:"medium",color:{rgb:"FFFFFF"}} }
  });
  const sHdrFinal = {
    font:{ name:"Arial", sz:11, bold:true, color:{rgb:"0D1526"} },
    fill:{ fgColor:{rgb:"10D98A"} },
    alignment:{ horizontal:"center", vertical:"center" },
    border:{ bottom:{style:"medium",color:{rgb:"0D1526"}} }
  };
  const sCell = (i) => ({
    font:{ name:"Arial", sz:11 },
    fill:{ fgColor:{rgb: i%2===0 ? "111E33" : "0D1526"} },
    alignment:{ horizontal:"left", vertical:"center" },
    border:{ bottom:{style:"thin",color:{rgb:"1A3050"}} }
  });
  const sCellCenter = (i) => ({
    ...sCell(i), alignment:{ horizontal:"center", vertical:"center" }
  });
  const sNota = (nota, i) => ({
    font:{ name:"Arial", sz:12, bold:true, color:{rgb: notaXlsxColor(nota)} },
    fill:{ fgColor:{rgb: i%2===0 ? "111E33" : "0D1526"} },
    alignment:{ horizontal:"center", vertical:"center" },
    border:{ bottom:{style:"thin",color:{rgb:"1A3050"}} }
  });
  const sNotaFinal = (nota, i) => ({
    font:{ name:"Arial", sz:13, bold:true, color:{rgb:"0D1526"} },
    fill:{ fgColor:{rgb: notaXlsxColor(nota)+"44".replace("44","") || "10D98A"} },
    alignment:{ horizontal:"center", vertical:"center" },
    border:{ bottom:{style:"thin",color:{rgb:"1A3050"}}, left:{style:"medium",color:{rgb:"10D98A"}} }
  });
  const sEmpty = { font:{ name:"Arial", sz:11, color:{rgb:"4A6080"} }, alignment:{horizontal:"center"} };

  // ── Construir hoja ────────────────────────────────────────
  const ws = {};
  const totalCols = 5 + misionesConDatos.length + 1;
  const encodeCol = (c) => { let s=""; while(c>=0){s=String.fromCharCode(65+c%26)+s;c=Math.floor(c/26)-1;} return s; };
  const cell = (r,c,v,s) => { ws[encodeCol(c)+r] = {v, s, t: typeof v==="number"?"n":"s"}; };

  // Fila 1: Título
  ws["A1"] = { v:"📊 NEXUS · Reporte de Notas", s:sTitle, t:"s" };
  ws["A2"] = { v:`Docente: ${docenteNombre || "—"}   ·   Generado: ${new Date().toLocaleDateString("es-CO", {day:"2-digit",month:"long",year:"numeric"})}`, s:sSub, t:"s" };
  ws["A3"] = { v:"", s:{}, t:"s" };

  // Merge título
  ws["!merges"] = [
    {s:{r:0,c:0},e:{r:0,c:totalCols-1}},
    {s:{r:1,c:0},e:{r:1,c:totalCols-1}},
    {s:{r:2,c:0},e:{r:2,c:totalCols-1}},
  ];

  // Fila 4: encabezados
  const HDR_ROW = 4;
  const fixedHdrs = ["#","Apellidos","Nombres","Grado","Grupo"];
  fixedHdrs.forEach((h,c) => cell(HDR_ROW, c, h, sHdr));
  misionesConDatos.forEach((m, i) => {
    cell(HDR_ROW, 5+i, m.title || `Misión ${i+1}`, sHdrMision(m.color || "#8B5CF6"));
  });
  cell(HDR_ROW, 5+misionesConDatos.length, "NOTA DEFINITIVA", sHdrFinal);

  // Filas de datos
  sorted.forEach((est, i) => {
    const ROW = HDR_ROW + 1 + i;
    const partes = (est.nombre_estudiante || "").split(" ");
    const nombres   = partes.slice(0, Math.ceil(partes.length/2)).join(" ");
    const apellidos = partes.slice(Math.ceil(partes.length/2)).join(" ") || partes[0];

    cell(ROW, 0, i+1,         sCellCenter(i));
    cell(ROW, 1, apellidos,   sCell(i));
    cell(ROW, 2, nombres,     sCell(i));
    cell(ROW, 3, est.grado||"—", sCellCenter(i));
    cell(ROW, 4, est.grupo||"—", sCellCenter(i));

    misionesConDatos.forEach((m, mi) => {
      const md = est.misiones?.[m.id];
      if (md && md.nota > 0) {
        const n = typeof md.nota === "number" ? md.nota : parseFloat(md.nota) || 1.0;
        cell(ROW, 5+mi, n, sNota(n, i));
      } else {
        ws[encodeCol(5+mi)+ROW] = { v:"—", s:sEmpty, t:"s" };
      }
    });

    const nd = est.nota_definitiva || 1.0;
    cell(ROW, 5+misionesConDatos.length, nd, sNotaFinal(nd, i));
  });

  // Dimensiones
  ws["!ref"] = `A1:${encodeCol(totalCols-1)}${HDR_ROW + sorted.length}`;
  ws["!rows"] = [
    { hpt:28 }, { hpt:18 }, { hpt:10 }, { hpt:36 },
    ...sorted.map(() => ({ hpt:26 }))
  ];
  ws["!cols"] = [
    { wch:5 }, { wch:24 }, { wch:20 }, { wch:8 }, { wch:8 },
    ...misionesConDatos.map(() => ({ wch:18 })),
    { wch:18 }
  ];
  ws["!freeze"] = { xSplit:0, ySplit:HDR_ROW };

  XLSX.utils.book_append_sheet(wb, ws, "Notas por Misión");

  // ── Hoja resumen ─────────────────────────────────────────
  const ws2 = {};
  ws2["A1"] = { v:"Misión", s:sHdr, t:"s" };
  ws2["B1"] = { v:"Estudiantes activos", s:sHdr, t:"s" };
  ws2["C1"] = { v:"Nota promedio", s:sHdr, t:"s" };
  ws2["D1"] = { v:"XP total", s:sHdr, t:"s" };

  misionesConDatos.forEach((m, i) => {
    const R = i + 2;
    const activos = sorted.filter(e => e.misiones?.[m.id]).length;
    const notas = sorted.map(e=>e.misiones?.[m.id]?.nota).filter(Boolean);
    const promedio = notas.length ? Math.round(notas.reduce((s,n)=>s+n,0)/notas.length*10)/10 : 0;
    const xpTotal = sorted.reduce((s,e)=>s+(e.misiones?.[m.id]?.xp||0),0);

    ws2[`A${R}`] = { v:`${m.icon||"📻"} ${m.title}`, s:sCell(i), t:"s" };
    ws2[`B${R}`] = { v:activos, s:sCellCenter(i), t:"n" };
    ws2[`C${R}`] = { v:promedio, s:sNota(promedio,i), t:"n" };
    ws2[`D${R}`] = { v:xpTotal, s:sCellCenter(i), t:"n" };
  });
  ws2["!ref"] = `A1:D${misionesConDatos.length+1}`;
  ws2["!cols"] = [{wch:30},{wch:20},{wch:16},{wch:14}];
  ws2["!rows"] = [{hpt:30},...misionesConDatos.map(()=>({hpt:24}))];
  XLSX.utils.book_append_sheet(wb, ws2, "Resumen Misiones");

  XLSX.writeFile(wb, filename + ".xlsx");
};

// Alias para reportes simples (sin misiones)
const downloadExcel = (rows, filename = "reporte_nexus") => {
  if (!rows?.length) return;
  downloadExcelMisiones(rows.map(r => ({
    nombre_estudiante: `${r.Nombres||""} ${r.Apellidos||""}`.trim() || r.nombre || "—",
    grado: r.Grado || r.grado,
    grupo: r.Grupo || r.grupo,
    nota_definitiva: parseFloat(r["Nota"] || r.nota || 1),
    misiones: {},
  })), [], filename);
};

const COLORES_MISION = ["#f97316","#eab308","#22c55e","#00c8ff","#8b5cf6","#ec4899","#14b8a6","#f43f5e"];
const ICONOS_MISION  = ["📻","📡","🦾","🔬","💡","🖥️","🤖","🎮","⚡","🔧","🌐","🧪"];

const buildPrompt = (subject="Tecnología e Informática", grade="7-11", extra="") => `
Eres NEXUS, compañero de retos académicos para estudiantes de grados ${grade} de la I.E. de Sabaneta, Colombia.
Asignatura: ${subject}.${extra?`\nContexto: ${extra}`:""}
PERSONALIDAD: Animado, motivador, como guía de aventuras. Nunca das respuestas directas.
METODOLOGÍA: 1) Pregunta qué sabe, 2) Una pista a la vez, 3) Celebra logros: "¡+20 puntos de maestría! ⭐"
Siempre en español colombiano, cálido y motivador.`;

// Prompt dinámico basado en los datos reales de la misión seleccionada
const buildMissionPrompt = (mision, grade="7-11", extraEquipo="", interaccionesUsadas=0) => {
  if (!mision) return buildPrompt("Tecnolog\u00eda e Inform\u00e1tica", grade, extraEquipo);
  const retosTexto = (mision.retos||[]).map((r,i)=>
    `  Reto ${r.id}: ${r.title} (${"\u2b50".repeat(r.stars)})${r.duracion?` [${r.duracion} ${r.tipo_duracion==="dias"?"día(s)":"hora(s)"}]`:""} \u2014 ${r.desc||"Sin descripci\u00f3n"}`
  ).join("\n");
  const restantes = Math.max(0, 10 - interaccionesUsadas);
  return `Eres NEXUS, tutor STEM gamificado para estudiantes de grado ${grade} de la I.E. de Sabaneta, Colombia.
Docente: ${mision.docente_nombre||"Docente"}.
MISI\u00d3N ACTIVA: "${mision.title}"
Descripci\u00f3n: ${mision.description||"Sin descripci\u00f3n"}
Retos disponibles:
${retosTexto||"  Sin retos definidos"}

\u2550\u2550 METODOLOG\u00cdA: EJERCICIOS PR\u00c1CTICOS \u2550\u2550
Cuando el estudiante elija un reto, DEBES:
1. GENERAR inmediatamente un EJERCICIO PR\u00c1CTICO concreto y creativo: un problema real, c\u00f3digo incompleto para completar, circuito para analizar, caso de estudio, experimento virtual o desaf\u00edo de dise\u00f1o \u2014 siempre relacionado con el reto elegido y con contexto colombiano si es posible.
2. Esperar la respuesta del estudiante.
3. EVALUAR la respuesta: si es incorrecta, dar UNA pista espec\u00edfica y reformular. Si mejora, celebrar y avanzar.
4. EVALUAR RESPUESTA del estudiante y al final incluir EXACTAMENTE UNA de estas l\u00edneas:
   - Respuesta excelente/completa/correcta \u2192 **+25 XP \u2b50\u2b50\u2b50 \u00a1Maestr\u00eda!**
   - Respuesta parcial/en buen camino      \u2192 **+15 XP \u2b50\u2b50 \u00a1Bien hecho!**
   - Solo intento/muy incompleto           \u2192 **+5 XP \u2b50 \u00a1Sigue intentando!**
   - Mensaje sin contenido real/fuera del tema \u2192 SIN XP (no incluir la l\u00ednea)
5. ACTIVIDADES SI NO LOGRA: si el estudiante no logra resolver, d\u00e1le actividades pr\u00e1cticas (ejercicios, analog\u00edas, ejemplos con contexto colombiano) que le permitan construir el conocimiento necesario para llegar a la soluci\u00f3n.

\u2550\u2550 TIP UNA SOLA VEZ AL INICIO DEL RETO \u2550\u2550
En tu PRIMER mensaje del reto, incluye esta frase: \u201c\ud83d\udca1 Si respondes todo correctamente en UN SOLO mensaje obtienes **+25 XP m\u00e1ximo** y puedes pasar al siguiente reto de inmediato.\u201d

\u2550\u2550 CONTADOR DE INTERACCIONES \u2550\u2550
Interacciones usadas en este reto: ${interaccionesUsadas}/10. Quedan: ${restantes}.
${restantes <= 3 && restantes > 0 ? `\u26a0\ufe0f QUEDAN SOLO ${restantes} INTERACCIONES. Ori\u00e9ntalo con pistas m\u00e1s directas y actividades cortas.` : ""}
${interaccionesUsadas >= 9 ? "\ud83c\udfc1 \u00daLTIMA INTERACCI\u00d3N: Eval\u00faa el desempe\u00f1o, celebra, resume lo aprendido y sug\u00edrale iniciar el siguiente reto." : ""}

\u2550\u2550 REGLAS \u2550\u2550
- NUNCA des la respuesta completa. Usa preguntas socr\u00e1ticas, pistas graduales y ejercicios.
- Si el estudiante logra responder todo correctamente desde el inicio, FELICIT\u00c1LO con energ\u00eda y sug\u00edrale el siguiente reto.
- Si el estudiante mejora respecto a su respuesta anterior, rec\u00f3nocelo explicitamente.
- Siempre en espa\u00f1ol colombiano, c\u00e1lido, motivador y cercano. \ud83d\ude80
${extraEquipo?`\n${extraEquipo}`:""}`;
};

const C = { bg:"#070d1a",surface:"#0d1526",card:"#111e33",border:"#1a3050",accent:"#00c8ff",accent2:"#8b5cf6",accent3:"#10d98a",text:"#e2e8f0",muted:"#4a6080",user:"#162040" };



// ─── Compañeros del mismo grado/grupo (para equipos) ─────────
const getCompaneros = async (grado, grupo, exclude_id) => {
  const params = new URLSearchParams({ grado, grupo, exclude_id: exclude_id||"" });
  const res = await fetch(`/api/companeros?${params}`);
  const data = await res.json();
  return data.companeros || [];
};

// ═══════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("login");
  const [loginErr, setLoginErr] = useState("");

  const login = async (payload) => {
    try {
      const res = await fetch("/api/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
      const data = await res.json();
      if (data.user) { setUser(data.user); setView(data.user.role==="admin"?"admin":data.user.role==="teacher"?"teacher":"student"); setLoginErr(""); }
      else setLoginErr(data.error || "No encontrado. Verifica tus datos.");
    } catch { setLoginErr("Error de conexión."); }
  };
  const logout = () => { setUser(null); setView("login"); };

  return (
    <div style={{ fontFamily:"'Syne','Inter',sans-serif", background:C.bg, color:C.text, height:"100vh", overflow:"hidden" }}>
      <div style={{ position:"fixed", inset:0, backgroundImage:`linear-gradient(rgba(0,200,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,.025) 1px,transparent 1px)`, backgroundSize:"36px 36px", pointerEvents:"none", zIndex:0 }} />
      {view==="login"   && <LoginView onLogin={login} error={loginErr} />}
      {view==="admin"   && <AdminView user={user} onLogout={logout} />}
      {view==="teacher" && <TeacherView user={user} onLogout={logout} />}
      {view==="student" && <StudentView user={user} onLogout={logout} />}
      <style>{CSS}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════
function LoginView({ onLogin, error }) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState("student");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [show, setShow] = useState(false);
  const [nombre, setNombre] = useState(""); const [apellido, setApellido] = useState("");
  const [grado, setGrado] = useState(""); const [grupo, setGrupo] = useState("");
  const handleSubmit = () => mode==="teacher" ? onLogin({ type:"teacher", email, password:pw }) : onLogin({ type:"student", nombre:nombre.trim(), apellido:apellido.trim(), grado, grupo });
  return (
    <div style={{ display:"flex", flexDirection: isMobile?"column":"row", height:"100vh", position:"relative", zIndex:5, overflowY:"auto" }}>
      {/* Panel izquierdo / header móvil */}
      <div style={{ flex: isMobile?0:1, background:`linear-gradient(135deg,#070d1a,#0d1f3c)`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding: isMobile?"24px 20px":"40px", borderRight: isMobile?"none":`1px solid ${C.border}`, borderBottom: isMobile?`1px solid ${C.border}`:"none" }}>
        <span style={{ fontSize: isMobile?44:72, color:C.accent, filter:`drop-shadow(0 0 20px ${C.accent})`, marginBottom:12 }}>⬡</span>
        <div style={{ fontFamily:"'Orbitron',monospace", fontSize: isMobile?24:36, fontWeight:900, color:C.accent, letterSpacing:4 }}>NEXUS</div>
        {!isMobile && <div style={{ fontSize:13, color:C.muted, letterSpacing:2, textAlign:"center", lineHeight:1.8, marginTop:8 }}>Plataforma Educativa<br/>I.E. Sabaneta</div>}
      </div>
      {/* Formulario */}
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding: isMobile?"20px 16px":"40px" }}>
        <div style={{ width:"100%", maxWidth:420 }}>
          <div style={{ display:"flex", background:C.surface, borderRadius:14, padding:4, marginBottom:24, border:`1px solid ${C.border}` }}>
            {[["student","🎓","Estudiante"],["teacher","📚","Docente"]].map(([m,ic,lb])=>(
              <button key={m} onClick={()=>setMode(m)} style={{ flex:1, padding:"11px 8px", borderRadius:10, border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize: isMobile?12:13, background:mode===m?`linear-gradient(135deg,${C.accent},${C.accent2})`:"transparent", color:mode===m?"#fff":C.muted }}>{ic} {lb}</button>
            ))}
          </div>
          {mode==="student" && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ textAlign:"center", marginBottom:4 }}><div style={{ fontSize: isMobile?16:18, fontWeight:800 }}>🎓 Ingreso Estudiantes</div></div>
              <div><div style={lbl}>Nombres</div><input style={inp} placeholder="Ej: Juan Carlos" value={nombre} onChange={e=>setNombre(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} /></div>
              <div><div style={lbl}>Apellidos</div><input style={inp} placeholder="Ej: Pérez García" value={apellido} onChange={e=>setApellido(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div><div style={lbl}>Grado</div><select style={inp} value={grado} onChange={e=>setGrado(e.target.value)}><option value="">-- Selecciona --</option>{["6","7","8","9","10","11"].map(g=><option key={g} value={g}>{g}</option>)}</select></div>
                <div><div style={lbl}>Grupo</div><select style={inp} value={grupo} onChange={e=>setGrupo(e.target.value)}><option value="">-- Selecciona --</option>{["1","2","3","4"].map(g=><option key={g} value={g}>Grupo {g}</option>)}</select></div>
              </div>
              {error && <div style={{ background:"#ff444422", border:"1px solid #ff444444", color:"#ff7777", padding:"10px 14px", borderRadius:8, fontSize:13 }}>{error}</div>}
              <button style={{ padding:"13px 20px", background:`linear-gradient(135deg,${C.accent3},#059669)`, border:"none", borderRadius:12, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer" }} onClick={handleSubmit} disabled={!nombre||!apellido||!grado||!grupo}>Entrar al aula NEXUS 🚀</button>
            </div>
          )}
          {mode==="teacher" && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ textAlign:"center" }}><div style={{ fontSize: isMobile?16:18, fontWeight:800 }}>📚 Ingreso Docentes</div></div>
              <div><div style={lbl}>Correo institucional</div><input style={inp} type="email" placeholder="usuario@sabaneta.edu.co" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} /></div>
              <div><div style={lbl}>Contraseña</div><div style={{ position:"relative" }}><input style={inp} type={show?"text":"password"} placeholder="••••••••" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} /><button style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:14 }} onClick={()=>setShow(!show)}>{show?"🙈":"👁️"}</button></div></div>
              {error && <div style={{ background:"#ff444422", border:"1px solid #ff444444", color:"#ff7777", padding:"10px 14px", borderRadius:8, fontSize:13 }}>{error}</div>}
              <button style={{ padding:"13px 20px", background:`linear-gradient(135deg,${C.accent},${C.accent2})`, border:"none", borderRadius:12, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer" }} onClick={handleSubmit} disabled={!email||!pw}>Ingresar ➤</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD PANEL
// ═══════════════════════════════════════════════════════════════
function DashboardPanel({ user, misiones }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtroGrado, setFiltroGrado] = useState("todos");
  const [filtroGrupo, setFiltroGrupo] = useState("todos");
  const [ordenAZ, setOrdenAZ] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    let ignore = false;
    const params = `?docente_id=${user.id}&role=${user.role==="admin"?"admin":"teacher"}`;
    fetch(`/api/stats${params}`)
      .then(r=>r.json())
      .then(d=>{ if(!ignore){ setStats(d); setLoading(false); } })
      .catch(()=>{ if(!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [user?.id]);

  const grados = stats?.porGrado ? Object.keys(stats.porGrado).sort() : [];
  let top = stats?.topEstudiantes || [];
  if (filtroGrado!=="todos") top = top.filter(e=>e.grado===filtroGrado);
  if (filtroGrupo!=="todos") top = top.filter(e=>e.grupo===filtroGrupo);
  if (ordenAZ) top = [...top].sort((a,b)=>a.nombre_estudiante.localeCompare(b.nombre_estudiante));

  return (
    <Page title={user.role==="admin"?"Panel de Administración":"📊 Mi Panel Docente"} desc={`Bienvenido, ${user.name}.`}>
      {loading && <div style={{ color:C.muted, fontSize:13, marginBottom:16 }}>⏳ Cargando estadísticas...</div>}
      <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr 1fr":"repeat(4,1fr)", gap:10, marginBottom:20 }}>
        {[["🎓","Estudiantes",stats?.resumen?.totalEstudiantes??0,C.accent],
          user.role==="admin"?["📚","Docentes",stats?.resumen?.totalDocentes??0,C.accent2]:["📚","Asignatura",user.subject||"—",C.accent2],
          ["🔥","Activos",stats?.resumen?.estudiantesActivos??0,C.accent3],
          ["⭐","XP Total",stats?.resumen?.xpTotal??0,"#f97316"]
        ].map(([ic,lb,val,col],i)=>(
          <div key={i} style={{ background:C.card, border:`1px solid ${col}44`, borderRadius:12, padding: isMobile?"12px 10px":16, textAlign:"center" }}>
            <div style={{ fontSize: isMobile?18:22, marginBottom:6 }}>{ic}</div>
            <div style={{ fontSize: isMobile?20:26, fontWeight:900, fontFamily:"'Orbitron',monospace", color:col }}>{val}</div>
            <div style={{ fontSize: isMobile?10:11, color:C.muted, marginTop:4 }}>{lb}</div>
          </div>
        ))}
      </div>

      {user.role==="admin" && (
        <div style={{ marginBottom:16, display:"flex", justifyContent:"flex-end" }}>
          <button onClick={async()=>{
            if(!confirm("¿Limpiar TODOS los datos de progreso?")) return;
            const r=await fetch("/api/usuarios",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accion:"limpiar_progreso"})});
            const d=await r.json();
            if(d.success){alert("✅ Datos limpiados.");window.location.reload();}
            else alert("Error: "+d.error);
          }} style={{ padding:"7px 16px", background:"#ff444422", border:"1px solid #ff444444", borderRadius:8, color:"#ff7777", fontSize:11, cursor:"pointer" }}>
            🗑️ Limpiar datos de prueba
          </button>
        </div>
      )}

      <Card title="🏆 Top Estudiantes">
        <div style={{ display:"flex", gap:8, marginBottom:12, alignItems:"center", flexWrap:"wrap" }}>
          <select style={{ ...inp, width:"auto", padding:"6px 10px", fontSize:12 }} value={filtroGrado} onChange={e=>{setFiltroGrado(e.target.value);setFiltroGrupo("todos");}}>
            <option value="todos">Todos los grados</option>{grados.map(g=><option key={g} value={g}>Grado {g}</option>)}
          </select>
          <select style={{ ...inp, width:"auto", padding:"6px 10px", fontSize:12 }} value={filtroGrupo} onChange={e=>setFiltroGrupo(e.target.value)}>
            <option value="todos">Todos los grupos</option>{["1","2","3","4"].map(g=><option key={g} value={g}>Grupo {g}</option>)}
          </select>
          <button onClick={()=>setOrdenAZ(!ordenAZ)} style={{ padding:"6px 10px", background:ordenAZ?`${C.accent2}33`:C.surface, border:`1px solid ${ordenAZ?C.accent2:C.border}`, borderRadius:8, color:ordenAZ?C.accent2:C.muted, fontSize:11, cursor:"pointer" }}>
            {ordenAZ?"🔤 A→Z":"🏆 XP"}
          </button>
          <button onClick={()=>downloadExcelMisiones(
              stats?.topEstudiantes||[],
              stats?.misiones||[],
              `NEXUS_Notas_${new Date().toLocaleDateString("es-CO").replace(/\//g,"-")}`,
              user?.name
            )} style={{ padding:"7px 14px", background:`linear-gradient(135deg,${C.accent3}33,${C.accent3}11)`,
              border:`1px solid ${C.accent3}66`, borderRadius:9, color:C.accent3, fontSize:11,
              cursor:"pointer", fontWeight:700 }}>
            📥 Descargar XLSX
          </button>
        </div>
        {top.length>0 ? top.slice(0,15).map((e,i)=>(
          <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", background:C.surface, borderRadius:10, marginBottom:5, border:`1px solid ${C.border}` }}>
            <span style={{ fontFamily:"'Orbitron',monospace", color:i===0?"#ffd700":i===1?"#c0c0c0":i===2?"#cd7f32":C.muted, fontWeight:900, fontSize:11, width:22 }}>#{i+1}</span>
            <div style={{ flex:1, minWidth:0 }}><div style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.nombre_estudiante}</div><div style={{ fontSize:10, color:C.muted }}>G{e.grado}·{e.grupo||"—"}</div></div>
            <div style={{ textAlign:"right", flexShrink:0 }}>
              <div style={{ fontFamily:"'Orbitron',monospace", color:C.accent3, fontWeight:700, fontSize:11 }}>{e.xp_total} XP</div>
              {(()=>{ const _n=e.nota_definitiva||xpToNota(e.xp_total); return <div style={{fontSize:11,fontWeight:800,color:notaColor(_n)}}>{_n.toFixed(1)}</div>; })()}
            </div>
          </div>
        )) : <div style={{ color:C.muted, fontSize:12 }}>Sin actividad registrada.</div>}
      </Card>

      <div style={{ display:"grid", gridTemplateColumns: isMobile?"1fr":"1fr 1fr", gap:14 }}>
        <Card title="🗺️ Misiones activas">
          {misiones.length>0?misiones.map(m=>(
            <div key={m.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", borderBottom:`1px solid ${C.border}` }}>
              <span style={{ fontSize:16 }}>{m.icon}</span>
              <div style={{ flex:1 }}><div style={{ fontSize:12, fontWeight:600, color:m.color }}>{m.title}</div><div style={{ fontSize:10, color:C.muted }}>{m.retos?.length||0} retos</div></div>
            </div>
          )):<div style={{ color:C.muted, fontSize:12 }}>Sin misiones creadas.</div>}
        </Card>
        <Card title="🕐 Actividad reciente">
          {stats?.actividadReciente?.length>0?stats.actividadReciente.slice(0,6).map((a,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:`1px solid ${C.border}` }}>
              <div style={{ flex:1 }}><div style={{ fontSize:11, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.nombre_estudiante}</div><div style={{ fontSize:10, color:C.muted }}>G{a.grado}·{new Date(a.updated_at).toLocaleDateString("es-CO")}</div></div>
              <span style={{ fontSize:11, color:C.accent3, fontWeight:600, flexShrink:0 }}>{a.xp_total} XP</span>
            </div>
          )):<div style={{ color:C.muted, fontSize:12 }}>Sin actividad reciente.</div>}
        </Card>
      </div>
    </Page>
  );
}

// ═══════════════════════════════════════════════════════════════
// PROGRESO PANEL
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// INFORME INDIVIDUAL DE CHAT — para docentes
// ═══════════════════════════════════════════════════════════════
function ChatInformePanel({ user }) {
  const [stats, setStats]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [selEst, setSelEst]       = useState(null);
  const [chatData, setChatData]   = useState([]);
  const [loadingChat, setLoadingChat] = useState(false);
  // Cascada: grado → grupo → lista
  const [filtroGrado, setFiltroGrado] = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState("");

  // Siempre cargar con docente_id — admin ve sus propios estudiantes por defecto
  useEffect(() => {
    let ignore = false;
    const params = `?docente_id=${user.id}&role=${user.role==="admin"?"admin":"teacher"}`;
    fetch("/api/stats" + params).then(r => r.json()).then(d => {
      if(!ignore){ setStats(d); setLoading(false); }
    }).catch(() => { if(!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [user.id]);

  const verChat = async (est) => {
    setSelEst(est); setLoadingChat(true); setChatData([]);
    try {
      const res = await fetch(`/api/savechat?estudiante_id=${est.estudiante_id}`);
      const d   = await res.json();
      setChatData(d.msgs || []);
    } catch(_) {}
    setLoadingChat(false);
  };

  // Grados disponibles ordenados
  const todosEstudiantes = stats?.topEstudiantes || [];
  const gradosDisp = [...new Set(todosEstudiantes.map(e=>e.grado))].filter(Boolean).sort((a,b)=>Number(a)-Number(b));
  const gruposDisp = filtroGrado
    ? [...new Set(todosEstudiantes.filter(e=>e.grado===filtroGrado).map(e=>e.grupo))].filter(Boolean).sort()
    : [];

  // Lista solo cuando grado+grupo están seleccionados
  const mostrarLista = filtroGrado && filtroGrupo;
  const estudiantesFiltrados = mostrarLista
    ? [...todosEstudiantes]
        .filter(e => e.grado===filtroGrado && e.grupo===filtroGrupo)
        .sort((a,b)=>(a.nombre_estudiante||"").localeCompare(b.nombre_estudiante||"","es"))
    : [];

  // Agrupar mensajes por misión para el informe individual
  const misionesMsgs = {};
  chatData.forEach(m => {
    const key = m.mision_title || "Modo libre";
    if (!misionesMsgs[key]) misionesMsgs[key] = [];
    misionesMsgs[key].push(m);
  });

  // ── Vista informe individual ──────────────────────────────────
  if (selEst) return (
    <Page title={`📋 Informe: ${selEst.nombre_estudiante}`}>
      <button onClick={() => setSelEst(null)} style={{ marginBottom:14, background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:13 }}>← Volver a lista</button>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14 }}>
        {[["🎓 Grado", selEst.grado||"—"], ["👥 Grupo", selEst.grupo||"—"],
          ["⭐ XP", selEst.xp_total||0], ["🏆 Nota", (selEst.nota_definitiva||1.0).toFixed(1)],
          ["💬 Mensajes", chatData.length]
        ].map(([k,v]) => (
          <div key={k} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:"7px 13px", fontSize:12 }}>
            <span style={{ color:C.muted }}>{k}: </span>
            <span style={{ fontWeight:800, color:C.accent }}>{v}</span>
          </div>
        ))}
      </div>
      {loadingChat && <div style={{ color:C.muted, fontSize:13 }}>⏳ Cargando chat...</div>}
      {!loadingChat && chatData.length === 0 && (
        <div style={{ color:C.muted, fontSize:13, padding:20, textAlign:"center", background:C.card, borderRadius:12 }}>
          📭 Este estudiante aún no tiene mensajes registrados en esta misión.
        </div>
      )}
      {!loadingChat && Object.entries(misionesMsgs).map(([mision, msgs]) => (
        <Card key={mision} title={`🗺️ ${mision} — ${msgs.length} mensajes`}>
          <div style={{ maxHeight:420, overflowY:"auto", display:"flex", flexDirection:"column", gap:8 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
                {m.role==="assistant" && (
                  <div style={{ width:24,height:24,borderRadius:"50%",background:`${C.accent}22`,border:`1px solid ${C.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:C.accent,flexShrink:0 }}>⬡</div>
                )}
                <div style={{ background:m.role==="user"?C.user:C.surface, border:`1px solid ${m.role==="user"?C.accent2+"44":C.border}`, borderRadius:m.role==="user"?"12px 3px 12px 12px":"3px 12px 12px 12px", padding:"8px 12px", maxWidth:"78%" }}>
                  <div style={{ fontSize:12, lineHeight:1.6 }} dangerouslySetInnerHTML={{ __html:sanitizeChat(m.content||"") }} />
                  <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>
                    {new Date(m.created_at).toLocaleString("es-CO")}
                    {m.xp_at_time?` · ${m.xp_at_time} XP`:""}
                    {m.equipo_nombre?` · Equipo: ${m.equipo_nombre}`:""}
                  </div>
                </div>
                {m.role==="user" && (
                  <div style={{ width:24,height:24,borderRadius:"50%",background:C.user,border:`1px solid ${C.accent2}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0 }}>👤</div>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </Page>
  );

  // ── Vista lista con cascada grado → grupo → estudiantes ───────
  return (
    <Page title="💬 Informes de Chat">
      {loading && <div style={{ color:C.muted }}>⏳ Cargando estudiantes...</div>}
      {!loading && <>
        {/* Paso 1: Seleccionar Grado */}
        <Card title="📚 Paso 1 — Selecciona el Grado">
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {gradosDisp.map(g => (
              <button key={g} onClick={()=>{setFiltroGrado(g);setFiltroGrupo("");setSelEst(null);}} style={{
                padding:"8px 18px", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:14,
                border:`2px solid ${filtroGrado===g?C.accent:C.border}`,
                background: filtroGrado===g?`${C.accent}22`:"transparent",
                color: filtroGrado===g?C.accent:C.muted,
              }}>{g}°</button>
            ))}
            {gradosDisp.length===0 && <div style={{ color:C.muted, fontSize:13 }}>Sin datos de estudiantes aún.</div>}
          </div>
        </Card>

        {/* Paso 2: Seleccionar Grupo (solo si hay grado) */}
        {filtroGrado && (
          <Card title={`👥 Paso 2 — Selecciona el Grupo (Grado ${filtroGrado})`}>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {gruposDisp.map(g => (
                <button key={g} onClick={()=>{setFiltroGrupo(g);setSelEst(null);}} style={{
                  padding:"8px 18px", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:14,
                  border:`2px solid ${filtroGrupo===g?C.accent2:C.border}`,
                  background: filtroGrupo===g?`${C.accent2}22`:"transparent",
                  color: filtroGrupo===g?C.accent2:C.muted,
                }}>Grupo {g}</button>
              ))}
            </div>
          </Card>
        )}

        {/* Paso 3: Lista de estudiantes (solo si grado + grupo seleccionados) */}
        {mostrarLista && (
          <Card title={`🎓 Grado ${filtroGrado} · Grupo ${filtroGrupo} — ${estudiantesFiltrados.length} estudiante${estudiantesFiltrados.length!==1?"s":""}`}>
            {estudiantesFiltrados.length===0
              ? <div style={{ color:C.muted, fontSize:13 }}>Sin estudiantes en este grupo con actividad.</div>
              : estudiantesFiltrados.map((e, i) => {
                  const nota = e.nota_definitiva || 1.0;
                  return (
                    <div key={i} onClick={() => verChat(e)}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
                        background:C.surface, borderRadius:10, marginBottom:6,
                        border:`1px solid ${C.border}`, cursor:"pointer" }}
                      onMouseEnter={el=>el.currentTarget.style.borderColor=C.accent+"66"}
                      onMouseLeave={el=>el.currentTarget.style.borderColor=C.border}
                    >
                      <div style={{ width:34,height:34,borderRadius:"50%",background:`${C.accent3}22`,border:`1.5px solid ${C.accent3}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0 }}>🎓</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700 }}>{e.nombre_estudiante||"—"}</div>
                        <div style={{ fontSize:10, color:C.muted }}>{e.xp_total||0} XP · Nivel {e.nivel||1}</div>
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0 }}>
                        <div style={{ fontSize:15, fontWeight:900, color:notaColor(nota), fontFamily:"'Orbitron',monospace" }}>{nota.toFixed(1)}</div>
                        <div style={{ fontSize:10, color:C.accent }}>Ver chat →</div>
                      </div>
                    </div>
                  );
                })
            }
          </Card>
        )}
      </>}
    </Page>
  );
}

function ProgresoPanel({ user }) {
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  // Cascada: grado → grupo → lista
  const [filtroGrado, setFiltroGrado] = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState("");

  // Siempre cargar con docente_id — admin ve sus propios estudiantes por defecto
  useEffect(() => {
    let ignore = false;
    const params = `?docente_id=${user.id}&role=${user.role==="admin"?"admin":"teacher"}`;
    fetch(`/api/stats${params}`)
      .then(r=>r.json())
      .then(d=>{ if(!ignore){ setStats(d); setLoading(false); } })
      .catch(()=>{ if(!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [user?.id]);

  const todosEstudiantes = stats?.topEstudiantes || [];
  const gradosDisp = [...new Set(todosEstudiantes.map(e=>e.grado))].filter(Boolean).sort((a,b)=>Number(a)-Number(b));
  const gruposDisp = filtroGrado
    ? [...new Set(todosEstudiantes.filter(e=>e.grado===filtroGrado).map(e=>e.grupo))].filter(Boolean).sort()
    : [];
  const mostrarLista = filtroGrado && filtroGrupo;
  const estudiantesFiltrados = mostrarLista
    ? [...todosEstudiantes]
        .filter(e => e.grado===filtroGrado && e.grupo===filtroGrupo)
        .sort((a,b)=>(a.nombre_estudiante||"").localeCompare(b.nombre_estudiante||"","es"))
    : [];

  // Actividad por grado (solo de los propios)
  const porGradoLocal = {};
  todosEstudiantes.forEach(e => {
    const g = e.grado||"?";
    if(!porGradoLocal[g]) porGradoLocal[g] = { count:0, xp:0 };
    porGradoLocal[g].count++;
    porGradoLocal[g].xp += e.xp_total||0;
  });
  const gradosActividad = Object.keys(porGradoLocal).sort((a,b)=>Number(a)-Number(b));
  const maxXP = Math.max(...gradosActividad.map(g=>porGradoLocal[g].xp), 1);

  return (
    <Page title="📊 Progreso Estudiantil">
      {/* Botón limpiar — solo admin/teacher */}
      {user.role !== "student" && (
        <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
          <button onClick={async () => {
            if (!confirm("⚠️ ¿Eliminar TODO el progreso y chats de TUS estudiantes?\n\nSe borrarán:\n• Todos los chats y conversaciones\n• Todo el XP y notas\n\nEsta acción NO se puede deshacer.")) return;
            // Borrar progreso
            const r1 = await fetch("/api/usuarios", {
              method:"POST", headers:{"Content-Type":"application/json"},
              body: JSON.stringify({ accion:"limpiar_progreso_docente", docente_id: user.id })
            });
            const d = await r1.json();
            if (d.success) { alert(`✅ Progreso limpiado. ${d.estudiantesAfectados||0} estudiante(s) reseteados.`); window.location.reload(); }
            else alert("Error: " + (d.error||"desconocido"));
          }} style={{ padding:"7px 16px", background:"#ef444415", border:"1px solid #ef444455",
            borderRadius:9, color:"#ef4444", fontSize:11, cursor:"pointer", fontWeight:700,
            display:"flex", alignItems:"center", gap:6 }}>
            🗑️ Borrar todo el progreso y chats
          </button>
        </div>
      )}
      {loading && <div style={{ color:C.muted, fontSize:13 }}>⏳ Cargando...</div>}

      {!loading && stats?.sinMisiones && (
        <div style={{ background:`${C.accent2}10`, border:`1px solid ${C.accent2}33`, borderRadius:14, padding:"24px 20px", textAlign:"center", marginTop:16 }}>
          <div style={{ fontSize:32, marginBottom:12 }}>🗺️</div>
          <div style={{ fontSize:16, fontWeight:800, color:C.accent2, marginBottom:8 }}>Aún no tienes misiones creadas</div>
          <div style={{ fontSize:13, color:C.muted, lineHeight:1.7 }}>
            El progreso aparecerá aquí cuando tus estudiantes trabajen en tus misiones.<br/>
            Ve a <strong style={{color:C.accent}}>Mis Misiones</strong> para crear la primera. 🚀
          </div>
        </div>
      )}

      {!loading && stats && !stats.sinMisiones && <>
        {/* Resumen actividad por grado */}
        {gradosActividad.length > 0 && (
          <Card title="📈 Actividad por Grado">
            {gradosActividad.map(g => {
              const d = porGradoLocal[g];
              return (
                <div key={g} onClick={()=>{setFiltroGrado(g);setFiltroGrupo("");}}
                  style={{ marginBottom:10, cursor:"pointer", padding:"4px 6px", borderRadius:8,
                    background: filtroGrado===g?`${C.accent}11`:"transparent",
                    border: `1px solid ${filtroGrado===g?C.accent+"44":"transparent"}` }}
                >
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:filtroGrado===g?C.accent:C.text }}>
                      {filtroGrado===g?"▶ ":""}Grado {g}
                    </span>
                    <span style={{ fontSize:10, color:C.muted }}>{d.count} est. · {d.xp} XP</span>
                  </div>
                  <div style={{ height:7, background:C.border, borderRadius:4 }}>
                    <div style={{ height:"100%", width:`${Math.round(d.xp/maxXP*100)}%`, background:`linear-gradient(90deg,${C.accent},${C.accent2})`, borderRadius:4 }} />
                  </div>
                </div>
              );
            })}
            <div style={{ fontSize:11, color:C.muted, marginTop:6 }}>💡 Clic en un grado para filtrar abajo</div>
          </Card>
        )}

        {/* Paso 1: Seleccionar Grado */}
        <Card title="📚 Paso 1 — Selecciona el Grado">
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {gradosDisp.map(g => (
              <button key={g} onClick={()=>{setFiltroGrado(g);setFiltroGrupo("");}} style={{
                padding:"8px 18px", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:14,
                border:`2px solid ${filtroGrado===g?C.accent:C.border}`,
                background: filtroGrado===g?`${C.accent}22`:"transparent",
                color: filtroGrado===g?C.accent:C.muted,
              }}>{g}°</button>
            ))}
          </div>
        </Card>

        {/* Paso 2: Seleccionar Grupo */}
        {filtroGrado && (
          <Card title={`👥 Paso 2 — Selecciona el Grupo (Grado ${filtroGrado})`}>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {gruposDisp.map(g => (
                <button key={g} onClick={()=>setFiltroGrupo(g)} style={{
                  padding:"8px 18px", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:14,
                  border:`2px solid ${filtroGrupo===g?C.accent2:C.border}`,
                  background: filtroGrupo===g?`${C.accent2}22`:"transparent",
                  color: filtroGrupo===g?C.accent2:C.muted,
                }}>Grupo {g}</button>
              ))}
            </div>
          </Card>
        )}

        {/* Paso 3: Lista de estudiantes */}
        {mostrarLista && (
          <Card title={`🎓 Grado ${filtroGrado} · Grupo ${filtroGrupo} — ${estudiantesFiltrados.length} estudiante${estudiantesFiltrados.length!==1?"s":""}`}>
            <div style={{ marginBottom:10 }}>
              <button onClick={()=>downloadExcelMisiones(
                estudiantesFiltrados, stats?.misiones||[],
                `NEXUS_Grado${filtroGrado}_Grupo${filtroGrupo}_${new Date().toLocaleDateString("es-CO").replace(/\//g,"-")}`,
                user.name
              )} style={{ padding:"7px 14px", background:`linear-gradient(135deg,${C.accent3}33,${C.accent3}11)`,
                border:`1px solid ${C.accent3}66`, borderRadius:9, color:C.accent3, fontSize:11,
                cursor:"pointer", fontWeight:700, display:"flex", alignItems:"center", gap:5 }}>
                📥 Descargar XLSX · Grado {filtroGrado} Grp.{filtroGrupo}
              </button>
              <button onClick={()=>downloadExcelMisiones(
                todosEstudiantes, stats?.misiones||[],
                `NEXUS_TodosMisEstudiantes_${new Date().toLocaleDateString("es-CO").replace(/\//g,"-")}`,
                user.name
              )} style={{ padding:"7px 14px", background:`linear-gradient(135deg,${C.accent}22,${C.accent}11)`,
                border:`1px solid ${C.accent}44`, borderRadius:9, color:C.accent, fontSize:11,
                cursor:"pointer", fontWeight:700, display:"flex", alignItems:"center", gap:5 }}>
                📥 Descargar XLSX · Todos mis estudiantes
              </button>
            </div>
            {estudiantesFiltrados.length===0
              ? <div style={{ color:C.muted, fontSize:13 }}>Sin actividad en este grupo aún.</div>
              : estudiantesFiltrados.map((e, i) => {
                  const nota = e.nota_definitiva || xpToNota(e.xp_total);
                  const misionesEst = Object.entries(e.misiones||{});
                  const misionesConNota = (stats?.misiones||[]).filter(m => e.misiones?.[m.id]);
                  return (
                    <div key={i} style={{ background:C.surface, borderRadius:10, marginBottom:8, border:`1px solid ${C.border}`, overflow:"hidden" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px" }}>
                        <span style={{ fontFamily:"'Orbitron',monospace", color:i===0?"#ffd700":i===1?"#c0c0c0":i===2?"#cd7f32":C.muted, fontSize:10, width:22, fontWeight:900, flexShrink:0 }}>#{i+1}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.nombre_estudiante}</div>
                          <div style={{ fontSize:10, color:C.muted }}>Nivel {e.nivel||1} · {e.xp_total||0} XP</div>
                        </div>
                        <div style={{ textAlign:"right", flexShrink:0 }}>
                          <div style={{ fontSize:10, color:C.muted }}>Nota definitiva</div>
                          <div style={{ fontFamily:"'Orbitron',monospace", fontSize:18, fontWeight:900, color:notaColor(nota) }}>{nota.toFixed(1)}</div>
                        </div>
                      </div>
                      {misionesConNota.length > 0 && (
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap", padding:"6px 12px 10px", borderTop:`1px solid ${C.border}` }}>
                          {misionesConNota.map(m => {
                            const nd = e.misiones[m.id]?.nota || 1.0;
                            return (
                              <div key={m.id} style={{ display:"flex", flexDirection:"column", alignItems:"center",
                                background:`${m.color||C.accent}15`, border:`1px solid ${m.color||C.accent}33`,
                                borderRadius:8, padding:"4px 10px", minWidth:70 }}>
                                <div style={{ fontSize:9, color:C.muted, marginBottom:2, textAlign:"center", maxWidth:80, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.icon} {m.title}</div>
                                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:14, fontWeight:900, color:notaColor(nd) }}>{nd.toFixed(1)}</div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
            }
          </Card>
        )}
      </>}
    </Page>
  );
}

// ═══════════════════════════════════════════════════════════════
// MISIONES PANEL
// ═══════════════════════════════════════════════════════════════
function MisionesPanel({ user, misiones, setMisiones, loadingM }) {
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ title:"", icon:"📻", color:"#f97316", description:"", retos:[], grados:[], colaboradores:[] });
  const [retoF, setRetoF] = useState({ title:"", desc:"", stars:1, duracion:"", tipo_duracion:"horas" });
  const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(false); const [deleting, setDeleting] = useState(null);
  const [filtroDocente, setFiltroDocente] = useState("yo");
  const [docentesColabs, setDocentesColabs] = useState([]);
  useEffect(()=>{ fetch("/api/usuarios").then(r=>r.json()).then(d=>setDocentesColabs(d.docentes||[])).catch(()=>{}); },[]);

  const iniciarNueva = () => { setForm({ title:"", icon:"📻", color:"#f97316", description:"", retos:[], grados:[], colaboradores:[] }); setEditando("nueva"); };
  const iniciarEditar = (m) => { setForm({ id:m.id, title:m.title, icon:m.icon, color:m.color, description:m.description, retos:m.retos.map(r=>({...r})), grados:m.grados||[], colaboradores:m.colaboradores||[] }); setEditando(m.id); };
  const agregarReto = () => { if(!retoF.title) return; setForm(p=>({...p,retos:[...p.retos,{id:p.retos.length+1,...retoF}]})); setRetoF({title:"",desc:"",stars:1,duracion:"",tipo_duracion:"horas"}); };
  const quitarReto = (idx) => setForm(p=>({...p,retos:p.retos.filter((_,i)=>i!==idx).map((r,i=>({...r,id:i+1})))}));
  const toggleColab = (id) => setForm(p=>({...p,colaboradores:p.colaboradores.includes(String(id))?p.colaboradores.filter(x=>x!==String(id)):[...p.colaboradores,String(id)]}));

  const guardar = async () => {
    if(!form.title||form.retos.length===0) return;
    setSaving(true);
    if(editando==="nueva"){ const n=await createMision(user.id,user.name,{title:form.title,icon:form.icon,color:form.color,description:form.description,retos:form.retos,grados:form.grados,colaboradores:form.colaboradores||[]}); if(n) setMisiones(prev=>[...prev,n]); }
    else { const a=await updateMision(user.id,{id:form.id,title:form.title,icon:form.icon,color:form.color,description:form.description,retos:form.retos,grados:form.grados,colaboradores:form.colaboradores||[]}); if(a) setMisiones(prev=>prev.map(m=>m.id===form.id?a:m)); }
    setSaving(false); setSaved(true); setTimeout(()=>{setSaved(false);setEditando(null);},1500);
  };
  const eliminar = async (id) => {
    if(!confirm("¿Eliminar esta misión?")) return;
    setDeleting(id); await deleteMision(id,user.id,user.role);
    setMisiones(prev=>prev.filter(m=>m.id!==id)); setDeleting(null);
  };

  // Filtrar misiones según selección del admin
  const misionesFiltradas = user.role==="admin"
    ? filtroDocente==="yo"
      ? misiones.filter(m => String(m.docente_id) === String(user.id))
      : misiones.filter(m => String(m.docente_id) === filtroDocente)
    : misiones;

  // Lista de docentes únicos en las misiones (para el selector)
  const docentesEnMisiones = user.role==="admin"
    ? [...new Map(misiones.filter(m=>String(m.docente_id)!==String(user.id))
        .map(m=>[m.docente_id, { id:m.docente_id, nombre:m.docente_nombre||"Docente" }])).values()]
    : [];

  if(!editando) return (
    <Page title="🗺️ Gestión de Misiones" desc="Solo tú ves y editas tus misiones.">
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center", marginBottom:14 }}>
        <Btn onClick={iniciarNueva}>+ Nueva Misión</Btn>
        {user.role==="admin" && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
            {/* Chip: mis misiones */}
            <button onClick={()=>setFiltroDocente("yo")} style={{
              padding:"6px 14px", borderRadius:20, cursor:"pointer", fontSize:12, fontWeight:700,
              border:`2px solid ${filtroDocente==="yo"?C.accent:C.border}`,
              background: filtroDocente==="yo"?`${C.accent}22`:"transparent",
              color: filtroDocente==="yo"?C.accent:C.muted,
            }}>
              {filtroDocente==="yo"?"✓ ":""}Mis misiones ({misiones.filter(m=>String(m.docente_id)===String(user.id)).length})
            </button>
            {/* Chips por cada docente */}
            {docentesEnMisiones.map(d=>(
              <button key={d.id} onClick={()=>setFiltroDocente(String(d.id))} style={{
                padding:"6px 14px", borderRadius:20, cursor:"pointer", fontSize:12, fontWeight:600,
                border:`2px solid ${filtroDocente===String(d.id)?"#f97316":C.border}`,
                background: filtroDocente===String(d.id)?"#f9741622":"transparent",
                color: filtroDocente===String(d.id)?"#f97316":C.muted,
              }}>
                {filtroDocente===String(d.id)?"✓ ":""}{d.nombre.split(" ")[0]} ({misiones.filter(m=>String(m.docente_id)===String(d.id)).length})
              </button>
            ))}
          </div>
        )}
      </div>
      {loadingM&&<div style={{ color:C.muted, fontSize:13 }}>⏳ Cargando misiones...</div>}
      {!loadingM&&misionesFiltradas.length===0&&(
        <div style={{ color:C.muted, fontSize:13, padding:20, textAlign:"center" }}>
          {filtroDocente==="yo"?"¡Crea tu primera misión! 🚀":"Este docente aún no tiene misiones."}
        </div>
      )}
      {misionesFiltradas.map(m=>(
        <div key={m.id} style={{ background:C.card, border:`1px solid ${m.color}44`, borderRadius:14, padding:16, marginBottom:12, display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:32 }}>{m.icon}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:14, fontWeight:700, color:m.color }}>{m.title}</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{m.description}</div>
            <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>
              {m.retos?.length||0} reto{m.retos?.length!==1?"s":""}
              {m.es_colaborador && <span style={{ marginLeft:6, padding:"1px 6px", borderRadius:5, background:`${C.accent2}22`, color:C.accent2, fontWeight:700 }}>🤝 Colaborador</span>}
              {user.role==="admin" && filtroDocente!=="yo" && !m.es_colaborador
                ? <span style={{ marginLeft:4, color:"#f97316", fontWeight:600 }}>· {m.docente_nombre||"—"}</span>
                : ""}
              {(m.colaboradores||[]).length > 0 && !m.es_colaborador && (
                <span style={{ marginLeft:6, color:C.accent2 }}>· 🤝 {(m.colaboradores||[]).length} colaborador(es)</span>
              )}
              {(m.grados||[]).length>0
                ? <span style={{ marginLeft:6, color:m.color||C.accent, fontWeight:700 }}>
                    · Grado(s): {(m.grados||[]).sort((a,b)=>Number(a)-Number(b)).join(", ")}
                  </span>
                : <span style={{ marginLeft:6, color:C.muted }}> · Todos los grados</span>
              }
            </div>
          </div>
          <div style={{ display:"flex", gap:6, flexShrink:0 }}>
            {!m.es_colaborador && <button onClick={()=>iniciarEditar(m)} style={{ padding:"6px 12px", background:`${C.accent}22`, border:`1px solid ${C.accent}44`, borderRadius:8, color:C.accent, fontSize:11, cursor:"pointer" }}>✏️</button>}
            {!m.es_colaborador && <button onClick={()=>eliminar(m.id)} disabled={deleting===m.id} style={{ padding:"6px 12px", background:"#ff444422", border:"1px solid #ff444444", borderRadius:8, color:"#ff7777", fontSize:11, cursor:"pointer" }}>{deleting===m.id?"...":"🗑️"}</button>}
            {m.es_colaborador && <span style={{ fontSize:10, color:C.muted, padding:"6px 10px" }}>Solo lectura</span>}
          </div>
        </div>
      ))}
    </Page>
  );

  return (
    <Page title={editando==="nueva"?"➕ Nueva Misión":"✏️ Editar Misión"}>
      <button onClick={()=>setEditando(null)} style={{ marginBottom:14, background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:13 }}>← Volver</button>
      <Card title="📋 Info general">
        <div style={grid2}>
          <div><div style={lbl}>Título</div><input style={inp} value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} /></div>
          <div><div style={lbl}>Ícono</div><div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>{ICONOS_MISION.map(ic=><button key={ic} onClick={()=>setForm(p=>({...p,icon:ic}))} style={{ width:34,height:34,borderRadius:8,border:`2px solid ${form.icon===ic?C.accent:C.border}`,background:form.icon===ic?`${C.accent}22`:C.surface,fontSize:16,cursor:"pointer" }}>{ic}</button>)}</div></div>
        </div>
        <div style={{ marginBottom:12 }}><div style={lbl}>Descripción</div><input style={inp} value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} /></div>
        <div style={{ marginBottom:12 }}>
          <div style={lbl}>🎓 Grados a los que va dirigida</div>
          <div style={{ fontSize:11, color:C.muted, marginBottom:7 }}>Selecciona uno o más grados. Los estudiantes de esos grados verán esta misión.</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {["6","7","8","9","10","11"].map(g=>{
              const sel = (form.grados||[]).includes(g);
              return (
                <button key={g} type="button" onClick={()=>setForm(p=>({
                  ...p,
                  grados: sel ? p.grados.filter(x=>x!==g) : [...(p.grados||[]),g]
                }))} style={{
                  padding:"6px 14px", borderRadius:8, cursor:"pointer", fontFamily:"inherit",
                  fontWeight:700, fontSize:13, transition:"all .15s",
                  border:`2px solid ${sel?form.color:C.border}`,
                  background: sel?form.color+"33":"transparent",
                  color: sel?form.color:C.muted,
                }}>
                  {sel?"✓ ":""}{g}°
                </button>
              );
            })}
          </div>
          {(form.grados||[]).length===0 && (
            <div style={{ marginTop:6, fontSize:11, color:"#f97316" }}>
              ⚠️ Sin grado seleccionado — todos los estudiantes verán esta misión
            </div>
          )}
          {(form.grados||[]).length>0 && (
            <div style={{ marginTop:6, fontSize:11, color:C.accent3 }}>
              ✅ Visible para: Grado(s) {form.grados.sort((a,b)=>Number(a)-Number(b)).join(", ")}
            </div>
          )}
        </div>
        <div><div style={lbl}>Color</div><div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>{COLORES_MISION.map(col=><button key={col} onClick={()=>setForm(p=>({...p,color:col}))} style={{ width:30,height:30,borderRadius:"50%",background:col,border:`3px solid ${form.color===col?"#fff":col}`,cursor:"pointer",transform:form.color===col?"scale(1.2)":"scale(1)" }} />)}</div>
          <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:10 }}><span style={{ fontSize:26 }}>{form.icon}</span><span style={{ fontSize:14, fontWeight:700, color:form.color }}>{form.title||"Vista previa"}</span></div>
        </div>
      </Card>
      <Card title="⭐ Retos">
        {form.retos.map((r,i)=>(
          <div key={i} style={{ display:"flex", gap:8, padding:"9px 10px", background:C.surface, borderRadius:8, marginBottom:7, border:`1px solid ${C.border}`, alignItems:"flex-start" }}>
            <span style={{ fontFamily:"'Orbitron',monospace", color:form.color, fontWeight:900, fontSize:12, width:18 }}>{r.id}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600 }}>{r.title} {"⭐".repeat(r.stars)}</div>
              <div style={{ fontSize:11, color:C.muted }}>{r.desc}</div>
              {r.duracion && <div style={{ fontSize:10, color:"#06b6d4", marginTop:3 }}>⏱️ {r.duracion} {r.tipo_duracion==="dias"?"día(s)":"hora(s)"}</div>}
            </div>
            <button onClick={()=>quitarReto(i)} style={{ background:"none",border:"none",color:"#ff7777",cursor:"pointer",fontSize:15 }}>✕</button>
          </div>
        ))}
        <div style={{ background:`${C.accent}08`, border:`1px dashed ${C.accent}44`, borderRadius:10, padding:12, marginTop:8 }}>
          <div style={{ fontSize:12, color:C.accent, fontWeight:600, marginBottom:10 }}>+ Agregar reto</div>
          <div style={grid2}>
            <div><div style={lbl}>Título del reto</div><input style={inp} value={retoF.title} onChange={e=>setRetoF(p=>({...p,title:e.target.value}))} /></div>
            <div><div style={lbl}>Dificultad</div><select style={inp} value={retoF.stars} onChange={e=>setRetoF(p=>({...p,stars:Number(e.target.value)}))}>
              <option value={1}>⭐ Básico</option><option value={2}>⭐⭐ Intermedio</option><option value={3}>⭐⭐⭐ Avanzado</option>
            </select></div>
          </div>
          <div style={{ marginTop:8 }}><div style={lbl}>Descripción del reto</div><textarea style={{ ...inp, minHeight:56, resize:"vertical" }} value={retoF.desc} onChange={e=>setRetoF(p=>({...p,desc:e.target.value}))} /></div>
          {/* Duración del reto */}
          <div style={{ display:"flex", gap:8, marginTop:10, alignItems:"flex-end" }}>
            <div style={{ flex:1 }}>
              <div style={lbl}>⏱️ Tiempo para resolver (opcional)</div>
              <input type="number" min="1" style={inp} placeholder="Ej: 2" value={retoF.duracion} onChange={e=>setRetoF(p=>({...p,duracion:e.target.value}))} />
            </div>
            <div style={{ width:130 }}>
              <div style={lbl}>Unidad</div>
              <select style={inp} value={retoF.tipo_duracion} onChange={e=>setRetoF(p=>({...p,tipo_duracion:e.target.value}))}>
                <option value="horas">Horas</option>
                <option value="dias">Días</option>
              </select>
            </div>
          </div>
          <button onClick={agregarReto} disabled={!retoF.title} style={{ marginTop:10, padding:"7px 14px", background:`${C.accent3}22`, border:`1px solid ${C.accent3}44`, borderRadius:8, color:C.accent3, fontSize:12, cursor:"pointer" }}>Agregar reto ✚</button>
        </div>
      </Card>

      {/* Colaboradores docentes */}
      {(user.role==="admin"||user.role==="teacher") && docentesColabs.filter(d=>String(d.id)!==String(user.id)).length > 0 && (
        <Card title="🤝 Docentes Colaboradores (misión compartida)">
          <div style={{ fontSize:11, color:C.muted, marginBottom:12, lineHeight:1.7 }}>
            Agrega colegas que podrán ver los informes y equipos de esta misión.<br/>
            <span style={{ color:C.accent3 }}>Los colaboradores NO pueden editarla, solo consultarla.</span>
          </div>
          {docentesColabs.filter(d=>String(d.id)!==String(user.id)).map(d=>{
            const sel = (form.colaboradores||[]).includes(String(d.id));
            return (
              <div key={d.id} onClick={()=>toggleColab(d.id)}
                style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px",
                  background:sel?`${C.accent2}15`:C.surface, borderRadius:10, marginBottom:7,
                  border:`1px solid ${sel?C.accent2:C.border}`, cursor:"pointer" }}>
                <div style={{ width:30,height:30,borderRadius:"50%",background:`${C.accent2}22`,
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0 }}>
                  {sel ? "✓" : "📚"}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:sel?700:400 }}>{d.nombres} {d.apellidos}</div>
                  <div style={{ fontSize:10, color:C.muted }}>{d.asignatura||"Sin asignatura"} · {d.email}</div>
                </div>
                {sel && <span style={{ fontSize:10, color:C.accent2, fontWeight:700 }}>✓ Colaborador</span>}
              </div>
            );
          })}
          {(form.colaboradores||[]).length > 0 && (
            <div style={{ marginTop:8, padding:"8px 12px", background:`${C.accent2}10`, borderRadius:8, fontSize:11, color:C.accent2 }}>
              🤝 {(form.colaboradores||[]).length} docente(s) colaborador(es) agregado(s)
            </div>
          )}
        </Card>
      )}

      <div style={{ display:"flex", gap:10 }}>
        <Btn onClick={guardar} disabled={!form.title||form.retos.length===0||saving}>{saved?"✅ Guardado":saving?"Guardando...":editando==="nueva"?"Crear Misión 🚀":"Guardar ✔️"}</Btn>
        <button onClick={()=>setEditando(null)} style={{ padding:"11px 18px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:10, color:C.muted, fontSize:13, cursor:"pointer" }}>Cancelar</button>
      </div>
    </Page>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADMIN VIEW
// ═══════════════════════════════════════════════════════════════
function AdminView({ user, onLogout }) {
  const [tab, setTab] = useState("dashboard");
  const [misiones, setMisiones] = useState([]); const [loadingM, setLoadingM] = useState(true);
  useEffect(()=>{ getMisiones(user.id,"admin").then(m=>{ setMisiones(m); setLoadingM(false); }); },[]);
  return (
    <Layout sidebar={<Sidebar user={user} onLogout={onLogout} tab={tab} setTab={setTab} tabs={[
      {id:"dashboard",icon:"⬡",label:"Dashboard"},{id:"progreso",icon:"📊",label:"Progreso"},
      {id:"missions",icon:"🗺️",label:"Misiones"},{id:"equipos",icon:"👥",label:"Equipos"},
      {id:"chats",icon:"💬",label:"Informes Chat"},{id:"users",icon:"🔑",label:"Usuarios"},
    ]} />}>
      {tab==="dashboard"&&<DashboardPanel user={user} misiones={misiones} />}
      {tab==="progreso"&&<ProgresoPanel user={user} />}
      {tab==="missions"&&<MisionesPanel user={user} misiones={misiones} setMisiones={setMisiones} loadingM={loadingM} />}
      {tab==="equipos"&&<EquiposPanel user={user} />}
      {tab==="chats"&&<ChatInformePanel user={user} />}
      {tab==="users"&&<AdminUsuarios />}
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════
// TEACHER VIEW
// ═══════════════════════════════════════════════════════════════
function TeacherView({ user, onLogout }) {
  const [tab, setTab] = useState("dashboard");
  const [misiones, setMisiones] = useState([]); const [loadingM, setLoadingM] = useState(true);
  const [cfg, setCfg] = useState({ subject:user.subject||"", grade:"7-11", topics:"", tone:"motivador" });
  const [saved, setSaved] = useState(false);
  useEffect(()=>{ getMisiones(user.id,"teacher").then(m=>{ setMisiones(m); setLoadingM(false); }); },[user.id]);
  return (
    <Layout sidebar={<Sidebar user={user} onLogout={onLogout} tab={tab} setTab={setTab} tabs={[
      {id:"dashboard",icon:"⬡",label:"Dashboard"},{id:"progreso",icon:"📊",label:"Progreso"},
      {id:"missions",icon:"🗺️",label:"Mis Misiones"},{id:"equipos",icon:"👥",label:"Equipos"},
      {id:"chats",icon:"💬",label:"Informes Chat"},{id:"config",icon:"⚙️",label:"Mi NEXUS"},{id:"preview",icon:"👁️",label:"Vista previa"},
    ]} />}>
      {tab==="dashboard"&&<DashboardPanel user={user} misiones={misiones} />}
      {tab==="progreso"&&<ProgresoPanel user={user} />}
      {tab==="missions"&&<MisionesPanel user={user} misiones={misiones} setMisiones={setMisiones} loadingM={loadingM} />}
      {tab==="equipos"&&<EquiposPanel user={user} />}
      {tab==="chats"&&<ChatInformePanel user={user} />}
      {tab==="config"&&(
        <Page title="⚙️ Configura NEXUS">
          <Card title="📚 Asignatura"><div style={grid2}>
            <div><div style={lbl}>Asignatura</div><input style={inp} value={cfg.subject} onChange={e=>setCfg({...cfg,subject:e.target.value})} /></div>
            <div><div style={lbl}>Grados</div><input style={inp} value={cfg.grade} onChange={e=>setCfg({...cfg,grade:e.target.value})} /></div>
          </div></Card>
          <Card title="📋 Temas"><textarea style={{ ...inp, minHeight:80, resize:"vertical", marginBottom:12 }} value={cfg.topics} onChange={e=>setCfg({...cfg,topics:e.target.value})} />
            <select style={inp} value={cfg.tone} onChange={e=>setCfg({...cfg,tone:e.target.value})}>
              <option value="motivador">Motivador</option><option value="formal">Formal</option><option value="socrático">Socrático</option>
            </select>
          </Card>
          <Btn onClick={()=>{setSaved(true);setTimeout(()=>setSaved(false),2000)}}>{saved?"✅ ¡Guardado!":"Guardar"}</Btn>
        </Page>
      )}
      {tab==="preview"&&<Page title="Vista previa"><NexusChat prompt={buildPrompt(cfg.subject||"Tecnología",cfg.grade,cfg.topics)} userName="Explorador" compact user={null} misionId={null} /></Page>}
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADMIN USUARIOS
// ═══════════════════════════════════════════════════════════════
function AdminUsuarios() {
  const [tab, setTab]       = useState("docentes");
  const [data, setData]     = useState({ docentes:[], estudiantes:[] });
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [buscar, setBuscar] = useState("");
  // Filtros grado/grupo para estudiantes
  const [filtroGradoU, setFiltroGradoU] = useState("todos");
  const [filtroGrupoU, setFiltroGrupoU] = useState("todos");

  // ── Formulario crear docente ──
  const [formDoc, setFormDoc] = useState({ nombres:"", apellidos:"", email:"", asignatura:"", password:"" });
  const [savingDoc, setSavingDoc] = useState(false);
  const [msgDoc, setMsgDoc] = useState(null);

  // ── Formulario crear estudiante ──
  const [formEst, setFormEst] = useState({ nombres:"", apellidos:"", grado:"6", grupo:"1", docente_id:"" });
  const [savingEst, setSavingEst] = useState(false);
  const [msgEst, setMsgEst] = useState(null);

  // ── Formulario asignar docente → grados/grupos ──
  const [asigDoc,   setAsigDoc]   = useState("");
  const [asigGrados, setAsigGrados] = useState([]);
  const [asigGrupos, setAsigGrupos] = useState([]);
  const [savingAsig, setSavingAsig] = useState(false);
  const [msgAsig,  setMsgAsig]   = useState(null);

  const cargar = () => {
    setLoading(true); setApiError(null);
    fetch("/api/usuarios").then(r=>r.json())
      .then(d=>{ setData({ docentes:d.docentes||[], estudiantes:d.estudiantes||[] }); setLoading(false); })
      .catch(err=>{ setApiError(err.message); setLoading(false); });
  };
  useEffect(()=>cargar(),[]);

  const eliminar = async (id, tipo, nombre) => {
    if(!confirm(`¿Eliminar a ${nombre}?`)) return;
    setDeleting(id);
    try {
      const r=await fetch(`/api/usuarios?id=${id}&tipo=${tipo}`,{method:"DELETE"});
      const d=await r.json();
      if(d.success) cargar(); else alert("Error: "+d.error);
    } catch(e){ alert("Error: "+e.message); }
    setDeleting(null);
  };

  const crearDocente = async () => {
    if(!formDoc.nombres||!formDoc.apellidos||!formDoc.email||!formDoc.password) return;
    setSavingDoc(true); setMsgDoc(null);
    try {
      const r=await fetch("/api/usuarios",{ method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ accion:"crear_docente", ...formDoc }) });
      const d=await r.json();
      if(d.success){ setMsgDoc({ok:true,txt:`✅ Docente ${d.docente.nombres} creado`}); setFormDoc({nombres:"",apellidos:"",email:"",asignatura:"",password:""}); cargar(); }
      else setMsgDoc({ok:false,txt:"❌ "+d.error});
    } catch(e){ setMsgDoc({ok:false,txt:"❌ "+e.message}); }
    setSavingDoc(false);
  };

  const crearEstudiante = async () => {
    if(!formEst.nombres||!formEst.apellidos||!formEst.grado||!formEst.grupo) return;
    setSavingEst(true); setMsgEst(null);
    try {
      const r=await fetch("/api/usuarios",{ method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ accion:"crear_estudiante", ...formEst }) });
      const d=await r.json();
      if(d.success){ setMsgEst({ok:true,txt:`✅ Estudiante ${d.estudiante.nombres} creado`}); setFormEst({nombres:"",apellidos:"",grado:"6",grupo:"1",docente_id:""}); cargar(); }
      else setMsgEst({ok:false,txt:"❌ "+d.error});
    } catch(e){ setMsgEst({ok:false,txt:"❌ "+e.message}); }
    setSavingEst(false);
  };

  const asignarDocente = async () => {
    if(!asigDoc||asigGrados.length===0) return;
    setSavingAsig(true); setMsgAsig(null);
    try {
      const r=await fetch("/api/usuarios",{ method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ accion:"asignar_docente", docente_id:asigDoc, grados:asigGrados, grupos:asigGrupos.length>0?asigGrupos:null }) });
      const d=await r.json();
      if(d.success){ setMsgAsig({ok:true,txt:`✅ Estudiantes de grado(s) ${asigGrados.join(", ")} asignados`}); cargar(); }
      else setMsgAsig({ok:false,txt:"❌ "+d.error});
    } catch(e){ setMsgAsig({ok:false,txt:"❌ "+e.message}); }
    setSavingAsig(false);
  };

  const toggleArr = (arr, setArr, val) =>
    setArr(prev => prev.includes(val) ? prev.filter(x=>x!==val) : [...prev, val]);

  const lista    = tab==="docentes" ? (data.docentes||[]) : (data.estudiantes||[]);
  // Grados y grupos disponibles para filtros (solo estudiantes)
  const gradosDisponibles = [...new Set((data.estudiantes||[]).map(e=>e.grado).filter(Boolean))].sort((a,b)=>Number(a)-Number(b));
  const gruposDisponibles = filtroGradoU==="todos"
    ? [...new Set((data.estudiantes||[]).map(e=>e.grupo).filter(Boolean))].sort()
    : [...new Set((data.estudiantes||[]).filter(e=>e.grado===filtroGradoU).map(e=>e.grupo).filter(Boolean))].sort();

  const filtrada = lista.filter(u => {
    const n=`${u.nombres||""} ${u.apellidos||""}`.toLowerCase();
    const textMatch = n.includes(buscar.toLowerCase())||(u.email||"").toLowerCase().includes(buscar.toLowerCase())||(u.asignatura||"").toLowerCase().includes(buscar.toLowerCase())||(u.grado||"").includes(buscar);
    if (tab==="estudiantes") {
      const gradoMatch = filtroGradoU==="todos" || u.grado===filtroGradoU;
      const grupoMatch = filtroGrupoU==="todos" || u.grupo===filtroGrupoU;
      return textMatch && gradoMatch && grupoMatch;
    }
    return textMatch;
  });

  const chipBtn = (val, arr, setArr, color=C.accent2) => (
    <button key={val} onClick={()=>toggleArr(arr,setArr,val)}
      style={{ padding:"4px 10px", borderRadius:6, border:`1px solid ${arr.includes(val)?color:C.border}`,
        background:arr.includes(val)?color+"33":"transparent", color:arr.includes(val)?color:C.muted,
        fontSize:11, cursor:"pointer", fontFamily:"inherit", fontWeight:arr.includes(val)?700:400 }}>
      {val}
    </button>
  );

  return (
    <Page title="👥 Gestión de Usuarios">
      {/* ── Tabs ── */}
      <div style={{ display:"flex", background:C.surface, borderRadius:12, padding:4, marginBottom:18, border:`1px solid ${C.border}`, width:"fit-content", gap:4 }}>
        {[["docentes","📚","Docentes",data.docentes?.length],["estudiantes","🎓","Estudiantes",data.estudiantes?.length],["nuevo","➕","Registrar",null],["asignar","🔗","Asignar",null]].map(([t,ic,lb,cnt])=>(
          <button key={t} onClick={()=>{setTab(t);setBuscar("");}} style={{ padding:"8px 14px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:12, background:tab===t?`linear-gradient(135deg,${C.accent},${C.accent2})`:"transparent", color:tab===t?"#fff":C.muted }}>
            {ic} {lb} {cnt!=null&&<span style={{ fontSize:11, opacity:0.8 }}>({cnt??0})</span>}
          </button>
        ))}
      </div>

      {/* ── Lista docentes / estudiantes ── */}
      {(tab==="docentes"||tab==="estudiantes")&&<>
        <div style={{ marginBottom:12 }}>
          <input style={{ ...inp, maxWidth:320 }} placeholder="Buscar..." value={buscar} onChange={e=>setBuscar(e.target.value)} />
        </div>

        {/* Filtros grado / grupo (solo en pestaña estudiantes) */}
        {tab==="estudiantes" && gradosDisponibles.length > 0 && (
          <div style={{ background:"#0d1a2e", border:"1px solid #1a3050", borderRadius:14, padding:"14px 16px", marginBottom:10 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#4a6080", textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>📚 Grado</div>
            <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom: gruposDisponibles.length > 0 ? 14 : 0 }}>
              {["todos", ...gradosDisponibles].map(g => (
                <button key={g} onClick={() => { setFiltroGradoU(g); setFiltroGrupoU("todos"); }}
                  style={{ padding:"7px 16px", borderRadius:10, cursor:"pointer", fontFamily:"inherit",
                    fontWeight:700, fontSize:13,
                    border:`2px solid ${filtroGradoU===g ? C.accent : "#1a3050"}`,
                    background: filtroGradoU===g ? C.accent+"22" : "transparent",
                    color: filtroGradoU===g ? C.accent : "#4a6080" }}>
                  {g==="todos" ? "Todos" : g+"°"}
                </button>
              ))}
            </div>
            {gruposDisponibles.length > 0 && (
              <>
                <div style={{ fontSize:11, fontWeight:700, color:"#4a6080", textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>👥 Grupo</div>
                <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
                  {["todos", ...gruposDisponibles].map(g => (
                    <button key={g} onClick={() => setFiltroGrupoU(g)}
                      style={{ padding:"7px 16px", borderRadius:10, cursor:"pointer", fontFamily:"inherit",
                        fontWeight:700, fontSize:13,
                        border:`2px solid ${filtroGrupoU===g ? C.accent2 : "#1a3050"}`,
                        background: filtroGrupoU===g ? C.accent2+"22" : "transparent",
                        color: filtroGrupoU===g ? C.accent2 : "#4a6080" }}>
                      {g==="todos" ? "Todos" : "Grupo "+g}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {loading&&<div style={{ color:C.muted, fontSize:13 }}>⏳ Cargando...</div>}
        {apiError&&<div style={{ background:"#ff444422", border:"1px solid #ff444444", color:"#ff7777", padding:"10px 14px", borderRadius:8, fontSize:13, marginBottom:12 }}>⚠️ {apiError}</div>}
        {!loading&&(
          <Card title={`${tab==="docentes"?"📚 Docentes":"🎓 Estudiantes"} — ${filtrada.length} resultado${filtrada.length!==1?"s":""}`}>
            {filtrada.length===0&&<div style={{ color:C.muted, fontSize:12 }}>Sin resultados.</div>}
            {filtrada.map(u=>{
              const docAsig = tab==="estudiantes" ? data.docentes.find(d=>String(d.id)===String(u.docente_id)) : null;
              return (
                <div key={u.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:C.surface, borderRadius:10, marginBottom:7, border:`1px solid ${C.border}` }}>
                  <div style={{ width:36,height:36,borderRadius:"50%",background:tab==="docentes"?`${C.accent2}22`:`${C.accent3}22`,border:`1.5px solid ${tab==="docentes"?C.accent2:C.accent3}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0 }}>{tab==="docentes"?"📚":"🎓"}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.nombres||"—"} {u.apellidos||""}</div>
                    <div style={{ fontSize:10, color:C.muted }}>
                      {tab==="docentes"
                        ?(u.email||"Sin email")+(u.asignatura?` · ${u.asignatura}`:"")
                        :`G${u.grado||"—"}·Grp${u.grupo||"—"} · ${docAsig?docAsig.nombres+" "+docAsig.apellidos:"⚠️ Sin docente"}`}
                    </div>
                  </div>
                  <div style={{ fontSize:10, color:C.muted, flexShrink:0 }}>{u.fecha_registro?new Date(u.fecha_registro).toLocaleDateString("es-CO"):"—"}</div>
                  <button onClick={()=>eliminar(u.id,tab==="docentes"?"docente":"estudiante",`${u.nombres} ${u.apellidos}`)} disabled={deleting===u.id}
                    style={{ padding:"5px 12px", background:"#ff444422", border:"1px solid #ff444444", borderRadius:8, color:"#ff7777", fontSize:11, cursor:"pointer", flexShrink:0 }}>
                    {deleting===u.id?"...":"🗑️"}
                  </button>
                </div>
              );
            })}
          </Card>
        )}
      </>}

      {/* ── Registrar nuevo usuario ── */}
      {tab==="nuevo"&&<>
        <Card title="📚 Registrar Docente Nuevo">
          <div style={grid2}>
            <div><div style={lbl}>Nombres</div><input style={inp} value={formDoc.nombres} onChange={e=>setFormDoc(p=>({...p,nombres:e.target.value}))} placeholder="Ej: María Camila" /></div>
            <div><div style={lbl}>Apellidos</div><input style={inp} value={formDoc.apellidos} onChange={e=>setFormDoc(p=>({...p,apellidos:e.target.value}))} placeholder="Ej: González Ruiz" /></div>
          </div>
          <div style={grid2}>
            <div><div style={lbl}>Correo institucional</div><input style={inp} value={formDoc.email} onChange={e=>setFormDoc(p=>({...p,email:e.target.value}))} placeholder="correo@sabaneta.edu.co" /></div>
            <div><div style={lbl}>Asignatura</div><input style={inp} value={formDoc.asignatura} onChange={e=>setFormDoc(p=>({...p,asignatura:e.target.value}))} placeholder="Ej: Matemáticas" /></div>
          </div>
          <div style={{ marginBottom:12 }}><div style={lbl}>Contraseña inicial</div><input type="password" style={inp} value={formDoc.password} onChange={e=>setFormDoc(p=>({...p,password:e.target.value}))} placeholder="El docente la puede cambiar después" /></div>
          {msgDoc&&<div style={{ padding:"8px 12px", borderRadius:8, background:msgDoc.ok?"#10d98a22":"#ff444422", border:`1px solid ${msgDoc.ok?"#10d98a44":"#ff444444"}`, color:msgDoc.ok?"#10d98a":"#ff7777", fontSize:12, marginBottom:10 }}>{msgDoc.txt}</div>}
          <Btn onClick={crearDocente} disabled={savingDoc||!formDoc.nombres||!formDoc.apellidos||!formDoc.email||!formDoc.password}>{savingDoc?"Guardando...":"Crear Docente 📚"}</Btn>
          <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>💡 Después de crear el docente, ve a la pestaña <strong style={{color:C.accent}}>Asignar</strong> para vincularle sus estudiantes.</div>
        </Card>

        <Card title="🎓 Registrar Estudiante Nuevo">
          <div style={grid2}>
            <div><div style={lbl}>Nombres</div><input style={inp} value={formEst.nombres} onChange={e=>setFormEst(p=>({...p,nombres:e.target.value}))} placeholder="Ej: Juan David" /></div>
            <div><div style={lbl}>Apellidos</div><input style={inp} value={formEst.apellidos} onChange={e=>setFormEst(p=>({...p,apellidos:e.target.value}))} placeholder="Ej: Restrepo López" /></div>
          </div>
          <div style={grid2}>
            <div><div style={lbl}>Grado</div>
              <select style={inp} value={formEst.grado} onChange={e=>setFormEst(p=>({...p,grado:e.target.value}))}>
                {["6","7","8","9","10","11"].map(g=><option key={g} value={g}>Grado {g}</option>)}
              </select>
            </div>
            <div><div style={lbl}>Grupo</div>
              <select style={inp} value={formEst.grupo} onChange={e=>setFormEst(p=>({...p,grupo:e.target.value}))}>
                {["1","2","3","4"].map(g=><option key={g} value={g}>Grupo {g}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom:12 }}><div style={lbl}>Docente asignado</div>
            <select style={inp} value={formEst.docente_id} onChange={e=>setFormEst(p=>({...p,docente_id:e.target.value}))}>
              <option value="">— Seleccionar docente —</option>
              {data.docentes.map(d=><option key={d.id} value={d.id}>{d.nombres} {d.apellidos} · {d.asignatura||"Sin asignatura"}</option>)}
            </select>
          </div>
          {msgEst&&<div style={{ padding:"8px 12px", borderRadius:8, background:msgEst.ok?"#10d98a22":"#ff444422", border:`1px solid ${msgEst.ok?"#10d98a44":"#ff444444"}`, color:msgEst.ok?"#10d98a":"#ff7777", fontSize:12, marginBottom:10 }}>{msgEst.txt}</div>}
          <Btn onClick={crearEstudiante} disabled={savingEst||!formEst.nombres||!formEst.apellidos}>{savingEst?"Guardando...":"Crear Estudiante 🎓"}</Btn>
        </Card>
      </>}

      {/* ── Asignar docente a estudiantes existentes ── */}
      {tab==="asignar"&&<>
        <Card title="🔗 Asignar Docente a Estudiantes Existentes">
          <div style={{ fontSize:12, color:C.muted, marginBottom:16, lineHeight:1.7, background:`${C.accent2}10`, border:`1px solid ${C.accent2}22`, borderRadius:10, padding:"10px 14px" }}>
            Usa esto cuando registres un docente nuevo o cuando necesites reasignar grados.<br/>
            Selecciona el docente, los grados y opcionalmente los grupos. Se actualizarán todos esos estudiantes.
          </div>
          <div style={{ marginBottom:14 }}>
            <div style={lbl}>Docente</div>
            <select style={inp} value={asigDoc} onChange={e=>setAsigDoc(e.target.value)}>
              <option value="">— Seleccionar docente —</option>
              {data.docentes.map(d=><option key={d.id} value={d.id}>{d.nombres} {d.apellidos} · {d.asignatura||"Sin asignatura"}</option>)}
            </select>
          </div>
          <div style={{ marginBottom:14 }}>
            <div style={lbl}>Grados (selecciona uno o más)</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {["6","7","8","9","10","11"].map(g=>chipBtn(g,asigGrados,setAsigGrados,C.accent))}
            </div>
          </div>
          <div style={{ marginBottom:16 }}>
            <div style={lbl}>Grupos (opcional — vacío = todos los grupos)</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {["1","2","3","4"].map(g=>chipBtn(g,asigGrupos,setAsigGrupos,C.accent3))}
            </div>
            {asigGrupos.length===0&&<div style={{ fontSize:10, color:C.muted, marginTop:4 }}>Sin filtro de grupo — se asignarán todos los grupos de los grados seleccionados</div>}
          </div>
          {msgAsig&&<div style={{ padding:"8px 12px", borderRadius:8, background:msgAsig.ok?"#10d98a22":"#ff444422", border:`1px solid ${msgAsig.ok?"#10d98a44":"#ff444444"}`, color:msgAsig.ok?"#10d98a":"#ff7777", fontSize:12, marginBottom:10 }}>{msgAsig.txt}</div>}
          <Btn onClick={asignarDocente} disabled={savingAsig||!asigDoc||asigGrados.length===0}>{savingAsig?"Asignando...":"Asignar estudiantes 🔗"}</Btn>
        </Card>

        <Card title="📊 Estado actual de asignaciones">
          {loading?<div style={{ color:C.muted, fontSize:12 }}>⏳ Cargando...</div>:<>
            {data.docentes.map(d=>{
              const suyos = (data.estudiantes||[]).filter(e=>String(e.docente_id)===String(d.id));
              const porGrado = {};
              suyos.forEach(e=>{ porGrado[e.grado]=(porGrado[e.grado]||0)+1; });
              return (
                <div key={d.id} style={{ padding:"10px 12px", background:C.surface, borderRadius:10, marginBottom:8, border:`1px solid ${C.border}` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <span>📚</span>
                    <div style={{ fontWeight:700, fontSize:12 }}>{d.nombres} {d.apellidos}</div>
                    <div style={{ fontSize:10, color:C.muted }}>· {d.asignatura||"Sin asignatura"}</div>
                    <div style={{ marginLeft:"auto", fontSize:11, color:C.accent3, fontWeight:700 }}>{suyos.length} estudiantes</div>
                  </div>
                  {suyos.length>0
                    ? <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                        {Object.entries(porGrado).sort().map(([g,cnt])=>(
                          <span key={g} style={{ padding:"2px 8px", borderRadius:5, fontSize:10, background:`${C.accent}22`, color:C.accent }}>Grado {g}: {cnt}</span>
                        ))}
                      </div>
                    : <div style={{ fontSize:11, color:"#f97316" }}>⚠️ Sin estudiantes asignados</div>
                  }
                </div>
              );
            })}
            {(data.estudiantes||[]).filter(e=>!e.docente_id).length>0&&(
              <div style={{ padding:"10px 12px", background:"#f9731611", border:"1px solid #f9731633", borderRadius:10, marginTop:8 }}>
                <div style={{ fontSize:12, color:"#f97316", fontWeight:700 }}>⚠️ Estudiantes sin docente asignado: {(data.estudiantes||[]).filter(e=>!e.docente_id).length}</div>
                <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>Estos estudiantes ven TODAS las misiones. Asígnalos a un docente.</div>
              </div>
            )}
          </>}
        </Card>
      </>}
    </Page>
  );
}

// ═══════════════════════════════════════════════════════════════
// STUDENT PROGRESS CARD — carga datos reales de la BD
// ═══════════════════════════════════════════════════════════════
function StudentProgressCard({ user }) {
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    fetch(`/api/stats?docente_id=${user.docente_id||""}&role=student`)
      .then(r=>r.json())
      .then(d=>{
        if(!ignore){
          const yo = (d.topEstudiantes||[]).find(e=>String(e.estudiante_id)===String(user.id));
          setDatos(yo||null); setLoading(false);
        }
      })
      .catch(()=>{ if(!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [user.id]);

  if (loading) return <div style={{ color:C.muted, fontSize:12, padding:12 }}>⏳ Cargando tu progreso...</div>;
  if (!datos)  return <div style={{ color:C.muted, fontSize:12, padding:12 }}>Aún no tienes actividad registrada. ¡Empieza una misión! 🚀</div>;

  const xp = datos.xp_total || 0;
  const nota = xpToNota(xp);
  const pct = Math.round(Math.min(xp / 250, 1) * 100);

  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:20, marginTop:14 }}>
      <div style={{ fontSize:13, fontWeight:700, marginBottom:16, color:C.accent }}>📊 Tu desempeño en NEXUS</div>

      {/* Nota grande */}
      <div style={{ textAlign:"center", marginBottom:20 }}>
        <div style={{ fontSize:11, color:C.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>Nota actual</div>
        <div style={{ fontSize:56, fontWeight:900, fontFamily:"'Orbitron',monospace", color:notaColor(nota), lineHeight:1 }}>{nota.toFixed(1)}</div>
        <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>{pct}% de desarrollo · {xp} XP</div>
      </div>

      {/* Barra de progreso */}
      <div style={{ marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:C.muted, marginBottom:5 }}>
          <span>1.0 · Inicio</span><span>3.0 · Básico</span><span>5.0 · Experto</span>
        </div>
        <div style={{ height:10, background:C.border, borderRadius:5, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${notaColor(nota)},${C.accent2})`, borderRadius:5, transition:"width 1s ease" }} />
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:C.muted, marginTop:3 }}>
          <span>0 XP</span><span>125 XP</span><span>250 XP</span>
        </div>
      </div>

      {/* Detalles */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        {[["⭐","XP Acumulado",xp,"#f97316"],["🏆","Nivel",datos.nivel||1,C.accent],["📈","Avance",`${pct}%`,C.accent2],["🎓","Nota",nota.toFixed(1),notaColor(nota)]].map(([ic,lb,val,col])=>(
          <div key={lb} style={{ background:C.surface, borderRadius:10, padding:"10px 12px", border:`1px solid ${col}33`, textAlign:"center" }}>
            <div style={{ fontSize:20, marginBottom:4 }}>{ic}</div>
            <div style={{ fontSize:16, fontWeight:900, fontFamily:"'Orbitron',monospace", color:col }}>{val}</div>
            <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{lb}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop:12, padding:"10px 14px", background:`${C.accent2}10`, borderRadius:10, border:`1px solid ${C.accent2}22`, fontSize:11, color:C.muted, lineHeight:1.7 }}>
        💡 Cada reto tiene <strong style={{color:C.accent3}}>10 interacciones</strong>.
        Respuestas excelentes: <strong style={{color:C.accent3}}>+25 XP ⭐⭐⭐</strong> · Buenas: <strong style={{color:C.accent3}}>+15 XP ⭐⭐</strong>.
        Con <strong style={{color:C.accent}}>250 XP</strong> (10 respuestas perfectas) alcanzas nota <strong style={{color:"#10d98a"}}>5.0</strong>.
        </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// STUDENT VIEW — con modo equipo
// ═══════════════════════════════════════════════════════════════
function StudentView({ user, onLogout }) {
  const [tab, setTab] = useState("chat");
  const [mission, setMission] = useState(null);
  const [misiones, setMisiones] = useState([]);
  const [equipo, setEquipo] = useState(null);
  const [showEquipo, setShowEquipo] = useState(false);
  // retoActual: { id, title, stars, idx } — reto seleccionado dentro de la misión
  const [retoActual, setRetoActual] = useState(null);
  const isMobile = useIsMobile();

  // Al cambiar misión, resetear reto
  useEffect(() => { setRetoActual(null); }, [mission]);

  // Cargar misiones del docente asignado y filtrar por grado del estudiante
  useEffect(()=>{
    getMisiones(user.docente_id||"","student").then(m=>{
      const filtradas = m.filter(mision => {
        if(!mision.grados || mision.grados.length===0) return true;
        return mision.grados.includes(String(user.grade));
      });
      setMisiones(filtradas);
    });
  },[user.docente_id, user.grade]);

  // ── Restaurar equipo activo al volver a iniciar sesión ────────
  useEffect(()=>{
    if (!user?.id) return;
    fetch(`/api/companeros?restaurar=1&estudiante_id=${user.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.equipo && d.equipo.nombre) {
          setEquipo(d.equipo);
        }
      })
      .catch(() => {});
  }, [user?.id]);
  const missionData = misiones.find(m=>m.id===mission);

  return (
    <Layout sidebar={<Sidebar user={user} onLogout={onLogout} tab={tab} setTab={setTab} tabs={[
      {id:"chat",icon:"⬡",label:"NEXUS Chat"},
      {id:"missions",icon:"🗺️",label:"Misiones"},
      {id:"team",icon:"👥",label:"Mi Equipo"},
      {id:"progress",icon:"⭐",label:"Mi Progreso"},
    ]} />}>
      {tab==="chat"&&(
        <div style={{ flex:1, minHeight:0, display:"flex", flexDirection:"column", overflow:"hidden", height:"100%" }}>
          <div style={{ padding: isMobile?"6px 12px 0":"14px 22px 0", flexShrink:0 }}>
            {!isMobile && <h1 style={{ ...ptitle, fontSize:22, marginBottom:8 }}>NEXUS · Tu compañero de retos</h1>}
            <div style={{ display:"flex", gap:6, marginBottom: isMobile?6:8, flexWrap:"wrap" }}>
              {mission&&<div style={{ display:"flex", alignItems:"center", gap:6, background:C.card, border:`1px solid ${missionData?.color}44`, borderRadius:10, padding:isMobile?"4px 8px":"6px 10px", fontSize:isMobile?10:11, flex:1, minWidth:0 }}>
                <span style={{flexShrink:0}}>{missionData?.icon}</span>
                <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>Misión: <strong>{missionData?.title}</strong></span>
                <button style={{ marginLeft:4, background:"none", border:"none", color:C.muted, cursor:"pointer", flexShrink:0, fontSize:14, lineHeight:1 }} onClick={()=>setMission(null)}>✕</button>
              </div>}
              {equipo&&<div style={{ display:"flex", alignItems:"center", gap:5, background:`${C.accent2}15`, border:`1px solid ${C.accent2}44`, borderRadius:10, padding:isMobile?"4px 8px":"6px 10px", fontSize:isMobile?10:11, color:C.accent2, cursor:"pointer", flexShrink:0 }} onClick={()=>setShowEquipo(true)}>
                👥 {isMobile?equipo.nombre:`${equipo.nombre} (${equipo.integrantes.length+1})`}
              </div>}
              {!mission&&<div style={{ display:"flex", alignItems:"center", gap:4, background:`${C.accent3}15`, border:`1px solid ${C.accent3}44`, borderRadius:10, padding:isMobile?"4px 8px":"6px 10px", fontSize:isMobile?10:11, color:C.accent3 }}>💬 {isMobile?"Libre":"Modo libre"}</div>}
            </div>
          </div>
          <div style={{ flex:1, overflow:"hidden", minHeight:0, padding: isMobile?"0":"0 22px 22px", display:"flex", flexDirection:"column" }}>
            <NexusChat
              prompt={buildMissionPrompt(
                missionData||null,
                user.grade||"7-11",
                equipo?`Trabajan en equipo: "${equipo.nombre}" con ${equipo.integrantes.length+1} integrantes. Líder: ${user.name}. Compañeros: ${equipo.integrantes.map(i=>`${i.nombres} ${i.apellidos}`).join(", ")}. Dirígete al equipo completo e incluye actividades para que todos participen aunque solo uno tenga el dispositivo.`:""
              )}
              userName={equipo?`Equipo ${equipo.nombre}`:user.name}
              user={user} misionId={mission} equipo={equipo} misionData={missionData||null} misionTitle={missionData?.title||null}
              retoActual={retoActual} setRetoActual={setRetoActual} todosRetos={missionData?.retos||[]}
            />
          </div>
        </div>
      )}
      {tab==="missions"&&<Page title="🗺️ Misiones"><MissionMap misiones={misiones} onSelect={(mId, reto)=>{setMission(mId);if(reto)setRetoActual(reto);setTab("chat");}} /></Page>}
      {tab==="team"&&<EquipoPanel user={user} equipo={equipo} setEquipo={setEquipo} onIrChat={()=>setTab("chat")} />}
      {tab==="progress"&&<Page title="⭐ Mi Progreso">
        <InfoBox title={`🎓 ${user.name}`}>
          <Row k="Grado" v={user.grade||"—"} />
          <Row k="Grupo" v={user.group||"—"} />
        </InfoBox>
        <StudentProgressCard user={user} />
      </Page>}

      {/* Modal equipo activo */}
      {showEquipo&&equipo&&(
        <div style={{ position:"fixed", inset:0, background:"#000a", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:C.card, border:`1px solid ${C.accent2}`, borderRadius:16, padding:24, maxWidth:380, width:"100%" }}>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:14 }}>👥 Equipo: {equipo.nombre}</div>
            <div style={{ marginBottom:12 }}>
              <div style={{ padding:"7px 10px", background:`${C.accent}15`, borderRadius:8, marginBottom:5, fontSize:13, border:`1px solid ${C.accent}33` }}>
                ⭐ {user.name} <span style={{ fontSize:10, color:C.accent }}>(líder)</span>
              </div>
              {equipo.integrantes.map((m,i)=>(
                <div key={i} style={{ padding:"7px 10px", background:C.surface, borderRadius:8, marginBottom:5, fontSize:13 }}>
                  🎓 {m.nombres} {m.apellidos}
                </div>
              ))}
            </div>
            <button onClick={()=>setShowEquipo(false)} style={{ width:"100%", padding:"10px", background:`linear-gradient(135deg,${C.accent},${C.accent2})`, border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>Cerrar</button>
          </div>
        </div>
      )}
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANEL EQUIPO — compañeros cargados desde Supabase
// ═══════════════════════════════════════════════════════════════
function EquipoPanel({ user, equipo, setEquipo, onIrChat }) {
  const [nombre, setNombre]           = useState(equipo?.nombre || "");
  const [seleccionados, setSeleccionados] = useState(equipo?.integrantes || []); // [{id,nombres,apellidos}]
  const [companeros, setCompaneros]   = useState([]);
  const [loadingC, setLoadingC]       = useState(true);
  const [buscar, setBuscar]           = useState("");
  const [saved, setSaved]             = useState(false);

  useEffect(() => {
    if (!user.grade || !user.group) { setLoadingC(false); return; }
    getCompaneros(user.grade, user.group, user.id)
      .then(c => { setCompaneros(c); setLoadingC(false); });
  }, [user.grade, user.group, user.id]);

  const toggle = (c) => {
    setSeleccionados(prev =>
      prev.find(x => x.id === c.id)
        ? prev.filter(x => x.id !== c.id)
        : [...prev, c]
    );
  };

  const guardar = () => {
    if (!nombre.trim()) return;
    setEquipo({ nombre: nombre.trim(), integrantes: seleccionados });
    setSaved(true);
    setTimeout(() => { setSaved(false); onIrChat(); }, 1200);
  };

  const disolver = () => {
    if (confirm("¿Disolver el equipo?")) {
      setEquipo(null); setNombre(""); setSeleccionados([]);
    }
  };

  const filtrados = companeros.filter(c => {
    const full = `${c.nombres} ${c.apellidos}`.toLowerCase();
    return full.includes(buscar.toLowerCase());
  });

  return (
    <Page title="👥 Mi Equipo" desc="Trabaja en equipo. El dispositivo lo comparten pero el conocimiento es de todos.">

      {/* Info */}
      <div style={{ background:`${C.accent2}10`, border:`1px solid ${C.accent2}33`, borderRadius:12, padding:"12px 14px", marginBottom:18, fontSize:12, lineHeight:1.8 }}>
        <strong style={{ color:C.accent2 }}>¿Cómo funciona?</strong><br/>
        El <strong>líder</strong> (quien tiene el dispositivo) escoge sus compañeros del mismo grado y grupo.
        Los demás participan en voz alta y NEXUS les da actividades para todos. 🏆<br/>
        <span style={{ color:C.accent3 }}>El XP y la nota del equipo quedan registrados para el docente.</span>
      </div>

      {/* Nombre */}
      <Card title="📋 Nombre del equipo">
        <input style={inp} placeholder="Ej: Los Circuitos, Equipo Alfa, Grupo Omega..." value={nombre} onChange={e=>setNombre(e.target.value)} />
      </Card>

      {/* Líder */}
      <Card title="⭐ Líder del equipo (tú)">
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:`${C.accent}15`, borderRadius:10, border:`1px solid ${C.accent}44` }}>
          <div style={{ width:36,height:36,borderRadius:"50%",background:`${C.accent}22`,border:`1.5px solid ${C.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16 }}>⭐</div>
          <div>
            <div style={{ fontSize:13, fontWeight:700 }}>{user.name}</div>
            <div style={{ fontSize:11, color:C.muted }}>Grado {user.grade} · Grupo {user.group} · con dispositivo</div>
          </div>
        </div>
      </Card>

      {/* Selección de compañeros */}
      <Card title={`🎓 Compañeros de Grado ${user.grade} · Grupo ${user.group}`}>
        {(!user.grade || !user.group) && (
          <div style={{ color:"#f97316", fontSize:12 }}>⚠️ Tu perfil no tiene grado/grupo asignado. Cierra sesión y vuelve a ingresar seleccionando tu grado y grupo.</div>
        )}
        {user.grade && user.group && <>
          <div style={{ marginBottom:10 }}>
            <input style={{ ...inp, fontSize:12 }} placeholder="Buscar compañero por nombre o apellido..." value={buscar} onChange={e=>setBuscar(e.target.value)} />
          </div>

          {loadingC && <div style={{ color:C.muted, fontSize:12 }}>⏳ Cargando compañeros...</div>}

          {!loadingC && filtrados.length === 0 && (
            <div style={{ color:C.muted, fontSize:12 }}>
              {buscar ? "Sin resultados para esa búsqueda." : "No hay más compañeros registrados en tu grado y grupo."}
            </div>
          )}

          {!loadingC && filtrados.map(c => {
            const sel = seleccionados.find(x => x.id === c.id);
            const enEquipo = c.equipo_activo && !sel; // está en otro equipo y no lo hemos seleccionado
            return (
              <div key={c.id} onClick={() => !enEquipo && toggle(c)}
                style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
                  background:enEquipo?"#f9731608":sel?`${C.accent2}20`:C.surface,
                  borderRadius:10, marginBottom:6,
                  border:`1px solid ${enEquipo?"#f9731644":sel?C.accent2:C.border}`,
                  cursor:enEquipo?"not-allowed":"pointer", opacity:enEquipo?0.7:1, transition:"all .15s" }}>
                <div style={{ width:28,height:28,borderRadius:"50%",
                  background:enEquipo?"#f9731622":sel?C.accent2:`${C.border}`,
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0 }}>
                  {enEquipo ? "🔒" : sel ? "✓" : "🎓"}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:sel?700:400 }}>{c.nombres} {c.apellidos}</div>
                  <div style={{ fontSize:10, color:C.muted }}>Grado {c.grado} · Grupo {c.grupo}</div>
                  {enEquipo && <div style={{ fontSize:10, color:"#f97316", marginTop:2 }}>🔒 Ya está en el equipo "{c.equipo_activo}"</div>}
                </div>
                {sel && <span style={{ fontSize:10, color:C.accent2, fontWeight:700 }}>✓ Seleccionado</span>}
                {enEquipo && <span style={{ fontSize:9, color:"#f97316", fontWeight:600, flexShrink:0 }}>No disponible</span>}
              </div>
            );
          })}

          {seleccionados.length > 0 && (
            <div style={{ marginTop:12, padding:"10px 14px", background:`${C.accent3}10`, borderRadius:10, border:`1px solid ${C.accent3}33` }}>
              <div style={{ fontSize:11, color:C.accent3, fontWeight:700, marginBottom:6 }}>
                👥 Equipo: {1 + seleccionados.length} integrante{seleccionados.length>0?"s":""}
              </div>
              <div style={{ fontSize:12 }}>⭐ {user.name} (líder) {seleccionados.map(s=>`· 🎓 ${s.nombres} ${s.apellidos}`).join(" ")}</div>
            </div>
          )}
        </>}
      </Card>

      <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
        <Btn onClick={guardar} disabled={!nombre.trim() || seleccionados.length === 0}>
          {saved ? "✅ ¡Equipo listo! Iniciando chat..." : `Activar equipo (${1+seleccionados.length}) e ir al chat 🚀`}
        </Btn>
        {equipo && (
          <button onClick={disolver} style={{ padding:"11px 18px", background:"#ff444422", border:"1px solid #ff444444", borderRadius:10, color:"#ff7777", fontSize:13, cursor:"pointer" }}>
            Disolver equipo
          </button>
        )}
      </div>
    </Page>
  );
}

// ═══════════════════════════════════════════════════════════════
// NEXUS CHAT — Ejercicios prácticos · Límite 10 interacciones
//              Graduación progresiva · Protección anti-copia
// ═══════════════════════════════════════════════════════════════
function NexusChat({ prompt, userName, compact, user, misionId, equipo, misionData, misionTitle, retoActual, setRetoActual, todosRetos }) {
  const isMobile = useIsMobile();

  const welcomeMsg = misionData
    ? `¡Bienvenido${equipo?`, equipo **${equipo.nombre}**`:userName?`, **${userName.split(" ")[0]}**`:""}! 🚀 Soy **NEXUS**.\n\n🗺️ Misión activa: **${misionData.title}**\n${misionData.description?`📋 ${misionData.description}\n`:""}\n¿Qué reto quieres trabajar primero? Dime el número y te generaré un **ejercicio práctico** diseñado para ese tema. 🎯\n\n⏱️ Tienes **10 interacciones** para completar el reto — ¡cada respuesta que des debe ser mejor que la anterior!`
    : `¡Bienvenido${equipo?`, equipo **${equipo.nombre}**`:userName?`, ${userName.split(" ")[0]}`:""}! 🚀 Soy **NEXUS**. Te guío con pistas para que TÚ descubras el conocimiento.\n\n💬 **Modo libre:** pregunta sobre tecnología.\n🗺️ **O elige una misión** en el menú. 🎯`;

  const [msgs, setMsgs] = useState([{ role:"assistant", content: welcomeMsg }]);
  const [historialCargado, setHistorialCargado] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [xp, setXp] = useState(0);
  const [xpAnim, setXpAnim] = useState(null);
  const endRef = useRef(null);

  // ── Contador de interacciones — 10 por reto ───────────────────
  const [interactionCount, setInteractionCount] = useState(0);
  const MAX_INT = 10;

  // ── Anti-copia ────────────────────────────────────────────────
  const [pasteCount, setPasteCount] = useState(0);
  const [showPasteWarning, setShowPasteWarning] = useState(false);
  const [misionAnulada, setMisionAnulada] = useState(false);

  // ── Historial del reto anterior ───────────────────────────────
  const [historialPrevio, setHistorialPrevio] = useState([]);
  const [showHistPrevio, setShowHistPrevio] = useState(false);

  const retoCompleto = interactionCount >= MAX_INT;

  // Reset al cambiar de MISIÓN (no de reto — el reto lo maneja el siguiente effect)
  useEffect(() => {
    setInteractionCount(0);
    setXp(0);
    setMisionAnulada(false);
    setPasteCount(0);
    setShowPasteWarning(false);
    setHistorialPrevio([]);
    setShowHistPrevio(false);
    setMsgs([{ role:"assistant", content: welcomeMsg }]);
  }, [misionId]); // eslint-disable-line

  // Reset + cargar historial al cambiar de RETO
  useEffect(() => {
    if (!misionId) return; // sin misión, no hay retos
    setInteractionCount(0);
    setMisionAnulada(false);
    setPasteCount(0);
    setShowPasteWarning(false);
    setShowHistPrevio(false);

    const retoId = retoActual?.id ?? null;
    const retoTitle = retoActual?.title || "";

    // Mensaje de bienvenida al reto
    const bienvenidaReto = retoActual
      ? `🎯 **Reto ${retoActual.id}: ${retoTitle}** ${"⭐".repeat(retoActual.stars||1)}\n\n${retoActual.desc ? `📋 ${retoActual.desc}\n\n` : ""}¡Voy a generarte un ejercicio práctico ahora mismo! 💡\n\n💡 *Si respondes todo correctamente en un solo mensaje → obtienes **+25 XP máximo** y puedes pasar al siguiente reto de inmediato.*`
      : welcomeMsg;

    if (!user?.id || compact) {
      setMsgs([{ role:"assistant", content: bienvenidaReto }]);
      setHistorialCargado(true);
      return;
    }

    setHistorialCargado(false);

    // Cargar historial de ESTE reto
    loadChatHistory(user.id, misionId, retoId).then(hist => {
      if (hist.length > 0) {
        const cont = { role:"assistant", content:`📚 *Continuando el Reto ${retoActual?.id||""}... ${hist.filter(m=>m.role==="user").length} interacciones previas registradas.* ¿Seguimos? 💪` };
        setMsgs([{ role:"assistant", content: bienvenidaReto }, ...hist, cont]);
        const prevCount = hist.filter(m => m.role === "user").length;
        setInteractionCount(Math.min(prevCount, MAX_INT));
        // Restaurar XP aproximado del historial (último xp_at_time del historial)
      } else {
        setMsgs([{ role:"assistant", content: bienvenidaReto }]);
      }
      setHistorialCargado(true);
    });

    // Cargar historial del reto ANTERIOR para referencia
    if (retoActual && retoActual.idx > 0 && todosRetos?.length > 0) {
      const retoAnterior = todosRetos[retoActual.idx - 1];
      if (retoAnterior) {
        loadChatHistory(user.id, misionId, retoAnterior.id).then(hist => {
          if (hist.length > 0) setHistorialPrevio(hist);
        });
      }
    } else {
      setHistorialPrevio([]);
    }
  }, [retoActual?.id, misionId]); // eslint-disable-line

  useEffect(() => { endRef.current?.scrollIntoView({behavior:"smooth"}); }, [msgs]);

  // ── Prompt con contador de interacciones actualizado ──────────
  const buildCurrentPrompt = (count) => {
    if (misionData) {
      const equipoTxt = equipo
        ? `Trabajan en equipo: "${equipo.nombre}" con ${equipo.integrantes.length+1} integrantes. Líder: ${userName}. Compañeros: ${equipo.integrantes.map(i=>`${i.nombres} ${i.apellidos}`).join(", ")}. Dirígete al equipo e incluye actividades para todos aunque solo uno tenga el dispositivo.`
        : "";
      return buildMissionPrompt(misionData, user?.grade||"7-11", equipoTxt, count);
    }
    return prompt;
  };

  // ── XP ─────────────────────────────────────────────────────────
  const lv  = Math.floor(xp/50)+1;
  const pct = (xp%50)/50*100;

  // Debounce saveProgress: espera 3s de inactividad antes de escribir en Supabase
  const saveTimer = useRef(null);
  const addXP = (n) => {
    setXp(prev => {
      const nx = prev + n;
      if (user?.id && !compact) {
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(
          () => saveProgress(user, nx, Math.floor(nx/50)+1, misionId, equipo),
          3000
        );
      }
      return nx;
    });
    setXpAnim(n);
    setTimeout(() => setXpAnim(null), 2000);
  };

  // ── Detección de copia/pegado ─────────────────────────────────
  const handlePaste = (e) => {
    if (compact) return;
    e.preventDefault();
    const newCount = pasteCount + 1;
    setPasteCount(newCount);
    if (newCount === 1) {
      setShowPasteWarning(true);
    } else {
      setShowPasteWarning(false);
      setMisionAnulada(true);
      // Guardar nota 1.0 (XP = 0)
      if (user?.id) {
        fetch("/api/saveprogress", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            estudiante_id: user.id, nombre_estudiante: user.name,
            grado: user.grade||"", grupo: user.group||"",
            xp_total: 0, nivel: 1, mision_id: misionId||null,
          })
        }).catch(()=>{});
      }
    }
  };

  // ── Enviar mensaje ────────────────────────────────────────────
  const send = async (txt) => {
    const t = txt || input.trim();
    if (!t || loading || misionAnulada || retoCompleto) return;
    setInput("");

    const newCount = interactionCount + 1;
    setInteractionCount(newCount);

    const nm = [...msgs, {role:"user", content:t}];
    setMsgs(nm);
    setLoading(true);

    try {
      if (user?.id && !compact) {
        saveChatMsg(user, "user", t, misionId, misionTitle||misionData?.title, xp, equipo?.nombre||null, retoActual?.id ?? null);
      }

      const currentPrompt = buildCurrentPrompt(newCount);
      // Limitar historial a últimos 50 mensajes para evitar tokens excesivos
      const validMsgs = nm.slice(-50).map(m => ({role:m.role, content:m.content}));
      const reply = await callNexus(validMsgs, currentPrompt);

      // Si llegó a la interacción 10, agregar cierre automático
      const esFinal = newCount >= MAX_INT;
      const notaActual = xpToNota(xp);
      const replyFinal = esFinal && !reply.toLowerCase().includes("evaluación final") && !reply.includes("10/10")
        ? reply + `\n\n---\n🏁 **Has completado las 10 interacciones de este reto.**\nTu nota en esta sesión: **${notaActual.toFixed(1)}** · ${xp} XP acumulados.\nPuede elegir otro reto en el menú 🗺️ para seguir progresando.`
        : reply;

      setMsgs(p => [...p, {role:"assistant", content:replyFinal}]);

      // XP por mérito: 0 por defecto, solo si NEXUS lo señala explícitamente
      let xpGanado = 0;
      if (/\+25 XP|25 XP|⭐⭐⭐|¡Maestr|Maestría/i.test(reply))           xpGanado = 25;
      else if (/\+15 XP|15 XP|⭐⭐ ¡Bien|Bien hecho/i.test(reply))        xpGanado = 15;
      else if (/\+5 XP|5 XP|⭐ ¡Sigue|Sigue intentando/i.test(reply))     xpGanado = 5;
      if (xpGanado > 0) addXP(xpGanado);

      const retoId = retoActual?.id ?? null;
      if (user?.id && !compact && !reply.startsWith("⚠️")) {
        saveChatMsg(user, "assistant", replyFinal, misionId, misionTitle||misionData?.title, xp+xpGanado, equipo?.nombre||null, retoId);
      }
    } catch(err) {
      setMsgs(p => [...p, {role:"assistant", content:"⚠️ Error de conexión. Verifica tu internet."}]);
    } finally {
      setLoading(false);
    }
  };

  // Sugerencias basadas en los retos de la misión
  const SUGS = misionData?.retos?.length > 0
    ? misionData.retos.slice(0,4).map(r => `Quiero el ejercicio del Reto ${r.id}: ${r.title}`)
    : ["¿Cómo funciona una Radio AM?","¿Qué es la Ley de Ohm?","¿Cómo programo un servo?","¿Para qué sirve el transistor?"];

  const progReto = Math.round((interactionCount / MAX_INT) * 100);
  const colReto  = progReto >= 80 ? "#10d98a" : progReto >= 50 ? "#f59e0b" : C.accent;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:compact?400:undefined, flex:compact?undefined:1, minHeight:compact?undefined:0, background:C.card, border:`1px solid ${C.border}`, borderRadius:isMobile?0:16, overflow:"hidden", position:"relative" }}>

      {/* ── Header: nivel XP + nota ── */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:isMobile?"5px 10px":"7px 14px", background:C.surface, borderBottom:`1px solid ${C.border}`, position:"relative", flexShrink:0 }}>
        <span style={{ fontSize:9, fontFamily:"'Orbitron',monospace", color:C.accent, fontWeight:700 }}>NVL {lv}</span>
        <div style={{ flex:1, height:4, background:C.border, borderRadius:2 }}>
          <div style={{ height:"100%", background:`linear-gradient(90deg,${C.accent},${C.accent2})`, width:`${pct}%`, borderRadius:2, transition:"width .5s" }} />
        </div>
        <span style={{ fontSize:9, color:C.muted, fontFamily:"'Orbitron',monospace" }}>{xp} XP</span>
        {user&&<span style={{ fontSize:10, fontWeight:800, color:notaColor(xpToNota(xp)), fontFamily:"'Orbitron',monospace", background:C.card, padding:"1px 7px", borderRadius:6, border:`1px solid ${notaColor(xpToNota(xp))}55` }}>▶ {xpToNota(xp).toFixed(1)}</span>}
        {xpAnim&&<span style={{ position:"absolute", right:12, top:-22, fontSize:11, color:C.accent3, fontWeight:700, background:C.card, padding:"2px 7px", borderRadius:7, border:`1px solid ${C.accent3}` }}>+{xpAnim} XP ✨</span>}
      </div>

      {/* ── Barra de progreso del reto (interacciones) ── */}
      {misionData && !compact && (
        <div style={{ padding:isMobile?"3px 10px 4px":"5px 14px 7px", background:`${colReto}08`, borderBottom:`1px solid ${colReto}22`, flexShrink:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:isMobile?2:4 }}>
            <span style={{ fontSize:isMobile?9:10, color:colReto, fontWeight:700 }}>
              {retoCompleto ? "🏁 Completado 10/10" : `⚡ ${interactionCount}/${MAX_INT} interacciones`}
            </span>
            <span style={{ fontSize:isMobile?9:10, color:C.muted, fontFamily:"'Orbitron',monospace" }}>
              {retoCompleto ? `Nota: ${xpToNota(xp).toFixed(1)}` : `${MAX_INT - interactionCount} quedan`}
            </span>
          </div>
          <div style={{ height:isMobile?3:5, background:C.border, borderRadius:3 }}>
            <div style={{ height:"100%", width:`${progReto}%`, background:`linear-gradient(90deg,${colReto},${C.accent2})`, borderRadius:3, transition:"width .4s ease" }} />
          </div>
        </div>
      )}

      {/* ── Panel: historial reto anterior ── */}
      {historialPrevio.length > 0 && retoActual && (
        <div style={{ borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
          <button onClick={() => setShowHistPrevio(v=>!v)}
            style={{ width:"100%", padding:"6px 14px", background:`${C.accent2}10`,
              border:"none", borderBottom: showHistPrevio?`1px solid ${C.accent2}33`:"none",
              color:C.accent2, fontSize:11, cursor:"pointer", textAlign:"left",
              display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span>📚 Ver conversación del Reto {todosRetos?.[retoActual.idx-1]?.id} anterior ({historialPrevio.filter(m=>m.role==="user").length} interacciones)</span>
            <span>{showHistPrevio ? "▲ Ocultar" : "▼ Ver"}</span>
          </button>
          {showHistPrevio && (
            <div style={{ maxHeight:220, overflowY:"auto", padding:"10px 14px",
              background:`${C.accent2}06`, display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ fontSize:10, color:C.muted, textAlign:"center", marginBottom:4 }}>
                — Historial del Reto {todosRetos?.[retoActual.idx-1]?.id}: {todosRetos?.[retoActual.idx-1]?.title} —
              </div>
              {historialPrevio.map((m,i) => (
                <div key={i} style={{ display:"flex", gap:7, alignItems:"flex-start",
                  ...(m.role==="user"?{justifyContent:"flex-end",alignSelf:"flex-end"}:{}), maxWidth:"90%" }}>
                  {m.role==="assistant" && <div style={{ width:22,height:22,borderRadius:"50%",background:`${C.accent2}20`,border:`1px solid ${C.accent2}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:C.accent2,flexShrink:0 }}>⬡</div>}
                  <div style={{ background:m.role==="user"?`${C.accent2}15`:C.surface,
                    border:`1px solid ${m.role==="user"?C.accent2+"33":C.border}`,
                    borderRadius:m.role==="user"?"10px 2px 10px 10px":"2px 10px 10px 10px",
                    padding:"7px 10px", opacity:0.85 }}>
                    <div dangerouslySetInnerHTML={{ __html:sanitizeChat(m.content||"") }}
                      style={{ fontSize:11, lineHeight:1.6, color:C.muted }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Mensajes ── */}
      <div style={{ flex:1, overflowY:"auto", overflowX:"hidden", WebkitOverflowScrolling:"touch", minHeight:0, padding:isMobile?"10px 10px 4px":"16px 14px", display:"flex", flexDirection:"column", gap:10 }}>
        {msgs.map((m,i)=>(
          <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", ...(m.role==="user"?{justifyContent:"flex-end",alignSelf:"flex-end"}:{}), maxWidth:isMobile?"92%":"82%" }}>
            {m.role==="assistant"&&<div style={{ width:28,height:28,borderRadius:"50%",background:`${C.accent}15`,border:`1.5px solid ${C.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:C.accent,flexShrink:0 }}>⬡</div>}
            <div style={{ background:m.role==="user"?C.user:C.surface, border:`1px solid ${m.role==="user"?C.accent2+"44":C.border}`, borderRadius:m.role==="user"?"12px 3px 12px 12px":"3px 12px 12px 12px", padding:isMobile?"10px 12px":"11px 14px" }}>
              <div dangerouslySetInnerHTML={{ __html:sanitizeChat(m.content||"") }} style={{ fontSize:isMobile?13:13, lineHeight:1.7 }} />
            </div>
            {m.role==="user"&&<div style={{ width:28,height:28,borderRadius:"50%",background:C.user,border:`1.5px solid ${C.accent2}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0 }}>{equipo?"👥":"👤"}</div>}
          </div>
        ))}
        {loading&&<div style={{ display:"flex", gap:8, maxWidth:"82%" }}><div style={{ width:28,height:28,borderRadius:"50%",background:`${C.accent}15`,border:`1.5px solid ${C.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:C.accent }}>⬡</div><div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:"3px 12px 12px 12px",padding:"12px 14px" }}><div style={{ display:"flex", gap:4 }}>{[0,150,300].map(d=><span key={d} style={{ width:6,height:6,borderRadius:"50%",background:C.accent,animation:"pulse 1.2s ease-in-out infinite",display:"inline-block",animationDelay:`${d}ms` }} />)}</div></div></div>}
        {msgs.length===1&&!loading&&<div><div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>💡 Sugerencias:</div><div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>{SUGS.map((q,i)=><button key={i} style={{ background:"transparent",border:`1px solid ${C.border}`,color:C.accent,padding:isMobile?"6px 10px":"6px 12px",borderRadius:20,fontSize:11,cursor:"pointer",fontFamily:"inherit" }} onClick={()=>send(q)}>{q}</button>)}</div></div>}

        {/* Banner de reto completado */}
        {retoCompleto && !misionAnulada && (() => {
          const sigReto = retoActual && todosRetos?.length > 0
            ? todosRetos[retoActual.idx + 1] || null : null;
          return (
            <div style={{ background:`${C.accent3}15`, border:`2px solid ${C.accent3}`, borderRadius:14, padding:"18px 20px", textAlign:"center", margin:"8px 0" }}>
              <div style={{ fontSize:36, marginBottom:6 }}>🏆</div>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:12, color:C.accent3, fontWeight:900, marginBottom:6 }}>
                {retoActual ? `¡Reto ${retoActual.id} Completado! — 10/10` : "¡Reto Completado! — 10/10"}
              </div>
              <div style={{ fontSize:38, fontWeight:900, fontFamily:"'Orbitron',monospace", color:notaColor(xpToNota(xp)), marginBottom:2 }}>{xpToNota(xp).toFixed(1)}</div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:12 }}>{xp} XP · {msgs.filter(m=>m.role==="user").length} interacciones</div>
              {sigReto ? (
                <button onClick={() => {
                  if (setRetoActual) setRetoActual({ id: sigReto.id, title: sigReto.title, stars: sigReto.stars, idx: retoActual.idx + 1, desc: sigReto.desc });
                }} style={{ padding:"10px 24px", background:`linear-gradient(135deg,${C.accent3},${C.accent})`, border:"none", borderRadius:12, color:"#0d1526", fontWeight:900, fontSize:13, cursor:"pointer", marginBottom:8 }}>
                  🚀 Iniciar Reto {sigReto.id}: {sigReto.title} →
                </button>
              ) : (
                <div style={{ fontSize:12, color:C.accent3, fontWeight:700 }}>🎉 ¡Completaste todos los retos de esta misión!</div>
              )}
              <div style={{ fontSize:11, color:C.muted, marginTop:6 }}>También puedes elegir otro reto en 🗺️ Misiones</div>
            </div>
          );
        })()}
        <div ref={endRef} />
      </div>

      {/* ── Input ── */}
      <div style={{ display:"flex", gap:6, padding:isMobile?"7px 8px 10px":"11px 12px", borderTop:`1px solid ${C.border}`, background:C.surface, alignItems:"flex-end", flexShrink:0 }}>
        <textarea
          style={{ flex:1, background:(retoCompleto||misionAnulada)?"#0a0a0a":C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:isMobile?"9px 11px":"9px 12px", color:(retoCompleto||misionAnulada)?C.muted:C.text, fontSize:13, resize:"none", fontFamily:"inherit", outline:"none", maxHeight:80 }}
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); send(); }}}
          onPaste={handlePaste}
          placeholder={misionAnulada?"🚫 Misión anulada":retoCompleto?"🏁 Reto completado — elige otro reto":isMobile?"Escribe aquí...":"Escribe tu respuesta... (Enter para enviar)"}
          disabled={retoCompleto || misionAnulada}
          rows={1}
        />
        <button
          style={{ width:36,height:36,borderRadius:9,background:`linear-gradient(135deg,${C.accent},${C.accent2})`,border:"none",color:"#fff",fontSize:14,cursor:"pointer",opacity:(loading||!input.trim()||retoCompleto||misionAnulada)?0.4:1,flexShrink:0 }}
          onClick={()=>send()}
          disabled={loading||!input.trim()||retoCompleto||misionAnulada}
        >➤</button>
      </div>

      {/* ╔══════════════════════════════════════════════╗
          ║  MODAL 1 — Advertencia de Copia (1er intento) ║
          ╚══════════════════════════════════════════════╝ */}
      {showPasteWarning && !misionAnulada && (
        <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.82)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:"#1a1200", border:"2px solid #f59e0b", borderRadius:18, padding:"30px 26px", maxWidth:370, width:"100%", textAlign:"center", boxShadow:"0 0 40px #f59e0b33", animation:"popIn .25s ease" }}>
            <div style={{ fontSize:52, marginBottom:10 }}>⚠️</div>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:15, color:"#f59e0b", fontWeight:900, marginBottom:12, letterSpacing:1 }}>
              Advertencia de Copia
            </div>
            <div style={{ fontSize:13, color:"#fde68a", lineHeight:1.9, marginBottom:14 }}>
              Se detectó un intento de <strong>copiar y pegar</strong> texto en el chat.
            </div>
            <div style={{ fontSize:14, fontWeight:800, color:"#f97316", padding:"12px 16px", background:"#2a1500", borderRadius:12, marginBottom:18, border:"1px solid #f9731633" }}>
              ⚠️ Próxima vez se anulará la misión
            </div>
            <div style={{ fontSize:11, color:"#92400e", marginBottom:20, lineHeight:1.6 }}>
              Las respuestas deben ser tuyas. Demuestra tu conocimiento. 💪
            </div>
            <button
              onClick={()=>setShowPasteWarning(false)}
              style={{ padding:"12px 30px", background:"linear-gradient(135deg,#f59e0b,#f97316)", border:"none", borderRadius:12, color:"#fff", fontWeight:800, fontSize:14, cursor:"pointer" }}
            >
              Entendido ✊
            </button>
          </div>
        </div>
      )}

      {/* ╔═════════════════════════════════╗
          ║  MODAL 2 — Misión Anulada (rojo)  ║
          ╚═════════════════════════════════╝ */}
      {misionAnulada && (
        <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.93)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:"#150000", border:"2px solid #ef4444", borderRadius:18, padding:"34px 26px 28px", maxWidth:390, width:"100%", textAlign:"center", boxShadow:"0 0 60px #ef444466", animation:"popIn .3s ease" }}>
            <div style={{ fontSize:56, marginBottom:10 }}>🚫</div>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:16, color:"#ef4444", fontWeight:900, marginBottom:14, letterSpacing:3 }}>
              MISIÓN ANULADA
            </div>
            <div style={{ fontSize:13, color:"#fca5a5", lineHeight:1.9, marginBottom:10 }}>
              Se detectó un <strong>segundo intento de copiar y pegar</strong> texto en el chat de NEXUS.
            </div>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:52, fontWeight:900, color:"#ef4444", margin:"8px 0 4px", textShadow:"0 0 20px #ef4444" }}>1.0</div>
            <div style={{ fontSize:13, color:"#fca5a5", marginBottom:20, fontWeight:600 }}>
              Nota definitiva por integridad académica
            </div>
            <div style={{ fontSize:11, color:"#7f1d1d", padding:"14px 16px", background:"#2a0000", borderRadius:12, lineHeight:1.8, border:"1px solid #3f0000" }}>
              💡 El conocimiento que construyes tú mismo es el que de verdad te pertenece.<br/>
              <span style={{ color:"#991b1b" }}>El docente puede ver el registro completo de esta sesión.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// MISSION MAP
// ═══════════════════════════════════════════════════════════════
function MissionMap({ misiones, onSelect }) {
  const [open, setOpen] = useState(null);
  if(!misiones.length) return <div style={{ color:C.muted, fontSize:13, padding:20, textAlign:"center" }}>Tu docente creará misiones pronto. 🚀</div>;
  return <div>{misiones.map(m=>(
    <div key={m.id} style={{ background:C.card,border:`1px solid ${open===m.id?m.color+"88":m.color+"33"}`,borderRadius:14,padding:16,marginBottom:14,cursor:"pointer" }} onClick={()=>setOpen(open===m.id?null:m.id)}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
        <span style={{ fontSize:30 }}>{m.icon}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:700, color:m.color }}>{m.title}</div>
          <div style={{ fontSize:11, color:C.muted, marginTop:2, marginBottom:7 }}>{m.description}</div>
          <div style={{ fontSize:10, color:C.accent, marginBottom:5 }}>👤 {m.docente_nombre||"Docente"}</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>{(m.retos||[]).map(r=><span key={r.id} style={{ padding:"2px 7px",borderRadius:5,fontSize:10,background:m.color+"22",color:m.color }}>{"⭐".repeat(r.stars)}</span>)}</div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:7, flexShrink:0 }}>
          <span style={{ padding:"3px 9px",borderRadius:20,fontSize:10,fontWeight:700,background:m.color+"22",color:m.color }}>{(m.retos||[]).length} retos</span>
          {onSelect&&<button style={{ padding:"6px 12px",background:m.color,border:"none",borderRadius:9,color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer" }} onClick={e=>{ e.stopPropagation(); onSelect(m.id); }}>Iniciar ➤</button>}
        </div>
      </div>
      {open===m.id&&<div style={{ marginTop:14,borderTop:`1px solid ${m.color}33`,paddingTop:14 }}>{(m.retos||[]).map((r,ri)=>(
        <div key={r.id} style={{ display:"flex",gap:10,padding:"10px 12px",marginBottom:7,background:C.surface,borderRadius:8,borderLeft:`3px solid ${m.color}66`,alignItems:"flex-start" }}>
          <div style={{ fontFamily:"'Orbitron',monospace",fontWeight:900,fontSize:13,color:m.color,width:22,flexShrink:0,paddingTop:2 }}>{r.id}</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12,fontWeight:700,marginBottom:3 }}>{r.title} {"⭐".repeat(r.stars)}{r.duracion && <span style={{ marginLeft:8, fontSize:10, color:"#06b6d4", fontWeight:400 }}>⏱️ {r.duracion} {r.tipo_duracion==="dias"?"día(s)":"hora(s)"}</span>}</div>
            <div style={{ fontSize:11,color:C.muted }}>{r.desc}</div>
          </div>
          {onSelect && (
            <button onClick={e=>{ e.stopPropagation(); onSelect(m.id, { id:r.id, title:r.title, stars:r.stars, idx:ri, desc:r.desc }); }}
              style={{ padding:"5px 12px", background:`${m.color}22`, border:`1px solid ${m.color}55`,
                borderRadius:8, color:m.color, fontWeight:700, fontSize:11, cursor:"pointer", flexShrink:0, whiteSpace:"nowrap" }}>
              ▶ Iniciar
            </button>
          )}
        </div>
      ))}</div>}
    </div>
  ))}</div>;
}


// ═══════════════════════════════════════════════════════════════
// EQUIPOS PANEL — Lista de equipos con filtro por grado y grupo
// v2: Detalle completo al hacer clic + informe de actividad
// ═══════════════════════════════════════════════════════════════
function EquiposPanel({ user }) {
  const isMobile = useIsMobile();
  const [equipos, setEquipos]               = useState([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [selEquipo, setSelEquipo]           = useState(null);
  const [detalle, setDetalle]               = useState(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [confirmEliminar, setConfirmEliminar] = useState(false);
  const [eliminando, setEliminando]           = useState(false);
  const [tabDetalle, setTabDetalle]           = useState("resumen"); // resumen | integrantes | actividad

  // Filtros cascada: grado → grupo → misión
  const [filtroGrado,  setFiltroGrado]  = useState("todos");
  const [filtroGrupo,  setFiltroGrupo]  = useState("todos");
  const [filtroMision, setFiltroMision] = useState("todas");

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    const params = new URLSearchParams({ docente_id: user.id, role: user.role });
    fetch(`/api/equipos?${params}`)
      .then(r => r.json())
      .then(d => {
        if(ignore) return;
        if (d.error) setError(d.error);
        setEquipos(d.equipos || []);
        setLoading(false);
      })
      .catch(e => { if(!ignore){ setError(e.message); setLoading(false); } });
    return () => { ignore = true; };
  }, [user.id]);

  // Al seleccionar equipo, cargar detalle completo
  const abrirDetalle = (eq) => {
    setSelEquipo(eq);
    setDetalle(null);
    setTabDetalle("resumen");
    setLoadingDetalle(true);
    const params = new URLSearchParams({ docente_id: user.id, equipo: eq.nombre });
    fetch(`/api/equipos?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.detalle) setDetalle(d.detalle);
        setLoadingDetalle(false);
      })
      .catch(() => setLoadingDetalle(false));
  };

  // Grados y grupos disponibles
  const gradosDisp = [...new Set(equipos.map(e => e.grado).filter(Boolean))].sort((a,b)=>Number(a)-Number(b));
  const gruposDisp = filtroGrado === "todos"
    ? [...new Set(equipos.map(e => e.grupo).filter(Boolean))].sort()
    : [...new Set(equipos.filter(e => e.grado === filtroGrado).map(e => e.grupo).filter(Boolean))].sort();

  const equiposFiltGrado = filtroGrado === "todos" ? equipos : equipos.filter(e => e.grado === filtroGrado);
  const equiposFiltGrupo = filtroGrupo === "todos" ? equiposFiltGrado : equiposFiltGrado.filter(e => e.grupo === filtroGrupo);
  const todasMisiones = [...new Map(equiposFiltGrupo.flatMap(e => e.misiones).map(m => [m.id, m])).values()];
  const equiposFiltrados = filtroMision === "todas"
    ? equiposFiltGrupo
    : equiposFiltGrupo.filter(e => e.misiones.some(m => m.id === filtroMision));

  const notaColor2 = (n) => n>=4.5?"#10d98a":n>=4.0?"#22c55e":n>=3.5?"#eab308":n>=3.0?"#f97316":"#ef4444";
  const barWidth   = (xp) => Math.min(100, Math.round((xp / 250) * 100)) + "%";

  const handleEliminar = async () => {
    if (!selEquipo) return;
    setEliminando(true);
    try {
      const r = await fetch("/api/equipos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: selEquipo.nombre, docente_id: user.id }),
      });
      const d = await r.json();
      if (d.error) {
        alert("Error al eliminar: " + d.error);
      } else {
        setEquipos(prev => prev.filter(e => e.nombre !== selEquipo.nombre));
        setSelEquipo(null);
        setDetalle(null);
        setConfirmEliminar(false);
      }
    } catch(e) {
      alert("Error de conexión al eliminar el equipo.");
    } finally {
      setEliminando(false);
    }
  };

  // ─────────────────────────────────────────────────────────
  // VISTA DETALLE
  // ─────────────────────────────────────────────────────────
  if (selEquipo) {
    const eq = selEquipo;
    const estudiantes = detalle?.estudiantes || eq.integrantes || [];
    const misionesDetalle = detalle?.misiones || eq.misiones || [];
    const actDiaria = detalle?.actividad_diaria || {};
    const diasAct = Object.entries(actDiaria).sort((a,b)=>a[0].localeCompare(b[0])).slice(-14);
    const maxMsgs = Math.max(...diasAct.map(([,v])=>v), 1);

    return (
      <div style={{ flex:1, overflowY:"auto", overflowX:"hidden", WebkitOverflowScrolling:"touch",
        padding: isMobile?"14px 12px 90px":"26px", maxWidth:900, boxSizing:"border-box" }}>

        {/* Botones nav */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <button onClick={() => { setSelEquipo(null); setDetalle(null); }}
            style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:13,
              display:"flex", alignItems:"center", gap:6 }}>
            ← Volver a equipos
          </button>
          <button onClick={() => setConfirmEliminar(true)}
            style={{ padding:"7px 14px", borderRadius:10, border:"1px solid #ef444455",
              background:"#ef444411", color:"#ef4444", cursor:"pointer", fontSize:12,
              fontWeight:700, display:"flex", alignItems:"center", gap:6 }}>
            🗑️ Eliminar equipo
          </button>
        </div>

        {/* Cabecera */}
        <div style={{ background:`linear-gradient(135deg,${C.card},${C.surface})`,
          border:`1px solid ${C.accent2}55`, borderRadius:18, padding:"22px 20px", marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:16 }}>
            <div style={{ width:52,height:52,borderRadius:16,background:`${C.accent2}20`,
              border:`2px solid ${C.accent2}`,display:"flex",alignItems:"center",
              justifyContent:"center",fontSize:26,flexShrink:0 }}>👥</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:isMobile?15:20,
                fontWeight:900, color:C.accent2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {eq.nombre}
              </div>
              <div style={{ fontSize:11, color:C.muted, marginTop:4, display:"flex", gap:10, flexWrap:"wrap" }}>
                {eq.grado && <span>📚 Grado {eq.grado}</span>}
                {eq.grupo && <span>👥 Grupo {eq.grupo}</span>}
                {detalle?.primera_actividad && <span>🗓️ Desde {new Date(detalle.primera_actividad).toLocaleDateString("es-CO")}</span>}
                <span>🕐 Última actividad: {new Date(eq.ultima_actividad).toLocaleDateString("es-CO")}</span>
              </div>
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
            {[
              ["👥","Integrantes", eq.num_integrantes,                                      C.accent2],
              ["⭐","XP total",    eq.xp_equipo,                                            "#f97316"],
              ["🏆","Nota prom.",  eq.nota_promedio.toFixed(1),                             notaColor2(eq.nota_promedio)],
              ["💬","Mensajes",    loadingDetalle ? "..." : (detalle?.total_mensajes ?? "—"),"#06b6d4"],
            ].map(([ic,lb,val,col]) => (
              <div key={lb} style={{ background:C.bg, borderRadius:12, padding:"10px 8px",
                textAlign:"center", border:`1px solid ${col}33` }}>
                <div style={{ fontSize:16, marginBottom:3 }}>{ic}</div>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:isMobile?15:18,
                  fontWeight:900, color:col }}>{val}</div>
                <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{lb}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs de detalle */}
        <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
          {[["resumen","📋 Resumen"],["integrantes","🎓 Integrantes"],["actividad","📈 Actividad"]].map(([id,lbl]) => (
            <button key={id} onClick={()=>setTabDetalle(id)}
              style={{ padding:"8px 16px", borderRadius:20, border:`1.5px solid ${tabDetalle===id?C.accent:C.border}`,
                background:tabDetalle===id?`${C.accent}22`:"transparent",
                color:tabDetalle===id?C.accent:C.muted, fontWeight:tabDetalle===id?700:400,
                fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
              {lbl}
            </button>
          ))}
        </div>

        {loadingDetalle && (
          <div style={{ color:C.muted, fontSize:13, padding:"20px 0", textAlign:"center" }}>
            ⏳ Cargando informe del equipo...
          </div>
        )}

        {/* ── TAB: RESUMEN ── */}
        {!loadingDetalle && tabDetalle === "resumen" && (
          <>
            {/* Misiones trabajadas */}
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:18, marginBottom:14 }}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>🗺️ Misiones trabajadas</div>
              {misionesDetalle.length === 0
                ? <div style={{ fontSize:12, color:C.muted }}>Sin misiones registradas.</div>
                : misionesDetalle.map((m,i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
                    background:C.surface, borderRadius:10, marginBottom:8,
                    border:`1px solid ${m.color||C.border}33` }}>
                    <span style={{ fontSize:18 }}>{m.icon || "📋"}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:m.color||C.accent }}>{m.title}</div>
                      <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
                        {m.mensajes} mensajes · {m.participantes ?? m.estudiantes ?? "?"} participante(s)
                      </div>
                    </div>
                    <div style={{ fontFamily:"'Orbitron',monospace", fontSize:11, color:C.muted }}>
                      {m.mensajes}💬
                    </div>
                  </div>
                ))
              }
            </div>

            {/* Ranking rápido */}
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:18 }}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>🏅 Ranking del equipo</div>
              {estudiantes.map((int_,i) => {
                const nc = notaColor2(int_.nota);
                return (
                  <div key={int_.id} style={{ display:"flex", alignItems:"center", gap:10,
                    padding:"10px 12px", background:C.surface, borderRadius:10, marginBottom:8,
                    border:`1px solid ${nc}22` }}>
                    <div style={{ fontFamily:"'Orbitron',monospace", fontWeight:900, fontSize:12,
                      color:i===0?"#ffd700":i===1?"#c0c0c0":i===2?"#cd7f32":C.muted,
                      width:20, flexShrink:0, textAlign:"center" }}>#{i+1}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700 }}>{int_.nombre}
                        {i===0 && <span style={{ fontSize:10, color:"#ffd700", marginLeft:6 }}>⭐ Líder</span>}
                      </div>
                      <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>
                        {int_.grado && `G${int_.grado}`}{int_.grupo && ` · Grp ${int_.grupo}`}
                        {" · "}{int_.xp_total} XP
                        {int_.mensajes_total != null && ` · ${int_.mensajes_total} mensajes`}
                      </div>
                    </div>
                    <div style={{ fontFamily:"'Orbitron',monospace", fontSize:20, fontWeight:900, color:nc }}>{int_.nota?.toFixed(1)}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── TAB: INTEGRANTES (detalle completo) ── */}
        {!loadingDetalle && tabDetalle === "integrantes" && (
          <div>
            {estudiantes.map((est, i) => {
              const nc = notaColor2(est.nota || 1);
              const mEst = est.misiones || [];
              return (
                <div key={est.id} style={{ background:C.card, border:`1.5px solid ${nc}44`,
                  borderRadius:16, padding:18, marginBottom:14 }}>
                  {/* Header estudiante */}
                  <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
                    <div style={{ width:42,height:42,borderRadius:"50%",background:`${nc}20`,
                      border:`2px solid ${nc}55`,display:"flex",alignItems:"center",
                      justifyContent:"center",fontFamily:"'Orbitron',monospace",fontWeight:900,
                      fontSize:13,color:nc,flexShrink:0 }}>{i===0?"⭐":"🎓"}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:800 }}>{est.nombre}
                        {i===0 && <span style={{ fontSize:10, color:C.accent, marginLeft:6 }}>(líder)</span>}
                      </div>
                      <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                        {est.grado && `Grado ${est.grado}`}{est.grupo && ` · Grupo ${est.grupo}`}
                        {est.nivel && ` · Nivel ${est.nivel}`}
                      </div>
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ fontFamily:"'Orbitron',monospace", fontSize:28, fontWeight:900, color:nc, lineHeight:1 }}>{(est.nota||1).toFixed(1)}</div>
                      <div style={{ fontSize:10, color:C.muted }}>nota</div>
                    </div>
                  </div>

                  {/* Barra de XP */}
                  <div style={{ marginBottom:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                      <span style={{ fontSize:11, color:C.muted }}>⭐ {est.xp_total || 0} XP</span>
                      <span style={{ fontSize:11, color:C.muted }}>{barWidth(est.xp_total || 0)} hacia meta (250 XP)</span>
                    </div>
                    <div style={{ background:C.surface, borderRadius:6, height:8, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:barWidth(est.xp_total||0),
                        background:`linear-gradient(90deg,${nc},${nc}99)`, borderRadius:6,
                        transition:"width .5s ease" }} />
                    </div>
                  </div>

                  {/* Stats */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:14 }}>
                    {[
                      ["💬","Mensajes", est.mensajes_total || 0,    "#06b6d4"],
                      ["🗺️","Misiones", mEst.length,                C.accent],
                      ["⏰","Días activo", (() => {
                          if (!est.primera_actividad || !est.ultima_actividad) return "—";
                          const d1 = new Date(est.primera_actividad), d2 = new Date(est.ultima_actividad);
                          return Math.max(1, Math.ceil((d2-d1)/(1000*60*60*24)));
                        })(), "#a78bfa"],
                    ].map(([ic,lb,val,col]) => (
                      <div key={lb} style={{ background:C.surface, borderRadius:10, padding:"8px 6px",
                        textAlign:"center", border:`1px solid ${col}22` }}>
                        <div style={{ fontSize:14, marginBottom:2 }}>{ic}</div>
                        <div style={{ fontFamily:"'Orbitron',monospace", fontSize:14, fontWeight:700, color:col }}>{val}</div>
                        <div style={{ fontSize:9, color:C.muted }}>{lb}</div>
                      </div>
                    ))}
                  </div>

                  {/* Misiones por estudiante */}
                  {mEst.length > 0 && (
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:8,
                        textTransform:"uppercase", letterSpacing:1 }}>Actividad por misión</div>
                      {mEst.map((m, mi) => (
                        <div key={mi} style={{ display:"flex", alignItems:"center", gap:8,
                          padding:"7px 10px", background:C.bg, borderRadius:8, marginBottom:6 }}>
                          <span style={{ fontSize:14 }}>📋</span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:600, overflow:"hidden",
                              textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.title}</div>
                            <div style={{ fontSize:10, color:C.muted, marginTop:1 }}>
                              {m.mensajes} mensajes · {m.xp_max} XP máx.
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Fechas */}
                  {est.primera_actividad && (
                    <div style={{ fontSize:10, color:C.muted, marginTop:10, paddingTop:10,
                      borderTop:`1px solid ${C.border}`, display:"flex", gap:16 }}>
                      <span>🗓️ Primera actividad: {new Date(est.primera_actividad).toLocaleDateString("es-CO")}</span>
                      <span>🕐 Última: {new Date(est.ultima_actividad).toLocaleDateString("es-CO")}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── TAB: ACTIVIDAD (gráfico de barras por día) ── */}
        {!loadingDetalle && tabDetalle === "actividad" && (
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:18 }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>📈 Actividad reciente del equipo</div>
            <div style={{ fontSize:11, color:C.muted, marginBottom:16 }}>Mensajes enviados por día (últimos 14 días activos)</div>

            {diasAct.length === 0
              ? <div style={{ fontSize:12, color:C.muted }}>Sin actividad registrada.</div>
              : (
                <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:120, paddingBottom:24, position:"relative" }}>
                  {diasAct.map(([dia, cnt]) => (
                    <div key={dia} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                      <div style={{ fontSize:10, color:C.muted }}>{cnt}</div>
                      <div style={{ width:"100%", background:`${C.accent}33`, borderRadius:"4px 4px 0 0",
                        height: Math.max(8, Math.round((cnt/maxMsgs)*90)) + "px",
                        transition:"height .4s ease",
                        background:`linear-gradient(180deg,${C.accent},${C.accent2})` }} />
                      <div style={{ fontSize:9, color:C.muted, writingMode:"vertical-rl",
                        transform:"rotate(180deg)", maxHeight:60, overflow:"hidden", textAlign:"center" }}>
                        {dia.slice(5)}
                      </div>
                    </div>
                  ))}
                </div>
              )
            }

            {/* Resumen de actividad */}
            {detalle && (
              <div style={{ marginTop:16, paddingTop:16, borderTop:`1px solid ${C.border}`,
                display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
                <div style={{ background:C.surface, borderRadius:10, padding:"10px 12px" }}>
                  <div style={{ fontSize:10, color:C.muted, marginBottom:4 }}>📅 Primera sesión</div>
                  <div style={{ fontSize:13, fontWeight:700 }}>
                    {detalle.primera_actividad ? new Date(detalle.primera_actividad).toLocaleDateString("es-CO") : "—"}
                  </div>
                </div>
                <div style={{ background:C.surface, borderRadius:10, padding:"10px 12px" }}>
                  <div style={{ fontSize:10, color:C.muted, marginBottom:4 }}>🕐 Última sesión</div>
                  <div style={{ fontSize:13, fontWeight:700 }}>
                    {detalle.ultima_actividad ? new Date(detalle.ultima_actividad).toLocaleDateString("es-CO") : "—"}
                  </div>
                </div>
                <div style={{ background:C.surface, borderRadius:10, padding:"10px 12px" }}>
                  <div style={{ fontSize:10, color:C.muted, marginBottom:4 }}>💬 Total mensajes</div>
                  <div style={{ fontFamily:"'Orbitron',monospace", fontSize:18, fontWeight:900, color:"#06b6d4" }}>{detalle.total_mensajes}</div>
                </div>
                <div style={{ background:C.surface, borderRadius:10, padding:"10px 12px" }}>
                  <div style={{ fontSize:10, color:C.muted, marginBottom:4 }}>📊 Días con actividad</div>
                  <div style={{ fontFamily:"'Orbitron',monospace", fontSize:18, fontWeight:900, color:C.accent }}>{Object.keys(actDiaria).length}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODAL Confirmar eliminación */}
        {confirmEliminar && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:500,
            display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
            <div style={{ background:"#150000", border:"2px solid #ef4444", borderRadius:20,
              padding:"32px 26px", maxWidth:400, width:"100%", textAlign:"center",
              boxShadow:"0 0 50px #ef444444", animation:"popIn .25s ease" }}>
              <div style={{ fontSize:50, marginBottom:12 }}>⚠️</div>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:16, color:"#ef4444",
                fontWeight:900, marginBottom:10, letterSpacing:2 }}>ELIMINAR EQUIPO</div>
              <div style={{ fontSize:14, color:"#fca5a5", lineHeight:1.9, marginBottom:8 }}>
                ¿Eliminar el equipo <strong style={{color:"#fff"}}>"{selEquipo?.nombre}"</strong>?
              </div>
              <div style={{ fontSize:12, padding:"12px 16px", background:"#2a0000",
                border:"1px solid #3f0000", borderRadius:12, marginBottom:22, lineHeight:1.8, color:"#fca5a5" }}>
                🗑️ Se eliminarán <strong>todos los mensajes del chat</strong> y el
                <strong> registro de progreso</strong> de los {selEquipo?.num_integrantes} integrante(s).<br/>
                <span style={{color:"#7f1d1d", fontSize:11}}>Esta acción no se puede deshacer.</span>
              </div>
              <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
                <button onClick={() => setConfirmEliminar(false)} disabled={eliminando}
                  style={{ padding:"11px 24px", borderRadius:12, border:`1px solid ${C.border}`,
                    background:"transparent", color:C.muted, cursor:"pointer", fontWeight:600, fontSize:13 }}>
                  Cancelar
                </button>
                <button onClick={handleEliminar} disabled={eliminando}
                  style={{ padding:"11px 24px", borderRadius:12, border:"none",
                    background:eliminando?"#7f1d1d":"linear-gradient(135deg,#ef4444,#dc2626)",
                    color:"#fff", cursor:eliminando?"not-allowed":"pointer",
                    fontWeight:800, fontSize:13, minWidth:120 }}>
                  {eliminando ? "⏳ Eliminando..." : "🗑️ Sí, eliminar"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // VISTA LISTA CON FILTROS
  // ─────────────────────────────────────────────────────────
  return (
    <div style={{ flex:1, overflowY:"auto", overflowX:"hidden", WebkitOverflowScrolling:"touch",
      padding: isMobile?"14px 12px 90px":"26px", maxWidth:900, boxSizing:"border-box" }}>

      {/* Encabezado + botón disolver todos */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:18, flexWrap:"wrap", gap:10 }}>
        <div>
          <h1 style={{ ...ptitle, fontSize: isMobile?17:22, margin:0 }}>👥 Equipos</h1>
          <p style={{ fontSize:12, color:C.muted, marginTop:4, marginBottom:0 }}>
            Equipos formados por los estudiantes. Clic en un equipo para ver el informe completo.
          </p>
        </div>
        {equipos.length > 0 && (
          <button onClick={async () => {
            if (!confirm(`⚠️ RESET COMPLETO — ${equipos.length} equipo(s)\n\nSe eliminarán:\n• Todos los chats de equipo\n• El progreso y XP de los integrantes\n\nEsta acción NO se puede deshacer.`)) return;
            const r = await fetch("/api/usuarios", {
              method:"POST", headers:{"Content-Type":"application/json"},
              body: JSON.stringify({ accion:"limpiar_equipos", docente_id: user.id })
            });
            const d = await r.json();
            if (d.success) {
              setEquipos([]); setSelEquipo(null);
              alert(`✅ Reset completo. ${d.estudiantesAfectados || 0} estudiante(s) limpiados.`);
            } else alert("Error: " + d.error);
          }} style={{ padding:"8px 16px", background:"#ef444415",
            border:"1px solid #ef444455", borderRadius:10, color:"#ef4444",
            fontSize:11, cursor:"pointer", fontWeight:700, whiteSpace:"nowrap",
            display:"flex", alignItems:"center", gap:6 }}>
            🗑️ Eliminar todos · Reset XP
          </button>
        )}
      </div>

      {loading && <div style={{ color:C.muted,fontSize:13 }}>⏳ Cargando equipos...</div>}
      {error   && <div style={{ background:"#ff444422",border:"1px solid #ff444444",color:"#ff7777",
        padding:"10px 14px",borderRadius:8,fontSize:12,marginBottom:14 }}>⚠️ {error}</div>}

      {!loading && equipos.length === 0 && !error && (
        <div style={{ background:`${C.accent2}10`,border:`1px solid ${C.accent2}33`,
          borderRadius:14,padding:"30px 20px",textAlign:"center" }}>
          <div style={{ fontSize:40,marginBottom:12 }}>👥</div>
          <div style={{ fontSize:15,fontWeight:800,color:C.accent2,marginBottom:8 }}>
            Aún no hay equipos registrados
          </div>
          <div style={{ fontSize:12,color:C.muted,lineHeight:1.8 }}>
            Los equipos aparecen aquí cuando los estudiantes los crean desde <strong style={{color:C.accent}}>Mi Equipo</strong> y trabajan en el chat. 🚀
          </div>
        </div>
      )}

      {!loading && equipos.length > 0 && (<>

        {/* Filtro Grado */}
        <div style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:14,
          padding:"14px 16px",marginBottom:10 }}>
          <div style={{ fontSize:12,fontWeight:700,color:C.muted,textTransform:"uppercase",
            letterSpacing:1,marginBottom:10 }}>📚 Grado</div>
          <div style={{ display:"flex",gap:7,flexWrap:"wrap" }}>
            {["todos",...gradosDisp].map(g => (
              <button key={g} onClick={() => { setFiltroGrado(g); setFiltroGrupo("todos"); setFiltroMision("todas"); }}
                style={{ padding:"7px 16px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",
                  fontWeight:700,fontSize:13,
                  border:`2px solid ${filtroGrado===g?C.accent:C.border}`,
                  background: filtroGrado===g?`${C.accent}22`:"transparent",
                  color: filtroGrado===g?C.accent:C.muted }}>
                {g==="todos"?"Todos":g+"°"}
              </button>
            ))}
          </div>
        </div>

        {/* Filtro Grupo */}
        {gruposDisp.length > 0 && (
          <div style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:14,
            padding:"14px 16px",marginBottom:10 }}>
            <div style={{ fontSize:12,fontWeight:700,color:C.muted,textTransform:"uppercase",
              letterSpacing:1,marginBottom:10 }}>👥 Grupo</div>
            <div style={{ display:"flex",gap:7,flexWrap:"wrap" }}>
              {["todos",...gruposDisp].map(g => (
                <button key={g} onClick={() => { setFiltroGrupo(g); setFiltroMision("todas"); }}
                  style={{ padding:"7px 16px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",
                    fontWeight:700,fontSize:13,
                    border:`2px solid ${filtroGrupo===g?C.accent2:C.border}`,
                    background: filtroGrupo===g?`${C.accent2}22`:"transparent",
                    color: filtroGrupo===g?C.accent2:C.muted }}>
                  {g==="todos"?"Todos":"Grupo "+g}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filtro Misión */}
        {todasMisiones.length > 1 && (
          <div style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:14,
            padding:"12px 16px",marginBottom:14 }}>
            <div style={{ fontSize:12,fontWeight:700,color:C.muted,textTransform:"uppercase",
              letterSpacing:1,marginBottom:10 }}>🗺️ Misión</div>
            <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
              {[{id:"todas",title:"Todas",color:C.accent3},...todasMisiones].map(m => (
                <button key={m.id} onClick={() => setFiltroMision(m.id)}
                  style={{ padding:"5px 12px",borderRadius:20,fontSize:11,cursor:"pointer",
                    fontFamily:"inherit",fontWeight:filtroMision===m.id?700:400,
                    border:`1px solid ${filtroMision===m.id?m.color:C.border}`,
                    background: filtroMision===m.id?`${m.color}22`:"transparent",
                    color: filtroMision===m.id?m.color:C.muted }}>
                  {m.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Resumen */}
        <div style={{ display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",
          gap:10,marginBottom:16 }}>
          {[
            ["👥","Equipos",      equiposFiltrados.length,                                     C.accent2],
            ["🎓","Estudiantes",  equiposFiltrados.reduce((s,e)=>s+e.num_integrantes,0),        C.accent3],
            ["🏆","Nota promedio",equiposFiltrados.length > 0
              ? (equiposFiltrados.reduce((s,e)=>s+e.nota_promedio,0)/equiposFiltrados.length).toFixed(1)
              : "—",                                                                             "#f97316"],
          ].map(([ic,lb,val,col]) => (
            <div key={lb} style={{ background:C.card,border:`1px solid ${col}33`,borderRadius:12,
              padding:"12px 10px",textAlign:"center" }}>
              <div style={{ fontSize:18,marginBottom:4 }}>{ic}</div>
              <div style={{ fontFamily:"'Orbitron',monospace",fontSize:isMobile?16:20,
                fontWeight:900,color:col }}>{val}</div>
              <div style={{ fontSize:10,color:C.muted,marginTop:3 }}>{lb}</div>
            </div>
          ))}
        </div>

        {/* Lista de equipos */}
        {equiposFiltrados.length === 0
          ? <div style={{ color:C.muted,fontSize:13,padding:"20px 0",textAlign:"center" }}>
              Sin equipos para los filtros seleccionados.
            </div>
          : equiposFiltrados.map((eq, idx) => (
            <div key={eq.nombre}
              onClick={() => abrirDetalle(eq)}
              style={{ background:C.card,border:`1px solid ${notaColor2(eq.nota_promedio)}33`,
                borderRadius:16,padding:"16px 18px",marginBottom:12,cursor:"pointer",transition:"all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor=notaColor2(eq.nota_promedio)+"88"; e.currentTarget.style.transform="translateY(-1px)"; e.currentTarget.style.boxShadow=`0 4px 20px ${notaColor2(eq.nota_promedio)}22`; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor=notaColor2(eq.nota_promedio)+"33"; e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}
            >
              <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                <div style={{ fontFamily:"'Orbitron',monospace",color:idx===0?"#ffd700":idx===1?"#c0c0c0":idx===2?"#cd7f32":C.muted,
                  fontWeight:900,fontSize:12,width:24,flexShrink:0 }}>#{idx+1}</div>

                <div style={{ width:42,height:42,borderRadius:13,background:`${C.accent2}18`,
                  border:`1.5px solid ${C.accent2}44`,display:"flex",alignItems:"center",
                  justifyContent:"center",fontSize:20,flexShrink:0 }}>👥</div>

                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontWeight:800,fontSize:isMobile?14:15,overflow:"hidden",
                    textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{eq.nombre}</div>
                  <div style={{ fontSize:10,color:C.muted,marginTop:3,display:"flex",gap:8,flexWrap:"wrap" }}>
                    {eq.grado && <span>📚 G{eq.grado}</span>}
                    {eq.grupo && <span>· Grp {eq.grupo}</span>}
                    <span>🎓 {eq.num_integrantes} integrante{eq.num_integrantes!==1?"s":""}</span>
                    <span>⭐ {eq.xp_equipo} XP</span>
                    <span>🗓️ {new Date(eq.ultima_actividad).toLocaleDateString("es-CO")}</span>
                  </div>
                  <div style={{ display:"flex",gap:5,flexWrap:"wrap",marginTop:6 }}>
                    {eq.misiones.map((m,i) => (
                      <span key={i} style={{ fontSize:9,padding:"2px 7px",borderRadius:20,
                        background:`${m.color||C.accent}22`,color:m.color||C.accent,fontWeight:600 }}>
                        {m.icon} {m.title}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ textAlign:"center",flexShrink:0 }}>
                  <div style={{ fontFamily:"'Orbitron',monospace",fontSize:isMobile?22:28,
                    fontWeight:900,color:notaColor2(eq.nota_promedio),lineHeight:1 }}>
                    {eq.nota_promedio.toFixed(1)}
                  </div>
                  <div style={{ fontSize:9,color:C.muted,marginTop:3 }}>nota prom.</div>
                  <div style={{ fontSize:10,color:C.accent,marginTop:4 }}>Ver informe →</div>
                </div>
              </div>
            </div>
          ))
        }
      </>)}
    </div>
  );
}


// ── Shared components ──
function Layout({ sidebar, children }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ display:"flex", height:"100vh", position:"relative", zIndex:5 }}>
      {sidebar}
      <main style={{
        flex:1,
        background:C.bg,
        /* En móvil el nav bottom tiene 60px; en desktop 100vh */
        height: isMobile ? "calc(100vh - 60px)" : "100vh",
        overflow: "hidden",
        display:"flex",
        flexDirection:"column",
        minHeight:0,
      }}>
        {children}
      </main>
    </div>
  );
}

function Sidebar({ user, onLogout, tabs, tab, setTab }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) return (
    <>
      {/* Bottom nav bar móvil */}
      <nav style={{ position:"fixed", bottom:0, left:0, right:0, background:C.surface, borderTop:`1px solid ${C.border}`, display:"flex", justifyContent:"space-around", padding:"8px 4px", zIndex:50 }}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"4px 8px",background:"none",border:"none",cursor:"pointer",borderTop:tab===t.id?`2px solid ${C.accent}`:"2px solid transparent",paddingTop:tab===t.id?6:8 }}>
            <span style={{ fontSize:18 }}>{t.icon}</span>
            <span style={{ fontSize:9, color:tab===t.id?C.accent:C.muted, fontWeight:tab===t.id?700:400 }}>{t.label}</span>
          </button>
        ))}
        <button onClick={onLogout} style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"4px 8px",background:"none",border:"none",cursor:"pointer",borderTop:"2px solid transparent",paddingTop:8 }}>
          <span style={{ fontSize:18 }}>🚪</span>
          <span style={{ fontSize:9, color:C.muted }}>Salir</span>
        </button>
      </nav>
      {/* Padding bottom para que el contenido no quede detrás del nav */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, height:70, pointerEvents:"none", zIndex:40 }} />
    </>
  );

  return (
    <aside style={{ width:210, background:C.surface, borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column", flexShrink:0 }}>
      <div style={{ padding:"18px 14px", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}><span style={{ fontSize:20, color:C.accent }}>⬡</span><span style={{ fontFamily:"'Orbitron',monospace", fontSize:15, fontWeight:900, color:C.accent, letterSpacing:2 }}>NEXUS</span></div>
        <div style={{ display:"flex", alignItems:"center", gap:9 }}>
          <div style={{ width:34,height:34,borderRadius:"50%",background:C.card,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15 }}>{user.role==="admin"?"👑":user.role==="teacher"?"📚":"🎓"}</div>
          <div><div style={{ fontSize:12, fontWeight:600 }}>{user.name.split(" ")[0]}</div><div style={{ fontSize:10, color:C.muted }}>{user.role==="admin"?"Administrador":user.role==="teacher"?"Docente":`Grado ${user.grade||""}`}</div></div>
        </div>
      </div>
      <nav style={{ flex:1, padding:"10px 6px", display:"flex", flexDirection:"column", gap:2 }}>
        {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{ width:"100%",display:"flex",alignItems:"center",gap:9,padding:"9px 10px",borderRadius:9,background:tab===t.id?`${C.accent}15`:"transparent",border:"none",borderLeft:tab===t.id?`2px solid ${C.accent}`:"2px solid transparent",color:tab===t.id?C.accent:C.muted,fontSize:12,cursor:"pointer",textAlign:"left" }}><span style={{ fontSize:15,width:18,textAlign:"center" }}>{t.icon}</span><span>{t.label}</span></button>)}
      </nav>
      <button onClick={onLogout} style={{ margin:"10px 6px",padding:"9px 10px",background:"transparent",border:`1px solid ${C.border}`,color:C.muted,borderRadius:9,cursor:"pointer",fontSize:11 }}>← Cerrar sesión</button>
    </aside>
  );
}

function Page({ title, desc, children }) {
  const isMobile = useIsMobile();
  return (
    <div style={{
      flex:1,
      overflowY:"auto",
      overflowX:"hidden",
      WebkitOverflowScrolling:"touch",   /* iOS momentum scroll */
      padding: isMobile?"14px 12px 90px":"26px",
      maxWidth:900,
      boxSizing:"border-box",
    }}>
      <h1 style={{ ...ptitle, fontSize: isMobile?17:22 }}>{title}</h1>
      {desc&&<p style={{ fontSize:12, color:C.muted, marginBottom:18 }}>{desc}</p>}
      {children}
    </div>
  );
}
function Card({ title, children }) { return <div style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18,marginBottom:14 }}><div style={{ fontSize:14,fontWeight:700,marginBottom:12 }}>{title}</div>{children}</div>; }
function InfoBox({ title, children }) { return <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginTop:14 }}><div style={{ fontSize:13,fontWeight:700,color:C.accent,marginBottom:8 }}>{title}</div>{children}</div>; }
function Row({ k, v }) { return <div style={{ fontSize:12,color:C.muted,padding:"4px 0" }}><span style={{ color:C.text,fontWeight:600,minWidth:90,display:"inline-block" }}>{k}:</span>{v}</div>; }
function Btn({ onClick, children, disabled }) { return <button onClick={onClick} disabled={disabled} style={{ padding:"10px 18px",background:disabled?C.border:`linear-gradient(135deg,${C.accent},${C.accent2})`,border:"none",borderRadius:10,color:"#fff",fontWeight:700,fontSize:13,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1 }}>{children}</button>; }

const lbl   = { fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:1,fontWeight:600,marginBottom:6,display:"block" };
const inp   = { background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",color:C.text,fontSize:13,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box" };
const grid2 = { display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 };
const ptitle= { fontSize:22,fontWeight:800,color:C.text,marginBottom:6 };

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Syne:wght@400;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{overflow:hidden;}
  ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:#1a3050;border-radius:2px;}
  input::placeholder,textarea::placeholder{color:#4a6080;}
  input:focus,textarea:focus,select:focus{border-color:#00c8ff55!important;outline:none;}
  select option{background:#0d1526;color:#e2e8f0;}
  @keyframes pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.3;transform:scale(.6);}}
  @media(max-width:767px){body{overflow:hidden;height:100%;}}
  html{height:100%;}
  /* Barras de scroll personalizadas para móvil */
  ::-webkit-scrollbar{width:2px;}
  ::-webkit-scrollbar-thumb{background:#1a3050;border-radius:2px;}
  ::-webkit-scrollbar-track{background:transparent;}
  @keyframes popIn{0%{transform:scale(0.85);opacity:0;}60%{transform:scale(1.04);}100%{transform:scale(1);opacity:1;}}
`;
