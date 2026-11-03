// Las cuentas de la lógica de entrenamiento, sin React: la doble progresión,
// la carga y las series de la descarga, y el aviso de que venís bajando.
// Salieron de App.jsx para probarlas con Vitest (src/entrenamiento.test.js).
// La crítica con la evidencia, en docs/critica-entrenamiento.md.
import { kgToDisplay, displayToKg, estimate1RM, localDateStr, todayStr } from "./utils";

// El rango de reps de una serie: "8-12" → [8, 12]; "5" → [5, 5].
export function rangoDeReps(repRange) {
  const m = String(repRange || "").match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) { const a = Number(m[1]), b = Number(m[2]); return a <= b ? [a, b] : [b, a]; }
  const n = parseInt(repRange, 10);
  return Number.isFinite(n) && n > 0 ? [n, n] : null;
}
// LA PROGRESIÓN DE UN ENTRENADOR (doble progresión): con el mismo peso, una
// rep más por vez hasta el tope del rango; ahí sube el peso un salto y las
// reps vuelven al piso del rango. Pedido: "que juegue más con la cantidad de
// reps y recién ahí suba el peso y baje las reps, como la que haría un
// entrenador personal". Todo en la unidad que se muestra; a peso corporal,
// sólo reps.
// Dos correcciones con la evidencia (docs/critica-entrenamiento.md):
//  · si la vez pasada llegaste al fallo (RPE 9,5 o más, que se anota con el
//    esfuerzo), hoy se repite en vez de sumar una rep: subir sobre una serie
//    al fallo suma fatiga y no más músculo (Robinson et al., 2024);
//  · si el salto es más del 10 % del peso (2,5 kg sobre 20 kg), antes de
//    saltar se suman hasta dos reps arriba del tope: el ACSM (2009) recomienda
//    subir la carga de a 2-10 %, menos en los músculos chicos, "cuando se
//    pueden hacer una o dos repeticiones más que las buscadas"; con un salto
//    grande, ir al piso del rango era casi imposible y la progresión se
//    trababa.
export function siguientePaso(kg, reps, repRange, salto, { rpe = null } = {}) {
  const r = rangoDeReps(repRange);
  if (!r || !(reps > 0)) return null;
  const [piso, tope] = r;
  if (rpe != null && rpe >= 9.5 && reps <= tope) return { kg, reps, motivo: "fallo" };
  if (!(kg > 0)) return { kg: 0, reps: reps + 1, motivo: "rep" };
  if (reps >= tope) {
    if (salto / kg > 0.1 && reps < tope + 2) return { kg, reps: reps + 1, motivo: "rep" };
    return { kg: Math.round((kg + salto) * 4) / 4, reps: piso, motivo: "peso" };
  }
  return { kg, reps: reps + 1, motivo: "rep" };
}

// Cuántas series quedan en la descarga: la mitad (o un tercio, o un cuarto),
// nunca menos de una.
export const seriesDeDescarga = (n, divisor = 2) => Math.max(1, Math.ceil((n || 0) / Math.max(1, divisor || 2)));

// La serie de la descarga: las mismas reps con menos peso, redondeado a lo
// que se puede cargar (el salto de ese ejercicio: el disco chico o lo que
// marque la máquina). Antes se redondeaba de a medio kilo y salían pesos
// imposibles de armar (64 kg; en libras, 141,1). A peso corporal, o si el
// peso ya es el más chico que se puede cargar, bajan las reps.
export function cargaDeDescarga(base, { pct = 0.75, salto = 2.5, unit = "kg", cardio = false } = {}) {
  if (!base) return null;
  if (cardio) return { minutes: Math.max(1, Math.round((base.minutes || 0) * pct)) };
  const reps = base.reps || 0;
  if (!(reps > 0)) return null;
  const menosReps = Math.max(1, Math.round(reps * pct));
  if (!(base.kg > 0)) return { reps: menosReps, kg: 0, kgVista: 0 };
  const paso = salto > 0 ? salto : unit === "lbs" ? 5 : 2.5;
  const original = kgToDisplay(base.kg, unit);
  const objetivo = original * pct;
  // Al más cercano y, en un empate (63,75 entre 62,5 y 65), al más liviano:
  // es una descarga.
  let vista = Math.round(objetivo / paso - 1e-6) * paso;
  if (vista >= original) vista = Math.floor(objetivo / paso) * paso;
  if (vista <= 0) return { reps: menosReps, kg: base.kg, kgVista: original };
  vista = Math.round(vista * 100) / 100;
  return { reps, kg: displayToKg(vista, unit), kgVista: vista };
}
// ¿VENÍS BAJANDO? Para ofrecer adelantar la descarga. La descarga puede ser
// planeada y también autorregulada (consenso Delphi de Bell et al., 2023), y
// los atletas la adelantan cuando se estancan o les duelen las articulaciones
// (encuesta de Rogerson et al., 2024). Cuenta los ejercicios cuyas dos
// últimas sesiones quedaron, las dos, un 5 % o más abajo de su mejor serie de
// las cuatro semanas anteriores (en 1RM estimado), sin haber subido el peso:
// el salto de la doble progresión (12 × 80 → 8 × 82,5) baja el 1RM estimado
// a propósito y no cuenta. La última, de las dos últimas semanas.
export function ejerciciosEnBaja(logs, routine, hoy = todayStr()) {
  const lista = [];
  const vistos = new Set();
  const haceDias = (fecha, dias) => localDateStr(new Date(new Date(`${fecha}T12:00:00`).getTime() - dias * 86400000));
  Object.values(routine || {}).forEach((d) => (d?.exercises || []).forEach((ex) => {
    if (!ex?.id || ex.cardio || vistos.has(ex.id)) return;
    vistos.add(ex.id);
    const porFecha = {};
    (ex.sets || []).forEach((_, i) => (logs?.[`${ex.id}_${i}`] || []).forEach((h) => {
      if (!h?.date || h.deload || !(h.kg > 0) || !(h.reps > 0) || h.date >= hoy) return;
      const p = estimate1RM(h.kg, h.reps);
      if (!porFecha[h.date] || p > porFecha[h.date].p) porFecha[h.date] = { p, kg: h.kg };
    }));
    const fechas = Object.keys(porFecha).sort();
    if (fechas.length < 4) return;
    const ultima = fechas[fechas.length - 1], anteultima = fechas[fechas.length - 2];
    if (ultima < haceDias(hoy, 14)) return;
    const previas = fechas.slice(0, -2).filter((f) => f >= haceDias(anteultima, 28));
    if (!previas.length) return;
    const mejor = previas.reduce((a, f) => (porFecha[f].p > a.p ? porFecha[f] : a), { p: 0, kg: 0 });
    const abajo = (f) => porFecha[f].p <= mejor.p * 0.95 && porFecha[f].kg <= mejor.kg + 0.01;
    if (abajo(ultima) && abajo(anteultima)) lista.push(ex.name);
  }));
  return lista;
}
