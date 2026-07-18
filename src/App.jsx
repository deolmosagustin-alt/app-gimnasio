import React, { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Play, Pause, RotateCcw, TrendingUp, TrendingDown, Dumbbell,
  ChevronDown, ChevronUp, ChevronLeft, Trophy, Flame, Save, Trash2, BarChart3,
  ListChecks, LogOut, X, Check, AlertTriangle, Calendar, Zap, Bell, GripVertical, Sliders, StickyNote, Eye,
  Mail, Clock, ChevronRight, Edit3, Info, Plus, Sun, Moon,
  Target, Award, Activity, ArrowDown, HelpCircle, List, LayoutGrid,
  Sparkles, Layers, SlidersHorizontal, ShieldCheck, UserCog,
  Share2, Download, Link2, Copy, BellOff, Send, Mic, Ruler, Camera, Link, Footprints, Star, SquarePlay, Upload, RefreshCw, Timer, Percent,
} from "lucide-react";
import { signInWithPopup, signInWithCredential, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";
import { Capacitor, registerPlugin } from "@capacitor/core";
// Lado JS del plugin nativo del cronómetro. CLAVE: en Capacitor 5/6,
// window.Capacitor.Plugins solo contiene plugins registrados desde JS con
// registerPlugin() — los plugins custom de Java NO aparecen ahí solos.
// Acceder via window.Capacitor.Plugins.RestTimerNotification devolvía
// siempre undefined y el cronómetro nativo jamás corría. registerPlugin()
// crea el proxy correcto: en Android ejecuta la implementación Java; en
// web rechaza con "not implemented" (capturado por los try/catch).
const RestTimerNotification = registerPlugin("RestTimerNotification");
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
// @capacitor/local-notifications — se importa estáticamente; si el paquete
// no está instalado el build falla con un error claro. Instalarlo primero:
//   npm install @capacitor/local-notifications && npx cap sync android
import { LocalNotifications } from "@capacitor/local-notifications";
import { doc, setDoc, getDoc, enableIndexedDbPersistence } from "firebase/firestore";
import Model from "react-body-highlighter";
import { auth, googleProvider, db } from "./firebase";
import {
  yt, mkSets, muteHexColor, cloneRoutineDef, debounce, kgToDisplay, displayToKg, weightLabel,
  rpeColor, haptic, localDateStr, todayStr, formatTime, vol, estimate1RM, repRangeTop, isHeavyRepRange,
} from "./utils";
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
      throw new Error("Firestore rechazó la escritura (permission-denied) — hace falta configurar las reglas de seguridad de la colección \"shared_routines\" en la consola de Firebase para permitir escritura pública. Ver el comentario arriba de shareRoutineToFirestore.", { cause: err });
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

// Espera a que Firebase Auth resuelva el estado de la sesión y devuelve
// el usuario actual (o null si no hay sesión). Sin esto, si llamamos a
// setDoc cuando auth.currentUser todavía es null (porque Firebase tarda
// ~1 segundo en restaurar la sesión desde IndexedDB al abrir la app), las
// reglas de seguridad de Firestore rechazan el write silenciosamente.
function getCurrentUser() {
  return new Promise((resolve) => {
    // Si ya hay un usuario autenticado, lo devolvemos de inmediato.
    if (auth.currentUser) { resolve(auth.currentUser); return; }
    // Si no, esperamos el primer evento de onAuthStateChanged — que
    // dispara exactamente cuando Firebase termina de verificar la sesión.
    const unsub = onAuthStateChanged(auth, (user) => { unsub(); resolve(user); });
  });
}

// Qué campos del perfil van a la nube y cuáles se quedan solo en local.
// Las fotos de progreso NO se sincronizan — viven en IndexedDB porque
// son binarios grandes; Firestore tiene un límite de 1MB por documento,
// y unas pocas fotos sin comprimir lo agotarían. El resto (logs, sesiones,
// medidas, rutinas, configuración) sí sube completo.
const CLOUD_PROFILE_FIELDS = [
  // Datos básicos del perfil
  "name", "email", "sex", "age", "heightCm", "joinedAt", "googleUid", "tutorialSeen", "pin",
  // Configuración y rutinas
  "settings", "activeRoutineId", "routines", "weekSchedule",
  // Historial de entrenamiento completo
  "logs", "trainingSessions",
  // Medidas corporales (sin fotos de progreso — demasiado grandes para Firestore)
  "measurements",
  // Foto de perfil comprimida (chica, ~256px) — SÍ se sincroniza para que
  // aparezca en cualquier dispositivo. Las fotos de progreso siguen locales.
  "avatarData",
  // Estado de ciclo y descarga
  "cycleStart", "deloadProgress", "dismissedDeloadCycle", "lastSeenCycleNumber",
  // UI state
  "dismissedMissedDayNotice", "onboardingDone",
];
function profileToCloud(profile) {
  const out = {};
  CLOUD_PROFILE_FIELDS.forEach((k) => { if (profile[k] !== undefined) out[k] = profile[k]; });
  return out;
}

// Descarga el perfil completo desde Firestore.
async function fetchProfileFromCloud(uid) {
  try {
    // Esperar a que el SDK de JS tenga la sesión activa con este uid específico.
    // No resolvemos en null (que sería "cerró sesión") — solo en el uid correcto
    // o después del timeout. Con el signInWithCredential de googleSignIn,
    // esto debería resolverse en milisegundos, no en segundos.
    await new Promise((resolve) => {
      if (auth.currentUser?.uid === uid) { resolve(); return; }
      const unsub = onAuthStateChanged(auth, (user) => {
        if (user?.uid === uid) { unsub(); resolve(); }
        // null → no resolver, el usuario correcto todavía no llegó
      });
      setTimeout(() => { unsub(); resolve(); }, 8000);
    });
    const docSnap = await getDoc(doc(db, "users", uid));
    return docSnap.exists() ? docSnap.data() : null;
  } catch (err) {
    console.error("Error al leer el perfil desde la nube:", err);
    return null;
  }
}

// Sube el perfil completo a Firestore.
// Para syncs automáticos (debounce): si Firebase Auth no está listo todavía,
// espera hasta 5s y reintenta. Si sigue sin auth, falla silenciosamente —
// el próximo cambio de datos disparará otro intento.
// Para el botón manual: el llamador pasa requireAuth=true y recibe el error.
async function syncProfileToCloud(uid, profile, requireAuth = false) {
  try {
    // Esperar auth con timeout de 5s
    const firebaseUser = await Promise.race([
      getCurrentUser(),
      new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    if (!firebaseUser || firebaseUser.uid !== uid) {
      if (requireAuth) throw new Error("NO_AUTH");
      return; // sync automático: fallar silenciosamente, reintentar después
    }
    const data = profileToCloud(profile);
    // setDoc SIN {merge:true}: el documento de la nube queda como espejo
    // EXACTO del perfil local. Antes usábamos merge:true, y Firestore hace
    // merge PROFUNDO de mapas: si borrábamos una key del objeto `logs` en el
    // teléfono (ej. un récord-override obsoleto), la key seguía viva en la
    // nube para siempre — el borrado nunca se propagaba, y el próximo merge
    // local↔nube reintroducía el dato fantasma. Con el reemplazo completo,
    // lo que se limpia acá se limpia en la nube. La combinación de datos
    // entre dispositivos ya la resuelve mergeProfiles ANTES de subir, así
    // que el reemplazo no pierde nada.
    // RED DE SEGURIDAD: Firestore rechaza cualquier `undefined` con un error y
    // eso hace fallar la subida ENTERA (perderías el entrenamiento del día).
    // Este paso los elimina en profundidad: JSON.stringify descarta las claves
    // con undefined, así que un bug nuevo en cualquier parte del código no
    // puede volver a romper la sincronización.
    const limpio = JSON.parse(JSON.stringify({ ...data, _syncedAt: new Date().toISOString() }));
    await setDoc(doc(db, "users", uid), limpio);
    console.log("[sync] Perfil subido a la nube OK");
  } catch (err) {
    // Antes el sync automático se tragaba TODO error en silencio, así que si
    // la subida fallaba (tamaño, red, permisos) el usuario nunca se enteraba y
    // sus datos no llegaban a la nube. Ahora al menos lo logueamos para poder
    // diagnosticar (visible en la consola / Logcat con filtro "sync").
    console.warn("[sync] No se pudo subir el perfil a la nube:", err?.message || err);
    if (requireAuth) throw err;
  }
}

// Merge inteligente al entrar desde un dispositivo nuevo: toma lo más
// reciente entre el local y el de la nube, campo por campo, usando
// _syncedAt como criterio. Si alguno de los dos no tiene _syncedAt
// (perfil viejo, antes de esta implementación), gana el de la nube —
// porque el local ya fue descargado en algún momento y la nube tiene
// lo más actualizado.
// Une los logs de dos perfiles clave por clave y entrada por entrada.
// Cada entrada se identifica por fecha (+kg+reps para desempatar) — así
// entrenamientos hechos offline en un dispositivo no se pierden cuando
// otro dispositivo ya subió los suyos a la nube.
function mergeLogs(a = {}, b = {}) {
  const out = { ...a };
  Object.entries(b).forEach(([key, val]) => {
    if (key.endsWith("_pr_override")) {
      // Overrides: gana el de mayor 1RM estimado
      const prev = out[key];
      if (!prev || !prev.kg) { out[key] = val; return; }
      const prevRM = (prev.kg || 0) * (1 + (prev.reps || 0) / 30);
      const newRM = (val?.kg || 0) * (1 + (val?.reps || 0) / 30);
      if (newRM > prevRM) out[key] = val;
      return;
    }
    if (!Array.isArray(val)) { if (out[key] === undefined) out[key] = val; return; }
    const prev = Array.isArray(out[key]) ? out[key] : [];
    const seen = new Set(prev.map((e) => `${e.date}|${e.kg ?? ""}|${e.reps ?? ""}|${e.minutes ?? ""}`));
    const mergedArr = [...prev];
    val.forEach((e) => {
      const sig = `${e.date}|${e.kg ?? ""}|${e.reps ?? ""}|${e.minutes ?? ""}`;
      if (!seen.has(sig)) { seen.add(sig); mergedArr.push(e); }
    });
    mergedArr.sort((x, y) => (x.date < y.date ? -1 : 1));
    out[key] = mergedArr;
  });
  return out;
}

// Une las sesiones de entrenamiento por fecha+día sin duplicados.
function mergeSessions(a = [], b = []) {
  const seen = new Set(a.map((s) => `${s.date}|${s.dayKey ?? s.day ?? ""}`));
  const out = [...a];
  b.forEach((s) => {
    const sig = `${s.date}|${s.dayKey ?? s.day ?? ""}`;
    if (!seen.has(sig)) { seen.add(sig); out.push(s); }
  });
  out.sort((x, y) => (x.date < y.date ? -1 : 1));
  return out;
}

function mergeProfiles(local, cloud) {
  if (!cloud) return local;
  if (!local) return cloud;
  const localTime = local._syncedAt ? new Date(local._syncedAt).getTime() : 0;
  const cloudTime = cloud._syncedAt ? new Date(cloud._syncedAt).getTime() : Infinity;
  // Base: el perfil más reciente (settings, rutinas, config).
  // Historial: SIEMPRE la unión de ambos — entrenamientos hechos offline
  // en cualquier dispositivo nunca se pierden.
  const base = cloudTime >= localTime ? cloud : local;
  // Tras unir los logs, limpiamos los récords-override OBSOLETOS (los que el
  // historial real ya alcanzó o superó). Esto es clave: aunque la nube
  // traiga un override viejo que localmente ya habíamos borrado (dato
  // fantasma tipo 8×95 cuando el historial ya tiene 9×95), acá muere en el
  // mismo momento del merge — no puede volver a colarse a la app.
  const { logs: mergedCleanLogs } = cleanObsoleteOverrides(mergeLogs(local.logs, cloud.logs));
  return {
    ...base,
    logs: mergedCleanLogs,
    trainingSessions: mergeSessions(local.trainingSessions, cloud.trainingSessions),
    measurements: { ...(cloudTime >= localTime ? local.measurements : cloud.measurements), ...(cloudTime >= localTime ? cloud.measurements : local.measurements) },
  };
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
  weightUnit: "kg", // "kg" o "lbs"
  reminderEnabled: false, reminderTime: "18:00", // recordatorio de entrenamiento
  // Qué mostrar en la ficha de registro (reps/kg). Todo activado por
  // default; quien no use alguna opción puede apagarla y deja de estorbar.
  showRpe: true, showWarmup: true, show1RMPercent: true, showCoaching: true, showExerciseNote: true, showPersonalNote: true,
};


function getProfileSettings(profile) { return { ...DEFAULT_SETTINGS, ...(profile?.settings || {}) }; }

// Context de unidad de peso — permite que SetRow, DeloadView y cualquier
// otro componente lean "kg" o "lbs" sin necesitar un prop extra en cada nivel.
const WeightUnitCtx = createContext("kg");
function useWeightUnit() { return useContext(WeightUnitCtx); }


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
  { k: "lg", v: 1.15, l: "Grande" },
  { k: "xl", v: 1.3, l: "Muy grande" },
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
function saveProfiles(p) { try { localStorage.setItem(PROFILES_KEY, JSON.stringify(p)); } catch { /* ignorado a propósito */ } idbPut("profiles", p); }
function loadActive() { try { return localStorage.getItem(ACTIVE_KEY) || null; } catch { return null; } }
function saveActive(n) { try { n ? localStorage.setItem(ACTIVE_KEY, n) : localStorage.removeItem(ACTIVE_KEY); } catch { /* ignorado a propósito */ } idbPut("active", n); }
function loadCycleStart() { try { const raw = localStorage.getItem(CYCLE_START_KEY); return raw ? new Date(raw) : null; } catch { return null; } }
function saveCycleStart(d) { try { localStorage.setItem(CYCLE_START_KEY, d.toISOString()); } catch { /* ignorado a propósito */ } idbPut("cycleStart", d.toISOString()); }

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

async function idbDelete(key) {
  try {
    const db = await openIDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch { /* best effort, ignore */ }
}

// Comprime un dataURL de imagen a un cuadrado de máx 256px (suficiente para
// un avatar) → JPEG liviano que entra de sobra en Firestore (límite 1MB/doc).
// A nivel módulo para reutilizarla desde App (migración automática de la foto
// vieja) y desde ProfileView (foto nueva elegida del selector).
function compressAvatarDataUrl(srcDataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const MAX = 256;
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = MAX; canvas.height = MAX;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, sx, sy, side, side, 0, 0, MAX, MAX);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = srcDataUrl;
  });
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
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(snap.profiles)); } catch { /* ignorado a propósito */ }
  if (snap.active) try { localStorage.setItem(ACTIVE_KEY, snap.active); } catch { /* ignorado a propósito */ }
  if (snap.cycleStart) try { localStorage.setItem(CYCLE_START_KEY, snap.cycleStart); } catch { /* ignorado a propósito */ }
  return snap;
}

function parseLogKey(key) {
  const idx = key.lastIndexOf("_");
  return { exerciseId: key.slice(0, idx), setIndex: parseInt(key.slice(idx + 1), 10) };
}

// Limpia los `_pr_override` OBSOLETOS: un override es obsoleto cuando el
// historial REAL de esa misma serie ya tiene una entrada con 1RM igual o
// mayor. En ese caso el override no aporta nada — solo es un "dato fantasma"
// que puede pisar la marca real (ej. un override viejo 8×95 que quedó de una
// versión anterior aunque ya hiciste 9×95). Se borra sin miedo. Los overrides
// que SIGUEN siendo mayores que todo el historial son correcciones manuales
// legítimas del usuario y NO se tocan. Devuelve { logs, changed }.
function cleanObsoleteOverrides(logs) {
  if (!logs || typeof logs !== "object") return { logs, changed: false };
  const out = { ...logs };
  let changed = false;
  Object.keys(logs).forEach((key) => {
    if (!key.endsWith("_pr_override")) return;
    const ov = logs[key];
    if (!ov || !ov.kg || !ov.reps) return;
    // Los récords EDITADOS A MANO por el usuario (manual: true) no se tocan
    // acá jamás: son correcciones explícitas. Solo se liberan al superarlos
    // entrenando (handleSave) o con el botón "Quitar".
    if (ov.manual) return;
    const baseKey = key.replace(/_pr_override$/, "");
    const history = Array.isArray(logs[baseKey]) ? logs[baseKey] : [];
    const ovRm = estimate1RM(ov.kg, ov.reps);
    const historyBeatsIt = history.some((e) => e && e.kg && e.reps && estimate1RM(e.kg, e.reps) >= ovRm);
    if (historyBeatsIt) { delete out[key]; changed = true; }
  });
  return { logs: out, changed };
}

// Días "entrenados": unión de fechas que tienen al menos una serie guardada
// y fechas con una sesión explícita (botón Iniciar/Finalizar sesión)
// finalizada — así un día cuenta como entrenado aunque te hayas olvidado de
// guardar alguna serie individual, mientras hayas usado Inicio/Fin de sesión.
// Racha "inteligente": cuenta días entrenados consecutivos, pero los días
// de DESCANSO programados (sin rutina en weekSchedule) no la cortan — solo
// la corta faltar un día que TOCABA entrenar. Sin esto, cualquier día de
// descanso reiniciaba la racha a cero, que era injusto y desmotivante.
// Sin weekSchedule cae al comportamiento clásico (días seguidos).
function computeSmartStreak(dateSet, weekSchedule) {
  let streak = 0;
  const cursor = new Date();
  const isScheduled = (date) => {
    if (!weekSchedule) return true; // sin agenda: todos los días "tocan"
    return !!weekSchedule[todayWeekdayKey(date)];
  };
  // Hoy: si entrenaste suma; si tocaba pero todavía no fuiste, NO corta
  // (el día no terminó). Después retrocedemos día por día.
  if (dateSet.has(localDateStr(cursor))) streak++;
  cursor.setDate(cursor.getDate() - 1);
  let guard = 0;
  while (guard++ < 400) {
    const d = localDateStr(cursor);
    if (dateSet.has(d)) streak++;
    else if (isScheduled(cursor)) break; // tocaba y no fuiste → se corta
    // día de descanso programado: ni corta ni suma
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function getTrainedDateSet(logs, sessions) {
  const s = new Set();
  // Los registros marcados con noSession (marcas viejas cargadas a mano, sin
  // haber iniciado la sesión) NO cuentan como días entrenados: no suman a la
  // racha ni a las estadísticas. El récord se guarda igual, pero no mentimos
  // sobre qué días fuiste al gimnasio.
  Object.entries(logs).forEach(([k, v]) => { if (k.endsWith("_pr_override") || !Array.isArray(v)) return; v.forEach((e) => { if (!e.noSession) s.add(e.date); }); });
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

function buildSessionsIndex(logs, trainingSessions = []) {
  const byDate = {};
  // Mejor marca (1RM estimado) de CADA EJERCICIO, mirando todas sus series
  // juntas y también el récord cargado a mano. Con esto podemos decir, para
  // cualquier serie del historial, a qué porcentaje de tu récord quedó —
  // combinando reps y kilos: una rep menos con el mismo peso también baja.
  // (Antes acá se construía bestByExercise para el % del historial, pero ese
  // % ahora se calcula contra priorBest1RM en el propio loop de abajo — usa la
  // MISMA base que "isImprovement", así el color y el % nunca se contradicen.)
  // Sesiones formales por fecha: aportan el dayKey REAL que entrenaste
  // (no los días de la rutina donde "aparece" cada ejercicio), la
  // duración y la base para el % completado.
  const formalByDate = {};
  (trainingSessions || []).forEach((ts) => {
    if (ts?.date) formalByDate[ts.date] = ts;
  });
  Object.entries(logs).forEach(([key, entries]) => {
    if (key.endsWith("_pr_override") || !Array.isArray(entries)) return;
    const { exerciseId, setIndex } = parseLogKey(key);
    // OJO: NO descartamos el registro si el ejercicio ya no está en la rutina.
    // El historial es una foto de lo que hiciste ese día — si borraste el
    // ejercicio o lo cambiaste por otra variante, lo que entrenaste sigue
    // siendo cierto. Caemos al nombre guardado en el propio registro
    // (exName), y si es viejo y no lo tiene, al catálogo global.
    const ex = EXERCISE_BY_ID[exerciseId] || null;
    // Historial ordenado de esta serie, para saber si cada registro fue una
    // mejora EN EL MOMENTO en que se guardó (comparado contra lo mejor hasta
    // la fecha anterior) — no contra el récord actual, que puede haber sido
    // corregido a mano después y ya no reflejar lo que pasó ese día.
    const sortedHist = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
    entries.forEach((e) => {
      // Una marca cargada SIN iniciar la sesión (un récord viejo que anotaste
      // a mano) no significa que hayas entrenado ese día: no entra al
      // historial. El récord en sí ya se guardó aparte y sigue valiendo.
      if (e.noSession) return;
      if (!byDate[e.date]) byDate[e.date] = { date: e.date, dayKeys: new Set(), items: [], totalVolume: 0, rpeSum: 0, rpeCount: 0, improvedCount: 0 };
      const s = byDate[e.date];
      if (ex?.dayKey) s.dayKeys.add(ex.dayKey);
      // ¿Fue una mejora EN EL MOMENTO? Se compara por 1RM estimado (igual que
      // el porcentaje de abajo y que los récords del resto de la app), no por
      // volumen: así el fueguito verde y el porcentaje rojo nunca se
      // contradicen. Un 1RM mayor a todo lo anterior = récord nuevo ese día.
      const priorBest1RM = sortedHist.filter((h) => h.date < e.date).reduce((max, h) => Math.max(max, estimate1RM(h.kg, h.reps)), 0);
      const thisVol = vol(e.kg, e.reps);
      const isImprovement = estimate1RM(e.kg, e.reps) > 0 && estimate1RM(e.kg, e.reps) > priorBest1RM;
      const priorBest = priorBest1RM;
      // Porcentaje respecto a tu récord del ejercicio ANTES de este día. Se
      // usa el récord previo (no el que ya incluye lo de hoy) para que, si hoy
      // superaste la marca, las otras series del mismo día no aparezcan en
      // rojo por culpa de tu propia mejora. Como se mide en 1RM estimado,
      // combina reps y kilos: 7×80 con récord 8×80 da 97% → bajaste.
      // El % se mide contra la MISMA base que isImprovement (el mejor 1RM
      // entrenado ANTES de hoy). Antes usaba otra base (que incluía el récord
      // manual), y por eso igualabas tu marca real pero el % te daba rojo.
      const this1RM = estimate1RM(e.kg, e.reps);
      const pctOfBest = priorBest1RM > 0 && this1RM > 0 ? Math.round((this1RM / priorBest1RM) * 100) : null;
      if (isImprovement) s.improvedCount++;
      // Nombre: primero el que quedó grabado en el registro, después el de la
      // rutina actual, y si no hay ninguno (registro viejo de un ejercicio ya
      // borrado) lo derivamos del catálogo global o del propio id.
      const nombre = e.exName || ex?.name || EXERCISE_LIBRARY_BY_ID[exerciseId]?.name || exerciseId.replace(/_/g, " ");
      s.items.push({ exerciseId, exerciseName: nombre, exerciseMuscle: e.exMuscle || ex?.muscle || null, dayKey: ex?.dayKey ?? null, setIndex, reps: e.reps, kg: e.kg, minutes: e.minutes ?? null, km: e.km ?? null, rpe: e.rpe ?? null, isImprovement, priorBest, pctOfBest, removedFromRoutine: !ex });
      s.totalVolume += thisVol;
      if (e.rpe != null) { s.rpeSum += e.rpe; s.rpeCount++; }
    });
  });
  return Object.values(byDate)
    .map((s) => {
      const formal = formalByDate[s.date];
      let dayKeys = Array.from(s.dayKeys);
      let durationMin = null;
      let completionPct = null;
      if (formal?.dayKey) {
        // La sesión formal manda: mostrás SOLO el día que realmente
        // entrenaste, no todos los días donde aparecen esos ejercicios.
        dayKeys = [formal.dayKey];
        if (formal.startedAt && formal.endedAt) {
          durationMin = Math.max(1, Math.round((new Date(formal.endedAt) - new Date(formal.startedAt)) / 60000));
        }
        // % completado: ejercicios del día programado con al menos una
        // serie registrada esa fecha, sobre el total de ejercicios del día.
        const dayDef = ROUTINE[formal.dayKey];
        if (dayDef?.exercises?.length) {
          const doneIds = new Set(s.items.map((it) => it.exerciseId));
          const total = dayDef.exercises.length;
          const done = dayDef.exercises.filter((e) => doneIds.has(e.id)).length;
          completionPct = Math.round((done / total) * 100);
        }
      }
      return { ...s, dayKeys, durationMin, completionPct, totalSets: s.items.length, avgRpe: s.rpeCount ? Math.round((s.rpeSum / s.rpeCount) * 10) / 10 : null };
    })
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
  for (let d = 1; d <= daysInMonth; d++) cells.push(localDateStr(new Date(year, month, d)));
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
/* Los tamaños de fuente arbitrarios en px (text-[10px], etc.) que usamos
   mucho NO escalaban con la config "Tamaño de texto" (que ajusta el
   font-size raíz y solo afecta unidades relativas). Acá los redefinimos en
   rem para que TODOS escalen en proporción cuando cambiás el tamaño. */
.text-\[8px\]{font-size:0.5rem !important}
.text-\[8\.5px\]{font-size:0.531rem !important}
.text-\[9px\]{font-size:0.5625rem !important}
.text-\[9\.5px\]{font-size:0.594rem !important}
.text-\[10px\]{font-size:0.625rem !important}
.text-\[10\.5px\]{font-size:0.656rem !important}
.text-\[11px\]{font-size:0.6875rem !important}
.text-\[12px\]{font-size:0.75rem !important}
.text-\[13px\]{font-size:0.8125rem !important}
.text-\[15px\]{font-size:0.9375rem !important}
.text-\[26px\]{font-size:1.625rem !important}

/* Hueco que deja la barra de navegación bajo el input del chat: en móvil
   la nav va abajo (4rem), en escritorio va al costado (0). */
:root { --chat-nav-gap: 4rem; }
@media (min-width: 1024px) { :root { --chat-nav-gap: 0rem; } }

/* ── ANIMACIONES DE FEEDBACK ──────────────────────────────────────────────
   Todas cortas (≤600ms) y con propósito: comunican un cambio de estado, no
   decoran. Se disfrutan la primera vez y no molestan la número 300. */

/* Muñeco: BARRIDO DE ENERGÍA. Una onda de luz recorre el cuerpo de arriba
   hacia abajo y va "cargando" cada músculo a su paso: brilla un instante y
   se asienta en su color de rango. Como un escáner que activa el cuerpo. */
@keyframes muscleCharge {
  0%   { opacity: 0.15; filter: brightness(0.6) saturate(0.4); }
  45%  { opacity: 1;    filter: brightness(2.1) saturate(1.5); }
  100% { opacity: 1;    filter: brightness(1)   saturate(1); }
}
.muscle-charge { animation: muscleCharge 0.55s cubic-bezier(0.33, 1, 0.68, 1) both; }


/* Subida de rango: el músculo late con su color */
@keyframes rankUpPulse { 0%, 100% { filter: brightness(1); transform: scale(1); } 40% { filter: brightness(1.6); transform: scale(1.06); } }
.rank-up-pulse { animation: rankUpPulse 0.9s ease-in-out 2; }

/* Check que se dibuja solo (trazo del tilde) */
@keyframes drawCheck { from { stroke-dashoffset: 30; } to { stroke-dashoffset: 0; } }
.draw-check path, .draw-check polyline { stroke-dasharray: 30; animation: drawCheck 0.45s ease-out 0.1s both; }

/* Salto sutil de los números al aparecer */
@keyframes numberPop { 0% { transform: scale(0.8); opacity: 0; } 55% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } }
.number-pop { animation: numberPop 0.45s cubic-bezier(0.34, 1.4, 0.64, 1) both; }

/* Barra que se llena deslizándose. Anima transform (GPU) en vez de width
   (que fuerza recalcular el layout en CADA frame y hace tirones en
   teléfonos de gama media). El origen a la izquierda hace que crezca desde
   ahí, igual que antes. */
@keyframes barFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.bar-fill { transform-origin: left center; animation: barFill 0.9s cubic-bezier(0.22, 1, 0.36, 1) both; }

/* Pulso lento e invitante (botón de iniciar sesión) */
@keyframes invitePulse { 0%, 100% { box-shadow: 0 0 0 0 var(--invite-glow, rgba(20,184,166,0.5)); } 50% { box-shadow: 0 0 0 7px rgba(20,184,166,0); } }
.invite-pulse { animation: invitePulse 2.4s ease-out infinite; }

/* Entrada de las tarjetas al cambiar de día (según dirección) */
@keyframes slideFromRight { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: translateX(0); } }
@keyframes slideFromLeft { from { opacity: 0; transform: translateX(-18px); } to { opacity: 1; transform: translateX(0); } }
.slide-right { animation: slideFromRight 0.32s cubic-bezier(0.22, 1, 0.36, 1) both; }
.slide-left { animation: slideFromLeft 0.32s cubic-bezier(0.22, 1, 0.36, 1) both; }

/* Latido de la racha + destello dorado si aumentó */
@keyframes streakBeat { 0%, 100% { transform: scale(1); } 30% { transform: scale(1.22); } 55% { transform: scale(0.97); } }
.streak-beat { animation: streakBeat 0.7s cubic-bezier(0.34, 1.4, 0.64, 1) 0.3s both; }
@keyframes streakGlow { 0%, 100% { filter: drop-shadow(0 0 0 rgba(251,191,36,0)); } 50% { filter: drop-shadow(0 0 9px rgba(251,191,36,0.9)); } }
.streak-glow { animation: streakGlow 1.1s ease-in-out 0.3s 2; }

/* Despliegue elástico de la tarjeta de detalle del músculo */
@keyframes elasticIn { 0% { opacity: 0; transform: scale(0.95) translateY(8px); } 60% { transform: scale(1.015) translateY(-2px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
.elastic-in { animation: elasticIn 0.42s cubic-bezier(0.34, 1.35, 0.64, 1) both; }

/* Skeletons: formas grises que laten mientras cargan los datos */
@keyframes skeletonShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
.skeleton {
  background: linear-gradient(90deg, rgba(30,41,59,0.6) 25%, rgba(51,65,85,0.85) 50%, rgba(30,41,59,0.6) 75%);
  background-size: 200% 100%;
  animation: skeletonShimmer 1.4s ease-in-out infinite;
  border-radius: 0.75rem;
}

/* ── RUTINAS ── */
/* Ejercicio nuevo: entra desde abajo empujando y queda resaltado un instante */
@keyframes rowEnter {
  0%   { opacity: 0; transform: translateY(-10px) scale(0.97); }
  60%  { opacity: 1; transform: translateY(2px) scale(1.01); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.row-enter { animation: rowEnter 0.42s cubic-bezier(0.34, 1.3, 0.64, 1) backwards; }
@keyframes rowFlash { 0%, 100% { background-color: transparent; } 35% { background-color: var(--flash-color, rgba(20,184,166,0.18)); } }
.row-flash { animation: rowFlash 0.9s ease-out 0.1s both; }

/* Ejercicio borrado: colapsa hacia adentro en vez de desaparecer de golpe */
@keyframes rowLeave {
  0%   { opacity: 1; transform: scale(1); max-height: 200px; }
  100% { opacity: 0; transform: scale(0.9); max-height: 0; margin-bottom: 0; }
}
.row-leave { animation: rowLeave 0.3s cubic-bezier(0.4, 0, 1, 1) both; overflow: hidden; }

/* Rutina activada: pulso del color + badge que entra */
@keyframes activatePulse {
  0%   { box-shadow: 0 0 0 0 var(--pulse-color, rgba(20,184,166,0.6)); }
  70%  { box-shadow: 0 0 0 12px rgba(20,184,166,0); }
  100% { box-shadow: 0 0 0 0 rgba(20,184,166,0); }
}
.activate-pulse { animation: activatePulse 0.85s cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes badgePop { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.18); } 100% { transform: scale(1); opacity: 1; } }
.badge-pop { animation: badgePop 0.45s cubic-bezier(0.34, 1.5, 0.64, 1) both; }

/* Superserie: el recuadro que agrupa se dibuja */
@keyframes supersetDraw {
  0%   { clip-path: inset(0 0 100% 0); opacity: 0; }
  100% { clip-path: inset(0 0 0 0);    opacity: 1; }
}
.superset-draw { animation: supersetDraw 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }

/* ── CHATBOT ── */
/* Los tres puntitos que rebotan mientras la IA piensa */
@keyframes dotBounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.4; } 40% { transform: translateY(-6px); opacity: 1; } }
.dot-bounce { animation: dotBounce 1.2s ease-in-out infinite; }

/* Mensajes que entran: suben apenas mientras aparecen */
@keyframes msgIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.msg-in { animation: msgIn 0.24s cubic-bezier(0.22, 1, 0.36, 1) backwards; }

/* ── OTROS ── */
/* Las tarjetas se "despiertan" al iniciar la sesión */
@keyframes wakeUp { 0%, 100% { transform: scale(1); } 45% { transform: scale(1.02); } }
.wake-up { animation: wakeUp 0.45s cubic-bezier(0.34, 1.3, 0.64, 1) both; }

/* Días del calendario que se marcan en cascada */
@keyframes dayMark { 0% { transform: scale(0); opacity: 0; } 65% { transform: scale(1.25); } 100% { transform: scale(1); opacity: 1; } }
.day-mark { animation: dayMark 0.38s cubic-bezier(0.34, 1.4, 0.64, 1) both; }

/* Transición suave del tema claro/oscuro (no un salto agresivo). Solo anima
   COLORES — nada de transform ni layout, para no interferir con el arrastre de
   ejercicios ni con las demás animaciones, que tienen su propio timing. */
.theme-fade, .theme-fade * {
  transition-property: background-color, color, border-color;
  transition-duration: 0.35s;
  transition-timing-function: ease;
}
/* Los elementos con su propia transición mandan (el arrastre, por ejemplo) */
.theme-fade [data-drag-idx] { transition-property: transform; }

/* La racha cuando SUMA un día: salto con destello dorado (solo esa vez) */
@keyframes streakJump {
  0%   { transform: scale(1); text-shadow: none; }
  35%  { transform: scale(1.5); text-shadow: 0 0 14px rgba(251,191,36,0.95); }
  60%  { transform: scale(0.94); }
  100% { transform: scale(1); text-shadow: none; }
}
.streak-jump { animation: streakJump 0.75s cubic-bezier(0.34, 1.4, 0.64, 1) 0.15s both; }

/* Cambio de pestaña: la entrante se desliza sutilmente desde su dirección */
@keyframes tabSlideRight { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: translateX(0); } }
@keyframes tabSlideLeft  { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: translateX(0); } }
.tab-slide-right { animation: tabSlideRight 0.22s cubic-bezier(0.22, 1, 0.36, 1) backwards; }
.tab-slide-left  { animation: tabSlideLeft 0.22s cubic-bezier(0.22, 1, 0.36, 1) backwards; }

/* El músculo que subió de rango late (solo brillo: escalar un polygon SVG lo
   corre de lugar porque escala desde el origen del SVG, no desde su centro) */
@keyframes muscleGlowBeat { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(2.1); } }

/* Historial: las tarjetas de días entran en cascada al abrir la pestaña */
@keyframes histEnter {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.hist-enter { animation: histEnter 0.35s cubic-bezier(0.22, 1, 0.36, 1) backwards; }

/* El cronómetro entre series: aparece con un pequeño salto al cambiar de
   posición, para que se note que se movió. Usa fill-mode "backwards" (no
   "both") para no dejar transform residual: un ancestro con transform rompe
   el centrado de los modales fixed que tenga adentro. */
@keyframes timerHop {
  0%   { opacity: 0; transform: translateY(-8px) scale(0.96); }
  55%  { opacity: 1; transform: translateY(2px) scale(1.02); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.timer-hop { animation: timerHop 0.34s cubic-bezier(0.34, 1.3, 0.64, 1) backwards; }

/* Overlay de inicio de sesión: se va solo a los 1.4s */
@keyframes sessionStartFade { 0% { opacity: 0; } 12% { opacity: 1; } 82% { opacity: 1; } 100% { opacity: 0; } }
.session-start-fade { animation: sessionStartFade 1.4s ease-in-out both; }
@keyframes sessionStartPop { 0% { transform: scale(0.4); opacity: 0; } 45% { transform: scale(1.12); opacity: 1; } 65% { transform: scale(0.98); } 100% { transform: scale(1); opacity: 1; } }
.session-start-pop { animation: sessionStartPop 0.6s cubic-bezier(0.34, 1.5, 0.64, 1) both; }
@keyframes sessionStartText { 0% { transform: translateY(12px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
.session-start-text { animation: sessionStartText 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.2s backwards; }

/* IA "pensando": la pesa sube y baja mientras ondas de energía se expanden */
@keyframes thinkingLift {
  0%, 100% { transform: translateY(2px) rotate(-4deg); }
  50%      { transform: translateY(-2px) rotate(4deg); }
}
.thinking-lift { animation: thinkingLift 1.1s ease-in-out infinite; }
/* La pesa "hace repeticiones": sube y baja como un press, con un giro leve */
@keyframes thinkingRep {
  0%, 100% { transform: translateY(3px) rotate(-6deg) scale(0.96); }
  50%      { transform: translateY(-4px) rotate(6deg) scale(1.04); }
}
.thinking-rep { animation: thinkingRep 0.9s cubic-bezier(0.45, 0, 0.55, 1) infinite; }
/* Halo que late detrás de la pesa */
@keyframes thinkingHalo { 0%, 100% { opacity: 0.4; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1.1); } }
.thinking-halo { animation: thinkingHalo 1.6s ease-in-out infinite; }
/* Ecualizador: barras que suben y bajan como música */
@keyframes thinkingEq { 0%, 100% { height: 5px; } 50% { height: 16px; } }
.thinking-eq { height: 5px; animation: thinkingEq 0.7s ease-in-out infinite; }
/* Los tres puntitos del texto "Pensando..." que aparecen de a uno */
@keyframes thinkingDots {
  0%   { content: ""; }
  25%  { content: "."; }
  50%  { content: ".."; }
  75%, 100% { content: "..."; }
}
.thinking-dots::after { content: ""; animation: thinkingDots 1.4s steps(1) infinite; }
@keyframes thinkingWave {
  0%   { transform: scale(0.5); opacity: 0.5; }
  100% { transform: scale(1.6); opacity: 0; }
}
.thinking-wave { background: radial-gradient(circle, rgba(20,184,166,0.35), transparent 70%); animation: thinkingWave 1.4s ease-out infinite; }

/* Celdas del calendario del historial: aparecen en cascada al abrir la vista */
@keyframes cellPop {
  from { opacity: 0; transform: scale(0.8); }
  to   { opacity: 1; transform: scale(1); }
}
.cell-pop { animation: cellPop 0.3s cubic-bezier(0.34, 1.4, 0.64, 1) backwards; }

/* Sparkle del chatbot: un giro-destello al abrir la sección */
@keyframes sparkleSpin {
  0%   { transform: rotate(-25deg) scale(0.6); opacity: 0; }
  60%  { transform: rotate(8deg) scale(1.15); opacity: 1; }
  100% { transform: rotate(0deg) scale(1); opacity: 1; }
}
.sparkle-spin { animation: sparkleSpin 0.6s cubic-bezier(0.34, 1.4, 0.64, 1) both; }

/* Chip flotante de sesión activa: entra deslizándose desde arriba, suave */
@keyframes sessionChipIn {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.session-chip-in { animation: sessionChipIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }
/* El puntito del chip "late" como un indicador de en-vivo: se expande y
   desvanece en bucle (igual que el ping de la barra de sesión en curso). */
@keyframes sessionChipPing {
  0%   { transform: scale(1); opacity: 0.6; }
  75%, 100% { transform: scale(2.2); opacity: 0; }
}
.session-chip-ping { animation: sessionChipPing 1.8s cubic-bezier(0, 0, 0.2, 1) infinite; }

/* Confeti del resumen de fin de sesión: cae de arriba girando y se desvanece */
@keyframes confettiFall {
  0%   { transform: translateY(-20px) rotate(0deg); opacity: 0; }
  12%  { opacity: 1; }
  100% { transform: translateY(320px) rotate(320deg); opacity: 0; }
}
.confetti-piece { position: absolute; top: -10px; border-radius: 2px; animation-name: confettiFall; animation-timing-function: cubic-bezier(0.4, 0, 0.7, 1); animation-fill-mode: both; }

/* La rutina activa "respira": un halo lentísimo que marca cuál es la tuya
   sin gritar. 4 segundos por ciclo — se percibe pero no distrae. */
@keyframes breathe {
  0%, 100% { box-shadow: 0 0 0 0 var(--breathe-color, rgba(168,85,247,0.3)), 0 10px 30px -12px rgba(0,0,0,0.5); }
  50%      { box-shadow: 0 0 0 6px rgba(168,85,247,0), 0 10px 30px -12px rgba(0,0,0,0.5); }
}
.breathe { animation: breathe 4s ease-in-out infinite; }

/* Respeta a quien pidió menos movimiento en su sistema */
@media (prefers-reduced-motion: reduce) {
  .muscle-charge, .rank-up-pulse, .draw-check path, .number-pop, .bar-fill,
  .invite-pulse, .slide-right, .slide-left, .streak-beat, .streak-glow,
  .elastic-in, .skeleton, .row-enter, .row-flash, .row-leave, .activate-pulse,
  .thinking-dots::after { animation: none !important; content: "..." !important; }
  .thinking-lift, .thinking-wave, .thinking-rep, .thinking-halo, .thinking-eq,
  .badge-pop, .superset-draw, .dot-bounce, .msg-in, .wake-up, .day-mark,
  .breathe, .hist-enter, .streak-jump, .tab-slide-right, .tab-slide-left,
  .timer-hop, .session-start-pop, .session-start-text, .session-chip-in,
  .cell-pop, .sparkle-spin, .session-chip-ping { animation: none !important; }
  .confetti-piece { display: none !important; }
  /* El fade del overlay se mantiene: es lo que lo hace desaparecer solo */
  .theme-fade, .theme-fade * { transition: none !important; }
}

@keyframes voiceBar { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
.voice-bar { animation: voiceBar 0.7s ease-in-out infinite; transform-origin: bottom; }
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
/* BLINDAJE DE CENTRADO: un ancestro con transform (una animación con
   fill-mode:both, un will-change) convierte a sus hijos position:fixed en
   relativos a ÉL en vez de a la pantalla — eso descentra los modales y les
   rompe el área de scroll. Anclar las 4 coordenadas los obliga a ocupar el
   viewport completo pase lo que pase con los ancestros. */
.modal-overlay { position: fixed !important; top: 0 !important; right: 0 !important; bottom: 0 !important; left: 0 !important; }
@keyframes gentleBounceIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
.bounce-in { animation: gentleBounceIn 0.3s cubic-bezier(.34,1.56,.64,1); }

/* ==== Animaciones nuevas ==== */
/* Entrada escalonada para listas de tarjetas (ejercicios, rutinas) */
@keyframes staggerIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.stagger-item { animation: staggerIn 0.32s cubic-bezier(.2,.8,.3,1) both; }
.stagger-item:nth-child(1) { animation-delay: 0ms; }
.stagger-item:nth-child(2) { animation-delay: 45ms; }
.stagger-item:nth-child(3) { animation-delay: 90ms; }
.stagger-item:nth-child(4) { animation-delay: 135ms; }
.stagger-item:nth-child(5) { animation-delay: 180ms; }
.stagger-item:nth-child(6) { animation-delay: 225ms; }
.stagger-item:nth-child(n+7) { animation-delay: 260ms; }

/* Glow pulsante sutil — para el récord "A superar" y elementos vivos */
@keyframes softPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.75; } }
.soft-pulse { animation: softPulse 2.4s ease-in-out infinite; }

/* Barra de progreso animada al montarse */
@keyframes growBar { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.grow-bar { transform-origin: left center; animation: growBar 0.7s cubic-bezier(.2,.8,.3,1); }

/* Feedback táctil universal en botones — más responsivo al tacto */
button { transition: transform 0.12s ease, opacity 0.15s ease; }
button:active { transform: scale(0.97); }

/* Transición suave al cambiar de tema o estados de tarjetas */
.smooth-card { transition: background-color 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease; }

/* ==== Tolerancia al escalado de texto (accesibilidad) ====
   Cuando el usuario agranda la letra, los textos en rem crecen pero los
   contenedores con medidas fijas no. Estas reglas hacen que el layout
   SE ADAPTE en vez de deformarse: los flex hijos pueden encogerse y
   truncar, las filas de chips hacen wrap, y nada desborda de su tarjeta. */
.flex > * { min-width: 0; }
p, span, label, button { overflow-wrap: break-word; }
/* Las filas de tabs/chips que no scrollean horizontalmente hacen wrap */
.flex.flex-wrap-safe { flex-wrap: wrap; }
/* Los números tabulares no se desbordan de sus celdas */
.tabular-nums { font-variant-numeric: tabular-nums; }

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
/* Velo de los modales: sigue oscureciendo (si no, el modal blanco se pierde
   sobre el fondo claro), pero en un slate suave en vez de negro puro. */
.light-mode .bg-black\\/55 { background-color: rgba(15,23,42,0.32) !important; }
.light-mode .bg-black\\/70 { background-color: rgba(15,23,42,0.42) !important; }
.light-mode .bg-black\\/75 { background-color: rgba(15,23,42,0.45) !important; }
.light-mode .bg-black\\/80 { background-color: rgba(15,23,42,0.48) !important; }
.light-mode .bg-black\\/85 { background-color: rgba(15,23,42,0.52) !important; }
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
.light-mode .text-slate-600 { color: #8593a8 !important; }
.light-mode .text-slate-700 { color: #a2aec0 !important; }
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

/* ── ELEVACIÓN EN MODO CLARO ────────────────────────────────────────────────
   El negro translúcido pensado para fondo oscuro se ve como una mancha gris
   sucia sobre blanco. Pero aplastarlo todo a una sombra plana (lo que hacíamos
   antes) deja la interfaz sin profundidad: las tarjetas parecen calcomanías.
   La solución es un sistema de elevación por niveles, cada uno con DOS capas:
     · una capa corta y apenas visible que define el canto de la tarjeta;
     · una capa difusa y más abierta que la "levanta" del fondo.
   El color no es negro sino azul-gris muy diluido (15,23,42 = slate-900), que
   sobre blanco lee como sombra natural y no como gris sucio. */
.light-mode .shadow-sm {
  box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.03) !important;
}
.light-mode .shadow-md {
  box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 3px 8px -2px rgba(15,23,42,0.06) !important;
}
.light-mode .shadow-lg {
  box-shadow: 0 1px 3px rgba(15,23,42,0.04), 0 6px 16px -4px rgba(15,23,42,0.08) !important;
}
.light-mode .shadow-xl {
  box-shadow: 0 2px 4px rgba(15,23,42,0.04), 0 12px 28px -8px rgba(15,23,42,0.10) !important;
}
.light-mode .shadow-2xl {
  box-shadow: 0 4px 8px rgba(15,23,42,0.05), 0 20px 44px -12px rgba(15,23,42,0.14) !important;
}
/* Las clases de color de sombra (shadow-black/N) solo aportaban el tono, que
   ahora ya viene resuelto arriba: acá se neutralizan para que no reinyecten
   el negro. */
.light-mode .shadow-black\\/20,
.light-mode .shadow-black\\/25,
.light-mode .shadow-black\\/30,
.light-mode .shadow-black\\/40,
.light-mode .shadow-black\\/50,
.light-mode .shadow-black\\/60,
.light-mode .shadow-black\\/70 { --tw-shadow-color: rgba(15,23,42,0.08) !important; }

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
  /* Fondo base de la app. Lo usan los pocos lugares que necesitan el color
     "de la página" en estilo inline (escudo de la status bar, pantallas a
     pantalla completa). Antes estaba escrito a mano como #0a0a0f y en modo
     claro dejaba franjas negras. */
  --app-bg: #0a0a0f;
  /* Superficies "hundidas": paneles que se abren dentro de una tarjeta y
     filas de opciones. Estaban en estilo inline con rgba fijo y en claro se
     veían como cajas oscuras. */
  --panel-sunken: rgba(2,6,23,0.7);
  --row-surface: rgba(15,23,42,0.6);
  /* Degradés de paneles destacados (resumen de sesión, tarjetas del
     entrenador). Conservan el valor exacto que tenían escrito a mano. */
  --panel-grad-teal: linear-gradient(165deg,#0d1a17 0%,#0a0f1a 100%);
  --panel-grad-cyan: linear-gradient(165deg,#0f1a1f 0%,#0a0f1a 100%);
  --panel-grad-slate: linear-gradient(170deg,#0f172a 0%,#0a0f1a 100%);
  --panel-grad-blue: linear-gradient(165deg, #0c1420 0%, #0a0f1a 100%);
  --panel-grad-emerald: linear-gradient(160deg,#0d1f1e,#0f172a);
  /* Cronómetro de descanso en reposo (cuando corre toma el color del día). */
  --timer-idle-bg: rgba(15,23,42,0.5);
  --timer-idle-border: rgba(30,41,59,0.6);
  /* Modal de "subiste de rango" — el color del tier ya se aplica encima como
     glow/borde, esto es sólo la base neutra detrás. */
  --rankup-grad: linear-gradient(135deg, #0f0f1a, #1a1a2e);
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
  --app-bg: #f8fafc;
  --panel-sunken: #f1f5f9;
  --row-surface: #f8fafc;
  /* En claro, el mismo matiz pero sobre blanco: apenas un velo de color en la
     esquina superior que se disuelve, en vez de un bloque oscuro. */
  --panel-grad-teal: linear-gradient(165deg, rgba(20,184,166,0.09) 0%, #ffffff 60%);
  --panel-grad-cyan: linear-gradient(165deg, rgba(6,182,212,0.09) 0%, #ffffff 60%);
  --panel-grad-slate: linear-gradient(170deg, rgba(100,116,139,0.08) 0%, #ffffff 60%);
  --panel-grad-blue: linear-gradient(165deg, rgba(59,130,246,0.08) 0%, #ffffff 60%);
  --panel-grad-emerald: linear-gradient(160deg, rgba(16,185,129,0.10), #ffffff 65%);
  --timer-idle-bg: #f1f5f9;
  --timer-idle-border: #e2e8f0;
  --rankup-grad: linear-gradient(135deg, #ffffff, #f8fafc);
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
/* Tamaños intermedios y grandes que también hay que escalar: sin estos, las
   etiquetas quedaban fijas mientras el resto de la app crecía o se achicaba
   (los decimales de Tailwind llevan el punto escapado en CSS). */
.text-\\[8\\.5px\\]  { font-size: calc(8.5px * var(--small-text-scale, 1)) !important; }
.text-\\[9\\.5px\\]  { font-size: calc(9.5px * var(--small-text-scale, 1)) !important; }
.text-\\[10\\.5px\\] { font-size: calc(10.5px * var(--small-text-scale, 1)) !important; }
.text-\\[13px\\] { font-size: calc(13px * var(--small-text-scale, 1)) !important; }
.text-\\[17px\\] { font-size: calc(17px * var(--small-text-scale, 1)) !important; }
.text-\\[26px\\] { font-size: calc(26px * var(--small-text-scale, 1)) !important; }
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
    <div className="fixed inset-0 pointer-events-none z-[300] modal-overlay">
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
  useAndroidBack(onClose);
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
    <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 modal-bg-in modal-overlay" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/60 rounded-3xl max-w-sm w-full p-5 modal-pop-in shadow-2xl shadow-black/50 max-h-[92vh] overflow-y-auto overscroll-contain" onClick={(e) => e.stopPropagation()}>
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
            {/* Botón principal de compartir — prominente y arriba */}
            {canNativeShare && (
              <button onClick={handleNativeShare} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl !text-white text-sm font-bold mb-3 transition-all active:scale-[0.98]" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)" }}>
                <Share2 size={15} /> Compartir
              </button>
            )}
            {/* Copiar enlace */}
            <button onClick={handleCopy} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition text-sm font-semibold mb-2">
              {copied ? <><Check size={14} className="text-teal-400" /> ¡Copiado!</> : <><Copy size={14} /> Copiar enlace</>}
            </button>
            {copyError && <p className="text-[11px] text-amber-400 mb-2 text-center">No pudimos copiarlo — tocá el enlace de abajo y copialo a mano.</p>}
            <input ref={urlInputRef} value={url} readOnly onFocus={(e) => e.target.select()} className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2.5 text-[11px] text-slate-400 mb-3 focus:outline-none focus:border-teal-500/50 truncate" />
            {/* Redes sociales — colapsadas en fila compacta */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <a href={waUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-[10px] font-bold transition"><Share2 size={13} className="text-emerald-400" />WhatsApp</a>
              <a href={xUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-[10px] font-bold transition"><Share2 size={13} className="text-slate-200" />X</a>
              <a href={redditUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-[10px] font-bold transition"><Share2 size={13} className="text-orange-400" />Reddit</a>
            </div>
            <p className="text-[10px] text-slate-600 mb-3 text-center">Quien abra el enlace puede agregar la rutina a su app con un toque.</p>
            {/* Exportar como archivo — al fondo, colapsado por defecto */}
            {!showFileOptions ? (
              <button onClick={() => setShowFileOptions(true)} className="w-full flex items-center justify-center gap-1.5 pt-3 border-t border-slate-800/60 text-slate-500 hover:text-slate-300 text-xs font-semibold transition"><Download size={12} /> Descargar como archivo (PDF, Word, Excel)</button>
            ) : (
              <div className="pt-3 border-t border-slate-800/60">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Descargar</p>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => handleExportDoc("pdf")} disabled={!!exporting} className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-[10px] font-bold transition disabled:opacity-50">{exporting === "pdf" ? <RotateCcw size={14} className="animate-spin text-rose-400" /> : <Download size={14} className="text-rose-400" />}PDF</button>
                  <button onClick={() => handleExportDoc("word")} disabled={!!exporting} className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-[10px] font-bold transition disabled:opacity-50">{exporting === "word" ? <RotateCcw size={14} className="animate-spin text-blue-400" /> : <Download size={14} className="text-blue-400" />}Word</button>
                  <button onClick={() => handleExportDoc("excel")} disabled={!!exporting} className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-[10px] font-bold transition disabled:opacity-50">{exporting === "excel" ? <RotateCcw size={14} className="animate-spin text-emerald-400" /> : <Download size={14} className="text-emerald-400" />}Excel</button>
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

// Polyfill de roundRect — ctx.roundRect no está disponible en WebViews
// de Android anteriores a Chrome 99. Esta función hace lo mismo con arcTo.
function canvasRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawShareCardBase(ctx, W, H, accent, accent2) {
  // Fondo
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0f0f1a"); bg.addColorStop(1, "#07070f");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // Glow top-left
  const g1 = ctx.createRadialGradient(W * 0.15, H * 0.12, 0, W * 0.15, H * 0.12, W * 0.55);
  g1.addColorStop(0, accent + "22"); g1.addColorStop(1, "transparent");
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  // Glow bottom-right
  const g2 = ctx.createRadialGradient(W * 0.85, H * 0.88, 0, W * 0.85, H * 0.88, W * 0.45);
  g2.addColorStop(0, (accent2 || accent) + "18"); g2.addColorStop(1, "transparent");
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
  // Borde sutil
  ctx.strokeStyle = accent + "30"; ctx.lineWidth = 2;
  const r = 28; ctx.beginPath(); ctx.moveTo(r, 1); ctx.arcTo(W - 1, 1, W - 1, r, r); ctx.arcTo(W - 1, H - 1, W - r, H - 1, r); ctx.arcTo(1, H - 1, 1, H - r, r); ctx.arcTo(1, 1, r, 1, r); ctx.closePath(); ctx.stroke();
  // Logo / branding
  ctx.fillStyle = accent + "cc"; ctx.font = "bold 18px system-ui";
  ctx.textAlign = "right"; ctx.fillText("Modus Fit", W - 28, H - 22);
  ctx.textAlign = "left";
}
// El "logo" de la app abajo de la tarjeta: una llamita simple dibujada a
// mano (no hay archivo de imagen en este proyecto de un solo archivo) más
// el nombre, en la parte inferior — tal como se pidió.
function drawWordmark(ctx, W, H, accent) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = accent + "cc";
  ctx.font = "bold 30px system-ui, sans-serif";
  ctx.fillText("Modus Fit", W / 2, H - 80);
  ctx.restore();
}

function drawPRShareCard(ctx, W, H, { exerciseName, muscle, kg, reps, accent = "#14B8A6" }) {
  // Layout FIJO para el canvas real de 540×960 — la versión anterior usaba
  // posiciones acumulativas pensadas para un lienzo más grande: con nombres
  // largos todo se corría hacia abajo y los tiles quedaban cortados o fuera.
  drawShareCardBase(ctx, W, H, accent, "#A855F7");
  ctx.textAlign = "center";

  // Chip "NUEVA MARCA PERSONAL"
  const chipText = "✦  NUEVA MARCA PERSONAL  ✦";
  ctx.font = "700 16px system-ui";
  const chipW = ctx.measureText(chipText).width + 44;
  const gChip = ctx.createLinearGradient(W / 2 - chipW / 2, 0, W / 2 + chipW / 2, 0);
  gChip.addColorStop(0, accent + "40"); gChip.addColorStop(1, accent + "20");
  ctx.fillStyle = gChip;
  canvasRoundRect(ctx, W / 2 - chipW / 2, 96, chipW, 36, 18); ctx.fill();
  ctx.strokeStyle = accent + "60"; ctx.lineWidth = 1.5;
  canvasRoundRect(ctx, W / 2 - chipW / 2, 96, chipW, 36, 18); ctx.stroke();
  ctx.fillStyle = accent; ctx.fillText(chipText, W / 2, 120);

  // Nombre del ejercicio — truncado a un largo seguro, máximo 2 líneas.
  let name = (exerciseName || "").toUpperCase();
  if (name.length > 44) name = name.slice(0, 43).trimEnd() + "…";
  ctx.fillStyle = "#f8fafc"; ctx.font = "800 34px system-ui";
  wrapCanvasText(ctx, name, W / 2, 188, W - 72, 42);

  // Chip de músculo — posición fija, debajo del área reservada del nombre.
  if (muscle) {
    ctx.font = "600 17px system-ui";
    const mW = ctx.measureText(muscle.toUpperCase()).width + 36;
    ctx.fillStyle = accent + "20";
    canvasRoundRect(ctx, W / 2 - mW / 2, 268, mW, 32, 16); ctx.fill();
    ctx.fillStyle = accent + "dd"; ctx.fillText(muscle.toUpperCase(), W / 2, 290);
  }

  // Número de kg — protagonista, centrado en el tercio medio.
  const kgStr = `${kg ?? 0}`;
  ctx.font = `900 ${kgStr.length >= 3 ? 128 : 148}px system-ui`;
  const gKg = ctx.createLinearGradient(0, 340, 0, 500);
  gKg.addColorStop(0, "#ffffff"); gKg.addColorStop(1, accent);
  ctx.fillStyle = gKg;
  ctx.fillText(kgStr, W / 2, 492);
  ctx.fillStyle = "#64748b"; ctx.font = "600 24px system-ui";
  ctx.fillText("kg", W / 2, 528);

  // Reps
  ctx.fillStyle = "#e2e8f0"; ctx.font = "700 30px system-ui";
  ctx.fillText(`${reps ?? 0} repeticiones`, W / 2, 596);

  // Tiles 1RM + Volumen
  const est = estimate1RM(kg, reps);
  const tileY = 660, tileGap = 20, tileW = (W - 80 - tileGap) / 2, tileH = 108;
  [{ val: `${est} kg`, label: "1RM estimado" }, { val: `${Math.round((kg || 0) * (reps || 0))} kg`, label: "Volumen" }].forEach((t, i) => {
    const x = 40 + i * (tileW + tileGap);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    canvasRoundRect(ctx, x, tileY, tileW, tileH, 16); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1;
    canvasRoundRect(ctx, x, tileY, tileW, tileH, 16); ctx.stroke();
    ctx.fillStyle = "#ffffff"; ctx.font = "800 32px system-ui";
    ctx.fillText(t.val, x + tileW / 2, tileY + 56);
    ctx.fillStyle = "#64748b"; ctx.font = "500 16px system-ui";
    ctx.fillText(t.label, x + tileW / 2, tileY + 86);
  });

  drawWordmark(ctx, W, H, accent);
}

function drawCycleShareCard(ctx, W, H, { cycleNumber, daysTrained, totalVol, accent = "#A855F7" }) {
  // Layout para el canvas real de 540×960 (las coordenadas anteriores eran
  // de un lienzo del doble: la mitad de la tarjeta quedaba fuera de cuadro).
  drawShareCardBase(ctx, W, H, accent, "#06B6D4");
  ctx.textAlign = "center";
  ctx.fillStyle = accent;
  ctx.font = "800 26px sans-serif";
  ctx.fillText("🎉 CICLO COMPLETO", W / 2, 250);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "900 76px sans-serif";
  ctx.fillText(`Ciclo #${cycleNumber}`, W / 2, 360);
  const tiles = [
    { val: daysTrained, label: "DÍAS\nENTRENADOS" },
    { val: totalVol > 999 ? `${(totalVol / 1000).toFixed(1)}k` : totalVol, label: "KG × REPS\nTOTALES" },
  ];
  const tileY = 460, tileGap = 28, tileW = (W - 80 - tileGap) / 2, tileH = 170;
  tiles.forEach((t, i) => {
    const x = 40 + i * (tileW + tileGap);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    canvasRoundRect(ctx, x, tileY, tileW, tileH, 20); ctx.fill();
    ctx.fillStyle = "#f8fafc";
    ctx.font = "900 54px sans-serif";
    ctx.fillText(`${t.val}`, x + tileW / 2, tileY + 82);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "700 17px sans-serif";
    t.label.split("\n").forEach((l, li) => ctx.fillText(l, x + tileW / 2, tileY + 118 + li * 22));
  });
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "700 26px sans-serif";
  ctx.fillText("7 semanas de entrenamiento y descarga 💪", W / 2, 740);
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
  // Layout para el canvas real de 540×960. La versión anterior usaba
  // coordenadas de un lienzo del doble (título en y=480, cierre en y≈1200):
  // la tarjeta salía cortada, con textos gigantes y la mitad fuera de
  // cuadro — la "imagen bugueada" del historial.
  drawShareCardBase(ctx, W, H, accent, "#06B6D4");
  ctx.textAlign = "center";

  ctx.fillStyle = accent;
  ctx.font = "800 22px sans-serif";
  ctx.fillText("💪 RESUMEN DE ENTRENAMIENTO", W / 2, 150);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "900 42px sans-serif";
  let label = (periodLabel || "").toUpperCase();
  if (label.length > 40) label = label.slice(0, 39).trimEnd() + "…";
  const lines = wrapCanvasText(ctx, label, W / 2, 208, W - 80, 50);
  let y = 208 + (lines - 1) * 50;

  // Grilla de días entrenados — mismos casilleros llenos/vacíos que el
  // calendario de Historial, dimensionados para que SIEMPRE entren:
  // semana = 1 fila (celdas grandes), mes = hasta 6 filas (celdas chicas).
  const gridCols = 7;
  if (calendarCells && calendarCells.length) {
    const rows = Math.ceil(calendarCells.length / gridCols);
    const cell = rows > 1 ? 44 : 56, gap = rows > 1 ? 8 : 12;
    const gridW = gridCols * cell + (gridCols - 1) * gap;
    const startX = (W - gridW) / 2, startY = y + 50;
    calendarCells.forEach((c, i) => {
      if (c.isPad) return;
      const col = i % gridCols, row = Math.floor(i / gridCols);
      const x = startX + col * (cell + gap), cy = startY + row * (cell + gap);
      ctx.fillStyle = c.trained ? accent : "rgba(255,255,255,0.07)";
      canvasRoundRect(ctx, x, cy, cell, cell, 10); ctx.fill();
      if (c.trained) {
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.font = `700 ${Math.round(cell * 0.46)}px sans-serif`;
        ctx.fillText("✓", x + cell / 2, cy + cell / 2 + cell * 0.17);
      }
    });
    y = startY + rows * cell + (rows - 1) * gap;
  } else {
    y += 60;
  }

  // 3 tiles de estadísticas
  const tileY = Math.min(y + 44, 640);
  const tiles = [
    { val: daysTrained, label: "DÍAS\nENTRENADOS" },
    { val: totalSets ?? 0, label: "SERIES\nTOTALES" },
    { val: totalVol > 999 ? `${(totalVol / 1000).toFixed(1)}k` : totalVol, label: "KG × REPS\nTOTALES" },
  ];
  const tileGap = 16, tileW = (W - 64 - tileGap * 2) / 3, tileH = 128;
  tiles.forEach((t, i) => {
    const x = 32 + i * (tileW + tileGap);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    canvasRoundRect(ctx, x, tileY, tileW, tileH, 16); ctx.fill();
    ctx.fillStyle = "#f8fafc";
    ctx.font = "900 34px sans-serif";
    ctx.fillText(`${t.val}`, x + tileW / 2, tileY + 58);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "700 13px sans-serif";
    t.label.split("\n").forEach((l, li) => ctx.fillText(l, x + tileW / 2, tileY + 86 + li * 17));
  });

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "700 24px sans-serif";
  ctx.fillText(daysTrained > 0 ? "¡Seguí así! 💪" : "A entrenar 💪", W / 2, tileY + tileH + 60);
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
const NON_INTERACTIVE_SLUGS = new Set(["head", "knees", "abductors"]);

function buildPolyIndexToSlug(order) {
  const out = [];
  order.forEach(([slug, count]) => { for (let i = 0; i < count; i++) out.push(slug); });
  return out;
}
const ANTERIOR_POLY_SLUGS = buildPolyIndexToSlug(ANTERIOR_POLY_ORDER);
const POSTERIOR_POLY_SLUGS = buildPolyIndexToSlug(POSTERIOR_POLY_ORDER);

function drawMuscleRankShareCard(ctx, W, H, { ranks, modeLabel, accent = "#F59E0B" }) {
  drawShareCardBase(ctx, W, H, accent, "#A855F7");
  ctx.textAlign = "center";
  ctx.fillStyle = accent;
  ctx.font = `800 ${Math.round(W * 0.052)}px sans-serif`;
  ctx.fillText("MIS RANGOS", W / 2, Math.round(H * 0.13));
  ctx.fillStyle = "#94a3b8";
  ctx.font = `700 ${Math.round(W * 0.036)}px sans-serif`;
  ctx.fillText(modeLabel, W / 2, Math.round(H * 0.158));

  // Dibujo DIRECTO de los polígonos en el canvas — sin SVG, sin Image,
  // sin drawImage. La conversión SVG→Image fallaba en los WebViews de
  // Android (el onload nunca disparaba o dibujaba 0×0) y por eso la
  // imagen del muñeco no se generaba nunca en el teléfono.
  const NEUTRAL = "#334155";
  const bodyW = Math.round(W * 0.36);
  const bodyH = bodyW * 2;
  const gap = Math.round(W * 0.08);
  const startX = (W - (bodyW * 2 + gap)) / 2;
  const bodyY = Math.round(H * 0.20);

  const fillFor = (slug, view) => {
    if (NON_INTERACTIVE_SLUGS.has(slug)) return NEUTRAL;
    if (view === "front" && slug === "calves") {
      const lvl = ranks.tibial_anterior?.levelIdx ?? -1;
      return lvl >= 0 ? (ranks.tibial_anterior?.color || NEUTRAL) : NEUTRAL;
    }
    if (view === "back" && slug === "neck") return NEUTRAL;
    if (view === "front" && slug === "neck") {
      const lvl = ranks.trapecio?.levelIdx ?? -1;
      return lvl >= 0 ? (ranks.trapecio?.color || NEUTRAL) : NEUTRAL;
    }
    const keys = Object.entries(BODY_HIGHLIGHTER_SLUG_MAP).filter(([, s]) => s === slug || (slug.endsWith("-soleus") && s === "calves")).map(([k]) => k);
    if (!keys.length) return NEUTRAL;
    const best = keys.reduce((a, b) => ((ranks[b]?.levelIdx ?? -1) > (ranks[a]?.levelIdx ?? -1) ? b : a));
    const lvl = ranks[best]?.levelIdx ?? -1;
    return lvl >= 0 ? (ranks[best]?.color || NEUTRAL) : NEUTRAL;
  };

  const drawView = (order, points, view, offsetX) => {
    const sx = bodyW / 100, sy = bodyH / 200;
    order.forEach(([slug]) => {
      const color = fillFor(slug, view);
      (points[slug] || []).forEach((pointStr) => {
        const nums = pointStr.trim().split(/[\s,]+/).map(Number);
        if (nums.length < 6) return;
        ctx.beginPath();
        for (let i = 0; i < nums.length - 1; i += 2) {
          const x = offsetX + nums[i] * sx;
          const y = bodyY + nums[i + 1] * sy;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      });
    });
  };

  drawView(ANTERIOR_POLY_ORDER, ANTERIOR_POLY_POINTS, "front", startX);
  drawView(POSTERIOR_POLY_ORDER, POSTERIOR_POLY_POINTS, "back", startX + bodyW + gap);

  const labelY = bodyY + bodyH + Math.round(H * 0.035);
  ctx.fillStyle = "#cbd5e1";
  ctx.font = `700 ${Math.round(W * 0.030)}px sans-serif`;
  ctx.fillText("De frente", startX + bodyW / 2, labelY);
  ctx.fillText("De espalda", startX + bodyW + gap + bodyW / 2, labelY);

  drawWordmark(ctx, W, H, accent);
}

function ShareImageModal({ title, fileNamePrefix, shareTitle, shareText, draw, onClose, autoShowOptOutLabel, onOptOutAutoShow }) {
  useAndroidBack(onClose);
  const canvasRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  // El modal SIEMPRE arranca con el scroll arriba — sin esto, si el modal
  // se abre mientras la página de atrás está scrolleada, algunos WebViews
  // heredan una posición de scroll intermedia y los botones quedan fuera
  // de vista hasta que el usuario scrollea a mano.
  useEffect(() => {
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
  }, []);
  useEffect(() => {
    if (previewUrl && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [previewUrl]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 540; canvas.height = 960;
    const ctx = canvas.getContext("2d");
    let cancelled = false;
    (async () => {
      try {
        await draw(ctx, 540, 960);
        if (!cancelled) setPreviewUrl(canvas.toDataURL("image/jpeg", 0.88));
      } catch (err) {
        console.error("Error generando la imagen para compartir:", err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, []);

  const isNative = typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.();
  // Guarda el PNG en el caché de la app (Android nativo) y devuelve su URI.
  // Usa import() dinámico — @capacitor/filesystem no está en package.json del
  // servidor de Vercel, solo en el proyecto de Android. Import estático
  // rompía el build de Vercel porque Vite lo buscaba al compilar.
  const writeImageToCache = async () => {
    const canvas = canvasRef.current; if (!canvas) return null;
    const dataUrl = canvas.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1];
    const fileName = `${fileNamePrefix}-${Date.now()}.png`;
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const result = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
    return result.uri;
  };
  const handleDownload = async () => {
    const canvas = canvasRef.current; if (!canvas) return;
    if (isNative) {
      try {
        const uri = await writeImageToCache();
        if (uri) {
          const { Share } = await import("@capacitor/share");
          await Share.share({ title: shareTitle, files: [uri] });
          return;
        }
      } catch (err) { console.error("Descarga nativa falló:", err); }
      return;
    }
    const link = document.createElement("a");
    link.download = `${fileNamePrefix}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  const handleShare = async () => {
    const canvas = canvasRef.current; if (!canvas) return;
    if (isNative) {
      try {
        const uri = await writeImageToCache();
        if (uri) {
          const { Share } = await import("@capacitor/share");
          await Share.share({ title: shareTitle, text: shareText, files: [uri] });
          return;
        }
      } catch (err) { console.error("Share nativo falló:", err); }
      return;
    }
    try {
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (blob) {
        const file = new File([blob], `${fileNamePrefix}.png`, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: shareTitle, text: shareText });
          return;
        }
      }
    } catch { return; }
    handleDownload();
  };

  return (
    <div className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 modal-bg-in modal-overlay" onClick={onClose}>
      <div ref={scrollContainerRef} className="bg-slate-900 border border-slate-700/60 rounded-3xl max-w-sm w-full p-5 modal-pop-in shadow-2xl shadow-black/50 max-h-[92vh] overflow-y-auto overscroll-contain" onClick={(e) => e.stopPropagation()}>
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
        {/* Botones siempre visibles primero — el preview es secundario */}
        <div className="flex gap-2 mb-3">
          <button onClick={handleShare} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl !text-white text-sm font-bold transition-all active:scale-[0.98]" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)" }}><Share2 size={14} /> Compartir</button>
          <button onClick={handleDownload} disabled={!previewUrl} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition text-sm font-semibold disabled:opacity-40"><Download size={14} /> Descargar</button>
        </div>
        {previewUrl ? (
          <img src={previewUrl} alt="Vista previa para compartir" className="w-full rounded-2xl border border-slate-800/60" style={{ aspectRatio: "9 / 16", objectFit: "cover", maxHeight: "50vh" }} />
        ) : (
          <div className="w-full rounded-2xl border border-slate-800/60 flex flex-col items-center justify-center gap-2 py-10" style={{ aspectRatio: "9 / 16", maxHeight: "50vh" }}>
            <div className="w-7 h-7 rounded-full border-[3px] border-teal-500/25 border-t-teal-500 animate-spin" />
            <p className="text-[11px] text-slate-500">Generando imagen...</p>
          </div>
        )}
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
      customParameters: [
        { key: "client_id", value: "1027242959052-b9i0hq3fc2rbfoqr48chkpkkir2qu4e6.apps.googleusercontent.com" }
      ]
    });
    if (!result?.user) throw new Error("No se recibió el usuario de Google.");

    // El plugin autentica Firebase en la capa nativa de Android, pero el
    // Firebase JS SDK que corre en el WebView es una instancia separada —
    // su auth.currentUser queda null hasta que lo sincronizamos a mano.
    // Sin este paso, Firestore rechaza todas las lecturas/escrituras con
    // permission-denied aunque el usuario esté autenticado en la capa nativa.
    // signInWithCredential fuerza la sincronización de forma inmediata.
    const idToken = result.credential?.idToken;
    if (idToken) {
      const credential = GoogleAuthProvider.credential(idToken);
      const userCred = await signInWithCredential(auth, credential);
      return userCred.user;
    }
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

      // 3. Siempre consultamos Firestore al hacer login con Google — aunque
      // haya un perfil local con este uid, puede estar vacío (si fue creado
      // en una sesión anterior antes de que los datos llegaran a Firestore).
      const matchEntry = Object.entries(profiles).find(([, p]) => p.googleUid === uid);
      const cloudProfile = await fetchProfileFromCloud(uid);

      if (matchEntry || cloudProfile) {
        const [matchName, localProfile] = matchEntry || [cloudProfile?.name || name, null];
        const merged = mergeProfiles(localProfile, cloudProfile);
        const finalProfile = { ...merged, archived: false, googleUid: uid, email };
        const updated = { ...profiles, [matchName]: finalProfile };
        saveProfiles(updated); setProfilesState(updated);
        saveActive(matchName);
        if (finalProfile.cycleStart) {
          const cloudDate = new Date(finalProfile.cycleStart);
          if (!isNaN(cloudDate)) { saveCycleStart(cloudDate); }
        }
        onLogin(matchName, updated);
        syncProfileToCloud(uid, { ...finalProfile, name: matchName }).catch(() => {});
        return;
      }

      // No hay perfil en Firestore ni local con este googleUid.
      // Antes de crear uno nuevo, buscamos si hay UN SOLO perfil local sin
      // googleUid (creado offline) — si es así, es casi seguro que es el
      // mismo usuario. Lo fusionamos en vez de crear un duplicado.
      const localProfiles = Object.entries(profiles).filter(([, p]) => !p.googleUid && !p.archived);
      if (localProfiles.length === 1) {
        const [localName, localProfile] = localProfiles[0];
        const finalProfile = { ...localProfile, archived: false, googleUid: uid, email };
        const updated = { ...profiles, [localName]: finalProfile };
        saveProfiles(updated); setProfilesState(updated); saveActive(localName);
        await syncProfileToCloud(uid, { ...finalProfile, name: localName });
        onLogin(localName, updated);
        return;
      }

      // Primera vez real: no hay ningún perfil local. Crear uno nuevo.
      const profileToSave = { pin: null, logs: {}, email, joinedAt: new Date().toISOString(), deviceId, tutorialSeen: false, googleUid: uid };
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
// Registro global de descansos en curso — sobrevive al desmontaje del
// componente (cambio de pestaña, scroll virtual, etc.). Cada timer se
// identifica por timerId y guarda su hora real de finalización.
const ACTIVE_REST_TIMERS = {};

// Número que "cuenta" hasta su valor final en vez de aparecer de golpe.
// Se usa para los récords: ver el peso subir de 80 a 82.5 refuerza la
// sensación de progreso mucho más que verlo ya escrito.
// ── Pila global de "cerradores" para el botón atrás de Android ──────────────
// Cada modal abierto registra acá su función de cierre. Cuando el usuario usa
// el gesto de atrás del sistema, se cierra el modal de más arriba en vez de
// cerrarse la app entera.
const BACK_HANDLERS = [];

// Músculos que subieron de rango en esta sesión de uso. La próxima vez que
// abras Progreso, esos músculos laten en el muñeco con su color nuevo y el
// registro se consume. Vive en memoria (no en el perfil): es un efecto
// visual efímero, no un dato.
const RECENT_RANK_UPS = new Set();

// Última racha que el usuario vio en Progreso. Si al volver aumentó (terminó
// una sesión en el medio), el número hace un salto dorado en vez del latido
// de siempre.
let STREAK_VISTO = null;

// Cuántos modales hay abiertos ahora mismo. Sirve para congelar el fondo una
// sola vez aunque haya modales apilados (y descongelarlo recién cuando se
// cierra el último).
let MODALES_ABIERTOS = 0;
let SCROLL_CONGELADO_EN = 0;

// Congela la página de fondo mientras hay un modal abierto.
//
// El problema: al deslizar dentro de un pop-up, cuando su contenido llega al
// tope el gesto se propaga al fondo y mueve la página entera detrás del modal.
// La solución robusta en móvil es `position: fixed` en el body — con
// overflow:hidden solo, iOS y varios Android igual siguen scrolleando. Como
// fixed haría saltar la página al tope, guardamos la posición y la
// restauramos al cerrar.
function congelarFondo() {
  if (MODALES_ABIERTOS++ > 0) return; // ya estaba congelado por otro modal
  SCROLL_CONGELADO_EN = window.scrollY || 0;
  const b = document.body;
  b.style.position = "fixed";
  b.style.top = `-${SCROLL_CONGELADO_EN}px`;
  b.style.left = "0";
  b.style.right = "0";
  b.style.width = "100%";
  b.style.overflowY = "scroll"; // mantiene el ancho de la barra: no salta el layout
}
function descongelarFondo() {
  if (--MODALES_ABIERTOS > 0) return;  // todavía queda otro modal abierto
  if (MODALES_ABIERTOS < 0) MODALES_ABIERTOS = 0; // por las dudas
  const b = document.body;
  b.style.position = "";
  b.style.top = "";
  b.style.left = "";
  b.style.right = "";
  b.style.width = "";
  b.style.overflowY = "";
  window.scrollTo(0, SCROLL_CONGELADO_EN); // volver justo a donde estabas
}

// Hook de modal: registra el cierre para el botón atrás de Android Y congela
// el fondo mientras está abierto. Lo llaman todos los modales.
// Uso: useAndroidBack(onClose) al principio del componente.
function useAndroidBack(onClose) {
  useEffect(() => {
    if (typeof onClose !== "function") return;
    BACK_HANDLERS.push(onClose);
    congelarFondo();
    return () => {
      const i = BACK_HANDLERS.lastIndexOf(onClose);
      if (i !== -1) BACK_HANDLERS.splice(i, 1);
      descongelarFondo();
    };
  }, [onClose]);
}

function CountUpNumber({ value, from = null, duration = 700, decimals = 1, className = "", style = {} }) {
  const [shown, setShown] = useState(from ?? value);
  const rafRef = useRef(null);
  useEffect(() => {
    const start = from ?? 0;
    const end = Number(value) || 0;
    if (start === end) { setShown(end); return; }
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      // easeOutCubic: arranca rápido y frena suave al llegar
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(start + (end - start) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, from, duration]);
  const txt = decimals > 0 ? (Math.round(shown * 10) / 10).toString().replace(/\.0$/, "") : String(Math.round(shown));
  return <span className={`tabular-nums ${className}`} style={style}>{txt}</span>;
}

function RestTimer({ seconds, accent, alertType = "sound", timerId = "default", exerciseName = "" }) {
  const persisted = ACTIVE_REST_TIMERS[timerId];
  const stillRunning = persisted && persisted.endTime > Date.now();
  const [remaining, setRemaining] = useState(stillRunning ? Math.ceil((persisted.endTime - Date.now()) / 1000) : seconds);
  const [running, setRunning] = useState(!!stillRunning);
  const endTimeRef = useRef(stillRunning ? persisted.endTime : null);
  const intervalRef = useRef();
  const firedRef = useRef(false);
  const resetTimerRef = useRef(null); // devuelve el reloj a los minutos originales al terminar
  useEffect(() => () => { if (resetTimerRef.current) clearTimeout(resetTimerRef.current); }, []);
  useEffect(() => {
    // Si hay un descanso en curso persistido para este timer, retomarlo;
    // si no, resetear normalmente cuando cambian los segundos base.
    const p = ACTIVE_REST_TIMERS[timerId];
    if (p && p.endTime > Date.now()) {
      endTimeRef.current = p.endTime;
      setRemaining(Math.ceil((p.endTime - Date.now()) / 1000));
      setRunning(true);
    } else {
      delete ACTIVE_REST_TIMERS[timerId];
      setRemaining(seconds); setRunning(false); endTimeRef.current = null; firedRef.current = false;
    }
  }, [seconds, timerId]);

  const fireAlert = async () => {
    if (firedRef.current) return;
    firedRef.current = true;
    delete ACTIVE_REST_TIMERS[timerId];
    if (alertType !== "vibration") {
      try {
        const a = new AudioContext();
        // Arpegio ascendente tipo "campanita" (Do-Mi-Sol de la 5ª octava): tres
        // notas cortas que suben, con ataque rápido y caída suave. Más agradable
        // que el doble beep plano y se distingue mejor del ruido del gimnasio.
        // El envelope con rampas evita el "click" de cortar la onda de golpe.
        [523.25, 659.25, 783.99].forEach((freq, k) => {
          const t0 = a.currentTime + k * 0.13;
          const o = a.createOscillator(), g = a.createGain();
          o.type = "sine";
          o.frequency.value = freq;
          o.connect(g); g.connect(a.destination);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.28, t0 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
          o.start(t0);
          o.stop(t0 + 0.34);
        });
        // Antes esto se acumulaba: cada serie creaba un AudioContext nuevo
        // y nunca se cerraba. Los navegadores tienen un límite de
        // contextos simultáneos (chico en iOS Safari en particular) —
        // pasado ese límite, el sonido deja de sonar sin ningún error
        // visible. Se cierra solo, ~700ms después (los dos beeps de
        // 280ms con 220ms de diferencia entre uno y otro ya terminaron).
        setTimeout(() => { a.close().catch(() => { }); }, 900);
      } catch { /* ignorado a propósito */ }
    }
    if (alertType !== "sound") haptic([400, 150, 400, 150, 500, 150, 400]);
    // Notificación del sistema al terminar el descanso
    try {
      if (Capacitor.isNativePlatform()) {
        // LocalNotifications en Android: aparece como notificación real del sistema,
        // incluso con la pantalla apagada o la app en segundo plano.
        await LocalNotifications.cancel({ notifications: [{ id: 9002 }] }).catch(() => {});
        // Solo apagar la notif nativa si ESTE timer sigue siendo el dueño —
        // si otro cronómetro la tomó, no se la pisamos.
        if (ACTIVE_REST_TIMERS.__notifOwner === timerId) {
          await RestTimerNotification.stop().catch(() => {});
          delete ACTIVE_REST_TIMERS.__notifOwner;
        }
        await LocalNotifications.schedule({
          notifications: [{
            id: 9001,
            smallIcon: "ic_stat_modusfit",
            title: "⏱️ Descanso terminado — Modus Fit",
            body: "Es hora de la próxima serie 💪",
            channelId: "modusfit-rest-done-v1",
            sound: alertType === "vibration" ? undefined : "default",
            schedule: { at: new Date(Date.now() + 100) },
          }],
        });
      } else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("⏱️ Descanso terminado — Modus Fit", {
          body: "Es hora de la próxima serie 💪",
          silent: alertType === "vibration",
          tag: "rest-timer",
          renotify: true,
        });
      }
    } catch { /* ignorado a propósito */ }
  };

  const recompute = () => {
    if (!endTimeRef.current) return;
    const left = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000));
    setRemaining(left);
    if (left <= 0) {
      setRunning(false);
      fireAlert();
      endTimeRef.current = null;
      // Volver al tiempo original: antes quedaba clavado en 0:00 y había que
      // tocarlo. Esperamos 1.2s para que alcances a VER que llegó a cero.
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => { setRemaining(seconds); resetTimerRef.current = null; }, 1200);
    }
  };

  useEffect(() => {
    if (running) {
      if (!endTimeRef.current) { endTimeRef.current = Date.now() + remaining * 1000; firedRef.current = false; }
      // Persistir en el registro global — si el componente se desmonta
      // (cambio de pestaña), al volver retoma desde acá.
      ACTIVE_REST_TIMERS[timerId] = { endTime: endTimeRef.current };
      (async () => {
        // Cronómetro EN VIVO en la barra de notificaciones: va PRIMERO y en
        // su propio try — antes estaba encadenado detrás del pedido de
        // permisos de LocalNotifications, y si cualquier paso previo
        // fallaba, el catch silencioso se tragaba todo y el plugin nativo
        // nunca llegaba a ejecutarse.
        try {
          if (Capacitor.isNativePlatform()) {
            const secsLeft = Math.max(1, Math.ceil((endTimeRef.current - Date.now()) / 1000));
            ACTIVE_REST_TIMERS.__notifOwner = timerId; // este timer es dueño de la notif ahora
            try {
              await RestTimerNotification.start({ seconds: secsLeft, exerciseName: exerciseName || "" });
              console.log("[notif] Plugin nativo OK — cronómetro en vivo (RestTimerPlugin)");
            } catch (pluginErr) {
              // Plugin no disponible (build viejo sin el Java) — fallback:
              // notificación estática con la hora de fin, mejor que nada.
              // Si ves este log, la app instalada NO tiene el RestTimerPlugin
              // compilado adentro: hay que recompilar el .aab/APK e instalar.
              console.warn("[notif] Plugin nativo NO disponible, usando fallback estático:", pluginErr?.message || pluginErr);
              const endsAt = new Date(endTimeRef.current);
              const hh = String(endsAt.getHours()).padStart(2, "0");
              const mm = String(endsAt.getMinutes()).padStart(2, "0");
              await LocalNotifications.schedule({
                notifications: [{
                  id: 9002,
                  title: "⏱️ Descanso en curso — Modus Fit",
                  body: `La próxima serie arranca a las ${hh}:${mm}`,
                  channelId: "ponos-rest-timer",
                  ongoing: true,
                  autoCancel: false,
                  smallIcon: "ic_stat_modusfit",
                }],
              });
            }
          }
        } catch (err) { console.error("Cronómetro nativo:", err); }
        // LA NOTIFICACIÓN DE FIN, PROGRAMADA DESDE EL INICIO con hora
        // exacta: la dispara EL SISTEMA aunque la app esté congelada en
        // segundo plano. Antes se creaba recién cuando el JS detectaba el
        // fin — y si estabas scrolleando Instagram, Android congela el JS
        // de la WebView: ni vibración ni aviso hasta reabrir la app. Con
        // allowWhileIdle atraviesa también el modo Doze. Usa el canal
        // "modusfit-rest-done-v1" (vibración fuerte tipo alarma, creado
        // con patrón custom desde el plugin nativo; acá se crea igual por
        // si el build nativo es viejo — Android usa el primero que llegue).
        try {
          if (Capacitor.isNativePlatform()) {
            await LocalNotifications.createChannel({ id: "modusfit-rest-done-v1", name: "Fin del descanso", description: "Aviso al terminar el descanso entre series", importance: 5, vibration: true }).catch(() => {});
            await LocalNotifications.schedule({
              notifications: [{
                id: 9001,
                smallIcon: "ic_stat_modusfit",
                title: "⏱️ ¡Descanso terminado!",
                body: "Dale, volvé a la serie 💪",
                channelId: "modusfit-rest-done-v1",
                sound: alertType === "vibration" ? undefined : "default",
                schedule: { at: new Date(endTimeRef.current), allowWhileIdle: true },
              }],
            });
            console.log("[notif] Aviso de fin programado para", new Date(endTimeRef.current).toLocaleTimeString());
          }
        } catch (e) { console.warn("[notif] No se pudo programar el aviso de fin:", e); }
        // Permisos + canal para la notificación FINAL de "descanso terminado"
        try {
          if (Capacitor.isNativePlatform()) {
            const { display } = await LocalNotifications.requestPermissions();
            if (display === "granted") {
              await LocalNotifications.createChannel({ id: "ponos-rest-timer", name: "Descanso entre series", importance: 5, vibration: true });
            }
          } else if (typeof Notification !== "undefined" && Notification.permission === "default") {
            Notification.requestPermission().catch(() => {});
          }
        } catch { /* ignorado a propósito */ }
      })();
      intervalRef.current = setInterval(recompute, 500);
      const onVisible = () => { if (document.visibilityState === "visible") recompute(); };
      document.addEventListener("visibilitychange", onVisible);
      return () => { clearInterval(intervalRef.current); document.removeEventListener("visibilitychange", onVisible); };
    }
    endTimeRef.current = null;
    delete ACTIVE_REST_TIMERS[timerId];
    // Cancelar la notificación persistente Y el aviso de fin programado
    // si el timer se pausa/resetea — si no, el aviso sonaría igual a la
    // hora original aunque hayas frenado el descanso.
    try {
      if (Capacitor.isNativePlatform()) {
        LocalNotifications.cancel({ notifications: [{ id: 9001 }, { id: 9002 }] }).catch(() => {});
        if (ACTIVE_REST_TIMERS.__notifOwner === timerId) {
          RestTimerNotification.stop().catch(() => {});
          delete ACTIVE_REST_TIMERS.__notifOwner;
        }
      }
    } catch { /* ignorado a propósito */ }
    // eslint-disable-next-line
  }, [running]);

  // Guarda contra división por cero: si un ejercicio quedara configurado con
  // 0 segundos de descanso, (remaining/0)*100 da NaN y la barra desaparece.
  const pct = seconds > 0 ? Math.max(0, Math.min(100, (remaining / seconds) * 100)) : 0;
  // Cronómetro estilo "barra de energía": el tiempo grande a la izquierda y
  // una barra que se vacía ocupando todo el ancho. En los últimos 10 segundos
  // se tiñe de ámbar y late; al terminar se pone verde. Sin adornos ni
  // círculos: se lee de un vistazo desde lejos, que es lo que importa cuando
  // estás por volver a la serie.
  const urgent = running && remaining <= 10 && remaining > 0;
  const done = remaining === 0;
  const barColor = done ? "#10B981" : urgent ? "#F59E0B" : accent;
  return (
    <div className="relative rounded-2xl overflow-hidden px-3.5 py-2.5 transition-colors duration-300" style={{
      backgroundColor: running ? barColor + "0e" : "var(--timer-idle-bg)",
      border: `1px solid ${running ? barColor + "30" : "var(--timer-idle-border)"}`,
    }}>
      <div className="flex items-center gap-2.5">
        {/* Tiempo protagonista */}
        <span
          className={`text-2xl font-black tabular-nums shrink-0 transition-colors ${urgent ? "soft-pulse" : ""}`}
          style={{ color: running || done ? barColor : "#94a3b8", textShadow: urgent ? `0 0 16px ${barColor}70` : "none" }}
        >
          {formatTime(remaining)}
        </span>

        {/* Solo la barra que se vacía — sin palabras ni tiempo repetido. */}
        <div className="flex-1 min-w-0 flex items-center">
          <div className="w-full h-2 rounded-full overflow-hidden bg-slate-800/70">
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct}%`,
                background: `linear-gradient(90deg, ${barColor}90, ${barColor})`,
                boxShadow: running ? `0 0 8px ${barColor}80` : "none",
                transition: "width 0.95s linear, background 0.3s",
              }}
            />
          </div>
        </div>

        {/* Controles */}
        <div className="flex gap-1.5 shrink-0">
          <button onClick={() => { haptic(15); setRunning((r) => !r); }} aria-label={running ? "Pausar" : "Iniciar"} className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition" style={running ? { background: `linear-gradient(160deg, ${accent}, ${accent}b0)`, color: "#fff" } : { backgroundColor: accent + "1e", color: accent, border: `1px solid ${accent}40` }}>
            {running ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
          </button>
          <button onClick={() => { setRunning(false); setRemaining(seconds); endTimeRef.current = null; firedRef.current = false; }} aria-label="Reiniciar" className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition text-slate-500 hover:text-slate-300 bg-slate-800/50 border border-slate-700/50">
            <RotateCcw size={13} />
          </button>
        </div>
      </div>
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
    const trainedSample = new Set([3, 5, 9, 12, 16, 19, 23].map((d) => localDateStr(new Date(now.getFullYear(), now.getMonth(), d))));
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
    label: "Objetivo",
    color: "#14B8A6",
    icon: <Sparkles size={16} />,
    steps: [
      {
        icon: <Flame size={20} />,
        title: "¡Bienvenido a Modus Fit!",
        text: "Tour rápido por todas las funciones. Podés saltearlo en cualquier momento con la X y volver cuando quieras tocando el ? arriba a la derecha.",
      },
      {
        icon: <Layers size={20} />,
        title: "Cuatro secciones principales",
        text: "Abajo tenés 4 pestañas: Rutina (donde entrenás), Progreso, Rutinas y Entrenador IA. Tu perfil y configuración los abrís tocando tu avatar arriba a la izquierda.",
      },
      {
        icon: <Target size={20} />,
        title: "Primeros pasos",
        text: "Al entrar por primera vez verás una tarjeta con 3 tareas: configurar la fecha de inicio de ciclo, completar tus datos (sexo, edad, peso, altura) y registrar tu primera marca. Cuando completes todo, desaparece para siempre.",
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
        text: "Registrás cada sesión acá: elegís el día, ves los ejercicios con sus series y anotás reps y kg a medida que entrenás.",
      },
      {
        icon: <Play size={20} />,
        title: "Iniciar y finalizar sesión",
        text: "Tocá \"Iniciar sesión\" cuando arrancás a entrenar. Al terminar, \"Finalizar sesión\" registra que entrenaste hoy. Los datos se guardan aunque no inicies sesión, pero ese día no suma al historial.",
        demo: { kind: "rutina", view: "session", caption: "Probá iniciar la sesión" },
      },
      {
        icon: <ChevronDown size={20} />,
        title: "Tarjetas de ejercicio",
        text: "Tocá una tarjeta para desplegarla. Ves el cronómetro, las series, la nota técnica y el video. Tu récord aparece en el recuadro del color del día. Si llevas 21+ días sin mejorarlo, te avisa que está estancado.",
        demo: { kind: "rutina", view: "card-closed", caption: "Tocá la tarjeta para desplegarla" },
      },
      {
        icon: <StickyNote size={20} />,
        title: "Notas por ejercicio",
        text: "Debajo de cada serie tenés \"Agregar nota\" para escribir tus recordatorios: \"agarre más cerrado\", \"el banco 3 está flojo\", \"probar pausa abajo\". Cada serie guarda la suya y se sincroniza con tu cuenta.",
      },
      {
        icon: <Dumbbell size={20} />,
        title: "¿Una o dos mancuernas?",
        text: "Al editar la rutina, en cada ejercicio de mancuerna elegís si usás una o dos. Con dos de 20kg, tu rango cuenta 40kg de carga real en vez de 20.",
      },
      {
        icon: <Sliders size={20} />,
        title: "Personalizá qué ves al registrar",
        text: "Te recomendamos dejar prendido SOLO lo que vayas a usar: con las seis opciones activadas la ficha se llena de botones y cuesta encontrar lo importante. ¿No usás el RPE o el calentamiento? Apagalos y queda mucho más limpia. Está en Perfil → \"Qué ves al registrar\", con vista previa en vivo para que veas cómo queda mientras elegís.",
      },
      {
        icon: <Save size={20} />,
        title: "Registrá tus series",
        text: "Ingresás reps y kg y tocás guardar. La primera vez no muestra récord — desde la segunda mejora en adelante aparece el confetti.",
        demo: { kind: "rutina", view: "card-open", caption: "Ingresá reps y kg, y tocá Guardar" },
      },
      {
        icon: <Percent size={20} />,
        title: "Entrená por % de 1RM",
        text: "Debajo del input de kg hay una fila \"% 1RM\" (solo cuando tenés marcas). Ingresás el porcentaje que querés trabajar (ej. 80) y la app calcula el kg automáticamente. A la derecha te muestra el % real del peso que escribiste.",
      },
      {
        icon: <Pause size={20} />,
        title: "Cronómetro de descanso",
        text: "Arriba de las series está el temporizador. Avisa con sonido, vibración o ambos cuando arrancar la próxima serie. Si cambiás de app mientras corre, al volver se corrige contra la hora real.",
        demo: { kind: "rutina", view: "card-open", caption: "El cronómetro está arriba de las series" },
      },
      {
        icon: <Activity size={20} />,
        title: "Cardio: cronómetro y cuenta regresiva",
        text: "Los ejercicios de cardio tienen dos modos: Cronómetro (arrancás, entrenás, parás y se guarda el tiempo) o Cuenta regresiva (ingresás el objetivo en minutos y cuando llega a 0 guarda solo con vibración).",
      },
      {
        icon: <Flame size={20} />,
        title: "Calentamiento sugerido",
        text: "Si ya tenés marca, debajo del cronómetro aparece \"Ver calentamiento sugerido\": 3 series a 50%, 70% y 85% de tu peso actual. Es solo una guía, no se registra.",
      },
      {
        icon: <Share2 size={20} />,
        title: "Compartir una marca nueva",
        text: "Al lograr una marca, se abre una imagen para compartir. Podés desactivar eso en Perfil → Compartir marcas si preferís controlarlo manualmente.",
      },
      {
        icon: <Zap size={20} />,
        title: "Tu semana de descarga",
        text: "Cada cierta cantidad de semanas tu ciclo entra en descarga: menos series y menos peso para bajar la fatiga. La primera vez que abrís en esa semana te avisamos y te llevamos directo ahí.",
        demo: { kind: "descarga", view: "header" },
      },
      {
        icon: <ArrowDown size={20} />,
        title: "Cargas sugeridas en descarga",
        text: "Ves tu mejor marca tachada y el peso reducido al lado. Cada ejercicio de cardio reduce los minutos. Podés ver los pesos en kg o lbs con el toggle arriba a la derecha. Tildás cada serie a medida que la hacés.",
        demo: { kind: "descarga", view: "suggested" },
      },
      {
        icon: <RotateCcw size={20} />,
        title: "Resetear el día",
        text: "Si te equivocaste registrando algo, \"Resetear sesión de hoy\" borra solo los datos de hoy — los récords no se tocan.",
        demo: { kind: "rutina", view: "reset", caption: "Tocá para ver cómo pide confirmación" },
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
        title: "Progreso: tu evolución completa",
        text: "Junta todos tus registros para mostrarte qué tan constante fuiste y cuánto mejoraste, con gráficos, rankings musculares e historial.",
      },
      {
        icon: <Calendar size={20} />,
        title: "Tu ciclo de entrenamiento",
        text: "Arriba ves en qué semana de tu ciclo estás, si es semana de entrenamiento o descarga, y cuántos días entrenaste en cada semana.",
        demo: { kind: "progreso", view: "ciclo" },
      },
      {
        icon: <Award size={20} />,
        title: "El muñeco muscular",
        text: "Es el mapa de tu cuerpo: cada músculo se pinta con el color de tu rango actual, de Bronce a Maestro. Podés girarlo para ver frente y espalda, y tocar cualquier músculo para abrir su detalle: tu mejor marca, con qué ejercicio la hiciste, el % hacia el próximo rango y la barra de progreso.",
      },
      {
        icon: <Zap size={20} />,
        title: "Cómo se calculan los rangos",
        text: "Cada grupo muscular toma tu mejor 1RM estimado (peso × reps, fórmula de Epley) entre TODOS los ejercicios que lo trabajan — gana el que dé el número más alto, y se recalcula solo con cada registro. Hay dos modos: General (kg absolutos) y Según tu contexto (ajustado a tu peso corporal, sexo y edad, configurables en Perfil).",
      },
      {
        icon: <Sparkles size={20} />,
        title: "Subida de rango",
        text: "Cuando una marca te hace pasar de tier (ej. Oro → Esmeralda), aparece un modal de celebración con el badge anterior y el nuevo. Ocurre solo al cruzar un tier, no en cada récord dentro del mismo.",
      },
      {
        icon: <Ruler size={20} />,
        title: "Medidas y fotos de progreso",
        text: "Registrá tu peso y medidas corporales, y sacá fotos de progreso. En el calendario de medidas podés tocar un día para ver el detalle, y \"Comparar con otro día\" pone dos fotos lado a lado con la diferencia de peso y de días entre ambas.",
      },
      {
        icon: <Flame size={20} />,
        title: "Estadísticas generales",
        text: "Días entrenados, racha actual, total de series registradas y volumen acumulado (kg × reps).",
        demo: { kind: "progreso", view: "stats" },
      },
      {
        icon: <Calendar size={20} />,
        title: "Historial de sesiones",
        text: "Calendario mensual con un punto de color por día entrenado, o lista con el detalle completo. Tocá cualquier sesión para ver cada serie con 🔥 en las que fueron récord.",
        demo: { kind: "progreso", view: "calendar" },
      },
      {
        icon: <Share2 size={20} />,
        title: "Imágenes para compartir",
        text: "\"Crear imagen para compartir\" genera una imagen con tu mejor marca, un resumen de la semana o del mes, o tu ranking muscular completo.",
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
        title: "Rutinas: armá tu plan",
        text: "Elegís entre rutinas preestablecidas (Push/Pull/Legs, Arnold Split, Upper/Lower y más) o creás la tuya desde cero.",
        demo: { kind: "rutinas", view: "preset", caption: "Tocá la rutina para ver el detalle" },
      },
      {
        icon: <Sparkles size={20} />,
        title: "Creá la tuya",
        text: "Ponele nombre, armá los días que quieras y agregá ejercicios por grupo muscular — incluido Cardio. El círculo numerado de cada día es un selector de color que se usa en toda la app.",
        demo: { kind: "rutinas", view: "builder", caption: "Probá cambiar el nombre del día" },
      },
      {
        icon: <SlidersHorizontal size={20} />,
        title: "Rangos distintos por serie",
        text: "Al configurar un ejercicio en el builder podés poner un rango de reps distinto para cada serie. Así armás fácilmente series de back-off o pirámides (ej. S1: 4-6, S2: 8-10, S3: 12-15).",
      },
      {
        icon: <GripVertical size={20} />,
        title: "Reordená arrastrando",
        text: "En el editor de rutinas, mantené apretado un ejercicio (desde cualquier parte) y deslizá: los demás se corren solos para mostrarte dónde va a caer. Soltá y listo. Las flechas siguen ahí si preferís tocar.",
      },
      {
        icon: <Link size={20} />,
        title: "Superseries",
        text: "Debajo de cada ejercicio hay un botón para vincularlo en superserie con el siguiente — se hacen uno tras otro sin descanso y comparten un solo cronómetro.",
      },
      {
        icon: <Edit3 size={20} />,
        title: "Editá, activá o borrá tus rutinas",
        text: "Tocá el lápiz para modificar las que creaste, \"Activar\" para cambiar a esa, o deslizá hacia la derecha para quitarla. Las preestablecidas no se editan directamente, pero el lápiz te crea una copia personal.",
        demo: { kind: "rutinas", view: "manage" },
      },
      {
        icon: <Download size={20} />,
        title: "Importar desde un archivo",
        text: "Si ya la tenés en Excel, Word o PDF, subís el archivo y la app detecta sola los días, ejercicios, series y reps. \"Detectar con IA\" funciona para formatos más libres.",
      },
    ],
  },
  {
    key: "entrenador_ia",
    label: "IA",
    color: "#14B8A6",
    icon: <Sparkles size={16} />,
    steps: [
      {
        icon: <Sparkles size={20} />,
        title: "Entrenador IA: tu asistente personal",
        text: "Conoce tu entrenamiento real: tus marcas con fecha, si venís subiendo o estancado en cada ejercicio, cuánto volumen le das a cada músculo y hace cuántos días no entrenás alguno. Preguntale \"¿por qué me estanqué en press banca?\" o \"armame el día de mañana\" y responde con TUS números, no con generalidades.",
      },
      {
        icon: <Layers size={20} />,
        title: "Qué puede hacer",
        text: "Crear o modificar rutinas a tu medida, analizar tu progreso y detectar puntos débiles, planificarte el entrenamiento del día, responder dudas de técnica y resolver preguntas sobre el ciclo y la descarga.",
      },
      {
        icon: <Target size={20} />,
        title: "Chips de acceso rápido",
        text: "Los chips debajo del campo de texto insertan prompts completos con un toque: Crear rutina, Analizar progreso, Punto débil, Plan de hoy, Ciclo y descarga.",
      },
      {
        icon: <AlertTriangle size={20} />,
        title: "Siempre pide confirmación",
        text: "Cuando propone crear una rutina o cambiar algo del perfil, te muestra la vista previa completa con \"Confirmar\" o \"Descartar\" — nunca aplica cambios solo.",
      },
      {
        icon: <Mic size={20} />,
        title: "Hablale en vez de escribir",
        text: "El micrófono te deja dictar la pregunta. Cuando termines, tocá el ✓ para confirmar y enviá el mensaje normalmente.",
      },
      {
        icon: <RotateCcw size={20} />,
        title: "Nueva conversación",
        text: "Tocá el ↺ arriba a la derecha del chat para empezar de cero. El historial sigue ahí si cambiás de pestaña y volvés — solo se borra al tocar ese botón.",
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
        text: "Tus datos, la configuración de la app (ciclos, descarga, descansos) y la administración de tu cuenta, todo en un lugar.",
      },
      {
        icon: <Camera size={20} />,
        title: "Foto de perfil",
        text: "Tocá el ícono de cámara sobre tu avatar para elegir una foto de la galería. Se guarda en tu dispositivo y aparece también en el menú lateral.",
      },
      {
        icon: <Mail size={20} />,
        title: "Tus datos y Google",
        text: "\"Editar perfil\" cambia email, sexo, edad y altura (afinan el ranking muscular). \"Vincular con Google\" te permite entrar desde cualquier dispositivo con todo tu historial. Los datos se sincronizan automáticamente.",
        demo: { kind: "perfil", view: "datos" },
      },
      {
        icon: <Calendar size={20} />,
        title: "Ciclo y descarga",
        text: "Configurás la fecha de inicio, cuántas semanas entrenás antes de la descarga, cuánto dura y a qué % de tu récord entrenás en esa semana.",
        demo: { kind: "perfil", view: "ciclo" },
      },
      {
        icon: <Clock size={20} />,
        title: "Descanso entre series",
        text: "Elegís si avisamos con sonido, vibración o ambos, y cuánto dura el descanso para ejercicios pesados y para el resto.",
        demo: { kind: "perfil", view: "descanso", caption: "Probá cambiar el tipo de aviso" },
      },
      {
        icon: <Bell size={20} />,
        title: "Recordatorio de entrenamiento",
        text: "Activalo y elegí la hora: te avisa \"💪 Hoy toca Push\" solo los días que te toca entrenar según tu cronograma. Los días de descanso no te molesta.",
      },
      {
        icon: <Sun size={20} />,
        title: "Apariencia y unidad de peso",
        text: "En Apariencia elegís kg o libras (lbs) — la app convierte todo automáticamente. También ajustás el tamaño de letra.",
        demo: { kind: "perfil", view: "apariencia", caption: "Tocá la sección para desplegarla" },
      },
      {
        icon: <Download size={20} />,
        title: "Exportar entrenamiento",
        text: "Descargá el resumen de hoy, la semana o el mes en PDF, Word o Excel — para mandárselo a tu entrenador.",
      },
      {
        icon: <ShieldCheck size={20} />,
        title: "Tus datos están respaldados",
        text: "Además del dispositivo, tus registros tienen una segunda copia local. Si algo borra los datos del navegador, la app intenta recuperarlos sola al abrir de nuevo.",
      },
      {
        icon: <Info size={20} />,
        title: "Política de privacidad",
        text: "Al fondo del perfil encontrás el link a la política de privacidad, que se abre dentro de la app sin salir.",
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
        text: "Ya conocés todas las funciones de Modus Fit. Podés volver a este tour cuando quieras tocando el ? arriba a la derecha, en cualquier pestaña.",
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

// ── INTRO DE BIENVENIDA (primera vez) ───────────────────────────────────────
// Estilo "intro de app": 5 slides con un ícono grande, una idea por pantalla,
// puntos de progreso y botones grandes. La primera vez que activás una rutina
// se muestra ESTO en vez del tutorial completo de 51 pasos (que abruma como
// primer contacto). El tutorial detallado queda en el "?" y como opción acá.
const WELCOME_SLIDES = [
  {
    icon: <Flame size={38} />,
    color: "#14B8A6",
    title: "¡Bienvenido a Modus Fit!",
    text: "Tu gym tracker inteligente: registrá tus entrenamientos, mirá tu progreso muscular y entrená con un plan a tu medida.",
  },
  {
    icon: <Dumbbell size={38} />,
    color: "#3B82F6",
    title: "Registrá en segundos",
    text: "Anotá reps y kilos de cada serie con dos toques. La app detecta tus récords sola y te avisa cuando los superás.",
  },
  {
    icon: <TrendingUp size={38} />,
    color: "#A855F7",
    title: "Mirá tu progreso",
    text: "Cada músculo sube de rango a medida que mejorás tus marcas. El muñeco te muestra de un vistazo qué está fuerte y qué falta.",
  },
  {
    icon: <Layers size={38} />,
    color: "#F59E0B",
    title: "Rutinas a tu medida",
    text: "Armá la tuya desde cero, usá una preestablecida o dejá que la IA te arme un plan respondiendo unas preguntas.",
  },
  {
    icon: <Sparkles size={38} />,
    color: "#14B8A6",
    title: "Tu entrenador con IA",
    text: "Un coach que ve TUS datos reales: tus marcas, tu volumen, tus días de descanso. Consejos concretos, no genéricos.",
  },
];

// ── OVERLAY DE INICIO DE SESIÓN ─────────────────────────────────────────────
// Un flash breve (1.4s) que confirma que arrancó el entrenamiento. No bloquea
// (pointer-events:none) ni congela el fondo: se va solo. Complementa la
// cascada wake-up de las tarjetas.
function SessionStartOverlay({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1400);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed inset-0 z-[135] flex items-center justify-center pointer-events-none session-start-fade modal-overlay">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
      <div className="relative flex flex-col items-center gap-3">
        <div className="w-24 h-24 rounded-full flex items-center justify-center session-start-pop" style={{ background: "radial-gradient(circle, rgba(20,184,166,0.35), rgba(20,184,166,0.05))", border: "2px solid rgba(20,184,166,0.5)", boxShadow: "0 0 50px -8px rgba(20,184,166,0.8)" }}>
          <Dumbbell size={44} className="text-teal-300" />
        </div>
        <p className="text-2xl font-black text-white session-start-text" style={{ textShadow: "0 2px 20px rgba(20,184,166,0.6)" }}>¡A entrenar!</p>
      </div>
    </div>
  );
}

// ── RESUMEN AL FINALIZAR EL ENTRENAMIENTO ───────────────────────────────────
// El cierre emocional de la sesión: duración, volumen contando hacia arriba,
// series y ejercicios, y los récords del día apareciendo uno a uno. Antes
// finalizar no mostraba nada — el mejor momento de la app pasaba en silencio.
function SessionSummaryModal({ resumen, onClose }) {
  useAndroidBack(onClose);
  // Destellos de celebración: posiciones/tiempos aleatorios pero fijos (una
  // sola vez) para que no se regeneren en cada render. Colores de la app.
  const [confeti] = useState(() => {
    const cols = ["#14B8A6", "#F59E0B", "#3B82F6", "#A855F7", "#F43F5E"];
    return Array.from({ length: 18 }, (_, i) => ({
      id: i,
      left: Math.round(Math.random() * 100),
      delay: Math.round(Math.random() * 400),
      dur: 1400 + Math.round(Math.random() * 900),
      color: cols[i % cols.length],
      size: 5 + Math.round(Math.random() * 4),
    }));
  });
  if (!resumen) return null;
  return (
    <div className="fixed inset-0 z-[140] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 modal-bg-in modal-overlay" onClick={onClose}>
      <div
        className="relative max-w-sm w-full rounded-3xl modal-pop-in shadow-2xl shadow-black/70 overflow-hidden"
        style={{ background: "var(--panel-grad-teal)", border: "1px solid rgba(20,184,166,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Lluvia de destellos: cae detrás del contenido, no molesta al leer */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          {confeti.map((c) => (
            <span key={c.id} className="confetti-piece" style={{ left: `${c.left}%`, width: c.size, height: c.size, backgroundColor: c.color, animationDelay: `${c.delay}ms`, animationDuration: `${c.dur}ms` }} />
          ))}
        </div>
        {/* Hero: check grande con halo */}
        <div className="relative flex flex-col items-center pt-9 pb-5 px-6 text-center">
          <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-52 h-52 rounded-full bg-teal-500/20 blur-3xl pointer-events-none" />
          <div className="relative w-16 h-16 rounded-full flex items-center justify-center mb-4 elastic-in bg-teal-500/18 border border-teal-500/40 text-teal-300" style={{ boxShadow: "0 12px 38px -12px rgba(20,184,166,0.7)" }}>
            <svg className="draw-check" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h2 className="relative text-lg font-black text-white leading-tight">¡Entrenamiento completado!</h2>
          {resumen.minutos != null && (
            <p className="relative text-[11px] text-slate-500 mt-1 tabular-nums">{resumen.minutos >= 60 ? `${Math.floor(resumen.minutos / 60)}h ${resumen.minutos % 60}min` : `${resumen.minutos} min`} de sesión</p>
          )}
        </div>

        {/* Los números del día, contando hacia arriba */}
        <div className="grid grid-cols-3 gap-2 px-5">
          {[
            { v: resumen.volumen, l: "kg de volumen", dec: 0 },
            { v: resumen.series, l: resumen.series === 1 ? "serie" : "series", dec: 0 },
            { v: resumen.ejercicios, l: resumen.ejercicios === 1 ? "ejercicio" : "ejercicios", dec: 0 },
          ].map((s) => (
            <div key={s.l} className="bg-black/25 rounded-2xl py-3 text-center border border-white/[0.05]">
              <CountUpNumber value={s.v} duration={900} decimals={s.dec} className="text-base font-black text-white tabular-nums leading-none" />
              <p className="text-[9px] text-slate-500 mt-1.5 leading-tight px-1">{s.l}</p>
            </div>
          ))}
        </div>

        {/* Los récords del día, apareciendo uno a uno */}
        {resumen.prs.length > 0 && (
          <div className="px-5 mt-4 space-y-1.5">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-amber-400/90">Récords de hoy</p>
            {resumen.prs.slice(0, 5).map((pr, i) => (
              <div key={pr.id} className="flex items-center gap-2.5 rounded-xl px-3 py-2 bg-amber-500/[0.07] border border-amber-500/20 badge-pop" style={{ animationDelay: `${400 + i * 220}ms` }}>
                <span className="text-sm">🔥</span>
                <span className="flex-1 min-w-0 truncate text-[11px] font-bold text-amber-200">{pr.nombre}</span>
                <span className="text-[10px] text-amber-400/80 tabular-nums shrink-0">{pr.marca}</span>
              </div>
            ))}
            {resumen.prs.length > 5 && <p className="text-[9px] text-slate-600 text-center">y {resumen.prs.length - 5} más</p>}
          </div>
        )}

        <div className="px-5 py-5">
          <button onClick={onClose} className="w-full py-3.5 rounded-2xl text-sm font-black !text-white transition active:scale-[0.98]" style={{ background: "linear-gradient(135deg,#14B8A6,#0D9488)", boxShadow: "0 10px 28px -10px rgba(20,184,166,0.7)" }}>
            ¡Seguir así! 💪
          </button>
        </div>
      </div>
    </div>
  );
}

function WelcomeIntro({ onClose, onOpenTutorial }) {
  useAndroidBack(onClose);
  const [i, setI] = useState(0);
  const slide = WELCOME_SLIDES[i];
  const isLast = i === WELCOME_SLIDES.length - 1;
  return (
    <div className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 modal-bg-in modal-overlay">
      <div
        className="max-w-sm w-full rounded-3xl modal-pop-in shadow-2xl shadow-black/70 overflow-hidden flex flex-col"
        style={{ background: "var(--panel-grad-cyan)", border: `1px solid ${slide.color}30`, minHeight: 440 }}
      >
        {/* Hero: el ícono grande sobre un halo del color del slide */}
        <div key={`hero-${i}`} className="relative flex flex-col items-center pt-12 pb-6 px-6 text-center tab-fade-in">
          <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-56 h-56 rounded-full blur-3xl pointer-events-none transition-colors duration-500" style={{ backgroundColor: slide.color + "22" }} />
          <div className="relative w-20 h-20 rounded-3xl flex items-center justify-center mb-5 elastic-in" style={{ backgroundColor: slide.color + "1c", border: `1px solid ${slide.color}40`, color: slide.color, boxShadow: `0 12px 40px -12px ${slide.color}70` }}>
            {slide.icon}
          </div>
          <h2 className="relative text-xl font-black text-white leading-tight mb-2.5">{slide.title}</h2>
          <p className="relative text-sm text-slate-400 leading-relaxed">{slide.text}</p>
        </div>

        <div className="flex-1" />

        {/* Puntos de progreso */}
        <div className="flex items-center justify-center gap-1.5 pb-5">
          {WELCOME_SLIDES.map((s, si) => (
            <button
              key={si}
              onClick={() => setI(si)}
              aria-label={`Ir al paso ${si + 1}`}
              className="rounded-full transition-all duration-300"
              style={{ width: si === i ? 22 : 7, height: 7, backgroundColor: si === i ? slide.color : "var(--surface-2)" }}
            />
          ))}
        </div>

        {/* Botones grandes, estilo intro de app */}
        <div className="px-5 pb-5 space-y-2">
          <button
            onClick={() => (isLast ? onClose() : setI((n) => n + 1))}
            className="w-full py-3.5 rounded-2xl text-sm font-black !text-white transition active:scale-[0.98]"
            style={{ background: `linear-gradient(135deg, ${slide.color}, ${slide.color}b0)`, boxShadow: `0 10px 28px -10px ${slide.color}80` }}
          >
            {isLast ? "¡Empezar a entrenar!" : "Siguiente"}
          </button>
          {isLast ? (
            <button onClick={() => { onClose(); onOpenTutorial?.(); }} className="w-full py-2.5 rounded-2xl text-xs font-bold text-slate-400 hover:text-white transition">
              Ver el tutorial completo
            </button>
          ) : (
            <button onClick={onClose} className="w-full py-2.5 rounded-2xl text-xs font-bold text-slate-600 hover:text-slate-400 transition">
              Saltar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function HelpModal({ startTab, onClose }) {
  useAndroidBack(onClose);
  const startIdx = startTab
    ? Math.max(0, ALL_HELP_STEPS.findIndex((s) => s.chapterKey === startTab))
    : 0;
  const [i, setI] = useState(startIdx);
  const step = ALL_HELP_STEPS[i];
  const isFirst = i === 0;
  const isLast = i === ALL_HELP_STEPS.length - 1;
  const chapter = HELP_CHAPTERS[step.chapterIndex];

  const jumpToChapter = (ci) => {
    const idx = ALL_HELP_STEPS.findIndex((s) => s.chapterIndex === ci);
    if (idx >= 0) setI(idx);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 modal-bg-in modal-overlay" onClick={onClose}>
      <div
        className="max-w-md w-full rounded-3xl modal-pop-in shadow-2xl shadow-black/70 flex flex-col"
        style={{ background: "var(--panel-grad-cyan)", border: "1px solid rgba(20,184,166,0.2)", height: "min(92vh, 700px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-5 pt-5 pb-3 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center transition-colors duration-300" style={{ backgroundColor: chapter.color + "18", color: chapter.color }}>
                {chapter.icon}
              </div>
              <span className="text-xs font-black uppercase tracking-widest transition-colors duration-300" style={{ color: chapter.color }}>{chapter.label}</span>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800/80 transition"><X size={17} /></button>
          </div>
          {/* Chips de capítulo, estilo "niveles de juego": el actual lleva el
              color de SU capítulo, los ya recorridos muestran un check. */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
            {HELP_CHAPTERS.map((c, ci) => {
              const completado = ci < step.chapterIndex;
              const actual = ci === step.chapterIndex;
              return (
                <button
                  key={c.key}
                  onClick={() => jumpToChapter(ci)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all shrink-0"
                  style={actual
                    ? { backgroundColor: c.color + "20", color: c.color, border: `1px solid ${c.color}40` }
                    : completado
                      ? { color: "#64748b", border: "1px solid transparent" }
                      : { color: "#475569", border: "1px solid transparent" }}
                >
                  {completado ? <Check size={10} className="text-teal-500" /> : c.icon}
                  {c.label}
                </button>
              );
            })}
          </div>
          {/* Barra de progreso estilo juego: cada capítulo se llena con SU
              color, y el segmento del paso actual queda un poco más brillante. */}
          <div className="flex gap-1.5 mt-3">
            {HELP_CHAPTERS.map((c, ci) => (
              <div key={c.key} className="flex-1 flex gap-0.5">
                {c.steps.map((_, si) => {
                  const globalIdx = ALL_HELP_STEPS.findIndex((s) => s.chapterIndex === ci && s.stepInChapter === si);
                  const pasado = globalIdx < i;
                  const actual = globalIdx === i;
                  return (
                    <div key={si} className="h-1 flex-1 rounded-full transition-all duration-300"
                      style={{
                        backgroundColor: actual ? c.color : pasado ? c.color + "90" : "var(--surface-2)",
                        boxShadow: actual ? `0 0 8px -1px ${c.color}` : "none",
                      }} />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Área media scrolleable: demo + texto scrollean JUNTOS.
            flex-1 + minHeight: 0 es lo que permite que overflow-y-auto
            funcione dentro del flex-col limitado por max-h del modal. */}
        <div className="flex-1 overflow-y-auto overscroll-contain" style={{ minHeight: 0, WebkitOverflowScrolling: "touch" }}>
        {step.demo && (
          <div key={`demo-${step.chapterKey}`} className="mx-5 mt-4 tab-fade-in">
            {step.demo.caption && (
              <p className="text-[10px] font-bold mb-2 flex items-center gap-1.5 text-teal-400">
                <Sparkles size={10} /> {step.demo.caption}
              </p>
            )}
            <div className="rounded-2xl border border-slate-800/60 overflow-hidden" style={{ backgroundColor: "var(--app-bg)" }}>
              <DemoPreview kind={step.demo.kind} view={step.demo.view} />
            </div>
          </div>
        )}

        {/* Contenido del paso */}
        <div key={i} className={`px-5 py-4 tab-fade-in ${step.isChapterIntro ? "flex flex-col items-center text-center gap-3" : "flex items-start gap-4"}`}>
          {step.isChapterIntro ? (
            <>
              {/* Portada de capítulo, estilo pantalla de nivel: ícono grande
                  sobre un halo del color del capítulo. */}
              <div className="relative mt-2">
                <div className="absolute inset-0 rounded-3xl blur-2xl scale-150 pointer-events-none" style={{ backgroundColor: chapter.color + "20" }} />
                <div className="relative w-16 h-16 rounded-3xl flex items-center justify-center elastic-in" style={{ backgroundColor: chapter.color + "18", border: `1px solid ${chapter.color}35`, color: chapter.color, boxShadow: `0 10px 30px -10px ${chapter.color}60` }}>
                  {step.icon}
                </div>
              </div>
              <h3 className="text-lg font-black text-white leading-tight">{step.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{step.text}</p>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border transition-colors duration-300" style={{ backgroundColor: chapter.color + "12", borderColor: chapter.color + "28", color: chapter.color }}>
                {step.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-black text-white mb-1.5">{step.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{step.text}</p>
              </div>
            </>
          )}
        </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={() => setI((n) => Math.max(0, n - 1))} disabled={isFirst} className="px-4 py-2 rounded-xl text-xs font-bold transition border border-slate-800 text-slate-500 disabled:opacity-20 hover:text-white hover:border-slate-600">
            Atrás
          </button>
          <span className="text-[10px] text-slate-600 font-medium tabular-nums">{i + 1} / {ALL_HELP_STEPS.length}</span>
          {isLast ? (
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl text-xs font-black !text-white transition active:scale-95" style={{ background: `linear-gradient(135deg, ${chapter.color}, ${chapter.color}b0)`, boxShadow: `0 8px 22px -8px ${chapter.color}80` }}>
              ¡Listo! 🎉
            </button>
          ) : (
            <button onClick={() => setI((n) => Math.min(ALL_HELP_STEPS.length - 1, n + 1))} className="px-6 py-2.5 rounded-xl text-xs font-black !text-white transition active:scale-95" style={{ background: `linear-gradient(135deg, ${chapter.color}, ${chapter.color}b0)`, boxShadow: `0 8px 22px -8px ${chapter.color}80` }}>
              Siguiente →
            </button>
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
// Modal que aparece cuando guardás una marca que te hace subir de rango.
// Solo aparece cuando el tier cambia (ej: Oro II → Esmeralda I), no en
// cada nuevo récord dentro del mismo tier.
function RankUpModal({ from, to, muscleName, onClose }) {
  useAndroidBack(onClose);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-5 modal-overlay" style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}>
      <div className="relative w-full max-w-sm rounded-3xl overflow-hidden elastic-in" style={{ background: "var(--rankup-grad)", border: `2px solid ${to.color}40` }}>
        {/* Glow de fondo */}
        <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 30%, ${to.color}60, transparent 65%)` }} />
        <div className="relative p-7 text-center space-y-5">
          {/* Chips "SUBISTE DE RANGO" */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: to.color + "20", color: to.color, border: `1px solid ${to.color}40` }}>
            ✦ ¡Nuevo rango! ✦
          </div>
          {/* Flecha de progresión */}
          <div className="flex items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-1.5 opacity-50">
              <RankBadgeIcon tier={from.tier} sub={from.sub} color={from.color} size={60} />
              <span className="text-[10px] font-bold" style={{ color: from.color }}>{from.tier} {from.sub}</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="text-xl">→</div>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="relative rank-up-pulse">
                <div className="absolute inset-0 rounded-full blur-xl opacity-60" style={{ backgroundColor: to.color }} />
                <RankBadgeIcon tier={to.tier} sub={to.sub} color={to.color} size={90} />
              </div>
              <span className="text-sm font-black" style={{ color: to.color }}>{to.tier} {to.sub}</span>
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-white">{to.tier}</p>
            {muscleName && <p className="text-sm text-slate-400 mt-1">en {muscleName}</p>}
          </div>
          <button onClick={onClose} className="w-full py-3.5 rounded-2xl font-black !text-white text-sm active:scale-95 transition-all" style={{ background: `linear-gradient(135deg, ${to.color}, ${to.color}bb)`, boxShadow: `0 8px 24px -4px ${to.color}50` }}>
            ¡Vamos! 💪
          </button>
        </div>
      </div>
    </div>
  );
}

function SetRow({ exerciseId, exerciseName, exerciseMuscle, setIndex, setDef, accent, logs, setLogs, drafts = {}, setDrafts, deloadKgFactor = 1, deloadMode = false, autoShowPrShare = true, onDisableAutoShowPrShare, hasActiveSession = true, cardio = false, dumbbellDouble = null, fieldSettings = DEFAULT_SETTINGS, onUpdateSettings = null, sex = null, age = null }) {
  const globalUnit = useWeightUnit();
  // Unidad local: arranca desde la preferencia global, pero el usuario puede
  // cambiarla ejercicio por ejercicio con el toggle kg/lbs del input.
  const [unit, setUnit] = useState(globalUnit);
  useEffect(() => { setUnit(globalUnit); }, [globalUnit]);
  const key = `${exerciseId}_${setIndex}`, prKey = `${key}_pr_override`, today = todayStr();
  const history = logs[key] || [], override = logs[prKey];
  // Cardio no tiene una "carga" comparable (no hay kg×reps) — el récord
  // ahí es, simplemente, la sesión más larga en minutos. La distancia es
  // un dato extra que se guarda si lo cargás, pero no decide el récord.
  const computedPR = useMemo(() => {
    if (cardio) { let best = null; history.forEach((h) => { if (!best || (h.minutes || 0) > (best.minutes || 0)) best = { minutes: h.minutes, km: h.km }; }); return best; }
    // La marca "a superar" se elige por 1RM ESTIMADO, no por volumen. Con
    // volumen, 95×8 (760) le ganaba a 110×5 (550) y se mostraba la serie
    // más liviana como tu mejor marca — que es justo lo que se veía mal en
    // el muñeco y en el "A superar". Por 1RM, 110×5 (128) supera a 95×8 (120).
    let best = setDef.pr ? { ...setDef.pr } : null; history.forEach((h) => { if (!best || estimate1RM(h.kg, h.reps) > estimate1RM(best.kg, best.reps)) best = { kg: h.kg, reps: h.reps }; }); return best;
  }, [history, setDef.pr, cardio]);
  const currentPR = useMemo(() => {
    if (!override && !computedPR) return null;
    // Un récord EDITADO A MANO (manual: true) manda SIEMPRE mientras exista:
    // es una corrección explícita del usuario y se respeta tal cual, sea
    // mayor o menor que el historial. Se libera solo cuando lo superás
    // entrenando (ver handleSave) o con el botón "Quitar".
    if (override?.manual) return override;
    // Overrides viejos sin flag (guardados automáticamente por versiones
    // anteriores): gana el mejor entre ese dato y el historial real, así un
    // dato viejo nunca esconde una marca real superior.
    if (!override) return computedPR;
    if (!computedPR) return override;
    return estimate1RM(override.kg, override.reps) >= estimate1RM(computedPR.kg, computedPR.reps) ? override : computedPR;
  }, [override, computedPR]);
  const suggestedKg = !cardio && currentPR && deloadMode ? Math.round(currentPR.kg * deloadKgFactor * 2) / 2 : null;
  const draft = drafts[key] || {};
  const reps = draft.reps ?? ""; const kg = draft.kg ?? ""; const rpe = draft.rpe ?? null;
  const minutes = draft.minutes ?? ""; const km = draft.km ?? "";
  const updateDraft = (patch) => { if (setDrafts) setDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...patch } })); };
  const [feedback, setFeedback] = useState(null);
  const [showRpeLocal, setShowRpeLocal] = useState(false);
  const showRpe = showRpeLocal || rpe != null;
  // ── Nota de ESTA serie ────────────────────────────────────────────────────
  // Antes había una sola nota por ejercicio; ahora es una por serie. La clave
  // sigue el patrón de los logs (`ejercicio_indice`). Para no perder las notas
  // que ya tenías (guardadas por ejercicio), la primera serie las hereda.
  const noteKey = `${exerciseId}_${setIndex}`;
  const setNote = fieldSettings?.exerciseNotes?.[noteKey] ?? (setIndex === 0 ? (fieldSettings?.exerciseNotes?.[exerciseId] || "") : "");
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(setNote);
  useEffect(() => { setNoteDraft(setNote); }, [setNote]);
  const guardarNota = () => {
    if (!onUpdateSettings) return;
    const limpio = noteDraft.trim();
    const notas = { ...(fieldSettings?.exerciseNotes || {}) };
    if (limpio) notas[noteKey] = limpio;
    else delete notas[noteKey];
    // Si estábamos editando la nota heredada del ejercicio, la retiramos de la
    // clave vieja para que no reaparezca.
    if (setIndex === 0 && notas[exerciseId]) delete notas[exerciseId];
    onUpdateSettings({ exerciseNotes: notas });
    setEditingNote(false);
    haptic(12);
  };
  const [editingPR, setEditingPR] = useState(false);
  const [rowFocus, setRowFocus] = useState(false); // enciende el borde al enfocar
  const cardioFinishedRef = useRef(false); // el countdown llegó a 0 solo (no pausa manual)
  const [editReps, setEditReps] = useState(""); const [editKg, setEditKg] = useState(""); const [saved, setSaved] = useState(false);
  const [prBurst, setPrBurst] = useState(0);
  const [showPRShare, setShowPRShare] = useState(false);
  const [rankUpInfo, setRankUpInfo] = useState(null); // { from, to, muscleName }
  const saveBtnRef = useRef(null);
  // Cronómetro regresivo para cardio — cuenta desde los minutos ingresados
  // hasta 0 y marca la serie como hecha automáticamente al llegar a 0.
  // Timer de cardio — dos modos:
  // "stopwatch": cuenta para ARRIBA (arrancás cuando empezás, parás cuando terminás)
  // "countdown": cuenta para ABAJO desde los minutos ingresados (objetivo)
  const [cardioMode, setCardioMode] = useState("stopwatch"); // "stopwatch" | "countdown"
  const [cardioRunning, setCardioRunning] = useState(false);
  const [cardioElapsed, setCardioElapsed] = useState(0); // segundos transcurridos (stopwatch)
  const [cardioLeft, setCardioLeft] = useState(0);       // segundos restantes (countdown)
  const cardioIntervalRef = useRef(null);
  // NOTIFICACIÓN NATIVA DEL CARDIO — misma función que el reloj de descanso:
  // · Cuenta regresiva: cronómetro vivo en la barra (plugin nativo) + aviso
  //   de fin PROGRAMADO con hora exacta (canal de vibración fuerte), que el
  //   sistema dispara aunque la app esté congelada en segundo plano.
  // · Cronómetro ascendente: notificación persistente "Cardio en curso".
  // Al pausar a mano se limpia todo; si el countdown termina solo, el aviso
  // programado NO se cancela (cardioFinishedRef) — así siempre suena.
  useEffect(() => {
    if (!cardio) return;
    const cardioNotifId = 9003;
    if (cardioRunning) {
      cardioFinishedRef.current = false;
      (async () => {
        try {
          if (!Capacitor.isNativePlatform()) return;
          if (cardioMode === "countdown") {
            const targetLeft = Math.max(1, Math.round((parseFloat(minutes) * 60 || 0) - cardioElapsed));
            ACTIVE_REST_TIMERS.__notifOwner = `cardio_${exerciseId}`;
            await RestTimerNotification.start({ seconds: targetLeft, exerciseName: exerciseName || "Cardio" }).catch(() => {});
            await LocalNotifications.createChannel({ id: "modusfit-rest-done-v1", name: "Fin del descanso", description: "Aviso al terminar", importance: 5, vibration: true }).catch(() => {});
            await LocalNotifications.schedule({
              notifications: [{
                id: cardioNotifId, smallIcon: "ic_stat_modusfit",
                title: "🏁 ¡Cardio completado!", body: `${exerciseName || "Sesión"} — llegaste al objetivo 💪`,
                channelId: "modusfit-rest-done-v1", sound: "default",
                schedule: { at: new Date(Date.now() + targetLeft * 1000), allowWhileIdle: true },
              }],
            });
          } else {
            await LocalNotifications.schedule({
              notifications: [{
                id: cardioNotifId, smallIcon: "ic_stat_modusfit",
                title: "⏱️ Cardio en curso", body: `${exerciseName || "Sesión"} · tocá para volver`,
                channelId: "ponos-rest-timer", ongoing: true, autoCancel: false,
                schedule: { at: new Date(Date.now() + 300) },
              }],
            });
          }
        } catch (e) { console.warn("[notif] cardio:", e); }
      })();
    } else {
      try {
        if (Capacitor.isNativePlatform()) {
          // Pausa manual: limpiar todo. Fin natural: dejar vivo el aviso
          // programado (suena a su hora exacta) y solo bajar el cronómetro.
          if (!cardioFinishedRef.current) LocalNotifications.cancel({ notifications: [{ id: cardioNotifId }] }).catch(() => {});
          if (ACTIVE_REST_TIMERS.__notifOwner === `cardio_${exerciseId}`) {
            RestTimerNotification.stop().catch(() => {});
            delete ACTIVE_REST_TIMERS.__notifOwner;
          }
        }
      } catch { /* ignorado a propósito */ }
      cardioFinishedRef.current = false;
    }
    // Cleanup al desmontar: si te vas de la pantalla con el CRONÓMETRO
    // ascendente corriendo, su notificación "Cardio en curso" (ongoing) se
    // quedaba pegada en la barra para siempre. La cuenta regresiva NO se
    // cancela acá: su aviso de fin debe sonar a la hora exacta aunque salgas.
    return () => {
      if (!Capacitor.isNativePlatform()) return;
      if (cardioMode === "stopwatch" && cardioRunning) {
        LocalNotifications.cancel({ notifications: [{ id: 9003 }] }).catch(() => {});
      }
    };
    // eslint-disable-next-line
  }, [cardioRunning, cardioMode]);

  useEffect(() => {
    if (!cardioRunning) { clearInterval(cardioIntervalRef.current); return; }
    const startedAt = Date.now() - cardioElapsed * 1000;
    cardioIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      if (cardioMode === "stopwatch") {
        setCardioElapsed(elapsed);
      } else {
        const targetSecs = parseFloat(minutes) * 60 || 0;
        const left = Math.max(0, targetSecs - elapsed);
        setCardioLeft(left);
        if (left === 0) {
          clearInterval(cardioIntervalRef.current);
          cardioFinishedRef.current = true; // fin NATURAL: no cancelar el aviso programado
          setCardioRunning(false);
          haptic([100, 50, 100, 50, 200]);
          // Guardar automáticamente
          setCardioElapsed(elapsed);
          setTimeout(() => saveBtnRef.current?.click(), 300);
        }
      }
    }, 500);
    return () => clearInterval(cardioIntervalRef.current);
  }, [cardioRunning, cardioMode]);
  const handleSave = () => {
    if (cardio) {
      // Si el cronómetro estuvo corriendo, usar el tiempo transcurrido
      const autoMinutes = cardioElapsed > 0 ? Math.round(cardioElapsed / 60 * 10) / 10 : null;
      const m = autoMinutes || parseFloat(minutes), d = km ? parseFloat(km) : null;
      if (!m || isNaN(m)) { setFeedback({ type: "error", msg: "Iniciá el cronómetro o ingresá los minutos." }); return; }
      const isFirstEver = !currentPR;
      const prevMin = currentPR?.minutes || 0;
      // Guardamos el NOMBRE junto con la serie: el historial es una foto de
      // lo que hiciste ese día y no debe depender de que el ejercicio siga
      // en tu rutina. Si después lo borrás o lo cambiás por otra variante,
      // el registro tiene que seguir contando lo que pasó.
      const entry = { date: today, minutes: m };
      // Solo agregamos los campos si tienen valor: Firestore rechaza undefined
      // y haría fallar la sincronización del perfil entero.
      if (exerciseName) entry.exName = exerciseName;
      if (exerciseMuscle) entry.exMuscle = exerciseMuscle;
      if (d && !isNaN(d)) entry.km = d; if (rpe != null) entry.rpe = rpe;
      if (!hasActiveSession) entry.noSession = true;
      const newHistory = [...history.filter((h) => h.date !== today), entry];
      let newLogs = { ...logs, [key]: newHistory };
      const isPR = !isFirstEver && m > prevMin;
      if (isFirstEver || isPR) newLogs = { ...newLogs, [prKey]: { minutes: m, km: d || null, date: today } };
      setLogs(newLogs); setSaved(true); setTimeout(() => setSaved(false), 1200);
      if (setDrafts) setDrafts((prev) => { const n = { ...prev }; delete n[key]; return n; });
      // Detectar si el nuevo récord sube de rango (tier change)
      try {
        const exLib = EXERCISE_LIBRARY_BY_ID[exerciseId];
        if (exLib?.group && (isFirstEver || isPR)) {
          const prevRankData = getBest1RMForMuscleGroup(exLib.group, logs, dumbbellDouble);
          const newRankData = getBest1RMForMuscleGroup(exLib.group, newLogs, dumbbellDouble);
          const rankMode = fieldSettings.muscleRankMode === "relative" ? "relative" : "general";
          const prevRank = getMuscleRank(exLib.group, prevRankData.best1RM, rankMode, fieldSettings.bodyWeightKg || 0, sex, age);
          const newRank = getMuscleRank(exLib.group, newRankData.best1RM, rankMode, fieldSettings.bodyWeightKg || 0, sex, age);
          if (newRank.levelIdx > prevRank.levelIdx && prevRank.tier !== newRank.tier) {
            setRankUpInfo({ from: prevRank, to: newRank, muscleName: MUSCLE_GROUP_BY_KEY[exLib.group]?.label });
            RECENT_RANK_UPS.add(exLib.group); // para que lata en Progreso
          }
        }
      } catch { /* ignorado a propósito */ }
      const noSession = !hasActiveSession;
      if (isFirstEver) { haptic(18); setFeedback({ type: "first", msg: "Primer registro 📝", noSession }); }
      else if (isPR) { haptic([35, 25, 45]); setPrBurst((n) => n + 1); setFeedback({ type: "pr", msg: "¡Sesión más larga hasta ahora! 🔥", noSession }); }
      else if (m === prevMin) { haptic(18); setFeedback({ type: "tie", msg: "Igualaste tu marca 💪", noSession }); }
      else { haptic(18); setFeedback({ type: "down", msg: `-${(((prevMin - m) / prevMin) * 100).toFixed(0)}% vs récord`, noSession }); }
      return;
    }
    const r = parseFloat(reps), kDisplay = parseFloat(kg);
    if (!r || !kDisplay || isNaN(r) || isNaN(kDisplay)) { setFeedback({ type: "error", msg: "Completá reps y kg." }); return; }
    const k = displayToKg(kDisplay, unit); // convierte lbs→kg si corresponde
    // Si no había ninguna marca previa, esto es la PRIMERA vez que se
    // registra esta serie — no es un "récord" todavía (no hay nada que
    // estés superando), así que no dispara fuego, ni el cartel de "¡Nueva
    // marca!", ni el popup automático para compartir. Igual queda
    // guardada como el punto de partida para comparar la próxima vez.
    const isFirstEver = !currentPR;
    // El récord se evalúa por 1RM ESTIMADO (consistente con la marca "a
    // superar" que se muestra). Antes usaba volumen: guardar 95×8 tras un
    // 110×5 marcaba "récord" (760>550) aunque tu 1RM real no mejorara, y
    // encima cambiaba la marca mostrada a la serie más liviana.
    const prev1RM = currentPR ? estimate1RM(currentPR.kg, currentPR.reps) : 0, new1RM = estimate1RM(k, r);
    // noSession: registraste una marca SIN haber iniciado la sesión (por
    // ejemplo para cargar un récord viejo). El récord se guarda igual, pero
    // ese día NO cuenta como entrenado en el historial ni en la racha.
    const entry = { date: today, reps: r, kg: k };
    if (exerciseName) entry.exName = exerciseName;
    if (exerciseMuscle) entry.exMuscle = exerciseMuscle;
    if (rpe != null) entry.rpe = rpe;
    if (!hasActiveSession) entry.noSession = true;
    const newHistory = [...history.filter((h) => h.date !== today), entry];
    let newLogs = { ...logs, [key]: newHistory };
    const isPR = !isFirstEver && new1RM > prev1RM;
    // NO guardamos un override automático al hacer récord. El récord se
    // calcula SIEMPRE del historial real (que ya tiene todas tus series). El
    // override (`prKey`) queda reservado para cuando el usuario corrige la
    // marca a mano. Guardarlo automáticamente creaba un dato duplicado que se
    // desincronizaba del historial: si una versión vieja guardó 8×95 como
    // override y después hiciste 9×95, el override viejo quedaba "pegado" y
    // pisaba tu marca real para siempre. Además, si el historial nuevo YA
    // alcanzó o superó un override viejo, lo borramos acá para limpiar el
    // fantasma de una vez.
    if (override && (
      override.manual
        ? new1RM > estimate1RM(override.kg, override.reps) // manual: solo lo libera una marca real que lo SUPERE
        : newHistory.some((h) => estimate1RM(h.kg, h.reps) >= estimate1RM(override.kg, override.reps)) // legacy: el historial lo cubre
    )) {
      const cleaned = { ...newLogs }; delete cleaned[prKey]; newLogs = cleaned;
    }
    setLogs(newLogs); setSaved(true); setTimeout(() => setSaved(false), 1200);
    // Limpiar el draft al guardar → la serie queda lockeada (se muestra el
    // bloque "guardado hoy" con botón Editar), en vez de quedar en modo input.
    if (setDrafts) setDrafts((prev) => { const n = { ...prev }; delete n[key]; return n; });
    // Detectar cambio de rango
    try {
      const exLib = EXERCISE_LIBRARY_BY_ID[exerciseId];
      if (exLib?.group && (isFirstEver || isPR)) {
        const prevRankData = getBest1RMForMuscleGroup(exLib.group, logs, dumbbellDouble);
        const newRankData = getBest1RMForMuscleGroup(exLib.group, newLogs, dumbbellDouble);
        const rankMode = fieldSettings.muscleRankMode === "relative" ? "relative" : "general";
        const prevRank = getMuscleRank(exLib.group, prevRankData.best1RM, rankMode, fieldSettings.bodyWeightKg || 0, sex, age);
        const newRank = getMuscleRank(exLib.group, newRankData.best1RM, rankMode, fieldSettings.bodyWeightKg || 0, sex, age);
        if (newRank.levelIdx > prevRank.levelIdx && prevRank.tier !== newRank.tier) {
          setRankUpInfo({ from: prevRank, to: newRank, muscleName: MUSCLE_GROUP_BY_KEY[exLib.group]?.label });
          RECENT_RANK_UPS.add(exLib.group); // para que lata en Progreso
        }
      }
    } catch { /* ignorado a propósito */ }
    const noSession = !hasActiveSession;
    // suggestUp: si superaste el techo del rango de reps objetivo, sugerimos
    // subir el peso la próxima. Antes esta variable se USABA sin estar
    // definida → ReferenceError que impedía que apareciera CUALQUIER mensaje
    // al guardar (incluido "¡Nueva marca!"). Ahora se calcula acá.
    const repTop = repRangeTop(setDef.repRange);
    const suggestUp = !isNaN(repTop) && r > repTop;
    if (isFirstEver) { haptic(18); setFeedback({ type: "first", msg: "Primera marca registrada 📝", suggestUp, noSession }); }
    else if (isPR) { haptic([35, 25, 45]); setPrBurst((n) => n + 1); setFeedback({ type: "pr", msg: "¡Nueva marca! 🔥", suggestUp, noSession }); if (autoShowPrShare) setShowPRShare(true); }
    else { haptic(18); if (new1RM === prev1RM) setFeedback({ type: "tie", msg: "Igualaste tu marca 💪", suggestUp: false, noSession }); else setFeedback({ type: "down", msg: `-${(((prev1RM - new1RM) / prev1RM) * 100).toFixed(0)}% vs récord`, suggestUp: false, noSession }); }
  };
  const savePR = () => { const r = parseFloat(editReps), k = parseFloat(editKg); if (!r || !k || isNaN(r) || isNaN(k)) return; setLogs({ ...logs, [prKey]: { kg: k, reps: r, date: today, manual: true } }); setEditingPR(false); };
  return (
    <div className="relative rounded-xl px-3.5 py-3.5 mb-2.5 last:mb-0" style={{ backgroundColor: accent + "0a", border: `1px solid ${accent}25` }}>
      <PRBurst anchorRef={saveBtnRef} trigger={prBurst} />
      <div className="absolute left-0 top-2 bottom-2 w-1 rounded-full" style={{ backgroundColor: accent }} />
      <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 shrink-0">{cardio ? "SESIÓN" : `S${setIndex + 1}`}</span>
          {!cardio && <span className="text-[10px] bg-slate-800/80 text-slate-500 rounded-lg px-2 py-0.5 shrink-0">{setDef.repRange} reps</span>}
          {!cardio && isHeavyRepRange(setDef.repRange) && <span className="text-[10px] bg-amber-500/15 text-amber-400 rounded-lg px-2 py-0.5 font-bold shrink-0">FUERZA</span>}
        </div>
        {feedback && (
          <span className={`flex items-center gap-1.5 text-xs font-semibold min-w-0 ${feedback.type === "pr" ? "text-emerald-400 pr-pop" : feedback.type === "down" ? "text-rose-400" : feedback.type === "first" ? "text-teal-400" : "text-amber-400"}`}>
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
          <div className="relative overflow-hidden flex items-center gap-2.5 pl-3.5 pr-2 py-2.5 rounded-xl flex-1" style={{ background: `linear-gradient(120deg, ${accent}20, ${accent}0c)`, border: `1px solid ${accent}45` }}>
            <div className="absolute -top-5 -left-5 w-16 h-16 rounded-full blur-2xl pointer-events-none opacity-30" style={{ backgroundColor: accent }} />
            <Trophy size={15} style={{ color: accent }} className="shrink-0 soft-pulse relative" />
            <p className="flex-1 min-w-0 truncate relative leading-none">
              <span className="block text-[8.5px] font-black uppercase tracking-[0.16em] mb-1" style={{ color: accent + "aa" }}>Récord{override?.manual ? " · editado" : ""}</span>
              <span className="text-xl font-black tabular-nums" style={{ color: accent, textShadow: `0 0 16px ${accent}50` }}>
                {cardio ? <>{currentPR.minutes} min{currentPR.km ? ` · ${currentPR.km}km` : ""}</> : <>{currentPR.reps}<span className="opacity-50 text-sm mx-0.5">×</span>{kgToDisplay(currentPR.kg, unit)}<span className="opacity-60 text-xs ml-0.5">{weightLabel(unit)}</span></>}
              </span>
            </p>
            {!cardio && (
              <button onClick={() => { setEditReps(currentPR?.reps ?? ""); setEditKg(currentPR?.kg ?? ""); setEditingPR((e) => !e); }} aria-label="Corregir récord" className="relative flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition active:scale-90" style={{ backgroundColor: accent + "22", color: accent }}>
                <Edit3 size={13} />
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

        {/* Modo bloqueado: si ya guardaste una entrada hoy Y la sesión está
          activa, los inputs se reemplazan por la vista de solo lectura para
          evitar guardar dos veces sin querer. Sin sesión iniciada (o después
          de finalizar) los inputs quedan desbloqueados siempre. */}
      {(() => {
        const key = `${exerciseId}_${setIndex}`;
        const history = logs[key] || [];
        const todayEntry = history.find((h) => h.date === today);
        if (cardio) {
          const todayCardio = (logs[`${exerciseId}_${setIndex}`] || []).find((h) => h.date === today);
          if (todayCardio && hasActiveSession && !draft.editing) {
            return (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: accent + "15", border: `1px solid ${accent}30` }}>
                <Check size={14} style={{ color: accent }} className="shrink-0" />
                <span className="text-sm font-black" style={{ color: accent }}>{todayCardio.minutes} min{todayCardio.km ? ` · ${todayCardio.km} km` : ""}</span>
                <span className="text-[10px] text-slate-500 ml-1">guardado hoy</span>
                <button onClick={() => updateDraft({ minutes: String(todayCardio.minutes), km: String(todayCardio.km || ""), editing: true })} className="ml-auto text-[10px] font-bold px-2 py-1 rounded-lg transition" style={{ backgroundColor: accent + "20", color: accent }}>Editar</button>
              </div>
            );
          }
          return (
            <div className="space-y-2.5">
              {/* Selector de modo */}
              <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">
                <button onClick={() => { setCardioMode("stopwatch"); setCardioRunning(false); setCardioElapsed(0); }} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold transition-all ${cardioMode === "stopwatch" ? "text-white" : "text-slate-500"}`} style={cardioMode === "stopwatch" ? { backgroundColor: accent } : {}}>
                  <Clock size={11} /> Cronómetro
                </button>
                <button onClick={() => { setCardioMode("countdown"); setCardioRunning(false); setCardioElapsed(0); }} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold transition-all ${cardioMode === "countdown" ? "text-white" : "text-slate-500"}`} style={cardioMode === "countdown" ? { backgroundColor: accent } : {}}>
                  <Timer size={11} /> Cuenta regresiva
                </button>
              </div>

              {cardioMode === "stopwatch" ? (
                /* MODO CRONÓMETRO — arrancás, entrenás, parás, se guarda el tiempo */
                <div className="flex items-center gap-3">
                  <div className="flex-1 flex flex-col items-center justify-center rounded-xl py-2.5 border" style={{ backgroundColor: accent + "10", borderColor: accent + "30" }}>
                    <span className="text-xl font-black tabular-nums" style={{ color: cardioRunning || cardioElapsed > 0 ? accent : "#475569" }}>
                      {Math.floor(cardioElapsed / 60).toString().padStart(2, "0")}:{(cardioElapsed % 60).toString().padStart(2, "0")}
                    </span>
                    <span className="text-[9px] text-slate-600 mt-0.5">{cardioRunning ? "corriendo…" : cardioElapsed > 0 ? "pausado" : "listo"}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <button onClick={() => setCardioRunning((r) => !r)} className="w-10 h-10 rounded-xl flex items-center justify-center text-white transition active:scale-90" style={{ backgroundColor: accent }}>
                      {cardioRunning ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <button onClick={() => { setCardioRunning(false); setCardioElapsed(0); }} className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 bg-slate-800 transition active:scale-90">
                      <RotateCcw size={13} />
                    </button>
                  </div>
                </div>
              ) : (
                /* MODO CUENTA REGRESIVA — ingresás el objetivo, cuenta hasta 0 y guarda */
                <div className="space-y-2">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider mb-1.5 block">Minutos objetivo</label>
                      <input type="number" inputMode="decimal" placeholder="30" value={minutes} onChange={(e) => { updateDraft({ minutes: e.target.value }); setCardioElapsed(0); setCardioRunning(false); }} className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-3.5 text-xl font-black text-center text-white focus:outline-none focus:border-teal-500/50 transition" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <button onClick={() => {
                        if (!minutes || isNaN(parseFloat(minutes))) return;
                        if (cardioRunning) { setCardioRunning(false); }
                        else { setCardioElapsed(0); setCardioLeft(parseFloat(minutes) * 60); setCardioRunning(true); }
                      }} className="w-10 h-10 rounded-xl flex items-center justify-center text-white transition active:scale-90" style={{ backgroundColor: accent }}>
                        {cardioRunning ? <Pause size={16} /> : <Play size={16} />}
                      </button>
                      <button onClick={() => { setCardioRunning(false); setCardioElapsed(0); setCardioLeft(0); }} className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 bg-slate-800 transition active:scale-90">
                        <RotateCcw size={13} />
                      </button>
                    </div>
                  </div>
                  {(cardioRunning || cardioElapsed > 0) && (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: accent + "12", border: `1px solid ${accent}30` }}>
                      <Timer size={14} style={{ color: accent }} className="shrink-0" />
                      <span className="text-xl font-black tabular-nums" style={{ color: accent }}>
                        {Math.floor(cardioLeft / 60).toString().padStart(2, "0")}:{(cardioLeft % 60).toString().padStart(2, "0")}
                      </span>
                      <span className="text-[9px] text-slate-500 ml-1">{cardioRunning ? "corriendo…" : "pausado"}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Km opcional y botón guardar */}
              <div className="flex items-center gap-2">
                <div className="flex-1"><label className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider mb-1.5 block">Km <span className="text-slate-700 normal-case">(opc.)</span></label><input type="number" inputMode="decimal" placeholder="—" value={km} onChange={(e) => updateDraft({ km: e.target.value })} className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-3 text-lg font-black text-center text-white focus:outline-none focus:border-teal-500/50 transition" /></div>
                <button ref={saveBtnRef} onClick={handleSave} className={`p-3.5 rounded-xl transition-all active:scale-90 font-bold !text-white flex items-center justify-center shrink-0 ${saved ? "bg-emerald-500" : "hover:opacity-90"}`} style={!saved ? { backgroundColor: accent } : {}}>
                  {saved ? <Check size={18} /> : <Save size={18} />}
                </button>
              </div>
            </div>
          );
        }
        // El bloque "guardado hoy" solo se muestra si el draft está vacío —
        // sin el chequeo de !reps && !kg, el botón Editar seteaba el draft
        // pero esta rama seguía ganando y los inputs nunca aparecían.
        if (todayEntry && hasActiveSession && !draft.editing) {
          // Mensaje de coaching: compara lo hecho contra el rango objetivo
          // de la serie y sugiere qué hacer la próxima.
          const coaching = (() => {
            const rr = String(setDef?.repRange || "");
            const m = rr.match(/(\d+)\s*[-–a]\s*(\d+)/);
            const single = rr.match(/^(\d+)$/);
            const lo = m ? parseInt(m[1], 10) : single ? parseInt(single[1], 10) : null;
            const hi = m ? parseInt(m[2], 10) : single ? parseInt(single[1], 10) : null;
            const r = parseFloat(todayEntry.reps);
            if (lo == null || isNaN(r)) return null;
            // Consejo en dos partes: un titular corto que se lee de un vistazo
            // y un detalle con la acción concreta para la próxima vez.
            if (r > hi) return { icon: "📈", title: "Te sobró rango", body: `Pasaste las ${hi} reps del objetivo. La próxima subile el peso.`, color: "#34D399" };
            if (r < lo) return { icon: "📉", title: "Quedaste corto", body: `El objetivo eran ${lo}-${hi} reps. Bajá un poco el peso y buscá el rango.`, color: "#FBBF24" };
            return { icon: "🎯", title: "En el punto justo", body: `Clavaste el rango de ${rr}. Sostenelo o buscá una rep más.`, color: accent };
          })();
          return (
            <div className="relative overflow-hidden rounded-2xl px-3 py-3 bounce-in" style={{ background: `linear-gradient(130deg, ${accent}16, ${accent}06)`, border: `1px solid ${accent}35` }}>
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 number-pop" style={{ backgroundColor: accent }}>
                  <Check size={14} className="text-white draw-check" strokeWidth={3} />
                </span>
                <div className="flex-1 min-w-0 leading-none">
                  <span className="block text-[8.5px] font-black uppercase tracking-[0.16em] text-slate-500 mb-1">Guardado hoy</span>
                  <span className="text-lg font-black tabular-nums number-pop inline-block" style={{ color: accent, animationDelay: "0.12s" }}>{todayEntry.reps}<span className="opacity-50 text-sm mx-0.5">×</span>{kgToDisplay(todayEntry.kg, unit)}<span className="opacity-60 text-xs ml-0.5">{weightLabel(unit)}</span></span>
                  {todayEntry.rpe && <span className="ml-2 text-[9.5px] px-1.5 py-0.5 rounded-md bg-slate-800/80 text-slate-400 align-middle">RPE {todayEntry.rpe}</span>}
                </div>
                <button onClick={() => { updateDraft({ reps: String(todayEntry.reps), kg: String(kgToDisplay(todayEntry.kg, unit)), editing: true }); }} className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg shrink-0 transition active:scale-95" style={{ backgroundColor: accent + "22", color: accent }}>Editar</button>
              </div>
              {coaching && fieldSettings.showCoaching !== false && (
                <div className="mt-2.5 pt-2.5 flex items-start gap-2 border-t" style={{ borderColor: accent + "20" }}>
                  <span className="text-[13px] leading-none mt-0.5 shrink-0">{coaching.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black leading-tight" style={{ color: coaching.color }}>{coaching.title}</p>
                    <p className="text-[10px] text-slate-400 leading-snug mt-0.5">{coaching.body}</p>
                  </div>
                </div>
              )}
            </div>
          );
        }
        return (
          <div className="space-y-1.5">
            {/* Fila de registro estilo "display digital": superficie sólida
                cuyo borde SE ENCIENDE con el color del día al enfocar, y se
                tiñe VERDE en vivo cuando lo que escribiste ya supera tu
                marca — sabés que va a ser récord antes de guardar. */}
            {(() => {
              const rNum = parseFloat(reps), kNum = parseFloat(kg);
              const liveBeats = !cardio && !isNaN(rNum) && !isNaN(kNum) && rNum > 0 && kNum > 0 && currentPR?.kg
                && estimate1RM(displayToKg(kNum, unit), rNum) > estimate1RM(currentPR.kg, currentPR.reps);
              const borderCol = liveBeats ? "#10B981" : rowFocus ? accent : "rgba(30,41,59,0.7)";
              const glow = liveBeats ? "0 0 16px -4px rgba(16,185,129,0.55)" : rowFocus ? `0 0 16px -4px ${accent}70` : "none";
              return (
            <div onFocus={() => setRowFocus(true)} onBlur={() => setRowFocus(false)}
                 className="flex items-stretch rounded-2xl bg-slate-950/70 overflow-hidden transition-all duration-200"
                 style={{ border: `1px solid ${borderCol}`, boxShadow: glow }}>
              <div className="flex-1 flex flex-col items-center justify-center py-2.5">
                <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">Reps</span>
                <input type="number" inputMode="decimal" placeholder="—" value={reps} onChange={(e) => updateDraft({ reps: e.target.value })} className="w-full bg-transparent text-2xl font-black text-center text-white focus:outline-none placeholder:text-slate-800" />
              </div>
              <div className="flex items-center text-slate-700 text-base font-light select-none">×</div>
              <div className="flex-1 flex flex-col items-center justify-center py-2.5 relative">
                <button onClick={() => {
                  // Convertir el valor ya escrito a la nueva unidad, así no
                  // tenés que recalcular a mano lo que pusiste.
                  const cur = parseFloat(kg);
                  const newUnit = unit === "kg" ? "lbs" : "kg";
                  if (!isNaN(cur)) {
                    const inKg = displayToKg(cur, unit);
                    updateDraft({ kg: String(kgToDisplay(inKg, newUnit)) });
                  }
                  setUnit(newUnit);
                }} className="text-[9px] text-slate-600 font-bold uppercase tracking-widest hover:text-slate-400 transition">
                  {weightLabel(unit)} <span className="text-slate-700">⇄</span>
                </button>
                <input type="number" inputMode="decimal" placeholder="—" value={kg} onChange={(e) => updateDraft({ kg: e.target.value })} className="w-full bg-transparent text-2xl font-black text-center text-white focus:outline-none placeholder:text-slate-800" />
              </div>
              <button ref={saveBtnRef} onClick={handleSave} aria-label="Guardar serie" className={`w-14 flex items-center justify-center transition-all active:scale-95 !text-white ${saved ? "" : "hover:opacity-90"}`} style={saved ? { background: "linear-gradient(160deg, #10B981, #059669)" } : { background: `linear-gradient(160deg, ${accent}, ${accent}b0)` }}>
                {saved ? <Check size={19} /> : <Save size={18} />}
              </button>
            </div>
              );
            })()}
            {/* % del 1RM — línea sutil integrada */}
            {currentPR && fieldSettings.show1RMPercent !== false && (() => {
              const pr1RM = estimate1RM(currentPR.kg, currentPR.reps);
              const currentPct = (kg && !isNaN(parseFloat(kg)) && pr1RM > 0)
                ? Math.round((estimate1RM(displayToKg(parseFloat(kg), unit), parseFloat(reps) || 1) / pr1RM) * 100)
                : null;
              return (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-[9px] text-slate-700">% 1RM</span>
                  <input
                    type="number" inputMode="numeric" placeholder="—"
                    className="w-10 bg-transparent border-b border-slate-800/80 text-[10px] font-bold text-center text-slate-500 focus:outline-none focus:border-slate-600 transition"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const pct = parseFloat(e.target.value);
                      if (!isNaN(pct) && pct > 0 && pr1RM > 0) {
                        const targetKg = kgToDisplay(Math.round(pr1RM * pct / 100 * 2) / 2, unit);
                        updateDraft({ kg: String(targetKg) });
                      }
                    }}
                  />
                  {currentPct && <span className="text-[9px] text-slate-700 tabular-nums">~{currentPct}%</span>}
                </div>
              );
            })()}
          </div>
        );
      })()}
      {fieldSettings.showRpe !== false && (!showRpe ? (
        <button onClick={() => setShowRpeLocal(true)} className="w-full flex items-center justify-center gap-1.5 mt-2.5 py-2 rounded-lg bg-slate-900/50 border border-slate-800/70 text-slate-500 hover:text-slate-300 hover:border-slate-600 text-[11px] font-bold transition"><Activity size={11} /> Registrar esfuerzo (RPE)</button>
      ) : (
        <div className="mt-2.5 flex items-center gap-1.5 bounce-in bg-slate-900/60 rounded-lg px-2 py-2">
          <span className="text-[10px] text-slate-600 font-semibold w-7 shrink-0">RPE</span>
          {RPE_SCALE.map((rs) => (
            <button key={rs.value} onClick={() => updateDraft({ rpe: rpe === rs.value ? null : rs.value })} title={rs.desc} className="w-7 h-7 rounded-lg text-[11px] font-bold transition-all active:scale-90 shrink-0" style={rpe === rs.value ? { backgroundColor: rpeColor(rs.value), color: "#0a0a0f" } : { backgroundColor: "var(--surface-2)", color: "var(--surface-2-text)" }}>{rs.value}</button>
          ))}
          {rpe != null && <span className="text-[10px] text-slate-500 ml-1 truncate">{RPE_SCALE.find((r) => r.value === rpe)?.desc}</span>}
          <button onClick={() => { updateDraft({ rpe: null }); setShowRpeLocal(false); }} className="text-slate-600 hover:text-slate-400 ml-auto shrink-0"><X size={12} /></button>
        </div>
      ))}
      {/* Nota de esta serie: mismo patrón que el RPE — discreto cuando no hay
          nada, y se abre al tocarlo. Una nota por serie, no por ejercicio. */}
      {fieldSettings.showPersonalNote !== false && onUpdateSettings && (
        editingNote ? (
          <div className="mt-2.5 bounce-in rounded-lg p-2" style={{ backgroundColor: "var(--panel-sunken)", border: `1px solid ${accent}30` }}>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Agarre más cerrado · pausa abajo…"
              rows={2}
              maxLength={200}
              autoFocus
              className="w-full bg-transparent text-[12px] text-slate-200 placeholder:text-slate-700 focus:outline-none resize-none leading-snug"
            />
            <div className="flex items-center gap-2 mt-1">
              <button onClick={guardarNota} className="text-[11px] font-bold px-2.5 py-1 rounded-lg transition active:scale-95" style={{ backgroundColor: accent, color: "#fff" }}>Guardar</button>
              <button onClick={() => { setNoteDraft(setNote); setEditingNote(false); }} className="text-[11px] text-slate-500 hover:text-slate-300 transition">Cancelar</button>
            </div>
          </div>
        ) : setNote ? (
          <button onClick={() => setEditingNote(true)} className="w-full mt-2.5 flex items-start gap-1.5 text-left rounded-lg px-2 py-1.5 transition active:scale-[0.99]" style={{ backgroundColor: accent + "12", border: `1px solid ${accent}28` }}>
            <StickyNote size={11} className="mt-0.5 shrink-0" style={{ color: accent }} />
            <span className="text-[11px] leading-snug" style={{ color: accent, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{setNote}</span>
          </button>
        ) : (
          <button onClick={() => setEditingNote(true)} className="w-full flex items-center justify-center gap-1.5 mt-2.5 py-2 rounded-lg bg-slate-900/50 border border-slate-800/70 text-slate-500 hover:text-slate-300 hover:border-slate-600 text-[11px] font-bold transition"><StickyNote size={11} /> Agregar nota</button>
        )
      )}
      {editingPR && !cardio && (
        <div className="mt-2 rounded-xl p-3 space-y-2 bounce-in" style={{ backgroundColor: "var(--panel-sunken)", border: `1px solid ${accent}30` }}>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] flex items-center gap-1.5" style={{ color: accent }}><Edit3 size={11} /> Corregir récord</p>
          <div className="flex flex-wrap gap-2 items-center">
            <input type="number" inputMode="decimal" placeholder="Reps" value={editReps} onChange={(e) => setEditReps(e.target.value)} className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white" />
            <span className="text-slate-600 text-xs">reps ×</span>
            <input type="number" inputMode="decimal" placeholder="Kg" value={editKg} onChange={(e) => setEditKg(e.target.value)} className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white" />
            <span className="text-slate-600 text-xs">kg</span>
            <button onClick={savePR} className="px-3 py-1.5 rounded-lg !text-white text-xs font-bold" style={{ backgroundColor: accent }}>Guardar</button>
            {override && <button onClick={() => { const l = { ...logs }; delete l[prKey]; setLogs(l); setEditingPR(false); }} className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 text-xs">Quitar</button>}
            <button onClick={() => setEditingPR(false)} className="text-slate-500 text-xs">Cancelar</button>
          </div>
        </div>
      )}
      {rankUpInfo && <RankUpModal from={rankUpInfo.from} to={rankUpInfo.to} muscleName={rankUpInfo.muscleName} onClose={() => setRankUpInfo(null)} />}
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
function ExerciseCard({ exercise, accent, logs, setLogs, drafts = {}, setDrafts, deloadSets, deloadMode, resetKey = 0, settings = DEFAULT_SETTINGS, forceOpen = false, onDisableAutoShowPrShare, hasActiveSession = true, hideTimer = false, onUpdateSettings = null, sex = null, age = null }) {
  const [open, setOpen] = useState(false);
  const [showWarmup, setShowWarmup] = useState(false);
  // Nota personal del ejercicio (persiste en el perfil → sincroniza)
  // forceOpen se usa solo desde las demos del tutorial guiado, para abrir la
  // tarjeta automáticamente cuando el paso explica algo de adentro (reps/kg,
  // RPE, descanso, video). No afecta el comportamiento normal de la app.
  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);
  const hasHeavy = exercise.sets.some((s) => isHeavyRepRange(s.repRange));
  const setsToShow = deloadSets ? exercise.sets.slice(0, deloadSets) : exercise.sets;

  // ── POSICIÓN DEL CRONÓMETRO entre las series ──────────────────────────────
  // Contamos cuántas series desde el principio ya están registradas HOY (racha
  // inicial: si te salteás una, el timer se queda antes del hueco, que es donde
  // te falta trabajo). 0 = arriba de todo; N = justo debajo de la serie N.
  // Al completar TODAS vuelve a 0, listo para la próxima vuelta.
  const hoyStr = todayStr();
  const timerSlot = useMemo(() => {
    if (exercise.cardio || hideTimer) return -1; // sin timer intercalado
    let hechas = 0;
    for (let i = 0; i < setsToShow.length; i++) {
      const hist = logs[`${exercise.id}_${i}`] || [];
      if (hist.some((h) => h.date === hoyStr)) hechas++;
      else break;
    }
    return hechas >= setsToShow.length ? 0 : hechas;
  }, [logs, exercise.id, exercise.cardio, hideTimer, setsToShow.length, hoyStr]);
  const { stagnant } = useMemo(() => getStagnationInfo(exercise, logs), [exercise, logs]);
  const bestWorkingKg = !exercise.cardio ? getBestWorkingKg(exercise, logs) : null;
  return (
    <div className="stagger-item smooth-card bg-slate-900/50 border border-slate-800/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-md shadow-black/20 transition-shadow hover:shadow-lg hover:shadow-black/30">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-4 hover:bg-slate-800/30 active:bg-slate-800/50 transition text-left">
        <div className="flex items-center gap-3">
          <div className="w-2 h-8 rounded-full shrink-0" style={{ backgroundColor: accent, boxShadow: `0 0 10px -2px ${accent}` }} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-white text-sm">{exercise.name}</h3>
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-lg font-bold" style={{ backgroundColor: accent + "18", color: accent }}>{exercise.muscle}</span>
              {exercise.cardio && <span className="text-[10px] bg-rose-400/15 text-rose-300 rounded-lg px-1.5 py-0.5 font-bold flex items-center gap-1"><Footprints size={9} /> CARDIO</span>}
              {deloadMode && <span className="text-[10px] bg-purple-500/15 text-purple-400 rounded-lg px-1.5 py-0.5 font-bold">DESCARGA</span>}
              {/* El ×1/×2 de mancuernas se configura al editar la rutina
                  ("¿Con cuántas mancuernas?"), no acá: durante el
                  entrenamiento sumaba ruido y ya está definido. */}
              {!deloadMode && stagnant && <span className="text-[10px] bg-rose-500/15 text-rose-400 rounded-lg px-1.5 py-0.5 font-bold flex items-center gap-1"><AlertTriangle size={9} /> ESTANCADO</span>}
              {/* Las notas ahora son POR SERIE (ver SetRow): cada serie tiene
                  su propio "Agregar nota". Acá ya no va nada. */}
            </div>
            {exercise.nota && settings.showExerciseNote !== false && <p className="text-[11px] text-slate-500 mt-0.5" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{exercise.nota}</p>}
          </div>
        </div>
        <ChevronDown size={18} className={`text-slate-600 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={open ? "px-4 pb-4 pt-0 tab-fade-in" : "hidden"}>
        {!deloadMode && stagnant && <div className="mb-3 text-[11px] text-rose-400/90 bg-rose-500/5 border border-rose-500/15 rounded-xl px-3 py-2 flex items-start gap-1.5"><Info size={12} className="mt-0.5 shrink-0" /><span>Hace {STAGNATION_DAYS}+ días sin superar el récord. Considerá cambiar reps, descanso o variante.</span></div>}
        {/* El cronómetro ya no vive fijo acá: se posiciona entre las series
            según timerSlot (más abajo, junto a las series). */}
        {!exercise.cardio && !deloadMode && bestWorkingKg != null && settings.showWarmup !== false && (
          <div className="mb-2">
            {!showWarmup ? (
              <button onClick={() => setShowWarmup(true)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold transition" style={{ backgroundColor: accent + "10", border: `1px solid ${accent}30`, color: accent }}>
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
        <div className="mt-1 mb-2" />
        {/* Arriba de todo: solo antes de empezar (o tras completar la última) */}
        {timerSlot === 0 && (
          <div className="mb-2 timer-hop"><RestTimer seconds={hasHeavy ? settings.restLong : settings.restShort} accent={accent} alertType={settings.alertType} timerId={`ex_${exercise.id}`} exerciseName={exercise.name} /></div>
        )}
        {setsToShow.map((s, i) => <React.Fragment key={`${exercise.id}:frag:${i}`}>
          <SetRow key={`${exercise.id}:${i}:${resetKey}`} exerciseId={exercise.id} exerciseName={exercise.name} exerciseMuscle={exercise.muscle} setIndex={i} setDef={s} accent={accent} logs={logs} setLogs={setLogs} drafts={drafts} setDrafts={setDrafts} deloadKgFactor={settings.deloadPct} deloadMode={deloadMode} resetKey={resetKey} autoShowPrShare={settings.autoShowPrShare ?? true} onDisableAutoShowPrShare={onDisableAutoShowPrShare} hasActiveSession={hasActiveSession} cardio={exercise.cardio} dumbbellDouble={settings?.dumbbellDouble || null} fieldSettings={settings} onUpdateSettings={onUpdateSettings} sex={sex} age={age} />
          {/* Debajo de la serie recién registrada: timerSlot = N significa
              "después de la serie N" (1-indexado). */}
          {timerSlot === i + 1 && (
            <div className="my-2 timer-hop"><RestTimer seconds={hasHeavy ? settings.restLong : settings.restShort} accent={accent} alertType={settings.alertType} timerId={`ex_${exercise.id}`} exerciseName={exercise.name} /></div>
          )}
        </React.Fragment>)}
        {exercise.video && (
          <div className="pt-3">
            <a href={exercise.video} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-800 text-slate-400 hover:border-slate-600 hover:text-white transition text-sm font-medium active:scale-[0.98]">
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
  // BUG ARREGLADO: este useMemo estaba DESPUÉS del `return null` de abajo.
  // Los hooks tienen que llamarse siempre, en el mismo orden, en todos los
  // renders — si el componente salía temprano, React perdía la cuenta y podía
  // corromper el estado de otros componentes. Ahora el hook va primero y el
  // early return después.
  const trainedDays = useMemo(() => getTrainedDateSet(logs, sessions), [logs, sessions]);
  // La cascada del calendario corre UNA vez al montar. Sin este flag, cada
  // vez que cambia cualquier cosa (registrás una serie, tocás un día) las
  // semanas volverían a parpadear.
  const [yaAnimado, setYaAnimado] = useState(false);
  useEffect(() => { const t = setTimeout(() => setYaAnimado(true), 900); return () => clearTimeout(t); }, []);
  if (!cycleStart || !weekInfo) return null;
  const { cycleWeeks, trainWeeks } = weekInfo;
  const isLight = settings.theme === "light";
  const neutralDot = isLight ? "#94a3b8" : "#475569";
  const weekDots = Array.from({ length: cycleWeeks }, (_, wi) => { const ws = new Date(cycleStart); ws.setDate(ws.getDate() + wi * 7); const days = Array.from({ length: 7 }, (_, di) => { const d = new Date(ws); d.setDate(d.getDate() + di); return localDateStr(d); }); return { week: wi + 1, days, trained: days.filter((d) => trainedDays.has(d)).length, isDeload: wi + 1 > trainWeeks }; });
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
        {weekDots.map(({ week, trained, isDeload }, wi) => { const isCurrent = week === weekInfo.weekInCycle; const dotColor = isDeload ? "#A855F7" : trained > 0 ? "#3B82F6" : neutralDot; return (
          <div
            key={week}
            // Cascada de entrada: las semanas se marcan una tras otra. Solo al
            // montar (yaAnimado); si no, parpadearían en cada render.
            style={yaAnimado ? undefined : { animation: `dayMark 0.38s cubic-bezier(0.34,1.4,0.64,1) ${wi * 45}ms both` }}
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
      <button onClick={onStart} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white text-sm font-bold transition-all active:scale-[0.98] invite-pulse" style={{ backgroundColor: color, "--invite-glow": `${color}80` }}>
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
        <p className="text-sm font-bold text-white truncate">Sesión en curso</p>
        <p className="text-[11px] truncate" style={{ color: color + "cc" }}>{elapsedMin} min · arrancó a las {new Date(activeSession.startedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</p>
      </div>
      <button onClick={onCancel} className="text-[11px] text-slate-500 hover:text-slate-300 font-semibold shrink-0 whitespace-nowrap">Cancelar</button>
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

function RoutineView({ logs, setLogs, drafts, setDrafts, cycleStart, settings, weekSchedule, activeSession, onStartSession, onEndSession, onCancelSession, onDisableAutoShowPrShare, onUpdateSettings = null, onGoToRoutines = null, onGoToSchedule = null, onGoToFieldSettings = null, todaySessionDayKey = null, sex = null, age = null }) {
  // El día programado para hoy según el cronograma semanal (lunes a domingo)
  // de la rutina activa. Si hoy es descanso programado (o no hay cronograma
  // todavía), cae al viejo heurístico de "último día entrenado + 1" — pero
  // nunca bloquea nada: siempre podés elegir cualquier día con los chips.
  const scheduledDay = useMemo(() => { const dk = weekSchedule?.[todayWeekdayKey()]; return dk && DAY_ORDER.includes(dk) ? dk : null; }, [weekSchedule]);
  const isRestToday = !!weekSchedule && !scheduledDay;
  const fallbackSuggested = useMemo(() => getSuggestedDay(logs), []);
  // Si hoy es descanso programado, NO se sugiere ningún día: mostrar una
  // sugerencia contradice el propio cronograma ("hoy descansás" + "hacé
  // Push" a la vez). El día activo igual arranca en el heurístico para que
  // puedas registrar si querés entrenar igual, pero sin el badge "sugerido".
  const suggestedDay = scheduledDay || (isRestToday ? null : fallbackSuggested);
  // En día de descanso abrimos el PRIMER día de la rutina, no el heurístico
  // de "último entrenado + 1": si hoy no toca nada, sugerir un día del medio
  // (ej. Hombro/Brazos) es arbitrario y confuso. El primer día es un punto
  // de partida neutro y predecible.
  const [activeDay, setActiveDay] = useState(() => scheduledDay || (isRestToday ? DAY_ORDER[0] : fallbackSuggested));
  // Dirección del último cambio de día, para que las tarjetas entren
  // deslizándose desde el lado correcto (como pasar páginas).
  const gridRef = useRef(null);
  const prevDayRef = useRef(activeDay);
  useEffect(() => {
    const prev = DAY_ORDER.indexOf(prevDayRef.current);
    const now = DAY_ORDER.indexOf(activeDay);
    prevDayRef.current = activeDay;
    if (prev === -1 || now === -1 || prev === now) return;
    const el = gridRef.current;
    if (!el) return;
    const cls = now > prev ? "slide-right" : "slide-left";
    el.classList.remove("slide-right", "slide-left");
    // Forzar reflow para que el navegador reinicie la animación aunque sea
    // la misma clase que la vez anterior.
    void el.offsetWidth;
    el.classList.add(cls);
  }, [activeDay]);
  // La sesión activa solo "cuenta" en el día donde se inició. Al cambiar de
  // día se ve sin sesión (podés iniciar otra o solo registrar), pero la
  // sesión original sigue corriendo en su día — no se resetea.
  const sessionForThisDay = (activeSession && (!activeSession.dayKey || activeSession.dayKey === activeDay)) ? activeSession : null;

  // Al iniciar la sesión, las tarjetas se "despiertan" con un pulso en cascada:
  // marca el momento en que arranca el entrenamiento. Va DESPUÉS de declarar
  // sessionForThisDay (si no, sería un uso antes de la declaración → crash).
  const prevSesionRef = useRef(false);
  useEffect(() => {
    const hayAhora = !!sessionForThisDay;
    const habiaAntes = prevSesionRef.current;
    prevSesionRef.current = hayAhora;
    if (!hayAhora || habiaAntes) return; // solo al pasar de "sin sesión" a "con sesión"
    const el = gridRef.current;
    if (!el) return;
    const tarjetas = Array.from(el.children);
    tarjetas.forEach((t, i) => {
      t.style.animation = `wakeUp 0.45s cubic-bezier(0.34,1.3,0.64,1) ${i * 55}ms both`;
    });
    const limpiar = setTimeout(() => { tarjetas.forEach((t) => { t.style.animation = ""; }); }, 1200);
    return () => clearTimeout(limpiar);
  }, [sessionForThisDay]);
  const weekInfo = getWeekInfo(cycleStart, settings), isDeload = weekInfo?.isDeload, day = ROUTINE[activeDay];
  const [resetKeys, setResetKeys] = useState({});
  const [confirmReset, setConfirmReset] = useState(false);
  const getDeloadSets = (ex) => Math.max(1, Math.ceil(ex.sets.length / settings.deloadSetDivisor));

  const today = todayStr();
  let totalSets = 0, doneToday = 0;
  day.exercises.forEach((ex) => ex.sets.forEach((s, i) => { totalSets++; const h = logs[`${ex.id}_${i}`] || []; if (h.some((x) => x.date === today)) doneToday++; }));
  // Si hoy entrenaste (o estás entrenando) un día ESPECÍFICO, los demás
  // días muestran 0% — antes, los ejercicios compartidos entre días (ej.
  // press militar en Push y en Hombro/Brazo) hacían aparecer un % fantasma
  // en días que no entrenaste, y el "resetear" del día activo no lo sacaba.
  const rawPct = totalSets ? Math.round((doneToday / totalSets) * 100) : 0;
  const pct = (todaySessionDayKey && todaySessionDayKey !== activeDay) ? 0 : rawPct;

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
        {onGoToFieldSettings && (
          <button onClick={onGoToFieldSettings} className="relative w-full flex items-center justify-center gap-1.5 mt-4 pt-3 border-t border-white/10 text-[10px] font-bold text-teal-300/75 hover:text-teal-300 transition">
            <Sliders size={11} /> Personalizar qué ves al registrar <ChevronRight size={11} />
          </button>
        )}
      </div>

      {isRestToday && (
        <button onClick={() => (onGoToSchedule || onGoToRoutines)?.()} className="w-full flex items-start gap-2.5 bg-slate-900/50 border border-slate-800/50 rounded-xl px-3.5 py-2.5 text-left transition active:scale-[0.99] hover:border-slate-700">
          <Calendar size={13} className="text-slate-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-slate-400">Hoy es descanso según tu cronograma semanal, pero entrená el día que quieras: esto es solo una guía.</p>
            <p className="text-[10px] text-slate-600 mt-1 flex items-center gap-1">Tocá acá para editar tu cronograma <ChevronRight size={11} /></p>
          </div>
        </button>
      )}

      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${DAY_ORDER.length}, 1fr)` }}>
        {DAY_ORDER.map((k) => (
          <button key={k} onClick={() => setActiveDay(k)} className="py-2.5 rounded-xl text-[10px] font-black uppercase transition-all active:scale-95 border text-center leading-tight"
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

      {/* La sesión activa pertenece a UN día (el que iniciaste). Si estás
          viendo otro día, no mostramos "sesión en curso" ahí — pero la
          sesión real sigue viva en su día, no se resetea. */}
      <SessionStartBar activeSession={sessionForThisDay} onStart={() => onStartSession(activeDay)} onCancel={onCancelSession} color={day.color} />

      {/* La animación de deslizamiento se dispara reiniciando la clase por
          JS (ver el efecto de slideDir) en vez de con key={activeDay}: usar
          key acá remontaba TODAS las tarjetas y se perdía su estado local
          (si estaba abierta, la nota a medio escribir, el calentamiento
          desplegado). Así se anima igual pero sin destruir nada. */}
      <div ref={gridRef} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {groupExercisesIntoSupersets(day.exercises).map((group) => {
          if (group.length === 1) {
            const ex = group[0];
            return <ExerciseCard key={`${activeDay}:${ex.id}:${resetKeys[activeDay] || 0}`} exercise={ex} accent={day.color} logs={logs} setLogs={setLogs} drafts={drafts} setDrafts={setDrafts} deloadSets={isDeload ? getDeloadSets(ex) : null} deloadMode={isDeload} resetKey={resetKeys[activeDay]} settings={settings} onUpdateSettings={onUpdateSettings} onDisableAutoShowPrShare={onDisableAutoShowPrShare} hasActiveSession={!!sessionForThisDay} sex={sex} age={age} />;
          }
          // Superserie: varios ejercicios encadenados comparten un solo
          // cronómetro al final del grupo, en vez de uno por ejercicio —
          // la idea de la superserie es justamente no descansar entre
          // ellos, sólo al terminar la vuelta completa.
          const hasHeavyGroup = group.some((ex) => ex.sets.some((s) => isHeavyRepRange(s.repRange)));
          return (
            <div key={`${activeDay}:${group.map((e) => e.id).join("-")}`} className="rounded-2xl border p-2.5 space-y-2.5" style={{ borderColor: day.color + "50", backgroundColor: day.color + "06" }}>
              <div className="flex items-center gap-1.5 px-1"><Link size={11} style={{ color: day.color }} /><span className="text-[10px] font-black uppercase tracking-wider" style={{ color: day.color }}>Superserie · {group.length} ejercicios</span></div>
              {group.map((ex) => <ExerciseCard key={`${activeDay}:${ex.id}:${resetKeys[activeDay] || 0}`} exercise={ex} accent={day.color} logs={logs} setLogs={setLogs} drafts={drafts} setDrafts={setDrafts} deloadSets={isDeload ? getDeloadSets(ex) : null} deloadMode={isDeload} resetKey={resetKeys[activeDay]} settings={settings} onUpdateSettings={onUpdateSettings} onDisableAutoShowPrShare={onDisableAutoShowPrShare} hasActiveSession={!!sessionForThisDay} hideTimer sex={sex} age={age} />)}
              <div className="px-1"><RestTimer seconds={hasHeavyGroup ? settings.restLong : settings.restShort} accent={day.color} alertType={settings.alertType} timerId={`grp_${group.map((g) => g.id).join("_")}`} exerciseName={group.map((g) => g.name).filter(Boolean).join(" + ")} /></div>
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
  const [confirmDel, setConfirmDel] = useState(false);
  const dateLabel = new Date(session.date + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const mainDay = ROUTINE[session.dayKeys[0]];
  const accent = mainDay?.color || "#14B8A6";
  // Agrupar las series por ejercicio — en vez de una lista plana de
  // "ejercicio S1 / ejercicio S2", cada ejercicio es una tarjeta con sus
  // series adentro como pills. Mucho más legible de un vistazo.
  const grouped = useMemo(() => {
    const map = new Map();
    session.items.forEach((it) => {
      if (!map.has(it.exerciseName)) map.set(it.exerciseName, []);
      map.get(it.exerciseName).push(it);
    });
    return Array.from(map.entries());
  }, [session.items]);
  const improvements = session.improvedCount || 0;

  return (
    <div className="rounded-3xl overflow-hidden bounce-in border" style={{ borderColor: accent + "35", background: "var(--panel-grad-slate)" }}>
      {/* Header con el color del día entrenado */}
      <div className="relative px-4 pt-4 pb-3 overflow-hidden">
        <div className="absolute -top-10 -right-8 w-36 h-36 rounded-full blur-3xl opacity-25 pointer-events-none" style={{ backgroundColor: accent }} />
        <div className="relative">
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {session.dayKeys.map((dk) => ROUTINE[dk] && (
              <span key={dk} className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg" style={{ backgroundColor: ROUTINE[dk].color + "25", color: ROUTINE[dk].color }}>{ROUTINE[dk].label}</span>
            ))}
          </div>
          <p className="text-base font-black text-white capitalize leading-tight pr-10">{dateLabel}</p>
        </div>
      </div>

      {/* Tiles de stats de la sesión */}
      <div className="grid grid-cols-3 gap-1.5 px-4 pb-3">
        <div className="rounded-xl bg-black/25 border border-slate-800/50 py-2 text-center">
          <p className="text-lg font-black text-white tabular-nums leading-none">{session.totalSets}</p>
          <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mt-1">series</p>
        </div>
        <div className="rounded-xl bg-black/25 border border-slate-800/50 py-2 text-center">
          <p className="text-lg font-black tabular-nums leading-none" style={{ color: session.durationMin != null ? "#fff" : "#334155" }}>
            {session.durationMin != null ? (session.durationMin >= 60 ? `${Math.floor(session.durationMin / 60)}h${String(session.durationMin % 60).padStart(2, "0")}` : `${session.durationMin}m`) : "—"}
          </p>
          <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mt-1">duración</p>
        </div>
        <div className="rounded-xl bg-black/25 border border-slate-800/50 py-2 text-center">
          <p className={`text-lg font-black tabular-nums leading-none ${session.completionPct == null ? "text-slate-700" : session.completionPct >= 100 ? "text-emerald-400" : session.completionPct >= 60 ? "text-teal-400" : "text-amber-400"}`}>
            {session.completionPct != null ? `${session.completionPct}%` : "—"}
          </p>
          <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mt-1">del día</p>
        </div>
      </div>

      {improvements > 0 && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-xl px-3 py-2 bg-emerald-500/10 border border-emerald-500/20">
          <TrendingUp size={13} className="text-emerald-400 shrink-0" />
          <p className="text-[11px] font-bold text-emerald-300">{improvements} marca{improvements === 1 ? "" : "s"} personal{improvements === 1 ? "" : "es"} este día 🔥</p>
        </div>
      )}

      {/* Ejercicios agrupados con sus series como pills */}
      <div className="px-4 pb-4 space-y-2">
        {grouped.map(([exName, items]) => (
          <div key={exName} className="rounded-xl bg-slate-900/70 border border-slate-800/60 px-3 py-2.5">
            <p className="text-xs font-bold text-white mb-1.5 truncate">{exName}</p>
            <div className="flex flex-wrap gap-1.5">
              {items.map((it, i) => {
                // Al abrir el día, los chips de series aparecen uno tras otro
                // (el color "se va llenando"). Delay corto: se percibe la
                // onda pero no te hace esperar para leer.
                // Tres estados, comparando SIEMPRE por 1RM estimado (combina
                // reps y kilos: una rep menos con el mismo peso también baja):
                //   · Mejoraste tu marca → verde + 🔥
                //   · La igualaste       → gris, sin adornos
                //   · Quedaste por debajo → rojo + cuánto bajaste
                const isCardio = it.minutes != null;
                const pct = it.pctOfBest;
                // Rojo solo si bajaste de verdad (≤98%). Igualar o quedar a
                // 1-2% por el redondeo de la fórmula NO es rojo: es "igualaste".
                const below = !isCardio && pct != null && pct < 99;
                const color = it.isImprovement ? "#6EE7B7" : below ? "#FCA5A5" : "#cbd5e1";
                const bg = it.isImprovement ? "#10B98118" : below ? "#F43F5E14" : "var(--surface-2)";
                const bd = it.isImprovement ? "#10B98135" : below ? "#F43F5E30" : "transparent";
                return (
                  <span key={i} className="text-[11px] font-bold px-2 py-1 rounded-lg tabular-nums inline-flex items-center gap-1 number-pop"
                    style={{ color, backgroundColor: bg, border: `1px solid ${bd}`, animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                    {isCardio ? `${it.minutes} min` : `${it.reps}×${it.kg}kg`}
                    {it.isImprovement && " 🔥"}
                    {below && <span className="text-[9px] font-black opacity-90">↓{100 - pct}%</span>}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Borrar día */}
      {onDelete && (
        <div className="px-4 pb-4">
          {!confirmDel ? (
            <button onClick={() => setConfirmDel(true)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold text-slate-600 hover:text-rose-400 transition"><Trash2 size={12} /> Borrar este día</button>
          ) : (
            <div className="flex gap-2 items-center bg-rose-950/30 border border-rose-500/20 rounded-xl px-3 py-2 bounce-in">
              <p className="text-[11px] text-rose-300/80 flex-1">¿Borrar este día? Los récords no cambian.</p>
              <button onClick={() => setConfirmDel(false)} className="px-2 py-1 rounded-lg bg-slate-800 text-slate-400 text-[11px]">No</button>
              <button onClick={() => onDelete(session.date)} className="px-2 py-1 rounded-lg bg-rose-500 !text-white text-[11px] font-bold">Sí</button>
            </div>
          )}
        </div>
      )}
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

function ShareSummaryCard({ logs, trainingSessions = [] }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null); // "pr" | "period"
  const [period, setPeriod] = useState("week");
  const [selExId, setSelExId] = useState(null);
  const [showImage, setShowImage] = useState(false);

  const allExercises = useMemo(() => DAY_ORDER.flatMap((dk) => ROUTINE[dk].exercises.map((e) => ({ id: e.id, name: e.name, muscle: e.muscle, color: ROUTINE[dk].color, sets: e.sets.length }))), []);
  const allSessions = useMemo(() => buildSessionsIndex(logs, trainingSessions), [logs, trainingSessions]);
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
      return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); const ds = localDateStr(d); return { trained: trainedDateSet.has(ds), isPad: false }; });
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
      // Consideramos el override MANUAL *y* el historial real juntos, y nos
      // quedamos con el de mayor 1RM. Antes se usaba SOLO el override cuando
      // existía (`ov ? [ov] : h`), lo que hacía que un override viejo (ej.
      // 8×95, guardado automáticamente por una versión anterior) pisara para
      // siempre marcas nuevas mejores del historial (ej. 9×95) — el famoso
      // "dato fantasma" que no se actualizaba nunca.
      const entries = ov ? [ov, ...h] : h;
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

function SessionHistoryView({ logs, onDeleteDay, trainingSessions = [], weekSchedule = null }) {
  const sessions = useMemo(() => buildSessionsIndex(logs, trainingSessions), [logs, trainingSessions]);
  // Días entrenados y racha — mudados acá desde el hero de Progreso,
  // en formato compacto acoplado al calendario.
  const miniStats = useMemo(() => {
    const dateSet = new Set(sessions.map((s) => s.date));
    return { days: dateSet.size, streak: computeSmartStreak(dateSet, weekSchedule) };
  }, [sessions, weekSchedule]);
  // ¿La racha SUBIÓ desde la última vez que la viste? → salto dorado.
  const [rachaSubio] = useState(() => STREAK_VISTO !== null && miniStats.streak > STREAK_VISTO);
  useEffect(() => { STREAK_VISTO = miniStats.streak; }, [miniStats.streak]);
  const sessionByDate = useMemo(() => { const m = {}; sessions.forEach((s) => { m[s.date] = s; }); return m; }, [sessions]);
  const [view, setView] = useState("calendar");
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selectedDate, setSelectedDate] = useState(null);
  const weeks = useMemo(() => getMonthMatrix(cursor.y, cursor.m), [cursor]);
  const selectedSession = selectedDate ? sessionByDate[selectedDate] : null;
  // El detalle del día también congela el fondo y responde al botón atrás.
  const cerrarDetalleDia = useCallback(() => setSelectedDate(null), []);
  useAndroidBack(selectedSession ? cerrarDetalleDia : null);
  const handleDeleteDay = (date) => { onDeleteDay?.(date); if (selectedDate === date) setSelectedDate(null); };
  // Qué días de tu rutina aparecen en el mes que estás mirando — para la
  // leyenda de abajo del calendario, así el color de cada celda no queda
  // sin explicación.
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
        {/* Días entrenados y racha — compactos, acoplados al historial */}
        <div className="flex gap-1.5">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800/60">
            <Calendar size={11} className="text-blue-400" />
            <span className="text-xs font-black text-white tabular-nums">{miniStats.days}</span>
            <span className="text-[9px] text-slate-500 font-semibold">días</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800/60">
            <span className="text-[11px]">🔥</span>
            <span className={`text-xs font-black text-white tabular-nums inline-block ${rachaSubio ? "streak-jump" : "streak-beat streak-glow"}`}>{miniStats.streak}</span>
            <span className="text-[9px] text-slate-500 font-semibold">racha</span>
          </div>
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
                  <button key={i} onClick={() => s && setSelectedDate(isSelected ? null : d)} disabled={!s} style={{ ...bgStyle, animationDelay: `${Math.min(i, 34) * 12}ms` }}
                    className={`cell-pop aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-all ${isSelected ? "ring-2 ring-teal-400" : ""} ${isToday && !s ? "border border-teal-500/50" : ""} ${s ? "text-white hover:brightness-125 active:scale-95" : "text-slate-700"}`}>
                    {dayNum}
                    {s && <div className="flex gap-0.5">{s.dayKeys.slice(0, 3).map((dk) => <span key={dk} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ROUTINE[dk].color }} />)}</div>}
                  </button>
                );
              })}
            </div>

          </div>
          {!selectedSession && <p className="text-center text-[11px] text-slate-600 py-2">Tocá un día con marca para ver el detalle.</p>}
          {/* Detalle de la sesión como modal centrado — antes se desplegaba
              abajo del calendario y quedaba escondido; ahora aparece al
              frente, con fondo difuminado y cierre con toque afuera o X. */}
          {selectedSession && (
            <div className="fixed inset-0 z-[140] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 modal-bg-in modal-overlay" onClick={() => setSelectedDate(null)}>
              <div className="max-w-md w-full max-h-[85vh] overflow-y-auto overscroll-contain rounded-3xl modal-pop-in" onClick={(e) => e.stopPropagation()}>
                <div className="relative">
                  <button onClick={() => setSelectedDate(null)} aria-label="Cerrar" className="absolute top-3 right-3 z-10 p-2 rounded-xl bg-slate-800/90 text-slate-400 hover:text-white transition active:scale-90"><X size={15} /></button>
                  <SessionDetailCard session={selectedSession} onDelete={(date) => { handleDeleteDay(date); setSelectedDate(null); }} />
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div key="list" className="space-y-2.5">
          {/* Las tarjetas entran en cascada, cada una un poco después de la
              anterior. Solo las primeras 12 llevan retraso: más allá de eso ya
              están fuera de pantalla y retrasarlas solo haría lenta la carga. */}
          {sessions.map((s, i) => (
            <div key={s.date} className="hist-enter" style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}>
              <SessionDetailCard session={s} onDelete={handleDeleteDay} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   DELOAD VIEW (unchanged from prior redesign)
============================================================================ */
// Cronómetro/cuenta regresiva compacto para los ejercicios de cardio en la
// semana de descarga — misma funcionalidad que en la rutina normal: modo
// cronómetro (cuenta arriba) o cuenta regresiva desde los minutos reducidos.
// Al llegar a 0 en cuenta regresiva, marca la serie como hecha con vibración.
function DeloadCardioTimer({ targetMinutes, accent, onComplete }) {
  const [mode, setMode] = useState("countdown"); // countdown | stopwatch
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);
  const fmt = (secs) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;
  const targetSecs = Math.max(1, Math.round(targetMinutes * 60));

  useEffect(() => {
    if (!running) { clearInterval(intervalRef.current); return; }
    const startedAt = Date.now() - elapsed * 1000;
    intervalRef.current = setInterval(() => {
      const el = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(el);
      if (mode === "countdown" && el >= targetSecs) {
        clearInterval(intervalRef.current);
        setRunning(false);
        haptic([100, 50, 100, 50, 200]);
        onComplete?.();
      }
    }, 500);
    return () => clearInterval(intervalRef.current);
  }, [running, mode, targetSecs]);

  const display = mode === "countdown" ? fmt(Math.max(0, targetSecs - elapsed)) : fmt(elapsed);
  return (
    <div className="mb-2.5 rounded-lg overflow-hidden border border-slate-800/60">
      <div className="flex bg-slate-900/60 p-0.5 gap-0.5">
        <button onClick={() => { setMode("countdown"); setRunning(false); setElapsed(0); }} className={`flex-1 py-1.5 rounded-md text-[9px] font-bold transition-all ${mode === "countdown" ? "text-white" : "text-slate-600"}`} style={mode === "countdown" ? { backgroundColor: accent } : {}}>Cuenta regresiva</button>
        <button onClick={() => { setMode("stopwatch"); setRunning(false); setElapsed(0); }} className={`flex-1 py-1.5 rounded-md text-[9px] font-bold transition-all ${mode === "stopwatch" ? "text-white" : "text-slate-600"}`} style={mode === "stopwatch" ? { backgroundColor: accent } : {}}>Cronómetro</button>
      </div>
      <div className="flex items-center justify-between px-3 py-2 bg-slate-950/40">
        <span className="text-lg font-black tabular-nums" style={{ color: running ? accent : "#94a3b8" }}>{display}</span>
        <div className="flex gap-1.5">
          <button onClick={() => setRunning((r) => !r)} className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-white transition active:scale-95" style={{ backgroundColor: accent }}>
            {running ? "Pausar" : elapsed > 0 ? "Seguir" : "Iniciar"}
          </button>
          {elapsed > 0 && !running && (
            <button onClick={() => { setElapsed(0); }} className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold border border-slate-700 text-slate-400 transition active:scale-95">↺</button>
          )}
        </div>
      </div>
    </div>
  );
}

function DeloadView({ logs, settings = DEFAULT_SETTINGS, deloadProgress = {}, setDeloadProgress, onFinishDeloadSession }) {
  const globalUnit = useWeightUnit();
  const [unit, setUnit] = useState(globalUnit);
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
                <button onClick={() => setUnit((u) => u === "kg" ? "lbs" : "kg")} className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-500 hover:text-slate-300 transition border border-slate-700 ml-1">
                  {unit === "kg" ? "lbs" : "kg"}
                </button>
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

      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${DAY_ORDER.length}, 1fr)` }}>
        {DAY_ORDER.map((dk) => {
          const d = ROUTINE[dk], isActive = activeDay === dk;
          const withPR = d.exercises.filter((ex) => ex.sets.some((s, i) => logs[`${ex.id}_${i}_pr_override`] || (logs[`${ex.id}_${i}`] || []).length > 0)).length;
          return (
            <button key={dk} onClick={() => setActiveDay(dk)}
              className="py-2.5 rounded-xl text-[10px] font-black uppercase transition-all active:scale-95 border text-center leading-tight"
              style={isActive ? { backgroundColor: d.color + "22", borderColor: d.color + "55", color: d.color } : { borderColor: "var(--chip-border)", color: "var(--chip-text)" }}>
              <span className="block">{d.label}</span>
              {withPR > 0 && <span className="text-[8px] font-black opacity-70">{withPR}/{d.exercises.length}</span>}
            </button>
          );
        })}
      </div>

      <div key={activeDay} className="space-y-3 tab-fade-in">
        {day.exercises.map((ex) => {
          const deloadSets = Math.max(1, Math.ceil(ex.sets.length / deloadSetDivisor));
          const bestPerSet = ex.sets.map((s, i) => { const h = logs[`${ex.id}_${i}`] || []; let best = s.pr ? { ...s.pr } : null; const ov = logs[`${ex.id}_${i}_pr_override`]; if (ov) best = ov; const pool = ov ? h : h; pool.forEach((e) => { const scoreE = ex.cardio ? (e.minutes || 0) : estimate1RM(e.kg, e.reps); const scoreB = best ? (ex.cardio ? (best.minutes || 0) : estimate1RM(best.kg, best.reps)) : -1; if (!best || scoreE > scoreB) best = e; }); return best; });
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
                  <RestTimer seconds={hasHeavy ? settings.restLong : settings.restShort} accent={day.color} alertType={settings.alertType} timerId={`deload_${ex.id}`} exerciseName={ex.name} />
                </div>
              )}
              <div className="px-4 py-3 space-y-2.5">
                {hasPR ? (
                  ex.sets.slice(0, deloadSets).map((s, i) => {
                    const best = bestPerSet[i], deloadKg = best ? Math.round(best.kg * deloadPct * 2) / 2 : null;
                    const progressKey = `${ex.id}_${i}`;
                    const done = deloadProgress[progressKey] === today;
                    return (
                      <div key={i} className="relative overflow-hidden rounded-2xl px-3.5 py-3 transition-all duration-200" style={{ background: done ? `linear-gradient(130deg, ${day.color}18, ${day.color}06)` : "linear-gradient(130deg, #A855F718, #A855F706)", border: `1px solid ${done ? day.color + "45" : "#A855F735"}` }}>
                        <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full blur-2xl pointer-events-none opacity-25" style={{ backgroundColor: done ? day.color : "#A855F7" }} />
                        <div className="absolute left-0 top-2 bottom-2 w-1 rounded-full" style={{ backgroundColor: done ? day.color : "#A855F7" }} />
                        <div className="relative flex items-center gap-2 mb-2.5">
                          <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Serie {i + 1}</span>
                          <span className="text-[9.5px] bg-slate-800/70 text-slate-500 rounded-md px-1.5 py-0.5 font-bold">{s.repRange} reps</span>
                        </div>
                        {best && (ex.cardio ? (
                          <>
                          <div className="relative rounded-xl px-3 py-2.5 mb-2.5 bg-slate-950/60 border" style={{ borderColor: done ? day.color + "35" : "#A855F730" }}>
                            <span className="block text-[8px] font-black uppercase tracking-[0.16em] mb-1.5" style={{ color: done ? day.color + "aa" : "#C084FCaa" }}>Tiempo de descarga</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-bold text-slate-600 line-through tabular-nums shrink-0">{best.minutes} min</span>
                              <ArrowDown size={12} style={{ color: done ? day.color : "#C084FC" }} className="shrink-0" />
                              <span className="text-xl font-black tabular-nums" style={{ color: done ? day.color : "#D8B4FE", textShadow: `0 0 16px ${done ? day.color : "#A855F7"}50` }}>{Math.max(1, Math.round((best.minutes || 0) * deloadPct))}<span className="opacity-60 text-xs ml-1">min</span></span>
                            </div>
                          </div>
                          {!done && <DeloadCardioTimer targetMinutes={Math.max(1, Math.round((best.minutes || 0) * deloadPct))} accent={day.color} onComplete={() => toggleDeloadDone(progressKey)} />}
                          </>
                        ) : (
                          <div className="relative rounded-xl px-3 py-2.5 mb-2.5 bg-slate-950/60 border" style={{ borderColor: done ? day.color + "35" : "#A855F730" }}>
                            <span className="block text-[8px] font-black uppercase tracking-[0.16em] mb-1.5" style={{ color: done ? day.color + "aa" : "#C084FCaa" }}>Peso de descarga</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-bold text-slate-600 line-through tabular-nums shrink-0">{best.reps}×{kgToDisplay(best.kg, unit)}{weightLabel(unit)}</span>
                              <ArrowDown size={12} style={{ color: done ? day.color : "#C084FC" }} className="shrink-0" />
                              <span className="text-xl font-black tabular-nums" style={{ color: done ? day.color : "#D8B4FE", textShadow: `0 0 16px ${done ? day.color : "#A855F7"}50` }}>{best.reps}<span className="opacity-50 text-sm mx-0.5">×</span>{kgToDisplay(deloadKg, unit)}<span className="opacity-60 text-xs ml-0.5">{weightLabel(unit)}</span></span>
                            </div>
                          </div>
                        ))}
                        <button onClick={() => toggleDeloadDone(progressKey)} className="relative w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all active:scale-[0.98]" style={done ? { background: `linear-gradient(160deg, ${day.color}, ${day.color}b0)`, color: "#fff" } : { backgroundColor: "var(--row-surface)", border: "1px solid #33415580", color: "#94a3b8" }}>
                          {done ? <><span className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center"><Check size={12} strokeWidth={3} /></span> Hecha</> : "Marcar como hecha"}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 bg-slate-900/40 border border-slate-800/60">
                    <div className="w-6 h-6 rounded-lg bg-slate-800/80 flex items-center justify-center shrink-0"><Target size={12} className="text-slate-600" /></div>
                    <p className="text-[11px] text-slate-500 leading-snug">Registrá marcas en la rutina para ver la descarga calculada.</p>
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
          <button onClick={handleFinishSession} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl !text-white text-sm font-bold transition-all active:scale-[0.98] shadow-lg" style={{ backgroundColor: "#A855F7", boxShadow: "0 10px 24px -8px #A855F788" }}>
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
    // Con cualquier marca registrada ya sos Bronce I (y el músculo se
    // pinta en el muñeco). El primer umbral es la meta hacia el próximo
    // nivel, no una barrera de entrada al sistema de rangos.
    return { ...RANK_TIERS[0], levelIdx: 0, threshold: 0, nextThreshold: thresholds[0], hasData: true };
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
function scanContributorsFor1RM(contributors, logs, overriddenBaseKeys, lfOverrides = null) {
  let best1RM = 0, bestKg = 0, bestReps = 0, bestExerciseId = null, bestLoadFactor = 1, bestWeight = 1, bestRawRm = 0;
  Object.entries(logs).forEach(([key, val]) => {
    const isOverride = key.endsWith("_pr_override");
    const baseKey = isOverride ? key.replace(/_pr_override$/, "") : key;
    // BUG FIX: antes, cuando existía un override para una serie, se ignoraba
    // completamente el historial real (la línea "if (!isOverride && overridden…)
    // return" saltaba afuera antes de procesar las entradas). Esto causaba que
    // cualquier marca nueva registrada DESPUÉS de haber editado el récord a
    // mano quedara invisible para el cálculo de rango — el muñeco dejaba de
    // actualizarse y el "A superar" también. Ahora procesamos AMBOS (override
    // + historial real) y nos quedamos con el que dé el mejor 1RM.
    const { exerciseId } = parseLogKey(baseKey);
    if (!contributors.has(exerciseId)) return;
    const weight = contributors.get(exerciseId);
    // El usuario puede fijar por ejercicio si entrena con UNA o DOS
    // mancuernas (toggle ×1/×2 en la tarjeta del ejercicio) — ese override
    // manda sobre el valor de la librería. Ej: búlgaras con 2×20kg cuentan
    // 40kg reales para el rango, no 20.
    const lf = (lfOverrides && lfOverrides[exerciseId]) || EXERCISE_LIBRARY_BY_ID[exerciseId]?.loadFactor || 1;
    const entries = isOverride ? [val] : (Array.isArray(val) ? val : []);
    entries.forEach((e) => {
      if (!e || !e.kg || !e.reps) return;
      // Para elegir CUÁL serie es tu marca (bestKg/bestReps) comparamos por
      // 1RM CRUDO — así entre 110×5 (1RM≈128) y 95×8 (1RM≈120) gana 110×5,
      // sin que el factor de contribución del grupo (weight) pueda invertir
      // el resultado eligiendo una serie con menos kg reales solo porque su
      // ejercicio pesa más en el promedio del grupo.
      const rawRm = estimate1RM(e.kg * lf, e.reps);
      if (rawRm > bestRawRm) {
        bestRawRm = rawRm;
        bestKg = e.kg; bestReps = e.reps; bestExerciseId = exerciseId; bestLoadFactor = lf; bestWeight = weight;
        best1RM = rawRm * weight; // el número del ranking sí usa el weight
      }
    });
  });
  return { best1RM, bestKg, bestReps, bestExerciseId, bestLoadFactor, bestWeight, bestRawRm };
}

function getBest1RMForMuscleGroup(groupKey, logs, lfOverrides = null) {
  const { primary, always, secondary } = EXERCISE_LIBRARY_CONTRIBUTORS_BY_GROUP[groupKey] || { primary: new Map(), always: new Map(), secondary: new Map() };
  // INMUNIDAD A DATOS FANTASMA: antes de escanear, descartamos los
  // récords-override que el historial real ya alcanzó o superó. Así el
  // muñeco SIEMPRE analiza todos los ejercicios del músculo y elige el de
  // mayor 1RM real, sin que un override viejo (guardado por una versión
  // anterior, o reintroducido por la nube) pueda pisar tus marcas
  // verdaderas. No importa de dónde venga el dato: si el historial lo
  // supera, acá no se considera.
  const { logs: cleanLogs } = cleanObsoleteOverrides(logs);
  const primaryResult = scanContributorsFor1RM(primary, cleanLogs, null, lfOverrides);
  const alwaysResult = scanContributorsFor1RM(always, cleanLogs, null, lfOverrides);
  // La marca que se MUESTRA prioriza el ejercicio PRIMARIO del músculo:
  // si tenés una marca en un ejercicio dedicado (ej. curl para bíceps),
  // esa es "tu marca de bíceps" aunque un ejercicio indirecto con weight
  // alto (ej. remo, que también trabaja bíceps) diera un 1RM ponderado
  // mayor. Solo si NO hay marca primaria se usa el "siempre cuenta".
  // El ranking numérico sí puede usar el mayor de los dos; pero bestKg/
  // bestReps (lo que ve el usuario) sale del primario cuando existe.
  let best;
  if (primaryResult.best1RM > 0) {
    // Hay marca en un ejercicio primario: esa es la que se muestra. El
    // número del ranking toma el mayor 1RM ponderado de ambos.
    best = { ...primaryResult, best1RM: Math.max(primaryResult.best1RM, alwaysResult.best1RM) };
  } else {
    best = alwaysResult;
  }
  const finalBest = best.best1RM > 0 ? best : scanContributorsFor1RM(secondary, cleanLogs, null, lfOverrides);

  return {
    best1RM: finalBest.best1RM, bestKg: finalBest.bestKg, bestReps: finalBest.bestReps, bestLoadFactor: finalBest.bestLoadFactor, bestWeight: finalBest.bestWeight,
    bestExerciseName: finalBest.bestExerciseId ? (EXERCISE_LIBRARY_BY_ID[finalBest.bestExerciseId]?.name || finalBest.bestExerciseId) : null,
  };
}

// Insignias de rango — imágenes en /public/insignias/{tier}.png.
// object-fit: contain (sin deformar). Dos ajustes por tier:
//  - widthAdjust: bronce/plata venían más anchas que oro → se les reduce
//    el ancho visual para que las tres coincidan; diamante y maestro se
//    igualan a esmeralda.
//  - TIER_SCALE: escala progresiva casi imperceptible (bronce el más
//    chico → maestro el más grande) que refuerza psicológicamente la
//    jerarquía de rangos sin que se note a simple vista.
//  - Plata tiene el brillo del archivo más fuerte que el resto → se le
//    baja un poco el brightness para emparejar.
const TIER_SCALE = { bronce: 0.90, plata: 0.94, oro: 0.98, esmeralda: 1.02, diamante: 1.06, maestro: 1.10 };
function RankBadgeIcon({ tier, sub, color, size = 32 }) {
  const [imgError, setImgError] = useState(false);
  const tierFile = (tier || "bronce").toLowerCase();
  const scale = TIER_SCALE[tierFile] ?? 1;
  const s = Math.round(size * scale);
  // Diamante viene un poco más alto que el resto — se lo achata apenas
  const squashY = tierFile === "diamante" ? 0.95 : 1;
  const imgFilter = tierFile === "plata"
    ? "saturate(0.7) brightness(0.82)"
    : "saturate(0.7) brightness(0.92)";
  return (
    // Contenedor cuadrado fijo. La imagen usa max-width/max-height al 100%
    // con width/height auto — se escala al máximo posible dentro del
    // cuadrado SIN deformarse, sin importar si el PNG es alto, ancho o
    // cuadrado. Funciona en todos los WebViews sin depender de objectFit.
    <div className="shrink-0 relative"
      style={{ width: s, height: s, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {!imgError ? (
        <img
          src={`/insignias/${tierFile}.png`}
          alt={`${tier || ""}${sub ? ` ${sub}` : ""}`.trim()}
          onError={() => setImgError(true)}
          draggable={false}
          style={{ width: "auto", height: "auto", maxWidth: "100%", maxHeight: `${squashY * 100}%`, display: "block", filter: imgFilter, transform: squashY !== 1 ? `scaleY(${squashY})` : undefined }}
        />
      ) : (
        <div style={{ width: s, height: s, borderRadius: "50%", backgroundColor: color, filter: "saturate(0.7)" }} />
      )}
      {sub && (
        <span style={{
          position: "absolute",
          bottom: -Math.max(2, Math.round(s * 0.04)),
          right: -Math.max(2, Math.round(s * 0.04)),
          width: Math.max(16, Math.round(s * 0.36)),
          height: Math.max(16, Math.round(s * 0.36)),
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: Math.max(8, Math.round(s * 0.19)), fontWeight: 800, color: "#fff",
          background: "linear-gradient(135deg,#14B8A6,#0E7490)", borderRadius: "50%",
          border: `${Math.max(1.5, Math.round(s * 0.025))}px solid #0a0a0f`,
          boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
        }}>{sub}</span>
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
  oblicuos: "obliques",
  tibial_anterior: "calves", // se interpreta como vista frontal — ver getOurGroupKeysForSlug
};
function getOurGroupKeysForSlug(slug, view) {
  if (slug === "neck") return ["trapecio"]; // trapecio superior visible desde el frente
  if (slug === "calves" && view === "front") return ["tibial_anterior"]; // tibial en vista frontal
  if (slug === "calves" && view !== "front") return ["pantorrillas"];
  return Object.entries(BODY_HIGHLIGHTER_SLUG_MAP).filter(([, s]) => s === slug).map(([k]) => k);
}
function getSlugsForOurGroup(ourKey) {
  if (ourKey === "trapecio") return ["trapezius", "neck"]; // back + front neck
  if (ourKey === "tibial_anterior") return ["calves_front_only"]; // señal especial para el useEffect
  if (ourKey === "pantorrillas") return ["calves", "left-soleus", "right-soleus"]; // solo vista trasera
  if (ourKey === "oblicuos") return ["obliques"];
  const slug = BODY_HIGHLIGHTER_SLUG_MAP[ourKey];
  if (!slug) return [];
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

// Mezcla un color hex con el color del cuerpo del muñeco (#334155)
// para reducir la saturación y bajar la intensidad visual sin cambiar
// los colores de los badges/cards de rango — 0.65 = 65% original, 35% fondo.
function muteHex(hex, amount = 0.65) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const br = 51, bg = 65, bb = 85; // body color #334155
  const nr = Math.round(r * amount + br * (1 - amount));
  const ng = Math.round(g * amount + bg * (1 - amount));
  const nb = Math.round(b * amount + bb * (1 - amount));
  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
}

function MuscleHighlighterBody({ ranks, selected, onMuscleClick, frontRef, backRef, rankMode = "general", pulseMuscles = null }) {
  // highlightedColors: versión suavizada de los colores de RANK_TIERS —
  // mezclada 65/35 con el fondo oscuro para que el muñeco no acapare
  // toda la atención visual de la pantalla.
  const highlightedColors = useMemo(() => RANK_TIERS.map((t) => muteHex(t.color, 0.72)), []);
  const data = useMemo(() => {
    const bestLevelBySlug = {};
    Object.entries(BODY_HIGHLIGHTER_SLUG_MAP).forEach(([ourKey, slug]) => {
      const lvl = ranks[ourKey]?.levelIdx ?? -1;
      if (lvl > (bestLevelBySlug[slug] ?? -1)) bestLevelBySlug[slug] = lvl;
    });
    // Trapecio pinta también el "neck" en la vista frontal
    if (bestLevelBySlug["trapezius"] != null) {
      bestLevelBySlug["neck"] = bestLevelBySlug["trapezius"];
    }
    // Tibial anterior: también usar calves (aparece en vista frontal y trasera,
    // pero el useEffect de abajo fuerza neutro en trasera)
    if (bestLevelBySlug["calves"] != null) {
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
    const keys = getOurGroupKeysForSlug(slug, view);
    if (!keys.length) return;
    const best = keys.reduce((a, b) => ((ranks[b]?.levelIdx ?? -1) > (ranks[a]?.levelIdx ?? -1) ? b : a));
    onMuscleClick(best);
  };

  // CARGA DE MÚSCULOS: cada músculo se enciende con un retraso proporcional a
  // su altura en el cuerpo — brilla fuerte un instante y se asienta en el
  // color de su rango, como si el cuerpo se fuera "cargando" de arriba hacia
  // abajo. Se dispara al abrir la pantalla Y cada vez que cambiás entre
  // "General" y "Según tu contexto", porque ahí todos los colores se
  // recalculan: la animación deja ver ese cambio en vez de que aparezca de
  // golpe.
  useEffect(() => {
    const limpiezas = [];
    const t = setTimeout(() => {
      [frontRef, backRef].forEach((ref) => {
        const svg = ref.current?.querySelector("svg");
        if (!svg) return;
        const polys = Array.from(svg.querySelectorAll("polygon"));
        if (!polys.length) return;
        // Posición vertical de cada músculo (su punto más alto)
        const conY = polys.map((p) => {
          const nums = (p.getAttribute("points") || "").split(/[\s,]+/).map(Number).filter((n) => !isNaN(n));
          const ys = nums.filter((_, i) => i % 2 === 1);
          return { p, y: ys.length ? Math.min(...ys) : 0 };
        });
        const minY = Math.min(...conY.map((c) => c.y));
        const maxY = Math.max(...conY.map((c) => c.y));
        const span = Math.max(1, maxY - minY);
        conY.forEach(({ p, y }) => {
          // El retraso es proporcional a qué tan abajo está: la carga tarda
          // ~700ms en recorrer el cuerpo entero.
          const delay = Math.round(((y - minY) / span) * 700);
          // Reiniciamos la animación antes de asignarla: sin esto, al cambiar
          // de modo el navegador ve la misma regla y no la vuelve a correr.
          p.style.animation = "none";
          void p.getBoundingClientRect();
          p.style.animation = `muscleCharge 0.55s cubic-bezier(0.33,1,0.68,1) ${delay}ms both`;
        });
        // Al terminar, limpiamos el estilo inline para no interferir con el
        // resaltado del músculo seleccionado ni con futuros repintados.
        const tc = setTimeout(() => { polys.forEach((p) => { p.style.animation = ""; }); }, 1400);
        limpiezas.push(tc);
      });
    }, 80);
    return () => { clearTimeout(t); limpiezas.forEach(clearTimeout); };
  }, [rankMode]);

  // LATIDO DE RANGO NUEVO: los músculos que subieron de rango desde la última
  // visita laten con brillo. Solo brillo (nada de escalar: un polygon SVG
  // escala desde el origen del SVG y se corre de lugar). Arranca a los 1550ms,
  // recién cuando la animación de carga ya terminó y limpió sus estilos.
  useEffect(() => {
    if (!pulseMuscles || !pulseMuscles.length) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    const timers = [];
    const t0 = setTimeout(() => {
      pulseMuscles.forEach((mk) => {
        const slugs = getSlugsForOurGroup(mk);
        const esTibial = mk === "tibial_anterior";
        const esPantorrillas = mk === "pantorrillas";
        [{ ref: frontRef, order: ANTERIOR_POLY_SLUGS, view: "front" }, { ref: backRef, order: POSTERIOR_POLY_SLUGS, view: "back" }].forEach(({ ref, order, view }) => {
          const svg = ref.current?.querySelector("svg");
          if (!svg) return;
          svg.querySelectorAll("polygon").forEach((p, i) => {
            const slug = order[i];
            let es;
            if (esTibial) es = view === "front" && slug === "calves";
            else if (esPantorrillas) es = view === "back" && (slug === "calves" || slug === "left-soleus" || slug === "right-soleus");
            else es = slugs.includes(slug);
            if (es) p.style.animation = "muscleGlowBeat 0.7s ease-in-out 3";
          });
        });
      });
      // Limpiar los estilos al terminar (3 latidos × 0.7s = 2.1s)
      const tc = setTimeout(() => {
        [frontRef, backRef].forEach((ref) => {
          const svg = ref.current?.querySelector("svg");
          if (!svg) return;
          svg.querySelectorAll("polygon").forEach((p) => { if (p.style.animation.includes("muscleGlowBeat")) p.style.animation = ""; });
        });
      }, 2300);
      timers.push(tc);
    }, 1550);
    timers.push(t0);
    return () => timers.forEach(clearTimeout);
  }, [pulseMuscles, frontRef, backRef]);

  // Resaltado con borde blanco: con los mismos índices exactos de arriba,
  // se prende SIEMPRE el músculo completo (todas sus piezas) y nunca uno
  // ajeno, sin importar si comparten color con otro músculo.
  useEffect(() => {
    const slugs = getSlugsForOurGroup(selected);
    const isTibial = selected === "tibial_anterior";
    const isPantorrillas = selected === "pantorrillas";
    [{ ref: frontRef, order: ANTERIOR_POLY_SLUGS, view: "front" }, { ref: backRef, order: POSTERIOR_POLY_SLUGS, view: "back" }].forEach(({ ref, order, view }) => {
      const svg = ref.current?.querySelector("svg");
      if (!svg) return;
      svg.querySelectorAll("polygon").forEach((p, i) => {
        const slug = order[i];
        let isSel;
        if (isTibial) {
          // tibial: solo el calves de la vista frontal
          isSel = view === "front" && slug === "calves";
        } else if (isPantorrillas) {
          // pantorrillas: calves y sóleos solo de la vista trasera
          isSel = view === "back" && (slug === "calves" || slug === "left-soleus" || slug === "right-soleus");
        } else {
          isSel = selected && slugs.includes(slug);
        }
        p.style.stroke = isSel ? "#f8fafc" : "none";
        p.style.strokeWidth = isSel ? "1.6" : "0";
        p.style.filter = isSel ? "drop-shadow(0 0 3px rgba(248,250,252,0.85))" : "none";
      });
    });
  }, [selected, data, frontRef, backRef]);

  // Post-procesado de colores por vista:
  // - calves en vista FRONTAL = tibial_anterior → pintar con su color de rango
  //   (o neutro si no tiene rango)
  // - calves en vista TRASERA = pantorrillas → ya lo maneja el data prop
  // - neck en vista TRASERA → forzar neutro (es parte del trapecio solo al frente)
  useEffect(() => {
    if (selected === "tibial_anterior") return; // el useEffect de selección ya lo maneja
    // Vista frontal: calves = tibial_anterior
    const frontSvg = frontRef.current?.querySelector("svg");
    if (frontSvg) {
      const tibialLvl = ranks.tibial_anterior?.levelIdx ?? -1;
      const tibialColor = tibialLvl >= 0 ? highlightedColors[tibialLvl] : "#334155";
      frontSvg.querySelectorAll("polygon").forEach((p, i) => {
        if (ANTERIOR_POLY_SLUGS[i] === "calves") p.style.fill = tibialColor;
      });
    }
    // Vista trasera: el neck no es trapecio desde atrás — forzar neutro
    const backSvg = backRef.current?.querySelector("svg");
    if (backSvg) {
      backSvg.querySelectorAll("polygon").forEach((p, i) => {
        if (POSTERIOR_POLY_SLUGS[i] === "neck") p.style.fill = "#334155";
      });
    }
  }, [data, selected, ranks, frontRef, backRef, highlightedColors]);

  return (
    <div className="flex gap-2 justify-center items-start">
      <div className="flex-1 min-w-0 max-w-[180px]">
        <div ref={frontRef} onClick={handlePolygonClick("front")} className="relative">
          <Model data={data} type="anterior" bodyColor="#334155" highlightedColors={highlightedColors} onClick={MODEL_NOOP_CLICK} style={MODEL_STYLE} svgStyle={MODEL_STYLE} />
        </div>
        <p className="text-center text-[10px] text-slate-600 mt-1">De frente</p>
      </div>
      <div className="flex-1 min-w-0 max-w-[180px]">
        <div ref={backRef} onClick={handlePolygonClick("back")} className="relative">
          <Model data={data} type="posterior" bodyColor="#334155" highlightedColors={highlightedColors} onClick={MODEL_NOOP_CLICK} style={MODEL_STYLE} svgStyle={MODEL_STYLE} />
        </div>
        <p className="text-center text-[10px] text-slate-600 mt-1">De espalda</p>
      </div>
    </div>
  );
}

function MuscleRankView({ logs, settings = DEFAULT_SETTINGS, onUpdateSettings, onGoToProfile, onGoToRoutines, sex, age }) {
  const [selected, setSelected] = useState(null);
  const [showImage, setShowImage] = useState(false);
  const [showTierRef, setShowTierRef] = useState(false); // modal de referencia de rangos
  const [showAnalysis, setShowAnalysis] = useState(false); // modal de análisis muscular
  // El gesto atrás de Android cierra este modal si está abierto
  const cerrarAnalisis = useCallback(() => setShowAnalysis(false), []);
  useAndroidBack(showAnalysis ? cerrarAnalisis : null);
  const [showGroupExercises, setShowGroupExercises] = useState(false); // ejercicios del grupo sin entrenar
  // Los otros modales de esta vista también congelan el fondo y responden al
  // botón atrás (mismo patrón que cerrarAnalisis, arriba).
  const cerrarTierRef = useCallback(() => setShowTierRef(false), []);
  const cerrarGroupEx = useCallback(() => setShowGroupExercises(false), []);
  useAndroidBack(showTierRef ? cerrarTierRef : null);
  useAndroidBack(showGroupExercises ? cerrarGroupEx : null);
  const detailRef = useRef(null); // la tarjeta de detalle, para el scroll automático
  const frontBodyRef = useRef(null);
  const backBodyRef = useRef(null);
  const mode = settings.muscleRankMode === "relative" ? "relative" : "general";
  // Músculos que subieron de rango desde la última visita: se consumen acá
  // (una sola vez, al montar) y laten en el muñeco.
  const [musculosQueSubieron] = useState(() => {
    const arr = [...RECENT_RANK_UPS];
    RECENT_RANK_UPS.clear();
    return arr.length ? arr : null;
  });
  const bodyWeightKg = settings.bodyWeightKg || 0;

  const ranks = useMemo(() => {
    const out = {};
    MUSCLE_GROUPS.forEach((g) => {
      const { best1RM, bestKg, bestReps, bestExerciseName, bestLoadFactor, bestWeight } = getBest1RMForMuscleGroup(g.key, logs, settings?.dumbbellDouble || null);
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

  // ANÁLISIS MUSCULAR: tus mejores, los que tenés que mejorar, y los que
  // no estás entrenando. Alimenta el modal del botón de análisis.
  const analysis = useMemo(() => {
    const withData = MUSCLE_GROUPS.map((g) => ({ key: g.key, label: g.label, r: ranks[g.key] })).filter((x) => x.r?.hasData);
    const sorted = withData.slice().sort((a, b) => b.r.levelIdx - a.r.levelIdx);
    const tops = sorted.slice(0, 3);
    const topKeys = new Set(tops.map((t) => t.key));
    const weak = sorted.slice().reverse().filter((x) => !topKeys.has(x.key)).slice(0, 3);
    const untrained = MUSCLE_GROUPS.filter((g) => !ranks[g.key]?.hasData);
    return { tops, weak, untrained, hasAny: withData.length > 0 };
  }, [ranks]);

  // Seleccionar un músculo (desde el muñeco o el análisis) y "redireccionar":
  // la tarjeta de detalle se centra sola en pantalla con una animación suave.
  const goToMuscle = (k) => {
    setSelected(k);
    setTimeout(() => {
      try {
        const el = detailRef.current;
        if (!el) return;
        // scrollIntoView movía TODOS los ancestros scrolleables — incluso
        // wrappers que no deben desplazarse — y al volver arriba el padding
        // del título "Rango por músculo" quedaba comido contra el borde.
        // Acá scrolleamos SOLO el contenedor scrolleable real (o la ventana),
        // centrando la tarjeta sin tocar nada más.
        let p = el.parentElement, scroller = null;
        while (p && p !== document.body) {
          const s = getComputedStyle(p);
          if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 4) { scroller = p; break; }
          p = p.parentElement;
        }
        const r = el.getBoundingClientRect();
        if (scroller) {
          const sr = scroller.getBoundingClientRect();
          scroller.scrollTo({ top: scroller.scrollTop + (r.top - sr.top) - (sr.height - r.height) / 2, behavior: "smooth" });
        } else {
          window.scrollTo({ top: window.scrollY + r.top - (window.innerHeight - r.height) / 2, behavior: "smooth" });
        }
      } catch { /* ignorado a propósito */ }
    }, 80);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-blue-500/25 shadow-lg shadow-blue-500/5 p-4 space-y-3" style={{ background: "var(--panel-grad-blue)" }}>
      {/* Glows decorativos de fondo */}
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
      <div className="relative flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/25 to-indigo-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0"><Award size={16} /></div>
          <div>
            <p className="text-sm font-black text-white">Rango por músculo</p>
            <p className="text-[9px] text-slate-500">Tocá un músculo para ver su detalle</p>
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button onClick={() => setShowAnalysis(true)} aria-label="Análisis muscular" className="p-2 rounded-xl bg-slate-800/60 text-slate-400 hover:text-teal-400 transition border border-slate-700/50"><BarChart3 size={15} /></button>
          <button onClick={() => setShowTierRef(true)} aria-label="Ver la escala de rangos" className="p-2 rounded-xl bg-slate-800/60 text-slate-400 hover:text-amber-400 transition border border-slate-700/50"><Trophy size={15} /></button>
          <button onClick={() => setShowImage(true)} aria-label="Compartir tus rangos" className="p-2 rounded-xl bg-slate-800/60 text-slate-400 hover:text-blue-400 transition border border-slate-700/50"><Share2 size={15} /></button>
        </div>
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

      <MuscleHighlighterBody ranks={ranks} selected={selected} onMuscleClick={goToMuscle} frontRef={frontBodyRef} backRef={backBodyRef} rankMode={mode} pulseMuscles={musculosQueSubieron} />

     {selInfo ? (
        <div key={selected} ref={detailRef} className="relative overflow-hidden rounded-3xl p-[1.5px] bounce-in" style={{ background: selInfo.hasData ? `linear-gradient(140deg, ${selInfo.color}55, transparent 45%, transparent 60%, ${selInfo.color}30)` : "var(--panel-sunken)" }}>
          <div className="relative overflow-hidden rounded-[calc(1.5rem-1.5px)] p-4" style={{ background: "var(--panel-grad-blue)" }}>
            {selInfo.hasData && (
              <>
                <div className="absolute -top-12 -right-10 w-44 h-44 rounded-full blur-3xl pointer-events-none opacity-25" style={{ backgroundColor: selInfo.color }} />
                <div className="absolute -bottom-16 -left-12 w-40 h-40 rounded-full blur-3xl pointer-events-none opacity-10" style={{ backgroundColor: selInfo.color }} />
              </>
            )}

            {/* Nombre del músculo como chip protagonista */}
            <div className="relative flex items-center justify-between gap-2 mb-3.5">
              <span className="text-[11px] font-black uppercase tracking-[0.18em] px-3 py-1.5 rounded-xl" style={selInfo.hasData ? { color: selInfo.color, backgroundColor: selInfo.color + "18", border: `1px solid ${selInfo.color}35` } : { color: "#64748b", backgroundColor: "#1e293b66", border: "1px solid #1e293b" }}>{selInfo.label}</span>
              {!selInfo.hasData && <span className="text-[11px] font-bold text-slate-500 px-2.5 py-1 rounded-lg bg-slate-800/60 shrink-0">Sin rango</span>}
            </div>

            {selInfo.hasData ? (
              <>
                {/* Badge + rango + marca en display grande */}
                <div className="relative flex items-center gap-4 mb-4">
                  <div className="shrink-0" style={{ filter: `drop-shadow(0 6px 18px ${selInfo.color}50)` }}>
                    <RankBadgeIcon tier={selInfo.tier} sub={selInfo.sub} color={selInfo.color} size={118} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-2xl font-black leading-none tracking-tight" style={{ color: selInfo.color, textShadow: `0 0 24px ${selInfo.color}40` }}>{selInfo.tier}{selInfo.sub ? ` ${selInfo.sub}` : ""}</p>
                    {selInfo.bestKg ? (
                      <>
                        <p className="mt-2 text-[26px] font-black text-white leading-none tabular-nums">{selInfo.bestReps}<span className="text-slate-500 text-lg font-bold mx-0.5">×</span>{selInfo.bestKg}<span className="text-slate-400 text-base font-bold ml-0.5">kg</span></p>
                        <p className="text-[10.5px] text-slate-500 mt-1.5 leading-snug">{selInfo.bestExerciseName ? <>en <span className="text-slate-300 font-bold">{selInfo.bestExerciseName}</span></> : "Tu mejor marca"}{selInfo.bestLoadFactor > 1 ? <span className="text-slate-600"> · ×2 mancuernas</span> : null}</p>
                      </>
                    ) : (
                      <p className="text-[11px] text-slate-500 mt-2 leading-snug">Estimado por ejercicios relacionados — todavía sin marca propia</p>
                    )}
                  </div>
                </div>

                {selInfo.nextThreshold ? (
                  <div className="relative bg-slate-900/70 border border-slate-800/60 rounded-2xl p-3.5 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-2.5 gap-2">
                      <span className="text-[9.5px] font-black text-slate-500 uppercase tracking-[0.14em]">Próximo rango</span>
                      <span className="flex items-center gap-1.5 text-[11px] font-black shrink-0" style={{ color: nextTierInfo?.color }}>
                        <RankBadgeIcon tier={nextTierInfo?.tier} sub="" color={nextTierInfo?.color} size={46} />
                        {nextTierInfo?.tier}{nextTierInfo?.sub ? ` ${nextTierInfo.sub}` : ""}
                      </span>
                    </div>
                    {(() => {
                      const pct = Math.min(100, Math.max(4, ((selInfo.best1RM - selInfo.threshold) / (selInfo.nextThreshold - selInfo.threshold)) * 100));
                      return (
                        <div className="relative h-3 bg-slate-800/80 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all grow-bar relative" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${selInfo.color}, ${nextTierInfo?.color || selInfo.color})`, boxShadow: `0 0 12px ${selInfo.color}70` }} />
                          <span className="absolute inset-0 flex items-center justify-center text-[8.5px] font-black text-white/90 tabular-nums" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>{Math.round(pct)}%</span>
                        </div>
                      );
                    })()}
                    {extraKgNeeded != null && (
                      <div className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2" style={{ backgroundColor: (nextTierInfo?.color || selInfo.color) + "14", border: `1px solid ${(nextTierInfo?.color || selInfo.color)}30` }}>
                        <TrendingUp size={13} style={{ color: nextTierInfo?.color || selInfo.color }} className="shrink-0" />
                        <p className="text-[11px] text-slate-300 leading-snug">Sumá <span className="font-black text-white">{extraKgNeeded}kg</span> a tus {selInfo.bestReps} reps y subís de rango</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative rounded-2xl px-3 py-3.5 text-center" style={{ background: `linear-gradient(135deg, ${selInfo.color}20, ${selInfo.color}08)`, border: `1px solid ${selInfo.color}40` }}>
                    <p className="text-sm font-black" style={{ color: selInfo.color }}>🏆 ¡Rango máximo alcanzado!</p>
                  </div>
                )}
              </>
            ) : (
              <div className="relative text-center py-1">
                <p className="text-[11px] text-slate-600 mb-3">Todavía no registraste marcas en este grupo.</p>
                <button onClick={() => setShowGroupExercises(true)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-black text-teal-400 bg-teal-500/10 border border-teal-500/30 transition active:scale-95">
                  <Dumbbell size={12} /> Ver ejercicios para {selInfo.label}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-center text-[11px] text-slate-600">Tocá un músculo entrenable para ver tu rango y tu mejor marca.</p>
      )}
      {/* Modal: ejercicios que trabajan un grupo SIN entrenar — el atajo
          para desbloquear su rango. Lista los ejercicios de la librería que
          apuntan a ese músculo y un botón directo a Rutinas para sumarlos. */}
      {showGroupExercises && selInfo && (
        <div className="fixed inset-0 z-[130] bg-black/75 backdrop-blur-sm flex items-center justify-center p-5 modal-bg-in modal-overlay" onClick={() => setShowGroupExercises(false)}>
          <div className="max-w-sm w-full max-h-[80vh] overflow-y-auto overscroll-contain bg-slate-900 border border-slate-700/60 rounded-3xl p-5 modal-pop-in shadow-2xl shadow-black/60" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Dumbbell size={15} className="text-teal-400" />
                <p className="text-sm font-black text-white">Ejercicios de {selInfo.label}</p>
              </div>
              <button onClick={() => setShowGroupExercises(false)} aria-label="Cerrar" className="p-1.5 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition"><X size={16} /></button>
            </div>
            <p className="text-[10.5px] text-slate-500 mb-3.5">Sumá alguno a tu rutina y este músculo desbloquea su rango.</p>
            {(() => {
              const groups = EXERCISE_LIBRARY_CONTRIBUTORS_BY_GROUP[selected] || {};
              const ids = [...(groups.primary?.keys() || []), ...(groups.always?.keys() || [])];
              const uniq = [...new Set(ids)];
              const list = uniq.map((id) => EXERCISE_LIBRARY_BY_ID[id]).filter(Boolean).slice(0, 10);
              if (!list.length) return <p className="text-[11px] text-slate-600 text-center py-3">No hay ejercicios de librería para este grupo.</p>;
              return (
                <div className="space-y-1.5 mb-4">
                  {list.map((ex) => (
                    <div key={ex.id} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 bg-slate-800/40 border border-slate-700/40">
                      <span className="flex-1 text-xs font-bold text-slate-200">{ex.name}</span>
                      <a href={yt(ex.name + " ejercicio")} target="_blank" rel="noreferrer" className="text-[9.5px] font-black text-rose-400 px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/25 shrink-0">▶ Ver</a>
                    </div>
                  ))}
                </div>
              );
            })()}
            <button onClick={() => { setShowGroupExercises(false); onGoToRoutines?.(); }} className="w-full py-3 rounded-2xl text-sm font-black !text-white transition active:scale-[0.98]" style={{ background: "linear-gradient(135deg, #14B8A6, #0E7490)" }}>
              Editar mi rutina y agregarlos →
            </button>
          </div>
        </div>
      )}

      {/* Modal de ANÁLISIS MUSCULAR: tus mejores, los que hay que mejorar
          y los que no estás entrenando. Cada fila es tocable: te lleva
          directo a la tarjeta de ese músculo. */}
      {showAnalysis && (
        <div className="fixed inset-0 z-[130] bg-black/75 backdrop-blur-sm flex items-center justify-center p-5 modal-bg-in modal-overlay" onClick={() => setShowAnalysis(false)}>
          <div className="max-w-sm w-full max-h-[85vh] overflow-y-auto overscroll-contain bg-slate-900 border border-slate-700/60 rounded-3xl p-5 modal-pop-in shadow-2xl shadow-black/60" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 size={15} className="text-teal-400" />
                <p className="text-sm font-black text-white">Análisis muscular</p>
              </div>
              <button onClick={() => setShowAnalysis(false)} aria-label="Cerrar" className="p-1.5 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition"><X size={16} /></button>
            </div>

            {!analysis.hasAny ? (
              <p className="text-[11px] text-slate-500 text-center py-4">Registrá tus primeras marcas y acá vas a ver tus fortalezas y pendientes.</p>
            ) : (
              <div className="space-y-4">
                {analysis.tops.length > 0 && (
                  <div>
                    <p className="text-[9.5px] font-black uppercase tracking-[0.15em] text-amber-400 mb-2 flex items-center gap-1.5"><Trophy size={11} /> Tus mejores</p>
                    <div className="space-y-1.5">
                      {analysis.tops.map((m) => (
                        <button key={m.key} onClick={() => { setShowAnalysis(false); goToMuscle(m.key); }} className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition active:scale-[0.98] text-left" style={{ backgroundColor: m.r.color + "12", border: `1px solid ${m.r.color}30` }}>
                          <RankBadgeIcon tier={m.r.tier} sub="" color={m.r.color} size={40} />
                          <span className="flex-1 text-xs font-bold text-slate-200">{m.label}</span>
                          <span className="text-[10.5px] font-black shrink-0" style={{ color: m.r.color }}>{m.r.tier}{m.r.sub ? ` ${m.r.sub}` : ""}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.weak.length > 0 && (
                  <div>
                    <p className="text-[9.5px] font-black uppercase tracking-[0.15em] text-orange-400 mb-2 flex items-center gap-1.5"><TrendingUp size={11} /> Para mejorar</p>
                    <div className="space-y-1.5">
                      {analysis.weak.map((m) => (
                        <button key={m.key} onClick={() => { setShowAnalysis(false); goToMuscle(m.key); }} className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 bg-slate-800/40 border border-slate-700/40 transition active:scale-[0.98] text-left">
                          <RankBadgeIcon tier={m.r.tier} sub="" color={m.r.color} size={40} />
                          <span className="flex-1 text-xs font-bold text-slate-300">{m.label}</span>
                          <span className="text-[10.5px] font-black shrink-0" style={{ color: m.r.color }}>{m.r.tier}{m.r.sub ? ` ${m.r.sub}` : ""}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.untrained.length > 0 && (
                  <div>
                    <p className="text-[9.5px] font-black uppercase tracking-[0.15em] text-slate-500 mb-2 flex items-center gap-1.5"><Moon size={11} /> Sin entrenar</p>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.untrained.map((g) => (
                        <button key={g.key} onClick={() => { setShowAnalysis(false); goToMuscle(g.key); }} className="text-[10px] font-bold text-slate-500 px-2.5 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/40 transition active:scale-95">{g.label}</button>
                      ))}
                    </div>
                    <p className="text-[9.5px] text-slate-600 mt-2">Sumá ejercicios de estos grupos a tu rutina para desbloquear su rango.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de referencia: la escala completa de rangos (se abre con el
          trofeo del header — antes ocupaba lugar fijo como "Ver todos los
          rangos"; ahora el espacio lo usa el carrusel con TUS rangos). */}
      {showTierRef && (
        <div className="fixed inset-0 z-[130] bg-black/75 backdrop-blur-sm flex items-center justify-center p-5 modal-bg-in modal-overlay" onClick={() => setShowTierRef(false)}>
          <div className="max-w-sm w-full bg-slate-900 border border-slate-700/60 rounded-3xl p-5 modal-pop-in shadow-2xl shadow-black/60" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Trophy size={15} className="text-amber-400" />
                <p className="text-sm font-black text-white">Escala de rangos</p>
              </div>
              <button onClick={() => setShowTierRef(false)} aria-label="Cerrar" className="p-1.5 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["Bronce", "Plata", "Oro", "Esmeralda", "Diamante", "Maestro"].map((t) => {
                const rep = RANK_TIERS.find((r) => r.tier === t && r.sub === "II") || RANK_TIERS.find((r) => r.tier === t);
                return (
                  <div key={t} className="flex flex-col items-center gap-2 rounded-xl py-3 bg-slate-800/40">
                    <RankBadgeIcon tier={rep.tier} sub="" color={rep.color} size={83} />
                    <span className="text-[10px] font-black" style={{ color: rep.color }}>{t}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-500 text-center mt-3">Cada rango tiene 3 niveles (III → I). Subís entrenando más pesado.</p>
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
  useAndroidBack(onClose);
  const [confirmDel, setConfirmDel] = useState(false);
  const dateLabel = new Date(photo.date + "T00:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="fixed inset-0 z-[140] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 modal-bg-in modal-overlay" onClick={onClose}>
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
  // Modo comparación de fotos: compareBase es el día de partida; con él
  // activo, el calendario espera que elijas OTRO día con foto y abre el
  // modal de comparación lado a lado.
  const [compareBase, setCompareBase] = useState(null);
  const [comparePair, setComparePair] = useState(null);
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
        <button onClick={handleAdd} disabled={!inputVal.trim()} className="px-4 py-2.5 rounded-xl !text-white text-sm font-bold disabled:opacity-40 transition-all active:scale-95" style={{ backgroundColor: "#A855F7" }}>Guardar</button>
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
          // Skeletons: formas que laten mientras llegan los datos. Se siente
          // más rápido que un "Cargando..." aunque tarde exactamente lo mismo,
          // porque ya ves la forma de lo que viene.
          <div className="space-y-2 py-2">
            <div className="skeleton h-16 w-full" />
            <div className="skeleton h-16 w-full" style={{ animationDelay: "0.15s" }} />
            <div className="skeleton h-16 w-3/4" style={{ animationDelay: "0.3s" }} />
          </div>
        ) : !hasAnyData ? (
          <p className="text-[11px] text-slate-600 text-center py-4">Todavía no registraste nada — agregá una medida arriba o una foto para empezar tu calendario.</p>
        ) : (
          <>
            {compareBase && (
              <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/25 bounce-in">
                <Camera size={13} className="text-rose-400 shrink-0" />
                <p className="text-[11px] text-rose-200 flex-1">Elegí <span className="font-bold">otro día con foto</span> para comparar</p>
                <button onClick={() => setCompareBase(null)} className="text-[10px] font-bold text-slate-400 px-2 py-1 rounded-lg bg-slate-800">Cancelar</button>
              </div>
            )}
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
                  const isCompareBase = compareBase && d === compareBase.date;
                  const compareSelectable = compareBase && hasPhoto && !isCompareBase;
                  return (
                    <button key={i}
                      onClick={() => {
                        if (compareBase) {
                          // Modo comparación: solo días con foto (distintos del base)
                          if (compareSelectable) {
                            setComparePair([compareBase, { date: d, entry }]);
                            setCompareBase(null);
                          }
                          return;
                        }
                        if (entry) setSelectedDate(isSelected ? null : d);
                      }}
                      disabled={compareBase ? !compareSelectable && !isCompareBase : !entry} style={bgStyle}
                      className={`relative aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-all ${isSelected && !compareBase ? "ring-2 ring-purple-400" : ""} ${isCompareBase ? "ring-2 ring-rose-400" : ""} ${compareSelectable ? "ring-1 ring-rose-400/60 animate-pulse" : ""} ${compareBase && !compareSelectable && !isCompareBase ? "opacity-30" : ""} ${isToday && !entry ? "border border-purple-500/50" : ""} ${entry ? "text-white hover:brightness-125 active:scale-95" : "text-slate-700"}`}>
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

            {!selectedEntry && !compareBase && <p className="text-center text-[11px] text-slate-600 py-2">Tocá un día con registro para ver el detalle.</p>}

            {/* Detalle del día como MODAL centrado — mismo tratamiento que
                el historial de entrenamientos */}
            {selectedEntry && (
              <div className="fixed inset-0 z-[140] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 modal-bg-in modal-overlay" onClick={() => setSelectedDate(null)}>
                <div className="max-w-md w-full max-h-[85vh] overflow-y-auto overscroll-contain rounded-3xl modal-pop-in border border-purple-500/30" style={{ background: "var(--panel-grad-slate)" }} onClick={(e) => e.stopPropagation()}>
                  <div className="relative px-4 pt-4 pb-3 overflow-hidden">
                    <div className="absolute -top-10 -right-8 w-36 h-36 rounded-full blur-3xl opacity-20 bg-purple-500 pointer-events-none" />
                    <button onClick={() => setSelectedDate(null)} aria-label="Cerrar" className="absolute top-3 right-3 z-10 p-2 rounded-xl bg-slate-800/90 text-slate-400 hover:text-white transition active:scale-90"><X size={15} /></button>
                    <div className="relative pr-10">
                      <p className="text-base font-black text-white capitalize leading-tight">{selectedDateLabel}</p>
                      {selectedEntry.photos.length > 0 && selectedEntry.weight != null && Object.keys(selectedEntry.measures).length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 mt-1"><Star size={11} className="fill-amber-400" /> Día completo</span>
                      )}
                    </div>
                  </div>
                  <div className="px-4 pb-4 space-y-3">
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
                        {/* Comparar: cierra este modal y activa el modo de
                            selección del segundo día en el calendario */}
                        <button onClick={() => { setCompareBase({ date: selectedDate, entry: selectedEntry }); setSelectedDate(null); }} className="w-full mt-3 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-rose-300 bg-rose-500/10 border border-rose-500/25 transition active:scale-[0.98]">
                          <Camera size={13} /> Comparar con otro día
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Modal de comparación: las dos fotos lado a lado con fecha y peso */}
            {comparePair && (() => {
              const [a, b] = comparePair[0].date <= comparePair[1].date ? comparePair : [comparePair[1], comparePair[0]];
              const fmt = (ds) => new Date(ds + "T00:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
              const diffDays = Math.round((new Date(b.date) - new Date(a.date)) / 86400000);
              const weightDiff = (a.entry.weight != null && b.entry.weight != null) ? Math.round((b.entry.weight - a.entry.weight) * 10) / 10 : null;
              return (
                <div className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 modal-bg-in modal-overlay" onClick={() => setComparePair(null)}>
                  <div className="max-w-lg w-full max-h-[90vh] overflow-y-auto overscroll-contain rounded-3xl modal-pop-in border border-rose-500/30 bg-slate-950" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-4 pt-4 pb-2">
                      <p className="text-sm font-black text-white flex items-center gap-2"><Camera size={15} className="text-rose-400" /> Tu comparación</p>
                      <button onClick={() => setComparePair(null)} aria-label="Cerrar" className="p-2 rounded-xl bg-slate-800/90 text-slate-400 hover:text-white transition active:scale-90"><X size={15} /></button>
                    </div>
                    <div className="px-3 pb-2 text-center">
                      <span className="text-[11px] font-bold text-rose-300">{diffDays} día{diffDays === 1 ? "" : "s"} de diferencia</span>
                      {weightDiff != null && weightDiff !== 0 && (
                        <span className={`ml-2 text-[11px] font-bold ${weightDiff < 0 ? "text-emerald-400" : "text-amber-400"}`}>{weightDiff > 0 ? "+" : ""}{weightDiff}kg</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 px-3 pb-4">
                      {[a, b].map((side, idx) => (
                        <div key={idx} className="space-y-1.5">
                          <div className="rounded-2xl overflow-hidden border border-slate-800 aspect-[3/4]">
                            <img src={side.entry.photos[0]?.dataUrl} alt={side.date} className="w-full h-full object-cover" />
                          </div>
                          <div className="text-center">
                            <p className="text-[11px] font-bold text-white">{fmt(side.date)}</p>
                            {side.entry.weight != null && <p className="text-[10px] text-slate-400">{side.entry.weight}kg</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
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

function ProgressView({ logs, sessions, cycleStart, settings = DEFAULT_SETTINGS, onResetAll, onDeleteDay, onUpdateSettings, onGoToProfile, onGoToRoutines, weekSchedule = null, sex, age, onGoToDeload, measurements, onAddMeasurement, photos, photosLoading, onAddPhoto, onDeletePhoto }) {
  const allExercises = useMemo(() => DAY_ORDER.flatMap((dk) => ROUTINE[dk].exercises.map((e) => ({ id: e.id, name: e.name, day: ROUTINE[dk].label, color: ROUTINE[dk].color, sets: e.sets.length, dayKey: dk }))), []);

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

      {/* Selector de sección — segmentado tipo pill con ícono, más liviano */}
      <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-slate-900/60 border border-slate-800/50">
        {PROGRESS_SECTIONS.map((s) => (
          <button key={s.k} onClick={() => setActiveSection(s.k)} className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[10px] font-bold transition-all active:scale-95"
            style={activeSection === s.k ? { background: s.color + "22", color: s.color, boxShadow: `inset 0 0 0 1px ${s.color}45` } : { color: "#64748b" }}>
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

        {activeSection === "rank" && <MuscleRankView logs={logs} settings={settings} onUpdateSettings={onUpdateSettings} onGoToProfile={onGoToProfile} onGoToRoutines={onGoToRoutines} sex={sex} age={age} />}

        {activeSection === "medidas" && (
          <MeasurementsView measurements={measurements} onAddMeasurement={onAddMeasurement} photos={photos} photosLoading={photosLoading} onAddPhoto={onAddPhoto} onDeletePhoto={onDeletePhoto} />
        )}

        {activeSection === "historial" && (
          <div className="rounded-2xl border border-cyan-500/20 bg-slate-900/50 shadow-md shadow-black/20 p-4">
            <SessionHistoryView logs={logs} onDeleteDay={onDeleteDay} trainingSessions={sessions} weekSchedule={weekSchedule} />
          </div>
        )}
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
    const mondayStr = localDateStr(monday), sundayStr = localDateStr(sunday);
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
function ExportTrainingCard({ profileName, logs, trainingSessions = [] }) {
  const allSessions = useMemo(() => buildSessionsIndex(logs, trainingSessions), [logs, trainingSessions]);
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
// Sección desplegable reutilizable para ProfileView
function CollapsibleSection({ title, subtitle, icon, defaultOpen = false, children, accent, forceOpenSignal = 0, sectionId = null }) {
  const [open, setOpen] = useState(defaultOpen);
  const selfRef = useRef(null);
  // Cuando forceOpenSignal cambia (lo incrementa un botón de otra pantalla),
  // esta sección se abre sola y hace scroll hasta quedar visible.
  useEffect(() => {
    if (forceOpenSignal <= 0) return;
    setOpen(true);
    // El timer se limpia al desmontar: sin esto, si cambiás de pantalla justo
    // después de abrir la sección, el scroll dispara sobre un nodo que ya no
    // existe (React tira warnings y el scroll salta a un lugar raro).
    const t = setTimeout(() => { try { selfRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { /* ignorado a propósito */ } }, 120);
    return () => clearTimeout(t);
  }, [forceOpenSignal]);
  return (
    <div ref={selfRef} id={sectionId || undefined} className="bg-slate-900/50 border border-slate-800/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-md shadow-black/20">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-800/30 active:bg-slate-800/50">
        {icon && <span className="shrink-0" style={{ color: accent || "var(--chip-text)" }}>{icon}</span>}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">{title}</p>
          {subtitle && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{subtitle}</p>}
        </div>
        <ChevronDown size={16} className={`text-slate-600 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4 pt-1 space-y-3.5 border-t border-slate-800/50">{children}</div>}
    </div>
  );
}

function ProfileView({ profileName, profiles, logs, onSignOut, onDelete, onUpdateProfile, cycleStart, onSetCycleStart, onGoToRoutines, openSectionSignal = { id: null, n: 0 }, onOpenFieldPreview = null }) {
  const profile = profiles[profileName];
  const [showDeletePin, setShowDeletePin] = useState(false); const [deleteError, setDeleteError] = useState("");
  const [editing, setEditing] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [editMail, setEditMail] = useState(profile?.email || "");
  const [editSex, setEditSex] = useState(profile?.sex || "");
  const [editAge, setEditAge] = useState(profile?.age ? String(profile.age) : "");
  const [editHeight, setEditHeight] = useState(profile?.heightCm ? String(profile.heightCm) : "");
  const [showCycleSetup, setShowCycleSetup] = useState(false);
  const [googleLinkError, setGoogleLinkError] = useState("");
  const [syncStatus, setSyncStatus] = useState(null); // null | "syncing" | "ok" | "error"
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

  // Foto de perfil. Se guarda comprimida (~256px) en DOS lugares: en el
  // perfil (campo avatarData → se SINCRONIZA a Firebase, así aparece en
  // cualquier dispositivo) y en IndexedDB (para carga instantánea local sin
  // esperar la nube). Antes solo iba a IndexedDB, por eso no aparecía al
  // entrar desde otro dispositivo ni desde la web.
  const [avatarUrl, setAvatarUrl] = useState(null);
  const avatarInputRef = useRef(null);

  useEffect(() => {
    // Prioridad: lo que vino sincronizado en el perfil; si no, IndexedDB local.
    // (La migración de fotos viejas de IndexedDB → perfil corre a nivel App,
    // apenas se abre la app, así no depende de visitar esta pestaña.)
    if (profile?.avatarData) {
      setAvatarUrl(profile.avatarData);
      // Espejamos a IndexedDB para que HeaderAvatar y SideNav (que leen de
      // IndexedDB) también la muestren al entrar desde otro dispositivo.
      idbPut(`avatar_${profileName}`, profile.avatarData).catch(() => {});
      return;
    }
    idbGet(`avatar_${profileName}`).then((data) => { if (data) setAvatarUrl(data); }).catch(() => {});
  }, [profileName, profile?.avatarData]);

  // Comprime la imagen elegida (File) leyéndola como dataURL y pasándola por
  // la misma compresión de arriba — una sola lógica para todo.
  const compressAvatar = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => compressAvatarDataUrl(ev.target.result).then(resolve).catch(reject);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressAvatar(file);
      setAvatarUrl(dataUrl);
      idbPut(`avatar_${profileName}`, dataUrl).catch(() => {});
      if (onUpdateProfile) onUpdateProfile({ avatarData: dataUrl }); // → se sincroniza
      window.dispatchEvent(new Event("modusfit-avatar-updated"));
    } catch { /* imagen inválida: no hacer nada */ }
  };

  const handleAvatarRemove = () => {
    setAvatarUrl(null);
    idbDelete(`avatar_${profileName}`).catch(() => {});
    if (onUpdateProfile) onUpdateProfile({ avatarData: null }); // → se sincroniza el borrado
    window.dispatchEvent(new Event("modusfit-avatar-updated"));
  };

  const handleAvatarClick = () => {
    // En Android moderno (13+) el Photo Picker nativo no requiere permiso
    // explícito — el sistema gestiona el acceso directo al selector.
    avatarInputRef.current?.click();
  };

  // Sync manual — sube TODO el perfil a Firestore ahora mismo, sin esperar
  // el debounce automático. Imprescindible para la primera vez que tenés
  // datos locales (historial, récords, sesiones) que nunca se subieron.
  const handleManualSync = async () => {
    if (!profile?.googleUid) return;
    setSyncStatus("syncing");
    try {
      await syncProfileToCloud(profile.googleUid, {
        ...profile,
        name: profileName,
        cycleStart: cycleStart?.toISOString() ?? null,
      }, true); // requireAuth=true — el botón manual sí necesita saber si falló
      setSyncStatus("ok");
      setTimeout(() => setSyncStatus(null), 3000);
    } catch (err) {
      setSyncStatus(err?.message === "NO_AUTH" ? "no_auth" : "error");
      setTimeout(() => setSyncStatus(null), 6000);
    }
  };

  // Sexo/edad son datos personales (igual que el email), así que viven
  // junto al resto del perfil. El peso corporal se sacó de acá — ahora se
  // registra con su propio historial en Progreso → Medidas (junto con
  // cintura, pecho, brazo, pierna), y cada medición nueva de peso
  // actualiza settings.bodyWeightKg por detrás para que el rango "Según
  // tu contexto" siga funcionando sin tener que tocar nada más.
  const handleSaveProfile = () => {
    const updates = { email: editMail, sex: editSex || null, age: editAge ? parseInt(editAge, 10) : null, heightCm: editHeight ? parseInt(editHeight, 10) : null };
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
        <div className="relative w-20 h-20 mx-auto mb-3 elastic-in">
          {avatarUrl
            ? <img src={avatarUrl} alt="Foto de perfil" className="w-20 h-20 rounded-3xl object-cover" />
            : <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-3xl font-black !text-white" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)" }}>{initial}</div>
          }
          <button onClick={handleAvatarClick} className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700 transition active:scale-90" title="Cambiar foto de perfil">
            <Camera size={14} className="text-teal-400" />
          </button>
          {avatarUrl && (
            <button onClick={handleAvatarRemove} className="absolute -bottom-1.5 -left-1.5 w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-red-900/40 transition active:scale-90" title="Quitar foto de perfil">
              <X size={14} className="text-red-400" />
            </button>
          )}
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>
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
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Edad</label>
              <input type="number" inputMode="numeric" value={editAge} onChange={(e) => setEditAge(e.target.value)} placeholder="Años" className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-3 text-white text-sm focus:outline-none" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Altura</label>
              <input type="number" inputMode="numeric" value={editHeight} onChange={(e) => setEditHeight(e.target.value)} placeholder="cm" className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-3 text-white text-sm focus:outline-none" />
            </div>
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
        <div className="space-y-2">
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-sm font-medium">
            <Check size={14} className="shrink-0" /> Vinculado con Google
          </div>
          <button onClick={handleManualSync} disabled={syncStatus === "syncing"} className={`w-full flex items-center gap-2 justify-center py-2.5 rounded-2xl border text-xs font-bold transition-all active:scale-[0.98] ${syncStatus === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : syncStatus === "error" || syncStatus === "no_auth" ? "border-rose-500/40 bg-rose-500/10 text-rose-400" : syncStatus === "syncing" ? "border-slate-700 text-slate-500" : "border-slate-700 text-slate-400 hover:border-teal-500/40 hover:text-teal-400"}`}>
            {syncStatus === "syncing" ? <><RefreshCw size={12} className="animate-spin" /> Subiendo datos...</>
              : syncStatus === "ok" ? <><Check size={12} /> Datos subidos a la nube</>
              : syncStatus === "no_auth" ? "Salí y volvé a entrar con Google primero"
              : syncStatus === "error" ? "Error al subir — verificá tu conexión"
              : <><Upload size={12} /> Subir mis datos a la nube ahora</>}
          </button>
          <p className="text-[10px] text-slate-600 text-center">Tocá este botón desde cada dispositivo antes de cambiar de celular o reinstalar.</p>
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
          <input type="date" className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-3 text-white text-sm focus:outline-none" defaultValue={cycleStart ? localDateStr(new Date(cycleStart)) : todayStr()} id="cycle-date-input" />
          <div className="flex gap-2">
            <button onClick={() => setShowCycleSetup(false)} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-semibold">Cancelar</button>
            <button onClick={() => { const val = document.getElementById("cycle-date-input").value; if (val) { onSetCycleStart(new Date(val)); setShowCycleSetup(false); } }} className="flex-1 py-3 rounded-xl bg-teal-500 !text-white text-sm font-bold">Guardar</button>
          </div>
        </div>
      )}

      <CollapsibleSection title="Configuración de descarga" subtitle={`Ciclo ${settings.trainWeeks}+${settings.deloadWeeks} sem · Carga ${Math.round(settings.deloadPct * 100)}%`} icon={<Zap size={16} />} accent="#A855F7">
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
      </CollapsibleSection>

      <CollapsibleSection title="Descanso entre series" subtitle={`${formatTime(settings.restShort)} – ${formatTime(settings.restLong)}`} icon={<Timer size={16} />} accent="#14B8A6">
        <div><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Aviso al terminar</p><div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">{[{ k: "sound", l: "Sonido" }, { k: "vibration", l: "Vibración" }, { k: "both", l: "Ambos" }].map((opt) => <button key={opt.k} onClick={() => updateSettings({ alertType: opt.k })} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${settings.alertType === opt.k ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>)}</div></div>
        <div className="grid grid-cols-2 gap-3">
          {[{ key: "restLong", label: "Ejercicios pesados" }, { key: "restShort", label: "Resto" }].map(({ key, label }) => (
            <div key={key} className="bg-slate-950/40 rounded-xl p-3"><p className="text-[10px] text-slate-500 mb-2">{label}</p><div className="flex items-center justify-between"><button onClick={() => adjustRest(key, -15)} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 active:scale-95">−</button><span className="text-sm font-black text-white tabular-nums">{formatTime(settings[key])}</span><button onClick={() => adjustRest(key, 15)} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 active:scale-95">+</button></div></div>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection sectionId="field-settings-section" forceOpenSignal={openSectionSignal.id === "field-settings-section" ? openSectionSignal.n : 0} title="Qué ves al registrar" subtitle={(() => { const on = [settings.showRpe !== false, settings.showWarmup !== false, settings.show1RMPercent !== false, settings.showCoaching !== false, settings.showExerciseNote !== false, settings.showPersonalNote !== false].filter(Boolean).length; return on === 6 ? "Todo activado" : `${on} de 6 opciones activadas`; })()} icon={<Sliders size={16} />} accent="#14B8A6">
        <div className="space-y-2">
          <p className="text-[10px] text-slate-500 leading-snug mb-1">Apagá lo que no uses y la ficha de registro queda más limpia. No se pierde ningún dato: podés volver a prenderlo cuando quieras.</p>
          {/* Recomendación: con las 6 prendidas la ficha se satura. */}
          <div className="flex items-start gap-2 rounded-xl px-2.5 py-2 mb-1" style={{ backgroundColor: "rgba(20,184,166,0.10)", border: "1px solid rgba(20,184,166,0.25)" }}>
            <Info size={12} className="text-teal-400 mt-0.5 shrink-0" />
            <p className="text-[10px] text-teal-200/90 leading-snug"><span className="font-black">Recomendado:</span> dejá prendido solo lo que uses. Con todo activado la ficha se llena de botones y cuesta encontrar lo importante.</p>
          </div>
          {/* Abre el modal con vista previa en vivo: los cambios se ven al
              instante sobre una ficha de ejemplo. */}
          {onOpenFieldPreview && (
            <button onClick={onOpenFieldPreview} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-bold transition active:scale-[0.98] mb-1" style={{ backgroundColor: "rgba(20,184,166,0.12)", color: "#2dd4bf", border: "1px solid rgba(20,184,166,0.3)" }}>
              <Eye size={13} /> Ver cambios en tiempo real
            </button>
          )}
          {[
            { key: "showWarmup", label: "Calentamiento sugerido", desc: "La rampa de series previas (50% → 70% → 85%)." },
            { key: "showRpe", label: "Esfuerzo (RPE)", desc: "El botón para registrar qué tan duro fue." },
            { key: "show1RMPercent", label: "Porcentaje de 1RM", desc: "A qué % de tu récord estás levantando." },
            { key: "showCoaching", label: "Consejos al guardar", desc: "El mensaje 📈/✓/📉 comparando con tu marca." },
            { key: "showExerciseNote", label: "Consejos del ejercicio", desc: "La nota con la técnica debajo del nombre del ejercicio." },
            { key: "showPersonalNote", label: "Notas por serie", desc: "El botón para escribir un recordatorio en cada serie." },
          ].map(({ key, label, desc }) => {
            const on = settings[key] !== false;
            return (
              <button key={key} onClick={() => updateSettings({ [key]: !on })} className="w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 transition active:scale-[0.99]" style={on ? { backgroundColor: "#14B8A614", border: "1px solid #14B8A640" } : { backgroundColor: "var(--row-surface)", border: "1px solid #33415580" }}>
                <div className="text-left min-w-0">
                  <p className="text-xs font-bold" style={{ color: on ? "#2DD4BF" : "#94a3b8" }}>{label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{desc}</p>
                </div>
                <span className="w-11 h-6 rounded-full shrink-0 relative transition-colors" style={{ backgroundColor: on ? "#14B8A6" : "var(--surface-2)" }}>
                  <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: on ? "22px" : "2px" }} />
                </span>
              </button>
            );
          })}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Recordatorio de entrenamiento" subtitle={settings.reminderEnabled ? `Todos los días de rutina a las ${settings.reminderTime}` : "Desactivado"} icon={<Bell size={16} />} accent="#F59E0B">
        <div className="space-y-3">
          <button onClick={() => updateSettings({ reminderEnabled: !settings.reminderEnabled })} className="w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 transition active:scale-[0.99]" style={settings.reminderEnabled ? { backgroundColor: "#F59E0B14", border: "1px solid #F59E0B40" } : { backgroundColor: "var(--row-surface)", border: "1px solid #33415580" }}>
            <div className="text-left min-w-0">
              <p className="text-xs font-bold" style={{ color: settings.reminderEnabled ? "#FBBF24" : "#94a3b8" }}>Avisarme los días que entreno</p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">Solo los días con rutina en tu agenda semanal — los de descanso no molestan.</p>
            </div>
            <span className="w-11 h-6 rounded-full shrink-0 relative transition-colors" style={{ backgroundColor: settings.reminderEnabled ? "#F59E0B" : "var(--surface-2)" }}>
              <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: settings.reminderEnabled ? "22px" : "2px" }} />
            </span>
          </button>
          {settings.reminderEnabled && (
            <div className="bounce-in">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Hora del aviso</p>
              <input type="time" value={settings.reminderTime || "18:00"} onChange={(e) => updateSettings({ reminderTime: e.target.value })} className="w-full bg-slate-950/60 border border-slate-800/60 rounded-xl px-3.5 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-amber-500/50 transition" />
              <p className="text-[10px] text-slate-600 mt-2">Si hoy ya pasó esa hora, el primer aviso llega el próximo día de rutina.</p>
            </div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Apariencia y accesibilidad" subtitle="Tema, unidad de peso, tamaño de letra" icon={<Sun size={16} />} accent="#F59E0B">
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Tema</p>
          <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">
            {[{ k: "dark", l: "Oscuro", icon: <Moon size={13} /> }, { k: "light", l: "Claro", icon: <Sun size={13} /> }].map((opt) => (
              <button key={opt.k} onClick={() => updateSettings({ theme: opt.k })} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${settings.theme === opt.k ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.icon} {opt.l}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Unidad de peso</p>
          <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">
            {[{ k: "kg", l: "Kilogramos (kg)" }, { k: "lbs", l: "Libras (lbs)" }].map((opt) => (
              <button key={opt.k} onClick={() => updateSettings({ weightUnit: opt.k })} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${settings.weightUnit === opt.k || (!settings.weightUnit && opt.k === "kg") ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Tamaño de letra</p>
          <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">
            {TEXT_SCALE_OPTIONS.map((opt) => (
              <button key={opt.k} onClick={() => updateSettings({ textScale: opt.v })} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${(settings.textScale ?? 1) === opt.v ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Letras chicas</p>
          <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">
            {SMALL_TEXT_SCALE_OPTIONS.map((opt) => (
              <button key={opt.k} onClick={() => updateSettings({ smallTextScale: opt.v })} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${(settings.smallTextScale ?? 1) === opt.v ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Zoom con los dedos</p>
          <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">
            {[{ v: false, l: "Desactivado" }, { v: true, l: "Activado" }].map((opt) => (
              <button key={String(opt.v)} onClick={() => updateSettings({ allowZoom: opt.v })} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${(settings.allowZoom ?? false) === opt.v ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>
            ))}
          </div>
        </div>
      </CollapsibleSection>

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

      {showPrivacy && (
        <div className="fixed inset-0 z-[200] flex flex-col modal-overlay" style={{ background: "var(--app-bg)", paddingTop: "env(safe-area-inset-top,0px)" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/60 shrink-0">
            <div className="flex items-center gap-2.5">
              <Info size={16} className="text-teal-400" />
              <span className="text-sm font-bold text-white">Política de privacidad</span>
            </div>
            <button onClick={() => setShowPrivacy(false)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition active:scale-90"><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-5 text-slate-400 text-[13px] leading-relaxed">
            <p className="text-[11px] text-slate-600">Última actualización: julio de 2026</p>
            <p>Modus Fit respeta tu privacidad. Esta política explica qué datos recopilamos, cómo los usamos y cuáles son tus derechos.</p>
            {[
              { t: "1. Datos que recopilamos", b: "Datos de entrenamiento (series, pesos, récords), datos de perfil (nombre, email, sexo, edad, altura), medidas corporales y fotos de progreso (solo en tu dispositivo), y datos de cuenta Google si iniciás sesión con Google." },
              { t: "2. Cómo usamos los datos", b: "Para mostrarte tu historial, récords y progreso. Para sincronizar tu perfil entre dispositivos si iniciaste sesión con Google. Para generar recomendaciones del Entrenador IA (el texto se envía a la API de Google Gemini y no se almacena en nuestros servidores). Para mostrar anuncios relevantes a través de Google AdMob (solo en la versión gratuita)." },
              { t: "3. Almacenamiento y seguridad", b: "Tus datos se guardan localmente en tu dispositivo (IndexedDB/localStorage). Si usás la sincronización, se almacenan en Firebase Firestore con acceso restringido a tu cuenta. Las fotos nunca se transmiten a ningún servidor. Toda comunicación usa HTTPS." },
              { t: "4. Terceros", b: "Usamos Google Firebase (autenticación y base de datos), Google Gemini API (IA), y Google AdMob (anuncios en la versión gratuita). Cada uno tiene su propia política de privacidad." },
              { t: "5. Anuncios y versión Pro", b: "La versión gratuita muestra anuncios de AdMob en momentos específicos. La versión Pro ($4.99 pago único) elimina todos los anuncios. Podés inhabilitar la personalización de anuncios en Ajustes → Google → Anuncios de tu dispositivo." },
              { t: "6. Retención de datos", b: "Los datos locales permanecen hasta que desinstalás la app o eliminás tu perfil. Los datos en la nube se eliminan cuando eliminás tu perfil desde la app." },
              { t: "7. Menores de edad", b: "Modus Fit no está dirigida a menores de 13 años y no recopilamos intencionalmente sus datos." },
              { t: "8. Tus derechos", b: "Podés acceder, corregir o eliminar tus datos desde la configuración de la app en cualquier momento." },
              { t: "9. Contacto", b: "Para preguntas sobre privacidad o solicitudes de eliminación de datos: deolmosagustin@gmail.com" },
            ].map(({ t, b }) => (
              <div key={t}>
                <p className="text-white font-bold mb-1" style={{ color: "#14B8A6" }}>{t}</p>
                <p>{b}</p>
              </div>
            ))}
            <p className="text-[11px] text-slate-600 pt-2">© 2026 Modus Fit. Todos los derechos reservados.</p>
          </div>
        </div>
      )}

      <button onClick={() => setShowPrivacy(true)} className="w-full flex items-center gap-2 justify-center py-3 rounded-2xl text-slate-500 hover:text-slate-300 transition text-xs font-semibold">
        <Info size={13} /> Política de privacidad
      </button>

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
// Cuando te comparten una rutina por enlace, este modal te la muestra y te
// pregunta si querés agregarla a las tuyas.
function SharedRoutineImportModal({ routine, onImport, onDiscard }) {
  useAndroidBack(onDiscard);
  if (!routine) return null;
  return (
    <div className="fixed inset-0 z-[125] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 modal-bg-in modal-overlay" onClick={onDiscard}>
      <div className="w-full max-w-md max-h-[86vh] overflow-y-auto overscroll-contain bg-slate-900 border border-slate-700/60 rounded-3xl modal-pop-in shadow-2xl shadow-black/70" onClick={(e) => e.stopPropagation()}>
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-500/30 text-teal-300 flex items-center justify-center shrink-0">
              <Share2 size={17} />
            </div>
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
    </div>
  );
}

// Resumen de una rutina al expandirla. Antes los ejercicios iban todos en una
// línea corrida separados por puntos ("Press · Vuelos · Fondos · Curl · …"),
// que a partir del cuarto se vuelve ilegible. Ahora cada día es una tarjeta con
// su franja de color y los ejercicios listados con sus series, que es lo que
// realmente querés ver.
function RoutinePreview({ routineDef }) {
  const model = useMemo(() => buildRoutineModel(routineDef), [routineDef]);
  return (
    <div className="space-y-2">
      {model.dayOrder.map((dk) => {
        const d = model.days[dk];
        const totalSets = d.exercises.reduce((a, e) => a + e.sets.length, 0);
        return (
          <div key={dk} className="rounded-xl border border-slate-800/60 bg-slate-950/40 overflow-hidden">
            {/* Cabecera del día: franja de color + nombre + números */}
            <div className="flex items-center gap-2.5 px-3 py-2 border-b border-slate-800/50" style={{ backgroundColor: d.color + "0c" }}>
              <span className="w-1 h-6 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-[11px] font-black text-white uppercase tracking-wide flex-1 min-w-0 truncate">{d.label}</span>
              <span className="text-[9px] text-slate-500 shrink-0 tabular-nums">{d.exercises.length} ejerc. · {totalSets} series</span>
            </div>

            {/* Ejercicios: uno por línea, con sus series a la derecha */}
            {d.exercises.length > 0 ? (
              <div className="px-3 py-2 space-y-1">
                {d.exercises.map((ex, i) => (
                  <div key={`${dk}:${ex.id}:${i}`} className="flex items-baseline gap-2 text-[10.5px]">
                    <span className="text-slate-700 tabular-nums w-3 shrink-0 text-right">{i + 1}</span>
                    <span className="flex-1 min-w-0 truncate text-slate-400">{ex.name}</span>
                    <span className="text-slate-600 tabular-nums shrink-0">
                      {ex.sets.length}{ex.sets[0]?.repRange ? `×${ex.sets[0].repRange}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-3 py-2 text-[10px] text-slate-600 italic">Sin ejercicios.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Frecuencia sugerida de cada rutina preestablecida: cuántos días por semana
// pide. Es el dato práctico que te falta para elegir; el "nivel" era una
// etiqueta que encasillaba sin aportar.
const PRESET_CONTEXTO = {
  classic_default: { frecuencia: "4 días/semana" },
  ppl:             { frecuencia: "3-6 días/semana" },
  upper_lower:     { frecuencia: "4 días/semana" },
  arnold:          { frecuencia: "3-6 días/semana" },
  bro_split:       { frecuencia: "5 días/semana" },
  fullbody:        { frecuencia: "3 días/semana" },
};
function PresetRoutineCard({ preset, isActive, onPreview }) {
  const dayCount = preset.dayOrder.length;
  const ctx = PRESET_CONTEXTO[preset.id] || null;
  const accent = "#A855F7"; // violeta fijo — esta tarjeta es de Rutinas, no del día
  // Pulso al activar: solo en el momento exacto en que pasa a ser la activa.
  const [recienActivada, setRecienActivada] = useState(false);
  const antesActivaRef = useRef(isActive);
  useEffect(() => {
    if (isActive && !antesActivaRef.current) {
      setRecienActivada(true);
      const t = setTimeout(() => setRecienActivada(false), 900);
      antesActivaRef.current = isActive;
      return () => clearTimeout(t);
    }
    antesActivaRef.current = isActive;
  }, [isActive]);
  return (
    <div
      className={`bg-slate-900/50 border rounded-2xl overflow-hidden backdrop-blur-sm shadow-md shadow-black/20 transition-all hover:shadow-lg hover:shadow-black/30 ${recienActivada ? "activate-pulse" : ""}`}
      style={{ borderColor: isActive ? accent + "60" : "rgba(30,41,59,0.5)", "--pulse-color": accent + "99" }}
    >
      {/* Tocar la tarjeta abre el POP-UP con todo (días, ejercicios, balance
          y el botón de usar). Antes se expandía inline mostrando lo mismo que
          el pop-up: información duplicada y más toques para cerrar todo. */}
      <button onClick={onPreview} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-800/30 transition active:opacity-80">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: accent + "1c", color: accent }}>
          <Layers size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-white truncate">{preset.name}</h4>
            {isActive && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-lg bg-purple-500/20 text-purple-400 shrink-0 badge-pop">ACTIVA</span>}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{preset.description}</p>
          <p className="text-[10px] text-slate-600 mt-1.5">{ctx?.frecuencia || `${dayCount} día${dayCount === 1 ? "" : "s"}/semana`}</p>
        </div>
        <ChevronRight size={15} className="text-slate-600 shrink-0" />
      </button>
    </div>
  );
}

function SavedRoutineRow({ routine, isActive, onUse, onEdit, onShare, onArchive, onPreview, uso = null }) {
  const dayCount = routine.dayOrder.length;
  const accent = isActive ? "#14B8A6" : "#6366F1"; // teal si activa, indigo si no
  return (
    <SwipeToArchive confirmText={`¿Quitar "${routine.name}" de tus rutinas? No se borra nada.`} onArchive={onArchive}>
      <div className={`stagger-item smooth-card rounded-2xl px-4 py-3.5 backdrop-blur-sm shadow-md transition-shadow hover:shadow-lg ${isActive ? "border-2" : "border border-slate-800/50 bg-slate-900/50"}`}
        style={isActive ? { borderColor: accent + "60", background: `linear-gradient(135deg, ${accent}12, var(--panel-sunken))`, boxShadow: `0 4px 20px -4px ${accent}25` } : {}}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-10 rounded-full shrink-0" style={{ backgroundColor: accent, boxShadow: `0 0 10px -2px ${accent}` }} />
          {/* Tocar la rutina abre el POP-UP completo directamente: antes había
              una expansión inline que mostraba lo mismo que el pop-up, dos
              veces. Ahora todo vive en un solo lugar, mejor diseñado. */}
          <button onClick={onPreview} className="flex-1 min-w-0 text-left active:opacity-70 transition-opacity">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-white truncate">{routine.name}</p>
              {isActive && <span className="text-[9px] font-black px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: accent + "25", color: accent, border: `1px solid ${accent}40` }}>ACTIVA</span>}
            </div>
            <p className="text-[11px] text-slate-500">
              {dayCount} día{dayCount !== 1 ? "s" : ""}
              {uso?.sesiones > 0 ? (
                <span className="text-slate-600"> · {uso.sesiones} sesion{uso.sesiones !== 1 ? "es" : ""} · {haceCuanto(uso.diasDesde)}</span>
              ) : (
                <span className="text-slate-600"> · sin usar</span>
              )}
            </p>
          </button>
          {!isActive && <button onClick={onUse} className="px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition" style={{ backgroundColor: accent + "18", color: accent }}>Activar</button>}
          <button onClick={onShare} aria-label="Compartir" className="p-2 rounded-lg text-slate-500 hover:text-cyan-400 shrink-0"><Share2 size={14} /></button>
          <button onClick={onEdit} aria-label="Editar" className="p-2 rounded-lg text-slate-500 hover:text-indigo-400 shrink-0"><Edit3 size={14} /></button>
        </div>
      </div>
    </SwipeToArchive>
  );
}

function ExercisePickerPanel({ existingIds, onAdd, onAddCustom, onClose }) {
  const [group, setGroup] = useState(MUSCLE_GROUPS[0].key);
  const [search, setSearch] = useState("");
  const [customName, setCustomName] = useState("");
  // Músculo del ejercicio personalizado — por defecto el grupo activo en el picker
  const [customMuscle, setCustomMuscle] = useState(MUSCLE_GROUPS[0].key);
  const pool = search.trim()
    ? EXERCISE_LIBRARY.filter((e) => e.name.toLowerCase().includes(search.trim().toLowerCase()))
    : EXERCISE_LIBRARY_BY_GROUP[group];

  return (
    <div className="mt-2.5 bg-slate-950/60 border border-slate-800/60 rounded-2xl p-3 bounce-in">
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar ejercicio…" className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mb-2 focus:outline-none focus:border-teal-500/50" />
      <p className="text-[9px] text-slate-600 mb-2 px-0.5 flex items-center gap-1">
        <Layers size={9} className="shrink-0" /> Podés combinar dos ejercicios en superserie tocando <span className="text-teal-600 font-bold">⟨S⟩</span> en la lista de ejercicios.
      </p>
      {!search.trim() && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
          {MUSCLE_GROUPS.map((g) => (
            <button key={g.key} onClick={() => { setGroup(g.key); setCustomMuscle(g.key); }} className="px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all border shrink-0"
              style={group === g.key ? { backgroundColor: g.color + "22", borderColor: g.color + "55", color: g.color } : { borderColor: "var(--chip-border)", color: "var(--chip-text)" }}>
              {g.label}
            </button>
          ))}
        </div>
      )}
      <div className="max-h-52 overflow-y-auto overscroll-contain space-y-1.5 mt-1 -mx-1 px-1">
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
      <div className="mt-3 pt-3 border-t border-slate-800/60 space-y-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Agregar ejercicio propio</p>
        <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Nombre del ejercicio…" className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500/50" />
        <div>
          <p className="text-[9px] text-slate-600 mb-1.5">Músculo principal:</p>
          <div className="flex flex-wrap gap-1.5">
            {MUSCLE_GROUPS.filter((g) => g.key !== "cardio").map((g) => (
              <button key={g.key} onClick={() => setCustomMuscle(g.key)} className="px-2 py-1 rounded-lg text-[9px] font-bold border transition shrink-0"
                style={customMuscle === g.key ? { backgroundColor: g.color + "22", borderColor: g.color + "55", color: g.color } : { borderColor: "var(--chip-border)", color: "var(--chip-text)" }}>
                {g.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => { if (customName.trim()) { onAddCustom(customName.trim(), customMuscle); setCustomName(""); } }} className="w-full py-2 rounded-xl bg-teal-500/20 border border-teal-500/30 text-teal-400 text-xs font-bold transition active:scale-95">
          <Plus size={12} className="inline mr-1" /> Agregar a la rutina
        </button>
      </div>
      <p className="text-[9px] text-slate-600 mt-1.5">Los ejercicios propios no tienen nota técnica ni video de YouTube.</p>
      <button onClick={onClose} className="w-full mt-3 py-2 rounded-xl text-slate-500 hover:text-slate-300 text-[11px] font-semibold">Cerrar buscador</button>
    </div>
  );
}

const REP_RANGE_OPTIONS = ["1-3", "3-5", "4-6", "6-8", "8-10", "10-12", "12-15", "15-20"];

function BuilderExerciseRow({ ex, onRemove, onConfigChange, isDragging = false, dumbbellFactor = null, onToggleDumbbell = null, recienAgregado = false, dayColor = "#14B8A6", onHandlePointerDown = null, onMoveUp = null, onMoveDown = null }) {
  const [editing, setEditing] = useState(false);
  const repRange = ex.sets[0]?.repRange || "8-10";
  const setsCount = ex.sets.length;
  const heavy = isHeavyRepRange(repRange);
  // ¿Todas las series tienen el mismo rango?
  const allSame = ex.sets.every((s) => s.repRange === repRange);

  const handleSetRepRange = (setIdx, newRange) => {
    const newSets = ex.sets.map((s, i) => i === setIdx ? { ...s, repRange: newRange } : s);
    onConfigChange({ sets: newSets });
  };

  return (
    <div
      className={`bg-slate-900/60 border rounded-xl px-3 py-2.5 transition-all duration-150${recienAgregado ? " row-flash" : ""}`}
      style={{
        borderColor: isDragging ? "#14B8A6" : "rgba(30,41,59,0.5)",
        // La fila que arrastrás se "levanta": escala apenas, sombra fuerte y
        // se despega del fondo. Las demás se corren solas (el padre les aplica
        // el translateY), así ves el hueco abrirse en tiempo real.
        opacity: isDragging ? 0.92 : 1,
        transform: isDragging ? "scale(1.03)" : "none",
        boxShadow: isDragging ? "0 12px 28px -8px rgba(0,0,0,0.6), 0 0 0 1px #14B8A6" : "none",
        cursor: isDragging ? "grabbing" : "default",
        transition: "transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease",
        "--flash-color": dayColor + "2e",
      }}
    >
      <div className="flex items-center gap-2">
        {/* Flechas: forma 100% confiable de reordenar, sin depender de ningún
            gesto táctil. El asa de al lado (GripVertical) es la alternativa
            "linda" para arrastrar en vivo cuando el gesto anda bien en el
            dispositivo. */}
        <div className="flex flex-col -my-1 shrink-0">
          <button onClick={onMoveUp} disabled={!onMoveUp} aria-label="Mover arriba" className="p-0.5 text-slate-600 hover:text-slate-300 disabled:opacity-20"><ChevronUp size={13} /></button>
          <button onClick={onMoveDown} disabled={!onMoveDown} aria-label="Mover abajo" className="p-0.5 text-slate-600 hover:text-slate-300 disabled:opacity-20"><ChevronDown size={13} /></button>
        </div>
        <button onClick={() => setEditing((o) => !o)} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-xs font-bold text-white truncate">{ex.name}</p>
            {ex.cardio && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-rose-400/15 text-rose-300 shrink-0 flex items-center gap-0.5"><Footprints size={9} /> CARDIO</span>}
            {!ex.cardio && heavy && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 shrink-0">FUERZA</span>}
            {!ex.libId && <span className="text-[9px] text-slate-600 shrink-0">propio</span>}
          </div>
          <p className="text-[10px] text-slate-500 flex items-center gap-1.5 flex-wrap">
            <span>
              {ex.cardio
                ? `${setsCount} bloque${setsCount !== 1 ? "s" : ""} de tiempo`
                : allSame
                  ? `${setsCount} series · ${repRange} reps`
                  : `${setsCount} series · rangos mixtos`
              }
            </span>
            {/* Chip de mancuernas: se muestra solo cuando el ejercicio está
                configurado con DOS. Discreto pero visible de un vistazo. */}
            {dumbbellFactor === 2 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-black bg-teal-500/15 text-teal-400 border border-teal-500/25">
                <Dumbbell size={8} /> ×2
              </span>
            )}
          </p>
        </button>
        <button onClick={() => setEditing((o) => !o)} className="p-1.5 text-slate-500 hover:text-teal-400 shrink-0"><SlidersHorizontal size={14} /></button>
        <button onClick={onRemove} className="p-1.5 text-slate-600 hover:text-rose-400 shrink-0"><Trash2 size={14} /></button>
        {/* Asa de arrastre: único punto de la fila donde arranca el gesto de
            reordenar en vivo. touchAction:none va SOLO acá (no en toda la
            fila) para no pisarle el scroll normal al resto de la lista. */}
        {onHandlePointerDown && (
          <button
            onPointerDown={onHandlePointerDown}
            aria-label="Arrastrar para reordenar"
            className="p-1.5 -mr-1 text-slate-600 hover:text-slate-300 shrink-0 cursor-grab active:cursor-grabbing"
            style={{ touchAction: "none" }}
          >
            <GripVertical size={14} />
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-800/60 space-y-3 bounce-in">
          {/* ¿Una o dos mancuernas? Define si el peso que registrás cuenta
              simple o doble para tu rango muscular. Solo aparece en
              ejercicios de mancuerna (por el nombre). */}
          {!ex.cardio && onToggleDumbbell && /mancuerna/i.test(ex.name || "") && (
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">¿Con cuántas mancuernas?</p>
              <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">
                {[{ v: 1, l: "Una", d: "El peso cuenta tal cual" }, { v: 2, l: "Dos", d: "El peso cuenta ×2" }].map((opt) => {
                  const on = (dumbbellFactor || 1) === opt.v;
                  return (
                    <button key={opt.v} onClick={() => onToggleDumbbell(opt.v)} className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all ${on ? "bg-teal-500 !text-white" : "text-slate-500 hover:text-slate-300"}`}>
                      <span className="flex items-center justify-center gap-1"><Dumbbell size={10} /> {opt.l}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[9.5px] text-slate-600 mt-1.5">
                {(dumbbellFactor || 1) === 2
                  ? "Con dos de 20kg, tu rango cuenta 40kg de carga real."
                  : "El peso que anotes es el que cuenta para tu rango."}
              </p>
            </div>
          )}
          {/* Cantidad de bloques/series */}
          <div>
            <p className="text-[10px] text-slate-500 mb-1.5">{ex.cardio ? "Bloques (intervalos)" : "Cantidad de series"}</p>
            <div className="flex items-center gap-2">
              <button onClick={() => onConfigChange({ setsCount: Math.max(1, setsCount - 1), repRange })} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm active:scale-95">−</button>
              <span className="text-sm font-black text-white w-5 text-center tabular-nums">{setsCount}</span>
              <button onClick={() => onConfigChange({ setsCount: Math.min(8, setsCount + 1), repRange })} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm active:scale-95">+</button>
            </div>
          </div>

          {!ex.cardio && (
            <>
              {/* Reps por serie — cada una editable individualmente */}
              <div>
                <p className="text-[10px] text-slate-500 mb-2">Repeticiones por serie <span className="text-slate-600">(podés poner rangos distintos)</span></p>
                <div className="space-y-2">
                  {ex.sets.map((s, i) => (
                    <div key={i} className="space-y-1">
                      <p className="text-[9px] text-slate-600 font-bold">Serie {i + 1}</p>
                      <div className="flex flex-wrap gap-1">
                        {REP_RANGE_OPTIONS.map((r) => (
                          <button key={r} onClick={() => handleSetRepRange(i, r)} className={`px-2 py-0.5 rounded-lg text-[9px] font-bold transition-all border ${s.repRange === r ? "bg-teal-500 border-teal-500 !text-white" : "border-slate-800 text-slate-500"}`}>{r}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {isHeavyRepRange(ex.sets[0]?.repRange) && <p className="text-[9px] text-amber-500/80 mt-1.5">La primera serie en ≤6 reps se marca como FUERZA.</p>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BuilderDayCard({ day, dayIdx, totalDays, onRename, onRemove, onMoveDay, onChangeColor, onAddExercise, onAddCustomExercise, onRemoveExercise, onMoveExercise, onConfigExercise, onToggleSuperset, dumbbellDouble = null, onUpdateSettings = null, onDuplicateDay = null }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  // ── REORDENAR ARRASTRANDO ──────────────────────────────────────────────
  // Drag & drop con Pointer Events (funciona igual con dedo y con mouse).
  // Al soltar, se reordena usando el mismo onMoveExercise que las flechas,
  // aplicando el desplazamiento paso a paso — así el modelo de datos y el
  // undo del builder siguen funcionando exactamente igual que antes.
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const dragRef = useRef({ from: null, over: null });

  // ── ARRASTRE PARA REORDENAR ──────────────────────────────────────────────
  // Se agarra desde un asa dedicada (ícono de agarre) en vez de la fila
  // entera. Antes se armaba con un long-press desde cualquier punto de la
  // fila, pero en celulares reales el touch-action de la fila se decide
  // UNA sola vez, apenas el dedo la toca — si el navegador ya había
  // decidido "esto es scroll" en esos primeros milisegundos, el long-press
  // se cumplía igual (vibraba) pero el dedo seguía scrolleando en vez de
  // mover la fila, sin que ningún preventDefault() lo revirtiera a mitad
  // de gesto. Con un asa chica y dedicada que SIEMPRE tiene touch-action:
  // none, no hay ambigüedad que resolver: tocar el asa es sólo para
  // arrastrar, tocar el resto de la fila sigue siendo scroll normal — así
  // que el arrastre arranca al toque, sin esperar nada.

  // Animaciones de la lista: qué ejercicio acaba de entrar (para resaltarlo) y
  // cuál se está yendo (para que colapse antes de desaparecer de verdad).
  const [nuevoId, setNuevoId] = useState(null);
  const [saliendoIdx, setSaliendoIdx] = useState(null);
  const [supersetNuevo, setSupersetNuevo] = useState(null); // el vínculo recién creado
  const supersetTimerRef = useRef(null);
  useEffect(() => () => { if (supersetTimerRef.current) clearTimeout(supersetTimerRef.current); }, []);
  const vincularSuperserie = (i) => {
    setSupersetNuevo(i);
    if (supersetTimerRef.current) clearTimeout(supersetTimerRef.current);
    supersetTimerRef.current = setTimeout(() => { setSupersetNuevo(null); supersetTimerRef.current = null; }, 500);
    onToggleSuperset(i);
  };
  // Si el componente se desmonta a mitad de un arrastre (cerrás el editor con
  // el dedo apoyado), hay que soltar los listeners globales igual — si no,
  // quedan escuchando para siempre sobre un componente que ya no existe.
  const cleanupDragRef = useRef(null);
  useEffect(() => () => { cleanupDragRef.current?.(); }, []);
  // Detecta cuándo se agregó un ejercicio para resaltarlo. Guardamos el id del
  // último en una ref y la actualizamos DENTRO del efecto (nunca durante el
  // render: React puede renderizar de más y quedaría desincronizado).
  const prevUltimoIdRef = useRef(null);
  const prevCantRef = useRef(day.exercises.length);
  useEffect(() => {
    const antes = prevCantRef.current;
    const ahora = day.exercises.length;
    const idUltimo = day.exercises[ahora - 1]?.id ?? null;
    prevCantRef.current = ahora;
    prevUltimoIdRef.current = idUltimo;
    // Creció la lista Y el último cambió → es uno nuevo
    if (ahora > antes && idUltimo) {
      setNuevoId(idUltimo);
      // 950ms ≈ lo que dura row-flash: la clase se saca justo al terminar.
      const t = setTimeout(() => setNuevoId(null), 950);
      return () => clearTimeout(t);
    }
  }, [day.exercises]);

  // Borrado con animación: primero colapsa, después se borra de verdad.
  // Si tocás borrar dos veces rápido, el segundo pedido se ignora hasta que
  // termine el primero: si no, el segundo timeout dispararía con un índice
  // viejo (la lista ya cambió) y borraría el ejercicio equivocado.
  const borrandoRef = useRef(false);
  const borrarTimerRef = useRef(null);
  useEffect(() => () => { if (borrarTimerRef.current) clearTimeout(borrarTimerRef.current); }, []);
  const borrarConAnimacion = (i) => {
    if (borrandoRef.current) return; // ya hay uno en curso
    borrandoRef.current = true;
    setSaliendoIdx(i);
    borrarTimerRef.current = setTimeout(() => {
      setSaliendoIdx(null);
      onRemoveExercise(i);
      borrandoRef.current = false;
      borrarTimerRef.current = null;
    }, 280); // coincide con la duración de row-leave
  };

  const startDrag = (e, i) => {
    // Solo botón principal / dedo (ignorar click derecho)
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();

    dragRef.current = { from: i, over: i };
    setDragIdx(i);
    setOverIdx(i);
    haptic(14);
    // Fija el gesto a este puntero: así lo seguimos recibiendo aunque el
    // dedo se mueva sobre otras filas mientras arrastra.
    e.target?.setPointerCapture?.(e.pointerId);

    const findIdxAt = (clientY) => {
      const rows = document.querySelectorAll("[data-drag-idx]");
      for (const row of rows) {
        const r = row.getBoundingClientRect();
        if (clientY >= r.top && clientY <= r.bottom) return Number(row.getAttribute("data-drag-idx"));
      }
      return null;
    };

    const onMove = (ev) => {
      ev.preventDefault();
      const idx = findIdxAt(ev.clientY);
      if (idx != null && idx !== dragRef.current.over) {
        dragRef.current.over = idx;
        setOverIdx(idx);
        haptic(6);
      }
      // Auto-scroll al acercarte a los bordes
      const margin = 90, speed = 9;
      if (ev.clientY < margin) window.scrollBy(0, -speed);
      else if (ev.clientY > window.innerHeight - margin) window.scrollBy(0, speed);
    };

    const limpiar = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    const onUp = () => {
      limpiar();
      cleanupDragRef.current = null;
      const { from, over } = dragRef.current;
      if (from != null && over != null && from !== over) {
        // Mover paso a paso reutilizando onMoveExercise (respeta superseries)
        const step = over > from ? 1 : -1;
        for (let k = from; k !== over; k += step) onMoveExercise(k, step);
        haptic(20);
      }
      dragRef.current = { from: null, over: null };
      setDragIdx(null);
      setOverIdx(null);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    // Lo guardamos por si el componente se desmonta antes de que sueltes
    cleanupDragRef.current = limpiar;
  };

  // Desplazamiento en vivo: mientras arrastrás, las filas que están entre el
  // origen y el destino se corren para dejar el hueco. Devuelve cuántos
  // píxeles tiene que moverse la fila `i` (aproximando el alto de una fila).
  const ROW_SHIFT = 64; // alto aproximado de una fila + separación
  const desplazamientoDe = (i) => {
    const from = dragIdx, over = overIdx;
    if (from == null || over == null || from === over) return 0;
    if (i === from) return 0; // la que arrastrás no se corre (queda semi-transparente)
    if (from < over && i > from && i <= over) return -ROW_SHIFT; // suben
    if (from > over && i < from && i >= over) return ROW_SHIFT;  // bajan
    return 0;
  };

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
              {c.toLowerCase() === (day.color || "").toLowerCase() && <Check size={14} className="text-white" />}
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
        {/* Duplicar el día completo: si tu Lunes y tu Jueves son parecidos,
            antes había que armarlos dos veces desde cero. */}
        {onDuplicateDay && day.exercises.length > 0 && (
          <button onClick={onDuplicateDay} aria-label="Duplicar este día" title="Duplicar día" className="p-1.5 text-slate-600 hover:text-teal-400 shrink-0 transition-colors">
            <Copy size={13} />
          </button>
        )}
        {totalDays > 1 && <button onClick={onRemove} className="p-1.5 text-slate-600 hover:text-rose-400 shrink-0"><Trash2 size={14} /></button>}
      </div>

      {day.exercises.length === 0 && (
        <div className="flex flex-col items-center gap-1.5 py-4 rounded-xl mb-2" style={{ backgroundColor: day.color + "08", border: `1px dashed ${day.color}30` }}>
          <Dumbbell size={20} style={{ color: day.color + "80" }} />
          <p className="text-[11px] text-slate-500">Día vacío — agregá tu primer ejercicio</p>
        </div>
      )}

      <div className="space-y-1.5">
        {day.exercises.map((ex, i) => (
          <div
            key={ex.id}
            data-drag-idx={i}
            className={`${nuevoId === ex.id ? "row-enter" : ""} ${saliendoIdx === i ? "row-leave" : ""}`}
            style={{
              // Desplazamiento en vivo: las filas se corren para abrir el hueco
              // donde va a caer la que arrastrás. transform (no margin) para que
              // corra en la GPU y no recalcule el layout en cada frame.
              // Si la fila está entrando o saliendo, dejamos que su propia
              // animación maneje el transform (si no, se pisarían).
              transform: (nuevoId === ex.id || saliendoIdx === i) ? undefined : `translateY(${desplazamientoDe(i)}px)`,
              transition: (nuevoId === ex.id || saliendoIdx === i) ? undefined : "transform 0.2s cubic-bezier(0.22,1,0.36,1)",
              zIndex: dragIdx === i ? 20 : 1,
              position: "relative",
            }}
          >
            <BuilderExerciseRow ex={ex}
              recienAgregado={nuevoId === ex.id} dayColor={day.color}
              onRemove={() => borrarConAnimacion(i)}
              onConfigChange={(cfg) => onConfigExercise(i, cfg)}
              isDragging={dragIdx === i} isDragOver={overIdx === i && dragIdx !== null && dragIdx !== i}
              onHandlePointerDown={(e) => startDrag(e, i)}
              onMoveUp={i > 0 ? () => onMoveExercise(i, -1) : null}
              onMoveDown={i < day.exercises.length - 1 ? () => onMoveExercise(i, 1) : null}
              dumbbellFactor={(dumbbellDouble || {})[ex.id] || EXERCISE_LIBRARY_BY_ID[ex.id]?.loadFactor || 1}
              onToggleDumbbell={onUpdateSettings ? (v) => onUpdateSettings({ dumbbellDouble: { ...(dumbbellDouble || {}), [ex.id]: v } }) : null} />
            {i < day.exercises.length - 1 && (
              <button onClick={() => { vincularSuperserie(i); }}
                className={`w-full flex items-center justify-center gap-1.5 my-1 py-2 rounded-lg text-[11px] font-bold transition-all active:scale-[0.98] border ${supersetNuevo === i && !ex.supersetNext ? "superset-draw" : ""}`}
                style={ex.supersetNext ? { backgroundColor: day.color + "22", borderColor: day.color + "60", color: day.color } : { backgroundColor: "transparent", borderColor: "var(--chip-border)", color: "var(--chip-text)", borderStyle: "dashed" }}>
                <Link size={13} /> {ex.supersetNext ? "Superserie activada — tocá para separar" : "+ Vincular en superserie"}
              </button>
            )}
          </div>
        ))}
      </div>

      {!pickerOpen ? (
        <button onClick={() => setPickerOpen(true)} className="w-full flex items-center justify-center gap-1.5 mt-2.5 py-2.5 rounded-xl font-semibold text-xs transition active:scale-[0.98]" style={{ backgroundColor: day.color + "14", border: `1px solid ${day.color}35`, color: day.color }}><Plus size={13} /> Agregar ejercicio</button>
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

// Paleta del editor: guarda los tonos ORIGINALES. buildRoutineModel los atenúa
// al cargar la rutina — si acá ya los guardáramos atenuados, se atenuarían dos
// veces y quedarían apagados de más. Lo que sí hacemos es MOSTRAR la muestra
// ya atenuada en el selector (con muteHexColor), así el color que ves al
// elegir es el mismo que vas a ver después en la app.
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
  const { profile, onCreateRoutine, onActivateRoutine, onUpdateProfile, onUpdateSettings, onAddMeasurement } = ctx;
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
const AI_LOG_HISTORY_LIMIT = 6; // últimas 6 sesiones por serie — suficiente para tendencia reciente
// ANÁLISIS PRECALCULADO PARA LA IA. Antes le mandábamos los logs crudos y
// tenía que deducir sola qué era récord, si venías progresando o estancado,
// cuánto volumen hacías. Eso la hacía lenta e imprecisa. Acá le damos las
// conclusiones ya masticadas — con esto puede responder "¿por qué me estanqué
// en press banca?" con TUS números reales, o "armame el día de mañana" sabiendo
// qué músculos tenés frescos y cuáles reventados.
function buildTrainingInsights(logs, sessions, weekSchedule, dumbbellDouble = null) {
  const today = todayStr();
  const daysAgo = (dateStr) => Math.round((new Date(today) - new Date(dateStr)) / 86400000);

  // Factor de carga del ejercicio: si entrenás con DOS mancuernas, el peso
  // real es el doble. Sin esto la IA calculaba las marcas a la mitad y te
  // daba consejos con números que no coincidían con lo que ves en la app.
  const loadFactorDe = (exId) =>
    (dumbbellDouble && dumbbellDouble[exId]) || EXERCISE_LIBRARY_BY_ID[exId]?.loadFactor || 1;

  // ── Por ejercicio: mejor marca, última sesión, y TENDENCIA de 1RM
  const porEjercicio = [];
  const byExercise = {};
  // Récords corregidos a mano: mandan sobre lo calculado del historial. Antes
  // se descartaban, así que si arreglabas una marca, la IA no se enteraba.
  const manualPR = {};
  Object.entries(logs || {}).forEach(([key, val]) => {
    if (key.endsWith("_pr_override")) {
      const exId = key.replace("_pr_override", "");
      if (val?.kg && val?.reps) manualPR[exId] = { kg: val.kg, reps: val.reps, manual: !!val.manual };
      return;
    }
    if (!Array.isArray(val)) return;
    const { exerciseId } = parseLogKey(key);
    (byExercise[exerciseId] ||= []).push(...val.filter((e) => e && e.kg && e.reps));
  });
  Object.entries(byExercise).forEach(([exId, entries]) => {
    if (!entries.length) return;
    const lib = EXERCISE_LIBRARY_BY_ID[exId];
    const sorted = entries.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    // Mejor 1RM por fecha (una sesión puede tener varias series)
    const byDate = {};
    const lf = loadFactorDe(exId);
    sorted.forEach((e) => {
      const rm = estimate1RM(e.kg * lf, e.reps);
      if (!byDate[e.date] || rm > byDate[e.date].rm) byDate[e.date] = { rm, kg: e.kg, reps: e.reps };
    });
    const fechas = Object.keys(byDate).sort();
    if (!fechas.length) return;
    const best = fechas.reduce((b, f) => (byDate[f].rm > byDate[b].rm ? f : b), fechas[0]);
    const ult = fechas[fechas.length - 1];
    // Tendencia: comparar el mejor 1RM de las últimas 3 sesiones vs las 3 previas
    const recientes = fechas.slice(-3).map((f) => byDate[f].rm);
    const previas = fechas.slice(-6, -3).map((f) => byDate[f].rm);
    let tendencia = "sin datos suficientes";
    if (previas.length && recientes.length) {
      const maxR = Math.max(...recientes), maxP = Math.max(...previas);
      const delta = ((maxR - maxP) / maxP) * 100;
      tendencia = delta > 2 ? "subiendo" : delta < -2 ? "bajando" : "estancado";
    } else if (fechas.length >= 2) {
      tendencia = byDate[ult].rm > byDate[fechas[0]].rm ? "subiendo" : "plano";
    }
    // El récord corregido a mano manda sobre lo calculado del historial: es la
    // misma regla que usa la app, así la IA habla de la misma marca que ves vos.
    const mp = manualPR[exId];
    const mpRm = mp ? estimate1RM(mp.kg * lf, mp.reps) : 0;
    const usarManual = mp && mpRm >= byDate[best].rm;
    porEjercicio.push({
      ejercicio: lib?.name || exId,
      musculo: lib?.group || null,
      mejorMarca: usarManual ? `${mp.reps}x${mp.kg}kg` : `${byDate[best].reps}x${byDate[best].kg}kg`,
      mejor1RMest: usarManual ? mpRm : byDate[best].rm,
      marcaCorregidaAMano: usarManual ? true : undefined,
      fechaMejorMarca: usarManual ? null : best,
      diasDesdeMejorMarca: usarManual ? null : daysAgo(best),
      ultimaVez: ult,
      diasDesdeUltimaVez: daysAgo(ult),
      sesionesRegistradas: fechas.length,
      dosMancuernas: lf === 2 ? true : undefined,
      tendencia,
    });
  });
  porEjercicio.sort((a, b) => a.diasDesdeUltimaVez - b.diasDesdeUltimaVez);

  // ── Volumen semanal por músculo (últimos 7 y 14 días) + días sin tocarlo
  const volSemana = {}, volSemanaPrevia = {}, seriesSemana = {}, ultimaVezMusculo = {};
  Object.entries(logs || {}).forEach(([key, val]) => {
    if (key.endsWith("_pr_override") || !Array.isArray(val)) return;
    const { exerciseId } = parseLogKey(key);
    const g = EXERCISE_LIBRARY_BY_ID[exerciseId]?.group;
    if (!g) return;
    const lfv = loadFactorDe(exerciseId);
    val.forEach((e) => {
      if (!e || !e.kg || !e.reps || !e.date) return;
      const d = daysAgo(e.date);
      if (!ultimaVezMusculo[g] || d < ultimaVezMusculo[g]) ultimaVezMusculo[g] = d;
      const v = e.kg * lfv * e.reps;
      if (d <= 7) { volSemana[g] = (volSemana[g] || 0) + v; seriesSemana[g] = (seriesSemana[g] || 0) + 1; }
      else if (d <= 14) volSemanaPrevia[g] = (volSemanaPrevia[g] || 0) + v;
    });
  });
  const porMusculo = MUSCLE_GROUPS.map((g) => ({
    musculo: g.label,
    seriesUltimos7dias: seriesSemana[g.key] || 0,
    volumenUltimos7dias: Math.round(volSemana[g.key] || 0),
    volumenSemanaPrevia: Math.round(volSemanaPrevia[g.key] || 0),
    diasSinEntrenarlo: ultimaVezMusculo[g.key] ?? null,
  }));

  // ── Adherencia: entrenamientos vs agenda
  const dateSet = getTrainedDateSet(logs, sessions);
  const ultimos30 = [...dateSet].filter((d) => daysAgo(d) <= 30).length;
  const ultimos7 = [...dateSet].filter((d) => daysAgo(d) <= 7).length;
  const diasProgramados = weekSchedule ? Object.values(weekSchedule).filter(Boolean).length : null;

  return {
    fechaHoy: today,
    adherencia: {
      entrenamientosUltimos7dias: ultimos7,
      entrenamientosUltimos30dias: ultimos30,
      diasProgramadosPorSemana: diasProgramados,
      rachaActual: computeSmartStreak(dateSet, weekSchedule),
    },
    porMusculo,
    porEjercicio: porEjercicio.slice(0, 25),
  };
}

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
  const [editingIndex, setEditingIndex] = useState(null); // índice del mensaje propio que se está editando
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

  const enviarMensajeIA = async (userText, replaceIndex = null) => {
    // Si estamos editando: cortamos la conversación hasta el mensaje editado
    // (las respuestas siguientes ya no aplican) y lo reemplazamos por el nuevo.
    const base = replaceIndex != null ? messages.slice(0, replaceIndex) : messages;
    const newMessages = [...base, { role: "user", text: userText }];
    setMessages(newMessages);
    setInput("");
    setEditingIndex(null);
    setIsSending(true);
      // Antes esto sólo le mandaba los NOMBRES de las rutinas guardadas —
      // por eso no podía ver qué ejercicios tenía cada una, sólo los
      // récords sueltos en logs. Ahora se resuelve cada rutina (incluida
      // la activa, las creadas/editadas, y las archivadas) a su estructura
      // real día por día — lo mismo que ve la persona en la pestaña
      // Rutinas — y se manda completo. Lo único que sigue recortado es el
      // texto largo (nota técnica, video) de cada ejercicio: no aporta
      // nada para responder y agranda el pedido sin necesidad.
      // Construir el contexto de rutinas de forma eficiente:
      // - Rutina activa → estructura completa (días, ejercicios, series)
      // - Rutinas no activas → solo nombre e id (ahorra 80% del tamaño)
      // Sin esto, con varias rutinas guardadas el systemPrompt puede superar
      // los 60.000 chars y Gemini lo rechaza o tarda demasiado.
      const activeRoutineId = profile?.activeRoutineId || null;
      const allRoutines = Object.entries(profile?.routines || {}).map(([id, entry]) => {
        const resolved = resolveRoutineDef(entry, id);
        if (!resolved) return null;
        const base = { id, nombre: resolved.name, esLaActiva: id === activeRoutineId, archivada: !!entry.archived, origen: entry.source || "custom" };
        // Solo expandir la rutina activa — las demás no necesitan detalle para responder preguntas sobre el entrenamiento actual
        if (id !== activeRoutineId) return base;
        let dias = [];
        try {
          const model = buildRoutineModel(resolved);
          dias = model.dayOrder.map((dk) => {
            const d = model.days[dk];
            return { dia: d.label, ejercicios: d.exercises.map((ex) => ({ nombre: ex.name, musculo: ex.muscle, series: ex.sets.length, repeticionesPorSerie: ex.sets.map((s) => s.repRange) })) };
          });
        } catch { /* ignorado a propósito */ }
        return { ...base, dias };
      }).filter(Boolean);
      const context = {
        perfil: { nombre: profileName, email: profile?.email || null, sexo: profile?.sex || null, edad: profile?.age || null, miembroDesde: profile?.joinedAt || null },
        rutinaActivaId: profile?.activeRoutineId || null,
        rutinas: allRoutines,
        configuracionActual: settings,
        logs: trimLogsForAI(logs),
        // Análisis YA CALCULADO de su entrenamiento: marcas, tendencias,
        // estancamientos, volumen por músculo y adherencia. Con esto la IA
        // no tiene que deducir nada de los logs crudos — responde con datos
        // duros y detecta problemas reales (ej. "llevás 5 semanas estancado
        // en press banca y le bajaste el volumen a pecho un 30%").
        analisisEntrenamiento: buildTrainingInsights(logs, profile?.trainingSessions || [], profile?.weekSchedule || null, settings?.dumbbellDouble || null),
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

Basá tus recomendaciones en los principios de entrenamiento con más consenso científico (sobrecarga progresiva, volumen y frecuencia adecuados, técnica y rango de movimiento, gestión de la fatiga). NUNCA inventes estudios, autores, cifras exactas ni links — si no estás seguro de un dato puntual, decilo con honestidad y da la recomendación práctica general.

Tenés acceso a los datos reales de esta persona en el siguiente JSON — usalos para responder con precisión (fechas, pesos, repeticiones, y la estructura real de sus rutinas día por día), nunca inventes datos que no estén ahí.

LEÉ SIEMPRE "analisisEntrenamiento" ANTES DE RESPONDER: es el análisis ya calculado de su entrenamiento real y es tu fuente principal para cualquier consejo. Trae, por ejercicio, su mejor marca con fecha, el 1RM estimado, hace cuántos días no lo hace y la TENDENCIA ("subiendo" / "estancado" / "bajando"); por músculo, las series y el volumen de los últimos 7 días comparados con la semana previa, y hace cuántos días no lo entrena; y su adherencia real (entrenamientos por semana, racha). Usalo así:
- Si te preguntan por un estancamiento, mirá "tendencia" y "diasDesdeMejorMarca" de ESE ejercicio y el volumen de su músculo — respondé con los números concretos, no con generalidades.
- Si te piden armar o ajustar un entrenamiento, priorizá los músculos con más "diasSinEntrenarlo" o menos "seriesUltimos7dias", y evitá recargar lo que entrenó hace 1-2 días.
- Si detectás algo importante que no preguntaron (un músculo abandonado hace semanas, una caída fuerte de volumen, un ejercicio estancado hace mucho), mencionalo brevemente al final.
- Citá siempre datos reales ("tu mejor press banca es 5x110 del 6 de julio, hace 12 días") en vez de hablar en abstracto. "rutinas" incluye TODAS sus rutinas (activa, creadas, editadas y archivadas) con sus días y ejercicios completos — las marcadas "archivada":true no están visibles para ella en la pestaña Rutinas salvo que las recupere, tenelo en cuenta si te pregunta qué tiene disponible ahora. "logs" trae sólo los últimos registros de cada serie (no el historial completo) — alcanza para evaluar tendencia reciente, pero si te preguntan por una marca muy vieja que no aparece, decilo en vez de inventar un valor. Respuestas cortas, 2 a 4 oraciones salvo que te pidan más detalle o la pregunta lo amerite. Para dar formato a tu texto podés usar **negrita** y listas con guion (-), nada más — no uses títulos, tablas, ni bloques de código.

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
      // Limitamos el historial a los últimos 10 mensajes — después de
      // varios intercambios el contexto acumulado puede superar el límite
      // de tokens de Gemini o disparar el 429 por tamaño de pedido, aunque
      // no se hayan hecho muchos requests en el minuto. El sistema sigue
      // leyendo TODO el historial de entrenamiento real del usuario (en el
      // systemPrompt), así que no pierde contexto de lo que importa.
      const history = newMessages.slice(-10).map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] }));
      // El pedido a Gemini ya no lo hace el navegador directo: lo hace
      // /api/ia (función serverless de Vercel — ver api/ia.js), que tiene
      // la clave real en una variable de entorno del servidor y nunca la
      // expone, y que activa la búsqueda con Google cuando hace falta
      // respaldar una afirmación científica — devuelve el texto y, si
      // corresponde, las fuentes reales que usó (ver "sources" más abajo).
      // Timeout de 65 segundos — las respuestas LARGAS (rutinas completas,
      // análisis extensos) en el plan gratuito de Gemini tardan 30-50s.
      // Antes cortábamos a los 30s y por eso "hola" funcionaba pero los
      // pedidos grandes morían a mitad de generación. El servidor tiene su
      // propio límite de 60s, así que su mensaje de error siempre llega
      // antes que este corte.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 65000);
      try {
        const response = await fetch("/api/ia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "chat", systemPrompt, history }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          // El servidor ahora manda el motivo real en { error } (cuota
          // agotada, clave inválida, IA caída...) — lo mostramos tal cual
          // en vez de un "no me pude conectar" genérico que no dice nada.
          const errBody = await response.json().catch(() => null);
          const serverMsg = errBody?.error;
          throw new Error(serverMsg || `Error ${response.status}`, { cause: serverMsg ? "server" : undefined });
        }
        const result = await response.json();

        const rawReply = result?.text;
        const sources = Array.isArray(result?.sources) ? result.sources : [];
        if (!rawReply) { setMessages((prev) => [...prev, { role: "assistant", text: "No se me ocurrió una respuesta — probá de nuevo." }]); return; }

        const { text, action } = parseAction(rawReply);
        const plan = action ? buildActionPlan(action, { profile, settings, onCreateRoutine, onActivateRoutine, onUpdateProfile, onUpdateSettings, onAddMeasurement }) : null;
        setMessages((prev) => [...prev, { role: "assistant", text, plan, planStatus: plan ? "pending" : null, sources }]);
      } catch (err) {
        clearTimeout(timeoutId);
        console.error("Error al hablar con el entrenador IA:", err);
        const isTimeout = err.name === "AbortError";
        const serverMsg = err.cause === "server" ? err.message : null;
        setMessages((prev) => [...prev, {
          role: "assistant",
          text: isTimeout
            ? "Tardé demasiado en responder (más de un minuto). El plan gratuito de Gemini tiene momentos pico — esperá un poco y volvé a intentar 🙏"
            : serverMsg
              ? `${serverMsg} 🙏`
              : "Uy, no me pude conectar. Revisá tu conexión o probá de nuevo en un momento 🙏"
        }]);
      } finally {
        setIsSending(false);
      }
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    enviarMensajeIA(trimmed, editingIndex);
  };

  // Cargar un mensaje propio en el input para editarlo
  const handleEditMessage = (i) => {
    if (isSending) return;
    setInput(messages[i].text);
    setEditingIndex(i);
  };
  const cancelarEdicion = () => { setEditingIndex(null); setInput(""); };

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
  const listeningRef = useRef(false);
  // Acumula solo los resultados FINALES entre reinicios de Android.
  // Sin esto, cada reinicio volvía a procesar e.results desde 0 sumando
  // lo que ya se había dicho — por eso las palabras se repetían.
  const finalTranscriptRef = useRef("");
  const SpeechRecognitionAPI = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  useEffect(() => () => { listeningRef.current = false; try { recognitionRef.current?.stop(); } catch { /* ignorado a propósito */ } }, []);
  const handleMicToggle = async () => {
    if (!SpeechRecognitionAPI) return;
    if (listeningRef.current) {
      listeningRef.current = false;
      try { recognitionRef.current?.abort(); } catch { /* ignorado a propósito */ }
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }
    // Pedir el permiso de micrófono explícitamente ANTES de iniciar —
    // sin esto el WebView de Android rechaza el acceso en silencio.
    finalTranscriptRef.current = "";
    try {
      const stream = await navigator.mediaDevices?.getUserMedia({ audio: true });
      stream?.getTracks().forEach((t) => t.stop());
    } catch {
      setIsListening(false); return; // permiso denegado
    }
    // ENFOQUE ROBUSTO PARA ANDROID:
    // El bug de repetición viene de continuous=true: en Android Chrome, al
    // reiniciar el reconocimiento (que se corta solo cada pocos segundos),
    // los resultados finales previos se RE-EMITEN con resultIndex en 0, y
    // se acumulan de nuevo → cada frase aparece 2, 3, 4 veces.
    //
    // Solución: continuous=false (un segmento corto por instancia). Cada
    // instancia entrega UNA transcripción final, la agregamos al ref una
    // sola vez, y arrancamos una instancia nueva. El interino se muestra
    // aparte y NO se acumula. Así cada palabra entra exactamente una vez.
    const startRecognition = () => {
      if (!listeningRef.current) return;
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = "es-AR";
      recognition.interimResults = true;
      recognition.continuous = false; // clave: un segmento por instancia
      recognition.maxAlternatives = 1;
      let segmentFinal = ""; // la transcripción final de ESTE segmento

      recognition.onresult = (e) => {
        let interim = "";
        let finalThisSegment = "";
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finalThisSegment += res[0].transcript;
          else interim += res[0].transcript;
        }
        segmentFinal = finalThisSegment;
        // Mostrar: lo ya confirmado (ref) + lo de este segmento + interino
        const preview = (finalTranscriptRef.current + finalThisSegment + " " + interim).replace(/\s+/g, " ").trim();
        setInput(preview);
      };
      recognition.onerror = (e) => {
        if (e.error !== "no-speech" && e.error !== "aborted") {
          listeningRef.current = false;
          setIsListening(false);
        }
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        // Consolidar el final de este segmento al acumulado — UNA sola vez.
        if (segmentFinal.trim()) {
          finalTranscriptRef.current = (finalTranscriptRef.current + segmentFinal + " ").replace(/\s+/g, " ");
          setInput(finalTranscriptRef.current.trim());
        }
        // Siguiente segmento si el usuario sigue en modo escucha.
        if (listeningRef.current) {
          setTimeout(startRecognition, 120);
        } else {
          setIsListening(false);
        }
      };
      recognitionRef.current = recognition;
      try { recognition.start(); } catch {
        listeningRef.current = false;
        setIsListening(false);
      }
    };
    listeningRef.current = true;
    setIsListening(true);
    startRecognition();
  };

  return (
    <div className="pb-32">
      <div className="relative overflow-hidden rounded-2xl border border-teal-500/20 p-5 mb-3" style={{ background: "var(--grad-hero-teal)" }}>
        <div className="absolute -top-8 -right-6 w-32 h-32 rounded-full bg-teal-500/15 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full bg-cyan-500/10 blur-2xl pointer-events-none" />
        <div className="relative flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center shrink-0 shadow-lg shadow-teal-500/20 elastic-in">
            <Sparkles size={20} className="text-teal-400 sparkle-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-teal-400">Tu asistente</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-teal-500/20 text-teal-400 font-bold border border-teal-500/20">BETA</span>
            </div>
            <h2 className="relative text-xl font-black text-white leading-tight">Entrenador IA</h2>
            <p className="relative text-xs text-teal-300/60 mt-0.5">Conoce tu historial real — preguntale lo que quieras</p>
          </div>
          {messages.length > 1 && (
            <button onClick={() => setMessages(messages.slice(0, 1))} title="Nueva conversación" className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-teal-400 transition shrink-0 active:scale-95">
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 mb-4">
        {[
          { icon: <Layers size={11} />, label: "Crear rutina", prompt: "Armame una rutina nueva según mis objetivos" },
          { icon: <BarChart3 size={11} />, label: "Analizar progreso", prompt: "Analizá mi progreso reciente: ¿en qué mejoré y qué tengo estancado?" },
          { icon: <Target size={11} />, label: "Punto débil", prompt: "Mirando mis rangos por músculo, ¿cuál es mi punto más débil y cómo lo ataco?" },
          { icon: <Zap size={11} />, label: "Plan de hoy", prompt: "¿Qué me toca entrenar hoy y con qué pesos me conviene arrancar?" },
          { icon: <Calendar size={11} />, label: "Ciclo y descarga", prompt: "¿Cómo vengo en el ciclo actual? ¿Cuándo me toca la descarga?" },
        ].map((c, i) => (
          <button key={i} onClick={() => { setInput(c.prompt); }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-300 text-[10px] font-bold whitespace-nowrap shrink-0 hover:bg-teal-500/20 transition active:scale-95">{c.icon}{c.label}</button>
        ))}
      </div>

      <div className="space-y-3">
        {messages.map((m, i) => (
          <div key={i} className="msg-in">
            <div className={`group flex items-end gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <div className="w-6 h-6 rounded-lg bg-teal-500/15 border border-teal-500/25 flex items-center justify-center shrink-0 mb-0.5">
                  <Sparkles size={11} className="text-teal-400" />
                </div>
              )}
              {/* Editar: solo en mensajes propios, y solo si no está respondiendo.
                  Toca el lápiz → el texto vuelve al input para reescribirlo. */}
              {m.role === "user" && !isSending && (
                <button onClick={() => handleEditMessage(i)} aria-label="Editar mensaje" className={`shrink-0 mb-1 p-1.5 rounded-lg text-slate-500 hover:text-teal-300 hover:bg-slate-800/60 transition ${editingIndex === i ? "text-teal-400" : ""}`}>
                  <Edit3 size={13} />
                </button>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "!text-white rounded-br-md" : "bg-slate-900/60 border border-slate-800/60 text-slate-200 rounded-bl-md"} ${editingIndex === i ? "ring-2 ring-teal-400/60" : ""}`}
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
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            {/* Escena abierta (sin burbuja): la pesa "hace repeticiones" en el
                centro de un halo que late, con un ecualizador de energía debajo
                — como si el entrenador estuviera trabajando. */}
            <div className="relative flex items-center justify-center">
              <span className="absolute w-20 h-20 rounded-full thinking-halo" style={{ background: "radial-gradient(circle, rgba(20,184,166,0.25), transparent 70%)" }} />
              <span className="absolute w-20 h-20 rounded-full thinking-wave" />
              <span className="absolute w-20 h-20 rounded-full thinking-wave" style={{ animationDelay: "0.9s" }} />
              <div className="relative w-12 h-12 rounded-2xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center shadow-lg shadow-teal-500/20">
                <Dumbbell size={22} className="text-teal-300 thinking-rep" />
              </div>
            </div>
            {/* Ecualizador: 5 barras que laten como música, con desfase */}
            <div className="flex items-end gap-1 h-4">
              {[0, 1, 2, 3, 4].map((k) => (
                <span key={k} className="w-1 rounded-full bg-teal-400/80 thinking-eq" style={{ animationDelay: `${k * 0.12}s` }} />
              ))}
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Pensando<span className="thinking-dots" /> <span className="text-slate-600">· puede tardar hasta 30s</span></span>
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
        <div className="fixed bottom-0 left-0 right-0 z-10 pt-8 px-4 lg:pl-56 pointer-events-none"
             style={{
               // El degradado llega HASTA ABAJO DEL TODO (bottom-0) y el hueco
               // de la barra de navegación se cubre con padding sólido. Antes
               // arrancaba en bottom-16 y quedaba una franja transparente entre
               // el degradado y la nav: se veía el contenido del chat pasando
               // por atrás. Ahora no hay ningún hueco.
               background: "linear-gradient(to top, var(--app-bg, #0a0f1a) 62%, transparent)",
               paddingBottom: "calc(var(--chat-nav-gap, 4rem) + 1rem)",
             }}>
          <div className="max-w-xl lg:max-w-3xl xl:max-w-4xl mx-auto pointer-events-auto">
            {isListening && (
              <div className="flex items-center justify-center gap-2 mb-2 bounce-in">
                <span className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                  <span className="flex items-end gap-0.5 h-3.5">
                    <span className="w-0.5 bg-emerald-400 rounded-full voice-bar" style={{ height: "40%", animationDelay: "0ms" }} />
                    <span className="w-0.5 bg-emerald-400 rounded-full voice-bar" style={{ height: "100%", animationDelay: "150ms" }} />
                    <span className="w-0.5 bg-emerald-400 rounded-full voice-bar" style={{ height: "65%", animationDelay: "300ms" }} />
                    <span className="w-0.5 bg-emerald-400 rounded-full voice-bar" style={{ height: "85%", animationDelay: "450ms" }} />
                  </span>
                  <span className="text-[11px] font-bold text-emerald-300">Escuchando… tocá ✓ al terminar</span>
                </span>
              </div>
            )}
            {editingIndex != null && (
              <div className="flex items-center gap-2 mb-1.5 px-3 py-2 rounded-xl bg-teal-500/10 border border-teal-500/25 msg-in">
                <Edit3 size={12} className="text-teal-400 shrink-0" />
                <span className="flex-1 text-[11px] text-teal-200 font-medium">Editando tu mensaje — al enviar se regenera la respuesta</span>
                <button onClick={cancelarEdicion} aria-label="Cancelar edición" className="p-1 rounded-lg text-slate-400 hover:text-white transition shrink-0"><X size={13} /></button>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-2xl p-1.5 backdrop-blur-xl shadow-xl shadow-black/40 transition-colors" style={{ backgroundColor: isListening ? "rgba(6,78,59,0.55)" : editingIndex != null ? "rgba(13,42,38,0.92)" : "rgba(15,23,42,0.92)", border: `1px solid ${isListening ? "rgba(16,185,129,0.4)" : editingIndex != null ? "rgba(20,184,166,0.4)" : "rgba(30,41,59,0.6)"}` }}>
              {SpeechRecognitionAPI && (
                <button onClick={handleMicToggle} aria-label={isListening ? "Confirmar — terminé de hablar" : "Hablar"} className="relative p-2.5 rounded-xl shrink-0 transition-all active:scale-95" style={isListening ? { background: "linear-gradient(160deg,#10B981,#059669)", color: "#fff" } : { color: "#94a3b8" }}>
                  {isListening && <span className="absolute inset-0 rounded-xl bg-emerald-400/40 animate-ping" />}
                  <span className="relative">{isListening ? <Check size={16} /> : <Mic size={16} />}</span>
                </button>
              )}
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
                placeholder={isListening ? "Hablá tranquilo…" : "Preguntale algo a tu entrenador…"}
                className="flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none min-w-0"
                disabled={isSending}
              />
              <button onClick={handleSend} disabled={!input.trim() || isSending} aria-label="Enviar" className="p-2.5 rounded-xl !text-white shrink-0 disabled:opacity-40 transition-all active:scale-95" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)" }}>
                <Send size={16} />
              </button>
            </div>
            <p className="text-[9px] text-slate-600 text-center mt-1.5">Puede cometer errores — no reemplaza el consejo de un profesional de la salud.</p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}


function ImportRoutineModal({ onImport, onClose }) {
  useAndroidBack(onClose);
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
      let extracted = "";
      if (["xlsx", "xls"].includes(ext)) {
        extracted = await extractTextFromExcelFile(file);
      } else if (ext === "pdf") {
        extracted = await extractTextFromPdfFile(file);
      } else if (["csv", "txt"].includes(ext)) {
        extracted = await file.text();
      } else if (ext === "docx" || ext === "doc") {
        setNotice("Para Word: abrí el archivo, copiá todo (Ctrl+A, Ctrl+C) y pegalo abajo.");
        setLoadingFile(false); return;
      } else {
        setNotice("Formato no reconocido. Probá con .pdf, .xlsx, .xls, .csv o .txt.");
        setLoadingFile(false); return;
      }
      setText(extracted);
      // Intentar detección local primero (instantánea)
      const local = parseRoutineFromText(extracted);
      if (local.length) {
        setParsed(buildImportedRoutineDef(local, routineName.trim() || file.name.replace(/\.[^.]+$/, "")));
        setLoadingFile(false); return;
      }
      // Si la detección local no encuentra nada, usar IA automáticamente
      setNotice("Detectando con IA…");
      setIsParsingAI(true);
      const res = await fetch("/api/ia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "detect", text: extracted }) });
      if (res.ok) {
        const result = await res.json();
        const rawText = result?.text || "";
        const cleaned = rawText.replace(/```json|```/g, "").trim();
        const days = JSON.parse(cleaned);
        if (Array.isArray(days) && days.length) {
          const parsedDays = days.map((d) => ({
            label: String(d.label || "Día").toUpperCase(),
            exercises: (d.exercises || []).map((ex) => {
              const lib = matchExerciseToLibrary(ex.name);
              const sets = Array.from({ length: Math.max(1, Math.min(8, ex.setsCount || 3)) }, () => ({ repRange: ex.repRange || "8-10" }));
              return lib ? { libId: lib.id, sets } : { id: builderUid("imported"), name: ex.name || "Ejercicio", muscle: "Personalizado", sets };
            }),
          }));
          setParsed(buildImportedRoutineDef(parsedDays, routineName.trim() || file.name.replace(/\.[^.]+$/, "")));
          setNotice("");
        } else { setNotice("La IA no pudo interpretar el archivo. Pegá el texto manualmente abajo."); }
      } else { setNotice("No se pudo detectar automáticamente. Pegá el texto abajo y tocá \"Detectar rutina\"."); }
    } catch {
      setNotice("No pudimos leer ese archivo. Probá copiando el texto directamente.");
    } finally {
      setLoadingFile(false); setIsParsingAI(false);
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
      <div className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 modal-bg-in modal-overlay" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-700/60 rounded-3xl max-w-sm w-full p-5 modal-pop-in shadow-2xl shadow-black/50 max-h-[88vh] overflow-y-auto overscroll-contain" onClick={(e) => e.stopPropagation()}>
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
    <div className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 modal-bg-in modal-overlay" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/60 rounded-3xl max-w-sm w-full p-5 modal-pop-in shadow-2xl shadow-black/50 max-h-[92vh] overflow-y-auto overscroll-contain" onClick={(e) => e.stopPropagation()}>
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
        <button onClick={handleProcess} disabled={!text.trim() || loadingFile} className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold transition-all active:scale-[0.98] ${text.trim() && !loadingFile ? "!text-white shadow-lg shadow-teal-500/20" : "bg-slate-800 text-slate-600"}`} style={text.trim() && !loadingFile ? { background: "linear-gradient(135deg,#14B8A6,#0E7490)" } : {}}>
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

function RoutineBuilder({ initialRoutine, onCancel, onSave, dumbbellDouble = null, onUpdateSettings = null }) {
  const isEditing = !!initialRoutine;
  const [name, setName] = useState(initialRoutine?.name || "");
  const [days, setDays] = useState(() => (initialRoutine ? builderDaysFromRoutineDef(initialRoutine) : [{ key: builderUid("day"), label: "DÍA 1", color: BUILDER_COLOR_PALETTE[0], exercises: [] }]));
  const [schedule, setSchedule] = useState(() => getRoutineWeekSchedule(initialRoutine || { dayOrder: days.map((d) => d.key) }));
  const [error, setError] = useState("");

  const addDay = () => setDays((d) => [...d, { key: builderUid("day"), label: `DÍA ${d.length + 1}`, color: BUILDER_COLOR_PALETTE[d.length % BUILDER_COLOR_PALETTE.length], exercises: [] }]);
  // Duplicar un día con todos sus ejercicios y series.
  //
  // IMPORTANTE: los ids de ejercicio se CONSERVAN, no se regeneran. Tu récord
  // de press banca es tuyo, no del día ni de la rutina: si al copiar el día le
  // cambiáramos el id, el press banca copiado sería "otro ejercicio" y
  // aparecería sin marcas. Que el mismo ejercicio esté en dos días es normal
  // (y ya está contemplado: las tarjetas se identifican por día:ejercicio).
  const duplicateDay = (idx) => {
    setDays((d) => {
      const orig = d[idx];
      if (!orig) return d;
      const copia = {
        key: builderUid("day"),   // la KEY del día sí es nueva (es otro día)
        label: `${orig.label} (copia)`,
        color: BUILDER_COLOR_PALETTE[d.length % BUILDER_COLOR_PALETTE.length],
        exercises: cloneRoutineDef(orig.exercises || []),  // copia profunda, mismos ids
      };
      const nuevo = [...d];
      nuevo.splice(idx + 1, 0, copia); // la copia va justo después del original
      return nuevo;
    });
    haptic(15);
  };
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
  const addCustomExercise = (dayIdx, rawName, muscle = "Personalizado") => setDays((d) => d.map((day, i) => (i !== dayIdx ? day : {
    ...day, exercises: [...day.exercises, { id: builderUid("custom"), libId: null, name: rawName, muscle, sets: mkSets(3, "8-10"), cardio: false, supersetNext: false }],
  })));
  const removeExercise = (dayIdx, exIdx) => setDays((d) => d.map((day, i) => (i === dayIdx ? { ...day, exercises: day.exercises.filter((_, j) => j !== exIdx) } : day)));
  const moveExercise = (dayIdx, exIdx, delta) => setDays((d) => d.map((day, i) => {
    if (i !== dayIdx) return day;
    const j = exIdx + delta; if (j < 0 || j >= day.exercises.length) return day;
    const n = [...day.exercises]; [n[exIdx], n[j]] = [n[j], n[exIdx]]; return { ...day, exercises: n };
  }));
  const configExercise = (dayIdx, exIdx, { setsCount, repRange, sets }) => setDays((d) => d.map((day, i) => (i !== dayIdx ? day : {
    ...day, exercises: day.exercises.map((e, j) => (j === exIdx ? {
      ...e,
      sets: sets
        ? sets  // sets completos pasados directamente (edición per-set)
        : Array.from({ length: setsCount }, (_, k) => ({ repRange: e.sets[k]?.repRange || repRange })),
    } : e)),
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
            dumbbellDouble={dumbbellDouble} onUpdateSettings={onUpdateSettings}
            onDuplicateDay={() => duplicateDay(idx)}
            onRename={(label) => renameDay(idx, label)} onRemove={() => removeDay(idx)} onMoveDay={(delta) => moveDay(idx, delta)} onChangeColor={(color) => changeDayColor(idx, color)}
            onAddExercise={(libEx) => addExercise(idx, libEx)} onAddCustomExercise={(rawName, muscle) => addCustomExercise(idx, rawName, muscle)}
            onRemoveExercise={(exIdx) => removeExercise(idx, exIdx)} onMoveExercise={(exIdx, delta) => moveExercise(idx, exIdx, delta)}
            onConfigExercise={(exIdx, cfg) => configExercise(idx, exIdx, cfg)} onToggleSuperset={(exIdx) => toggleSuperset(idx, exIdx)} />
        ))}
      </div>

      <button onClick={addDay} className="w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition text-sm font-semibold"><Plus size={14} /> Agregar día</button>

      {/* Balance EN VIVO mientras armás: acá es donde más sirve, porque podés
          corregir el desbalance antes de entrenar tres meses con la rutina
          torcida. Se actualiza solo a medida que agregás o sacás ejercicios. */}
      {days.some((d) => (d.exercises || []).length > 0) && (
        <div className="rounded-2xl bg-slate-900/50 border border-slate-800/60 p-3.5">
          <BalanceMuscular routineDef={{ days: Object.fromEntries(days.map((d) => [d.key, d])), dayOrder: days.map((d) => d.key) }} />
        </div>
      )}

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
// Asistente de rutina personalizada — preguntas visuales paso a paso,
// autocompleta el perfil y genera la rutina con IA con preview confirmable.
function PersonalizedRoutineWizard({ profile, onUpdateProfile, onCreateRoutine, onActivate, onClose }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({
    sex: profile?.sex || null, age: profile?.age || "", weight: "", height: profile?.heightCm || "",
    experience: null, place: null, daysPerWeek: null, minutes: null, goals: [], focus: [],
  });
  const [inputVal, setInputVal] = useState("");
  const [multiSel, setMultiSel] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [preview, setPreview] = useState(null);

  const STEPS = [
    { key: "sex", icon: <UserCog size={18} />, q: "¿Sos hombre o mujer?", hint: "Ajusta los estándares de fuerza a tu contexto",
      chips: [{ v: "M", l: "💪 Hombre" }, { v: "F", l: "🏋️‍♀️ Mujer" }] },
    { key: "age", icon: <Calendar size={18} />, q: "¿Cuántos años tenés?", hint: "",
      input: { placeholder: "Ej: 25", unit: "años" } },
    { key: "weight", icon: <Activity size={18} />, q: "¿Cuánto pesás?", hint: "Se usa para el ranking muscular y las cargas iniciales",
      input: { placeholder: "Ej: 75", unit: "kg" } },
    { key: "height", icon: <Ruler size={18} />, q: "¿Cuánto medís?", hint: "",
      input: { placeholder: "Ej: 175", unit: "cm" } },
    { key: "experience", icon: <Award size={18} />, q: "¿Cuál es tu nivel de experiencia?", hint: "Sé honesto — la rutina se ajusta a tu nivel real",
      chips: [{ v: "principiante", l: "🌱 Principiante", d: "Menos de 1 año" }, { v: "intermedio", l: "⚡ Intermedio", d: "1 a 3 años" }, { v: "avanzado", l: "🔥 Avanzado", d: "Más de 3 años" }] },
    { key: "place", icon: <Dumbbell size={18} />, q: "¿Dónde vas a entrenar?", hint: "",
      chips: [{ v: "gym", l: "🏢 Gimnasio completo", d: "Máquinas, barras y mancuernas" }, { v: "casa_equipada", l: "🏠 Casa con equipo", d: "Mancuernas, bandas o barra" }, { v: "casa", l: "🤸 Solo peso corporal", d: "Sin equipamiento" }] },
    { key: "daysPerWeek", icon: <Calendar size={18} />, q: "¿Cuántos días a la semana?", hint: "Mejor 3 días consistentes que 6 imposibles",
      chips: [{ v: 2, l: "2" }, { v: 3, l: "3" }, { v: 4, l: "4" }, { v: 5, l: "5" }, { v: 6, l: "6" }], compact: true },
    { key: "minutes", icon: <Clock size={18} />, q: "¿Cuánto tiempo por sesión?", hint: "",
      chips: [{ v: 30, l: "30 min" }, { v: 45, l: "45 min" }, { v: 60, l: "1 hora" }, { v: 90, l: "1:30+" }], compact: true },
    { key: "goals", icon: <Target size={18} />, q: "¿Cuáles son tus objetivos?", hint: "Podés elegir más de uno", multi: true,
      chips: [{ v: "hipertrofia", l: "💪 Ganar músculo" }, { v: "fuerza", l: "🏋️ Ganar fuerza" }, { v: "potencia", l: "⚡ Potencia" }, { v: "grasa", l: "🔥 Perder grasa" }, { v: "resistencia", l: "🏃 Resistencia" }, { v: "salud", l: "❤️ Salud general" }] },
    { key: "focus", icon: <Flame size={18} />, q: "¿Querés priorizar algún grupo muscular?", hint: "Opcional — podés elegir varios o saltear", multi: true, optional: true,
      chips: [{ v: "pecho", l: "Pecho" }, { v: "espalda", l: "Espalda" }, { v: "hombros", l: "Hombros" }, { v: "brazos", l: "Brazos" }, { v: "piernas", l: "Piernas" }, { v: "gluteo", l: "Glúteos" }, { v: "core", l: "Core / Abs" }] },
  ];
  const current = STEPS[step];
  const isLastQuestion = step === STEPS.length - 1;

  const advance = (next) => {
    setAnswers(next); setInputVal(""); setMultiSel([]);
    if (isLastQuestion) generateRoutine(next); else setStep((s) => s + 1);
  };
  const answer = (val) => advance({ ...answers, [current.key]: val });
  const answerMulti = () => advance({ ...answers, [current.key]: multiSel });
  const toggleMulti = (v) => setMultiSel((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);

  const generateRoutine = async (a) => {
    setGenerating(true); setGenError("");
    // Guardar los datos del perfil de una — aunque la generación falle,
    // las respuestas no se pierden.
    const profileUpdates = {};
    if (a.sex) profileUpdates.sex = a.sex;
    if (a.age) profileUpdates.age = parseInt(a.age, 10) || null;
    if (a.height) profileUpdates.heightCm = parseInt(a.height, 10) || null;
    if (a.weight) profileUpdates.settings = { ...(getProfileSettings(profile)), bodyWeightKg: parseFloat(a.weight) || 0, sex: a.sex || null };
    onUpdateProfile?.(profileUpdates);

    const goalLabels = { hipertrofia: "hipertrofia (ganar músculo)", fuerza: "fuerza máxima", potencia: "potencia explosiva", grasa: "pérdida de grasa", resistencia: "resistencia muscular", salud: "salud general" };
    const goalsTxt = (a.goals || []).map((g) => goalLabels[g] || g).join(" + ") || "salud general";
    const placeTxt = { gym: "gimnasio completo con máquinas, barras y mancuernas", casa_equipada: "casa con mancuernas y equipo básico", casa: "solo con peso corporal, sin equipamiento" }[a.place] || "gimnasio";
    const focusTxt = (a.focus || []).length ? `Priorizar estos grupos musculares con más volumen: ${a.focus.join(", ")}.` : "";
    const prompt = [
      `Creá una rutina de gimnasio personalizada para: ${a.sex === "F" ? "mujer" : "hombre"} de ${a.age} años, ${a.weight} kg, ${a.height} cm, nivel ${a.experience}.`,
      `Entrena ${a.daysPerWeek} días por semana, ${a.minutes} minutos por sesión, en ${placeTxt}.`,
      `Objetivos: ${goalsTxt}. ${focusTxt}`,
      `Ajustá la cantidad de ejercicios al tiempo disponible (aprox 1 ejercicio cada 10-12 min).`,
      `Si el objetivo incluye fuerza o potencia, incluí básicos pesados a bajas reps (3-6); si incluye hipertrofia, trabajo en 8-12; si incluye resistencia o grasa, series de 12-20 o circuitos.`,
      `Devolvé ÚNICAMENTE un array JSON válido, sin texto adicional ni markdown:`,
      `[{"label": "Día 1 - Empuje", "exercises": [{"name": "Press Banca", "setsCount": 3, "repRange": "8-10"}]}]`,
      `Usá nombres de ejercicios comunes en español. El array debe tener exactamente ${a.daysPerWeek} días.`,
    ].join("\n");
    try {
      const res = await fetch("/api/ia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "chat", systemPrompt: "Sos un entrenador experto. Respondés ÚNICAMENTE con JSON válido, sin explicaciones ni bloques de código.", history: [{ role: "user", parts: [{ text: prompt }] }] }) });
      if (!res.ok) throw new Error("server");
      const data = await res.json();
      const raw = data?.text || "";
      // Extracción ROBUSTA del JSON: Gemini a veces envuelve la respuesta
      // con texto ("Aquí está tu rutina: [...]") aunque se le pida JSON
      // puro — eso rompía JSON.parse y tiraba error siempre. Tomamos del
      // primer "[" al último "]" y parseamos solo eso.
      const first = raw.indexOf("["); const last = raw.lastIndexOf("]");
      if (first === -1 || last === -1 || last <= first) throw new Error("no-json");
      const days = JSON.parse(raw.slice(first, last + 1));
      if (!Array.isArray(days) || !days.length) throw new Error("empty");
      const parsedDays = days.map((d) => ({
        label: String(d.label || "Día").toUpperCase(),
        exercises: (d.exercises || []).map((ex) => {
          const lib = matchExerciseToLibrary(ex.name);
          const sets = Array.from({ length: Math.max(1, Math.min(8, ex.setsCount || 3)) }, () => ({ repRange: ex.repRange || "8-10" }));
          return lib ? { libId: lib.id, sets } : { id: builderUid("wizard"), name: ex.name || "Ejercicio", muscle: "Personalizado", sets };
        }),
      }));
      setPreview(buildImportedRoutineDef(parsedDays, "Mi rutina personalizada"));
    } catch (err) {
      console.error("Error generando rutina:", err);
      setGenError("No pudimos generar la rutina. Revisá tu conexión e intentá de nuevo — o elegí una rutina prearmada y personalizala después.");
    } finally {
      setGenerating(false);
    }
  };

  const handleConfirm = () => {
    if (!preview) return;
    const id = builderUid("wizard_routine");
    onCreateRoutine(id, preview);
    onActivate(id, preview);
    onClose();
  };

  return (
    <div className="space-y-4">
      {/* Hero visual del asistente */}
      <div className="relative overflow-hidden rounded-2xl border border-teal-500/25 p-4" style={{ background: "var(--panel-grad-emerald)" }}>
        <div className="absolute -top-10 -right-6 w-36 h-36 rounded-full bg-teal-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-28 h-28 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500/30 to-cyan-500/10 border border-teal-500/30 flex items-center justify-center shrink-0">
            <Dumbbell size={20} className="text-teal-400" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-teal-400">Asistente IA</p>
            <h2 className="text-base font-black text-white leading-tight">Tu rutina, a tu medida</h2>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={step > 0 && !preview && !generating ? () => setStep((s) => s - 1) : onClose} className="flex items-center gap-1 text-slate-500 hover:text-white transition text-xs font-bold"><ChevronLeft size={14} /> {step > 0 && !preview && !generating ? "Anterior" : "Volver"}</button>
        <span className="text-[10px] text-slate-600 font-bold">{preview ? "Revisá tu rutina" : generating ? "Generando..." : `${step + 1} / ${STEPS.length}`}</span>
      </div>

      <div className="flex gap-1">
        {STEPS.map((_, i) => (
          <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300" style={{ backgroundColor: i <= step || preview ? "#14B8A6" : "var(--surface-2)" }} />
        ))}
      </div>

      {!generating && !preview && !genError && (
        <div className="rounded-2xl border border-teal-500/20 p-5 bounce-in" style={{ background: "var(--panel-grad-emerald)" }} key={step}>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/25 flex items-center justify-center shrink-0 text-teal-400">{current.icon}</div>
            <div>
              <p className="text-base font-black text-white leading-snug">{current.q}</p>
              {current.hint && <p className="text-[11px] text-slate-500 mt-1">{current.hint}</p>}
            </div>
          </div>
          {current.chips ? (
            <>
            <div className={current.compact ? "flex gap-2" : "grid grid-cols-1 sm:grid-cols-2 gap-2"}>
              {current.chips.map((chip) => {
                const selected = current.multi && multiSel.includes(chip.v);
                return (
                  <button key={chip.v}
                    onClick={() => current.multi ? toggleMulti(chip.v) : answer(chip.v)}
                    className={`${current.compact ? "flex-1 py-3 text-center" : "px-4 py-3 text-left"} rounded-xl border text-sm font-bold transition active:scale-95 ${selected ? "border-teal-500/60 text-teal-300" : "bg-slate-800/70 border-slate-700 text-slate-200 hover:border-teal-500/40"}`}
                    style={selected ? { background: "linear-gradient(135deg,#14B8A620,#0E749010)" } : {}}>
                    <span className="block">{chip.l}</span>
                    {chip.d && <span className={`block text-[10px] font-medium mt-0.5 ${selected ? "text-teal-400/70" : "text-slate-500"}`}>{chip.d}</span>}
                  </button>
                );
              })}
            </div>
            {current.multi && (
              <button onClick={answerMulti} disabled={!current.optional && multiSel.length === 0} className="w-full mt-3 py-3 rounded-xl !text-white text-sm font-black transition active:scale-95 disabled:opacity-30" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)" }}>
                {multiSel.length === 0 && current.optional ? "Saltear" : "Continuar"} {multiSel.length > 0 && `(${multiSel.length})`}
              </button>
            )}
            </>
          ) : (
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input type="number" inputMode="numeric" value={inputVal} onChange={(e) => setInputVal(e.target.value)} placeholder={current.input.placeholder} autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter" && inputVal.trim()) answer(inputVal.trim()); }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-teal-500/60" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-600 font-bold">{current.input.unit}</span>
              </div>
              <button onClick={() => inputVal.trim() && answer(inputVal.trim())} disabled={!inputVal.trim()} className="px-5 rounded-xl text-white font-bold text-sm disabled:opacity-30 transition active:scale-95" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)" }}>OK</button>
            </div>
          )}
        </div>
      )}

      {generating && (
        <div className="rounded-2xl border border-teal-500/20 p-8 flex flex-col items-center gap-4 text-center" style={{ background: "var(--panel-grad-emerald)" }}>
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-[3px] border-teal-500/20 border-t-teal-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center"><Dumbbell size={22} className="text-teal-400 soft-pulse" /></div>
          </div>
          <div>
            <p className="text-sm font-black text-white">Armando tu rutina personalizada...</p>
            <p className="text-[11px] text-slate-500 mt-1">La IA está diseñando un plan a tu medida.<br/>Puede tardar unos segundos.</p>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => <div key={i} className="w-1.5 h-1.5 rounded-full bg-teal-500 soft-pulse" style={{ animationDelay: `${i * 0.3}s` }} />)}
          </div>
        </div>
      )}

      {genError && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5 text-center space-y-3">
          <AlertTriangle size={22} className="text-amber-400 mx-auto" />
          <p className="text-sm text-slate-300">{genError}</p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => { setGenError(""); generateRoutine(answers); }} className="px-4 py-2 rounded-xl text-white text-xs font-bold" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)" }}>Reintentar</button>
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 text-xs font-bold">Ver rutinas prearmadas</button>
          </div>
        </div>
      )}

      {preview && (
        <div className="space-y-3 bounce-in">
          <div className="rounded-2xl border border-teal-500/25 p-4" style={{ background: "var(--panel-grad-emerald)" }}>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/25 flex items-center justify-center"><Check size={17} className="text-teal-400" /></div>
              <div>
                <p className="text-sm font-black text-white">{preview.name}</p>
                <p className="text-[10px] text-slate-500">{preview.dayOrder.length} días · hecha a tu medida · revisala y confirmá</p>
              </div>
            </div>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto overscroll-contain">
              {preview.dayOrder.map((dk, di) => {
                const d = preview.days[dk];
                const color = d.color || ["#14B8A6", "#3B82F6", "#A855F7", "#F59E0B", "#EF4444", "#10B981"][di % 6];
                return (
                  <div key={dk} className="bg-slate-900/60 rounded-xl p-3 border-l-2" style={{ borderColor: color }}>
                    <p className="text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color }}>{d.label}</p>
                    {(d.exercises || []).map((ex, i) => {
                      const lib = ex.libId ? EXERCISE_LIBRARY_BY_ID[ex.libId] : null;
                      return <p key={i} className="text-xs text-slate-300 py-0.5">• {lib?.name || ex.name} <span className="text-slate-600">— {ex.sets?.length || 0}×{ex.sets?.[0]?.repRange || ""}</span></p>;
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-400 text-sm font-bold hover:text-white transition">Descartar</button>
            <button onClick={handleConfirm} className="flex-1 py-3 rounded-xl !text-white text-sm font-black transition active:scale-95" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)" }}>Usar esta rutina</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── HELPERS DE RUTINAS ────────────────────────────────────────────────────
// Cuenta las series por grupo muscular de una rutina entera. Sirve para
// mostrar el balance (¿le estás dando 12 series a pecho y 4 a espalda?) sin
// que tengas que sumarlas a mano. Solo cuenta el músculo PRINCIPAL de cada
// ejercicio: sumar los secundarios daría números inflados y confusos.
function volumenPorMusculo(routineDef) {
  if (!routineDef?.days) return [];
  const conteo = {};
  Object.values(routineDef.days).forEach((day) => {
    (day.exercises || []).forEach((ex) => {
      const lib = EXERCISE_LIBRARY_BY_ID[ex.libId || ex.id];
      const g = lib?.group;
      if (!g || g === "cardio") return;
      conteo[g] = (conteo[g] || 0) + (ex.sets?.length || 0);
    });
  });
  return Object.entries(conteo)
    .map(([g, series]) => ({
      grupo: g,
      label: MUSCLE_GROUP_BY_KEY[g]?.label || g,
      color: MUSCLE_GROUP_BY_KEY[g]?.color || "#64748b",
      series,
    }))
    .sort((a, b) => b.series - a.series);
}

// Cuántas sesiones hiciste con una rutina y cuándo fue la última. Con varias
// rutinas archivadas, esto es lo que te permite acordarte de cuál era cuál.
function usoDeRutina(routineId, sessions) {
  const propias = (sessions || []).filter((s) => s?.routineId === routineId && s?.date);
  if (!propias.length) return { sesiones: 0, ultimaVez: null, diasDesde: null };
  const fechas = propias.map((s) => s.date).sort();
  const ultima = fechas[fechas.length - 1];
  const dias = Math.round((new Date(todayStr()) - new Date(ultima)) / 86400000);
  return { sesiones: propias.length, ultimaVez: ultima, diasDesde: dias };
}

// Texto humano para "hace cuánto": "hoy", "ayer", "hace 3 días", "hace 2 meses"
function haceCuanto(dias) {
  if (dias == null) return null;
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;
  if (dias < 14) return "hace 1 semana";
  if (dias < 30) return `hace ${Math.floor(dias / 7)} semanas`;
  if (dias < 60) return "hace 1 mes";
  if (dias < 365) return `hace ${Math.floor(dias / 30)} meses`;
  return "hace más de un año";
}

// Balance muscular de una rutina: barras horizontales, la más entrenada
// arriba. Se muestra COLAPSADO por defecto (solo los 3 primeros + un "ver
// todos") para no saturar: lo importante es detectar el desbalance de un
// vistazo, no leer una tabla.
function BalanceMuscular({ routineDef, compacto = true }) {
  const [expandido, setExpandido] = useState(false);
  const datos = useMemo(() => volumenPorMusculo(routineDef), [routineDef]);
  if (!datos.length) return null;

  const max = datos[0].series;
  const mostrar = (compacto && !expandido) ? datos.slice(0, 3) : datos;
  const totalSeries = datos.reduce((a, d) => a + d.series, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Balance muscular</span>
        <span className="text-[9px] text-slate-600 tabular-nums">{totalSeries} series</span>
      </div>
      <div className="space-y-1.5">
        {mostrar.map((d, i) => (
          <div key={d.grupo} className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 w-[88px] shrink-0 truncate">{d.label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-slate-800/70 overflow-hidden">
              <div
                className="h-full rounded-full grow-bar"
                style={{
                  width: `${(d.series / max) * 100}%`,
                  backgroundColor: d.color,
                  animationDelay: `${i * 60}ms`,
                }}
              />
            </div>
            <span className="text-[10px] font-bold text-slate-500 tabular-nums w-4 text-right shrink-0">{d.series}</span>
          </div>
        ))}
      </div>
      {compacto && datos.length > 3 && (
        <button
          onClick={() => setExpandido((v) => !v)}
          className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-slate-700/70 text-[10px] font-bold text-slate-400 hover:text-white hover:border-slate-500 transition active:scale-[0.99]"
        >
          {expandido ? "Ver menos" : `Ver los ${datos.length} grupos`}
          <ChevronDown size={11} className="transition-transform duration-200" style={{ transform: expandido ? "rotate(180deg)" : "none" }} />
        </button>
      )}
    </div>
  );
}

// Vista previa de una rutina ANTES de activarla. Hoy la activás a ciegas: el
// nombre y "4 días" no te dicen si te sirve. Acá ves los días, sus ejercicios
// y el balance muscular, y recién ahí decidís. Los días arrancan colapsados
// (solo el primero abierto) para que no te caiga un muro de texto encima.
// Vista previa completa de una rutina, en pop-up (mismo lenguaje visual que el
// detalle de una sesión del historial). Ves los días, sus ejercicios y el
// balance ANTES de activarla, en vez de hacerlo a ciegas.
function RoutinePreviewModal({ routineDef, routineName, onActivate, onClose, yaActiva = false, onDuplicate = null, onEditCopy = null }) {
  useAndroidBack(onClose);
  const dias = routineDef?.dayOrder || Object.keys(routineDef?.days || {});
  const [abierto, setAbierto] = useState(dias[0] || null);
  if (!routineDef) return null;

  const totalEjercicios = dias.reduce((a, dk) => a + (routineDef.days[dk]?.exercises?.length || 0), 0);
  const totalSeries = dias.reduce(
    (a, dk) => a + (routineDef.days[dk]?.exercises || []).reduce((b, e) => b + (e.sets?.length || 0), 0),
    0
  );

  return (
    <div className="fixed inset-0 z-[130] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 modal-bg-in modal-overlay" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[86vh] flex flex-col bg-slate-900 border border-slate-700/60 rounded-3xl overflow-hidden modal-pop-in shadow-2xl shadow-black/70"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado con un halo violeta suave, como el héroe */}
        <div className="relative px-5 pt-5 pb-4 border-b border-slate-800/60 shrink-0 overflow-hidden">
          <div className="absolute -top-14 -right-10 w-36 h-36 rounded-full bg-purple-500/15 blur-3xl pointer-events-none" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[9px] font-black uppercase tracking-[0.16em] text-purple-400/80">Vista previa</span>
              <p className="text-lg font-black text-white leading-tight mt-0.5 truncate">{routineName}</p>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition shrink-0">
              <X size={16} />
            </button>
          </div>
          {/* Tres números clave, como las estadísticas de una sesión */}
          <div className="relative grid grid-cols-3 gap-2 mt-3.5">
            {[
              { v: dias.length, l: dias.length === 1 ? "Día" : "Días" },
              { v: totalEjercicios, l: "Ejercicios" },
              { v: totalSeries, l: "Series" },
            ].map((s) => (
              <div key={s.l} className="bg-black/25 rounded-xl py-2 text-center border border-white/[0.05]">
                <p className="text-base font-black text-white tabular-nums leading-none">{s.v}</p>
                <p className="text-[9px] text-slate-500 mt-1">{s.l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Cuerpo con scroll */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
          <div className="rounded-2xl bg-slate-950/50 border border-slate-800/60 p-3.5">
            <BalanceMuscular routineDef={routineDef} />
          </div>

          <div className="space-y-2">
            {dias.map((dk) => {
              const day = routineDef.days[dk];
              if (!day) return null;
              const esteAbierto = abierto === dk;
              const seriesDia = (day.exercises || []).reduce((a, e) => a + (e.sets?.length || 0), 0);
              return (
                <div
                  key={dk}
                  className="rounded-2xl border overflow-hidden transition-all"
                  style={{
                    borderColor: esteAbierto ? day.color + "45" : "rgba(30,41,59,0.6)",
                    backgroundColor: esteAbierto ? day.color + "0b" : "rgba(15,23,42,0.4)",
                  }}
                >
                  <button onClick={() => setAbierto(esteAbierto ? null : dk)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left">
                    {/* Barra de color vertical: identifica el día sin inundar */}
                    <span className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: day.color }} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-black text-white truncate">{day.label}</span>
                      <span className="block text-[10px] text-slate-500 tabular-nums">
                        {day.exercises?.length || 0} ejercicios · {seriesDia} series
                      </span>
                    </span>
                    <ChevronDown size={14} className="text-slate-600 shrink-0 transition-transform duration-200" style={{ transform: esteAbierto ? "rotate(180deg)" : "none" }} />
                  </button>

                  {esteAbierto && (
                    <div className="px-3.5 pb-3 pt-0.5 space-y-1.5 bounce-in">
                      {(day.exercises || []).map((ex, i) => {
                        const lib = EXERCISE_LIBRARY_BY_ID[ex.libId || ex.id];
                        const sets = ex.sets?.length || 0;
                        const rango = ex.sets?.[0]?.repRange || null;
                        return (
                          <div key={`${dk}:${ex.id || ex.libId}:${i}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 bg-black/20">
                            <span className="w-4 h-4 rounded-md flex items-center justify-center text-[8px] font-black shrink-0 tabular-nums" style={{ backgroundColor: day.color + "25", color: day.color }}>
                              {i + 1}
                            </span>
                            <span className="flex-1 min-w-0 truncate text-[11px] text-slate-300">{lib?.name || ex.name || ex.libId}</span>
                            <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
                              {sets}{rango ? `×${rango}` : ""}
                            </span>
                          </div>
                        );
                      })}
                      {(day.exercises || []).length === 0 && (
                        <p className="text-[10px] text-slate-600 italic py-1">Sin ejercicios en este día.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Botón fijo abajo */}
        <div className="border-t border-slate-800/60 px-5 py-3.5 shrink-0 bg-slate-900 space-y-2">
          {/* Acciones secundarias: duplicar (rutinas tuyas) o editar una copia
              (preestablecidas). Antes vivían en la expansión inline. */}
          {(onDuplicate || onEditCopy) && (
            <div className="flex gap-2">
              {onDuplicate && (
                <button onClick={() => { onDuplicate(); onClose(); }} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold text-slate-400 bg-slate-800/60 border border-slate-700/50 hover:text-white transition active:scale-[0.98]">
                  <Copy size={12} /> Duplicar
                </button>
              )}
              {onEditCopy && (
                <button onClick={() => { onEditCopy(); onClose(); }} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold text-slate-400 bg-slate-800/60 border border-slate-700/50 hover:text-white transition active:scale-[0.98]">
                  <Edit3 size={12} /> Editar una copia
                </button>
              )}
            </div>
          )}
          {yaActiva ? (
            <div className="w-full py-3 rounded-2xl text-sm font-black text-center bg-slate-800/70 text-slate-500 flex items-center justify-center gap-1.5">
              <Check size={14} /> Ya es tu rutina activa
            </div>
          ) : (
            <button
              onClick={() => { onActivate?.(); onClose(); }}
              className="w-full py-3 rounded-2xl text-sm font-black !text-white transition active:scale-[0.98] shadow-lg shadow-purple-500/25 flex items-center justify-center gap-1.5"
              style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
            >
              <Sparkles size={14} /> Usar esta rutina
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RoutinesView({ profile, forced, onActivate, onUpdate, onArchive, onRestore, onUpdateProfile, openScheduleSignal = 0, openEditorSignal = 0 }) {
  const [mode, setMode] = useState("catalog");
  const [showWizard, setShowWizard] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [showPresetsForced, setShowPresetsForced] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showBalance, setShowBalance] = useState(false);   // balance muscular del héroe
  const [preview, setPreview] = useState(null);            // {def, name, id, isPreset} de la rutina en vista previa
  const scheduleRef = useRef(null);
  // Al llegar desde el aviso "hoy es descanso" (que incrementa la señal),
  // abrimos el editor de días y scrolleamos hasta él.
  useEffect(() => {
    if (openScheduleSignal <= 0) return;
    setShowSchedule(true);
    const t = setTimeout(() => { try { scheduleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { /* ignorado a propósito */ } }, 150);
    return () => clearTimeout(t);
  }, [openScheduleSignal]);

  // Al llegar desde "agregar ejercicios de [músculo] a mi rutina" (en el
  // muñeco), abrimos DIRECTO el armador de la rutina activa — no la lista
  // de rutinas, que obligaba a buscarla y tocar "Editar" a mano.
  useEffect(() => {
    if (openEditorSignal <= 0) return;
    const activeId = profile?.activeRoutineId;
    if (!activeId) return;
    const def = (profile?.routines || {})[activeId];
    if (!def) return;
    if (def.source === "preset") {
      // Una preestablecida no se puede editar en sitio: se clona (mismo
      // criterio que el botón "Editar" del catálogo). Inlineado a propósito:
      // handleEditPreset se declara más abajo y llamarlo acá daría TDZ.
      const newId = builderUid("custom_routine");
      const clone = { ...cloneRoutineDef(def), source: "custom", name: `${def.name} (mi copia)` };
      onUpdate(newId, clone);
      setEditingRoutineId(newId);
      setMode("builder");
    } else {
      setEditingRoutineId(activeId);
      setMode("builder");
    }
    // eslint-disable-next-line
  }, [openEditorSignal]);
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

  // Cuántas veces usaste la rutina activa y cuándo fue la última
  const activeUso = useMemo(
    () => usoDeRutina(activeId, profile?.trainingSessions),
    [activeId, profile?.trainingSessions]
  );

  // Uso de TODAS las rutinas en UNA sola pasada por el historial. Si llamáramos
  // a usoDeRutina dentro del .map, recorreríamos las sesiones enteras una vez
  // por rutina, en cada render (con 5 rutinas y 200 sesiones: 1000 iteraciones
  // por render, y hay muchos renders).
  const usoPorRutina = useMemo(() => {
    const acc = {};
    (profile?.trainingSessions || []).forEach((s) => {
      if (!s?.routineId || !s?.date) return;
      const e = (acc[s.routineId] ||= { sesiones: 0, ultimaVez: null, diasDesde: null });
      e.sesiones++;
      if (!e.ultimaVez || s.date > e.ultimaVez) e.ultimaVez = s.date;
    });
    const hoy = new Date(todayStr());
    Object.values(acc).forEach((e) => {
      e.diasDesde = e.ultimaVez ? Math.round((hoy - new Date(e.ultimaVez)) / 86400000) : null;
    });
    return acc;
  }, [profile?.trainingSessions]);

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
  // Duplicar una rutina propia: querés probar una variante sin romper la que
  // ya usás. Antes había que rearmarla entera a mano.
  const handleDuplicate = (id, def) => {
    const newId = builderUid("custom_routine");
    const clone = { ...cloneRoutineDef(def), source: "custom", name: `${def.name} (copia)` };
    onUpdate(newId, clone);
    haptic(15);
  };

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
        <button onClick={confirmPendingActivation} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl !text-white text-sm font-bold transition-all active:scale-[0.98] shadow-lg shadow-purple-500/20" style={{ background: "linear-gradient(135deg,#A855F7,#7E22CE)" }}><Check size={15} /> Listo, empezar a entrenar</button>
      </div>
    );
  }

  if (mode === "builder") {
    return (
      <RoutineBuilder
        dumbbellDouble={getProfileSettings(profile)?.dumbbellDouble || null}
        onUpdateSettings={(patch) => onUpdateProfile?.({ settings: { ...getProfileSettings(profile), ...patch } })}
        initialRoutine={editingRoutineId ? routines[editingRoutineId] : null}
        onCancel={() => { setMode("catalog"); setEditingRoutineId(null); }}
        onSave={(def) => {
          if (editingRoutineId) { onUpdate(editingRoutineId, def); setMode("catalog"); setEditingRoutineId(null); }
          else { handleUseClick(builderUid("custom_routine"), def); setEditingRoutineId(null); }
        }}
      />
    );
  }

  if (showWizard) {
    return (
      <PersonalizedRoutineWizard
        profile={profile}
        onUpdateProfile={onUpdateProfile}
        onCreateRoutine={(id, def) => onUpdate(id, def)}
        onActivate={(id, def) => onActivate(id, def)}
        onClose={() => setShowWizard(false)}
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

      {forced && (
        <div className="space-y-2.5">
          {/* Opción 1: Crear rutina (expande IA / Manual) */}
          <div className={`rounded-2xl border overflow-hidden transition-all ${createOpen ? "border-teal-500/40" : "border-teal-500/25"}`} style={{ background: "var(--panel-grad-emerald)" }}>
            <button onClick={() => { setCreateOpen((o) => !o); setShowPresetsForced(false); }} className="relative overflow-hidden w-full p-4 text-left transition active:scale-[0.99]">
              <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-teal-500/15 blur-2xl pointer-events-none" />
              <div className="relative flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center shrink-0"><Plus size={19} className="text-teal-400" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white">Crear mi rutina</p>
                  <p className="text-[11px] text-teal-300/60 mt-0.5">Con ayuda de la IA o armándola vos</p>
                </div>
                <ChevronDown size={16} className={`text-teal-500 shrink-0 transition-transform ${createOpen ? "rotate-180" : ""}`} />
              </div>
            </button>
            {createOpen && (
              <div className="px-3 pb-3 space-y-2 tab-fade-in">
                <button onClick={() => setShowWizard(true)} className="w-full flex items-center gap-3 rounded-xl border border-teal-500/25 bg-teal-500/5 p-3.5 text-left transition active:scale-[0.98] hover:border-teal-500/50">
                  <div className="w-9 h-9 rounded-xl bg-teal-500/15 flex items-center justify-center shrink-0"><Sparkles size={16} className="text-teal-400" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-black text-white">Personalizada con IA</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Respondé unas preguntas y la IA arma tu plan</p>
                  </div>
                  <ChevronRight size={14} className="text-teal-500 shrink-0" />
                </button>
                <button onClick={() => { setEditingRoutineId(null); setMode("builder"); }} className="w-full flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-800/40 p-3.5 text-left transition active:scale-[0.98] hover:border-slate-500">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0"><Edit3 size={15} className="text-purple-400" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-black text-white">Manualmente</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Elegí vos cada día, ejercicio y serie</p>
                  </div>
                  <ChevronRight size={14} className="text-slate-600 shrink-0" />
                </button>
              </div>
            )}
          </div>

          {/* Opción 2: Preestablecidas */}
          <button onClick={() => { setShowPresetsForced((s) => !s); setCreateOpen(false); }} className={`relative overflow-hidden w-full rounded-2xl border p-4 text-left transition active:scale-[0.99] ${showPresetsForced ? "border-purple-500/40" : "border-purple-500/25"}`} style={{ background: "var(--grad-hero-purple, linear-gradient(135deg,#1a1025,#0f172a))" }}>
            <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-purple-500/15 blur-2xl pointer-events-none" />
            <div className="relative flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shrink-0"><Layers size={18} className="text-purple-400" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-white">Elegir una preestablecida</p>
                <p className="text-[11px] text-purple-300/60 mt-0.5">Push/Pull/Legs, Arnold, Upper/Lower y más</p>
              </div>
              <ChevronDown size={16} className={`text-purple-500 shrink-0 transition-transform ${showPresetsForced ? "rotate-180" : ""}`} />
            </div>
          </button>

          {/* Opción 3: Importar */}
          <button onClick={() => setShowImport(true)} className="relative overflow-hidden w-full rounded-2xl border border-slate-700/60 p-4 text-left transition active:scale-[0.99] hover:border-slate-500 bg-slate-900/40">
            <div className="relative flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0"><Download size={17} className="text-slate-400" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-white">Importar una rutina</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Desde PDF, Excel, Word o texto</p>
              </div>
              <ChevronRight size={16} className="text-slate-600 shrink-0" />
            </div>
          </button>
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
        // ── HÉROE: la rutina activa domina la pantalla ──────────────────────
        // Antes era una tarjeta más entre otras. Ahora es lo primero y lo más
        // grande: ves sus días de un vistazo (con su color), y el detalle
        // (balance, cronograma) queda a un toque para no saturar.
        <div className="relative overflow-hidden rounded-3xl border p-4 shadow-lg shadow-black/25 breathe" style={{ background: "var(--grad-hero-purple)", borderColor: "rgba(168,85,247,0.3)", "--breathe-color": "rgba(168,85,247,0.35)" }}>
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-purple-500/20 blur-3xl pointer-events-none" />

          <div className="relative flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-purple-500/25 text-purple-200 flex items-center justify-center shrink-0 ring-1 ring-inset ring-white/10"><Dumbbell size={18} /></div>
            <div className="min-w-0 flex-1">
              <span className="text-[9px] font-black uppercase tracking-[0.16em] text-purple-300/90">Tu rutina activa</span>
              <h3 className="text-[17px] font-black text-white leading-tight truncate">{activeDef.name}</h3>
              <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                {activeStats.days} días · {activeStats.exercises} ejercicios · {activeStats.sets} series
                {activeUso.sesiones > 0 && <span className="text-slate-500"> · {activeUso.sesiones} sesion{activeUso.sesiones !== 1 ? "es" : ""}</span>}
              </p>
            </div>
            <button onClick={() => setShareTarget(activeDef)} aria-label="Compartir rutina activa" className="p-2 rounded-xl text-purple-200 hover:text-white hover:bg-white/10 transition shrink-0"><Share2 size={15} /></button>
          </div>

          {/* Los días, en grilla SIMÉTRICA de 2 columnas: si son impares, el
              último ocupa el ancho completo — nunca queda un 3 arriba y 1
              abajo descolgado. El color del día es una franja vertical fina
              (el lenguaje visual del resto de la app), no un puntito. */}
          <div className="relative grid grid-cols-2 gap-1.5 mt-3.5">
            {(() => {
              const orden = (activeDef.dayOrder || Object.keys(activeDef.days || {})).filter((dk) => activeDef.days?.[dk]);
              return orden.map((dk, i) => {
                const d = activeDef.days[dk];
                const ultimoImpar = i === orden.length - 1 && orden.length % 2 === 1;
                return (
                  <span key={dk} className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-[10px] font-bold bg-black/25 border border-white/[0.07] min-w-0 ${ultimoImpar ? "col-span-2" : ""}`}>
                    <span className="flex-1 min-w-0 truncate text-slate-300">{d.label}</span>
                    <span className="text-slate-500 tabular-nums shrink-0">{d.exercises?.length || 0}</span>
                  </span>
                );
              });
            })()}
          </div>

          {/* Acciones: dos botones parejos, sin ruido */}
          <div className="relative grid grid-cols-2 gap-2 mt-3.5">
            <button onClick={() => setShowBalance((v) => !v)} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/10 text-purple-200 hover:text-white hover:bg-white/5 transition text-[11px] font-bold">
              <Activity size={11} /> {showBalance ? "Ocultar" : "Balance"}
            </button>
            <button ref={scheduleRef} onClick={() => setShowSchedule((s) => !s)} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/10 text-purple-200 hover:text-white hover:bg-white/5 transition text-[11px] font-bold">
              <Calendar size={11} /> {showSchedule ? "Ocultar" : "Cronograma"}
            </button>
          </div>

          {showBalance && (
            <div className="relative mt-3 pt-3 border-t border-white/10 tab-fade-in">
              <BalanceMuscular routineDef={activeDef} />
            </div>
          )}

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
                onEdit={() => { setEditingRoutineId(id); setMode("builder"); }} onShare={() => setShareTarget(r)} onArchive={() => onArchive(id)}
                onPreview={() => setPreview({ def: r, name: r.name, id, isPreset: false })}
                uso={usoPorRutina[id] || null} />
            ))}
          </div>
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

      {(!forced || showPresetsForced) && (
      <div className={forced ? "tab-fade-in" : ""}>
        <div className="flex items-center gap-1.5 mb-2"><Sparkles size={13} className="text-slate-500" /><p className="text-xs font-black uppercase tracking-widest text-slate-500">Rutinas preestablecidas</p></div>
        <div className="space-y-2">
          {PRESET_ROUTINES.map((preset) => (
            <PresetRoutineCard key={preset.id} preset={preset} isActive={preset.id === activeId} onPreview={() => setPreview({ def: preset, name: preset.name, id: preset.id, isPreset: true })} />
          ))}
        </div>
      </div>
      )}

      {!forced && (
      <div className="flex gap-2">
        <button onClick={() => { setEditingRoutineId(null); setMode("builder"); }} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white text-sm font-bold transition-all active:scale-[0.98] shadow-lg shadow-purple-500/20" style={{ background: "linear-gradient(135deg,#A855F7,#7E22CE)" }}><Sparkles size={15} /> Crear mi rutina</button>
        <button onClick={() => setShowImport(true)} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition text-sm font-bold active:scale-[0.98]"><Download size={15} /> Importar rutina</button>
      </div>
      )}

      {/* Vista previa: ves los días, ejercicios y el balance ANTES de activar */}
      {preview && (
        <RoutinePreviewModal
          routineDef={preview.def}
          routineName={preview.name}
          yaActiva={preview.id === activeId}
          onActivate={() => handleUseClick(preview.id, preview.isPreset ? cloneRoutineDef(preview.def) : null)}
          onDuplicate={preview.isPreset ? null : () => handleDuplicate(preview.id, preview.def)}
          onEditCopy={preview.isPreset ? () => handleEditPreset(preview.def) : null}
          onClose={() => setPreview(null)}
        />
      )}

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
// Orden visual de las pestañas: define desde qué lado entra el contenido al
// cambiar (si vas a una pestaña "más a la derecha", entra desde la derecha).
const TAB_ORDER = ["rutina", "progreso", "descarga", "rutinas", "entrenador_ia", "perfil"];

const NAV_TABS = [
  { key: "rutina", icon: <Dumbbell size={20} />, label: "Rutina" },
  { key: "progreso", icon: <BarChart3 size={20} />, label: "Progreso" },
  { key: "rutinas", icon: <Layers size={20} />, label: "Rutinas" },
  { key: "entrenador_ia", icon: <Sparkles size={20} />, label: "Entrenador IA" },
];

// Avatar del header móvil: muestra la foto de perfil si existe, con la
// inicial como fallback. Escucha el evento "modusfit-avatar-updated" para
// refrescarse al instante cuando cambiás la foto desde Perfil.
function HeaderAvatar({ profileName, onClick }) {
  const [avatarUrl, setAvatarUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => idbGet(`avatar_${profileName}`).then((d) => { if (alive) setAvatarUrl(d || null); }).catch(() => {});
    load();
    window.addEventListener("modusfit-avatar-updated", load);
    return () => { alive = false; window.removeEventListener("modusfit-avatar-updated", load); };
  }, [profileName]);
  return (
    <button onClick={onClick} aria-label="Tu perfil" className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center text-base font-black !text-white shrink-0 lg:hidden active:scale-90 transition" style={!avatarUrl ? { background: "linear-gradient(135deg,#14B8A6,#0E7490)" } : {}}>
      {avatarUrl ? <img src={avatarUrl} className="w-full h-full object-cover" alt="" /> : profileName.charAt(0).toUpperCase()}
    </button>
  );
}

function BottomBar({ tab, setTab }) {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/50" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
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
  const [avatarUrl, setAvatarUrl] = useState(null);
  useEffect(() => {
    const load = () => idbGet(`avatar_${profileName}`).then((d) => setAvatarUrl(d || null)).catch(() => {});
    load();
    window.addEventListener("modusfit-avatar-updated", load);
    return () => window.removeEventListener("modusfit-avatar-updated", load);
  }, [profileName]);
  return (
    <div className="hidden lg:flex lg:flex-col lg:w-56 lg:shrink-0 lg:h-screen lg:sticky lg:top-0 border-r border-slate-800/50 bg-[#0a0a0f]/60 px-3 py-6">
      <div className="flex items-center gap-2.5 px-2 mb-8">
        <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-teal-500/30 to-teal-500/5 border border-teal-500/20 flex items-center justify-center shrink-0"><Flame className="text-teal-500" size={18} /></div>
        <span className="font-black text-white text-sm tracking-tight">Mi Rutina</span>
      </div>
      <button onClick={() => setTab("perfil")} className={`w-full flex items-center gap-3 px-3 py-2.5 mb-3 rounded-xl text-sm font-semibold transition-all ${tab === "perfil" ? "bg-teal-500/15 text-teal-400" : "text-slate-500 hover:text-slate-300 hover:bg-slate-900/60"}`}>
        {avatarUrl
          ? <img src={avatarUrl} className="w-6 h-6 rounded-lg object-cover shrink-0" alt="" />
          : <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black !text-white shrink-0" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)" }}>{initial}</div>
        }
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
// Checklist de primeros pasos. Aparece arriba de la rutina hasta que el
// usuario completa todo: fecha de inicio de ciclo, datos del perfil
// (sexo, edad, peso, altura) y su primera marca registrada. Cuando todo
// está completo se marca profile.onboardingDone y desaparece PARA SIEMPRE.
// Modal de bienvenida para configurar la ficha de registro. Lo distintivo:
// una VISTA PREVIA EN VIVO arriba que se actualiza al tocar cada switch —
// ves exactamente qué aparece y qué desaparece, en vez de adivinar por el
// nombre de la opción. Aparece como tarea del onboarding y también desde
// Perfil cuando quieras cambiarlo.
function FieldSettingsIntroModal({ settings, onUpdateSettings, onClose }) {
  useAndroidBack(onClose);
  const s = settings || DEFAULT_SETTINGS;
  const on = (k) => s[k] !== false;
  const OPCIONES = [
    { key: "showWarmup", label: "Calentamiento sugerido", desc: "Una rampa de series previas calculada desde tu marca (50% → 70% → 85%). Útil en ejercicios pesados." },
    { key: "showRpe", label: "Esfuerzo (RPE)", desc: "Registrá del 1 al 10 qué tan duro fue. Sirve para saber si podés subir peso o conviene bajar." },
    { key: "show1RMPercent", label: "Porcentaje de 1RM", desc: "A qué porcentaje de tu récord estás levantando ahora mismo." },
    { key: "showCoaching", label: "Consejos al guardar", desc: "Un mensaje corto comparando la serie con tu marca (📈 subiste, ✓ igualaste, 📉 bajaste)." },
    { key: "showExerciseNote", label: "Consejos del ejercicio", desc: "La nota con la técnica que aparece debajo del nombre del ejercicio." },
    { key: "showPersonalNote", label: "Notas por serie", desc: "El botón para escribir tu propio recordatorio en cada serie." },
  ];

  return (
    <div className="fixed inset-0 z-[140] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 modal-bg-in modal-overlay" onClick={onClose}>
      <div className="max-w-md w-full max-h-[92vh] overflow-y-auto overscroll-contain bg-slate-900 border border-slate-700/60 rounded-3xl modal-pop-in shadow-2xl shadow-black/70" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-slate-900 px-5 pt-5 pb-3 border-b border-slate-800/60">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="flex items-center gap-2">
              <Sliders size={16} className="text-teal-400" />
              <p className="text-base font-black text-white">Personalizá tu ficha</p>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition shrink-0"><X size={16} /></button>
          </div>
          <p className="text-[11px] text-slate-500 leading-snug">Elegí qué querés ver al registrar una serie. Mirá cómo cambia acá abajo en vivo — podés cambiarlo cuando quieras desde Perfil.</p>
          <div className="mt-2.5 flex items-start gap-2 rounded-xl px-2.5 py-2" style={{ backgroundColor: "rgba(20,184,166,0.10)", border: "1px solid rgba(20,184,166,0.25)" }}>
            <Info size={12} className="text-teal-400 mt-0.5 shrink-0" />
            <p className="text-[10.5px] text-teal-200/90 leading-snug"><span className="font-black">Nuestra recomendación:</span> dejá prendido solo lo que vayas a usar de verdad. Con todo activado la ficha se llena de botones y cuesta encontrar lo importante. Siempre podés volver a prender lo que te falte.</p>
          </div>
        </div>

        <div className="px-5 py-4">
          {/* ── VISTA PREVIA EN VIVO ── */}
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-600 mb-2">Así se va a ver</p>
          <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-3 mb-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-white">Press Banca</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold bg-teal-500/15 text-teal-400">Pectoral</span>
            </div>
            {on("showExerciseNote") && (
              <p className="text-[10px] text-slate-500 mb-2 bounce-in leading-snug">Bajá la barra al pecho sin rebotar y mantené los omóplatos juntos.</p>
            )}
            {!on("showExerciseNote") && <div className="mb-1.5" />}

            {on("showWarmup") && (
              <div className="mb-2 rounded-xl px-2.5 py-2 bounce-in" style={{ backgroundColor: "#14B8A610", border: "1px solid #14B8A630" }}>
                <p className="text-[10px] font-bold text-teal-400 flex items-center gap-1"><Flame size={9} /> Calentamiento: 40kg → 55kg → 70kg</p>
              </div>
            )}

            <div className="rounded-xl px-2.5 py-2 mb-2" style={{ background: "linear-gradient(120deg,#14B8A620,#14B8A60c)", border: "1px solid #14B8A645" }}>
              <span className="block text-[8px] font-black uppercase tracking-[0.16em] text-teal-400/70 mb-0.5">Récord</span>
              <span className="text-base font-black text-teal-400 tabular-nums">8<span className="opacity-50 text-xs mx-0.5">×</span>80<span className="opacity-60 text-[10px] ml-0.5">kg</span></span>
            </div>

            <div className="flex items-stretch rounded-xl bg-slate-950/80 border border-slate-800 overflow-hidden mb-2">
              <div className="flex-1 px-2.5 py-1.5 text-center border-r border-slate-800">
                <span className="block text-[8px] font-black uppercase tracking-wider text-slate-600">Reps</span>
                <span className="text-sm font-black text-white tabular-nums">8</span>
              </div>
              <div className="flex-1 px-2.5 py-1.5 text-center">
                <span className="block text-[8px] font-black uppercase tracking-wider text-slate-600">Kg</span>
                <span className="text-sm font-black text-white tabular-nums">82.5</span>
              </div>
              <span className="w-10 flex items-center justify-center !text-white" style={{ background: "linear-gradient(160deg,#14B8A6,#14B8A6b0)" }}><Save size={13} /></span>
            </div>

            {on("show1RMPercent") && (
              <p className="text-[9px] text-slate-600 text-center mb-2 bounce-in">103% de tu 1RM · <span className="text-slate-500">% 1RM</span></p>
            )}

            {on("showRpe") && (
              <div className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 mb-2 bounce-in">
                <Activity size={9} className="text-slate-500" />
                <span className="text-[10px] font-bold text-slate-500">Registrar esfuerzo (RPE)</span>
              </div>
            )}

            {on("showCoaching") && (
              <div className="flex items-start gap-2 bounce-in">
                <span className="text-[13px] leading-none mt-0.5">📈</span>
                <div>
                  <p className="text-[11px] font-black text-emerald-400 leading-tight">Te sobró rango</p>
                  <p className="text-[10px] text-slate-400 leading-snug mt-0.5">Pasaste las 10 reps del objetivo. La próxima subile el peso.</p>
                </div>
              </div>
            )}

            {on("showPersonalNote") && (
              <div className="mt-2 bounce-in">
                <div className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-900/50 border border-slate-800/70 text-slate-500 text-[10px] font-bold"><StickyNote size={10} /> Agregar nota</div>
              </div>
            )}

            {!on("showWarmup") && !on("showRpe") && !on("show1RMPercent") && !on("showCoaching") && !on("showExerciseNote") && !on("showPersonalNote") && (
              <p className="text-[9.5px] text-slate-600 text-center italic">Ficha mínima: solo reps, kg y tu récord.</p>
            )}
          </div>

          {/* ── SWITCHES ── */}
          <div className="space-y-2">
            {OPCIONES.map((o) => {
              const active = on(o.key);
              return (
                <button key={o.key} onClick={() => onUpdateSettings({ [o.key]: !active })} className="w-full flex items-start justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left transition active:scale-[0.99]" style={active ? { backgroundColor: "#14B8A614", border: "1px solid #14B8A640" } : { backgroundColor: "var(--row-surface)", border: "1px solid #33415580" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold" style={{ color: active ? "#2DD4BF" : "#94a3b8" }}>{o.label}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{o.desc}</p>
                  </div>
                  <span className="w-11 h-6 rounded-full shrink-0 relative transition-colors mt-0.5" style={{ backgroundColor: active ? "#14B8A6" : "var(--surface-2)" }}>
                    <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: active ? "22px" : "2px" }} />
                  </span>
                </button>
              );
            })}
          </div>

          <button onClick={onClose} className="w-full mt-4 py-3 rounded-2xl text-sm font-black !text-white transition active:scale-[0.98]" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)" }}>
            Listo, empecemos 💪
          </button>
        </div>
      </div>
    </div>
  );
}

function OnboardingTasksCard({ profile, cycleStart, logs, onGoToProfile, onDone, onOpenFieldSettings }) {
  const settings = profile ? getProfileSettings(profile) : DEFAULT_SETTINGS;
  const tasks = [
    { key: "cycle", label: "Elegí tu fecha de inicio de ciclo", done: !!cycleStart, hint: "Perfil → Ciclo de entrenamiento" },
    { key: "profile", label: "Completá tus datos (sexo, edad, peso, altura)", done: !!(profile?.sex && profile?.age && (settings.bodyWeightKg > 0) && profile?.heightCm), hint: "Perfil → Editar perfil y Medidas" },
    { key: "firstLog", label: "Registrá tu primera marca en un ejercicio", done: Object.entries(logs || {}).some(([k, v]) => !k.endsWith("_pr_override") && Array.isArray(v) && v.length > 0), hint: "Rutina → guardá una serie" },
    { key: "fields", label: "Elegí qué ves al registrar una serie", done: !!profile?.fieldSettingsSeen, hint: "Con vista previa en vivo", action: "fields" },
  ];
  const doneCount = tasks.filter((t) => t.done).length;
  const allDone = doneCount === tasks.length;
  const hidden = !profile || profile.onboardingDone;

  // Cuando todo está listo, marcarlo y no mostrar nunca más
  useEffect(() => { if (!hidden && allDone) onDone?.(); }, [allDone, hidden]);
  if (hidden || allDone) return null;

  return (
    <div className="mb-4 rounded-2xl border border-teal-500/25 overflow-hidden bounce-in" style={{ background: "var(--panel-grad-emerald)" }}>
      <div className="px-4 py-3 flex items-center gap-2.5 border-b border-slate-800/50">
        <div className="w-8 h-8 rounded-xl bg-teal-500/15 flex items-center justify-center shrink-0"><Target size={15} className="text-teal-400" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white">Primeros pasos</p>
          <p className="text-[10px] text-slate-500">{doneCount} de {tasks.length} completados</p>
        </div>
        <div className="flex gap-1">
          {tasks.map((t) => <div key={t.key} className="w-2 h-2 rounded-full" style={{ backgroundColor: t.done ? "#14B8A6" : "var(--surface-2)" }} />)}
        </div>
      </div>
      <div className="px-4 py-2.5 space-y-2">
        {tasks.map((t) => (
          <button key={t.key} onClick={t.done ? undefined : (t.action === "fields" ? onOpenFieldSettings : onGoToProfile)} className={`w-full flex items-center gap-2.5 text-left rounded-xl px-2 py-1.5 transition ${t.done ? "opacity-50" : "hover:bg-slate-800/40"}`}>
            <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${t.done ? "bg-teal-500" : "border border-slate-700"}`}>
              {t.done && <Check size={12} className="text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold ${t.done ? "text-slate-500 line-through" : "text-slate-300"}`}>{t.label}</p>
              {!t.done && <p className="text-[9px] text-slate-600">{t.hint}</p>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [profiles, setProfiles] = useState(loadProfiles);
  const [activeProfile, setActiveProfile] = useState(() => {
    const saved = loadActive();
    const p = loadProfiles();
    if (saved && p[saved] && !p[saved].pin) return saved;
    return null;
  });
  const [tab, setTab] = useState("rutina");

  // ── El gesto "atrás" de Android funciona DENTRO de la app ────────────────
  // Metemos una entrada centinela en el historial del WebView. Cuando el
  // usuario va para atrás, el WebView la consume y dispara popstate: si hay
  // un modal abierto lo cerramos; si no, volvemos a la pestaña Rutina. En
  // ambos casos reponemos el centinela. Solo si ya estás en Rutina sin nada
  // abierto dejamos el historial vacío → el siguiente atrás cierra la app.
  const tabRef = useRef(tab);
  useEffect(() => { tabRef.current = tab; }, [tab]);
  // Cambio de perfil → resetear la memoria visual efímera (racha vista y
  // rank-ups pendientes): son del perfil anterior, no de este.
  useEffect(() => { STREAK_VISTO = null; RECENT_RANK_UPS.clear(); }, [activeProfile]);
  // Dirección del deslizamiento al cambiar de pestaña
  const prevTabRef = useRef(tab);
  const tabSlideClass = useMemo(() => {
    const nueva = TAB_ORDER.indexOf(tab);
    const vieja = TAB_ORDER.indexOf(prevTabRef.current);
    return nueva >= vieja ? "tab-slide-right" : "tab-slide-left";
  }, [tab]);
  useEffect(() => { prevTabRef.current = tab; }, [tab]);
  useEffect(() => {
    try { window.history.pushState({ __sentinela: true }, ""); } catch { /* ignorado a propósito */ }
    const onPop = () => {
      if (BACK_HANDLERS.length > 0) {
        // Cerrar el modal de más arriba
        const cerrar = BACK_HANDLERS[BACK_HANDLERS.length - 1];
        try { cerrar(); } catch { /* ignorado a propósito */ }
        try { window.history.pushState({ __sentinela: true }, ""); } catch { /* ignorado a propósito */ }
      } else if (tabRef.current !== "rutina") {
        setTab("rutina");
        try { window.history.pushState({ __sentinela: true }, ""); } catch { /* ignorado a propósito */ }
      }
      // Si estás en Rutina sin modales: no reponemos nada → el próximo
      // atrás cierra la app (comportamiento esperado).
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // Señales para auto-abrir secciones al navegar desde otra pantalla. Cada
  // botón incrementa el contador → la CollapsibleSection destino lo detecta
  // y se abre sola. Guardamos qué sección abrir por su id.
  const [openSectionSignal, setOpenSectionSignal] = useState({ id: null, n: 0 });
  const [showFieldIntro, setShowFieldIntro] = useState(false); // modal de "qué ves al registrar"
  const goToSection = (targetTab, sectionId) => {
    setTab(targetTab);
    setOpenSectionSignal((s) => ({ id: sectionId, n: s.n + 1 }));
  };
  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);
  // (Los permisos de notificación y el canal se piden en el efecto
  // requestNotifPermission más abajo — un solo lugar, sin duplicar.)
  const [aiChatMessages, setAiChatMessages] = useState([
    { role: "assistant", text: "¡Hola! 👋 Soy tu **Entrenador IA**.\n\nConozco tu rutina, tus marcas y tu progreso — todo lo que registrás en la app.\n\nPuedo ayudarte a:\n• **Crear o modificar rutinas** a tu medida\n• **Analizar tu progreso** y detectar puntos débiles\n• **Resolver dudas** de técnica, series y descanso\n\n¿Por dónde empezamos? 💪" },
  ]);
  const [cycleStart, setCycleStartState] = useState(loadCycleStart);
  const [showHelp, setShowHelp] = useState(false);
  const [helpStartTab, setHelpStartTab] = useState(null);
  const [showWelcome, setShowWelcome] = useState(false); // intro de la primera vez
  const [sessionSummary, setSessionSummary] = useState(null); // resumen al finalizar
  const [sessionStarted, setSessionStarted] = useState(false); // overlay "¡A entrenar!"
  const [recoveredNotice, setRecoveredNotice] = useState(false);

  useEffect(() => {
    if (!activeProfile) return;
    const p = profiles[activeProfile];
    if (p?.googleUid) syncProfileToCloud(p.googleUid, { ...p, name: activeProfile, cycleStart: cycleStart?.toISOString() ?? null }).catch(() => {});
  }, [activeProfile]);

  const debouncedSync = useMemo(() => debounce((prof, name, cs) => {
    const p = prof[name];
    if (p?.googleUid) syncProfileToCloud(p.googleUid, { ...p, name, cycleStart: cs?.toISOString() ?? null }).catch(() => {});
  }, 4000), []);
  useEffect(() => {
    if (activeProfile && profiles[activeProfile]) debouncedSync(profiles, activeProfile, cycleStart);
  }, [profiles, activeProfile, cycleStart]);
  // perfil — antes, con un solo perfil sin PIN en el dispositivo, tocar ese
  // botón no parecía hacer nada porque te re-logueaba al instante. En una
  // carga nueva de la página este estado vuelve a su valor inicial (false),
  // así que el auto-login normal al abrir la app sigue funcionando igual.
  const [justLoggedOut, setJustLoggedOut] = useState(false);

  // Auto-login silencioso para usuarios con Google:
  // Firebase restaura la sesión automáticamente al abrir la app.
  // Cuando eso ocurre, buscamos el perfil local que tenga ese uid y
  // lo activamos sin que el usuario tenga que tocar nada.
  useEffect(() => {
    if (activeProfile) return; // ya está logueado, no hacer nada
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      const p = loadProfiles();
      const match = Object.entries(p).find(([, prof]) => prof.googleUid === user.uid);
      if (match) {
        const [name] = match;
        if (!p[name].pin) { saveActive(name); setActiveProfile(name); }
      }
    });
    return () => unsub();
  }, []);

  // Pedir permiso de notificaciones al montar la app.
  // En Android con Capacitor usamos LocalNotifications.requestPermissions()
  // que muestra el diálogo nativo del sistema y crea el canal de Android 8+.
  // En el navegador web usamos la Notifications API estándar como fallback.
  useEffect(() => {
    const requestNotifPermission = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          const { display } = await LocalNotifications.requestPermissions();
          if (display === "granted") {
            await LocalNotifications.createChannel({
              id: "ponos-rest-timer",
              name: "Descanso entre series",
              description: "Avisa cuando termina el descanso entre series",
              importance: 5, // IMPORTANCE_HIGH
              visibility: 1,
              sound: "default",
              vibration: true,
            });
          }
        } else if (typeof Notification !== "undefined" && Notification.permission === "default") {
          await Notification.requestPermission();
        }
      } catch { /* ignorado a propósito */ }
    };
    setTimeout(requestNotifPermission, 2000);
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

  // Limpieza automática de récords-override obsoletos (datos fantasma). Corre
  // una vez cuando entrás con un perfil: si hay un override viejo que tu
  // historial real ya superó (ej. 8×95 guardado por una versión anterior
  // cuando ya hiciste 9×95), lo borra y guarda el perfil limpio. Así el muñeco
  // y el "A superar" vuelven a reflejar tus marcas reales sin que tengas que
  // hacer nada. Sólo toca overrides obsoletos; las correcciones manuales que
  // siguen siendo tu mejor marca quedan intactas.
  const overrideCleanupRef = useRef(null);
  useEffect(() => {
    if (!activeProfile || !profile?.logs) return;
    if (overrideCleanupRef.current === activeProfile) return; // ya limpiado en esta sesión
    const { logs: cleaned, changed } = cleanObsoleteOverrides(profile.logs);
    if (changed) {
      overrideCleanupRef.current = activeProfile;
      setProfiles((prev) => {
        const p = prev[activeProfile];
        if (!p) return prev;
        const np = { ...prev, [activeProfile]: { ...p, logs: cleaned } };
        saveProfiles(np);
        return np;
      });
    } else {
      overrideCleanupRef.current = activeProfile;
    }
  }, [activeProfile, profile?.logs]);

  // AUTO-CENTRADO DE INPUTS: cuando enfocás cualquier campo de la app
  // (editar récord, reps, kg, medidas, chat...), la pantalla se desplaza
  // sola para centrarlo — así el teclado nunca lo tapa y no tenés que
  // scrollear a mano. El delay le da tiempo al teclado a abrirse y al
  // viewport a achicarse (interactive-widget=resizes-content) antes de
  // calcular el centro.
  useEffect(() => {
    const onFocusIn = (e) => {
      const t = e.target;
      if (!t || !(t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (t.type === "checkbox" || t.type === "radio" || t.type === "file" || t.type === "range") return;
      setTimeout(() => {
        try { t.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" }); } catch { /* ignorado a propósito */ }
      }, 350);
    };
    window.addEventListener("focusin", onFocusIn);
    return () => window.removeEventListener("focusin", onFocusIn);
  }, []);

  // RECORDATORIO DE ENTRENAMIENTO: notificación diaria a la hora elegida,
  // SOLO los días que te toca entrenar según tu agenda semanal. Programa una
  // por cada día de los próximos 7 (ids 9200-9206) y las reprograma cada vez
  // que abrís la app o cambiás la agenda/hora — así siempre hay una semana de
  // avisos cargada aunque no entres por días. Reusa el mismo mecanismo del
  // aviso de fin de descanso: lo dispara el sistema, no el JavaScript.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const st = getProfileSettings(profile);
    const ids = [9200, 9201, 9202, 9203, 9204, 9205, 9206];
    (async () => {
      try {
        await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) }).catch(() => {});
        const sched = profile?.weekSchedule || null;
        if (!st.reminderEnabled || !sched) return;
        await LocalNotifications.createChannel({ id: "modusfit-reminder-v1", name: "Recordatorio de entrenamiento", description: "Aviso los días que te toca entrenar", importance: 4, vibration: true }).catch(() => {});
        const [hh, mm] = String(st.reminderTime || "18:00").split(":").map(Number);
        const notifs = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date();
          d.setDate(d.getDate() + i);
          d.setHours(hh || 18, mm || 0, 0, 0);
          if (d.getTime() <= Date.now()) continue; // ya pasó la hora de hoy
          const dayKey = sched[todayWeekdayKey(d)];
          if (!dayKey) continue; // día de descanso: no molestar
          const label = ROUTINE[dayKey]?.label || "entrenar";
          notifs.push({
            id: ids[i], smallIcon: "ic_stat_modusfit",
            title: `💪 Hoy toca ${label}`,
            body: "Tu rutina te espera — dale que se puede",
            channelId: "modusfit-reminder-v1",
            schedule: { at: d, allowWhileIdle: true },
          });
        }
        if (notifs.length) {
          await LocalNotifications.schedule({ notifications: notifs });
          console.log(`[notif] ${notifs.length} recordatorios programados a las ${st.reminderTime}`);
        }
      } catch (e) { console.warn("[notif] recordatorio:", e); }
    })();
    // eslint-disable-next-line
  }, [profile?.settings?.reminderEnabled, profile?.settings?.reminderTime, profile?.weekSchedule, activeProfile]);

  // MIGRACIÓN AUTOMÁTICA DE LA FOTO DE PERFIL: las fotos puestas con
  // versiones anteriores quedaron SOLO en IndexedDB del dispositivo (nunca
  // subían a la nube, por eso no aparecían en la web ni en otros equipos).
  // Acá, apenas se abre la app: si el perfil no tiene avatarData pero hay
  // una foto local vieja, la comprimimos (256px JPEG) y la guardamos en el
  // perfil → se sincroniza a Firebase → aparece en todos lados.
  const avatarMigrationRef = useRef(null);
  useEffect(() => {
    if (!activeProfile || !profile) return;
    if (profile.avatarData) return; // ya migrada o puesta con la versión nueva
    if (avatarMigrationRef.current === activeProfile) return; // un intento por sesión
    avatarMigrationRef.current = activeProfile;
    idbGet(`avatar_${activeProfile}`).then(async (data) => {
      if (!data) return;
      try {
        const small = await compressAvatarDataUrl(data);
        setProfiles((prev) => {
          const p = prev[activeProfile];
          if (!p || p.avatarData) return prev;
          const np = { ...prev, [activeProfile]: { ...p, avatarData: small } };
          saveProfiles(np);
          return np;
        });
        window.dispatchEvent(new Event("modusfit-avatar-updated"));
      } catch { /* imagen vieja ilegible: queda local como antes */ }
    }).catch(() => {});
  }, [activeProfile, profile?.avatarData]);

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
      ? "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"
      : "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content";
  }, [allowZoom]);
  // Letras chicas (Perfil → Tamaño de letra → "Letras chicas"): multiplica
  // los text-[Npx] fijos (consejos, récords, RPE, badges...) — ver la
  // variable --small-text-scale en ANIMATION_CSS. Se pasa como custom
  // property inline en los contenedores raíz más abajo, no en el <html>.
  const smallTextScale = profile ? Math.min(1.3, getProfileSettings(profile).smallTextScale ?? 1) : 1;

  // La rutina activa del perfil actual (o Push / Pull / Pierna + Hombros / Brazos
  // como respaldo) se recalcula en cada render — así
  // ROUTINE/DAY_ORDER/EXERCISE_BY_ID/KEY_TO_DAY siempre reflejan la rutina
  // correcta antes de que se rendericen sus hijos.
  const activeRoutineDef = resolveRoutineDef((profile && profile.routines && profile.routines[profile.activeRoutineId]) || null, profile?.activeRoutineId);
  // Color del día de la sesión activa, para el marco de "modo sesión". Se lee
  // en el render (no en useMemo) desde ROUTINE global, igual que el resto de la
  // app (p.ej. `const day = ROUTINE[activeDay]` en RoutineView): ROUTINE es
  // global y se reasigna al cambiar de rutina, así que leerla en cada render da
  // siempre el color vigente. Con useMemo quedaba cacheado el valor viejo (o
  // null si ROUTINE aún no estaba poblada) y el marco no aparecía.
  applyRoutineModel(activeRoutineDef || CLASSIC_PRESET);
  // El color del marco de sesión se lee DESPUÉS de applyRoutineModel: esa
  // llamada es la que puebla ROUTINE con la rutina activa. Leerlo antes (como
  // estaba) daba siempre vacío en el primer render y el marco no aparecía.
  const _sesDayKey = profile?.activeSession?.dayKey;
  const sessionTintColor = _sesDayKey
    ? (ROUTINE?.[_sesDayKey]?.color || activeRoutineDef?.days?.[_sesDayKey]?.color || null)
    : null;
  // Nombre del día que estás entrenando, para el chip flotante de sesión activa.
  const sessionDayLabel = _sesDayKey
    ? (ROUTINE?.[_sesDayKey]?.label || activeRoutineDef?.days?.[_sesDayKey]?.label || null)
    : null;
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

  const setLogs = useCallback((newLogsOrFn) => {
    setProfiles((prev) => {
      const cur = prev[activeProfile];
      const nextLogs = typeof newLogsOrFn === "function" ? newLogsOrFn(cur?.logs || {}) : newLogsOrFn;
      const np = { ...prev, [activeProfile]: { ...cur, logs: nextLogs } };
      saveProfiles(np);
      return np;
    });
  }, [activeProfile]);
  // `drafts` se guarda igual que `logs` (full-replace), pero son los valores
  // tipeados-sin-guardar de reps/kg/RPE en cada serie — ver SetRow. Sobreviven
  // a cambios de pestaña/día/colapsar tarjetas; sólo se limpian al resetear
  // el día (RoutineView) o al finalizar la sesión (handleEndSession, abajo).
  const setDrafts = useCallback((newDraftsOrFn) => {
    setProfiles((prev) => {
      const cur = prev[activeProfile];
      // Soporta las dos formas: setDrafts(obj) y setDrafts(prevDrafts => obj).
      // SetRow usa la forma funcional para evitar pisar cambios concurrentes;
      // sin este soporte, la función se guardaba TAL CUAL como los drafts y
      // corrompía todo el guardado/lockeo de series.
      const nextDrafts = typeof newDraftsOrFn === "function" ? newDraftsOrFn(cur?.drafts || {}) : newDraftsOrFn;
      const np = { ...prev, [activeProfile]: { ...cur, drafts: nextDrafts } };
      saveProfiles(np);
      return np;
    });
  }, [activeProfile]);
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

  const handleLogin = (name, updatedProfiles) => {
    const profs = updatedProfiles || profiles;
    setProfiles(profs); setActiveProfile(name); setJustLoggedOut(false); setTab("rutina");
    // El login con Google puede haber restaurado cycleStart desde la nube
    // (lo escribe en localStorage) — releerlo para que el estado de React
    // lo refleje sin necesidad de recargar la app.
    const restored = loadCycleStart();
    if (restored) setCycleStartState(restored);
  };
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
      // Primera vez: mostramos la INTRO corta (5 slides), no el tutorial de 51
      // pasos — como primer contacto abrumaba. El tutorial queda en el "?".
      if (wasFirstTime && p.tutorialSeen === false) { setShowWelcome(true); }
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
    setSessionStarted(true); // overlay "¡A entrenar!"
    haptic([0, 40, 60, 40]);
  };
  // Arma el resumen del entrenamiento de hoy: volumen (con factor de
  // mancuernas), series, ejercicios y los récords superados. Se calcula ANTES
  // de cerrar la sesión, con los logs que ya están guardados.
  const armarResumenSesion = () => {
    const hoy = todayStr();
    const dd = getProfileSettings(profile)?.dumbbellDouble || null;
    const porEjercicio = {};
    Object.entries(logs || {}).forEach(([key, val]) => {
      if (key.endsWith("_pr_override") || !Array.isArray(val)) return;
      const { exerciseId } = parseLogKey(key);
      val.forEach((e) => {
        if (!e || !e.kg || !e.reps || !e.date) return;
        (porEjercicio[exerciseId] ||= []).push(e);
      });
    });
    let volumen = 0, series = 0;
    const ejercicios = new Set();
    const prs = [];
    Object.entries(porEjercicio).forEach(([exId, entries]) => {
      const deHoy = entries.filter((e) => e.date === hoy);
      if (!deHoy.length) return;
      const lf = (dd && dd[exId]) || EXERCISE_LIBRARY_BY_ID[exId]?.loadFactor || 1;
      deHoy.forEach((e) => { volumen += e.kg * lf * e.reps; series++; });
      ejercicios.add(exId);
      // ¿Superó hoy su mejor marca previa? El loadFactor se cancela (es el
      // mismo ejercicio de ambos lados), así que comparamos 1RM crudo. El
      // récord corregido a mano también cuenta como piso a superar.
      const previas = entries.filter((e) => e.date < hoy);
      const ov = (logs || {})[`${exId}_pr_override`];
      let piso = 0;
      previas.forEach((e) => { const rm = estimate1RM(e.kg, e.reps); if (rm > piso) piso = rm; });
      if (ov?.kg && ov?.reps) { const rm = estimate1RM(ov.kg, ov.reps); if (rm > piso) piso = rm; }
      if (piso > 0) {
        let mejorHoy = null;
        deHoy.forEach((e) => { const rm = estimate1RM(e.kg, e.reps); if (rm > piso && (!mejorHoy || rm > mejorHoy.rm)) mejorHoy = { rm, e }; });
        if (mejorHoy) {
          prs.push({ id: exId, nombre: EXERCISE_LIBRARY_BY_ID[exId]?.name || (deHoy[0].exName || exId.replace(/_/g, " ")), marca: `${mejorHoy.e.reps}×${mejorHoy.e.kg}kg` });
        }
      }
    });
    let minutos = null;
    const inicio = profile?.activeSession?.startedAt;
    if (inicio) {
      const m = Math.round((Date.now() - new Date(inicio).getTime()) / 60000);
      if (m >= 0 && m < 24 * 60) minutos = m; // descarta duraciones absurdas (sesión olvidada abierta)
    }
    return { volumen: Math.round(volumen), series, ejercicios: ejercicios.size, prs, minutos };
  };

  const handleEndSession = () => {
    // El resumen se arma ANTES de cerrar (después ya no existe activeSession
    // para calcular la duración). Solo se muestra si registraste algo.
    const resumen = armarResumenSesion();
    setProfiles((prev) => {
      const p = prev[activeProfile];
      if (!p?.activeSession) return prev;
      // Guardamos CON QUÉ RUTINA se hizo: es lo que permite mostrar después
      // "24 sesiones · usada hace 3 meses" en cada rutina.
      const finished = { date: todayStr(), dayKey: p.activeSession.dayKey, startedAt: p.activeSession.startedAt, endedAt: new Date().toISOString() };
      if (p.activeRoutineId) finished.routineId = p.activeRoutineId;
      const np = { ...prev, [activeProfile]: { ...p, activeSession: null, trainingSessions: [...(p.trainingSessions || []), finished], drafts: {} } };
      saveProfiles(np);
      return np;
    });
    if (resumen.series > 0) setSessionSummary(resumen);
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
      if (p.activeRoutineId) finished.routineId = p.activeRoutineId;
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
      <div className={`relative min-h-screen bg-[#0a0a0f] px-4 py-6 theme-fade ${themeClass}`} style={{ "--small-text-scale": smallTextScale }}>
        <div style={{ height: "env(safe-area-inset-top, 0px)" }} />
        <div className="max-w-xl mx-auto">
          <div className="flex justify-end mb-2">
            <button onClick={handleSignOut} className="text-[11px] text-slate-600 hover:text-slate-400 font-semibold flex items-center gap-1"><LogOut size={11} /> Cerrar sesión</button>
          </div>
          <RoutinesView profile={profile} forced onActivate={handleActivateRoutine} onUpdate={handleUpdateRoutine} onArchive={handleArchiveRoutine} onRestore={handleRestoreRoutine} onUpdateProfile={handleUpdateProfile} />
        </div>
      </div>
      {importRoutine && <SharedRoutineImportModal routine={importRoutine} onImport={handleImportSharedRoutine} onDiscard={() => setImportRoutine(null)} />}
    </>
  );

  const activeWeightUnit = getProfileSettings(profiles[activeProfile]).weightUnit ?? "kg";
  return (
    <WeightUnitCtx.Provider value={activeWeightUnit}>
    <div className={`min-h-screen bg-[#0a0a0f] text-white font-sans lg:flex ${themeClass}`} style={{ "--small-text-scale": smallTextScale }}>
      {/* Escudo fijo de la status bar — cubre la zona de batería/hora sin
          importar cuánto hayas scrolleado. El color es siempre #0a0a0f. */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "env(safe-area-inset-top, 0px)", backgroundColor: "var(--app-bg)", zIndex: 9999 }} />

      {/* Desaturación global: un overlay con backdrop-filter en vez de
          filter en el contenedor — filter en un ancestro convierte a ese
          ancestro en el containing block de position:fixed y ROMPE todos
          los modales (aparecían en el medio del documento, no del viewport).
          El overlay no bloquea toques y queda debajo de los modales. */}
      <div style={{ position: "fixed", inset: 0, backdropFilter: "saturate(0.88)", WebkitBackdropFilter: "saturate(0.88)", pointerEvents: "none", zIndex: 50 }} />
      <StyleInjector />
      {recoveredNotice && <RecoveredBanner onClose={() => setRecoveredNotice(false)} />}
      {deloadNotice && <DeloadNoticeBanner onClose={() => setDeloadNotice(false)} />}
      
      {importRoutineError && <ImportRoutineErrorBanner onClose={() => setImportRoutineError(false)} />}
      <SideNav tab={tab} setTab={setTab} profileName={activeProfile} />
      <div className="flex-1 min-w-0" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <header className="sticky z-10 bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-slate-800/40" style={{ top: "env(safe-area-inset-top, 0px)" }}>
          <div className="max-w-xl lg:max-w-3xl xl:max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
            {tab === "perfil" ? (
              <button onClick={() => setTab("rutina")} aria-label="Volver" className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80 transition shrink-0 lg:hidden"><ChevronDown size={18} className="rotate-90" /></button>
            ) : (
              <HeaderAvatar profileName={activeProfile} onClick={() => setTab("perfil")} />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="font-black text-base text-white leading-tight tracking-tight">{TAB_TITLES[tab] || ""}</h1>
              <p className="text-[11px] text-slate-600 leading-tight">{activeProfile}</p>
            </div>
            {/* Durante una sesión activa, el chip de "entrenando X" ocupa el
                lugar del "?" (así no lo tapa). Sin sesión, el "?" normal. */}
            {sessionTintColor && sessionDayLabel ? (
              <div className="flex items-center gap-1.5 rounded-full pl-2 pr-2.5 py-1.5 shrink-0 session-chip-in" style={{ backgroundColor: `${sessionTintColor}1A`, border: `1px solid ${sessionTintColor}55` }}>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full opacity-60 session-chip-ping" style={{ backgroundColor: sessionTintColor }} />
                  <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: sessionTintColor }} />
                </span>
                <span className="text-[10px] font-bold tracking-wide whitespace-nowrap" style={{ color: sessionTintColor }}>{sessionDayLabel}</span>
              </div>
            ) : (
              tab !== "perfil" && <button onClick={() => { setHelpStartTab(tab); setShowHelp(true); }} aria-label="Ayuda" className="w-8 h-8 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-teal-400 hover:border-teal-500/30 transition active:scale-90"><HelpCircle size={16} /></button>
            )}
          </div>
        </header>
        <main className="max-w-xl lg:max-w-3xl xl:max-w-4xl mx-auto px-4 py-4 pb-28 lg:pb-10 space-y-4" style={{ paddingBottom: "calc(7rem + env(safe-area-inset-bottom, 0px))" }}>
          <div key={tab} className={tabSlideClass}>
            {tab === "rutinas" && <RoutinesView openScheduleSignal={openSectionSignal.id === "week-schedule" ? openSectionSignal.n : 0} openEditorSignal={openSectionSignal.id === "routine-editor" ? openSectionSignal.n : 0} profile={profile} forced={false} onActivate={handleActivateRoutine} onUpdate={handleUpdateRoutine} onArchive={handleArchiveRoutine} onRestore={handleRestoreRoutine} onUpdateProfile={handleUpdateProfile} />}
            {tab === "rutina" && <OnboardingTasksCard profile={profile} cycleStart={cycleStart} logs={logs} onGoToProfile={() => setTab("perfil")} onOpenFieldSettings={() => setShowFieldIntro(true)} onDone={() => handleUpdateProfile({ onboardingDone: true })} />}
            {tab === "rutina" && <RoutineView logs={logs} setLogs={setLogs} drafts={drafts} setDrafts={setDrafts} cycleStart={cycleStart} settings={getProfileSettings(profile)} onUpdateSettings={handleUpdateSettings} onGoToRoutines={() => setTab("rutinas")} onGoToSchedule={() => goToSection("rutinas", "week-schedule")} onGoToFieldSettings={() => goToSection("perfil", "field-settings-section")} weekSchedule={weekSchedule} activeSession={profile?.activeSession || null} onStartSession={handleStartSession} onEndSession={handleEndSession} onCancelSession={handleCancelSession} onDisableAutoShowPrShare={() => handleUpdateProfile({ settings: { ...getProfileSettings(profile), autoShowPrShare: false } })} todaySessionDayKey={(profile?.trainingSessions || []).find((ts) => ts.date === todayStr())?.dayKey || profile?.activeSession?.dayKey || null} sex={profile?.sex} age={profile?.age} />}
            {tab === "progreso" && <ProgressView logs={logs} setLogs={setLogs} sessions={profile?.trainingSessions || []} cycleStart={cycleStart} settings={getProfileSettings(profile)} onResetAll={handleResetAllHistory} onDeleteDay={handleDeleteDay} onUpdateSettings={handleUpdateSettings} onGoToProfile={() => setTab("perfil")} onGoToRoutines={() => goToSection("rutinas", "routine-editor")} weekSchedule={weekSchedule} sex={profile?.sex} age={profile?.age} onGoToDeload={() => setTab("descarga")} measurements={profile?.measurements || {}} onAddMeasurement={handleAddMeasurement} photos={progressPhotos} photosLoading={photosLoading} onAddPhoto={handleAddPhoto} onDeletePhoto={handleDeletePhoto} />}
            {tab === "descarga" && <DeloadView logs={logs} settings={getProfileSettings(profile)} deloadProgress={profile?.deloadProgress || {}} setDeloadProgress={setDeloadProgress} onFinishDeloadSession={handleFinishDeloadSession} />}
            {tab === "entrenador_ia" && <EntrenadorIAChat profile={profile} logs={logs} profileName={activeProfile} messages={aiChatMessages} setMessages={setAiChatMessages} settings={getProfileSettings(profile)} onCreateRoutine={handleUpdateRoutine} onActivateRoutine={handleActivateRoutine} onUpdateProfile={handleUpdateProfile} onUpdateSettings={handleUpdateSettings} onAddMeasurement={handleAddMeasurement} />}
            {tab === "perfil" && <ProfileView onOpenFieldPreview={() => setShowFieldIntro(true)} openSectionSignal={openSectionSignal} profileName={activeProfile} profiles={profiles} logs={logs} onSignOut={handleSignOut} onDelete={handleDelete} onUpdateProfile={handleUpdateProfile} cycleStart={cycleStart} onSetCycleStart={handleSetCycleStart} onGoToRoutines={() => setTab("rutinas")} />}
          </div>
        </main>
      </div>
      <BottomBar tab={tab} setTab={setTab} />
      {sessionStarted && <SessionStartOverlay onDone={() => setSessionStarted(false)} />}
      {sessionSummary && <SessionSummaryModal resumen={sessionSummary} onClose={() => setSessionSummary(null)} />}
      {showWelcome && <WelcomeIntro onClose={() => setShowWelcome(false)} onOpenTutorial={() => { setHelpStartTab(null); setShowHelp(true); }} />}
      {showHelp && <HelpModal startTab={helpStartTab} onClose={() => setShowHelp(false)} />}
      {showFieldIntro && (
        <FieldSettingsIntroModal
          settings={getProfileSettings(profile)}
          onUpdateSettings={handleUpdateSettings}
          onClose={() => { setShowFieldIntro(false); handleUpdateProfile({ fieldSettingsSeen: true }); }}
        />
      )}
      {importRoutine && <SharedRoutineImportModal routine={importRoutine} onImport={handleImportSharedRoutine} onDiscard={() => setImportRoutine(null)} />}
      {cycleCompleteNotice && !showCycleShareImage && (
        <div className="fixed inset-0 z-[125] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 modal-bg-in modal-overlay" onClick={() => setCycleCompleteNotice(null)}>
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
    </WeightUnitCtx.Provider>
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

function ImportRoutineErrorBanner({ onClose }) {
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[150] bg-rose-500 !text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-rose-500/30 flex items-center gap-2 bounce-in max-w-[92vw]">
      <AlertTriangle size={14} className="shrink-0" /> No pudimos abrir esa rutina compartida — puede que el enlace ya no exista.
      <button onClick={onClose} className="ml-1 opacity-80 hover:opacity-100 shrink-0"><X size={13} /></button>
    </div>
  );
}
