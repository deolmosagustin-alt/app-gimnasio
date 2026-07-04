/**
 * api/ia.js — función serverless de Vercel
 *
 * Maneja dos acciones:
 *  - { action: "chat", systemPrompt, history }  → chat del Entrenador IA
 *  - { action: "detect", text }                  → importar rutina con IA
 */

const MODEL = "gemini-flash-latest";

async function callGemini(body) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY en las variables de entorno de Vercel.");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("Gemini respondió con error:", response.status, errText);
    throw new Error(`Gemini devolvió ${response.status}`);
  }
  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Sólo se acepta POST." }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  try {
    if (body.action === "chat") {
      const { systemPrompt, history } = body;
      if (typeof systemPrompt !== "string" || !Array.isArray(history)) {
        res.status(400).json({ error: "Faltan datos para procesar el pedido." }); return;
      }
      if (systemPrompt.length > 60000 || JSON.stringify(history).length > 60000) {
        res.status(400).json({ error: "El mensaje es demasiado largo." }); return;
      }
      const data = await callGemini({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: history,
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
        res.status(400).json({ error: "Falta el texto de la rutina." }); return;
      }
      const truncated = text.substring(0, 25000);
      const prompt = [
        "Analizá el siguiente texto y extraé la rutina de entrenamiento completa.",
        "Devolvé ÚNICAMENTE un array JSON válido (sin texto adicional, sin markdown):",
        '[{"label": "Push", "exercises": [{"name": "Press Banca", "setsCount": 3, "repRange": "8-10"}]}]',
        "",
        "Reglas:",
        '- "label": nombre del día/sesión (Push, Pull, Legs, Día 1, Pecho, etc.)',
        '- "name": nombre completo del ejercicio en español',
        '- "setsCount": cantidad de series (1-8)',
        '- "repRange": rango de reps (ej: "8-10", "6-8", "5", "20")',
        '- "3x8-10" o "3 series 8-10 reps" → setsCount=3, repRange="8-10"',
        "- Incluí TODOS los ejercicios, no omitas ninguno",
        '- Cardio (cinta, bici, elíptica): repRange = minutos (ej: "30")',
        "",
        "Texto:",
        '"""',
        truncated,
        '"""',
      ].join("\n");
      const data = await callGemini({ contents: [{ parts: [{ text: prompt }] }] });
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      res.status(200).json({ text: rawText });
      return;
    }

    res.status(400).json({ error: "Acción no reconocida." });
  } catch (err) {
    console.error("Error en /api/ia:", err);
    res.status(500).json({ error: "Error en el servidor." });
  }
}
