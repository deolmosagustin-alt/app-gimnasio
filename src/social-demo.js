// SOCIAL DE MUESTRA — sólo en desarrollo.
//
// Social depende de Firebase (amigos, aplausos, el perfil público de cada
// uno), así que en el navegador de prueba de `npm run capturas` se veía
// siempre vacío y no había forma de diseñar la pizarra, la actividad o el
// ranking con gente adentro. Con la marca `modusfit_demo_social` en el
// localStorage (la pone `npm run capturas -- --datos`), social.js contesta
// con estos cinco amigos en vez de ir a Firestore.
//
// Este archivo se carga con import() desde ramas `if (import.meta.env.DEV)`:
// en la versión publicada esas ramas no existen y este código no viaja.

const fecha = (diasAtras) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - diasAtras);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const RUTINA = {
  id: "ppl",
  name: "Push / Pull / Legs",
  dayOrder: ["push", "pull", "legs"],
  days: {
    push: { label: "Push", color: "#14B8A6", exercises: [{ libId: "press_banca", sets: [{ repRange: "6-8" }, { repRange: "6-8" }, { repRange: "8-10" }] }, { libId: "press_militar_mancuernas", sets: [{ repRange: "8-10" }, { repRange: "8-10" }, { repRange: "8-10" }] }, { libId: "triceps_polea_alta", sets: [{ repRange: "10-12" }, { repRange: "10-12" }, { repRange: "10-12" }] }] },
    pull: { label: "Pull", color: "#3B82F6", exercises: [{ libId: "dominadas", sets: [{ repRange: "6-8" }, { repRange: "6-8" }, { repRange: "6-8" }] }, { libId: "remo_con_barra", sets: [{ repRange: "8-10" }, { repRange: "8-10" }, { repRange: "8-10" }] }, { libId: "curl_biceps_barra", sets: [{ repRange: "10-12" }, { repRange: "10-12" }] }] },
    legs: { label: "Legs", color: "#F97316", exercises: [{ libId: "sentadilla", sets: [{ repRange: "5-6" }, { repRange: "5-6" }, { repRange: "6-8" }] }, { libId: "peso_muerto_rumano", sets: [{ repRange: "8-10" }, { repRange: "8-10" }, { repRange: "8-10" }] }, { libId: "prensa", sets: [{ repRange: "10-12" }, { repRange: "10-12" }, { repRange: "10-12" }] }] },
  },
};

// Cada amigo: su perfil básico, la hora a la que suele llegar (para la
// planilla de asistencia) y los días que entrenó (hace cuántos días y qué día
// de la rutina), del más reciente al más viejo.
const AMIGOS = [
  { uid: "demo-martina", name: "Martina Paz", username: "martupaz", rango: ["Diamante", "I", "#2E7BD6", 12], hora: [7, 5], dias: [[0, "push"], [1, "legs"], [3, "pull"], [4, "push"], [6, "legs"], [7, "pull"], [8, "push"], [10, "legs"], [11, "pull"]] },
  { uid: "demo-joaquin", name: "Joaquín Ríos", username: "joaco", rango: ["Oro", "III", "#FFD23F", 8], hora: [19, 40], dias: [[1, "pull"], [2, "push"], [4, "legs"], [5, "pull"], [8, "push"], [9, "legs"]] },
  { uid: "demo-valen", name: "Valen Sosa", username: "valensosa", rango: ["Esmeralda", "II", "#2FB866", 10], hora: [18, 10], dias: [[0, "legs"], [2, "pull"], [7, "push"], [9, "legs"]] },
  { uid: "demo-tomas", name: "Tomás Ferreyra", username: "tomif", rango: ["Plata", "III", "#DCE3E8", 5], hora: [12, 25], dias: [[1, "push"], [3, "legs"], [5, "pull"], [12, "push"]] },
  { uid: "demo-cami", name: "Cami Ortiz", username: "cami.o", rango: ["Oro", "I", "#C99A2E", 6], hora: [21, 0], dias: [[3, "pull"], [10, "push"], [13, "legs"]] },
];

// Cuánto levanta cada uno en cada ejercicio: una base por ejercicio, escalada
// por su nivel (los de rango alto, más pesado), así la competencia de Social
// tiene músculos que se ganan y músculos que se pierden.
const BASE_KG = { press_banca: 60, press_militar_mancuernas: 20, triceps_polea_alta: 25, dominadas: 0, remo_con_barra: 55, curl_biceps_barra: 30, sentadilla: 80, peso_muerto_rumano: 70, prensa: 140 };
function perfilCompleto(amigo) {
  const logs = {};
  const factor = 0.6 + amigo.rango[3] * 0.06;
  const trainingSessions = amigo.dias.map(([atras, dayKey]) => {
    const date = fecha(atras);
    RUTINA.days[dayKey].exercises.forEach((ex) => {
      ex.sets.forEach((_, i) => {
        const clave = `${ex.libId}_${i}`;
        const base = BASE_KG[ex.libId] ?? 30;
        // Las sesiones más viejas, un poco más livianas.
        const kg = base ? Math.round((base * factor * (1 - atras * 0.006) - i * 2.5) / 2.5) * 2.5 : 0;
        const reps = base ? 8 - (i === 0 ? 2 : 0) : Math.round(6 + amigo.rango[3] * 0.4);
        (logs[clave] = logs[clave] || []).push({ date, reps, kg });
      });
    });
    const inicio = new Date(`${date}T12:00:00`);
    inicio.setHours(amigo.hora[0], amigo.hora[1] + ((atras * 7) % 20), 0, 0);
    const fin = new Date(inicio.getTime() + (52 + (atras % 4) * 6) * 60000);
    return { date, dayKey, routineId: "ppl", startedAt: inicio.toISOString(), endedAt: fin.toISOString() };
  });
  return { activeRoutineSnapshot: RUTINA, logs, trainingSessions, measurements: {}, cycleStart: null, sex: null, age: null, settings: { bodyWeightKg: 0 } };
}

export function listMyFriendships(uid) {
  return Promise.resolve([
    ...AMIGOS.map((a, i) => ({ id: `${uid}_${a.uid}`, users: [uid, a.uid], status: "accepted", requestedBy: a.uid, createdAt: fecha(30 + i) })),
    { id: `${uid}_demo-lu`, users: [uid, "demo-lu"], status: "pending", requestedBy: "demo-lu", createdAt: fecha(1) },
  ]);
}

export function getPublicBasic(uid) {
  if (uid === "demo-lu") return Promise.resolve({ name: "Lu Benítez", username: "lubenitez", avatarData: null, topRank: null });
  const a = AMIGOS.find((x) => x.uid === uid);
  if (!a) return Promise.resolve(null);
  const [tier, sub, color, levelIdx] = a.rango;
  return Promise.resolve({ name: a.name, username: a.username, avatarData: null, topRank: { tier, sub, color, levelIdx } });
}

export function getPublicFull(uid) {
  const a = AMIGOS.find((x) => x.uid === uid);
  return Promise.resolve(a ? perfilCompleto(a) : null);
}

export function listKudosReceived(uid) {
  return Promise.resolve([
    { id: "k1", toUid: uid, fromUid: "demo-martina", date: fecha(0) },
    { id: "k2", toUid: uid, fromUid: "demo-joaquin", date: fecha(1) },
  ]);
}

// RETOS de muestra: Martina te reta a superar su mejor serie de press banca,
// y los que mandes quedan guardados mientras dure la página.
const retosEnviados = [];
const retosBorrados = new Set();
export function listRetosRecibidos(uid, semana) {
  const martina = AMIGOS.find((a) => a.uid === "demo-martina");
  const series = martina ? perfilCompleto(martina).logs.press_banca_0 || [] : [];
  const mejor = series.reduce((a, b) => (!a || b.kg > a.kg ? b : a), null);
  const id = `${uid}_demo-martina_press_banca_${semana}`;
  return Promise.resolve(mejor && !retosBorrados.has(id) ? [{ id, fromUid: "demo-martina", toUid: uid, exerciseId: "press_banca", exerciseName: "Press Banca", kg: mejor.kg, reps: mejor.reps, semana }] : []);
}
export function listRetosEnviados(uid, semana) {
  return Promise.resolve(retosEnviados.filter((r) => r.fromUid === uid && r.semana === semana));
}
export function sendReto(fromUid, toUid, reto) {
  retosEnviados.push({ id: `${toUid}_${fromUid}_${reto.exerciseId}_${reto.semana}`, fromUid, toUid, ...reto });
  return Promise.resolve();
}
export function borrarReto(id) {
  retosBorrados.add(id);
  const i = retosEnviados.findIndex((r) => r.id === id);
  if (i >= 0) retosEnviados.splice(i, 1);
  return Promise.resolve();
}
