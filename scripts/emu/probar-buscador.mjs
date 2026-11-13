// Prueba de las reglas del buscador en el emulador (sin tocar producción).
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInAnonymously, signOut } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, updateDoc, deleteDoc, getDocs, query, collection, where, limit } from "firebase/firestore";
const app = initializeApp({ projectId: "demo-gymapp", apiKey: "fake-key", authDomain: "localhost" });
const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
const db = getFirestore(app); connectFirestoreEmulator(db, "127.0.0.1", 8080);
let ok = 0, mal = 0;
const espera = async (nombre, fn, debeAndar) => {
  try { await fn(); if (debeAndar) { ok++; console.log("✓", nombre); } else { mal++; console.log("✗", nombre, "(debía rechazarse)"); } }
  catch (e) { if (!debeAndar) { ok++; console.log("✓", nombre, "rechazado"); } else { mal++; console.log("✗", nombre, e.code || e.message); } }
};
const tokens = (n) => { const t = new Set(); n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9ñ]+/).filter(Boolean).forEach((w) => { for (let k = 2; k <= Math.min(w.length, 15); k++) t.add(w.slice(0, k)); }); return [...t]; };
await espera("sin sesión no se lista", () => getDocs(query(collection(db, "buscador"), where("busqueda", "array-contains", "mar"), limit(25))), false);
const yo = (await signInAnonymously(auth)).user.uid;
await espera("escribo mi ficha", () => setDoc(doc(db, "buscador", yo), { name: "Martina Paz", busqueda: tokens("Martina Paz"), updatedAt: new Date().toISOString() }), true);
await espera("no escribo la de otro", () => setDoc(doc(db, "buscador", "otro"), { name: "X", busqueda: [], updatedAt: "" }), false);
await espera("no meto campos de más", () => setDoc(doc(db, "buscador", yo), { name: "Martina", busqueda: [], updatedAt: "", logs: {} }), false);
await signOut(auth);
await signInAnonymously(auth);
let encontrados = [];
await espera("otro me busca por 'mar' (límite 25)", async () => { const s = await getDocs(query(collection(db, "buscador"), where("busqueda", "array-contains", "mar"), limit(25))); encontrados = s.docs.map((d) => d.data().name); }, true);
console.log("  encontrados:", encontrados);
if (!encontrados.includes("Martina Paz")) { mal++; console.log("✗ no apareció Martina"); } else ok++;
await espera("sin límite no se lista", () => getDocs(query(collection(db, "buscador"), where("busqueda", "array-contains", "mar"))), false);
await espera("con límite 200 no se lista", () => getDocs(query(collection(db, "buscador"), limit(200))), false);
// LOS CÓDIGOS DE REGALO: el dueño los crea (acá, como administrador del emulador).
const admin = (ruta, campos) => fetch(`http://127.0.0.1:8080/v1/projects/demo-gymapp/databases/(default)/documents/${ruta}`, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: campos }) });
await admin("codigos/MODUS-TEST-0001", { dias: { integerValue: "30" }, nota: { stringValue: "prueba" } });
await admin("codigos/MODUS-TEST-0002", { nota: { stringValue: "prueba" } });
await signOut(auth);
const canjeador = (await signInAnonymously(auth)).user.uid;
await espera("leo un código puntual", () => getDoc(doc(db, "codigos", "MODUS-TEST-0001")), true);
await espera("no listo los códigos", () => getDocs(query(collection(db, "codigos"), limit(5))), false);
await espera("no creo un código", () => setDoc(doc(db, "codigos", "MODUS-FAKE-0000"), { dias: 9999 }), false);
await espera("no lo canjeo a nombre de otro", () => updateDoc(doc(db, "codigos", "MODUS-TEST-0001"), { usadoPor: "otro", usadoEn: new Date().toISOString() }), false);
await espera("no le cambio los días", () => updateDoc(doc(db, "codigos", "MODUS-TEST-0001"), { usadoPor: canjeador, usadoEn: "x", dias: 9999 }), false);
await espera("lo canjeo a mi nombre", () => updateDoc(doc(db, "codigos", "MODUS-TEST-0001"), { usadoPor: canjeador, usadoEn: new Date().toISOString() }), true);
await espera("no lo canjeo dos veces", () => updateDoc(doc(db, "codigos", "MODUS-TEST-0001"), { usadoPor: canjeador, usadoEn: "otra" }), false);
await espera("no lo borro", () => deleteDoc(doc(db, "codigos", "MODUS-TEST-0002")), false);
await signOut(auth);
await signInAnonymously(auth);
await espera("otro no usa uno ya canjeado", () => updateDoc(doc(db, "codigos", "MODUS-TEST-0001"), { usadoPor: auth.currentUser.uid, usadoEn: "x" }), false);
await espera("otro canjea uno libre", () => updateDoc(doc(db, "codigos", "MODUS-TEST-0002"), { usadoPor: auth.currentUser.uid, usadoEn: new Date().toISOString() }), true);
// 12/11: amistades, aplausos, entrenador y @usuario solo con sus campos.
const u = auth.currentUser.uid;
const par = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
const hoy = new Date().toISOString();
const texto = (x) => ({ stringValue: x });
await espera("no pido amistad con campos de más", () => setDoc(doc(db, "friendships", par(u, "zzz")), { users: [u, "zzz"].sort(), status: "pending", requestedBy: u, createdAt: hoy, respondedAt: null, basura: "x".repeat(5000) }), false);
await espera("pido amistad", () => setDoc(doc(db, "friendships", par(u, "zzz")), { users: [u, "zzz"].sort(), status: "pending", requestedBy: u, createdAt: hoy, respondedAt: null }), true);
await espera("no acepto mi propio pedido", () => updateDoc(doc(db, "friendships", par(u, "zzz")), { status: "accepted", respondedAt: hoy }), false);
await admin(`friendships/${par(u, "amigo1")}`, { users: { arrayValue: { values: [u, "amigo1"].sort().map(texto) } }, status: texto("pending"), requestedBy: texto("amigo1") });
await espera("no acepto metiendo campos", () => updateDoc(doc(db, "friendships", par(u, "amigo1")), { status: "accepted", respondedAt: hoy, basura: 1 }), false);
await espera("acepto a un amigo", () => updateDoc(doc(db, "friendships", par(u, "amigo1")), { status: "accepted", respondedAt: hoy }), true);
await espera("no aplaudo con campos de más", () => setDoc(doc(db, "kudos", `amigo1_${u}_2026-11-12`), { toUid: "amigo1", fromUid: u, date: "2026-11-12", createdAt: hoy, basura: "x" }), false);
await espera("aplaudo a un amigo", () => setDoc(doc(db, "kudos", `amigo1_${u}_2026-11-12`), { toUid: "amigo1", fromUid: u, date: "2026-11-12", createdAt: hoy }), true);
await espera("no pido entrenador con campos de más", () => setDoc(doc(db, "trainerLinks", `${u}_alumno1`), { trainerUid: u, studentUid: "alumno1", status: "pending", requestedBy: u, createdAt: hoy, respondedAt: null, basura: 1 }), false);
await espera("pido ser entrenador", () => setDoc(doc(db, "trainerLinks", `${u}_alumno1`), { trainerUid: u, studentUid: "alumno1", status: "pending", requestedBy: u, createdAt: hoy, respondedAt: null }), true);
await admin(`trainerLinks/profe1_${u}`, { trainerUid: texto("profe1"), studentUid: texto(u), status: texto("pending"), requestedBy: texto("profe1") });
await espera("no acepto al profe cambiando quién pidió", () => updateDoc(doc(db, "trainerLinks", `profe1_${u}`), { status: "accepted", requestedBy: u }), false);
await espera("acepto al profe", () => updateDoc(doc(db, "trainerLinks", `profe1_${u}`), { status: "accepted", respondedAt: hoy }), true);
await espera("no reservo un @usuario con campos de más", () => setDoc(doc(db, "usernames", "prueba_1234"), { uid: u, basura: "x" }), false);
await espera("reservo un @usuario", () => setDoc(doc(db, "usernames", "prueba_1234"), { uid: u }), true);
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
