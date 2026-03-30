/**
 * ═══════════════════════════════════════════════════════════════
 * NEXUS — API Route: Generar Evaluación con Claude IA
 * Archivo: /api/generar-evaluacion.js  (Vercel serverless function)
 * 
 * Variables de entorno en Vercel:
 *   ANTHROPIC_API_KEY = sk-ant-...
 *   POSTGRES_URL      = postgresql://...
 * ═══════════════════════════════════════════════════════════════
 */

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { tema, numPreguntas = 15 } = req.body || {};
  if (!tema) return res.status(400).json({ error: 'Falta el tema' });

  const N = Math.min(Math.max(parseInt(numPreguntas) || 15, 10), 20);

  const prompt = `Eres un experto en evaluación educativa colombiana tipo Prueba Saber (ICFES).

Genera exactamente ${N} preguntas de selección múltiple con única respuesta sobre el tema: "${tema}".

REGLAS PEDAGÓGICAS:
- Preguntas 1-${Math.round(N*0.3)}: Nivel básico (recordar y comprender)
- Preguntas ${Math.round(N*0.3)+1}-${Math.round(N*0.7)}: Nivel medio (aplicar y analizar)
- Preguntas ${Math.round(N*0.7)+1}-${N}: Nivel avanzado (evaluar y crear)
- Cada pregunta tiene 4 opciones (A, B, C, D), solo una correcta
- Incluir contextos reales, datos, situaciones cotidianas colombianas
- Incluir preguntas de inferencia, análisis e interpretación (no solo memorización)
- Las opciones incorrectas deben ser plausibles (no obvias)
- Incluir explicación pedagógica de la respuesta correcta

Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown:
{
  "preguntas": [
    {
      "id": 1,
      "nivel": "básico",
      "enunciado": "Texto completo de la pregunta...",
      "opciones": {
        "A": "Primera opción completa",
        "B": "Segunda opción completa",
        "C": "Tercera opción completa",
        "D": "Cuarta opción completa"
      },
      "respuesta_correcta": "B",
      "explicacion": "La opción B es correcta porque..."
    }
  ]
}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':          process.env.ANTHROPIC_API_KEY,
        'anthropic-version':  '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return res.status(500).json({ error: 'Error Anthropic: ' + err });
    }

    const data  = await resp.json();
    const texto = data.content?.[0]?.text || '';
    const clean = texto.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    if (!parsed.preguntas?.length) {
      return res.status(500).json({ error: 'Respuesta inválida de la IA' });
    }

    return res.status(200).json({
      ok:        true,
      preguntas: parsed.preguntas,
      total:     parsed.preguntas.length,
      tema,
    });

  } catch (err) {
    console.error('[generar-evaluacion]', err);
    return res.status(500).json({ error: 'Error interno: ' + err.message });
  }
}
