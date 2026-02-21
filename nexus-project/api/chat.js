// api/chat.js — Serverless function de Vercel
// La API Key de Anthropic NUNCA llega al navegador del estudiante

export default async function handler(req, res) {
  // Solo aceptar POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // CORS para tu dominio
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  const { messages, system } = req.body

  if (!messages || !system) {
    return res.status(400).json({ error: 'Faltan parámetros' })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,  // ← Variable de entorno segura en Vercel
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system,
        messages,
      }),
    })

    const data = await response.json()
    return res.status(200).json(data)
  } catch (error) {
    return res.status(500).json({ error: 'Error al conectar con Anthropic' })
  }
}
