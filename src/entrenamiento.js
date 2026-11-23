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

// LA SERIE DE LA DESCARGA (16/11, pedido: "mantené el peso alto, recortá sólo
// el volumen y el esfuerzo": con el 75 % del peso, a la vuelta se sentía
// débil). Casi todo el peso (90 % de fábrica, hasta 100 %), la mitad de las
// series (seriesDeDescarga) y menos reps, para cortar a 3 o 4 del fallo. La
// evidencia: en el consenso Delphi de Bell et al. (2023) hubo acuerdo en que
// "la intensidad puede quedar igual durante la descarga, pero sólo si baja el
// volumen" (95 %) y en que se puede bajar el volumen con menos series y menos
// reps (100 %); su guía práctica (Bell et al., 2024) propone bajar el %RM un
// 10 % o sacar reps con la misma carga.
// El peso se redondea a lo que se puede cargar (el salto del ejercicio) y
// nunca pasa del de siempre. En cardio, menos minutos (a lo sumo el 75 %).
export const repsDeDescarga = (reps) => Math.max(1, reps - Math.min(4, Math.max(1, Math.round(reps * 0.35))));
export function cargaDeDescarga(base, { pct = 0.9, salto = 2.5, unit = "kg", cardio = false } = {}) {
  if (!base) return null;
  if (cardio) return { minutes: Math.max(1, Math.round((base.minutes || 0) * Math.min(pct, 0.75))) };
  const reps = base.reps || 0;
  if (!(reps > 0)) return null;
  const menos = repsDeDescarga(reps);
  if (!(base.kg > 0)) return { reps: menos, kg: 0, kgVista: 0 };
  const paso = salto > 0 ? salto : unit === "lbs" ? 5 : 2.5;
  const original = kgToDisplay(base.kg, unit);
  const objetivo = original * pct;
  // Al más cercano y, en un empate, al más liviano: es una descarga.
  let vista = Math.round(objetivo / paso - 1e-6) * paso;
  if (vista > original) vista = Math.floor(original / paso + 1e-6) * paso;
  if (vista <= 0) vista = original;
  vista = Math.round(vista * 100) / 100;
  return { reps: menos, kg: Math.abs(vista - original) < 0.005 ? base.kg : displayToKg(vista, unit), kgVista: vista };
}
// LA SEMANA DE ADAPTACIÓN, la primera después de una descarga: los pesos de
// siempre con tres cuartos de las series (4 → 3, 3 → 2) y sin sumar reps, a
// unas 2 del fallo; el volumen entero vuelve la semana siguiente. En el
// consenso de Bell et al. (2023), "la intensidad puede ser más baja en la
// primera semana de un mesociclo nuevo" (84 %).
export const seriesDeAdaptacion = (n) => ((n || 0) <= 2 ? Math.max(1, n || 0) : Math.max(2, Math.round(n * 0.75)));
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

// EL PLAN DE UN ENTRENADOR, SEMANA POR SEMANA (04/11, pedido: "planificaciones
// coherentes, nada de saltos muy bruscos"). Desde lo último que hiciste en
// esa serie (`base`, en la unidad que se ve), cada semana repite o da UN
// paso de la doble progresión (siguientePaso). Cuándo da el paso depende de
// la experiencia: el principiante, todas las semanas; el intermedio, dos de
// cada tres (la tercera consolida); el avanzado, una de cada dos. Mantener no
// sube nada. La evidencia: el ACSM (2009) sube la carga de a 2-10 % cuando
// sobran una o dos reps, y la fuerza crece del orden de 1,5 a 2,6 % por
// semana (metaanálisis de frecuencia, Stronger by Science); una rep más ronda
// un 3 % de 1RM estimado, así que nunca hay más de un paso por semana.
export const CADENCIAS = { principiante: [true], intermedio: [true, true, false], avanzado: [true, false], mantenimiento: [false] };
export function planDeEntrenador(base, { repRange, salto = 2.5, desde = 1, semanas = 4, cadencia = "intermedio" } = {}) {
  if (!base || !(base.reps > 0)) return [];
  const patron = CADENCIAS[cadencia] || CADENCIAS.intermedio;
  const out = [];
  let actual = { kg: base.kg || 0, reps: base.reps };
  for (let k = 0; k < Math.max(1, semanas); k++) {
    if (patron[k % patron.length]) {
      const p = siguientePaso(actual.kg, actual.reps, repRange || `${actual.reps}-${actual.reps + 2}`, salto);
      if (p) actual = { kg: p.kg, reps: p.reps };
    }
    out.push({ week: desde + k, kg: actual.kg, reps: actual.reps });
  }
  return out;
}

// REDONDEAR CON COHERENCIA (05/11, pedido: "que en los redondeos haya
// coherencia; capaz bajar una rep si se redondea para arriba o al revés,
// meterle mucho a eso"). Cuando un peso calculado (un porcentaje, la
// descarga, una aproximación) se redondea a lo que se puede cargar, las reps
// se ajustan para que el esfuerzo sea el mismo: se busca la cantidad de reps
// que, con el peso redondeado, da el mismo 1RM estimado (Epley) que el peso
// exacto con las reps pensadas. Nunca cambia más de dos reps ni baja de una,
// y si la diferencia es chica no toca nada.
export function equilibrarReps(objetivo, redondeado, reps, { maxCambio = 2, soloBajar = false } = {}) {
  if (!(objetivo > 0) || !(redondeado > 0) || !(reps > 0)) return reps;
  const rm = objetivo * (1 + reps / 30);
  const exactas = 30 * (rm / redondeado - 1);
  let nuevas = Math.round(exactas);
  // Si el peso quedó más pesado, alcanza media rep de diferencia para bajar
  // una (no pasarse); si quedó más liviano, sube sólo con una rep entera.
  const dif = exactas - reps;
  if (dif > -0.5 && dif < 1) return reps;
  nuevas = Math.max(reps - maxCambio, Math.min(reps + maxCambio, nuevas));
  if (soloBajar) nuevas = Math.min(nuevas, reps);
  return Math.max(1, nuevas);
}
// Redondear un peso al salto del ejercicio, y las reps con él.
export function redondearConReps(kg, reps, salto = 2.5, { hacia = "cerca", soloBajar = false } = {}) {
  if (!(kg > 0) || !(salto > 0)) return { kg, reps };
  const f = hacia === "abajo" ? Math.floor : hacia === "arriba" ? Math.ceil : Math.round;
  let r = f(kg / salto - 1e-9) * salto;
  if (r <= 0) r = salto;
  r = Math.round(r * 100) / 100;
  return { kg: r, reps: equilibrarReps(kg, r, reps, { soloBajar }) };
}

// EL RESUMEN DEL CICLO (12/11, pedido: "que al final de cada ciclo te muestre
// en comparación todos los ejercicios, con las mejores marcas antes de
// empezar y con los récords nuevos"). Por ejercicio (todas sus series
// juntas, sin las de descarga): la mejor serie de antes del ciclo y la mejor
// del ciclo, por 1RM estimado (a peso corporal, por reps). `desde` y `hasta`
// son fechas AAAA-MM-DD; `hasta` no entra.
export function resumenDeCiclo(logs, desde, hasta) {
  const porEjercicio = {};
  const puntaje = (h) => (h.kg > 0 ? estimate1RM(h.kg, h.reps) : h.reps || 0);
  Object.entries(logs || {}).forEach(([clave, historial]) => {
    if (!Array.isArray(historial)) return;
    const id = clave.replace(/_\d+$/, "");
    historial.forEach((h) => {
      if (!h?.date || h.deload || !(h.reps > 0) || h.minutes != null) return;
      const e = porEjercicio[id] || (porEjercicio[id] = { id, antes: null, ahora: null, series: 0 });
      if (h.date < desde) { if (!e.antes || puntaje(h) > puntaje(e.antes)) e.antes = h; }
      else if (h.date < hasta) { e.series++; if (!e.ahora || puntaje(h) > puntaje(e.ahora)) e.ahora = h; }
    });
  });
  const filas = Object.values(porEjercicio).filter((e) => e.ahora).map((e) => {
    const a = e.antes ? puntaje(e.antes) : 0, b = puntaje(e.ahora);
    const corporal = !(e.ahora.kg > 0);
    return {
      id: e.id, series: e.series, corporal,
      antes: e.antes ? { kg: e.antes.kg || 0, reps: e.antes.reps, rm: corporal ? null : Math.round(a * 10) / 10 } : null,
      ahora: { kg: e.ahora.kg || 0, reps: e.ahora.reps, rm: corporal ? null : Math.round(b * 10) / 10, date: e.ahora.date },
      esRecord: !!e.antes && b > a + 1e-6,
      nuevo: !e.antes,
      cambio: e.antes && a > 0 ? Math.round(((b - a) / a) * 1000) / 10 : null,
    };
  }).sort((x, y) => (y.esRecord - x.esRecord) || ((y.cambio ?? -999) - (x.cambio ?? -999)));
  return { filas, records: filas.filter((f) => f.esRecord).length, nuevos: filas.filter((f) => f.nuevo).length };
}

// DE QUÉ DÍA ES UNA SERIE (23/11): un ejercicio que está en dos días de la
// rutina lleva marcas aparte en cada uno (ver useLogsDelDia en App.jsx). Las
// series nuevas anotan `dia`; las de antes se ubican por las sesiones
// (`fechasPorDia`: { día: Set de fechas }), y las que no se pueden ubicar
// cuentan para los dos días.
export function esDelDia(h, dia, fechasPorDia) {
  if (!h) return false;
  if (h.dia) return h.dia === dia;
  if (fechasPorDia?.[dia]?.has(h.date)) return true;
  for (const k in fechasPorDia || {}) if (k !== dia && fechasPorDia[k].has(h.date)) return false;
  return true;
}
export const porFecha = (a, b) => ((a?.date || "") < (b?.date || "") ? -1 : (a?.date || "") > (b?.date || "") ? 1 : 0);
