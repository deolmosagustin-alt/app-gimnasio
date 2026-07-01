import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  Play, Pause, RotateCcw, TrendingUp, TrendingDown, Dumbbell,
  ChevronDown, ChevronUp, ChevronLeft, Trophy, Flame, Save, Trash2, BarChart3,
  ListChecks, LogOut, X, Check, AlertTriangle, Calendar, Zap,
  Mail, Clock, ChevronRight, Edit3, Info, Plus, Sun, Moon,
  Target, Award, Activity, ArrowDown, HelpCircle, List, LayoutGrid,
  Sparkles, Layers, Video, SlidersHorizontal, ShieldCheck, UserCog,
  Share2, Download, Link2, Copy, BellOff, Send, Mic, Ruler, Camera, Link, Footprints, Star, SquarePlay,
} from "lucide-react";
import { signInWithPopup, signOut } from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { doc, setDoc, getDoc, enableIndexedDbPersistence } from "firebase/firestore";
import Model from "react-body-highlighter";
import { auth, googleProvider, db, app } from "./firebase";
// Catálogo de ejercicios, grupos musculares y rutinas preestablecidas —
// movidos a data.js para que este archivo quede más liviano. RANK_TIERS
// sigue acá abajo, sin tocar.
import {
  MUSCLE_GROUPS, MUSCLE_GROUP_BY_KEY, EXERCISE_LIBRARY, EXERCISE_LIBRARY_BY_ID,
  EXERCISE_LIBRARY_BY_GROUP, EXERCISE_LIBRARY_CONTRIBUTORS_BY_GROUP,
  PRESET_ROUTINES, PRESET_ROUTINES_BY_ID, CLASSIC_PRESET,
} from "./data";

/* ============================================================================
   GEMINI — la clave de la API ya NO vive en este archivo ni en Remote
   Config (eso era visible para cualquiera que abriera las herramientas de
   desarrollador, sin importar desde dónde se la bajara). Ahora vive como
   variable de entorno del servidor (GEMINI_API_KEY en Vercel), y nunca
   llega al navegador: el cliente le pega a "/api/ia" (ver api/ia.js, una
   función serverless de Vercel), y es ESA función la que le habla a
   Gemini con la clave real.
============================================================================ */
/* ============================================================================
   BIBLIOTECA DE EJERCICIOS Y RUTINAS — a partir de esta actualización, la app
   ya no tiene una sola rutina fija. Hay:

   1. EXERCISE_LIBRARY: el catálogo de ejercicios (por grupo muscular), cada
      uno con nombre, músculo específico, una breve nota/recomendación y un
      video de referencia. Es de donde se elige al crear una rutina propia.
   2. PRESET_ROUTINES: rutinas prearmadas (Push/Pull/Legs, Arnold Split,
      Upper/Lower, Cuerpo Completo, y "Push / Pull / Pierna + Hombros / Brazos" que es la rutina original
      de la app — se mantiene para no romper los datos de perfiles viejos).
   3. Cada perfil guarda SUS PROPIAS rutinas en profile.routines (las que
      activó de la lista de preestablecidas, más las que creó), y cuál está
      activa en profile.activeRoutineId. Los registros (logs) siguen
      identificando cada ejercicio por su id de forma global — así, si dos
      rutinas distintas usan "Press Banca", tu marca histórica es la misma
      sin importar en qué rutina la estés entrenando.

   Para que todo el resto de los componentes (que ya leían ROUTINE,
   DAY_ORDER, EXERCISE_BY_ID, KEY_TO_DAY como constantes fijas) sigan
   funcionando sin tocarlos uno por uno, esas cuatro variables ahora son
   "mutables": applyRoutineModel(...) las recalcula a partir de la rutina
   activa cada vez que cambia, y el componente App() la llama en cada
   render — así cualquier componente que las lea durante el render ve
   siempre los datos de la rutina activa del perfil actual.
============================================================================ */

const yt = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

function mkSets(n, repRange) { return Array.from({ length: n }, () => ({ repRange })); }

// Mezcla un color hexadecimal hacia gris para obtener una versión más tenue
// (menos saturada) — se usa en las iniciales de día (P/P/P/H, etc.) tanto en
// Rutinas como en las etiquetas de día del Historial de Progreso, para que
// no griten tanto.
function muteHexColor(hex, towardsGray = 0.45) {
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

function cloneRoutineDef(def) { return JSON.parse(JSON.stringify(def)); }

// Cuando activás una rutina preestablecida, lo que se guarda en tu perfil
// es una FOTO de ese momento (cloneRoutineDef). Si más adelante corregimos
// algo del catálogo (por ejemplo, un nombre mal escrito), esa foto vieja
// se queda como estaba — y por eso alguien podía seguir viendo "Clásica"
// en "Tu rutina activa" mucho después de que el catálogo ya dijera otra
// cosa. Como las preestablecidas no son "tuyas" para renombrar, esta
// función siempre prioriza la versión actual del catálogo para nombre,
// descripción y ejercicios — lo único que conserva de tu copia guardada es
// el cronograma semanal que hayas personalizado. Las rutinas creadas por
// el usuario (source !== "preset") se devuelven tal cual, sin tocar nada.
function resolveRoutineDef(routineEntry, routineId) {
  if (!routineEntry) return null;
  const livePreset = routineId ? PRESET_ROUTINES_BY_ID[routineId] : null;
  if (routineEntry.source === "preset" && livePreset) {
    return { ...livePreset, weekSchedule: routineEntry.weekSchedule || livePreset.weekSchedule };
  }
  return routineEntry;
}

/* ============================== COMPARTIR RUTINAS ==============================
   Antes, "compartir por link" codificaba la rutina entera en base64 dentro
   del propio link (#shared-routine=...) — sin backend, pero generaba
   enlaces de más de 3000 caracteres que WhatsApp e Instagram bloqueaban o
   recortaban, así que en la práctica casi nunca llegaban completos. Ahora
   que ya hay Firebase Firestore configurado (`db`), la rutina se guarda
   ahí bajo un ID corto al azar (6 caracteres) en la colección
   "shared_routines", y el link sólo lleva ese ID (#r=ID_CORTO) — corto de
   verdad, sin límites de longitud para la rutina en sí.

   IMPORTANTE — esto necesita un paso de configuración fuera de este
   archivo: las reglas de seguridad de Firestore tienen que permitir
   escribir en la colección "shared_routines" (por defecto, Firestore
   RECHAZA toda lectura/escritura hasta que se lo permitas explícitamente
   en la consola de Firebase). Si nunca se configuró esto, CUALQUIER
   intento de compartir una rutina va a fallar con "permission-denied" —
   se ve exactamente como "no pudimos generar el enlace", sin relación
   con cómo está organizado el código (App.jsx vs. data.js).
   En Firebase Console → Firestore Database → Reglas, agregá algo como:
     match /shared_routines/{shortId} {
       allow read: if true;
       allow create: if true;
       allow update, delete: if false;
     }
   (lectura y creación públicas porque cualquiera con el link tiene que
   poder verla sin iniciar sesión; nunca se debería poder pisar o borrar
   una ya creada). */
async function shareRoutineToFirestore(routineDef) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let shortId = "";
  for (let i = 0; i < 6; i++) shortId += chars[Math.floor(Math.random() * chars.length)];
  try {
    await setDoc(doc(db, "shared_routines", shortId), routineDef);
  } catch (err) {
    // Se reempaqueta el error con un mensaje más claro según la causa real,
    // en vez de dejar que todo termine en el mismo "no pudimos generar el
    // enlace" genérico — así, tanto en la consola como en pantalla, queda
    // claro si hace falta configurar las reglas de Firestore (lo más
    // probable) o si es otra cosa (sin conexión, cuota agotada, etc.).
    if (err?.code === "permission-denied") {
      throw new Error("Firestore rechazó la escritura (permission-denied) — hace falta configurar las reglas de seguridad de la colección \"shared_routines\" en la consola de Firebase para permitir escritura pública. Ver el comentario arriba de shareRoutineToFirestore.");
    }
    throw err;
  }
  const base = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  return `${base}#r=${shortId}`;
}

/* ============================== CUENTA EN LA NUBE ==============================
   Por qué hacía falta esto: iniciar sesión con Google en dos dispositivos
   distintos los trataba como dos cuentas separadas, porque el perfil vivía
   únicamente en el localStorage de CADA dispositivo (Google sólo se usaba
   para identificarte, nunca para guardar nada). Estas dos funciones leen y
   escriben el perfil en Firestore, en la colección "users", usando el
   googleUid como id del documento — así el mismo uid encuentra el mismo
   perfil sin importar desde qué computadora o celular entres.
   Para que esto funcione de verdad hace falta que las reglas de seguridad
   de Firestore permitan a cada usuario autenticado leer y escribir
   ÚNICAMENTE su propio documento en "users" (algo como
   `allow read, write: if request.auth.uid == userId;`) — eso se configura
   en la consola de Firebase, no acá.
   Importante para entender el alcance real de este cambio: esto sincroniza
   el perfil en el momento de iniciar sesión (y la primera vez que vinculás
   Google), no en tiempo real con cada serie que guardás. Si querés que
   cada entrenamiento se suba solo apenas lo registrás (sin tener que volver
   a iniciar sesión), eso es un paso más grande — avisame si lo querés y lo
   armamos en otra vuelta. */
// Activa la persistencia offline de Firestore — esto hace que Firestore
// guarde una copia local de todos los datos que lee y escribe, y los
// encolados que no se pudieron subir por falta de conexión los sube
// automáticamente cuando vuelve internet, sin que tengamos que hacer nada
// extra. Es la pieza clave del comportamiento "offline-first": el usuario
// puede entrenar sin internet y cuando se conecte el próximo sync sube todo.
// Se llama una sola vez al cargar la app. Los errores de "ya habilitada" o
// "no soportada" se ignoran — no rompen nada.
try {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code !== "failed-precondition" && err.code !== "unimplemented") {
      console.warn("Firestore offline persistence:", err);
    }
  });
} catch { /* no-op */ }

// Qué campos del perfil van a la nube y cuáles se quedan solo en local.
// Las fotos de progreso NO se sincronizan — viven en IndexedDB porque
// son binarios grandes; Firestore tiene un límite de 1MB por documento,
// y unas pocas fotos sin comprimir lo agotarían. El resto (logs, sesiones,
// medidas, rutinas, configuración) sí sube completo.
const CLOUD_PROFILE_FIELDS = [
  "name", "email", "sex", "age", "joinedAt", "googleUid",
  "settings", "logs", "trainingSessions", "measurements",
  "deloadProgress", "activeRoutineId", "routines", "weekSchedule",
  "dismissedMissedDayNotice",
];
function profileToCloud(profile) {
  const out = {};
  CLOUD_PROFILE_FIELDS.forEach((k) => { if (profile[k] !== undefined) out[k] = profile[k]; });
  return out;
}

// Descarga el perfil completo desde Firestore.
async function fetchProfileFromCloud(uid) {
  try {
    const docSnap = await getDoc(doc(db, "users", uid));
    return docSnap.exists() ? docSnap.data() : null;
  } catch (err) {
    console.error("Error al leer el perfil desde la nube:", err);
    return null;
  }
}

// Sube el perfil completo a Firestore — merge:true para no pisar campos
// que otro dispositivo pudo haber actualizado mientras estabas offline.
// Esta función es la que se llama en todos los puntos de guardado de la
// app (con un debounce de 4 segundos para no spamear Firestore con cada
// tecla que escribís en el input de kg).
async function syncProfileToCloud(uid, profile) {
  try {
    const data = profileToCloud(profile);
    await setDoc(doc(db, "users", uid), { ...data, _syncedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    // Si hay un error de red (offline), Firestore lo encola solo y lo
    // reintenta cuando vuelve la conexión — no hace falta manejar ese
    // caso acá. Solo logueamos para detectar errores reales.
    console.error("Error al sincronizar el perfil a la nube:", err);
  }
}

// Merge inteligente al entrar desde un dispositivo nuevo: toma lo más
// reciente entre el local y el de la nube, campo por campo, usando
// _syncedAt como criterio. Si alguno de los dos no tiene _syncedAt
// (perfil viejo, antes de esta implementación), gana el de la nube —
// porque el local ya fue descargado en algún momento y la nube tiene
// lo más actualizado.
function mergeProfiles(local, cloud) {
  if (!cloud) return local;
  if (!local) return cloud;
  const localTime = local._syncedAt ? new Date(local._syncedAt).getTime() : 0;
  const cloudTime = cloud._syncedAt ? new Date(cloud._syncedAt).getTime() : Infinity;
  if (cloudTime >= localTime) {
    // La nube es más reciente — usamos la nube como base, pero
    // preservamos los logs locales si la nube no tiene ninguno (el
    // usuario pudo haber entrenado offline y ese sync todavía no subió).
    return {
      ...cloud,
      logs: (cloud.logs && Object.keys(cloud.logs).length > 0) ? cloud.logs : (local.logs || {}),
      trainingSessions: cloud.trainingSessions?.length > 0 ? cloud.trainingSessions : (local.trainingSessions || []),
      measurements: (cloud.measurements && Object.keys(cloud.measurements).length > 0) ? cloud.measurements : (local.measurements || {}),
    };
  }
  return local;
}

// Debounce util — devuelve una versión de la función que se llama como
// máximo una vez cada `ms` ms, ignorando las llamadas intermedias.
function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Convierte una definición de rutina (preset o creada por el usuario) en el
// modelo "resuelto" que usa el resto de la app: cada ejercicio ya trae su
// nombre/músculo/nota/video (sacados de la biblioteca, salvo que sea un
// ejercicio personalizado, que sólo trae lo que el usuario tipeó).
function buildRoutineModel(routineDef) {
  const dayOrder = routineDef.dayOrder;
  const days = {};
  const exerciseById = {};
  const keyToDay = {};
  dayOrder.forEach((dk) => {
    const d = routineDef.days[dk];
    const exercises = (d.exercises || []).map((entry) => {
      const lib = entry.libId ? EXERCISE_LIBRARY_BY_ID[entry.libId] : null;
      const id = entry.idOverride || (lib ? lib.id : entry.id);
      const name = lib ? lib.name : entry.name;
      const muscle = lib ? lib.muscle : (entry.muscle || "Personalizado");
      const nota = lib ? lib.nota : (entry.nota || null);
      const video = lib ? yt(lib.videoQuery) : null;
      const cardio = !!(lib ? lib.cardio : entry.cardio);
      return { id, name, muscle, nota, video, sets: entry.sets, custom: !lib, cardio, supersetNext: !!entry.supersetNext };
    });
    days[dk] = { ...d, exercises };
    exercises.forEach((ex) => {
      exerciseById[ex.id] = { ...ex, dayKey: dk };
      ex.sets.forEach((_, i) => { keyToDay[`${ex.id}_${i}`] = dk; });
    });
  });
  return { dayOrder, days, exerciseById, keyToDay };
}

// ROUTINE / DAY_ORDER / EXERCISE_BY_ID / KEY_TO_DAY son las cuatro variables
// que el resto del archivo usa para "la rutina de ahora". Se reasignan cada
// vez que cambia la rutina activa — ver applyRoutineModel() más abajo y su
// uso en el componente App().
let ROUTINE = {};
let DAY_ORDER = [];
let EXERCISE_BY_ID = {};
let KEY_TO_DAY = {};

function applyRoutineModel(routineDef) {
  const model = buildRoutineModel(routineDef);
  DAY_ORDER = model.dayOrder;
  ROUTINE = model.days;
  EXERCISE_BY_ID = model.exerciseById;
  KEY_TO_DAY = model.keyToDay;
}

// Valor inicial (antes de que cargue cualquier perfil) para que nada truene.
applyRoutineModel(CLASSIC_PRESET);

/* ============================== CONSTANTS ============================== */

const REST_LONG = 300;
const REST_SHORT = 180;
const TRAIN_WEEKS = 7;
const DELOAD_WEEKS = 1;
const CYCLE_WEEKS = TRAIN_WEEKS + DELOAD_WEEKS;
const STAGNATION_DAYS = 21;

// Actualizá esto con tu applicationId real apenas lo tengas (Play Console
// → tu app → la URL de la ficha, o simplemente
// com.tu_paquete.elegido) — se usa para el botón "Dejanos una reseña" que
// aparece al completar el primer ciclo. Mientras la app no esté publicada,
// el link no encuentra nada — no rompe nada, pero tampoco sirve hasta que
// lo reemplaces.
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.agustin.mirutina";

const DEFAULT_SETTINGS = {
  alertType: "sound", restLong: REST_LONG, restShort: REST_SHORT,
  trainWeeks: TRAIN_WEEKS, deloadWeeks: DELOAD_WEEKS, deloadPct: 0.75, deloadSetDivisor: 2,
  theme: "dark", textScale: 1, smallTextScale: 1, autoShowPrShare: true, bodyWeightKg: 0, muscleRankMode: "general", allowZoom: false,
};

function getProfileSettings(profile) { return { ...DEFAULT_SETTINGS, ...(profile?.settings || {}) }; }

// Opciones de tamaño de letra (Perfil → Tamaño de letra). El valor se aplica
// como font-size del elemento raíz (<html>) — la mayoría de los tamaños de
// Tailwind usados en la app (text-xs, text-sm, text-base, text-lg, text-xl,
// text-2xl...) están definidos en rem, así que escalan todos juntos y en
// proporción al cambiar este único valor. Las etiquetas chiquitas escritas
// con un tamaño fijo en píxeles (ej. text-[10px]) no escalan con este
// control — para esas existe el segundo control de abajo.
const TEXT_SCALE_OPTIONS = [
  { k: "sm", v: 0.9, l: "Chica" },
  { k: "md", v: 1, l: "Normal" },
  { k: "lg", v: 1.15, l: "Grande" },
  { k: "xl", v: 1.3, l: "Muy grande" },
];

// Opciones para las "letras chicas" (consejos de cada ejercicio, récord,
// badges de RPE/día, etc.) — todo lo que en el código usa text-[Npx] con un
// tamaño fijo en píxeles. Se aplican multiplicando la variable CSS
// --small-text-scale (ver ANIMATION_CSS), no el font-size del <html>.
const SMALL_TEXT_SCALE_OPTIONS = [
  { k: "md", v: 1, l: "Normal" },
  { k: "lg", v: 1.25, l: "Grande" },
  { k: "xl", v: 1.5, l: "Muy grande" },
];

// RPE (esfuerzo percibido). 6-10 cubre el rango útil para hipertrofia/fuerza;
// por debajo de 6 casi no aporta información de fatiga.
const RPE_SCALE = [
  { value: 6, desc: "4+ en reserva" },
  { value: 7, desc: "3 en reserva" },
  { value: 8, desc: "2 en reserva" },
  { value: 9, desc: "1 en reserva" },
  { value: 10, desc: "Al fallo" },
];
function rpeColor(v) {
  if (v == null) return "#475569";
  if (v >= 9) return "#F43F5E";
  if (v >= 8) return "#F59E0B";
  if (v >= 7) return "#14B8A6";
  return "#3B82F6";
}

/* ============================== STORAGE: localStorage ============================== */

const PROFILES_KEY = "gym_profiles_v2";
const ACTIVE_KEY = "gym_active_v2";
const CYCLE_START_KEY = "gym_cycle_start_v2";

function getDeviceId() {
  let id = localStorage.getItem("gym_device_id");
  if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("gym_device_id", id); }
  return id;
}

// Perfiles de versiones anteriores de la app (antes de que existieran
// múltiples rutinas) no tienen `routines`/`activeRoutineId`. Si ya tenían
// `maxesSetupDays` es señal de que es un perfil viejo con datos reales: se le
// asigna la rutina "Push / Pull / Pierna + Hombros / Brazos" automáticamente, sin pedirle nada, para que no
// pierda ni su rutina ni su historial. Un perfil realmente nuevo (creado ya
// con esta versión) no tiene `maxesSetupDays`, así que se lo deja sin rutina
// activa a propósito: la pantalla de Rutinas se va a encargar de pedírsela.
function migrateProfile(p) {
  if (p.routines && p.activeRoutineId) return p;
  if (p.maxesSetupDays) {
    return { ...p, routines: { [CLASSIC_PRESET.id]: cloneRoutineDef(CLASSIC_PRESET) }, activeRoutineId: CLASSIC_PRESET.id };
  }
  return p;
}

function loadAndMigrateProfiles() {
  const raw = (() => { try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || "{}"); } catch { return {}; } })();
  const out = {};
  Object.entries(raw).forEach(([name, p]) => { out[name] = migrateProfile(p); });
  return out;
}

function loadProfiles() { return loadAndMigrateProfiles(); }
function saveProfiles(p) { try { localStorage.setItem(PROFILES_KEY, JSON.stringify(p)); } catch {} idbPut("profiles", p); }
function loadActive() { try { return localStorage.getItem(ACTIVE_KEY) || null; } catch { return null; } }
function saveActive(n) { try { n ? localStorage.setItem(ACTIVE_KEY, n) : localStorage.removeItem(ACTIVE_KEY); } catch {} idbPut("active", n); }
function loadCycleStart() { try { const raw = localStorage.getItem(CYCLE_START_KEY); return raw ? new Date(raw) : null; } catch { return null; } }
function saveCycleStart(d) { try { localStorage.setItem(CYCLE_START_KEY, d.toISOString()); } catch {} idbPut("cycleStart", d.toISOString()); }

/* ============================== STORAGE: IndexedDB backup ==============================
   localStorage tops out around 5MB y un "clear site data" la borra al instante.
   Cada escritura se espeja, best-effort, en IndexedDB para tener una segunda copia
   de la cual recuperarse. Nada de esto tira un error a la UI — si IndexedDB no
   está disponible (navegador viejo, modo privado, etc.) la app sigue funcionando
   solo con localStorage. */

const IDB_NAME = "gym_app_backup_v1";
const IDB_STORE = "snapshots";

function openIDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) { reject(new Error("no-idb")); return; }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key, value) {
  try {
    const db = await openIDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put({ value, savedAt: new Date().toISOString() }, key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch { /* best effort, ignore */ }
}

async function idbGetAll() {
  try {
    const db = await openIDB();
    const out = await new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const keysReq = store.getAllKeys();
      keysReq.onsuccess = () => {
        const keys = keysReq.result;
        if (!keys.length) { res({}); return; }
        const result = {}; let remaining = keys.length;
        keys.forEach((k) => {
          const r = store.get(k);
          r.onsuccess = () => { result[k] = r.result?.value ?? null; remaining--; if (remaining === 0) res(result); };
          r.onerror = () => { remaining--; if (remaining === 0) res(result); };
        });
      };
      keysReq.onerror = () => rej(keysReq.error);
    });
    db.close();
    return out;
  } catch { return null; }
}

// Lectura de UNA sola clave — usado por las fotos de progreso. A
// diferencia de profiles/active/cycleStart (que viven en localStorage Y
// se espejan en IndexedDB como respaldo), las fotos viven DIRECTO en
// IndexedDB — localStorage tiene un límite de unos 5MB en total, y unas
// pocas fotos ya lo agotarían; IndexedDB no tiene ese problema.
async function idbGet(key) {
  try {
    const db = await openIDB();
    const result = await new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const r = tx.objectStore(IDB_STORE).get(key);
      r.onsuccess = () => res(r.result ? r.result.value : null);
      r.onerror = () => rej(r.error);
    });
    db.close();
    return result;
  } catch { return null; }
}

// Used once on boot if localStorage looks empty — recupera el último snapshot bueno.
async function tryRestoreFromIDB() {
  const snap = await idbGetAll();
  if (!snap || !snap.profiles || !Object.keys(snap.profiles).length) return null;
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(snap.profiles)); } catch {}
  if (snap.active) try { localStorage.setItem(ACTIVE_KEY, snap.active); } catch {}
  if (snap.cycleStart) try { localStorage.setItem(CYCLE_START_KEY, snap.cycleStart); } catch {}
  return snap;
}

/* ============================== HAPTICS ============================== */

function haptic(pattern = 25) {
  try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern); } catch {}
}

/* ============================== TIME / MATH HELPERS ============================== */

function todayStr() { return new Date().toISOString().slice(0, 10); }
function formatTime(s) { return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`; }
function vol(kg, reps) { return (!kg || !reps) ? 0 : kg * reps; }
function estimate1RM(kg, reps) { return (!kg || !reps) ? 0 : Math.round(kg * (1 + reps / 30) * 10) / 10; }
function repRangeTop(repRange) { const parts = String(repRange).split("-"); return parseInt(parts[parts.length - 1], 10); }
// Detecta series de fuerza automáticamente: si el techo del rango de
// repeticiones es 6 o menos, se la considera "FUERZA" — sin que nadie tenga
// que marcarla a mano al crear la rutina.
function isHeavyRepRange(repRange) { const top = repRangeTop(repRange); return !isNaN(top) && top <= 6; }

function parseLogKey(key) {
  const idx = key.lastIndexOf("_");
  return { exerciseId: key.slice(0, idx), setIndex: parseInt(key.slice(idx + 1), 10) };
}

// Días "entrenados": unión de fechas que tienen al menos una serie guardada
// y fechas con una sesión explícita (botón Iniciar/Finalizar sesión)
// finalizada — así un día cuenta como entrenado aunque te hayas olvidado de
// guardar alguna serie individual, mientras hayas usado Inicio/Fin de sesión.
function getTrainedDateSet(logs, sessions) {
  const s = new Set();
  Object.entries(logs).forEach(([k, v]) => { if (k.endsWith("_pr_override") || !Array.isArray(v)) return; v.forEach((e) => s.add(e.date)); });
  (sessions || []).forEach((ses) => { if (ses?.date) s.add(ses.date); });
  return s;
}

function getSuggestedDay(logs) {
  let lastDate = null;
  Object.entries(logs).forEach(([k, v]) => { if (k.endsWith("_pr_override") || !Array.isArray(v) || !KEY_TO_DAY[k]) return; v.forEach((e) => { if (!lastDate || e.date > lastDate) lastDate = e.date; }); });
  if (!lastDate) return DAY_ORDER[0];
  let lastDayKey = null;
  Object.entries(logs).forEach(([k, v]) => { if (k.endsWith("_pr_override") || !Array.isArray(v) || !KEY_TO_DAY[k]) return; if (v.some((e) => e.date === lastDate)) lastDayKey = KEY_TO_DAY[k]; });
  if (!lastDayKey) return DAY_ORDER[0];
  return DAY_ORDER[(DAY_ORDER.indexOf(lastDayKey) + 1) % DAY_ORDER.length];
}

/* ============================== CRONOGRAMA SEMANAL ==============================
   Cada rutina puede tener un `weekSchedule`: qué día de tu rutina (o
   descanso) corresponde a cada día de la semana calendario (lunes a
   domingo). Esto es lo que le permite a la app reconocer sola en qué día
   estás (en vez de adivinar solo por el último día entrenado), y también
   permite repetir días de la rutina dentro de la semana — por ejemplo un
   Upper/Lower de 2 días entrenado 4 veces por semana (lun=Upper, mar=Lower,
   mié=descanso, jue=Upper, vie=Lower, sáb/dom=descanso).

   Si una rutina todavía no tiene `weekSchedule` guardado (rutinas viejas,
   o recién activadas), se genera uno por defecto: ubica los días de la
   rutina de corrido a partir del lunes, y descanso el resto de la semana —
   eso es el "por defecto en base a la rutina" que se puede después
   personalizar día por día desde Rutinas. */
const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKDAY_SHORT_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const WEEKDAY_FULL_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function defaultWeekSchedule(dayOrder) {
  const sched = {};
  WEEKDAY_KEYS.forEach((wk, i) => { sched[wk] = dayOrder[i] || null; });
  return sched;
}

// Devuelve el cronograma de una rutina (el guardado, o uno por defecto
// calculado al vuelo si todavía no se personalizó ninguno).
function getRoutineWeekSchedule(routineDef) {
  if (!routineDef) return {};
  return routineDef.weekSchedule || defaultWeekSchedule(routineDef.dayOrder || []);
}

function todayWeekdayKey(date = new Date()) {
  const jsDay = date.getDay(); // 0=domingo .. 6=sábado
  return WEEKDAY_KEYS[(jsDay + 6) % 7]; // reordenado a 0=lunes .. 6=domingo
}

// El día de rutina que te toca HOY según tu cronograma — null si hoy es
// descanso programado, o si el día guardado ya no existe en la rutina
// (por ej. lo borraste al editarla).
function getScheduledDayForToday(routineDef) {
  const sched = getRoutineWeekSchedule(routineDef);
  const dk = sched[todayWeekdayKey()];
  if (dk && DAY_ORDER.includes(dk)) return dk;
  return null;
}

function getStagnationInfo(exercise, logs) {
  let stagnant = false, maxGapDays = 0;
  exercise.sets.forEach((s, i) => {
    const key = `${exercise.id}_${i}`, hist = logs[key] || [];
    if (hist.length === 0) return;
    const overrideDate = logs[`${key}_pr_override`]?.date;
    if (!overrideDate) return;
    const lastTrainedDate = hist.reduce((max, h) => (h.date > max ? h.date : max), hist[0].date);
    const gapDays = Math.round((new Date(lastTrainedDate) - new Date(overrideDate)) / 86400000);
    if (gapDays > maxGapDays) maxGapDays = gapDays;
    if (gapDays >= STAGNATION_DAYS) stagnant = true;
  });
  return { stagnant, maxGapDays };
}

// Calentamiento sugerido: rampa clásica de fuerza (50% → 70% → 85% del
// peso de trabajo), redondeada de a 2.5kg como el resto de la app. Se
// basa en el kg más pesado registrado en CUALQUIERA de las series del
// ejercicio (no en una serie puntual) — es lo más parecido a "tu peso de
// trabajo de hoy" sin tener que pedirte que lo cargues de antemano.
const WARMUP_STEPS = [
  { pct: 0.5, reps: 8 },
  { pct: 0.7, reps: 5 },
  { pct: 0.85, reps: 3 },
];
function getBestWorkingKg(exercise, logs) {
  let best = null;
  exercise.sets.forEach((s, i) => {
    const key = `${exercise.id}_${i}`;
    const ov = logs[`${key}_pr_override`];
    if (ov && (!best || ov.kg > best)) best = ov.kg;
    (logs[key] || []).forEach((h) => { if (!best || h.kg > best) best = h.kg; });
  });
  return best;
}

function getWeekInfo(cycleStart, settings = DEFAULT_SETTINGS) {
  if (!cycleStart) return null;
  const { trainWeeks = TRAIN_WEEKS, deloadWeeks = DELOAD_WEEKS } = settings;
  const cycleWeeks = trainWeeks + deloadWeeks;
  const diffDays = Math.floor((new Date() - cycleStart) / 86400000);
  const totalWeek = Math.floor(diffDays / 7);
  const weekInCycle = (totalWeek % cycleWeeks) + 1;
  const isDeload = weekInCycle > trainWeeks;
  return { totalWeek: totalWeek + 1, weekInCycle, isDeload, cycleNumber: Math.floor(totalWeek / cycleWeeks) + 1, cycleWeeks, trainWeeks, deloadWeeks };
}

/* ============================== SESSION HISTORY ==============================
   Turns the flat `logs` object (keyed by "<exerciseId>_<setIndex>") into a
   chronological list of "sessions" — one entry per date actually trained,
   with every set logged that day, total volume and average RPE. */

function buildSessionsIndex(logs) {
  const byDate = {};
  Object.entries(logs).forEach(([key, entries]) => {
    if (key.endsWith("_pr_override") || !Array.isArray(entries)) return;
    const { exerciseId, setIndex } = parseLogKey(key);
    const ex = EXERCISE_BY_ID[exerciseId];
    if (!ex) return;
    // Historial ordenado de esta serie, para saber si cada registro fue una
    // mejora EN EL MOMENTO en que se guardó (comparado contra lo mejor hasta
    // la fecha anterior) — no contra el récord actual, que puede haber sido
    // corregido a mano después y ya no reflejar lo que pasó ese día.
    const sortedHist = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
    entries.forEach((e) => {
      if (!byDate[e.date]) byDate[e.date] = { date: e.date, dayKeys: new Set(), items: [], totalVolume: 0, rpeSum: 0, rpeCount: 0, improvedCount: 0 };
      const s = byDate[e.date];
      s.dayKeys.add(ex.dayKey);
      const priorBest = sortedHist.filter((h) => h.date < e.date).reduce((max, h) => Math.max(max, vol(h.kg, h.reps)), 0);
      const thisVol = vol(e.kg, e.reps);
      const isImprovement = thisVol > 0 && thisVol > priorBest;
      if (isImprovement) s.improvedCount++;
      s.items.push({ exerciseId, exerciseName: ex.name, dayKey: ex.dayKey, setIndex, reps: e.reps, kg: e.kg, rpe: e.rpe ?? null, isImprovement });
      s.totalVolume += thisVol;
      if (e.rpe != null) { s.rpeSum += e.rpe; s.rpeCount++; }
    });
  });
  return Object.values(byDate)
    .map((s) => ({ ...s, dayKeys: Array.from(s.dayKeys), totalSets: s.items.length, avgRpe: s.rpeCount ? Math.round((s.rpeSum / s.rpeCount) * 10) / 10 : null }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

const WEEKDAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

// Monday-first month grid for the history calendar. Returns weeks of 7 cells,
// each either a "YYYY-MM-DD" string or null for padding outside the month.
function getMonthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d).toISOString().slice(0, 10));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const MONTH_LABELS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/* ============================================================================
   ANIMATIONS — injected once. Keyframes for the PR confetti burst, the record
   "pop", tab fade-ins, and modal transitions. Pure CSS, no animation library.
   Move this into a stylesheet if your build already has one; it works as-is.
============================================================================ */
const ANIMATION_CSS = `
@keyframes prConfettiFall {
  0% { transform: translate(-50%,-50%) rotate(0deg) scale(0.5); opacity: 0; }
  12% { opacity: 1; }
  100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) rotate(var(--rot)) scale(1); opacity: 0; }
}
.pr-confetti { animation: prConfettiFall 0.85s cubic-bezier(.2,.8,.3,1) forwards; }
@keyframes prPop { 0% { transform: scale(1); } 35% { transform: scale(1.22); } 60% { transform: scale(0.94); } 100% { transform: scale(1); } }
.pr-pop { animation: prPop 0.5s ease; display: inline-block; }
@keyframes fadeSlideIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.tab-fade-in { animation: fadeSlideIn 0.25s ease; }
@keyframes modalBgIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes modalPopIn { from { opacity: 0; transform: translateY(12px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
.modal-bg-in { animation: modalBgIn 0.18s ease both; }
.modal-pop-in { animation: modalPopIn 0.22s cubic-bezier(.2,.8,.3,1); }
@keyframes gentleBounceIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
.bounce-in { animation: gentleBounceIn 0.3s cubic-bezier(.34,1.56,.64,1); }

/* Hide the default scrollbar everywhere — vertical page scroll and the
   horizontal chip/card carousels (day tabs, exercise picker, etc.). Scrolling
   still works perfectly, it's just visually invisible for a cleaner look. */
* {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
*::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

/* ============================================================================
   MODO CLARO — pensado para que se vea como el modo claro de cualquier app:
   fondo gris muy claro de página, tarjetas BLANCAS y opacas (no traslúcidas,
   para que no se vean grisáceas/sucias al apilarse unas con otras), textos
   oscuros con buen contraste, y bordes grises suaves. Los colores de acento
   (teal, púrpura, ámbar, rosa, etc.) en sus fondos tintados (bg-teal-500/15,
   etc.) casi no cambian — sólo se retocan los textos de acento muy claros
   (pensados para fondo oscuro) para que se sigan leyendo sobre blanco.

   Nota técnica: esto vive dentro de un template literal de JS. Los
   selectores de Tailwind con caracteres especiales (/, :, [, ], #) necesitan
   escaparse para que CSS los interprete como parte del nombre de la clase —
   y como JS también interpreta las barras invertidas, hay que escribirlas
   DOBLES acá para que llegue una sola al CSS final.
============================================================================ */
.light-mode { color-scheme: light; }

/* Fondo de página: gris muy suave (no blanco puro), para que las tarjetas
   blancas de arriba se despeguen con un contraste sutil — look "Apple /
   Vercel / Linear", no el clásico blanco-sobre-blanco que se ve plano. */
/* Importante: en los contenedores raíz de App(), la clase de fondo y la
   clase "light-mode" viven en el MISMO elemento (ej. el div principal que
   envuelve toda la app). Un selector descendiente como ".light-mode
   .bg-[...]" (con espacio) sólo matchea cuando una está adentro de la otra,
   NO cuando están juntas en el mismo div — por eso antes el fondo general
   de la página se quedaba oscuro aunque las tarjetas de adentro sí
   cambiaran. Por eso van DOS variantes de cada regla: la de siempre (con
   espacio, para cuando son elementos distintos) y la compuesta sin espacio
   (para cuando coinciden en el mismo elemento). */
.light-mode .bg-\\[\\#0a0a0f\\],
.light-mode.bg-\\[\\#0a0a0f\\] { background-color: #f8fafc !important; }
.light-mode .bg-\\[\\#0a0a0f\\]\\/60,
.light-mode.bg-\\[\\#0a0a0f\\]\\/60 { background-color: rgba(248,250,252,0.85) !important; }
.light-mode .bg-\\[\\#0a0a0f\\]\\/90,
.light-mode.bg-\\[\\#0a0a0f\\]\\/90 { background-color: rgba(248,250,252,0.96) !important; }
.light-mode .bg-\\[\\#0f0f1a\\],
.light-mode.bg-\\[\\#0f0f1a\\] { background-color: #ffffff !important; }

/* Tarjetas / superficies principales — blanco PURO y sólido (no rgba), para
   que destaquen limpias sobre el fondo gris, sin tonos grisáceos al
   apilarse una tarjeta sobre otra. */
.light-mode .bg-slate-900,
.light-mode .bg-slate-900\\/40,
.light-mode .bg-slate-900\\/50,
.light-mode .bg-slate-900\\/60,
.light-mode .bg-slate-900\\/80 { background-color: #ffffff !important; }

/* Superficies "recesadas" (paneles internos, inputs) — un gris casi
   imperceptible, apenas un paso por debajo del blanco de la tarjeta que las
   contiene, para dar sensación de profundidad sin ensuciar el conjunto. */
.light-mode .bg-slate-950,
.light-mode .bg-slate-950\\/40,
.light-mode .bg-slate-950\\/50,
.light-mode .bg-slate-950\\/60,
.light-mode .bg-slate-950\\/95 { background-color: #f1f5f9 !important; }

/* Superficies secundarias (chips, botones, inputs) — grises sólidos suaves */
.light-mode .bg-slate-800,
.light-mode .bg-slate-800\\/30,
.light-mode .bg-slate-800\\/40,
.light-mode .bg-slate-800\\/50,
.light-mode .bg-slate-800\\/60,
.light-mode .bg-slate-800\\/70,
.light-mode .bg-slate-800\\/80 { background-color: #eef2f6 !important; }
.light-mode .bg-slate-700,
.light-mode .bg-slate-700\\/80 { background-color: #e2e8f0 !important; }
.light-mode .hover\\:bg-slate-700:hover,
.light-mode .hover\\:bg-slate-700\\/80:hover { background-color: #d8e0e9 !important; }
.light-mode .hover\\:bg-slate-800:hover,
.light-mode .hover\\:bg-slate-800\\/30:hover,
.light-mode .hover\\:bg-slate-800\\/60:hover,
.light-mode .hover\\:bg-slate-800\\/80:hover { background-color: #e2e8f0 !important; }
.light-mode .hover\\:bg-slate-900\\/60:hover { background-color: #f1f5f9 !important; }
.light-mode .active\\:bg-slate-800:active { background-color: #e2e8f0 !important; }

/* Recuadros (stat tiles) dentro de paneles con degradé de color, y
   recuadros de alerta tintados (confirmaciones de borrado) — en claro pasan
   a un gris muy suave para distinguirse del hero pastel que los contiene,
   y el de alerta a un rosa pastel en vez del rojo oscuro translúcido. */
.light-mode .bg-black\\/20 { background-color: rgba(241,245,249,0.9) !important; }
.light-mode .bg-black\\/30 { background-color: rgba(226,232,240,0.95) !important; }
.light-mode .bg-black\\/70 { background-color: rgba(226,232,240,0.97) !important; }
.light-mode .bg-rose-950\\/30 { background-color: rgba(254,226,226,0.85) !important; }
.light-mode .border-white\\/5 { border-color: rgba(15,23,42,0.05) !important; }
.light-mode .border-white\\/10 { border-color: rgba(15,23,42,0.08) !important; }

/* Texto — jerarquía invertida: lo que en oscuro era "casi blanco" pasa a
   "gris casi negro" (#0f172a), y lo que era apenas visible pasa a un gris
   medio (#64748b) y más claro, manteniendo la misma jerarquía relativa. */
.light-mode .text-white,
.light-mode.text-white { color: #0f172a !important; }
.light-mode .text-white\\/80 { color: rgba(15,23,42,0.75) !important; }
.light-mode .hover\\:text-white:hover { color: #0f172a !important; }
.light-mode .text-slate-100,
.light-mode .text-slate-200 { color: #1e293b !important; }
.light-mode .text-slate-300 { color: #334155 !important; }
.light-mode .text-slate-400 { color: #475569 !important; }
.light-mode .text-slate-500 { color: #64748b !important; }
.light-mode .text-slate-600 { color: #94a3b8 !important; }
.light-mode .text-slate-700 { color: #cbd5e1 !important; }
.light-mode .hover\\:text-slate-200:hover { color: #1e293b !important; }
.light-mode .hover\\:text-slate-300:hover { color: #334155 !important; }
.light-mode .hover\\:text-slate-400:hover { color: #475569 !important; }

/* Textos de acento en tonos claros (200/300/400) — se eligieron para leerse
   sobre fondos casi negros y pierden casi todo el contraste sobre fondos
   claros. Sólo en modo claro se oscurecen estos tonos puntuales que se usan
   como texto; los FONDOS tintados con esos mismos colores casi no se tocan. */
.light-mode .text-teal-400 { color: #0d9488 !important; }
.light-mode .hover\\:text-teal-400:hover { color: #0d9488 !important; }
.light-mode .text-teal-300\\/60,
.light-mode .text-teal-300\\/70,
.light-mode .text-teal-400\\/80 { color: rgba(13,148,136,0.85) !important; }
.light-mode .text-cyan-400 { color: #0e7490 !important; }
.light-mode .text-cyan-300\\/60 { color: rgba(14,116,144,0.85) !important; }
.light-mode .text-purple-200,
.light-mode .text-purple-300 { color: #7e22ce !important; }
.light-mode .text-purple-300\\/60,
.light-mode .text-purple-300\\/90 { color: rgba(126,34,206,0.85) !important; }
.light-mode .text-purple-400 { color: #9333ea !important; }
.light-mode .text-purple-500 { color: #7e22ce !important; }
.light-mode .text-rose-300\\/80 { color: rgba(190,18,60,0.9) !important; }
.light-mode .text-rose-400 { color: #e11d48 !important; }
.light-mode .hover\\:text-rose-400:hover { color: #e11d48 !important; }
.light-mode .text-rose-400\\/90 { color: rgba(225,29,72,0.95) !important; }
.light-mode .text-rose-500\\/70 { color: rgba(190,18,60,0.85) !important; }
.light-mode .hover\\:text-rose-500\\/70:hover { color: rgba(190,18,60,0.9) !important; }
.light-mode .text-amber-400 { color: #b45309 !important; }
.light-mode .text-emerald-400 { color: #059669 !important; }
.light-mode .text-blue-400 { color: #1d4ed8 !important; }
.light-mode .text-orange-400 { color: #c2410c !important; }

/* Bordes — grises muy sutiles, sin saltar a la vista */
.light-mode .border-slate-800,
.light-mode .border-slate-800\\/40,
.light-mode .border-slate-800\\/50,
.light-mode .border-slate-800\\/60 { border-color: #e2e8f0 !important; }
.light-mode .border-slate-700,
.light-mode .border-slate-700\\/40,
.light-mode .border-slate-700\\/50,
.light-mode .border-slate-700\\/60 { border-color: #cbd5e1 !important; }
.light-mode .border-slate-600 { border-color: #94a3b8 !important; }
.light-mode .border-slate-500 { border-color: #64748b !important; }
.light-mode .hover\\:border-slate-500:hover { border-color: #94a3b8 !important; }
.light-mode .hover\\:border-slate-600:hover { border-color: #64748b !important; }
.light-mode .focus\\:border-slate-700:focus { border-color: #94a3b8 !important; }
.light-mode .divide-slate-800\\/50 > :not([hidden]) ~ :not([hidden]),
.light-mode .divide-slate-800 > :not([hidden]) ~ :not([hidden]) { border-color: #e2e8f0 !important; }

/* Sombras: el negro translúcido sobre fondo blanco se ve como una mancha
   gris sucia — se reemplaza por una sombra casi imperceptible, estilo
   Apple/Linear (apenas una insinuación de elevación, no un bloque oscuro). */
.light-mode .shadow-black\\/20,
.light-mode .shadow-black\\/30,
.light-mode .shadow-black\\/40,
.light-mode .shadow-black\\/50 { --tw-shadow-color: rgba(15,23,42,0.05) !important; box-shadow: var(--tw-shadow, 0 1px 3px 0 rgba(15,23,42,0.05)) !important; }

/* Tarjetas con degradé propio (hero de Rutinas/Descarga/Progreso/Perfil) —
   ver variables --grad-* aplicadas vía estilo inline en esos componentes.
   En claro, estos degradés pasan a ser pasteles muy suaves (un toque de
   color sobre blanco, no un color saturado) en vez de la versión intensa
   pensada para fondo oscuro.
   --ring-track/--chart-grid/--chart-axis/--chip-border/--chip-text/
   --surface-2/--surface-2-text son grises "neutros" que antes estaban
   escritos a mano como hex fijo en varios componentes (cronómetro,
   gráficos, chips de día/serie inactivos) — ahora salen de aquí, así
   también cambian solos al cambiar de tema. */
:root {
  --grad-hero-purple: linear-gradient(135deg, rgba(168,85,247,0.42), rgba(15,23,42,0.82) 55%, rgba(15,23,42,0.6));
  --grad-hero-blue: linear-gradient(135deg, rgba(59,130,246,0.4), rgba(15,23,42,0.82) 55%, rgba(15,23,42,0.6));
  --grad-hero-teal: linear-gradient(135deg, rgba(20,184,166,0.4), rgba(15,23,42,0.82) 55%, rgba(15,23,42,0.6));
  --grad-profile-avatar: linear-gradient(135deg, #0f172a, rgba(15,23,42,0.5));
  --ring-track: #1a1a2e;
  --chart-grid: #1a1a2e;
  --chart-axis: #334155;
  --chip-border: #1e2035;
  --chip-text: #475569;
  --surface-2: #1e293b;
  --surface-2-text: #64748b;
  --small-text-scale: 1;
}
.light-mode {
  --grad-hero-purple: linear-gradient(135deg, rgba(168,85,247,0.10), rgba(255,255,255,0.96) 55%, #ffffff);
  --grad-hero-blue: linear-gradient(135deg, rgba(59,130,246,0.10), rgba(255,255,255,0.96) 55%, #ffffff);
  --grad-hero-teal: linear-gradient(135deg, rgba(20,184,166,0.10), rgba(255,255,255,0.96) 55%, #ffffff);
  --grad-profile-avatar: linear-gradient(135deg, #ffffff, #f8fafc);
  --ring-track: #eef2f6;
  --chart-grid: #eef2f6;
  --chart-axis: #94a3b8;
  --chip-border: #e2e8f0;
  --chip-text: #64748b;
  --surface-2: #eef2f6;
  --surface-2-text: #475569;
}

/* ============================================================================
   LETRAS CHICAS (Perfil → Tamaño de letra → "Letras chicas") — las clases
   text-xs/sm/base/lg/xl/2xl de Tailwind están en rem y ya escalan solas al
   cambiar el font-size del <html> (ver el otro control, "Tamaño de letra").
   Pero gran parte de las etiquetas más chicas de la app (consejos de cada
   ejercicio, "récord: ...", badges de música/día, RPE, etc.) usan un
   tamaño FIJO en píxeles vía la sintaxis text-[Npx] de Tailwind — eso no
   responde al font-size del <html>, así que necesitan su propio multiplicador.
   --small-text-scale se setea inline (custom property) en el contenedor
   raíz de la app según lo elegido en Perfil; por defecto es 1 (sin cambio).
   Mismo motivo que en .light-mode: los corchetes de Tailwind se escapan
   para que CSS los lea como parte del nombre de la clase, y las barras
   invertidas van dobles porque esto vive en un template literal de JS. */
.text-\\[8px\\] { font-size: calc(8px * var(--small-text-scale, 1)) !important; }
.text-\\[9px\\] { font-size: calc(9px * var(--small-text-scale, 1)) !important; }
.text-\\[10px\\] { font-size: calc(10px * var(--small-text-scale, 1)) !important; }
.text-\\[11px\\] { font-size: calc(11px * var(--small-text-scale, 1)) !important; }
.text-\\[12px\\] { font-size: calc(12px * var(--small-text-scale, 1)) !important; }
`;

function StyleInjector() {
  return <style dangerouslySetInnerHTML={{ __html: ANIMATION_CSS }} />;
}

/* ============================================================================
   PR CONFETTI — portaled to document.body so it can burst outside collapsed/
   overflow-hidden cards. Anchored to whatever DOM node triggered it.
============================================================================ */
function PRBurst({ anchorRef, trigger }) {
  const [particles, setParticles] = useState([]);
  const [origin, setOrigin] = useState(null);
  useEffect(() => {
    if (!trigger) return;
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) setOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    const colors = ["#14B8A6", "#F59E0B", "#A855F7", "#3B82F6", "#F43F5E", "#FBBF24"];
    setParticles(Array.from({ length: 16 }, (_, i) => ({
      id: `${trigger}-${i}`, color: colors[i % colors.length],
      x: (Math.random() - 0.5) * 170, y: -(Math.random() * 100 + 40),
      rot: Math.random() * 360, delay: Math.random() * 0.1,
    })));
    const t = setTimeout(() => setParticles([]), 900);
    return () => clearTimeout(t);
  }, [trigger]);
  if (!particles.length || !origin || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 pointer-events-none z-[300]">
      {particles.map((p) => (
        <span key={p.id} className="absolute rounded-sm pr-confetti" style={{ left: origin.x, top: origin.y, width: 5, height: 9, backgroundColor: p.color, "--tx": `${p.x}px`, "--ty": `${p.y}px`, "--rot": `${p.rot}deg`, animationDelay: `${p.delay}s` }} />
      ))}
    </div>,
    document.body
  );
}

/* ============================================================================
   COMPARTIR — dos mecanismos:
   1) ShareLinkModal: comparte un link (usado para rutinas) por la API nativa
      del sistema (que en celular suele incluir WhatsApp/Instagram/etc. como
      destino), o por botones directos a WhatsApp/X/Reddit, o copiando el link.
   2) ShareImageModal: genera una imagen prolija con Canvas (para Stories de
      Instagram, etc.) cuando rompés un récord o completás un ciclo, con el
      "logo" de la app abajo. Sin backend: todo se dibuja y se comparte/baja
      directamente desde el navegador.
============================================================================ */
function ShareLinkModal({ title, shareTitle, shareText, shareTarget, onClose }) {
  const [url, setUrl] = useState("");
  const [linkError, setLinkError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [showFileOptions, setShowFileOptions] = useState(false);
  const urlInputRef = useRef(null);

  // El enlace ya no se armaba localmente (antes codificaba toda la rutina
  // en base64 dentro de la URL, generando links de miles de caracteres que
  // WhatsApp/Instagram bloqueaban o recortaban). Ahora la rutina se guarda
  // en Firestore bajo un ID corto al azar, y recién entonces tenemos un
  // link de verdad cortito para mostrar — por eso esto es asíncrono y arranca
  // mostrando "Generando enlace mágico...".
  useEffect(() => {
    let cancelled = false;
    setUrl(""); setLinkError(null);
    (async () => {
      try {
        const link = await shareRoutineToFirestore(shareTarget);
        if (!cancelled) setUrl(link);
      } catch (err) {
        console.error("Error al generar el enlace de la rutina:", err);
        if (!cancelled) setLinkError(err?.code === "permission-denied" ? "permission-denied" : "other");
      }
    })();
    return () => { cancelled = true; };
  }, [shareTarget]);

  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;
  const handleNativeShare = async () => { try { await navigator.share({ title: shareTitle, text: shareText, url }); onClose(); } catch { /* cancelado, no hacemos nada */ } };
  // Copiado con respaldo: navigator.clipboard no está disponible en todos
  // los contextos (por ejemplo, si la app se sirve por HTTP sin TLS, o en
  // algunos navegadores/webviews) — si falla, el enlace queda visible y
  // seleccionable más abajo para copiarlo a mano.
  const handleCopy = async () => {
    setCopyError(false);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.focus(); ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("copy-failed");
      }
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyError(true);
      urlInputRef.current?.focus();
      urlInputRef.current?.select();
    }
  };
  const handleExportDoc = async (kind) => {
    setExporting(kind);
    try {
      if (kind === "pdf") await exportRoutineToPdf(shareTarget);
      else if (kind === "word") await exportRoutineToWord(shareTarget);
      else if (kind === "excel") await exportRoutineToExcel(shareTarget);
    } catch (err) {
      console.error(`Error al exportar la rutina a ${kind}:`, err);
    } finally {
      setExporting(null);
    }
  };
  const waUrl = url ? `https://wa.me/?text=${encodeURIComponent(shareText + " " + url)}` : "#";
  const xUrl = url ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}` : "#";
  const redditUrl = url ? `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(shareTitle)}` : "#";
  return (
    <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 modal-bg-in" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/60 rounded-3xl max-w-sm w-full p-5 modal-pop-in shadow-2xl shadow-black/50 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-black text-white">{title}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition"><X size={18} /></button>
        </div>

        {!url && !linkError && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-9 h-9 rounded-full border-[3px] border-teal-500/25 border-t-teal-500 animate-spin" />
            <p className="text-sm text-slate-400">Generando enlace mágico...</p>
          </div>
        )}

        {linkError && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 mb-3">
            <p className="text-sm text-rose-300 mb-3">
              {linkError === "permission-denied"
                ? "Firestore todavía no tiene permiso para guardar rutinas compartidas — hace falta ajustar las reglas de seguridad de la colección \"shared_routines\" en la consola de Firebase."
                : "No pudimos generar el enlace — revisá tu conexión e intentá de nuevo."}
            </p>
            <button onClick={() => { setLinkError(null); setUrl(""); shareRoutineToFirestore(shareTarget).then(setUrl).catch((err) => setLinkError(err?.code === "permission-denied" ? "permission-denied" : "other")); }} className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-200 text-sm font-bold">Reintentar</button>
          </div>
        )}

        {url && (
          <>
            {canNativeShare && (
              <button onClick={handleNativeShare} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white text-sm font-bold mb-3 transition-all active:scale-[0.98] shadow-lg shadow-teal-500/20" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)" }}>
                <Share2 size={15} /> Compartir
              </button>
            )}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <a href={waUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-[10px] font-bold transition"><Share2 size={15} className="text-emerald-400" />WhatsApp</a>
              <a href={xUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-[10px] font-bold transition"><Share2 size={15} className="text-slate-200" />X</a>
              <a href={redditUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-[10px] font-bold transition"><Share2 size={15} className="text-orange-400" />Reddit</a>
            </div>
            <button onClick={handleCopy} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition text-sm font-semibold">
              {copied ? <><Check size={14} className="text-teal-400" /> ¡Copiado!</> : <><Copy size={14} /> Copiar enlace</>}
            </button>
            {copyError && <p className="text-[11px] text-amber-400 mt-2 text-center">No pudimos copiarlo automáticamente — tocá el enlace de abajo y copialo a mano.</p>}
            <input ref={urlInputRef} value={url} readOnly onFocus={(e) => e.target.select()} className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2.5 text-[11px] text-slate-400 mt-3 focus:outline-none focus:border-teal-500/50 truncate" />
            <p className="text-[10px] text-slate-600 mt-3 text-center">Quien abra el enlace puede agregar la rutina a su propia app con un toque.</p>

            {!showFileOptions ? (
              <button onClick={() => setShowFileOptions(true)} className="w-full flex items-center justify-center gap-1.5 mt-3 pt-3 border-t border-slate-800/60 text-slate-500 hover:text-slate-300 text-xs font-semibold transition"><Download size={12} /> O descargala como archivo (PDF, Word, Excel)</button>
            ) : (
              <div className="mt-4 pt-4 border-t border-slate-800/60">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Descargar como archivo</p>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => handleExportDoc("pdf")} disabled={!!exporting} className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-[10px] font-bold transition disabled:opacity-50">{exporting === "pdf" ? <RotateCcw size={15} className="animate-spin text-rose-400" /> : <Download size={15} className="text-rose-400" />}PDF</button>
                  <button onClick={() => handleExportDoc("word")} disabled={!!exporting} className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-[10px] font-bold transition disabled:opacity-50">{exporting === "word" ? <RotateCcw size={15} className="animate-spin text-blue-400" /> : <Download size={15} className="text-blue-400" />}Word</button>
                  <button onClick={() => handleExportDoc("excel")} disabled={!!exporting} className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-[10px] font-bold transition disabled:opacity-50">{exporting === "excel" ? <RotateCcw size={15} className="animate-spin text-emerald-400" /> : <Download size={15} className="text-emerald-400" />}Excel</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Reparte texto largo en varias líneas dentro de un ancho máximo — Canvas no
// hace word-wrap solo. Devuelve cuántas líneas ocupó.
// Redimensiona y comprime una foto antes de guardarla — una foto de
// cámara sin tocar puede pesar varios MB; bajada a 1080px de lado más
// largo y comprimida como JPEG queda en unos cientos de KB sin perder
// calidad visible para este uso, y eso multiplicado por muchas fotos no
// agota el espacio disponible.
function resizeImageFile(file, maxDim = 1080, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > height && width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
      else if (height >= width && height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen")); };
    img.src = url;
  });
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(" ");
  let line = "", lines = [];
  words.forEach((w) => {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  });
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return lines.length;
}

function drawShareCardBase(ctx, W, H, accent, accent2) {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0a0a0f"); bg.addColorStop(1, "#13141f");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const blob = (x, y, r, color, alpha) => {
    ctx.save(); ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  };
  blob(W * 0.18, H * 0.16, W * 0.62, accent, 0.4);
  blob(W * 0.86, H * 0.82, W * 0.55, accent2, 0.28);
}

// El "logo" de la app abajo de la tarjeta: una llamita simple dibujada a
// mano (no hay archivo de imagen en este proyecto de un solo archivo) más
// el nombre, en la parte inferior — tal como se pidió.
function drawWordmark(ctx, W, H, accent) {
  const cx = W / 2, y = H - 150;
  ctx.save();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(cx - 17, y + 16);
  ctx.quadraticCurveTo(cx - 26, y - 14, cx - 2, y - 46);
  ctx.quadraticCurveTo(cx + 6, y - 22, cx + 4, y - 6);
  ctx.quadraticCurveTo(cx + 16, y - 18, cx + 17, y - 2);
  ctx.quadraticCurveTo(cx + 22, y + 10, cx, y + 18);
  ctx.quadraticCurveTo(cx - 8, y + 10, cx - 17, y + 16);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#f1f5f9";
  ctx.font = "800 36px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Mi Rutina", cx, y + 64);
}

function drawPRShareCard(ctx, W, H, { exerciseName, muscle, kg, reps, accent = "#14B8A6" }) {
  drawShareCardBase(ctx, W, H, accent, "#A855F7");
  ctx.textAlign = "center";
  ctx.fillStyle = accent;
  ctx.font = "800 40px sans-serif";
  ctx.fillText("🔥 NUEVA MARCA PERSONAL", W / 2, 360);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "800 62px sans-serif";
  const nameLines = wrapCanvasText(ctx, (exerciseName || "").toUpperCase(), W / 2, 470, W - 160, 72);
  let y = 470 + (nameLines - 1) * 72;
  if (muscle) {
    y += 95;
    const label = muscle.toUpperCase();
    ctx.font = "700 30px sans-serif";
    const boxW = ctx.measureText(label).width + 72, boxH = 64;
    ctx.fillStyle = accent + "26";
    ctx.beginPath(); ctx.roundRect(W / 2 - boxW / 2, y - boxH + 16, boxW, boxH, boxH / 2); ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillText(label, W / 2, y + 14);
  }
  const kgY = y + 280;
  ctx.fillStyle = accent;
  ctx.font = "900 200px sans-serif";
  ctx.fillText(`${kg}`, W / 2, kgY);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 42px sans-serif";
  ctx.fillText("KILOGRAMOS", W / 2, kgY + 64);
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "700 48px sans-serif";
  ctx.fillText(`${reps} repeticiones`, W / 2, kgY + 150);

  // Un par de datos más para que no se sienta tan vacía: el 1RM estimado
  // (mismo cálculo que usa Progreso) y el volumen de esa serie puntual.
  const est = estimate1RM(kg, reps);
  const tileY = kgY + 250, tileGap = 50, tileW = (W - 160 - tileGap) / 2;
  const tiles = [
    { val: `${est}kg`, label: "1RM\nESTIMADO" },
    { val: `${Math.round((kg || 0) * (reps || 0)).toLocaleString("es-AR")}`, label: "VOLUMEN\nDE LA SERIE" },
  ];
  tiles.forEach((t, i) => {
    const x = 80 + i * (tileW + tileGap);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath(); ctx.roundRect(x, tileY, tileW, 230, 26); ctx.fill();
    ctx.fillStyle = "#f8fafc";
    ctx.font = "900 64px sans-serif";
    ctx.fillText(`${t.val}`, x + tileW / 2, tileY + 105);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "700 26px sans-serif";
    t.label.split("\n").forEach((l, li) => ctx.fillText(l, x + tileW / 2, tileY + 160 + li * 32));
  });

  drawWordmark(ctx, W, H, accent);
}

function drawCycleShareCard(ctx, W, H, { cycleNumber, daysTrained, totalVol, accent = "#A855F7" }) {
  drawShareCardBase(ctx, W, H, accent, "#06B6D4");
  ctx.textAlign = "center";
  ctx.fillStyle = accent;
  ctx.font = "800 42px sans-serif";
  ctx.fillText("🎉 CICLO COMPLETO", W / 2, 480);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "900 130px sans-serif";
  ctx.fillText(`Ciclo #${cycleNumber}`, W / 2, 660);
  const tiles = [
    { val: daysTrained, label: "DÍAS\nENTRENADOS" },
    { val: totalVol > 999 ? `${(totalVol / 1000).toFixed(1)}k` : totalVol, label: "KG × REPS\nTOTALES" },
  ];
  const tileY = 950, tileGap = 60, tileW = (W - 160 - tileGap) / 2;
  tiles.forEach((t, i) => {
    const x = 80 + i * (tileW + tileGap);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath(); ctx.roundRect(x, tileY, tileW, 280, 28); ctx.fill();
    ctx.fillStyle = "#f8fafc";
    ctx.font = "900 86px sans-serif";
    ctx.fillText(`${t.val}`, x + tileW / 2, tileY + 130);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "700 28px sans-serif";
    t.label.split("\n").forEach((l, li) => ctx.fillText(l, x + tileW / 2, tileY + 190 + li * 36));
  });
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "700 44px sans-serif";
  ctx.fillText("7 semanas de entrenamiento y descarga 💪", W / 2, 1450);
  drawWordmark(ctx, W, H, accent);
}

// Versión genérica de la tarjeta de resumen, para cuando la persona la
// genera a pedido desde Historial (no por completar un ciclo entero, sino
// el resumen de hoy, de la semana o del mes) — mismo estilo visual que
// drawCycleShareCard, pero con un título y una etiqueta de período
// configurables, una grilla de casilleros llenos/vacíos (igual a la del
// calendario de Historial) cuando el período es semana o mes, y una
// estadística más (series totales) para que no se sienta tan vacía.
function drawPeriodShareCard(ctx, W, H, { periodLabel, daysTrained, totalSets, totalVol, calendarCells, accent = "#3B82F6" }) {
  drawShareCardBase(ctx, W, H, accent, "#06B6D4");
  ctx.textAlign = "center";
  ctx.fillStyle = accent;
  ctx.font = "800 40px sans-serif";
  ctx.fillText("💪 RESUMEN DE ENTRENAMIENTO", W / 2, 360);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "900 96px sans-serif";
  const lines = wrapCanvasText(ctx, (periodLabel || "").toUpperCase(), W / 2, 480, W - 160, 104);
  let y = 480 + (lines - 1) * 104;

  // Grilla de días entrenados — los mismos casilleros llenos/vacíos que se
  // ven en el calendario de Historial, pero pensados para la foto.
  const gridCols = 7;
  if (calendarCells && calendarCells.length) {
    const rows = Math.ceil(calendarCells.length / gridCols);
    const cell = rows > 1 ? 70 : 96, gap = rows > 1 ? 12 : 18;
    const gridW = gridCols * cell + (gridCols - 1) * gap;
    const startX = (W - gridW) / 2, startY = y + 110;
    calendarCells.forEach((c, i) => {
      if (c.isPad) return;
      const col = i % gridCols, row = Math.floor(i / gridCols);
      const x = startX + col * (cell + gap), cy = startY + row * (cell + gap);
      ctx.fillStyle = c.trained ? accent : "rgba(255,255,255,0.07)";
      ctx.beginPath(); ctx.roundRect(x, cy, cell, cell, 16); ctx.fill();
      if (c.trained) {
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.font = `700 ${Math.round(cell * 0.46)}px sans-serif`;
        ctx.fillText("✓", x + cell / 2, cy + cell / 2 + cell * 0.17);
      }
    });
    y = startY + rows * cell + (rows - 1) * gap;
  } else {
    y += 130;
  }

  const tileY = y + 90;
  const tiles = [
    { val: daysTrained, label: "DÍAS\nENTRENADOS" },
    { val: totalSets ?? 0, label: "SERIES\nTOTALES" },
    { val: totalVol > 999 ? `${(totalVol / 1000).toFixed(1)}k` : totalVol, label: "KG × REPS\nTOTALES" },
  ];
  const tileGap = 30, tileW = (W - 160 - tileGap * 2) / 3;
  tiles.forEach((t, i) => {
    const x = 80 + i * (tileW + tileGap);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath(); ctx.roundRect(x, tileY, tileW, 230, 24); ctx.fill();
    ctx.fillStyle = "#f8fafc";
    ctx.font = "900 56px sans-serif";
    ctx.fillText(`${t.val}`, x + tileW / 2, tileY + 100);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "700 22px sans-serif";
    t.label.split("\n").forEach((l, li) => ctx.fillText(l, x + tileW / 2, tileY + 150 + li * 28));
  });

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "700 40px sans-serif";
  ctx.fillText(daysTrained > 0 ? "¡Seguí así! 💪" : "A entrenar 💪", W / 2, tileY + 320);
  drawWordmark(ctx, W, H, accent);
}

/* ============================================================================
   COMPARTIR LOS RANGOS — se había probado capturando el SVG real que
   dibuja react-body-highlighter en pantalla (vía ref + outerHTML) para
   que la imagen quedara idéntica a la de la app, pero esa captura podía
   fallar en algunos casos y la imagen no se generaba. Para que sea
   confiable de verdad, ahora se redibuja con el generador propio
   (`buildMuscleBodySvgMarkup`, una función simple que no depende de
   ningún ref ni de timing de React) — el cuerpo se ve un poco distinto al
   de la pantalla, pero la imagen siempre se genera. Se convierte en una
   <img> vía data URL, y recién ahí se dibuja sobre el canvas de la
   tarjeta — por eso drawMuscleRankShareCard es async.
============================================================================ */
/* ============================================================================
   DATOS EXACTOS DE LA LIBRERÍA — extraídos directamente del código fuente
   de react-body-highlighter (orden y cantidad de polígonos por músculo en
   cada vista, y los puntos de cada polígono). Esto reemplaza al sistema
   anterior, que adivinaba a qué músculo pertenecía un polígono comparando
   colores de relleno — fallaba constantemente: músculos con varias piezas
   (el cuádriceps tiene 6, el antebrazo y el isquiotibial 4 cada uno) sólo
   se resaltaban a medias, y músculos distintos que coincidían en el mismo
   color de rango (ej. dos en Maestro) se resaltaban juntos por error.
   Ahora, cada polígono se identifica por su ÍNDICE exacto en el SVG, sin
   ambigüedad posible.
   Ojo con un detalle de nombres de la propia librería: la clave interna
   "ABDUCTOR" en realidad vale 'adductor' (aductor, cara interna del
   muslo) y "ABDUCTORS" vale 'abductors' (cara externa de la cadera) — están
   invertidas respecto a lo que uno esperaría, pero así están en su código.
============================================================================ */
const ANTERIOR_POLY_ORDER = [["chest", 2], ["obliques", 2], ["abs", 2], ["biceps", 2], ["triceps", 2], ["neck", 2], ["front-deltoids", 2], ["head", 1], ["abductors", 2], ["quadriceps", 6], ["knees", 2], ["calves", 4], ["forearm", 4]];

const POSTERIOR_POLY_ORDER = [["head", 1], ["trapezius", 2], ["back-deltoids", 2], ["upper-back", 2], ["triceps", 4], ["lower-back", 2], ["forearm", 4], ["gluteal", 2], ["adductor", 2], ["hamstring", 4], ["knees", 2], ["calves", 4], ["left-soleus", 1], ["right-soleus", 1]];

const ANTERIOR_POLY_POINTS = {
  "chest": ["51.8367347 41.6326531 51.0204082 55.1020408 57.9591837 57.9591837 67.755102 55.5102041 70.6122449 47.3469388 62.0408163 41.6326531", "29.7959184 46.5306122 31.4285714 55.5102041 40.8163265 57.9591837 48.1632653 55.1020408 47.755102 42.0408163 37.5510204 42.0408163"],
  "obliques": ["68.5714286 63.2653061 67.3469388 57.1428571 58.7755102 59.5918367 60 64.0816327 60.4081633 83.2653061 65.7142857 78.7755102 66.5306122 69.7959184", "33.877551 78.3673469 33.0612245 71.8367347 31.0204082 63.2653061 32.244898 57.1428571 40.8163265 59.1836735 39.1836735 63.2653061 39.1836735 83.6734694"],
  "abs": ["56.3265306 59.1836735 57.9591837 64.0816327 58.3673469 77.9591837 58.3673469 92.6530612 56.3265306 98.3673469 55.1020408 104.081633 51.4285714 107.755102 51.0204082 84.4897959 50.6122449 67.3469388 51.0204082 57.1428571", "43.6734694 58.7755102 48.5714286 57.1428571 48.9795918 67.3469388 48.5714286 84.4897959 48.1632653 107.346939 44.4897959 103.673469 40.8163265 91.4285714 40.8163265 78.3673469 41.2244898 64.4897959"],
  "biceps": ["16.7346939 68.1632653 17.9591837 71.4285714 22.8571429 66.122449 28.9795918 53.877551 27.755102 49.3877551 20.4081633 55.9183673", "71.4285714 49.3877551 70.2040816 54.6938776 76.3265306 66.122449 81.6326531 71.8367347 82.8571429 68.9795918 78.7755102 55.5102041"],
  "triceps": ["69.3877551 55.5102041 69.3877551 61.6326531 75.9183673 72.6530612 77.5510204 70.2040816 75.5102041 67.3469388", "22.4489796 69.3877551 29.7959184 55.5102041 29.7959184 60.8163265 22.8571429 73.0612245"],
  "neck": ["55.5102041 23.6734694 50.6122449 33.4693878 50.6122449 39.1836735 61.6326531 40 70.6122449 44.8979592 69.3877551 36.7346939 63.2653061 35.1020408 58.3673469 30.6122449", "28.9795918 44.8979592 30.2040816 37.1428571 36.3265306 35.1020408 41.2244898 30.2040816 44.4897959 24.4897959 48.9795918 33.877551 48.5714286 39.1836735 37.9591837 39.5918367"],
  "front-deltoids": ["78.3673469 53.0612245 79.5918367 47.755102 79.1836735 41.2244898 75.9183673 37.9591837 71.0204082 36.3265306 72.244898 42.8571429 71.4285714 47.3469388", "28.1632653 47.3469388 21.2244898 53.0612245 20 47.755102 20.4081633 40.8163265 24.4897959 37.1428571 28.5714286 37.1428571 26.9387755 43.2653061"],
  "head": ["42.4489796 2.85714286 40 11.8367347 42.0408163 19.5918367 46.122449 23.2653061 49.7959184 25.3061224 54.6938776 22.4489796 57.5510204 19.1836735 59.1836735 10.2040816 57.1428571 2.44897959 49.7959184 0"],
  "abductors": ["52.6530612 110.204082 54.2857143 124.897959 60 110.204082 62.0408163 100 64.8979592 94.2857143 60 92.6530612 56.7346939 104.489796", "47.755102 110.612245 44.8979592 125.306122 42.0408163 115.918367 40.4081633 113.061224 39.5918367 107.346939 37.9591837 102.44898 34.6938776 93.877551 39.5918367 92.244898 41.6326531 99.1836735 43.6734694 105.306122"],
  "quadriceps": ["34.6938776 98.7755102 37.1428571 108.163265 37.1428571 127.755102 34.2857143 137.142857 31.0204082 132.653061 29.3877551 120 28.1632653 111.428571 29.3877551 100.816327 32.244898 94.6938776", "63.2653061 105.714286 64.4897959 100 66.9387755 94.6938776 70.2040816 101.22449 71.0204082 111.836735 68.1632653 133.061224 65.3061224 137.55102 62.4489796 128.571429 62.0408163 111.428571", "38.7755102 129.387755 38.3673469 112.244898 41.2244898 118.367347 44.4897959 129.387755 42.8571429 135.102041 40 146.122449 36.3265306 146.530612 35.5102041 140", "59.5918367 145.714286 55.5102041 128.979592 60.8163265 113.877551 61.2244898 130.204082 64.0816327 139.591837 62.8571429 146.530612", "32.6530612 138.367347 26.5306122 145.714286 25.7142857 136.734694 25.7142857 127.346939 26.9387755 114.285714 29.3877551 133.469388", "71.8367347 113.061224 73.877551 124.081633 73.877551 140.408163 72.6530612 145.714286 66.5306122 138.367347 70.2040816 133.469388"],
  "knees": ["33.877551 140 34.6938776 143.265306 35.5102041 147.346939 36.3265306 151.020408 35.1020408 156.734694 29.7959184 156.734694 27.3469388 152.653061 27.3469388 147.346939 30.2040816 144.081633", "65.7142857 140 72.244898 147.755102 72.244898 152.244898 69.7959184 157.142857 64.8979592 156.734694 62.8571429 151.020408"],
  "calves": ["71.4285714 160.408163 73.4693878 153.469388 76.7346939 161.22449 79.5918367 167.755102 78.3673469 187.755102 79.5918367 195.510204 74.6938776 195.510204", "24.8979592 194.693878 27.755102 164.897959 28.1632653 160.408163 26.122449 154.285714 24.8979592 157.55102 22.4489796 161.632653 20.8163265 167.755102 22.0408163 188.163265 20.8163265 195.510204", "72.6530612 195.102041 69.7959184 159.183673 65.3061224 158.367347 64.0816327 162.44898 64.0816327 165.306122 65.7142857 177.142857", "35.5102041 158.367347 35.9183673 162.44898 35.9183673 166.938776 35.1020408 172.244898 35.1020408 176.734694 32.244898 182.040816 30.6122449 187.346939 26.9387755 194.693878 27.3469388 187.755102 28.1632653 180.408163 28.5714286 175.510204 28.9795918 169.795918 29.7959184 164.081633 30.2040816 158.77551"],
  "forearm": ["6.12244898 88.5714286 10.2040816 75.1020408 14.6938776 70.2040816 16.3265306 74.2857143 19.1836735 73.4693878 4.48979592 97.5510204 0 100", "84.4897959 69.7959184 83.2653061 73.4693878 80 73.0612245 95.1020408 98.3673469 100 100.408163 93.4693878 89.3877551 89.7959184 76.3265306", "77.5510204 72.244898 77.5510204 77.5510204 80.4081633 84.0816327 85.3061224 89.7959184 92.244898 101.22449 94.6938776 99.5918367", "6.93877551 101.22449 13.4693878 90.6122449 18.7755102 84.0816327 21.6326531 77.1428571 21.2244898 71.8367347 4.89795918 98.7755102"]
};

const POSTERIOR_POLY_POINTS = {
  "head": ["50.6382979 0 45.9574468 0.85106383 40.8510638 5.53191489 40.4255319 12.7659574 45.106383 20 55.7446809 20 59.1489362 13.6170213 59.5744681 4.68085106 55.7446809 1.27659574"],
  "trapezius": ["44.6808511 21.7021277 47.6595745 21.7021277 47.2340426 38.2978723 47.6595745 64.6808511 38.2978723 53.1914894 35.3191489 40.8510638 31.0638298 36.5957447 39.1489362 33.1914894 43.8297872 27.2340426", "52.3404255 21.7021277 55.7446809 21.7021277 56.5957447 27.2340426 60.8510638 32.7659574 68.9361702 36.5957447 64.6808511 40.4255319 61.7021277 53.1914894 52.3404255 64.6808511 53.1914894 38.2978723"],
  "back-deltoids": ["29.3617021 37.0212766 22.9787234 39.1489362 17.4468085 44.2553191 18.2978723 53.6170213 24.2553191 49.3617021 27.2340426 46.3829787", "71.0638298 37.0212766 78.2978723 39.5744681 82.5531915 44.6808511 81.7021277 53.6170213 74.893617 48.9361702 72.3404255 45.106383"],
  "upper-back": ["31.0638298 38.7234043 28.0851064 48.9361702 28.5106383 55.3191489 34.0425532 75.3191489 47.2340426 71.0638298 47.2340426 66.3829787 36.5957447 54.0425532 33.6170213 41.2765957", "68.9361702 38.7234043 71.9148936 49.3617021 71.4893617 56.1702128 65.9574468 75.3191489 52.7659574 71.0638298 52.7659574 66.3829787 63.4042553 54.4680851 66.3829787 41.7021277"],
  "triceps": ["26.8085106 49.787234 17.8723404 55.7446809 14.4680851 72.3404255 16.5957447 81.7021277 21.7021277 63.8297872 26.8085106 55.7446809", "73.6170213 50.212766 82.1276596 55.7446809 85.9574468 73.1914894 83.4042553 82.1276596 77.8723404 62.9787234 73.1914894 55.7446809", "26.8085106 58.2978723 26.8085106 68.5106383 22.9787234 75.3191489 19.1489362 77.4468085 22.5531915 65.5319149", "72.7659574 58.2978723 77.0212766 64.6808511 80.4255319 77.4468085 76.5957447 75.3191489 72.7659574 68.9361702"],
  "lower-back": ["47.6595745 72.7659574 34.4680851 77.0212766 35.3191489 83.4042553 49.3617021 102.12766 46.8085106 82.9787234", "52.3404255 72.7659574 65.5319149 77.0212766 64.6808511 83.4042553 50.6382979 102.12766 53.1914894 83.8297872"],
  "forearm": ["86.3829787 75.7446809 91.0638298 83.4042553 93.1914894 94.0425532 100 106.382979 96.1702128 104.255319 88.0851064 89.3617021 84.2553191 83.8297872", "13.6170213 75.7446809 8.93617021 83.8297872 6.80851064 93.6170213 0 106.382979 3.82978723 104.255319 12.3404255 88.5106383 15.7446809 82.9787234", "81.2765957 79.5744681 77.4468085 77.8723404 79.1489362 84.6808511 91.0638298 103.829787 93.1914894 108.93617 94.4680851 104.680851", "18.7234043 79.5744681 22.1276596 77.8723404 20.8510638 84.2553191 9.36170213 102.978723 6.80851064 108.510638 5.10638298 104.680851"],
  "gluteal": ["44.6808511 99.5744681 30.212766 108.510638 29.787234 118.723404 31.4893617 125.957447 47.2340426 121.276596 49.3617021 114.893617", "55.3191489 99.1489362 51.0638298 114.468085 52.3404255 120.851064 68.0851064 125.957447 69.787234 119.148936 69.3617021 108.510638"],
  "adductor": ["48.0851064 122.978723 44.6808511 122.978723 41.2765957 125.531915 45.106383 144.255319 48.5106383 135.744681 48.9361702 129.361702", "51.9148936 122.553191 55.7446809 123.404255 59.1489362 125.957447 54.893617 144.255319 51.9148936 136.170213 51.0638298 129.361702"],
  "hamstring": ["28.9361702 122.12766 31.0638298 129.361702 36.5957447 125.957447 35.3191489 135.319149 34.4680851 150.212766 29.3617021 158.297872 28.9361702 146.808511 27.6595745 141.276596 27.2340426 131.489362", "71.4893617 121.702128 69.3617021 128.93617 63.8297872 125.957447 65.5319149 136.595745 66.3829787 150.212766 71.0638298 158.297872 71.4893617 147.659574 72.7659574 142.12766 73.6170213 131.914894", "38.7234043 125.531915 44.2553191 145.957447 40.4255319 166.808511 36.1702128 152.765957 37.0212766 135.319149", "61.7021277 125.531915 63.4042553 136.170213 64.2553191 153.191489 60 166.808511 56.1702128 146.382979"],
  "knees": ["34.4680851 153.191489 31.0638298 159.148936 33.6170213 166.382979 37.4468085 162.553191", "66.3829787 153.617021 62.9787234 162.978723 66.8085106 166.382979 69.3617021 159.148936"],
  "calves": ["29.3617021 160.425532 28.5106383 167.234043 24.6808511 179.574468 23.8297872 192.765957 25.5319149 197.021277 28.5106383 193.191489 29.787234 180 31.9148936 171.06383 31.9148936 166.808511", "37.4468085 165.106383 35.3191489 167.659574 33.1914894 171.914894 31.0638298 180.425532 30.212766 191.914894 34.0425532 200 38.7234043 190.638298 39.1489362 168.93617", "62.9787234 165.106383 61.2765957 168.510638 61.7021277 190.638298 66.3829787 199.574468 70.6382979 191.914894 68.9361702 179.574468 66.8085106 170.212766", "70.6382979 160.425532 72.3404255 168.510638 75.7446809 179.148936 76.5957447 192.765957 74.4680851 196.595745 72.3404255 193.617021 70.6382979 179.574468 68.0851064 168.085106"],
  "left-soleus": ["28.5106383 195.744681 30.212766 195.744681 33.6170213 201.702128 30.6382979 220 28.5106383 213.617021 26.8085106 198.297872"],
  "right-soleus": ["69.787234 195.744681 71.9148936 195.744681 73.6170213 198.297872 71.9148936 213.191489 70.212766 219.574468 67.2340426 202.12766"]
};

// Músculos que existen en el dibujo de la librería pero que no
// corresponden a ningún grupo del catálogo, o que no tiene sentido poder
// tocar: cabeza, cuello/clavícula visto de frente, rodillas (no es
// músculo), la franja de cadera entre abdomen y cuádriceps (sería flexor
// de cadera, no está modelado), oblicuos (queda muy parecido a "las
// costillas" y no tenemos ese grupo separado), aductor (cara interna del
// muslo, tampoco modelado) y la parte baja de la espalda (ya cubierta por
// dorsales a través de "upper-back", para no duplicar).
const NON_INTERACTIVE_SLUGS = new Set(["head", "neck", "knees", "abductors", "obliques"]);

function buildPolyIndexToSlug(order) {
  const out = [];
  order.forEach(([slug, count]) => { for (let i = 0; i < count; i++) out.push(slug); });
  return out;
}
const ANTERIOR_POLY_SLUGS = buildPolyIndexToSlug(ANTERIOR_POLY_ORDER);
const POSTERIOR_POLY_SLUGS = buildPolyIndexToSlug(POSTERIOR_POLY_ORDER);

// Mismo dibujo que ve la librería en pantalla, pero reconstruido a mano
// con sus mismos puntos exactos — así la imagen para compartir queda
// igual a lo que se ve en la app, sin depender de capturar nada del DOM
// en vivo (lo que podía fallar y no generar la imagen).
function buildSvgPolygonsForView(order, points, ranks, neutral, view) {
  const fillFor = (slug) => {
    if (NON_INTERACTIVE_SLUGS.has(slug)) return neutral;
    if (view === "front" && slug === "calves") return neutral;
    const keys = Object.entries(BODY_HIGHLIGHTER_SLUG_MAP).filter(([, s]) => s === slug || (slug.endsWith("-soleus") && s === "calves")).map(([k]) => k);
    if (!keys.length) return neutral;
    const best = keys.reduce((a, b) => ((ranks[b]?.levelIdx ?? -1) > (ranks[a]?.levelIdx ?? -1) ? b : a));
    return ranks[best]?.color || neutral;
  };
  return order.map(([slug]) => {
    const color = fillFor(slug);
    return (points[slug] || []).map((p) => `<polygon points="${p}" fill="${color}" />`).join("");
  }).join("");
}
function buildMuscleBodySvgMarkup(view, ranks) {
  const NEUTRAL = "#334155";
  const order = view === "front" ? ANTERIOR_POLY_ORDER : POSTERIOR_POLY_ORDER;
  const points = view === "front" ? ANTERIOR_POLY_POINTS : POSTERIOR_POLY_POINTS;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 200">${buildSvgPolygonsForView(order, points, ranks, NEUTRAL, view)}</svg>`;
}

function svgMarkupToImage(svgMarkup) {
  return new Promise((resolve, reject) => {
    const svg64 = btoa(unescape(encodeURIComponent(svgMarkup)));
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;base64,${svg64}`;
  });
}


async function drawMuscleRankShareCard(ctx, W, H, { ranks, modeLabel, accent = "#F59E0B" }) {
  drawShareCardBase(ctx, W, H, accent, "#A855F7");
  ctx.textAlign = "center";
  ctx.fillStyle = accent;
  ctx.font = "800 38px sans-serif";
  ctx.fillText("💪 MIS RANGOS", W / 2, 250);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 28px sans-serif";
  ctx.fillText(modeLabel, W / 2, 295);

  const [frontImg, backImg] = await Promise.all([
    svgMarkupToImage(buildMuscleBodySvgMarkup("front", ranks)),
    svgMarkupToImage(buildMuscleBodySvgMarkup("back", ranks)),
  ]);
  const bodyW = 360, bodyH = bodyW * 2;
  const gap = 50;
  const startX = (W - (bodyW * 2 + gap)) / 2;
  const bodyY = 360;
  ctx.drawImage(frontImg, startX, bodyY, bodyW, bodyH);
  ctx.drawImage(backImg, startX + bodyW + gap, bodyY, bodyW, bodyH);

  const labelY = bodyY + bodyH + 60;
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "700 30px sans-serif";
  ctx.fillText("De frente", startX + bodyW / 2, labelY);
  ctx.fillText("De espalda", startX + bodyW + gap + bodyW / 2, labelY);

  drawWordmark(ctx, W, H, accent);
}

function ShareImageModal({ title, fileNamePrefix, shareTitle, shareText, draw, onClose, autoShowOptOutLabel, onOptOutAutoShow }) {
  const canvasRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 1080; canvas.height = 1920;
    const ctx = canvas.getContext("2d");
    let cancelled = false;
    // `draw` puede ser sync (la mayoría de las tarjetas) o async (la del
    // muñeco, que necesita esperar a que el SVG se convierta en imagen
    // antes de poder dibujarlo en el canvas) — await sobre un valor no
    //-Promise se resuelve solo, así que esto funciona para ambos casos.
    (async () => {
      try {
        await draw(ctx, 1080, 1920);
        if (!cancelled) setPreviewUrl(canvas.toDataURL("image/png"));
      } catch (err) {
        console.error("Error generando la imagen para compartir:", err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, []);

  const handleDownload = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${fileNamePrefix}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  const handleShare = async () => {
    const canvas = canvasRef.current; if (!canvas) return;
    try {
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (blob) {
        const file = new File([blob], `${fileNamePrefix}.png`, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: shareTitle, text: shareText });
          return;
        }
      }
    } catch { return; /* cancelado por el usuario, no descargamos igual */ }
    handleDownload();
  };

  return (
    <div className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 modal-bg-in" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/60 rounded-3xl max-w-sm w-full p-5 modal-pop-in shadow-2xl shadow-black/50 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-black text-white">{title}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition"><X size={18} /></button>
        </div>
        {autoShowOptOutLabel && (
          <button onClick={onOptOutAutoShow} className="w-full flex items-center justify-between gap-2 bg-slate-800/70 border border-slate-700/60 rounded-xl px-3.5 py-2.5 mb-3.5 text-left hover:bg-slate-800 hover:border-slate-600 transition">
            <span className="flex items-center gap-2.5 text-[12px] text-slate-300 font-medium"><BellOff size={15} className="text-slate-400 shrink-0" />{autoShowOptOutLabel}</span>
            <ChevronRight size={14} className="text-slate-600 shrink-0" />
          </button>
        )}
        <canvas ref={canvasRef} className="hidden" />
        {previewUrl ? (
          <img src={previewUrl} alt="Vista previa para compartir" className="w-full rounded-2xl border border-slate-800/60 mb-4" style={{ aspectRatio: "9 / 16", objectFit: "cover", maxHeight: "50vh" }} />
        ) : (
          <div className="w-full rounded-2xl border border-slate-800/60 mb-4 flex flex-col items-center justify-center gap-2 py-10" style={{ aspectRatio: "9 / 16", maxHeight: "50vh" }}>
            <div className="w-7 h-7 rounded-full border-[3px] border-teal-500/25 border-t-teal-500 animate-spin" />
            <p className="text-[11px] text-slate-500">Generando imagen...</p>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={handleDownload} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition text-sm font-semibold"><Download size={14} /> Descargar</button>
          <button onClick={handleShare} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-white text-sm font-bold transition-all active:scale-[0.98] shadow-lg shadow-teal-500/20" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)" }}><Share2 size={14} /> Compartir</button>
        </div>
        <p className="text-[10px] text-slate-600 mt-3 text-center">Para tu historia de Instagram: compartila directo, o descargala y subila desde la app.</p>
      </div>
    </div>
  );
}

/* ============================================================================
   PIN INPUT
============================================================================ */
/* ============================================================================
   SWIPE TO ARCHIVE — deslizá una fila hacia la derecha y un tacho rojo se
   va asomando por la izquierda (como agregar una canción a la cola en
   Spotify); soltala pasado la mitad para que quede revelado, tocá el
   tacho y confirmá. OJO: esto nunca borra datos — sólo oculta el perfil o
   la rutina de la lista hasta que se recupere (ver más abajo en
   LoginScreen y RoutinesView). Funciona con mouse y con touch (pointer
   events), y un primer toque sobre la fila revelada la vuelve a cerrar en
   vez de disparar la acción normal de la fila (tocarla una segunda vez ya
   sí hace lo de siempre).
============================================================================ */
function SwipeToArchive({ children, onArchive, confirmText, revealWidth = 84 }) {
  const [dragX, setDragX] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const startXRef = useRef(0);
  const startDragRef = useRef(0);

  const handlePointerDown = (e) => {
    draggingRef.current = true;
    movedRef.current = false;
    startXRef.current = e.clientX;
    startDragRef.current = dragX;
  };
  const handlePointerMove = (e) => {
    if (!draggingRef.current) return;
    const delta = e.clientX - startXRef.current;
    if (Math.abs(delta) > 6) movedRef.current = true;
    setDragX(Math.min(revealWidth, Math.max(0, startDragRef.current + delta)));
  };
  const handlePointerUp = () => {
    draggingRef.current = false;
    setDragX((x) => (x > revealWidth / 2 ? revealWidth : 0));
  };
  // Si recién arrastraste, o si la fila ya estaba revelada, el primer
  // toque no dispara la acción normal (login/editar/etc.) — sólo la cierra.
  const handleClickCapture = (e) => {
    if (movedRef.current) { movedRef.current = false; e.preventDefault(); e.stopPropagation(); return; }
    if (dragX > 0) { setDragX(0); e.preventDefault(); e.stopPropagation(); }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="absolute inset-y-0 left-0 flex items-center pl-5 bg-rose-500 rounded-2xl" style={{ width: revealWidth }}>
        <button onClick={() => setConfirming(true)} aria-label="Quitar de la lista" className="text-white active:scale-90 transition"><Trash2 size={18} /></button>
      </div>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClickCapture={handleClickCapture}
        style={{ transform: `translateX(${dragX}px)`, transition: draggingRef.current ? "none" : "transform 0.2s ease", touchAction: "pan-y" }}
        className="relative bg-[#0a0a0f] rounded-2xl"
      >
        {children}
      </div>
      {confirming && (
        <div className="absolute inset-0 z-10 flex items-center gap-2 px-4 bg-slate-950/95 rounded-2xl modal-bg-in" onClick={(e) => e.stopPropagation()}>
          <p className="text-xs text-rose-300 flex-1">{confirmText}</p>
          <button onClick={() => { setConfirming(false); setDragX(0); }} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold shrink-0">No</button>
          <button onClick={() => { setConfirming(false); setDragX(0); onArchive(); }} className="px-3 py-1.5 rounded-lg bg-rose-500 text-white text-xs font-bold shrink-0">Sí</button>
        </div>
      )}
    </div>
  );
}


function PinInput({ length = 4, onComplete, label = "Ingresá tu PIN", error, onCancel }) {
  const [digits, setDigits] = useState([]);
  const inputRef = useRef();
  useEffect(() => { inputRef.current?.focus(); }, []);
  // Bug fix (pre-existing): on a wrong PIN, the dots used to stay filled
  // forever because nothing ever cleared `digits`, silently blocking retries.
  useEffect(() => { if (error) { const t = setTimeout(() => setDigits([]), 400); return () => clearTimeout(t); } }, [error]);
  const tap = (n) => {
    if (digits.length >= length) return;
    haptic(15);
    const next = [...digits, String(n)];
    setDigits(next);
    if (next.length === length) setTimeout(() => onComplete(next.join("")), 80);
  };
  const del = () => setDigits((d) => d.slice(0, -1));
  const handleKey = (e) => {
    if (e.key >= "0" && e.key <= "9" && digits.length < length) { const next = [...digits, e.key]; setDigits(next); if (next.length === length) setTimeout(() => onComplete(next.join("")), 80); }
    else if (e.key === "Backspace") setDigits((d) => d.slice(0, -1));
  };
  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <p className="text-sm text-slate-400 font-medium tracking-wide">{label}</p>
      <div className="flex gap-4">
        {Array.from({ length }).map((_, i) => (
          <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${i < digits.length ? "bg-teal-500 border-teal-500 scale-110 shadow-[0_0_12px_-1px_rgba(20,184,166,0.7)]" : "border-slate-600 bg-transparent"}`} />
        ))}
      </div>
      {error && <p className="text-rose-400 text-xs font-medium animate-pulse">{error}</p>}
      <div className="grid grid-cols-3 gap-3 w-64">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} onClick={() => tap(n)} className="h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-xl font-semibold text-slate-100 transition-all">{n}</button>
        ))}
        {onCancel ? <button onClick={onCancel} className="h-16 rounded-2xl text-slate-500 hover:text-slate-300 text-sm font-medium">Cancelar</button> : <div />}
        <button onClick={() => tap(0)} className="h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-xl font-semibold text-slate-100 transition-all">0</button>
        <button onClick={del} className="h-16 rounded-2xl text-slate-400 hover:text-slate-200 active:scale-95 transition-all flex items-center justify-center">⌫</button>
      </div>
      <input ref={inputRef} className="sr-only" onKeyDown={handleKey} readOnly />
    </div>
  );
}

/* ============================================================================
   LOGIN

   `allowAutoLogin` (default true): si hay un solo perfil en el dispositivo y
   no tiene PIN, normalmente se entra solo apenas carga la pantalla — es una
   comodidad para cuando volvés a abrir la app. Pero si LLEGASTE a esta
   pantalla tocando "Cerrar sesión" a propósito, ese auto-login te
   mandaba de vuelta al mismo perfil sin que pase nada (el botón "no
   funcionaba"). App() pone allowAutoLogin=false justo después de un logout
   explícito para evitar ese rebote — en una carga nueva de la página vuelve
   a ser true por defecto, así que el auto-login normal sigue funcionando.
============================================================================ */
// Login con Google: en el navegador (claude.ai/Vercel) usa el popup de
// siempre — funciona perfecto ahí. Pero adentro de la app empaquetada con
// Capacitor, ese popup corre dentro de un WebView, y Google BLOQUEA a
// propósito el login desde WebViews embebidos (política de seguridad
// "disallowed_useragent" — no es un bug nuestro, es Google evitando que
// apps maliciosas se hagan pasar por el login real). Por eso, cuando la
// app corre nativa (Capacitor.isNativePlatform() === true), usamos en
// cambio el selector de cuenta NATIVO de Android (el mismo que usás para
// Gmail o Play Store) vía @capacitor-firebase/authentication, y con el
// token que devuelve armamos las credenciales para Firebase Auth — el
// resultado final (`user`) es el mismo objeto en los dos casos, así que
// todo el código que viene después no necesita saber cuál de los dos
// caminos se usó.
async function googleSignIn() {
  if (Capacitor.isNativePlatform()) {
    const result = await FirebaseAuthentication.signInWithGoogle({
      // El Web Client ID hay que pasarlo acá explícitamente además de
      // en strings.xml — el Credential Manager lo necesita en los dos
      // lugares para funcionar correctamente en Android.
      customParameters: [
        { key: "client_id", value: "1027242959052-b9i0hq3fc2rbfoqr48chkpkkir2qu4e6.apps.googleusercontent.com" }
      ]
    });
    if (!result?.user) throw new Error("No se recibió el usuario de Google.");
    return result.user;
  }
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

function LoginScreen({ onLogin, allowAutoLogin = true }) {
  const [profiles, setProfilesState] = useState(loadProfiles);
  const [phase, setPhase] = useState("list");
  const [pendingProfile, setPendingProfile] = useState(null);
  const [pinError, setPinError] = useState("");
  const [regName, setRegName] = useState(""); const [regMail, setRegMail] = useState(""); const [regPin, setRegPin] = useState("");
  const [regStep, setRegStep] = useState(1); const [regError, setRegError] = useState("");
  const deviceId = getDeviceId();
  const profileList = Object.keys(profiles).filter((n) => !profiles[n].archived);
  const archivedList = Object.keys(profiles).filter((n) => profiles[n].archived);
  const deviceProfile = profileList.find((n) => profiles[n].deviceId === deviceId);
  const [showArchived, setShowArchived] = useState(false);
  const [recoverTarget, setRecoverTarget] = useState(null);
  const [recoverEmail, setRecoverEmail] = useState("");
  const [recoverError, setRecoverError] = useState("");

  const tryLogin = (name) => { const p = profiles[name]; if (p.pin) { setPendingProfile(name); setPhase("pin"); } else { saveActive(name); onLogin(name, profiles); } };

  // "Deslizar para quitar" un perfil de la lista: NUNCA borra nada — sólo
  // lo marca como archived, así desaparece de las opciones hasta que
  // vuelvas a entrar con Google (si está vinculado) o confirmes tu email
  // (ver más abajo, sección de perfiles ocultos).
  const handleArchiveProfile = (name) => {
    const updated = { ...profiles, [name]: { ...profiles[name], archived: true } };
    saveProfiles(updated); setProfilesState(updated);
  };
  const handleRecoverProfile = (name) => {
    const p = profiles[name];
    if (p.email) {
      if (recoverEmail.trim().toLowerCase() !== p.email.toLowerCase()) { setRecoverError("El email no coincide con el de este perfil."); return; }
    }
    const updated = { ...profiles, [name]: { ...p, archived: false } };
    saveProfiles(updated); setProfilesState(updated);
    setRecoverTarget(null); setRecoverEmail(""); setRecoverError("");
    tryLogin(name);
  };
  
  const handlePinLogin = (entered) => {
    if (entered === profiles[pendingProfile].pin) { haptic(20); saveActive(pendingProfile); onLogin(pendingProfile, profiles); }
    else { haptic([30, 40, 30]); setPinError("PIN incorrecto."); setTimeout(() => setPinError(""), 1500); }
  };

  const finishRegister = () => {
    const name = regName.trim();
    const newProfiles = {
      ...profiles,
      [name]: {
        pin: regPin || null,
        logs: {},
        email: regMail || null,
        joinedAt: new Date().toISOString(),
        deviceId,
        tutorialSeen: false,
      },
    };
    saveProfiles(newProfiles); setProfilesState(newProfiles); saveActive(name); onLogin(name, newProfiles);
  };

  const validateRegForm = () => {
    setRegError("");
    if (!regName.trim()) { setRegError("Ingresá tu nombre."); return false; }
    if (profiles[regName.trim()]) { setRegError("Ya existe ese nombre."); return false; }
    if (regMail && !regMail.includes("@")) { setRegError("Email inválido."); return false; }
    return true;
  };

  const handleRegister = () => { if (validateRegForm()) finishRegister(); };
  const handleWantsPin = () => { if (validateRegForm()) setRegStep(2); };

  // --- FUNCIÓN PARA INICIAR SESIÓN CON GOOGLE ---
  const handleGoogleLogin = async () => {
    try {
      // 1. Abre el selector de cuenta de Google (popup en navegador, nativo en la app)
      const pluginUser = await googleSignIn();

      // 2. Usa auth.currentUser como fuente de UID — con skipNativeAuth:false
      // el plugin ya sincronizó la sesión de Firebase JS, así que
      // auth.currentUser tiene el UID real de Firebase (igual en web y en
      // la app nativa). pluginUser.uid en el caso nativo es el mismo valor,
      // pero auth.currentUser es más confiable como fuente de verdad porque
      // viene directo del SDK de Firebase JS que ya quedó autenticado.
      const firebaseUser = auth.currentUser || pluginUser;
      const uid = firebaseUser.uid;
      const name = firebaseUser.displayName || pluginUser.displayName || "Usuario de Google";
      const email = firebaseUser.email || pluginUser.email;

      // 3. Busca primero por googleUid en TODOS los perfiles LOCALES
      // (incluidos los archivados) — si ya usaste esta cuenta en ESTE
      // dispositivo, no hace falta consultar la nube para nada.
      const matchEntry = Object.entries(profiles).find(([, p]) => p.googleUid === uid);
      if (matchEntry) {
        const [matchName, matchProfile] = matchEntry;
        const updated = { ...profiles, [matchName]: { ...matchProfile, archived: false, email } };
        saveProfiles(updated); setProfilesState(updated);
        saveActive(matchName); onLogin(matchName, updated);
        return;
      }

      // 4. Nada local con este uid — puede ser la primera vez en ESTE
      // dispositivo aunque la cuenta ya exista en otro. Antes de crear
      // nada, bajamos el perfil completo (logs, sesiones, medidas, todo)
      // desde Firestore y lo mergeamos con lo que haya en local.
      const cloudProfile = await fetchProfileFromCloud(uid);
      if (cloudProfile) {
        const cloudName = cloudProfile.name || name;
        // Merge: si hay un perfil local con ese mismo nombre (quizás creado
        // offline antes de vincular), combinamos ambos tomando lo más reciente.
        const localForName = profiles[cloudName];
        const merged = mergeProfiles(localForName || null, cloudProfile);
        const updated = { ...profiles, [cloudName]: { ...merged, archived: false } };
        saveProfiles(updated); setProfilesState(updated);
        saveActive(cloudName); onLogin(cloudName, updated);
        return;
      }

      // 5. No existe en ningún lado: primera vez. Conservamos datos locales
      // si ya hay un perfil con ese nombre (creado offline).
      const existingLocal = profiles[name];
      const profileToSave = existingLocal
        ? { ...existingLocal, archived: false, googleUid: uid, email }
        : { pin: null, logs: {}, email, joinedAt: new Date().toISOString(), deviceId, tutorialSeen: false, googleUid: uid };
      const updated = { ...profiles, [name]: profileToSave };
      saveProfiles(updated); setProfilesState(updated); saveActive(name);
      await syncProfileToCloud(uid, { ...profileToSave, name });
      onLogin(name, updated);
    } catch (error) {
      console.error("Error al iniciar sesión con Google:", error);
      setRegError("Error al conectar con Google. Intentá de nuevo.");
    }
  };

  useEffect(() => { if (allowAutoLogin && deviceProfile && !profiles[deviceProfile].pin) { saveActive(deviceProfile); onLogin(deviceProfile, profiles); } }, []);

  if (phase === "pin") return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />
      <div className="w-full max-w-xs relative">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-teal-500/15 flex items-center justify-center mb-3"><Flame className="text-teal-500" size={28} /></div>
          <h2 className="text-xl font-bold text-white">{pendingProfile}</h2>
        </div>
        <PinInput label="Ingresá tu PIN" onComplete={handlePinLogin} error={pinError} onCancel={() => { setPhase("list"); setPendingProfile(null); setPinError(""); }} />
      </div>
    </div>
  );

  if (phase === "register") return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />
      <div className="w-full max-w-sm relative">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => { if (regStep !== 1) { setRegStep(1); setRegError(""); } else { setPhase("list"); setRegError(""); } }} className="text-slate-500 hover:text-slate-300"><ChevronDown size={20} className="rotate-90" /></button>
          <h2 className="text-lg font-bold text-white">Crear perfil</h2>
        </div>
        <div className="space-y-4">
          {regStep === 1 && (<>
            <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Nombre</label><input type="text" placeholder="¿Cómo te llamás?" value={regName} onChange={(e) => setRegName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleRegister(); }} className="w-full bg-slate-900/80 border border-slate-700/50 rounded-2xl px-4 py-3.5 text-white focus:outline-none focus:border-teal-500/60 text-sm transition" autoFocus /></div>
            <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Email <span className="text-slate-600 normal-case">(opcional)</span></label><input type="email" placeholder="tu@email.com" value={regMail} onChange={(e) => setRegMail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleRegister(); }} className="w-full bg-slate-900/80 border border-slate-700/50 rounded-2xl px-4 py-3.5 text-white focus:outline-none focus:border-teal-500/60 text-sm transition" /></div>
          </>)}
          {regStep === 2 && <PinInput length={4} label="Elegí un PIN" onComplete={(p) => { setRegPin(p); setRegStep(3); }} onCancel={() => setRegStep(1)} />}
          {regStep === 3 && <PinInput length={4} label="Confirmá el PIN" onComplete={(p) => { if (p === regPin) { finishRegister(); } else { setRegError("No coinciden."); setTimeout(() => setRegError(""), 1500); } }} error={regError} onCancel={() => setRegStep(1)} />}
        </div>
        {regError && regStep === 1 && <p className="text-rose-400 text-xs mt-3 text-center">{regError}</p>}
        {regStep === 1 && (
          <div className="mt-6 space-y-2.5">
            <button onClick={handleRegister} className="w-full py-4 rounded-2xl bg-teal-500 !text-white font-bold text-sm hover:bg-teal-400 active:scale-[0.98] transition-all shadow-lg shadow-teal-500/20">Crear perfil</button>
            <button onClick={handleWantsPin} className="w-full py-2 text-slate-500 hover:text-slate-300 text-xs font-semibold transition">+ Proteger con PIN (opcional)</button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />
      <div className="w-full max-w-sm relative">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-teal-500/30 to-teal-500/5 border border-teal-500/20 flex items-center justify-center mb-4 shadow-[0_0_40px_-10px_rgba(20,184,166,0.55)]"><Flame className="text-teal-500" size={30} /></div>
          <h1 className="text-2xl font-black text-white tracking-tight">Mi Rutina</h1>
          <p className="text-slate-500 text-sm mt-1">Seguimiento de cargas y progreso</p>
        </div>

        {/* --- BOTÓN DE GOOGLE --- */}
        <button onClick={handleGoogleLogin} className="w-full mb-5 py-3.5 rounded-2xl bg-white text-slate-900 font-bold text-sm hover:bg-slate-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-lg shadow-white/10">
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continuar con Google
        </button>

        {profileList.length > 0 && (<div className="mb-5"><p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-3">Perfiles en este dispositivo</p><div className="space-y-2">{profileList.map((name) => (
          <SwipeToArchive key={name} confirmText={`¿Quitar a ${name} de esta lista? No se borra nada.`} onArchive={() => handleArchiveProfile(name)}>
            <button onClick={() => tryLogin(name)} className="w-full flex items-center gap-3.5 bg-slate-900/60 border border-slate-800/60 hover:border-teal-500/30 rounded-2xl px-4 py-3.5 transition-all active:scale-[0.98] text-left group">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black shrink-0" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)", color: "white" }}>{name.charAt(0).toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{name}</p>
                <p className="text-[11px] text-slate-500">{profiles[name].googleUid ? "Vinculado a Google" : profiles[name].pin ? "🔒 Con PIN" : "Sin PIN"}</p>
              </div>
              <ChevronRight size={16} className="text-slate-600 group-hover:text-teal-400 transition shrink-0" />
            </button>
          </SwipeToArchive>
        ))}</div>
        <p className="text-[10px] text-slate-700 mt-2.5">Deslizá un perfil hacia la derecha para quitarlo de esta lista sin borrar sus datos.</p>
        </div>)}

        {archivedList.length > 0 && (
          <div className="mb-5">
            {!showArchived ? (
              <button onClick={() => setShowArchived(true)} className="text-[11px] text-slate-600 hover:text-slate-400 font-semibold underline">¿Quitaste un perfil por error? Recuperarlo ({archivedList.length})</button>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-2">Perfiles ocultos en este dispositivo</p>
                {archivedList.map((name) => (
                  <div key={name} className="bg-slate-900/40 border border-slate-800/50 rounded-2xl px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-300 truncate">{name}</p>
                      {recoverTarget !== name && <button onClick={() => { setRecoverTarget(name); setRecoverEmail(""); setRecoverError(""); }} className="text-[11px] text-teal-400 font-bold shrink-0">Recuperar</button>}
                    </div>
                    {recoverTarget === name && (
                      <div className="mt-2.5 space-y-2 bounce-in">
                        {profiles[name].email ? (
                          <>
                            <p className="text-[11px] text-slate-500">Confirmá el email de este perfil para recuperarlo:</p>
                            <input value={recoverEmail} onChange={(e) => setRecoverEmail(e.target.value)} placeholder="tu@email.com" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none" />
                            {recoverError && <p className="text-rose-400 text-[11px]">{recoverError}</p>}
                          </>
                        ) : (
                          <p className="text-[11px] text-slate-500">Este perfil no tiene email ni Google vinculado — confirmá que es el tuyo para recuperarlo.</p>
                        )}
                        <div className="flex gap-2">
                          <button onClick={() => setRecoverTarget(null)} className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-400 text-xs font-semibold">Cancelar</button>
                          <button onClick={() => handleRecoverProfile(name)} className="flex-1 py-2 rounded-xl bg-teal-500 !text-white text-xs font-bold">Recuperar perfil</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <button onClick={() => setPhase("register")} className="w-full py-4 rounded-2xl border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-teal-500/40 transition-all text-sm font-semibold flex items-center justify-center gap-2">+ Crear perfil sin Google</button>
        {regError && <p className="text-rose-400 text-xs mt-3 text-center">{regError}</p>}
      </div>
    </div>
  );
}
/* ============================================================================
   REST TIMER
============================================================================ */
// El cronómetro de descanso ahora calcula el tiempo restante a partir de
// una marca de tiempo ABSOLUTA (cuándo debería terminar), no contando
// cuántos "ticks" de 1 segundo llegaron a correr. Esto importa porque los
// navegadores frenan o pausan los setInterval cuando la pestaña/app queda
// en segundo plano (cambiás de app, se bloquea la pantalla) para ahorrar
// batería — con el conteo viejo, al volver el tiempo mostrado quedaba mal
// (de menos, porque no contó los segundos que pasaron mientras no se
// veía). Ahora, apenas la app vuelve a primer plano (`visibilitychange`),
// se recalcula contra la hora real y se corrige solo — y si el descanso
// ya terminó mientras no estabas mirando, dispara la alarma en ese
// momento (sonido/vibración + notificación si está permitida).
// Importante para que quede claro: esto NO es un cronómetro 100% en
// segundo plano de verdad (eso necesitaría Service Worker + Push, fuera
// del alcance de una single-page app sin backend) — es la mejor
// aproximación posible: se corrige apenas volvés a la app, y manda una
// notificación del sistema si el navegador la soporta y la permitiste.
function RestTimer({ seconds, accent, alertType = "sound" }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  const endTimeRef = useRef(null);
  const intervalRef = useRef();
  const firedRef = useRef(false);
  useEffect(() => { setRemaining(seconds); setRunning(false); endTimeRef.current = null; firedRef.current = false; }, [seconds]);

  const fireAlert = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    if (alertType !== "vibration") {
      try {
        const a = new AudioContext();
        [0, 220].forEach((d) => setTimeout(() => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; o.connect(g); g.connect(a.destination); g.gain.value = 0.2; o.start(); setTimeout(() => o.stop(), 280); }, d));
        // Antes esto se acumulaba: cada serie creaba un AudioContext nuevo
        // y nunca se cerraba. Los navegadores tienen un límite de
        // contextos simultáneos (chico en iOS Safari en particular) —
        // pasado ese límite, el sonido deja de sonar sin ningún error
        // visible. Se cierra solo, ~700ms después (los dos beeps de
        // 280ms con 220ms de diferencia entre uno y otro ya terminaron).
        setTimeout(() => { a.close().catch(() => { }); }, 700);
      } catch { }
    }
    if (alertType !== "sound") haptic([250, 120, 250, 120, 250]);
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("⏱️ Descanso terminado", { body: "Es hora de la próxima serie.", silent: alertType === "vibration" });
      }
    } catch { }
  };

  const recompute = () => {
    if (!endTimeRef.current) return;
    const left = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000));
    setRemaining(left);
    if (left <= 0) { setRunning(false); fireAlert(); }
  };

  useEffect(() => {
    if (running) {
      if (!endTimeRef.current) { endTimeRef.current = Date.now() + remaining * 1000; firedRef.current = false; }
      // Pide permiso de notificación sin interrumpir — si ya fue
      // concedido o denegado antes, esto no vuelve a preguntar nada.
      try { if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission(); } catch { }
      intervalRef.current = setInterval(recompute, 500);
      const onVisible = () => { if (document.visibilityState === "visible") recompute(); };
      document.addEventListener("visibilitychange", onVisible);
      return () => { clearInterval(intervalRef.current); document.removeEventListener("visibilitychange", onVisible); };
    }
    endTimeRef.current = null;
    // eslint-disable-next-line
  }, [running]);

  const pct = Math.max(0, Math.min(100, (remaining / seconds) * 100)), r = 16, circ = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3 bg-slate-900/60 rounded-2xl px-4 py-3 border border-slate-800/60">
      <div className="relative w-12 h-12 shrink-0">
        <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
          <circle cx="18" cy="18" r={r} fill="none" stroke="var(--ring-track)" strokeWidth="3" />
          <circle cx="18" cy="18" r={r} fill="none" stroke={accent} strokeWidth="3" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.3s linear" }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-200">{formatTime(remaining)}</span>
      </div>
      <div className="flex gap-2">
        <button onClick={() => { haptic(15); setRunning((r) => !r); }} className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 transition text-slate-200">{running ? <Pause size={16} /> : <Play size={16} />}</button>
        <button onClick={() => { setRunning(false); setRemaining(seconds); endTimeRef.current = null; firedRef.current = false; }} className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 transition text-slate-200"><RotateCcw size={16} /></button>
      </div>
      <span className="text-xs text-slate-500">{formatTime(seconds)} descanso</span>
    </div>
  );
}

/* ============================================================================
   TUTORIAL GUIADO — modal de ayuda con forma de "tour", organizado en
   capítulos (uno por sección de la app). Cada capítulo arranca con una
   tarjeta de presentación y sigue con una tarjeta por cada función. Se abre:
     a) manualmente, con el botón (?) del header (arranca en el capítulo de
        la pestaña en la que estás), o
     b) automáticamente la primera vez que un perfil nuevo termina (o
        saltea) el asistente de marcas iniciales — funcionando como
        onboarding completo de la app.

   Cada paso puede declarar un "demo": una mini previsualización VIVA de la
   parte de la app de la que se está hablando (no es una captura ni un ícono,
   es el componente real corriendo en una sandbox aislada, con sus propios
   datos de ejemplo). Esto reemplaza la explicación puramente textual por
   "mostrar mientras se explica".
============================================================================ */

// Ejercicio y acento usados como "modelo" para las demos de la pestaña Rutina.
const DEMO_EXERCISE = EXERCISE_BY_ID["press_banca"];
const DEMO_ACCENT = ROUTINE.push.color;

// Serie de datos de ejemplo para la demo del gráfico de evolución (Progreso).
const DEMO_CHART_DATA = [
  { date: "04-05", kg: 70, vol: 700, e1rm: 86 },
  { date: "11-05", kg: 72.5, vol: 725, e1rm: 89 },
  { date: "18-05", kg: 72.5, vol: 762, e1rm: 91 },
  { date: "25-05", kg: 75, vol: 750, e1rm: 92 },
  { date: "01-06", kg: 77.5, vol: 775, e1rm: 95 },
  { date: "08-06", kg: 80, vol: 800, e1rm: 98 },
];

// Lista de ejercicios de ejemplo para la demo de selección (Progreso → Evolución).
const DEMO_CAROUSEL_EXERCISES = ROUTINE.push.exercises.map((e) => ({ id: e.id, name: e.name, color: ROUTINE.push.color, sets: e.sets.length }));

/* ---- Demo en vivo: pestaña Rutina (día, panel, tarjeta de ejercicio, reset) ---- */
function RutinaDemo({ view }) {
  const [demoDay, setDemoDay] = useState(() => DAY_ORDER[0]);
  const [demoLogs, setDemoLogs] = useState({});
  const [demoDrafts, setDemoDrafts] = useState({});
  const [confirmReset, setConfirmReset] = useState(false);
  const [demoSession, setDemoSession] = useState(null);

  if (view === "session") {
    return (
      <SessionStartBar
        activeSession={demoSession}
        onStart={() => setDemoSession({ dayKey: demoDay, startedAt: new Date().toISOString() })}
        onCancel={() => setDemoSession(null)}
        color={ROUTINE[demoDay].color}
      />
    );
  }

  if (view === "daypicker") {
    return (
      <div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {DAY_ORDER.map((k) => (
            <button key={k} onClick={() => setDemoDay(k)} className="px-3.5 py-2 rounded-xl text-xs font-bold uppercase whitespace-nowrap transition-all active:scale-95 border"
              style={demoDay === k ? { background: ROUTINE[k].color, borderColor: ROUTINE[k].color, color: "#fff" } : { borderColor: "var(--chip-border)", color: "var(--chip-text)" }}>
              {ROUTINE[k].label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-600 mt-2">Elegiste <span className="font-bold uppercase" style={{ color: ROUTINE[demoDay].color }}>{ROUTINE[demoDay].label}</span> — así de simple cambia el día.</p>
      </div>
    );
  }

  if (view === "panel") {
    const day = ROUTINE[demoDay];
    const totalSets = day.exercises.reduce((a, e) => a + e.sets.length, 0);
    return (
      <div className="relative overflow-hidden rounded-2xl border p-4" style={{ borderColor: day.color + "55", background: `linear-gradient(135deg, ${day.color}38, transparent 75%)` }}>
        <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg mb-2" style={{ backgroundColor: day.color + "22", color: day.color }}>
          <RotateCcw size={10} /> Sugerido para hoy
        </div>
        <h3 className="text-lg font-black text-white leading-tight uppercase">{day.label}</h3>
        <p className="text-[11px] text-slate-400 mt-0.5">{day.description}</p>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-black/20 rounded-xl p-2 text-center"><p className="text-base font-black text-white tabular-nums">43%</p><p className="text-[9px] text-slate-500 mt-0.5">Hoy</p></div>
          <div className="bg-black/20 rounded-xl p-2 text-center"><p className="text-base font-black text-white tabular-nums">{day.exercises.length}</p><p className="text-[9px] text-slate-500 mt-0.5">Ejercicios</p></div>
          <div className="bg-black/20 rounded-xl p-2 text-center"><p className="text-base font-black text-white tabular-nums">{totalSets}</p><p className="text-[9px] text-slate-500 mt-0.5">Series</p></div>
        </div>
      </div>
    );
  }

  if (view === "reset") {
    return (
      <div>
        {!confirmReset ? (
          <button onClick={() => setConfirmReset(true)} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-slate-200 transition text-[11px] font-medium"><RotateCcw size={11} /> Resetear sesión de hoy</button>
        ) : (
          <div className="flex gap-2 items-center bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 bounce-in">
            <p className="text-[11px] text-slate-400 flex-1">¿Borrar reps/kg de hoy? Los récords no cambian.</p>
            <button onClick={() => setConfirmReset(false)} className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs">No</button>
            <button onClick={() => setConfirmReset(false)} className="px-2.5 py-1.5 rounded-lg bg-rose-500/80 !text-white text-xs font-bold">Sí</button>
          </div>
        )}
      </div>
    );
  }

  // "card-closed" y "card-open" — la tarjeta real de ejercicio, funcionando.
  const forceOpen = view === "card-open";
  return (
    <ExerciseCard
      exercise={DEMO_EXERCISE}
      accent={DEMO_ACCENT}
      logs={demoLogs}
      setLogs={setDemoLogs}
      drafts={demoDrafts}
      setDrafts={setDemoDrafts}
      deloadSets={null}
      deloadMode={false}
      resetKey={0}
      settings={DEFAULT_SETTINGS}
      forceOpen={forceOpen}
    />
  );
}

/* ---- Demo en vivo: pestaña Progreso (stats, ciclo, gráfico, PRs, músculo, historial) ---- */
function ProgresoDemo({ view }) {
  const [metric, setMetric] = useState("peso");
  const [demoExId, setDemoExId] = useState(DEMO_CAROUSEL_EXERCISES[0].id);

  if (view === "ciclo") {
    const mockStart = new Date();
    mockStart.setDate(mockStart.getDate() - 9);
    return <WeekCalendar cycleStart={mockStart} logs={{}} sessions={[]} settings={DEFAULT_SETTINGS} />;
  }

  if (view === "stats") {
    const tiles = [
      { val: 34, label: "Días" },
      { val: "6🔥", label: "Racha" },
      { val: 187, label: "Series" },
      { val: "12.4k", label: "Kg×reps" },
    ];
    return (
      <div className="grid grid-cols-4 gap-2">
        {tiles.map(({ val, label }) => (
          <div key={label} className="rounded-xl p-2.5 text-center bg-slate-900/50 border border-slate-800/50">
            <p className="text-sm font-black text-white leading-none tabular-nums">{val}</p>
            <p className="text-[9px] font-semibold text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>
    );
  }

  if (view === "chart") {
    const dataKey = metric === "peso" ? "kg" : metric === "vol" ? "vol" : "e1rm";
    const label = metric === "peso" ? "Kg" : metric === "vol" ? "Volumen" : "1RM est.";
    return (
      <div className="space-y-2.5">
        <ExerciseChipRow exercises={DEMO_CAROUSEL_EXERCISES} selId={demoExId} onSelect={setDemoExId} />
        <div className="flex justify-end mt-1 mb-1">
          <div className="flex bg-slate-950/60 rounded-xl p-0.5 border border-slate-800/60">
            {[{ k: "peso", l: "Kg" }, { k: "vol", l: "Vol" }, { k: "1rm", l: "1RM" }].map((opt) => (
              <button key={opt.k} onClick={() => setMetric(opt.k)} className={`px-2.5 py-1 rounded-[8px] text-[10px] font-bold transition-all ${metric === opt.k ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>
            ))}
          </div>
        </div>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={DEMO_CHART_DATA} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="gDemoChart" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.35} /><stop offset="95%" stopColor="#14B8A6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="date" stroke="var(--chart-axis)" fontSize={9} />
              <YAxis stroke="var(--chart-axis)" fontSize={9} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey={dataKey} stroke="#14B8A6" fill="url(#gDemoChart)" strokeWidth={2} dot={{ r: 2.5, fill: "#14B8A6", strokeWidth: 0 }} name={label} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  if (view === "rank") {
    const demoRanks = {
      deltoide_anterior: { levelIdx: 8 }, pectoral_medio: { levelIdx: 11 }, biceps: { levelIdx: 5 },
      antebrazos: { levelIdx: 2 }, core: { levelIdx: 14 }, cuadriceps: { levelIdx: 17 },
    };
    return (
      <div className="space-y-1.5">
        <MuscleHighlighterBody ranks={demoRanks} onMuscleClick={() => {}} frontRef={{ current: null }} backRef={{ current: null }} />
        <p className="text-center text-[10px] text-slate-600">Cada músculo, pintado según tu rango ahí</p>
      </div>
    );
  }

  if (view === "muscle") {
    const items = [{ name: "Pectoral", val: 100, color: "#14B8A6" }, { name: "Dorsal", val: 82, color: "#3B82F6" }, { name: "Cuádriceps", val: 64, color: "#F97316" }];
    return (
      <div className="space-y-2.5">
        {items.map(({ name, val, color }) => (
          <div key={name}>
            <div className="flex items-center justify-between mb-1"><span className="text-[11px] font-bold text-slate-300">{name}</span><span className="text-[11px] font-black" style={{ color }}>{val.toLocaleString("es-AR")}</span></div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${val}%`, backgroundColor: color }} /></div>
          </div>
        ))}
      </div>
    );
  }

  if (view === "calendar") {
    const now = new Date();
    const weeks = getMonthMatrix(now.getFullYear(), now.getMonth());
    const trainedSample = new Set([3, 5, 9, 12, 16, 19, 23].map((d) => new Date(now.getFullYear(), now.getMonth(), d).toISOString().slice(0, 10)));
    return (
      <div>
        <div className="grid grid-cols-7 gap-1 mb-1">{WEEKDAY_LABELS.map((l, i) => <div key={i} className="text-center text-[8px] font-bold text-slate-600">{l}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {weeks.flat().map((d, i) => {
            if (!d) return <div key={i} />;
            const trained = trainedSample.has(d);
            const dayNum = parseInt(d.slice(8, 10), 10);
            return <div key={i} className={`aspect-square rounded-md flex items-center justify-center text-[9px] font-bold ${trained ? "bg-slate-700/80 text-slate-200" : "text-slate-700"}`}>{dayNum}</div>;
          })}
        </div>
      </div>
    );
  }

  // "resetall"
  return (
    <div className="flex gap-2">
      <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-700 text-slate-500 text-[11px] font-medium"><Trash2 size={11} /> Resetear todo</div>
      <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-700 text-slate-500 text-[11px] font-medium"><Calendar size={11} /> Borrar un día</div>
    </div>
  );
}

/* ---- Demo en vivo: pestaña Descarga ---- */
function DescargaDemo({ view }) {
  if (view === "header") {
    return (
      <div className="flex items-center justify-between bg-purple-500/10 border border-purple-500/20 rounded-xl px-3.5 py-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-purple-400">Semana de descarga</p>
          <p className="text-[11px] text-purple-300/70 mt-0.5">Menos carga · Menos series</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shrink-0">
          <span className="text-base font-black text-purple-300">75%</span>
        </div>
      </div>
    );
  }

  // "suggested"
  return (
    <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl px-3.5 py-3">
      <div className="flex items-center gap-2 mb-2.5"><span className="text-xs font-bold text-white">Press Banca</span><span className="text-[9px] px-1.5 py-0.5 rounded-lg font-bold bg-teal-500/18 text-teal-400">Pectoral</span></div>
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-black text-slate-600 w-5 shrink-0">S1</span>
        <span className="text-[10px] text-slate-600 bg-slate-800/60 rounded-lg px-2 py-1 shrink-0">3-5 reps</span>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <span className="text-[11px] text-slate-600 line-through">5×100kg</span>
          <div className="flex items-center gap-1"><ArrowDown size={10} className="text-purple-400" /><span className="text-sm font-black text-purple-300">5×75kg</span></div>
        </div>
      </div>
    </div>
  );
}

/* ---- Demo en vivo: pestaña Perfil ---- */
function PerfilDemo({ view }) {
  const [trainW, setTrainW] = useState(7);
  const [alertType, setAlertType] = useState("sound");
  const [demoTheme, setDemoTheme] = useState("dark");
  const [demoTextScale, setDemoTextScale] = useState(1);

  if (view === "apariencia") {
    return (
      <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">
        {[{ k: "dark", l: "Oscuro", icon: <Moon size={13} /> }, { k: "light", l: "Claro", icon: <Sun size={13} /> }].map((opt) => (
          <button key={opt.k} onClick={() => setDemoTheme(opt.k)} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${demoTheme === opt.k ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.icon} {opt.l}</button>
        ))}
      </div>
    );
  }

  if (view === "textsize") {
    return (
      <div className="space-y-2.5">
        <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">
          {TEXT_SCALE_OPTIONS.map((opt) => (
            <button key={opt.k} onClick={() => setDemoTextScale(opt.v)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${demoTextScale === opt.v ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>
          ))}
        </div>
        <p className="text-center font-bold text-white transition-all" style={{ fontSize: `${demoTextScale}rem` }}>Así se ve un texto normal</p>
        <p className="text-center text-slate-500 transition-all" style={{ fontSize: `${0.6875 * demoTextScale}rem` }}>Texto chico (consejos, badges) — éste lo agranda el control de abajo, "Letras chicas"</p>
      </div>
    );
  }

  if (view === "datos") {
    return (
      <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl divide-y divide-slate-800/50 overflow-hidden">
        {[{ icon: <Mail size={12} />, label: "Email", val: "ej@mail.com" }, { icon: <Clock size={12} />, label: "Unido el", val: "12 marzo 2026" }].map(({ icon, label, val }) => (
          <div key={label} className="flex items-center gap-2.5 px-3 py-2.5"><span className="text-slate-600">{icon}</span><span className="text-slate-500 text-[11px] flex-1">{label}</span><span className="text-slate-300 text-[11px] font-medium">{val}</span></div>
        ))}
      </div>
    );
  }

  if (view === "ciclo") {
    return (
      <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800/50 rounded-xl px-3.5 py-3">
        <div><p className="text-xs font-bold text-white">Inicio de ciclo</p><p className="text-[10px] text-slate-500 mt-0.5">Iniciado el 02/05/2026</p></div>
        <span className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-[10px] font-semibold shrink-0">Cambiar</span>
      </div>
    );
  }

  if (view === "configdescarga") {
    return (
      <div className="bg-slate-950/40 rounded-xl p-3 max-w-[160px]">
        <p className="text-[10px] text-slate-500 mb-2">Sem. entrenamiento</p>
        <div className="flex items-center justify-between">
          <button onClick={() => setTrainW((n) => Math.max(2, n - 1))} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 active:scale-95">−</button>
          <span className="text-sm font-black text-white tabular-nums">{trainW}</span>
          <button onClick={() => setTrainW((n) => Math.min(12, n + 1))} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 active:scale-95">+</button>
        </div>
      </div>
    );
  }

  if (view === "descanso") {
    return (
      <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">
        {[{ k: "sound", l: "Sonido" }, { k: "vibration", l: "Vibración" }, { k: "both", l: "Ambos" }].map((opt) => (
          <button key={opt.k} onClick={() => setAlertType(opt.k)} className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${alertType === opt.k ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>
        ))}
      </div>
    );
  }

  if (view === "backup") {
    return (
      <div className="flex items-center gap-2.5 bg-slate-900/40 border border-slate-800/40 rounded-xl px-3.5 py-3">
        <ShieldCheck size={14} className="text-slate-500 shrink-0" />
        <p className="text-[10px] text-slate-500">Copia de seguridad automática activa</p>
      </div>
    );
  }

  // "logout"
  return (
    <div className="space-y-2">
      <div className="w-full flex items-center gap-2 justify-center py-2.5 rounded-xl border border-slate-700 text-slate-400 text-[11px] font-semibold"><LogOut size={12} /> Cerrar sesión</div>
      <div className="w-full flex items-center gap-2 justify-center py-2.5 rounded-xl border border-rose-500/20 text-rose-500/70 text-[11px] font-semibold"><Trash2 size={12} /> Eliminar perfil</div>
    </div>
  );
}

/* ---- Demo en vivo: pestaña Rutinas ---- */
function RutinasDemo({ view }) {
  const [open, setOpen] = useState(false);
  const [demoDayName, setDemoDayName] = useState("DÍA 1");

  if (view === "active") {
    return (
      <div className="rounded-xl border border-teal-500/25 bg-teal-500/5 p-3">
        <div className="flex items-center gap-1.5 mb-1"><Layers size={12} className="text-teal-400" /><span className="text-[9px] font-black uppercase tracking-widest text-teal-400">Tu rutina activa</span></div>
        <p className="text-sm font-black text-white">Push / Pull / Legs</p>
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-teal-500/20" style={{ color: muteHexColor("#14B8A6") }}>PUSH</span>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-blue-500/20" style={{ color: muteHexColor("#3B82F6") }}>PULL</span>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-orange-500/20" style={{ color: muteHexColor("#F97316") }}>LEGS</span>
        </div>
      </div>
    );
  }

  if (view === "preset") {
    return (
      <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl overflow-hidden">
        <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-2 px-3.5 py-3 text-left">
          <div className="min-w-0">
            <p className="text-xs font-bold text-white">Arnold Split</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Pecho y espalda juntos, hombros y brazos juntos…</p>
          </div>
          <ChevronDown size={14} className={`text-slate-600 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="px-3.5 pb-3 text-[10px] text-slate-500 space-y-1 tab-fade-in">
            <p>· Pecho y Espalda — 6 ejercicios</p>
            <p>· Hombros y Brazos — 6 ejercicios</p>
            <p>· Piernas — 5 ejercicios</p>
          </div>
        )}
      </div>
    );
  }

  if (view === "builder") {
    return (
      <div className="bg-slate-950/50 border border-slate-800/50 rounded-xl p-3">
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Nombre del día — tocá para cambiarlo</p>
        <div className="relative mb-2.5">
          <input value={demoDayName} onChange={(e) => setDemoDayName(e.target.value)} className="w-full bg-slate-900/60 border border-slate-700/60 rounded-xl pl-3 pr-8 py-2 text-sm font-black text-white focus:outline-none focus:border-teal-500/60 transition" />
          <Edit3 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>
        <div className="flex gap-1.5 mb-2.5">
          {["Pecho", "Espalda", "Hombros", "Bíceps"].map((g, i) => (
            <span key={g} className={`px-2 py-1 rounded-lg text-[9px] font-bold ${i === 0 ? "bg-teal-500/20 text-teal-400" : "text-slate-600 border border-slate-800"}`}>{g}</span>
          ))}
        </div>
        <div className="flex items-center gap-2.5 bg-slate-900/60 rounded-lg px-2.5 py-2">
          <div className="flex-1 min-w-0"><p className="text-[10px] font-bold text-white truncate">Press Inclinado con Mancuernas</p><p className="text-[9px] text-slate-500">3 series · 8-10 reps</p></div>
          <Plus size={13} className="text-teal-400 shrink-0" />
        </div>
      </div>
    );
  }

  // "manage"
  return (
    <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl px-3.5 py-3 flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-slate-800/60 text-slate-400 flex items-center justify-center shrink-0"><Layers size={13} /></div>
      <div className="flex-1 min-w-0"><p className="text-xs font-bold text-white truncate">Mi rutina de verano</p><p className="text-[10px] text-slate-500">3 días · creada por vos</p></div>
      <span className="px-2 py-1 rounded-lg bg-teal-500/15 text-teal-400 text-[10px] font-bold shrink-0">Activar</span>
      <Edit3 size={13} className="text-slate-500 shrink-0" />
      <Trash2 size={13} className="text-slate-600 shrink-0" />
    </div>
  );
}

function DemoPreview({ kind, view }) {
  if (kind === "rutina") return <RutinaDemo view={view} />;
  if (kind === "rutinas") return <RutinasDemo view={view} />;
  if (kind === "progreso") return <ProgresoDemo view={view} />;
  if (kind === "descarga") return <DescargaDemo view={view} />;
  if (kind === "perfil") return <PerfilDemo view={view} />;
  return null;
}

const HELP_CHAPTERS = [
  {
    key: "_intro",
    label: "Bienvenida",
    color: "#14B8A6",
    icon: <Sparkles size={16} />,
    steps: [
      {
        icon: <Flame size={20} />,
        title: "¡Bienvenido a Mi Rutina!",
        text: "Este es un tour guiado: te vamos mostrando cada función en vivo, paso a paso. Podés saltearlo en cualquier momento tocando la X.",
      },
      {
        icon: <Layers size={20} />,
        title: "Cuatro secciones principales",
        text: "Abajo de la pantalla (o al costado, en pantallas grandes) tenés 4 pestañas: Rutina —la principal, donde entrenás—, Progreso, Rutinas, y Entrenador IA. Tu perfil y configuración los abrís tocando tu avatar arriba a la izquierda.",
      },
    ],
  },
  {
    key: "rutina",
    label: "Rutina",
    color: "#14B8A6",
    icon: <Dumbbell size={16} />,
    steps: [
      {
        icon: <Dumbbell size={20} />,
        title: "Rutina: tu entrenamiento del día",
        text: "Acá registrás lo que hacés en cada sesión: elegís el día, ves los ejercicios con sus series, y anotás reps y kg a medida que entrenás.",
      },
      {
        icon: <Play size={20} />,
        title: "Iniciar y finalizar sesión",
        text: "Arriba de todo tenés \"Iniciar sesión\" — tocalo cuando arrancás a entrenar. Al final, mientras esté en curso, aparece \"Finalizar sesión\": al tocarlo queda registrado que entrenaste hoy. Lo que vayas escribiendo se mantiene aunque cambies de pestaña, hasta que finalices.",
        demo: { kind: "rutina", view: "session", caption: "Probá iniciar la sesión y mirá cómo cambia" },
      },
      {
        icon: <AlertTriangle size={20} />,
        title: "Si te olvidás de iniciarla",
        text: "Guardar una serie sin haber tocado \"Iniciar sesión\" te lo recuerda ahí mismo — los datos se guardan igual, pero ese día no cuenta en tu historial hasta que la inicies.",
      },
      {
        icon: <Zap size={20} />,
        title: "Tu semana de descarga",
        text: "Cada cierta cantidad de semanas (lo configurás en Perfil), tu ciclo entra en una semana de descarga: menos series y menos peso, para bajar la fatiga sin perder lo ganado. Se accede con el botón \"Mi semana de descarga\", arriba de \"Iniciar sesión\" — la primera vez que abrís la app en esa semana te avisamos con un cartel y te lleva directo ahí, pero podés entrenar normal cuando quieras.",
        demo: { kind: "descarga", view: "header" },
      },
      {
        icon: <ArrowDown size={20} />,
        title: "Cargas sugeridas en la descarga",
        text: "Ahí dentro, elegí el día arriba y vas a ver, ejercicio por ejercicio, tu mejor marca tachada y al lado el peso sugerido para esta semana — un porcentaje de tu récord, con menos series. Cada ejercicio tiene su cronómetro de descanso, y podés tildar cada serie a medida que la hacés.",
        demo: { kind: "descarga", view: "suggested" },
      },
      {
        icon: <Calendar size={20} />,
        title: "Elegí tu día",
        text: "Más abajo elegís el día de tu rutina activa. La app reconoce sola cuál te toca hoy según tu cronograma semanal (lo configurás en Rutinas) — pero nunca te restringe, podés elegir el que quieras.",
        demo: { kind: "rutina", view: "daypicker", caption: "Tocá un día y mirá cómo cambia" },
      },
      {
        icon: <ChevronDown size={20} />,
        title: "Tarjetas de ejercicio",
        text: "Cada ejercicio es una tarjeta: tocala para desplegarla y ver el cronómetro, sus series, la nota técnica y el video. Tu récord en cada serie se ve en un recuadro con el color del día. Si lleva 21+ días sin superar el récord, te avisa que está \"estancado\".",
        demo: { kind: "rutina", view: "card-closed", caption: "Tocá la tarjeta para desplegarla" },
      },
      {
        icon: <Pause size={20} />,
        title: "Descanso entre series",
        text: "Arriba de las series está el temporizador de descanso: avisa con sonido, vibración o ambos (lo elegís en Perfil) cuándo arrancar la próxima. Si cambiás de app mientras corre, al volver se corrige solo contra la hora real.",
        demo: { kind: "rutina", view: "card-open", caption: "El cronómetro está arriba de las series — probá pausarlo" },
      },
      {
        icon: <Flame size={20} />,
        title: "Calentamiento sugerido",
        text: "Si ya tenés una marca en el ejercicio, justo debajo del cronómetro aparece \"Ver calentamiento sugerido\": una rampa de 3 series (50%, 70% y 85% de tu peso actual) para llegar entrado en calor a la serie de trabajo. Es sólo una guía, no se guarda como serie registrada.",
      },
      {
        icon: <Save size={20} />,
        title: "Registrá tus series",
        text: "Por cada serie ingresás reps y kg, y tocás guardar. La primera vez que registrás una serie todavía no hay nada que comparar, así que no muestra cartel de récord — recién desde la segunda vez que la mejorás te avisa con confetti.",
        demo: { kind: "rutina", view: "card-open", caption: "Probá: ingresá reps y kg, y tocá Guardar" },
      },
      {
        icon: <Share2 size={20} />,
        title: "Compartir una marca nueva",
        text: "Al lograr una marca, por defecto se abre directo una imagen prolija para compartirla — el botón para desactivar eso está justo abajo del título de esa imagen, sin tener que desplazar. También lo configurás de una en Perfil → Compartir marcas.",
      },
      {
        icon: <Activity size={20} />,
        title: "Esfuerzo (RPE), opcional",
        text: "Debajo de cada serie podés tocar \"+ Registrar RPE\" para anotar qué tan dura te resultó (6 a 10). Ayuda a detectar fatiga acumulada con el tiempo.",
        demo: { kind: "rutina", view: "card-open", caption: "Tocá \"+ Registrar RPE\" debajo de una serie" },
      },
      {
        icon: <Video size={20} />,
        title: "Ver la técnica",
        text: "Al final de cada ejercicio desplegado tenés un botón para ver un video de la técnica correcta en YouTube.",
        demo: { kind: "rutina", view: "card-open", caption: "El botón de YouTube está al final de la tarjeta" },
      },
      {
        icon: <RotateCcw size={20} />,
        title: "Resetear el día",
        text: "Si te equivocaste registrando algo, \"Resetear sesión de hoy\" borra solo los datos de hoy en ese día — tus récords no se tocan.",
        demo: { kind: "rutina", view: "reset", caption: "Tocá el botón para ver cómo pide confirmación" },
      },
    ],
  },
  {
    key: "progreso",
    label: "Progreso",
    color: "#3B82F6",
    icon: <BarChart3 size={16} />,
    steps: [
      {
        icon: <Activity size={20} />,
        title: "Progreso: tu evolución",
        text: "Esta pestaña junta todos tus registros para mostrarte qué tan constante fuiste y cuánto mejoraste, con gráficos, rankings y tu historial completo.",
      },
      {
        icon: <Calendar size={20} />,
        title: "Tu ciclo de entrenamiento",
        text: "Arriba de todo ves en qué semana de tu ciclo estás, si es semana de entrenamiento o de descarga, y cuántos días entrenaste en cada semana. Si todavía no registraste cuándo arrancó tu ciclo, en cambio te aparece un aviso para configurarlo — sin esa fecha no hay nada que calcular.",
        demo: { kind: "progreso", view: "ciclo" },
      },
      {
        icon: <Flame size={20} />,
        title: "Estadísticas generales",
        text: "Debajo, tus días entrenados, tu racha actual de días seguidos, el total de series registradas y el volumen total (kg × reps) acumulado.",
        demo: { kind: "progreso", view: "stats" },
      },
      {
        icon: <BarChart3 size={20} />,
        title: "Elegí qué ver",
        text: "Con los botones elegís entre Rango, Historial, Evolución o Músculo — cada uno con su propia tarjeta debajo, igual que elegís el día en Rutina.",
      },
      {
        icon: <Calendar size={20} />,
        title: "Historial de sesiones",
        text: "En \"Historial\" ves todo lo que entrenaste: en un calendario mensual con un punto de color por día, o en una lista con el detalle completo. Tocá cualquier sesión para ver cada serie con sus reps y kg, marcando con 🔥 las que fueron mejora.",
        demo: { kind: "progreso", view: "calendar" },
      },
      {
        icon: <Share2 size={20} />,
        title: "Crear una imagen para compartir",
        text: "Ahí mismo tenés \"Crear imagen para compartir\" cuando quieras — tu mejor marca en cualquier ejercicio, o un resumen de hoy, la semana o el mes.",
      },
      {
        icon: <BarChart3 size={20} />,
        title: "Gráfico de evolución",
        text: "Elegí el ejercicio (deslizando la fila de chips) y la serie con los botones S1/S2/etc. Mirá su evolución en Kg o en 1RM estimado con los botones de arriba del gráfico.",
        demo: { kind: "progreso", view: "chart", caption: "Deslizá la fila de chips para ver más ejercicios" },
      },
      {
        icon: <Award size={20} />,
        title: "Rango por músculo",
        text: "El \"muñeco\", de frente y de espalda: cada músculo se pinta según el rango ahí — Bronce, Plata, Oro, Esmeralda, Diamante o Maestro (el techo, en rojo), cada uno con tres niveles. Se calcula con tu 1RM estimado, priorizando siempre un ejercicio dedicado a ese músculo por sobre uno que lo trabaja sólo de paso. Si todavía no tenés ninguna marca ahí, dice \"Sin rango\" en vez de inventarte uno.",
        demo: { kind: "progreso", view: "rank" },
      },
      {
        icon: <SlidersHorizontal size={20} />,
        title: "General vs. Según tu contexto",
        text: "\"General\" usa una vara fija, igual para todos. \"Según tu contexto\" ajusta el cálculo a tu peso, sexo y edad (los cargás en tu perfil) — más representativo de tu caso particular.",
      },
      {
        icon: <Check size={20} />,
        title: "Tocá un músculo",
        text: "Se resalta completo con un borde blanco, y abajo ves tu rango, tu mejor marca, y cuántos kilos más necesitás (a tus mismas repeticiones) para subir al rango siguiente, nombrado. Cabeza, cuello, articulaciones y alguna zona sin músculo asignado no son tocables. Desde el ícono de compartir mandás una imagen con tus rangos. Más abajo, \"Ver todos los rangos\" despliega la leyenda completa de Bronce a Maestro.",
      },
      {
        icon: <Ruler size={20} />,
        title: "Medidas y fotos de progreso",
        text: "En \"Medidas\" registrás peso, cintura, pecho, brazo y pierna — cada uno con su gráfico de evolución. El peso que cargues ahí es el mismo que usa el rango \"Según tu contexto\". Más abajo tenés tu calendario: cada día con un punto rosa si hay foto, violeta si cargaste tu peso, y azul si cargaste otra medida — con una estrellita si ese día hiciste las tres cosas. Tocá cualquier día para ver el detalle completo.",
      },
      {
        icon: <Trash2 size={20} />,
        title: "Resetear historial",
        text: "Al final tenés \"Resetear todo\" (borra todo tu historial de series) y \"Borrar un día\" (sólo una fecha puntual). En los dos casos tus récords se mantienen guardados.",
        demo: { kind: "progreso", view: "resetall" },
      },
    ],
  },
  {
    key: "rutinas",
    label: "Rutinas",
    color: "#A855F7",
    icon: <Layers size={16} />,
    steps: [
      {
        icon: <Layers size={20} />,
        title: "Rutinas: elegí cómo entrenar",
        text: "Acá elegís qué rutina vas a seguir: alguna ya armada (Push/Pull/Legs, Arnold Split, Upper/Lower y alguna más) o una creada por vos desde cero.",
      },
      {
        icon: <Dumbbell size={20} />,
        title: "Tu rutina activa",
        text: "Arriba ves un resumen de la rutina que estás siguiendo: su nombre, y cuántos días/ejercicios/series tiene. El ícono de compartir genera un enlace para mandarle tu rutina a quien quieras, o la descargás como PDF, Word o Excel.",
        demo: { kind: "rutinas", view: "active" },
      },
      {
        icon: <Calendar size={20} />,
        title: "¿Qué día entrenás cada cosa?",
        text: "Tocando \"Configurar días de la semana\" elegís qué día de tu rutina (o descanso) le corresponde a cada día calendario — podés repetir días, y la app reconoce sola en qué día estás cuando abrís Rutina.",
      },
      {
        icon: <ListChecks size={20} />,
        title: "Rutinas preestablecidas",
        text: "Más abajo está el catálogo. Tocá una para ver su distribución semanal completa antes de usarla.",
        demo: { kind: "rutinas", view: "preset", caption: "Tocá la rutina para ver el detalle" },
      },
      {
        icon: <Sparkles size={20} />,
        title: "Creá la tuya",
        text: "Con \"Crear mi propia rutina\" le ponés nombre, armás los días que quieras (con su propio nombre y color), y agregás ejercicios buscando por grupo muscular — incluido un grupo de Cardio (cinta, bici, remo, soga...), que se registra en minutos en vez de en kg.",
        demo: { kind: "rutinas", view: "builder", caption: "Probá cambiar el nombre del día" },
      },
      {
        icon: <Link size={20} />,
        title: "Superseries",
        text: "Debajo de cada ejercicio (salvo el último del día) hay un botón para vincularlo en superserie con el siguiente — se hacen uno después del otro sin descansar entre medio, y comparten un solo cronómetro al terminar la vuelta completa.",
      },
      {
        icon: <Edit3 size={20} />,
        title: "Editá, activá o borrá tus rutinas",
        text: "Tocá el lápiz para modificar las que creaste, \"Activar\" para cambiar a esa, o deslizá hacia la derecha para quitarla de la lista. Las preestablecidas no se modifican directamente, pero el lápiz en su tarjeta te crea una copia personal editable.",
        demo: { kind: "rutinas", view: "manage" },
      },
      {
        icon: <Download size={20} />,
        title: "Importar una rutina desde un archivo",
        text: "Si ya la tenés anotada en Excel, Word o PDF, subís ese archivo (o pegás el texto) y la app detecta sola los días, ejercicios, series y repeticiones. \"Detectar con IA\" es una alternativa para formatos más libres.",
      },
    ],
  },
  {
    key: "entrenador_ia",
    label: "Entrenador IA",
    color: "#14B8A6",
    icon: <Sparkles size={16} />,
    steps: [
      {
        icon: <Sparkles size={20} />,
        title: "Chateá con tu entrenador IA",
        text: "Preguntale lo que quieras sobre tu entrenamiento — tiene a la vista tu historial real (marcas, fechas, pesos), así que responde con datos concretos en vez de generalidades.",
      },
      {
        icon: <RotateCcw size={20} />,
        title: "La conversación se mantiene",
        text: "El chat sigue ahí aunque cambies de pestaña y vuelvas — sólo se reinicia si cerrás la app por completo, no al ir y volver adentro de ella.",
      },
      {
        icon: <Layers size={20} />,
        title: "Pedile que haga cambios por vos",
        text: "Puede crear o activar una rutina (te muestra la vista previa completa, día por día), actualizar tu perfil (sexo, edad, peso), o ajustar la configuración de ciclo y descarga, apariencia o descanso entre series. Nunca aplica nada solo: siempre te muestra una tarjeta con \"Confirmar\" o \"Descartar\" antes de tocar algo de verdad.",
      },
      {
        icon: <Mic size={20} />,
        title: "Hablale en vez de escribir",
        text: "El ícono del micrófono (si tu navegador lo soporta) te deja dictar la pregunta — se va completando el cuadro de texto a medida que hablás, sin cortarse solo por una pausa. Cuando termines, tocá el ✓ que aparece en su lugar para confirmar, y enviá el mensaje como cualquier otro.",
      },
      {
        icon: <Link2 size={20} />,
        title: "Cita fuentes reales",
        text: "Cuando una respuesta se apoya en un estudio o una cifra científica concreta, busca un respaldo real y te lo muestra como un link clicable debajo del mensaje — nunca se lo inventa.",
      },
    ],
  },
  {
    key: "perfil",
    label: "Perfil",
    color: "#F59E0B",
    icon: <UserCog size={16} />,
    steps: [
      {
        icon: <UserCog size={20} />,
        title: "Perfil: tu cuenta y configuración",
        text: "Acá ves tus datos, configurás cómo se comporta la app (ciclos, descarga, descansos) y administrás tu cuenta.",
      },
      {
        icon: <Mail size={20} />,
        title: "Tus datos",
        text: "Arriba ves tu nombre, email y fecha de alta. \"Editar perfil\" cambia el email, sexo, edad o peso corporal (afinan el rango por músculo). \"Vincular con Google\" hace que iniciar sesión desde otro dispositivo encuentre este mismo perfil.",
        demo: { kind: "perfil", view: "datos" },
      },
      {
        icon: <Layers size={20} />,
        title: "Tu rutina",
        text: "Un acceso directo que muestra qué rutina tenés activa. Tocalo para ir a Rutinas y cambiar, editar o crear otra.",
      },
      {
        icon: <Sun size={20} />,
        title: "Apariencia y accesibilidad",
        text: "Tema oscuro o claro, tamaño de letra (general y de etiquetas chicas), y zoom con los dedos — este último apagado por defecto para que no se desencuadre la pantalla si pellizcás por accidente.",
        demo: { kind: "perfil", view: "apariencia", caption: "Probá cambiar de tema" },
      },
      {
        icon: <Download size={20} />,
        title: "Exportar entrenamiento",
        text: "Descargá el resumen de hoy, la semana o el mes en PDF, Word o Excel — para mandárselo a tu entrenador.",
      },
      {
        icon: <Share2 size={20} />,
        title: "Compartir marcas",
        text: "Elegís si una marca nueva abre directo la imagen para compartir, o si preferís sólo el ícono chico para abrirla cuando quieras.",
      },
      {
        icon: <Calendar size={20} />,
        title: "Ciclo y descarga",
        text: "Configurás la fecha de inicio de tu ciclo, cuántas semanas entrenás antes de la descarga, cuánto dura, y a qué porcentaje de tu récord entrenás en esa semana.",
        demo: { kind: "perfil", view: "ciclo" },
      },
      {
        icon: <Clock size={20} />,
        title: "Descanso entre series",
        text: "Elegís si te avisamos con sonido, vibración o ambos, y cuánto dura el descanso para ejercicios pesados y para el resto.",
        demo: { kind: "perfil", view: "descanso", caption: "Probá cambiar el tipo de aviso" },
      },
      {
        icon: <ShieldCheck size={20} />,
        title: "Tus datos están respaldados",
        text: "Además del dispositivo, tus registros se respaldan en una segunda copia local — si algo borra los datos del navegador, la app intenta recuperarlos sola al abrir de nuevo.",
        demo: { kind: "perfil", view: "backup" },
      },
      {
        icon: <LogOut size={20} />,
        title: "Cerrar sesión o eliminar perfil",
        text: "\"Cerrar sesión\" te vuelve a la pantalla de inicio. \"Eliminar perfil\" borra el perfil por completo, con todo su historial (no se puede deshacer).",
        demo: { kind: "perfil", view: "logout" },
      },
    ],
  },
  {
    key: "_outro",
    label: "Listo",
    color: "#14B8A6",
    icon: <Check size={16} />,
    steps: [
      {
        icon: <Check size={20} />,
        title: "¡Eso es todo!",
        text: "Ya conocés todas las funciones de la app. Podés volver a ver este tour cuando quieras tocando el ícono de ayuda (?) arriba a la derecha, en cualquier pestaña.",
      },
    ],
  },
];

// Versión "plana" de todos los pasos, con metadata de a qué capítulo
// pertenece cada uno — esto es lo que recorre el modal con Atrás/Siguiente.
const ALL_HELP_STEPS = HELP_CHAPTERS.flatMap((c, ci) =>
  c.steps.map((s, si) => ({
    ...s,
    chapterIndex: ci,
    chapterKey: c.key,
    chapterLabel: c.label,
    chapterColor: c.color,
    isChapterIntro: si === 0,
    stepInChapter: si,
  }))
);

function HelpModal({ startTab, onClose }) {
  const startIdx = startTab
    ? Math.max(0, ALL_HELP_STEPS.findIndex((s) => s.chapterKey === startTab))
    : 0;
  const [i, setI] = useState(startIdx);
  const step = ALL_HELP_STEPS[i];
  const isFirst = i === 0;
  const isLast = i === ALL_HELP_STEPS.length - 1;

  const jumpToChapter = (ci) => {
    const idx = ALL_HELP_STEPS.findIndex((s) => s.chapterIndex === ci);
    if (idx >= 0) setI(idx);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 modal-bg-in" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/60 rounded-3xl max-w-md w-full p-5 modal-pop-in shadow-2xl shadow-black/50 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Selector de capítulo — permite saltar directo a cualquier sección */}
        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1 -mx-1 px-1">
          {HELP_CHAPTERS.map((c, ci) => (
            <button
              key={c.key}
              onClick={() => jumpToChapter(ci)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all shrink-0"
              style={ci === step.chapterIndex ? { backgroundColor: c.color + "22", color: c.color } : { color: "var(--chip-text)" }}
            >
              {c.icon}{c.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: step.chapterColor }}>{step.chapterLabel}</span>
          <button onClick={onClose} aria-label="Cerrar tour" className="p-1.5 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition"><X size={18} /></button>
        </div>

        {/* Barra de progreso tipo "historias", segmentada por capítulo */}
        <div className="flex gap-2 mb-4">
          {HELP_CHAPTERS.map((c, ci) => (
            <div key={c.key} className="flex-1 flex gap-0.5">
              {c.steps.map((_, si) => {
                const globalIdx = ALL_HELP_STEPS.findIndex((s) => s.chapterIndex === ci && s.stepInChapter === si);
                const filled = globalIdx <= i;
                return <div key={si} className="h-1 flex-1 rounded-full transition-colors" style={{ backgroundColor: filled ? c.color : "var(--surface-2)" }} />;
              })}
            </div>
          ))}
        </div>

        {/* Demo en vivo — se mantiene montada mientras navegás dentro del
            mismo capítulo (la key depende solo del capítulo, no del paso),
            así lo que vas tocando/escribiendo no se resetea entre pasos. */}
        {step.demo && (
          <div key={`demo-${step.chapterKey}`} className="mb-3 tab-fade-in">
            {step.demo.caption && (
              <p className="text-[10px] font-bold mb-2 flex items-center gap-1.5" style={{ color: step.chapterColor }}>
                <Sparkles size={11} /> {step.demo.caption}
              </p>
            )}
            <div className="rounded-2xl border border-slate-700/40 bg-slate-950/60 p-3">
              <DemoPreview kind={step.demo.kind} view={step.demo.view} />
            </div>
          </div>
        )}

        <div key={i} className={`tab-fade-in ${step.demo ? "min-h-[56px]" : "min-h-[128px]"} ${step.isChapterIntro ? "flex flex-col items-center text-center gap-2.5 py-2" : "flex items-start gap-3"}`}>
          {step.isChapterIntro ? (
            <>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: step.chapterColor + "18", color: step.chapterColor }}>{step.icon}</div>
              <h3 className="text-base font-black text-white leading-tight">{step.title}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{step.text}</p>
            </>
          ) : (
            <>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: step.chapterColor + "15", color: step.chapterColor }}>{step.icon}</div>
              <div>
                <h3 className="text-sm font-black text-white mb-1">{step.title}</h3>
                <p className="text-sm text-slate-300 leading-relaxed">{step.text}</p>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between mt-5">
          <button onClick={() => setI((n) => Math.max(0, n - 1))} disabled={isFirst} className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${isFirst ? "text-slate-700" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}>Atrás</button>
          <span className="text-[10px] text-slate-600 font-medium">{i + 1} / {ALL_HELP_STEPS.length}</span>
          {isLast ? (
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black bg-teal-500 !text-white transition active:scale-95">Listo</button>
          ) : (
            <button onClick={() => setI((n) => Math.min(ALL_HELP_STEPS.length - 1, n + 1))} className="px-4 py-2 rounded-xl text-xs font-black bg-teal-500 !text-white transition active:scale-95">Siguiente</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   SET ROW — reps/kg, optional RPE, PR detection, haptics + confetti on PR.

   Los valores tipeados (reps/kg/RPE) viven en `drafts` (un objeto a nivel de
   perfil, igual que `logs`), no en estado local del componente. Esto es a
   propósito: antes vivían en useState local, y se perdían apenas la tarjeta
   se desmontaba (por ejemplo al cambiar de pestaña para mirar Progreso, o al
   cambiar de día). Ahora sobreviven a eso — sólo se limpian cuando se
   resetea el día (resetKey) o se finaliza la sesión (ver RoutineView/App).
============================================================================ */
function SetRow({ exerciseId, exerciseName, exerciseMuscle, setIndex, setDef, accent, logs, setLogs, drafts = {}, setDrafts, deloadKgFactor = 1, deloadMode = false, resetKey = 0, autoShowPrShare = true, onDisableAutoShowPrShare, hasActiveSession = true, cardio = false }) {
  const key = `${exerciseId}_${setIndex}`, prKey = `${key}_pr_override`, today = todayStr();
  const history = logs[key] || [], override = logs[prKey];
  // Cardio no tiene una "carga" comparable (no hay kg×reps) — el récord
  // ahí es, simplemente, la sesión más larga en minutos. La distancia es
  // un dato extra que se guarda si lo cargás, pero no decide el récord.
  const computedPR = useMemo(() => {
    if (cardio) { let best = null; history.forEach((h) => { if (!best || (h.minutes || 0) > (best.minutes || 0)) best = { minutes: h.minutes, km: h.km }; }); return best; }
    let best = setDef.pr ? { ...setDef.pr } : null; history.forEach((h) => { if (!best || vol(h.kg, h.reps) > vol(best.kg, best.reps)) best = { kg: h.kg, reps: h.reps }; }); return best;
  }, [history, setDef.pr, cardio]);
  const currentPR = override || computedPR;
  const suggestedKg = !cardio && currentPR && deloadMode ? Math.round(currentPR.kg * deloadKgFactor * 2) / 2 : null;
  const draft = drafts[key] || {};
  const reps = draft.reps ?? ""; const kg = draft.kg ?? ""; const rpe = draft.rpe ?? null;
  const minutes = draft.minutes ?? ""; const km = draft.km ?? "";
  const updateDraft = (patch) => { if (setDrafts) setDrafts({ ...drafts, [key]: { ...draft, ...patch } }); };
  const [feedback, setFeedback] = useState(null);
  const [showRpeLocal, setShowRpeLocal] = useState(false);
  const showRpe = showRpeLocal || rpe != null;
  const [editingPR, setEditingPR] = useState(false); const [editReps, setEditReps] = useState(""); const [editKg, setEditKg] = useState(""); const [saved, setSaved] = useState(false);
  const [prBurst, setPrBurst] = useState(0);
  const [showPRShare, setShowPRShare] = useState(false);
  const saveBtnRef = useRef(null);
  useEffect(() => { setFeedback(null); setSaved(false); setShowRpeLocal(false); }, [resetKey]);
  const handleSave = () => {
    if (cardio) {
      const m = parseFloat(minutes), d = km ? parseFloat(km) : null;
      if (!m || isNaN(m)) { setFeedback({ type: "error", msg: "Completá los minutos." }); return; }
      const isFirstEver = !currentPR;
      const prevMin = currentPR?.minutes || 0;
      const entry = { date: today, minutes: m }; if (d && !isNaN(d)) entry.km = d; if (rpe != null) entry.rpe = rpe;
      const newHistory = [...history.filter((h) => h.date !== today), entry];
      let newLogs = { ...logs, [key]: newHistory };
      const isPR = !isFirstEver && m > prevMin;
      if (isFirstEver || isPR) newLogs = { ...newLogs, [prKey]: { minutes: m, km: d || null, date: today } };
      setLogs(newLogs); setSaved(true); setTimeout(() => setSaved(false), 1200);
      const noSession = !hasActiveSession;
      if (isFirstEver) { haptic(18); setFeedback({ type: "first", msg: "Primer registro 📝", noSession }); }
      else if (isPR) { haptic([35, 25, 45]); setPrBurst((n) => n + 1); setFeedback({ type: "pr", msg: "¡Sesión más larga hasta ahora! 🔥", noSession }); }
      else if (m === prevMin) { haptic(18); setFeedback({ type: "tie", msg: "Igualaste tu marca 💪", noSession }); }
      else { haptic(18); setFeedback({ type: "down", msg: `-${(((prevMin - m) / prevMin) * 100).toFixed(0)}% vs récord`, noSession }); }
      return;
    }
    const r = parseFloat(reps), k = parseFloat(kg);
    if (!r || !k || isNaN(r) || isNaN(k)) { setFeedback({ type: "error", msg: "Completá reps y kg." }); return; }
    // Si no había ninguna marca previa, esto es la PRIMERA vez que se
    // registra esta serie — no es un "récord" todavía (no hay nada que
    // estés superando), así que no dispara fuego, ni el cartel de "¡Nueva
    // marca!", ni el popup automático para compartir. Igual queda
    // guardada como el punto de partida para comparar la próxima vez.
    const isFirstEver = !currentPR;
    const prevVol = currentPR ? vol(currentPR.kg, currentPR.reps) : 0, newVol = vol(k, r);
    const entry = { date: today, reps: r, kg: k }; if (rpe != null) entry.rpe = rpe;
    const newHistory = [...history.filter((h) => h.date !== today), entry];
    let newLogs = { ...logs, [key]: newHistory };
    const isPR = !isFirstEver && newVol > prevVol;
    if (isFirstEver || isPR) newLogs = { ...newLogs, [prKey]: { kg: k, reps: r, date: today } };
    setLogs(newLogs); setSaved(true); setTimeout(() => setSaved(false), 1200);
    const suggestUp = r > repRangeTop(setDef.repRange);
    const noSession = !hasActiveSession;
    if (isFirstEver) { haptic(18); setFeedback({ type: "first", msg: "Primera marca registrada 📝", suggestUp, noSession }); }
    else if (isPR) { haptic([35, 25, 45]); setPrBurst((n) => n + 1); setFeedback({ type: "pr", msg: "¡Nueva marca! 🔥", suggestUp, noSession }); if (autoShowPrShare) setShowPRShare(true); }
    else { haptic(18); if (newVol === prevVol) setFeedback({ type: "tie", msg: "Igualaste tu marca 💪", suggestUp: false, noSession }); else setFeedback({ type: "down", msg: `-${(((prevVol - newVol) / prevVol) * 100).toFixed(0)}% vs récord`, suggestUp: false, noSession }); }
  };
  const savePR = () => { const r = parseFloat(editReps), k = parseFloat(editKg); if (!r || !k || isNaN(r) || isNaN(k)) return; setLogs({ ...logs, [prKey]: { kg: k, reps: r } }); setEditingPR(false); };
  return (
    <div className="relative rounded-xl px-3.5 py-3.5 mb-2.5 last:mb-0" style={{ backgroundColor: accent + "0a", border: `1px solid ${accent}25` }}>
      <PRBurst anchorRef={saveBtnRef} trigger={prBurst} />
      <div className="absolute left-0 top-2 bottom-2 w-1 rounded-full" style={{ backgroundColor: accent }} />
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{cardio ? "SESIÓN" : `S${setIndex + 1}`}</span>
          {!cardio && <span className="text-[10px] bg-slate-800/80 text-slate-500 rounded-lg px-2 py-0.5">{setDef.repRange} reps</span>}
          {!cardio && isHeavyRepRange(setDef.repRange) && <span className="text-[10px] bg-amber-500/15 text-amber-400 rounded-lg px-2 py-0.5 font-bold">FUERZA</span>}
        </div>
        {feedback && (
          <span className={`flex items-center gap-1.5 text-xs font-semibold ${feedback.type === "pr" ? "text-emerald-400 pr-pop" : feedback.type === "down" ? "text-rose-400" : feedback.type === "first" ? "text-teal-400" : "text-amber-400"}`}>
            {feedback.msg}
            {feedback.type === "pr" && !cardio && <button onClick={() => setShowPRShare(true)} aria-label="Compartir esta marca" className="text-emerald-300 hover:text-emerald-100 active:scale-90 transition"><Share2 size={13} /></button>}
          </span>
        )}
      </div>
      {feedback?.suggestUp && <div className="mb-2.5 -mt-1 text-[11px] text-teal-400 flex items-center gap-1.5"><TrendingUp size={11} /> Superaste el rango · probá +2.5kg la próxima</div>}
      {feedback?.noSession && <div className="mb-2.5 -mt-1 text-[11px] text-amber-400 flex items-center gap-1.5"><AlertTriangle size={11} /> Tocá "Iniciar sesión" arriba para que este día cuente en tu historial</div>}
      {deloadMode && suggestedKg && <div className="mb-2 text-[11px] text-purple-400 flex items-center gap-1.5"><Zap size={11} /> Descarga: {suggestedKg} kg sugerido ({Math.round(deloadKgFactor * 100)}%)</div>}

      {/* El récord va PRIMERO, grande — es lo que estás tratando de
          superar en esta serie, así que tiene que verse antes de
          ponerte a cargar números, no como una nota chica al final. */}
      <div className="flex items-center gap-2 mb-3">
        {currentPR ? (
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl flex-1" style={{ backgroundColor: accent + "1c", border: `1px solid ${accent}40` }}>
            <Trophy size={14} style={{ color: accent }} className="shrink-0" />
            <p className="flex-1 min-w-0 truncate">
              <span className="text-[10px] font-bold uppercase tracking-wide mr-1.5" style={{ color: accent + "bb" }}>A superar:</span>
              <span className="text-base font-black" style={{ color: accent }}>
                {cardio ? <>{currentPR.minutes} min{currentPR.km ? ` · ${currentPR.km}km` : ""}</> : <>{currentPR.reps}×{currentPR.kg}kg</>}
              </span>
            </p>
            {!cardio && (
              <button onClick={() => { setEditReps(currentPR?.reps ?? ""); setEditKg(currentPR?.kg ?? ""); setEditingPR((e) => !e); }} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 transition active:scale-95" style={{ backgroundColor: accent + "22", color: accent }}>
                <Edit3 size={11} /> Editar
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl flex-1 bg-slate-800/40 border border-slate-700/40">
            <Target size={15} className="text-slate-600 shrink-0" />
            <p className="text-xs text-slate-500">Sin marca aún — esta va a ser tu primera</p>
          </div>
        )}
      </div>

      {cardio ? (
        <div className="flex items-end gap-2">
          <div className="flex-1"><label className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider mb-1.5 block">Minutos</label><input type="number" inputMode="decimal" placeholder="—" value={minutes} onChange={(e) => updateDraft({ minutes: e.target.value })} className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-3.5 text-xl font-black text-center text-white focus:outline-none focus:border-teal-500/50 transition" /></div>
          <div className="flex-1"><label className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider mb-1.5 block">Km <span className="text-slate-700 normal-case">(opc.)</span></label><input type="number" inputMode="decimal" placeholder="—" value={km} onChange={(e) => updateDraft({ km: e.target.value })} className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-3.5 text-xl font-black text-center text-white focus:outline-none focus:border-teal-500/50 transition" /></div>
          <button ref={saveBtnRef} onClick={handleSave} className={`p-3.5 rounded-xl transition-all active:scale-90 font-bold text-white flex items-center justify-center ${saved ? "bg-emerald-500" : "hover:opacity-90"}`} style={!saved ? { backgroundColor: accent } : {}}>{saved ? <Check size={18} /> : <Save size={18} />}</button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-1"><label className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider mb-1.5 block">Reps</label><input type="number" inputMode="decimal" placeholder="—" value={reps} onChange={(e) => updateDraft({ reps: e.target.value })} className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-3.5 text-xl font-black text-center text-white focus:outline-none focus:border-teal-500/50 transition" /></div>
          <div className="text-slate-700 text-lg pb-3">×</div>
          <div className="flex-1"><label className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider mb-1.5 block">Kg</label><input type="number" inputMode="decimal" placeholder="—" value={kg} onChange={(e) => updateDraft({ kg: e.target.value })} className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-3.5 text-xl font-black text-center text-white focus:outline-none focus:border-teal-500/50 transition" /></div>
          <button ref={saveBtnRef} onClick={handleSave} className={`p-3.5 rounded-xl transition-all active:scale-90 font-bold text-white flex items-center justify-center ${saved ? "bg-emerald-500" : "hover:opacity-90"}`} style={!saved ? { backgroundColor: accent } : {}}>{saved ? <Check size={18} /> : <Save size={18} />}</button>
        </div>
      )}
      {!showRpe ? (
        <button onClick={() => setShowRpeLocal(true)} className="w-full flex items-center justify-center gap-1.5 mt-2.5 py-2 rounded-lg border border-dashed border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 text-[11px] font-bold transition"><Activity size={11} /> Registrar esfuerzo (RPE)</button>
      ) : (
        <div className="mt-2.5 flex items-center gap-1.5 bounce-in bg-slate-900/60 rounded-lg px-2 py-2">
          <span className="text-[10px] text-slate-600 font-semibold w-7 shrink-0">RPE</span>
          {RPE_SCALE.map((rs) => (
            <button key={rs.value} onClick={() => updateDraft({ rpe: rpe === rs.value ? null : rs.value })} title={rs.desc} className="w-7 h-7 rounded-lg text-[11px] font-bold transition-all active:scale-90 shrink-0" style={rpe === rs.value ? { backgroundColor: rpeColor(rs.value), color: "#0a0a0f" } : { backgroundColor: "var(--surface-2)", color: "var(--surface-2-text)" }}>{rs.value}</button>
          ))}
          {rpe != null && <span className="text-[10px] text-slate-500 ml-1 truncate">{RPE_SCALE.find((r) => r.value === rpe)?.desc}</span>}
          <button onClick={() => { updateDraft({ rpe: null }); setShowRpeLocal(false); }} className="text-slate-600 hover:text-slate-400 ml-auto shrink-0"><X size={12} /></button>
        </div>
      )}
      {editingPR && !cardio && (
        <div className="mt-2 bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2 bounce-in">
          <p className="text-[11px] text-slate-500">Corregir récord:</p>
          <div className="flex flex-wrap gap-2 items-center">
            <input type="number" inputMode="decimal" placeholder="Reps" value={editReps} onChange={(e) => setEditReps(e.target.value)} className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white" />
            <span className="text-slate-600 text-xs">reps ×</span>
            <input type="number" inputMode="decimal" placeholder="Kg" value={editKg} onChange={(e) => setEditKg(e.target.value)} className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white" />
            <span className="text-slate-600 text-xs">kg</span>
            <button onClick={savePR} className="px-3 py-1.5 rounded-lg text-white text-xs font-bold" style={{ backgroundColor: accent }}>Guardar</button>
            {override && <button onClick={() => { const l = { ...logs }; delete l[prKey]; setLogs(l); setEditingPR(false); }} className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 text-xs">Quitar</button>}
            <button onClick={() => setEditingPR(false)} className="text-slate-500 text-xs">Cancelar</button>
          </div>
        </div>
      )}
      {showPRShare && !cardio && (
        <ShareImageModal
          title="Compartí tu marca"
          fileNamePrefix={`pr-${exerciseId}`}
          shareTitle="Mi Rutina — Nueva marca"
          shareText={`¡Nueva marca en ${exerciseName}! 🔥`}
          draw={(ctx, W, H) => drawPRShareCard(ctx, W, H, { exerciseName, muscle: exerciseMuscle, kg: parseFloat(kg) || currentPR?.kg, reps: parseFloat(reps) || currentPR?.reps, accent })}
          onClose={() => setShowPRShare(false)}
          autoShowOptOutLabel={autoShowPrShare ? "No mostrar esto automáticamente la próxima vez" : null}
          onOptOutAutoShow={() => { onDisableAutoShowPrShare?.(); setShowPRShare(false); }}
        />
      )}
    </div>
  );
}

/* ============================================================================
   EXERCISE CARD
============================================================================ */
function ExerciseCard({ exercise, accent, logs, setLogs, drafts = {}, setDrafts, deloadSets, deloadMode, resetKey = 0, settings = DEFAULT_SETTINGS, forceOpen = false, onDisableAutoShowPrShare, hasActiveSession = true, hideTimer = false }) {
  const [open, setOpen] = useState(false);
  const [showWarmup, setShowWarmup] = useState(false);
  // forceOpen se usa solo desde las demos del tutorial guiado, para abrir la
  // tarjeta automáticamente cuando el paso explica algo de adentro (reps/kg,
  // RPE, descanso, video). No afecta el comportamiento normal de la app.
  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);
  const hasHeavy = exercise.sets.some((s) => isHeavyRepRange(s.repRange));
  const setsToShow = deloadSets ? exercise.sets.slice(0, deloadSets) : exercise.sets;
  const { stagnant } = useMemo(() => getStagnationInfo(exercise, logs), [exercise, logs]);
  const bestWorkingKg = !exercise.cardio ? getBestWorkingKg(exercise, logs) : null;
  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-md shadow-black/20 transition-shadow hover:shadow-lg hover:shadow-black/30">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-4 hover:bg-slate-800/30 active:bg-slate-800/50 transition text-left">
        <div className="flex items-center gap-3">
          <div className="w-2 h-8 rounded-full shrink-0" style={{ backgroundColor: accent, boxShadow: `0 0 10px -2px ${accent}` }} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-white text-sm">{exercise.name}</h3>
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-lg font-bold" style={{ backgroundColor: accent + "18", color: accent }}>{exercise.muscle}</span>
              {exercise.cardio && <span className="text-[10px] bg-rose-400/15 text-rose-300 rounded-lg px-1.5 py-0.5 font-bold flex items-center gap-1"><Footprints size={9} /> CARDIO</span>}
              {deloadMode && <span className="text-[10px] bg-purple-500/15 text-purple-400 rounded-lg px-1.5 py-0.5 font-bold">DESCARGA</span>}
              {!deloadMode && stagnant && <span className="text-[10px] bg-rose-500/15 text-rose-400 rounded-lg px-1.5 py-0.5 font-bold flex items-center gap-1"><AlertTriangle size={9} /> ESTANCADO</span>}
            </div>
            {exercise.nota && <p className="text-[11px] text-slate-500 mt-0.5">{exercise.nota}</p>}
          </div>
        </div>
        <ChevronDown size={18} className={`text-slate-600 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={open ? "px-4 pb-4 pt-0 tab-fade-in" : "hidden"}>
        {!deloadMode && stagnant && <div className="mb-3 text-[11px] text-rose-400/90 bg-rose-500/5 border border-rose-500/15 rounded-xl px-3 py-2 flex items-start gap-1.5"><Info size={12} className="mt-0.5 shrink-0" /><span>Hace {STAGNATION_DAYS}+ días sin superar el récord. Considerá cambiar reps, descanso o variante.</span></div>}
        {!exercise.cardio && !hideTimer && (
          <div className="mb-1">
            <RestTimer seconds={hasHeavy ? settings.restLong : settings.restShort} accent={accent} alertType={settings.alertType} />
          </div>
        )}
        {!exercise.cardio && !deloadMode && bestWorkingKg != null && (
          <div className="mb-2">
            {!showWarmup ? (
              <button onClick={() => setShowWarmup(true)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed text-[11px] font-bold transition" style={{ borderColor: accent + "40", color: accent }}>
                <Flame size={12} /> Ver calentamiento sugerido
              </button>
            ) : (
              <div className="rounded-xl border p-3 space-y-2 bounce-in" style={{ borderColor: accent + "30", backgroundColor: accent + "0c" }}>
                <button onClick={() => setShowWarmup(false)} className="w-full flex items-center justify-center gap-1.5" style={{ color: accent }} aria-label="Ocultar calentamiento sugerido">
                  <Flame size={11} /><span className="text-[10px] font-black uppercase tracking-wider">Calentamiento sugerido</span><ChevronUp size={11} />
                </button>
                {WARMUP_STEPS.map((w, i) => {
                  const wKg = Math.round(bestWorkingKg * w.pct * 2) / 2;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-[10px] font-black w-10 shrink-0" style={{ color: accent }}>{Math.round(w.pct * 100)}%</span>
                      <span className="text-[11px] text-slate-500 bg-slate-800/60 rounded-lg px-2 py-1 shrink-0">{w.reps} reps</span>
                      <span className="text-sm font-black flex-1 text-right" style={{ color: accent }}>{wKg}kg</span>
                    </div>
                  );
                })}
                <p className="text-[9px] text-slate-600 pt-1">Basado en tu mejor marca actual ({bestWorkingKg}kg) — es sólo una guía, no se guarda como serie.</p>
              </div>
            )}
          </div>
        )}
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-2 mt-1">{exercise.cardio ? "Registrá tu sesión" : "Tus series"}</p>
        {setsToShow.map((s, i) => <SetRow key={i} exerciseId={exercise.id} exerciseName={exercise.name} exerciseMuscle={exercise.muscle} setIndex={i} setDef={s} accent={accent} logs={logs} setLogs={setLogs} drafts={drafts} setDrafts={setDrafts} deloadKgFactor={settings.deloadPct} deloadMode={deloadMode} resetKey={resetKey} autoShowPrShare={settings.autoShowPrShare ?? true} onDisableAutoShowPrShare={onDisableAutoShowPrShare} hasActiveSession={hasActiveSession} cardio={exercise.cardio} />)}
        {exercise.video && (
          <div className="pt-3">
            <a href={exercise.video} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 py-3 rounded-xl border transition text-sm font-bold active:scale-[0.98]" style={{ borderColor: "#EF444435", backgroundColor: "#EF44440c", color: "#F87171" }}>
              <SquarePlay size={17} /> Ver técnica en YouTube
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   WEEK CALENDAR (cuadro de "ciclo actual" — vive en la pestaña Progreso;
   antes estaba en Rutina, se movió para no competir con el registro de
   series del día a día). Usa el mismo tratamiento visual que el hero de
   Descarga (fondo en degradé + manchas de color decorativas): azul cuando
   es semana de entrenamiento, violeta —igual que Descarga— cuando es
   semana de descarga.
============================================================================ */
function WeekCalendar({ cycleStart, logs, sessions, settings = DEFAULT_SETTINGS, onGoToDeload }) {
  const weekInfo = getWeekInfo(cycleStart, settings);
  if (!cycleStart || !weekInfo) return null;
  const { cycleWeeks, trainWeeks } = weekInfo;
  const isLight = settings.theme === "light";
  const neutralDot = isLight ? "#94a3b8" : "#475569";
  const trainedDays = useMemo(() => getTrainedDateSet(logs, sessions), [logs, sessions]);
  const weekDots = Array.from({ length: cycleWeeks }, (_, wi) => { const ws = new Date(cycleStart); ws.setDate(ws.getDate() + wi * 7); const days = Array.from({ length: 7 }, (_, di) => { const d = new Date(ws); d.setDate(d.getDate() + di); return d.toISOString().slice(0, 10); }); return { week: wi + 1, days, trained: days.filter((d) => trainedDays.has(d)).length, isDeload: wi + 1 > trainWeeks }; });
  const phase = weekInfo.isDeload ? "#A855F7" : "#3B82F6";
  const heroGrad = weekInfo.isDeload ? "var(--grad-hero-purple)" : "var(--grad-hero-blue)";
  const borderClass = weekInfo.isDeload ? "border-purple-500/45" : "border-blue-500/45";
  return (
    <div className={`relative overflow-hidden border ${borderClass} rounded-2xl p-4 shadow-md shadow-black/20`} style={{ background: heroGrad }}>
      <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl opacity-30 pointer-events-none" style={{ backgroundColor: phase }} />
      <div className="absolute -bottom-8 -left-8 w-28 h-28 rounded-full blur-2xl opacity-20 pointer-events-none" style={{ backgroundColor: phase }} />
      <div className="relative flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: phase + "1c", color: phase, boxShadow: `0 0 0 1px ${phase}30 inset` }}>
            {weekInfo.isDeload ? <Zap size={17} /> : <Flame size={17} />}
          </div>
          <div>
            <h3 className="text-sm font-bold text-white leading-tight">Ciclo #{weekInfo.cycleNumber}</h3>
            <p className="text-[11px] text-slate-500 leading-tight mt-0.5">Semana {weekInfo.weekInCycle} de {cycleWeeks}</p>
          </div>
        </div>
        <div className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide shrink-0" style={{ backgroundColor: phase + "1c", color: phase }}>{weekInfo.isDeload ? "Descarga" : "Entrenamiento"}</div>
      </div>

      <div className="relative flex gap-1.5 flex-wrap">
        {weekDots.map(({ week, trained, isDeload }) => { const isCurrent = week === weekInfo.weekInCycle; const dotColor = isDeload ? "#A855F7" : trained > 0 ? "#3B82F6" : neutralDot; return (
          <div
            key={week}
            className={`w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black transition-all ${isCurrent ? "scale-110" : ""}`}
            style={isCurrent
              ? { backgroundColor: dotColor, color: "#fff", boxShadow: `0 6px 16px -4px ${dotColor}aa` }
              : { backgroundColor: dotColor + "1a", color: dotColor, border: `1px solid ${dotColor}30` }}
          >
            {isDeload ? "D" : week}
          </div>
        ); })}
      </div>

      <button onClick={onGoToDeload} className="relative w-full flex items-center justify-center gap-1.5 mt-4 pt-3 border-t border-white/10 text-[10px] font-bold text-purple-300/75 hover:text-purple-300 transition">
        <Zap size={11} /> Ver mi semana de descarga
      </button>
    </div>
  );
}

/* ============================================================================
   SESSION BAR — botón de Iniciar sesión (arriba) / estado en curso con
   tiempo transcurrido. El de Finalizar sesión vive abajo, en RoutineView.
============================================================================ */
function SessionStartBar({ activeSession, onStart, onCancel, color = "#14B8A6" }) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!activeSession) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [activeSession]);

  if (!activeSession) {
    return (
      <button onClick={onStart} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white text-sm font-bold transition-all active:scale-[0.98] shadow-lg" style={{ backgroundColor: color, boxShadow: `0 10px 24px -8px ${color}88` }}>
        <Play size={15} /> Iniciar sesión
      </button>
    );
  }

  const elapsedMin = Math.max(0, Math.floor((Date.now() - new Date(activeSession.startedAt).getTime()) / 60000));
  return (
    <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ backgroundColor: color + "1a", border: `1px solid ${color}40` }}>
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ backgroundColor: color }} />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: color }} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white">Sesión en curso</p>
        <p className="text-[11px]" style={{ color: color + "cc" }}>{elapsedMin} min · arrancó a las {new Date(activeSession.startedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</p>
      </div>
      <button onClick={onCancel} className="text-[11px] text-slate-500 hover:text-slate-300 font-semibold shrink-0">Cancelar</button>
    </div>
  );
}

/* ============================================================================
   ROUTINE VIEW — day picker up top, a single "hero" panel for the active day
   (gradient + stats + reset, replacing the old separate summary card), then
   the exercise list in a responsive grid. El cuadro de "ciclo actual" vive
   en Progreso — ver WeekCalendar más arriba.

   `drafts`/`setDrafts` viajan hasta cada SetRow: lo que se tipea (sin
   guardar todavía) sobrevive a cambios de pestaña, de día, o a colapsar y
   volver a abrir una tarjeta. Sólo se limpia con "Resetear sesión de hoy"
   (acá abajo) o al finalizar la sesión (ver handleEndSession en App()).
============================================================================ */
// Agrupa ejercicios consecutivos encadenados con supersetNext en un solo
// "grupo" — un ejercicio con supersetNext:true se hace sin descanso antes
// del siguiente de la lista, así que comparten un único cronómetro al
// final del grupo en vez de uno por ejercicio. Un grupo de un solo
// elemento (el caso normal, sin superserie) se renderiza exactamente
// igual que antes.
function groupExercisesIntoSupersets(exercises) {
  const groups = [];
  let current = [];
  exercises.forEach((ex, i) => {
    current.push(ex);
    if (!ex.supersetNext || i === exercises.length - 1) { groups.push(current); current = []; }
  });
  return groups;
}

function RoutineView({ logs, setLogs, drafts, setDrafts, cycleStart, settings, weekSchedule, activeSession, onStartSession, onEndSession, onCancelSession, onDisableAutoShowPrShare }) {
  // El día programado para hoy según el cronograma semanal (lunes a domingo)
  // de la rutina activa. Si hoy es descanso programado (o no hay cronograma
  // todavía), cae al viejo heurístico de "último día entrenado + 1" — pero
  // nunca bloquea nada: siempre podés elegir cualquier día con los chips.
  const scheduledDay = useMemo(() => { const dk = weekSchedule?.[todayWeekdayKey()]; return dk && DAY_ORDER.includes(dk) ? dk : null; }, [weekSchedule]);
  const isRestToday = !!weekSchedule && !scheduledDay;
  const fallbackSuggested = useMemo(() => getSuggestedDay(logs), []);
  const suggestedDay = scheduledDay || fallbackSuggested;
  const [activeDay, setActiveDay] = useState(() => scheduledDay || fallbackSuggested);
  const weekInfo = getWeekInfo(cycleStart, settings), isDeload = weekInfo?.isDeload, day = ROUTINE[activeDay];
  const [resetKeys, setResetKeys] = useState({});
  const [confirmReset, setConfirmReset] = useState(false);
  const getDeloadSets = (ex) => Math.max(1, Math.ceil(ex.sets.length / settings.deloadSetDivisor));

  const today = todayStr();
  let totalSets = 0, doneToday = 0;
  day.exercises.forEach((ex) => ex.sets.forEach((s, i) => { totalSets++; const h = logs[`${ex.id}_${i}`] || []; if (h.some((x) => x.date === today)) doneToday++; }));
  const pct = totalSets ? Math.round((doneToday / totalSets) * 100) : 0;

  const handleResetDay = () => {
    const newLogs = { ...logs };
    const newDrafts = { ...drafts };
    day.exercises.forEach((ex) => { ex.sets.forEach((_, i) => { const key = `${ex.id}_${i}`; if (newLogs[key]) { newLogs[key] = newLogs[key].filter((h) => h.date !== today); if (!newLogs[key].length) delete newLogs[key]; } delete newDrafts[key]; }); });
    setLogs(newLogs); setDrafts(newDrafts); setResetKeys((prev) => ({ ...prev, [activeDay]: (prev[activeDay] || 0) + 1 })); setConfirmReset(false);
  };

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-teal-500/20 p-5" style={{ background: "var(--grad-hero-teal)" }}>
        <div className="absolute -top-8 -right-6 w-32 h-32 rounded-full bg-teal-500/15 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full bg-cyan-500/10 blur-2xl pointer-events-none" />
        <div className="relative flex items-center gap-2 mb-1">
          <Dumbbell size={16} className="text-teal-400" />
          <span className="text-[11px] font-black uppercase tracking-widest text-teal-400">Tu entrenamiento</span>
        </div>
        <h2 className="relative text-xl font-black text-white leading-tight">Rutina</h2>
        <p className="relative text-xs text-teal-300/60 mt-1">Registrá tus series de hoy y seguí tu progreso día a día</p>
      </div>

      {isRestToday && (
        <div className="flex items-start gap-2.5 bg-slate-900/50 border border-slate-800/50 rounded-xl px-3.5 py-2.5">
          <Calendar size={13} className="text-slate-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-slate-400">Hoy es descanso según tu cronograma semanal — pero entrená el día que quieras, esto es solo una guía. <span className="text-slate-600">(Lo configurás en Rutinas.)</span></p>
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {DAY_ORDER.map((k) => (
          <button key={k} onClick={() => setActiveDay(k)} className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase whitespace-nowrap transition-all active:scale-95 border hover:-translate-y-0.5"
            style={activeDay === k ? { background: ROUTINE[k].color, borderColor: ROUTINE[k].color, color: "#fff", boxShadow: `0 4px 14px -4px ${ROUTINE[k].color}66` } : { borderColor: "var(--chip-border)", color: "var(--chip-text)" }}>
            {ROUTINE[k].label}
          </button>
        ))}
      </div>

      <div key={activeDay} className="relative overflow-hidden rounded-2xl border tab-fade-in" style={{ borderColor: day.color + "55", background: `linear-gradient(135deg, ${day.color}38, transparent 75%)` }}>
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-25 pointer-events-none" style={{ backgroundColor: day.color }} />
        <div className="relative p-5">
          {activeDay === suggestedDay && (
            <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg mb-3" style={{ backgroundColor: day.color + "22", color: day.color }}>
              <RotateCcw size={10} /> {scheduledDay === activeDay ? "Programado para hoy" : "Sugerido para hoy"}
            </div>
          )}
          <h2 className="text-xl font-black text-white leading-tight uppercase">{day.label}</h2>
          <p className="text-xs text-slate-400 mt-1">{day.description}</p>
          {day.isNew && <div className="mt-2 inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] rounded-lg px-2.5 py-1">🆕 Empezás a registrar tus marcas desde hoy.</div>}
          {isDeload && <div className="mt-3 flex items-start gap-2.5 bg-purple-500/10 border border-purple-500/20 rounded-xl px-3 py-2.5"><Zap size={14} className="text-purple-400 mt-0.5 shrink-0" /><p className="text-[11px] text-purple-300/90">Semana de descarga · Series ÷{settings.deloadSetDivisor} · Cargas al {Math.round(settings.deloadPct * 100)}%</p></div>}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-black/20 rounded-xl p-2.5 text-center"><p className="text-xl font-black text-white tabular-nums">{pct}%</p><p className="text-[9px] text-slate-500 mt-0.5 flex items-center justify-center gap-1"><ListChecks size={9} />Hoy</p></div>
            <div className="bg-black/20 rounded-xl p-2.5 text-center"><p className="text-xl font-black text-white tabular-nums">{day.exercises.length}</p><p className="text-[9px] text-slate-500 mt-0.5 flex items-center justify-center gap-1"><Dumbbell size={9} />Ejercicios</p></div>
            <div className="bg-black/20 rounded-xl p-2.5 text-center"><p className="text-xl font-black text-white tabular-nums">{totalSets}</p><p className="text-[9px] text-slate-500 mt-0.5">Series</p></div>
          </div>
          {!confirmReset ? (
            <button onClick={() => setConfirmReset(true)} className="w-full flex items-center justify-center gap-1.5 mt-3 py-2 rounded-xl border border-white/5 text-slate-500 hover:text-slate-300 transition text-[11px] font-medium"><RotateCcw size={11} /> Resetear sesión de hoy</button>
          ) : (
            <div className="flex gap-2 items-center mt-3 bg-black/30 border border-white/10 rounded-xl px-3 py-2">
              <p className="text-[11px] text-slate-400 flex-1">¿Borrar reps/kg de hoy (incluido lo sin guardar)? Los récords no cambian.</p>
              <button onClick={() => setConfirmReset(false)} className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs">No</button>
              <button onClick={handleResetDay} className="px-2.5 py-1.5 rounded-lg bg-rose-500/80 !text-white text-xs font-bold">Sí</button>
            </div>
          )}
        </div>
      </div>

      {/* Fuera del bloque con key={activeDay} a propósito: así, aunque
          cambies de día (lo que SÍ remonta la tarjeta de arriba por el
          cambio de key), este botón nunca se desmonta — sigue en el mismo
          lugar siempre, entre la tarjeta del día y los ejercicios. */}
      <SessionStartBar activeSession={activeSession} onStart={() => onStartSession(activeDay)} onCancel={onCancelSession} color={day.color} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {groupExercisesIntoSupersets(day.exercises).map((group) => {
          if (group.length === 1) {
            const ex = group[0];
            return <ExerciseCard key={ex.id} exercise={ex} accent={day.color} logs={logs} setLogs={setLogs} drafts={drafts} setDrafts={setDrafts} deloadSets={isDeload ? getDeloadSets(ex) : null} deloadMode={isDeload} resetKey={resetKeys[activeDay]} settings={settings} onDisableAutoShowPrShare={onDisableAutoShowPrShare} hasActiveSession={!!activeSession} />;
          }
          // Superserie: varios ejercicios encadenados comparten un solo
          // cronómetro al final del grupo, en vez de uno por ejercicio —
          // la idea de la superserie es justamente no descansar entre
          // ellos, sólo al terminar la vuelta completa.
          const hasHeavyGroup = group.some((ex) => ex.sets.some((s) => isHeavyRepRange(s.repRange)));
          return (
            <div key={group.map((e) => e.id).join("-")} className="rounded-2xl border-2 border-dashed p-2.5 space-y-2.5" style={{ borderColor: day.color + "45" }}>
              <div className="flex items-center gap-1.5 px-1"><Link size={11} style={{ color: day.color }} /><span className="text-[10px] font-black uppercase tracking-wider" style={{ color: day.color }}>Superserie · {group.length} ejercicios</span></div>
              {group.map((ex) => <ExerciseCard key={ex.id} exercise={ex} accent={day.color} logs={logs} setLogs={setLogs} drafts={drafts} setDrafts={setDrafts} deloadSets={isDeload ? getDeloadSets(ex) : null} deloadMode={isDeload} resetKey={resetKeys[activeDay]} settings={settings} onDisableAutoShowPrShare={onDisableAutoShowPrShare} hasActiveSession={!!activeSession} hideTimer />)}
              <div className="px-1"><RestTimer seconds={hasHeavyGroup ? settings.restLong : settings.restShort} accent={day.color} alertType={settings.alertType} /></div>
              <p className="text-[10px] text-slate-600 px-1">Descansá recién después de completar los {group.length} ejercicios — ese es el cronómetro de arriba.</p>
            </div>
          );
        })}
      </div>

      {activeSession && (
        <div>
          <button onClick={onEndSession} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white text-sm font-bold transition-all active:scale-[0.98] shadow-lg" style={{ backgroundColor: day.color, boxShadow: `0 10px 24px -8px ${day.color}88` }}>
            <Check size={15} /> Finalizar sesión
          </button>
          <p className="text-center text-[10px] text-slate-600 mt-2">Se guarda como entrenamiento de hoy y se limpia lo que tenías escrito sin guardar — alimenta tu racha, calendario y gráficas.</p>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   SESSION HISTORY — calendar + list views over buildSessionsIndex(logs)
============================================================================ */
function SessionDetailCard({ session, onDelete }) {
  const dateLabel = new Date(session.date + "T00:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4 bounce-in">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white capitalize">{dateLabel}</p>
          <div className="flex gap-1 mt-1 flex-wrap">{session.dayKeys.map((dk) => <span key={dk} className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-lg" style={{ backgroundColor: ROUTINE[dk].color + "20", color: muteHexColor(ROUTINE[dk].color) }}>{ROUTINE[dk].label}</span>)}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className="text-sm font-black text-white">{session.totalSets} <span className="text-[10px] text-slate-500 font-normal">series</span></p>
            {session.improvedCount > 0 && <p className="text-[10px] font-bold text-emerald-400 mt-0.5 flex items-center justify-end gap-1"><TrendingUp size={10} /> {session.improvedCount} mejora{session.improvedCount === 1 ? "" : "s"}</p>}
            {session.avgRpe != null && <p className="text-[10px] font-bold mt-0.5" style={{ color: rpeColor(session.avgRpe) }}>RPE prom. {session.avgRpe}</p>}
          </div>
          {onDelete && !confirmDel && (
            <button onClick={() => setConfirmDel(true)} aria-label="Borrar este día" className="p-1.5 rounded-lg text-slate-600 hover:text-rose-400 transition shrink-0"><Trash2 size={14} /></button>
          )}
        </div>
      </div>
      {confirmDel && (
        <div className="flex gap-2 items-center mb-3 bg-rose-950/30 border border-rose-500/20 rounded-xl px-3 py-2 bounce-in">
          <p className="text-[11px] text-rose-300/80 flex-1">¿Borrar el entrenamiento de este día? Los récords no cambian.</p>
          <button onClick={() => setConfirmDel(false)} className="px-2 py-1 rounded-lg bg-slate-800 text-slate-400 text-[11px]">No</button>
          <button onClick={() => onDelete(session.date)} className="px-2 py-1 rounded-lg bg-rose-500 !text-white text-[11px] font-bold">Sí, borrar</button>
        </div>
      )}
      <div className="space-y-1.5">
        {session.items.map((it, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-slate-400 truncate flex-1">{it.exerciseName} <span className="text-slate-600">S{it.setIndex + 1}</span></span>
            <span className="text-slate-200 font-semibold shrink-0 ml-2">{it.reps}×{it.kg}kg{it.isImprovement && <span className="ml-1 text-emerald-400" title="Mejora">🔥</span>}{it.rpe != null && <span className="ml-1.5 font-bold" style={{ color: rpeColor(it.rpe) }}>RPE{it.rpe}</span>}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
   CREAR IMAGEN PARA COMPARTIR (a pedido) — antes, las tarjetas de Instagram
   sólo aparecían en el momento exacto de un récord o de completar un ciclo
   entero. Esta es la versión "a demanda": una opción chica en Historial que
   deja generar la misma clase de imagen en cualquier momento, ya sea de tu
   mejor marca en un ejercicio o de un resumen de hoy/la semana/el mes.
============================================================================ */
const SHARE_SUMMARY_PERIODS = [
  { k: "day", l: "Hoy" },
  { k: "week", l: "Esta semana" },
  { k: "month", l: "Este mes" },
];

function ShareSummaryCard({ logs }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null); // "pr" | "period"
  const [period, setPeriod] = useState("week");
  const [selExId, setSelExId] = useState(null);
  const [showImage, setShowImage] = useState(false);

  const allExercises = useMemo(() => DAY_ORDER.flatMap((dk) => ROUTINE[dk].exercises.map((e) => ({ id: e.id, name: e.name, muscle: e.muscle, color: ROUTINE[dk].color, sets: e.sets.length }))), []);
  const allSessions = useMemo(() => buildSessionsIndex(logs), [logs]);
  const periodSessions = useMemo(() => getSessionsForPeriod(allSessions, period), [allSessions, period]);
  const periodStats = useMemo(() => {
    const daySet = new Set(); let totalVol = 0, totalSets = 0;
    periodSessions.forEach((s) => { daySet.add(s.date); totalVol += s.totalVolume; totalSets += s.totalSets; });
    return { daysTrained: daySet.size, totalVol: Math.round(totalVol), totalSets };
  }, [periodSessions]);

  // Para que la imagen del resumen se vea con los casilleros llenos/vacíos
  // de la semana o el mes (igual que el calendario de Historial), armamos
  // la misma grilla acá — sólo tiene sentido para "semana" y "mes"; para
  // "hoy" no hay grilla, es un solo día.
  const trainedDateSet = useMemo(() => new Set(periodSessions.map((s) => s.date)), [periodSessions]);
  const calendarCells = useMemo(() => {
    const now = new Date();
    if (period === "week") {
      const dow = (now.getDay() + 6) % 7;
      const monday = new Date(now); monday.setDate(now.getDate() - dow);
      return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); const ds = d.toISOString().slice(0, 10); return { trained: trainedDateSet.has(ds), isPad: false }; });
    }
    if (period === "month") {
      const weeks = getMonthMatrix(now.getFullYear(), now.getMonth());
      return weeks.flat().map((d) => (d ? { trained: trainedDateSet.has(d), isPad: false } : { trained: false, isPad: true }));
    }
    return [];
  }, [period, trainedDateSet]);

  const getPRForExercise = (ex) => {
    let best1rm = 0, bestKg = 0, bestReps = 0;
    Array.from({ length: ex.sets }).forEach((_, i) => {
      const ov = logs[`${ex.id}_${i}_pr_override`], h = logs[`${ex.id}_${i}`] || [];
      const entries = ov ? [ov] : h;
      entries.forEach((e) => { const rm = estimate1RM(e.kg, e.reps); if (rm > best1rm) { best1rm = rm; bestKg = e.kg; bestReps = e.reps; } });
    });
    return { best1rm, bestKg, bestReps };
  };
  const selEx = allExercises.find((e) => e.id === selExId);
  const selPR = selEx ? getPRForExercise(selEx) : null;
  const periodLabel = SHARE_SUMMARY_PERIODS.find((p) => p.k === period)?.l || "";

  const close = () => { setOpen(false); setMode(null); setSelExId(null); };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-teal-400 transition shrink-0"><Share2 size={12} /> Crear imagen para compartir</button>
    );
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-3.5 bounce-in space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-white flex items-center gap-1.5"><Share2 size={13} className="text-teal-400" /> Crear imagen para compartir</p>
        <button onClick={close} aria-label="Cerrar" className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition"><X size={14} /></button>
      </div>

      {mode === null && (
        <div className="flex gap-2">
          <button onClick={() => setMode("pr")} className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-teal-500/40 transition text-xs font-bold">Tu mejor marca</button>
          <button onClick={() => setMode("period")} className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-teal-500/40 transition text-xs font-bold">Resumen de un período</button>
        </div>
      )}

      {mode === "pr" && (
        <div className="space-y-2.5">
          <ExerciseChipRow exercises={allExercises} selId={selExId} onSelect={setSelExId} />
          {selEx && (selPR?.best1rm > 0 ? (
            <p className="text-[11px] text-slate-500">Tu mejor marca en <span className="text-slate-300 font-bold">{selEx.name}</span>: {selPR.bestReps}×{selPR.bestKg}kg</p>
          ) : (
            <p className="text-[11px] text-slate-600">Todavía no hay marcas registradas en este ejercicio.</p>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setMode(null)} className="px-3 py-2.5 rounded-xl bg-slate-800 text-slate-400 text-xs font-semibold">Atrás</button>
            <button onClick={() => setShowImage(true)} disabled={!selPR?.best1rm} className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-[0.98] ${selPR?.best1rm ? "text-white shadow-lg shadow-teal-500/20" : "bg-slate-800 text-slate-600"}`} style={selPR?.best1rm ? { background: "linear-gradient(135deg,#14B8A6,#0E7490)" } : {}}>Generar imagen</button>
          </div>
        </div>
      )}

      {mode === "period" && (
        <div className="space-y-2.5">
          <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">
            {SHARE_SUMMARY_PERIODS.map((opt) => (
              <button key={opt.k} onClick={() => setPeriod(opt.k)} className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all ${period === opt.k ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">{periodStats.daysTrained} día{periodStats.daysTrained === 1 ? "" : "s"} entrenado{periodStats.daysTrained === 1 ? "" : "s"} · {periodStats.totalVol.toLocaleString("es-AR")} kg×reps en este período.</p>
          <div className="flex gap-2">
            <button onClick={() => setMode(null)} className="px-3 py-2.5 rounded-xl bg-slate-800 text-slate-400 text-xs font-semibold">Atrás</button>
            <button onClick={() => setShowImage(true)} disabled={!periodStats.daysTrained} className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-[0.98] ${periodStats.daysTrained ? "text-white shadow-lg shadow-teal-500/20" : "bg-slate-800 text-slate-600"}`} style={periodStats.daysTrained ? { background: "linear-gradient(135deg,#14B8A6,#0E7490)" } : {}}>Generar imagen</button>
          </div>
        </div>
      )}

      {showImage && mode === "pr" && selEx && (
        <ShareImageModal
          title="Compartí tu marca"
          fileNamePrefix={`pr-${selEx.id}`}
          shareTitle="Mi Rutina — Marca"
          shareText={`Mi marca en ${selEx.name} 🔥`}
          draw={(ctx, W, H) => drawPRShareCard(ctx, W, H, { exerciseName: selEx.name, muscle: selEx.muscle, kg: selPR.bestKg, reps: selPR.bestReps, accent: selEx.color })}
          onClose={() => setShowImage(false)}
        />
      )}
      {showImage && mode === "period" && (
        <ShareImageModal
          title="Compartí tu resumen"
          fileNamePrefix={`resumen-${period}`}
          shareTitle="Mi Rutina — Resumen"
          shareText="Mi resumen de entrenamiento 💪"
          draw={(ctx, W, H) => drawPeriodShareCard(ctx, W, H, { periodLabel, daysTrained: periodStats.daysTrained, totalSets: periodStats.totalSets, totalVol: periodStats.totalVol, calendarCells, accent: "#3B82F6" })}
          onClose={() => setShowImage(false)}
        />
      )}
    </div>
  );
}

function SessionHistoryView({ logs, onDeleteDay }) {
  const sessions = useMemo(() => buildSessionsIndex(logs), [logs]);
  const sessionByDate = useMemo(() => { const m = {}; sessions.forEach((s) => { m[s.date] = s; }); return m; }, [sessions]);
  const [view, setView] = useState("calendar");
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selectedDate, setSelectedDate] = useState(null);
  const weeks = useMemo(() => getMonthMatrix(cursor.y, cursor.m), [cursor]);
  const selectedSession = selectedDate ? sessionByDate[selectedDate] : null;
  const handleDeleteDay = (date) => { onDeleteDay?.(date); if (selectedDate === date) setSelectedDate(null); };
  // Qué días de tu rutina aparecen en el mes que estás mirando — para la
  // leyenda de abajo del calendario, así el color de cada celda no queda
  // sin explicación.
  const monthDayKeys = useMemo(() => {
    const seen = new Set();
    weeks.flat().forEach((d) => { if (d && sessionByDate[d]) sessionByDate[d].dayKeys.forEach((dk) => seen.add(dk)); });
    return Array.from(seen).filter((dk) => ROUTINE[dk]);
  }, [weeks, sessionByDate]);

  if (!sessions.length) {
    return (
      <div className="text-center py-14 text-slate-600">
        <Calendar size={28} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">Todavía no registraste ninguna sesión.</p>
        <p className="text-xs mt-1 text-slate-700">Guardá series en la rutina y van a aparecer acá.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60 w-fit">
          {[{ k: "calendar", icon: <LayoutGrid size={13} />, l: "Calendario" }, { k: "list", icon: <List size={13} />, l: "Lista" }].map((opt) => (
            <button key={opt.k} onClick={() => setView(opt.k)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold transition-all ${view === opt.k ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.icon}{opt.l}</button>
          ))}
        </div>
      </div>
      <ShareSummaryCard logs={logs} />

      {view === "calendar" ? (
        <div key="calendar" className="space-y-3 tab-fade-in">
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setCursor((c) => { const m = c.m === 0 ? 11 : c.m - 1; const y = c.m === 0 ? c.y - 1 : c.y; return { y, m }; })} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"><ChevronLeft size={16} /></button>
              <p className="text-sm font-bold text-white">{MONTH_LABELS[cursor.m]} {cursor.y}</p>
              <button onClick={() => setCursor((c) => { const m = c.m === 11 ? 0 : c.m + 1; const y = c.m === 11 ? c.y + 1 : c.y; return { y, m }; })} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"><ChevronRight size={16} /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1.5">{WEEKDAY_LABELS.map((l, i) => <div key={i} className="text-center text-[9px] font-bold text-slate-600">{l}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">
              {weeks.flat().map((d, i) => {
                if (!d) return <div key={i} />;
                const s = sessionByDate[d];
                const isToday = d === todayStr();
                const isSelected = d === selectedDate;
                const dayNum = parseInt(d.slice(8, 10), 10);
                // El color del día entrenado ahora se ve en el FONDO de la
                // celda (no sólo en puntitos chicos abajo) — así el
                // calendario de un vistazo te dice qué entrenaste, no sólo
                // que entrenaste algo. Con más de un día en la misma fecha,
                // se arma un degradé entre los colores en vez de un sólo
                // tono — y siguen los puntitos abajo para distinguir cada
                // uno por separado.
                const mainColor = s ? ROUTINE[s.dayKeys[0]]?.color : null;
                const bgStyle = s
                  ? (s.dayKeys.length > 1
                    ? { background: `linear-gradient(135deg, ${mainColor}38, ${ROUTINE[s.dayKeys[1]]?.color || mainColor}38)`, border: `1px solid ${mainColor}55` }
                    : { backgroundColor: mainColor + "30", border: `1px solid ${mainColor}55` })
                  : {};
                return (
                  <button key={i} onClick={() => s && setSelectedDate(isSelected ? null : d)} disabled={!s} style={bgStyle}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-all ${isSelected ? "ring-2 ring-teal-400" : ""} ${isToday && !s ? "border border-teal-500/50" : ""} ${s ? "text-white hover:brightness-125 active:scale-95" : "text-slate-700"}`}>
                    {dayNum}
                    {s && <div className="flex gap-0.5">{s.dayKeys.slice(0, 3).map((dk) => <span key={dk} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ROUTINE[dk].color }} />)}</div>}
                  </button>
                );
              })}
            </div>
            {monthDayKeys.length > 0 && (
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-800/50 flex-wrap">
                {monthDayKeys.map((dk) => (
                  <span key={dk} className="flex items-center gap-1 text-[9px] text-slate-500"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ROUTINE[dk].color }} /> {ROUTINE[dk].label}</span>
                ))}
              </div>
            )}
          </div>
          {selectedSession ? <SessionDetailCard session={selectedSession} onDelete={handleDeleteDay} /> : <p className="text-center text-[11px] text-slate-600 py-2">Tocá un día con marca para ver el detalle.</p>}
        </div>
      ) : (
        <div key="list" className="space-y-2.5 tab-fade-in">
          {sessions.map((s) => <SessionDetailCard key={s.date} session={s} onDelete={handleDeleteDay} />)}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   DELOAD VIEW (unchanged from prior redesign)
============================================================================ */
function DeloadView({ logs, settings = DEFAULT_SETTINGS, deloadProgress = {}, setDeloadProgress, onFinishDeloadSession }) {
  const { trainWeeks, deloadWeeks, deloadPct, deloadSetDivisor } = settings;
  const pctLabel = Math.round(deloadPct * 100);
  const [activeDay, setActiveDay] = useState(DAY_ORDER[0]);
  const day = ROUTINE[activeDay];
  const today = todayStr();
  // Marcar una serie como hecha hoy (o desmarcarla si ya estaba marcada) —
  // se guarda con la fecha de hoy, no como simple true/false, para que la
  // próxima semana de descarga (siete y pico semanas después) empiece
  // sin nada tildado, sin necesidad de un botón de "reiniciar" aparte.
  const toggleDeloadDone = (key) => {
    if (!setDeloadProgress) return;
    const next = { ...deloadProgress };
    if (next[key] === today) delete next[key];
    else next[key] = today;
    setDeloadProgress(next);
  };
  // Antes, entrenar desde la pestaña Descarga no quedaba registrado en
  // ningún lado — no contaba como "día entrenado", no sumaba a la racha,
  // no aparecía en el calendario de Historial. "Finalizar sesión de
  // descarga" crea el mismo tipo de registro que el botón equivalente de
  // la rutina normal (ver handleEndSession en App()), y de paso limpia
  // los tildes de hoy de TODOS los días (no sólo el que tenías
  // seleccionado) — "finalizar" significa "ya entrené hoy", sin importar
  // si tocaste más de un día en la misma sesión.
  const hasAnyDoneToday = Object.values(deloadProgress).some((d) => d === today);
  const handleFinishSession = () => {
    if (setDeloadProgress) {
      const next = { ...deloadProgress };
      Object.keys(next).forEach((k) => { if (next[k] === today) delete next[k]; });
      setDeloadProgress(next);
    }
    onFinishDeloadSession?.(activeDay);
  };

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-purple-500/20 p-5" style={{ background: "var(--grad-hero-purple)" }}>
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-purple-500/15 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-4 -left-4 w-24 h-24 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Zap size={16} className="text-purple-400" />
                <span className="text-[11px] font-black uppercase tracking-widest text-purple-400">Semana de descarga</span>
              </div>
              <h2 className="text-xl font-black text-white leading-tight">Recuperación activa</h2>
              <p className="text-xs text-purple-300/60 mt-1">Menos carga · Menos series · Mismas reps</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shrink-0">
              <span className="text-2xl font-black text-purple-300">{pctLabel}<span className="text-sm">%</span></span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[{ label: "Ciclo", val: `${trainWeeks}+${deloadWeeks}sem` }, { label: "Carga", val: `${pctLabel}%` }, { label: "Series", val: `÷${deloadSetDivisor}` }].map(({ label, val }) => (
              <div key={label} className="bg-purple-500/10 border border-purple-500/15 rounded-xl px-3 py-2 text-center">
                <p className="text-sm font-black text-purple-200">{val}</p>
                <p className="text-[10px] text-purple-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {DAY_ORDER.map((dk) => {
          const d = ROUTINE[dk], isActive = activeDay === dk;
          const withPR = d.exercises.filter((ex) => ex.sets.some((s, i) => logs[`${ex.id}_${i}_pr_override`] || (logs[`${ex.id}_${i}`] || []).length > 0)).length;
          return (
            <button key={dk} onClick={() => setActiveDay(dk)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-95 border shrink-0"
              style={isActive ? { backgroundColor: d.color + "22", borderColor: d.color + "55", color: d.color } : { borderColor: "var(--chip-border)", color: "var(--chip-text)" }}>
              <span className="uppercase">{d.label}</span>
              {withPR > 0 && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={isActive ? { backgroundColor: d.color + "30", color: d.color } : { backgroundColor: "var(--surface-2)", color: "var(--surface-2-text)" }}>{withPR}/{d.exercises.length}</span>}
            </button>
          );
        })}
      </div>

      <div key={activeDay} className="space-y-3 tab-fade-in">
        {day.exercises.map((ex) => {
          const deloadSets = Math.max(1, Math.ceil(ex.sets.length / deloadSetDivisor));
          const bestPerSet = ex.sets.map((s, i) => { const h = logs[`${ex.id}_${i}`] || []; let best = s.pr ? { ...s.pr } : null; const ov = logs[`${ex.id}_${i}_pr_override`]; if (ov) best = ov; else h.forEach((e) => { if (!best || vol(e.kg, e.reps) > vol(best.kg, best.reps)) best = e; }); return best; });
          const hasPR = bestPerSet.some(Boolean);
          const hasHeavy = ex.sets.slice(0, deloadSets).some((s) => isHeavyRepRange(s.repRange));
          return (
            <div key={ex.id} className="bg-slate-900/50 border border-slate-800/50 rounded-2xl overflow-hidden backdrop-blur-sm">
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800/40">
                <div className="w-1.5 h-6 rounded-full shrink-0" style={{ backgroundColor: day.color, boxShadow: `0 0 8px -2px ${day.color}` }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-sm">{ex.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-lg font-bold" style={{ backgroundColor: day.color + "18", color: day.color }}>{ex.muscle}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">{ex.sets.length} → <span className="text-purple-400 font-bold">{deloadSets} series</span> en descarga</p>
                </div>
              </div>
              {hasPR && (
                <div className="px-4 pt-3">
                  <RestTimer seconds={hasHeavy ? settings.restLong : settings.restShort} accent="#A855F7" alertType={settings.alertType} />
                </div>
              )}
              <div className="px-4 py-3 space-y-2">
                {hasPR ? (
                  ex.sets.slice(0, deloadSets).map((s, i) => {
                    const best = bestPerSet[i], deloadKg = best ? Math.round(best.kg * deloadPct * 2) / 2 : null;
                    const progressKey = `${ex.id}_${i}`;
                    const done = deloadProgress[progressKey] === today;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <button onClick={() => toggleDeloadDone(progressKey)} aria-label={done ? "Marcar como no hecha" : "Marcar serie como hecha"} className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all active:scale-90 border ${done ? "bg-purple-500 border-purple-500" : "border-slate-700 hover:border-slate-500"}`}>
                          {done && <Check size={13} className="text-white" />}
                        </button>
                        <span className="text-[10px] font-black text-slate-600 w-5 shrink-0">S{i + 1}</span>
                        <span className="text-[10px] text-slate-600 bg-slate-800/60 rounded-lg px-2 py-1 shrink-0">{s.repRange} reps</span>
                        {best ? (
                          <div className="flex items-center gap-2 flex-1 justify-end">
                            <span className="text-[11px] text-slate-600 line-through">{best.reps}×{best.kg}kg</span>
                            <div className="flex items-center gap-1">
                              <ArrowDown size={10} style={{ color: done ? day.color : "#C084FC" }} />
                              <span className="text-sm font-black" style={{ color: done ? day.color : "#D8B4FE" }}>{best.reps}×{deloadKg}kg</span>
                            </div>
                          </div>
                        ) : <span className="text-[11px] text-slate-700 flex-1 text-right">Sin marca</span>}
                      </div>
                    );
                  })
                ) : (
                  <div className="flex items-center gap-2 py-1">
                    <div className="w-5 h-5 rounded-lg bg-slate-800/80 flex items-center justify-center shrink-0"><Target size={11} className="text-slate-600" /></div>
                    <p className="text-[11px] text-slate-600">Registrá marcas en la rutina para ver la descarga calculada.</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-3 bg-slate-900/40 border border-slate-800/40 rounded-2xl px-4 py-3.5">
        <Info size={14} className="text-slate-600 mt-0.5 shrink-0" />
        <p className="text-[11px] text-slate-500 leading-relaxed">La descarga reduce el estrés acumulado sin perder las adaptaciones. Mantené la técnica y el ritmo, pero no busques marcas nuevas esta semana.</p>
      </div>

      {hasAnyDoneToday && (
        <div>
          <button onClick={handleFinishSession} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white text-sm font-bold transition-all active:scale-[0.98] shadow-lg" style={{ backgroundColor: "#A855F7", boxShadow: "0 10px 24px -8px #A855F788" }}>
            <Check size={15} /> Finalizar sesión de descarga
          </button>
          <p className="text-center text-[10px] text-slate-600 mt-2">Se registra como entrenamiento de hoy (suma a tu racha y calendario) y se desmarcan las series tildadas, para la próxima vez.</p>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   PROGRESS VIEW
============================================================================ */
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f0f1a] border border-slate-700/60 rounded-xl px-3 py-2.5 text-xs shadow-xl shadow-black/40">
      <p className="text-slate-400 mb-1.5 font-medium">{label}</p>
      {payload.map((p) => <p key={p.name} style={{ color: p.color }} className="font-bold">{p.name}: {p.value}</p>)}
    </div>
  );
};

/* ============================================================================
   EXERCISE CHIP ROW — selector de ejercicio con el mismo lenguaje visual que
   los chips de día/serie del resto de la app: una fila horizontal con
   scroll (deslizás con el dedo, sin flechitas), chip lleno con el color del
   día cuando está activo, chip neutro cuando no.
============================================================================ */
function ExerciseChipRow({ exercises, selId, onSelect, activeColor }) {
  if (!exercises.length) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
      {exercises.map((e) => {
        const active = e.id === selId;
        const color = activeColor || e.color;
        return (
          <button key={e.id} onClick={() => onSelect(e.id)} className="px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-95 border shrink-0"
            style={active ? { background: color, borderColor: color, color: "#fff" } : { borderColor: "var(--chip-border)", color: "var(--chip-text)" }}>
            {e.name}
          </button>
        );
      })}
    </div>
  );
}

// Antes era una fila con scroll horizontal (icono + texto, "Evolución" /
// "Rango" / "Músculo" / "Historial") que en pantallas angostas no entraba
// completa y había que deslizar para ver "Historial". Ahora es una grilla
// fija de 4 columnas (ícono arriba, etiqueta abajo, como en la barra de
// navegación inferior) — siempre entran los 4 sin deslizar.
const PROGRESS_SECTIONS = [
  { k: "rank", l: "Rango", icon: <Award size={15} />, color: "#3B82F6" },
  { k: "historial", l: "Historial", icon: <Calendar size={15} />, color: "#06B6D4" },
  { k: "chart", l: "Ejercicios", icon: <Activity size={15} />, color: "#F59E0B" },
  { k: "medidas", l: "Medidas", icon: <Ruler size={15} />, color: "#A855F7" },
];

/* ============================================================================
   RANGO POR MÚSCULO — el "muñeco" de las apps de rutinas: una figura de
   frente y de espalda donde cada grupo muscular se pinta según el rango
   que alcanzaste ahí, calculado a partir del mayor peso (kg) que alguna
   vez levantaste en cualquier ejercicio de ese grupo. Reemplaza a la vieja
   pestaña "Top PRs" (la vieja lista de 1RM estimado).

   18 niveles en total: Bronce/Plata/Oro/Esmeralda/Diamante/Maestro (cada
   uno con I, II y III). Platino se sacó de la lista de rangos — al
   sacarlo, toda la progresión se recalculó de nuevo (no se borraron 3
   niveles nomás y se dejó el resto pegado). Los colores son todos
   distintos a propósito.
============================================================================ */
// 18 niveles en total: los 6 rangos (Bronce, Plata, Oro, Esmeralda,
// Diamante y Maestro) con sus tres sub-niveles I/II/III cada uno — Maestro
// III queda como el tope abierto, "180+kg" en el ejemplo de banca.
// Colores todos distintos, con una rampa propia para cada rango.
const RANK_TIERS = [
  { tier: "Bronce", sub: "I", color: "#8B5A2B" },
  { tier: "Bronce", sub: "II", color: "#A8692F" },
  { tier: "Bronce", sub: "III", color: "#CD7F32" },
  { tier: "Plata", sub: "I", color: "#94A3B8" },
  { tier: "Plata", sub: "II", color: "#B8C2CC" },
  { tier: "Plata", sub: "III", color: "#DCE3E8" },
  { tier: "Oro", sub: "I", color: "#C99A2E" },
  { tier: "Oro", sub: "II", color: "#E0B632" },
  { tier: "Oro", sub: "III", color: "#FFD23F" },
  { tier: "Esmeralda", sub: "I", color: "#1E8449" },
  { tier: "Esmeralda", sub: "II", color: "#2FB866" },
  { tier: "Esmeralda", sub: "III", color: "#4CD787" },
  { tier: "Diamante", sub: "I", color: "#2E7BD6" },
  { tier: "Diamante", sub: "II", color: "#56A6F0" },
  { tier: "Diamante", sub: "III", color: "#8FCBFB" },
  { tier: "Maestro", sub: "I", color: "#B91C1C" },
  { tier: "Maestro", sub: "II", color: "#DC2626" },
  { tier: "Maestro", sub: "III", color: "#FF3B3B" },
];

/* ============================================================================
   TABLAS DE RANGO — basadas en las tablas de estándares de fuerza que me
   pasaste (press banca, sentadilla, peso muerto, press militar), con los
   otros 11 grupos del catálogo estimados por relación proporcional contra
   el ancla más cercana anatómicamente (la misma idea que ya venía usando,
   ahora anclada a tus números concretos en vez de a una curva propia).

   Dos sistemas, tal como los definiste:
   - "General Absoluto": kg fijos, para compararte contra un estándar
     global sin importar tu cuerpo.
   - "Según tu contexto": multiplicador × tu peso corporal, ajustado por
     sexo y edad — más justo, pero necesita que cargues tus datos.
============================================================================ */

// Las 4 tablas "ancla" — empezaron como tus 21 niveles exactos, pero al
// sacar Platino quedaron en 18: en vez de simplemente borrar esos 3 y
// dejar pegados los de Esmeralda en su lugar, se "re-muestreó" la curva
// completa (los 21 puntos originales) en 18 puntos nuevos, bien
// repartidos a lo largo de toda la progresión — el primer y el último
// nivel quedan iguales que antes, todo el resto se redistribuye.
// Hombros no tenía tabla de multiplicador contextual en tu lista — se
// derivó calculando, nivel por nivel, qué fracción es el press militar
// del press de banca en la tabla general (ronda 0.6-0.7), y aplicando esa
// misma fracción al multiplicador de banca en cada nivel.
const ANCHOR_GENERAL_KG = {
  pectoral_medio: [20, 32, 42, 48, 54, 59, 67, 77, 85, 96, 108, 117, 126, 134, 145, 156, 168, 180],
  cuadriceps: [30, 42, 52, 61, 70, 79, 91, 102, 114, 127, 140, 151, 166, 181, 196, 210, 225, 240],
  dorsales: [40, 52, 64, 75, 87, 99, 113, 128, 142, 157, 172, 186, 201, 216, 232, 250, 267, 285],
  deltoide_anterior: [15, 21, 26, 30, 36, 41, 47, 53, 59, 65, 71, 77, 83, 88, 94, 100, 106, 115],
};
const ANCHOR_CONTEXTUAL_MULT = {
  pectoral_medio: [0.35, 0.47, 0.57, 0.66, 0.75, 0.84, 0.92, 1.02, 1.10, 1.19, 1.28, 1.37, 1.46, 1.54, 1.65, 1.76, 1.88, 2.00],
  cuadriceps: [0.45, 0.57, 0.69, 0.80, 0.92, 1.04, 1.16, 1.27, 1.39, 1.51, 1.63, 1.74, 1.86, 1.99, 2.13, 2.28, 2.43, 2.60],
  dorsales: [0.55, 0.69, 0.84, 0.99, 1.13, 1.28, 1.43, 1.58, 1.72, 1.87, 2.02, 2.16, 2.31, 2.46, 2.62, 2.80, 2.97, 3.15],
  deltoide_anterior: [0.26, 0.31, 0.35, 0.41, 0.50, 0.58, 0.65, 0.70, 0.76, 0.81, 0.84, 0.90, 0.96, 1.01, 1.07, 1.13, 1.19, 1.28],
};

// Grupos sin tabla propia: a qué ancla se parecen más y en qué proporción
// (estimado a partir de cuánto suele mover cada músculo comparado con su
// ancla, por ejemplo el deltoide lateral en vuelos laterales mueve mucho
// menos peso que el press militar del deltoide anterior).
const ESTIMATED_GROUP_RATIO = {
  pectoral_superior: { anchor: "pectoral_medio", ratio: 0.857 },
  trapecio: { anchor: "dorsales", ratio: 0.80 },
  deltoide_lateral: { anchor: "deltoide_anterior", ratio: 0.385 },
  deltoide_posterior: { anchor: "deltoide_anterior", ratio: 0.423 },
  biceps: { anchor: "deltoide_anterior", ratio: 0.538 },
  triceps: { anchor: "pectoral_medio", ratio: 0.22 },
  antebrazos: { anchor: "deltoide_anterior", ratio: 0.308 },
  femoral: { anchor: "cuadriceps", ratio: 0.769 },
  gluteo: { anchor: "dorsales", ratio: 0.933 },
  aductores: { anchor: "cuadriceps", ratio: 0.35 },
  core: { anchor: "pectoral_medio", ratio: 0.262 },
  espalda_baja: { anchor: "dorsales", ratio: 0.20 },
  pantorrillas: { anchor: "cuadriceps", ratio: 0.846 },
};

function buildFullRankTable(anchorTables) {
  const out = { ...anchorTables };
  Object.entries(ESTIMATED_GROUP_RATIO).forEach(([group, { anchor, ratio }]) => {
    out[group] = anchorTables[anchor].map((v) => v * ratio);
  });
  return out;
}
const MUSCLE_RANK_GENERAL_KG_TABLE = buildFullRankTable(ANCHOR_GENERAL_KG);
const MUSCLE_RANK_CONTEXTUAL_MULT_TABLE = buildFullRankTable(ANCHOR_CONTEXTUAL_MULT);

// Ajustes de "Según tu contexto" — exactamente como me los pasaste:
// por sexo, 0.65 en ejercicios de tren superior (banca/hombro) y 0.75 en
// tren inferior (sentadilla/peso muerto); por edad, una curva que sube
// hasta el pico de fuerza (18-39) y baja gradualmente después.
const LOWER_BODY_RANK_GROUPS = new Set(["cuadriceps", "femoral", "gluteo", "pantorrillas", "aductores"]);
function getSexFactor(muscleKey, sex) {
  if (sex !== "F") return 1;
  return LOWER_BODY_RANK_GROUPS.has(muscleKey) ? 0.75 : 0.65;
}
function getAgeFactor(age) {
  if (!age || age <= 0) return 1;
  if (age < 14) return 0.70;
  if (age <= 17) return 0.85;
  if (age <= 39) return 1.0;
  if (age <= 49) return 0.90;
  if (age <= 59) return 0.80;
  return 0.70;
}

// Los 21 umbrales en kg para un grupo muscular puntual — "general" usa la
// tabla fija tal cual; "relativo" (Según tu contexto) multiplica tu peso
// corporal por el multiplicador de cada nivel, y recién ahí aplica los
// ajustes de sexo y edad (el estándar "general" queda fijo a propósito,
// es la vara global, no se adapta a la persona).
function getMuscleRankThresholdsKg(muscleKey, mode, bodyWeightKg, sex, age) {
  if (mode === "relative" && bodyWeightKg > 0) {
    const mults = MUSCLE_RANK_CONTEXTUAL_MULT_TABLE[muscleKey] || MUSCLE_RANK_CONTEXTUAL_MULT_TABLE.pectoral_medio;
    const factor = bodyWeightKg * getSexFactor(muscleKey, sex) * getAgeFactor(age);
    return mults.map((m) => m * factor);
  }
  return MUSCLE_RANK_GENERAL_KG_TABLE[muscleKey] || MUSCLE_RANK_GENERAL_KG_TABLE.pectoral_medio;
}

function getMuscleRank(muscleKey, best1RM, mode = "general", bodyWeightKg = 0, sex = null, age = null) {
  const thresholds = getMuscleRankThresholdsKg(muscleKey, mode, bodyWeightKg, sex, age);
  if (!best1RM || best1RM <= 0) {
    return { tier: "Bronce", sub: "I", color: "#475569", levelIdx: -1, threshold: 0, nextThreshold: thresholds[0], hasData: false };
  }
  let levelIdx = -1;
  for (let i = 0; i < thresholds.length; i++) { if (best1RM >= thresholds[i]) levelIdx = i; }
  if (levelIdx === -1) {
    return { tier: "Bronce", sub: "I", color: "#475569", levelIdx: -1, threshold: 0, nextThreshold: thresholds[0], hasData: true };
  }
  const info = RANK_TIERS[levelIdx];
  const threshold = thresholds[levelIdx];
  const nextThreshold = levelIdx < thresholds.length - 1 ? thresholds[levelIdx + 1] : null;
  return { ...info, levelIdx, threshold, nextThreshold, hasData: true };
}

// Mejor 1RM ESTIMADO (fórmula de Epley, igual que en Progreso) para un
// grupo muscular. Prioridad en tres niveles (ver el comentario de
// EXERCISE_LIBRARY_CONTRIBUTORS_BY_GROUP más arriba):
//   1) Si hay marcas en ejercicios PRINCIPALES o "siempre cuenta" (los dos
//      compiten juntos por el número más alto — para tríceps, esto es lo
//      que permite que un press compuesto valga incluso habiendo marcas
//      de polea), se usa ese resultado. Si quien gana fue un "siempre
//      cuenta", el nombre del ejercicio mostrado igual prioriza el
//      principal (si hay), para no mostrar por ejemplo "Press Banca"
//      como "tu mejor marca" de Tríceps.
//   2) Sólo si NO hay nada en ninguno de los dos niveles anteriores, cae
//      a los ejercicios SECUNDARIOS comunes como estimación de último
//      recurso (por ejemplo, alguien que sólo hizo remos pero nunca un
//      encogimiento dedicado, para tener al menos una idea de su trapecio).
// No es el peso más pesado a secas, porque eso hacía que levantar poco
// peso a una sola repetición pareciera "más fuerte" que levantar casi lo
// mismo varias veces. `rankExcluded` (fondos, dominadas, flexiones,
// planchas...) nunca entra, en ningún nivel. `loadFactor` (dos
// mancuernas) multiplica el kg logueado antes de calcular el 1RM, para
// que sea comparable contra estándares de barra (peso total).
function scanContributorsFor1RM(contributors, logs, overriddenBaseKeys) {
  let best1RM = 0, bestKg = 0, bestReps = 0, bestExerciseId = null, bestLoadFactor = 1, bestWeight = 1;
  Object.entries(logs).forEach(([key, val]) => {
    const isOverride = key.endsWith("_pr_override");
    const baseKey = isOverride ? key.replace(/_pr_override$/, "") : key;
    if (!isOverride && overriddenBaseKeys.has(baseKey)) return;
    const { exerciseId } = parseLogKey(baseKey);
    if (!contributors.has(exerciseId)) return;
    const weight = contributors.get(exerciseId);
    const lf = EXERCISE_LIBRARY_BY_ID[exerciseId]?.loadFactor || 1;
    const entries = isOverride ? [val] : (Array.isArray(val) ? val : []);
    entries.forEach((e) => {
      if (!e || !e.kg || !e.reps) return;
      const rm = estimate1RM(e.kg * lf, e.reps) * weight;
      if (rm > best1RM) { best1RM = rm; bestKg = e.kg; bestReps = e.reps; bestExerciseId = exerciseId; bestLoadFactor = lf; bestWeight = weight; }
    });
  });
  return { best1RM, bestKg, bestReps, bestExerciseId, bestLoadFactor, bestWeight };
}

function getBest1RMForMuscleGroup(groupKey, logs) {
  const { primary, always, secondary } = EXERCISE_LIBRARY_CONTRIBUTORS_BY_GROUP[groupKey] || { primary: new Map(), always: new Map(), secondary: new Map() };
  const overriddenBaseKeys = new Set();
  Object.keys(logs).forEach((k) => { if (k.endsWith("_pr_override")) overriddenBaseKeys.add(k.replace(/_pr_override$/, "")); });

  const primaryResult = scanContributorsFor1RM(primary, logs, overriddenBaseKeys);
  const alwaysResult = scanContributorsFor1RM(always, logs, overriddenBaseKeys);
  let best = primaryResult.best1RM >= alwaysResult.best1RM ? primaryResult : alwaysResult;
  if (best === alwaysResult && alwaysResult.best1RM > 0) {
    // Ganó un "siempre cuenta" (ej. press banca para tríceps) — nunca se
    // muestra ese ejercicio como la fuente. Si hay marca propia en un
    // ejercicio dedicado (aunque sea menor), se muestra ESA marca real
    // (su propio kg×reps, no mezclado con el del que ganó el número). Si
    // no hay ninguna marca dedicada todavía, no se nombra ningún
    // ejercicio en particular.
    best = primaryResult.bestExerciseId
      ? { ...alwaysResult, bestKg: primaryResult.bestKg, bestReps: primaryResult.bestReps, bestExerciseId: primaryResult.bestExerciseId }
      : { ...alwaysResult, bestKg: null, bestReps: null, bestExerciseId: null };
  }
  if (best.best1RM <= 0) best = scanContributorsFor1RM(secondary, logs, overriddenBaseKeys);

  return {
    best1RM: best.best1RM, bestKg: best.bestKg, bestReps: best.bestReps, bestLoadFactor: best.bestLoadFactor, bestWeight: best.bestWeight,
    bestExerciseName: best.bestExerciseId ? (EXERCISE_LIBRARY_BY_ID[best.bestExerciseId]?.name || best.bestExerciseId) : null,
  };
}

// Insignias con las imágenes reales en /insignias/{tier}.png (bronce,
// plata, oro, esmeralda, diamante, maestro). El número romano (I/II/III)
// va en un chip circular chico en la esquina inferior derecha — antes era
// una franja que cruzaba toda la base y tapaba buena parte del dibujo de
// la medalla, así queda bien visible sin cubrirla. Ajustes pedidos:
//  - Brillo bajado a algo mínimo y sin tinte de color (antes el
//    drop-shadow tomaba el color del rango y quedaba muy intenso).
//  - Colores más tenues: un filtro CSS de saturación/brillo reducidos,
//    sin tocar los archivos (no tenemos acceso a esos PNG para editarlos).
//  - Plata y Esmeralda venían con otra proporción (más angostas)
//    que el resto — como no se puede editar el archivo en sí, se las
//    estira para que ocupen el mismo ancho que las demás (con
//    object-fit: fill en vez de cover, sólo para esas dos).
const BADGE_STRETCH_TIERS = new Set(["plata", "esmeralda"]);
function RankBadgeIcon({ tier, sub, color, size = 26 }) {
  const [imgError, setImgError] = useState(false);
  const tierFile = (tier || "bronce").toLowerCase();
  return (
    <div className="shrink-0" style={{ position: "relative", width: size, height: size, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" }}>
      <div style={{ width: "100%", height: "100%", overflow: "hidden", borderRadius: "20%" }}>
        {!imgError ? (
          <img
            src={`/insignias/${tierFile}.png`}
            alt={`${tier || ""}${sub ? ` ${sub}` : ""}`.trim()}
            onError={() => setImgError(true)}
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: BADGE_STRETCH_TIERS.has(tierFile) ? "fill" : "cover", filter: "saturate(0.7) brightness(0.92)" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", borderRadius: "50%", backgroundColor: color, filter: "saturate(0.7)" }} />
        )}
      </div>
      {sub && (
        <span
          style={{
            position: "absolute", bottom: -Math.max(2, size * 0.03), right: -Math.max(2, size * 0.03),
            width: Math.max(16, Math.round(size * 0.36)), height: Math.max(16, Math.round(size * 0.36)),
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: Math.max(8, Math.round(size * 0.19)), fontWeight: 800, color: "#ffffff",
            background: "linear-gradient(135deg, #14B8A6, #0E7490)", borderRadius: "50%",
            border: `${Math.max(1.5, Math.round(size * 0.02))}px solid #0a0a0f`,
            boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
          }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// MUÑECO CON react-body-highlighter — reemplaza al dibujo a mano (rectángulos
// y óvalos) por un modelo anatómico real de la librería. La librería sólo
// entiende un set fijo de músculos (no separa pectoral superior/medio ni
// tiene una cabeza "lateral" de deltoides separada) — para esos casos se
// combinan nuestros grupos tomando el MEJOR rango entre los que comparten
// el mismo músculo de la librería, así no se pierde el dato, sólo la
// posibilidad de pintarlo por separado en el dibujo. El detalle de abajo
// (al tocar un músculo) sigue mostrando cada uno de nuestros grupos por
// separado, con su propio rango.
//
// Cómo pinta los colores la librería (revisado en su código fuente): cada
// "ejercicio" en `data` suma +1 (o `frequency`) a cada músculo que toca, y
// el color final es `highlightedColors[frecuencia - 1]`. Por eso `RANK_TIERS`
// se pasa tal cual como `highlightedColors` (19 colores, uno por nivel) y a
// cada músculo le mandamos UN solo "ejercicio" con frequency = levelIdx + 1
// — así el índice cae siempre en el color exacto del rango, sin tener que
// tocar nada de la librería.
const BODY_HIGHLIGHTER_SLUG_MAP = {
  pectoral_superior: "chest", pectoral_medio: "chest",
  trapecio: "trapezius", dorsales: "upper-back", espalda_baja: "lower-back",
  deltoide_anterior: "front-deltoids", deltoide_lateral: "front-deltoids", deltoide_posterior: "back-deltoids",
  biceps: "biceps", triceps: "triceps", antebrazos: "forearm",
  cuadriceps: "quadriceps", femoral: "hamstring", gluteo: "gluteal", aductores: "adductor",
  core: "abs", pantorrillas: "calves",
};
function getOurGroupKeysForSlug(slug) {
  return Object.entries(BODY_HIGHLIGHTER_SLUG_MAP).filter(([, s]) => s === slug).map(([k]) => k);
}
// El sóleo es parte de la pantorrilla, pero en la librería es un slug
// aparte (left-soleus/right-soleus) — así que cuenta como "pantorrillas"
// también, para que la gemela se pinte completa y no a medias.
function getSlugsForOurGroup(ourKey) {
  const slug = BODY_HIGHLIGHTER_SLUG_MAP[ourKey];
  if (!slug) return [];
  if (slug === "calves") return ["calves", "left-soleus", "right-soleus"];
  return [slug];
}

// Referencias ESTABLES (un solo objeto/función, nunca se vuelven a crear)
// para pasarle a <Model> — esto es lo que en realidad causaba el bug de
// "la pantorrilla de frente se sigue marcando": al pasarle `onClick={() =>
// {}}` y `style={{...}}` como literales, React creaba un objeto/función
// NUEVO en cada render, así que el React.memo interno de la librería
// nunca detectaba "no cambió nada" y volvía a pintar todo desde cero cada
// vez que el padre se renderizaba por CUALQUIER motivo (no sólo cuando
// `data` cambiaba) — pisando la corrección de la pantorrilla, que sólo se
// volvía a aplicar cuando `data` cambiaba. Con referencias estables, el
// <Model> sólo se vuelve a pintar cuando algo realmente cambió.
const MODEL_NOOP_CLICK = () => {};
const MODEL_STYLE = { width: "100%" };

function MuscleHighlighterBody({ ranks, selected, onMuscleClick, frontRef, backRef }) {
  const highlightedColors = useMemo(() => RANK_TIERS.map((t) => t.color), []);
  const data = useMemo(() => {
    const bestLevelBySlug = {};
    Object.entries(BODY_HIGHLIGHTER_SLUG_MAP).forEach(([ourKey, slug]) => {
      const lvl = ranks[ourKey]?.levelIdx ?? -1;
      if (lvl > (bestLevelBySlug[slug] ?? -1)) bestLevelBySlug[slug] = lvl;
    });
    if (bestLevelBySlug.calves != null) {
      bestLevelBySlug["left-soleus"] = bestLevelBySlug.calves;
      bestLevelBySlug["right-soleus"] = bestLevelBySlug.calves;
    }
    return Object.entries(bestLevelBySlug)
      .filter(([, lvl]) => lvl >= 0)
      .map(([slug, lvl]) => ({ name: slug, muscles: [slug], frequency: lvl + 1 }));
  }, [ranks]);

  // Clic e identificación del músculo: antes esto comparaba colores de
  // relleno para adivinar qué tocaste, y fallaba todo el tiempo —
  // músculos de varias piezas (cuádriceps: 6, antebrazo/isquiotibial: 4
  // cada uno) sólo se resaltaban a medias, y músculos DISTINTOS que
  // coincidían en el mismo color de rango (ej. glúteo y aductor, los dos
  // sin marcas todavía) se resaltaban juntos por error. Ahora cada
  // polígono se identifica por su ÍNDICE exacto dentro del SVG (los
  // mismos índices que usa la propia librería internamente), así que no
  // hay ninguna ambigüedad: se sabe con certeza a qué músculo pertenece
  // cada polígono, sin importar el color que tenga.
  const handlePolygonClick = (view) => (e) => {
    const poly = e.target.closest?.("polygon");
    if (!poly) return;
    const svg = poly.closest("svg");
    if (!svg) return;
    const idx = Array.from(svg.querySelectorAll("polygon")).indexOf(poly);
    const slug = (view === "front" ? ANTERIOR_POLY_SLUGS : POSTERIOR_POLY_SLUGS)[idx];
    if (!slug || NON_INTERACTIVE_SLUGS.has(slug)) return;
    // El gemelo visto de frente en realidad es otro músculo (tibial
    // anterior) — no se deja tocar desde ahí, sólo desde la espalda.
    if (view === "front" && slug === "calves") return;
    const keys = getOurGroupKeysForSlug(slug);
    if (!keys.length) return;
    const best = keys.reduce((a, b) => ((ranks[b]?.levelIdx ?? -1) > (ranks[a]?.levelIdx ?? -1) ? b : a));
    onMuscleClick(best);
  };

  // Resaltado con borde blanco: con los mismos índices exactos de arriba,
  // se prende SIEMPRE el músculo completo (todas sus piezas) y nunca uno
  // ajeno, sin importar si comparten color con otro músculo.
  useEffect(() => {
    const slugs = new Set(getSlugsForOurGroup(selected));
    [{ ref: frontRef, order: ANTERIOR_POLY_SLUGS }, { ref: backRef, order: POSTERIOR_POLY_SLUGS }].forEach(({ ref, order }) => {
      const svg = ref.current?.querySelector("svg");
      if (!svg) return;
      svg.querySelectorAll("polygon").forEach((p, i) => {
        const isSel = selected && slugs.has(order[i]);
        p.style.stroke = isSel ? "#f8fafc" : "none";
        p.style.strokeWidth = isSel ? "1.6" : "0";
        p.style.filter = isSel ? "drop-shadow(0 0 3px rgba(248,250,252,0.85))" : "none";
      });
    });
  }, [selected, data, frontRef, backRef]);

  // La librería usa el MISMO nombre "calves" para la pantorrilla de
  // frente y la de atrás, así que pintar una pinta las dos a la vez —
  // pero la de frente en realidad es el tibial anterior, otro músculo, y
  // no debería iluminarse nunca. Después de cada render se le fuerza el
  // color neutro de nuevo, sólo del lado de adelante.
  useEffect(() => {
    const svg = frontRef.current?.querySelector("svg");
    if (!svg) return;
    svg.querySelectorAll("polygon").forEach((p, i) => {
      if (ANTERIOR_POLY_SLUGS[i] === "calves") p.style.fill = "#334155";
    });
  }, [data, selected, frontRef]);

  return (
    <div className="flex gap-2 justify-center items-start">
      <div className="flex-1 min-w-0 max-w-[180px]">
        <div ref={frontRef} onClick={handlePolygonClick("front")}><Model data={data} type="anterior" bodyColor="#334155" highlightedColors={highlightedColors} onClick={MODEL_NOOP_CLICK} style={MODEL_STYLE} svgStyle={MODEL_STYLE} /></div>
        <p className="text-center text-[10px] text-slate-600 mt-1">De frente</p>
      </div>
      <div className="flex-1 min-w-0 max-w-[180px]">
        <div ref={backRef} onClick={handlePolygonClick("back")}><Model data={data} type="posterior" bodyColor="#334155" highlightedColors={highlightedColors} onClick={MODEL_NOOP_CLICK} style={MODEL_STYLE} svgStyle={MODEL_STYLE} /></div>
        <p className="text-center text-[10px] text-slate-600 mt-1">De espalda</p>
      </div>
    </div>
  );
}

function MuscleRankView({ logs, settings = DEFAULT_SETTINGS, onUpdateSettings, onGoToProfile, sex, age }) {
  const [selected, setSelected] = useState(null);
  const [showImage, setShowImage] = useState(false);
  const [showAllRanks, setShowAllRanks] = useState(false);
  const frontBodyRef = useRef(null);
  const backBodyRef = useRef(null);
  const mode = settings.muscleRankMode === "relative" ? "relative" : "general";
  const bodyWeightKg = settings.bodyWeightKg || 0;

  const ranks = useMemo(() => {
    const out = {};
    MUSCLE_GROUPS.forEach((g) => {
      const { best1RM, bestKg, bestReps, bestExerciseName, bestLoadFactor, bestWeight } = getBest1RMForMuscleGroup(g.key, logs);
      out[g.key] = { ...getMuscleRank(g.key, best1RM, mode, bodyWeightKg, sex, age), best1RM, bestKg, bestReps, bestExerciseName, bestLoadFactor, bestWeight, label: g.label };
    });
    return out;
  }, [logs, mode, bodyWeightKg, sex, age]);

  const selInfo = selected ? ranks[selected] : null;
  // Para mostrar "te faltan X kg a tus mismas reps para llegar a {rango}"
  // en vez de hablar de 1RM o de "el siguiente rango" en abstracto:
  // a partir del 1RM objetivo (el umbral del próximo nivel) se despeja,
  // con la misma fórmula de Epley y a las MISMAS repeticiones que tu
  // mejor marca, cuántos kg en la barra/mancuerna hacen falta — y se
  // resta lo que ya levantás para saber cuánto más. Importante: hay que
  // dividir también por el "peso" de la contribución (1.0 si es un
  // ejercicio principal, menos si es secundario, ej. 0.35 para el
  // trapecio en un remo) — si no, el cálculo salía mal y mostraba "0kg"
  // sin sentido cada vez que la mejor marca venía de un secundario.
  const nextTierInfo = selInfo && selInfo.nextThreshold != null && selInfo.levelIdx + 1 < RANK_TIERS.length ? RANK_TIERS[selInfo.levelIdx + 1] : null;
  const extraKgNeeded = selInfo && selInfo.nextThreshold != null && selInfo.bestReps && selInfo.bestKg
    ? Math.max(0, Math.ceil(((selInfo.nextThreshold / (1 + selInfo.bestReps / 30) / (selInfo.bestWeight || 1) / (selInfo.bestLoadFactor || 1)) - selInfo.bestKg) * 2) / 2)
    : null;
  const needsWeight = mode === "relative" && !bodyWeightKg;
  const modeLabel = mode === "relative" && bodyWeightKg ? "Según tu contexto" : "General";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-blue-500/20 bg-slate-900/50 backdrop-blur-sm shadow-md shadow-black/20 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0"><Award size={15} /></div>
          <p className="text-sm font-bold text-white">Rango por músculo</p>
        </div>
        <button onClick={() => setShowImage(true)} aria-label="Compartir tus rangos" className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 transition shrink-0"><Share2 size={15} /></button>
      </div>

      <div>
        <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">
          {[{ k: "general", l: "General" }, { k: "relative", l: "Según tu contexto" }].map((opt) => (
            <button key={opt.k} onClick={() => onUpdateSettings?.({ muscleRankMode: opt.k })} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${mode === opt.k ? "bg-blue-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>
          ))}
        </div>
        {mode === "relative" && needsWeight && (
          <button onClick={onGoToProfile} className="w-full flex items-center justify-between gap-2 bg-blue-500/10 border border-blue-500/25 rounded-xl px-3 py-2.5 text-left hover:bg-blue-500/15 transition mt-2">
            <p className="text-[11px] text-blue-300/90">Para calcular "Según tu contexto" necesitamos tu peso corporal — agregalo en tu perfil (sexo y edad son opcionales, pero afinan más el cálculo).</p>
            <ChevronRight size={15} className="text-blue-400 shrink-0" />
          </button>
        )}
      </div>

      <MuscleHighlighterBody ranks={ranks} selected={selected} onMuscleClick={(k) => setSelected((s) => (s === k ? null : k))} frontRef={frontBodyRef} backRef={backBodyRef} />
      {selInfo ? (
        <div className="bg-slate-950/50 border border-slate-800/60 rounded-2xl p-4 bounce-in">
          <div className="flex items-center justify-between mb-3 gap-2">
            <p className="text-sm font-bold text-white">{selInfo.label}</p>
            {!selInfo.hasData && <span className="text-[11px] font-bold text-slate-500 px-2.5 py-1 rounded-lg bg-slate-800/60 shrink-0">Sin rango</span>}
          </div>
          {selInfo.hasData ? (
            <>
              <div className="flex items-center gap-3.5 mb-3.5">
                <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-2 shrink-0 backdrop-blur-sm shadow-md shadow-black/20">
                  <RankBadgeIcon tier={selInfo.tier} sub={selInfo.sub} color={selInfo.color} size={92} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-black leading-tight" style={{ color: selInfo.color }}>{selInfo.tier}{selInfo.sub ? ` ${selInfo.sub}` : ""}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {selInfo.bestKg ? (
                      <>Mejor marca: <span className="text-slate-300 font-bold">{selInfo.bestReps}×{selInfo.bestKg}kg</span>{selInfo.bestLoadFactor > 1 ? <span className="text-slate-600"> (×2 mancuernas)</span> : null}{selInfo.bestExerciseName ? <> en {selInfo.bestExerciseName}</> : null}</>
                    ) : (
                      <>Estimado por ejercicios relacionados — todavía sin marca propia</>
                    )}
                  </p>
                </div>
              </div>
              {selInfo.nextThreshold ? (
                <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Progreso al próximo rango</span>
                    <span className="flex items-center gap-1.5 text-[11px] font-bold shrink-0" style={{ color: nextTierInfo?.color }}>
                      <RankBadgeIcon tier={nextTierInfo?.tier} sub="" color={nextTierInfo?.color} size={40} />
                      {nextTierInfo?.tier}{nextTierInfo?.sub ? ` ${nextTierInfo.sub}` : ""}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(4, ((selInfo.best1RM - selInfo.threshold) / (selInfo.nextThreshold - selInfo.threshold)) * 100))}%`, background: `linear-gradient(90deg, ${selInfo.color}, ${nextTierInfo?.color || selInfo.color})` }} />
                  </div>
                  {extraKgNeeded != null && <p className="text-[11px] text-slate-400 mt-2.5">Sumá <span className="font-black text-white">{extraKgNeeded}kg</span> a tus mismas {selInfo.bestReps} reps para subir</p>}
                </div>
              ) : (
                <div className="bg-blue-500/10 border border-blue-500/25 rounded-xl px-3 py-3 text-center">
                  <p className="text-sm font-black text-blue-400">🏆 ¡Rango máximo!</p>
                </div>
              )}
            </>
          ) : <p className="text-[11px] text-slate-600 text-center py-2">Todavía no registraste marcas en este grupo.</p>}
        </div>
      ) : (
        <p className="text-center text-[11px] text-slate-600">Tocá un músculo entrenable para ver tu rango y tu mejor marca.</p>
      )}
      {!showAllRanks ? (
        <button onClick={() => setShowAllRanks(true)} className="w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl border border-slate-800/60 text-slate-500 hover:text-slate-300 hover:border-slate-700 transition text-xs font-bold">
          <Trophy size={13} /> Ver todos los rangos
        </button>
      ) : (
        <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-3.5 backdrop-blur-sm shadow-md shadow-black/20 bounce-in">
          <button onClick={() => setShowAllRanks(false)} className="w-full flex items-center gap-1.5 justify-center mb-3" aria-label="Ocultar todos los rangos">
            <Trophy size={11} className="text-slate-600" />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Todos los rangos</p>
            <ChevronUp size={12} className="text-slate-600" />
          </button>
          <div className="grid grid-cols-3 gap-2">
            {["Bronce", "Plata", "Oro", "Esmeralda", "Diamante", "Maestro"].map((t) => {
              const rep = RANK_TIERS.find((r) => r.tier === t && r.sub === "II") || RANK_TIERS.find((r) => r.tier === t);
              return (
                <div key={t} className="flex flex-col items-center gap-1 rounded-xl py-2 bg-slate-800/30">
                  <RankBadgeIcon tier={rep.tier} sub="" color={rep.color} size={52} />
                  <span className="text-[9px] font-bold" style={{ color: rep.color }}>{t}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showImage && (
        <ShareImageModal
          title="Compartí tus rangos"
          fileNamePrefix="mis-rangos-por-musculo"
          shareTitle="Mi Rutina — Rangos por músculo"
          shareText="Mirá mis rangos por músculo 💪"
          draw={(ctx, W, H) => drawMuscleRankShareCard(ctx, W, H, { ranks, modeLabel, accent: "#F59E0B" })}
          onClose={() => setShowImage(false)}
        />
      )}
    </div>
  );
}

/* ============================================================================
   MEDIDAS — reemplaza a la vieja sección "Volumen por músculo". Junta dos
   cosas relacionadas: medidas corporales con su propio historial y
   gráfico (mismo lenguaje visual que la Evolución por ejercicio), y fotos
   de progreso. El peso corporal vive ACÁ ahora (antes se editaba en
   Perfil) — cada medición nueva de peso también actualiza
   settings.bodyWeightKg por detrás, así el resto de la app (el rango
   "Según tu contexto") sigue funcionando sin que haya que tocar nada más.
============================================================================ */
const MEASUREMENT_TYPES = [
  { k: "weight", l: "Peso", unit: "kg" },
  { k: "waist", l: "Cintura", unit: "cm" },
  { k: "chest", l: "Pecho", unit: "cm" },
  { k: "arm", l: "Brazo", unit: "cm" },
  { k: "leg", l: "Pierna", unit: "cm" },
];

function getLatestMeasurement(history) {
  if (!history || !history.length) return null;
  return history.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
}
function daysSince(dateStr) {
  if (!dateStr) return null;
  return Math.floor((new Date() - new Date(dateStr + "T00:00:00")) / 86400000);
}

// Visor de foto a pantalla completa — se abre al tocar una miniatura en el
// detalle del día. Mismo lenguaje visual que el resto de los modales de
// la app (fondo oscuro, tarjeta redondeada), sin nada de canvas porque acá
// sólo se muestra la imagen tal cual quedó guardada.
function PhotoViewerModal({ photo, onClose, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const dateLabel = new Date(photo.date + "T00:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="fixed inset-0 z-[140] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 modal-bg-in" onClick={onClose}>
      <div className="max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-sm font-bold text-white capitalize">{dateLabel}</p>
          <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition"><X size={18} /></button>
        </div>
        <img src={photo.dataUrl} alt={photo.date} className="w-full rounded-2xl border border-slate-700/50" />
        {!confirmDel ? (
          <button onClick={() => setConfirmDel(true)} className="w-full flex items-center justify-center gap-1.5 mt-3 py-2.5 rounded-xl border border-rose-500/30 text-rose-400 text-xs font-bold"><Trash2 size={12} /> Borrar esta foto</button>
        ) : (
          <div className="flex gap-2 items-center mt-3 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5">
            <p className="text-[11px] text-slate-400 flex-1">¿Borrar esta foto?</p>
            <button onClick={() => setConfirmDel(false)} className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs">No</button>
            <button onClick={() => { onDelete(photo.id); onClose(); }} className="px-2.5 py-1.5 rounded-lg bg-rose-500 !text-white text-xs font-bold">Sí, borrar</button>
          </div>
        )}
      </div>
    </div>
  );
}

function MeasurementsView({ measurements = {}, onAddMeasurement, photos = [], photosLoading, onAddPhoto, onDeletePhoto }) {
  const [selType, setSelType] = useState("weight");
  const [inputVal, setInputVal] = useState("");
  const [addingPhoto, setAddingPhoto] = useState(false);
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selectedDate, setSelectedDate] = useState(null);
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const selMeta = MEASUREMENT_TYPES.find((t) => t.k === selType);
  const selHistory = measurements[selType] || [];
  const latest = getLatestMeasurement(selHistory);
  const days = latest ? daysSince(latest.date) : null;
  const chartData = selHistory.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((h) => ({ date: h.date.slice(5), val: h.value }));

  const handleAdd = () => {
    const v = parseFloat(inputVal);
    if (!v || isNaN(v)) return;
    onAddMeasurement(selType, v);
    setInputVal("");
  };

  const handlePhotoChange = async (file) => {
    if (!file) return;
    setAddingPhoto(true);
    try { await onAddPhoto(file); } finally { setAddingPhoto(false); }
  };

  // Un solo calendario para las tres cosas — igual que el de Historial,
  // pero acá cada día junta lo que hayas cargado: foto, peso, y/o el
  // resto de las medidas (cintura, pecho, brazo, pierna). Se arma una
  // sola vez por fecha, recorriendo measurements y photos juntos.
  const dailyIndex = useMemo(() => {
    const map = {};
    Object.entries(measurements).forEach(([type, entries]) => {
      (entries || []).forEach((e) => {
        if (!map[e.date]) map[e.date] = { weight: null, measures: {}, photos: [] };
        if (type === "weight") map[e.date].weight = e.value;
        else map[e.date].measures[type] = e.value;
      });
    });
    photos.forEach((p) => {
      if (!map[p.date]) map[p.date] = { weight: null, measures: {}, photos: [] };
      map[p.date].photos.push(p);
    });
    return map;
  }, [measurements, photos]);

  const weeks = useMemo(() => getMonthMatrix(cursor.y, cursor.m), [cursor]);
  const hasAnyData = Object.keys(dailyIndex).length > 0;
  const selectedEntry = selectedDate ? dailyIndex[selectedDate] : null;
  const selectedDateLabel = selectedDate ? new Date(selectedDate + "T00:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }) : null;
  const measureTypesNoWeight = MEASUREMENT_TYPES.filter((t) => t.k !== "weight");

  return (
    <div className="relative overflow-hidden rounded-2xl border border-purple-500/20 bg-slate-900/50 backdrop-blur-sm shadow-md shadow-black/20 p-4 space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0"><Ruler size={15} /></div>
        <p className="text-sm font-bold text-white">Tus medidas</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {MEASUREMENT_TYPES.map((t) => {
          const active = t.k === selType;
          return (
            <button key={t.k} onClick={() => { setSelType(t.k); setInputVal(""); }} className="px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-95 border shrink-0"
              style={active ? { background: "#A855F7", borderColor: "#A855F7", color: "#fff" } : { borderColor: "var(--chip-border)", color: "var(--chip-text)" }}>
              {t.l}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <input type="number" inputMode="decimal" value={inputVal} onChange={(e) => setInputVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }} placeholder={`Nuevo valor (${selMeta.unit})`} className="flex-1 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50" />
        <button onClick={handleAdd} disabled={!inputVal.trim()} className="px-4 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-40 transition-all active:scale-95" style={{ backgroundColor: "#A855F7" }}>Guardar</button>
      </div>

      {latest ? (
        <p className="text-[11px] text-slate-500">Último registro: <span className="text-slate-300 font-bold">{latest.value}{selMeta.unit}</span> · hace {days === 0 ? "hoy" : days === 1 ? "1 día" : `${days} días`}</p>
      ) : (
        <p className="text-[11px] text-slate-600">Todavía no registraste {selMeta.l.toLowerCase()}.</p>
      )}

      {chartData.length >= 2 && (
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="gMedidas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#A855F7" stopOpacity={0.35} /><stop offset="95%" stopColor="#A855F7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="date" stroke="var(--chart-axis)" fontSize={10} />
              <YAxis stroke="var(--chart-axis)" fontSize={10} domain={["auto", "auto"]} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="val" stroke="#A855F7" fill="url(#gMedidas)" strokeWidth={2.5} dot={{ r: 3, fill: "#A855F7", strokeWidth: 0 }} name={`${selMeta.l} (${selMeta.unit})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="pt-3 border-t border-slate-800/50">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs font-bold text-white flex items-center gap-1.5"><Calendar size={13} className="text-purple-400" /> Tu calendario</p>
          <label className={`px-2.5 py-1.5 rounded-lg bg-purple-500/15 text-purple-400 text-[11px] font-bold flex items-center gap-1 ${addingPhoto ? "opacity-50" : "cursor-pointer"}`}>
            <Camera size={11} /> {addingPhoto ? "Subiendo..." : "Foto de hoy"}
            <input type="file" accept="image/*" capture="environment" className="hidden" disabled={addingPhoto} onChange={(e) => { handlePhotoChange(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>

        {photosLoading ? (
          <p className="text-[11px] text-slate-600 text-center py-4">Cargando...</p>
        ) : !hasAnyData ? (
          <p className="text-[11px] text-slate-600 text-center py-4">Todavía no registraste nada — agregá una medida arriba o una foto para empezar tu calendario.</p>
        ) : (
          <>
            <div className="bg-slate-950/40 border border-slate-800/50 rounded-2xl p-3">
              <div className="flex items-center justify-between mb-2.5">
                <button onClick={() => setCursor((c) => { const m = c.m === 0 ? 11 : c.m - 1; const y = c.m === 0 ? c.y - 1 : c.y; return { y, m }; })} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"><ChevronLeft size={16} /></button>
                <p className="text-sm font-bold text-white">{MONTH_LABELS[cursor.m]} {cursor.y}</p>
                <button onClick={() => setCursor((c) => { const m = c.m === 11 ? 0 : c.m + 1; const y = c.m === 11 ? c.y + 1 : c.y; return { y, m }; })} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"><ChevronRight size={16} /></button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-1.5">{WEEKDAY_LABELS.map((l, i) => <div key={i} className="text-center text-[9px] font-bold text-slate-600">{l}</div>)}</div>
              <div className="grid grid-cols-7 gap-1">
                {weeks.flat().map((d, i) => {
                  if (!d) return <div key={i} />;
                  const entry = dailyIndex[d];
                  const isToday = d === todayStr();
                  const isSelected = d === selectedDate;
                  const dayNum = parseInt(d.slice(8, 10), 10);
                  const hasPhoto = entry?.photos?.length > 0;
                  const hasWeight = entry?.weight != null;
                  const hasMeasures = entry && Object.keys(entry.measures).length > 0;
                  const complete = hasPhoto && hasWeight && hasMeasures;
                  // Mismo tratamiento que el calendario de Historial: el
                  // fondo de la celda se tiñe con el/los colores de lo que
                  // cargaste ese día, en vez de quedar todo gris con sólo
                  // puntitos chicos abajo — de un vistazo se nota más.
                  const dayColors = [hasPhoto && "#FB7185", hasWeight && "#A855F7", hasMeasures && "#3B82F6"].filter(Boolean);
                  const bgStyle = dayColors.length > 1
                    ? { background: `linear-gradient(135deg, ${dayColors.map((c) => c + "38").join(", ")})`, border: `1px solid ${dayColors[0]}55` }
                    : dayColors.length === 1
                      ? { backgroundColor: dayColors[0] + "30", border: `1px solid ${dayColors[0]}55` }
                      : {};
                  return (
                    <button key={i} onClick={() => entry && setSelectedDate(isSelected ? null : d)} disabled={!entry} style={bgStyle}
                      className={`relative aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-all ${isSelected ? "ring-2 ring-purple-400" : ""} ${isToday && !entry ? "border border-purple-500/50" : ""} ${entry ? "text-white hover:brightness-125 active:scale-95" : "text-slate-700"}`}>
                      {complete && <Star size={9} className="absolute -top-1 -right-1 text-amber-400 fill-amber-400" />}
                      {dayNum}
                      {entry && (
                        <div className="flex gap-0.5">
                          {hasPhoto && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />}
                          {hasWeight && <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />}
                          {hasMeasures && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-800/50 flex-wrap">
                <span className="flex items-center gap-1 text-[9px] text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Foto</span>
                <span className="flex items-center gap-1 text-[9px] text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> Peso</span>
                <span className="flex items-center gap-1 text-[9px] text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> Medidas</span>
                <span className="flex items-center gap-1 text-[9px] text-slate-500"><Star size={9} className="text-amber-400 fill-amber-400" /> Día completo</span>
              </div>
            </div>

            {selectedEntry ? (
              <div className="bg-slate-950/50 border border-slate-800/60 rounded-2xl p-4 mt-3 bounce-in space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-white capitalize">{selectedDateLabel}</p>
                  {selectedEntry.photos.length > 0 && selectedEntry.weight != null && Object.keys(selectedEntry.measures).length > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 shrink-0"><Star size={11} className="fill-amber-400" /> Completo</span>
                  )}
                </div>

                {selectedEntry.weight != null && (
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 w-fit">
                    <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                    <span className="text-xs text-slate-300">Peso: <span className="font-bold text-white">{selectedEntry.weight}kg</span></span>
                  </div>
                )}

                {Object.keys(selectedEntry.measures).length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {measureTypesNoWeight.filter((t) => selectedEntry.measures[t.k] != null).map((t) => (
                      <div key={t.k} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                        <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                        <span className="text-xs text-slate-300">{t.l}: <span className="font-bold text-white">{selectedEntry.measures[t.k]}{t.unit}</span></span>
                      </div>
                    ))}
                  </div>
                )}

                {selectedEntry.photos.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-rose-300 uppercase tracking-wide mb-1.5 flex items-center gap-1"><Camera size={10} /> {selectedEntry.photos.length > 1 ? `${selectedEntry.photos.length} fotos` : "Foto"}</p>
                    <div className="flex gap-2 flex-wrap">
                      {selectedEntry.photos.map((p) => (
                        <button key={p.id} onClick={() => setViewingPhoto(p)} className="w-20 h-20 rounded-xl overflow-hidden border border-slate-800/60 active:scale-95 transition">
                          <img src={p.dataUrl} alt={p.date} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-center text-[11px] text-slate-600 py-2">Tocá un día con registro para ver el detalle.</p>
            )}
          </>
        )}
        <p className="text-[9px] text-slate-600 mt-2">Las fotos quedan guardadas en este dispositivo, no se suben a ningún lado.</p>
      </div>

      {viewingPhoto && (
        <PhotoViewerModal photo={viewingPhoto} onClose={() => setViewingPhoto(null)} onDelete={onDeletePhoto} />
      )}
    </div>
  );
}

function ProgressView({ logs, setLogs, sessions, cycleStart, settings = DEFAULT_SETTINGS, onResetAll, onDeleteDay, onUpdateSettings, onGoToProfile, sex, age, onGoToDeload, measurements, onAddMeasurement, photos, photosLoading, onAddPhoto, onDeletePhoto }) {
  const allExercises = useMemo(() => DAY_ORDER.flatMap((dk) => ROUTINE[dk].exercises.map((e) => ({ id: e.id, name: e.name, day: ROUTINE[dk].label, color: ROUTINE[dk].color, sets: e.sets.length, dayKey: dk }))), []);

  const stats = useMemo(() => {
    const dateSet = getTrainedDateSet(logs, sessions);
    let totalVol = 0, totalSets = 0;
    Object.entries(logs).forEach(([k, v]) => { if (k.endsWith("_pr_override") || !Array.isArray(v)) return; v.forEach((e) => { totalVol += vol(e.kg, e.reps); totalSets++; }); });
    let streak = 0, cursor = new Date();
    while (true) { const d = cursor.toISOString().slice(0, 10); if (dateSet.has(d)) { streak++; cursor.setDate(cursor.getDate() - 1); } else break; }
    return { totalVol: Math.round(totalVol), totalSets, streak, daysTrained: dateSet.size };
  }, [logs, sessions]);

  const [selId, setSelId] = useState(allExercises[0]?.id);
  const [selSet, setSelSet] = useState(0);
  const [metric, setMetric] = useState("peso");
  const selEx = allExercises.find((e) => e.id === selId);
  const history = (logs[`${selId}_${selSet}`] || []).slice().sort((a, b) => (a.date > b.date ? 1 : -1));
  const chartData = history.map((h) => ({ date: h.date.slice(5), kg: h.kg, reps: h.reps, vol: vol(h.kg, h.reps), e1rm: estimate1RM(h.kg, h.reps), rpe: h.rpe ?? null }));

  const [confirmResetProgress, setConfirmResetProgress] = useState(false);
  const [activeSection, setActiveSection] = useState("rank");

  return (
    <div className="space-y-4">
      {/* Hero — el azul es el color característico de Progreso (como el violeta lo es de Descarga) */}
      <div className="relative overflow-hidden rounded-2xl border border-blue-500/20 p-5" style={{ background: "var(--grad-hero-blue)" }}>
        <div className="absolute -top-8 -right-6 w-32 h-32 rounded-full bg-blue-500/15 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full bg-cyan-500/10 blur-2xl pointer-events-none" />
        <div className="relative flex items-center gap-2 mb-1">
          <Activity size={16} className="text-blue-400" />
          <span className="text-[11px] font-black uppercase tracking-widest text-blue-400">Tu evolución</span>
        </div>
        <h2 className="relative text-xl font-black text-white leading-tight">Progreso</h2>
        <p className="relative text-xs text-blue-300/60 mt-1">Marcas, volumen y constancia a lo largo del tiempo</p>
      </div>

      {/* Ciclo actual */}
      {cycleStart ? (
        <WeekCalendar cycleStart={cycleStart} logs={logs} sessions={sessions} settings={settings} onGoToDeload={onGoToDeload} />
      ) : (
        <button onClick={onGoToProfile} className="w-full flex items-center gap-3 bg-amber-500/10 border border-amber-500/25 rounded-2xl px-4 py-3.5 text-left hover:bg-amber-500/15 transition">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0"><AlertTriangle size={16} /></div>
          <div className="flex-1 min-w-0"><p className="text-sm font-bold text-white">No registraste el inicio de tu ciclo</p><p className="text-[11px] text-amber-300/80">Sin esa fecha no podemos calcular en qué semana estás ni cuándo te toca la descarga — tocá para configurarla</p></div>
          <ChevronRight size={16} className="text-amber-400 shrink-0" />
        </button>
      )}

      {/* Estadísticas — fila compacta y neutra, sin un color por cada una */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { val: stats.daysTrained, label: "Días" },
          { val: stats.streak > 0 ? `${stats.streak}🔥` : "0", label: "Racha" },
          { val: stats.totalSets, label: "Series" },
          { val: stats.totalVol > 999 ? `${(stats.totalVol / 1000).toFixed(1)}k` : stats.totalVol, label: "Kg×reps" },
        ].map(({ val, label }) => (
          <div key={label} className="rounded-xl p-2.5 text-center bg-slate-900/50 border border-slate-800/50 shadow-md shadow-black/20">
            <p className="text-sm font-black text-white leading-none tabular-nums">{val}</p>
            <p className="text-[9px] font-semibold text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Selector de sección — grilla fija de 4, siempre entra sin deslizar */}
      <div className="grid grid-cols-4 gap-1.5">
        {PROGRESS_SECTIONS.map((s) => (
          <button key={s.k} onClick={() => setActiveSection(s.k)} className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-[10px] font-bold transition-all active:scale-95 border"
            style={activeSection === s.k ? { background: s.color, borderColor: s.color, color: "#fff" } : { borderColor: "var(--chip-border)", color: "var(--chip-text)" }}>
            {s.icon}<span>{s.l}</span>
          </button>
        ))}
      </div>

      <div key={activeSection} className="tab-fade-in space-y-3">
        {activeSection === "chart" && (
          <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-slate-900/50 backdrop-blur-sm shadow-md shadow-black/20 p-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0"><Activity size={15} /></div>
              <p className="text-sm font-bold text-white">Evolución por ejercicio</p>
            </div>

            <ExerciseChipRow exercises={allExercises} selId={selId} onSelect={(id) => { setSelId(id); setSelSet(0); }} activeColor="#F59E0B" />

            <div className="flex gap-2">
              {Array.from({ length: selEx?.sets || 1 }).map((_, i) => (
                <button key={i} onClick={() => setSelSet(i)} className="flex-1 py-2 rounded-xl text-xs font-bold transition-all border"
                  style={selSet === i ? { backgroundColor: "#F59E0B", borderColor: "#F59E0B", color: "#fff" } : { borderColor: "var(--chip-border)", color: "var(--chip-text)" }}>
                  S{i + 1}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end">
              <div className="flex bg-slate-950/60 rounded-xl p-0.5 border border-slate-800/60">
                {[{ k: "peso", l: "Kg" }, { k: "1rm", l: "1RM" }].map((opt) => (
                  <button key={opt.k} onClick={() => setMetric(opt.k)} className={`px-2 py-1.5 rounded-[10px] text-[10px] font-bold transition-all ${metric === opt.k ? "bg-amber-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>
                ))}
              </div>
            </div>

            {chartData.length === 0 ? (
              <div className="text-center text-slate-600 py-10"><BarChart3 size={28} className="mx-auto mb-2.5 opacity-30" /><p className="text-sm">Sin registros para esta serie.</p><p className="text-xs mt-1 text-slate-700">Guardá series en la rutina para ver tu evolución aquí.</p></div>
            ) : (
              <>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={selEx?.color} stopOpacity={0.35} /><stop offset="95%" stopColor={selEx?.color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                      <XAxis dataKey="date" stroke="var(--chart-axis)" fontSize={10} />
                      <YAxis stroke="var(--chart-axis)" fontSize={10} domain={["auto", "auto"]} />
                      <Tooltip content={<CustomTooltip />} />
                      {metric === "peso" && <Area type="monotone" dataKey="kg" stroke={selEx?.color || "#14B8A6"} fill="url(#gA)" strokeWidth={2.5} dot={{ r: 3, fill: selEx?.color, strokeWidth: 0 }} name="Kg" />}
                      {metric === "1rm" && <Area type="monotone" dataKey="e1rm" stroke="#F59E0B" fill="url(#gA)" strokeWidth={2.5} dot={{ r: 3, fill: "#F59E0B", strokeWidth: 0 }} name="1RM est." />}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {chartData.length >= 2 && (() => {
                  const f = chartData[0], l = chartData[chartData.length - 1];
                  const fVal = metric === "peso" ? f.kg : f.e1rm, lVal = metric === "peso" ? l.kg : l.e1rm;
                  const diff = lVal - fVal, pct2 = fVal ? ((diff / fVal) * 100).toFixed(1) : 0, pos = diff >= 0;
                  const metricLabel = metric === "peso" ? "de kg" : "de 1RM estimado";
                  return (
                    <div className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold ${pos ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15" : "bg-rose-500/10 text-rose-400 border border-rose-500/15"}`}>
                      {pos ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      <div><span className="font-black">{pos ? "+" : ""}{pct2}% {metricLabel}</span><span className="text-xs opacity-60 ml-1.5">· {chartData.length} sesiones</span></div>
                    </div>
                  );
                })()}
                {metric === "1rm" && <p className="text-[10px] text-slate-600">Estimado con fórmula de Epley. Solo referencia, no un máximo real.</p>}
              </>
            )}
          </div>
        )}

        {activeSection === "rank" && <MuscleRankView logs={logs} settings={settings} onUpdateSettings={onUpdateSettings} onGoToProfile={onGoToProfile} sex={sex} age={age} />}

        {activeSection === "medidas" && (
          <MeasurementsView measurements={measurements} onAddMeasurement={onAddMeasurement} photos={photos} photosLoading={photosLoading} onAddPhoto={onAddPhoto} onDeletePhoto={onDeletePhoto} />
        )}

        {activeSection === "historial" && <SessionHistoryView logs={logs} onDeleteDay={onDeleteDay} />}
      </div>

      {!confirmResetProgress ? (
        <div className="flex gap-2">
          <button onClick={() => setConfirmResetProgress(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-800/60 text-slate-600 hover:text-rose-400 hover:border-rose-500/30 transition text-xs font-medium"><Trash2 size={12} /> Resetear todo</button>
          <button onClick={() => setActiveSection("historial")} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-800/60 text-slate-600 hover:text-amber-400 hover:border-amber-500/30 transition text-xs font-medium"><Calendar size={12} /> Borrar un día</button>
        </div>
      ) : (
        <div className="flex gap-2 items-center bg-rose-950/30 border border-rose-500/20 rounded-xl px-3 py-2.5">
          <p className="text-xs text-rose-300/80 flex-1">¿Borrar todo el historial? Los récords se mantienen.</p>
          <button onClick={() => setConfirmResetProgress(false)} className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs">No</button>
          <button onClick={() => { onResetAll?.(); setConfirmResetProgress(false); }} className="px-2.5 py-1.5 rounded-lg bg-rose-500 !text-white text-xs font-bold">Sí, borrar</button>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   EXPORTAR ENTRENAMIENTO (PDF / Word / Excel) — pensado para mandarle a tu
   entrenador el resumen de un día, una semana o un mes. Reutiliza
   buildSessionsIndex(logs) (la misma función del Historial) para armar la
   lista de sesiones, la filtra por período, y la "achata" en filas
   (fecha, día, ejercicio, serie, reps, kg, RPE) que alimentan los tres
   formatos. Las librerías (jspdf, jspdf-autotable, docx, xlsx) se cargan
   con import() dinámico recién cuando se exporta, para no sumarle peso al
   resto de la app.
============================================================================ */
function slugifyForFilename(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "perfil";
}

function getSessionsForPeriod(sessions, period) {
  const now = new Date();
  if (period === "day") { const d = todayStr(); return sessions.filter((s) => s.date === d); }
  if (period === "week") {
    const dow = (now.getDay() + 6) % 7; // 0=lunes
    const monday = new Date(now); monday.setDate(now.getDate() - dow); monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const mondayStr = monday.toISOString().slice(0, 10), sundayStr = sunday.toISOString().slice(0, 10);
    return sessions.filter((s) => s.date >= mondayStr && s.date <= sundayStr);
  }
  if (period === "month") { const ym = todayStr().slice(0, 7); return sessions.filter((s) => s.date.startsWith(ym)); }
  return sessions;
}

// Agrupa las filas ya achatadas de vuelta por fecha, en orden cronológico —
// es como se ven mejor tanto en el PDF como en el Word (una sub-sección por
// día entrenado, con su propia tablita de series).
function groupExportRowsByDate(rows) {
  const map = {};
  rows.forEach((r) => { if (!map[r.date]) map[r.date] = { date: r.date, dayLabel: r.dayLabel, rows: [] }; map[r.date].rows.push(r); });
  return Object.values(map).sort((a, b) => (a.date < b.date ? -1 : 1)).map((g) => ({
    ...g,
    dateLabel: new Date(g.date + "T00:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }),
  }));
}

function buildExportRows(filteredSessions) {
  const rows = [];
  filteredSessions.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((s) => {
    const dayLabel = s.dayKeys.map((dk) => ROUTINE[dk]?.label || dk).join(" / ");
    s.items.forEach((it) => { rows.push({ date: s.date, dayLabel, exercise: it.exerciseName, set: it.setIndex + 1, reps: it.reps, kg: it.kg, rpe: it.rpe }); });
  });
  return rows;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function exportTrainingToPdf(rows, meta) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text("Mi Rutina — Resumen de entrenamiento", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`${meta.profileName} · ${meta.periodLabel}`, 14, 25);
  doc.setTextColor(20);
  let y = 34;
  const groups = groupExportRowsByDate(rows);
  groups.forEach((g) => {
    if (y > 268) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text(`${g.dateLabel.charAt(0).toUpperCase()}${g.dateLabel.slice(1)} — ${g.dayLabel}`, 14, y);
    y += 3;
    autoTable(doc, {
      startY: y,
      head: [["Ejercicio", "Serie", "Reps", "Kg", "RPE"]],
      body: g.rows.map((r) => [r.exercise, `S${r.set}`, String(r.reps), `${r.kg} kg`, r.rpe != null ? String(r.rpe) : "—"]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [20, 184, 166] },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  });
  doc.save(`${meta.filename}.pdf`);
}

async function exportTrainingToWord(rows, meta) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, WidthType } = await import("docx");
  const groups = groupExportRowsByDate(rows);
  const children = [
    new Paragraph({ text: "Mi Rutina — Resumen de entrenamiento", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text: `${meta.profileName} · ${meta.periodLabel}`, color: "666666" })], spacing: { after: 200 } }),
  ];
  groups.forEach((g) => {
    children.push(new Paragraph({ text: `${g.dateLabel.charAt(0).toUpperCase()}${g.dateLabel.slice(1)} — ${g.dayLabel}`, heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 100 } }));
    const headerRow = new TableRow({ children: ["Ejercicio", "Serie", "Reps", "Kg", "RPE"].map((h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })) });
    const dataRows = g.rows.map((r) => new TableRow({ children: [r.exercise, `S${r.set}`, String(r.reps), `${r.kg} kg`, r.rpe != null ? String(r.rpe) : "—"].map((v) => new TableCell({ children: [new Paragraph(v)] })) }));
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] }));
  });
  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${meta.filename}.docx`);
}

async function exportTrainingToExcel(rows, meta) {
  const XLSX = await import("xlsx");
  const header = ["Fecha", "Día", "Ejercicio", "Serie", "Reps", "Kg", "RPE"];
  const data = rows.map((r) => [r.date, r.dayLabel, r.exercise, r.set, r.reps, r.kg, r.rpe ?? ""]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Entrenamiento");
  XLSX.writeFile(wb, `${meta.filename}.xlsx`);
}

/* ============================================================================
   EXPORTAR LA RUTINA (no el entrenamiento) — pensado para cuando querés
   compartir tu PLAN (qué ejercicios/series/reps tiene cada día) en PDF,
   Word o Excel en vez de (o además de) mandar el link. Reutiliza
   buildRoutineModel para resolver nombre/músculo de cada ejercicio.
============================================================================ */
function buildRoutineExportDays(routineDef) {
  const model = buildRoutineModel(routineDef);
  return model.dayOrder.map((dk) => {
    const d = model.days[dk];
    return { dayLabel: d.label, exercises: d.exercises.map((ex) => ({ name: ex.name, muscle: ex.muscle, sets: ex.sets.length, repRange: ex.sets[0]?.repRange || "—" })) };
  });
}

async function exportRoutineToPdf(routineDef) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const days = buildRoutineExportDays(routineDef);
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(routineDef.name || "Mi rutina", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text("Generada con Mi Rutina", 14, 25);
  doc.setTextColor(20);
  let y = 34;
  days.forEach((d) => {
    if (y > 268) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.text(d.dayLabel, 14, y);
    y += 3;
    autoTable(doc, {
      startY: y,
      head: [["Ejercicio", "Músculo", "Series", "Reps"]],
      body: d.exercises.map((ex) => [ex.name, ex.muscle, String(ex.sets), ex.repRange]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [20, 184, 166] },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  });
  doc.save(`${slugifyForFilename(routineDef.name)}.pdf`);
}

async function exportRoutineToWord(routineDef) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, WidthType } = await import("docx");
  const days = buildRoutineExportDays(routineDef);
  const children = [
    new Paragraph({ text: routineDef.name || "Mi rutina", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text: "Generada con Mi Rutina", color: "666666" })], spacing: { after: 200 } }),
  ];
  days.forEach((d) => {
    children.push(new Paragraph({ text: d.dayLabel, heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 100 } }));
    const headerRow = new TableRow({ children: ["Ejercicio", "Músculo", "Series", "Reps"].map((h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })) });
    const dataRows = d.exercises.map((ex) => new TableRow({ children: [ex.name, ex.muscle, String(ex.sets), ex.repRange].map((v) => new TableCell({ children: [new Paragraph(v)] })) }));
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] }));
  });
  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${slugifyForFilename(routineDef.name)}.docx`);
}

async function exportRoutineToExcel(routineDef) {
  const XLSX = await import("xlsx");
  const days = buildRoutineExportDays(routineDef);
  const header = ["Día", "Ejercicio", "Músculo", "Series", "Reps"];
  const data = [];
  days.forEach((d) => { d.exercises.forEach((ex) => { data.push([d.dayLabel, ex.name, ex.muscle, ex.sets, ex.repRange]); }); });
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rutina");
  XLSX.writeFile(wb, `${slugifyForFilename(routineDef.name)}.xlsx`);
}

const EXPORT_PERIODS = [
  { k: "day", l: "Hoy" },
  { k: "week", l: "Esta semana" },
  { k: "month", l: "Este mes" },
];

// Tarjeta de Perfil: elegís el período y el formato, y se descarga
// directo — pensado para mandarle a tu entrenador el resumen sin tener que
// armarlo a mano.
function ExportTrainingCard({ profileName, logs }) {
  const allSessions = useMemo(() => buildSessionsIndex(logs), [logs]);
  const [period, setPeriod] = useState("week");
  const [exporting, setExporting] = useState(null);
  const [error, setError] = useState("");
  const filtered = useMemo(() => getSessionsForPeriod(allSessions, period), [allSessions, period]);
  const rows = useMemo(() => buildExportRows(filtered), [filtered]);
  const periodLabel = EXPORT_PERIODS.find((p) => p.k === period)?.l || "";

  const handleExport = async (format) => {
    if (!rows.length) { setError("No hay entrenamientos registrados en ese período."); return; }
    setError(""); setExporting(format);
    const meta = { profileName, periodLabel, filename: `mi-rutina-${slugifyForFilename(profileName)}-${period}-${todayStr()}` };
    try {
      if (format === "pdf") await exportTrainingToPdf(rows, meta);
      else if (format === "word") await exportTrainingToWord(rows, meta);
      else if (format === "excel") await exportTrainingToExcel(rows, meta);
    } catch (err) {
      console.error("Error exportando entrenamiento:", err);
      setError("No pudimos generar el archivo. Probá de nuevo.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm shadow-md shadow-black/20 space-y-3.5">
      <div>
        <p className="text-sm font-bold text-white">Exportar entrenamiento</p>
        <p className="text-[11px] text-slate-500 mt-0.5">Descargá el resumen para mandarle a tu entrenador</p>
      </div>
      <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">
        {EXPORT_PERIODS.map((opt) => (
          <button key={opt.k} onClick={() => { setPeriod(opt.k); setError(""); }} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${period === opt.k ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>
        ))}
      </div>
      <p className="text-[10px] text-slate-600">{rows.length > 0 ? `${groupExportRowsByDate(rows).length} día${groupExportRowsByDate(rows).length === 1 ? "" : "s"} entrenado${groupExportRowsByDate(rows).length === 1 ? "" : "s"} en este período.` : "Sin entrenamientos registrados en este período."}</p>
      <div className="grid grid-cols-3 gap-2">
        {[{ k: "pdf", l: "PDF" }, { k: "word", l: "Word" }, { k: "excel", l: "Excel" }].map((opt) => (
          <button key={opt.k} onClick={() => handleExport(opt.k)} disabled={!!exporting} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition text-xs font-bold disabled:opacity-50">
            <Download size={13} /> {exporting === opt.k ? "..." : opt.l}
          </button>
        ))}
      </div>
      {error && <p className="text-[11px] text-amber-400">{error}</p>}
    </div>
  );
}

/* ============================================================================
   PROFILE VIEW — adds an entry point to the setup hub + a backup status line
============================================================================ */
function ProfileView({ profileName, profiles, logs, onSignOut, onDelete, onUpdateProfile, cycleStart, onSetCycleStart, onGoToRoutines }) {
  const profile = profiles[profileName];
  const [showDeletePin, setShowDeletePin] = useState(false); const [deleteError, setDeleteError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editMail, setEditMail] = useState(profile?.email || "");
  const [editSex, setEditSex] = useState(profile?.sex || "");
  const [editAge, setEditAge] = useState(profile?.age ? String(profile.age) : "");
  const [showCycleSetup, setShowCycleSetup] = useState(false);
  const [googleLinkError, setGoogleLinkError] = useState("");
  const joinDate = profile?.joinedAt ? new Date(profile.joinedAt).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" }) : "—";
  const settings = getProfileSettings(profile), weekInfo = getWeekInfo(cycleStart, settings);
  const updateSettings = (patch) => onUpdateProfile({ settings: { ...settings, ...patch } });
  const adjustRest = (key, delta) => updateSettings({ [key]: Math.min(600, Math.max(30, settings[key] + delta)) });
  const adjustSetting = (key, delta, min, max) => updateSettings({ [key]: Math.min(max, Math.max(min, settings[key] + delta)) });
  const adjustDeloadPct = (delta) => updateSettings({ deloadPct: Math.min(0.95, Math.max(0.5, Math.round((settings.deloadPct + delta) * 100) / 100)) });
  const handleDeleteConfirm = (pin) => { if (profile.pin && pin !== profile.pin) { setDeleteError("PIN incorrecto."); setTimeout(() => setDeleteError(""), 1500); } else { onDelete(); } };
  const initial = profileName.charAt(0).toUpperCase();
  const activeRoutineDef = resolveRoutineDef(profile?.routines?.[profile?.activeRoutineId], profile?.activeRoutineId);
  const savedRoutineCount = Object.keys(profile?.routines || {}).length;

  // Sexo/edad son datos personales (igual que el email), así que viven
  // junto al resto del perfil. El peso corporal se sacó de acá — ahora se
  // registra con su propio historial en Progreso → Medidas (junto con
  // cintura, pecho, brazo, pierna), y cada medición nueva de peso
  // actualiza settings.bodyWeightKg por detrás para que el rango "Según
  // tu contexto" siga funcionando sin tener que tocar nada más.
  const handleSaveProfile = () => {
    const updates = { email: editMail, sex: editSex || null, age: editAge ? parseInt(editAge, 10) : null };
    updates.settings = { ...settings, sex: editSex || null };
    onUpdateProfile(updates);
    setEditing(false);
  };

  // Vincular este perfil local con una cuenta de Google: abre el mismo popup
  // que el login, y si funciona le guarda el googleUid/email al perfil
  // actual (sin crear un perfil nuevo ni cerrar la sesión) y lo sube a la
  // nube por primera vez — así, si después entrás con esta misma cuenta
  // desde otro dispositivo, la encuentra (ver fetchProfileFromCloud en
  // handleGoogleLogin).
  const handleLinkGoogle = async () => {
    setGoogleLinkError("");
    try {
      const pluginUser = await googleSignIn();
      const firebaseUser = auth.currentUser || pluginUser;
      const uid = firebaseUser.uid;
      const email = firebaseUser.email || pluginUser.email || profile?.email;
      const updatedFields = { googleUid: uid, email };
      onUpdateProfile(updatedFields);
      await syncProfileToCloud(uid, { ...profile, ...updatedFields, name: profileName });
    } catch (err) {
      console.error("Error al vincular con Google:", err);
      setGoogleLinkError("No se pudo vincular con Google. Intentá de nuevo.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="border border-slate-800/50 rounded-2xl p-5 text-center shadow-md shadow-black/20" style={{ background: "var(--grad-profile-avatar)" }}>
        <div className="w-20 h-20 rounded-3xl mx-auto flex items-center justify-center text-3xl font-black !text-white mb-3" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)" }}>{initial}</div>
        <h2 className="text-xl font-black text-white">{profileName}</h2>
        {profile?.email && <p className="text-sm text-slate-400 mt-1">{profile.email}</p>}
        <p className="text-[11px] text-slate-600 mt-1">Miembro desde {joinDate}</p>
      </div>

      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl divide-y divide-slate-800/50 overflow-hidden backdrop-blur-sm shadow-md shadow-black/20">
        {[
          { icon: <Mail size={14} />, label: "Email", val: profile?.email || "No configurado" },
          { icon: <UserCog size={14} />, label: "Sexo", val: profile?.sex === "M" ? "Masculino" : profile?.sex === "F" ? "Femenino" : "No configurado" },
          { icon: <Calendar size={14} />, label: "Edad", val: profile?.age ? `${profile.age} años` : "No configurada" },
          { icon: <Clock size={14} />, label: "Miembro desde", val: joinDate },
        ].map(({ icon, label, val }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3.5"><span className="text-slate-600">{icon}</span><span className="text-slate-500 text-xs flex-1">{label}</span><span className="text-slate-300 text-xs font-medium text-right">{val}</span></div>
        ))}
      </div>

      {editing ? (
        <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 space-y-3 bounce-in">
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Email</label>
            <input type="email" value={editMail} onChange={(e) => setEditMail(e.target.value)} placeholder="tu@email.com" className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-3 text-white text-sm focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Sexo</label>
            <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-700/50">
              {[{ k: "M", l: "Masculino" }, { k: "F", l: "Femenino" }].map((opt) => (
                <button key={opt.k} onClick={() => setEditSex(opt.k)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${editSex === opt.k ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>
              ))}
            </div>
            <p className="text-[10px] text-slate-600 mt-1.5">Se usa sólo para calibrar mejor el rango por músculo (la fuerza relativa típica varía según esto).</p>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Edad</label>
            <input type="number" inputMode="numeric" value={editAge} onChange={(e) => setEditAge(e.target.value)} placeholder="Años" className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-3 text-white text-sm focus:outline-none" />
          </div>
          <p className="text-[10px] text-slate-600">Tu peso corporal y otras medidas ahora se registran con su propio historial en Progreso → Medidas.</p>
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-semibold">Cancelar</button>
            <button onClick={handleSaveProfile} className="flex-1 py-3 rounded-xl bg-teal-500 !text-white text-sm font-bold">Guardar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="w-full flex items-center gap-2 justify-center py-3 rounded-2xl border border-slate-800 text-slate-400 hover:border-slate-600 hover:text-white transition text-sm font-medium"><Edit3 size={14} /> Editar perfil</button>
      )}

      {profile?.googleUid ? (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-sm font-medium">
          <Check size={14} className="shrink-0" /> Vinculado con Google
        </div>
      ) : (
        <button onClick={handleLinkGoogle} className="w-full flex items-center gap-2.5 justify-center py-3 rounded-2xl border border-slate-800 text-slate-400 hover:border-slate-600 hover:text-white transition text-sm font-medium">
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Vincular con Google
        </button>
      )}
      {googleLinkError && <p className="text-rose-400 text-xs text-center">{googleLinkError}</p>}

      <div className="flex items-center gap-1.5 px-1 pt-1"><Dumbbell size={11} className="text-slate-600" /><p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Entrenamiento</p></div>
      <button onClick={onGoToRoutines} className="w-full flex items-center gap-3 bg-slate-900/50 border border-slate-800/50 rounded-2xl px-4 py-3.5 hover:border-teal-500/30 transition text-left">
        <div className="w-9 h-9 rounded-xl bg-teal-500/15 text-teal-400 flex items-center justify-center shrink-0"><Layers size={16} /></div>
        <div className="flex-1 min-w-0"><p className="text-sm font-bold text-white">Tu rutina: {activeRoutineDef?.name || "—"}</p><p className="text-[11px] text-slate-500">{savedRoutineCount} guardada{savedRoutineCount === 1 ? "" : "s"} · tocá para cambiar, editar o crear otra</p></div>
        <ChevronRight size={16} className="text-slate-600 shrink-0" />
      </button>
      {weekInfo && (
        <div className="w-full flex items-center gap-3 bg-slate-900/50 border border-slate-800/50 rounded-2xl px-4 py-3.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: weekInfo.isDeload ? "#A855F715" : "#3B82F615", color: weekInfo.isDeload ? "#C084FC" : "#60A5FA" }}>{weekInfo.isDeload ? <Zap size={16} /> : <Flame size={16} />}</div>
          <div className="flex-1 min-w-0"><p className="text-sm font-bold text-white">Ciclo #{weekInfo.cycleNumber} · Semana {weekInfo.weekInCycle}/{weekInfo.cycleWeeks}</p><p className="text-[11px] text-slate-500">{weekInfo.isDeload ? "Semana de descarga" : "Semana de entrenamiento"}</p></div>
        </div>
      )}

      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm shadow-md shadow-black/20">
        <div className="flex items-center justify-between mb-2">
          <div><p className="text-sm font-bold text-white">Inicio de ciclo</p><p className="text-[11px] text-slate-500 mt-0.5">{cycleStart ? `Iniciado el ${new Date(cycleStart).toLocaleDateString("es-AR")}` : "No configurado"}</p></div>
          <button onClick={() => setShowCycleSetup(true)} className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700">{cycleStart ? "Cambiar" : "Configurar"}</button>
        </div>
      </div>
      {showCycleSetup && (
        <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-4 space-y-3 bounce-in">
          <p className="text-sm font-semibold text-white">¿Cuándo empezaste el ciclo actual?</p>
          <input type="date" className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-3 text-white text-sm focus:outline-none" defaultValue={cycleStart ? new Date(cycleStart).toISOString().slice(0, 10) : todayStr()} id="cycle-date-input" />
          <div className="flex gap-2">
            <button onClick={() => setShowCycleSetup(false)} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-semibold">Cancelar</button>
            <button onClick={() => { const val = document.getElementById("cycle-date-input").value; if (val) { onSetCycleStart(new Date(val)); setShowCycleSetup(false); } }} className="flex-1 py-3 rounded-xl bg-teal-500 !text-white text-sm font-bold">Guardar</button>
          </div>
        </div>
      )}

      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm shadow-md shadow-black/20 space-y-3.5">
        <div><p className="text-sm font-bold text-white">Configuración de descarga</p><p className="text-[11px] text-slate-500 mt-0.5">Cada cuánto llega y cómo se reduce la carga</p></div>
        <div className="grid grid-cols-2 gap-3">
          {[{ key: "trainWeeks", label: "Sem. entrenamiento", min: 2, max: 12 }, { key: "deloadWeeks", label: "Sem. descarga", min: 1, max: 4 }].map(({ key, label, min, max }) => (
            <div key={key} className="bg-slate-950/40 rounded-xl p-3"><p className="text-[10px] text-slate-500 mb-2">{label}</p><div className="flex items-center justify-between"><button onClick={() => adjustSetting(key, -1, min, max)} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 active:scale-95">−</button><span className="text-sm font-black text-white tabular-nums">{settings[key]}</span><button onClick={() => adjustSetting(key, 1, min, max)} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 active:scale-95">+</button></div></div>
          ))}
        </div>
        <div className="bg-slate-950/40 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2"><p className="text-[10px] text-slate-500">Carga en descarga</p><span className="text-[11px] font-bold text-purple-400 tabular-nums">{Math.round(settings.deloadPct * 100)}%</span></div>
          <div className="flex items-center gap-3"><button onClick={() => adjustDeloadPct(-0.05)} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 active:scale-95 shrink-0">−</button><div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${settings.deloadPct * 100}%` }} /></div><button onClick={() => adjustDeloadPct(0.05)} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 active:scale-95 shrink-0">+</button></div>
        </div>
        <div><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Reducción de series</p><div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">{[{ k: 2, l: "Mitad" }, { k: 3, l: "Tercio" }, { k: 4, l: "Cuarto" }].map((opt) => <button key={opt.k} onClick={() => updateSettings({ deloadSetDivisor: opt.k })} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${settings.deloadSetDivisor === opt.k ? "bg-purple-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>)}</div></div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm shadow-md shadow-black/20 space-y-3.5">
        <div><p className="text-sm font-bold text-white">Descanso entre series</p><p className="text-[11px] text-slate-500 mt-0.5">Cómo te avisamos y cuánto dura cada pausa</p></div>
        <div><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Aviso al terminar</p><div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">{[{ k: "sound", l: "Sonido" }, { k: "vibration", l: "Vibración" }, { k: "both", l: "Ambos" }].map((opt) => <button key={opt.k} onClick={() => updateSettings({ alertType: opt.k })} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${settings.alertType === opt.k ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>)}</div></div>
        <div className="grid grid-cols-2 gap-3">
          {[{ key: "restLong", label: "Ejercicios pesados" }, { key: "restShort", label: "Resto" }].map(({ key, label }) => (
            <div key={key} className="bg-slate-950/40 rounded-xl p-3"><p className="text-[10px] text-slate-500 mb-2">{label}</p><div className="flex items-center justify-between"><button onClick={() => adjustRest(key, -15)} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 active:scale-95">−</button><span className="text-sm font-black text-white tabular-nums">{formatTime(settings[key])}</span><button onClick={() => adjustRest(key, 15)} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 active:scale-95">+</button></div></div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-1 pt-2"><Sun size={11} className="text-slate-600" /><p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Apariencia y accesibilidad</p></div>
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm shadow-md shadow-black/20">
        <p className="text-sm font-bold text-white mb-0.5">Apariencia</p>
        <p className="text-[11px] text-slate-500 mb-3">Elegí el tema con el que se ve la app</p>
        <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">
          {[{ k: "dark", l: "Oscuro", icon: <Moon size={13} /> }, { k: "light", l: "Claro", icon: <Sun size={13} /> }].map((opt) => (
            <button key={opt.k} onClick={() => updateSettings({ theme: opt.k })} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${settings.theme === opt.k ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.icon} {opt.l}</button>
          ))}
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm shadow-md shadow-black/20 space-y-4">
        <div>
          <p className="text-sm font-bold text-white mb-0.5">Tamaño de letra</p>
          <p className="text-[11px] text-slate-500 mb-3">Agrandá el texto de toda la app si te resulta más cómodo de leer</p>
          <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">
            {TEXT_SCALE_OPTIONS.map((opt) => (
              <button key={opt.k} onClick={() => updateSettings({ textScale: opt.v })} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${(settings.textScale ?? 1) === opt.v ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>
            ))}
          </div>
        </div>
        <div className="pt-3.5 border-t border-slate-800/50">
          <p className="text-sm font-bold text-white mb-0.5">Letras chicas</p>
          <p className="text-[11px] text-slate-500 mb-3">Consejos de cada ejercicio, récords, RPE y otras etiquetas pequeñas que el control de arriba no agranda</p>
          <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">
            {SMALL_TEXT_SCALE_OPTIONS.map((opt) => (
              <button key={opt.k} onClick={() => updateSettings({ smallTextScale: opt.v })} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${(settings.smallTextScale ?? 1) === opt.v ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>
            ))}
          </div>
        </div>
        <div className="pt-3.5 border-t border-slate-800/50">
          <p className="text-sm font-bold text-white mb-0.5">Zoom con los dedos</p>
          <p className="text-[11px] text-slate-500 mb-3">Viene desactivado para que pellizcar la pantalla por accidente no te desencuadre la app. Activalo si te resulta más cómodo agrandar partes puntuales.</p>
          <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">
            {[{ v: false, l: "Desactivado" }, { v: true, l: "Activado" }].map((opt) => (
              <button key={String(opt.v)} onClick={() => updateSettings({ allowZoom: opt.v })} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${(settings.allowZoom ?? false) === opt.v ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-1 pt-2"><Zap size={11} className="text-slate-600" /><p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Notificaciones</p></div>
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm shadow-md shadow-black/20">
        <p className="text-sm font-bold text-white mb-0.5">Compartir marcas</p>
        <p className="text-[11px] text-slate-500 mb-3">Al lograr una nueva marca, ¿mostramos la imagen para compartir automáticamente?</p>
        <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">
          {[{ v: true, l: "Sí, mostrarla" }, { v: false, l: "No, solo el ícono" }].map((opt) => (
            <button key={String(opt.v)} onClick={() => updateSettings({ autoShowPrShare: opt.v })} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${(settings.autoShowPrShare ?? true) === opt.v ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-1 pt-2"><Download size={11} className="text-slate-600" /><p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Datos</p></div>
      <ExportTrainingCard profileName={profileName} logs={logs} />

      <div className="flex items-center gap-2.5 px-1 text-[11px] text-slate-600">
        <Save size={12} className="text-slate-600 shrink-0" />
        <span>Tus datos se guardan en este dispositivo, con una copia de seguridad automática.</span>
      </div>

      <button onClick={onSignOut} className="w-full flex items-center gap-2 justify-center py-3.5 rounded-2xl border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 transition text-sm font-semibold"><LogOut size={14} /> Cerrar sesión</button>
      {!showDeletePin ? (
        <button onClick={() => setShowDeletePin(true)} className="w-full flex items-center gap-2 justify-center py-3.5 rounded-2xl border border-rose-500/20 text-rose-500/70 hover:text-rose-400 hover:border-rose-500/40 transition text-sm font-semibold"><Trash2 size={14} /> Eliminar perfil de {profileName}</button>
      ) : (
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4 bounce-in">
          <div className="flex items-start gap-2.5 mb-4"><AlertTriangle size={16} className="text-rose-400 mt-0.5 shrink-0" /><p className="text-xs text-rose-400 font-semibold">{profile?.pin ? "Esto borra el perfil y todo el historial de forma permanente. Ingresá tu PIN para confirmar." : "Esto borra el perfil y todo el historial de forma permanente. No se puede deshacer."}</p></div>
          {profile?.pin ? <PinInput label="PIN para confirmar" onComplete={handleDeleteConfirm} error={deleteError} onCancel={() => setShowDeletePin(false)} /> : (
            <div className="flex gap-2"><button onClick={() => setShowDeletePin(false)} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-semibold">Cancelar</button><button onClick={onDelete} className="flex-1 py-3 rounded-xl bg-rose-500 !text-white text-sm font-bold">Eliminar perfil</button></div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   RUTINAS — catálogo (preestablecidas + las que creaste) y creador/editor de
   rutinas propias. Las preestablecidas no se editan in-place: si querés
   modificar una, activala primero y desde "Tus rutinas creadas" no va a
   aparecer (sigue siendo preset) — para algo totalmente tuyo, usá "Crear mi
   propia rutina". Las que SÍ creaste con el editor se pueden modificar
   después con el lápiz, sin tener que borrar y volver a armar todo.
============================================================================ */

// Vista de solo lectura de una rutina (preset o propia): un resumen por día
// con sus ejercicios y cuántas series tiene en total.
function RoutinePreview({ routineDef }) {
  const model = useMemo(() => buildRoutineModel(routineDef), [routineDef]);
  return (
    <div className="space-y-2">
      {model.dayOrder.map((dk) => {
        const d = model.days[dk];
        const totalSets = d.exercises.reduce((a, e) => a + e.sets.length, 0);
        const muted = muteHexColor(d.color);
        return (
          <div key={dk} className="rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-lg flex items-center justify-center text-[8px] font-black shrink-0" style={{ backgroundColor: d.color + "1c", color: muted }}>{d.label.charAt(0)}</span>
              <span className="text-xs font-bold text-white uppercase">{d.label}</span>
              <span className="text-[10px] text-slate-600 ml-auto shrink-0">{d.exercises.length} ejerc. · {totalSets} series</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">{d.exercises.map((ex) => ex.name).join(" · ")}</p>
          </div>
        );
      })}
    </div>
  );
}

// Modal que aparece cuando se abre la app con un link de rutina compartida
// (#shared-routine=...). No la activa sola: sólo la agrega a "Tus rutinas
// creadas" para no interrumpir lo que ya estabas entrenando.
function SharedRoutineImportModal({ routine, onImport, onDiscard }) {
  return (
    <div className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 modal-bg-in" onClick={onDiscard}>
      <div className="bg-slate-900 border border-slate-700/60 rounded-3xl max-w-sm w-full p-5 modal-pop-in shadow-2xl shadow-black/50 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-2xl bg-teal-500/15 text-teal-400 flex items-center justify-center shrink-0"><Share2 size={18} /></div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-teal-400">Rutina compartida</p>
            <h3 className="text-base font-black text-white leading-tight truncate">{routine.name}</h3>
          </div>
        </div>
        <p className="text-sm text-slate-400 mb-3">Te compartieron esta rutina por enlace. ¿Querés agregarla a tus rutinas?</p>
        <RoutinePreview routineDef={routine} />
        <div className="flex gap-2 mt-4">
          <button onClick={onDiscard} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-semibold">Descartar</button>
          <button onClick={onImport} className="flex-1 py-3 rounded-xl bg-teal-500 !text-white text-sm font-bold active:scale-[0.98] transition-all">Agregar a mis rutinas</button>
        </div>
      </div>
    </div>
  );
}

function PresetRoutineCard({ preset, isActive, onUse, onEdit }) {
  const [open, setOpen] = useState(false);
  const dayCount = preset.dayOrder.length;
  const accent = "#A855F7"; // violeta fijo — antes usaba el color del primer día, pero esta tarjeta es de Rutinas, no del día
  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-md shadow-black/20 transition-shadow hover:shadow-lg hover:shadow-black/30">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-800/30 transition">
        <div className="w-2 h-10 rounded-full shrink-0" style={{ backgroundColor: accent, boxShadow: `0 0 10px -2px ${accent}` }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-bold text-white">{preset.name}</h4>
            {isActive && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-lg bg-purple-500/20 text-purple-400 shrink-0">ACTIVA</span>}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">{preset.description}</p>
          <p className="text-[10px] text-slate-600 mt-2">{dayCount} día{dayCount === 1 ? "" : "s"}/semana</p>
        </div>
        <ChevronDown size={16} className={`text-slate-600 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 tab-fade-in space-y-3">
          {preset.recommendation && <p className="text-[11px] text-slate-400 bg-slate-800/40 rounded-xl px-3 py-2 flex items-start gap-1.5"><Info size={12} className="mt-0.5 shrink-0" />{preset.recommendation}</p>}
          <RoutinePreview routineDef={preset} />
          <div className="flex gap-2">
            <button onClick={onUse} disabled={isActive} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition ${isActive ? "bg-slate-800 text-slate-600" : "bg-purple-500 !text-white hover:bg-purple-400 active:scale-[0.98] shadow-lg shadow-purple-500/20"}`}>
              {isActive ? <><Check size={14} /> Ya la estás usando</> : <><Sparkles size={14} /> Usar esta rutina</>}
            </button>
            <button onClick={onEdit} aria-label="Editar una copia de esta rutina" className="px-3.5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition"><Edit3 size={15} /></button>
          </div>
          <p className="text-[10px] text-slate-600 text-center">Editar crea una copia para vos — la preestablecida original no se toca.</p>
        </div>
      )}
    </div>
  );
}

function SavedRoutineRow({ routine, isActive, onUse, onEdit, onShare, onArchive }) {
  const [open, setOpen] = useState(false);
  const dayCount = routine.dayOrder.length;
  const accent = "#A855F7"; // violeta fijo, igual que en PresetRoutineCard
  return (
    <SwipeToArchive confirmText={`¿Quitar "${routine.name}" de tus rutinas? No se borra nada.`} onArchive={onArchive}>
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl px-4 py-3.5 backdrop-blur-sm shadow-md shadow-black/20 transition-shadow hover:shadow-lg hover:shadow-black/30">
        <div className="flex items-center gap-3">
          <div className="w-2 h-10 rounded-full shrink-0" style={{ backgroundColor: accent, boxShadow: `0 0 10px -2px ${accent}` }} />
          <button onClick={() => setOpen((o) => !o)} className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2"><p className="text-sm font-bold text-white truncate">{routine.name}</p>{isActive && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-lg bg-purple-500/20 text-purple-400 shrink-0">ACTIVA</span>}</div>
            <p className="text-[11px] text-slate-500">{dayCount} día{dayCount === 1 ? "" : "s"} · creada por vos</p>
          </button>
          {!isActive && <button onClick={onUse} className="px-3 py-1.5 rounded-lg bg-purple-500/15 text-purple-400 text-xs font-bold shrink-0">Activar</button>}
          <button onClick={onShare} aria-label="Compartir rutina" className="p-2 rounded-lg text-slate-500 hover:text-cyan-400 shrink-0"><Share2 size={14} /></button>
          <button onClick={onEdit} aria-label="Editar rutina" className="p-2 rounded-lg text-slate-500 hover:text-purple-400 shrink-0"><Edit3 size={14} /></button>
        </div>
        {open && <div className="mt-3 pt-3 border-t border-slate-800/50 tab-fade-in"><RoutinePreview routineDef={routine} /></div>}
      </div>
    </SwipeToArchive>
  );
}

// Buscador de ejercicios por grupo muscular (con filtro de texto), para
// agregarlos a un día al crear/editar una rutina. También deja agregar un
// ejercicio propio que no esté en la biblioteca (sin nota técnica ni video).
function ExercisePickerPanel({ existingIds, onAdd, onAddCustom, onClose }) {
  const [group, setGroup] = useState(MUSCLE_GROUPS[0].key);
  const [search, setSearch] = useState("");
  const [customName, setCustomName] = useState("");
  const pool = search.trim()
    ? EXERCISE_LIBRARY.filter((e) => e.name.toLowerCase().includes(search.trim().toLowerCase()))
    : EXERCISE_LIBRARY_BY_GROUP[group];

  return (
    <div className="mt-2.5 bg-slate-950/60 border border-slate-800/60 rounded-2xl p-3 bounce-in">
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar ejercicio…" className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mb-2.5 focus:outline-none focus:border-teal-500/50" />
      {!search.trim() && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
          {MUSCLE_GROUPS.map((g) => (
            <button key={g.key} onClick={() => setGroup(g.key)} className="px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all border shrink-0"
              style={group === g.key ? { backgroundColor: g.color + "22", borderColor: g.color + "55", color: g.color } : { borderColor: "var(--chip-border)", color: "var(--chip-text)" }}>
              {g.label}
            </button>
          ))}
        </div>
      )}
      <div className="max-h-52 overflow-y-auto space-y-1.5 mt-1 -mx-1 px-1">
        {pool.map((e) => {
          const added = existingIds.includes(e.id);
          return (
            <button key={e.id} onClick={() => !added && onAdd(e)} disabled={added} className={`w-full flex items-center gap-2.5 text-left rounded-xl px-2.5 py-2 transition ${added ? "bg-teal-500/10" : "bg-slate-900/60 hover:bg-slate-800/60"}`}>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-white truncate">{e.name}</p>
                <p className="text-[10px] text-slate-500 truncate">{e.nota}</p>
              </div>
              {added ? <Check size={14} className="text-teal-400 shrink-0" /> : <Plus size={14} className="text-teal-400 shrink-0" />}
            </button>
          );
        })}
        {pool.length === 0 && <p className="text-[11px] text-slate-600 text-center py-3">Sin resultados.</p>}
      </div>
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800/60">
        <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="¿No está? Agregá uno propio…" className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500/50" />
        <button onClick={() => { if (customName.trim()) { onAddCustom(customName.trim()); setCustomName(""); } }} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold shrink-0">Agregar</button>
      </div>
      <p className="text-[9px] text-slate-600 mt-1.5">Los ejercicios propios no tienen nota técnica ni video de YouTube.</p>
      <button onClick={onClose} className="w-full mt-3 py-2 rounded-xl text-slate-500 hover:text-slate-300 text-[11px] font-semibold">Cerrar buscador</button>
    </div>
  );
}

const REP_RANGE_OPTIONS = ["1-3", "3-5", "4-6", "6-8", "8-10", "10-12", "12-15", "15-20"];

function BuilderExerciseRow({ ex, canMoveUp, canMoveDown, onMove, onRemove, onConfigChange }) {
  const [editing, setEditing] = useState(false);
  const repRange = ex.sets[0]?.repRange || "8-10";
  const setsCount = ex.sets.length;
  const heavy = isHeavyRepRange(repRange);
  return (
    <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div className="flex flex-col -my-1 shrink-0">
          <button onClick={() => onMove(-1)} disabled={!canMoveUp} className="p-0.5 text-slate-600 hover:text-slate-300 disabled:opacity-20"><ChevronUp size={13} /></button>
          <button onClick={() => onMove(1)} disabled={!canMoveDown} className="p-0.5 text-slate-600 hover:text-slate-300 disabled:opacity-20"><ChevronDown size={13} /></button>
        </div>
        <button onClick={() => !ex.cardio && setEditing((o) => !o)} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-xs font-bold text-white truncate">{ex.name}</p>
            {ex.cardio && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-rose-400/15 text-rose-300 shrink-0 flex items-center gap-0.5"><Footprints size={9} /> CARDIO</span>}
            {!ex.cardio && heavy && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 shrink-0">FUERZA</span>}
            {!ex.libId && <span className="text-[9px] text-slate-600 shrink-0">propio</span>}
          </div>
          <p className="text-[10px] text-slate-500">{ex.cardio ? "Se registra en minutos, no en series" : `${setsCount} series · ${repRange} reps`}</p>
        </button>
        {!ex.cardio && <button onClick={() => setEditing((o) => !o)} className="p-1.5 text-slate-500 hover:text-teal-400 shrink-0"><SlidersHorizontal size={14} /></button>}
        <button onClick={onRemove} className="p-1.5 text-slate-600 hover:text-rose-400 shrink-0"><Trash2 size={14} /></button>
      </div>
      {editing && !ex.cardio && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-800/60 space-y-2.5 bounce-in">
          <div>
            <p className="text-[10px] text-slate-500 mb-1.5">Cantidad de series</p>
            <div className="flex items-center gap-2">
              <button onClick={() => onConfigChange({ setsCount: Math.max(1, setsCount - 1), repRange })} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm active:scale-95">−</button>
              <span className="text-sm font-black text-white w-5 text-center tabular-nums">{setsCount}</span>
              <button onClick={() => onConfigChange({ setsCount: Math.min(6, setsCount + 1), repRange })} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm active:scale-95">+</button>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 mb-1.5">Repeticiones aproximadas</p>
            <div className="flex flex-wrap gap-1.5">
              {REP_RANGE_OPTIONS.map((r) => (
                <button key={r} onClick={() => onConfigChange({ setsCount, repRange: r })} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${repRange === r ? "bg-teal-500 border-teal-500 !text-white" : "border-slate-800 text-slate-500"}`}>{r}</button>
              ))}
            </div>
            {isHeavyRepRange(repRange) && <p className="text-[9px] text-amber-500/80 mt-1.5">Se marca como FUERZA automáticamente (6 reps o menos).</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function BuilderDayCard({ day, dayIdx, totalDays, onRename, onRemove, onMoveDay, onChangeColor, onAddExercise, onAddCustomExercise, onRemoveExercise, onMoveExercise, onConfigExercise, onToggleSuperset }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const existingIds = day.exercises.map((e) => e.id);
  const totalSets = day.exercises.reduce((a, e) => a + (e.sets?.length || 0), 0);
  return (
    <div className="rounded-2xl p-3.5" style={{ backgroundColor: day.color + "0d", border: `1px solid ${day.color}35` }}>
      <div className="flex items-center gap-2 mb-1">
        <button onClick={() => setColorPickerOpen((o) => !o)} aria-label="Cambiar color del día" className="w-7 h-7 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0 transition active:scale-90 ring-1 ring-inset ring-white/10" style={{ backgroundColor: day.color + "25", color: day.color }}>{dayIdx + 1}</button>
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Nombre del día — tocá el número para cambiar el color</p>
      </div>
      {colorPickerOpen && (
        <div className="flex gap-1.5 flex-wrap mb-2.5 ml-9 bounce-in">
          {BUILDER_COLOR_PALETTE.map((c) => (
            <button key={c} onClick={() => { onChangeColor(c); setColorPickerOpen(false); }} aria-label={`Color ${c}`} className="w-7 h-7 rounded-lg shrink-0 transition active:scale-90 flex items-center justify-center" style={{ backgroundColor: c }}>
              {c === day.color && <Check size={14} className="text-white" />}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 mb-3 ml-9">
        <div className="flex flex-col -my-1 shrink-0">
          <button onClick={() => onMoveDay(-1)} disabled={dayIdx === 0} className="p-0.5 text-slate-600 hover:text-slate-300 disabled:opacity-20"><ChevronUp size={13} /></button>
          <button onClick={() => onMoveDay(1)} disabled={dayIdx === totalDays - 1} className="p-0.5 text-slate-600 hover:text-slate-300 disabled:opacity-20"><ChevronDown size={13} /></button>
        </div>
        <div className="flex-1 relative min-w-0">
          <input value={day.label} onChange={(e) => onRename(e.target.value.toUpperCase())} placeholder={`DÍA ${dayIdx + 1}`} className="w-full bg-slate-950/50 border border-slate-700/60 rounded-xl pl-3 pr-8 py-2 text-sm font-black text-white uppercase focus:outline-none transition" style={{ borderColor: day.color + "30" }} />
          <Edit3 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>
        {day.exercises.length > 0 && (
          <span className="text-[10px] font-bold px-2 py-1.5 rounded-lg shrink-0" style={{ backgroundColor: day.color + "18", color: day.color }}>{day.exercises.length} ej. · {totalSets} series</span>
        )}
        {totalDays > 1 && <button onClick={onRemove} className="p-1.5 text-slate-600 hover:text-rose-400 shrink-0"><Trash2 size={14} /></button>}
      </div>

      {day.exercises.length === 0 && <p className="text-[11px] text-slate-600 mb-2">Todavía no agregaste ejercicios a este día.</p>}

      <div className="space-y-1.5">
        {day.exercises.map((ex, i) => (
          <div key={ex.id}>
            <BuilderExerciseRow ex={ex} canMoveUp={i > 0} canMoveDown={i < day.exercises.length - 1}
              onMove={(delta) => onMoveExercise(i, delta)} onRemove={() => onRemoveExercise(i)}
              onConfigChange={(cfg) => onConfigExercise(i, cfg)} />
            {i < day.exercises.length - 1 && (
              <button onClick={() => onToggleSuperset(i)} className="w-full flex items-center justify-center gap-1.5 my-1 py-2 rounded-lg text-[11px] font-bold transition-all active:scale-[0.98] border"
                style={ex.supersetNext ? { backgroundColor: day.color + "22", borderColor: day.color + "60", color: day.color } : { backgroundColor: "transparent", borderColor: "var(--chip-border)", color: "var(--chip-text)", borderStyle: "dashed" }}>
                <Link size={13} /> {ex.supersetNext ? "Superserie activada — tocá para separar" : "+ Vincular en superserie"}
              </button>
            )}
          </div>
        ))}
      </div>

      {!pickerOpen ? (
        <button onClick={() => setPickerOpen(true)} className="w-full flex items-center justify-center gap-1.5 mt-2.5 py-2.5 rounded-xl border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition text-xs font-semibold"><Plus size={13} /> Agregar ejercicio</button>
      ) : (
        <ExercisePickerPanel existingIds={existingIds} onAdd={onAddExercise} onAddCustom={onAddCustomExercise} onClose={() => setPickerOpen(false)} />
      )}
      {day.exercises.length > 0 && (
        <p className="text-[9px] text-slate-600 mt-2">
          {day.exercises.length < 4 ? "Recomendado: entre 4 y 8 ejercicios por sesión." : day.exercises.length > 10 ? "Es bastante para una sola sesión — capaz conviene dividirlo en otro día." : "Buena cantidad de ejercicios para la sesión."}
        </p>
      )}
    </div>
  );
}

const BUILDER_COLOR_PALETTE = ["#14B8A6", "#3B82F6", "#F97316", "#A855F7", "#F43F5E", "#F59E0B", "#06B6D4", "#10B981"];
let _builderUidCounter = 0;
function builderUid(prefix) { _builderUidCounter += 1; return `${prefix}_${Date.now()}_${_builderUidCounter}`; }

// Convierte una rutina ya guardada (forma "cruda": dayOrder + days con
// libId/sets, o id/name/muscle/sets para ejercicios propios) al formato
// interno que usa el editor (RoutineBuilder), para poder editarla. Las
// rutinas creadas con el editor nunca usan idOverride, así que no hace
// falta resolverlo acá.
function builderDaysFromRoutineDef(routineDef) {
  return routineDef.dayOrder.map((dk) => {
    const d = routineDef.days[dk];
    return {
      key: dk,
      label: d.label,
      color: d.color,
      exercises: (d.exercises || []).map((entry) => {
        if (entry.libId) {
          const lib = EXERCISE_LIBRARY_BY_ID[entry.libId];
          return { id: entry.libId, libId: entry.libId, name: lib ? lib.name : entry.libId, muscle: lib ? lib.muscle : "Personalizado", sets: entry.sets, cardio: !!lib?.cardio, supersetNext: !!entry.supersetNext };
        }
        return { id: entry.id, libId: null, name: entry.name, muscle: entry.muscle || "Personalizado", sets: entry.sets, cardio: false, supersetNext: !!entry.supersetNext };
      }),
    };
  });
}

/* ============================================================================
   IMPORTAR RUTINA DESDE UN ARCHIVO (Excel, PDF, Word, CSV, texto plano).

   `xlsx` lee directamente el binario de .xlsx/.xls (hoja por hoja, fila por
   fila). `pdfjs-dist` lee el texto "de verdad" embebido en un PDF (no hace
   falta copiar y pegar). Para Word no hay una librería liviana 100%
   client-side instalada todavía — si subís un .docx, se lo avisa y se le
   pide que copie el texto de adentro (Ctrl+A, Ctrl+C en Word) y lo pegue en
   la caja de texto, que funciona exactamente igual.

   Una vez que hay texto (de cualquiera de esas fuentes, o pegado a mano), un
   parser heurístico hace el resto: detecta los "días" (líneas cortas sin
   números, tipo "Push" o "Día 1") y los ejercicios — tanto en formato libre
   ("Press banca 3x8-10") como en filas de planilla con columnas separadas
   por coma/tabulación (nombre, series, repeticiones en celdas distintas) —
   y busca cada nombre en el catálogo de la app para que el ejercicio
   importado tenga nota técnica y video; si no lo reconoce, lo agrega igual
   como ejercicio personalizado.
============================================================================ */
const SETREP_REGEX = /(\d+)\s*(?:series|sets)?\s*[x×X]\s*(\d+)\s*(?:[-–aA]\s*(\d+))?/;

function normalizeExerciseText(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function matchExerciseToLibrary(rawName) {
  const norm = normalizeExerciseText(rawName);
  if (!norm) return null;
  let best = EXERCISE_LIBRARY.find((e) => normalizeExerciseText(e.name) === norm);
  if (best) return best;
  let bestScore = 0;
  EXERCISE_LIBRARY.forEach((e) => {
    const en = normalizeExerciseText(e.name);
    if (en.includes(norm) || norm.includes(en)) {
      const score = Math.min(en.length, norm.length);
      if (score > bestScore) { bestScore = score; best = e; }
    }
  });
  return bestScore >= 4 ? best : null;
}

function isLikelyDayHeader(line, nextLine) {
  if (SETREP_REGEX.test(line)) return false;
  if (line.length > 40) return false;
  const nextHasSets = nextLine && SETREP_REGEX.test(nextLine);
  const looksLikeHeaderWord = /^(d[ií]a|day|push|pull|legs?|pecho|espalda|hombro|b[íi]ceps|tr[íi]ceps|piernas?|brazos?|torso|upper|lower|full ?body|lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo)/i.test(line);
  return nextHasSets || looksLikeHeaderWord || (line === line.toUpperCase() && /[A-ZÁÉÍÓÚ]/.test(line));
}

// Una fila de planilla suele venir como "Ejercicio,3,8-10" o con tabs en vez
// de comas. Si encontramos una celda puramente numérica (series) y otra que
// parece un rango de reps, reconstruimos una línea "Nombre 3x8-10" para que
// el mismo parser de texto libre la pueda procesar sin duplicar lógica.
function spreadsheetRowToFreeTextLine(line) {
  if (!/[,\t]/.test(line)) return line;
  const cells = line.split(/\t|,/).map((c) => c.trim()).filter((c) => c !== "");
  if (cells.length < 2) return line;
  let setsCell = null, repsCell = null, nameCells = [];
  cells.forEach((c) => {
    if (/^\d+$/.test(c) && setsCell == null && parseInt(c, 10) <= 10) { setsCell = c; return; }
    if (/^\d+\s*-\s*\d+$/.test(c) && repsCell == null) { repsCell = c.replace(/\s+/g, ""); return; }
    if (/^\d+$/.test(c) && repsCell == null) { repsCell = c; return; }
    nameCells.push(c);
  });
  if (setsCell && repsCell && nameCells.length) return `${nameCells.join(" ")} ${setsCell}x${repsCell}`;
  return line;
}

// Parsea texto libre (extraído de un PDF/Excel, o pegado a mano) y devuelve
// una lista de "días" con sus ejercicios ya resueltos.
function parseRoutineFromText(rawText) {
  const lines = String(rawText || "").split(/\r?\n/)
    .map((l) => spreadsheetRowToFreeTextLine(l.replace(/^[-•*\d.)\s]+/, "").trim()))
    .filter(Boolean);
  const days = [];
  let current = null;
  lines.forEach((line, i) => {
    const m = line.match(SETREP_REGEX);
    if (m) {
      if (!current) { current = { label: "DÍA 1", exercises: [] }; days.push(current); }
      const setsCount = Math.max(1, Math.min(8, parseInt(m[1], 10) || 3));
      const repLow = m[2], repHigh = m[3] || m[2];
      const repRange = repHigh && repHigh !== repLow ? `${repLow}-${repHigh}` : `${repLow}`;
      const namePart = line.slice(0, m.index).replace(/[-:–]\s*$/, "").trim() || `Ejercicio ${current.exercises.length + 1}`;
      const lib = matchExerciseToLibrary(namePart);
      current.exercises.push(lib
        ? { libId: lib.id, sets: mkSets(setsCount, repRange) }
        : { id: builderUid("imported"), name: namePart, muscle: "Personalizado", sets: mkSets(setsCount, repRange) });
    } else if (isLikelyDayHeader(line, lines[i + 1])) {
      current = { label: line.replace(/[:：]\s*$/, "").toUpperCase(), exercises: [] };
      days.push(current);
    }
  });
  return days.filter((d) => d.exercises.length > 0);
}

function buildImportedRoutineDef(parsedDays, name) {
  const dayOrder = [];
  const daysObj = {};
  parsedDays.forEach((d, i) => {
    const key = builderUid("imported_day");
    dayOrder.push(key);
    daysObj[key] = { label: d.label || `Día ${i + 1}`, description: "", color: BUILDER_COLOR_PALETTE[i % BUILDER_COLOR_PALETTE.length], exercises: d.exercises };
  });
  return { name: name || "Rutina importada", source: "custom", description: "Importada automáticamente desde un archivo.", recommendation: "", dayOrder, days: daysObj };
}

// --- Lectura real de archivos binarios (xlsx/pdfjs-dist) ---
// Carga perezosa (import() dinámico) para no sumar peso al bundle inicial de
// la app si la persona nunca usa "Importar rutina".
async function extractTextFromExcelFile(file) {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  return wb.SheetNames.map((name) => XLSX.utils.sheet_to_csv(wb.Sheets[name], { FS: "\t" })).join("\n");
}

async function extractTextFromPdfFile(file) {
  const pdfjsLib = await import("pdfjs-dist");
  // El worker corre la lectura en otro hilo — se apunta a la misma versión
  // instalada vía CDN para no tener que configurar el bundler a mano.
  if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  }
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let fullText = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Reconstruye saltos de línea agrupando los fragmentos de texto por su
    // posición vertical — pdf.js no devuelve líneas, devuelve fragmentos
    // sueltos con coordenadas.
    let lastY = null, pageText = "";
    content.items.forEach((item) => {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) pageText += "\n";
      else if (lastY !== null) pageText += " ";
      pageText += item.str;
      lastY = y;
    });
    fullText += pageText + "\n";
  }
  return fullText;
}

// Modal de importación: subís un archivo (.pdf/.xlsx/.xls/.csv/.txt) o
// pegás texto a mano, se detecta la rutina, y se muestra una vista previa
// antes de crearla — así, si el parser interpretó mal algo, lo notás antes
// de guardar nada.
/* ============================================================================
   ENTRENADOR IA — chat con un asistente que tiene tu historial de
   entrenamiento como contexto (se lo manda a Gemini en el prompt de
   sistema antes de tu pregunta, así puede responder con tus datos reales
   en vez de en abstracto). El pedido a Gemini ya no lo hace el navegador
   directo: llama a "/api/ia" (ver api/ia.js), que es la que tiene la
   clave real y nunca la expone — ver el comentario al principio del
   archivo.

   Puede proponer ACCIONES reales sobre la app (crear o activar una
   rutina, editar el perfil, cambiar configuración de ciclo/descarga,
   apariencia o descanso) — pero nunca las aplica solo: siempre las pide
   en un bloque de texto especial (ver parseAction), que se muestra como
   una tarjeta de confirmación con su propia vista previa cuando
   corresponde (una rutina, por ejemplo, se ve completa día por día antes
   de guardarla). Sólo se aplica algo si la persona toca "Confirmar".
============================================================================ */

// Markdown bien liviano para los mensajes del asistente — Gemini responde
// con **negrita** y listas con guion casi siempre, pero como antes el chat
// mostraba el texto crudo, esos asteriscos y guiones quedaban tal cual en
// vez de aplicarse. Esto separa el texto en bloques (párrafos y listas) y
// dentro de cada uno resuelve **negrita** — nada más que eso, a propósito
// (no hace falta un parser de markdown completo para una respuesta de chat).
function renderChatMarkdown(text) {
  if (!text) return null;
  const renderInline = (str, key) => {
    const parts = String(str).split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== "");
    return parts.map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return <strong key={`${key}-${j}`} className="font-bold text-white">{part.slice(2, -2)}</strong>;
      }
      return <span key={`${key}-${j}`}>{part}</span>;
    });
  };
  const lines = String(text).split("\n");
  const blocks = [];
  let currentList = null;
  const flushList = () => { if (currentList) { blocks.push(currentList); currentList = null; } };
  lines.forEach((line) => {
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)/);
    if (bulletMatch) {
      if (!currentList) currentList = { type: "ul", items: [] };
      currentList.items.push(bulletMatch[1]);
    } else {
      flushList();
      if (line.trim()) blocks.push({ type: "p", text: line });
    }
  });
  flushList();
  return blocks.map((b, i) => {
    if (b.type === "ul") {
      return (
        <ul key={i} className="list-disc list-outside ml-4 space-y-0.5 my-1.5">
          {b.items.map((item, j) => <li key={j}>{renderInline(item, `${i}-${j}`)}</li>)}
        </ul>
      );
    }
    return <p key={i} className={i > 0 ? "mt-1.5" : ""}>{renderInline(b.text, i)}</p>;
  });
}

// Extrae el bloque de acción propuesta (si lo hay) del texto crudo que
// devuelve Gemini, y lo separa del texto que se le muestra a la persona.
function parseAction(rawText) {
  const match = rawText.match(/###ACCION###([\s\S]*?)###FIN###/);
  if (!match) return { text: rawText, action: null };
  const cleanText = rawText.replace(match[0], "").trim();
  try {
    const parsed = JSON.parse(match[1].trim());
    if (!parsed?.type) return { text: cleanText, action: null };
    return { text: cleanText, action: parsed };
  } catch (err) {
    console.error("No se pudo interpretar la acción propuesta:", err);
    return { text: cleanText, action: null };
  }
}

// A partir de la acción que propuso el modelo, arma el "plan": qué
// mostrar en la tarjeta de confirmación, y qué función llamar si la
// persona confirma. Si la acción no se puede interpretar (por ejemplo,
// "activar_rutina" con un nombre que no existe), devuelve null — en ese
// caso no se muestra ninguna tarjeta, sólo el texto del mensaje.
function buildActionPlan(action, ctx) {
  const { profile, settings, onCreateRoutine, onActivateRoutine, onUpdateProfile, onUpdateSettings, onAddMeasurement } = ctx;
  if (action.type === "crear_rutina") {
    const days = (action.days || []).map((d) => ({
      label: String(d.label || "Día"),
      exercises: (d.exercises || []).map((ex) => {
        const lib = matchExerciseToLibrary(ex.name);
        const sets = Array.from({ length: Math.max(1, Math.min(8, ex.setsCount || 3)) }, () => ({ repRange: ex.repRange || "8-10" }));
        return lib ? { libId: lib.id, sets } : { id: builderUid("imported"), name: ex.name || "Ejercicio", muscle: "Personalizado", sets };
      }),
    }));
    if (!days.length) return null;
    const def = buildImportedRoutineDef(days, action.name || "Rutina propuesta");
    return { kind: "routine", title: `Crear "${def.name}"`, routineDef: def, confirmLabel: "Crear y guardar", confirm: () => onCreateRoutine(builderUid("ai_routine"), def) };
  }
  if (action.type === "activar_rutina") {
    const wanted = String(action.routineName || "").toLowerCase().trim();
    if (!wanted) return null;
    let foundId = null, foundDef = null, isPreset = false;
    Object.entries(profile?.routines || {}).forEach(([id, def]) => {
      if (!foundId && !def?.archived && def?.name?.toLowerCase().includes(wanted)) { foundId = id; foundDef = def; }
    });
    if (!foundId) {
      const preset = PRESET_ROUTINES.find((p) => p.name.toLowerCase().includes(wanted));
      if (preset) { foundId = preset.id; foundDef = preset; isPreset = true; }
    }
    if (!foundId) return null;
    return { kind: "routine", title: `Activar "${foundDef.name}"`, routineDef: foundDef, confirmLabel: "Activar esta rutina", confirm: () => onActivateRoutine(foundId, isPreset ? cloneRoutineDef(foundDef) : null) };
  }
  if (action.type === "editar_perfil") {
    const patch = {}; const items = [];
    let newWeight = null;
    if (action.sex === "M" || action.sex === "F") { patch.sex = action.sex; items.push(`Sexo: ${action.sex === "M" ? "Masculino" : "Femenino"}`); }
    if (action.age) { patch.age = parseInt(action.age, 10); items.push(`Edad: ${patch.age} años`); }
    // El peso ya NO se guarda directo en settings acá — pasa por
    // onAddMeasurement, el mismo camino que si lo cargaras a mano en
    // Progreso → Medidas, así queda en su historial con fecha (y de paso
    // sigue actualizando settings.bodyWeightKg por detrás, como siempre).
    if (action.bodyWeightKg) { newWeight = parseFloat(action.bodyWeightKg); items.push(`Peso corporal: ${newWeight}kg`); }
    if (action.email) { patch.email = action.email; items.push(`Email: ${action.email}`); }
    if (!items.length) return null;
    return {
      kind: "list", title: "Actualizar tu perfil", items, confirmLabel: "Guardar cambios",
      confirm: () => { if (Object.keys(patch).length) onUpdateProfile(patch); if (newWeight != null) onAddMeasurement?.("weight", newWeight); },
    };
  }
  if (action.type === "config_ciclo") {
    const patch = {}; const items = [];
    if (action.trainWeeks) { patch.trainWeeks = Math.min(12, Math.max(2, action.trainWeeks)); items.push(`Semanas de entrenamiento: ${patch.trainWeeks}`); }
    if (action.deloadWeeks) { patch.deloadWeeks = Math.min(4, Math.max(1, action.deloadWeeks)); items.push(`Semanas de descarga: ${patch.deloadWeeks}`); }
    if (action.deloadPct) { patch.deloadPct = Math.min(0.95, Math.max(0.5, action.deloadPct)); items.push(`Carga en descarga: ${Math.round(patch.deloadPct * 100)}%`); }
    if (action.deloadSetDivisor) { patch.deloadSetDivisor = action.deloadSetDivisor; items.push(`Reducción de series: ÷${action.deloadSetDivisor}`); }
    if (!items.length) return null;
    return { kind: "list", title: "Cambiar configuración de ciclo y descarga", items, confirmLabel: "Aplicar cambios", confirm: () => onUpdateSettings(patch) };
  }
  if (action.type === "config_apariencia") {
    if (action.theme !== "dark" && action.theme !== "light") return null;
    return { kind: "list", title: "Cambiar apariencia", items: [`Tema: ${action.theme === "light" ? "Claro" : "Oscuro"}`], confirmLabel: "Aplicar", confirm: () => onUpdateSettings({ theme: action.theme }) };
  }
  if (action.type === "config_descanso") {
    const patch = {}; const items = [];
    if (["sound", "vibration", "both"].includes(action.alertType)) { patch.alertType = action.alertType; items.push(`Aviso al terminar: ${{ sound: "Sonido", vibration: "Vibración", both: "Ambos" }[action.alertType]}`); }
    if (action.restLong) { patch.restLong = Math.min(600, Math.max(30, action.restLong)); items.push(`Descanso ejercicios pesados: ${patch.restLong}s`); }
    if (action.restShort) { patch.restShort = Math.min(600, Math.max(30, action.restShort)); items.push(`Descanso resto: ${patch.restShort}s`); }
    if (!items.length) return null;
    return { kind: "list", title: "Cambiar descanso entre series", items, confirmLabel: "Aplicar", confirm: () => onUpdateSettings(patch) };
  }
  return null;
}

// Recorta el historial que se manda a la IA: para cada serie, sólo los
// últimos N registros (no toda la vida de la cuenta). En perfiles con
// meses de historial, mandar TODO agranda mucho el pedido — y un pedido
// más grande es, ni más ni menos, una respuesta más lenta (la IA tiene
// que "leer" más antes de poder empezar a contestar). Para responder con
// criterio sobre cómo venís, los últimos registros alcanzan de sobra; los
// récords corregidos a mano (_pr_override) se mandan completos siempre,
// son un solo objeto chico cada uno, no pesan nada.
const AI_LOG_HISTORY_LIMIT = 12;
function trimLogsForAI(logs) {
  const out = {};
  Object.entries(logs || {}).forEach(([key, val]) => {
    if (key.endsWith("_pr_override") || !Array.isArray(val)) { out[key] = val; return; }
    out[key] = val.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-AI_LOG_HISTORY_LIMIT);
  });
  return out;
}

function EntrenadorIAChat({ profile, logs, profileName, messages, setMessages, settings, onCreateRoutine, onActivateRoutine, onUpdateProfile, onUpdateSettings, onAddMeasurement }) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef(null);
  // Sin este guardado, el efecto de "bajar al último mensaje" también se
  // disparaba al recién entrar a la pestaña (con un solo mensaje de
  // bienvenida, sin nada para desplazar) — eso alcanzaba para que el
  // navegador recalculara el alto visible de la pantalla un instante
  // (por ejemplo, si el navegador del celular ajusta su propia barra),
  // y la barra de escribir (fija abajo de todo) se veía saltar un
  // microsegundo antes de asentarse. Ahora ese scroll inicial se saltea.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  const enviarMensajeIA = async (userText) => {
    const newMessages = [...messages, { role: "user", text: userText }];
    setMessages(newMessages);
    setInput("");
    setIsSending(true);
    try {
      // Antes esto sólo le mandaba los NOMBRES de las rutinas guardadas —
      // por eso no podía ver qué ejercicios tenía cada una, sólo los
      // récords sueltos en logs. Ahora se resuelve cada rutina (incluida
      // la activa, las creadas/editadas, y las archivadas) a su estructura
      // real día por día — lo mismo que ve la persona en la pestaña
      // Rutinas — y se manda completo. Lo único que sigue recortado es el
      // texto largo (nota técnica, video) de cada ejercicio: no aporta
      // nada para responder y agranda el pedido sin necesidad.
      const allRoutines = Object.entries(profile?.routines || {}).map(([id, entry]) => {
        const resolved = resolveRoutineDef(entry, id);
        if (!resolved) return null;
        let dias = [];
        try {
          const model = buildRoutineModel(resolved);
          dias = model.dayOrder.map((dk) => {
            const d = model.days[dk];
            return { dia: d.label, ejercicios: d.exercises.map((ex) => ({ nombre: ex.name, musculo: ex.muscle, series: ex.sets.length, repeticionesPorSerie: ex.sets.map((s) => s.repRange) })) };
          });
        } catch (err) {
          console.error("No se pudo resolver una rutina para el contexto de la IA:", id, err);
        }
        return { id, nombre: resolved.name, esLaActiva: id === profile?.activeRoutineId, archivada: !!entry.archived, origen: entry.source || "custom", dias };
      }).filter(Boolean);
      const context = {
        perfil: { nombre: profileName, email: profile?.email || null, sexo: profile?.sex || null, edad: profile?.age || null, miembroDesde: profile?.joinedAt || null },
        rutinaActivaId: profile?.activeRoutineId || null,
        rutinas: allRoutines,
        configuracionActual: settings,
        logs: trimLogsForAI(logs),
      };
      const systemPrompt = `Sos un entrenador personal y coach de fuerza con dominio profundo y actualizado de la ciencia del entrenamiento — no sólo frases motivacionales genéricas. Hablás en español rioplatense, breve y cercano.

Aplicá estos marcos cuando sean relevantes para lo que te preguntan (no los recites si no vienen al caso):
- Sobrecarga progresiva como motor del progreso a largo plazo — no es sólo "subir el peso": también cuenta más reps, más series, mejor técnica, o más frecuencia.
- El volumen semanal por grupo muscular es el principal driver de hipertrofia dentro de rangos razonables; la intensidad (%1RM) y el RIR/RPE son las palancas principales de la fuerza máxima.
- La hipertrofia ocurre en un rango amplio de repeticiones (aprox. 5 a 30) si las series se llevan cerca del fallo — 6-12 reps es un punto dulce práctico, no "el" rango mágico.
- Entrenar cada grupo muscular 2 o más veces por semana suele ser igual o mejor que 1 vez, para el mismo volumen semanal total.
- Especificidad (SAID): el cuerpo se adapta a la demanda puntual impuesta — para mejorar en un levantamiento específico, hay que practicarlo.
- Periodización (lineal, por bloques, ondulante) y manejo de la fatiga: la descarga existe porque la fatiga se acumula más rápido que la capacidad cuando el volumen/intensidad sostenidos son altos.
- RPE/RIR como autorregulación práctica cuando no se conoce el 1RM exacto.
- Ante un estancamiento, lo primero a revisar suele ser adherencia (sueño, proteína ~1.6-2.2g/kg, consistencia) antes de asumir que hace falta "más intensidad" sin más contexto.
- No reforcés mitos sin evidencia (reducción localizada de grasa, "tonificar" como algo distinto de hipertrofia + grasa corporal, el dolor muscular como métrica de si "sirvió" el entrenamiento).

Antes de responder, revisá en silencio que tu respuesta resuelva exactamente lo que te preguntaron — no un tema parecido ni una versión genérica — y que cubra todas las partes si la pregunta tenía varias. Interpretá la intención real aunque venga en jerga informal o mal escrita. Si la pregunta es genérica o ambigua y la respuesta cambia mucho según un dato que no tenés (objetivo, experiencia, qué ejercicio), pedí ESE dato puntual en vez de adivinar — pero si ya tenés lo necesario en el historial o el contexto de abajo, respondé directo sin preguntar de más.

Cuando tu respuesta se apoye en evidencia científica concreta (un estudio, una guía clínica, una revisión sistemática, una cifra puntual), buscá un respaldo real si hace falta — tenés acceso a resultados de búsqueda actuales para fundamentarla con fuentes reales en vez de citar de memoria. Nunca inventes un estudio, un autor o un link que no exista. No escribas vos los links ni los nombres de los estudios dentro del texto de tu respuesta — las fuentes reales que se usen se muestran aparte, debajo de tu mensaje, de forma automática. Si no encontrás un respaldo real, está bien responder sin citar nada en vez de inventarlo.

Tenés acceso a los datos reales de esta persona en el siguiente JSON — usalos para responder con precisión (fechas, pesos, repeticiones, y la estructura real de sus rutinas día por día), nunca inventes datos que no estén ahí. "rutinas" incluye TODAS sus rutinas (activa, creadas, editadas y archivadas) con sus días y ejercicios completos — las marcadas "archivada":true no están visibles para ella en la pestaña Rutinas salvo que las recupere, tenelo en cuenta si te pregunta qué tiene disponible ahora. "logs" trae sólo los últimos registros de cada serie (no el historial completo) — alcanza para evaluar tendencia reciente, pero si te preguntan por una marca muy vieja que no aparece, decilo en vez de inventar un valor. Respuestas cortas, 2 a 4 oraciones salvo que te pidan más detalle o la pregunta lo amerite. Para dar formato a tu texto podés usar **negrita** y listas con guion (-), nada más — no uses títulos, tablas, ni bloques de código.

Si la persona te pide explícitamente hacer un cambio en la app, respondé primero tu explicación normal y agregá AL FINAL, en una línea aparte, un bloque con ESTE formato exacto (sin texto markdown alrededor, sin comillas triples, nada más en esa línea):
###ACCION###{"type":"TIPO", ...campos...}###FIN###

Tipos disponibles:
- crear_rutina: {"type":"crear_rutina","name":"...","days":[{"label":"Día 1","exercises":[{"name":"Press Banca","setsCount":3,"repRange":"8-10"}]}]}
- activar_rutina: {"type":"activar_rutina","routineName":"nombre o parte del nombre de una rutina que ya tenga guardada (mirá la lista en rutinas)"}
- editar_perfil: {"type":"editar_perfil","sex":"M"|"F","age":30,"bodyWeightKg":80,"email":"..."} (incluí sólo los campos que pidió cambiar)
- config_ciclo: {"type":"config_ciclo","trainWeeks":4,"deloadWeeks":1,"deloadPct":0.6,"deloadSetDivisor":2} (deloadPct es la fracción de su récord, ej. 0.6 = 60%; deloadSetDivisor: 2 = mitad de series, 3 = un tercio, 4 = un cuarto)
- config_apariencia: {"type":"config_apariencia","theme":"dark"|"light"}
- config_descanso: {"type":"config_descanso","alertType":"sound"|"vibration"|"both","restLong":120,"restShort":60} (segundos)

Reglas importantes: nunca digas que ya aplicaste el cambio — la persona siempre tiene que confirmarlo desde un botón antes de que se aplique de verdad. Agregá el bloque ###ACCION### sólo si pidió ESE cambio puntual en este mensaje o el anterior, nunca como sugerencia general no pedida.

Datos: ${JSON.stringify(context)}`;
      const history = newMessages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] }));
      // El pedido a Gemini ya no lo hace el navegador directo: lo hace
      // /api/ia (función serverless de Vercel — ver api/ia.js), que tiene
      // la clave real en una variable de entorno del servidor y nunca la
      // expone, y que activa la búsqueda con Google cuando hace falta
      // respaldar una afirmación científica — devuelve el texto y, si
      // corresponde, las fuentes reales que usó (ver "sources" más abajo).
      const response = await fetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "chat", systemPrompt, history })
      });

      if (!response.ok) throw new Error("Error en el servidor");
      const result = await response.json();

      const rawReply = result?.text;
      const sources = Array.isArray(result?.sources) ? result.sources : [];
      if (!rawReply) { setMessages((prev) => [...prev, { role: "assistant", text: "No se me ocurrió una respuesta — probá de nuevo." }]); return; }

      const { text, action } = parseAction(rawReply);
      const plan = action ? buildActionPlan(action, { profile, settings, onCreateRoutine, onActivateRoutine, onUpdateProfile, onUpdateSettings, onAddMeasurement }) : null;
      setMessages((prev) => [...prev, { role: "assistant", text, plan, planStatus: plan ? "pending" : null, sources }]);
    } catch (err) {
      console.error("Error al hablar con el entrenador IA:", err);
      setMessages((prev) => [...prev, { role: "assistant", text: "Uy, no me pude conectar. Probá de nuevo en un momento 🙏" }]);
    } finally {
      setIsSending(false);
    }
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    enviarMensajeIA(trimmed);
  };

  const handleConfirmPlan = (msgIndex) => {
    const plan = messages[msgIndex]?.plan;
    if (!plan) return;
    plan.confirm();
    setMessages((prev) => prev.map((m, i) => (i === msgIndex ? { ...m, planStatus: "confirmed" } : m)));
  };
  const handleDiscardPlan = (msgIndex) => {
    setMessages((prev) => prev.map((m, i) => (i === msgIndex ? { ...m, planStatus: "discarded" } : m)));
  };

  // Dictado por voz — Web Speech API, nativa del navegador (sin librerías
  // nuevas). No todos los navegadores la tienen (Firefox de escritorio,
  // por ejemplo, no) — si no está disponible, el botón del micrófono
  // simplemente no se muestra, en vez de mostrar un botón roto.
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const SpeechRecognitionAPI = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  useEffect(() => () => { try { recognitionRef.current?.stop(); } catch { } }, []);
  const handleMicToggle = () => {
    if (!SpeechRecognitionAPI) return;
    if (isListening) { recognitionRef.current?.stop(); return; }
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "es-AR";
    recognition.interimResults = true;
    // Antes esto estaba en false: el navegador cortaba la escucha solo, a
    // los pocos segundos de detectar una pausa — aunque siguieras
    // hablando después. Con continuous=true sigue escuchando todo lo que
    // digas hasta que VOS toques el botón de nuevo para confirmar que
    // terminaste (ver el ícono de tilde más abajo, en vez del micrófono,
    // mientras está escuchando).
    recognition.continuous = true;
    recognition.onresult = (e) => { setInput(Array.from(e.results).map((r) => r[0].transcript).join(" ")); };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    try { recognition.start(); setIsListening(true); } catch { setIsListening(false); }
  };

  return (
    <div className="pb-32">
      <div className="relative overflow-hidden rounded-2xl border border-teal-500/20 p-5 mb-3" style={{ background: "var(--grad-hero-teal)" }}>
        <div className="absolute -top-8 -right-6 w-32 h-32 rounded-full bg-teal-500/15 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full bg-cyan-500/10 blur-2xl pointer-events-none" />
        <div className="relative flex items-center gap-2 mb-1">
          <Sparkles size={16} className="text-teal-400" />
          <span className="text-[11px] font-black uppercase tracking-widest text-teal-400">Tu asistente</span>
        </div>
        <h2 className="relative text-xl font-black text-white leading-tight">Entrenador IA</h2>
        <p className="relative text-xs text-teal-300/60 mt-1">Conoce tu historial real de entrenamiento — preguntale lo que quieras</p>
      </div>

      {/* Qué puede hacer, en una sola fila chica con scroll horizontal —
          en vez de un párrafo largo que ocupa media pantalla apenas
          entrás. */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 mb-4">
        {[
          { icon: <Layers size={11} />, label: "Crear o activar rutinas" },
          { icon: <UserCog size={11} />, label: "Editar tu perfil" },
          { icon: <Calendar size={11} />, label: "Ciclo y descarga" },
          { icon: <Sun size={11} />, label: "Apariencia" },
          { icon: <Award size={11} />, label: "Cita estudios reales" },
        ].map((c, i) => (
          <span key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-300 text-[10px] font-bold whitespace-nowrap shrink-0">{c.icon}{c.label}</span>
        ))}
      </div>

      <div className="space-y-3">
        {messages.map((m, i) => (
          <div key={i}>
            <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "!text-white" : "bg-slate-900/60 border border-slate-800/60 text-slate-200"}`}
                style={m.role === "user" ? { background: "linear-gradient(135deg,#14B8A6,#0E7490)" } : {}}
              >
                {m.role === "assistant" ? renderChatMarkdown(m.text) : m.text}
              </div>
            </div>
            {/* Fuentes reales que usó la IA (búsqueda con Google, ver
                api/ia.js) — chips chicos con link, separados del
                texto de la respuesta para que no se confundan con algo
                que la IA escribió por su cuenta. */}
            {m.sources && m.sources.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5 max-w-[85%]">
                {m.sources.map((s, j) => (
                  <a key={j} href={s.uri} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/60 border border-slate-700/50 text-[10px] text-slate-400 hover:text-teal-300 hover:border-teal-500/40 transition truncate max-w-[170px]">
                    <Link2 size={9} className="shrink-0" />{s.title || "Fuente"}
                  </a>
                ))}
              </div>
            )}
            {m.plan && m.planStatus === "pending" && (
              <div className="mt-2 bg-slate-900/70 border border-teal-500/25 rounded-2xl p-3.5 max-w-[85%] bounce-in">
                <p className="text-sm font-bold text-white mb-2.5">{m.plan.title}</p>
                {m.plan.kind === "routine" ? (
                  <div className="mb-3"><RoutinePreview routineDef={m.plan.routineDef} /></div>
                ) : (
                  <ul className="mb-3 space-y-1">
                    {m.plan.items.map((item, j) => <li key={j} className="text-[11px] text-slate-400 flex items-start gap-1.5"><span className="text-teal-400 mt-0.5">•</span>{item}</li>)}
                  </ul>
                )}
                <div className="flex gap-2">
                  <button onClick={() => handleConfirmPlan(i)} className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold transition-all active:scale-[0.98]" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)" }}>{m.plan.confirmLabel}</button>
                  <button onClick={() => handleDiscardPlan(i)} className="px-3.5 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-xs font-bold transition">Descartar</button>
                </div>
              </div>
            )}
            {m.plan && m.planStatus === "confirmed" && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold max-w-[85%]"><Check size={12} /> Listo, aplicado.</div>
            )}
            {m.plan && m.planStatus === "discarded" && (
              <div className="mt-2 text-[11px] text-slate-600 max-w-[85%]">Descartado.</div>
            )}
          </div>
        ))}
        {isSending && (
          <div className="flex justify-start">
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl px-4 py-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" style={{ animationDelay: "0.15s" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" style={{ animationDelay: "0.3s" }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* El input fijo va por un portal, afuera del árbol normal del
          componente, a propósito: el contenedor de cada pestaña (en
          App()) tiene la animación "tab-fade-in", que anima un
          translateY — y cualquier ancestro con una transformación activa
          (aunque sea por una animación CSS) pasa a ser, mientras dura, el
          punto de referencia de TODO lo que esté "fixed" adentro suyo, en
          vez del viewport real. Por eso el input aparecía arriba un
          instante y recién se acomodaba abajo cuando la animación
          terminaba (a los 250ms) y el navegador volvía a calcular su
          posición contra la pantalla real. Renderizándolo directo en
          document.body, queda totalmente afuera de esa animación, así que
          desde el primer frame está exactamente donde tiene que estar. */}
      {typeof document !== "undefined" && createPortal(
        <div className="fixed bottom-20 lg:bottom-6 left-0 right-0 z-10 px-4 lg:pl-56">
          <div className="max-w-xl lg:max-w-3xl xl:max-w-4xl mx-auto">
            <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800/60 rounded-2xl p-1.5 backdrop-blur-xl shadow-lg shadow-black/30">
              {SpeechRecognitionAPI && (
                <button onClick={handleMicToggle} aria-label={isListening ? "Confirmar — terminé de hablar" : "Hablar"} className={`p-2.5 rounded-xl shrink-0 transition-all active:scale-95 ${isListening ? "bg-emerald-500 !text-white animate-pulse" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}>
                  {isListening ? <Check size={16} /> : <Mic size={16} />}
                </button>
              )}
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
                placeholder={isListening ? "Escuchando... tocá el ✓ cuando termines" : "Preguntale algo a tu entrenador..."}
                className="flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none min-w-0"
                disabled={isSending}
              />
              <button onClick={handleSend} disabled={!input.trim() || isSending} aria-label="Enviar" className="p-2.5 rounded-xl text-white shrink-0 disabled:opacity-40 transition-all active:scale-95" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)" }}>
                <Send size={16} />
              </button>
            </div>
            <p className="text-[9px] text-slate-700 text-center mt-1.5">Puede cometer errores — no reemplaza el consejo de un profesional de la salud.</p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}


function ImportRoutineModal({ onImport, onClose }) {
  const [text, setText] = useState("");
  const [routineName, setRoutineName] = useState("");
  const [parsed, setParsed] = useState(null);
  const [notice, setNotice] = useState("");
  const [loadingFile, setLoadingFile] = useState(false);
  const [isParsingAI, setIsParsingAI] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    setNotice(""); setLoadingFile(true);
    try {
      if (["xlsx", "xls"].includes(ext)) {
        setText(await extractTextFromExcelFile(file));
      } else if (ext === "pdf") {
        setText(await extractTextFromPdfFile(file));
      } else if (["csv", "txt"].includes(ext)) {
        setText(await file.text());
      } else if (ext === "docx" || ext === "doc") {
        setNotice("Todavía no podemos leer el binario de Word directamente. Abrí el archivo, copiá todo el texto (Ctrl+A, Ctrl+C) y pegalo abajo — funciona igual de bien.");
      } else {
        setNotice("Formato no reconocido. Probá con .pdf, .xlsx, .xls, .csv, .txt, o pegá el texto directamente.");
      }
    } catch (err) {
      console.error("Error leyendo el archivo:", err);
      setNotice("No pudimos leer ese archivo. Probá copiando y pegando el texto directamente abajo.");
    } finally {
      setLoadingFile(false);
    }
  };

  const handleProcess = () => {
    const parsedDays = parseRoutineFromText(text);
    if (!parsedDays.length) { setNotice("No pudimos detectar ejercicios. Revisá que cada uno tenga un patrón como \"Press banca 3x8-10\" (o, si es una planilla, columnas de series y repeticiones)."); return; }
    setNotice("");
    setParsed(buildImportedRoutineDef(parsedDays, routineName.trim() || "Rutina importada"));
  };

  // Detección con IA: en vez de patrones de texto, le pide a un modelo de
  // lenguaje que entienda la rutina y devuelva días/ejercicios en JSON —
  // útil para formatos más libres que el detector de patrones no capta.
  // El pedido a Gemini lo hace /api/ia (función serverless de Vercel — ver
  // api/ia.js) — la clave real nunca llega al navegador.
  const handleProcessAI = async () => {
    setIsParsingAI(true);
    setNotice("");
    try {
      const response = await fetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "detect", text })
      });

      if (!response.ok) throw new Error("Error en el servidor");
      const result = await response.json();

      const rawText = result?.text;
      if (!rawText) throw new Error("respuesta vacía");
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      const days = JSON.parse(cleaned);
      if (!Array.isArray(days) || !days.length) throw new Error("formato inesperado");

      const parsedDays = days.map((d) => ({
        label: String(d.label || "Día").toUpperCase(),
        exercises: (d.exercises || []).map((ex) => {
          const lib = matchExerciseToLibrary(ex.name);
          const sets = Array.from({ length: Math.max(1, Math.min(8, ex.setsCount || 3)) }, () => ({ repRange: ex.repRange || "8-10" }));
          return lib ? { libId: lib.id, sets } : { id: builderUid("imported"), name: ex.name || "Ejercicio", muscle: "Personalizado", sets };
        }),
      }));
      setParsed(buildImportedRoutineDef(parsedDays, routineName.trim() || "Rutina importada"));
    } catch (err) {
      console.error("Error detectando rutina con IA:", err);
      setNotice("No pudimos detectar la rutina. Asegurate de que el texto sea claro o probá copiarlo de nuevo.");
    } finally {
      setIsParsingAI(false);
    }
  };

  if (parsed) {
    return (
      <div className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 modal-bg-in" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-700/60 rounded-3xl max-w-sm w-full p-5 modal-pop-in shadow-2xl shadow-black/50 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/15 text-teal-400 flex items-center justify-center shrink-0"><Sparkles size={18} /></div>
            <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-widest text-teal-400">Vista previa</p><h3 className="text-base font-black text-white leading-tight truncate">{parsed.name}</h3></div>
          </div>
          <p className="text-sm text-slate-400 mb-3">Así interpretamos tu archivo. Revisalo — si algo quedó mal, lo podés corregir después editando la rutina desde Rutinas.</p>
          <RoutinePreview routineDef={parsed} />
          <div className="flex gap-2 mt-4">
            <button onClick={() => setParsed(null)} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-semibold">Volver</button>
            <button onClick={() => onImport(parsed)} className="flex-1 py-3 rounded-xl bg-teal-500 !text-white text-sm font-bold active:scale-[0.98] transition-all">Crear rutina</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 modal-bg-in" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/60 rounded-3xl max-w-sm w-full p-5 modal-pop-in shadow-2xl shadow-black/50 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-black text-white">Importar rutina</h3>
          <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition"><X size={18} /></button>
        </div>
        <p className="text-[12px] text-slate-400 mb-3 leading-relaxed">Subí tu rutina en .pdf, .xlsx, .xls, .csv o .txt — la leemos directo. Para Word, copiá y pegá el texto acá abajo. Un ejercicio por línea (o por fila, si es una planilla), con un patrón tipo <span className="text-slate-300 font-semibold">"Press banca 3x8-10"</span>; el nombre del día (Push, Pecho, Día 1...) va solo en su propia línea.</p>
        <label className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-teal-500/40 transition cursor-pointer text-sm font-semibold mb-3">
          <Download size={15} className="rotate-180" /> {loadingFile ? "Leyendo archivo…" : "Subir archivo (PDF, Excel, CSV, TXT)"}
          <input type="file" accept=".pdf,.xlsx,.xls,.csv,.txt,.docx,.doc" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} disabled={loadingFile} />
        </label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={"Push\nPress banca 3x8-10\nPress militar 3x8-10\n\nPull\nDominadas 3x8-10\n..."} className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-teal-500/50 mb-3" />
        <input value={routineName} onChange={(e) => setRoutineName(e.target.value)} placeholder="Nombre para la rutina (opcional)" className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl px-3 py-2.5 text-white text-sm mb-3 focus:outline-none focus:border-teal-500/60" />
        {notice && <p className="text-[11px] text-amber-400 mb-3 leading-relaxed">{notice}</p>}
        <button onClick={handleProcess} disabled={!text.trim() || loadingFile} className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold transition-all active:scale-[0.98] ${text.trim() && !loadingFile ? "text-white shadow-lg shadow-teal-500/20" : "bg-slate-800 text-slate-600"}`} style={text.trim() && !loadingFile ? { background: "linear-gradient(135deg,#14B8A6,#0E7490)" } : {}}>
          <Sparkles size={15} /> Detectar rutina
        </button>
        <button onClick={handleProcessAI} disabled={!text.trim() || loadingFile || isParsingAI} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition text-sm font-semibold mt-2 disabled:opacity-50">
          {isParsingAI ? <><RotateCcw size={14} className="animate-spin" /> Analizando rutina con Inteligencia Artificial...</> : <><Sparkles size={14} /> Detectar con IA</>}
        </button>
        <p className="text-[10px] text-slate-600 mt-2 text-center">"Detectar con IA" necesita estar conectado a internet y haber iniciado sesión — si falla, usá "Detectar rutina" de arriba.</p>
      </div>
    </div>
  );
}

/* ============================================================================
   WEEKLY SCHEDULE EDITOR — una fila por día de la semana (lunes a domingo),
   cada una con chips para elegir qué día de la rutina (o descanso) le
   corresponde. Permite repetir días de la rutina dentro de la semana (por
   ej. Upper/Lower entrenado 4 veces: lun=Upper, mar=Lower, jue=Upper,
   vie=Lower). Se usa tanto al crear/editar una rutina como, después, para
   ajustarle el cronograma a cualquier rutina ya activa (incluidas las
   preestablecidas) desde Rutinas.
============================================================================ */
function WeeklyScheduleEditor({ dayOrder, days, schedule, onChange }) {
  return (
    <div className="space-y-1.5">
      {WEEKDAY_KEYS.map((wk, i) => {
        const current = schedule[wk] || null;
        return (
          <div key={wk} className="flex items-center gap-2">
            <span className="w-8 text-[11px] font-bold text-slate-500 shrink-0">{WEEKDAY_SHORT_LABELS[i]}</span>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 flex-1 -mx-1 px-1">
              <button onClick={() => onChange(wk, null)} className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all active:scale-95 border shrink-0"
                style={!current ? { backgroundColor: "var(--surface-2)", borderColor: "var(--surface-2)", color: "var(--surface-2-text)" } : { borderColor: "var(--chip-border)", color: "var(--chip-text)" }}>
                Descanso
              </button>
              {dayOrder.map((dk) => {
                const d = days[dk]; if (!d) return null;
                const active = current === dk;
                return (
                  <button key={dk} onClick={() => onChange(wk, dk)} className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap transition-all active:scale-95 border shrink-0"
                    style={active ? { background: d.color, borderColor: d.color, color: "#fff" } : { borderColor: "var(--chip-border)", color: "var(--chip-text)" }}>
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RoutineBuilder({ initialRoutine, onCancel, onSave }) {
  const isEditing = !!initialRoutine;
  const [name, setName] = useState(initialRoutine?.name || "");
  const [days, setDays] = useState(() => (initialRoutine ? builderDaysFromRoutineDef(initialRoutine) : [{ key: builderUid("day"), label: "DÍA 1", color: BUILDER_COLOR_PALETTE[0], exercises: [] }]));
  const [schedule, setSchedule] = useState(() => getRoutineWeekSchedule(initialRoutine || { dayOrder: days.map((d) => d.key) }));
  const [error, setError] = useState("");

  const addDay = () => setDays((d) => [...d, { key: builderUid("day"), label: `DÍA ${d.length + 1}`, color: BUILDER_COLOR_PALETTE[d.length % BUILDER_COLOR_PALETTE.length], exercises: [] }]);
  const removeDay = (idx) => {
    setDays((d) => {
      const removedKey = d[idx]?.key;
      if (removedKey) setSchedule((prevSched) => { const next = { ...prevSched }; WEEKDAY_KEYS.forEach((wk) => { if (next[wk] === removedKey) next[wk] = null; }); return next; });
      return d.filter((_, i) => i !== idx);
    });
  };
  const moveDay = (idx, delta) => setDays((d) => { const j = idx + delta; if (j < 0 || j >= d.length) return d; const n = [...d]; [n[idx], n[j]] = [n[j], n[idx]]; return n; });
  const renameDay = (idx, label) => setDays((d) => d.map((day, i) => (i === idx ? { ...day, label } : day)));
  // Cambiar el color de un día NUNCA toca `logs` — el color sólo vive
  // adentro de la rutina (day.color), separado por completo del historial
  // de marcas (que se guarda por id de ejercicio + número de serie, sin
  // importar nada de la rutina). Por eso cambiar colores, renombrar días,
  // o reordenar ejercicios nunca borra ni "resetea" tus récords — eso
  // sigue intacto pase lo que pase acá.
  const changeDayColor = (idx, color) => setDays((d) => d.map((day, i) => (i === idx ? { ...day, color } : day)));
  const updateScheduleDay = (wk, dayKeyOrNull) => setSchedule((prev) => ({ ...prev, [wk]: dayKeyOrNull }));

  const addExercise = (dayIdx, libEx) => setDays((d) => d.map((day, i) => {
    if (i !== dayIdx || day.exercises.some((e) => e.id === libEx.id)) return day;
    // Cardio no se piensa en "series" — entra como una sola sesión, sin
    // rango de repeticiones (no aplica). El resto sigue igual: 3 series
    // de 8-10 por defecto, editable después con el selector de siempre.
    const sets = libEx.cardio ? mkSets(1, "") : mkSets(3, "8-10");
    return { ...day, exercises: [...day.exercises, { id: libEx.id, libId: libEx.id, name: libEx.name, muscle: libEx.muscle, sets, cardio: !!libEx.cardio, supersetNext: false }] };
  }));
  const addCustomExercise = (dayIdx, rawName) => setDays((d) => d.map((day, i) => (i !== dayIdx ? day : {
    ...day, exercises: [...day.exercises, { id: builderUid("custom"), libId: null, name: rawName, muscle: "Personalizado", sets: mkSets(3, "8-10"), cardio: false, supersetNext: false }],
  })));
  const removeExercise = (dayIdx, exIdx) => setDays((d) => d.map((day, i) => (i === dayIdx ? { ...day, exercises: day.exercises.filter((_, j) => j !== exIdx) } : day)));
  const moveExercise = (dayIdx, exIdx, delta) => setDays((d) => d.map((day, i) => {
    if (i !== dayIdx) return day;
    const j = exIdx + delta; if (j < 0 || j >= day.exercises.length) return day;
    const n = [...day.exercises]; [n[exIdx], n[j]] = [n[j], n[exIdx]]; return { ...day, exercises: n };
  }));
  const configExercise = (dayIdx, exIdx, { setsCount, repRange }) => setDays((d) => d.map((day, i) => (i !== dayIdx ? day : {
    ...day, exercises: day.exercises.map((e, j) => (j === exIdx ? { ...e, sets: mkSets(setsCount, repRange) } : e)),
  })));
  // Encadena (o desencadena) este ejercicio con el siguiente de la lista
  // en una superserie — se hacen uno después del otro sin descansar, y
  // recién descansás al completar la vuelta completa del grupo. Sólo
  // tiene sentido si hay un "siguiente" (no en el último ejercicio del día).
  const toggleSuperset = (dayIdx, exIdx) => setDays((d) => d.map((day, i) => (i !== dayIdx ? day : {
    ...day, exercises: day.exercises.map((e, j) => (j === exIdx ? { ...e, supersetNext: !e.supersetNext } : e)),
  })));

  const handleSave = () => {
    if (!name.trim()) { setError("Ponele un nombre a tu rutina."); return; }
    if (!days.length) { setError("Agregá al menos un día."); return; }
    if (days.some((d) => d.exercises.length === 0)) { setError("Cada día necesita al menos un ejercicio."); return; }
    const dayOrder = days.map((d) => d.key);
    const daysObj = {};
    days.forEach((d) => {
      daysObj[d.key] = {
        label: d.label.trim() || "Día",
        description: "",
        color: d.color,
        exercises: d.exercises.map((e) => (e.libId ? { libId: e.libId, sets: e.sets, supersetNext: !!e.supersetNext } : { id: e.id, name: e.name, muscle: e.muscle, sets: e.sets, supersetNext: !!e.supersetNext })),
      };
    });
    onSave({ name: name.trim(), source: "custom", description: "Rutina creada por vos.", recommendation: "", dayOrder, days: daysObj, weekSchedule: schedule });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onCancel} className="p-2 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition shrink-0"><ChevronDown size={18} className="rotate-90" /></button>
        <h2 className="text-base font-black text-white">{isEditing ? "Editá tu rutina" : "Creá tu rutina"}</h2>
      </div>

      <div>
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Nombre de la rutina</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Mi rutina de verano" className="w-full bg-slate-900/80 border border-slate-700/50 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-teal-500/60" />
      </div>

      <div className="space-y-3">
        {days.map((day, idx) => (
          <BuilderDayCard key={day.key} day={day} dayIdx={idx} totalDays={days.length}
            onRename={(label) => renameDay(idx, label)} onRemove={() => removeDay(idx)} onMoveDay={(delta) => moveDay(idx, delta)} onChangeColor={(color) => changeDayColor(idx, color)}
            onAddExercise={(libEx) => addExercise(idx, libEx)} onAddCustomExercise={(rawName) => addCustomExercise(idx, rawName)}
            onRemoveExercise={(exIdx) => removeExercise(idx, exIdx)} onMoveExercise={(exIdx, delta) => moveExercise(idx, exIdx, delta)}
            onConfigExercise={(exIdx, cfg) => configExercise(idx, exIdx, cfg)} onToggleSuperset={(exIdx) => toggleSuperset(idx, exIdx)} />
        ))}
      </div>

      <button onClick={addDay} className="w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition text-sm font-semibold"><Plus size={14} /> Agregar día</button>

      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 space-y-2.5">
        <div>
          <p className="text-sm font-bold text-white">¿Qué día de la semana entrenás cada uno?</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Por defecto los ubicamos de corrido desde el lunes. Podés repetir días (ej. Upper lunes y jueves) o dejar descanso donde quieras.</p>
        </div>
        <WeeklyScheduleEditor dayOrder={days.map((d) => d.key)} days={Object.fromEntries(days.map((d) => [d.key, d]))} schedule={schedule} onChange={updateScheduleDay} />
      </div>

      {error && <p className="text-xs text-rose-400 text-center">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 py-3.5 rounded-2xl bg-slate-800 text-slate-300 text-sm font-semibold">Cancelar</button>
        <button onClick={handleSave} className="flex-1 py-3.5 rounded-2xl bg-teal-500 !text-white text-sm font-bold active:scale-[0.98] transition-all shadow-lg shadow-teal-500/20">{isEditing ? "Guardar cambios" : "Guardar rutina"}</button>
      </div>
    </div>
  );
}

/* ============================================================================
   RUTINAS VIEW — pantalla principal: rutina activa, las que ya guardaste, el
   catálogo de preestablecidas, y el botón para crear una propia o importar
   una desde un archivo. Es la misma pantalla que se muestra a la fuerza
   (forced=true) cuando un perfil nuevo todavía no eligió ninguna rutina.
============================================================================ */
function RoutinesView({ profile, forced, onActivate, onUpdate, onArchive, onRestore }) {
  const [mode, setMode] = useState("catalog");
  const [editingRoutineId, setEditingRoutineId] = useState(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  const [pendingActivation, setPendingActivation] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showArchivedRoutines, setShowArchivedRoutines] = useState(false);
  const routines = profile?.routines || {};
  const activeId = profile?.activeRoutineId;
  const activeDef = resolveRoutineDef(routines[activeId], activeId);
  const customEntries = Object.entries(routines).filter(([, r]) => r.source !== "preset" && !r.archived);
  const archivedEntries = Object.entries(routines).filter(([, r]) => r.source !== "preset" && r.archived);

  const activeStats = useMemo(() => {
    if (!activeDef) return { days: 0, exercises: 0, sets: 0 };
    let exercises = 0, sets = 0;
    activeDef.dayOrder.forEach((dk) => { const exs = activeDef.days[dk]?.exercises || []; exercises += exs.length; exs.forEach((e) => { sets += e.sets?.length || 0; }); });
    return { days: activeDef.dayOrder.length, exercises, sets };
  }, [activeDef]);

  const activeSchedule = activeDef ? getRoutineWeekSchedule(activeDef) : {};
  const updateActiveScheduleDay = (wk, dayKeyOrNull) => { onUpdate(activeId, { ...activeDef, weekSchedule: { ...activeSchedule, [wk]: dayKeyOrNull } }); };

  // Activar una rutina recién elegida (preset clonado, recién creada, o
  // recién importada de un archivo) pasa primero por "¿qué días entrenás
  // cada cosa?" — así no hay que ir después a Rutinas a configurarlo
  // aparte. Reactivar una rutina YA guardada (que ya tiene su propio
  // cronograma) no pasa por este paso, va directo.
  const handleUseClick = (id, def) => {
    if (def) { setPendingActivation({ id, def: { ...def, weekSchedule: getRoutineWeekSchedule(def) } }); setMode("scheduleSetup"); }
    else onActivate(id, null);
  };
  // "Editar" en una preestablecida no la modifica a ella (cualquier rutina
  // con source:"preset" siempre se resincroniza con el catálogo en vivo,
  // así que editar el clon original no serviría de nada) — en cambio,
  // crea una copia personal con source:"custom" y abre el armador ahí.
  const handleEditPreset = (preset) => {
    const newId = builderUid("custom_routine");
    const clone = { ...cloneRoutineDef(preset), source: "custom", name: `${preset.name} (mi copia)` };
    onUpdate(newId, clone);
    setEditingRoutineId(newId);
    setMode("builder");
  };
  const updatePendingScheduleDay = (wk, dayKeyOrNull) => {
    setPendingActivation((prev) => (prev ? { ...prev, def: { ...prev.def, weekSchedule: { ...prev.def.weekSchedule, [wk]: dayKeyOrNull } } } : prev));
  };
  const confirmPendingActivation = () => {
    if (!pendingActivation) return;
    onActivate(pendingActivation.id, pendingActivation.def);
    setPendingActivation(null);
    setMode("catalog");
  };

  if (mode === "scheduleSetup" && pendingActivation) {
    const { def } = pendingActivation;
    return (
      <div className="space-y-4">
        <div className="text-center pt-2 pb-1">
          <div className="w-14 h-14 rounded-2xl bg-purple-500/15 flex items-center justify-center mx-auto mb-3"><Calendar className="text-purple-500" size={26} /></div>
          <h2 className="text-lg font-black text-white">¿Qué días entrenás "{def.name}"?</h2>
          <p className="text-sm text-slate-500 mt-1.5 leading-relaxed px-2">Ya armamos un cronograma por defecto de lunes a domingo — lo podés dejar así o cambiarlo. Esto te evita tener que venir después a configurarlo.</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4">
          <WeeklyScheduleEditor dayOrder={def.dayOrder} days={def.days} schedule={def.weekSchedule} onChange={updatePendingScheduleDay} />
        </div>
        <button onClick={confirmPendingActivation} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white text-sm font-bold transition-all active:scale-[0.98] shadow-lg shadow-purple-500/20" style={{ background: "linear-gradient(135deg,#A855F7,#7E22CE)" }}><Check size={15} /> Listo, empezar a entrenar</button>
      </div>
    );
  }

  if (mode === "builder") {
    return (
      <RoutineBuilder
        initialRoutine={editingRoutineId ? routines[editingRoutineId] : null}
        onCancel={() => { setMode("catalog"); setEditingRoutineId(null); }}
        onSave={(def) => {
          if (editingRoutineId) { onUpdate(editingRoutineId, def); setMode("catalog"); setEditingRoutineId(null); }
          else { handleUseClick(builderUid("custom_routine"), def); setEditingRoutineId(null); }
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {forced && (
        <div className="text-center pt-2 pb-1">
          <div className="w-14 h-14 rounded-2xl bg-purple-500/15 flex items-center justify-center mx-auto mb-3"><Layers className="text-purple-500" size={26} /></div>
          <h2 className="text-lg font-black text-white">¿Cómo vas a entrenar?</h2>
          <p className="text-sm text-slate-500 mt-1.5 leading-relaxed px-2">Elegí una rutina ya armada, creá la tuya desde cero, o importá una que ya tengas escrita. La vas a poder cambiar cuando quieras.</p>
        </div>
      )}

      {!forced && (
        <div className="relative overflow-hidden rounded-2xl border border-purple-500/20 p-5" style={{ background: "var(--grad-hero-purple)" }}>
          <div className="absolute -top-8 -right-6 w-32 h-32 rounded-full bg-purple-500/15 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full bg-fuchsia-500/10 blur-2xl pointer-events-none" />
          <div className="relative flex items-center gap-2 mb-1">
            <Layers size={16} className="text-purple-400" />
            <span className="text-[11px] font-black uppercase tracking-widest text-purple-400">Tu plan de entrenamiento</span>
          </div>
          <h2 className="relative text-xl font-black text-white leading-tight">Rutinas</h2>
          <p className="relative text-xs text-purple-300/60 mt-1">Elegí cómo entrenar: una rutina ya armada o una creada por vos</p>
        </div>
      )}

      {!forced && activeDef && (
        <div className="relative overflow-hidden rounded-2xl border border-purple-500/25 p-4 shadow-md shadow-black/20" style={{ background: "var(--grad-hero-purple)" }}>
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-purple-500/20 blur-3xl pointer-events-none" />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0"><Dumbbell size={17} /></div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-purple-300">Tu rutina activa</span>
              <h3 className="text-base font-black text-white leading-tight">{activeDef.name}</h3>
            </div>
            <button onClick={() => setShareTarget(activeDef)} aria-label="Compartir rutina activa" className="p-2 rounded-xl text-purple-200 hover:text-white hover:bg-white/10 transition shrink-0"><Share2 size={15} /></button>
          </div>
          {activeDef.description && <p className="relative text-[11px] text-slate-400 mt-2.5">{activeDef.description}</p>}
          <div className="relative grid grid-cols-3 gap-2 mt-3.5">
            <div className="bg-black/20 rounded-xl p-2 text-center"><p className="text-sm font-black text-white tabular-nums">{activeStats.days}</p><p className="text-[9px] text-slate-500 mt-0.5">Días</p></div>
            <div className="bg-black/20 rounded-xl p-2 text-center"><p className="text-sm font-black text-white tabular-nums">{activeStats.exercises}</p><p className="text-[9px] text-slate-500 mt-0.5">Ejercicios</p></div>
            <div className="bg-black/20 rounded-xl p-2 text-center"><p className="text-sm font-black text-white tabular-nums">{activeStats.sets}</p><p className="text-[9px] text-slate-500 mt-0.5">Series</p></div>
          </div>
          <button onClick={() => setShowSchedule((s) => !s)} className="relative w-full flex items-center justify-center gap-1.5 mt-3 py-2 rounded-xl border border-white/10 text-purple-200 hover:text-white transition text-[11px] font-bold">
            <Calendar size={11} /> {showSchedule ? "Ocultar" : "Configurar"} días de la semana
          </button>
          {showSchedule && (
            <div className="relative mt-3 pt-3 border-t border-white/10 tab-fade-in">
              <p className="text-[11px] text-slate-400 mb-2.5">Elegí qué día de tu rutina (o descanso) le toca a cada día de la semana. Podés repetir días.</p>
              <WeeklyScheduleEditor dayOrder={activeDef.dayOrder} days={activeDef.days} schedule={activeSchedule} onChange={updateActiveScheduleDay} />
            </div>
          )}
        </div>
      )}

      {customEntries.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2"><ListChecks size={13} className="text-slate-500" /><p className="text-xs font-black uppercase tracking-widest text-slate-500">Tus rutinas creadas</p></div>
          <div className="space-y-2">
            {customEntries.map(([id, r]) => (
              <SavedRoutineRow key={id} routine={r} isActive={id === activeId} onUse={() => handleUseClick(id, null)}
                onEdit={() => { setEditingRoutineId(id); setMode("builder"); }} onShare={() => setShareTarget(r)} onArchive={() => onArchive(id)} />
            ))}
          </div>
          <p className="text-[10px] text-slate-700 mt-2">Deslizá una rutina hacia la derecha para quitarla de esta lista sin borrarla.</p>
        </div>
      )}

      {archivedEntries.length > 0 && (
        <div>
          {!showArchivedRoutines ? (
            <button onClick={() => setShowArchivedRoutines(true)} className="text-[11px] text-slate-600 hover:text-slate-400 font-semibold underline">Rutinas archivadas ({archivedEntries.length})</button>
          ) : (
            <div>
              <div className="flex items-center gap-1.5 mb-2"><ListChecks size={13} className="text-slate-500" /><p className="text-xs font-black uppercase tracking-widest text-slate-500">Rutinas archivadas</p></div>
              <div className="space-y-2">
                {archivedEntries.map(([id, r]) => (
                  <div key={id} className="flex items-center gap-3 bg-slate-900/30 border border-slate-800/40 rounded-2xl px-4 py-3">
                    <p className="text-sm font-semibold text-slate-400 flex-1 min-w-0 truncate">{r.name}</p>
                    <button onClick={() => onRestore(id)} className="px-3 py-1.5 rounded-lg bg-purple-500/15 text-purple-400 text-xs font-bold shrink-0">Restaurar</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center gap-1.5 mb-2"><Sparkles size={13} className="text-slate-500" /><p className="text-xs font-black uppercase tracking-widest text-slate-500">Rutinas preestablecidas</p></div>
        <div className="space-y-2">
          {PRESET_ROUTINES.map((preset) => (
            <PresetRoutineCard key={preset.id} preset={preset} isActive={preset.id === activeId} onUse={() => handleUseClick(preset.id, cloneRoutineDef(preset))} onEdit={() => handleEditPreset(preset)} />
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => { setEditingRoutineId(null); setMode("builder"); }} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white text-sm font-bold transition-all active:scale-[0.98] shadow-lg shadow-purple-500/20" style={{ background: "linear-gradient(135deg,#A855F7,#7E22CE)" }}><Sparkles size={15} /> Crear mi rutina</button>
        <button onClick={() => setShowImport(true)} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition text-sm font-bold active:scale-[0.98]"><Download size={15} /> Importar rutina</button>
      </div>

      {shareTarget && (
        <ShareLinkModal
          title="Compartir rutina"
          shareTitle={`Mi rutina: ${shareTarget.name}`}
          shareText={`Mirá mi rutina "${shareTarget.name}" en Mi Rutina 💪`}
          shareTarget={shareTarget}
          onClose={() => setShareTarget(null)}
        />
      )}

      {showImport && (
        <ImportRoutineModal
          onImport={(def) => { setShowImport(false); handleUseClick(builderUid("imported_routine"), def); }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}

/* ============================================================================
   NAVIGATION — bottom bar on mobile, side rail from lg breakpoint up. El
   perfil ya no es una pestaña: se accede tocando el avatar (ver header en
   App() y el avatar de arriba en SideNav).
   "Descarga" dejó de ser una pestaña propia — ahora es un botón dentro de
   "Rutina" (debajo de "Iniciar sesión"), porque no es algo que se consulte
   tan seguido como para merecer un lugar fijo en la barra. En su lugar
   entra "Entrenador IA", el chat con el asistente de entrenamiento.
============================================================================ */
const NAV_TABS = [
  { key: "rutina", icon: <Dumbbell size={20} />, label: "Rutina" },
  { key: "progreso", icon: <BarChart3 size={20} />, label: "Progreso" },
  { key: "rutinas", icon: <Layers size={20} />, label: "Rutinas" },
  { key: "entrenador_ia", icon: <Sparkles size={20} />, label: "Entrenador IA" },
];

function BottomBar({ tab, setTab }) {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/50">
      <div className="max-w-xl mx-auto flex">
        {NAV_TABS.map(({ key, icon, label }) => (
          <button key={key} onClick={() => setTab(key)} className="flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-all active:scale-95">
            <span className={`transition-all ${tab === key ? "text-teal-400" : "text-slate-600"}`}>{icon}</span>
            <span className={`text-[9px] font-bold uppercase tracking-wider transition-all ${tab === key ? "text-teal-400" : "text-slate-700"}`}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SideNav({ tab, setTab, profileName }) {
  const initial = profileName.charAt(0).toUpperCase();
  return (
    <div className="hidden lg:flex lg:flex-col lg:w-56 lg:shrink-0 lg:h-screen lg:sticky lg:top-0 border-r border-slate-800/50 bg-[#0a0a0f]/60 px-3 py-6">
      <div className="flex items-center gap-2.5 px-2 mb-8">
        <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-teal-500/30 to-teal-500/5 border border-teal-500/20 flex items-center justify-center shrink-0"><Flame className="text-teal-500" size={18} /></div>
        <span className="font-black text-white text-sm tracking-tight">Mi Rutina</span>
      </div>
      <button onClick={() => setTab("perfil")} className={`w-full flex items-center gap-3 px-3 py-2.5 mb-3 rounded-xl text-sm font-semibold transition-all ${tab === "perfil" ? "bg-teal-500/15 text-teal-400" : "text-slate-500 hover:text-slate-300 hover:bg-slate-900/60"}`}>
        <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black text-white shrink-0" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)" }}>{initial}</div>
        <span className="truncate">{profileName}</span>
      </button>
      <div className="space-y-1">
        {NAV_TABS.map(({ key, icon, label }) => (
          <button key={key} onClick={() => setTab(key)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === key ? "bg-teal-500/15 text-teal-400" : "text-slate-500 hover:text-slate-300 hover:bg-slate-900/60"}`}>
            <span className={tab === key ? "text-teal-400" : "text-slate-600"}>{icon}</span>
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const TAB_TITLES = { rutinas: "Rutinas", rutina: "Rutina", progreso: "Progreso", descarga: "Descarga", perfil: "Perfil", entrenador_ia: "Entrenador IA" };

/* ============================================================================
   APP ROOT
============================================================================ */
export default function App() {
  const [profiles, setProfiles] = useState(loadProfiles);
  const [activeProfile, setActiveProfile] = useState(null);
  const [tab, setTab] = useState("rutina");
  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);
  const [aiChatMessages, setAiChatMessages] = useState([
    { role: "assistant", text: "¡Hola! Soy tu entrenador IA — tengo a la vista tu historial de entrenamiento. Preguntame sobre tu rutina, tus marcas o tu progreso." },
  ]);
  const [cycleStart, setCycleStartState] = useState(loadCycleStart);
  const [showHelp, setShowHelp] = useState(false);
  const [helpStartTab, setHelpStartTab] = useState(null);
  const [recoveredNotice, setRecoveredNotice] = useState(false);

  // Auto-sync a Firestore con debounce de 4 segundos — cada vez que
  // `profiles` cambia (cualquier serie guardada, cualquier configuración
  // tocada, cualquier medida nueva) y hay una cuenta de Google vinculada,
  // se sube el perfil completo a la nube. El debounce evita spamear
  // Firestore con cada keystroke. Cuando el celular está offline, Firestore
  // encola el write y lo sube cuando vuelve la conexión — automáticamente,
  // sin que tengamos que hacer nada extra acá.
  const debouncedSync = useMemo(() => debounce((prof, name) => {
    const p = prof[name];
    if (p?.googleUid) syncProfileToCloud(p.googleUid, { ...p, name });
  }, 4000), []);
  useEffect(() => {
    if (activeProfile && profiles[activeProfile]) debouncedSync(profiles, activeProfile);
  }, [profiles, activeProfile]);
  // perfil — antes, con un solo perfil sin PIN en el dispositivo, tocar ese
  // botón no parecía hacer nada porque te re-logueaba al instante. En una
  // carga nueva de la página este estado vuelve a su valor inicial (false),
  // así que el auto-login normal al abrir la app sigue funcionando igual.
  const [justLoggedOut, setJustLoggedOut] = useState(false);

  useEffect(() => {
    const saved = loadActive();
    if (saved && profiles[saved] && !profiles[saved].pin) setActiveProfile(saved);
  }, []);

  // Persiste, una sola vez al montar, la migración de perfiles viejos (los
  // que tenían `maxesSetupDays` y ahora necesitan `routines`/`activeRoutineId`).
  useEffect(() => { saveProfiles(profiles); }, []);

  // One-time recovery: if localStorage looks empty, see if IndexedDB has a backup.
  useEffect(() => {
    if (Object.keys(profiles).length > 0) return;
    (async () => {
      const restored = await tryRestoreFromIDB();
      if (restored?.profiles && Object.keys(restored.profiles).length) {
        const migrated = {};
        Object.entries(restored.profiles).forEach(([name, p]) => { migrated[name] = migrateProfile(p); });
        setProfiles(migrated);
        saveProfiles(migrated);
        setRecoveredNotice(true);
        if (restored.cycleStart) setCycleStartState(new Date(restored.cycleStart));
        const savedActive = restored.active;
        if (savedActive && migrated[savedActive] && !migrated[savedActive].pin) setActiveProfile(savedActive);
        setTimeout(() => setRecoveredNotice(false), 6000);
      }
    })();
  }, []);

  const profile = profiles[activeProfile], logs = profile?.logs || {}, drafts = profile?.drafts || {};
  const themeClass = getProfileSettings(profile).theme === "light" ? "light-mode" : "";

  // Tamaño de letra (Perfil → Tamaño de letra): se aplica como font-size del
  // <html>, así que todo lo que esté en rem (la mayoría de los tamaños de
  // texto de Tailwind) escala junto y en proporción. Sin perfil activo (o
  // sin esta preferencia guardada) queda en el tamaño normal de siempre.
  const textScale = profile ? (getProfileSettings(profile).textScale ?? 1) : 1;
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.style.fontSize = `${16 * textScale}px`;
  }, [textScale]);
  // Zoom con los dedos (Perfil → Zoom): por defecto viene DESACTIVADO —
  // sin esto, pellizcar la pantalla por accidente mientras entrenás (o
  // doble-tap en un botón) puede dejarte la app desencuadrada. Se controla
  // de verdad ajustando la etiqueta <meta name="viewport"> del documento
  // (si no existe todavía, se crea) — `user-scalable=no` + `maximum-scale=1`
  // es lo que efectivamente bloquea el pellizco para agrandar en la
  // mayoría de los navegadores.
  const allowZoom = profile ? !!getProfileSettings(profile).allowZoom : false;
  useEffect(() => {
    if (typeof document === "undefined") return;
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "viewport"; document.head.appendChild(meta); }
    meta.content = allowZoom
      ? "width=device-width, initial-scale=1, viewport-fit=cover"
      : "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
  }, [allowZoom]);
  // Letras chicas (Perfil → Tamaño de letra → "Letras chicas"): multiplica
  // los text-[Npx] fijos (consejos, récords, RPE, badges...) — ver la
  // variable --small-text-scale en ANIMATION_CSS. Se pasa como custom
  // property inline en los contenedores raíz más abajo, no en el <html>.
  const smallTextScale = profile ? (getProfileSettings(profile).smallTextScale ?? 1) : 1;

  // La rutina activa del perfil actual (o Push / Pull / Pierna + Hombros / Brazos
  // como respaldo) se recalcula en cada render — así
  // ROUTINE/DAY_ORDER/EXERCISE_BY_ID/KEY_TO_DAY siempre reflejan la rutina
  // correcta antes de que se rendericen sus hijos.
  const activeRoutineDef = resolveRoutineDef((profile && profile.routines && profile.routines[profile.activeRoutineId]) || null, profile?.activeRoutineId);
  applyRoutineModel(activeRoutineDef || CLASSIC_PRESET);
  const needsRoutinePick = !!profile && !profile.activeRoutineId;
  // Cronograma semanal de la rutina activa (lunes a domingo → día de rutina
  // o descanso) — ver getRoutineWeekSchedule más arriba en el archivo.
  const weekSchedule = activeRoutineDef ? getRoutineWeekSchedule(activeRoutineDef) : {};

  // Aviso automático (y no restrictivo) de semana de descarga: la primera
  // vez que se abre la app durante una semana de descarga, te avisa y te
  // lleva a esa pestaña — pero no bloquea nada, podés ir a cualquier otra
  // pestaña apenas quieras. Se marca `dismissedDeloadCycle` para no repetir
  // el aviso todos los días dentro de la misma semana de descarga.
  const [deloadNotice, setDeloadNotice] = useState(false);
  useEffect(() => {
    if (!profile || !cycleStart) return;
    const wi = getWeekInfo(cycleStart, getProfileSettings(profile));
    if (wi?.isDeload && profile.dismissedDeloadCycle !== wi.cycleNumber) {
      setTab("descarga");
      setDeloadNotice(true);
      setProfiles((prev) => {
        const p = prev[activeProfile];
        if (!p) return prev;
        const np = { ...prev, [activeProfile]: { ...p, dismissedDeloadCycle: wi.cycleNumber } };
        saveProfiles(np);
        return np;
      });
      const t = setTimeout(() => setDeloadNotice(false), 7000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile]);

  // Recordatorio si ayer te tocaba entrenar (según tu cronograma semanal)
  // y no quedó nada registrado. Esto es un aviso DENTRO de la app — se ve
  // la próxima vez que la abrís, no es una notificación push real que
  // llegue aunque tengas la app cerrada (eso necesitaría empaquetar la
  // app con Capacitor y su plugin de notificaciones locales, que es un
  // paso de configuración nativa aparte — avisame si lo querés armar).
  // `dismissedMissedDayNotice` guarda la fecha ya avisada, para no
  // repetir el mismo aviso cada vez que abrís la app en el mismo día.
  const [missedDayNotice, setMissedDayNotice] = useState(null);
  useEffect(() => {
    if (!profile || !activeRoutineDef) return;
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const sched = getRoutineWeekSchedule(activeRoutineDef);
    const scheduledDayKey = sched[todayWeekdayKey(yesterday)];
    if (!scheduledDayKey || !DAY_ORDER.includes(scheduledDayKey)) return;
    const yStr = yesterday.toISOString().slice(0, 10);
    const trainedDates = getTrainedDateSet(profile.logs || {}, profile.trainingSessions || []);
    if (trainedDates.has(yStr)) return;
    if (profile.dismissedMissedDayNotice === yStr) return;
    setMissedDayNotice({ dayLabel: ROUTINE[scheduledDayKey]?.label || scheduledDayKey, date: yStr });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile]);
  const dismissMissedDayNotice = () => {
    if (missedDayNotice) {
      setProfiles((prev) => {
        const p = prev[activeProfile];
        if (!p) return prev;
        const np = { ...prev, [activeProfile]: { ...p, dismissedMissedDayNotice: missedDayNotice.date } };
        saveProfiles(np);
        return np;
      });
    }
    setMissedDayNotice(null);
  };

  // Festejo (con opción de compartir) cuando se completa un ciclo entero
  // (entrenamiento + descarga): se guarda `lastSeenCycleNumber` y, si en un
  // login posterior el ciclo actual ya avanzó, se muestra el festejo del
  // ciclo recién terminado. La primera vez que se ve un ciclo (perfil nuevo
  // con cycleStart recién puesto) sólo se registra, sin festejar nada.
  const [cycleCompleteNotice, setCycleCompleteNotice] = useState(null);
  const [showCycleShareImage, setShowCycleShareImage] = useState(false);
  useEffect(() => {
    if (!profile || !cycleStart) return;
    const wi = getWeekInfo(cycleStart, getProfileSettings(profile));
    if (!wi) return;
    if (profile.lastSeenCycleNumber == null) {
      setProfiles((prev) => { const p = prev[activeProfile]; if (!p) return prev; const np = { ...prev, [activeProfile]: { ...p, lastSeenCycleNumber: wi.cycleNumber } }; saveProfiles(np); return np; });
    } else if (wi.cycleNumber > profile.lastSeenCycleNumber) {
      setCycleCompleteNotice({ cycleNumber: profile.lastSeenCycleNumber });
      setProfiles((prev) => { const p = prev[activeProfile]; if (!p) return prev; const np = { ...prev, [activeProfile]: { ...p, lastSeenCycleNumber: wi.cycleNumber } }; saveProfiles(np); return np; });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile]);
  const computeCycleShareStats = () => {
    const dateSet = getTrainedDateSet(logs, profile?.trainingSessions || []);
    let totalVol = 0;
    Object.entries(logs).forEach(([k, v]) => { if (k.endsWith("_pr_override") || !Array.isArray(v)) return; v.forEach((e) => { totalVol += vol(e.kg, e.reps); }); });
    return { daysTrained: dateSet.size, totalVol: Math.round(totalVol) };
  };

  // Importar una rutina compartida por link: si la URL trae #r=<id_corto>,
  // se busca ese documento en Firestore (colección "shared_routines") y se
  // ofrece agregarla — no se activa sola, así no se interrumpe lo que ya
  // estabas entrenando. Se fuerza source:"custom" en la copia recibida
  // (aunque quien la compartió la tuviera activada como preestablecida),
  // para que te quede visible y editable en "Tus rutinas creadas".
  const [importRoutine, setImportRoutine] = useState(null);
  const [importRoutineError, setImportRoutineError] = useState(false);
  useEffect(() => {
    if (!profile) return;
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const m = hash.match(/^#r=([^&]+)/);
    if (!m) return;
    const shortId = decodeURIComponent(m[1]);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    (async () => {
      try {
        const snap = await getDoc(doc(db, "shared_routines", shortId));
        if (snap.exists()) setImportRoutine({ ...snap.data(), source: "custom" });
        else setImportRoutineError(true);
      } catch (err) {
        console.error("Error al leer la rutina compartida:", err);
        setImportRoutineError(true);
      }
    })();
  }, [activeProfile]);
  const handleImportSharedRoutine = () => {
    if (!importRoutine) return;
    setProfiles((prev) => {
      const p = prev[activeProfile];
      if (!p) return prev;
      const newId = builderUid("shared_routine");
      const np = { ...prev, [activeProfile]: { ...p, routines: { ...(p.routines || {}), [newId]: importRoutine } } };
      saveProfiles(np);
      return np;
    });
    setImportRoutine(null);
    setTab("rutinas");
  };

  const setLogs = useCallback((newLogs) => { const np = { ...profiles, [activeProfile]: { ...profiles[activeProfile], logs: newLogs } }; setProfiles(np); saveProfiles(np); }, [profiles, activeProfile]);
  // `drafts` se guarda igual que `logs` (full-replace), pero son los valores
  // tipeados-sin-guardar de reps/kg/RPE en cada serie — ver SetRow. Sobreviven
  // a cambios de pestaña/día/colapsar tarjetas; sólo se limpian al resetear
  // el día (RoutineView) o al finalizar la sesión (handleEndSession, abajo).
  const setDrafts = useCallback((newDrafts) => { const np = { ...profiles, [activeProfile]: { ...profiles[activeProfile], drafts: newDrafts } }; setProfiles(np); saveProfiles(np); }, [profiles, activeProfile]);
  // `deloadProgress` marca qué series ya tildaste como hechas en la semana
  // de descarga — guardado por fecha (no true/false) para que la próxima
  // semana de descarga, varias semanas después, arranque sin nada
  // tildado, sin necesitar un botón de reinicio aparte.
  const setDeloadProgress = useCallback((newProgress) => { const np = { ...profiles, [activeProfile]: { ...profiles[activeProfile], deloadProgress: newProgress } }; setProfiles(np); saveProfiles(np); }, [profiles, activeProfile]);
  // Registra una medición nueva (peso, cintura, pecho, brazo, pierna) con
  // la fecha de hoy — si ya había una de HOY para ese mismo tipo, la
  // reemplaza en vez de duplicarla (por si te equivocás y corregís). El
  // peso es especial: además de quedar en su propio historial, espeja el
  // valor en settings.bodyWeightKg, que es lo que sigue usando el rango
  // "Según tu contexto" — así no hubo que tocar esa parte del código.
  const handleAddMeasurement = useCallback((type, value) => {
    setProfiles((prev) => {
      const p = prev[activeProfile];
      if (!p) return prev;
      const measurements = { ...(p.measurements || {}) };
      const history = [...(measurements[type] || [])];
      const today = todayStr();
      const todayIdx = history.findIndex((h) => h.date === today);
      const entry = { date: today, value };
      if (todayIdx >= 0) history[todayIdx] = entry; else history.push(entry);
      measurements[type] = history;
      const patch = { measurements };
      if (type === "weight") patch.settings = { ...getProfileSettings(p), bodyWeightKg: value };
      const np = { ...prev, [activeProfile]: { ...p, ...patch } };
      saveProfiles(np);
      return np;
    });
  }, [activeProfile]);

  // Fotos de progreso — viven en IndexedDB, no en localStorage (ver el
  // comentario de idbGet más arriba en el archivo): localStorage tiene un
  // techo de unos 5MB en total para TODO lo que guarda la app, y unas
  // pocas fotos ya lo agotarían. Se cargan una sola vez al entrar al
  // perfil, y se actualiza el estado local en cada cambio para que la UI
  // responda al instante sin esperar a IndexedDB.
  const [progressPhotos, setProgressPhotos] = useState([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  useEffect(() => {
    if (!activeProfile) { setProgressPhotos([]); return; }
    setPhotosLoading(true);
    idbGet(`photos_${activeProfile}`).then((stored) => {
      setProgressPhotos(stored || []);
      setPhotosLoading(false);
    });
  }, [activeProfile]);
  const handleAddPhoto = async (file) => {
    try {
      const dataUrl = await resizeImageFile(file);
      const photo = { id: builderUid("photo"), date: todayStr(), dataUrl };
      const next = [photo, ...progressPhotos];
      setProgressPhotos(next);
      await idbPut(`photos_${activeProfile}`, next);
    } catch (err) {
      console.error("Error al guardar la foto de progreso:", err);
    }
  };
  const handleDeletePhoto = (id) => {
    const next = progressPhotos.filter((p) => p.id !== id);
    setProgressPhotos(next);
    idbPut(`photos_${activeProfile}`, next);
  };

  const handleLogin = (name, updatedProfiles) => { const profs = updatedProfiles || profiles; setProfiles(profs); setActiveProfile(name); setJustLoggedOut(false); setTab("rutina"); };
  const handleLogout = () => { saveActive(null); setActiveProfile(null); setJustLoggedOut(true); setShowHelp(false); setHelpStartTab(null); };
  // Cierra la sesión de Google en Firebase (signOut) y vuelve a la
  // pantalla de inicio — por si varias personas usan el mismo dispositivo
  // y querés asegurarte de que no quede ninguna cuenta de Google logueada
  // antes de soltar el celu/compu. Si nunca se inició sesión con Google,
  // signOut no hace nada (no tira error).
  const handleSignOut = async () => {
    try { await signOut(auth); } catch (err) { console.error("Error al cerrar sesión de Google:", err); }
    handleLogout();
  };
  const handleDelete = () => { const np = { ...profiles }; delete np[activeProfile]; setProfiles(np); saveProfiles(np); saveActive(null); setActiveProfile(null); setJustLoggedOut(true); setShowHelp(false); setHelpStartTab(null); };
  const handleUpdateProfile = (updates) => { const np = { ...profiles, [activeProfile]: { ...profiles[activeProfile], ...updates } }; setProfiles(np); saveProfiles(np); };
  // Helper genérico para parchear cualquier campo de settings sin pisar el
  // resto — lo usa, por ejemplo, el selector "General" / "Según tu contexto"
  // y el campo de peso corporal en Progreso → Rango.
  const handleUpdateSettings = (patch) => handleUpdateProfile({ settings: { ...getProfileSettings(profile), ...patch } });
  const handleSetCycleStart = (d) => { setCycleStartState(d); saveCycleStart(d); };

  // Activa una rutina (preestablecida recién clonada, recién creada, o una
  // ya guardada que sólo hay que volver a marcar como activa). Si es la
  // primera rutina que activa este perfil, dispara el tutorial guiado.
  const handleActivateRoutine = (routineId, routineDef) => {
    setProfiles((prev) => {
      const p = prev[activeProfile];
      if (!p) return prev;
      const wasFirstTime = !p.activeRoutineId;
      const newRoutines = routineDef ? { ...(p.routines || {}), [routineId]: routineDef } : (p.routines || {});
      const updatedProfile = { ...p, routines: newRoutines, activeRoutineId: routineId, ...(wasFirstTime && p.tutorialSeen === false ? { tutorialSeen: true } : {}) };
      const np = { ...prev, [activeProfile]: updatedProfile };
      saveProfiles(np);
      if (wasFirstTime && p.tutorialSeen === false) { setHelpStartTab(null); setShowHelp(true); }
      return np;
    });
  };
  // Actualiza una rutina ya guardada (la editaste con el lápiz) sin tocar
  // cuál está activa — si era la activa, el cambio se ve al instante porque
  // applyRoutineModel() arriba siempre lee profile.routines[activeRoutineId]
  // de nuevo en cada render.
  const handleUpdateRoutine = (routineId, routineDef) => {
    setProfiles((prev) => {
      const p = prev[activeProfile];
      if (!p) return prev;
      const newRoutines = { ...(p.routines || {}), [routineId]: routineDef };
      const np = { ...prev, [activeProfile]: { ...p, routines: newRoutines } };
      saveProfiles(np);
      return np;
    });
  };
  // Antes esto borraba la rutina para siempre. Ahora, igual que con los
  // perfiles, "quitar" una rutina creada por vos sólo la archiva — sigue
  // ahí, con todos sus ejercicios, lista para recuperarla desde "Rutinas
  // archivadas" en Rutinas. Si era la activa, te deja sin rutina activa
  // (la pantalla de Rutinas se va a encargar de pedirte otra).
  const handleArchiveRoutine = (routineId) => {
    setProfiles((prev) => {
      const p = prev[activeProfile];
      if (!p) return prev;
      const newRoutines = { ...(p.routines || {}) };
      if (newRoutines[routineId]) newRoutines[routineId] = { ...newRoutines[routineId], archived: true };
      const newActive = p.activeRoutineId === routineId ? null : p.activeRoutineId;
      const np = { ...prev, [activeProfile]: { ...p, routines: newRoutines, activeRoutineId: newActive } };
      saveProfiles(np);
      return np;
    });
  };
  const handleRestoreRoutine = (routineId) => {
    setProfiles((prev) => {
      const p = prev[activeProfile];
      if (!p) return prev;
      const newRoutines = { ...(p.routines || {}) };
      if (newRoutines[routineId]) newRoutines[routineId] = { ...newRoutines[routineId], archived: false };
      const np = { ...prev, [activeProfile]: { ...p, routines: newRoutines } };
      saveProfiles(np);
      return np;
    });
  };

  // Sesión de entrenamiento explícita (botón Iniciar arriba / Finalizar
  // abajo, en Rutina). Al finalizar, queda un registro con fecha — eso es lo
  // que alimenta racha/calendario/gráficas aunque no se haya guardado cada
  // serie individualmente — y además se limpian los drafts (lo que habías
  // tipeado y no guardado): hasta este momento se mantienen vivos, pero una
  // vez finalizada la sesión no tiene sentido seguir arrastrándolos.
  const handleStartSession = (dayKey) => {
    const np = { ...profiles, [activeProfile]: { ...profiles[activeProfile], activeSession: { dayKey, startedAt: new Date().toISOString() } } };
    setProfiles(np); saveProfiles(np);
  };
  const handleEndSession = () => {
    setProfiles((prev) => {
      const p = prev[activeProfile];
      if (!p?.activeSession) return prev;
      const finished = { date: todayStr(), dayKey: p.activeSession.dayKey, startedAt: p.activeSession.startedAt, endedAt: new Date().toISOString() };
      const np = { ...prev, [activeProfile]: { ...p, activeSession: null, trainingSessions: [...(p.trainingSessions || []), finished], drafts: {} } };
      saveProfiles(np);
      return np;
    });
  };
  const handleCancelSession = () => {
    setProfiles((prev) => {
      const p = prev[activeProfile];
      if (!p?.activeSession) return prev;
      const np = { ...prev, [activeProfile]: { ...p, activeSession: null } };
      saveProfiles(np);
      return np;
    });
  };
  // Mismo registro que handleEndSession (mismo "tipo" de entrada en
  // trainingSessions), pero para la pestaña Descarga — que no tiene
  // Iniciar/Cancelar, así que no depende de activeSession. Antes de
  // esto, entrenar tu semana de descarga desde esa pestaña no quedaba
  // registrado en ningún lado: no contaba como día entrenado, no sumaba
  // a la racha, no aparecía en el calendario de Historial.
  const handleFinishDeloadSession = (dayKey) => {
    setProfiles((prev) => {
      const p = prev[activeProfile];
      if (!p) return prev;
      const finished = { date: todayStr(), dayKey, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), deload: true };
      const np = { ...prev, [activeProfile]: { ...p, trainingSessions: [...(p.trainingSessions || []), finished] } };
      saveProfiles(np);
      return np;
    });
  };

  // "Resetear todo el historial" (Progreso): antes sólo limpiaba `logs`, así
  // que un día donde se haya usado Iniciar/Finalizar sesión (que se guarda
  // aparte, en `trainingSessions`) seguía contando como "entrenado" en la
  // estadística de Días aunque ya no tuviera ninguna serie registrada — ese
  // era el bug. Ahora limpia las dos cosas a la vez. Los récords
  // (_pr_override) nunca se tocan, como en el resto de la app.
  const handleResetAllHistory = useCallback(() => {
    setProfiles((prev) => {
      const p = prev[activeProfile];
      if (!p) return prev;
      const newLogs = {};
      Object.entries(p.logs || {}).forEach(([k, v]) => { if (k.endsWith("_pr_override")) newLogs[k] = v; });
      const np = { ...prev, [activeProfile]: { ...p, logs: newLogs, trainingSessions: [] } };
      saveProfiles(np);
      return np;
    });
  }, [activeProfile]);

  // Borrar un día puntual del historial (Progreso → Historial → ícono de
  // tacho en el detalle de ese día): quita sólo las series de esa fecha de
  // cada ejercicio, y la sesión explícita de Iniciar/Finalizar de ese día
  // si la hubiera — sin tocar ningún otro día ni los récords.
  const handleDeleteDay = useCallback((date) => {
    setProfiles((prev) => {
      const p = prev[activeProfile];
      if (!p) return prev;
      const newLogs = { ...(p.logs || {}) };
      Object.entries(newLogs).forEach(([k, v]) => {
        if (k.endsWith("_pr_override") || !Array.isArray(v)) return;
        const filtered = v.filter((e) => e.date !== date);
        if (filtered.length) newLogs[k] = filtered; else delete newLogs[k];
      });
      const newSessions = (p.trainingSessions || []).filter((s) => s.date !== date);
      const np = { ...prev, [activeProfile]: { ...p, logs: newLogs, trainingSessions: newSessions } };
      saveProfiles(np);
      return np;
    });
  }, [activeProfile]);

  if (!activeProfile) return (<><StyleInjector />{recoveredNotice && <RecoveredBanner onClose={() => setRecoveredNotice(false)} />}<LoginScreen onLogin={handleLogin} allowAutoLogin={!justLoggedOut} /></>);

  if (needsRoutinePick) return (
    <>
      <StyleInjector />
      {recoveredNotice && <RecoveredBanner onClose={() => setRecoveredNotice(false)} />}
      {importRoutineError && <ImportRoutineErrorBanner onClose={() => setImportRoutineError(false)} />}
      <div className={`min-h-screen bg-[#0a0a0f] px-4 py-6 ${themeClass}`} style={{ "--small-text-scale": smallTextScale }}>
        <div className="max-w-xl mx-auto">
          <div className="flex justify-end mb-2">
            <button onClick={handleSignOut} className="text-[11px] text-slate-600 hover:text-slate-400 font-semibold flex items-center gap-1"><LogOut size={11} /> Cerrar sesión</button>
          </div>
          <RoutinesView profile={profile} forced onActivate={handleActivateRoutine} onUpdate={handleUpdateRoutine} onArchive={handleArchiveRoutine} onRestore={handleRestoreRoutine} />
        </div>
      </div>
      {importRoutine && <SharedRoutineImportModal routine={importRoutine} onImport={handleImportSharedRoutine} onDiscard={() => setImportRoutine(null)} />}
    </>
  );

  return (
    <div className={`min-h-screen bg-[#0a0a0f] text-white font-sans lg:flex ${themeClass}`} style={{ "--small-text-scale": smallTextScale }}>
      <StyleInjector />
      {recoveredNotice && <RecoveredBanner onClose={() => setRecoveredNotice(false)} />}
      {deloadNotice && <DeloadNoticeBanner onClose={() => setDeloadNotice(false)} />}
      {missedDayNotice && <MissedDayBanner dayLabel={missedDayNotice.dayLabel} onClose={dismissMissedDayNotice} />}
      {importRoutineError && <ImportRoutineErrorBanner onClose={() => setImportRoutineError(false)} />}
      <SideNav tab={tab} setTab={setTab} profileName={activeProfile} />
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-slate-800/40">
          <div className="max-w-xl lg:max-w-3xl xl:max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
            {tab === "perfil" ? (
              <button onClick={() => setTab("rutina")} aria-label="Volver" className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80 transition shrink-0 lg:hidden"><ChevronDown size={18} className="rotate-90" /></button>
            ) : (
              <button onClick={() => setTab("perfil")} aria-label="Tu perfil" className="w-8 h-8 rounded-xl flex items-center justify-center text-base font-black text-white shrink-0 lg:hidden active:scale-90 transition" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)" }}>{activeProfile.charAt(0).toUpperCase()}</button>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="font-black text-base text-white leading-tight tracking-tight">{TAB_TITLES[tab] || ""}</h1>
              <p className="text-[11px] text-slate-600 leading-tight">{activeProfile}</p>
            </div>
            {tab !== "perfil" && <button onClick={() => { setHelpStartTab(tab); setShowHelp(true); }} aria-label="Ayuda" className="w-8 h-8 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-teal-400 hover:border-teal-500/30 transition active:scale-90"><HelpCircle size={16} /></button>}
          </div>
        </header>
        <main className="max-w-xl lg:max-w-3xl xl:max-w-4xl mx-auto px-4 py-4 pb-28 lg:pb-10 space-y-4">
          <div key={tab} className="tab-fade-in">
            {tab === "rutinas" && <RoutinesView profile={profile} forced={false} onActivate={handleActivateRoutine} onUpdate={handleUpdateRoutine} onArchive={handleArchiveRoutine} onRestore={handleRestoreRoutine} />}
            {tab === "rutina" && <RoutineView logs={logs} setLogs={setLogs} drafts={drafts} setDrafts={setDrafts} cycleStart={cycleStart} settings={getProfileSettings(profile)} weekSchedule={weekSchedule} activeSession={profile?.activeSession || null} onStartSession={handleStartSession} onEndSession={handleEndSession} onCancelSession={handleCancelSession} onDisableAutoShowPrShare={() => handleUpdateProfile({ settings: { ...getProfileSettings(profile), autoShowPrShare: false } })} />}
            {tab === "progreso" && <ProgressView logs={logs} setLogs={setLogs} sessions={profile?.trainingSessions || []} cycleStart={cycleStart} settings={getProfileSettings(profile)} onResetAll={handleResetAllHistory} onDeleteDay={handleDeleteDay} onUpdateSettings={handleUpdateSettings} onGoToProfile={() => setTab("perfil")} sex={profile?.sex} age={profile?.age} onGoToDeload={() => setTab("descarga")} measurements={profile?.measurements || {}} onAddMeasurement={handleAddMeasurement} photos={progressPhotos} photosLoading={photosLoading} onAddPhoto={handleAddPhoto} onDeletePhoto={handleDeletePhoto} />}
            {tab === "descarga" && <DeloadView logs={logs} settings={getProfileSettings(profile)} deloadProgress={profile?.deloadProgress || {}} setDeloadProgress={setDeloadProgress} onFinishDeloadSession={handleFinishDeloadSession} />}
            {tab === "entrenador_ia" && <EntrenadorIAChat profile={profile} logs={logs} profileName={activeProfile} messages={aiChatMessages} setMessages={setAiChatMessages} settings={getProfileSettings(profile)} onCreateRoutine={handleUpdateRoutine} onActivateRoutine={handleActivateRoutine} onUpdateProfile={handleUpdateProfile} onUpdateSettings={handleUpdateSettings} onAddMeasurement={handleAddMeasurement} />}
            {tab === "perfil" && <ProfileView profileName={activeProfile} profiles={profiles} logs={logs} onSignOut={handleSignOut} onDelete={handleDelete} onUpdateProfile={handleUpdateProfile} cycleStart={cycleStart} onSetCycleStart={handleSetCycleStart} onGoToRoutines={() => setTab("rutinas")} />}
          </div>
        </main>
      </div>
      <BottomBar tab={tab} setTab={setTab} />
      {showHelp && <HelpModal startTab={helpStartTab} onClose={() => setShowHelp(false)} />}
      {importRoutine && <SharedRoutineImportModal routine={importRoutine} onImport={handleImportSharedRoutine} onDiscard={() => setImportRoutine(null)} />}
      {cycleCompleteNotice && !showCycleShareImage && (
        <div className="fixed inset-0 z-[125] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 modal-bg-in" onClick={() => setCycleCompleteNotice(null)}>
          <div className="bg-slate-900 border border-slate-700/60 rounded-3xl max-w-sm w-full p-5 modal-pop-in shadow-2xl shadow-black/50 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-4xl mb-2">🎉</div>
            <h3 className="text-lg font-black text-white">¡Completaste el Ciclo #{cycleCompleteNotice.cycleNumber}!</h3>
            <p className="text-sm text-slate-400 mt-1.5 mb-4">Entrenamiento y descarga, hechos. ¿Lo compartís?</p>
            <div className="flex gap-2">
              <button onClick={() => setCycleCompleteNotice(null)} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-semibold">Cerrar</button>
              <button onClick={() => setShowCycleShareImage(true)} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-white text-sm font-bold transition-all active:scale-[0.98] shadow-lg shadow-purple-500/20" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}><Share2 size={14} /> Compartir</button>
            </div>
            {/* Sólo en el PRIMER ciclo — es el momento en que alguien está
                más contento con la app, mejor punto para pedir una
                reseña que esperar a que alguien lo haga por su cuenta. */}
            {cycleCompleteNotice.cycleNumber === 1 && (
              <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer" onClick={() => setCycleCompleteNotice(null)} className="w-full flex items-center justify-center gap-1.5 mt-2.5 py-3 rounded-2xl border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition text-sm font-bold">
                <Star size={14} /> ¿Te gustó? Dejanos una reseña
              </a>
            )}
          </div>
        </div>
      )}
      {showCycleShareImage && cycleCompleteNotice && (
        <ShareImageModal
          title="Compartí tu ciclo"
          fileNamePrefix={`ciclo-${cycleCompleteNotice.cycleNumber}`}
          shareTitle="Mi Rutina — Ciclo completo"
          shareText={`¡Completé el Ciclo #${cycleCompleteNotice.cycleNumber} en Mi Rutina! 💪`}
          draw={(ctx, W, H) => drawCycleShareCard(ctx, W, H, { cycleNumber: cycleCompleteNotice.cycleNumber, ...computeCycleShareStats() })}
          onClose={() => { setShowCycleShareImage(false); setCycleCompleteNotice(null); }}
        />
      )}
    </div>
  );
}

function RecoveredBanner({ onClose }) {
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[150] bg-teal-500 !text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-teal-500/30 flex items-center gap-2 bounce-in">
      <Check size={14} /> Recuperamos tu copia de seguridad local
      <button onClick={onClose} className="ml-1 opacity-80 hover:opacity-100"><X size={13} /></button>
    </div>
  );
}

function DeloadNoticeBanner({ onClose }) {
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[150] bg-purple-500 !text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-purple-500/30 flex items-center gap-2 bounce-in max-w-[92vw]">
      <Zap size={14} className="shrink-0" /> Esta semana es de descarga — te llevamos a esa pestaña
      <button onClick={onClose} className="ml-1 opacity-80 hover:opacity-100 shrink-0"><X size={13} /></button>
    </div>
  );
}

function MissedDayBanner({ dayLabel, onClose }) {
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[150] bg-amber-500 !text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-amber-500/30 flex items-center gap-2 bounce-in max-w-[92vw]">
      <AlertTriangle size={14} className="shrink-0" /> Ayer te tocaba {dayLabel} y no registramos nada — ¿todo bien?
      <button onClick={onClose} className="ml-1 opacity-80 hover:opacity-100 shrink-0"><X size={13} /></button>
    </div>
  );
}

function ImportRoutineErrorBanner({ onClose }) {
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[150] bg-rose-500 !text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-rose-500/30 flex items-center gap-2 bounce-in max-w-[92vw]">
      <AlertTriangle size={14} className="shrink-0" /> No pudimos abrir esa rutina compartida — puede que el enlace ya no exista.
      <button onClick={onClose} className="ml-1 opacity-80 hover:opacity-100 shrink-0"><X size={13} /></button>
    </div>
  );
}
