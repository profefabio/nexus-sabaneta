import { useState, useRef, useEffect } from "react";

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

// ─── Usuarios gestionados en api/login.js (con bcrypt) ───────
// Las contraseñas NUNCA llegan al navegador

// ─── Mapa de misiones ─────────────────────────────────────────
const MISSION_MAP = [
  {
    id: "radio-am", title: "Radio AM", icon: "📻", color: "#f97316", glow: "rgba(249,115,22,0.35)",
    description: "Construye tu propio receptor de Radio AM con materiales básicos",
    retos: [
      { id: 1, stars: 1, title: "¿Qué es una onda?", desc: "Comprende amplitud, frecuencia y longitud de onda de las ondas electromagnéticas." },
      { id: 2, stars: 1, title: "El espectro de radio", desc: "Explora las frecuencias AM (530–1700 kHz) y cómo se diferencia de FM." },
      { id: 3, stars: 2, title: "Componentes del receptor", desc: "Identifica: diodo 1N34A, condensador variable, bobina de ferrita, auricular alta impedancia." },
      { id: 4, stars: 2, title: "La bobina artesanal", desc: "Enrolla 60 vueltas de alambre de cobre esmaltado en núcleo de ferrita. ¿Por qué la inductancia capta señales?" },
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
      { id: 3, stars: 2, title: "Control por potenciómetro", desc: "Lee con analogRead() (0–1023) y mapea a ángulos del servo. ¡Control analógico real!" },
      { id: 4, stars: 2, title: "Diseño 3D en TinkerCAD", desc: "Diseña: base giratoria, hombro, codo, muñeca y pinza. Exporta en STL." },
      { id: 5, stars: 2, title: "Impresión y ensamble", desc: "Cura: capa 0.2mm, relleno 20%, soporte donde sea necesario. Ensambla con tornillos M3." },
      { id: 6, stars: 3, title: "Secuencia de movimientos", desc: "Programa el brazo para recoger, mover y depositar un objeto. Usa arrays y bucles for." },
      { id: 7, stars: 3, title: "¡Control Bluetooth!", desc: "Agrega módulo HC-05 y controla el brazo desde el celular. ¡Misión completada!" },
    ]
  },
];

// ─── System Prompt dinámico ───────────────────────────────────
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

MODO LIBRE (muy importante):
El estudiante puede preguntar LIBREMENTE sobre cualquier tema de ${subject}.
No está limitado a los retos sugeridos. Si pregunta algo relacionado con la materia,
respóndele con tu metodología de pistas. Celebra su curiosidad.

ÉNFASIS 2025 - Electrónica y Robótica:
- Circuitos electrónicos: componentes, ley de Ohm, serie/paralelo
- Radio AM: diodo 1N34A, bobina ferrita, condensador variable, detector envolvente
- Transmisor FM: oscilador LC, BC547, modulación FM, antena λ/4
- Brazo Robótico Arduino UNO: servo SG90, Servo.h, analogRead, TinkerCAD, Cura, HC-05

Fuera de ${subject} di: "¡Ese reto está fuera de mi mapa, Explorador! 🗺️"
Siempre en español colombiano, cálido y motivador.
`;

// ─── Tokens de diseño ─────────────────────────────────────────
const C = {
  bg: "#070d1a", surface: "#0d1526", card: "#111e33", border: "#1a3050",
  accent: "#00c8ff", accent2: "#8b5cf6", accent3: "#10d98a",
  text: "#e2e8f0", muted: "#4a6080", user: "#162040",
};

// ═══════════════════════════════════════════════════════════════
// APP PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("login");
  const [loginErr, setLoginErr] = useState("");

  const login = async (email, pw) => {
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pw }),
      });
      const data = await res.json();
      if (res.ok && data.user) {
        setUser(data.user);
        setView(data.user.role === "admin" ? "admin" : data.user.role === "teacher" ? "teacher" : "student");
        setLoginErr("");
      } else {
        setLoginErr(data.error || "Credenciales incorrectas. Revisa tu correo y contraseña.");
      }
    } catch {
      setLoginErr("Error de conexión. Intenta de nuevo.");
    }
  };
  const logout = () => { setUser(null); setView("login"); };

  return (
    <div style={{ fontFamily: "'Syne','Inter',sans-serif", background: C.bg, color: C.text, height: "100vh", overflow: "hidden", position: "relative" }}>
      <div style={{ position: "fixed", inset: 0, backgroundImage: `linear-gradient(rgba(0,200,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,.025) 1px,transparent 1px)`, backgroundSize: "36px 36px", pointerEvents: "none", zIndex: 0 }} />
      {view === "login"   && <LoginView onLogin={login} error={loginErr} />}
      {view === "admin"   && <AdminView user={user} onLogout={logout} />}
      {view === "teacher" && <TeacherView user={user} onLogout={logout} />}
      {view === "student" && <StudentView user={user} onLogout={logout} />}
      <style>{CSS}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════
function LoginView({ onLogin, error }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", position:"relative", zIndex:5 }}>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:20, padding:36, width:"100%", maxWidth:440, boxShadow:`0 20px 60px rgba(0,0,0,.5),0 0 40px rgba(0,200,255,.05)` }}>
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:28 }}>
          <span style={{ fontSize:42, color:C.accent, filter:`drop-shadow(0 0 12px ${C.accent})` }}>⬡</span>
          <div>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:26, fontWeight:900, color:C.accent, letterSpacing:3 }}>NEXUS</div>
            <div style={{ fontSize:11, color:C.muted, letterSpacing:1, marginTop:3 }}>Plataforma Educativa · I.E. Sabaneta</div>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <div style={lbl}>Correo institucional</div>
            <input style={inp} type="email" placeholder="usuario@sabaneta.edu.co" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onLogin(email,pw)} />
          </div>
          <div>
            <div style={lbl}>Contraseña</div>
            <div style={{ position:"relative" }}>
              <input style={inp} type={show?"text":"password"} placeholder="••••••••" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onLogin(email,pw)} />
              <button style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:14 }} onClick={()=>setShow(!show)}>{show?"🙈":"👁️"}</button>
            </div>
          </div>
          {error && <div style={{ background:"#ff444422", border:"1px solid #ff444444", color:"#ff7777", padding:"10px 14px", borderRadius:8, fontSize:13 }}>{error}</div>}
          <button style={{ padding:"13px 20px", background:`linear-gradient(135deg,${C.accent},${C.accent2})`, border:"none", borderRadius:12, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", letterSpacing:.5, boxShadow:`0 6px 20px rgba(0,200,255,.3)` }} onClick={()=>onLogin(email,pw)}>
            Ingresar al sistema ➤
          </button>
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:14 }}>
            <div style={{ fontSize:10, fontWeight:600, color:C.muted, marginBottom:10, textTransform:"uppercase", letterSpacing:1 }}>Administrador de la plataforma</div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:40, height:40, borderRadius:"50%", background:`${C.accent}15`, border:`1.5px solid ${C.accent}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>👑</div>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:C.text }}>Fabio Alberto Ortiz M.</div>
                <div style={{ fontSize:11, color:C.accent, marginTop:2 }}>fabioortiz37422@sabaneta.edu.co</div>
                <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>Tecnología e Informática · I.E. Sabaneta · Grados 7–11</div>
              </div>
            </div>
          </div>
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:14 }}>
            <div style={{ fontSize:10, fontWeight:600, color:C.muted, marginBottom:8, textTransform:"uppercase", letterSpacing:1 }}>Cuentas de prueba</div>
            {[["📚 Docente","docente@sabaneta.edu.co","docente123"],["🎓 Estudiante","estudiante1@sabaneta.edu.co","est123"]].map(([r,e,p],i)=>(
              <div key={i} style={{ fontSize:11, color:C.muted, padding:"3px 0", lineHeight:1.6 }}>{r}: {e} / {p}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════════
function AdminView({ user, onLogout }) {
  const [tab, setTab] = useState("dashboard");
  const [users, setUsers] = useState(MOCK_USERS);
  const [nu, setNu] = useState({ name:"", email:"", password:"", role:"student", grade:"", subject:"" });
  const [saved, setSaved] = useState(false);

  const addUser = () => {
    if (!nu.name || !nu.email) return;
    setUsers([...users, { ...nu, id: Date.now()+"" }]);
    setNu({ name:"", email:"", password:"", role:"student", grade:"", subject:"" });
    setSaved(true); setTimeout(()=>setSaved(false), 2000);
  };

  return (
    <Layout sidebar={<Sidebar user={user} onLogout={onLogout} tab={tab} setTab={setTab} tabs={[
      { id:"dashboard", icon:"⬡", label:"Dashboard" },
      { id:"users",     icon:"👥", label:"Usuarios" },
      { id:"missions",  icon:"🗺️", label:"Misiones" },
      { id:"subjects",  icon:"📚", label:"Asignaturas" },
    ]} />}>
      {tab === "dashboard" && (
        <Page title="Panel de Administración" desc={`Bienvenido, ${user.name}. Gestiona toda la plataforma NEXUS.`}>
          <div style={grid4}>
            {[["🎓","Estudiantes",users.filter(u=>u.role==="student").length,C.accent],
              ["📚","Docentes",users.filter(u=>u.role==="teacher").length,C.accent2],
              ["👑","Admins",users.filter(u=>u.role==="admin").length,C.accent3],
              ["🗺️","Misiones",3,"#f97316"]].map(([ic,lb,val,col],i)=>(
              <div key={i} style={{ background:C.card, border:`1px solid ${col}44`, borderRadius:12, padding:16, textAlign:"center" }}>
                <div style={{ fontSize:22, marginBottom:8 }}>{ic}</div>
                <div style={{ fontSize:28, fontWeight:900, fontFamily:"'Orbitron',monospace", color:col }}>{val}</div>
                <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>{lb}</div>
              </div>
            ))}
          </div>
          <InfoBox title="🔌 Base de Datos">
            <Row k="Tipo" v="Supabase (PostgreSQL cloud — reemplaza tu SQLite local)" />
            <Row k="Estado" v={<span style={{color:"#22c55e"}}>● Modo demo activo</span>} />
            <Row k="Migración" v="Exporta tu SQLite como CSV e impórtalo en Supabase" />
            <Row k="Config" v="Edita las líneas SUPABASE_URL y SUPABASE_ANON_KEY en App.jsx" />
          </InfoBox>
        </Page>
      )}
      {tab === "users" && (
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
            <Btn onClick={addUser}>{saved ? "✅ ¡Guardado!" : "Agregar usuario"}</Btn>
          </Card>
          <Card title="👥 Usuarios registrados">
            {users.map(u=>(
              <div key={u.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:C.surface, borderRadius:10, border:`1px solid ${C.border}`, marginBottom:8 }}>
                <span style={{ fontSize:20, width:32, textAlign:"center" }}>{u.role==="admin"?"👑":u.role==="teacher"?"📚":"🎓"}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600 }}>{u.name}</div>
                  <div style={{ fontSize:11, color:C.muted }}>{u.email}</div>
                </div>
                <span style={{ padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:600, background:u.role==="admin"?C.accent2+"33":u.role==="teacher"?C.accent+"33":C.accent3+"33", color:u.role==="admin"?C.accent2:u.role==="teacher"?C.accent:C.accent3 }}>
                  {u.role==="admin"?"Admin":u.role==="teacher"?"Docente":`Est. ${u.grade||""}`}
                </span>
              </div>
            ))}
          </Card>
        </Page>
      )}
      {tab === "missions" && (
        <Page title="Mapa de Misiones 2025" desc="Énfasis: Electrónica y Robótica · Tecnología e Informática">
          <MissionMap />
        </Page>
      )}
      {tab === "subjects" && (
        <Page title="Asignaturas configuradas">
          {["Tecnología e Informática · Prof. Fabio Ortiz","Matemáticas · Por asignar","Ciencias Naturales · Por asignar"].map((s,i)=>(
            <Card key={i} title={s}><div style={{ fontSize:13, color:C.muted }}>NEXUS activo · Configuración pendiente del docente</div></Card>
          ))}
        </Page>
      )}
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════
// TEACHER
// ═══════════════════════════════════════════════════════════════
function TeacherView({ user, onLogout }) {
  const [tab, setTab] = useState("config");
  const [cfg, setCfg] = useState({ subject: user.subject||"", grade:"7-11", topics:"", methodology:"", tone:"motivador" });
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
            <textarea style={{ ...inp, minHeight:90, resize:"vertical", marginBottom:14 }} value={cfg.topics} onChange={e=>setCfg({...cfg,topics:e.target.value})} placeholder="Ej: Ecuaciones, sistemas de ecuaciones, inecuaciones..." />
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
          <InfoBox title="💡 ¿Cómo funciona el modo libre?">
            Los estudiantes pueden preguntar lo que quieran sobre {cfg.subject||"tu asignatura"}. No están limitados a los retos sugeridos. NEXUS siempre guiará con pistas, nunca con respuestas directas.
          </InfoBox>
        </Page>
      )}
      {tab === "missions" && <Page title="Mapa de Misiones 2025"><MissionMap /></Page>}
      {tab === "preview" && (
        <Page title="Vista previa · Chat estudiantil">
          <NexusChat prompt={buildPrompt(cfg.subject||"Tecnología e Informática", cfg.grade, cfg.topics)} userName="Explorador" compact />
        </Page>
      )}
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════
// STUDENT
// ═══════════════════════════════════════════════════════════════
function StudentView({ user, onLogout }) {
  const [tab, setTab] = useState("chat");
  const [mission, setMission] = useState(null);

  const missionData = MISSION_MAP.find(m=>m.id===mission);

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
            {/* Banner modo libre */}
            <div style={{ display:"flex", gap:8, marginBottom:8 }}>
              {mission && (
                <div style={{ display:"flex", alignItems:"center", gap:8, background:C.card, border:`1px solid ${missionData?.color}44`, borderRadius:10, padding:"7px 12px", fontSize:12, flex:1 }}>
                  <span>{missionData?.icon}</span>
                  <span>Misión activa: <strong>{missionData?.title}</strong></span>
                  <button style={{ marginLeft:"auto", background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:14 }} onClick={()=>setMission(null)}>✕</button>
                </div>
              )}
              <div style={{ display:"flex", alignItems:"center", gap:6, background:`${C.accent3}15`, border:`1px solid ${C.accent3}44`, borderRadius:10, padding:"7px 12px", fontSize:11, color:C.accent3 }}>
                💬 Modo libre activo — pregunta lo que quieras sobre tecnología
              </div>
            </div>
          </div>
          <div style={{ flex:1, overflow:"hidden", padding:"0 24px 24px" }}>
            <NexusChat
              prompt={buildPrompt("Tecnología e Informática", user.grade||"7-11",
                mission ? `El estudiante trabaja en la misión: ${missionData?.title}. Guíalo específicamente por esa unidad.` : "")}
              userName={user.name}
            />
          </div>
        </div>
      )}
      {tab === "missions" && (
        <Page title="🗺️ Mapa de Misiones 2025" desc="Elige una misión para que NEXUS te guíe paso a paso. También puedes chatear libremente sin seleccionar ninguna.">
          <MissionMap onSelect={id=>{ setMission(id); setTab("chat"); }} />
        </Page>
      )}
      {tab === "progress" && (
        <Page title="⭐ Mi Progreso">
          <div style={grid4}>
            {[["🏆","Nivel","3",C.accent],["⭐","XP Total","145","#eab308"],["✅","Retos","7",C.accent3],["🗺️","Misiones","2","#f97316"]].map(([ic,lb,val,col],i)=>(
              <div key={i} style={{ background:C.card, border:`1px solid ${col}44`, borderRadius:12, padding:16, textAlign:"center" }}>
                <div style={{ fontSize:22, marginBottom:8 }}>{ic}</div>
                <div style={{ fontSize:28, fontWeight:900, fontFamily:"'Orbitron',monospace", color:col }}>{val}</div>
                <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>{lb}</div>
              </div>
            ))}
          </div>
          <InfoBox title={`🎓 ${user.name}`}>
            <Row k="Grado" v={user.grade||"Por asignar"} />
            <Row k="Correo" v={user.email} />
          </InfoBox>
        </Page>
      )}
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════
// NEXUS CHAT
// ═══════════════════════════════════════════════════════════════
function NexusChat({ prompt, userName, compact }) {
  const [msgs, setMsgs] = useState([{
    role:"assistant",
    content:`¡Bienvenido${userName?`, ${userName.split(" ")[0]}`:""}! 🚀 Soy **NEXUS**. No te daré respuestas directas... ¡eso sería aburrido! Te guío con pistas para que TÚ descubras el conocimiento.\n\n💬 **Modo libre:** pregunta lo que quieras sobre tecnología e informática.\n🗺️ **O elige una misión** en el menú lateral para un reto guiado. ¡Tú decides! 🎯`
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [xp, setXp] = useState(0);
  const [xpAnim, setXpAnim] = useState(null);
  const endRef = useRef(null);

  useEffect(()=>{ endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs]);

  const addXP = n => { setXp(p=>p+n); setXpAnim(n); setTimeout(()=>setXpAnim(null),2000); };

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

  const lv = Math.floor(xp/50)+1;
  const pct = (xp%50)/50*100;

  const SUGS = ["¿Cómo funciona una Radio AM?","¿Qué es la Ley de Ohm?","¿Cómo programo un servo?","¿Qué es la modulación FM?","¿Para qué sirve el transistor?","¿Cómo funciona el Bluetooth HC-05?"];

  return (
    <div style={{ display:"flex", flexDirection:"column", height: compact ? 420 : "100%", background:C.card, border:`1px solid ${C.border}`, borderRadius:16, overflow:"hidden" }}>
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
            {m.role==="assistant" && <div style={{ width:32, height:32, borderRadius:"50%", background:`${C.accent}15`, border:`1.5px solid ${C.accent}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:C.accent, flexShrink:0, boxShadow:`0 0 10px ${C.accent}33` }}>⬡</div>}
            <div style={{ background:m.role==="user"?C.user:C.surface, border:`1px solid ${m.role==="user"?C.accent2+"44":C.border}`, borderRadius:m.role==="user"?"14px 4px 14px 14px":"4px 14px 14px 14px", padding:"12px 16px", boxShadow:"0 4px 16px rgba(0,0,0,.3)" }}>
              <div dangerouslySetInnerHTML={{ __html:m.content.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>").replace(/\n/g,"<br/>") }} style={{ fontSize:13, lineHeight:1.75, color:C.text }} />
            </div>
            {m.role==="user" && <div style={{ width:32, height:32, borderRadius:"50%", background:C.user, border:`1.5px solid ${C.accent2}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>👤</div>}
          </div>
        ))}
        {loading && (
          <div style={{ display:"flex", gap:10, alignItems:"flex-start", maxWidth:"82%" }}>
            <div style={{ width:32, height:32, borderRadius:"50%", background:`${C.accent}15`, border:`1.5px solid ${C.accent}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:C.accent, flexShrink:0 }}>⬡</div>
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:"4px 14px 14px 14px", padding:"14px 18px" }}>
              <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                {[0,150,300].map(d=><span key={d} style={{ width:7, height:7, borderRadius:"50%", background:C.accent, animation:"pulse 1.2s ease-in-out infinite", display:"inline-block", animationDelay:`${d}ms` }} />)}
              </div>
            </div>
          </div>
        )}
        {msgs.length===1 && !loading && (
          <div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>💡 Preguntas sugeridas (o escribe la tuya libremente):</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {SUGS.map((q,i)=><button key={i} style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.accent, padding:"7px 13px", borderRadius:20, fontSize:11, cursor:"pointer", fontFamily:"inherit" }} onClick={()=>send(q)}>{q}</button>)}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      {/* Input */}
      <div style={{ display:"flex", gap:8, padding:"12px 14px", borderTop:`1px solid ${C.border}`, background:C.surface, alignItems:"flex-end" }}>
        <textarea style={{ flex:1, background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"10px 14px", color:C.text, fontSize:13, resize:"none", fontFamily:"inherit", outline:"none", maxHeight:80, overflowY:"auto" }} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); send(); }}} placeholder="Pregunta lo que quieras sobre tecnología... (Enter para enviar)" rows={1} />
        <button style={{ width:38, height:38, borderRadius:10, background:`linear-gradient(135deg,${C.accent},${C.accent2})`, border:"none", color:"#fff", fontSize:15, cursor:"pointer", flexShrink:0, opacity:loading||!input.trim()?0.4:1 }} onClick={()=>send()} disabled={loading||!input.trim()}>➤</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MISSION MAP
// ═══════════════════════════════════════════════════════════════
function MissionMap({ onSelect }) {
  const [open, setOpen] = useState(null);
  return (
    <div>
      {MISSION_MAP.map(m=>(
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
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, background:tab===t.id?`${C.accent}15`:"transparent", border:tab===t.id?`none`:"none", borderLeft:tab===t.id?`2px solid ${C.accent}`:"2px solid transparent", color:tab===t.id?C.accent:C.muted, fontSize:13, cursor:"pointer", textAlign:"left", transition:"all .15s" }}>
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
function Btn({ onClick, children }) {
  return <button onClick={onClick} style={{ padding:"11px 20px", background:`linear-gradient(135deg,${C.accent},${C.accent2})`, border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>{children}</button>;
}

// ─── Atajos de estilo ─────────────────────────────────────────
const lbl = { fontSize:11, color:C.muted, textTransform:"uppercase", letterSpacing:1, fontWeight:600, marginBottom:6, display:"block" };
const inp = { background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"11px 14px", color:C.text, fontSize:13, outline:"none", fontFamily:"inherit", width:"100%", boxSizing:"border-box" };
const grid2 = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 };
const grid4 = { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 };
const ptitle = { fontSize:22, fontWeight:800, color:C.text, marginBottom:6, fontFamily:"'Syne',sans-serif" };

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Syne:wght@400;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{overflow:hidden;}
  ::-webkit-scrollbar{width:4px;}
  ::-webkit-scrollbar-thumb{background:#1a3050;border-radius:2px;}
  input::placeholder,textarea::placeholder{color:#4a6080;}
  input:focus,textarea:focus,select:focus{border-color:#00c8ff55!important;outline:none;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
  @keyframes pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.3;transform:scale(.6);}}
`;
