/**
 * api/ia.js — función serverless de Vercel
 *
 * Maneja dos acciones:
 *  - { action: "chat", systemPrompt, history }            → chat del Entrenador IA
 *  - { action: "detect", text, images }                    → importar rutina con IA
 *    `images` es opcional: array de { mimeType, data } (base64, sin el
 *    prefijo "data:...;base64,") — fotos de la rutina, hasta 8. Gemini las
 *    lee directo (multimodal), así que funciona con texto, fotos, o ambos
 *    a la vez (por ejemplo, varias fotos que juntas son la rutina completa).
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

// Rate limit básico por IP: sin esto, cualquiera que conozca la URL puede
// pegarle directo al endpoint (sin pasar por la app) y agotar la cuota
// gratuita de Gemini. No es a prueba de balas (cada instancia serverless
// tiene su propio Map en memoria, y se pierde si la función se enfría),
// pero frena el abuso más obvio de una misma IP mientras el lambda esté
// caliente, que es el caso común.
// BUG FIX: 20 pedidos/10min se agotaba con una sesión de chat activa
// normal (cada mensaje es un pedido) o al importar una rutina con varias
// fotos (cada reintento/regeneración suma) — un uso legítimo terminaba
// bloqueado por su propio límite, mostrando "la IA no responde" sin que
// tuviera nada que ver con Gemini. Subido a un valor más generoso; sigue
// frenando el abuso obvio de una IP desconocida pegándole directo a la
// URL sin pasar por la app.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 60;
const requestLog = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    requestLog.set(ip, timestamps);
    return true;
  }
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return false;
}

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

async function callModel(model, body, apiKey, timeoutMs) {
  const controller = new AbortController();
  // Hasta 50s: las respuestas LARGAS (rutinas completas) en el free tier
  // tardan 30-50s. Con 25s las matábamos a mitad de generación — por eso
  // "hola" funcionaba y los pedidos grandes no. Los errores de modelo
  // (404/429) responden en milisegundos, así que el timeout largo no los
  // demora. `timeoutMs` viene acotado por callGemini para que la cadena
  // de reintentos completa nunca exceda el límite de Vercel (ver abajo).
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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

// Techo total de la cadena de reintentos, por debajo del maxDuration real
// de Vercel (60s, ver más abajo). Antes cada modelo se probaba con 50s
// fijos sin mirar cuánto tiempo ya se había gastado: si dos modelos
// seguidos tardaban ~30-40s cada uno en responder (red lenta, no un error
// limpio), la función entera pasaba los 60s y Vercel la mataba a la
// fuerza — el cliente recibía un corte de conexión crudo en vez de un
// error prolijo, que es probablemente el origen de varios "la IA no
// responde" sin explicación. Ahora cada intento sólo recibe el tiempo que
// REALMENTE queda antes del techo, y si no queda margen razonable para
// otro intento, se corta con un error claro en vez de arrancar un pedido
// que Vercel va a interrumpir a mitad de camino igual.
const TOTAL_TIME_BUDGET_MS = 55000;
const MIN_USEFUL_ATTEMPT_MS = 8000;

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
  const deadline = Date.now() + TOTAL_TIME_BUDGET_MS;

  let lastStatus = null, lastDetail, ranOutOfTime = false;
  for (const model of chain) {
    const remaining = deadline - Date.now();
    // Sin tiempo útil para otro intento: cortar ACÁ con un error prolijo
    // en vez de arrancar un pedido que casi seguro Vercel va a interrumpir
    // a la fuerza antes de que responda (eso es lo que el cliente vería
    // como un corte de conexión crudo, sin mensaje).
    if (remaining < MIN_USEFUL_ATTEMPT_MS) { ranOutOfTime = true; break; }
    let response;
    try {
      response = await callModel(model, body, apiKey, Math.min(50000, remaining));
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

  const e = new Error(ranOutOfTime ? "Se agotó el tiempo disponible probando modelos" : `Todos los modelos fallaron (último: ${lastStatus})`);
  if (ranOutOfTime) e.userMessage = "La IA está respondiendo lento ahora mismo. Probá de nuevo en un momento.";
  else if (lastStatus === 429) e.userMessage = "La IA alcanzó el límite de uso gratuito por hoy. Probá de nuevo en un rato o mañana.";
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

  if (isRateLimited(getClientIp(req))) {
    res.status(429).json({ error: "Demasiados pedidos. Esperá unos minutos y probá de nuevo." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  try {
    if (body.action === "chat") {
      const { systemPrompt, history } = body;
      if (typeof systemPrompt !== "string" || !Array.isArray(history)) {
        res.status(400).json({ error: "Faltan datos para procesar el pedido." }); return;
      }
      // BUG FIX: 60.000 caracteres (~15.000 tokens) era un límite propio
      // arbitrario, muy por debajo de lo que estos modelos realmente
      // soportan (ventana de contexto de 1M tokens en gemini-1.5/2.0/2.5-
      // flash). Con el análisis de entrenamiento + varias rutinas + el
      // historial de series de un perfil activo, el systemPrompt superaba
      // ese piso con facilidad — y en vez de simplemente tardar más, el
      // pedido se rechazaba de entrada con "El mensaje es demasiado largo",
      // que en el chat se veía como una respuesta rota. 400.000 caracteres
      // (~100.000 tokens) sigue siendo una fracción chica de la ventana real
      // y ya alcanza de sobra para cualquier perfil real; sigue actuando de
      // freno ante un abuso directo del endpoint (alguien mandando un texto
      // gigante a mano, sin pasar por la app).
      if (systemPrompt.length > 400000 || JSON.stringify(history).length > 100000) {
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
      const { text, images } = body;
      const hasText = typeof text === "string" && text.trim().length > 0;
      const safeImages = Array.isArray(images)
        ? images.filter((img) => img && typeof img.data === "string" && typeof img.mimeType === "string").slice(0, 8)
        : [];
      if (!hasText && !safeImages.length) {
        res.status(400).json({ error: "Falta el texto o las fotos de la rutina." }); return;
      }
      // 100.000 caracteres (antes 25.000): con varios archivos combinados
      // (varias hojas de Excel, PDFs de varias páginas, varios .txt) el texto
      // junto supera fácil el límite viejo y se cortaba la rutina a la mitad.
      // Los modelos de la cadena aguantan de sobra este tamaño de contexto.
      const truncated = hasText ? text.substring(0, 100000) : "";
      const promptLines = [
        safeImages.length
          ? "Analizá la rutina de entrenamiento en las imágenes y/o el texto que te paso a continuación y extraé la rutina COMPLETA."
          : "Analizá el siguiente texto y extraé la rutina de entrenamiento completa.",
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
        '- Si a un ejercicio le falta la cantidad de series y/o el rango de reps (no está escrito o no se lee bien en la foto), COMPLETALO vos con un valor típico y razonable en vez de dejarlo vacío o en 0 — 3 series de 8-10 reps para ejercicios normales, 3-4 series de 4-6 reps si es claramente un movimiento pesado/compuesto (press banca, sentadilla, peso muerto, etc. con pocas reps indicadas).',
      ];
      if (safeImages.length > 1 || (safeImages.length && hasText)) {
        promptLines.push('- Puede que te pasen varias imágenes o fragmentos de texto por separado (por ejemplo, una foto por día de la rutina) — son partes de LA MISMA rutina: combiná todo en un solo array de días, no los proceses como rutinas independientes.');
      }
      if (hasText) { promptLines.push("", "Texto:", '"""', truncated, '"""'); }
      const parts = [{ text: promptLines.join("\n") }];
      safeImages.forEach((img) => { parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } }); });
      const data = await callGemini({ contents: [{ parts }] });
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
