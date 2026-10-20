// BUSCAR EJERCICIOS COMO LOS ESCRIBE LA GENTE.
//
// Antes el buscador del armado de rutinas comparaba el texto tal cual: si no
// escribías el nombre exacto, con sus tildes y en su orden, no aparecía nada
// ("press de banca", "sentadillas", "jalon" o "biseps" daban "Sin
// resultados"). Una queja de usuarios. Ahora:
//
// - sin tildes, mayúsculas ni signos, y las palabras en cualquier orden;
// - "de", "con", "la"… no cuentan;
// - el plural y la palabra a medio escribir ("sentadillas", "sent");
// - un error de tipeo en palabras cortas y dos en las largas ("biseps",
//   "press vanca", "sentadiya");
// - los nombres en inglés y los del gimnasio ("bench press", "jalón al pecho"
//   es la dorsalera, "camilla" es el curl femoral, "sillón" es la extensión
//   de cuádriceps);
// - y el músculo: "tríceps", "pecho" o "piernas" traen esos ejercicios
//   (después de los que lo llevan en el nombre).
//
// Son funciones puras sobre el catálogo de data.js: las usan el buscador del
// armado de rutinas, la importación de rutinas y las acciones del Chatbot.
import { EXERCISE_LIBRARY, MUSCLE_GROUPS } from "./data.js";

export function normalizarTexto(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "con", "en", "a", "al", "y", "o", "para", "por", "un", "una", "tipo", "the", "of", "with"]);
const SIN_PLURAL = new Set(["biceps", "triceps", "cuadriceps", "press", "abs", "deltoides", "plus"]);

// El singular aproximado: "sentadillas" → "sentadilla", "dorsales" →
// "dorsal", "extensiones" → "extension". Alcanza para comparar.
function raiz(t) {
  if (SIN_PLURAL.has(t) || t.length <= 3) return t;
  if (t.length > 5 && /[lrnd]es$/.test(t)) return t.slice(0, -2);
  if (t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

// Frases que se reemplazan enteras antes de separar las palabras: los
// nombres en inglés y los apodos del gimnasio.
const FRASES = [
  ["bench press", "press banca"],
  ["pull ups", "dominada"], ["pull up", "dominada"], ["pullups", "dominada"], ["pullup", "dominada"],
  ["chin ups", "dominada supina"], ["chin up", "dominada supina"],
  ["push ups", "flexion"], ["push up", "flexion"], ["pushups", "flexion"], ["pushup", "flexion"],
  ["lat pulldown", "jalon"], ["jalon al pecho", "jalon"], ["polea al pecho", "jalon"],
  ["leg press", "prensa"],
  ["leg curl", "curl femoral"], ["camilla", "curl femoral"],
  ["leg extension", "extension cuadriceps"], ["sillon de cuadriceps", "extension cuadriceps"], ["sillon", "extension cuadriceps"],
  ["lateral raises", "elevacion lateral"], ["lateral raise", "elevacion lateral"],
  ["front raises", "elevacion frontal"], ["front raise", "elevacion frontal"],
  ["overhead press", "press militar"], ["shoulder press", "press militar"],
  ["deadlift", "peso muerto"], ["rdl", "peso muerto rumano"],
  ["empuje de cadera", "hip thrust"], ["puente de cadera", "hip thrust"],
  ["calf raises", "elevacion talon"], ["calf raise", "elevacion talon"], ["puntas de pie", "talon"], ["punta de pie", "talon"],
  ["remo al menton", "remo al cuello"], ["upright row", "remo al cuello"],
  ["skull crusher", "rompecraneos"], ["skullcrusher", "rompecraneos"],
  ["farmer walk", "paseo granjero"], ["farmers walk", "paseo granjero"],
  ["cruce de cables", "cruce de poleas"],
].map(([de, a]) => [new RegExp(`(^| )${de}(?= |$)`, "g"), ` ${a} `]);

// Palabras que dicen lo mismo (ya en singular y sin tildes).
const SINONIMOS = [
  ["banca", "banco", "bench", "plano"],
  ["sentadilla", "squat"],
  ["dominada", "pullup", "chin"],
  ["jalon", "pulldown", "dorsalera"],
  ["remo", "row"],
  ["fondo", "dip", "paralela"],
  ["zancada", "estocada", "lunge", "desplante"],
  ["bulgara", "bulgarian"],
  ["vuelo", "elevacion", "raise"],
  ["militar", "overhead", "ohp"],
  ["mancuerna", "dumbbell", "db"],
  ["barra", "barbell"],
  ["polea", "cable"],
  ["maquina", "machine"],
  ["smith", "multipower"],
  ["abdominal", "abdomen", "ab", "crunch"],
  ["plancha", "plank"],
  ["talon", "gemelo", "pantorrilla", "calf"],
  ["gluteo", "cola", "glute"],
  ["cuadriceps", "cuadricep", "quad", "cuadri"],
  ["femoral", "isquio", "isquiotibial", "hamstring"],
  ["pecho", "pectoral", "chest"],
  ["hombro", "deltoide", "deltoides", "shoulder", "delt"],
  ["espalda", "dorsal", "back"],
  ["cinta", "caminadora", "treadmill", "trotadora"],
  ["bicicleta", "bici", "bike", "spinning"],
  ["eliptico", "eliptica", "elliptical"],
  ["soga", "comba"],
  ["encogimiento", "shrug"],
  ["trineo", "sled"],
  ["rompecraneo", "frances", "skullcrusher"],
  ["patada", "kickback"],
  ["apertura", "fly", "flye", "mariposa", "contractora"],
  ["cruce", "crossover"],
  ["flexion", "lagartija"],
  ["abductor", "abduccion"],
  ["aductor", "aduccion"],
  ["scott", "predicador", "preacher"],
  ["martillo", "hammer"],
  ["hiperextension", "lumbar"],
];
const SINONIMOS_DE = new Map();
for (const grupo of SINONIMOS) for (const p of grupo) SINONIMOS_DE.set(p, grupo);

// LAS REGIONES del cuerpo para elegir a mano (los chips del buscador): los
// veinte grupos musculares del catálogo eran demasiados para buscar.
export const REGIONES_BUSCADOR = [
  { key: "pecho", label: "Pecho", grupos: ["pectoral_medio", "pectoral_superior"], palabras: ["pecho", "pectoral"] },
  { key: "espalda", label: "Espalda", grupos: ["dorsales", "trapecio", "espalda_baja"], palabras: ["espalda", "dorsal", "trapecio", "lumbar"] },
  { key: "hombros", label: "Hombros", grupos: ["deltoide_anterior", "deltoide_lateral", "deltoide_posterior"], palabras: ["hombro", "deltoide"] },
  { key: "brazos", label: "Brazos", grupos: ["biceps", "triceps", "antebrazos"], palabras: ["brazo", "biceps", "triceps", "antebrazo"] },
  { key: "piernas", label: "Piernas", grupos: ["cuadriceps", "femoral", "gluteo", "aductores", "pantorrillas", "tibial_anterior"], palabras: ["pierna", "cuadriceps", "femoral", "gluteo", "aductor", "pantorrilla", "gemelo", "tibial"] },
  { key: "core", label: "Core", grupos: ["core", "oblicuos"], palabras: ["core", "abdominal", "abdomen", "oblicuo"] },
  { key: "cardio", label: "Cardio", grupos: ["cardio"], palabras: ["cardio"] },
];
const REGION_DE_GRUPO = {};
for (const r of REGIONES_BUSCADOR) for (const g of r.grupos) REGION_DE_GRUPO[g] = r;
export const regionDeGrupo = (grupo) => REGION_DE_GRUPO[grupo] || null;

// Las palabras de una consulta: normalizadas, sin las vacías, en singular.
export function palabrasDe(texto) {
  let t = ` ${normalizarTexto(texto)} `;
  for (const [re, a] of FRASES) t = t.replace(re, (m, antes) => `${antes}${a.trim()}`);
  return t.split(" ").filter((p) => p && !VACIAS.has(p)).map(raiz);
}

// Distancia entre dos palabras contando un cambio, una letra de más o de
// menos y dos letras cambiadas de lugar (Damerau, la versión simple).
function distancia(a, b) {
  const n = a.length, m = b.length;
  if (Math.abs(n - m) > 2) return 3;
  let anterior2 = null, anterior = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const fila = [i];
    for (let j = 1; j <= m; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(anterior[j] + 1, fila[j - 1] + 1, anterior[j - 1] + costo);
      if (anterior2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, anterior2[j - 2] + 1);
      fila.push(v);
    }
    anterior2 = anterior; anterior = fila;
  }
  return anterior[m];
}

// Cuánto se parece una palabra buscada a las palabras de un texto: 10 si
// está igual, 8 si es el principio (a medio escribir), 7 por sinónimo, 6 si
// la buscada es más larga, 4-3 con errores de tipeo; 0 si no está.
function parecido(q, palabras) {
  let mejor = 0;
  const sinonimos = SINONIMOS_DE.get(q) || null;
  for (const t of palabras) {
    if (t === q) return 10;
    if (q.length >= 2 && t.startsWith(q)) mejor = Math.max(mejor, 8);
    else if (sinonimos && sinonimos.includes(t)) mejor = Math.max(mejor, 7);
    else if (t.length >= 4 && q.startsWith(t)) mejor = Math.max(mejor, 6);
  }
  if (mejor) return mejor;
  // Errores de tipeo, sólo en palabras de cuatro letras o más: contra la
  // palabra entera y contra su principio (lo que va escrito).
  if (q.length >= 4) {
    const permitido = q.length >= 7 ? 2 : 1;
    for (const t of palabras) {
      if (t.length < 3) continue;
      const d = Math.min(distancia(q, t), t.length > q.length ? distancia(q, t.slice(0, q.length)) : 9);
      if (d <= permitido) mejor = Math.max(mejor, 5 - d);
    }
  }
  return mejor;
}

// Los básicos, los que más se usan: entre dos que coinciden igual, van
// primero ("sentadillas" trae la sentadilla con barra antes que la sissy).
const BASICOS = new Set([
  "press_banca", "sentadilla_convencional", "peso_muerto", "dominadas", "remo_barra", "press_militar_mancuernas",
  "press_militar_pie_barra", "hip_thrust", "prensa", "dorsalera", "jalon_agarre_neutro", "curl_barra_recta",
  "press_inclinado_mancuernas", "vuelos_laterales_mancuerna", "triceps_polea_alta", "biceps_alternado_mancuerna",
  "extension_cuadriceps", "curl_femoral_acostado", "elevacion_talones_parado", "abdominales", "plancha", "cinta_correr",
  "bicicleta_fija", "zancadas", "fondos_triceps", "peso_muerto_rumano", "remo_maquina_sentado", "face_pull",
  "triceps_frances", "biceps_martillo", "remo_unilateral", "aperturas_mancuerna", "cruce_poleas", "press_inclinado_barra",
  "sentadilla_bulgara_mancuernas", "flexiones", "curl_femoral_maquina",
]);

// Lo que se busca de cada ejercicio, preparado una sola vez: las palabras del
// nombre y las del músculo (el del ejercicio, su grupo y su región).
const ETIQUETA_GRUPO = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g.key, g.label]));
const INDICE = EXERCISE_LIBRARY.map((e) => {
  const region = REGION_DE_GRUPO[e.group];
  return {
    e,
    nombre: normalizarTexto(e.name),
    palabras: palabrasDe(e.name),
    musculo: [...new Set([...palabrasDe(e.muscle), ...palabrasDe(ETIQUETA_GRUPO[e.group]), ...(region ? region.palabras : [])])],
  };
});

// Busca en el catálogo. Devuelve { resultados, parecidos, palabras }:
// resultados son los que tienen todas las palabras (en el nombre o, si no,
// en el músculo), los mejores primero; parecidos, los que tienen la mayoría
// de las palabras, por si te equivocaste en una.
export function buscarEjercicios(texto, limite = 40) {
  const palabras = palabrasDe(texto);
  if (!palabras.length) return { resultados: [], parecidos: [], palabras };
  const unido = palabras.join(" ");
  const puntuados = [];
  for (const item of INDICE) {
    let puntos = 0, acertadas = 0, enNombre = 0;
    for (const q of palabras) {
      const n = parecido(q, item.palabras);
      if (n) { puntos += n; acertadas++; enNombre++; continue; }
      const m = parecido(q, item.musculo);
      if (m) { puntos += Math.min(3, m); acertadas++; }
    }
    if (!acertadas) continue;
    if (item.nombre === unido) puntos += 12;
    else if (enNombre && item.nombre.startsWith(palabras[0])) puntos += 4;
    if (BASICOS.has(item.e.id)) puntos += 4;
    // Entre dos que empatan, el de nombre más corto (el más general).
    puntos -= item.palabras.length * 0.15;
    puntuados.push({ e: item.e, puntos, acertadas, enNombre });
  }
  const orden = (a, b) => b.puntos - a.puntos || a.e.name.length - b.e.name.length;
  const resultados = puntuados.filter((x) => x.acertadas === palabras.length).sort(orden);
  // Con dos palabras alcanza con una ("remo gironda" trae los remos); con
  // más, con la mayoría.
  const minimo = palabras.length >= 3 ? Math.ceil(palabras.length * 0.6) : 1;
  const parecidos = palabras.length > 1 && resultados.length < 3
    ? puntuados.filter((x) => x.acertadas < palabras.length && x.acertadas >= minimo && x.enNombre).sort(orden).slice(0, 8)
    : [];
  return { resultados: resultados.slice(0, limite).map((x) => x.e), parecidos: parecidos.map((x) => x.e), palabras };
}

// El ejercicio del catálogo que mejor corresponde a un nombre escrito por
// alguien (una rutina importada, lo que propone el Chatbot), o null si no
// hay uno claro. Tienen que estar todas las palabras (en el nombre o en el
// músculo: "curl biceps con barra"), salvo una si son tres o más ("sentadilla
// libre con barra"), y al menos la mitad en el nombre.
export function mejorEjercicio(texto) {
  const palabras = palabrasDe(texto);
  if (!palabras.length) return null;
  let mejor = null, mejoresPuntos = 0;
  const unido = palabras.join(" ");
  for (const item of INDICE) {
    let puntos = 0, enNombre = 0, faltan = 0;
    for (const q of palabras) {
      const n = parecido(q, item.palabras);
      if (n) { puntos += n; enNombre++; continue; }
      const m = parecido(q, item.musculo);
      if (m) puntos += Math.min(3, m);
      else faltan++;
    }
    if (faltan > (palabras.length >= 3 ? 1 : 0) || enNombre < Math.ceil(palabras.length / 2)) continue;
    if (item.nombre === unido) puntos += 12;
    if (BASICOS.has(item.e.id)) puntos += 3;
    puntos -= faltan * 4 + Math.max(0, item.palabras.length - palabras.length) * 0.8;
    if (puntos > mejoresPuntos) { mejoresPuntos = puntos; mejor = item.e; }
  }
  return mejor;
}

// Ejercicios parecidos para cambiar uno por otro en el armado: primero los
// del mismo grupo muscular, después los de su región; los básicos antes.
export function alternativasDe(grupo, excluir = [], n = 6) {
  if (!grupo) return [];
  const region = REGION_DE_GRUPO[grupo];
  const fuera = new Set(excluir);
  const puntaje = (e) => (e.group === grupo ? 2 : 0) + (BASICOS.has(e.id) ? 1 : 0);
  return EXERCISE_LIBRARY
    .filter((e) => !fuera.has(e.id) && (e.group === grupo || (region && region.grupos.includes(e.group))))
    .sort((a, b) => puntaje(b) - puntaje(a))
    .slice(0, n);
}

// ¿El nombre de un ejercicio corresponde a lo que se pidió? Para encontrar
// uno entre los de un día ("sacá la sentadilla", "cambiame el jalon").
export function nombreCoincide(nombre, buscado) {
  const a = normalizarTexto(nombre), b = normalizarTexto(buscado);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const palabras = palabrasDe(buscado), delNombre = palabrasDe(nombre);
  return palabras.length > 0 && palabras.every((q) => parecido(q, delNombre) > 0);
}

// Las palabras del nombre que coinciden con la búsqueda, para resaltarlas.
export function partesResaltadas(nombre, palabras) {
  return String(nombre).split(/(\s+)/).map((pedazo) => {
    if (!pedazo.trim()) return { texto: pedazo, resaltada: false };
    const p = raiz(normalizarTexto(pedazo));
    const resaltada = !!p && palabras.some((q) => p === q || (q.length >= 2 && p.startsWith(q)) || (SINONIMOS_DE.get(q) || []).includes(p));
    return { texto: pedazo, resaltada };
  });
}
