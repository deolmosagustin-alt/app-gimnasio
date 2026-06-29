/**
 * api/ia.js — función serverless de Vercel
 *
 * La clave vive en una VARIABLE DE ENTORNO del servidor (GEMINI_API_KEY) —
 * el navegador nunca la ve, sólo este archivo, que corre en el servidor
 * de Vercel.
 *
 * Maneja dos acciones, según lo que mande App.jsx en el body del pedido:
 *  - { action: "chat", systemPrompt, history }  → el chat del Entrenador IA
 *  - { action: "detect", text }                  → "Detectar con IA" al importar una rutina
 */

const MODEL = "gemini-flash-latest";
// "gemini-1.5-flash" (y "gemini-2.0-flash") ya no existen — Google los dio
// de baja por completo, así que cualquier pedido devuelve un error sin
// "candidates". El alias "gemini-flash-latest" lo mantiene Google apuntando
// siempre al modelo Flash vigente, así esto no se rompe de nuevo cuando la
// próxima versión salga.

async function callGemini(body) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta configurar GEMINI_API_KEY en las variables de entorno de Vercel.");
  }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!response.ok) {
    // Este chequeo es justo lo que faltaba — sin él, un pedido rechazado
    // por Google (modelo apagado, clave inválida, cuota agotada, lo que
    // sea) seguía de largo como si nada, y el cliente terminaba recibiendo
    // un string fijo de "no funcionó" disfrazado de respuesta válida (200
    // OK) en vez de un error de verdad que se pueda diagnosticar.
    const errText = await response.text().catch(() => "");
    console.error("Gemini respondió con error:", response.status, errText);
    throw new Error(`Gemini devolvió ${response.status}`);
  }
  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Sólo se acepta POST." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  try {
    if (body.action === "chat") {
      const { systemPrompt, history } = body;
      if (typeof systemPrompt !== "string" || !Array.isArray(history)) {
        res.status(400).json({ error: "Faltan datos para procesar el pedido." });
        return;
      }
      if (systemPrompt.length > 60000 || JSON.stringify(history).length > 60000) {
        res.status(400).json({ error: "El mensaje es demasiado largo." });
        return;
      }

      // tools: google_search — el modelo decide buscar en la web cuando
      // una pregunta se beneficia de eso (no en cada mensaje, sólo cuando
      // le conviene a la respuesta). groundingMetadata.groundingChunks
      // trae las fuentes reales usadas — esto es lo que alimenta los
      // links clicables debajo de la respuesta en el chat.
      const data = await callGemini({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: history,
        tools: [{ google_search: {} }],
      });
      const candidate = data?.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text || "";
      const chunks = candidate?.groundingMetadata?.groundingChunks || [];
      const seen = new Set();
      const sources = [];
      chunks.forEach((c) => {
        const uri = c?.web?.uri;
        if (!uri || seen.has(uri)) return;
        seen.add(uri);
        sources.push({ uri, title: c.web.title || uri });
      });
      res.status(200).json({ text, sources });
      return;
    }

    if (body.action === "detect") {
      const { text } = body;
      if (typeof text !== "string" || !text.trim()) {
        res.status(400).json({ error: "Falta el texto de la rutina." });
        return;
      }
      if (text.length > 30000) {
        res.status(400).json({ error: "El texto es demasiado largo." });
        return;
      }
      // El esquema exacto importa: App.jsx (handleProcessAI) espera estos
      // nombres de campo puntuales para poder mapear cada ejercicio al
      // catálogo — pedir "JSON simple" sin más detalle deja que Gemini
      // invente su propia forma, que después no calza con lo que el
      // cliente intenta leer.
      const prompt = `Extraé la rutina de entrenamiento del siguiente texto y devolvé ÚNICAMENTE un array JSON con esta estructura exacta, sin texto adicional y SIN bloques de código markdown (nada de \`\`\`):
[{"label": "Día 1", "exercises": [{"name": "Press Banca", "setsCount": 3, "repRange": "8-10"}]}]

Texto:
"""
${text}
"""`;
      const data = await callGemini({ contents: [{ parts: [{ text: prompt }] }] });
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      res.status(200).json({ text: rawText });
      return;
    }

    res.status(400).json({ error: "Acción no reconocida." });
  } catch (err) {
    console.error("Error en /api/ia:", err);
    // "detail" es temporal, sólo para terminar de diagnosticar esto sin
    // tener que ir a buscar los logs de Vercel cada vez — antes de
    // publicar la app de verdad, hay que sacar esta línea (no se le debe
    // mostrar el motivo técnico exacto a cualquiera que use el chat).
    res.status(500).json({ error: "Error en el servidor.", detail: err.message });
  }
};
