// LOS SUPLEMENTOS (14/11/2026, pedido: "un widget de suplementación: tocás el
// scoop de creatina y queda tomada, la cápsula de omega 3…"). La lógica sin
// React, para poder probarla (suplementos.test.js). Lo mismo, en el teléfono,
// está en WidgetAcciones.java: si cambiás una regla acá, cambiala allá.
//
// Un suplemento: { id, nombre, forma, color, dosis } (dosis = tomas por día).
// Las tomas: { "2026-11-14": { <id>: [n, t] } }, n = cuántas llevás ese día y
// t = cuándo se tocó por última vez (ms). El widget anota con la app cerrada
// y la app también anota: al juntarse gana el toque más nuevo de cada uno.

export const FORMAS = ["scoop", "capsula", "pastilla", "shaker", "gota"];
export const NOMBRE_DE_FORMA = { scoop: "Scoop", capsula: "Cápsula", pastilla: "Pastilla", shaker: "Shaker", gota: "Gotas" };
// Suaves, como los acentos de la app: identifican, no gritan.
export const COLORES_SUPLEMENTO = ["#7bd0bd", "#f2b866", "#b6a8ff", "#7fb6ff", "#f29c9c", "#b5d67a"];
export const SUGERIDOS = [
  { nombre: "Creatina", forma: "scoop", color: "#7bd0bd" },
  { nombre: "Proteína", forma: "shaker", color: "#7fb6ff" },
  { nombre: "Omega 3", forma: "capsula", color: "#f2b866" },
  { nombre: "Magnesio", forma: "pastilla", color: "#b6a8ff" },
  { nombre: "Vitamina D", forma: "gota", color: "#b5d67a" },
  { nombre: "Multivitamínico", forma: "pastilla", color: "#f29c9c" },
  { nombre: "Cafeína", forma: "capsula", color: "#f29c9c" },
];
export const MAX_SUPLEMENTOS = 10;
export const MAX_DOSIS = 6;

export function sanearSuplemento(s) {
  if (!s || typeof s !== "object") return null;
  const nombre = String(s.nombre || "").trim().slice(0, 24);
  const id = String(s.id || "").replace(/[^a-z0-9]/gi, "").slice(0, 16);
  if (!nombre || !id) return null;
  return {
    id, nombre,
    forma: FORMAS.includes(s.forma) ? s.forma : "capsula",
    color: /^#[0-9a-f]{6}$/i.test(s.color || "") ? s.color : COLORES_SUPLEMENTO[0],
    dosis: Math.min(MAX_DOSIS, Math.max(1, Math.round(Number(s.dosis) || 1))),
  };
}

export function listaDeSuplementos(lista) {
  return (Array.isArray(lista) ? lista : []).map(sanearSuplemento).filter(Boolean).slice(0, MAX_SUPLEMENTOS);
}

export function nuevoSuplemento(datos, lista = []) {
  let id;
  do { id = `s${Math.random().toString(36).slice(2, 8)}`; } while (lista.some((x) => x.id === id));
  const usados = new Set(lista.map((x) => x.color));
  const color = datos?.color || COLORES_SUPLEMENTO.find((c) => !usados.has(c)) || COLORES_SUPLEMENTO[lista.length % COLORES_SUPLEMENTO.length];
  return sanearSuplemento({ dosis: 1, forma: "capsula", ...datos, color, id });
}

// Cuántas tomas lleva ese suplemento ese día.
export function tomadas(tomas, fecha, id) {
  const x = tomas?.[fecha]?.[id];
  return Array.isArray(x) ? Math.max(0, Math.round(Number(x[0]) || 0)) : 0;
}

// Un toque: suma una toma; con todas las del día hechas, el toque la vacía
// (es la forma de deshacer un toque de más).
export function tomar(tomas, fecha, sup, ahora = Date.now()) {
  const n = tomadas(tomas, fecha, sup.id);
  const sigue = n >= sup.dosis ? 0 : n + 1;
  return { ...(tomas || {}), [fecha]: { ...(tomas?.[fecha] || {}), [sup.id]: [sigue, ahora] } };
}

// Junta dos registros: de cada suplemento y día queda el toque más nuevo.
// Devuelve el mismo objeto `a` si `b` no trae nada nuevo (así React no redibuja).
export function unirTomas(a, b) {
  if (!b || typeof b !== "object") return a || {};
  let out = a || {};
  let cambio = false;
  for (const fecha of Object.keys(b)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !b[fecha] || typeof b[fecha] !== "object") continue;
    for (const id of Object.keys(b[fecha])) {
      const nuevo = b[fecha][id];
      if (!Array.isArray(nuevo) || !(Number(nuevo[1]) > 0)) continue;
      const viejo = out[fecha]?.[id];
      if (Array.isArray(viejo) && Number(viejo[1]) >= Number(nuevo[1])) continue;
      if (!cambio) { out = { ...out }; cambio = true; }
      out[fecha] = { ...(out[fecha] || {}), [id]: [Math.max(0, Math.round(Number(nuevo[0]) || 0)), Number(nuevo[1])] };
    }
  }
  return out;
}

const fechaMenos = (fecha, dias) => {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Días seguidos con todas las tomas. Hoy cuenta si ya está completo; si
// todavía no, la racha sigue viva desde ayer.
export function rachaDe(tomas, sup, hoy) {
  let n = 0;
  const completo = (f) => tomadas(tomas, f, sup.id) >= sup.dosis;
  let k = completo(hoy) ? 0 : 1;
  while (n < 3650 && completo(fechaMenos(hoy, k))) { n++; k++; }
  return n;
}

// Los últimos `dias` días, del más viejo a hoy: 0 sin tomar, 1 completo, y
// entre medio la parte tomada.
export function ultimosDias(tomas, sup, hoy, dias = 14) {
  return Array.from({ length: dias }, (_, i) => {
    const f = fechaMenos(hoy, dias - 1 - i);
    return { fecha: f, parte: Math.min(1, tomadas(tomas, f, sup.id) / sup.dosis) };
  });
}

// Para que el registro no crezca sin fin: quedan los últimos `dias` días.
export function recortarTomas(tomas, hoy, dias = 120) {
  const desde = fechaMenos(hoy, dias);
  const viejas = Object.keys(tomas || {}).filter((f) => f < desde);
  if (!viejas.length) return tomas || {};
  const out = { ...tomas };
  viejas.forEach((f) => delete out[f]);
  return out;
}

// Lo que se le manda al teléfono: la lista y las tomas de hoy y de ayer.
export function suplementosParaWidget(lista, tomas, hoy) {
  const dias = {};
  [hoy, fechaMenos(hoy, 1)].forEach((f) => { if (tomas?.[f]) dias[f] = tomas[f]; });
  return { lista: listaDeSuplementos(lista), tomas: dias };
}
