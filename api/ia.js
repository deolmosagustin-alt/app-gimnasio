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

// BUG FIX DE FONDO (causa real de que esto se rompiera de nuevo): la
// cadena anterior tenía nombres de modelo HARDCODEADOS a mano (incluidos
// varios inventados/adivinados sin confirmar que existieran de verdad,
// tipo "gemini-3.5-flash"/"gemini-3.6-flash") — Google va retirando y
// renombrando modelos con el tiempo, así que cualquier lista fija a mano
// se pudre tarde o temprano, sin importar qué tan actualizada esté hoy.
// La solución de fondo es dejar de adivinar nombres: "gemini-flash-latest"
// es un alias ROTATIVO que Google mantiene apuntando siempre al modelo
// flash estable vigente (no debería dar 404 nunca), y si aun así falla,
// discoverModels() le pregunta a la propia API de Google qué modelos
// existen HOY para esta cuenta (GET /v1beta/models) en vez de que nosotros
// tengamos que mantener la lista al día a mano.
const PRIMARY_MODEL = "gemini-flash-latest";

// Se recuerda el último modelo que funcionó (mientras el lambda viva) para
// arrancar por ese y no pagar reintentos en cada llamada.
let preferredModel = null;

// Lista de modelos vigentes, descubierta en vivo contra la API de Google
// (no hardcodeada) — cacheada en memoria mientras el lambda esté caliente
// para no pagar esta consulta extra en cada mensaje del chat.
let discoveredModelsCache = null; // { models: string[], fetchedAt: number }
const MODEL_LIST_CACHE_MS = 30 * 60 * 1000;

// BUG FIX (encontrado auditando): a diferencia de callModel(), este fetch
// no tenía NINGÚN timeout — si el endpoint de modelos de Google se cuelga
// (justo el escenario más probable cuando esto se termina llamando: una
// caída/degradación amplia de Gemini), podía consumir todo lo que quedaba
// del presupuesto de tiempo de callGemini e incluso exceder el límite duro
// de Vercel (maxDuration=60s), produciendo exactamente el corte de
// conexión crudo que todo el sistema de presupuesto de tiempo fue pensado
// para evitar.
async function discoverModels(apiKey, timeoutMs = 8000) {
  if (discoveredModelsCache && Date.now() - discoveredModelsCache.fetchedAt < MODEL_LIST_CACHE_MS) {
    return discoveredModelsCache.models;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, { signal: controller.signal });
    if (!res.ok) return discoveredModelsCache?.models || [];
    const data = await res.json();
    const names = (data?.models || [])
      // Sólo modelos que de verdad soportan generar texto/chat — la
      // cuenta también puede tener modelos de embeddings, imagen, audio,
      // etc. que no sirven para esto y sólo desperdiciarían un intento.
      .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
      .map((m) => String(m.name || "").replace(/^models\//, ""))
      .filter((n) => n && /flash/i.test(n) && !/embed|vision|tts|image|aqa/i.test(n));
    // Orden de preferencia: variantes "normales" antes que "-lite" (más
    // capaces), y estables antes que "-exp"/"-preview" (menos garantía de
    // que sigan disponibles mañana) — dentro de cada grupo se respeta el
    // orden en que Google las devolvió (suele ser el más nuevo primero).
    const rank = (n) => (/-lite/i.test(n) ? 2 : 0) + (/-(exp|preview)/i.test(n) ? 1 : 0);
    names.sort((a, b) => rank(a) - rank(b));
    discoveredModelsCache = { models: names, fetchedAt: Date.now() };
    return names;
  } catch (err) {
    console.error("[ia] No se pudo consultar la lista de modelos vigentes:", err?.message || err);
    return discoveredModelsCache?.models || [];
  } finally {
    clearTimeout(timer);
  }
}

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
  // BUG FIX (encontrado auditando): sin esto, cada IP que alguna vez pegó
  // acá quedaba como una entrada del Map PARA SIEMPRE (incluso vacía tras
  // el filter de arriba) — una fuga de memoria lenta pero indefinida
  // mientras la instancia serverless siga caliente. Se limpia el Map cada
  // tanto para no acumular IPs viejas sin actividad reciente.
  if (requestLog.size > 5000) {
    for (const [key, ts] of requestLog) {
      if (!ts.some((t) => now - t < RATE_LIMIT_WINDOW_MS)) requestLog.delete(key);
    }
  }
  return false;
}

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

// BUG FIX (reporte: "la IA falla a veces, además es algo lenta"). El
// problema medido: para saber si un modelo se había COLGADO, al primer
// intento se le daba un techo de 12s. Pero con el lambda caliente la
// cadena arranca con el modelo que ya funcionó (preferredModel), que
// además suele ser el mismo que PRIMARY_MODEL — o sea, la cadena tenía UN
// solo elemento y ese único intento quedaba capado a 12s. Cualquier
// respuesta legítima de más de 12s (el chat con el contexto entero, una
// rutina completa, un plan de 8 semanas) se abortaba a mitad, se pagaban
// hasta 8s más de discoverModels() y recién ahí se empezaba de nuevo con
// otro modelo. Eso es a la vez la lentitud ("tarda el doble") y la falla
// ("se agotó el tiempo probando modelos").
//
// La raíz era no poder distinguir "colgado" de "tardando". Con
// streamGenerateContent sí se puede: un modelo vivo manda el primer chunk
// en uno o dos segundos y después sigue. Así que el reloj corto pasa a
// medir sólo el PRIMER BYTE, y una vez que empezó a llegar texto se le
// deja todo el presupuesto que quede. Un modelo colgado se detecta igual
// de rápido que antes; uno que simplemente tarda ya no se mata.
//
// Devuelve { ok, data } | { ok:false, status, detail }. `data` tiene la
// misma forma que traía generateContent, así que el resto del archivo y
// el cliente no se enteran del cambio.
async function callModelStreaming(model, body, apiKey, { ttfbMs, totalMs }) {
  const controller = new AbortController();
  let recibioAlgo = false;
  let motivoCorte = null;
  // Red de seguridad: abortar el AbortController DEBERÍA cortar también la
  // lectura del cuerpo, pero si por lo que sea no se propaga (un proxy que
  // deja el socket abierto sin mandar nada, un runtime que no encadena la
  // señal al stream), el `await reader.read()` de abajo se queda esperando
  // para siempre y la función vive hasta que Vercel la mata a los 60s —
  // justo el corte de conexión crudo, sin mensaje, que todo el presupuesto
  // de tiempo existe para evitar. Cada lectura corre contra este reloj.
  let dispararCorte;
  const corte = new Promise((_, rej) => { dispararCorte = rej; });
  corte.catch(() => {}); // sin esto, cortar tras haber terminado bien deja un rechazo sin manejar
  const abortar = (motivo) => {
    motivoCorte = motivo;
    controller.abort();
    dispararCorte(new Error(motivo));
  };
  const ttfbTimer = setTimeout(() => { if (!recibioAlgo) abortar("sin respuesta"); }, ttfbMs);
  const totalTimer = setTimeout(() => abortar("tiempo total"), totalMs);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, status: res.status, detail };
    }
    if (!res.body) return { ok: false, status: 0, detail: "respuesta sin cuerpo" };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let texto = "";
    let finishReason = null;
    const groundingChunks = [];
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), corte]);
      if (done) break;
      recibioAlgo = true;
      clearTimeout(ttfbTimer);
      buffer += decoder.decode(value, { stream: true });
      // SSE: eventos separados por línea en blanco, cada uno con "data: {...}"
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const linea = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!linea.startsWith("data:")) continue;
        const crudo = linea.slice(5).trim();
        if (!crudo || crudo === "[DONE]") continue;
        let json;
        try { json = JSON.parse(crudo); } catch { continue; }
        const cand = json?.candidates?.[0];
        // BUG FIX (encontrado en la misma auditoría): acá y en el handler se
        // leía SÓLO parts[0].text. Gemini parte las respuestas largas en
        // varios `parts`, así que una respuesta larga llegaba cortada al
        // primer fragmento y se veía como "la IA contestó a medias".
        (cand?.content?.parts || []).forEach((p) => { if (typeof p.text === "string") texto += p.text; });
        if (cand?.finishReason) finishReason = cand.finishReason;
        (cand?.groundingMetadata?.groundingChunks || []).forEach((c) => groundingChunks.push(c));
      }
    }
    return { ok: true, data: { candidates: [{ content: { parts: [{ text: texto }] }, finishReason, groundingMetadata: { groundingChunks } }] } };
  } catch (err) {
    const e = new Error(motivoCorte ? `abortado (${motivoCorte})` : String(err?.message || err));
    e.sinRespuesta = motivoCorte === "sin respuesta";
    throw e;
  } finally {
    clearTimeout(ttfbTimer);
    clearTimeout(totalTimer);
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

  // Cadena de intento: primero el que funcionó la última vez (si lo hay,
  // cacheado mientras el lambda esté caliente) y el alias rotativo de
  // Google — sólo si AMBOS fallan se paga la consulta extra de
  // discoverModels() para sumar el resto de los modelos vigentes reales,
  // en vez de pagar esa consulta de más en cada mensaje del chat.
  const chain = [];
  if (preferredModel) chain.push(preferredModel);
  if (!chain.includes(PRIMARY_MODEL)) chain.push(PRIMARY_MODEL);
  let discoveryTried = false;
  const deadline = Date.now() + TOTAL_TIME_BUDGET_MS;

  // BUG FIX (diagnóstico): antes el mensaje final sólo miraba el status del
  // ÚLTIMO modelo probado — si los primeros intentos daban 429 (cuota
  // agotada) pero el ÚLTIMO de la cadena ya no existe más y da 404, el
  // usuario veía el mensaje genérico ("no disponible") en vez de enterarse
  // de que el problema real era la cuota. Ahora se recuerda si CUALQUIER
  // intento dio 429, sin importar cuál fue el último.
  let lastStatus = null, lastDetail, ranOutOfTime = false, sawQuotaExhausted = false;
  let i = 0;
  while (i < chain.length) {
    const model = chain[i];
    const remaining = deadline - Date.now();
    // Sin tiempo útil para otro intento: cortar ACÁ con un error prolijo
    // en vez de arrancar un pedido que casi seguro Vercel va a interrumpir
    // a la fuerza antes de que responda (eso es lo que el cliente vería
    // como un corte de conexión crudo, sin mensaje).
    if (remaining < MIN_USEFUL_ATTEMPT_MS) { ranOutOfTime = true; break; }
    // El reloj corto mide sólo el PRIMER BYTE (ver callModelStreaming): un
    // modelo colgado se detecta igual de rápido que antes, pero uno que
    // simplemente está tardando ya no se mata a mitad de la respuesta.
    // Antes este techo de 12s se le aplicaba al intento 0 ENTERO y, con el
    // lambda caliente, el intento 0 es el único que hay (la cadena arranca
    // con el modelo que ya funcionó, que suele ser el mismo PRIMARY_MODEL):
    // toda respuesta legítima de más de 12s se abortaba y se empezaba de
    // nuevo. Eso era a la vez la lentitud y la falla que se reportaron.
    let res = null;
    try {
      res = await callModelStreaming(model, body, apiKey, {
        ttfbMs: Math.min(12000, remaining),
        totalMs: remaining,
      });
    } catch (netErr) {
      lastStatus = 0; lastDetail = String(netErr?.message || netErr);
      console.error(`[ia] ${model}: ${netErr?.sinRespuesta ? "no mandó nada en 12s (colgado)" : "fallo de red/timeout"} →`, lastDetail);
    }
    if (res?.ok) {
      preferredModel = model;
      return res.data;
    }
    let stopEntirely = false;
    if (res) {
      lastStatus = res.status;
      if (lastStatus === 429) sawQuotaExhausted = true;
      lastDetail = res.detail || "";
      console.error(`[ia] ${model} devolvió ${lastStatus}:`, lastDetail.slice(0, 300));
      // 404 = el alias ya no existe · 429 = cuota agotada de ESE modelo ·
      // 500/503 = sobrecarga puntual. En todos, vale la pena el siguiente.
      // 400/401/403: el problema no es del modelo (key inválida, pedido mal
      // formado) — no tiene sentido seguir probando modelos distintos.
      stopEntirely = ![404, 429, 500, 503].includes(lastStatus);
    }
    i++;
    if (stopEntirely) break;
    // Se acabó la cadena conocida sin éxito: antes de rendirnos, sumar los
    // modelos vigentes REALES descubiertos contra la propia API de Google
    // (una sola consulta por pedido, cacheada entre pedidos).
    if (i >= chain.length && !discoveryTried) {
      discoveryTried = true;
      // Se le da sólo el tiempo que REALMENTE queda del presupuesto total
      // (nunca más de 8s) — si ya no queda margen útil, directamente no se
      // intenta y el bucle corta abajo por "ranOutOfTime" con un error
      // prolijo, en vez de arriesgarse a un fetch sin cortar a tiempo.
      const remainingForDiscovery = deadline - Date.now();
      if (remainingForDiscovery > 2000) {
        const discovered = await discoverModels(apiKey, Math.min(8000, remainingForDiscovery));
        discovered.forEach((m) => { if (!chain.includes(m)) chain.push(m); });
      }
    }
  }

  const e = new Error(ranOutOfTime ? "Se agotó el tiempo disponible probando modelos" : `Todos los modelos fallaron (último: ${lastStatus})`);
  if (ranOutOfTime) e.userMessage = "La IA está respondiendo lento ahora mismo. Probá de nuevo en un momento.";
  else if (sawQuotaExhausted) e.userMessage = "La IA alcanzó el límite de uso gratuito por hoy. Probá de nuevo en un rato o mañana.";
  // Google devuelve 400 (no sólo 401/403) cuando la API key es inválida o
  // le falta habilitar la API de Gemini en el proyecto de Google Cloud —
  // antes esto cliaba directo al mensaje genérico, sin pistas de qué mirar.
  else if (lastStatus === 400 || lastStatus === 401 || lastStatus === 403) e.userMessage = "La clave de la IA no es válida, no tiene permisos, o el pedido está mal formado (revisá GEMINI_API_KEY en Vercel y que la API de Gemini esté habilitada en ese proyecto de Google Cloud).";
  else if (lastStatus === 0) e.userMessage = "No se pudo conectar con la IA (timeout). Probá de nuevo.";
  // Incluye el código real: antes era imposible saber, desde afuera, si el
  // problema era un modelo dado de baja (404), sobrecarga (503) u otra
  // cosa — con el código a la vista alcanza para buscarlo en los logs de
  // la función en Vercel sin tener que instrumentar nada de nuevo.
  else e.userMessage = `La IA no está disponible en este momento (código ${lastStatus}). Probá de nuevo en unos minutos.`;
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
      // Se unen TODAS las partes: Gemini parte las respuestas largas en
      // varios `parts` y leer sólo el primero dejaba la respuesta cortada a
      // mitad de frase, que se veía como "la IA contesta cualquier cosa".
      const text = (candidate?.content?.parts || []).map((p) => p?.text || "").join("");
      // Respuesta vacía con un motivo declarado (filtro de seguridad, tope
      // de tokens, recitación): antes el cliente recibía un texto vacío sin
      // ninguna explicación y mostraba un error genérico o nada.
      if (!text.trim() && candidate?.finishReason && candidate.finishReason !== "STOP") {
        const motivos = {
          SAFETY: "La IA bloqueó su propia respuesta por sus filtros de seguridad. Probá reformular la pregunta.",
          RECITATION: "La IA cortó la respuesta para no reproducir contenido con derechos. Probá pedírselo de otra forma.",
          MAX_TOKENS: "La respuesta se pasó de largo y quedó cortada. Pedile algo más acotado.",
        };
        res.status(502).json({ error: motivos[candidate.finishReason] || `La IA cortó la respuesta (${candidate.finishReason}).` });
        return;
      }
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
      // BUG FIX (encontrado auditando): el texto del usuario se pega tal
      // cual entre delimitadores """ más abajo — si ese texto trae su
      // propia secuencia """, podría "cerrar" el bloque antes de tiempo y
      // colar instrucciones propias que el modelo interprete como parte
      // del prompt original (impacto bajo: la app igual valida la forma
      // del JSON que devuelve después, pero es una capa de defensa barata).
      const truncated = hasText ? text.substring(0, 100000).replace(/"""/g, "'''") : "";
      const promptLines = [
        safeImages.length
          ? "Analizá la rutina de entrenamiento en las imágenes y/o el texto que te paso a continuación y extraé la rutina COMPLETA."
          : "Analizá el siguiente texto y extraé la rutina de entrenamiento completa.",
        // BUG FIX (pedido: "que se asegure de interpretarlo lo mejor
        // posible"): sin esto, ante una foto borrosa, manuscrita, mal
        // encuadrada o un texto desordenado, el modelo tendía a devolver
        // un array vacío o rechazar la respuesta en vez de arriesgar una
        // interpretación parcial — la app sólo podía mostrar "no pudimos
        // detectar nada" sin ningún punto de partida para corregir.
        "Hacé SIEMPRE tu mejor esfuerzo de interpretación, incluso si la foto está borrosa, mal encuadrada, es una letra manuscrita difícil, o el texto está desordenado o incompleto — nunca devuelvas un array vacío si hay AUNQUE SEA UN ejercicio reconocible. Interpretar de más (con dudas) es mejor que no interpretar nada.",
        "Devolvé ÚNICAMENTE un array JSON válido (sin texto adicional, sin markdown):",
        '[{"label": "Push", "exercises": [{"name": "Press Banca", "setsCount": 3, "repRange": "8-10"}]}]',
        "",
        "Reglas:",
        '- "label": nombre del día/sesión (Push, Pull, Legs, Día 1, Pecho, etc.)',
        '- "name": nombre completo del ejercicio en español. Si es TOTALMENTE ilegible o no se puede determinar de ninguna forma, dejalo como cadena vacía "" en vez de inventar un nombre sin relación con lo que ves — la app se lo va a preguntar directo a la persona.',
        '- "setsCount": cantidad de series (1-8)',
        '- "repRange": rango de reps (ej: "8-10", "6-8", "5", "20")',
        '- "3x8-10" o "3 series 8-10 reps" → setsCount=3, repRange="8-10"',
        "- Incluí TODOS los ejercicios que puedas identificar, no omitas ninguno",
        '- Cardio (cinta, bici, elíptica): repRange = minutos (ej: "30")',
        // Antes se le pedía "completalo vos" con un valor típico cuando
        // faltaba esto — la app nunca se enteraba de que era un valor
        // inventado y no había forma de que la persona lo revisara. Ahora
        // se omite el campo directamente: el cliente detecta el hueco y
        // pregunta, en vez de guardar un número adivinado en silencio.
        '- Si a un ejercicio le falta CLARAMENTE la cantidad de series y/o el rango de reps (no está escrito, no se lee, y no podés inferirlo con confianza del contexto — ej. mismo tipo de ejercicio con el mismo esquema en otro día), OMITÍ por completo esa clave ("setsCount" y/o "repRange") del objeto en vez de inventar un número. No adivines "por las dudas": omitir es preferible a un dato falso.',
      ];
      if (safeImages.length > 1 || (safeImages.length && hasText)) {
        promptLines.push('- Puede que te pasen varias imágenes o fragmentos de texto por separado (por ejemplo, una foto por día de la rutina) — son partes de LA MISMA rutina: combiná todo en un solo array de días, no los proceses como rutinas independientes.');
      }
      if (hasText) { promptLines.push("", "Texto:", '"""', truncated, '"""'); }
      const parts = [{ text: promptLines.join("\n") }];
      safeImages.forEach((img) => { parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } }); });
      const data = await callGemini({ contents: [{ parts }] });
      // Ídem: las rutinas largas vienen en varias partes (ver arriba).
      const rawText = (data?.candidates?.[0]?.content?.parts || []).map((p) => p?.text || "").join("");
      res.status(200).json({ text: rawText });
      return;
    }

    res.status(400).json({ error: "Acción no reconocida." });
  } catch (err) {
    console.error("Error en /api/ia:", err);
    res.status(500).json({ error: err.userMessage || "Error en el servidor." });
  }
}
