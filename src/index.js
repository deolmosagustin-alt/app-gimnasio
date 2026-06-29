/**
 * Cloud Functions — Mi Rutina
 *
 * Por qué existe este archivo: antes, la clave de Gemini vivía en
 * Firebase Remote Config y el navegador la pedía directo — visible para
 * cualquiera que abra las herramientas de desarrollador. Funciona para
 * un puñado de usuarios de confianza, pero no aguanta "miles de
 * usuarios": en cuanto alguien la copie y la use desde afuera, te quedás
 * sin cuota (o con una factura) sin enterarte hasta que ya pasó.
 *
 * Acá la clave vive como un SECRET de Cloud Functions (Secret Manager) —
 * nunca sale del servidor, el navegador jamás la ve. El cliente llama a
 * estas funciones (autenticado con Firebase Auth), y son ELLAS las que
 * hablan con Gemini. De yapa, queda un límite diario por usuario para que
 * nadie (ni por error, ni a propósito) te vacíe la cuota en un rato.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// Límites diarios — ajustalos según cuánto estés dispuesto a gastar por
// usuario por día. Con Gemini Flash el costo por mensaje es chico, pero
// sin límite, un solo usuario (o un bot) podría mandar miles de pedidos
// por minuto y listo, se fue tu presupuesto del mes en una tarde.
const DAILY_LIMIT_CHAT = 60;
const DAILY_LIMIT_IMPORT = 15;

/**
 * Cuenta de a uno por usuario por día, en una transacción (para que dos
 * pedidos casi simultáneos no se cuelen los dos antes de que el contador
 * se actualice). Si ya llegó al límite, tira un error que el cliente
 * puede mostrar tal cual a la persona.
 */
async function checkAndIncrementQuota(uid, bucket, limit) {
  const today = new Date().toISOString().slice(0, 10);
  const ref = db.collection("ai_usage").doc(`${uid}_${bucket}_${today}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? snap.data().count || 0 : 0;
    if (count >= limit) {
      throw new HttpsError("resource-exhausted", "Llegaste al límite de uso por hoy. Probá de nuevo mañana.");
    }
    tx.set(ref, { count: count + 1, date: today }, { merge: true });
  });
}

async function callGemini(apiKey, body) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("Gemini respondió con error:", response.status, errText);
    throw new HttpsError("internal", "El servicio de IA no respondió correctamente. Probá de nuevo.");
  }
  return response.json();
}

/**
 * entrenadorIA — reemplaza el fetch directo que hacía enviarMensajeIA()
 * en EntrenadorIAChat (App.jsx). Recibe el prompt de sistema ya armado
 * (con todo el contexto de perfil/rutinas/logs, igual que antes — eso
 * sigue armándose en el cliente, porque ahí ya tenés todos los datos a
 * mano) y el historial de mensajes, y devuelve sólo el texto de la
 * respuesta.
 */
exports.entrenadorIA = onCall({ secrets: [GEMINI_API_KEY], region: "us-central1", cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Iniciá sesión para usar el entrenador IA.");
  }
  const { systemPrompt, history } = request.data || {};
  if (typeof systemPrompt !== "string" || !Array.isArray(history)) {
    throw new HttpsError("invalid-argument", "Faltan datos para procesar el pedido.");
  }
  // Tope de tamaño básico — un pedido gigante también cuesta plata, y un
  // chat normal nunca debería necesitar uno.
  if (systemPrompt.length > 60000 || JSON.stringify(history).length > 60000) {
    throw new HttpsError("invalid-argument", "El mensaje es demasiado largo.");
  }

  await checkAndIncrementQuota(request.auth.uid, "chat", DAILY_LIMIT_CHAT);

  // tools: google_search habilita que el propio modelo decida buscar en
  // la web cuando una pregunta se beneficia de eso (no busca SIEMPRE —
  // sólo cuando le conviene a la respuesta, así que no agrega demora a
  // un "hola" o a una pregunta sobre datos que ya tiene en el contexto).
  // La respuesta trae groundingMetadata.groundingChunks con las fuentes
  // reales usadas — las mandamos aparte, nunca las inventa el modelo en
  // su propio texto (eso se le pide explícitamente en el systemPrompt).
  const data = await callGemini(GEMINI_API_KEY.value(), {
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
  return { text, sources };
});

/**
 * detectarRutinaIA — reemplaza el fetch directo de handleProcessAI() en
 * ImportRoutineModal ("Detectar con IA"). Recibe el texto crudo de la
 * rutina pegada/subida y devuelve el JSON de días/ejercicios ya
 * extraído — el match contra el catálogo de ejercicios sigue haciéndose
 * en el cliente, como antes.
 */
exports.detectarRutinaIA = onCall({ secrets: [GEMINI_API_KEY], region: "us-central1", cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Iniciá sesión para usar esta función.");
  }
  const { text } = request.data || {};
  if (typeof text !== "string" || !text.trim()) {
    throw new HttpsError("invalid-argument", "Falta el texto de la rutina.");
  }
  if (text.length > 30000) {
    throw new HttpsError("invalid-argument", "El texto es demasiado largo.");
  }

  await checkAndIncrementQuota(request.auth.uid, "import", DAILY_LIMIT_IMPORT);

  const prompt = `Extraé la rutina de entrenamiento del siguiente texto y devolvé ÚNICAMENTE un array JSON con esta estructura exacta, sin texto adicional y SIN bloques de código markdown (nada de \`\`\`):
[{"label": "Día 1", "exercises": [{"name": "Press Banca", "setsCount": 3, "repRange": "8-10"}]}]

Texto:
"""
${text}
"""`;

  const data = await callGemini(GEMINI_API_KEY.value(), { contents: [{ parts: [{ text: prompt }] }] });
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return { text: rawText };
});
