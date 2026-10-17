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

// Cada amigo: su perfil básico y los días que entrenó (hace cuántos días y
// qué día de la rutina), del más reciente al más viejo.
const AMIGOS = [
  { uid: "demo-martina", name: "Martina Paz", username: "martupaz", rango: ["Diamante", "I", "#2E7BD6", 12], dias: [[0, "push"], [1, "legs"], [3, "pull"], [4, "push"], [6, "legs"], [7, "pull"], [8, "push"], [10, "legs"], [11, "pull"]] },
  { uid: "demo-joaquin", name: "Joaquín Ríos", username: "joaco", rango: ["Oro", "III", "#FFD23F", 8], dias: [[1, "pull"], [2, "push"], [4, "legs"], [5, "pull"], [8, "push"], [9, "legs"]] },
  { uid: "demo-valen", name: "Valen Sosa", username: "valensosa", rango: ["Esmeralda", "II", "#2FB866", 10], dias: [[0, "legs"], [2, "pull"], [7, "push"], [9, "legs"]] },
  { uid: "demo-tomas", name: "Tomás Ferreyra", username: "tomif", rango: ["Plata", "III", "#DCE3E8", 5], dias: [[1, "push"], [3, "legs"], [5, "pull"], [12, "push"]] },
  { uid: "demo-cami", name: "Cami Ortiz", username: "cami.o", rango: ["Oro", "I", "#C99A2E", 6], dias: [[3, "pull"], [10, "push"], [13, "legs"]] },
];

function perfilCompleto(amigo) {
  const logs = {};
  const trainingSessions = amigo.dias.map(([atras, dayKey]) => {
    const date = fecha(atras);
    RUTINA.days[dayKey].exercises.forEach((ex) => {
      ex.sets.forEach((_, i) => {
        const clave = `${ex.libId}_${i}`;
        (logs[clave] = logs[clave] || []).push({ date, reps: 8, kg: 40 + i * 2.5 });
      });
    });
    return { date, dayKey, routineId: "ppl" };
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
