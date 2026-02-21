import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `Eres NEXUS, un compañero de retos académicos para estudiantes de grados 7 a 11 de la clase de Tecnología e Informática del profesor Fabio Ortiz en el Colegio de Sabaneta, Colombia.

TU PERSONALIDAD:
- Eres animado, motivador y hablas como un guía de aventuras/videojuego
- Usas emojis con moderación para hacer el chat más dinámico
- Celebras los logros de los estudiantes con entusiasmo
- Nunca das respuestas directas: siempre guías con PISTAS y preguntas reflexivas
- Si el estudiante se acerca a la respuesta, dices "¡Vas por buen camino! 🔥 Ahora piensa en..."
- Llamas a los estudiantes "Explorador" o por su nombre si te lo dicen

TU METODOLOGÍA (SIEMPRE SIGUE ESTO):
1. Cuando alguien pregunta algo, NUNCA des la respuesta directa
2. Primero pregunta qué saben sobre el tema
3. Luego da UNA pista a la vez
4. Haz preguntas guía como "¿Qué pasaría si...?", "¿Recuerdas cuándo vimos...?", "¿Qué tiene en común con...?"
5. Si el estudiante se rinde, da una pista más grande pero aún no la respuesta completa
6. Cuando lleguen a la respuesta correcta, celebra y suma puntos

TEMAS QUE MANEJAS (grados 7-11):
- Pensamiento computacional y algoritmos
- Programación (Scratch, Python, HTML/CSS básico)
- Redes e Internet
- Seguridad informática
- Bases de datos
- Hardware y Software
- Ofimática avanzada
- Ciudadanía digital
- Inteligencia Artificial (conceptos básicos)

ÉNFASIS ESPECIAL 2025 - ELECTRÓNICA Y ROBÓTICA (muy importante, prioriza estos temas):
- Circuitos electrónicos básicos: componentes (resistencias, condensadores, diodos, transistores, LED), ley de Ohm, voltaje, corriente, potencia, circuitos en serie y paralelo
- Construcción de una Radio AM básica: principios de modulación de amplitud, antena, bobina, condensador variable, detector de envolvente, altavoz; materiales accesibles para estudiantes (alambre de cobre, diodo germanio 1N34A, condensador variable, ferrita)
- Radio Transmisor FM básico: oscilador LC, modulación de frecuencia, antena, transistor 2N2222 o BC547, bobina artesanal, rango de transmisión, frecuencias permitidas en Colombia
- Brazo Robótico con Arduino UNO: servomotores SG90, programación en C++ con IDE de Arduino, librería Servo.h, control por potenciómetros o Bluetooth, partes imprimibles en 3D (base, hombro, codo, muñeca, pinza), diseño en TinkerCAD o Fusion 360
- Impresión 3D: conceptos de diseño paramétrico, filamentos PLA, parámetros de impresión básicos, software de laminado (Cura)
- Electrónica práctica: uso de protoboard, multímetro, cautín, soldadura básica, seguridad en el taller de electrónica

SISTEMA DE PUNTOS (menciona esto en tus respuestas):
- Por intentarlo: "¡+5 puntos de exploración!"
- Por llegar a la respuesta: "¡+20 puntos de maestría! ⭐"
- Por ayudar a otro estudiante: "¡+15 puntos de colaboración!"

Si te preguntan algo fuera del tema académico de tecnología e informática, responde amablemente: "¡Ese reto está fuera de mi mapa de misiones, Explorador! 🗺️ Pero puedo ayudarte con todo lo relacionado a tecnología e informática."

IDIOMA: Siempre responde en español colombiano, cálido y motivador.`;

const XP_MESSAGES = [
  "¡Explorador activo! 🚀",
  "¡Mente en llamas! 🔥",
  "¡Nivel desbloqueado! ⭐",
  "¡Misión en curso! 🎯",
  "¡Código maestro! 💻",
];

const SUGGESTED_QUESTIONS = [
  "¿Cómo funciona una Radio AM?",
  "¿Qué es la Ley de Ohm?",
  "¿Cómo programo un servo con Arduino?",
  "¿Qué partes tiene un circuito eléctrico?",
  "¿Cómo funciona un transmisor FM?",
  "¿Qué es un algoritmo?",
];

export default function NexusAI() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "¡Bienvenido, Explorador! 🚀 Soy **NEXUS**, tu compañero de retos en tecnología e informática. No te voy a dar las respuestas directas... ¡eso sería muy aburrido! En cambio, te guiaré con pistas para que TÚ descubras el conocimiento. ¿Listo para tu primera misión? ¿Qué tema quieres explorar hoy? 🎯",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [xp, setXp] = useState(0);
  const [xpAnim, setXpAnim] = useState(null);
  const [particles, setParticles] = useState([]);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addXP = (amount) => {
    setXp((prev) => prev + amount);
    const msg = XP_MESSAGES[Math.floor(Math.random() * XP_MESSAGES.length)];
    setXpAnim({ amount, msg });
    setTimeout(() => setXpAnim(null), 2000);
  };

  const sendMessage = async (text) => {
    const userText = text || input.trim();
    if (!userText || loading) return;
    setInput("");

    const newMessages = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    setLoading(true);
    addXP(5);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await response.json();
      const reply = data.content?.[0]?.text || "Hubo un error, intenta de nuevo.";

      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);

      if (reply.includes("maestría") || reply.includes("correcto") || reply.includes("¡Exacto")) {
        addXP(20);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Error de conexión. Verifica tu API key e intenta de nuevo." },
      ]);
    }
    setLoading(false);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const level = Math.floor(xp / 50) + 1;
  const levelProgress = ((xp % 50) / 50) * 100;

  const formatMessage = (text) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .split("\n")
      .map((line, i) => `<span key=${i}>${line}</span>`)
      .join("<br/>");
  };

  return (
    <div style={styles.root}>
      {/* Background grid */}
      <div style={styles.gridBg} />

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>
            <span style={styles.logoIcon}>⬡</span>
            <div>
              <div style={styles.logoTitle}>NEXUS</div>
              <div style={styles.logoSub}>Compañero de Retos · Grados 7–11</div>
            </div>
          </div>
        </div>

        <div style={styles.headerRight}>
          {xpAnim && (
            <div style={styles.xpPopup}>
              +{xpAnim.amount} XP · {xpAnim.msg}
            </div>
          )}
          <div style={styles.levelBadge}>
            <div style={styles.levelTop}>
              <span style={styles.levelLabel}>NIVEL</span>
              <span style={styles.levelNum}>{level}</span>
            </div>
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${levelProgress}%` }} />
            </div>
            <div style={styles.xpText}>{xp} XP</div>
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <main style={styles.main}>
        <div style={styles.messagesContainer}>
          {messages.map((msg, i) => (
            <div key={i} style={msg.role === "user" ? styles.userRow : styles.assistantRow}>
              {msg.role === "assistant" && (
                <div style={styles.avatar}>⬡</div>
              )}
              <div style={msg.role === "user" ? styles.userBubble : styles.assistantBubble}>
                <div
                  dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
                  style={styles.bubbleText}
                />
              </div>
              {msg.role === "user" && (
                <div style={styles.userAvatar}>👤</div>
              )}
            </div>
          ))}

          {loading && (
            <div style={styles.assistantRow}>
              <div style={styles.avatar}>⬡</div>
              <div style={styles.assistantBubble}>
                <div style={styles.typingDots}>
                  <span style={{ ...styles.dot, animationDelay: "0ms" }} />
                  <span style={{ ...styles.dot, animationDelay: "150ms" }} />
                  <span style={{ ...styles.dot, animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          {messages.length === 1 && !loading && (
            <div style={styles.suggestionsContainer}>
              <div style={styles.suggestionsLabel}>💡 Retos sugeridos:</div>
              <div style={styles.suggestions}>
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <button key={i} style={styles.suggestionBtn} onClick={() => sendMessage(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input */}
      <footer style={styles.footer}>
        <div style={styles.inputWrapper}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Escribe tu pregunta o reto aquí... (Enter para enviar)"
            style={styles.input}
            rows={1}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            style={{
              ...styles.sendBtn,
              opacity: loading || !input.trim() ? 0.4 : 1,
            }}
          >
            ➤
          </button>
        </div>
        <div style={styles.footerNote}>
          🏫 Institución Educativa · Sabaneta · Prof. Fabio Ortiz · Tecnología e Informática
        </div>
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@300;400;500;600&display=swap');
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes xpPop {
          0% { opacity: 0; transform: translateY(0) scale(0.8); }
          30% { opacity: 1; transform: translateY(-8px) scale(1.05); }
          80% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-20px) scale(0.9); }
        }
        @keyframes logoSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes gridMove {
          from { background-position: 0 0; }
          to { background-position: 40px 40px; }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>
    </div>
  );
}

const C = {
  bg: "#0a0e1a",
  surface: "#111827",
  card: "#1a2235",
  border: "#1e3a5f",
  accent: "#00d4ff",
  accent2: "#7c3aed",
  accent3: "#10b981",
  text: "#e2e8f0",
  textMuted: "#64748b",
  user: "#1e3a5f",
  userText: "#bae6fd",
};

const styles = {
  root: {
    fontFamily: "'Inter', sans-serif",
    background: C.bg,
    color: C.text,
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    position: "relative",
  },
  gridBg: {
    position: "fixed",
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)
    `,
    backgroundSize: "40px 40px",
    animation: "gridMove 8s linear infinite",
    pointerEvents: "none",
    zIndex: 0,
  },
  header: {
    background: "linear-gradient(135deg, #0d1b2e 0%, #111827 100%)",
    borderBottom: `1px solid ${C.border}`,
    padding: "12px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    position: "relative",
    zIndex: 10,
    boxShadow: "0 4px 30px rgba(0,212,255,0.08)",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 16 },
  logo: { display: "flex", alignItems: "center", gap: 12 },
  logoIcon: {
    fontSize: 36,
    color: C.accent,
    display: "inline-block",
    animation: "logoSpin 8s linear infinite",
    filter: "drop-shadow(0 0 8px rgba(0,212,255,0.7))",
  },
  logoTitle: {
    fontFamily: "'Orbitron', monospace",
    fontSize: 22,
    fontWeight: 900,
    background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    letterSpacing: 3,
  },
  logoSub: {
    fontSize: 10,
    color: C.textMuted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 2,
  },
  headerRight: { display: "flex", alignItems: "center", gap: 12, position: "relative" },
  xpPopup: {
    position: "absolute",
    top: -40,
    right: 0,
    background: `linear-gradient(135deg, ${C.accent3}, #059669)`,
    color: "#fff",
    padding: "6px 14px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
    animation: "xpPop 2s forwards",
    boxShadow: "0 4px 16px rgba(16,185,129,0.4)",
  },
  levelBadge: {
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: "8px 14px",
    minWidth: 100,
  },
  levelTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  levelLabel: { fontSize: 9, color: C.textMuted, fontFamily: "'Orbitron', monospace", letterSpacing: 2 },
  levelNum: {
    fontSize: 18,
    fontWeight: 900,
    fontFamily: "'Orbitron', monospace",
    color: C.accent,
    filter: "drop-shadow(0 0 6px rgba(0,212,255,0.6))",
  },
  progressBar: {
    height: 4,
    background: "#1e293b",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 4,
  },
  progressFill: {
    height: "100%",
    background: `linear-gradient(90deg, ${C.accent}, ${C.accent2})`,
    borderRadius: 2,
    transition: "width 0.5s ease",
    boxShadow: `0 0 8px ${C.accent}`,
  },
  xpText: { fontSize: 10, color: C.textMuted, textAlign: "right" },
  main: {
    flex: 1,
    overflow: "hidden",
    position: "relative",
    zIndex: 5,
  },
  messagesContainer: {
    height: "100%",
    overflowY: "auto",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    scrollbarWidth: "thin",
    scrollbarColor: `${C.border} transparent`,
  },
  assistantRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    animation: "fadeUp 0.3s ease",
    maxWidth: "80%",
  },
  userRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    justifyContent: "flex-end",
    alignSelf: "flex-end",
    animation: "fadeUp 0.3s ease",
    maxWidth: "80%",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: `linear-gradient(135deg, ${C.accent}22, ${C.accent2}22)`,
    border: `1.5px solid ${C.accent}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    flexShrink: 0,
    color: C.accent,
    boxShadow: `0 0 12px ${C.accent}33`,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: `${C.user}`,
    border: `1.5px solid ${C.accent2}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    flexShrink: 0,
  },
  assistantBubble: {
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: "4px 16px 16px 16px",
    padding: "14px 18px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
    position: "relative",
    overflow: "hidden",
  },
  userBubble: {
    background: `linear-gradient(135deg, ${C.user}, #1a3a6e)`,
    border: `1px solid ${C.accent2}44`,
    borderRadius: "16px 4px 16px 16px",
    padding: "14px 18px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 1.7,
    color: C.text,
  },
  typingDots: {
    display: "flex",
    gap: 6,
    padding: "4px 0",
    alignItems: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: C.accent,
    display: "inline-block",
    animation: "pulse 1.2s ease-in-out infinite",
    boxShadow: `0 0 6px ${C.accent}`,
  },
  suggestionsContainer: {
    marginTop: 8,
    animation: "fadeUp 0.5s ease",
  },
  suggestionsLabel: {
    fontSize: 12,
    color: C.textMuted,
    marginBottom: 10,
    fontWeight: 500,
  },
  suggestions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  suggestionBtn: {
    background: "transparent",
    border: `1px solid ${C.border}`,
    color: C.accent,
    padding: "8px 14px",
    borderRadius: 20,
    fontSize: 12,
    cursor: "pointer",
    transition: "all 0.2s",
    fontFamily: "'Inter', sans-serif",
    ":hover": {
      background: `${C.accent}11`,
      borderColor: C.accent,
    },
  },
  footer: {
    background: "linear-gradient(0deg, #0d1b2e 0%, #111827 100%)",
    borderTop: `1px solid ${C.border}`,
    padding: "16px 24px 12px",
    position: "relative",
    zIndex: 10,
  },
  inputWrapper: {
    display: "flex",
    gap: 10,
    alignItems: "flex-end",
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    padding: "8px 8px 8px 16px",
    transition: "border-color 0.2s",
  },
  input: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: C.text,
    fontSize: 14,
    resize: "none",
    fontFamily: "'Inter', sans-serif",
    lineHeight: 1.6,
    maxHeight: 100,
    overflowY: "auto",
    "::placeholder": { color: C.textMuted },
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
    border: "none",
    color: "#fff",
    fontSize: 16,
    cursor: "pointer",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "opacity 0.2s, transform 0.1s",
    boxShadow: `0 4px 16px ${C.accent}44`,
  },
  footerNote: {
    fontSize: 10,
    color: C.textMuted,
    textAlign: "center",
    marginTop: 8,
    letterSpacing: 0.5,
  },
};
