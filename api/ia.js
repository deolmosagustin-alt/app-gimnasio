const MODEL = "gemini-flash-latest";

async function callGemini(body) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta configurar GEMINI_API_KEY en Vercel.");
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
    throw new Error("El servicio de IA no respondió correctamente.");
  }
  
  return response.json();
}

// ESTA ES LA DIFERENCIA CLAVE: Usamos 'export default' en lugar de 'module.exports'
export default async function handler(req, res) {
  // Manejo de CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Sólo se acepta POST." });
  }

  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);

    // ACCIÓN 1: CHAT
    if (body.action === "chat") {
      const { systemPrompt, history } = body;
      const data = await callGemini({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: history,
        tools: [{ google_search: {} }],
      });
      
      const candidate = data?.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text || "";
      return res.status(200).json({ text });
    }

    // ACCIÓN 2: DETECTAR
    if (body.action === "detect") {
      const { text } = body;
      const prompt = `Extraé la rutina de entrenamiento del texto y devolvé ÚNICAMENTE un array JSON (nada de \`\`\`):\n[{"label": "Día 1", "exercises": [{"name": "Press Banca", "setsCount": 3, "repRange": "8-10"}]}]\n\nTexto: "${text}"`;
      
      const data = await callGemini({ contents: [{ parts: [{ text: prompt }] }] });
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return res.status(200).json({ text: rawText });
    }

    res.status(400).json({ error: "Acción no reconocida." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}