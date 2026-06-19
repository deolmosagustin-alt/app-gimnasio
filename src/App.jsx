import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Play, Pause, RotateCcw, TrendingUp, TrendingDown, Dumbbell, Video,
  ChevronDown, ChevronUp, Trophy, Flame, Save, Trash2, BarChart3, ListChecks,
} from "lucide-react";

/* =========================================================================
   DATOS BASE DE LA RUTINA
   Los "PR" (records) fueron estimados analizando las mejores marcas
   registradas en las semanas previas del PDF original.
   ========================================================================= */

const REST_LONG = 300; // 5 minutos -> ejercicios de fuerza 4-6 reps
const REST_SHORT = 180; // 3 minutos -> resto de ejercicios

const ROUTINE = {
  push: {
    label: "PUSH",
    description:
      "Empuje de tren superior: pecho, hombro anterior y tríceps. Arrancamos con el básico de fuerza (press banca) y cerramos con aislamiento para maximizar el volumen.",
    color: "#ef4444",
    exercises: [
      {
        id: "press_banca",
        name: "Press Banca",
        muscle: "Pectoral",
        nota: "Hacer fuerza con las piernas.",
        video: "https://www.youtube.com/watch?v=FMpwElqKC6Q",
        sets: [
          { repRange: "3-5", pr: { reps: 5, kg: 115 }, heavy: true },
          { repRange: "3-5", pr: { reps: 7, kg: 110 }, heavy: true },
          { repRange: "8-10", pr: { reps: 10, kg: 100 } },
        ],
      },
      {
        id: "press_inclinado_smith",
        name: "Press Inclinado en Smith",
        muscle: "Pectoral superior",
        nota: "Codos bastante pegados.",
        video: "https://www.youtube.com/watch?v=O8L2eiGejQs",
        sets: [
          { repRange: "8-10", pr: { reps: 11, kg: 90 } },
          { repRange: "8-10", pr: { reps: 9, kg: 90 } },
          { repRange: "8-10", pr: { reps: 10, kg: 85 } },
        ],
      },
      {
        id: "cruce_poleas",
        name: "Cruce de Poleas",
        muscle: "Pectoral",
        nota: "Énfasis en el estiramiento.",
        video: "https://www.youtube.com/watch?v=TmYsga_aOfo",
        sets: [
          { repRange: "10-12", pr: { reps: 13, kg: 15 } },
          { repRange: "10-12", pr: { reps: 11, kg: 15 } },
        ],
      },
      {
        id: "vuelos_laterales_mancuerna",
        name: "Vuelos Laterales Mancuerna",
        muscle: "Deltoide lateral",
        nota: "Levantar un poco para adelante.",
        video: "https://www.youtube.com/watch?v=nOAUECQEpHs",
        sets: [
          { repRange: "12-15", pr: { reps: 15, kg: 13 } },
          { repRange: "12-15", pr: { reps: 16, kg: 13 } },
          { repRange: "12-15", pr: { reps: 14, kg: 10 } },
          { repRange: "12-15", pr: { reps: 13, kg: 10 } },
        ],
      },
      {
        id: "pec_dec_deltoides_push",
        name: "Pec Dec para Deltoides",
        muscle: "Deltoide posterior",
        nota: "Unilateral.",
        video: "https://www.youtube.com/watch?v=TtJmmR2RuHU",
        sets: [
          { repRange: "12-15", pr: { reps: 15, kg: 32 } },
          { repRange: "12-15", pr: { reps: 12, kg: 32 } },
        ],
      },
      {
        id: "triceps_trasnuca_push",
        name: "Tríceps Trasnuca",
        muscle: "Tríceps",
        nota: "Hacer una pausa en el fondo (codos no van cerrados).",
        video: "https://www.youtube.com/watch?v=P40-DvgM9qI",
        sets: [
          { repRange: "8-10", pr: { reps: 10, kg: 38 } },
          { repRange: "8-10", pr: { reps: 12, kg: 32 } },
        ],
      },
      {
        id: "triceps_polea_alta",
        name: "Tríceps en Polea Alta",
        muscle: "Tríceps",
        nota: "El húmero no se mueve (controlar la excéntrica).",
        video: "https://www.youtube.com/watch?v=9UzuKiOeL2c",
        sets: [
          { repRange: "8-10", pr: { reps: 14, kg: 38 } },
          { repRange: "8-10", pr: { reps: 12, kg: 40 } },
        ],
      },
    ],
  },

  pull: {
    label: "PULL",
    description:
      "Tracción de tren superior: espalda, bíceps y hombro posterior. Foco en remos y dorsalera para densidad de espalda, cerrando con bíceps.",
    color: "#3b82f6",
    exercises: [
      {
        id: "remo_ancho_maquina",
        name: "Remo Ancho Máquina",
        muscle: "Dorsal / espalda media",
        nota: "No levantar los hombros.",
        video: "https://www.youtube.com/watch?v=BADq8JYkehw",
        sets: [
          { repRange: "4-6", pr: { reps: 7, kg: 86 }, heavy: true },
          { repRange: "4-6", pr: { reps: 7, kg: 79 }, heavy: true },
          { repRange: "8-10", pr: { reps: 9, kg: 66 } },
        ],
      },
      {
        id: "dorsalera",
        name: "Dorsalera (agarre ancho)",
        muscle: "Dorsal",
        nota: "Agarre ancho, no descolocar los hombros, pulgar en la marca.",
        video: "https://www.youtube.com/watch?v=WakfOFnr5oM",
        sets: [
          { repRange: "8-10", pr: { reps: 10, kg: 66 } },
          { repRange: "8-10", pr: { reps: 8, kg: 59 } },
          { repRange: "8-10", pr: { reps: 8, kg: 52 } },
        ],
      },
      {
        id: "remo_unilateral",
        name: "Remo Unilateral",
        muscle: "Dorsal / oblicuos",
        nota: "Contraer los oblicuos, codo lo más abajo posible.",
        video: "https://www.youtube.com/watch?v=op3e-wixVFQ",
        sets: [
          { repRange: "8-10", pr: { reps: 11, kg: 25 } },
          { repRange: "8-10", pr: { reps: 9, kg: 25 } },
        ],
      },
      {
        id: "pull_over",
        name: "Pull Over",
        muscle: "Dorsal / serrato",
        nota: "Codos siempre un poco flexionados.",
        video: "https://www.youtube.com/watch?v=ntT1jn03-24",
        sets: [
          { repRange: "8-10", pr: { reps: 8, kg: 38 } },
          { repRange: "8-10", pr: { reps: 9, kg: 32 } },
          { repRange: "8-10", pr: { reps: 9, kg: 25 } },
        ],
      },
      {
        id: "face_pull",
        name: "Face Pull",
        muscle: "Deltoide posterior / trapecio",
        nota: "Polea a la altura de los ojos.",
        video: "https://www.youtube.com/watch?v=Ti7mOJ8bO7c",
        sets: [
          { repRange: "15-20", pr: { reps: 19, kg: 18 } },
          { repRange: "15-20", pr: { reps: 16, kg: 20 } },
        ],
      },
      {
        id: "biceps_alternado_mancuerna",
        name: "Bíceps Alternado Mancuerna",
        muscle: "Bíceps",
        nota: "Mover un poco el húmero al final del recorrido.",
        video: "https://www.youtube.com/watch?v=w-QsnsPcGEI",
        sets: [
          { repRange: "8-10", pr: { reps: 10, kg: 18 } },
          { repRange: "8-10", pr: { reps: 9, kg: 15 } },
          { repRange: "8-10", pr: { reps: 10, kg: 15 } },
          { repRange: "8-10", pr: { reps: 12, kg: 13 } },
        ],
      },
    ],
  },

  legs: {
    label: "PIERNAS",
    description:
      "Día agregado a tu rutina original: tren inferior completo con foco en glúteo (sentadilla búlgara), core, cuádriceps, femoral y estabilizadores de cadera (aductor/abductor). Empezás a registrar marcas desde cero.",
    color: "#22c55e",
    isNew: true,
    exercises: [
      {
        id: "sentadilla_bulgara",
        name: "Sentadilla Búlgara (glúteos)",
        muscle: "Glúteo",
        nota: "Foco en glúteo, torso ligeramente inclinado adelante.",
        video: "https://www.youtube.com/watch?v=q398FG9-oXY",
        sets: [
          { repRange: "8-10", pr: null },
          { repRange: "8-10", pr: null },
        ],
      },
      {
        id: "abdominales",
        name: "Abdominales",
        muscle: "Core",
        nota: "Controlar la excéntrica, sin impulso.",
        video: "https://www.youtube.com/watch?v=SOC2SQR09j8",
        sets: [
          { repRange: "8-10", pr: null },
          { repRange: "8-10", pr: null },
          { repRange: "8-10", pr: null },
          { repRange: "8-10", pr: null },
        ],
      },
      {
        id: "jaca",
        name: "Jaca (Hack Squat)",
        muscle: "Cuádriceps",
        nota: "Pies a la altura de hombros, bajar controlado.",
        video: "https://www.youtube.com/watch?v=itmlCUc0P3k",
        sets: [
          { repRange: "4-6", pr: null, heavy: true },
          { repRange: "4-6", pr: null, heavy: true },
          { repRange: "8-10", pr: null },
        ],
      },
      {
        id: "curl_femoral_maquina",
        name: "Curl Femoral en Máquina",
        muscle: "Femoral",
        nota: "Controlar la fase negativa, no balancear la cadera.",
        video: "https://www.youtube.com/watch?v=CBCPBnMzsMI",
        sets: [
          { repRange: "8-10", pr: null },
          { repRange: "8-10", pr: null },
          { repRange: "8-10", pr: null },
        ],
      },
      {
        id: "extension_cuadriceps",
        name: "Extensión de Cuádriceps",
        muscle: "Cuádriceps",
        nota: "Pausa de 1 segundo arriba, contracción máxima.",
        video: "https://www.youtube.com/watch?v=ndnA6yvGoqQ",
        sets: [
          { repRange: "8-10", pr: null },
          { repRange: "8-10", pr: null },
          { repRange: "8-10", pr: null },
        ],
      },
      {
        id: "aductor_maquina",
        name: "Aductor en Máquina",
        muscle: "Aductores",
        nota: "Rango completo, sin rebotar al cerrar.",
        video: "https://www.youtube.com/watch?v=gm8oEdCQg4o",
        sets: [
          { repRange: "8-10", pr: null },
          { repRange: "8-10", pr: null },
        ],
      },
      {
        id: "abductor_maquina",
        name: "Abductor en Máquina",
        muscle: "Glúteo medio / abductores",
        nota: "Espalda apoyada, movimiento controlado.",
        video: "https://www.youtube.com/watch?v=Hxn5_K0F0gw",
        sets: [
          { repRange: "8-10", pr: null },
          { repRange: "8-10", pr: null },
        ],
      },
    ],
  },

  sarm: {
    label: "HOMBROS / BRAZOS",
    description:
      "Día de hombro (énfasis press militar y laterales) combinado con brazos: bíceps en distintos ángulos y tríceps trasnuca para cerrar la semana.",
    color: "#a855f7",
    exercises: [
      {
        id: "press_militar_smith",
        name: "Press Militar Sentado Smith",
        muscle: "Deltoide anterior",
        nota: "Codos un poco adelante, banco a 80-90°, leg drive.",
        video: "https://www.youtube.com/watch?v=yYxnwbJzAEI",
        sets: [
          { repRange: "4-6", pr: { reps: 7, kg: 95 }, heavy: true },
          { repRange: "4-6", pr: { reps: 7, kg: 95 }, heavy: true },
          { repRange: "8-10", pr: { reps: 10, kg: 85 } },
        ],
      },
      {
        id: "vuelos_laterales_maquina",
        name: "Vuelos Laterales Máquina",
        muscle: "Deltoide lateral",
        nota: "No hacer tanta fuerza con el agarre.",
        video: "https://www.youtube.com/watch?v=lIUyU4hNHDc",
        sets: [
          { repRange: "12-15", pr: { reps: 15, kg: 52 } },
          { repRange: "12-15", pr: { reps: 11, kg: 52 } },
          { repRange: "12-15", pr: { reps: 14, kg: 45 } },
          { repRange: "12-15", pr: { reps: 15, kg: 38 } },
        ],
      },
      {
        id: "pec_dec_deltoides_sarm",
        name: "Pec Dec para Deltoides",
        muscle: "Deltoide posterior",
        nota: "Unilateral.",
        video: "https://www.youtube.com/watch?v=TtJmmR2RuHU",
        sets: [
          { repRange: "12-15", pr: { reps: 11, kg: 36 } },
          { repRange: "12-15", pr: { reps: 10, kg: 36 } },
        ],
      },
      {
        id: "biceps_martillo",
        name: "Bíceps Martillo",
        muscle: "Bíceps / braquial",
        nota: "Alternado.",
        video: "https://www.youtube.com/watch?v=dGwQMzGndhE",
        sets: [
          { repRange: "6-8", pr: { reps: 8, kg: 20 } },
          { repRange: "6-8", pr: { reps: 9, kg: 18 } },
          { repRange: "6-8", pr: { reps: 8, kg: 18 } },
        ],
      },
      {
        id: "biceps_banco_scott",
        name: "Bíceps en Banco Scott",
        muscle: "Bíceps",
        nota: "Unilateral con mancuerna.",
        video: "https://www.youtube.com/watch?v=52fVbbMUqBM",
        sets: [
          { repRange: "6-8", pr: { reps: 9, kg: 15 } },
          { repRange: "6-8", pr: { reps: 9, kg: 15 } },
          { repRange: "6-8", pr: { reps: 8, kg: 13 } },
        ],
      },
      {
        id: "biceps_banco_inclinado",
        name: "Bíceps en Banco Inclinado",
        muscle: "Bíceps (cabeza larga)",
        nota: "Alternado, 6 puntos arriba.",
        video: "https://www.youtube.com/watch?v=rnAYOdcn83s",
        sets: [
          { repRange: "8-10", pr: { reps: 10, kg: 13 } },
          { repRange: "8-10", pr: { reps: 12, kg: 10 } },
        ],
      },
      {
        id: "triceps_trasnuca_sarm",
        name: "Tríceps Trasnuca",
        muscle: "Tríceps",
        nota: "Pausa en el fondo, codos no van cerrados.",
        video: "https://www.youtube.com/watch?v=P40-DvgM9qI",
        sets: [
          { repRange: "8-10", pr: { reps: 16, kg: 38 } },
          { repRange: "8-10", pr: { reps: 12, kg: 38 } },
          { repRange: "8-10", pr: { reps: 10, kg: 38 } },
        ],
      },
    ],
  },
};

const DAY_ORDER = ["push", "pull", "legs", "sarm"];

/* =========================================================================
   PERSISTENCIA (localStorage)
   ========================================================================= */

const STORAGE_KEY = "rutina_gym_logs_v1";

function loadLogs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLogs(logs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  } catch {
    /* ignore */
  }
}

/* =========================================================================
   UTILIDADES
   ========================================================================= */

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

// "Volumen" simple para comparar marcas: kg * reps
function volume(kg, reps) {
  if (!kg || !reps) return 0;
  return kg * reps;
}

/* =========================================================================
   COMPONENTE: TEMPORIZADOR DE DESCANSO
   ========================================================================= */

function RestTimer({ seconds, accent }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    setRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            clearInterval(intervalRef.current);
            setRunning(false);
            try {
              const audio = new AudioContext();
              const osc = audio.createOscillator();
              osc.frequency.value = 880;
              osc.connect(audio.destination);
              osc.start();
              setTimeout(() => osc.stop(), 350);
            } catch {
              /* sin sonido disponible */
            }
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const pct = Math.max(0, Math.min(100, (remaining / seconds) * 100));

  return (
    <div className="flex items-center gap-3 bg-slate-800/60 rounded-xl px-3 py-2 border border-slate-700">
      <div className="relative w-12 h-12 shrink-0">
        <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
          <circle cx="18" cy="18" r="16" fill="none" stroke="#1e293b" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke={accent}
            strokeWidth="3"
            strokeDasharray={2 * Math.PI * 16}
            strokeDashoffset={2 * Math.PI * 16 * (1 - pct / 100)}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.3s linear" }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-200">
          {formatTime(remaining)}
        </span>
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={() => setRunning((r) => !r)}
          className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition text-slate-100"
          title={running ? "Pausar" : "Iniciar descanso"}
        >
          {running ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          onClick={() => {
            setRunning(false);
            setRemaining(seconds);
          }}
          className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition text-slate-100"
          title="Reiniciar"
        >
          <RotateCcw size={16} />
        </button>
      </div>
      <span className="text-xs text-slate-400 hidden sm:inline">
        Descanso {seconds === REST_LONG ? "5:00" : "3:00"}
      </span>
    </div>
  );
}

/* =========================================================================
   COMPONENTE: FILA DE SET (carga de reps/kg + comparación con PR)
   ========================================================================= */

function SetRow({ exerciseId, setIndex, setDef, accent, logs, setLogs }) {
  const key = `${exerciseId}_${setIndex}`;
  const prKey = `${key}_pr_override`;
  const today = todayStr();
  const history = logs[key] || [];
  const lastEntry = history[history.length - 1];
  const override = logs[prKey]; // { kg, reps } | undefined

  const computedPR = useMemo(() => {
    let best = setDef.pr ? { ...setDef.pr } : null;
    history.forEach((h) => {
      if (!best || volume(h.kg, h.reps) > volume(best.kg, best.reps)) {
        best = { kg: h.kg, reps: h.reps };
      }
    });
    return best;
  }, [history, setDef.pr]);

  // Si el usuario corrigió manualmente el récord, esa marca tiene prioridad
  const currentPR = override || computedPR;

  const [reps, setReps] = useState(lastEntry?.reps ?? "");
  const [kg, setKg] = useState(lastEntry?.kg ?? "");
  const [feedback, setFeedback] = useState(null);

  const [editingPR, setEditingPR] = useState(false);
  const [editReps, setEditReps] = useState(currentPR?.reps ?? "");
  const [editKg, setEditKg] = useState(currentPR?.kg ?? "");

  const openEditPR = () => {
    setEditReps(currentPR?.reps ?? "");
    setEditKg(currentPR?.kg ?? "");
    setEditingPR(true);
  };

  const savePROverride = () => {
    const r = parseFloat(editReps);
    const k = parseFloat(editKg);
    if (!r || !k || isNaN(r) || isNaN(k)) return;
    const newLogs = { ...logs, [prKey]: { kg: k, reps: r } };
    setLogs(newLogs);
    saveLogs(newLogs);
    setEditingPR(false);
  };

  const clearPROverride = () => {
    const newLogs = { ...logs };
    delete newLogs[prKey];
    setLogs(newLogs);
    saveLogs(newLogs);
    setEditingPR(false);
  };

  const handleSave = () => {
    const r = parseFloat(reps);
    const k = parseFloat(kg);
    if (!r || !k || isNaN(r) || isNaN(k)) {
      setFeedback({ type: "error", msg: "Completá reps y kg válidos." });
      return;
    }

    const prevBestVol = currentPR ? volume(currentPR.kg, currentPR.reps) : 0;
    const newVol = volume(k, r);

    const entry = { date: today, reps: r, kg: k };
    const newHistory = [...history.filter((h) => h.date !== today), entry];

    const newLogs = { ...logs, [key]: newHistory };
    setLogs(newLogs);
    saveLogs(newLogs);

    if (!currentPR || newVol > prevBestVol) {
      setFeedback({ type: "pr", msg: "¡Nueva marca personal! 🔥 Superaste tu mejor registro." });
    } else if (newVol === prevBestVol) {
      setFeedback({ type: "tie", msg: "Igualaste tu mejor marca. ¡Buen trabajo!" });
    } else {
      const diffPct = (((prevBestVol - newVol) / prevBestVol) * 100).toFixed(0);
      setFeedback({ type: "down", msg: `Quedaste por debajo de tu marca (-${diffPct}% de volumen). Si fue un error de carga, podés corregir el récord con el lápiz ✏️.` });
    }
  };

  return (
    <div className="grid grid-cols-12 gap-2 items-center py-2 border-b border-slate-800 last:border-0">
      <div className="col-span-2 text-xs font-semibold text-slate-400">
        Serie {setIndex + 1}
        <div className="text-[10px] text-slate-500">{setDef.repRange} reps</div>
      </div>

      <div className="col-span-2">
        <input
          type="number"
          inputMode="decimal"
          placeholder="Reps"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2"
          style={{ "--tw-ring-color": accent }}
        />
      </div>
      <div className="col-span-2">
        <input
          type="number"
          inputMode="decimal"
          placeholder="Kg"
          value={kg}
          onChange={(e) => setKg(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2"
          style={{ "--tw-ring-color": accent }}
        />
      </div>

      <div className="col-span-1">
        <button
          onClick={handleSave}
          className="p-1.5 rounded-lg text-white transition hover:opacity-80"
          style={{ backgroundColor: accent }}
          title="Guardar"
        >
          <Save size={15} />
        </button>
      </div>

      <div className="col-span-3 text-xs flex items-center gap-1.5">
        {currentPR ? (
          <span className="text-slate-400">
            Récord:{" "}
            <span className="text-slate-200 font-semibold">
              {currentPR.reps}x{currentPR.kg}kg
            </span>
            {override && <span className="ml-1 text-amber-500" title="Corregido manualmente">✎</span>}
          </span>
        ) : (
          <span className="text-slate-500">Sin marca aún</span>
        )}
        <button
          onClick={openEditPR}
          className="text-slate-500 hover:text-slate-200 transition shrink-0"
          title="Corregir récord manualmente (por si me equivoqué cargando un dato)"
        >
          ✏️
        </button>
      </div>

      <div className="col-span-2 text-xs text-right">
        {feedback && (
          <span
            className={
              feedback.type === "pr"
                ? "text-emerald-400 font-semibold flex items-center gap-1 justify-end"
                : feedback.type === "down"
                ? "text-rose-400 flex items-center gap-1 justify-end"
                : "text-amber-400 flex items-center gap-1 justify-end"
            }
          >
            {feedback.type === "pr" && <Trophy size={12} />}
            {feedback.type === "down" && <TrendingDown size={12} />}
            {feedback.type === "tie" && <TrendingUp size={12} />}
          </span>
        )}
      </div>

      {editingPR && (
        <div className="col-span-12 bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2.5 mt-1 space-y-2">
          <p className="text-[11px] text-slate-400">
            Corregir el récord registrado para esta serie (útil si cargaste mal un dato por error):
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              placeholder="Reps"
              value={editReps}
              onChange={(e) => setEditReps(e.target.value)}
              className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100"
            />
            <span className="text-slate-500 text-xs">reps ×</span>
            <input
              type="number"
              inputMode="decimal"
              placeholder="Kg"
              value={editKg}
              onChange={(e) => setEditKg(e.target.value)}
              className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100"
            />
            <span className="text-slate-500 text-xs">kg</span>
            <button
              onClick={savePROverride}
              className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold transition hover:opacity-80"
              style={{ backgroundColor: accent }}
            >
              Guardar corrección
            </button>
            {override && (
              <button
                onClick={clearPROverride}
                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs transition"
              >
                Quitar corrección
              </button>
            )}
            <button
              onClick={() => setEditingPR(false)}
              className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 text-xs transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <div className="col-span-12 -mt-1">
          <p
            className={
              "text-[11px] " +
              (feedback.type === "pr"
                ? "text-emerald-400"
                : feedback.type === "down"
                ? "text-rose-400"
                : "text-amber-400")
            }
          >
            {feedback.msg}
          </p>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   COMPONENTE: TARJETA DE EJERCICIO
   ========================================================================= */

function ExerciseCard({ exercise, accent, logs, setLogs }) {
  const [open, setOpen] = useState(false);
  const hasHeavySet = exercise.sets.some((s) => s.heavy);
  const restSeconds = hasHeavySet ? REST_LONG : REST_SHORT;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50 transition"
      >
        <div className="flex items-center gap-3 text-left">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: accent }}
          />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-slate-100">{exercise.name}</h3>
              {exercise.muscle && (
                <span
                  className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md font-semibold"
                  style={{ backgroundColor: accent + "22", color: accent }}
                >
                  {exercise.muscle}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">{exercise.nota}</p>
          </div>
        </div>
        {open ? (
          <ChevronUp size={18} className="text-slate-400 shrink-0" />
        ) : (
          <ChevronDown size={18} className="text-slate-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3">
          <div className="hidden sm:grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide text-slate-500 px-0">
            <div className="col-span-2">Set</div>
            <div className="col-span-2">Reps</div>
            <div className="col-span-2">Kg</div>
            <div className="col-span-1"></div>
            <div className="col-span-3">Récord actual</div>
            <div className="col-span-2"></div>
          </div>

          {exercise.sets.map((s, i) => (
            <SetRow
              key={i}
              exerciseId={exercise.id}
              setIndex={i}
              setDef={s}
              accent={accent}
              logs={logs}
              setLogs={setLogs}
            />
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <RestTimer seconds={restSeconds} accent={accent} />
            <a
              href={exercise.video}
              target="_blank"
              rel="noreferrer"
              className="text-xs flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition"
            >
              <Video size={14} /> Ver técnica
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   COMPONENTE: PESTAÑA DE RUTINA (por día)
   ========================================================================= */

function RoutineDayView({ dayKey, logs, setLogs }) {
  const day = ROUTINE[dayKey];
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400 leading-relaxed">{day.description}</p>
      {day.isNew && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl px-3 py-2">
          🆕 Día agregado: pierna enfocada en glúteos, sin historial previo — empezás a registrar tus marcas desde hoy.
        </div>
      )}
      {day.exercises.map((ex) => (
        <ExerciseCard
          key={ex.id}
          exercise={ex}
          accent={day.color}
          logs={logs}
          setLogs={setLogs}
        />
      ))}
    </div>
  );
}

/* =========================================================================
   COMPONENTE: PROGRESO (gráfico)
   ========================================================================= */

function GlobalStats({ logs }) {
  const stats = useMemo(() => {
    const dateSet = new Set();
    let totalVolume = 0;
    let totalSetsLogged = 0;
    let totalPRs = 0;

    Object.entries(logs).forEach(([k, v]) => {
      if (k.endsWith("_pr_override")) return;
      if (!Array.isArray(v)) return;
      v.forEach((entry) => {
        dateSet.add(entry.date);
        totalVolume += volume(entry.kg, entry.reps);
        totalSetsLogged += 1;
      });
    });

    // Racha: días consecutivos hasta hoy con al menos un registro
    let streak = 0;
    let cursor = new Date();
    while (true) {
      const d = cursor.toISOString().slice(0, 10);
      if (dateSet.has(d)) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }

    return { totalVolume: Math.round(totalVolume), totalSetsLogged, streak, daysTrained: dateSet.size };
  }, [logs]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
        <p className="text-xl font-bold text-slate-100">{stats.totalVolume.toLocaleString("es-AR")}</p>
        <p className="text-[11px] text-slate-500">Kg×reps totales</p>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
        <p className="text-xl font-bold text-orange-400">{stats.streak}</p>
        <p className="text-[11px] text-slate-500">Días seguidos entrenando</p>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
        <p className="text-xl font-bold text-slate-100">{stats.daysTrained}</p>
        <p className="text-[11px] text-slate-500">Días registrados</p>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
        <p className="text-xl font-bold text-slate-100">{stats.totalSetsLogged}</p>
        <p className="text-[11px] text-slate-500">Series cargadas</p>
      </div>
    </div>
  );
}

function ProgressView({ logs }) {
  const allExercises = useMemo(() => {
    const list = [];
    DAY_ORDER.forEach((dayKey) => {
      ROUTINE[dayKey].exercises.forEach((ex) => {
        list.push({ id: ex.id, name: ex.name, day: ROUTINE[dayKey].label, color: ROUTINE[dayKey].color, sets: ex.sets.length });
      });
    });
    return list;
  }, []);

  const [selectedId, setSelectedId] = useState(allExercises[0]?.id);
  const [selectedSet, setSelectedSet] = useState(0);

  const selectedExercise = allExercises.find((e) => e.id === selectedId);
  const key = `${selectedId}_${selectedSet}`;
  const history = (logs[key] || []).slice().sort((a, b) => (a.date > b.date ? 1 : -1));

  const chartData = history.map((h) => ({
    date: h.date.slice(5),
    kg: h.kg,
    reps: h.reps,
    volumen: volume(h.kg, h.reps),
  }));

  return (
    <div className="space-y-4">
      <GlobalStats logs={logs} />

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-200">Evolución por ejercicio</h2>
        <p className="text-xs text-slate-500">
          Elegí un ejercicio y una serie para ver cómo evolucionaron tus kilos, repeticiones y volumen entrenamiento a entrenamiento.
        </p>
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setSelectedSet(0);
            }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 flex-1 min-w-[200px]"
          >
            {allExercises.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.day} — {ex.name}
              </option>
            ))}
          </select>
          <select
            value={selectedSet}
            onChange={(e) => setSelectedSet(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
          >
            {Array.from({ length: selectedExercise?.sets || 1 }).map((_, i) => (
              <option key={i} value={i}>
                Serie {i + 1}
              </option>
            ))}
          </select>
        </div>

        {chartData.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-10">
            Todavía no hay registros para esta serie. ¡Cargá tu primer entrenamiento en la pestaña Rutina!
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                  labelStyle={{ color: "#cbd5e1" }}
                />
                <Legend />
                <Line type="monotone" dataKey="kg" stroke={selectedExercise?.color || "#22c55e"} strokeWidth={2} dot={{ r: 3 }} name="Kg" />
                <Line type="monotone" dataKey="reps" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="Reps" />
                <Line type="monotone" dataKey="volumen" stroke="#a855f7" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 2 }} name="Volumen (kg×reps)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {chartData.length >= 2 && (
          <Trend chartData={chartData} accent={selectedExercise?.color} />
        )}
      </div>
    </div>
  );
}

function Trend({ chartData, accent }) {
  const first = chartData[0];
  const last = chartData[chartData.length - 1];
  const diff = last.volumen - first.volumen;
  const pct = first.volumen ? ((diff / first.volumen) * 100).toFixed(1) : 0;
  const positive = diff >= 0;

  return (
    <div
      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
      style={{ backgroundColor: positive ? "rgba(34,197,94,0.1)" : "rgba(244,63,94,0.1)" }}
    >
      {positive ? (
        <TrendingUp size={16} className="text-emerald-400" />
      ) : (
        <TrendingDown size={16} className="text-rose-400" />
      )}
      <span className={positive ? "text-emerald-400" : "text-rose-400"}>
        {positive ? "Progreso positivo" : "Progreso negativo"}: volumen {positive ? "+" : ""}
        {pct}% desde el primer registro.
      </span>
    </div>
  );
}

/* =========================================================================
   COMPONENTE: VIDEOS / TÉCNICA
   ========================================================================= */

function VideosView() {
  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-slate-200 mb-1">Biblioteca de técnica</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          Un video de referencia por ejercicio para repasar la ejecución correcta antes de cargar peso. Tocá cualquier tarjeta para abrirlo directamente en YouTube.
        </p>
      </div>
      {DAY_ORDER.map((dayKey) => {
        const day = ROUTINE[dayKey];
        return (
          <div key={dayKey}>
            <h2 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: day.color }}>
              {day.label}
            </h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {day.exercises.map((ex) => (
                <a
                  key={ex.id}
                  href={ex.video}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl px-3 py-3 hover:border-slate-600 transition"
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: day.color + "22" }}
                  >
                    <Video size={16} style={{ color: day.color }} />
                  </div>
                  <div>
                    <p className="text-sm text-slate-200 font-medium">{ex.name}</p>
                    <p className="text-[11px] text-slate-500">Ver demostración técnica</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* =========================================================================
   COMPONENTE: RESUMEN DEL DÍA (mini dashboard arriba)
   ========================================================================= */

function DaySummary({ dayKey, logs }) {
  const day = ROUTINE[dayKey];
  const today = todayStr();

  let totalSets = 0;
  let doneToday = 0;
  let prsToday = 0;

  day.exercises.forEach((ex) => {
    ex.sets.forEach((s, i) => {
      totalSets += 1;
      const key = `${ex.id}_${i}`;
      const history = logs[key] || [];
      const todayEntry = history.find((h) => h.date === today);
      if (todayEntry) {
        doneToday += 1;
        let best = s.pr ? { ...s.pr } : null;
        history
          .filter((h) => h.date !== today)
          .forEach((h) => {
            if (!best || volume(h.kg, h.reps) > volume(best.kg, best.reps)) best = h;
          });
        if (!best || volume(todayEntry.kg, todayEntry.reps) > volume(best.kg, best.reps)) {
          prsToday += 1;
        }
      }
    });
  });

  const pct = totalSets ? Math.round((doneToday / totalSets) * 100) : 0;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
        <p className="text-2xl font-bold text-slate-100">{pct}%</p>
        <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1">
          <ListChecks size={12} /> Completado hoy
        </p>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
        <p className="text-2xl font-bold text-amber-400">{prsToday}</p>
        <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1">
          <Trophy size={12} /> Marcas hoy
        </p>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
        <p className="text-2xl font-bold text-slate-100">{day.exercises.length}</p>
        <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1">
          <Dumbbell size={12} /> Ejercicios
        </p>
      </div>
    </div>
  );
}

/* =========================================================================
   APP PRINCIPAL
   ========================================================================= */

export default function App() {
  const [logs, setLogs] = useState({});
  const [activeDay, setActiveDay] = useState("push");
  const [tab, setTab] = useState("rutina"); // rutina | progreso | videos

  useEffect(() => {
    setLogs(loadLogs());
  }, []);

  const handleReset = () => {
    if (window.confirm("¿Borrar todo el historial guardado? Esta acción no se puede deshacer.")) {
      localStorage.removeItem(STORAGE_KEY);
      setLogs({});
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="sticky top-0 z-10 bg-slate-950/90 backdrop-blur border-b border-slate-800">
        <div className="max-w-3xl mx-auto px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="text-orange-400" size={22} />
              <div>
                <h1 className="font-bold text-lg leading-tight">Mi Rutina de Gimnasio</h1>
                <p className="text-[11px] text-slate-500 leading-tight">Push / Pull / Piernas / Hombros-Brazos · seguimiento de cargas y progreso</p>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="text-slate-500 hover:text-rose-400 transition p-1.5"
              title="Borrar historial"
            >
              <Trash2 size={16} />
            </button>
          </div>

          <nav className="flex gap-1 mt-3 bg-slate-900 rounded-xl p-1">
            {[
              { key: "rutina", label: "Rutina", icon: Dumbbell },
              { key: "progreso", label: "Progreso", icon: BarChart3 },
              { key: "videos", label: "Videos", icon: Video },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={
                  "flex-1 flex items-center justify-center gap-1.5 text-sm py-2 rounded-lg transition " +
                  (tab === key ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200")
                }
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </nav>

          {tab === "rutina" && (
            <div className="flex gap-1 mt-2 overflow-x-auto pb-1">
              {DAY_ORDER.map((dayKey) => (
                <button
                  key={dayKey}
                  onClick={() => setActiveDay(dayKey)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition border"
                  style={
                    activeDay === dayKey
                      ? { backgroundColor: ROUTINE[dayKey].color, borderColor: ROUTINE[dayKey].color, color: "#fff" }
                      : { borderColor: "#334155", color: "#94a3b8" }
                  }
                >
                  {ROUTINE[dayKey].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4 pb-16">
        {tab === "rutina" && (
          <>
            <DaySummary dayKey={activeDay} logs={logs} />
            <RoutineDayView dayKey={activeDay} logs={logs} setLogs={setLogs} />
          </>
        )}
        {tab === "progreso" && <ProgressView logs={logs} />}
        {tab === "videos" && <VideosView />}
      </main>

      <footer className="text-center text-[11px] text-slate-600 pb-6">
        Datos guardados localmente en tu navegador · Basado en tu rutina personal
      </footer>
    </div>
  );
}