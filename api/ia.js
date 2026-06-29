const MODEL = "gemini-flash-latest";

async function callGemini(body) {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("Falta configurar GEMINI_API_KEY en las variables de Vercel.");
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

module.exports = async function handler(req, res) {
  // Configuración de CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

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
    // ACCIÓN 1: CHAT DEL ENTRENADOR IA
    if (body.action === "chat") {
      const { systemPrompt, history } = body;
      
      if (typeof systemPrompt !== "string" || !Array.isArray(history)) {
        res.status(400).json({ error: "Faltan datos para procesar el pedido." });
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

    // ACCIÓN 2: DETECTAR RUTINA
    if (body.action === "detect") {
      const { text } = body;
      if (typeof text !== "string" || !text.trim()) {
        res.status(400).json({ error: "Falta el texto de la rutina." });
        return;
      }
      
      const prompt = `Extraé la rutina de entrenamiento del siguiente texto y devolvé ÚNICAMENTE un array JSON con esta estructura exacta, sin texto adicional y SIN bloques de código markdown (nada de \`\`\`):\n[{"label": "Día 1", "exercises": [{"name": "Press Banca", "setsCount": 3, "repRange": "8-10"}]}]\n\nTexto:\n"""\n${text}\n"""`;
      
      const data = await callGemini({ contents: [{ parts: [{ text: prompt }] }] });
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      res.status(200).json({ text: rawText });
      return;
    }

    res.status(400).json({ error: "Acción no reconocida." });
  } catch (err) {
    console.error("Error en /api/ia:", err);
    res.status(500).json({ error: err.message || "Error interno del servidor." });
  }
};