import { useState, useRef, useEffect, useCallback } from "react";

// ─── Responsive hook ──────────────────────────────────────────
const useIsMobile = () => {
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mobile;
};

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

const saveProgress = async (user, xp, nivel, misionId, equipo=null) => {
  try {
    // Siempre guardar para el líder/estudiante individual
    await fetch("/api/saveprogress", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        estudiante_id: user.id,
        nombre_estudiante: user.name,
        grado: user.grade||"", grupo: user.group||"",
        xp_total: xp, nivel, mision_id: misionId||null,
      }),
    });
    // Si hay equipo, guardar el mismo XP y nota para cada integrante
    if (equipo?.integrantes?.length > 0) {
      await Promise.all(equipo.integrantes.map(m =>
        fetch("/api/saveprogress", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            estudiante_id: String(m.id),
            nombre_estudiante: `${m.nombres} ${m.apellidos}`,
            grado: user.grade||"", grupo: user.group||"",
            xp_total: xp, nivel, mision_id: misionId||null,
          }),
        })
      ));
    }
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

// ─── Excel download ───────────────────────────────────────────
const downloadExcel = (rows, filename="reporte_nexus") => {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map(r=>headers.map(h=>`"${String(r[h]??"").replace(/"/g,'""')}"`).join(","))].join("\n");
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
      if (res.ok && data.user) { setUser(data.user); setView(data.user.role==="admin"?"admin":data.user.role==="teacher"?"teacher":"student"); setLoginErr(""); }
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
    // Docente filtra por sus misiones; admin ve todo
    const params = user?.role === "teacher"
      ? `?docente_id=${user.id}&role=teacher`
      : `?role=admin`;
    fetch(`/api/stats${params}`)
      .then(r=>r.json())
      .then(d=>{ setStats(d); setLoading(false); })
      .catch(()=>setLoading(false));
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
          <button onClick={()=>downloadExcel(top.map((e,i)=>({Pos:i+1,Nombre:e.nombre_estudiante,Grado:e.grado,Grupo:e.grupo||"—",XP:e.xp_total,Nivel:e.nivel||1})),`nexus_top`)} style={{ padding:"6px 10px", background:`${C.accent3}22`, border:`1px solid ${C.accent3}44`, borderRadius:8, color:C.accent3, fontSize:11, cursor:"pointer" }}>
            ⬇️ Excel
          </button>
        </div>
        {top.length>0 ? top.slice(0,15).map((e,i)=>(
          <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", background:C.surface, borderRadius:10, marginBottom:5, border:`1px solid ${C.border}` }}>
            <span style={{ fontFamily:"'Orbitron',monospace", color:i===0?"#ffd700":i===1?"#c0c0c0":i===2?"#cd7f32":C.muted, fontWeight:900, fontSize:11, width:22 }}>#{i+1}</span>
            <div style={{ flex:1, minWidth:0 }}><div style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.nombre_estudiante}</div><div style={{ fontSize:10, color:C.muted }}>G{e.grado}·{e.grupo||"—"}</div></div>
            <div style={{ textAlign:"right", flexShrink:0 }}>
              <div style={{ fontFamily:"'Orbitron',monospace", color:C.accent3, fontWeight:700, fontSize:11 }}>{e.xp_total} XP</div>
              {((xpVal) => { const _bp=[{x:0,n:1.0},{x:25,n:2.0},{x:75,n:3.0},{x:150,n:4.0},{x:250,n:5.0}]; let _nota="1.0"; if(xpVal>=250){_nota="5.0";}else if(xpVal>0){for(let _i=0;_i<_bp.length-1;_i++){if(xpVal>=_bp[_i].x&&xpVal<=_bp[_i+1].x){const _t=(xpVal-_bp[_i].x)/(_bp[_i+1].x-_bp[_i].x);_nota=(Math.round((_bp[_i].n+_t*(_bp[_i+1].n-_bp[_i].n))*10)/10).toFixed(1);break;}}} const _n=parseFloat(_nota); const _c=_n>=4.5?"#10d98a":_n>=4.0?"#22c55e":_n>=3.5?"#eab308":_n>=3.0?"#f97316":"#ef4444"; return <div style={{fontSize:11,fontWeight:800,color:_c}}>{_nota}</div>; })(e.xp_total)}
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
function ProgresoPanel({ user }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtroGrado, setFiltroGrado] = useState("todos");
  const [filtroGrupo, setFiltroGrupo] = useState("todos");
  const [ordenAZ, setOrdenAZ] = useState(false);

  useEffect(() => {
    const params = user?.role === "teacher"
      ? `?docente_id=${user.id}&role=teacher`
      : `?role=admin`;
    fetch(`/api/stats${params}`)
      .then(r=>r.json())
      .then(d=>{ setStats(d); setLoading(false); })
      .catch(()=>setLoading(false));
  }, [user?.id]);

  const grados = stats?.porGrado ? Object.keys(stats.porGrado).sort() : [];
  let estudiantes = stats?.topEstudiantes || [];
  if (filtroGrado!=="todos") estudiantes = estudiantes.filter(e=>e.grado===filtroGrado);
  if (filtroGrupo!=="todos") estudiantes = estudiantes.filter(e=>e.grupo===filtroGrupo);
  if (ordenAZ) estudiantes = [...estudiantes].sort((a,b)=>a.nombre_estudiante.localeCompare(b.nombre_estudiante));

  return (
    <Page title="📊 Progreso Estudiantil">
      {loading && <div style={{ color:C.muted, fontSize:13 }}>⏳ Cargando...</div>}

      {!loading && stats?.sinMisiones && (
        <div style={{ background:`${C.accent2}10`, border:`1px solid ${C.accent2}33`, borderRadius:14, padding:"24px 20px", textAlign:"center", marginTop:16 }}>
          <div style={{ fontSize:32, marginBottom:12 }}>🗺️</div>
          <div style={{ fontSize:16, fontWeight:800, color:C.accent2, marginBottom:8 }}>Aún no tienes misiones creadas</div>
          <div style={{ fontSize:13, color:C.muted, lineHeight:1.7 }}>
            El progreso de tus estudiantes aparecerá aquí cuando trabajen en tus misiones.<br/>
            Ve a <strong style={{color:C.accent}}>Mis Misiones</strong> para crear la primera. 🚀
          </div>
        </div>
      )}

      {!loading && stats && !stats.sinMisiones && <>
        <Card title="📈 Actividad por Grado">
          {grados.length>0?grados.map(g=>{
            const d=stats.porGrado[g]; const mx=Math.max(...grados.map(k=>stats.porGrado[k].xp),1);
            return <div key={g} style={{ marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}><span style={{ fontSize:12, fontWeight:600 }}>Grado {g}</span><span style={{ fontSize:10, color:C.muted }}>{d.count} est. · {d.xp} XP</span></div>
              <div style={{ height:7, background:C.border, borderRadius:4 }}><div style={{ height:"100%", width:`${Math.round(d.xp/mx*100)}%`, background:`linear-gradient(90deg,${C.accent},${C.accent2})`, borderRadius:4 }} /></div>
            </div>;
          }):<div style={{ color:C.muted, fontSize:12 }}>Sin actividad aún.</div>}
        </Card>
        <Card title="🎓 Detalle por Estudiante">
          <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
            <select style={{ ...inp, width:"auto", padding:"6px 10px", fontSize:12 }} value={filtroGrado} onChange={e=>{setFiltroGrado(e.target.value);setFiltroGrupo("todos");}}>
              <option value="todos">Todos los grados</option>{grados.map(g=><option key={g} value={g}>Grado {g}</option>)}
            </select>
            <select style={{ ...inp, width:"auto", padding:"6px 10px", fontSize:12 }} value={filtroGrupo} onChange={e=>setFiltroGrupo(e.target.value)}>
              <option value="todos">Todos los grupos</option>{["1","2","3","4"].map(g=><option key={g} value={g}>Grupo {g}</option>)}
            </select>
            <button onClick={()=>setOrdenAZ(!ordenAZ)} style={{ padding:"6px 10px", background:ordenAZ?`${C.accent2}33`:C.surface, border:`1px solid ${ordenAZ?C.accent2:C.border}`, borderRadius:8, color:ordenAZ?C.accent2:C.muted, fontSize:11, cursor:"pointer" }}>{ordenAZ?"🔤 A→Z":"🏆 XP"}</button>
            <button onClick={()=>downloadExcel(estudiantes.map((e,i)=>({Pos:i+1,Nombre:e.nombre_estudiante,Grado:e.grado,Grupo:e.grupo||"—",XP:e.xp_total,Nivel:e.nivel||1})),`progreso`)} style={{ padding:"6px 10px", background:`${C.accent3}22`, border:`1px solid ${C.accent3}44`, borderRadius:8, color:C.accent3, fontSize:11, cursor:"pointer" }}>⬇️ Excel</button>
          </div>
          {estudiantes.length>0?estudiantes.map((e,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", background:C.surface, borderRadius:10, marginBottom:5, border:`1px solid ${C.border}` }}>
              <span style={{ fontFamily:"'Orbitron',monospace", color:i===0?"#ffd700":i===1?"#c0c0c0":i===2?"#cd7f32":C.muted, fontSize:10, width:22, fontWeight:900 }}>#{i+1}</span>
              <div style={{ flex:1, minWidth:0 }}><div style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.nombre_estudiante}</div><div style={{ fontSize:10, color:C.muted }}>G{e.grado}·Grp{e.grupo||"—"}·Nv{e.nivel||1}</div></div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={{ fontFamily:"'Orbitron',monospace", color:C.accent3, fontWeight:700, fontSize:11 }}>{e.xp_total} XP</div>
                {((xpVal) => { const _bp=[{x:0,n:1.0},{x:25,n:2.0},{x:75,n:3.0},{x:150,n:4.0},{x:250,n:5.0}]; let _nota="1.0"; if(xpVal>=250){_nota="5.0";}else if(xpVal>0){for(let _i=0;_i<_bp.length-1;_i++){if(xpVal>=_bp[_i].x&&xpVal<=_bp[_i+1].x){const _t=(xpVal-_bp[_i].x)/(_bp[_i+1].x-_bp[_i].x);_nota=(Math.round((_bp[_i].n+_t*(_bp[_i+1].n-_bp[_i].n))*10)/10).toFixed(1);break;}}} const _n=parseFloat(_nota); const _c=_n>=4.5?"#10d98a":_n>=4.0?"#22c55e":_n>=3.5?"#eab308":_n>=3.0?"#f97316":"#ef4444"; return <div style={{fontSize:12,fontWeight:800,color:_c}}>{_nota}</div>; })(e.xp_total)}
              </div>
            </div>
          )):<div style={{ color:C.muted, fontSize:12 }}>Sin estudiantes con este filtro.</div>}
        </Card>
      </>}
    </Page>
  );
}

// ═══════════════════════════════════════════════════════════════
// MISIONES PANEL
// ═══════════════════════════════════════════════════════════════
function MisionesPanel({ user, misiones, setMisiones, loadingM }) {
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ title:"", icon:"📻", color:"#f97316", description:"", retos:[] });
  const [retoF, setRetoF] = useState({ title:"", desc:"", stars:1 });
  const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(false); const [deleting, setDeleting] = useState(null);

  const iniciarNueva = () => { setForm({ title:"", icon:"📻", color:"#f97316", description:"", retos:[] }); setEditando("nueva"); };
  const iniciarEditar = (m) => { setForm({ id:m.id, title:m.title, icon:m.icon, color:m.color, description:m.description, retos:m.retos.map(r=>({...r})) }); setEditando(m.id); };
  const agregarReto = () => { if(!retoF.title) return; setForm(p=>({...p,retos:[...p.retos,{id:p.retos.length+1,...retoF}]})); setRetoF({title:"",desc:"",stars:1}); };
  const quitarReto = (idx) => setForm(p=>({...p,retos:p.retos.filter((_,i)=>i!==idx).map((r,i)=>({...r,id:i+1}))}));

  const guardar = async () => {
    if(!form.title||form.retos.length===0) return;
    setSaving(true);
    if(editando==="nueva"){ const n=await createMision(user.id,user.name,{title:form.title,icon:form.icon,color:form.color,description:form.description,retos:form.retos}); if(n) setMisiones(prev=>[...prev,n]); }
    else { const a=await updateMision(user.id,{id:form.id,title:form.title,icon:form.icon,color:form.color,description:form.description,retos:form.retos}); if(a) setMisiones(prev=>prev.map(m=>m.id===form.id?a:m)); }
    setSaving(false); setSaved(true); setTimeout(()=>{setSaved(false);setEditando(null);},1500);
  };
  const eliminar = async (id) => {
    if(!confirm("¿Eliminar esta misión?")) return;
    setDeleting(id); await deleteMision(id,user.id,user.role);
    setMisiones(prev=>prev.filter(m=>m.id!==id)); setDeleting(null);
  };

  if(!editando) return (
    <Page title="🗺️ Gestión de Misiones" desc={user.role==="admin"?"Vista de todas las misiones.":"Solo tú ves y editas tus misiones."}>
      <div style={{ marginBottom:14 }}><Btn onClick={iniciarNueva}>+ Nueva Misión</Btn></div>
      {loadingM&&<div style={{ color:C.muted, fontSize:13 }}>⏳ Cargando misiones...</div>}
      {!loadingM&&misiones.length===0&&<div style={{ color:C.muted, fontSize:13, padding:20, textAlign:"center" }}>¡Crea tu primera misión! 🚀</div>}
      {misiones.map(m=>(
        <div key={m.id} style={{ background:C.card, border:`1px solid ${m.color}44`, borderRadius:14, padding:16, marginBottom:12, display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:32 }}>{m.icon}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:14, fontWeight:700, color:m.color }}>{m.title}</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{m.description}</div>
            <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>{m.retos?.length||0} retos {user.role==="admin"?`· ${m.docente_nombre||"—"}`:""}</div>
          </div>
          <div style={{ display:"flex", gap:6, flexShrink:0 }}>
            {(user.role==="admin"||m.docente_id===user.id)&&<>
              <button onClick={()=>iniciarEditar(m)} style={{ padding:"6px 12px", background:`${C.accent}22`, border:`1px solid ${C.accent}44`, borderRadius:8, color:C.accent, fontSize:11, cursor:"pointer" }}>✏️</button>
              <button onClick={()=>eliminar(m.id)} disabled={deleting===m.id} style={{ padding:"6px 12px", background:"#ff444422", border:"1px solid #ff444444", borderRadius:8, color:"#ff7777", fontSize:11, cursor:"pointer" }}>{deleting===m.id?"...":"🗑️"}</button>
            </>}
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
        <div><div style={lbl}>Color</div><div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>{COLORES_MISION.map(col=><button key={col} onClick={()=>setForm(p=>({...p,color:col}))} style={{ width:30,height:30,borderRadius:"50%",background:col,border:`3px solid ${form.color===col?"#fff":col}`,cursor:"pointer",transform:form.color===col?"scale(1.2)":"scale(1)" }} />)}</div>
          <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:10 }}><span style={{ fontSize:26 }}>{form.icon}</span><span style={{ fontSize:14, fontWeight:700, color:form.color }}>{form.title||"Vista previa"}</span></div>
        </div>
      </Card>
      <Card title="⭐ Retos">
        {form.retos.map((r,i)=>(
          <div key={i} style={{ display:"flex", gap:8, padding:"9px 10px", background:C.surface, borderRadius:8, marginBottom:7, border:`1px solid ${C.border}`, alignItems:"flex-start" }}>
            <span style={{ fontFamily:"'Orbitron',monospace", color:form.color, fontWeight:900, fontSize:12, width:18 }}>{r.id}</span>
            <div style={{ flex:1 }}><div style={{ fontSize:12, fontWeight:600 }}>{r.title} {"⭐".repeat(r.stars)}</div><div style={{ fontSize:11, color:C.muted }}>{r.desc}</div></div>
            <button onClick={()=>quitarReto(i)} style={{ background:"none",border:"none",color:"#ff7777",cursor:"pointer",fontSize:15 }}>✕</button>
          </div>
        ))}
        <div style={{ background:`${C.accent}08`, border:`1px dashed ${C.accent}44`, borderRadius:10, padding:12, marginTop:8 }}>
          <div style={{ fontSize:12, color:C.accent, fontWeight:600, marginBottom:10 }}>+ Agregar reto</div>
          <div style={grid2}>
            <div><div style={lbl}>Título</div><input style={inp} value={retoF.title} onChange={e=>setRetoF(p=>({...p,title:e.target.value}))} /></div>
            <div><div style={lbl}>Dificultad</div><select style={inp} value={retoF.stars} onChange={e=>setRetoF(p=>({...p,stars:Number(e.target.value)}))}>
              <option value={1}>⭐ Básico</option><option value={2}>⭐⭐ Intermedio</option><option value={3}>⭐⭐⭐ Avanzado</option>
            </select></div>
          </div>
          <div style={{ marginTop:8 }}><div style={lbl}>Descripción</div><textarea style={{ ...inp, minHeight:56, resize:"vertical" }} value={retoF.desc} onChange={e=>setRetoF(p=>({...p,desc:e.target.value}))} /></div>
          <button onClick={agregarReto} disabled={!retoF.title} style={{ marginTop:8, padding:"7px 14px", background:`${C.accent3}22`, border:`1px solid ${C.accent3}44`, borderRadius:8, color:C.accent3, fontSize:12, cursor:"pointer" }}>Agregar reto</button>
        </div>
      </Card>
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
      {id:"missions",icon:"🗺️",label:"Misiones"},{id:"users",icon:"👥",label:"Usuarios"},
    ]} />}>
      {tab==="dashboard"&&<DashboardPanel user={user} misiones={misiones} />}
      {tab==="progreso"&&<ProgresoPanel user={user} />}
      {tab==="missions"&&<MisionesPanel user={user} misiones={misiones} setMisiones={setMisiones} loadingM={loadingM} />}
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
      {id:"missions",icon:"🗺️",label:"Mis Misiones"},{id:"config",icon:"⚙️",label:"Mi NEXUS"},{id:"preview",icon:"👁️",label:"Vista previa"},
    ]} />}>
      {tab==="dashboard"&&<DashboardPanel user={user} misiones={misiones} />}
      {tab==="progreso"&&<ProgresoPanel user={user} />}
      {tab==="missions"&&<MisionesPanel user={user} misiones={misiones} setMisiones={setMisiones} loadingM={loadingM} />}
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
  const [tab, setTab] = useState("docentes");
  const [data, setData] = useState({ docentes:[], estudiantes:[] });
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [buscar, setBuscar] = useState("");

  const cargar = () => {
    setLoading(true); setApiError(null);
    fetch("/api/usuarios").then(r=>r.json()).then(d=>{ setData({docentes:d.docentes||[],estudiantes:d.estudiantes||[]}); setLoading(false); }).catch(err=>{ setApiError(err.message); setLoading(false); });
  };
  useEffect(()=>cargar(),[]);

  const eliminar = async (id, tipo, nombre) => {
    if(!confirm(`¿Eliminar a ${nombre}?`)) return;
    setDeleting(id);
    try { const r=await fetch(`/api/usuarios?id=${id}&tipo=${tipo}`,{method:"DELETE"}); const d=await r.json(); if(d.success) cargar(); else alert("Error: "+d.error); } catch(e){ alert("Error: "+e.message); }
    setDeleting(null);
  };

  const lista = tab==="docentes" ? (data.docentes||[]) : (data.estudiantes||[]);
  const filtrada = lista.filter(u => {
    const n=`${u.nombres||""} ${u.apellidos||""}`.toLowerCase();
    return n.includes(buscar.toLowerCase())||(u.email||"").toLowerCase().includes(buscar.toLowerCase())||(u.asignatura||"").toLowerCase().includes(buscar.toLowerCase())||(u.grado||"").includes(buscar);
  });

  return (
    <Page title="👥 Gestión de Usuarios">
      <div style={{ display:"flex", background:C.surface, borderRadius:12, padding:4, marginBottom:18, border:`1px solid ${C.border}`, width:"fit-content", gap:4 }}>
        {[["docentes","📚","Docentes",data.docentes?.length],["estudiantes","🎓","Estudiantes",data.estudiantes?.length]].map(([t,ic,lb,cnt])=>(
          <button key={t} onClick={()=>{setTab(t);setBuscar("");}} style={{ padding:"8px 18px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:12, background:tab===t?`linear-gradient(135deg,${C.accent},${C.accent2})`:"transparent", color:tab===t?"#fff":C.muted }}>
            {ic} {lb} <span style={{ fontSize:11, opacity:0.8 }}>({cnt??0})</span>
          </button>
        ))}
      </div>
      <div style={{ marginBottom:12 }}><input style={{ ...inp, maxWidth:320 }} placeholder="Buscar..." value={buscar} onChange={e=>setBuscar(e.target.value)} /></div>
      {loading&&<div style={{ color:C.muted, fontSize:13 }}>⏳ Cargando...</div>}
      {apiError&&<div style={{ background:"#ff444422", border:"1px solid #ff444444", color:"#ff7777", padding:"10px 14px", borderRadius:8, fontSize:13, marginBottom:12 }}>⚠️ {apiError}</div>}
      {!loading&&(
        <Card title={`${tab==="docentes"?"📚 Docentes":"🎓 Estudiantes"} — ${filtrada.length} resultado${filtrada.length!==1?"s":""}`}>
          {filtrada.length===0&&<div style={{ color:C.muted, fontSize:12 }}>Sin resultados.</div>}
          {filtrada.map(u=>(
            <div key={u.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:C.surface, borderRadius:10, marginBottom:7, border:`1px solid ${C.border}` }}>
              <div style={{ width:36,height:36,borderRadius:"50%",background:tab==="docentes"?`${C.accent2}22`:`${C.accent3}22`,border:`1.5px solid ${tab==="docentes"?C.accent2:C.accent3}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0 }}>{tab==="docentes"?"📚":"🎓"}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.nombres||"—"} {u.apellidos||""}</div>
                <div style={{ fontSize:10, color:C.muted }}>{tab==="docentes"?(u.email||"Sin email")+(u.asignatura?` · ${u.asignatura}`:""):`Grado ${u.grado||"—"} · Grupo ${u.grupo||"—"}`}</div>
              </div>
              <div style={{ fontSize:10, color:C.muted, flexShrink:0 }}>{u.fecha_registro?new Date(u.fecha_registro).toLocaleDateString("es-CO"):"—"}</div>
              <button onClick={()=>eliminar(u.id,tab==="docentes"?"docente":"estudiante",`${u.nombres} ${u.apellidos}`)} disabled={deleting===u.id} style={{ padding:"5px 12px", background:"#ff444422", border:"1px solid #ff444444", borderRadius:8, color:"#ff7777", fontSize:11, cursor:"pointer", flexShrink:0 }}>
                {deleting===u.id?"...":"🗑️"}
              </button>
            </div>
          ))}
        </Card>
      )}
    </Page>
  );
}

// ═══════════════════════════════════════════════════════════════
// STUDENT VIEW — con modo equipo
// ═══════════════════════════════════════════════════════════════
function StudentView({ user, onLogout }) {
  const [tab, setTab] = useState("chat");
  const [mission, setMission] = useState(null);
  const [misiones, setMisiones] = useState([]);
  const [equipo, setEquipo] = useState(null); // { nombre, integrantes:[string] }
  const [showEquipo, setShowEquipo] = useState(false);
  const isMobile = useIsMobile();

  useEffect(()=>{ getMisiones("","student").then(m=>setMisiones(m)); },[]);
  const missionData = misiones.find(m=>m.id===mission);

  return (
    <Layout sidebar={<Sidebar user={user} onLogout={onLogout} tab={tab} setTab={setTab} tabs={[
      {id:"chat",icon:"⬡",label:"NEXUS Chat"},
      {id:"missions",icon:"🗺️",label:"Misiones"},
      {id:"team",icon:"👥",label:"Mi Equipo"},
      {id:"progress",icon:"⭐",label:"Mi Progreso"},
    ]} />}>
      {tab==="chat"&&(
        <div style={{ height:"100%", display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ padding: isMobile?"10px 14px 0":"14px 22px 0", flexShrink:0 }}>
            <h1 style={{ ...ptitle, fontSize: isMobile?16:22, marginBottom:8 }}>NEXUS · Tu compañero de retos</h1>
            <div style={{ display:"flex", gap:7, marginBottom:8, flexWrap:"wrap" }}>
              {mission&&<div style={{ display:"flex", alignItems:"center", gap:7, background:C.card, border:`1px solid ${missionData?.color}44`, borderRadius:10, padding:"6px 10px", fontSize:11, flex:1 }}>
                <span>{missionData?.icon}</span><span>Misión: <strong>{missionData?.title}</strong></span>
                <button style={{ marginLeft:"auto", background:"none", border:"none", color:C.muted, cursor:"pointer" }} onClick={()=>setMission(null)}>✕</button>
              </div>}
              {equipo&&<div style={{ display:"flex", alignItems:"center", gap:6, background:`${C.accent2}15`, border:`1px solid ${C.accent2}44`, borderRadius:10, padding:"6px 10px", fontSize:11, color:C.accent2, cursor:"pointer" }} onClick={()=>setShowEquipo(true)}>
                👥 {equipo.nombre} ({equipo.integrantes.length+1})
              </div>}
              {!mission&&<div style={{ display:"flex", alignItems:"center", gap:5, background:`${C.accent3}15`, border:`1px solid ${C.accent3}44`, borderRadius:10, padding:"6px 10px", fontSize:11, color:C.accent3 }}>💬 Modo libre</div>}
            </div>
          </div>
          <div style={{ flex:1, overflow:"hidden", padding: isMobile?"0 10px 14px":"0 22px 22px" }}>
            <NexusChat
              prompt={buildPrompt("Tecnología e Informática", user.grade||"7-11",
                (mission?`Trabajan en: ${missionData?.title}. `:"")+
                (equipo?`Trabajan en equipo: "${equipo.nombre}" con ${equipo.integrantes.length+1} integrantes. Líder: ${user.name}. Compañeros: ${equipo.integrantes.map(i=>`${i.nombres} ${i.apellidos}`).join(", ")}. Cuando respondas dirígete al equipo completo e incluye preguntas y actividades para que todos participen aunque solo uno tenga el dispositivo.`:"")
              )}
              userName={equipo?`Equipo ${equipo.nombre}`:user.name}
              user={user} misionId={mission} equipo={equipo}
            />
          </div>
        </div>
      )}
      {tab==="missions"&&<Page title="🗺️ Misiones"><MissionMap misiones={misiones} onSelect={id=>{setMission(id);setTab("chat");}} /></Page>}
      {tab==="team"&&<EquipoPanel user={user} equipo={equipo} setEquipo={setEquipo} onIrChat={()=>setTab("chat")} />}
      {tab==="progress"&&<Page title="⭐ Mi Progreso"><InfoBox title={`🎓 ${user.name}`}><Row k="Grado" v={user.grade||"—"} /><Row k="Grupo" v={user.group||"—"} /></InfoBox></Page>}

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
            return (
              <div key={c.id} onClick={() => toggle(c)} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:sel?`${C.accent2}20`:C.surface, borderRadius:10, marginBottom:6, border:`1px solid ${sel?C.accent2:C.border}`, cursor:"pointer", transition:"all .15s" }}>
                <div style={{ width:28,height:28,borderRadius:"50%",background:sel?C.accent2:`${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0,transition:"background .15s" }}>
                  {sel ? "✓" : "🎓"}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:sel?700:400 }}>{c.nombres} {c.apellidos}</div>
                  <div style={{ fontSize:10, color:C.muted }}>Grado {c.grado} · Grupo {c.grupo}</div>
                </div>
                {sel && <span style={{ fontSize:10, color:C.accent2, fontWeight:700 }}>✓ Seleccionado</span>}
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
// NEXUS CHAT
// ═══════════════════════════════════════════════════════════════
function NexusChat({ prompt, userName, compact, user, misionId, equipo }) {
  const isMobile = useIsMobile();
  const [msgs, setMsgs] = useState([{ role:"assistant", content:`¡Bienvenido${equipo?`, equipo **${equipo.nombre}**`:userName?`, ${userName.split(" ")[0]}`:""}! 🚀 Soy **NEXUS**. Te guío con pistas para que TÚ descubras el conocimiento.\n\n💬 **Modo libre:** pregunta sobre tecnología.\n🗺️ **O elige una misión** en el menú. 🎯` }]);
  const [input, setInput] = useState(""); const [loading, setLoading] = useState(false);
  const [xp, setXp] = useState(0); const [xpAnim, setXpAnim] = useState(null);
  const endRef = useRef(null);
  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); },[msgs]);
  const lv=Math.floor(xp/50)+1; const pct=(xp%50)/50*100;
  const addXP = useCallback((n)=>{ setXp(prev=>{ const nx=prev+n; if(user?.id) saveProgress(user,nx,Math.floor(nx/50)+1,misionId,equipo); return nx; }); setXpAnim(n); setTimeout(()=>setXpAnim(null),2000); },[user,misionId,equipo]);
  const send = async txt => {
    const t=txt||input.trim(); if(!t||loading) return;
    setInput("");
    const nm=[...msgs,{role:"user",content:t}]; setMsgs(nm); setLoading(true); addXP(5);
    const reply=await callNexus(nm.map(m=>({role:m.role,content:m.content})),prompt);
    setMsgs(p=>[...p,{role:"assistant",content:reply}]);
    if(/maestría|exacto|correcto|¡así/i.test(reply)) addXP(20);
    setLoading(false);
  };
  const SUGS=["¿Cómo funciona una Radio AM?","¿Qué es la Ley de Ohm?","¿Cómo programo un servo?","¿Para qué sirve el transistor?"];
  return (
    <div style={{ display:"flex", flexDirection:"column", height:compact?400:"100%", background:C.card, border:`1px solid ${C.border}`, borderRadius:16, overflow:"hidden" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 14px", background:C.surface, borderBottom:`1px solid ${C.border}`, position:"relative" }}>
        <span style={{ fontSize:9, fontFamily:"'Orbitron',monospace", color:C.accent, fontWeight:700 }}>NVL {lv}</span>
        <div style={{ flex:1, height:4, background:C.border, borderRadius:2 }}><div style={{ height:"100%", background:`linear-gradient(90deg,${C.accent},${C.accent2})`, width:`${pct}%`, borderRadius:2, transition:"width .5s" }} /></div>
        <span style={{ fontSize:9, color:C.muted, fontFamily:"'Orbitron',monospace" }}>{xp} XP</span>
        {xpAnim&&<span style={{ position:"absolute", right:12, top:-22, fontSize:11, color:C.accent3, fontWeight:700, background:C.card, padding:"2px 7px", borderRadius:7, border:`1px solid ${C.accent3}` }}>+{xpAnim} XP ✨</span>}
      </div>
      <div style={{ flex:1, overflowY:"auto", padding: isMobile?"12px 10px":"16px 14px", display:"flex", flexDirection:"column", gap:12 }}>
        {msgs.map((m,i)=>(
          <div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start", ...(m.role==="user"?{justifyContent:"flex-end",alignSelf:"flex-end"}:{}), maxWidth: isMobile?"92%":"82%" }}>
            {m.role==="assistant"&&<div style={{ width:28,height:28,borderRadius:"50%",background:`${C.accent}15`,border:`1.5px solid ${C.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:C.accent,flexShrink:0 }}>⬡</div>}
            <div style={{ background:m.role==="user"?C.user:C.surface, border:`1px solid ${m.role==="user"?C.accent2+"44":C.border}`, borderRadius:m.role==="user"?"12px 3px 12px 12px":"3px 12px 12px 12px", padding: isMobile?"10px 12px":"11px 14px" }}>
              <div dangerouslySetInnerHTML={{ __html:m.content.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>").replace(/\n/g,"<br/>") }} style={{ fontSize: isMobile?13:13, lineHeight:1.7 }} />
            </div>
            {m.role==="user"&&<div style={{ width:28,height:28,borderRadius:"50%",background:C.user,border:`1.5px solid ${C.accent2}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0 }}>{equipo?"👥":"👤"}</div>}
          </div>
        ))}
        {loading&&<div style={{ display:"flex", gap:8, maxWidth:"82%" }}><div style={{ width:28,height:28,borderRadius:"50%",background:`${C.accent}15`,border:`1.5px solid ${C.accent}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:C.accent }}>⬡</div><div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:"3px 12px 12px 12px",padding:"12px 14px" }}><div style={{ display:"flex", gap:4 }}>{[0,150,300].map(d=><span key={d} style={{ width:6,height:6,borderRadius:"50%",background:C.accent,animation:"pulse 1.2s ease-in-out infinite",display:"inline-block",animationDelay:`${d}ms` }} />)}</div></div></div>}
        {msgs.length===1&&!loading&&<div><div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>💡 Sugerencias:</div><div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>{SUGS.map((q,i)=><button key={i} style={{ background:"transparent",border:`1px solid ${C.border}`,color:C.accent,padding: isMobile?"6px 10px":"6px 12px",borderRadius:20,fontSize:11,cursor:"pointer",fontFamily:"inherit" }} onClick={()=>send(q)}>{q}</button>)}</div></div>}
        <div ref={endRef} />
      </div>
      <div style={{ display:"flex", gap:7, padding: isMobile?"10px":"11px 12px", borderTop:`1px solid ${C.border}`, background:C.surface, alignItems:"flex-end" }}>
        <textarea style={{ flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding: isMobile?"9px 11px":"9px 12px",color:C.text,fontSize:13,resize:"none",fontFamily:"inherit",outline:"none",maxHeight:80 }} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); send(); }}} placeholder={isMobile?"Escribe aquí...":"Pregunta lo que quieras... (Enter para enviar)"} rows={1} />
        <button style={{ width:36,height:36,borderRadius:9,background:`linear-gradient(135deg,${C.accent},${C.accent2})`,border:"none",color:"#fff",fontSize:14,cursor:"pointer",opacity:loading||!input.trim()?0.4:1,flexShrink:0 }} onClick={()=>send()} disabled={loading||!input.trim()}>➤</button>
      </div>
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
      {open===m.id&&<div style={{ marginTop:14,borderTop:`1px solid ${m.color}33`,paddingTop:14 }}>{(m.retos||[]).map(r=>(
        <div key={r.id} style={{ display:"flex",gap:10,padding:"10px 12px",marginBottom:7,background:C.surface,borderRadius:8,borderLeft:`3px solid ${m.color}66` }}>
          <div style={{ fontFamily:"'Orbitron',monospace",fontWeight:900,fontSize:12,color:m.color,width:18 }}>{r.id}</div>
          <div><div style={{ fontSize:12,fontWeight:700,marginBottom:3 }}>{r.title} {"⭐".repeat(r.stars)}</div><div style={{ fontSize:11,color:C.muted }}>{r.desc}</div></div>
        </div>
      ))}</div>}
    </div>
  ))}</div>;
}

// ── Shared components ──
function Layout({ sidebar, children }) {
  const isMobile = useIsMobile();
  return <div style={{ display:"flex", height:"100vh", position:"relative", zIndex:5 }}>{sidebar}<main style={{ flex:1, overflow:"auto", background:C.bg }}>{children}</main></div>;
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
  return <div style={{ padding: isMobile?"16px 14px 80px":"26px", maxWidth:900 }}><h1 style={{ ...ptitle, fontSize: isMobile?18:22 }}>{title}</h1>{desc&&<p style={{ fontSize:12, color:C.muted, marginBottom:18 }}>{desc}</p>}{children}</div>;
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
  @media(max-width:767px){body{overflow:auto;}}
`;
