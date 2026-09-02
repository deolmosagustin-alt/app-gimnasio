// Helpers puros y sin dependencias de estado de la app — primer paso de
// separar App.jsx (que concentraba todo el código de la app en un único
// archivo) en módulos más chicos. Estas funciones no usan React ni tocan
// ROUTINE/DAY_ORDER/perfil — son las más seguras de mover primero.

export const yt = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

export function mkSets(n, repRange) { return Array.from({ length: n }, () => ({ repRange })); }

// Mezcla un color hexadecimal hacia gris para obtener una versión más tenue
// (menos saturada) — se usa en las iniciales de día (P/P/P/H, etc.) tanto en
// Rutinas como en las etiquetas de día del Historial de Progreso, para que
// no griten tanto.
export function muteHexColor(hex, towardsGray = 0.45) {
  try {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
    const gray = (r + g + b) / 3;
    const mr = Math.round(r + (gray - r) * towardsGray);
    const mg = Math.round(g + (gray - g) * towardsGray);
    const mb = Math.round(b + (gray - b) * towardsGray);
    return `#${mr.toString(16).padStart(2, "0")}${mg.toString(16).padStart(2, "0")}${mb.toString(16).padStart(2, "0")}`;
  } catch { return hex; }
}

export function cloneRoutineDef(def) { return JSON.parse(JSON.stringify(def)); }

// Clave de comparación para "sugerir amigos de mis contactos" — sin saber
// el país de cada número (ni el tuyo ni el de tus contactos), no hay forma
// de armar un E.164 real y confiable. En vez de eso, nos quedamos con los
// últimos 9 dígitos: alcanza para no confundir números distintos (dos
// celulares casi nunca comparten los últimos 9), pero tolera diferencias de
// código de país, "0" o "9" inicial y separadores, que son la variación más
// común entre "cómo lo guardaste vos" y "cómo lo guardó la otra persona".
// null = no hay suficientes dígitos como para ser un número real (evita
// matchear cosas cortas tipo "123" contra sí mismas).
export function normalizePhoneForMatching(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-9);
}

// La clave de arriba son 9 dígitos reales de un teléfono — antes de mandarla
// a un documento público de Firestore (phoneIndex) la hasheamos, así el ID
// del documento no queda como una serie de dígitos reconocible. Sigue
// siendo determinística (mismo teléfono → mismo hash), que es lo único que
// hace falta para que el matching funcione.
export async function hashPhoneKey(normalizedKey) {
  const bytes = new TextEncoder().encode(normalizedKey);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Debounce util — devuelve una versión de la función que se llama como
// máximo una vez cada `ms` ms, ignorando las llamadas intermedias.
export function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Conversión de peso: en la app todo se guarda en kg (los logs, los récords),
// pero si el usuario eligió "lbs" mostramos los valores convertidos.
// kgToDisplay: convierte kg → unidad del usuario para MOSTRAR en pantalla.
// displayToKg: convierte lo que escribe el usuario → kg para GUARDAR.
export const KG_TO_LBS = 2.20462;
export function kgToDisplay(kg, unit) { return unit === "lbs" ? Math.round(kg * KG_TO_LBS * 4) / 4 : kg; } // redondea a 0.25lbs
export function displayToKg(val, unit) { return unit === "lbs" ? Math.round((val / KG_TO_LBS) * 4) / 4 : val; }
export function weightLabel(unit) { return unit === "lbs" ? "lbs" : "kg"; }

export function rpeColor(v) {
  if (v == null) return "#475569";
  if (v >= 9) return "#F43F5E";
  if (v >= 8) return "#F59E0B";
  if (v >= 7) return "#14B8A6";
  return "#3B82F6";
}

export function haptic(pattern = 25) {
  try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern); } catch { /* ignorado a propósito */ }
}

// Todas las fechas de calendario de la app deben pasar por acá (nunca por
// toISOString(), que corre en UTC y puede correr un día para adelante/atrás
// según la zona horaria del dispositivo).
export function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function todayStr() { return localDateStr(new Date()); }
export function formatTime(s) { return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`; }
export function vol(kg, reps) { return (!kg || !reps) ? 0 : kg * reps; }
export function estimate1RM(kg, reps) { return (!kg || !reps) ? 0 : Math.round(kg * (1 + reps / 30) * 10) / 10; }
export function repRangeTop(repRange) { const parts = String(repRange).split("-"); return parseInt(parts[parts.length - 1], 10); }
// Detecta series de fuerza automáticamente: si el techo del rango de
// repeticiones es 6 o menos, se la considera "FUERZA" — sin que nadie tenga
// que marcarla a mano al crear la rutina.
export function isHeavyRepRange(repRange) { const top = repRangeTop(repRange); return !isNaN(top) && top <= 6; }

// ── TINTES DE COLOR SEGÚN TEMA ───────────────────────────────────────────
// Toda la app arma sus "badges"/íconos/bordes con el patrón `accent + "NN"`
// (un color hex + un sufijo de 2 dígitos de alfa, ej. "#14B8A6" + "18" =
// ~9% de opacidad). Ese nivel de transparencia se pensó para leerse como un
// brillo suave sobre fondo casi negro — sobre blanco, el mismo 9% de un
// color se percibe como un lavado casi imperceptible, porque alfa-blending
// con blanco da un resultado mucho más parecido al blanco que alfa-blending
// con negro. No hay forma de arreglar esto por CSS (el color final es un
// valor calculado en JS, embebido como estilo inline; ninguna regla de
// hoja de estilos puede "adivinar" a qué color debe ganarle sin romper la
// diferenciación entre accents distintos). tint() intensifica el alfa en
// modo claro con una curva raíz cuadrada — sube mucho los valores bajos
// (los que más se lavaban) y cada vez menos a medida que el original ya
// era bastante visible — y deja el modo oscuro sin tocar.
let IS_LIGHT_THEME = false;
export function setThemeMode(isLight) { IS_LIGHT_THEME = !!isLight; }

export function tint(hex, alphaHex) {
  if (!IS_LIGHT_THEME || typeof hex !== "string" || !hex.startsWith("#")) return hex + alphaHex;
  const a = parseInt(alphaHex, 16);
  if (isNaN(a)) return hex + alphaHex;
  const boosted = Math.round(Math.sqrt(a / 255) * 255);
  return hex + boosted.toString(16).padStart(2, "0");
}
