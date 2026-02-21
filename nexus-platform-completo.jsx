import { useState, useRef, useEffect } from "react";

// ============================================================
// CONFIGURACIÓN — reemplaza con tus claves de Supabase
// ============================================================
const SUPABASE_URL = "https://ahpohesgktkaajptfxcb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ftlag7c_bfSKdrtas9_HCw_GylAuAxz";
const ANTHROPIC_API_KEY = "TU_ANTHROPIC_KEY"; // solo en desarrollo; en prod usar backend

// ============================================================
// DATOS MOCK (funcionan sin Supabase para demostración)
// ============================================================
const MOCK_USERS = [
  { id: "1", email: "fabioortiz37422@sabaneta.edu.co", password: "admin123", role: "admin", name: "Fabio Alberto Ortiz M." },
  { id: "2", email: "docente@sabaneta.edu.co", password: "docente123", role: "teacher", name: "Prof. Ejemplo", subject: "Matemáticas" },
  { id: "3", email: "estudiante@sabaneta.edu.co", password: "est123", role: "student", name: "Juan Pérez", grade: "9°" },
];

// ============================================================
// MAPA DE MISIONES — Guía de retos por unidad
// ============================================================
const MISSION_MAP = [
  {
    id: "radio-am",
    title: "Radio AM",
    icon: "📻",
    color: "#f97316",
    glow: "rgba(249,115,22,0.4)",
    description: "Construye tu propio receptor de Radio AM con materiales básicos",
    retos: [
      { id: 1, title: "¿Qué es una onda?", stars: 1, desc: "Comprende la naturaleza de las ondas electromagnéticas y sus propiedades: amplitud, frecuencia y longitud de onda.", locked: false },
      { id: 2, title: "El espectro de radio", stars: 1, desc: "Explora las frecuencias AM (530–1700 kHz) y qué diferencia una señal AM de una FM.", locked: false },
      { id: 3, title: "Componentes del receptor", stars: 2, desc: "Identifica resistencias, condensador variable, diodo de germanio 1N34A, bobina de ferrita y auricular de alta impedancia.", locked: false },
      { id: 4, title: "La bobina artesanal", stars: 2, desc: "Enrrolla 60 vueltas de alambre de cobre esmaltado en el núcleo de ferrita. Aprende por qué la inductancia capta la señal.", locked: false },
      { id: 5, title: "El detector de envolvente", stars: 3, desc: "Conecta el diodo 1N34A para rectificar la señal portadora y extraer el audio modulado. ¡El corazón del receptor!", locked: false },
      { id: 6, title: "¡Misión completa! Arma tu Radio AM", stars: 3, desc: "Integra todos los componentes en la protoboard, conecta la antena (cable de 1m) y sintoniza una emisora de Medellín.", locked: false },
    ]
  },
  {
    id: "transmisor-fm",
    title: "Transmisor FM",
    icon: "📡",
    color: "#eab308",
    glow: "rgba(234,179,8,0.4)",
    description: "Diseña un transmisor FM de bajo alcance con componentes accesibles",
    retos: [
      { id: 1, title: "¿Cómo viaja tu voz?", stars: 1, desc: "Comprende la modulación de frecuencia (FM): cómo una voz 'monta' sobre una onda portadora de alta frecuencia.", locked: false },
      { id: 2, title: "El oscilador LC", stars: 2, desc: "Aprende cómo la bobina (L) y el condensador (C) generan la frecuencia portadora. Calcula frecuencias con la fórmula de Thomson.", locked: false },
      { id: 3, title: "Transistor amplificador", stars: 2, desc: "Usa el transistor BC547 como amplificador de la señal. Entiende las regiones de operación: corte, activa y saturación.", locked: false },
      { id: 4, title: "La antena irradiadora", stars: 2, desc: "Calcula la longitud ideal de la antena para tu frecuencia objetivo (λ/4). Construye una antena dipolo con alambre.", locked: false },
      { id: 5, title: "¡Transmite tu primera señal!", stars: 3, desc: "Ensambla el circuito completo, ajusta la bobina para sintonizar entre 88–108 MHz y escúchate en un radio FM. Respeta la regulación colombiana (baja potencia).", locked: false },
    ]
  },
  {
    id: "brazo-robotico",
    title: "Brazo Robótico",
    icon: "🦾",
    color: "#22c55e",
    glow: "rgba(34,197,94,0.4)",
    description: "Programa y construye un brazo robótico con Arduino UNO y piezas impresas en 3D",
    retos: [
      { id: 1, title: "Conoce tu Arduino UNO", stars: 1, desc: "Identifica pines digitales, analógicos, PWM, alimentación y GND. Carga tu primer sketch: Blink (LED parpadeante).", locked: false },
      { id: 2, title: "El servomotor SG90", stars: 1, desc: "Conecta un servo al pin PWM. Programa ángulos con la librería Servo.h. Controla posiciones de 0° a 180°.", locked: false },
      { id: 3, title: "Control por potenciómetro", stars: 2, desc: "Lee un potenciómetro con analogRead() y mapea el valor (0–1023) a ángulos del servo. ¡Control analógico real!", locked: false },
      { id: 4, title: "Diseño 3D de las piezas", stars: 2, desc: "En TinkerCAD diseña o modifica: base giratoria, hombro, codo, muñeca y pinza. Exporta en STL para imprimir.", locked: false },
      { id: 5, title: "Impresión y ensamble", stars: 2, desc: "Configura el laminador Cura: capa 0.2mm, relleno 20%, soporte donde sea necesario. Ensambla con tornillos M3 y los servos.", locked: false },
      { id: 6, title: "Secuencia de movimientos", stars: 3, desc: "Programa una secuencia automática: el brazo recoge un objeto, lo mueve y lo deposita. Usa arrays y bucles for.", locked: false },
      { id: 7, title: "¡Brazo autónomo! Control Bluetooth", stars: 3, desc: "Agrega módulo HC-05, descarga una app de control Bluetooth y maneja el brazo desde tu celular. Misión completada.", locked: false },
    ]
  }
];

// ============================================================
// SYSTEM PROMPT dinámico según rol y asignatura
// ============================================================
const buildSystemPrompt = (subject = "Tecnología e Informática", grade = "7-11", teacherContext = "") => `
Eres NEXUS, un compañero de retos académicos para estudiantes de grados ${grade} de la Institución Educativa de Sabaneta, Colombia.
Asignatura actual: ${subject}.
${teacherContext ? `Contexto del docente: ${teacherContext}` : ""}

TU PERSONALIDAD:
- Eres animado, motivador, hablas como guía de aventuras/videojuego
- Usas emojis con moderación para dinamizar el chat
- NUNCA das respuestas directas: siempre guías con pistas y preguntas reflexivas
- Si el estudiante se acerca a la respuesta: "¡Vas por buen camino! 🔥 Ahora piensa en..."
- Llamas a los estudiantes "Explorador" si no sabes su nombre

METODOLOGÍA (siempre):
1. Pregunta primero qué sabe el estudiante sobre el tema
2. Da UNA pista a la vez
3. Usa: "¿Qué pasaría si...?", "¿Recuerdas cuándo vimos...?", "¿Qué tiene en común con...?"
4. Si el estudiante se rinde, da pista más grande pero nunca la respuesta completa
5. Cuando lleguen solos a la respuesta, celebra y suma puntos

SISTEMA DE PUNTOS:
- Por intentarlo: "¡+5 puntos de exploración!"
- Por llegar a la respuesta: "¡+20 puntos de maestría! ⭐"

ÉNFASIS ESPECIAL 2025 (para Tecnología e Informática):
- Circuitos electrónicos: componentes, ley de Ohm, circuitos serie/paralelo
- Radio AM: ondas, bobina de ferrita, diodo 1N34A, condensador variable, detector de envolvente
- Transmisor FM: oscilador LC, transistor BC547, modulación de frecuencia, antena λ/4
- Brazo Robótico con Arduino UNO: servo SG90, librería Servo.h, analogRead, TinkerCAD, impresión 3D, módulo HC-05

Si te preguntan algo fuera de ${subject}, responde: "¡Ese reto está fuera de mi mapa, Explorador! 🗺️ Puedo ayudarte con ${subject}."
Siempre responde en español colombiano, cálido y motivador.
`;

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function NexusPlatform() {
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState("login"); // login | admin | teacher | student
  const [loginError, setLoginError] = useState("");

  const handleLogin = (email, password) => {
    const user = MOCK_USERS.find(u => u.email === email && u.password === password);
    if (user) {
      setCurrentUser(user);
      setView(user.role === "admin" ? "admin" : user.role === "teacher" ? "teacher" : "student");
      setLoginError("");
    } else {
      setLoginError("Credenciales incorrectas. Verifica tu correo y contraseña.");
    }
  };

  const handleLogout = () => { setCurrentUser(null); setView("login"); };

  return (
    <div style={s.root}>
      <div style={s.gridBg} />
      {view === "login" && <LoginView onLogin={handleLogin} error={loginError} />}
      {view === "admin" && <AdminView user={currentUser} onLogout={handleLogout} />}
      {view === "teacher" && <TeacherView user={currentUser} onLogout={handleLogout} />}
      {view === "student" && <StudentView user={currentUser} onLogout={handleLogout} />}
      <style>{globalCSS}</style>
    </div>
  );
}

// ============================================================
// LOGIN VIEW
// ============================================================
function LoginView({ onLogin, error }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  return (
    <div style={s.loginContainer}>
      <div style={s.loginCard}>
        <div style={s.loginLogo}>
          <span style={s.loginLogoIcon}>⬡</span>
          <div>
            <div style={s.loginTitle}>NEXUS</div>
            <div style={s.loginSubtitle}>Plataforma Educativa · I.E. Sabaneta</div>
          </div>
        </div>

        <div style={s.loginForm}>
          <div style={s.inputGroup}>
            <label style={s.label}>Correo institucional</label>
            <input
              style={s.textInput}
              type="email"
              placeholder="usuario@sabaneta.edu.co"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && onLogin(email, password)}
            />
          </div>
          <div style={s.inputGroup}>
            <label style={s.label}>Contraseña</label>
            <div style={{ position: "relative" }}>
              <input
                style={s.textInput}
                type={showPass ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && onLogin(email, password)}
              />
              <button style={s.eyeBtn} onClick={() => setShowPass(!showPass)}>
                {showPass ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          {error && <div style={s.errorMsg}>{error}</div>}

          <button style={s.loginBtn} onClick={() => onLogin(email, password)}>
            Ingresar al sistema ➤
          </button>

          <div style={s.loginHint}>
            <div style={s.hintTitle}>Cuentas de prueba:</div>
            <div style={s.hintRow}>👑 Admin: fabioortiz37422@sabaneta.edu.co / admin123</div>
            <div style={s.hintRow}>📚 Docente: docente@sabaneta.edu.co / docente123</div>
            <div style={s.hintRow}>🎓 Estudiante: estudiante@sabaneta.edu.co / est123</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ADMIN VIEW
// ============================================================
function AdminView({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [users, setUsers] = useState(MOCK_USERS);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "student", grade: "", subject: "" });
  const [saved, setSaved] = useState(false);

  const stats = {
    students: users.filter(u => u.role === "student").length,
    teachers: users.filter(u => u.role === "teacher").length,
    admins: users.filter(u => u.role === "admin").length,
  };

  const addUser = () => {
    if (!newUser.name || !newUser.email) return;
    setUsers([...users, { ...newUser, id: Date.now().toString() }]);
    setNewUser({ name: "", email: "", password: "", role: "student", grade: "", subject: "" });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={s.appLayout}>
      <Sidebar user={user} onLogout={onLogout} activeTab={activeTab} setActiveTab={setActiveTab}
        tabs={[
          { id: "dashboard", icon: "⬡", label: "Dashboard" },
          { id: "users", icon: "👥", label: "Usuarios" },
          { id: "subjects", icon: "📚", label: "Asignaturas" },
          { id: "missions", icon: "🗺️", label: "Misiones" },
        ]}
      />
      <main style={s.mainContent}>
        {activeTab === "dashboard" && (
          <div style={s.contentArea}>
            <h1 style={s.pageTitle}>Panel de Administración</h1>
            <p style={s.pageDesc}>Bienvenido, {user.name}. Gestiona toda la plataforma NEXUS.</p>
            <div style={s.statsGrid}>
              {[
                { label: "Estudiantes", value: stats.students, icon: "🎓", color: C.accent },
                { label: "Docentes", value: stats.teachers, icon: "📚", color: C.accent2 },
                { label: "Administradores", value: stats.admins, icon: "👑", color: C.accent3 },
                { label: "Misiones activas", value: 3, icon: "🗺️", color: "#f97316" },
              ].map((stat, i) => (
                <div key={i} style={{ ...s.statCard, borderColor: stat.color + "44" }}>
                  <div style={s.statIcon}>{stat.icon}</div>
                  <div style={{ ...s.statValue, color: stat.color }}>{stat.value}</div>
                  <div style={s.statLabel}>{stat.label}</div>
                </div>
              ))}
            </div>

            <div style={s.infoBox}>
              <div style={s.infoTitle}>🔌 Conexión Base de Datos</div>
              <div style={s.infoRow}><span style={s.infoKey}>Tipo:</span> Supabase (PostgreSQL cloud)</div>
              <div style={s.infoRow}><span style={s.infoKey}>Estado:</span> <span style={{ color: "#22c55e" }}>● Modo demo (sin Supabase configurado)</span></div>
              <div style={s.infoRow}><span style={s.infoKey}>BD original:</span> SQLite local → exportar CSV → importar en Supabase</div>
              <div style={s.infoRow}><span style={s.infoKey}>URL:</span> Configura en SUPABASE_URL al inicio del código</div>
            </div>
          </div>
        )}

        {activeTab === "users" && (
          <div style={s.contentArea}>
            <h1 style={s.pageTitle}>Gestión de Usuarios</h1>
            <div style={s.card}>
              <div style={s.cardTitle}>➕ Agregar usuario</div>
              <div style={s.formGrid}>
                <input style={s.textInput} placeholder="Nombre completo" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} />
                <input style={s.textInput} placeholder="Correo institucional" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
                <input style={s.textInput} placeholder="Contraseña temporal" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
                <select style={s.textInput} value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
                  <option value="student">Estudiante</option>
                  <option value="teacher">Docente</option>
                  <option value="admin">Administrador</option>
                </select>
                {newUser.role === "student" && (
                  <input style={s.textInput} placeholder="Grado (ej: 9°)" value={newUser.grade} onChange={e => setNewUser({...newUser, grade: e.target.value})} />
                )}
                {newUser.role === "teacher" && (
                  <input style={s.textInput} placeholder="Asignatura" value={newUser.subject} onChange={e => setNewUser({...newUser, subject: e.target.value})} />
                )}
              </div>
              <button style={s.actionBtn} onClick={addUser}>
                {saved ? "✅ ¡Guardado!" : "Agregar usuario"}
              </button>
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}>👥 Usuarios registrados</div>
              <div style={s.userTable}>
                {users.map(u => (
                  <div key={u.id} style={s.userRow}>
                    <span style={s.userAvatar}>{u.role === "admin" ? "👑" : u.role === "teacher" ? "📚" : "🎓"}</span>
                    <div style={s.userInfo}>
                      <div style={s.userName}>{u.name}</div>
                      <div style={s.userEmail}>{u.email}</div>
                    </div>
                    <span style={{ ...s.roleBadge, background: u.role === "admin" ? C.accent2 + "33" : u.role === "teacher" ? C.accent + "33" : C.accent3 + "33", color: u.role === "admin" ? C.accent2 : u.role === "teacher" ? C.accent : C.accent3 }}>
                      {u.role === "admin" ? "Admin" : u.role === "teacher" ? "Docente" : `Estudiante ${u.grade || ""}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "missions" && (
          <div style={s.contentArea}>
            <h1 style={s.pageTitle}>Mapa de Misiones 2025</h1>
            <p style={s.pageDesc}>Énfasis: Electrónica y Robótica · Tecnología e Informática</p>
            {MISSION_MAP.map(mission => (
              <div key={mission.id} style={{ ...s.card, borderColor: mission.color + "44" }}>
                <div style={s.missionCardHeader}>
                  <span style={{ fontSize: 28 }}>{mission.icon}</span>
                  <div>
                    <div style={{ ...s.cardTitle, color: mission.color }}>{mission.title}</div>
                    <div style={s.pageDesc}>{mission.description}</div>
                  </div>
                  <span style={s.retosCount}>{mission.retos.length} retos</span>
                </div>
                {mission.retos.map(r => (
                  <div key={r.id} style={s.retoRow}>
                    <span style={{ color: mission.color, fontWeight: 700, width: 24 }}>{r.id}</span>
                    <div style={s.retoInfo}>
                      <div style={s.retoTitle}>{r.title} {"⭐".repeat(r.stars)}</div>
                      <div style={s.retoDesc}>{r.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {activeTab === "subjects" && (
          <div style={s.contentArea}>
            <h1 style={s.pageTitle}>Asignaturas configuradas</h1>
            <p style={s.pageDesc}>Cada docente puede personalizar el contexto de NEXUS para su materia.</p>
            {["Tecnología e Informática", "Matemáticas", "Ciencias Naturales"].map((sub, i) => (
              <div key={i} style={s.card}>
                <div style={s.cardTitle}>{sub}</div>
                <div style={s.pageDesc}>Docente asignado · NEXUS activo</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================================
// TEACHER VIEW
// ============================================================
function TeacherView({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState("config");
  const [config, setConfig] = useState({
    subject: user.subject || "",
    grade: "7-11",
    topics: "",
    methodology: "",
    tone: "motivador",
  });
  const [saved, setSaved] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const saveConfig = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={s.appLayout}>
      <Sidebar user={user} onLogout={onLogout} activeTab={activeTab} setActiveTab={setActiveTab}
        tabs={[
          { id: "config", icon: "⚙️", label: "Mi NEXUS" },
          { id: "missions", icon: "🗺️", label: "Ver misiones" },
          { id: "preview", icon: "👁️", label: "Vista previa" },
        ]}
      />
      <main style={s.mainContent}>
        {activeTab === "config" && (
          <div style={s.contentArea}>
            <h1 style={s.pageTitle}>Configura NEXUS para tu asignatura</h1>
            <p style={s.pageDesc}>NEXUS usará este contexto para guiar a los estudiantes en tu materia.</p>

            <div style={s.card}>
              <div style={s.cardTitle}>📚 Información de la asignatura</div>
              <div style={s.formGrid}>
                <div style={s.inputGroup}>
                  <label style={s.label}>Nombre de la asignatura</label>
                  <input style={s.textInput} value={config.subject} onChange={e => setConfig({...config, subject: e.target.value})} placeholder="Ej: Matemáticas" />
                </div>
                <div style={s.inputGroup}>
                  <label style={s.label}>Grados que dictás</label>
                  <input style={s.textInput} value={config.grade} onChange={e => setConfig({...config, grade: e.target.value})} placeholder="Ej: 8° y 9°" />
                </div>
              </div>
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}>📋 Temáticas del periodo</div>
              <div style={s.inputGroup}>
                <label style={s.label}>Temas que estás trabajando actualmente</label>
                <textarea style={{ ...s.textInput, minHeight: 100, resize: "vertical" }}
                  value={config.topics}
                  onChange={e => setConfig({...config, topics: e.target.value})}
                  placeholder="Ej: Ecuaciones de primer grado, sistemas de ecuaciones, inecuaciones..."
                />
              </div>
              <div style={s.inputGroup}>
                <label style={s.label}>Enfoque pedagógico o metodología</label>
                <textarea style={{ ...s.textInput, minHeight: 80, resize: "vertical" }}
                  value={config.methodology}
                  onChange={e => setConfig({...config, methodology: e.target.value})}
                  placeholder="Ej: Aprendizaje basado en problemas. Primero exploración, luego formalización..."
                />
              </div>
              <div style={s.inputGroup}>
                <label style={s.label}>Tono de NEXUS para tu clase</label>
                <select style={s.textInput} value={config.tone} onChange={e => setConfig({...config, tone: e.target.value})}>
                  <option value="motivador">Motivador y entusiasta</option>
                  <option value="formal">Formal y estructurado</option>
                  <option value="socrático">Socrático (solo preguntas)</option>
                  <option value="gamificado">Gamificado extremo (aventura)</option>
                </select>
              </div>
            </div>

            <button style={s.actionBtn} onClick={saveConfig}>
              {saved ? "✅ ¡Configuración guardada!" : "Guardar configuración de NEXUS"}
            </button>

            <div style={s.infoBox}>
              <div style={s.infoTitle}>💡 ¿Cómo funciona?</div>
              <div style={s.pageDesc}>NEXUS usará tu configuración como contexto. Los estudiantes verán un NEXUS especializado en {config.subject || "tu asignatura"} que guía con pistas según tus temas del periodo.</div>
            </div>
          </div>
        )}

        {activeTab === "missions" && (
          <div style={s.contentArea}>
            <h1 style={s.pageTitle}>Mapa de Misiones Tecnología 2025</h1>
            <MissionMapView />
          </div>
        )}

        {activeTab === "preview" && (
          <div style={s.contentArea}>
            <h1 style={s.pageTitle}>Vista previa del chat estudiantil</h1>
            <p style={s.pageDesc}>Así verán NEXUS tus estudiantes con tu configuración actual.</p>
            <NexusChat
              systemPrompt={buildSystemPrompt(config.subject || "tu asignatura", config.grade, config.topics)}
              userName="Explorador"
              compact
            />
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================================
// STUDENT VIEW
// ============================================================
function StudentView({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState("chat");
  const [activeMission, setActiveMission] = useState(null);

  return (
    <div style={s.appLayout}>
      <Sidebar user={user} onLogout={onLogout} activeTab={activeTab} setActiveTab={setActiveTab}
        tabs={[
          { id: "chat", icon: "⬡", label: "NEXUS Chat" },
          { id: "missions", icon: "🗺️", label: "Mis Misiones" },
          { id: "progress", icon: "⭐", label: "Mi Progreso" },
        ]}
      />
      <main style={s.mainContent}>
        {activeTab === "chat" && (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 24px 0", flexShrink: 0 }}>
              <h1 style={s.pageTitle}>NEXUS · Tu compañero de retos</h1>
              {activeMission && (
                <div style={{ ...s.missionBanner, borderColor: MISSION_MAP.find(m => m.id === activeMission)?.color + "44" }}>
                  <span>{MISSION_MAP.find(m => m.id === activeMission)?.icon}</span>
                  <span>Misión activa: <strong>{MISSION_MAP.find(m => m.id === activeMission)?.title}</strong></span>
                  <button style={s.clearMissionBtn} onClick={() => setActiveMission(null)}>✕</button>
                </div>
              )}
            </div>
            <div style={{ flex: 1, overflow: "hidden", padding: "0 24px 24px" }}>
              <NexusChat
                systemPrompt={buildSystemPrompt("Tecnología e Informática", user.grade || "7-11",
                  activeMission ? `El estudiante está trabajando en la misión: ${MISSION_MAP.find(m => m.id === activeMission)?.title}. Guíalo específicamente por esa unidad.` : "")}
                userName={user.name}
              />
            </div>
          </div>
        )}

        {activeTab === "missions" && (
          <div style={s.contentArea}>
            <h1 style={s.pageTitle}>🗺️ Mapa de Misiones 2025</h1>
            <p style={s.pageDesc}>Elige una misión y NEXUS te guiará reto por reto. ¡Tú decides el ritmo!</p>
            <MissionMapView onSelectMission={(id) => { setActiveMission(id); setActiveTab("chat"); }} />
          </div>
        )}

        {activeTab === "progress" && (
          <div style={s.contentArea}>
            <h1 style={s.pageTitle}>⭐ Mi Progreso</h1>
            <div style={s.card}>
              <div style={s.statsGrid}>
                {[
                  { label: "Nivel", value: "3", icon: "🏆", color: C.accent },
                  { label: "XP Total", value: "145", icon: "⭐", color: "#eab308" },
                  { label: "Retos completados", value: "7", icon: "✅", color: C.accent3 },
                  { label: "Misiones iniciadas", value: "2", icon: "🗺️", color: "#f97316" },
                ].map((stat, i) => (
                  <div key={i} style={{ ...s.statCard, borderColor: stat.color + "44" }}>
                    <div style={s.statIcon}>{stat.icon}</div>
                    <div style={{ ...s.statValue, color: stat.color }}>{stat.value}</div>
                    <div style={s.statLabel}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={s.infoBox}>
              <div style={s.infoTitle}>🎓 Estudiante: {user.name}</div>
              <div style={s.infoRow}><span style={s.infoKey}>Grado:</span> {user.grade || "Por asignar"}</div>
              <div style={s.infoRow}><span style={s.infoKey}>Correo:</span> {user.email}</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================================
// NEXUS CHAT COMPONENT
// ============================================================
function NexusChat({ systemPrompt, userName, compact }) {
  const [messages, setMessages] = useState([{
    role: "assistant",
    content: `¡Bienvenido${userName ? `, ${userName.split(" ")[0]}` : ""}! 🚀 Soy **NEXUS**, tu compañero de retos. No te daré las respuestas directas... ¡eso sería muy aburrido! Te guiaré con pistas para que TÚ descubras el conocimiento. ¿Listo para tu misión? 🎯`
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [xp, setXp] = useState(0);
  const [xpAnim, setXpAnim] = useState(null);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const addXP = (amount) => {
    setXp(p => p + amount);
    setXpAnim(amount);
    setTimeout(() => setXpAnim(null), 2000);
  };

  const send = async (text) => {
    const t = text || input.trim();
    if (!t || loading) return;
    setInput("");
    const newMsgs = [...messages, { role: "user", content: t }];
    setMessages(newMsgs);
    setLoading(true);
    addXP(5);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: systemPrompt,
          messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "Error al conectar con NEXUS.";
      setMessages(p => [...p, { role: "assistant", content: reply }]);
      if (reply.includes("maestría") || reply.includes("Exacto") || reply.includes("correcto")) addXP(20);
    } catch {
      setMessages(p => [...p, { role: "assistant", content: "⚠️ Error de conexión. Verifica la API Key de Anthropic en el código." }]);
    }
    setLoading(false);
  };

  const SUGGESTIONS = [
    "¿Cómo funciona una Radio AM?",
    "¿Qué es la Ley de Ohm?",
    "¿Cómo programo un servo con Arduino?",
    "¿Qué es un transistor?",
  ];

  const level = Math.floor(xp / 50) + 1;
  const pct = ((xp % 50) / 50) * 100;

  return (
    <div style={{ ...s.chatWrapper, ...(compact ? { height: 400 } : {}) }}>
      {/* XP bar */}
      <div style={s.chatXpBar}>
        <span style={s.chatXpLabel}>NVL {level}</span>
        <div style={s.chatProgressTrack}><div style={{ ...s.chatProgressFill, width: `${pct}%` }} /></div>
        <span style={s.chatXpVal}>{xp} XP</span>
        {xpAnim && <span style={s.chatXpPop}>+{xpAnim} XP ✨</span>}
      </div>

      {/* Messages */}
      <div style={s.chatMessages}>
        {messages.map((m, i) => (
          <div key={i} style={m.role === "user" ? s.userRow : s.assistantRow}>
            {m.role === "assistant" && <div style={s.avatar}>⬡</div>}
            <div style={m.role === "user" ? s.userBubble : s.assistantBubble}>
              <div dangerouslySetInnerHTML={{ __html: m.content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br/>") }} style={s.bubbleText} />
            </div>
            {m.role === "user" && <div style={s.userAvatar}>👤</div>}
          </div>
        ))}
        {loading && (
          <div style={s.assistantRow}>
            <div style={s.avatar}>⬡</div>
            <div style={s.assistantBubble}>
              <div style={s.typingDots}>
                <span style={{ ...s.dot, animationDelay: "0ms" }} />
                <span style={{ ...s.dot, animationDelay: "150ms" }} />
                <span style={{ ...s.dot, animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        {messages.length === 1 && (
          <div style={s.suggestionsWrap}>
            {SUGGESTIONS.map((q, i) => (
              <button key={i} style={s.suggestionBtn} onClick={() => send(q)}>{q}</button>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={s.chatInputRow}>
        <textarea
          style={s.chatInput}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }}}
          placeholder="Escribe tu pregunta o reto... (Enter para enviar)"
          rows={1}
        />
        <button style={{ ...s.sendBtn, opacity: loading || !input.trim() ? 0.4 : 1 }} onClick={send} disabled={loading || !input.trim()}>
          ➤
        </button>
      </div>
    </div>
  );
}

// ============================================================
// MISSION MAP VIEW
// ============================================================
function MissionMapView({ onSelectMission }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div>
      {MISSION_MAP.map(mission => (
        <div key={mission.id} style={{ ...s.card, borderColor: expanded === mission.id ? mission.color + "88" : mission.color + "33", cursor: "pointer", transition: "all 0.3s" }}
          onClick={() => setExpanded(expanded === mission.id ? null : mission.id)}>
          <div style={s.missionCardHeader}>
            <span style={{ fontSize: 36, filter: `drop-shadow(0 0 12px ${mission.glow})` }}>{mission.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ ...s.cardTitle, color: mission.color }}>{mission.title}</div>
              <div style={s.pageDesc}>{mission.description}</div>
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                {mission.retos.map(r => (
                  <span key={r.id} style={{ ...s.retoMini, background: mission.color + "22", color: mission.color }}>
                    {"⭐".repeat(r.stars)}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
              <span style={{ ...s.retosCount, background: mission.color + "22", color: mission.color }}>
                {mission.retos.length} retos
              </span>
              {onSelectMission && (
                <button style={{ ...s.actionBtn, padding: "6px 14px", fontSize: 12, background: mission.color }}
                  onClick={e => { e.stopPropagation(); onSelectMission(mission.id); }}>
                  Iniciar con NEXUS ➤
                </button>
              )}
            </div>
          </div>

          {expanded === mission.id && (
            <div style={{ marginTop: 16, borderTop: `1px solid ${mission.color}33`, paddingTop: 16 }}>
              {mission.retos.map(r => (
                <div key={r.id} style={{ ...s.retoRow, borderLeft: `3px solid ${mission.color}66` }}>
                  <div style={{ ...s.retoNumber, color: mission.color }}>{r.id}</div>
                  <div style={s.retoInfo}>
                    <div style={s.retoTitle}>{r.title} <span style={{ color: "#eab308" }}>{"⭐".repeat(r.stars)}</span></div>
                    <div style={s.retoDesc}>{r.desc}</div>
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

// ============================================================
// SIDEBAR COMPONENT
// ============================================================
function Sidebar({ user, onLogout, tabs, activeTab, setActiveTab }) {
  return (
    <aside style={s.sidebar}>
      <div style={s.sidebarTop}>
        <div style={s.sidebarLogo}>
          <span style={s.sidebarLogoIcon}>⬡</span>
          <span style={s.sidebarLogoText}>NEXUS</span>
        </div>
        <div style={s.sidebarUser}>
          <div style={s.sidebarUserAvatar}>
            {user.role === "admin" ? "👑" : user.role === "teacher" ? "📚" : "🎓"}
          </div>
          <div>
            <div style={s.sidebarUserName}>{user.name.split(" ")[0]}</div>
            <div style={s.sidebarUserRole}>
              {user.role === "admin" ? "Administrador" : user.role === "teacher" ? `Docente · ${user.subject || ""}` : `Estudiante · ${user.grade || ""}`}
            </div>
          </div>
        </div>
      </div>

      <nav style={s.nav}>
        {tabs.map(tab => (
          <button key={tab.id} style={{ ...s.navItem, ...(activeTab === tab.id ? s.navItemActive : {}) }}
            onClick={() => setActiveTab(tab.id)}>
            <span style={s.navIcon}>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <button style={s.logoutBtn} onClick={onLogout}>← Salir</button>
    </aside>
  );
}

// ============================================================
// DESIGN TOKENS
// ============================================================
const C = {
  bg: "#070d1a",
  surface: "#0d1526",
  card: "#111e33",
  border: "#1a3050",
  accent: "#00c8ff",
  accent2: "#8b5cf6",
  accent3: "#10d98a",
  text: "#e2e8f0",
  textMuted: "#4a6080",
  user: "#162040",
};

// ============================================================
// STYLES
// ============================================================
const s = {
  root: { fontFamily: "'Syne', 'Inter', sans-serif", background: C.bg, color: C.text, height: "100vh", overflow: "hidden", position: "relative" },
  gridBg: { position: "fixed", inset: 0, backgroundImage: `linear-gradient(rgba(0,200,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,200,255,0.025) 1px, transparent 1px)`, backgroundSize: "36px 36px", pointerEvents: "none", zIndex: 0 },

  // Layout
  appLayout: { display: "flex", height: "100vh", position: "relative", zIndex: 5 },
  mainContent: { flex: 1, overflow: "auto", background: C.bg },
  contentArea: { padding: 28, maxWidth: 900 },

  // Sidebar
  sidebar: { width: 220, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0, zIndex: 10 },
  sidebarTop: { padding: "20px 16px", borderBottom: `1px solid ${C.border}` },
  sidebarLogo: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16 },
  sidebarLogoIcon: { fontSize: 22, color: C.accent, filter: `drop-shadow(0 0 6px ${C.accent})` },
  sidebarLogoText: { fontFamily: "'Orbitron', monospace", fontSize: 16, fontWeight: 900, color: C.accent, letterSpacing: 2 },
  sidebarUser: { display: "flex", alignItems: "center", gap: 10 },
  sidebarUserAvatar: { width: 36, height: 36, borderRadius: "50%", background: C.card, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 },
  sidebarUserName: { fontSize: 13, fontWeight: 600, color: C.text },
  sidebarUserRole: { fontSize: 10, color: C.textMuted, marginTop: 1 },

  nav: { flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2 },
  navItem: { width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "transparent", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer", textAlign: "left", transition: "all 0.15s" },
  navItemActive: { background: `${C.accent}15`, color: C.accent, borderLeft: `2px solid ${C.accent}` },
  navIcon: { fontSize: 16, width: 20, textAlign: "center" },
  logoutBtn: { margin: "12px 8px", padding: "10px 12px", background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 10, cursor: "pointer", fontSize: 12 },

  // Login
  loginContainer: { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", position: "relative", zIndex: 5 },
  loginCard: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 36, width: "100%", maxWidth: 440, boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(0,200,255,0.05)` },
  loginLogo: { display: "flex", alignItems: "center", gap: 14, marginBottom: 28 },
  loginLogoIcon: { fontSize: 42, color: C.accent, filter: `drop-shadow(0 0 12px ${C.accent})` },
  loginTitle: { fontFamily: "'Orbitron', monospace", fontSize: 26, fontWeight: 900, color: C.accent, letterSpacing: 3 },
  loginSubtitle: { fontSize: 11, color: C.textMuted, letterSpacing: 1, marginTop: 3 },
  loginForm: { display: "flex", flexDirection: "column", gap: 16 },
  loginBtn: { padding: "13px 20px", background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`, border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", letterSpacing: 0.5, boxShadow: `0 6px 20px rgba(0,200,255,0.3)` },
  errorMsg: { background: "#ff4444" + "22", border: `1px solid #ff4444` + "44", color: "#ff7777", padding: "10px 14px", borderRadius: 8, fontSize: 13 },
  loginHint: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginTop: 4 },
  hintTitle: { fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 },
  hintRow: { fontSize: 11, color: C.textMuted, padding: "3px 0", lineHeight: 1.6 },
  eyeBtn: { position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14 },

  // Cards
  card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14 },

  // Forms
  inputGroup: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 },
  label: { fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 },
  textInput: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 14px", color: C.text, fontSize: 13, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 },
  actionBtn: { padding: "11px 20px", background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" },

  // Stats
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 },
  statCard: { background: C.surface, border: `1px solid`, borderRadius: 12, padding: 16, textAlign: "center" },
  statIcon: { fontSize: 22, marginBottom: 8 },
  statValue: { fontSize: 28, fontWeight: 900, fontFamily: "'Orbitron', monospace" },
  statLabel: { fontSize: 11, color: C.textMuted, marginTop: 4 },

  // Info box
  infoBox: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginTop: 16 },
  infoTitle: { fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 10 },
  infoRow: { fontSize: 12, color: C.textMuted, padding: "4px 0", display: "flex", gap: 8 },
  infoKey: { color: C.text, fontWeight: 600, minWidth: 100 },

  // Users table
  userTable: { display: "flex", flexDirection: "column", gap: 8 },
  userRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: C.surface, borderRadius: 10, border: `1px solid ${C.border}` },
  userAvatar: { fontSize: 20, width: 32, textAlign: "center" },
  userInfo: { flex: 1 },
  userName: { fontSize: 13, fontWeight: 600, color: C.text },
  userEmail: { fontSize: 11, color: C.textMuted },
  roleBadge: { padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 },

  // Page typography
  pageTitle: { fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 6, fontFamily: "'Syne', sans-serif" },
  pageDesc: { fontSize: 13, color: C.textMuted, marginBottom: 20, lineHeight: 1.6 },

  // Mission map
  missionCardHeader: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 4 },
  retosCount: { padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: C.surface, whiteSpace: "nowrap", flexShrink: 0 },
  retoRow: { display: "flex", gap: 12, padding: "12px 14px", marginBottom: 8, background: C.surface, borderRadius: 8, alignItems: "flex-start" },
  retoNumber: { fontFamily: "'Orbitron', monospace", fontWeight: 900, fontSize: 14, flexShrink: 0, width: 20 },
  retoInfo: { flex: 1 },
  retoTitle: { fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 },
  retoDesc: { fontSize: 12, color: C.textMuted, lineHeight: 1.6 },
  retoMini: { padding: "2px 6px", borderRadius: 4, fontSize: 10 },
  missionBanner: { display: "flex", alignItems: "center", gap: 10, background: C.card, border: `1px solid`, borderRadius: 10, padding: "8px 14px", marginBottom: 12, fontSize: 13 },
  clearMissionBtn: { marginLeft: "auto", background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 14 },

  // Chat
  chatWrapper: { display: "flex", flexDirection: "column", height: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" },
  chatXpBar: { display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", background: C.surface, borderBottom: `1px solid ${C.border}`, position: "relative" },
  chatXpLabel: { fontSize: 10, fontFamily: "'Orbitron', monospace", color: C.accent, fontWeight: 700 },
  chatProgressTrack: { flex: 1, height: 4, background: C.border, borderRadius: 2, overflow: "hidden" },
  chatProgressFill: { height: "100%", background: `linear-gradient(90deg, ${C.accent}, ${C.accent2})`, borderRadius: 2, transition: "width 0.5s" },
  chatXpVal: { fontSize: 10, color: C.textMuted, fontFamily: "'Orbitron', monospace" },
  chatXpPop: { position: "absolute", right: 16, top: -24, fontSize: 12, color: C.accent3, fontWeight: 700, background: C.card, padding: "3px 8px", borderRadius: 8, border: `1px solid ${C.accent3}` },

  chatMessages: { flex: 1, overflowY: "auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 14, scrollbarWidth: "thin" },
  assistantRow: { display: "flex", gap: 10, alignItems: "flex-start", maxWidth: "82%", animation: "fadeUp 0.3s ease" },
  userRow: { display: "flex", gap: 10, alignItems: "flex-start", justifyContent: "flex-end", alignSelf: "flex-end", maxWidth: "82%", animation: "fadeUp 0.3s ease" },
  avatar: { width: 32, height: 32, borderRadius: "50%", background: `${C.accent}15`, border: `1.5px solid ${C.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: C.accent, flexShrink: 0, boxShadow: `0 0 10px ${C.accent}33` },
  userAvatar: { width: 32, height: 32, borderRadius: "50%", background: C.user, border: `1.5px solid ${C.accent2}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 },
  assistantBubble: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: "4px 14px 14px 14px", padding: "12px 16px", boxShadow: "0 4px 16px rgba(0,0,0,0.3)" },
  userBubble: { background: C.user, border: `1px solid ${C.accent2}44`, borderRadius: "14px 4px 14px 14px", padding: "12px 16px" },
  bubbleText: { fontSize: 13, lineHeight: 1.75, color: C.text },
  typingDots: { display: "flex", gap: 5, padding: "4px 0", alignItems: "center" },
  dot: { width: 7, height: 7, borderRadius: "50%", background: C.accent, animation: "pulse 1.2s ease-in-out infinite", display: "inline-block" },
  suggestionsWrap: { display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 4 },
  suggestionBtn: { background: "transparent", border: `1px solid ${C.border}`, color: C.accent, padding: "7px 13px", borderRadius: 20, fontSize: 11, cursor: "pointer", fontFamily: "inherit" },

  chatInputRow: { display: "flex", gap: 8, padding: "12px 14px", borderTop: `1px solid ${C.border}`, background: C.surface, alignItems: "flex-end" },
  chatInput: { flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", color: C.text, fontSize: 13, resize: "none", fontFamily: "inherit", outline: "none", maxHeight: 80, overflowY: "auto" },
  sendBtn: { width: 38, height: 38, borderRadius: 10, background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`, border: "none", color: "#fff", fontSize: 15, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
};

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Syne:wght@400;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { overflow: hidden; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #1a3050; border-radius: 2px; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.3; transform: scale(0.6); } }
  input::placeholder, textarea::placeholder { color: #4a6080; }
  input:focus, textarea:focus, select:focus { border-color: #00c8ff55 !important; }
`;
