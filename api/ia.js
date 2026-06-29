export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Solo POST' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Falta API Key' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    // URL dinámica según la acción
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
    
    const geminiPayload = body.action === 'chat' 
      ? { systemInstruction: { parts: [{ text: body.systemPrompt }] }, contents: body.history, tools: [{ google_search: {} }] }
      : { contents: [{ parts: [{ text: `Extraé rutina JSON (sin markdown):\n[{"label": "Día 1", "exercises": [{"name": "Press", "setsCount": 3}]}]\nTexto: "${body.text}"` }] }] };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload)
    });

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}