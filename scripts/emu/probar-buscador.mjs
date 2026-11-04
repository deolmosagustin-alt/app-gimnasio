// Prueba de las reglas del buscador en el emulador (sin tocar producción).
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInAnonymously, signOut } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDocs, query, collection, where, limit } from "firebase/firestore";
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
console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
