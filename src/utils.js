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
