/**
 * api/ia.js — función serverless de Vercel
 *
 * Por qué este archivo existe en vez de llamar a Gemini directo desde el
 * navegador: la clave vive en una VARIABLE DE ENTORNO del servidor
 * (GEMINI_API_KEY), no en el código ni en Remote Config — el navegador
 * nunca la ve, sólo este archivo, que corre en el servidor de Vercel.
 *
 * Para configurarla: en el panel de tu proyecto en vercel.com → Settings
 * → Environment Variables → agregá una llamada exactamente
 * "GEMINI_API_KEY" con tu clave como valor (la misma que ya tenías) →
 * Save. Después hay que volver a desplegar para que tome el valor nuevo
 * (un "git push" cualquiera alcanza, o el botón "Redeploy" del panel).
 *
 * Maneja dos acciones, según lo que mande App.jsx en el body del pedido:
 *  - { action: "chat", systemPrompt, history }  → el chat del Entrenador IA
 *  - { action: "detect", text }                  → "Detectar con IA" al importar una rutina
 *
 * Aclaración importante sobre el alcance de esto: esta versión protege
 * la CLAVE (que era el problema principal — antes cualquiera la veía
 * desde las herramientas de desarrollador). Lo que NO tiene es un límite
 * de cuántos pedidos puede mandar cada persona por día — eso necesitaría
 * guardar un contador en alguna base de datos, y se dejó afuera a
 * propósito para no obligarte a meter más piezas (Firestore, claves de
 * servicio, etc.) antes de que el uso real lo justifique. Mientras
 * tanto, la red de seguridad más simple es poner una ALERTA DE
 * PRESUPUESTO en Google Cloud Console, sobre el proyecto donde generaste
 * esta clave de Gemini — así te avisa por mail si el gasto se dispara,
 * en vez de enterarte recién en la factura. Si en algún momento querés
 * sumar un límite de verdad por usuario, avisame y lo armamos.
 */

const MODEL = "gemini-flash-latest";

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
    const errText = await response.text().catch(() => "");
    console.error("Gemini respondió con error:", response.status, errText);
    throw new Error("El servicio de IA no respondió correctamente.");
  }
  return response.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Sólo se acepta POST." });
    return;
  }

  let body = req.body;
  // En algunos entornos de Vercel el body ya llega parseado como objeto;
  // en otros llega como string crudo — esto cubre los dos casos.
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
      // Tope de tamaño básico — un pedido gigante también cuesta plata, y
      // un chat normal nunca debería necesitar uno.
      if (systemPrompt.length > 60000 || JSON.stringify(history).length > 60000) {
        res.status(400).json({ error: "El mensaje es demasiado largo." });
        return;
      }

      // tools: google_search habilita que el propio modelo decida buscar
      // en la web cuando una pregunta se beneficia de eso (no busca
      // SIEMPRE — sólo cuando le conviene a la respuesta, así que no
      // agrega demora a un "hola" o a algo que ya tiene en el contexto).
      // La respuesta trae groundingMetadata.groundingChunks con las
      // fuentes reales usadas — se mandan aparte, nunca las inventa el
      // modelo en su propio texto (eso se le pide en el systemPrompt).
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
    res.status(500).json({ error: "Error en el servidor." });
  }
}
