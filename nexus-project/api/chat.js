// api/chat.js — CommonJS (compatible con Vercel serverless)
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.ANTHROPIC_API_KEY) {
    // SIEMPRE retornar 200 con campo error — nunca 401/403 para evitar redirect de Vercel
    return res.status(200).json({
      error: "⚠️ ANTHROPIC_API_KEY no configurada en Vercel. Ve a Settings → Environment Variables.",
    });
  }

  const { messages, system } = req.body;
  if (!messages || !system)
    return res.status(200).json({ error: "Faltan parámetros en la solicitud." });

  // Anthropic exige que el array empiece con rol "user"
  const clean = messages.filter(m => m.role === "user" || m.role === "assistant");
  let start = 0;
  while (start < clean.length && clean[start].role !== "user") start++;
  const validMessages = clean.slice(start);

  if (validMessages.length === 0)
    return res.status(200).json({ error: "No hay mensajes de usuario válidos." });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system,
        messages: validMessages,
      }),
    });

    // ── CRÍTICO: NUNCA reenviar 401/403 de Anthropic al browser ──
    // Vercel intercepta cualquier respuesta 401 y redirige a /api/login,
    // lo que hace que el chat se quede colgado sin mostrar el error real.
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const anthropicStatus = response.status;
      const msg = errBody?.error?.message || response.statusText || "Error desconocido";

      console.error("ANTHROPIC ERROR:", anthropicStatus, JSON.stringify(errBody));

      // Mensajes amigables según el código de error
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

      // Siempre 200 para que Vercel no intercepte
      return res.status(200).json({ error: userMsg });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error("CHAT NETWORK ERROR:", err.message);
    return res.status(200).json({
      error: "⚠️ Error de conexión con el servicio de IA. Verifica tu internet e intenta de nuevo.",
    });
  }
};
