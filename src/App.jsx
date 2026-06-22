import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  Play, Pause, RotateCcw, TrendingUp, TrendingDown, Dumbbell,
  ChevronDown, ChevronLeft, Trophy, Flame, Save, Trash2, BarChart3,
  ListChecks, LogOut, X, Check, AlertTriangle, Calendar, Zap,
  Mail, Clock, ChevronRight, Edit3, Info,
  Target, Award, Activity, ArrowDown, HelpCircle, List, LayoutGrid,
  Sparkles, Layers, Video, SlidersHorizontal, ShieldCheck, UserCog,
} from "lucide-react";

/* ============================================================================
   DATOS DE LA RUTINA — antes vivían en routine.json como archivo separado.
   Para editar ejercicios, series o rangos de repeticiones, modificá este objeto
   directamente (es el único lugar donde aparecen los datos "duros" de la rutina).
============================================================================ */
const routineData = {
  "dayOrder": ["push", "pull", "legs", "sarm"],
  "days": {
    "push": {
      "label": "PUSH",
      "description": "Pecho · Hombro anterior · Tríceps",
      "color": "#14B8A6",
      "grad": "from-teal-500/20 to-transparent",
      "exercises": [
        { "id": "press_banca", "name": "Press Banca", "muscle": "Pectoral", "nota": "Hacer fuerza con las piernas.", "videoQuery": "press banca técnica correcta",
          "sets": [{ "repRange": "3-5", "heavy": true }, { "repRange": "3-5", "heavy": true }, { "repRange": "8-10" }] },
        { "id": "press_inclinado_smith", "name": "Press Inclinado Smith", "muscle": "Pectoral sup.", "nota": "Codos bastante pegados.", "videoQuery": "press inclinado smith técnica",
          "sets": [{ "repRange": "8-10" }, { "repRange": "8-10" }, { "repRange": "8-10" }] },
        { "id": "cruce_poleas", "name": "Cruce de Poleas", "muscle": "Pectoral", "nota": "Énfasis en el estiramiento.", "videoQuery": "cruce de poleas técnica pectoral",
          "sets": [{ "repRange": "10-12" }, { "repRange": "10-12" }] },
        { "id": "vuelos_laterales_mancuerna", "name": "Vuelos Laterales Mancuerna", "muscle": "Deltoides lateral", "nota": "Levantar un poco para adelante.", "videoQuery": "vuelos laterales mancuerna técnica deltoides",
          "sets": [{ "repRange": "12-15" }, { "repRange": "12-15" }, { "repRange": "12-15" }, { "repRange": "12-15" }] },
        { "id": "pec_dec_deltoides_push", "name": "Pec Dec para Deltoides", "muscle": "Deltoides post.", "nota": "Unilateral.", "videoQuery": "pec dec deltoides posterior técnica",
          "sets": [{ "repRange": "12-15" }, { "repRange": "12-15" }] },
        { "id": "triceps_trasnuca_push", "name": "Tríceps Trasnuca", "muscle": "Tríceps", "nota": "Pausa en el fondo, codos no van cerrados.", "videoQuery": "triceps trasnuca técnica overhead extension",
          "sets": [{ "repRange": "8-10" }, { "repRange": "8-10" }] },
        { "id": "triceps_polea_alta", "name": "Tríceps Polea Alta", "muscle": "Tríceps", "nota": "El húmero no se mueve.", "videoQuery": "tríceps polea alta técnica cable pushdown",
          "sets": [{ "repRange": "8-10" }, { "repRange": "8-10" }] }
      ]
    },
    "pull": {
      "label": "PULL",
      "description": "Dorsal · Romboides · Bíceps",
      "color": "#3B82F6",
      "grad": "from-blue-500/20 to-transparent",
      "exercises": [
        { "id": "remo_ancho_maquina", "name": "Remo Ancho Máquina", "muscle": "Dorsal", "nota": "No levantar los hombros.", "videoQuery": "remo ancho máquina técnica espalda",
          "sets": [{ "repRange": "4-6", "heavy": true }, { "repRange": "4-6", "heavy": true }, { "repRange": "8-10" }] },
        { "id": "dorsalera", "name": "Dorsalera Agarre Ancho", "muscle": "Dorsal", "nota": "No descolocar los hombros, pulgar en la marca.", "videoQuery": "dorsalera lat pulldown agarre ancho técnica",
          "sets": [{ "repRange": "8-10" }, { "repRange": "8-10" }, { "repRange": "8-10" }] },
        { "id": "remo_unilateral", "name": "Remo Unilateral", "muscle": "Dorsal / oblicuos", "nota": "Contraer los oblicuos, codo lo más abajo posible.", "videoQuery": "remo unilateral mancuerna técnica espalda",
          "sets": [{ "repRange": "8-10" }, { "repRange": "8-10" }] },
        { "id": "pull_over", "name": "Pull Over", "muscle": "Dorsal / serrato", "nota": "Codos siempre un poco flexionados.", "videoQuery": "pull over espalda técnica mancuerna",
          "sets": [{ "repRange": "8-10" }, { "repRange": "8-10" }, { "repRange": "8-10" }] },
        { "id": "face_pull", "name": "Face Pull", "muscle": "Deltoides post.", "nota": "Polea a la altura de los ojos.", "videoQuery": "face pull técnica deltoides posterior",
          "sets": [{ "repRange": "15-20" }, { "repRange": "15-20" }] },
        { "id": "biceps_alternado_mancuerna", "name": "Bíceps Alternado Mancuerna", "muscle": "Bíceps", "nota": "Mover un poco el húmero al final.", "videoQuery": "curl alternado mancuerna técnica bíceps",
          "sets": [{ "repRange": "8-10" }, { "repRange": "8-10" }, { "repRange": "8-10" }, { "repRange": "8-10" }] }
      ]
    },
    "legs": {
      "label": "PIERNAS",
      "description": "Glúteo · Cuádriceps · Femoral · Aductores",
      "color": "#F97316",
      "grad": "from-orange-500/20 to-transparent",
      "isNew": true,
      "exercises": [
        { "id": "sentadilla_bulgara", "name": "Sentadilla Búlgara", "muscle": "Glúteo", "nota": "Torso ligeramente inclinado adelante.", "videoQuery": "sentadilla búlgara técnica glúteo",
          "sets": [{ "repRange": "8-10" }, { "repRange": "8-10" }] },
        { "id": "abdominales", "name": "Abdominales", "muscle": "Core", "nota": "Controlar la excéntrica, sin impulso.", "videoQuery": "abdominales técnica correcta core",
          "sets": [{ "repRange": "8-10" }, { "repRange": "8-10" }, { "repRange": "8-10" }, { "repRange": "8-10" }] },
        { "id": "jaca", "name": "Hack Squat", "muscle": "Cuádriceps", "nota": "Pies a la altura de hombros, bajar controlado.", "videoQuery": "hack squat técnica cuádriceps",
          "sets": [{ "repRange": "4-6", "heavy": true }, { "repRange": "4-6", "heavy": true }, { "repRange": "8-10" }] },
        { "id": "curl_femoral_maquina", "name": "Curl Femoral Máquina", "muscle": "Femoral", "nota": "Controlar la fase negativa.", "videoQuery": "curl femoral máquina técnica isquios",
          "sets": [{ "repRange": "8-10" }, { "repRange": "8-10" }, { "repRange": "8-10" }] },
        { "id": "extension_cuadriceps", "name": "Extensión de Cuádriceps", "muscle": "Cuádriceps", "nota": "Pausa de 1 seg arriba.", "videoQuery": "extensión cuádriceps máquina técnica",
          "sets": [{ "repRange": "8-10" }, { "repRange": "8-10" }, { "repRange": "8-10" }] },
        { "id": "aductor_maquina", "name": "Aductor Máquina", "muscle": "Aductores", "nota": "Rango completo, sin rebotar.", "videoQuery": "aductor máquina técnica inner thigh",
          "sets": [{ "repRange": "8-10" }, { "repRange": "8-10" }] },
        { "id": "abductor_maquina", "name": "Abductor Máquina", "muscle": "Glúteo medio", "nota": "Espalda apoyada, movimiento controlado.", "videoQuery": "abductor máquina técnica glúteo medio",
          "sets": [{ "repRange": "8-10" }, { "repRange": "8-10" }] }
      ]
    },
    "sarm": {
      "label": "HOMBROS / BRAZOS",
      "description": "Deltoides · Bíceps · Tríceps",
      "color": "#A855F7",
      "grad": "from-purple-500/20 to-transparent",
      "exercises": [
        { "id": "press_militar_smith", "name": "Press Militar Smith", "muscle": "Deltoides ant.", "nota": "Codos adelante, banco 80-90°.", "videoQuery": "press militar smith técnica hombros",
          "sets": [{ "repRange": "4-6", "heavy": true }, { "repRange": "4-6", "heavy": true }, { "repRange": "8-10" }] },
        { "id": "vuelos_laterales_maquina", "name": "Vuelos Laterales Máquina", "muscle": "Deltoides lateral", "nota": "No hacer tanta fuerza con el agarre.", "videoQuery": "vuelos laterales máquina deltoides técnica",
          "sets": [{ "repRange": "12-15" }, { "repRange": "12-15" }, { "repRange": "12-15" }, { "repRange": "12-15" }] },
        { "id": "pec_dec_deltoides_sarm", "name": "Pec Dec Deltoides Posterior", "muscle": "Deltoides post.", "nota": "Unilateral.", "videoQuery": "pec dec deltoides posterior técnica",
          "sets": [{ "repRange": "12-15" }, { "repRange": "12-15" }] },
        { "id": "biceps_martillo", "name": "Bíceps Martillo", "muscle": "Bíceps / braquial", "nota": "Alternado.", "videoQuery": "curl martillo bíceps técnica hammer curl",
          "sets": [{ "repRange": "6-8" }, { "repRange": "6-8" }, { "repRange": "6-8" }] },
        { "id": "biceps_banco_scott", "name": "Bíceps Banco Scott", "muscle": "Bíceps", "nota": "Unilateral con mancuerna.", "videoQuery": "curl banco scott técnica bíceps preacher curl",
          "sets": [{ "repRange": "6-8" }, { "repRange": "6-8" }, { "repRange": "6-8" }] },
        { "id": "biceps_banco_inclinado", "name": "Bíceps Banco Inclinado", "muscle": "Bíceps cab. larga", "nota": "Alternado, 6 puntos arriba.", "videoQuery": "curl banco inclinado bíceps técnica incline curl",
          "sets": [{ "repRange": "8-10" }, { "repRange": "8-10" }] },
        { "id": "triceps_trasnuca_sarm", "name": "Tríceps Trasnuca", "muscle": "Tríceps", "nota": "Pausa en el fondo.", "videoQuery": "triceps trasnuca técnica overhead extension",
          "sets": [{ "repRange": "8-10" }, { "repRange": "8-10" }, { "repRange": "8-10" }] }
      ]
    }
  }
};

/* ============================================================================
   UTILIDADES — antes vivían en utils.js como archivo separado. Helpers de
   fechas/volumen, storage (localStorage + backup en IndexedDB), RPE, etc.
============================================================================ */
/* ============================== ROUTINE DATA ============================== */
/* The exercise list lives in routine.json — edit that file to add, remove, or
   tweak exercises without touching any component code. */

const yt = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

const DAY_ORDER = routineData.dayOrder;

const ROUTINE = DAY_ORDER.reduce((acc, dk) => {
  const d = routineData.days[dk];
  acc[dk] = { ...d, exercises: d.exercises.map((ex) => ({ ...ex, video: yt(ex.videoQuery) })) };
  return acc;
}, {});

const EXERCISE_BY_ID = {};
DAY_ORDER.forEach((dk) => {
  ROUTINE[dk].exercises.forEach((ex) => { EXERCISE_BY_ID[ex.id] = { ...ex, dayKey: dk }; });
});

const KEY_TO_DAY = {};
DAY_ORDER.forEach((dk) => {
  ROUTINE[dk].exercises.forEach((ex) => {
    ex.sets.forEach((_, i) => { KEY_TO_DAY[`${ex.id}_${i}`] = dk; });
  });
});

/* ============================== CONSTANTS ============================== */

const REST_LONG = 300;
const REST_SHORT = 180;
const TRAIN_WEEKS = 7;
const DELOAD_WEEKS = 1;
const CYCLE_WEEKS = TRAIN_WEEKS + DELOAD_WEEKS;
const STAGNATION_DAYS = 21;

const DEFAULT_SETTINGS = {
  alertType: "sound", restLong: REST_LONG, restShort: REST_SHORT,
  trainWeeks: TRAIN_WEEKS, deloadWeeks: DELOAD_WEEKS, deloadPct: 0.75, deloadSetDivisor: 2,
};

function getProfileSettings(profile) { return { ...DEFAULT_SETTINGS, ...(profile?.settings || {}) }; }

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

function loadProfiles() { try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || "{}"); } catch { return {}; } }
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

function parseLogKey(key) {
  const idx = key.lastIndexOf("_");
  return { exerciseId: key.slice(0, idx), setIndex: parseInt(key.slice(idx + 1), 10) };
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
    entries.forEach((e) => {
      if (!byDate[e.date]) byDate[e.date] = { date: e.date, dayKeys: new Set(), items: [], totalVolume: 0, rpeSum: 0, rpeCount: 0 };
      const s = byDate[e.date];
      s.dayKeys.add(ex.dayKey);
      s.items.push({ exerciseId, exerciseName: ex.name, dayKey: ex.dayKey, setIndex, reps: e.reps, kg: e.kg, rpe: e.rpe ?? null });
      s.totalVolume += vol(e.kg, e.reps);
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
.tab-fade-in { animation: fadeSlideIn 0.25s ease both; }
@keyframes modalBgIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes modalPopIn { from { opacity: 0; transform: translateY(12px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
.modal-bg-in { animation: modalBgIn 0.18s ease both; }
.modal-pop-in { animation: modalPopIn 0.22s cubic-bezier(.2,.8,.3,1) both; }
@keyframes gentleBounceIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
.bounce-in { animation: gentleBounceIn 0.3s cubic-bezier(.34,1.56,.64,1) both; }

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
   PIN INPUT
============================================================================ */
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
============================================================================ */
function LoginScreen({ onLogin }) {
  const [profiles, setProfilesState] = useState(loadProfiles);
  const [phase, setPhase] = useState("list");
  const [pendingProfile, setPendingProfile] = useState(null);
  const [pinError, setPinError] = useState("");
  const [regName, setRegName] = useState(""); const [regMail, setRegMail] = useState(""); const [regPin, setRegPin] = useState("");
  const [regStep, setRegStep] = useState(1); const [regError, setRegError] = useState("");
  const deviceId = getDeviceId();
  const profileList = Object.keys(profiles);
  const deviceProfile = profileList.find((n) => profiles[n].deviceId === deviceId);

  const tryLogin = (name) => { const p = profiles[name]; if (p.pin) { setPendingProfile(name); setPhase("pin"); } else { saveActive(name); onLogin(name, profiles); } };
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
        maxesSetupDays: { push: false, pull: false, legs: false, sarm: false },
        onboardingDismissed: false,
        // Perfil recién creado: todavía no vio el tutorial guiado de la app.
        // Se dispara automáticamente apenas termina (o salta) el asistente
        // de marcas iniciales — ver `closeHub` en el componente App.
        tutorialSeen: false,
      },
    };
    saveProfiles(newProfiles); setProfilesState(newProfiles); saveActive(name); onLogin(name, newProfiles);
  };
  const handleRegister = () => {
    setRegError("");
    if (!regName.trim()) { setRegError("Ingresá tu nombre."); return; }
    if (profiles[regName.trim()]) { setRegError("Ya existe ese nombre."); return; }
    if (regMail && !regMail.includes("@")) { setRegError("Email inválido."); return; }
    if (regStep === 1) { setRegStep(2); return; }
    if (regStep === 2) { if (regPin.length > 0 && regPin.length < 4) { setRegError("El PIN debe tener 4 dígitos."); return; } if (regPin.length === 0) { finishRegister(); return; } setRegStep(3); return; }
    if (regStep === 3) { finishRegister(); }
  };
  useEffect(() => { if (deviceProfile && !profiles[deviceProfile].pin) { saveActive(deviceProfile); onLogin(deviceProfile, profiles); } }, []);

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
          <button onClick={() => { setPhase("list"); setRegStep(1); setRegError(""); }} className="text-slate-500 hover:text-slate-300"><ChevronDown size={20} className="rotate-90" /></button>
          <h2 className="text-lg font-bold text-white">Crear perfil</h2>
        </div>
        <div className="flex gap-1.5 mb-6">{[1, 2, 3].map((s) => <div key={s} className={`h-1 flex-1 rounded-full transition-all ${regStep >= s ? "bg-teal-500" : "bg-slate-800"}`} />)}</div>
        <div className="space-y-4">
          {regStep === 1 && (<>
            <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Nombre</label><input type="text" placeholder="¿Cómo te llamás?" value={regName} onChange={(e) => setRegName(e.target.value)} className="w-full bg-slate-900/80 border border-slate-700/50 rounded-2xl px-4 py-3.5 text-white focus:outline-none focus:border-teal-500/60 text-sm transition" autoFocus /></div>
            <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Email <span className="text-slate-600 normal-case">(opcional)</span></label><input type="email" placeholder="tu@email.com" value={regMail} onChange={(e) => setRegMail(e.target.value)} className="w-full bg-slate-900/80 border border-slate-700/50 rounded-2xl px-4 py-3.5 text-white focus:outline-none focus:border-teal-500/60 text-sm transition" /></div>
          </>)}
          {regStep === 2 && (<div className="text-center py-4"><p className="text-slate-400 text-sm mb-6">¿Querés proteger tu perfil con un PIN?</p><div className="flex gap-3 justify-center"><button onClick={() => { setRegPin(""); finishRegister(); }} className="flex-1 py-3.5 rounded-2xl border border-slate-700 text-slate-400 text-sm font-semibold">Sin PIN</button><button onClick={() => setRegStep(2.5)} className="flex-1 py-3.5 rounded-2xl bg-teal-500 text-white text-sm font-bold">Con PIN</button></div></div>)}
          {regStep === 2.5 && <PinInput length={4} label="Elegí un PIN" onComplete={(p) => { setRegPin(p); setRegStep(3); }} />}
          {regStep === 3 && <PinInput length={4} label="Confirmá el PIN" onComplete={(p) => { if (p === regPin) { finishRegister(); } else { setRegError("No coinciden."); setTimeout(() => setRegError(""), 1500); } }} error={regError} />}
        </div>
        {regError && regStep === 1 && <p className="text-rose-400 text-xs mt-3 text-center">{regError}</p>}
        {regStep === 1 && <button onClick={handleRegister} className="w-full mt-6 py-4 rounded-2xl bg-teal-500 text-white font-bold text-sm hover:bg-teal-400 active:scale-[0.98] transition-all shadow-lg shadow-teal-500/20">Continuar →</button>}
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
        {profileList.length > 0 && (<div className="mb-5"><p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-3">Perfiles</p><div className="space-y-2">{profileList.map((name) => (
          <button key={name} onClick={() => tryLogin(name)} className="w-full flex items-center gap-3.5 bg-slate-900/60 border border-slate-800/60 hover:border-teal-500/30 rounded-2xl px-4 py-3.5 transition-all active:scale-[0.98] text-left group">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black shrink-0" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)", color: "white" }}>{name.charAt(0).toUpperCase()}</div>
            <div className="flex-1 min-w-0"><p className="text-white font-semibold text-sm">{name}</p><p className="text-[11px] text-slate-500">{profiles[name].pin ? "🔒 Con PIN" : "Sin PIN"} · {profiles[name].deviceId === deviceId ? "Este dispositivo" : "Otro dispositivo"}</p></div>
            <ChevronRight size={16} className="text-slate-600 group-hover:text-teal-400 transition shrink-0" />
          </button>
        ))}</div></div>)}
        <button onClick={() => setPhase("register")} className="w-full py-4 rounded-2xl border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-teal-500/40 transition-all text-sm font-semibold flex items-center justify-center gap-2">+ Crear perfil nuevo</button>
      </div>
    </div>
  );
}

/* ============================================================================
   REST TIMER
============================================================================ */
function RestTimer({ seconds, accent, alertType = "sound" }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  const ref = useRef();
  useEffect(() => { setRemaining(seconds); setRunning(false); }, [seconds]);
  useEffect(() => {
    if (running) { ref.current = setInterval(() => { setRemaining((r) => { if (r <= 1) { clearInterval(ref.current); setRunning(false); if (alertType !== "vibration") { try { const a = new AudioContext(); [0, 220].forEach((d) => setTimeout(() => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; o.connect(g); g.connect(a.destination); g.gain.value = 0.2; o.start(); setTimeout(() => o.stop(), 280); }, d)); } catch { } } if (alertType !== "sound") { haptic([250, 120, 250, 120, 250]); } return 0; } return r - 1; }); }, 1000); }
    return () => clearInterval(ref.current);
  }, [running, alertType]);
  const pct = Math.max(0, Math.min(100, (remaining / seconds) * 100)), r = 16, circ = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3 bg-slate-900/60 rounded-2xl px-4 py-3 border border-slate-800/60">
      <div className="relative w-12 h-12 shrink-0">
        <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
          <circle cx="18" cy="18" r={r} fill="none" stroke="#1a1a2e" strokeWidth="3" />
          <circle cx="18" cy="18" r={r} fill="none" stroke={accent} strokeWidth="3" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.3s linear" }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-200">{formatTime(remaining)}</span>
      </div>
      <div className="flex gap-2">
        <button onClick={() => { haptic(15); setRunning((r) => !r); }} className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 transition text-slate-200">{running ? <Pause size={16} /> : <Play size={16} />}</button>
        <button onClick={() => { setRunning(false); setRemaining(seconds); }} className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 transition text-slate-200"><RotateCcw size={16} /></button>
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

/* ---- Demo en vivo: pestaña Rutina (día, panel, tarjeta de ejercicio, reset) ---- */
function RutinaDemo({ view }) {
  const [demoDay, setDemoDay] = useState("push");
  const [demoLogs, setDemoLogs] = useState({});
  const [confirmReset, setConfirmReset] = useState(false);

  if (view === "daypicker") {
    return (
      <div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {DAY_ORDER.map((k) => (
            <button key={k} onClick={() => setDemoDay(k)} className="px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-95 border"
              style={demoDay === k ? { background: ROUTINE[k].color, borderColor: ROUTINE[k].color, color: "#fff" } : { borderColor: "#1e2035", color: "#475569" }}>
              {ROUTINE[k].label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-600 mt-2">Elegiste <span className="font-bold" style={{ color: ROUTINE[demoDay].color }}>{ROUTINE[demoDay].label}</span> — así de simple cambia el día.</p>
      </div>
    );
  }

  if (view === "panel") {
    const day = ROUTINE[demoDay];
    const totalSets = day.exercises.reduce((a, e) => a + e.sets.length, 0);
    return (
      <div className="relative overflow-hidden rounded-2xl border p-4" style={{ borderColor: day.color + "30", background: `linear-gradient(135deg, ${day.color}1c, transparent 70%)` }}>
        <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg mb-2" style={{ backgroundColor: day.color + "22", color: day.color }}>
          <RotateCcw size={10} /> Sugerido para hoy
        </div>
        <h3 className="text-lg font-black text-white leading-tight">{day.label}</h3>
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
            <button onClick={() => setConfirmReset(false)} className="px-2.5 py-1.5 rounded-lg bg-rose-500/80 text-white text-xs font-bold">Sí</button>
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
      deloadSets={null}
      deloadMode={false}
      resetKey={0}
      settings={DEFAULT_SETTINGS}
      forceOpen={forceOpen}
    />
  );
}

/* ---- Demo en vivo: pestaña Progreso (stats, gráfico, PRs, músculo, historial) ---- */
function ProgresoDemo({ view }) {
  const [metric, setMetric] = useState("peso");

  if (view === "stats") {
    const tiles = [
      { val: 34, label: "Días entrenados", accent: "#14B8A6" },
      { val: "6🔥", label: "Racha actual", accent: "#F59E0B" },
      { val: 187, label: "Series registradas", accent: "#06B6D4" },
      { val: "12.4k", label: "Kg × reps", accent: "#A855F7" },
    ];
    return (
      <div className="grid grid-cols-2 gap-2">
        {tiles.map(({ val, label, accent }) => (
          <div key={label} className="rounded-xl p-3 border" style={{ backgroundColor: accent + "12", borderColor: accent + "30" }}>
            <p className="text-lg font-black text-white leading-none tabular-nums">{val}</p>
            <p className="text-[10px] font-semibold text-white/80 mt-1">{label}</p>
          </div>
        ))}
      </div>
    );
  }

  if (view === "daycounts") {
    const counts = { push: 5, pull: 4, legs: 3, sarm: 6 };
    return (
      <div className="flex gap-2">
        {DAY_ORDER.map((dk) => { const d = ROUTINE[dk]; return (
          <div key={dk} className="flex-1 bg-slate-800/40 rounded-xl p-2.5 text-center border border-slate-800/60">
            <div className="w-7 h-7 rounded-lg mx-auto flex items-center justify-center mb-1 text-[10px] font-black" style={{ backgroundColor: d.color + "18", color: d.color }}>{d.label.slice(0, 1)}</div>
            <p className="text-sm font-black text-white">{counts[dk]}</p>
            <p className="text-[8px] text-slate-600 leading-tight">series<br />mejoradas</p>
          </div>
        ); })}
      </div>
    );
  }

  if (view === "chart") {
    const dataKey = metric === "peso" ? "kg" : metric === "vol" ? "vol" : "e1rm";
    const label = metric === "peso" ? "Kg" : metric === "vol" ? "Volumen" : "1RM est.";
    return (
      <div>
        <div className="flex justify-end mb-2">
          <div className="flex bg-slate-950/60 rounded-xl p-0.5 border border-slate-800/60">
            {[{ k: "peso", l: "Kg" }, { k: "vol", l: "Vol" }, { k: "1rm", l: "1RM" }].map((opt) => (
              <button key={opt.k} onClick={() => setMetric(opt.k)} className={`px-2.5 py-1 rounded-[8px] text-[10px] font-bold transition-all ${metric === opt.k ? "bg-teal-500 text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>
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
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" />
              <XAxis dataKey="date" stroke="#334155" fontSize={9} />
              <YAxis stroke="#334155" fontSize={9} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey={dataKey} stroke="#14B8A6" fill="url(#gDemoChart)" strokeWidth={2} dot={{ r: 2.5, fill: "#14B8A6", strokeWidth: 0 }} name={label} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  if (view === "prs") {
    const items = [
      { medal: "🥇", name: "Press Banca", day: "PUSH", val: "98kg", sub: "5×80kg" },
      { medal: "🥈", name: "Sentadilla Búlgara", day: "PIERNAS", val: "91kg", sub: "8×72.5kg" },
      { medal: "🥉", name: "Dorsalera Agarre Ancho", day: "PULL", val: "84kg", sub: "8×65kg" },
    ];
    return (
      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.name} className="flex items-center gap-2.5 bg-slate-800/40 rounded-xl px-3 py-2 border border-slate-800/40">
            <span className="text-base shrink-0 w-6 text-center">{it.medal}</span>
            <div className="flex-1 min-w-0"><p className="text-xs font-bold text-white truncate">{it.name}</p><p className="text-[9px] font-bold text-teal-500">{it.day}</p></div>
            <div className="text-right shrink-0"><p className="text-xs font-black text-white">{it.val}</p><p className="text-[9px] text-slate-500">{it.sub}</p></div>
          </div>
        ))}
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
  return <div className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-700 text-slate-500 text-[11px] font-medium"><Trash2 size={11} /> Resetear todo el historial</div>;
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

  if (view === "datos") {
    return (
      <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl divide-y divide-slate-800/50 overflow-hidden">
        {[{ icon: <Mail size={12} />, label: "Email", val: "ej@mail.com" }, { icon: <Clock size={12} />, label: "Unido el", val: "12 marzo 2026" }].map(({ icon, label, val }) => (
          <div key={label} className="flex items-center gap-2.5 px-3 py-2.5"><span className="text-slate-600">{icon}</span><span className="text-slate-500 text-[11px] flex-1">{label}</span><span className="text-slate-300 text-[11px] font-medium">{val}</span></div>
        ))}
      </div>
    );
  }

  if (view === "marcas") {
    return (
      <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-800/50 rounded-xl px-3.5 py-3">
        <div className="w-8 h-8 rounded-lg bg-teal-500/15 text-teal-400 flex items-center justify-center shrink-0"><Target size={14} /></div>
        <div className="flex-1"><p className="text-xs font-bold text-white">Marcas iniciales</p><p className="text-[10px] text-slate-500">2/4 días configurados</p></div>
        <ChevronRight size={14} className="text-slate-600 shrink-0" />
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
          <button key={opt.k} onClick={() => setAlertType(opt.k)} className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${alertType === opt.k ? "bg-teal-500 text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>
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
      <div className="w-full flex items-center gap-2 justify-center py-2.5 rounded-xl border border-slate-700 text-slate-400 text-[11px] font-semibold"><LogOut size={12} /> Cambiar de perfil</div>
      <div className="w-full flex items-center gap-2 justify-center py-2.5 rounded-xl border border-rose-500/20 text-rose-500/70 text-[11px] font-semibold"><Trash2 size={12} /> Eliminar perfil</div>
    </div>
  );
}

function DemoPreview({ kind, view }) {
  if (kind === "rutina") return <RutinaDemo view={view} />;
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
        text: "Esta app te ayuda a registrar tus entrenamientos, ver cómo progresan tus marcas con el tiempo, y saber cuándo te toca bajar la intensidad. Te mostramos rápido cómo funciona cada parte — y vas a poder probar cada función en vivo a medida que la explicamos. Podés saltear el recorrido en cualquier momento tocando la X.",
      },
      {
        icon: <Layers size={20} />,
        title: "Cuatro secciones principales",
        text: "Abajo de la pantalla (o al costado, en pantallas grandes) tenés 4 pestañas: Rutina para entrenar, Progreso para ver tu evolución, Descarga para tu semana de recuperación, y Perfil para tu configuración. Vamos una por una.",
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
        icon: <Calendar size={20} />,
        title: "Elegí tu día",
        text: "Arriba de todo elegís el día: Push, Pull, Piernas u Hombros/Brazos. La app resalta uno como \"sugerido para hoy\" según el último tipo de día que entrenaste — no según el calendario.",
        demo: { kind: "rutina", view: "daypicker", caption: "Tocá un día y mirá cómo cambia" },
      },
      {
        icon: <ListChecks size={20} />,
        title: "Panel del día",
        text: "El panel de arriba muestra cuánto llevás completado hoy (%), cuántos ejercicios tiene el día y cuántas series en total. Si tu ciclo está en semana de descarga, te lo avisa ahí mismo.",
        demo: { kind: "rutina", view: "panel" },
      },
      {
        icon: <ChevronDown size={20} />,
        title: "Tarjetas de ejercicio",
        text: "Cada ejercicio es una tarjeta: tocala para desplegarla y ver sus series, la nota técnica y el video. Si lleva 21+ días sin superar el récord, te avisa que está \"estancado\".",
        demo: { kind: "rutina", view: "card-closed", caption: "Tocá la tarjeta para desplegarla" },
      },
      {
        icon: <Save size={20} />,
        title: "Registrá tus series",
        text: "Por cada serie ingresás reps y kg, y tocás el botón de guardar. Tu mejor marca (récord) de esa serie se calcula sola, y si la superás te avisa con un mensaje y un efecto de confetti.",
        demo: { kind: "rutina", view: "card-open", caption: "Probá: ingresá reps y kg, y tocá Guardar" },
      },
      {
        icon: <Activity size={20} />,
        title: "Esfuerzo (RPE), opcional",
        text: "Debajo de cada serie podés tocar \"+ Registrar RPE\" para anotar qué tan dura te resultó, en una escala de 6 a 10. Es opcional, pero ayuda a detectar fatiga acumulada con el tiempo.",
        demo: { kind: "rutina", view: "card-open", caption: "Tocá \"+ Registrar RPE\" debajo de una serie" },
      },
      {
        icon: <Pause size={20} />,
        title: "Descanso entre series",
        text: "El temporizador de descanso te avisa (con sonido, vibración o ambos, según lo que elijas en Perfil) cuándo arrancar la próxima serie. Podés pausarlo o reiniciarlo con los botones de al lado.",
        demo: { kind: "rutina", view: "card-open", caption: "El cronómetro está debajo de las series — probá pausarlo" },
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
        text: "Si te equivocaste registrando algo, \"Resetear sesión de hoy\" borra solo los datos de hoy en ese día de rutina — tus récords no se tocan.",
        demo: { kind: "rutina", view: "reset", caption: "Tocá el botón para ver cómo pide confirmación" },
      },
    ],
  },
  {
    key: "progreso",
    label: "Progreso",
    color: "#06B6D4",
    icon: <BarChart3 size={16} />,
    steps: [
      {
        icon: <Activity size={20} />,
        title: "Progreso: tu evolución",
        text: "Esta pestaña junta todos tus registros para mostrarte qué tan constante fuiste y cuánto mejoraste, con gráficos, rankings y tu historial completo.",
      },
      {
        icon: <Flame size={20} />,
        title: "Estadísticas generales",
        text: "Arriba ves tus días entrenados, tu racha actual de días seguidos, el total de series registradas y el volumen total (kg × reps) acumulado.",
        demo: { kind: "progreso", view: "stats" },
      },
      {
        icon: <TrendingUp size={20} />,
        title: "Mejoras por día",
        text: "Te muestra cuántas series mejoraste (superaste tu primer registro) en cada tipo de día: Push, Pull, Piernas y Hombros/Brazos.",
        demo: { kind: "progreso", view: "daycounts" },
      },
      {
        icon: <BarChart3 size={20} />,
        title: "Gráfico de evolución",
        text: "Elegí el día y el ejercicio con las tarjetas, la serie con los botones S1/S2/etc., y mirá su evolución en Kg, Volumen, 1RM estimado o RPE con los botones de arriba del gráfico.",
        demo: { kind: "progreso", view: "chart", caption: "Probá cambiar entre Kg, Vol y 1RM" },
      },
      {
        icon: <Trophy size={20} />,
        title: "Top PRs",
        text: "La pestaña \"Top PRs\" te muestra tus 5 mejores ejercicios según el 1RM estimado (una proyección de tu máximo a 1 repetición, calculada con la fórmula de Epley).",
        demo: { kind: "progreso", view: "prs" },
      },
      {
        icon: <Dumbbell size={20} />,
        title: "Volumen por músculo",
        text: "En \"Músculo\" ves el volumen acumulado histórico por grupo muscular, para detectar si algún grupo está quedando atrás respecto a los demás.",
        demo: { kind: "progreso", view: "muscle" },
      },
      {
        icon: <Calendar size={20} />,
        title: "Historial de sesiones",
        text: "En \"Historial\" podés ver todo lo que entrenaste: en un calendario mensual con un punto de color por día entrenado, o en una lista con el detalle completo de cada sesión.",
        demo: { kind: "progreso", view: "calendar" },
      },
      {
        icon: <Trash2 size={20} />,
        title: "Resetear historial",
        text: "Al final de la pestaña tenés la opción de borrar todo tu historial de series, si alguna vez querés empezar de cero. Tus récords se mantienen guardados.",
        demo: { kind: "progreso", view: "resetall" },
      },
    ],
  },
  {
    key: "descarga",
    label: "Descarga",
    color: "#A855F7",
    icon: <Zap size={16} />,
    steps: [
      {
        icon: <Zap size={20} />,
        title: "Descarga: tu semana de recuperación",
        text: "Cada cierta cantidad de semanas de entrenamiento (lo configurás en Perfil), tu ciclo entra en una semana de descarga: menos series y menos peso, para bajar la fatiga sin perder lo ganado.",
        demo: { kind: "descarga", view: "header" },
      },
      {
        icon: <ArrowDown size={20} />,
        title: "Cargas sugeridas por día",
        text: "Elegí el día arriba y vas a ver, ejercicio por ejercicio, tu mejor marca tachada y al lado el peso sugerido para esta semana — calculado como un porcentaje de tu récord, con menos series por ejercicio.",
        demo: { kind: "descarga", view: "suggested" },
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
        text: "Arriba ves tu nombre, email (si lo cargaste) y fecha de alta. Tocá \"Editar perfil\" para cambiar el email cuando quieras.",
        demo: { kind: "perfil", view: "datos" },
      },
      {
        icon: <Target size={20} />,
        title: "Marcas iniciales",
        text: "\"Marcas iniciales\" te lleva al asistente para cargar tus pesos de partida por día — podés hacerlo de a uno, cuando quieras, no hace falta completarlo todo de una vez.",
        demo: { kind: "perfil", view: "marcas" },
      },
      {
        icon: <Calendar size={20} />,
        title: "Inicio de ciclo",
        text: "Configurá la fecha en la que arrancó tu ciclo actual de entrenamiento. A partir de ahí la app calcula en qué semana estás y cuándo te toca la descarga.",
        demo: { kind: "perfil", view: "ciclo" },
      },
      {
        icon: <SlidersHorizontal size={20} />,
        title: "Configuración de descarga",
        text: "Elegís cuántas semanas entrenás antes de la descarga, cuántas semanas dura la descarga, a qué porcentaje de tu récord vas a entrenar, y cuánto se reducen las series.",
        demo: { kind: "perfil", view: "configdescarga", caption: "Probá sumar o restar semanas" },
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
        text: "Además de guardarse en el dispositivo, tus registros se respaldan automáticamente en una segunda copia local. Si algo borra los datos del navegador, la app intenta recuperarlos sola al abrir de nuevo.",
        demo: { kind: "perfil", view: "backup" },
      },
      {
        icon: <LogOut size={20} />,
        title: "Cambiar o eliminar perfil",
        text: "Desde aquí podés cerrar sesión para cambiar de perfil, o eliminar tu perfil por completo (borra todo el historial de forma permanente, no se puede deshacer).",
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
        text: "Ya conocés todas las funciones de la app. Podés volver a ver este tutorial cuando quieras tocando el ícono de ayuda (?) arriba a la derecha, en cualquier pestaña.",
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
              style={ci === step.chapterIndex ? { backgroundColor: c.color + "22", color: c.color } : { color: "#475569" }}
            >
              {c.icon}{c.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: step.chapterColor }}>{step.chapterLabel}</span>
          <button onClick={onClose} aria-label="Cerrar ayuda" className="p-1.5 rounded-xl text-slate-500 hover:text-white hover:bg-slate-800 transition"><X size={18} /></button>
        </div>

        {/* Barra de progreso tipo "historias", segmentada por capítulo */}
        <div className="flex gap-2 mb-4">
          {HELP_CHAPTERS.map((c, ci) => (
            <div key={c.key} className="flex-1 flex gap-0.5">
              {c.steps.map((_, si) => {
                const globalIdx = ALL_HELP_STEPS.findIndex((s) => s.chapterIndex === ci && s.stepInChapter === si);
                const filled = globalIdx <= i;
                return <div key={si} className="h-1 flex-1 rounded-full transition-colors" style={{ backgroundColor: filled ? c.color : "#1e293b" }} />;
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
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black bg-teal-500 text-white transition active:scale-95">Listo</button>
          ) : (
            <button onClick={() => setI((n) => Math.min(ALL_HELP_STEPS.length - 1, n + 1))} className="px-4 py-2 rounded-xl text-xs font-black bg-teal-500 text-white transition active:scale-95">Siguiente</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   SET ROW — reps/kg, optional RPE, PR detection, haptics + confetti on PR
============================================================================ */
function SetRow({ exerciseId, setIndex, setDef, accent, logs, setLogs, deloadKgFactor = 1, deloadMode = false, resetKey = 0 }) {
  const key = `${exerciseId}_${setIndex}`, prKey = `${key}_pr_override`, today = todayStr();
  const history = logs[key] || [], override = logs[prKey];
  const computedPR = useMemo(() => { let best = setDef.pr ? { ...setDef.pr } : null; history.forEach((h) => { if (!best || vol(h.kg, h.reps) > vol(best.kg, best.reps)) best = { kg: h.kg, reps: h.reps }; }); return best; }, [history, setDef.pr]);
  const currentPR = override || computedPR;
  const suggestedKg = currentPR && deloadMode ? Math.round(currentPR.kg * deloadKgFactor * 2) / 2 : null;
  const [reps, setReps] = useState(""); const [kg, setKg] = useState(""); const [feedback, setFeedback] = useState(null);
  const [rpe, setRpe] = useState(null); const [showRpe, setShowRpe] = useState(false);
  const [editingPR, setEditingPR] = useState(false); const [editReps, setEditReps] = useState(""); const [editKg, setEditKg] = useState(""); const [saved, setSaved] = useState(false);
  const [prBurst, setPrBurst] = useState(0);
  const saveBtnRef = useRef(null);
  useEffect(() => { setReps(""); setKg(""); setFeedback(null); setSaved(false); setRpe(null); setShowRpe(false); }, [resetKey]);
  const handleSave = () => {
    const r = parseFloat(reps), k = parseFloat(kg);
    if (!r || !k || isNaN(r) || isNaN(k)) { setFeedback({ type: "error", msg: "Completá reps y kg." }); return; }
    const prevVol = currentPR ? vol(currentPR.kg, currentPR.reps) : 0, newVol = vol(k, r);
    const entry = { date: today, reps: r, kg: k }; if (rpe != null) entry.rpe = rpe;
    const newHistory = [...history.filter((h) => h.date !== today), entry];
    let newLogs = { ...logs, [key]: newHistory };
    const isPR = !currentPR || newVol > prevVol;
    if (isPR) newLogs = { ...newLogs, [prKey]: { kg: k, reps: r, date: today } };
    setLogs(newLogs); setSaved(true); setTimeout(() => setSaved(false), 1200);
    const suggestUp = r > repRangeTop(setDef.repRange);
    if (isPR) { haptic([35, 25, 45]); setPrBurst((n) => n + 1); setFeedback({ type: "pr", msg: "¡Nueva marca! 🔥", suggestUp }); }
    else { haptic(18); if (newVol === prevVol) setFeedback({ type: "tie", msg: "Igualaste tu marca 💪", suggestUp: false }); else setFeedback({ type: "down", msg: `-${(((prevVol - newVol) / prevVol) * 100).toFixed(0)}% vs récord`, suggestUp: false }); }
  };
  const savePR = () => { const r = parseFloat(editReps), k = parseFloat(editKg); if (!r || !k || isNaN(r) || isNaN(k)) return; setLogs({ ...logs, [prKey]: { kg: k, reps: r } }); setEditingPR(false); };
  return (
    <div className="py-3 border-b border-slate-800/50 last:border-0 relative">
      <PRBurst anchorRef={saveBtnRef} trigger={prBurst} />
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">S{setIndex + 1}</span>
          <span className="text-[10px] bg-slate-800/80 text-slate-500 rounded-lg px-2 py-0.5">{setDef.repRange} reps</span>
          {setDef.heavy && <span className="text-[10px] bg-amber-500/15 text-amber-400 rounded-lg px-2 py-0.5 font-bold">FUERZA</span>}
        </div>
        {feedback && <span className={`text-xs font-semibold ${feedback.type === "pr" ? "text-emerald-400 pr-pop" : feedback.type === "down" ? "text-rose-400" : "text-amber-400"}`}>{feedback.msg}</span>}
      </div>
      {feedback?.suggestUp && <div className="mb-2.5 -mt-1 text-[11px] text-teal-400 flex items-center gap-1.5"><TrendingUp size={11} /> Superaste el rango · probá +2.5kg la próxima</div>}
      {deloadMode && suggestedKg && <div className="mb-2 text-[11px] text-purple-400 flex items-center gap-1.5"><Zap size={11} /> Descarga: {suggestedKg} kg sugerido ({Math.round(deloadKgFactor * 100)}%)</div>}
      <div className="flex items-end gap-2">
        <div className="flex-1"><label className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider mb-1.5 block">Reps</label><input type="number" inputMode="decimal" placeholder="—" value={reps} onChange={(e) => setReps(e.target.value)} className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-3.5 text-xl font-black text-center text-white focus:outline-none focus:border-teal-500/50 transition" /></div>
        <div className="text-slate-700 text-lg pb-3">×</div>
        <div className="flex-1"><label className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider mb-1.5 block">Kg</label><input type="number" inputMode="decimal" placeholder="—" value={kg} onChange={(e) => setKg(e.target.value)} className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-3.5 text-xl font-black text-center text-white focus:outline-none focus:border-teal-500/50 transition" /></div>
        <button ref={saveBtnRef} onClick={handleSave} className={`p-3.5 rounded-xl transition-all active:scale-90 font-bold text-white flex items-center justify-center ${saved ? "bg-emerald-500" : "hover:opacity-90"}`} style={!saved ? { backgroundColor: accent } : {}}>{saved ? <Check size={18} /> : <Save size={18} />}</button>
      </div>
      {!showRpe && rpe == null ? (
        <button onClick={() => setShowRpe(true)} className="text-[10px] text-slate-600 hover:text-slate-400 font-semibold mt-2.5 flex items-center gap-1 transition-colors">+ Registrar RPE (esfuerzo)</button>
      ) : (
        <div className="mt-2.5 flex items-center gap-1.5 bounce-in">
          <span className="text-[10px] text-slate-600 font-semibold w-7 shrink-0">RPE</span>
          {RPE_SCALE.map((rs) => (
            <button key={rs.value} onClick={() => setRpe(rpe === rs.value ? null : rs.value)} title={rs.desc} className="w-7 h-7 rounded-lg text-[11px] font-bold transition-all active:scale-90 shrink-0" style={rpe === rs.value ? { backgroundColor: rpeColor(rs.value), color: "#0a0a0f" } : { backgroundColor: "#1e293b", color: "#64748b" }}>{rs.value}</button>
          ))}
          {rpe != null && <span className="text-[10px] text-slate-500 ml-1 truncate">{RPE_SCALE.find((r) => r.value === rpe)?.desc}</span>}
          <button onClick={() => { setRpe(null); setShowRpe(false); }} className="text-slate-600 hover:text-slate-400 ml-auto shrink-0"><X size={12} /></button>
        </div>
      )}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          {currentPR ? <span className="text-[11px] text-slate-600">Récord: <span className="text-slate-300 font-bold">{currentPR.reps}×{currentPR.kg}kg</span>{override && <span className="text-amber-500 ml-1">✎</span>}</span> : <span className="text-[11px] text-slate-700">Sin marca aún</span>}
          <button onClick={() => { setEditReps(currentPR?.reps ?? ""); setEditKg(currentPR?.kg ?? ""); setEditingPR((e) => !e); }} className="text-slate-700 hover:text-slate-400 text-xs">✏️</button>
        </div>
      </div>
      {editingPR && (
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
    </div>
  );
}

/* ============================================================================
   EXERCISE CARD
============================================================================ */
function ExerciseCard({ exercise, accent, logs, setLogs, deloadSets, deloadMode, resetKey = 0, settings = DEFAULT_SETTINGS, forceOpen = false }) {
  const [open, setOpen] = useState(false);
  // forceOpen se usa solo desde las demos del tutorial guiado, para abrir la
  // tarjeta automáticamente cuando el paso explica algo de adentro (reps/kg,
  // RPE, descanso, video). No afecta el comportamiento normal de la app.
  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);
  const hasHeavy = exercise.sets.some((s) => s.heavy);
  const setsToShow = deloadSets ? exercise.sets.slice(0, deloadSets) : exercise.sets;
  const { stagnant } = useMemo(() => getStagnationInfo(exercise, logs), [exercise, logs]);
  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-md shadow-black/20 transition-shadow hover:shadow-lg hover:shadow-black/30">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-4 hover:bg-slate-800/30 active:bg-slate-800/50 transition text-left">
        <div className="flex items-center gap-3">
          <div className="w-2 h-8 rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 10px -2px ${accent}` }} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-white text-sm">{exercise.name}</h3>
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-lg font-bold" style={{ backgroundColor: accent + "18", color: accent }}>{exercise.muscle}</span>
              {deloadMode && <span className="text-[10px] bg-purple-500/15 text-purple-400 rounded-lg px-1.5 py-0.5 font-bold">DESCARGA</span>}
              {!deloadMode && stagnant && <span className="text-[10px] bg-rose-500/15 text-rose-400 rounded-lg px-1.5 py-0.5 font-bold flex items-center gap-1"><AlertTriangle size={9} /> ESTANCADO</span>}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">{exercise.nota}</p>
          </div>
        </div>
        <ChevronDown size={18} className={`text-slate-600 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 tab-fade-in">
          {!deloadMode && stagnant && <div className="mb-3 text-[11px] text-rose-400/90 bg-rose-500/5 border border-rose-500/15 rounded-xl px-3 py-2 flex items-start gap-1.5"><Info size={12} className="mt-0.5 shrink-0" /><span>Hace {STAGNATION_DAYS}+ días sin superar el récord. Considerá cambiar reps, descanso o variante.</span></div>}
          {setsToShow.map((s, i) => <SetRow key={i} exerciseId={exercise.id} setIndex={i} setDef={s} accent={accent} logs={logs} setLogs={setLogs} deloadKgFactor={settings.deloadPct} deloadMode={deloadMode} resetKey={resetKey} />)}
          <div className="flex flex-col gap-2 pt-3">
            <RestTimer seconds={hasHeavy ? settings.restLong : settings.restShort} accent={accent} alertType={settings.alertType} />
            <a href={exercise.video} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-800 text-slate-400 hover:border-slate-600 hover:text-white transition text-sm font-medium">▶ Ver técnica en YouTube</a>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   WEEK CALENDAR (cycle overview, unchanged logic — small polish)
============================================================================ */
function WeekCalendar({ cycleStart, logs, settings = DEFAULT_SETTINGS }) {
  const weekInfo = getWeekInfo(cycleStart, settings);
  if (!cycleStart || !weekInfo) return null;
  const { cycleWeeks, trainWeeks } = weekInfo;
  const trainedDays = useMemo(() => { const s = new Set(); Object.entries(logs).forEach(([k, v]) => { if (k.endsWith("_pr_override") || !Array.isArray(v)) return; v.forEach((e) => s.add(e.date)); }); return s; }, [logs]);
  const weekDots = Array.from({ length: cycleWeeks }, (_, wi) => { const ws = new Date(cycleStart); ws.setDate(ws.getDate() + wi * 7); const days = Array.from({ length: 7 }, (_, di) => { const d = new Date(ws); d.setDate(d.getDate() + di); return d.toISOString().slice(0, 10); }); return { week: wi + 1, days, trained: days.filter((d) => trainedDays.has(d)).length, isDeload: wi + 1 > trainWeeks }; });
  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm shadow-md shadow-black/20">
      <div className="flex items-center justify-between mb-4">
        <div><h3 className="text-sm font-bold text-white">Ciclo actual</h3><p className="text-[11px] text-slate-500">Ciclo #{weekInfo.cycleNumber} · Semana {weekInfo.weekInCycle} de {cycleWeeks}</p></div>
        <div className={`px-3 py-1.5 rounded-xl text-xs font-bold ${weekInfo.isDeload ? "bg-purple-500/20 text-purple-400" : "bg-teal-500/20 text-teal-400"}`}>{weekInfo.isDeload ? "DESCARGA" : "ENTRENAMIENTO"}</div>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {weekDots.map(({ week, trained, isDeload }) => { const isCurrent = week === weekInfo.weekInCycle; return (
          <div key={week} className="flex flex-col items-center gap-1">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black transition-all ${isCurrent ? "ring-2 ring-offset-2 ring-offset-slate-950" : ""} ${isDeload ? (isCurrent ? "bg-purple-500 ring-purple-500 text-white" : "bg-purple-500/10 text-purple-600 border border-purple-500/20") : trained > 0 ? (isCurrent ? "bg-teal-500 ring-teal-500 text-white" : "bg-teal-500/20 text-teal-400 border border-teal-500/20") : (isCurrent ? "bg-slate-700 ring-slate-500 text-white" : "bg-slate-800/50 text-slate-700 border border-slate-800")}`}>
              {isDeload ? "D" : week}
            </div>
            {trained > 0 && !isDeload && <div className="flex gap-0.5">{Array.from({ length: Math.min(trained, 7) }).map((_, i) => <div key={i} className="w-1 h-1 rounded-full bg-teal-500/60" />)}</div>}
          </div>
        ); })}
      </div>
      <div className="flex gap-4 mt-4 text-[10px] text-slate-600">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-md bg-teal-500/20 border border-teal-500/30" /><span>Entrenamiento</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-md bg-purple-500/20 border border-purple-500/30" /><span>Descarga</span></div>
      </div>
    </div>
  );
}

/* ============================================================================
   ROUTINE VIEW — redesigned: day picker up top, a single "hero" panel for the
   active day (gradient + stats + reset, replacing the old separate summary
   card), then the exercise list in a responsive grid.
============================================================================ */
function RoutineView({ logs, setLogs, cycleStart, settings }) {
  const [activeDay, setActiveDay] = useState(() => getSuggestedDay(logs));
  const suggestedDay = useMemo(() => getSuggestedDay(logs), []);
  const weekInfo = getWeekInfo(cycleStart, settings), isDeload = weekInfo?.isDeload, day = ROUTINE[activeDay];
  const [resetKeys, setResetKeys] = useState({ push: 0, pull: 0, legs: 0, sarm: 0 });
  const [confirmReset, setConfirmReset] = useState(false);
  const getDeloadSets = (ex) => Math.max(1, Math.ceil(ex.sets.length / settings.deloadSetDivisor));

  const today = todayStr();
  let totalSets = 0, doneToday = 0;
  day.exercises.forEach((ex) => ex.sets.forEach((s, i) => { totalSets++; const h = logs[`${ex.id}_${i}`] || []; if (h.some((x) => x.date === today)) doneToday++; }));
  const pct = totalSets ? Math.round((doneToday / totalSets) * 100) : 0;

  const handleResetDay = () => {
    const newLogs = { ...logs };
    day.exercises.forEach((ex) => { ex.sets.forEach((_, i) => { const key = `${ex.id}_${i}`; if (newLogs[key]) { newLogs[key] = newLogs[key].filter((h) => h.date !== today); if (!newLogs[key].length) delete newLogs[key]; } }); });
    setLogs(newLogs); setResetKeys((prev) => ({ ...prev, [activeDay]: prev[activeDay] + 1 })); setConfirmReset(false);
  };

  return (
    <div className="space-y-4">
      <WeekCalendar cycleStart={cycleStart} logs={logs} settings={settings} />

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {DAY_ORDER.map((k) => (
          <button key={k} onClick={() => setActiveDay(k)} className="px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-95 border hover:-translate-y-0.5"
            style={activeDay === k ? { background: ROUTINE[k].color, borderColor: ROUTINE[k].color, color: "#fff", boxShadow: `0 4px 14px -4px ${ROUTINE[k].color}66` } : { borderColor: "#1e2035", color: "#475569" }}>
            {ROUTINE[k].label}
          </button>
        ))}
      </div>

      <div key={activeDay} className="relative overflow-hidden rounded-2xl border tab-fade-in" style={{ borderColor: day.color + "30", background: `linear-gradient(135deg, ${day.color}1c, transparent 70%)` }}>
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-25 pointer-events-none" style={{ backgroundColor: day.color }} />
        <div className="relative p-5">
          {activeDay === suggestedDay && (
            <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg mb-3" style={{ backgroundColor: day.color + "22", color: day.color }}>
              <RotateCcw size={10} /> Sugerido para hoy
            </div>
          )}
          <h2 className="text-xl font-black text-white leading-tight">{day.label}</h2>
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
              <p className="text-[11px] text-slate-400 flex-1">¿Borrar reps/kg de hoy? Los récords no cambian.</p>
              <button onClick={() => setConfirmReset(false)} className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs">No</button>
              <button onClick={handleResetDay} className="px-2.5 py-1.5 rounded-lg bg-rose-500/80 text-white text-xs font-bold">Sí</button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {day.exercises.map((ex) => <ExerciseCard key={ex.id} exercise={ex} accent={day.color} logs={logs} setLogs={setLogs} deloadSets={isDeload ? getDeloadSets(ex) : null} deloadMode={isDeload} resetKey={resetKeys[activeDay]} settings={settings} />)}
      </div>
    </div>
  );
}

/* ============================================================================
   SESSION HISTORY — calendar + list views over buildSessionsIndex(logs)
============================================================================ */
function SessionDetailCard({ session }) {
  const dateLabel = new Date(session.date + "T00:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-4 bounce-in">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-bold text-white capitalize">{dateLabel}</p>
          <div className="flex gap-1 mt-1">{session.dayKeys.map((dk) => <span key={dk} className="text-[10px] font-bold px-1.5 py-0.5 rounded-lg" style={{ backgroundColor: ROUTINE[dk].color + "20", color: ROUTINE[dk].color }}>{ROUTINE[dk].label}</span>)}</div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-black text-white">{session.totalSets} <span className="text-[10px] text-slate-500 font-normal">series</span></p>
          {session.avgRpe != null && <p className="text-[10px] font-bold mt-0.5" style={{ color: rpeColor(session.avgRpe) }}>RPE prom. {session.avgRpe}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        {session.items.map((it, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-slate-400 truncate flex-1">{it.exerciseName} <span className="text-slate-600">S{it.setIndex + 1}</span></span>
            <span className="text-slate-200 font-semibold shrink-0 ml-2">{it.reps}×{it.kg}kg{it.rpe != null && <span className="ml-1.5 font-bold" style={{ color: rpeColor(it.rpe) }}>RPE{it.rpe}</span>}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionHistoryView({ logs }) {
  const sessions = useMemo(() => buildSessionsIndex(logs), [logs]);
  const sessionByDate = useMemo(() => { const m = {}; sessions.forEach((s) => { m[s.date] = s; }); return m; }, [sessions]);
  const [view, setView] = useState("calendar");
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selectedDate, setSelectedDate] = useState(null);
  const weeks = useMemo(() => getMonthMatrix(cursor.y, cursor.m), [cursor]);
  const selectedSession = selectedDate ? sessionByDate[selectedDate] : null;

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
      <div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60 w-fit">
        {[{ k: "calendar", icon: <LayoutGrid size={13} />, l: "Calendario" }, { k: "list", icon: <List size={13} />, l: "Lista" }].map((opt) => (
          <button key={opt.k} onClick={() => setView(opt.k)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold transition-all ${view === opt.k ? "bg-teal-500 text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.icon}{opt.l}</button>
        ))}
      </div>

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
                return (
                  <button key={i} onClick={() => s && setSelectedDate(isSelected ? null : d)} disabled={!s}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-all ${isSelected ? "ring-2 ring-teal-400" : ""} ${isToday ? "border border-teal-500/50" : ""} ${s ? "bg-slate-800/70 text-slate-200 hover:bg-slate-700/80 active:scale-95" : "text-slate-700"}`}>
                    {dayNum}
                    {s && <div className="flex gap-0.5">{s.dayKeys.slice(0, 3).map((dk) => <span key={dk} className="w-1 h-1 rounded-full" style={{ backgroundColor: ROUTINE[dk].color }} />)}</div>}
                  </button>
                );
              })}
            </div>
          </div>
          {selectedSession ? <SessionDetailCard session={selectedSession} /> : <p className="text-center text-[11px] text-slate-600 py-2">Tocá un día con marca para ver el detalle.</p>}
        </div>
      ) : (
        <div key="list" className="space-y-2.5 tab-fade-in">
          {sessions.map((s) => <SessionDetailCard key={s.date} session={s} />)}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   DELOAD VIEW (unchanged from prior redesign)
============================================================================ */
function DeloadView({ logs, settings = DEFAULT_SETTINGS }) {
  const { trainWeeks, deloadWeeks, deloadPct, deloadSetDivisor } = settings;
  const pctLabel = Math.round(deloadPct * 100);
  const [activeDay, setActiveDay] = useState(DAY_ORDER[0]);
  const day = ROUTINE[activeDay];

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-950/60 via-slate-900/80 to-slate-900/60 p-5">
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
              style={isActive ? { backgroundColor: d.color + "22", borderColor: d.color + "55", color: d.color } : { borderColor: "#1e2035", color: "#475569" }}>
              <span>{d.label}</span>
              {withPR > 0 && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={isActive ? { backgroundColor: d.color + "30", color: d.color } : { backgroundColor: "#1e2035", color: "#475569" }}>{withPR}/{d.exercises.length}</span>}
            </button>
          );
        })}
      </div>

      <div key={activeDay} className="space-y-3 tab-fade-in">
        {day.exercises.map((ex) => {
          const deloadSets = Math.max(1, Math.ceil(ex.sets.length / deloadSetDivisor));
          const bestPerSet = ex.sets.map((s, i) => { const h = logs[`${ex.id}_${i}`] || []; let best = s.pr ? { ...s.pr } : null; const ov = logs[`${ex.id}_${i}_pr_override`]; if (ov) best = ov; else h.forEach((e) => { if (!best || vol(e.kg, e.reps) > vol(best.kg, best.reps)) best = e; }); return best; });
          const hasPR = bestPerSet.some(Boolean);
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
              <div className="px-4 py-3 space-y-2">
                {hasPR ? (
                  ex.sets.slice(0, deloadSets).map((s, i) => {
                    const best = bestPerSet[i], deloadKg = best ? Math.round(best.kg * deloadPct * 2) / 2 : null;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-slate-600 w-5 shrink-0">S{i + 1}</span>
                        <span className="text-[10px] text-slate-600 bg-slate-800/60 rounded-lg px-2 py-1 shrink-0">{s.repRange} reps</span>
                        {best ? (
                          <div className="flex items-center gap-2 flex-1 justify-end">
                            <span className="text-[11px] text-slate-600 line-through">{best.reps}×{best.kg}kg</span>
                            <div className="flex items-center gap-1">
                              <ArrowDown size={10} className="text-purple-400" />
                              <span className="text-sm font-black text-purple-300">{best.reps}×{deloadKg}kg</span>
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
    </div>
  );
}

/* ============================================================================
   PROGRESS VIEW — adds RPE as a chart metric and a visual exercise picker
   (cards instead of a <select>), plus the new Historial tab.
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

function ProgressView({ logs, setLogs }) {
  const allExercises = useMemo(() => DAY_ORDER.flatMap((dk) => ROUTINE[dk].exercises.map((e) => ({ id: e.id, name: e.name, day: ROUTINE[dk].label, color: ROUTINE[dk].color, sets: e.sets.length, dayKey: dk }))), []);

  const stats = useMemo(() => {
    const dateSet = new Set(); let totalVol = 0, totalSets = 0;
    Object.entries(logs).forEach(([k, v]) => { if (k.endsWith("_pr_override") || !Array.isArray(v)) return; v.forEach((e) => { dateSet.add(e.date); totalVol += vol(e.kg, e.reps); totalSets++; }); });
    let streak = 0, cursor = new Date();
    while (true) { const d = cursor.toISOString().slice(0, 10); if (dateSet.has(d)) { streak++; cursor.setDate(cursor.getDate() - 1); } else break; }
    return { totalVol: Math.round(totalVol), totalSets, streak, daysTrained: dateSet.size };
  }, [logs]);

  const muscleVolume = useMemo(() => {
    const map = {};
    DAY_ORDER.forEach((dk) => { ROUTINE[dk].exercises.forEach((ex) => { const muscle = ex.muscle.split(" ")[0]; ex.sets.forEach((s, i) => { (logs[`${ex.id}_${i}`] || []).forEach((e) => { map[muscle] = (map[muscle] || 0) + vol(e.kg, e.reps); }); }); }); });
    return Object.entries(map).map(([name, val]) => ({ name, val: Math.round(val) })).sort((a, b) => b.val - a.val).slice(0, 6);
  }, [logs]);

  const [selId, setSelId] = useState(allExercises[0]?.id);
  const [selSet, setSelSet] = useState(0);
  const [metric, setMetric] = useState("peso");
  const [dayFilter, setDayFilter] = useState(DAY_ORDER[0]);
  const selEx = allExercises.find((e) => e.id === selId);
  const filteredExercises = allExercises.filter((e) => e.dayKey === dayFilter);
  const history = (logs[`${selId}_${selSet}`] || []).slice().sort((a, b) => (a.date > b.date ? 1 : -1));
  const chartData = history.map((h) => ({ date: h.date.slice(5), kg: h.kg, reps: h.reps, vol: vol(h.kg, h.reps), e1rm: estimate1RM(h.kg, h.reps), rpe: h.rpe ?? null }));

  const prBoard = useMemo(() => {
    return allExercises.map((ex) => {
      let best1rm = 0, bestKg = 0, bestReps = 0;
      Array.from({ length: ex.sets }).forEach((_, i) => {
        const ov = logs[`${ex.id}_${i}_pr_override`], h = logs[`${ex.id}_${i}`] || [];
        const entries = ov ? [ov] : h;
        entries.forEach((e) => { const rm = estimate1RM(e.kg, e.reps); if (rm > best1rm) { best1rm = rm; bestKg = e.kg; bestReps = e.reps; } });
      });
      return { ...ex, best1rm, bestKg, bestReps };
    }).filter((e) => e.best1rm > 0).sort((a, b) => b.best1rm - a.best1rm).slice(0, 5);
  }, [logs, allExercises]);

  const dayPRcounts = useMemo(() => {
    const counts = {};
    DAY_ORDER.forEach((dk) => { let improved = 0; ROUTINE[dk].exercises.forEach((ex) => { ex.sets.forEach((s, i) => { const h = logs[`${ex.id}_${i}`] || []; if (h.length > 1 && vol(h[h.length - 1].kg, h[h.length - 1].reps) > vol(h[0].kg, h[0].reps)) improved++; }); }); counts[dk] = improved; });
    return counts;
  }, [logs]);

  const [confirmResetProgress, setConfirmResetProgress] = useState(false);
  const [activeTab, setActiveTab] = useState("chart");

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/50 via-slate-900/80 to-slate-900/60 p-5">
        <div className="absolute -top-8 -right-6 w-32 h-32 rounded-full bg-cyan-500/15 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full bg-teal-500/10 blur-2xl pointer-events-none" />
        <div className="relative flex items-center gap-2 mb-1">
          <Activity size={16} className="text-cyan-400" />
          <span className="text-[11px] font-black uppercase tracking-widest text-cyan-400">Tu evolución</span>
        </div>
        <h2 className="relative text-xl font-black text-white leading-tight">Progreso</h2>
        <p className="relative text-xs text-cyan-300/60 mt-1">Marcas, volumen y constancia a lo largo del tiempo</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {[
          { val: stats.daysTrained, label: "Días entrenados", sub: "desde el inicio", accent: "#14B8A6" },
          { val: stats.streak > 0 ? `${stats.streak}🔥` : "0", label: "Racha actual", sub: "días seguidos", accent: "#F59E0B" },
          { val: stats.totalSets, label: "Series registradas", sub: "total histórico", accent: "#06B6D4" },
          { val: stats.totalVol > 999 ? `${(stats.totalVol / 1000).toFixed(1)}k` : stats.totalVol, label: "Kg × reps", sub: "volumen total", accent: "#A855F7" },
        ].map(({ val, label, sub, accent }) => (
          <div key={label} className="rounded-2xl p-4 backdrop-blur-sm shadow-md shadow-black/20 relative overflow-hidden border" style={{ backgroundColor: accent + "12", borderColor: accent + "30" }}>
            <div className="absolute top-0 right-0 w-16 h-16 rounded-full blur-2xl opacity-25 -translate-y-4 translate-x-4" style={{ backgroundColor: accent }} />
            <p className="text-2xl font-black text-white tabular-nums leading-none relative">{val}</p>
            <p className="text-xs font-semibold text-white/80 mt-1 relative">{label}</p>
            <p className="text-[10px] text-slate-600 mt-0.5 relative">{sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-cyan-500/[0.04] border border-cyan-500/15 rounded-2xl p-4 backdrop-blur-sm shadow-md shadow-black/20">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Mejoras por día</p>
        <div className="flex gap-2">
          {DAY_ORDER.map((dk) => {
            const d = ROUTINE[dk], count = dayPRcounts[dk] || 0;
            return (
              <div key={dk} className="flex-1 bg-slate-800/40 rounded-xl p-2.5 text-center border border-slate-800/60">
                <div className="w-8 h-8 rounded-xl mx-auto flex items-center justify-center mb-1.5 text-[10px] font-black" style={{ backgroundColor: d.color + "18", color: d.color }}>{d.label.slice(0, 1)}</div>
                <p className="text-sm font-black text-white">{count}</p>
                <p className="text-[9px] text-slate-600 leading-tight mt-0.5">series<br />mejoradas</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-md shadow-black/20">
        <div className="flex border-b border-slate-800/60">
          {[{ k: "chart", l: "Evolución", icon: <Activity size={13} /> }, { k: "prs", l: "Top PRs", icon: <Trophy size={13} /> }, { k: "muscle", l: "Músculo", icon: <BarChart3 size={13} /> }, { k: "historial", l: "Historial", icon: <Calendar size={13} /> }].map(({ k, l, icon }) => (
            <button key={k} onClick={() => setActiveTab(k)} className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-3 text-[10px] sm:text-xs font-bold transition-all ${activeTab === k ? "text-teal-400 border-b-2 border-teal-400" : "text-slate-600 hover:text-slate-400"}`}>{icon}{l}</button>
          ))}
        </div>

        <div key={activeTab} className="p-4 tab-fade-in">
          {activeTab === "chart" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500 font-semibold">Ejercicio y serie</p>
                <div className="flex bg-slate-950/60 rounded-xl p-0.5 border border-slate-800/60 shrink-0">
                  {[{ k: "peso", l: "Kg" }, { k: "vol", l: "Vol" }, { k: "1rm", l: "1RM" }, { k: "rpe", l: "RPE" }].map((opt) => (
                    <button key={opt.k} onClick={() => setMetric(opt.k)} className={`px-2 py-1.5 rounded-[10px] text-[10px] font-bold transition-all ${metric === opt.k ? "bg-teal-500 text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>
                  ))}
                </div>
              </div>

              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {DAY_ORDER.map((dk) => (
                  <button key={dk} onClick={() => { setDayFilter(dk); const first = allExercises.find((e) => e.dayKey === dk); if (first) { setSelId(first.id); setSelSet(0); } }}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border shrink-0"
                    style={dayFilter === dk ? { backgroundColor: ROUTINE[dk].color + "22", borderColor: ROUTINE[dk].color + "55", color: ROUTINE[dk].color } : { borderColor: "#1e2035", color: "#475569" }}>
                    {ROUTINE[dk].label}
                  </button>
                ))}
              </div>

              {/* Visual exercise picker — replaces the old <select> dropdown */}
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {filteredExercises.map((e) => {
                  const isSel = e.id === selId;
                  const best = (() => { let b = 0; for (let i = 0; i < e.sets; i++) { const ov = logs[`${e.id}_${i}_pr_override`]; const h = logs[`${e.id}_${i}`] || []; const entries = ov ? [ov] : h; entries.forEach((x) => { const rm = estimate1RM(x.kg, x.reps); if (rm > b) b = rm; }); } return b; })();
                  return (
                    <button key={e.id} onClick={() => { setSelId(e.id); setSelSet(0); }}
                      className={`shrink-0 min-w-[132px] text-left rounded-2xl border px-3 py-2.5 transition-all active:scale-95 ${isSel ? "" : "border-slate-800 bg-slate-900/40 hover:border-slate-700"}`}
                      style={isSel ? { backgroundColor: e.color + "1c", borderColor: e.color + "55" } : {}}>
                      <p className="text-[11px] font-bold truncate" style={{ color: isSel ? e.color : "#e2e8f0" }}>{e.name}</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">{best > 0 ? `1RM est. ${best}kg` : "Sin marca"}</p>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2">
                {Array.from({ length: selEx?.sets || 1 }).map((_, i) => (
                  <button key={i} onClick={() => setSelSet(i)} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${selSet === i ? "border-teal-500/50 bg-teal-500/10 text-teal-400" : "border-slate-800 text-slate-600"}`}>S{i + 1}</button>
                ))}
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
                        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" />
                        <XAxis dataKey="date" stroke="#334155" fontSize={10} />
                        <YAxis stroke="#334155" fontSize={10} domain={metric === "rpe" ? [0, 10] : ["auto", "auto"]} />
                        <Tooltip content={<CustomTooltip />} />
                        {metric === "peso" && <Area type="monotone" dataKey="kg" stroke={selEx?.color || "#14B8A6"} fill="url(#gA)" strokeWidth={2.5} dot={{ r: 3, fill: selEx?.color, strokeWidth: 0 }} name="Kg" />}
                        {metric === "vol" && <Area type="monotone" dataKey="vol" stroke="#A855F7" fill="url(#gA)" strokeWidth={2.5} dot={{ r: 3, fill: "#A855F7", strokeWidth: 0 }} name="Volumen" />}
                        {metric === "1rm" && <Area type="monotone" dataKey="e1rm" stroke="#14B8A6" fill="url(#gA)" strokeWidth={2.5} dot={{ r: 3, fill: "#14B8A6", strokeWidth: 0 }} name="1RM est." />}
                        {metric === "rpe" && <Area type="monotone" dataKey="rpe" stroke="#F43F5E" fill="url(#gA)" strokeWidth={2.5} dot={{ r: 3, fill: "#F43F5E", strokeWidth: 0 }} name="RPE" connectNulls />}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  {metric === "rpe" ? (
                    (() => {
                      const vals = chartData.filter((d) => d.rpe != null).map((d) => d.rpe);
                      if (!vals.length) return <p className="text-[11px] text-slate-600 text-center">Todavía no registraste RPE para esta serie.</p>;
                      const avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
                      return <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/15"><Activity size={14} /><span>RPE promedio: <span className="font-black">{avg}</span> · {vals.length} sesiones con dato</span></div>;
                    })()
                  ) : chartData.length >= 2 && (() => {
                    const f = chartData[0], l = chartData[chartData.length - 1];
                    const fVal = metric === "peso" ? f.kg : metric === "vol" ? f.vol : f.e1rm, lVal = metric === "peso" ? l.kg : metric === "vol" ? l.vol : l.e1rm;
                    const diff = lVal - fVal, pct2 = fVal ? ((diff / fVal) * 100).toFixed(1) : 0, pos = diff >= 0;
                    const metricLabel = metric === "peso" ? "de kg" : metric === "vol" ? "de volumen" : "de 1RM estimado";
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

          {activeTab === "prs" && (
            <div className="space-y-2.5">
              <p className="text-xs text-slate-500">Top ejercicios por 1RM estimado</p>
              {prBoard.length === 0 ? (
                <div className="text-center py-10 text-slate-600"><Award size={28} className="mx-auto mb-2.5 opacity-30" /><p className="text-sm">Todavía no hay marcas registradas.</p></div>
              ) : (
                prBoard.map((ex, idx) => {
                  const medals = ["🥇", "🥈", "🥉", "4", "5"];
                  return (
                    <div key={ex.id} className="flex items-center gap-3 bg-slate-800/40 rounded-xl px-3.5 py-3 border border-slate-800/40">
                      <span className="text-lg shrink-0 w-7 text-center">{medals[idx]}</span>
                      <div className="flex-1 min-w-0"><p className="text-sm font-bold text-white truncate">{ex.name}</p><p className="text-[10px] font-bold" style={{ color: ex.color }}>{ex.day}</p></div>
                      <div className="text-right shrink-0"><p className="text-sm font-black text-white">{ex.best1rm}<span className="text-xs text-slate-500 font-normal">kg</span></p><p className="text-[10px] text-slate-500">{ex.bestReps}×{ex.bestKg}kg</p></div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === "muscle" && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Volumen acumulado por grupo muscular</p>
              {muscleVolume.length === 0 ? (
                <div className="text-center py-10 text-slate-600"><Dumbbell size={28} className="mx-auto mb-2.5 opacity-30" /><p className="text-sm">Sin datos todavía.</p></div>
              ) : (
                muscleVolume.map(({ name, val }, i) => {
                  const max = muscleVolume[0].val, pct3 = max ? (val / max) * 100 : 0;
                  const colors = ["#14B8A6", "#3B82F6", "#F97316", "#A855F7", "#F59E0B", "#EC4899"];
                  const color = colors[i % colors.length];
                  return (
                    <div key={name}>
                      <div className="flex items-center justify-between mb-1.5"><span className="text-xs font-bold text-slate-300">{name}</span><span className="text-xs font-black tabular-nums" style={{ color }}>{val.toLocaleString("es-AR")}</span></div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct3}%`, backgroundColor: color, boxShadow: `0 0 8px -2px ${color}` }} /></div>
                    </div>
                  );
                })
              )}
              <p className="text-[10px] text-slate-600 pt-1">Volumen = kg × repeticiones totales históricas</p>
            </div>
          )}

          {activeTab === "historial" && <SessionHistoryView logs={logs} />}
        </div>
      </div>

      {!confirmResetProgress ? (
        <button onClick={() => setConfirmResetProgress(true)} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-800/60 text-slate-600 hover:text-rose-400 hover:border-rose-500/30 transition text-xs font-medium"><Trash2 size={12} /> Resetear todo el historial</button>
      ) : (
        <div className="flex gap-2 items-center bg-rose-950/30 border border-rose-500/20 rounded-xl px-3 py-2.5">
          <p className="text-xs text-rose-300/80 flex-1">¿Borrar todo el historial? Los récords se mantienen.</p>
          <button onClick={() => setConfirmResetProgress(false)} className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs">No</button>
          <button onClick={() => { const nl = {}; Object.entries(logs).forEach(([k, v]) => { if (k.endsWith("_pr_override")) nl[k] = v; }); setLogs(nl); setConfirmResetProgress(false); }} className="px-2.5 py-1.5 rounded-lg bg-rose-500 text-white text-xs font-bold">Sí, borrar</button>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   PROFILE VIEW — adds an entry point to the setup hub + a backup status line
============================================================================ */
function ProfileView({ profileName, profiles, onLogout, onDelete, onUpdateProfile, cycleStart, onSetCycleStart, onOpenSetup }) {
  const profile = profiles[profileName];
  const [showDeletePin, setShowDeletePin] = useState(false); const [deleteError, setDeleteError] = useState("");
  const [editing, setEditing] = useState(false); const [editMail, setEditMail] = useState(profile?.email || "");
  const [showCycleSetup, setShowCycleSetup] = useState(false);
  const joinDate = profile?.joinedAt ? new Date(profile.joinedAt).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" }) : "—";
  const settings = getProfileSettings(profile), weekInfo = getWeekInfo(cycleStart, settings);
  const updateSettings = (patch) => onUpdateProfile({ settings: { ...settings, ...patch } });
  const adjustRest = (key, delta) => updateSettings({ [key]: Math.min(600, Math.max(30, settings[key] + delta)) });
  const adjustSetting = (key, delta, min, max) => updateSettings({ [key]: Math.min(max, Math.max(min, settings[key] + delta)) });
  const adjustDeloadPct = (delta) => updateSettings({ deloadPct: Math.min(0.95, Math.max(0.5, Math.round((settings.deloadPct + delta) * 100) / 100)) });
  const handleDeleteConfirm = (pin) => { if (profile.pin && pin !== profile.pin) { setDeleteError("PIN incorrecto."); setTimeout(() => setDeleteError(""), 1500); } else { onDelete(); } };
  const initial = profileName.charAt(0).toUpperCase();
  const setupDays = profile?.maxesSetupDays || {};
  const setupDoneCount = DAY_ORDER.filter((dk) => setupDays[dk]).length;

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-slate-900 to-slate-900/50 border border-slate-800/50 rounded-2xl p-5 text-center shadow-md shadow-black/20">
        <div className="w-20 h-20 rounded-3xl mx-auto flex items-center justify-center text-3xl font-black text-white mb-3" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)" }}>{initial}</div>
        <h2 className="text-xl font-black text-white">{profileName}</h2>
        {profile?.email && <p className="text-sm text-slate-400 mt-1">{profile.email}</p>}
        <p className="text-[11px] text-slate-600 mt-1">Miembro desde {joinDate}</p>
      </div>

      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl divide-y divide-slate-800/50 overflow-hidden backdrop-blur-sm shadow-md shadow-black/20">
        {[{ icon: <Mail size={14} />, label: "Email", val: profile?.email || "No configurado" }, { icon: <Clock size={14} />, label: "Unido el", val: joinDate }, { icon: <Calendar size={14} />, label: "Ciclo actual", val: weekInfo ? `Ciclo #${weekInfo.cycleNumber} · Semana ${weekInfo.weekInCycle}/${weekInfo.cycleWeeks}` : "No iniciado" }, { icon: <Zap size={14} />, label: "Estado", val: weekInfo ? (weekInfo.isDeload ? "🟣 Semana de descarga" : "🟠 Semana de entrenamiento") : "—" }].map(({ icon, label, val }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3.5"><span className="text-slate-600">{icon}</span><span className="text-slate-500 text-xs flex-1">{label}</span><span className="text-slate-300 text-xs font-medium text-right">{val}</span></div>
        ))}
      </div>

      {editing ? (
        <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 space-y-3 bounce-in">
          <input type="email" value={editMail} onChange={(e) => setEditMail(e.target.value)} placeholder="tu@email.com" className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-3 text-white text-sm focus:outline-none" />
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-semibold">Cancelar</button>
            <button onClick={() => { onUpdateProfile({ email: editMail }); setEditing(false); }} className="flex-1 py-3 rounded-xl bg-teal-500 text-white text-sm font-bold">Guardar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="w-full flex items-center gap-2 justify-center py-3 rounded-2xl border border-slate-800 text-slate-400 hover:border-slate-600 hover:text-white transition text-sm font-medium"><Edit3 size={14} /> Editar perfil</button>
      )}

      <button onClick={onOpenSetup} className="w-full flex items-center gap-3 bg-slate-900/50 border border-slate-800/50 rounded-2xl px-4 py-3.5 hover:border-teal-500/30 transition text-left">
        <div className="w-9 h-9 rounded-xl bg-teal-500/15 text-teal-400 flex items-center justify-center shrink-0"><Target size={16} /></div>
        <div className="flex-1 min-w-0"><p className="text-sm font-bold text-white">Marcas iniciales</p><p className="text-[11px] text-slate-500">{setupDoneCount}/4 días configurados</p></div>
        <ChevronRight size={16} className="text-slate-600 shrink-0" />
      </button>

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
            <button onClick={() => { const val = document.getElementById("cycle-date-input").value; if (val) { onSetCycleStart(new Date(val)); setShowCycleSetup(false); } }} className="flex-1 py-3 rounded-xl bg-teal-500 text-white text-sm font-bold">Guardar</button>
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
        <div><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Reducción de series</p><div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">{[{ k: 2, l: "Mitad" }, { k: 3, l: "Tercio" }, { k: 4, l: "Cuarto" }].map((opt) => <button key={opt.k} onClick={() => updateSettings({ deloadSetDivisor: opt.k })} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${settings.deloadSetDivisor === opt.k ? "bg-purple-500 text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>)}</div></div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm shadow-md shadow-black/20 space-y-3.5">
        <div><p className="text-sm font-bold text-white">Descanso entre series</p><p className="text-[11px] text-slate-500 mt-0.5">Cómo te avisamos y cuánto dura cada pausa</p></div>
        <div><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Aviso al terminar</p><div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">{[{ k: "sound", l: "Sonido" }, { k: "vibration", l: "Vibración" }, { k: "both", l: "Ambos" }].map((opt) => <button key={opt.k} onClick={() => updateSettings({ alertType: opt.k })} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${settings.alertType === opt.k ? "bg-teal-500 text-white" : "text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>)}</div></div>
        <div className="grid grid-cols-2 gap-3">
          {[{ key: "restLong", label: "Ejercicios pesados" }, { key: "restShort", label: "Resto" }].map(({ key, label }) => (
            <div key={key} className="bg-slate-950/40 rounded-xl p-3"><p className="text-[10px] text-slate-500 mb-2">{label}</p><div className="flex items-center justify-between"><button onClick={() => adjustRest(key, -15)} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 active:scale-95">−</button><span className="text-sm font-black text-white tabular-nums">{formatTime(settings[key])}</span><button onClick={() => adjustRest(key, 15)} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 active:scale-95">+</button></div></div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2.5 px-1 text-[11px] text-slate-600">
        <Save size={12} className="text-slate-600 shrink-0" />
        <span>Tus datos se guardan en este dispositivo, con una copia de seguridad automática.</span>
      </div>

      <button onClick={onLogout} className="w-full flex items-center gap-2 justify-center py-3.5 rounded-2xl border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 transition text-sm font-semibold"><LogOut size={14} /> Cambiar de perfil</button>
      {!showDeletePin ? (
        <button onClick={() => setShowDeletePin(true)} className="w-full flex items-center gap-2 justify-center py-3.5 rounded-2xl border border-rose-500/20 text-rose-500/70 hover:text-rose-400 hover:border-rose-500/40 transition text-sm font-semibold"><Trash2 size={14} /> Eliminar perfil de {profileName}</button>
      ) : (
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4 bounce-in">
          <div className="flex items-start gap-2.5 mb-4"><AlertTriangle size={16} className="text-rose-400 mt-0.5 shrink-0" /><p className="text-xs text-rose-400 font-semibold">{profile?.pin ? "Esto borra el perfil y todo el historial de forma permanente. Ingresá tu PIN para confirmar." : "Esto borra el perfil y todo el historial de forma permanente. No se puede deshacer."}</p></div>
          {profile?.pin ? <PinInput label="PIN para confirmar" onComplete={handleDeleteConfirm} error={deleteError} onCancel={() => setShowDeletePin(false)} /> : (
            <div className="flex gap-2"><button onClick={() => setShowDeletePin(false)} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-semibold">Cancelar</button><button onClick={onDelete} className="flex-1 py-3 rounded-xl bg-rose-500 text-white text-sm font-bold">Eliminar perfil</button></div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   MAX SETUP HUB + WIZARD — split by day, can be done at different times.
============================================================================ */
function MaxSetupHub({ profile, onStartDay, onClose }) {
  const done = profile?.maxesSetupDays || {};
  const doneCount = DAY_ORDER.filter((dk) => done[dk]).length;
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col px-4 py-10 relative overflow-hidden">
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />
      <div className="max-w-sm mx-auto w-full relative flex-1 flex flex-col">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-teal-500/15 flex items-center justify-center mx-auto mb-4"><Target className="text-teal-500" size={26} /></div>
          <h2 className="text-xl font-black text-white">Configurá tus marcas iniciales</h2>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">Podés hacerlo de a un día por vez, cuando tengas tiempo. La app va a guardar tu progreso por separado en cada uno.</p>
        </div>
        <div className="space-y-2.5 flex-1">
          {DAY_ORDER.map((dk) => {
            const d = ROUTINE[dk], isDone = !!done[dk];
            return (
              <button key={dk} onClick={() => onStartDay(dk)} className="w-full flex items-center gap-3.5 bg-slate-900/60 border border-slate-800/60 hover:border-slate-700 rounded-2xl px-4 py-3.5 transition-all active:scale-[0.98] text-left">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: isDone ? "#10B98122" : d.color + "18", color: isDone ? "#10B981" : d.color }}>{isDone ? <Check size={18} /> : <Dumbbell size={16} />}</div>
                <div className="flex-1 min-w-0"><p className="text-white font-semibold text-sm">{d.label}</p><p className="text-[11px] text-slate-500">{isDone ? "Configurado" : `${d.exercises.length} ejercicios`}</p></div>
                <ChevronRight size={16} className="text-slate-600 shrink-0" />
              </button>
            );
          })}
        </div>
        <div className="pt-6">
          <p className="text-center text-[11px] text-slate-600 mb-3">{doneCount}/4 días configurados</p>
          <button onClick={onClose} className="w-full py-4 rounded-2xl bg-teal-500 text-white font-bold text-sm hover:bg-teal-400 active:scale-[0.98] transition-all shadow-lg shadow-teal-500/20">{doneCount > 0 ? "Continuar a la app" : "Configurar más tarde"}</button>
        </div>
      </div>
    </div>
  );
}

function MaxSetupWizard({ dayKey, logs, setLogs, onDone }) {
  const day = ROUTINE[dayKey];
  const allSets = day.exercises.flatMap((ex) => ex.sets.map((s, si) => ({ ex, setIndex: si, s, key: `${ex.id}_${si}` })));
  const [step, setStep] = useState(0); const [values, setValues] = useState({});
  const current = allSets[step];
  const handleNext = () => {
    const v = values[current.key];
    if (v?.kg && v?.reps) { const prKey = `${current.key}_pr_override`; setLogs({ ...logs, [prKey]: { kg: parseFloat(v.kg), reps: parseFloat(v.reps) } }); }
    if (step >= allSets.length - 1) onDone(); else setStep((s) => s + 1);
  };
  const pct = Math.round((step / allSets.length) * 100);
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col px-4 py-8 relative overflow-hidden">
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-30" style={{ backgroundColor: day.color }} />
      <div className="max-w-sm mx-auto w-full flex-1 flex flex-col relative">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">Marcas — {day.label}</h2>
            <span className="text-xs text-slate-500">{step + 1} / {allSets.length}</span>
          </div>
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: day.color }} /></div>
          <p className="text-[10px] text-slate-600 mt-1.5">Podés saltear ejercicios que no hayas hecho</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-5 flex-1 flex flex-col justify-between shadow-xl shadow-black/30">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg mb-3 inline-block" style={{ backgroundColor: day.color + "18", color: day.color }}>{day.label}</span>
            <h3 className="text-xl font-black text-white mt-2">{current.ex.name}</h3>
            <p className="text-sm text-slate-500 mt-1">{current.ex.muscle}</p>
            <p className="text-xs text-slate-600 mt-3 italic">"{current.ex.nota}"</p>
            <div className="mt-6">
              <p className="text-xs font-semibold text-slate-400 mb-3">Serie {current.setIndex + 1} · {current.s.repRange} reps</p>
              <div className="flex gap-3">
                <div className="flex-1"><label className="text-[10px] text-slate-600 uppercase tracking-wider font-bold mb-1.5 block">Tu mejor Reps</label><input type="number" inputMode="decimal" placeholder="—" value={values[current.key]?.reps || ""} onChange={(e) => setValues((v) => ({ ...v, [current.key]: { ...v[current.key], reps: e.target.value } }))} className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-4 text-2xl font-black text-center text-white focus:outline-none transition" /></div>
                <div className="text-slate-700 text-xl pb-2 flex items-end">×</div>
                <div className="flex-1"><label className="text-[10px] text-slate-600 uppercase tracking-wider font-bold mb-1.5 block">Tu mejor Kg</label><input type="number" inputMode="decimal" placeholder="—" value={values[current.key]?.kg || ""} onChange={(e) => setValues((v) => ({ ...v, [current.key]: { ...v[current.key], kg: e.target.value } }))} className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-4 text-2xl font-black text-center text-white focus:outline-none transition" /></div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <button onClick={() => { if (step < allSets.length - 1) setStep((s) => s + 1); else onDone(); }} className="py-3.5 px-4 rounded-2xl border border-slate-700 text-slate-400 text-sm font-semibold">Saltear</button>
            <button onClick={handleNext} className="flex-1 py-3.5 rounded-2xl text-white text-sm font-bold active:scale-[0.98] transition-all shadow-lg" style={{ backgroundColor: day.color, boxShadow: `0 10px 25px -8px ${day.color}aa` }}>{step < allSets.length - 1 ? "Siguiente →" : "Listo ✓"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   NAVIGATION — bottom bar on mobile, side rail from lg breakpoint up
============================================================================ */
const NAV_TABS = [
  { key: "rutina", icon: <Dumbbell size={20} />, label: "Rutina" },
  { key: "progreso", icon: <BarChart3 size={20} />, label: "Progreso" },
  { key: "descarga", icon: <Zap size={20} />, label: "Descarga" },
];

function BottomBar({ tab, setTab, profileName }) {
  const initial = profileName.charAt(0).toUpperCase();
  const tabs = [...NAV_TABS, { key: "perfil", icon: <div className="w-7 h-7 rounded-xl flex items-center justify-center text-sm font-black text-white" style={{ background: tab === "perfil" ? "linear-gradient(135deg,#14B8A6,#0E7490)" : "transparent", border: tab === "perfil" ? "none" : "2px solid #334155", color: tab === "perfil" ? "white" : "#6B7280" }}>{initial}</div>, label: profileName }];
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/50">
      <div className="max-w-xl mx-auto flex">
        {tabs.map(({ key, icon, label }) => (
          <button key={key} onClick={() => setTab(key)} className="flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-all active:scale-95">
            <span className={`transition-all ${tab === key ? "text-teal-400" : "text-slate-600"}`}>{icon}</span>
            <span className={`text-[9px] font-bold uppercase tracking-wider transition-all ${tab === key ? "text-teal-400" : "text-slate-700"}`}>{label.length > 8 ? label.slice(0, 7) + "…" : label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SideNav({ tab, setTab, profileName }) {
  const initial = profileName.charAt(0).toUpperCase();
  const tabs = [...NAV_TABS, { key: "perfil", icon: <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black text-white shrink-0" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)" }}>{initial}</div>, label: profileName }];
  return (
    <div className="hidden lg:flex lg:flex-col lg:w-56 lg:shrink-0 lg:h-screen lg:sticky lg:top-0 border-r border-slate-800/50 bg-[#0a0a0f]/60 px-3 py-6">
      <div className="flex items-center gap-2.5 px-2 mb-8">
        <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-teal-500/30 to-teal-500/5 border border-teal-500/20 flex items-center justify-center shrink-0"><Flame className="text-teal-500" size={18} /></div>
        <span className="font-black text-white text-sm tracking-tight">Mi Rutina</span>
      </div>
      <div className="space-y-1">
        {tabs.map(({ key, icon, label }) => (
          <button key={key} onClick={() => setTab(key)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === key ? "bg-teal-500/15 text-teal-400" : "text-slate-500 hover:text-slate-300 hover:bg-slate-900/60"}`}>
            <span className={tab === key ? "text-teal-400" : "text-slate-600"}>{icon}</span>
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
   APP ROOT
============================================================================ */
function allDaysDone(profile) {
  if (profile?.maxesSetupDays) return DAY_ORDER.every((dk) => profile.maxesSetupDays[dk]);
  return !!profile?.maxesSetup;
}

export default function App() {
  const [profiles, setProfiles] = useState(loadProfiles);
  const [activeProfile, setActiveProfile] = useState(null);
  const [tab, setTab] = useState("rutina");
  const [cycleStart, setCycleStartState] = useState(loadCycleStart);
  const [showHub, setShowHub] = useState(false);
  const [wizardDay, setWizardDay] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [helpStartTab, setHelpStartTab] = useState(null);
  const [recoveredNotice, setRecoveredNotice] = useState(false);

  useEffect(() => {
    const saved = loadActive();
    if (saved && profiles[saved] && !profiles[saved].pin) {
      setActiveProfile(saved);
      if (!allDaysDone(profiles[saved]) && !profiles[saved].onboardingDismissed) setShowHub(true);
    }
  }, []);

  // One-time recovery: if localStorage looks empty, see if IndexedDB has a backup.
  useEffect(() => {
    if (Object.keys(profiles).length > 0) return;
    (async () => {
      const restored = await tryRestoreFromIDB();
      if (restored?.profiles && Object.keys(restored.profiles).length) {
        setProfiles(restored.profiles);
        setRecoveredNotice(true);
        if (restored.cycleStart) setCycleStartState(new Date(restored.cycleStart));
        const savedActive = restored.active;
        if (savedActive && restored.profiles[savedActive] && !restored.profiles[savedActive].pin) {
          setActiveProfile(savedActive);
          if (!allDaysDone(restored.profiles[savedActive]) && !restored.profiles[savedActive].onboardingDismissed) setShowHub(true);
        }
        setTimeout(() => setRecoveredNotice(false), 6000);
      }
    })();
  }, []);

  const profile = profiles[activeProfile], logs = profile?.logs || {};
  const setLogs = useCallback((newLogs) => { const np = { ...profiles, [activeProfile]: { ...profiles[activeProfile], logs: newLogs } }; setProfiles(np); saveProfiles(np); }, [profiles, activeProfile]);
  const handleLogin = (name, updatedProfiles) => { const profs = updatedProfiles || profiles; setProfiles(profs); setActiveProfile(name); if (!allDaysDone(profs[name]) && !profs[name]?.onboardingDismissed) setShowHub(true); };
  const handleLogout = () => { saveActive(null); setActiveProfile(null); setShowHub(false); setWizardDay(null); setShowHelp(false); setHelpStartTab(null); };
  const handleDelete = () => { const np = { ...profiles }; delete np[activeProfile]; setProfiles(np); saveProfiles(np); saveActive(null); setActiveProfile(null); setShowHub(false); setWizardDay(null); setShowHelp(false); setHelpStartTab(null); };
  const handleUpdateProfile = (updates) => { const np = { ...profiles, [activeProfile]: { ...profiles[activeProfile], ...updates } }; setProfiles(np); saveProfiles(np); };
  const handleSetCycleStart = (d) => { setCycleStartState(d); saveCycleStart(d); };
  const handleWizardDone = () => {
    const prevDays = profiles[activeProfile]?.maxesSetupDays || { push: false, pull: false, legs: false, sarm: false };
    const np = { ...profiles, [activeProfile]: { ...profiles[activeProfile], maxesSetupDays: { ...prevDays, [wizardDay]: true } } };
    setProfiles(np); saveProfiles(np); setWizardDay(null);
  };
  // Se llama al cerrar el hub de marcas iniciales (la "encuesta" de bienvenida),
  // ya sea porque el usuario terminó de configurar días o porque eligió
  // "Configurar más tarde". Si es la primera vez que este perfil pasa por
  // acá, disparamos el tutorial completo de la app automáticamente.
  const closeHub = () => {
    const shouldShowTutorial = profile?.tutorialSeen === false;
    handleUpdateProfile({ onboardingDismissed: true, ...(shouldShowTutorial ? { tutorialSeen: true } : {}) });
    setShowHub(false);
    if (shouldShowTutorial) {
      setHelpStartTab(null); // arranca desde el principio, recorrido completo
      setShowHelp(true);
    }
  };

  if (!activeProfile) return (<><StyleInjector />{recoveredNotice && <RecoveredBanner onClose={() => setRecoveredNotice(false)} />}<LoginScreen onLogin={handleLogin} /></>);
  if (wizardDay) return (<><StyleInjector /><MaxSetupWizard dayKey={wizardDay} logs={logs} setLogs={setLogs} onDone={handleWizardDone} /></>);
  if (showHub) return (<><StyleInjector /><MaxSetupHub profile={profile} onStartDay={(dk) => setWizardDay(dk)} onClose={closeHub} /></>);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans lg:flex">
      <StyleInjector />
      {recoveredNotice && <RecoveredBanner onClose={() => setRecoveredNotice(false)} />}
      <SideNav tab={tab} setTab={setTab} profileName={activeProfile} />
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-slate-800/40">
          <div className="max-w-xl lg:max-w-3xl xl:max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base font-black text-white shrink-0 lg:hidden" style={{ background: "linear-gradient(135deg,#14B8A6,#0E7490)" }}>{activeProfile.charAt(0).toUpperCase()}</div>
            <div className="flex-1 min-w-0">
              <h1 className="font-black text-base text-white leading-tight tracking-tight">
                {tab === "rutina" && "Rutina"}{tab === "progreso" && "Progreso"}{tab === "descarga" && "Descarga"}{tab === "perfil" && "Perfil"}
              </h1>
              <p className="text-[11px] text-slate-600 leading-tight">{activeProfile}</p>
            </div>
            <button onClick={() => { setHelpStartTab(tab); setShowHelp(true); }} aria-label="Ayuda" className="w-8 h-8 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-teal-400 hover:border-teal-500/30 transition active:scale-90"><HelpCircle size={16} /></button>
          </div>
        </header>
        <main className="max-w-xl lg:max-w-3xl xl:max-w-4xl mx-auto px-4 py-4 pb-28 lg:pb-10 space-y-4">
          <div key={tab} className="tab-fade-in">
            {tab === "rutina" && <RoutineView logs={logs} setLogs={setLogs} cycleStart={cycleStart} settings={getProfileSettings(profile)} />}
            {tab === "progreso" && <ProgressView logs={logs} setLogs={setLogs} />}
            {tab === "descarga" && <DeloadView logs={logs} settings={getProfileSettings(profile)} />}
            {tab === "perfil" && <ProfileView profileName={activeProfile} profiles={profiles} onLogout={handleLogout} onDelete={handleDelete} onUpdateProfile={handleUpdateProfile} cycleStart={cycleStart} onSetCycleStart={handleSetCycleStart} onOpenSetup={() => setShowHub(true)} />}
          </div>
        </main>
      </div>
      <BottomBar tab={tab} setTab={setTab} profileName={activeProfile} />
      {showHelp && <HelpModal startTab={helpStartTab} onClose={() => setShowHelp(false)} />}
    </div>
  );
}

function RecoveredBanner({ onClose }) {
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[150] bg-teal-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-teal-500/30 flex items-center gap-2 bounce-in">
      <Check size={14} /> Recuperamos tu copia de seguridad local
      <button onClick={onClose} className="ml-1 opacity-80 hover:opacity-100"><X size={13} /></button>
    </div>
  );
}
