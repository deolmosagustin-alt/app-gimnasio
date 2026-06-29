export default async function handler(req, res) {
  console.log("¡Entró al servidor!");
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Solo POST' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("ERROR CRÍTICO: No existe la variable GEMINI_API_KEY");
    return res.status(500).json({ error: 'Falta API Key' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    console.log("Acción recibida:", body.action);

    // USAMOS EL MODELO QUE SABEMOS QUE FUNCIONA
    const MODEL = "gemini-1.5-flash"; 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: body.action === 'chat' ? body.systemPrompt : body.text }] }]
      })
    });

    const data = await response.json();
    
    // Si la respuesta de Google tiene error, lo logueamos
    if (!response.ok) {
        console.error("Respuesta error de Google:", JSON.stringify(data));
        return res.status(500).json({ error: "Error desde la API de Google" });
    }

    console.log("Respuesta de Google recibida correctamente");
    res.status(200).json({ text: data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sin respuesta" });
  } catch (err) {
    console.error("ERROR CAPTURADO EN CATCH:", err);
    res.status(500).json({ error: err.message });
  }
}