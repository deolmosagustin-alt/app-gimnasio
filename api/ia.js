/**
 * api/ia.js — función serverless de Vercel
 *
 * Maneja dos acciones:
 *  - { action: "chat", systemPrompt, history }  → chat del Entrenador IA
 *  - { action: "detect", text }                  → importar rutina con IA
 *
 * ROBUSTEZ (fix del "la IA no contesta"): antes había UN solo modelo
 * hardcodeado (gemini-flash-latest). Google rota esos alias sin aviso y
 * las cuotas gratuitas se agotan por modelo — cuando pasaba cualquiera de
 * las dos, la IA moría entera con un "Error en el servidor" genérico.
 * Ahora se prueba una CADENA de modelos en orden: si uno devuelve 404
 * (ya no existe), 429 (cuota agotada) o 503 (sobrecargado), se pasa al
 * siguiente. El que funciona queda cacheado mientras la función esté
 * caliente, así las siguientes llamadas van directo. Y los errores que
 * llegan al usuario ahora explican QUÉ pasó de verdad.
 */

const MODEL_CHAIN = [
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

// Se recuerda el último modelo que funcionó (mientras el lambda viva) para
// arrancar por ese y no pagar reintentos en cada llamada.
let preferredModel = null;

async function callModel(model, body, apiKey) {
  const controller = new AbortController();
  // 50s: las respuestas LARGAS (rutinas completas) en el free tier tardan
  // 30-50s. Con 25s las matábamos a mitad de generación — por eso "hola"
  // funcionaba y los pedidos grandes no. Los errores de modelo (404/429)
  // responden en milisegundos, así que el timeout largo no los demora.
  const timer = setTimeout(() => controller.abort(), 50000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal }
    );
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(body) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const e = new Error("Falta GEMINI_API_KEY en las variables de entorno de Vercel.");
    e.userMessage = "La IA no está configurada en el servidor (falta la clave de API).";
    throw e;
  }

  // Orden de intento: el que funcionó la última vez primero, después el resto.
  const chain = preferredModel
    ? [preferredModel, ...MODEL_CHAIN.filter((m) => m !== preferredModel)]
    : MODEL_CHAIN;

  let lastStatus = null, lastDetail = "";
  for (const model of chain) {
    let response;
    try {
      response = await callModel(model, body, apiKey);
    } catch (netErr) {
      // Timeout o corte de red hacia Google: probar el siguiente modelo.
      lastStatus = 0; lastDetail = String(netErr?.message || netErr);
      console.error(`[ia] ${model}: fallo de red/timeout →`, lastDetail);
      continue;
    }
    if (response.ok) {
      preferredModel = model;
      return response.json();
    }
    lastStatus = response.status;
    lastDetail = await response.text().catch(() => "");
    console.error(`[ia] ${model} devolvió ${lastStatus}:`, lastDetail.slice(0, 300));
    // 404 = el alias ya no existe · 429 = cuota agotada de ESE modelo ·
    // 500/503 = sobrecarga puntual. En todos, vale la pena el siguiente.
    if ([404, 429, 500, 503].includes(lastStatus)) continue;
    break; // 400/401/403: el problema no es del modelo, cortar acá
  }

  const e = new Error(`Todos los modelos fallaron (último: ${lastStatus})`);
  if (lastStatus === 429) e.userMessage = "La IA alcanzó el límite de uso gratuito por hoy. Probá de nuevo en un rato o mañana.";
  else if (lastStatus === 401 || lastStatus === 403) e.userMessage = "La clave de la IA no es válida o no tiene permisos (revisá GEMINI_API_KEY en Vercel).";
  else if (lastStatus === 0) e.userMessage = "No se pudo conectar con la IA (timeout). Probá de nuevo.";
  else e.userMessage = "La IA no está disponible en este momento. Probá de nuevo en unos minutos.";
  throw e;
}

// Vercel: permitir hasta 60s de ejecución (el máximo del plan Hobby).
// Sin esto, el default puede cortar la función antes de que Gemini
// termine una respuesta larga.
export const config = { maxDuration: 60 };

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
    res.status(500).json({ error: err.userMessage || "Error en el servidor." });
  }
}
