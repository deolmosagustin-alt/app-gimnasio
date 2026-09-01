// Acceso a Firestore para la feature social (amigos + entrenador/alumno) —
// sin JSX, mismo criterio que utils.js: funciones chicas y con una sola
// responsabilidad. Todo lo que toca `db` vive acá; App.jsx solo llama a
// estas funciones y dibuja el resultado.
//
// Modelo de datos (ver también firestore.rules, que es la autoridad final
// de qué se permite — esto es solo el cliente):
//   users/{uid}/public/basic  → { username, name, avatarData } — visible
//     para cualquier usuario autenticado (hace falta para mostrarlo en una
//     búsqueda o en una solicitud pendiente, ANTES de ser amigos).
//   users/{uid}/public/full   → rutina activa + historial + medidas —
//     visible solo para amigos aceptados o el entrenador/alumno vinculado.
//   usernames/{usernameLower} → { uid } — unicidad + búsqueda por @handle.
//   friendships/{friendshipId(a,b)} → { users:[a,b], status, requestedBy }.
//   trainerLinks/{trainerUid}_{studentUid} → { trainerUid, studentUid, status, requestedBy }.
//   routineProposals/{autoId} → propuesta de rutina de un entrenador a un alumno.

import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, query, where, getDocs } from "firebase/firestore";
import { db } from "./firebase";

// ============================== USERNAME (@handle) ==============================

export function normalizeUsername(raw) {
  return String(raw || "").trim().toLowerCase();
}

// 3 a 20 caracteres, solo minúsculas/números/guión bajo — mismo patrón que
// valida firestore.rules del lado del servidor.
export function isValidUsername(raw) {
  return /^[a-z0-9_]{3,20}$/.test(normalizeUsername(raw));
}

export async function checkUsernameAvailable(rawUsername) {
  const usernameLower = normalizeUsername(rawUsername);
  if (!isValidUsername(usernameLower)) return false;
  const snap = await getDoc(doc(db, "usernames", usernameLower));
  return !snap.exists();
}

// Reclama un @handle nuevo (falla si ya existe — la regla de Firestore solo
// permite "create", nunca pisar uno ajeno ni el propio ya existente).
export async function claimUsername(uid, rawUsername) {
  const usernameLower = normalizeUsername(rawUsername);
  if (!isValidUsername(usernameLower)) throw new Error("INVALID_USERNAME");
  await setDoc(doc(db, "usernames", usernameLower), { uid });
  return usernameLower;
}

// Best-effort: si falla (ej. ya se había borrado), no bloquea el flujo que
// la llama — el username viejo queda "huérfano" en el peor caso, lo mismo
// que ya pasa hoy con el perfil local al borrar una cuenta.
export async function releaseUsername(usernameLower) {
  if (!usernameLower) return;
  try { await deleteDoc(doc(db, "usernames", usernameLower)); } catch { /* ignorado a propósito */ }
}

// Cambiar de @handle es "reclamar el nuevo, después soltar el viejo" (no un
// update in-place) — si el nuevo ya está tomado, esto tira ANTES de tocar
// el viejo, así nunca te quedás sin ninguno.
export async function changeUsername(uid, oldUsernameLower, newRawUsername) {
  const newLower = await claimUsername(uid, newRawUsername);
  if (oldUsernameLower && oldUsernameLower !== newLower) await releaseUsername(oldUsernameLower);
  return newLower;
}

// null = "no existe" O "no se pudo buscar" (sin red, reglas de Firestore
// sin desplegar todavía, etc.) — mismo criterio "null = no disponible" que
// getPublicBasic/getPublicFull, para que el que llama nunca se quede
// esperando una respuesta que no va a llegar.
export async function lookupUserByUsername(rawUsername) {
  const usernameLower = normalizeUsername(rawUsername);
  if (!usernameLower) return null;
  try {
    const snap = await getDoc(doc(db, "usernames", usernameLower));
    return snap.exists() ? { uid: snap.data().uid, username: usernameLower } : null;
  } catch { return null; }
}

// ============================== PERFIL PÚBLICO ==============================

// `topRank` ya viene calculado (getBest1RMForMuscleGroup/getMuscleRank
// viven en App.jsx, junto con el catálogo de músculos) — se guarda acá
// para que la lista de amigos pueda mostrar un badge de rango sin tener
// que leer el perfil COMPLETO (public/full, con todo el historial) de
// cada persona sólo para pintar una fila.
function profileToPublicBasic(profile, topRank) {
  return {
    username: profile.username || null,
    name: profile.name || null,
    avatarData: profile.avatarData || null,
    topRank: topRank || null,
    updatedAt: new Date().toISOString(),
  };
}

// `activeRoutineSnapshot` ya viene resuelto (resolveRoutineDef) desde
// App.jsx — acá no se recalcula para no duplicar esa lógica.
function profileToPublicFull(profile, activeRoutineSnapshot) {
  const s = profile.settings || {};
  return {
    activeRoutineSnapshot: activeRoutineSnapshot || null,
    logs: profile.logs || {},
    trainingSessions: profile.trainingSessions || [],
    measurements: profile.measurements || {},
    cycleStart: profile.cycleStart || null,
    sex: profile.sex || null,
    age: profile.age || null,
    // Solo lo necesario para recalcular PRs/racha/rango del lado del que
    // mira — no el objeto `settings` completo (evita filtrar cosas
    // irrelevantes como horario de recordatorios o ajustes de la IA).
    settings: {
      bodyWeightKg: s.bodyWeightKg || 0,
      trainWeeks: s.trainWeeks,
      deloadWeeks: s.deloadWeeks,
      deloadEnabled: s.deloadEnabled,
    },
    updatedAt: new Date().toISOString(),
  };
}

// Espejo del perfil "compartible" — se llama desde syncProfileToCloud, y es
// un no-op si el usuario nunca eligió un @handle (la enorme mayoría), para
// no triplicar escrituras/almacenamiento de gente que no usa lo social.
// Igual que syncProfileToCloud: falla en silencio (solo warning en
// consola) — un fallo acá nunca debe tirar abajo el sync principal.
export async function syncPublicProfile(uid, profile, activeRoutineSnapshot, topRank) {
  if (!profile?.username) return;
  try {
    const basic = JSON.parse(JSON.stringify(profileToPublicBasic(profile, topRank)));
    const full = JSON.parse(JSON.stringify(profileToPublicFull(profile, activeRoutineSnapshot)));
    await setDoc(doc(db, "users", uid, "public", "basic"), basic);
    await setDoc(doc(db, "users", uid, "public", "full"), full);
  } catch (err) {
    console.warn("[social] No se pudo sincronizar el perfil público:", err?.message || err);
  }
}

export async function getPublicBasic(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid, "public", "basic"));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

// null = "no se pudo leer" (sin vínculo aceptado, o el otro nunca eligió
// @handle) — el llamador lo muestra como "esta persona no comparte su
// perfil" en vez de reventar.
export async function getPublicFull(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid, "public", "full"));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

// "Hacerme privado": suelta el @usuario y borra el espejo público, SIN
// tocar amistades/vínculos existentes (a diferencia de cleanupSocialData,
// pensada para cuando se elimina el perfil entero) — la persona sigue
// siendo tu amigo/alumno, solo deja de compartir datos nuevos hasta que
// vuelva a elegir un @usuario.
export async function unpublishProfile(uid, usernameLower) {
  try {
    if (usernameLower) await releaseUsername(usernameLower);
    await deleteDoc(doc(db, "users", uid, "public", "basic"));
    await deleteDoc(doc(db, "users", uid, "public", "full"));
  } catch (err) {
    console.warn("[social] No se pudo dejar de ser buscable del todo:", err?.message || err);
  }
}

// ============================== AMISTADES ==============================

// ID determinístico (par ordenado alfabéticamente) — así los dos lados de
// la amistad llegan al mismo documento sin tener que consultar nada, y
// nunca puede haber dos amistades distintas entre el mismo par. DEBE
// reflejar exactamente la misma función en firestore.rules.
export function friendshipId(a, b) { return a < b ? `${a}_${b}` : `${b}_${a}`; }

export async function sendFriendRequest(myUid, otherUid) {
  const id = friendshipId(myUid, otherUid);
  await setDoc(doc(db, "friendships", id), {
    users: [myUid, otherUid].sort(),
    status: "pending",
    requestedBy: myUid,
    createdAt: new Date().toISOString(),
    respondedAt: null,
  });
  return id;
}

// accept=true acepta la pendiente; accept=false rechaza (o cancela, si el
// que llama es quien la mandó) — en ambos casos, borrar el documento.
export async function respondToFriendRequest(myUid, otherUid, accept) {
  const id = friendshipId(myUid, otherUid);
  if (accept) await updateDoc(doc(db, "friendships", id), { status: "accepted", respondedAt: new Date().toISOString() });
  else await deleteDoc(doc(db, "friendships", id));
}

export async function removeFriend(myUid, otherUid) {
  await deleteDoc(doc(db, "friendships", friendshipId(myUid, otherUid)));
}

export async function listMyFriendships(uid) {
  const snap = await getDocs(query(collection(db, "friendships"), where("users", "array-contains", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ============================== ENTRENADOR / ALUMNO ==============================

export function trainerLinkId(trainerUid, studentUid) { return `${trainerUid}_${studentUid}`; }

// myRole: de qué lado se pone QUIEN MANDA la solicitud ("trainer" si yo
// digo "quiero ser tu entrenador", "student" si digo "quiero que seas mi
// entrenador") — el otro lado queda del lado contrario.
export async function sendTrainerLinkRequest(myUid, otherUid, myRole) {
  const trainerUid = myRole === "trainer" ? myUid : otherUid;
  const studentUid = myRole === "trainer" ? otherUid : myUid;
  const id = trainerLinkId(trainerUid, studentUid);
  await setDoc(doc(db, "trainerLinks", id), {
    trainerUid, studentUid, status: "pending", requestedBy: myUid,
    createdAt: new Date().toISOString(), respondedAt: null,
  });
  return id;
}

export async function respondToTrainerLink(trainerUid, studentUid, accept) {
  const id = trainerLinkId(trainerUid, studentUid);
  if (accept) await updateDoc(doc(db, "trainerLinks", id), { status: "accepted", respondedAt: new Date().toISOString() });
  else await deleteDoc(doc(db, "trainerLinks", id));
}

export async function removeTrainerLink(trainerUid, studentUid) {
  await deleteDoc(doc(db, "trainerLinks", trainerLinkId(trainerUid, studentUid)));
}

export async function listTrainerLinksAsTrainer(uid) {
  const snap = await getDocs(query(collection(db, "trainerLinks"), where("trainerUid", "==", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listTrainerLinksAsStudent(uid) {
  const snap = await getDocs(query(collection(db, "trainerLinks"), where("studentUid", "==", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ============================== PROPUESTAS DE RUTINA ==============================
// El entrenador SIEMPRE crea la propuesta; el alumno solo acepta/rechaza.
// El entrenador nunca escribe directo en el perfil del alumno — ver
// firestore.rules (la regla de creación exige un trainerLinks aceptado).

export async function createRoutineProposal(trainerUid, studentUid, proposedRoutine, note = "") {
  const ref = await addDoc(collection(db, "routineProposals"), {
    trainerUid, studentUid,
    proposedRoutine: JSON.parse(JSON.stringify(proposedRoutine)),
    note,
    status: "pending",
    createdAt: new Date().toISOString(),
    respondedAt: null,
  });
  return ref.id;
}

// Propuesta de PROGRESIÓN (modo "rutina planificada", ver DEFAULT_SETTINGS
// en App.jsx): en vez de reemplazar la rutina entera, el entrenador carga
// la meta de cada semana (kg×reps) para UN ejercicio/serie puntual de la
// rutina activa del alumno. Mismo documento/colección que una propuesta de
// rutina completa (mismas reglas de Firestore, sin cambios) — se
// distingue por tener `proposedRoutine: null` y `progressionPlan` con los
// datos. `proposedRoutine` va explícito en null (no ausente) para que la
// regla de Firestore, que compara ese campo en el update de
// aceptar/rechazar, siga funcionando sin tocar firestore.rules.
export async function createProgressionProposal(trainerUid, studentUid, progressionPlan, note = "") {
  const ref = await addDoc(collection(db, "routineProposals"), {
    trainerUid, studentUid,
    proposedRoutine: null,
    progressionPlan: JSON.parse(JSON.stringify(progressionPlan)),
    note,
    status: "pending",
    createdAt: new Date().toISOString(),
    respondedAt: null,
  });
  return ref.id;
}

export async function respondToRoutineProposal(proposalId, accept) {
  await updateDoc(doc(db, "routineProposals", proposalId), {
    status: accept ? "accepted" : "rejected",
    respondedAt: new Date().toISOString(),
  });
}

export async function listRoutineProposalsForStudent(studentUid) {
  const snap = await getDocs(query(collection(db, "routineProposals"), where("studentUid", "==", studentUid), where("status", "==", "pending")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listRoutineProposalsByTrainer(trainerUid) {
  const snap = await getDocs(query(collection(db, "routineProposals"), where("trainerUid", "==", trainerUid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ============================== LIMPIEZA AL ELIMINAR PERFIL ==============================
// Best-effort: se llama desde handleDelete. Nunca debe bloquear ni tirar —
// si algo falla, queda basura huérfana (mismo criterio que ya usa el resto
// de la app para este tipo de limpieza).
export async function cleanupSocialData(uid, usernameLower) {
  try {
    if (usernameLower) await releaseUsername(usernameLower);
    await deleteDoc(doc(db, "users", uid, "public", "basic"));
    await deleteDoc(doc(db, "users", uid, "public", "full"));
    const [asFriendA, asTrainer, asStudent] = await Promise.all([
      listMyFriendships(uid),
      listTrainerLinksAsTrainer(uid),
      listTrainerLinksAsStudent(uid),
    ]);
    await Promise.all([
      ...asFriendA.map((f) => deleteDoc(doc(db, "friendships", f.id)).catch(() => {})),
      ...asTrainer.map((l) => deleteDoc(doc(db, "trainerLinks", l.id)).catch(() => {})),
      ...asStudent.map((l) => deleteDoc(doc(db, "trainerLinks", l.id)).catch(() => {})),
    ]);
  } catch (err) {
    console.warn("[social] Limpieza al eliminar perfil incompleta:", err?.message || err);
  }
}
