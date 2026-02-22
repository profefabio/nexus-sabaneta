import { useState, useRef, useEffect, useCallback } from "react";

// ─── API helpers ──────────────────────────────────────────────
const callNexus = async (messages, system) => {
  const res = await fetch("/api/chat", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ messages, system }),
  });
  const data = await res.json();
  if (data.error) return "⚠️ " + data.error;
  return data.content?.[0]?.text || "Error al conectar con NEXUS.";
};

const saveProgress = async (user, xp, nivel, misionId) => {
  try {
    await fetch("/api/saveprogress", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ estudiante_id:user.id, nombre_estudiante:user.name, grado:user.grade||"", grupo:user.group||"", xp_total:xp, nivel, mision_id:misionId||null }),
    });
  } catch(_) {}
};

// ─── Misiones API ─────────────────────────────────────────────
const getMisiones = async (docente_id, role) => {
  const params = new URLSearchParams({ docente_id: docente_id||"", role: role||"teacher" });
  const res = await fetch(`/api/misiones?${params}`);
  const data = await res.json();
  return data.misiones || [];
};

const createMision = async (docente_id, docente_nombre, misionData) => {
  const res = await fetch("/api/misiones", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ docente_id, docente_nombre, ...misionData }),
  });
  const data = await res.json();
  return data.mision || null;
};

const updateMision = async (docente_id, misionData) => {
  const res = await fetch("/api/misiones", {
    method:"PUT", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ docente_id, ...misionData }),
  });
  const data = await res.json();
  return data.mision || null;
};

const deleteMision = async (id, docente_id, role) => {
  const params = new URLSearchParams({ id, docente_id: docente_id||"", role: role||"teacher" });
  await fetch(`/api/misiones?${params}`, { method:"DELETE" });
};

// ─── Excel download ───────────────────────────────────────────
const downloadExcel = (rows, filename="reporte_nexus") => {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map(r => headers.map(h=>`"${String(r[h]??"").replace(/"/g,'""')}"`).join(","))].join("\n");
  const blob = new Blob(["\uFEFF"+csv], { type:"text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=filename+".csv"; a.click();
  URL.revokeObjectURL(url);
};

const COLORES_MISION = ["#f97316","#eab308","#22c55e","#00c8ff","#8b5cf6","#ec4899","#14b8a6","#f43f5e"];
const ICONOS_MISION  = ["📻","📡","🦾","🔬","💡","🖥️","🤖","🎮","⚡","🔧","🌐","🧪"];

const buildPrompt = (subject="Tecnología e Informática", grade="7-11", extra="") => `
Eres NEXUS, compañero de retos académicos para estudiantes de grados ${grade} de la I.E. de Sabaneta, Colombia.
Asignatura: ${subject}.${extra?`\nContexto: ${extra}`:""}
PERSONALIDAD: Animado, motivador, como guía de aventuras. Nunca das respuestas directas.
METODOLOGÍA: 1) Pregunta qué sabe, 2) Una pista a la vez, 3) Celebra logros: "¡+20 puntos de maestría! ⭐"
Siempre en español colombiano, cálido y motivador.`;

const C = { bg:"#070d1a",surface:"#0d1526",card:"#111e33",border:"#1a3050",accent:"#00c8ff",accent2:"#8b5cf6",accent3:"#10d98a",text:"#e2e8f0",muted:"#4a6080",user:"#162040" };

// ═══════════════════════════════════════════════════════════════
// APP PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("login");
  const [loginErr, setLoginErr] = useState("");

  const login = async (payload) => {
    try {
      const res = await fetch("/api/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
      const data = await res.json();
      if (res.ok && data.user) { setUser(data.user); setView(data.user.role==="admin"?"admin":data.user.role==="teacher"?"teacher":"student"); setLoginErr(""); }
      else setLoginErr(data.error || "No encontrado. Verifica tus datos.");
    } catch { setLoginErr("Error de conexión."); }
  };
  const logout = () => { setUser(null); setView("login"); };

  return (
    <div style={{ fontFamily:"'Syne','Inter',sans-serif", background:C.bg, color:C.text, height:"100vh", overflow:"hidden", position:"relative" }}>
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
  const [mode, setMode] = useState("student");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [show, setShow] = useState(false);
  const [nombre, setNombre] = useState(""); const [apellido, setApellido] = useState("");
  const [grado, setGrado] = useState(""); const [grupo, setGrupo] = useState("");
  const handleSubmit = () => mode==="teacher" ? onLogin({ type:"teacher", email, password:pw }) : onLogin({ type:"student", nombre:nombre.trim(), apellido:apellido.trim(), grado, grupo });
  return (
    <div style={{ display:"flex", height:"100vh", position:"relative", zIndex:5 }}>
      <div style={{ flex:1, background:`linear-gradient(135deg,#070d1a,#0d1f3c)`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:40, borderRight:`1px solid ${C.border}` }}>
        <span style={{ fontSize:72, color:C.accent, filter:`drop-shadow(0 0 24px ${C.accent})`, marginBottom:20 }}>⬡</span>
        <div style={{ fontFamily:"'Orbitron',monospace", fontSize:36, fontWeight:900, color:C.accent, letterSpacing:4, marginBottom:8 }}>NEXUS</div>
        <div style={{ fontSize:13, color:C.muted, letterSpacing:2, textAlign:"center", lineHeight:1.8 }}>Plataforma Educativa<br/>I.E. Sabaneta</div>
      </div>
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:40 }}>
        <div style={{ width:"100%", maxWidth:420 }}>
          <div style={{ display:"flex", background:C.surface, borderRadius:14, padding:4, marginBottom:28, border:`1px solid ${C.border}` }}>
            {[["student","🎓","Soy Estudiante"],["teacher","📚","Soy Docente"]].map(([m,ic,lb])=>(
              <button key={m} onClick={()=>setMode(m)} style={{ flex:1, padding:"11px 8px", borderRadius:10, border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:13, background:mode===m?`linear-gradient(135deg,${C.accent},${C.accent2})`:"transparent", color:mode===m?"#fff":C.muted }}>{ic} {lb}</button>
            ))}
          </div>
          {mode==="student" && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ textAlign:"center" }}><div style={{ fontSize:18, fontWeight:800 }}>🎓 Ingreso Estudiantes</div><div style={{ fontSize:12, color:C.muted, marginTop:4 }}>Escribe tu nombre y selecciona tu grado</div></div>
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
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ textAlign:"center" }}><div style={{ fontSize:18, fontWeight:800 }}>📚 Ingreso Docentes</div></div>
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
// DASHBOARD PANEL (Admin + Teacher)
// ═══════════════════════════════════════════════════════════════
function DashboardPanel({ user, misiones }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtroGrado, setFiltroGrado] = useState("todos");
  const [filtroGrupo, setFiltroGrupo] = useState("todos");
  const [ordenAZ, setOrdenAZ] = useState(false);

  useEffect(() => { fetch("/api/stats").then(r=>r.json()).then(d=>{ setStats(d); setLoading(false); }).catch(()=>setLoading(false)); }, []);

  const grados = stats?.porGrado ? Object.keys(stats.porGrado).sort() : [];
  let top = stats?.topEstudiantes || [];
  if (filtroGrado!=="todos") top = top.filter(e=>e.grado===filtroGrado);
  if (filtroGrupo!=="todos") top = top.filter(e=>e.grupo===filtroGrupo);
  if (ordenAZ) top = [...top].sort((a,b)=>a.nombre_estudiante.localeCompare(b.nombre_estudiante));

  return (
    <Page title={user.role==="admin"?"Panel de Administración":"📊 Mi Panel Docente"} desc={`Bienvenido, ${user.name}.`}>
      {loading && <div style={{ color:C.muted, fontSize:13, marginBottom:16 }}>⏳ Cargando estadísticas...</div>}
      <div style={grid4}>
        {[["🎓","Estudiantes",stats?.resumen?.totalEstudiantes??"—",C.accent],
          user.role==="admin"?["📚","Docentes",stats?.resumen?.totalDocentes??"—",C.accent2]:["📚","Asignatura",user.subject||"—",C.accent2],
          ["🔥","Activos",stats?.resumen?.estudiantesActivos??"—",C.accent3],
          ["⭐","XP Total",stats?.resumen?.xpTotal??"—","#f97316"]
        ].map(([ic,lb,val,col],i)=>(
          <div key={i} style={{ background:C.card, border:`1px solid ${col}44`, borderRadius:12, padding:16, textAlign:"center" }}>
            <div style={{ fontSize:22, marginBottom:8 }}>{ic}</div>
            <div style={{ fontSize:26, fontWeight:900, fontFamily:"'Orbitron',monospace", color:col }}>{val}</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>{lb}</div>
          </div>
        ))}
      </div>

      <Card title="🏆 Top Estudiantes">
        <div style={{ display:"flex", gap:10, marginBottom:14, alignItems:"center", flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ ...lbl, marginBottom:0 }}>Grado:</span>
            <select style={{ ...inp, width:"auto", padding:"6px 10px" }} value={filtroGrado} onChange={e=>{setFiltroGrado(e.target.value);setFiltroGrupo("todos");}}>
              <option value="todos">Todos</option>{grados.map(g=><option key={g} value={g}>Grado {g}</option>)}
            </select>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ ...lbl, marginBottom:0 }}>Grupo:</span>
            <select style={{ ...inp, width:"auto", padding:"6px 10px" }} value={filtroGrupo} onChange={e=>setFiltroGrupo(e.target.value)}>
              <option value="todos">Todos</option>{["1","2","3","4"].map(g=><option key={g} value={g}>Grupo {g}</option>)}
            </select>
          </div>
          <button onClick={()=>setOrdenAZ(!ordenAZ)} style={{ padding:"6px 12px", background:ordenAZ?`${C.accent2}33`:C.surface, border:`1px solid ${ordenAZ?C.accent2:C.border}`, borderRadius:8, color:ordenAZ?C.accent2:C.muted, fontSize:12, cursor:"pointer" }}>
            {ordenAZ?"🔤 A→Z":"🏆 Mayor XP"}
          </button>
          <button onClick={()=>downloadExcel(top.map((e,i)=>({Pos:i+1,Nombre:e.nombre_estudiante,Grado:e.grado,Grupo:e.grupo||"—",XP:e.xp_total,Nivel:e.nivel||1,Mision:e.mision_id||"libre"})),`nexus_${filtroGrado}_${filtroGrupo}`)} style={{ padding:"6px 12px", background:`${C.accent3}22`, border:`1px solid ${C.accent3}44`, borderRadius:8, color:C.accent3, fontSize:12, cursor:"pointer", marginLeft:"auto" }}>
            ⬇️ Descargar Excel
          </button>
        </div>
        <div style={{ fontSize:11, color:C.muted, marginBottom:10 }}>{top.length} resultado{top.length!==1?"s":""}</div>
        {top.length>0 ? top.slice(0,15).map((e,i)=>(
          <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", background:C.surface, borderRadius:10, marginBottom:6, border:`1px solid ${C.border}` }}>
            <span style={{ fontFamily:"'Orbitron',monospace", color:i===0?"#ffd700":i===1?"#c0c0c0":i===2?"#cd7f32":C.muted, fontWeight:900, fontSize:12, width:24 }}>#{i+1}</span>
            <div style={{ flex:1 }}><div style={{ fontSize:12, fontWeight:600 }}>{e.nombre_estudiante}</div><div style={{ fontSize:10, color:C.muted }}>Grado {e.grado} · Grupo {e.grupo||"—"}</div></div>
            {e.mision_id && <span style={{ padding:"2px 7px", borderRadius:5, fontSize:10, background:`${C.accent}22`, color:C.accent }}>{e.mision_id}</span>}
            <span style={{ fontFamily:"'Orbitron',monospace", color:C.accent3, fontWeight:700, fontSize:12 }}>{e.xp_total} XP</span>
          </div>
        )) : <div style={{ color:C.muted, fontSize:12 }}>Sin actividad con este filtro.</div>}
      </Card>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <Card title="🗺️ Misiones activas">
          {misiones.length>0 ? misiones.map(m=>(
            <div key={m.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
              <span style={{ fontSize:18 }}>{m.icon}</span>
              <div style={{ flex:1 }}><div style={{ fontSize:12, fontWeight:600, color:m.color }}>{m.title}</div><div style={{ fontSize:10, color:C.muted }}>{m.retos?.length||0} retos · por {m.docente_nombre||"Admin"}</div></div>
            </div>
          )) : <div style={{ color:C.muted, fontSize:12 }}>Sin misiones creadas aún.</div>}
        </Card>
        <Card title="🕐 Actividad reciente">
          {stats?.actividadReciente?.length>0 ? stats.actividadReciente.slice(0,6).map((a,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", borderBottom:`1px solid ${C.border}` }}>
              <span style={{ fontSize:14 }}>🎓</span>
              <div style={{ flex:1 }}><div style={{ fontSize:11, fontWeight:600 }}>{a.nombre_estudiante}</div><div style={{ fontSize:10, color:C.muted }}>Grado {a.grado} · {new Date(a.updated_at).toLocaleDateString("es-CO")}</div></div>
              <span style={{ fontSize:11, color:C.accent3, fontWeight:600 }}>{a.xp_total} XP</span>
            </div>
          )) : <div style={{ color:C.muted, fontSize:12 }}>Sin actividad reciente.</div>}
        </Card>
      </div>
    </Page>
  );
}

// ═══════════════════════════════════════════════════════════════
// PROGRESO PANEL (Admin + Teacher)
// ═══════════════════════════════════════════════════════════════
function ProgresoPanel() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtroGrado, setFiltroGrado] = useState("todos");
  const [filtroGrupo, setFiltroGrupo] = useState("todos");
  const [ordenAZ, setOrdenAZ] = useState(false);

  useEffect(() => { fetch("/api/stats").then(r=>r.json()).then(d=>{ setStats(d); setLoading(false); }).catch(()=>setLoading(false)); }, []);

  const grados = stats?.porGrado ? Object.keys(stats.porGrado).sort() : [];
  let estudiantes = stats?.topEstudiantes || [];
  if (filtroGrado!=="todos") estudiantes = estudiantes.filter(e=>e.grado===filtroGrado);
  if (filtroGrupo!=="todos") estudiantes = estudiantes.filter(e=>e.grupo===filtroGrupo);
  if (ordenAZ) estudiantes = [...estudiantes].sort((a,b)=>a.nombre_estudiante.localeCompare(b.nombre_estudiante));

  return (
    <Page title="📊 Progreso Estudiantil" desc="Seguimiento de actividad y avance en la plataforma NEXUS">
      {loading && <div style={{ color:C.muted, fontSize:13, marginBottom:16 }}>⏳ Cargando...</div>}
      {!loading && stats && !stats.error && (
        <>
          <Card title="📈 Actividad por Grado">
            {grados.length>0 ? grados.map(g => {
              const d=stats.porGrado[g]; const maxXp=Math.max(...grados.map(k=>stats.porGrado[k].xp),1);
              return <div key={g} style={{ marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}><span style={{ fontSize:12, fontWeight:600 }}>Grado {g}</span><span style={{ fontSize:11, color:C.muted }}>{d.count} est. · {d.xp} XP</span></div>
                <div style={{ height:8, background:C.border, borderRadius:4, overflow:"hidden" }}><div style={{ height:"100%", width:`${Math.round(d.xp/maxXp*100)}%`, background:`linear-gradient(90deg,${C.accent},${C.accent2})`, borderRadius:4 }} /></div>
              </div>;
            }) : <div style={{ color:C.muted, fontSize:12 }}>Sin actividad aún.</div>}
          </Card>

          <Card title="🎓 Detalle por Estudiante">
            <div style={{ display:"flex", gap:10, marginBottom:14, alignItems:"center", flexWrap:"wrap" }}>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ ...lbl, marginBottom:0 }}>Grado:</span>
                <select style={{ ...inp, width:"auto", padding:"6px 10px" }} value={filtroGrado} onChange={e=>{setFiltroGrado(e.target.value);setFiltroGrupo("todos");}}>
                  <option value="todos">Todos</option>{grados.map(g=><option key={g} value={g}>Grado {g}</option>)}
                </select>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ ...lbl, marginBottom:0 }}>Grupo:</span>
                <select style={{ ...inp, width:"auto", padding:"6px 10px" }} value={filtroGrupo} onChange={e=>setFiltroGrupo(e.target.value)}>
                  <option value="todos">Todos</option>{["1","2","3","4"].map(g=><option key={g} value={g}>Grupo {g}</option>)}
                </select>
              </div>
              <button onClick={()=>setOrdenAZ(!ordenAZ)} style={{ padding:"6px 12px", background:ordenAZ?`${C.accent2}33`:C.surface, border:`1px solid ${ordenAZ?C.accent2:C.border}`, borderRadius:8, color:ordenAZ?C.accent2:C.muted, fontSize:12, cursor:"pointer" }}>
                {ordenAZ?"🔤 A→Z":"🏆 Mayor XP"}
              </button>
              <button onClick={()=>downloadExcel(estudiantes.map((e,i)=>({Pos:i+1,Nombre:e.nombre_estudiante,Grado:e.grado,Grupo:e.grupo||"—",XP:e.xp_total,Nivel:e.nivel||1,Mision:e.mision_id||"libre"})),`progreso_${filtroGrado}`)} style={{ padding:"6px 12px", background:`${C.accent3}22`, border:`1px solid ${C.accent3}44`, borderRadius:8, color:C.accent3, fontSize:12, cursor:"pointer", marginLeft:"auto" }}>
                ⬇️ Descargar Excel
              </button>
            </div>
            <div style={{ fontSize:11, color:C.muted, marginBottom:10 }}>{estudiantes.length} estudiante{estudiantes.length!==1?"s":""}</div>
            {estudiantes.length>0 ? estudiantes.map((e,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:C.surface, borderRadius:10, border:`1px solid ${C.border}`, marginBottom:6 }}>
                <span style={{ fontFamily:"'Orbitron',monospace", color:i===0?"#ffd700":i===1?"#c0c0c0":i===2?"#cd7f32":C.muted, fontSize:11, width:28, textAlign:"center", fontWeight:900 }}>#{i+1}</span>
                <div style={{ flex:1 }}><div style={{ fontSize:13, fontWeight:600 }}>{e.nombre_estudiante}</div><div style={{ fontSize:11, color:C.muted }}>Grado {e.grado} · Grupo {e.grupo||"—"} · Nivel {e.nivel||1}</div></div>
                {e.mision_id && <span style={{ padding:"3px 8px", borderRadius:6, fontSize:10, background:`${C.accent}22`, color:C.accent }}>{e.mision_id}</span>}
                <span style={{ fontFamily:"'Orbitron',monospace", color:C.accent3, fontWeight:700 }}>{e.xp_total} XP</span>
              </div>
            )) : <div style={{ color:C.muted, fontSize:12 }}>Sin estudiantes con este filtro.</div>}
          </Card>
        </>
      )}
    </Page>
  );
}

// ═══════════════════════════════════════════════════════════════
// GESTIÓN DE MISIONES — filtrada por docente, persistida en BD
// ═══════════════════════════════════════════════════════════════
function MisionesPanel({ user, misiones, setMisiones, loadingM }) {
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ title:"", icon:"📻", color:"#f97316", description:"", retos:[] });
  const [retoF, setRetoF] = useState({ title:"", desc:"", stars:1 });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const iniciarNueva = () => { setForm({ title:"", icon:"📻", color:"#f97316", description:"", retos:[] }); setEditando("nueva"); };
  const iniciarEditar = (m) => { setForm({ id:m.id, title:m.title, icon:m.icon, color:m.color, description:m.description, retos:m.retos.map(r=>({...r})) }); setEditando(m.id); };
  const agregarReto = () => { if (!retoF.title) return; setForm(p=>({ ...p, retos:[...p.retos, { id:p.retos.length+1, ...retoF }] })); setRetoF({ title:"", desc:"", stars:1 }); };
  const quitarReto = (idx) => setForm(p=>({ ...p, retos:p.retos.filter((_,i)=>i!==idx).map((r,i)=>({...r,id:i+1})) }));

  const guardar = async () => {
    if (!form.title || form.retos.length===0) return;
    setSaving(true);
    if (editando==="nueva") {
      const nueva = await createMision(user.id, user.name, { title:form.title, icon:form.icon, color:form.color, description:form.description, retos:form.retos });
      if (nueva) setMisiones(prev=>[...prev, nueva]);
    } else {
      const actualizada = await updateMision(user.id, { id:form.id, title:form.title, icon:form.icon, color:form.color, description:form.description, retos:form.retos });
      if (actualizada) setMisiones(prev=>prev.map(m=>m.id===form.id?actualizada:m));
    }
    setSaving(false); setSaved(true); setTimeout(()=>{ setSaved(false); setEditando(null); }, 1500);
  };

  const eliminar = async (id) => {
    if (!confirm("¿Eliminar esta misión?")) return;
    setDeleting(id);
    await deleteMision(id, user.id, user.role);
    setMisiones(prev=>prev.filter(m=>m.id!==id));
    setDeleting(null);
  };

  const isAdmin = user.role === "admin";

  if (!editando) return (
    <Page title="🗺️ Gestión de Misiones" desc={isAdmin ? "Vista de todas las misiones de la plataforma." : `Tus misiones creadas, ${user.name.split(" ")[0]}. Solo tú puedes verlas y editarlas.`}>
      {!isAdmin && (
        <div style={{ background:`${C.accent}10`, border:`1px solid ${C.accent}33`, borderRadius:10, padding:"10px 16px", marginBottom:16, fontSize:12, color:C.accent }}>
          🔒 Cada docente ve y gestiona únicamente sus propias misiones.
        </div>
      )}
      <div style={{ marginBottom:16 }}><Btn onClick={iniciarNueva}>+ Nueva Misión</Btn></div>
      {loadingM && <div style={{ color:C.muted, fontSize:13 }}>⏳ Cargando misiones...</div>}
      {!loadingM && misiones.length===0 && <div style={{ color:C.muted, fontSize:13, padding:20, textAlign:"center" }}>Aún no has creado ninguna misión. ¡Crea la primera! 🚀</div>}
      {misiones.map(m=>(
        <div key={m.id} style={{ background:C.card, border:`1px solid ${m.color}44`, borderRadius:14, padding:18, marginBottom:12, display:"flex", alignItems:"center", gap:14 }}>
          <span style={{ fontSize:36 }}>{m.icon}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:700, color:m.color }}>{m.title}</div>
            <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{m.description}</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:4, display:"flex", gap:12 }}>
              <span>{m.retos?.length||0} retos · {(m.retos||[]).filter(r=>r.stars===3).length} avanzados</span>
              {isAdmin && <span style={{ color:C.accent }}>👤 {m.docente_nombre||"—"}</span>}
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {(isAdmin || m.docente_id===user.id) && <>
              <button onClick={()=>iniciarEditar(m)} style={{ padding:"7px 14px", background:`${C.accent}22`, border:`1px solid ${C.accent}44`, borderRadius:8, color:C.accent, fontSize:12, cursor:"pointer" }}>✏️ Editar</button>
              <button onClick={()=>eliminar(m.id)} disabled={deleting===m.id} style={{ padding:"7px 14px", background:"#ff444422", border:"1px solid #ff444444", borderRadius:8, color:"#ff7777", fontSize:12, cursor:"pointer" }}>{deleting===m.id?"...":"🗑️"}</button>
            </>}
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
          <div><div style={lbl}>Título</div><input style={inp} placeholder="Ej: Circuitos con Arduino" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} /></div>
          <div><div style={lbl}>Ícono</div><div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>{ICONOS_MISION.map(ic=><button key={ic} onClick={()=>setForm(p=>({...p,icon:ic}))} style={{ width:36, height:36, borderRadius:8, border:`2px solid ${form.icon===ic?C.accent:C.border}`, background:form.icon===ic?`${C.accent}22`:C.surface, fontSize:18, cursor:"pointer" }}>{ic}</button>)}</div></div>
        </div>
        <div style={{ marginBottom:14 }}><div style={lbl}>Descripción</div><input style={inp} value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} /></div>
        <div><div style={lbl}>Color</div><div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:4 }}>{COLORES_MISION.map(col=><button key={col} onClick={()=>setForm(p=>({...p,color:col}))} style={{ width:32, height:32, borderRadius:"50%", background:col, border:`3px solid ${form.color===col?"#fff":col}`, cursor:"pointer", transform:form.color===col?"scale(1.2)":"scale(1)", transition:"transform .15s" }} />)}</div>
          <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:10 }}><span style={{ fontSize:28 }}>{form.icon}</span><span style={{ fontSize:14, fontWeight:700, color:form.color }}>{form.title||"Vista previa"}</span></div>
        </div>
      </Card>
      <Card title="⭐ Retos">
        {form.retos.length===0 && <div style={{ color:C.muted, fontSize:12, marginBottom:12 }}>Sin retos aún. Agrega al menos uno.</div>}
        {form.retos.map((r,i)=>(
          <div key={i} style={{ display:"flex", gap:10, padding:"10px 12px", background:C.surface, borderRadius:8, marginBottom:8, border:`1px solid ${C.border}`, alignItems:"flex-start" }}>
            <span style={{ fontFamily:"'Orbitron',monospace", color:form.color, fontWeight:900, fontSize:13, width:20 }}>{r.id}</span>
            <div style={{ flex:1 }}><div style={{ fontSize:13, fontWeight:600 }}>{r.title} {"⭐".repeat(r.stars)}</div><div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{r.desc}</div></div>
            <button onClick={()=>quitarReto(i)} style={{ background:"none", border:"none", color:"#ff7777", cursor:"pointer", fontSize:16 }}>✕</button>
          </div>
        ))}
        <div style={{ background:`${C.accent}08`, border:`1px dashed ${C.accent}44`, borderRadius:10, padding:14, marginTop:8 }}>
          <div style={{ fontSize:12, color:C.accent, fontWeight:600, marginBottom:10 }}>+ Agregar reto</div>
          <div style={grid2}>
            <div><div style={lbl}>Título del reto</div><input style={inp} value={retoF.title} onChange={e=>setRetoF(p=>({...p,title:e.target.value}))} /></div>
            <div><div style={lbl}>Dificultad</div><select style={inp} value={retoF.stars} onChange={e=>setRetoF(p=>({...p,stars:Number(e.target.value)}))}>
              <option value={1}>⭐ Básico</option><option value={2}>⭐⭐ Intermedio</option><option value={3}>⭐⭐⭐ Avanzado</option>
            </select></div>
          </div>
          <div style={{ marginTop:10 }}><div style={lbl}>Descripción</div><textarea style={{ ...inp, minHeight:60, resize:"vertical" }} value={retoF.desc} onChange={e=>setRetoF(p=>({...p,desc:e.target.value}))} /></div>
          <button onClick={agregarReto} disabled={!retoF.title} style={{ marginTop:10, padding:"8px 16px", background:`${C.accent3}22`, border:`1px solid ${C.accent3}44`, borderRadius:8, color:C.accent3, fontSize:12, fontWeight:700, cursor:"pointer" }}>Agregar reto</button>
        </div>
      </Card>
      <div style={{ display:"flex", gap:10 }}>
        <Btn onClick={guardar} disabled={!form.title||form.retos.length===0||saving}>{saved?"✅ ¡Guardado!":saving?"Guardando...":editando==="nueva"?"Crear Misión 🚀":"Guardar Cambios ✔️"}</Btn>
        <button onClick={()=>setEditando(null)} style={{ padding:"11px 20px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:10, color:C.muted, fontSize:13, cursor:"pointer" }}>Cancelar</button>
      </div>
    </Page>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADMIN VIEW
// ═══════════════════════════════════════════════════════════════
function AdminView({ user, onLogout }) {
  const [tab, setTab] = useState("dashboard");
  const [misiones, setMisiones] = useState([]);
  const [loadingM, setLoadingM] = useState(true);

  useEffect(() => {
    getMisiones(user.id, "admin").then(m=>{ setMisiones(m); setLoadingM(false); });
  }, []);

  return (
    <Layout sidebar={<Sidebar user={user} onLogout={onLogout} tab={tab} setTab={setTab} tabs={[
      { id:"dashboard", icon:"⬡",  label:"Dashboard" },
      { id:"progreso",  icon:"📊", label:"Progreso" },
      { id:"missions",  icon:"🗺️", label:"Misiones" },
      { id:"users",     icon:"👥", label:"Usuarios" },
    ]} />}>
      {tab==="dashboard" && <DashboardPanel user={user} misiones={misiones} />}
      {tab==="progreso"  && <ProgresoPanel />}
      {tab==="missions"  && <MisionesPanel user={user} misiones={misiones} setMisiones={setMisiones} loadingM={loadingM} />}
      {tab==="users"     && <AdminUsuarios />}
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════
// TEACHER VIEW — solo ve sus propias misiones
// ═══════════════════════════════════════════════════════════════
function TeacherView({ user, onLogout }) {
  const [tab, setTab] = useState("dashboard");
  const [misiones, setMisiones] = useState([]);
  const [loadingM, setLoadingM] = useState(true);
  const [cfg, setCfg] = useState({ subject:user.subject||"", grade:"7-11", topics:"", tone:"motivador" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Solo carga las misiones de ESTE docente
    getMisiones(user.id, "teacher").then(m=>{ setMisiones(m); setLoadingM(false); });
  }, [user.id]);

  return (
    <Layout sidebar={<Sidebar user={user} onLogout={onLogout} tab={tab} setTab={setTab} tabs={[
      { id:"dashboard", icon:"⬡",  label:"Dashboard" },
      { id:"progreso",  icon:"📊", label:"Progreso" },
      { id:"missions",  icon:"🗺️", label:"Mis Misiones" },
      { id:"config",    icon:"⚙️", label:"Mi NEXUS" },
      { id:"preview",   icon:"👁️", label:"Vista previa" },
    ]} />}>
      {tab==="dashboard" && <DashboardPanel user={user} misiones={misiones} />}
      {tab==="progreso"  && <ProgresoPanel />}
      {tab==="missions"  && <MisionesPanel user={user} misiones={misiones} setMisiones={setMisiones} loadingM={loadingM} />}
      {tab==="config" && (
        <Page title="⚙️ Configura NEXUS">
          <Card title="📚 Asignatura y grados">
            <div style={grid2}>
              <div><div style={lbl}>Asignatura</div><input style={inp} value={cfg.subject} onChange={e=>setCfg({...cfg,subject:e.target.value})} /></div>
              <div><div style={lbl}>Grados</div><input style={inp} value={cfg.grade} onChange={e=>setCfg({...cfg,grade:e.target.value})} /></div>
            </div>
          </Card>
          <Card title="📋 Temáticas">
            <div style={lbl}>Temas del periodo</div>
            <textarea style={{ ...inp, minHeight:80, resize:"vertical", marginBottom:14 }} value={cfg.topics} onChange={e=>setCfg({...cfg,topics:e.target.value})} />
            <div style={lbl}>Tono</div>
            <select style={inp} value={cfg.tone} onChange={e=>setCfg({...cfg,tone:e.target.value})}>
              <option value="motivador">Motivador</option><option value="formal">Formal</option><option value="socrático">Socrático</option><option value="gamificado">Gamificado</option>
            </select>
          </Card>
          <Btn onClick={()=>{setSaved(true);setTimeout(()=>setSaved(false),2000)}}>{saved?"✅ ¡Guardado!":"Guardar configuración"}</Btn>
        </Page>
      )}
      {tab==="preview" && (
        <Page title="Vista previa">
          <NexusChat prompt={buildPrompt(cfg.subject||"Tecnología e Informática", cfg.grade, cfg.topics)} userName="Explorador" compact user={null} misionId={null} />
        </Page>
      )}
    </Layout>
  );
}

function AdminUsuarios() {
  const [tab, setTab]       = useState("docentes");
  const [data, setData]     = useState({ docentes:[], estudiantes:[] });
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [buscar, setBuscar] = useState("");

  const cargar = () => {
    setLoading(true); setApiError(null);
    fetch("/api/usuarios")
      .then(r => r.json())
      .then(d => {
        // Siempre inicializar arrays aunque la respuesta sea parcial
        setData({ docentes: d.docentes||[], estudiantes: d.estudiantes||[] });
        setLoading(false);
      })
      .catch(err => { setApiError(err.message); setLoading(false); });
  };
  useEffect(() => cargar(), []);

  const eliminar = async (id, tipo, nombre) => {
    if (!confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/usuarios?id=${id}&tipo=${tipo}`, { method:"DELETE" });
      const d = await res.json();
      if (d.success) cargar();
      else alert("Error al eliminar: " + d.error);
    } catch(e) { alert("Error de red: " + e.message); }
    setDeleting(null);
  };

  // Columnas reales en Supabase: nombres, apellidos, fecha_registro
  const lista = tab==="docentes" ? (data.docentes||[]) : (data.estudiantes||[]);
  const filtrada = lista.filter(u => {
    const nombreCompleto = `${u.nombres||""} ${u.apellidos||""}`.toLowerCase();
    return nombreCompleto.includes(buscar.toLowerCase()) ||
      (u.email||"").toLowerCase().includes(buscar.toLowerCase()) ||
      (u.asignatura||"").toLowerCase().includes(buscar.toLowerCase()) ||
      (u.grado||"").includes(buscar);
  });

  return (
    <Page title="👥 Gestión de Usuarios" desc="Administra docentes y estudiantes registrados en la plataforma.">
      {/* Tabs */}
      <div style={{ display:"flex", background:C.surface, borderRadius:12, padding:4, marginBottom:20, border:`1px solid ${C.border}`, width:"fit-content", gap:4 }}>
        {[["docentes","📚","Docentes",data.docentes?.length],["estudiantes","🎓","Estudiantes",data.estudiantes?.length]].map(([t,ic,lb,cnt])=>(
          <button key={t} onClick={()=>{setTab(t);setBuscar("");}} style={{ padding:"8px 20px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:13, background:tab===t?`linear-gradient(135deg,${C.accent},${C.accent2})`:"transparent", color:tab===t?"#fff":C.muted }}>
            {ic} {lb} <span style={{ marginLeft:6, fontSize:11, opacity:0.8 }}>({cnt??0})</span>
          </button>
        ))}
      </div>

      {/* Buscador */}
      <div style={{ marginBottom:14 }}>
        <input style={{ ...inp, maxWidth:360 }} placeholder={tab==="docentes"?"Buscar por nombre, email o asignatura...":"Buscar por nombre o grado..."} value={buscar} onChange={e=>setBuscar(e.target.value)} />
      </div>

      {loading   && <div style={{ color:C.muted, fontSize:13 }}>⏳ Cargando usuarios...</div>}
      {apiError  && <div style={{ background:"#ff444422", border:"1px solid #ff444444", color:"#ff7777", padding:"10px 14px", borderRadius:8, fontSize:13, marginBottom:12 }}>⚠️ Error: {apiError}</div>}

      {!loading && tab==="docentes" && (
        <Card title={`📚 Docentes — ${filtrada.length} resultado${filtrada.length!==1?"s":""}`}>
          {filtrada.length===0 && <div style={{ color:C.muted, fontSize:12 }}>Sin docentes{buscar?" con ese filtro":""} registrados.</div>}
          {filtrada.map(d=>(
            <div key={d.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", background:C.surface, borderRadius:10, marginBottom:8, border:`1px solid ${C.border}` }}>
              <div style={{ width:38, height:38, borderRadius:"50%", background:`${C.accent2}22`, border:`1.5px solid ${C.accent2}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>📚</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700 }}>{d.nombres||"—"} {d.apellidos||""}</div>
                <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                  {d.email||"Sin email"} {d.asignatura?`· ${d.asignatura}`:""}
                </div>
              </div>
              <div style={{ fontSize:10, color:C.muted, flexShrink:0 }}>
                {d.fecha_registro ? new Date(d.fecha_registro).toLocaleDateString("es-CO") : "—"}
              </div>
              <button onClick={()=>eliminar(d.id,"docente",`${d.nombres} ${d.apellidos}`)} disabled={deleting===d.id} style={{ padding:"6px 14px", background:"#ff444422", border:"1px solid #ff444444", borderRadius:8, color:"#ff7777", fontSize:12, cursor:"pointer", flexShrink:0 }}>
                {deleting===d.id?"...":"🗑️ Eliminar"}
              </button>
            </div>
          ))}
        </Card>
      )}

      {!loading && tab==="estudiantes" && (
        <Card title={`🎓 Estudiantes — ${filtrada.length} resultado${filtrada.length!==1?"s":""}`}>
          {filtrada.length===0 && <div style={{ color:C.muted, fontSize:12 }}>Sin estudiantes{buscar?" con ese filtro":""} registrados.</div>}
          {filtrada.map(e=>(
            <div key={e.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", background:C.surface, borderRadius:10, marginBottom:8, border:`1px solid ${C.border}` }}>
              <div style={{ width:38, height:38, borderRadius:"50%", background:`${C.accent3}22`, border:`1.5px solid ${C.accent3}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>🎓</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700 }}>{e.nombres||"—"} {e.apellidos||""}</div>
                <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                  Grado {e.grado||"—"} · Grupo {e.grupo||"—"}
                </div>
              </div>
              <div style={{ fontSize:10, color:C.muted, flexShrink:0 }}>
                {e.fecha_registro ? new Date(e.fecha_registro).toLocaleDateString("es-CO") : "—"}
              </div>
              <button onClick={()=>eliminar(e.id,"estudiante",`${e.nombres} ${e.apellidos}`)} disabled={deleting===e.id} style={{ padding:"6px 14px", background:"#ff444422", border:"1px solid #ff444444", borderRadius:8, color:"#ff7777", fontSize:12, cursor:"pointer", flexShrink:0 }}>
                {deleting===e.id?"...":"🗑️ Eliminar"}
              </button>
            </div>
          ))}
        </Card>
      )}

      <InfoBox title="💡 Para agregar usuarios">
        <Row k="Docentes" v="Insertar en tabla 'docentes' en Supabase con contraseña hasheada (bcrypt cost 10)" />
        <Row k="Estudiantes" v="Se crean automáticamente al iniciar sesión" />
      </InfoBox>
    </Page>
  );
}

// ═══════════════════════════════════════════════════════════════
// STUDENT VIEW
// ═══════════════════════════════════════════════════════════════
function StudentView({ user, onLogout }) {
  const [tab, setTab] = useState("chat");
  const [mission, setMission] = useState(null);
  const [misiones, setMisiones] = useState([]);

  useEffect(() => {
    // Estudiante ve TODAS las misiones de todos los docentes
    getMisiones("", "student").then(m=>setMisiones(m));
  }, []);

  const missionData = misiones.find(m=>m.id===mission);

  return (
    <Layout sidebar={<Sidebar user={user} onLogout={onLogout} tab={tab} setTab={setTab} tabs={[
      { id:"chat",     icon:"⬡", label:"NEXUS Chat" },
      { id:"missions", icon:"🗺️", label:"Mis Misiones" },
      { id:"progress", icon:"⭐", label:"Mi Progreso" },
    ]} />}>
      {tab==="chat" && (
        <div style={{ height:"100%", display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ padding:"16px 24px 0", flexShrink:0 }}>
            <h1 style={ptitle}>NEXUS · Tu compañero de retos</h1>
            <div style={{ display:"flex", gap:8, marginBottom:8 }}>
              {mission && <div style={{ display:"flex", alignItems:"center", gap:8, background:C.card, border:`1px solid ${missionData?.color}44`, borderRadius:10, padding:"7px 12px", fontSize:12, flex:1 }}>
                <span>{missionData?.icon}</span><span>Misión activa: <strong>{missionData?.title}</strong></span>
                <button style={{ marginLeft:"auto", background:"none", border:"none", color:C.muted, cursor:"pointer" }} onClick={()=>setMission(null)}>✕</button>
              </div>}
              <div style={{ display:"flex", alignItems:"center", gap:6, background:`${C.accent3}15`, border:`1px solid ${C.accent3}44`, borderRadius:10, padding:"7px 12px", fontSize:11, color:C.accent3 }}>💬 Modo libre</div>
            </div>
          </div>
          <div style={{ flex:1, overflow:"hidden", padding:"0 24px 24px" }}>
            <NexusChat prompt={buildPrompt("Tecnología e Informática", user.grade||"7-11", mission?`El estudiante trabaja en: ${missionData?.title}.`:"")} userName={user.name} user={user} misionId={mission} />
          </div>
        </div>
      )}
      {tab==="missions" && <Page title="🗺️ Mapa de Misiones"><MissionMap misiones={misiones} onSelect={id=>{ setMission(id); setTab("chat"); }} /></Page>}
      {tab==="progress" && <Page title="⭐ Mi Progreso"><InfoBox title={`🎓 ${user.name}`}><Row k="Grado" v={user.grade||"—"} /><Row k="Grupo" v={user.group||"—"} /></InfoBox></Page>}
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════
// NEXUS CHAT
// ═══════════════════════════════════════════════════════════════
function NexusChat({ prompt, userName, compact, user, misionId }) {
  const [msgs, setMsgs] = useState([{ role:"assistant", content:`¡Bienvenido${userName?`, ${userName.split(" ")[0]}`:""}! 🚀 Soy **NEXUS**. Te guío con pistas para que TÚ descubras el conocimiento.\n\n💬 **Modo libre:** pregunta sobre tecnología.\n🗺️ **O elige una misión** en el menú lateral. 🎯` }]);
  const [input, setInput] = useState(""); const [loading, setLoading] = useState(false);
  const [xp, setXp] = useState(0); const [xpAnim, setXpAnim] = useState(null);
  const endRef = useRef(null);
  useEffect(()=>{ endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs]);
  const lv=Math.floor(xp/50)+1; const pct=(xp%50)/50*100;
  const addXP = useCallback((n) => { setXp(prev=>{ const nx=prev+n; if(user?.id) saveProgress(user,nx,Math.floor(nx/50)+1,misionId); return nx; }); setXpAnim(n); setTimeout(()=>setXpAnim(null),2000); }, [user,misionId]);
  const send = async txt => {
    const t=txt||input.trim(); if(!t||loading) return;
    setInput("");
    const nm=[...msgs,{role:"user",content:t}]; setMsgs(nm); setLoading(true); addXP(5);
    const reply=await callNexus(nm.map(m=>({role:m.role,content:m.content})),prompt);
    setMsgs(p=>[...p,{role:"assistant",content:reply}]);
    if(/maestría|exacto|correcto|¡así/i.test(reply)) addXP(20);
    setLoading(false);
  };
  const SUGS=["¿Cómo funciona una Radio AM?","¿Qué es la Ley de Ohm?","¿Cómo programo un servo?","¿Qué es la modulación FM?","¿Para qué sirve el transistor?"];
  return (
    <div style={{ display:"flex", flexDirection:"column", height:compact?420:"100%", background:C.card, border:`1px solid ${C.border}`, borderRadius:16, overflow:"hidden" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 16px", background:C.surface, borderBottom:`1px solid ${C.border}`, position:"relative" }}>
        <span style={{ fontSize:10, fontFamily:"'Orbitron',monospace", color:C.accent, fontWeight:700 }}>NVL {lv}</span>
        <div style={{ flex:1, height:4, background:C.border, borderRadius:2, overflow:"hidden" }}><div style={{ height:"100%", background:`linear-gradient(90deg,${C.accent},${C.accent2})`, width:`${pct}%`, borderRadius:2, transition:"width .5s" }} /></div>
        <span style={{ fontSize:10, color:C.muted, fontFamily:"'Orbitron',monospace" }}>{xp} XP</span>
        {xpAnim && <span style={{ position:"absolute", right:16, top:-24, fontSize:12, color:C.accent3, fontWeight:700, background:C.card, padding:"3px 8px", borderRadius:8, border:`1px solid ${C.accent3}` }}>+{xpAnim} XP ✨</span>}
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"18px 16px", display:"flex", flexDirection:"column", gap:14 }}>
        {msgs.map((m,i)=>(
          <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", ...(m.role==="user"?{justifyContent:"flex-end",alignSelf:"flex-end"}:{}), maxWidth:"82%" }}>
            {m.role==="assistant" && <div style={{ width:32, height:32, borderRadius:"50%", background:`${C.accent}15`, border:`1.5px solid ${C.accent}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:C.accent, flexShrink:0 }}>⬡</div>}
            <div style={{ background:m.role==="user"?C.user:C.surface, border:`1px solid ${m.role==="user"?C.accent2+"44":C.border}`, borderRadius:m.role==="user"?"14px 4px 14px 14px":"4px 14px 14px 14px", padding:"12px 16px" }}>
              <div dangerouslySetInnerHTML={{ __html:m.content.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>").replace(/\n/g,"<br/>") }} style={{ fontSize:13, lineHeight:1.75 }} />
            </div>
            {m.role==="user" && <div style={{ width:32, height:32, borderRadius:"50%", background:C.user, border:`1.5px solid ${C.accent2}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>👤</div>}
          </div>
        ))}
        {loading && <div style={{ display:"flex", gap:10, maxWidth:"82%" }}><div style={{ width:32, height:32, borderRadius:"50%", background:`${C.accent}15`, border:`1.5px solid ${C.accent}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:C.accent }}>⬡</div><div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:"4px 14px 14px 14px", padding:"14px 18px" }}><div style={{ display:"flex", gap:5 }}>{[0,150,300].map(d=><span key={d} style={{ width:7, height:7, borderRadius:"50%", background:C.accent, animation:"pulse 1.2s ease-in-out infinite", display:"inline-block", animationDelay:`${d}ms` }} />)}</div></div></div>}
        {msgs.length===1&&!loading&&<div><div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>💡 Preguntas sugeridas:</div><div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>{SUGS.map((q,i)=><button key={i} style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.accent, padding:"7px 13px", borderRadius:20, fontSize:11, cursor:"pointer", fontFamily:"inherit" }} onClick={()=>send(q)}>{q}</button>)}</div></div>}
        <div ref={endRef} />
      </div>
      <div style={{ display:"flex", gap:8, padding:"12px 14px", borderTop:`1px solid ${C.border}`, background:C.surface, alignItems:"flex-end" }}>
        <textarea style={{ flex:1, background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"10px 14px", color:C.text, fontSize:13, resize:"none", fontFamily:"inherit", outline:"none", maxHeight:80 }} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); send(); }}} placeholder="Pregunta lo que quieras... (Enter para enviar)" rows={1} />
        <button style={{ width:38, height:38, borderRadius:10, background:`linear-gradient(135deg,${C.accent},${C.accent2})`, border:"none", color:"#fff", fontSize:15, cursor:"pointer", opacity:loading||!input.trim()?0.4:1 }} onClick={()=>send()} disabled={loading||!input.trim()}>➤</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MISSION MAP (estudiantes)
// ═══════════════════════════════════════════════════════════════
function MissionMap({ misiones, onSelect }) {
  const [open, setOpen] = useState(null);
  if (misiones.length===0) return <div style={{ color:C.muted, fontSize:13, padding:20, textAlign:"center" }}>Aún no hay misiones disponibles. Tu docente las creará pronto. 🚀</div>;
  return (
    <div>{misiones.map(m=>(
      <div key={m.id} style={{ background:C.card, border:`1px solid ${open===m.id?m.color+"88":m.color+"33"}`, borderRadius:14, padding:20, marginBottom:16, cursor:"pointer" }} onClick={()=>setOpen(open===m.id?null:m.id)}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:14 }}>
          <span style={{ fontSize:34 }}>{m.icon}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:700, color:m.color }}>{m.title}</div>
            <div style={{ fontSize:12, color:C.muted, marginTop:2, marginBottom:8 }}>{m.description}</div>
            <div style={{ fontSize:10, color:C.accent, marginBottom:6 }}>👤 {m.docente_nombre||"Docente"}</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>{(m.retos||[]).map(r=><span key={r.id} style={{ padding:"3px 8px", borderRadius:6, fontSize:10, background:m.color+"22", color:m.color }}>{"⭐".repeat(r.stars)}</span>)}</div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:8 }}>
            <span style={{ padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:m.color+"22", color:m.color }}>{(m.retos||[]).length} retos</span>
            {onSelect && <button style={{ padding:"7px 14px", background:m.color, border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer" }} onClick={e=>{ e.stopPropagation(); onSelect(m.id); }}>Iniciar ➤</button>}
          </div>
        </div>
        {open===m.id && <div style={{ marginTop:16, borderTop:`1px solid ${m.color}33`, paddingTop:16 }}>{(m.retos||[]).map(r=>(
          <div key={r.id} style={{ display:"flex", gap:12, padding:"12px 14px", marginBottom:8, background:C.surface, borderRadius:8, borderLeft:`3px solid ${m.color}66` }}>
            <div style={{ fontFamily:"'Orbitron',monospace", fontWeight:900, fontSize:13, color:m.color, width:20 }}>{r.id}</div>
            <div><div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>{r.title} {"⭐".repeat(r.stars)}</div><div style={{ fontSize:12, color:C.muted }}>{r.desc}</div></div>
          </div>
        ))}</div>}
      </div>
    ))}</div>
  );
}

// ── Shared components ──
function Layout({ sidebar, children }) { return <div style={{ display:"flex", height:"100vh", position:"relative", zIndex:5 }}>{sidebar}<main style={{ flex:1, overflow:"auto", background:C.bg }}>{children}</main></div>; }
function Sidebar({ user, onLogout, tabs, tab, setTab }) {
  return (
    <aside style={{ width:220, background:C.surface, borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column", flexShrink:0 }}>
      <div style={{ padding:"20px 16px", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}><span style={{ fontSize:22, color:C.accent }}>⬡</span><span style={{ fontFamily:"'Orbitron',monospace", fontSize:16, fontWeight:900, color:C.accent, letterSpacing:2 }}>NEXUS</span></div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:"50%", background:C.card, border:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>{user.role==="admin"?"👑":user.role==="teacher"?"📚":"🎓"}</div>
          <div><div style={{ fontSize:13, fontWeight:600 }}>{user.name.split(" ")[0]}</div><div style={{ fontSize:10, color:C.muted, marginTop:1 }}>{user.role==="admin"?"Administrador":user.role==="teacher"?"Docente":`Grado ${user.grade||""}`}</div></div>
        </div>
      </div>
      <nav style={{ flex:1, padding:"12px 8px", display:"flex", flexDirection:"column", gap:2 }}>
        {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, background:tab===t.id?`${C.accent}15`:"transparent", border:"none", borderLeft:tab===t.id?`2px solid ${C.accent}`:"2px solid transparent", color:tab===t.id?C.accent:C.muted, fontSize:13, cursor:"pointer", textAlign:"left" }}><span style={{ fontSize:16, width:20, textAlign:"center" }}>{t.icon}</span><span>{t.label}</span></button>)}
      </nav>
      <button onClick={onLogout} style={{ margin:"12px 8px", padding:"10px 12px", background:"transparent", border:`1px solid ${C.border}`, color:C.muted, borderRadius:10, cursor:"pointer", fontSize:12 }}>← Cerrar sesión</button>
    </aside>
  );
}
function Page({ title, desc, children }) { return <div style={{ padding:28, maxWidth:900 }}><h1 style={ptitle}>{title}</h1>{desc&&<p style={{ fontSize:13, color:C.muted, marginBottom:20 }}>{desc}</p>}{children}</div>; }
function Card({ title, children }) { return <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:20, marginBottom:16 }}><div style={{ fontSize:15, fontWeight:700, marginBottom:14 }}>{title}</div>{children}</div>; }
function InfoBox({ title, children }) { return <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:16, marginTop:16 }}><div style={{ fontSize:13, fontWeight:700, color:C.accent, marginBottom:10 }}>{title}</div>{children}</div>; }
function Row({ k, v }) { return <div style={{ fontSize:12, color:C.muted, padding:"4px 0" }}><span style={{ color:C.text, fontWeight:600, minWidth:100, display:"inline-block" }}>{k}:</span>{v}</div>; }
function Btn({ onClick, children, disabled }) { return <button onClick={onClick} disabled={disabled} style={{ padding:"11px 20px", background:disabled?C.border:`linear-gradient(135deg,${C.accent},${C.accent2})`, border:"none", borderRadius:10, color:"#fff", fontWeight:700, fontSize:13, cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.5:1 }}>{children}</button>; }

const lbl   = { fontSize:11, color:C.muted, textTransform:"uppercase", letterSpacing:1, fontWeight:600, marginBottom:6, display:"block" };
const inp   = { background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"11px 14px", color:C.text, fontSize:13, outline:"none", fontFamily:"inherit", width:"100%", boxSizing:"border-box" };
const grid2 = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 };
const grid4 = { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 };
const ptitle= { fontSize:22, fontWeight:800, color:C.text, marginBottom:6 };

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Syne:wght@400;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}body{overflow:hidden;}
  ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:#1a3050;border-radius:2px;}
  input::placeholder,textarea::placeholder{color:#4a6080;}
  input:focus,textarea:focus,select:focus{border-color:#00c8ff55!important;outline:none;}
  select option{background:#0d1526;color:#e2e8f0;}
  @keyframes pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.3;transform:scale(.6);}}
`;
