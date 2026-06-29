/**
 * api/ia.js — función serverless de Vercel
 *
 * Por qué este archivo existe en vez de llamar a Gemini directo desde el
 * navegador: la clave vive en una VARIABLE DE ENTORNO del servidor
 * (GEMINI_API_KEY), no en el código ni en Remote Config — el navegador
 * nunca la ve, sólo este archivo, que corre en el servidor de Vercel.
 */

const MODEL = "gemini-1.5-flash";

async function callGemini(body) {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("Falta configurar GEMINI_API_KEY en las variables de entorno de Vercel.");
  }
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    { 
      method: "POST", 
      headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify(body) 
    }
  );
  
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("Gemini respondió con error:", response.status, errText);
    throw new Error("El servicio de IA no respondió correctamente.");
  }
  
  return response.json();
}

export default async function handler(req, res) {
  // Sólo permitimos peticiones POST
  if (req.method !== "POST") {
    res.status(405).json({ error: "Sólo se acepta POST." });
    return;
  }

  let body = req.body;
  
  // En algunos entornos de Vercel el body ya llega parseado;
  // en otros llega como string crudo. Esto cubre los dos casos.
  if (typeof body === "string") {
    try { 
      body = JSON.parse(body); 
    } catch { 
      body = {}; 
    }
  }
  body = body || {};

  try {
    // ---------------------------------------------------------
    // ACCIÓN 1: CHAT DEL ENTRENADOR IA
    // ---------------------------------------------------------
    if (body.action === "chat") {
      const { systemPrompt, history } = body;
      
      if (typeof systemPrompt !== "string" || !Array.isArray(history)) {
        res.status(400).json({ error: "Faltan datos para procesar el pedido." });
        return;
      }
      
      // Tope de tamaño por seguridad
      if (systemPrompt.length > 60000 || JSON.stringify(history).length > 60000) {
        res.status(400).json({ error: "El mensaje es demasiado largo." });
        return;
      }

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

    // ---------------------------------------------------------
    // ACCIÓN 2: DETECTAR RUTINA IMPORTADA
    // ---------------------------------------------------------
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
      
      const data = await callGemini({ 
        contents: [{ parts: [{ text: prompt }] }] 
      });
      
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      res.status(200).json({ text: rawText });
      return;
    }

    // Si la acción no es "chat" ni "detect"
    res.status(400).json({ error: "Acción no reconocida." });
    
  } catch (err) {
    console.error("Error en /api/ia:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
}