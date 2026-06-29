export default async function handler(req, res) {
  // 1. Configurar CORS para permitir peticiones desde tu web
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  try {
    const { action, systemPrompt, history, text } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    // 2. Llamada a la API de Google
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: action === 'chat' ? { parts: [{ text: systemPrompt }] } : undefined,
        contents: action === 'chat' ? history : [{ parts: [{ text: `Extraé la rutina de este texto en formato JSON simple: ${text}` }] }]
      })
    });

    const data = await response.json();
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "Error al procesar";
    
    return res.status(200).json({ text: answer });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}