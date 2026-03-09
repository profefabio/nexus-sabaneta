// api/chat.js — CommonJS (compatible con Vercel serverless)
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(200).json({ error: "Method not allowed" });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(200).json({
      error: "⚠️ ANTHROPIC_API_KEY no configurada en Vercel. Ve a Settings → Environment Variables.",
    });
  }

  // Validación básica de formato de clave
  const apiKey = process.env.ANTHROPIC_API_KEY.trim();
  if (!apiKey.startsWith("sk-ant-")) {
    return res.status(200).json({
      error: "⚠️ ANTHROPIC_API_KEY tiene formato incorrecto. Debe empezar con 'sk-ant-'. Verifica en Vercel → Settings → Environment Variables.",
    });
  }

  const { messages, system } = req.body;
  if (!messages || !system)
    return res.status(200).json({ error: "Faltan parámetros en la solicitud." });

  // Protección: system prompt no debe ser anormalmente grande
  if (typeof system === "string" && system.length > 12000)
    return res.status(200).json({ error: "Sistema de prompt demasiado largo." });

  // Limpiar y validar mensajes
  const clean = messages.filter(m => m.role === "user" || m.role === "assistant");
  let start = 0;
  while (start < clean.length && clean[start].role !== "user") start++;
  let validMessages = clean.slice(start);

  if (validMessages.length === 0)
    return res.status(200).json({ error: "No hay mensajes de usuario válidos." });

  // ── CORRECCIÓN: Truncar a los últimos 50 mensajes para evitar exceso de tokens ──
  if (validMessages.length > 50) {
    validMessages = validMessages.slice(validMessages.length - 50);
    // Asegurar que empiece con "user"
    while (validMessages.length > 0 && validMessages[0].role !== "user") {
      validMessages.shift();
    }
  }

  // ── CORRECCIÓN: Timeout de 25 segundos con AbortController ──
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system,
        messages: validMessages,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const anthropicStatus = response.status;
      const msg = errBody?.error?.message || response.statusText || "Error desconocido";
      console.error("ANTHROPIC ERROR:", anthropicStatus, JSON.stringify(errBody));

      let userMsg;
      if (anthropicStatus === 401) {
        userMsg = "⚠️ La clave de API de Anthropic es inválida o expiró. El administrador debe actualizarla en Vercel → Environment Variables → ANTHROPIC_API_KEY.";
      } else if (anthropicStatus === 429) {
        userMsg = "⏳ Demasiadas solicitudes a la vez. Espera unos segundos e intenta de nuevo.";
      } else if (anthropicStatus === 529 || anthropicStatus === 503) {
        userMsg = "🔧 El servicio de IA está temporalmente sobrecargado. Intenta en un momento.";
      } else {
        userMsg = `⚠️ Error del servicio de IA (${anthropicStatus}): ${msg}`;
      }
      return res.status(200).json({ error: userMsg });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      console.error("CHAT TIMEOUT: La solicitud tardó más de 25s");
      return res.status(200).json({
        error: "⏳ La IA tardó demasiado en responder. Intenta de nuevo en unos segundos.",
      });
    }
    console.error("CHAT NETWORK ERROR:", err.message);
    return res.status(200).json({
      error: "⚠️ Error de conexión con el servicio de IA. Verifica tu internet e intenta de nuevo.",
    });
  }
};
