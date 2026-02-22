// api/chat.js — CommonJS (compatible con Vercel serverless)
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY no configurada en Vercel." });
  }

  const { messages, system } = req.body;
  if (!messages || !system) return res.status(400).json({ error: "Faltan parametros" });

  // ── CORRECCIÓN CRÍTICA ────────────────────────────────────────
  // Anthropic exige que los mensajes empiecen siempre con rol "user".
  // El mensaje de bienvenida de NEXUS tiene rol "assistant" y provoca
  // error 400. Lo eliminamos aquí antes de enviar a la API.
  const cleanMessages = messages.filter((m) => m.role === "user" || m.role === "assistant");

  // Quitar mensajes "assistant" del inicio hasta encontrar el primer "user"
  let start = 0;
  while (start < cleanMessages.length && cleanMessages[start].role !== "user") {
    start++;
  }
  const validMessages = cleanMessages.slice(start);

  if (validMessages.length === 0) {
    return res.status(400).json({ error: "No hay mensajes de usuario validos" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 1024,
        system,
        messages: validMessages,
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      console.error("ANTHROPIC ERROR:", response.status, JSON.stringify(errBody));
      const msg = errBody?.error?.message || response.statusText;
      return res.status(response.status).json({
        error: "Error Anthropic " + response.status + ": " + msg,
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: "Error de red: " + error.message });
  }
};
