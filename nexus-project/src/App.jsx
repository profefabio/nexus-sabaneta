import { useState, useRef, useEffect, useCallback } from "react";

// ─── Llama al backend seguro (api/chat.js) ───────────────────
const callNexus = async (messages, system) => {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, system }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || "Error al conectar con NEXUS.";
};

const saveProgress = async (user, xp, nivel, misionId) => {
  try {
    await fetch("/api/saveprogress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        estudiante_id: user.id,
        nombre_estudiante: user.name,
        grado: user.grade || "",
        grupo: user.group || "",
        xp_total: xp,
        nivel,
        mision_id: misionId || null,
      }),
    });
  } catch (_) {}
};

// ─── Misiones por defecto ─────────────────────────────────────
const MISIONES_DEFAULT = [
  {
    id: "radio-am", title: "Radio AM", icon: "📻", color: "#f97316", glow: "rgba(249,115,22,0.35)",
    description: "Construye tu propio receptor de Radio AM con materiales básicos",
    retos: [
      { id: 1, stars: 1, title: "¿Qué es una onda?", desc: "Comprende amplitud, frecuencia y longitud de onda de las ondas electromagnéticas." },
      { id: 2, stars: 1, title: "El espectro de radio", desc: "Explora las frecuencias AM (530–1700 kHz) y cómo se diferencia de FM." },
      { id: 3, stars: 2, title: "Componentes del receptor", desc: "Identifica: diodo 1N34A, condensador variable, bobina de ferrita, auricular alta impedancia." },
      { id: 4, stars: 2, title: "La bobina artesanal", desc: "Enrolla 60 vueltas de alambre de cobre esmaltado en núcleo de ferrita." },
      { id: 5, stars: 3, title: "El detector de envolvente", desc: "El diodo rectifica la portadora y extrae el audio. ¡El corazón del receptor!" },
      { id: 6, stars: 3, title: "¡Arma tu Radio AM!", desc: "Integra todo en la protoboard, conecta antena de 1m y sintoniza una emisora de Medellín." },
    ]
  },
  {
    id: "transmisor-fm", title: "Transmisor FM", icon: "📡", color: "#eab308", glow: "rgba(234,179,8,0.35)",
    description: "Diseña un transmisor FM de bajo alcance con componentes accesibles",
    retos: [
      { id: 1, stars: 1, title: "¿Cómo viaja tu voz?", desc: "Comprende la modulación FM: cómo una voz 'monta' sobre una onda portadora." },
      { id: 2, stars: 2, title: "El oscilador LC", desc: "Bobina (L) + condensador (C) generan la portadora. Calcula frecuencias con la fórmula de Thomson." },
      { id: 3, stars: 2, title: "Transistor amplificador", desc: "Usa el BC547 como amplificador. Regiones: corte, activa y saturación." },
      { id: 4, stars: 2, title: "La antena irradiadora", desc: "Calcula longitud λ/4 para tu frecuencia. Construye dipolo con alambre de cobre." },
      { id: 5, stars: 3, title: "¡Transmite tu señal!", desc: "Ensambla el circuito, sintoniza entre 88–108 MHz y escúchate en un radio FM." },
    ]
  },
  {
    id: "brazo-robotico", title: "Brazo Robótico", icon: "🦾", color: "#22c55e", glow: "rgba(34,197,94,0.35)",
    description: "Programa y construye un brazo robótico con Arduino UNO y piezas impresas en 3D",
    retos: [
      { id: 1, stars: 1, title: "Conoce tu Arduino UNO", desc: "Pines digitales, analógicos, PWM, alimentación. Carga Blink: tu primer sketch." },
      { id: 2, stars: 1, title: "El servomotor SG90", desc: "Conecta un servo al pin PWM. Programa ángulos con Servo.h de 0° a 180°." },
      { id: 3, stars: 2, title: "Control por potenciómetro", desc: "Lee con analogRead() (0–1023) y mapea a ángulos del servo." },
      { id: 4, stars: 2, title: "Diseño 3D en TinkerCAD", desc: "Diseña: base giratoria, hombro, codo, muñeca y pinza. Exporta en STL." },
      { id: 5, stars: 2, title: "Impresión y ensamble", desc: "Cura: capa 0.2mm, relleno 20%, soporte donde sea necesario. Ensambla con tornillos M3." },
      { id: 6, stars: 3, title: "Secuencia de movimientos", desc: "Programa el brazo para recoger, mover y depositar un objeto. Usa arrays y bucles for." },
      { id: 7, stars: 3, title: "¡Control Bluetooth!", desc: "Agrega módulo HC-05 y controla el brazo desde el celular. ¡Misión completada!" },
    ]
  },
];

const COLORES_MISION = ["#f97316","#eab308","#22c55e","#00c8ff","#8b5cf6","#ec4899","#14b8a6","#f43f5e"];
const ICONOS_MISION  = ["📻","📡","🦾","🔬","💡","🖥️","🤖","🎮","⚡","🔧","🌐","🧪"];

// ─── System Prompt ────────────────────────────────────────────
const buildPrompt = (subject = "Tecnología e Informática", grade = "7-11", extra = "") => `
Eres NEXUS, compañero de retos académicos para estudiantes de grados ${grade} de la I.E. de Sabaneta, Colombia.
Asignatura: ${subject}.${extra ? `\nContexto adicional: ${extra}` : ""}

PERSONALIDAD:
- Animado, motivador, hablas como guía de aventuras/videojuego
- Usas emojis con moderación
- NUNCA das respuestas directas: guías con pistas y preguntas reflexivas
- Si se acercan: "¡Vas por buen camino! 🔥 Ahora piensa en..."
- Llamas al estudiante "Explorador" si no sabes su nombre

METODOLOGÍA (siempre):
1. Primero pregunta qué sabe el estudiante del tema
2. Da UNA pista a la vez
3. Usa: "¿Qué pasaría si...?", "¿Recuerdas cuando vimos...?", "¿Qué tiene en común con...?"
4. Si se rinde, da pista mayor pero nunca la respuesta completa
5. Cuando llegan solos a la respuesta, celebra: "¡+20 puntos de maestría! ⭐"
6. Por cada intento: "¡+5 puntos de exploración!"

MODO LIBRE: El estudiante puede preguntar LIBREMENTE sobre cualquier tema de ${subject}.
Fuera de ${subject} di: "¡Ese reto está fuera de mi mapa, Explorador! 🗺️"
Siempre en español colombiano, cálido y motivador.
`;

// ─── Tokens de diseño ─────────────────────────────────────────
const C = {
  bg:"#070d1a", surface:"#0d1526", card:"#111e33", border:"#1a3050",
  accent:"#00c8ff", accent2:"#8b5cf6", accent3:"#10d98a",
  text:"#e2e8f0", muted:"#4a6080", user:"#162040",
};

// ═══════════════════════════════════════════════════════════════
// APP PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("login");
  const [loginErr, setLoginErr] = useState("");
  const [misiones, setMisiones] = useState(MISIONES_DEFAULT);

  const login = async (payload) => {
    try {
      const res = await fetch("/api/login", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.user) {
        setUser(data.user);
        setView(data.user.role === "admin" ? "admin" : data.user.role === "teacher" ? "teacher" : "student");
        setLoginErr("");
      } else {
        setLoginErr(data.error || "No encontrado. Verifica tus datos.");
      }
    } catch { setLoginErr("Error de conexión. Intenta de nuevo."); }
  };
  const logout = () => { setUser(null); setView("login"); };

  return (
    <div style={{ fontFamily:"'Syne','Inter',sans-serif", background:C.bg, color:C.text, height:"100vh", overflow:"hidden", position:"relative" }}>
      <div style={{ position:"fixed", inset:0, backgroundImage:`linear-gradient(rgba(0,200,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,.025) 1px,transparent 1px)`, backgroundSize:"36px 36px", pointerEvents:"none", zIndex:0 }} />
      {view === "login"   && <LoginView onLogin={login} error={loginErr} />}
      {view === "admin"   && <AdminView user={user} onLogout={logout} misiones={misiones} setMisiones={setMisiones} />}
      {view === "teacher" && <TeacherView user={user} onLogout={logout} misiones={misiones} />}
      {view === "student" && <StudentView user={user} onLogout={logout} misiones={misiones} />}
      <style>{CSS}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════
function LoginView({ onLogin, error }) {
  const [mode, setMode] = useState("student");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [show, setShow] = useState(false);
  const [nombre, setNombre] = useState(""); const [apellido, setApellido] = useState("");
  const [grado, setGrado] = useState(""); const [grupo, setGrupo] = useState("");

  const handleSubmit = () => {
    if (mode === "teacher") onLogin({ type:"teacher", email, password:pw });
    else onLogin({ type:"student", nombre:nombre.trim(), apellido:apellido.trim(), grado, grupo });
  };

  return (
    <div style={{ display:"flex", height:"100vh", position:"relative", zIndex:5 }}>
      {/* Panel izquierdo */}
      <div style={{ flex:1, background:`linear-gradient(135deg,#070d1a 0%,#0d1f3c 100%)`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:40, borderRight:`1px solid ${C.border}` }}>
        <span style={{ fontSize:72, color:C.accent, filter:`drop-shadow(0 0 24px ${C.accent})`, marginBottom:20 }}>⬡</span>
        <div style={{ fontFamily:"'Orbitron',monospace", fontSize:36, fontWeight:900, color:C.accent, letterSpacing:4, marginBottom:8 }}>NEXUS</div>
        <div style={{ fontSize:13, color:C.muted, letterSpacing:2, textAlign:"center", lineHeight:1.8 }}>Plataforma Educativa<br/>I.E. Sabaneta</div>
        <div style={{ marginTop:48, background:`${C.accent}10`, border:`1px solid ${C.border}`, borderRadius:14, padding:20, width:"100%", maxWidth:280 }}>
          <div style={{ fontSize:11, color:C.muted, textTransform:"uppercase", letterSpacing:1.5, marginBottom:14, fontWeight:600 }}>Administrador</div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:42, height:42, borderRadius:"50%", background:`${C.accent}15`, border:`1.5px solid ${C.accent}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>👑</div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:C.text }}>Fabio Alberto Ortiz M.</div>
              <div style={{ fontSize:11, color:C.accent, marginTop:2 }}>fabioortiz37422@sabaneta.edu.co</div>
              <div style={{ fontSize:10, color:C.muted, marginTop:1 }}>Tecnología e Informática · Grados 6–11</div>
            </div>
          </div>
        </div>
      </div>
      {/* Panel derecho */}
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:40 }}>
        <div style={{ width:"100%", maxWidth:420 }}>
          <div style={{ display:"flex", background:C.surface, borderRadius:14, padding:4, marginBottom:28, border:`1px solid ${C.border}` }}>
            {[["student","🎓","Soy Estudiante"],["teacher","📚","Soy Docente"]].map(([m,ic,lb])=>(
              <button key={m} onClick={()=>setMode(m)} style={{ flex:1, padding:"11px 8px", borderRadius:10, border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:13, transition:"all .2s",
                background:mode===m?`linear-gradient(135deg,${C.accent},${C.accent2})`:"transparent",
                color:mode===m?"#fff":C.muted, boxShadow:mode===m?`0 4px 14px ${C.accent}44`:"none" }}>{ic} {lb}</button>
            ))}
          </div>

          {mode === "student" && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ textAlign:"center", marginBottom:4 }}>
                <div style={{ fontSize:20, marginBottom:6 }}>🎓</div>
                <div style={{ fontSize:18, fontWeight:800 }}>Ingreso Estudiantes</div>
                <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>Escribe tu nombre completo y selecciona tu grado</div>
              </div>
              <div><div style={lbl}>Nombres</div><input style={inp} placeholder="Ej: Juan Carlos" value={nombre} onChange={e=>setNombre(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} /></div>
              <div><div style={lbl}>Apellidos</div><input style={inp} placeholder="Ej: Pérez García" value={apellido} onChange={e=>setApellido(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div><div style={lbl}>Grado</div>
                  <select style={inp} value={grado} onChange={e=>setGrado(e.target.value)}>
                    <option value="">-- Selecciona --</option>
                    {["6","7","8","9","10","11"].map(g=><option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div><div style={lbl}>Grupo</div>
                  <select style={inp} value={grupo} onChange={e=>setGrupo(e.target.value)}>
                    <option value="">-- Selecciona --</option>
                    {["1","2","3","4"].map(g=><option key={g} value={g}>Grupo {g}</option>)}
                  </select>
                </div>
              </div>
              {error && <div style={{ background:"#ff444422", border:"1px solid #ff444444", color:"#ff7777", padding:"10px 14px", borderRadius:8, fontSize:13 }}>{error}</div>}
              <button style={{ padding:"13px 20px", background:`linear-gradient(135deg,${C.accent3},#059669)`, border:"none", borderRadius:12, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer" }}
                onClick={handleSubmit} disabled={!nombre||!apellido||!grado||!grupo}>Entrar al aula NEXUS 🚀</button>
            </div>
          )}

          {mode === "teacher" && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ textAlign:"center", marginBottom:4 }}>
                <div style={{ fontSize:20, marginBottom:6 }}>📚</div>
                <div style={{ fontSize:18, fontWeight:800 }}>Ingreso Docentes</div>
                <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>Usa tu correo y contraseña institucional</div>
              </div>
              <div><div style={lbl}>Correo institucional</div><input style={inp} type="email" placeholder="usuario@sabaneta.edu.co" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} /></div>
              <div>
                <div style={lbl}>Contraseña</div>
                <div style={{ position:"relative" }}>
                  <input style={inp} type={show?"text":"password"} placeholder="••••••••" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} />
                  <button style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:14 }} onClick={()=>setShow(!show)}>{show?"🙈":"👁️"}</button>
                </div>
              </div>
              {error && <div style={{ background:"#ff444422", border:"1px solid #ff444444", color:"#ff7777", padding:"10px 14px", borderRadius:8, fontSize:13 }}>{error}</div>}
              <button style={{ padding:"13px 20px", background:`linear-gradient(135deg,${C.accent},${C.accent2})`, border:"none", borderRadius:12, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer" }}
                onClick={handleSubmit} disabled={!email||!pw}>Ingresar al sistema ➤</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════════
function AdminView({ user, onLogout, misiones, setMisiones }) {
  const [tab, setTab] = useState("dashboard");
  return (
    <Layout sidebar={<Sidebar user={user} onLogout={onLogout} tab={tab} setTab={setTab} tabs={[
      { id:"dashboard", icon:"⬡",  label:"Dashboard" },
      { id:"progreso",  icon:"📊", label:"Progreso" },
      { id:"missions",  icon:"🗺️", label:"Misiones" },
      { id:"users",     icon:"👥", label:"Usuarios" },
      { id:"subjects",  icon:"📚", label:"Asignaturas" },
    ]} />}>
      {tab === "dashboard" && <AdminDashboard user={user} misiones={misiones} />}
      {tab === "progreso"  && <AdminProgreso />}
      {tab === "missions"  && <AdminMisiones misiones={misiones} setMisiones={setMisiones} />}
      {tab === "users"     && <AdminUsuarios />}
      {tab === "subjects"  && (
        <Page title="Asignaturas configuradas">
          {["Tecnología e Informática · Prof. Fabio Ortiz","Matemáticas · Por asignar","Ciencias Naturales · Por asignar"].map((s,i)=>(
            <Card key={i} title={s}><div style={{ fontSize:13, color:C.muted }}>NEXUS activo · Configuración pendiente del docente</div></Card>
          ))}
        </Page>
      )}
    </Layout>
  );
}

// ── Dashboard con estadísticas reales ──
function AdminDashboard({ user, misiones }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats").then(r=>r.json()).then(d=>{ setStats(d); setLoading(false); }).catch(()=>setLoading(false));
  }, []);

  return (
    <Page title="Panel de Administración" desc={`Bienvenido, ${user.name}. Gestiona toda la plataforma NEXUS.`}>
      {loading && <div style={{ color:C.muted, fontSize:13, marginBottom:16 }}>⏳ Cargando estadísticas desde Supabase...</div>}

      <div style={grid4}>
        {[
          ["🎓","Estudiantes", stats?.resumen?.totalEstudiantes ?? "—", C.accent],
          ["📚","Docentes",    stats?.resumen?.totalDocentes    ?? "—", C.accent2],
          ["🔥","Activos",     stats?.resumen?.estudiantesActivos ?? "—", C.accent3],
          ["⭐","XP Total",   stats?.resumen?.xpTotal           ?? "—", "#f97316"],
        ].map(([ic,lb,val,col],i)=>(
          <div key={i} style={{ background:C.card, border:`1px solid ${col}44`, borderRadius:12, padding:16, textAlign:"center" }}>
            <div style={{ fontSize:22, marginBottom:8 }}>{ic}</div>
            <div style={{ fontSize:28, fontWeight:900, fontFamily:"'Orbitron',monospace", color:col }}>{val}</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>{lb}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <Card title="🏆 Top Estudiantes">
          {stats?.topEstudiantes?.length > 0
            ? stats.topEstudiantes.slice(0,5).map((e,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
                <span style={{ fontFamily:"'Orbitron',monospace", color:["#ffd700","#c0c0c0","#cd7f32","#aaa","#aaa"][i], fontWeight:900, fontSize:13, width:22 }}>#{i+1}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:600 }}>{e.nombre_estudiante}</div>
                  <div style={{ fontSize:10, color:C.muted }}>Grado {e.grado}</div>
                </div>
                <span style={{ fontFamily:"'Orbitron',monospace", color:C.accent3, fontWeight:700, fontSize:12 }}>{e.xp_total} XP</span>
              </div>
            ))
            : <div style={{ color:C.muted, fontSize:12 }}>Sin actividad registrada aún</div>}
        </Card>

        <Card title="🗺️ Misiones activas">
          {misiones.map(m=>(
            <div key={m.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
              <span style={{ fontSize:20 }}>{m.icon}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:600, color:m.color }}>{m.title}</div>
                <div style={{ fontSize:10, color:C.muted }}>{m.retos.length} retos</div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {stats?.actividadReciente?.length > 0 && (
        <Card title="🕐 Actividad reciente">
          {stats.actividadReciente.slice(0,8).map((a,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 12px", background:C.surface, borderRadius:8, marginBottom:6 }}>
              <span style={{ fontSize:16 }}>🎓</span>
              <div style={{ flex:1 }}>
                <span style={{ fontSize:12, fontWeight:600 }}>{a.nombre_estudiante}</span>
                <span style={{ fontSize:11, color:C.muted }}> · Grado {a.grado}</span>
                {a.mision_id && <span style={{ fontSize:11, color:C.accent }}> · {a.mision_id}</span>}
              </div>
              <span style={{ fontSize:11, color:C.accent3, fontWeight:600 }}>{a.xp_total} XP</span>
              <span style={{ fontSize:10, color:C.muted }}>{new Date(a.updated_at).toLocaleDateString("es-CO")}</span>
            </div>
          ))}
        </Card>
      )}
    </Page>
  );
}

// ── Progreso detallado ──
function AdminProgreso() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtroGrado, setFiltroGrado] = useState("todos");

  useEffect(() => {
    fetch("/api/stats").then(r=>r.json()).then(d=>{ setStats(d); setLoading(false); }).catch(()=>setLoading(false));
  }, []);

  const grados = stats?.porGrado ? Object.keys(stats.porGrado).sort() : [];
  const estudiantesFiltrados = filtroGrado === "todos"
    ? (stats?.topEstudiantes || [])
    : (stats?.topEstudiantes || []).filter(e => e.grado === filtroGrado);

  return (
    <Page title="📊 Progreso Estudiantil" desc="Seguimiento de actividad y avance en la plataforma NEXUS">
      {loading && <div style={{ color:C.muted, fontSize:13, marginBottom:16 }}>⏳ Cargando datos desde Supabase...</div>}

      {!loading && stats && !stats.error && (
        <>
          <Card title="📈 Actividad por Grado">
            {grados.length > 0 ? grados.map(g => {
              const d = stats.porGrado[g];
              const maxXp = Math.max(...grados.map(k => stats.porGrado[k].xp), 1);
              const pct = Math.round((d.xp / maxXp) * 100);
              return (
                <div key={g} style={{ marginBottom:12 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:12, fontWeight:600 }}>Grado {g}</span>
                    <span style={{ fontSize:11, color:C.muted }}>{d.count} estudiantes · {d.xp} XP total</span>
                  </div>
                  <div style={{ height:8, background:C.border, borderRadius:4, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${C.accent},${C.accent2})`, borderRadius:4, transition:"width .5s" }} />
                  </div>
                </div>
              );
            }) : <div style={{ color:C.muted, fontSize:12 }}>Sin actividad aún. Los estudiantes generan registros al usar el chat.</div>}
          </Card>

          {Object.keys(stats.porMision).length > 0 && (
            <Card title="🗺️ Uso por Misión">
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                {Object.entries(stats.porMision).map(([m,d])=>(
                  <div key={m} style={{ background:C.surface, borderRadius:10, padding:12, textAlign:"center", border:`1px solid ${C.border}` }}>
                    <div style={{ fontSize:11, color:C.accent, fontWeight:700, marginBottom:4 }}>{m}</div>
                    <div style={{ fontSize:24, fontWeight:900 }}>{d.count}</div>
                    <div style={{ fontSize:10, color:C.muted }}>{d.xp} XP acumulado</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card title="🎓 Detalle por Estudiante">
            <div style={{ display:"flex", gap:10, marginBottom:14, alignItems:"center" }}>
              <span style={{ ...lbl, marginBottom:0 }}>Grado:</span>
              <select style={{ ...inp, width:"auto", padding:"6px 12px" }} value={filtroGrado} onChange={e=>setFiltroGrado(e.target.value)}>
                <option value="todos">Todos</option>
                {grados.map(g=><option key={g} value={g}>Grado {g}</option>)}
              </select>
            </div>
            {estudiantesFiltrados.length > 0
              ? estudiantesFiltrados.map((e,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:C.surface, borderRadius:10, border:`1px solid ${C.border}`, marginBottom:6 }}>
                  <span style={{ fontFamily:"'Orbitron',monospace", color:C.muted, fontSize:12, width:28 }}>#{i+1}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>{e.nombre_estudiante}</div>
                    <div style={{ fontSize:11, color:C.muted }}>Grado {e.grado} · Nivel {e.nivel||1}</div>
                  </div>
                  {e.mision_id && <span style={{ padding:"3px 8px", borderRadius:6, fontSize:10, background:`${C.accent}22`, color:C.accent }}>{e.mision_id}</span>}
                  <span style={{ fontFamily:"'Orbitron',monospace", color:C.accent3, fontWeight:700 }}>{e.xp_total} XP</span>
                </div>
              ))
              : <div style={{ color:C.muted, fontSize:12 }}>Sin estudiantes en este filtro.</div>}
          </Card>
        </>
      )}

      {!loading && stats?.error && (
        <InfoBox title="⚠️ Error de conexión">
          <Row k="Detalle" v={stats.error} />
          <Row k="Acción" v="Verifica que la tabla nexus_progreso existe en Supabase con columnas: estudiante_id, nombre_estudiante, grado, grupo, xp_total, nivel, mision_id, updated_at" />
        </InfoBox>
      )}
    </Page>
  );
}

// ── Gestión de Misiones ──
function AdminMisiones({ misiones, setMisiones }) {
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ id:"", title:"", icon:"📻", color:"#f97316", description:"", retos:[] });
  const [retoF, setRetoF] = useState({ title:"", desc:"", stars:1 });
  const [saved, setSaved] = useState(false);

  const iniciarNueva = () => {
    setForm({ id:`mision-${Date.now()}`, title:"", icon:"📻", color:"#f97316", description:"", retos:[] });
    setEditando("nueva");
  };
  const iniciarEditar = (m) => { setForm({ ...m, retos:m.retos.map(r=>({...r})) }); setEditando(m.id); };

  const agregarReto = () => {
    if (!retoF.title) return;
    setForm(p=>({ ...p, retos:[...p.retos, { id:p.retos.length+1, ...retoF }] }));
    setRetoF({ title:"", desc:"", stars:1 });
  };
  const quitarReto = (idx) => setForm(p=>({ ...p, retos:p.retos.filter((_,i)=>i!==idx).map((r,i)=>({...r,id:i+1})) }));

  const guardar = () => {
    if (!form.title || form.retos.length===0) return;
    const m = { ...form, glow: form.color+"59" };
    setMisiones(prev => editando==="nueva" ? [...prev, m] : prev.map(x=>x.id===editando?m:x));
    setSaved(true); setTimeout(()=>{ setSaved(false); setEditando(null); }, 1500);
  };
  const eliminar = (id) => { if (confirm("¿Eliminar esta misión?")) setMisiones(prev=>prev.filter(m=>m.id!==id)); };

  if (!editando) return (
    <Page title="🗺️ Gestión de Misiones" desc="Crea, edita y elimina misiones. Los cambios se aplican inmediatamente en toda la plataforma.">
      <div style={{ marginBottom:16 }}><Btn onClick={iniciarNueva}>+ Nueva Misión</Btn></div>
      {misiones.map(m=>(
        <div key={m.id} style={{ background:C.card, border:`1px solid ${m.color}44`, borderRadius:14, padding:18, marginBottom:12, display:"flex", alignItems:"center", gap:14 }}>
          <span style={{ fontSize:36 }}>{m.icon}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:700, color:m.color }}>{m.title}</div>
            <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{m.description}</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>{m.retos.length} retos · {m.retos.filter(r=>r.stars===3).length} avanzados</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>iniciarEditar(m)} style={{ padding:"7px 14px", background:`${C.accent}22`, border:`1px solid ${C.accent}44`, borderRadius:8, color:C.accent, fontSize:12, cursor:"pointer" }}>✏️ Editar</button>
            <button onClick={()=>eliminar(m.id)} style={{ padding:"7px 14px", background:"#ff444422", border:"1px solid #ff444444", borderRadius:8, color:"#ff7777", fontSize:12, cursor:"pointer" }}>🗑️</button>
          </div>
        </div>
      ))}
    </Page>
  );

  return (
    <Page title={editando==="nueva"?"➕ Nueva Misión":"✏️ Editar Misión"}>
      <button onClick={()=>setEditando(null)} style={{ marginBottom:16, background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:13 }}>← Volver</button>

      <Card title="📋 Información general">
        <div style={grid2}>
          <div>
            <div style={lbl}>Título</div>
            <input style={inp} placeholder="Ej: Circuitos con Arduino" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} />
          </div>
          <div>
            <div style={lbl}>Ícono</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {ICONOS_MISION.map(ic=>(
                <button key={ic} onClick={()=>setForm(p=>({...p,icon:ic}))} style={{ width:36, height:36, borderRadius:8, border:`2px solid ${form.icon===ic?C.accent:C.border}`, background:form.icon===ic?`${C.accent}22`:C.surface, fontSize:18, cursor:"pointer" }}>{ic}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={lbl}>Descripción</div>
          <input style={inp} placeholder="Describe la misión brevemente" value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} />
        </div>
        <div>
          <div style={lbl}>Color</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:4 }}>
            {COLORES_MISION.map(col=>(
              <button key={col} onClick={()=>setForm(p=>({...p,color:col}))} style={{ width:32, height:32, borderRadius:"50%", background:col, border:`3px solid ${form.color===col?"#fff":col}`, cursor:"pointer", transform:form.color===col?"scale(1.2)":"scale(1)", transition:"transform .15s" }} />
            ))}
          </div>
          <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:30 }}>{form.icon}</span>
            <span style={{ fontSize:14, fontWeight:700, color:form.color }}>{form.title||"Vista previa"}</span>
          </div>
        </div>
      </Card>

      <Card title="⭐ Retos">
        {form.retos.length===0 && <div style={{ color:C.muted, fontSize:12, marginBottom:12 }}>Sin retos. Agrega al menos uno para guardar la misión.</div>}
        {form.retos.map((r,i)=>(
          <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"10px 12px", background:C.surface, borderRadius:8, marginBottom:8, border:`1px solid ${C.border}` }}>
            <span style={{ fontFamily:"'Orbitron',monospace", color:form.color, fontWeight:900, fontSize:13, width:20, flexShrink:0 }}>{r.id}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600 }}>{r.title} <span style={{ color:"#eab308" }}>{"⭐".repeat(r.stars)}</span></div>
              <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{r.desc}</div>
            </div>
            <button onClick={()=>quitarReto(i)} style={{ background:"none", border:"none", color:"#ff7777", cursor:"pointer", fontSize:16 }}>✕</button>
          </div>
        ))}

        <div style={{ background:`${C.accent}08`, border:`1px dashed ${C.accent}44`, borderRadius:10, padding:14, marginTop:8 }}>
          <div style={{ fontSize:12, color:C.accent, fontWeight:600, marginBottom:10 }}>+ Agregar reto</div>
          <div style={grid2}>
            <div><div style={lbl}>Título del reto</div><input style={inp} placeholder="Ej: ¿Qué es un LED?" value={retoF.title} onChange={e=>setRetoF(p=>({...p,title:e.target.value}))} /></div>
            <div>
              <div style={lbl}>Dificultad</div>
              <select style={inp} value={retoF.stars} onChange={e=>setRetoF(p=>({...p,stars:Number(e.target.value)}))}>
                <option value={1}>⭐ Básico</option>
                <option value={2}>⭐⭐ Intermedio</option>
                <option value={3}>⭐⭐⭐ Avanzado</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop:10 }}>
            <div style={lbl}>Descripción del reto</div>
            <textarea style={{ ...inp, minHeight:60, resize:"vertical" }} placeholder="¿Qué aprenderá el estudiante?" value={retoF.desc} onChange={e=>setRetoF(p=>({...p,desc:e.target.value}))} />
          </div>
          <button onClick={agregarReto} disabled={!retoF.title} style={{ marginTop:10, padding:"8px 16px", background:`${C.accent3}22`, border:`1px solid ${C.accent3}44`, borderRadius:8, color:C.accent3, fontSize:12, fontWeight:700, cursor:"pointer" }}>Agregar reto</button>
        </div>
      </Card>

      <div style={{ display:"flex", gap:10 }}>
        <Btn onClick={guardar} disabled={!form.title||form.retos.length===0}>{saved?"✅ ¡Guardado!":editando==="nueva"?"Crear Misión 🚀":"Guardar Cambios ✔️"}</Btn>
        <button onClick={()=>setEditando(null)} style={{ padding:"11px 20px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:10, color:C.muted, fontSize:13, cursor:"pointer" }}>Cancelar</button>
      </div>
    </Page>
  );
}

// ── Usuarios ──
function AdminUsuarios() {
  const [nu, setNu] = useState({ name:"", email:"", password:"", role:"student", grade:"", subject:"" });
  const [saved, setSaved] = useState(false);
  return (
    <Page title="Gestión de Usuarios">
      <Card title="➕ Agregar usuario">
        <div style={grid2}>
          <input style={inp} placeholder="Nombre completo" value={nu.name} onChange={e=>setNu({...nu,name:e.target.value})} />
          <input style={inp} placeholder="Correo institucional" value={nu.email} onChange={e=>setNu({...nu,email:e.target.value})} />
          <input style={inp} placeholder="Contraseña temporal" value={nu.password} onChange={e=>setNu({...nu,password:e.target.value})} />
          <select style={inp} value={nu.role} onChange={e=>setNu({...nu,role:e.target.value})}>
            <option value="student">Estudiante</option>
            <option value="teacher">Docente</option>
            <option value="admin">Administrador</option>
          </select>
          {nu.role==="student" && <input style={inp} placeholder="Grado (ej: 9°)" value={nu.grade} onChange={e=>setNu({...nu,grade:e.target.value})} />}
          {nu.role==="teacher" && <input style={inp} placeholder="Asignatura" value={nu.subject} onChange={e=>setNu({...nu,subject:e.target.value})} />}
        </div>
        <Btn onClick={()=>{setSaved(true);setTimeout(()=>setSaved(false),2000)}}>{saved?"✅ ¡Guardado!":"Agregar usuario"}</Btn>
      </Card>
      <InfoBox title="💡 Gestión directa en Supabase">
        <Row k="Tablas" v="docentes / estudiantes" />
        <Row k="Contraseñas" v="Genera hashes bcrypt en: bcrypt-generator.com (cost 10)" />
        <Row k="Masivo" v="Usa el Table Editor de Supabase para cargar CSV con muchos usuarios" />
      </InfoBox>
    </Page>
  );
}

// ═══════════════════════════════════════════════════════════════
// TEACHER
// ═══════════════════════════════════════════════════════════════
function TeacherView({ user, onLogout, misiones }) {
  const [tab, setTab] = useState("config");
  const [cfg, setCfg] = useState({ subject:user.subject||"", grade:"7-11", topics:"", methodology:"", tone:"motivador" });
  const [saved, setSaved] = useState(false);

  return (
    <Layout sidebar={<Sidebar user={user} onLogout={onLogout} tab={tab} setTab={setTab} tabs={[
      { id:"config",   icon:"⚙️", label:"Mi NEXUS" },
      { id:"missions", icon:"🗺️", label:"Ver misiones" },
      { id:"preview",  icon:"👁️", label:"Vista previa" },
    ]} />}>
      {tab === "config" && (
        <Page title="Configura NEXUS para tu asignatura" desc="NEXUS usará este contexto para guiar a tus estudiantes con pistas.">
          <Card title="📚 Asignatura y grados">
            <div style={grid2}>
              <div><div style={lbl}>Asignatura</div><input style={inp} value={cfg.subject} onChange={e=>setCfg({...cfg,subject:e.target.value})} placeholder="Ej: Matemáticas" /></div>
              <div><div style={lbl}>Grados</div><input style={inp} value={cfg.grade} onChange={e=>setCfg({...cfg,grade:e.target.value})} placeholder="Ej: 8° y 9°" /></div>
            </div>
          </Card>
          <Card title="📋 Temáticas del periodo">
            <div style={lbl}>Temas que estás trabajando</div>
            <textarea style={{ ...inp, minHeight:90, resize:"vertical", marginBottom:14 }} value={cfg.topics} onChange={e=>setCfg({...cfg,topics:e.target.value})} placeholder="Ej: Ecuaciones, sistemas de ecuaciones..." />
            <div style={lbl}>Enfoque pedagógico</div>
            <textarea style={{ ...inp, minHeight:70, resize:"vertical", marginBottom:14 }} value={cfg.methodology} onChange={e=>setCfg({...cfg,methodology:e.target.value})} placeholder="Ej: Aprendizaje basado en problemas..." />
            <div style={lbl}>Tono de NEXUS</div>
            <select style={{ ...inp, marginBottom:0 }} value={cfg.tone} onChange={e=>setCfg({...cfg,tone:e.target.value})}>
              <option value="motivador">Motivador y entusiasta</option>
              <option value="formal">Formal y estructurado</option>
              <option value="socrático">Socrático (solo preguntas)</option>
              <option value="gamificado">Gamificado extremo (aventura)</option>
            </select>
          </Card>
          <Btn onClick={()=>{setSaved(true);setTimeout(()=>setSaved(false),2000)}}>{saved?"✅ ¡Guardado!":"Guardar configuración"}</Btn>
        </Page>
      )}
      {tab === "missions" && <Page title="Mapa de Misiones 2025"><MissionMap misiones={misiones} /></Page>}
      {tab === "preview" && (
        <Page title="Vista previa · Chat estudiantil">
          <NexusChat prompt={buildPrompt(cfg.subject||"Tecnología e Informática", cfg.grade, cfg.topics)} userName="Explorador" compact user={null} misionId={null} />
        </Page>
      )}
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════
// STUDENT
// ═══════════════════════════════════════════════════════════════
function StudentView({ user, onLogout, misiones }) {
  const [tab, setTab] = useState("chat");
  const [mission, setMission] = useState(null);
  const missionData = misiones.find(m=>m.id===mission);

  return (
    <Layout sidebar={<Sidebar user={user} onLogout={onLogout} tab={tab} setTab={setTab} tabs={[
      { id:"chat",     icon:"⬡", label:"NEXUS Chat" },
      { id:"missions", icon:"🗺️", label:"Mis Misiones" },
      { id:"progress", icon:"⭐", label:"Mi Progreso" },
    ]} />}>
      {tab === "chat" && (
        <div style={{ height:"100%", display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ padding:"16px 24px 0", flexShrink:0 }}>
            <h1 style={ptitle}>NEXUS · Tu compañero de retos</h1>
            <div style={{ display:"flex", gap:8, marginBottom:8 }}>
              {mission && (
                <div style={{ display:"flex", alignItems:"center", gap:8, background:C.card, border:`1px solid ${missionData?.color}44`, borderRadius:10, padding:"7px 12px", fontSize:12, flex:1 }}>
                  <span>{missionData?.icon}</span>
                  <span>Misión activa: <strong>{missionData?.title}</strong></span>
                  <button style={{ marginLeft:"auto", background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:14 }} onClick={()=>setMission(null)}>✕</button>
                </div>
              )}
              <div style={{ display:"flex", alignItems:"center", gap:6, background:`${C.accent3}15`, border:`1px solid ${C.accent3}44`, borderRadius:10, padding:"7px 12px", fontSize:11, color:C.accent3 }}>
                💬 Modo libre activo
              </div>
            </div>
          </div>
          <div style={{ flex:1, overflow:"hidden", padding:"0 24px 24px" }}>
            <NexusChat
              prompt={buildPrompt("Tecnología e Informática", user.grade||"7-11",
                mission?`El estudiante trabaja en la misión: ${missionData?.title}. Guíalo específicamente por esa unidad.`:"")}
              userName={user.name} user={user} misionId={mission}
            />
          </div>
        </div>
      )}
      {tab === "missions" && (
        <Page title="🗺️ Mapa de Misiones 2025" desc="Elige una misión para que NEXUS te guíe paso a paso.">
          <MissionMap misiones={misiones} onSelect={id=>{ setMission(id); setTab("chat"); }} />
        </Page>
      )}
      {tab === "progress" && (
        <Page title="⭐ Mi Progreso">
          <InfoBox title={`🎓 ${user.name}`}>
            <Row k="Grado" v={user.grade||"Por asignar"} />
            <Row k="Grupo" v={user.group||"—"} />
            <Row k="Correo" v={user.email} />
          </InfoBox>
        </Page>
      )}
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════
// NEXUS CHAT — Guarda XP en Supabase
// ═══════════════════════════════════════════════════════════════
function NexusChat({ prompt, userName, compact, user, misionId }) {
  const [msgs, setMsgs] = useState([{
    role:"assistant",
    content:`¡Bienvenido${userName?`, ${userName.split(" ")[0]}`:""}! 🚀 Soy **NEXUS**. No te daré respuestas directas... ¡eso sería aburrido! Te guío con pistas para que TÚ descubras el conocimiento.\n\n💬 **Modo libre:** pregunta lo que quieras sobre tecnología.\n🗺️ **O elige una misión** en el menú lateral. ¡Tú decides! 🎯`
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [xp, setXp] = useState(0);
  const [xpAnim, setXpAnim] = useState(null);
  const endRef = useRef(null);

  useEffect(()=>{ endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs]);

  const lv = Math.floor(xp/50)+1;
  const pct = (xp%50)/50*100;

  const addXP = useCallback((n) => {
    setXp(prev => {
      const nx = prev + n;
      const nl = Math.floor(nx/50)+1;
      if (user?.id) saveProgress(user, nx, nl, misionId);
      return nx;
    });
    setXpAnim(n);
    setTimeout(()=>setXpAnim(null), 2000);
  }, [user, misionId]);

  const send = async txt => {
    const t = txt||input.trim();
    if (!t||loading) return;
    setInput("");
    const newMsgs = [...msgs, { role:"user", content:t }];
    setMsgs(newMsgs);
    setLoading(true);
    addXP(5);
    const reply = await callNexus(newMsgs.map(m=>({ role:m.role, content:m.content })), prompt);
    setMsgs(p=>[...p, { role:"assistant", content:reply }]);
    if (/maestría|exacto|correcto|¡así/i.test(reply)) addXP(20);
    setLoading(false);
  };

  const SUGS = ["¿Cómo funciona una Radio AM?","¿Qué es la Ley de Ohm?","¿Cómo programo un servo?","¿Qué es la modulación FM?","¿Para qué sirve el transistor?","¿Cómo funciona el Bluetooth HC-05?"];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:compact?420:"100%", background:C.card, border:`1px solid ${C.border}`, borderRadius:16, overflow:"hidden" }}>
      {/* XP bar */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 16px", background:C.surface, borderBottom:`1px solid ${C.border}`, position:"relative" }}>
        <span style={{ fontSize:10, fontFamily:"'Orbitron',monospace", color:C.accent, fontWeight:700 }}>NVL {lv}</span>
        <div style={{ flex:1, height:4, background:C.border, borderRadius:2, overflow:"hidden" }}>
          <div style={{ height:"100%", background:`linear-gradient(90deg,${C.accent},${C.accent2})`, width:`${pct}%`, borderRadius:2, transition:"width .5s" }} />
        </div>
        <span style={{ fontSize:10, color:C.muted, fontFamily:"'Orbitron',monospace" }}>{xp} XP</span>
        {xpAnim && <span style={{ position:"absolute", right:16, top:-24, fontSize:12, color:C.accent3, fontWeight:700, background:C.card, padding:"3px 8px", borderRadius:8, border:`1px solid ${C.accent3}` }}>+{xpAnim} XP ✨</span>}
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:"auto", padding:"18px 16px", display:"flex", flexDirection:"column", gap:14 }}>
        {msgs.map((m,i)=>(
          <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", ...(m.role==="user"?{ justifyContent:"flex-end", alignSelf:"flex-end" }:{}), maxWidth:"82%", animation:"fadeUp .3s ease" }}>
            {m.role==="assistant" && <div style={{ width:32, height:32, borderRadius:"50%", background:`${C.accent}15`, border:`1.5px solid ${C.accent}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:C.accent, flexShrink:0 }}>⬡</div>}
            <div style={{ background:m.role==="user"?C.user:C.surface, border:`1px solid ${m.role==="user"?C.accent2+"44":C.border}`, borderRadius:m.role==="user"?"14px 4px 14px 14px":"4px 14px 14px 14px", padding:"12px 16px" }}>
              <div dangerouslySetInnerHTML={{ __html:m.content.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>").replace(/\n/g,"<br/>") }} style={{ fontSize:13, lineHeight:1.75, color:C.text }} />
            </div>
            {m.role==="user" && <div style={{ width:32, height:32, borderRadius:"50%", background:C.user, border:`1.5px solid ${C.accent2}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>👤</div>}
          </div>
        ))}
        {loading && (
          <div style={{ display:"flex", gap:10, alignItems:"flex-start", maxWidth:"82%" }}>
            <div style={{ width:32, height:32, borderRadius:"50%", background:`${C.accent}15`, border:`1.5px solid ${C.accent}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:C.accent, flexShrink:0 }}>⬡</div>
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:"4px 14px 14px 14px", padding:"14px 18px" }}>
              <div style={{ display:"flex", gap:5 }}>{[0,150,300].map(d=><span key={d} style={{ width:7, height:7, borderRadius:"50%", background:C.accent, animation:"pulse 1.2s ease-in-out infinite", display:"inline-block", animationDelay:`${d}ms` }} />)}</div>
            </div>
          </div>
        )}
        {msgs.length===1 && !loading && (
          <div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>💡 Preguntas sugeridas:</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {SUGS.map((q,i)=><button key={i} style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.accent, padding:"7px 13px", borderRadius:20, fontSize:11, cursor:"pointer", fontFamily:"inherit" }} onClick={()=>send(q)}>{q}</button>)}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{ display:"flex", gap:8, padding:"12px 14px", borderTop:`1px solid ${C.border}`, background:C.surface, alignItems:"flex-end" }}>
        <textarea style={{ flex:1, background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"10px 14px", color:C.text, fontSize:13, resize:"none", fontFamily:"inherit", outline:"none", maxHeight:80, overflowY:"auto" }} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); send(); }}} placeholder="Pregunta lo que quieras... (Enter para enviar)" rows={1} />
        <button style={{ width:38, height:38, borderRadius:10, background:`linear-gradient(135deg,${C.accent},${C.accent2})`, border:"none", color:"#fff", fontSize:15, cursor:"pointer", flexShrink:0, opacity:loading||!input.trim()?0.4:1 }} onClick={()=>send()} disabled={loading||!input.trim()}>➤</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MISSION MAP
// ═══════════════════════════════════════════════════════════════
function MissionMap({ misiones, onSelect }) {
  const [open, setOpen] = useState(null);
  return (
    <div>
      {misiones.map(m=>(
        <div key={m.id} style={{ background:C.card, border:`1px solid ${open===m.id?m.color+"88":m.color+"33"}`, borderRadius:14, padding:20, marginBottom:16, cursor:"pointer", transition:"all .3s" }} onClick={()=>setOpen(open===m.id?null:m.id)}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:14 }}>
            <span style={{ fontSize:34, filter:`drop-shadow(0 0 10px ${m.glow})` }}>{m.icon}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:15, fontWeight:700, color:m.color, marginBottom:4 }}>{m.title}</div>
              <div style={{ fontSize:12, color:C.muted, lineHeight:1.6, marginBottom:8 }}>{m.description}</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {m.retos.map(r=><span key={r.id} style={{ padding:"3px 8px", borderRadius:6, fontSize:10, background:m.color+"22", color:m.color }}>{"⭐".repeat(r.stars)}</span>)}
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:8, flexShrink:0 }}>
              <span style={{ padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:m.color+"22", color:m.color }}>{m.retos.length} retos</span>
              {onSelect && <button style={{ padding:"7px 14px", background:m.color, border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer" }} onClick={e=>{ e.stopPropagation(); onSelect(m.id); }}>Iniciar con NEXUS ➤</button>}
            </div>
          </div>
          {open===m.id && (
            <div style={{ marginTop:16, borderTop:`1px solid ${m.color}33`, paddingTop:16 }}>
              {m.retos.map(r=>(
                <div key={r.id} style={{ display:"flex", gap:12, padding:"12px 14px", marginBottom:8, background:C.surface, borderRadius:8, borderLeft:`3px solid ${m.color}66` }}>
                  <div style={{ fontFamily:"'Orbitron',monospace", fontWeight:900, fontSize:13, color:m.color, width:20, flexShrink:0 }}>{r.id}</div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:4 }}>{r.title} <span style={{ color:"#eab308" }}>{"⭐".repeat(r.stars)}</span></div>
                    <div style={{ fontSize:12, color:C.muted, lineHeight:1.6 }}>{r.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTES REUTILIZABLES
// ═══════════════════════════════════════════════════════════════
function Layout({ sidebar, children }) {
  return (
    <div style={{ display:"flex", height:"100vh", position:"relative", zIndex:5 }}>
      {sidebar}
      <main style={{ flex:1, overflow:"auto", background:C.bg }}>{children}</main>
    </div>
  );
}
function Sidebar({ user, onLogout, tabs, tab, setTab }) {
  return (
    <aside style={{ width:220, background:C.surface, borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column", flexShrink:0, zIndex:10 }}>
      <div style={{ padding:"20px 16px", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
          <span style={{ fontSize:22, color:C.accent, filter:`drop-shadow(0 0 6px ${C.accent})` }}>⬡</span>
          <span style={{ fontFamily:"'Orbitron',monospace", fontSize:16, fontWeight:900, color:C.accent, letterSpacing:2 }}>NEXUS</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:"50%", background:C.card, border:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>
            {user.role==="admin"?"👑":user.role==="teacher"?"📚":"🎓"}
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:600 }}>{user.name.split(" ")[0]}</div>
            <div style={{ fontSize:10, color:C.muted, marginTop:1 }}>{user.role==="admin"?"Administrador":user.role==="teacher"?`Docente · ${user.subject||""}`:`Est. · ${user.grade||""}`}</div>
          </div>
        </div>
      </div>
      <nav style={{ flex:1, padding:"12px 8px", display:"flex", flexDirection:"column", gap:2 }}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, background:tab===t.id?`${C.accent}15`:"transparent", border:"none", borderLeft:tab===t.id?`2px solid ${C.accent}`:"2px solid transparent", color:tab===t.id?C.accent:C.muted, fontSize:13, cursor:"pointer", textAlign:"left", transition:"all .15s" }}>
            <span style={{ fontSize:16, width:20, textAlign:"center" }}>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <button onClick={onLogout} style={{ margin:"12px 8px", padding:"10px 12px", background:"transparent", border:`1px solid ${C.border}`, color:C.muted, borderRadius:10, cursor:"pointer", fontSize:12 }}>← Cerrar sesión</button>
    </aside>
  );
}
function Page({ title, desc, children }) {
  return (
    <div style={{ padding:28, maxWidth:900 }}>
      <h1 style={ptitle}>{title}</h1>
      {desc && <p style={{ fontSize:13, color:C.muted, marginBottom:20, lineHeight:1.6 }}>{desc}</p>}
      {children}
    </div>
  );
}
function Card({ title, children }) {
  return <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:20, marginBottom:16 }}><div style={{ fontSize:15, fontWeight:700, marginBottom:14 }}>{title}</div>{children}</div>;
}
function InfoBox({ title, children }) {
  return <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:16, marginTop:16 }}><div style={{ fontSize:13, fontWeight:700, color:C.accent, marginBottom:10 }}>{title}</div>{children}</div>;
}
function Row({ k, v }) {
  return <div style={{ fontSize:12, color:C.muted, padding:"4px 0", display:"flex", gap:8 }}><span style={{ color:C.text, fontWeight:600, minWidth:100 }}>{k}:</span>{v}</div>;
}
function Btn({ onClick, children, disabled }) {
  return <button onClick={onClick} disabled={disabled} style={{ padding:"11px 20px", background:disabled?C.border:`linear-gradient(135deg,${C.accent},${C.accent2})`, border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:13, cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.5:1 }}>{children}</button>;
}

const lbl  = { fontSize:11, color:C.muted, textTransform:"uppercase", letterSpacing:1, fontWeight:600, marginBottom:6, display:"block" };
const inp  = { background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"11px 14px", color:C.text, fontSize:13, outline:"none", fontFamily:"inherit", width:"100%", boxSizing:"border-box" };
const grid2  = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 };
const grid4  = { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 };
const ptitle = { fontSize:22, fontWeight:800, color:C.text, marginBottom:6, fontFamily:"'Syne',sans-serif" };

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Syne:wght@400;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{overflow:hidden;}
  ::-webkit-scrollbar{width:4px;}
  ::-webkit-scrollbar-thumb{background:#1a3050;border-radius:2px;}
  input::placeholder,textarea::placeholder{color:#4a6080;}
  input:focus,textarea:focus,select:focus{border-color:#00c8ff55!important;outline:none;}
  select option{background:#0d1526;color:#e2e8f0;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
  @keyframes pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.3;transform:scale(.6);}}
`;
