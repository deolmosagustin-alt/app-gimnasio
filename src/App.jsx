import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Play, Pause, RotateCcw, TrendingUp, TrendingDown, Dumbbell, Video,
  ChevronDown, ChevronUp, Trophy, Flame, Save, Trash2, BarChart3, ListChecks,
  User, Plus, LogOut, Lock, Eye, EyeOff, UserCircle,
} from "lucide-react";

/* =========================================================================
   DATOS BASE DE LA RUTINA
   ========================================================================= */

const REST_LONG = 300;
const REST_SHORT = 180;

const ROUTINE = {
  push: {
    label: "PUSH",
    description: "Empuje de tren superior: pecho, hombro anterior y tríceps. Arrancamos con el básico de fuerza (press banca) y cerramos con aislamiento para maximizar el volumen.",
    color: "#ef4444",
    exercises: [
      {
        id: "press_banca",
        name: "Press Banca",
        muscle: "Pectoral",
        nota: "Hacer fuerza con las piernas.",
        video: "https://www.youtube.com/watch?v=vcBig73ojpE",
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
        video: "https://www.youtube.com/watch?v=DbFgADa2PL8",
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
        video: "https://www.youtube.com/watch?v=taI4XduLpTk",
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
        video: "https://www.youtube.com/watch?v=3VcKaXpzqRo",
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
        video: "https://www.youtube.com/watch?v=6cksTm7gWS4",
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
        video: "https://www.youtube.com/watch?v=YbX7Wd8jQ-U",
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
        video: "https://www.youtube.com/watch?v=2-LAMcpzODU",
        sets: [
          { repRange: "8-10", pr: { reps: 14, kg: 38 } },
          { repRange: "8-10", pr: { reps: 12, kg: 40 } },
        ],
      },
    ],
  },

  pull: {
    label: "PULL",
    description: "Tracción de tren superior: espalda, bíceps y hombro posterior. Foco en remos y dorsalera para densidad de espalda, cerrando con bíceps.",
    color: "#3b82f6",
    exercises: [
      {
        id: "remo_ancho_maquina",
        name: "Remo Ancho Máquina",
        muscle: "Dorsal / espalda media",
        nota: "No levantar los hombros.",
        video: "https://www.youtube.com/watch?v=GZbfZ033f74",
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
        video: "https://www.youtube.com/watch?v=CAwf7n6Luuc",
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
        video: "https://www.youtube.com/watch?v=pYcpY20QaE8",
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
        video: "https://www.youtube.com/watch?v=FK4rHkTTsLI",
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
        video: "https://www.youtube.com/watch?v=rep-qVOkqgk",
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
        video: "https://www.youtube.com/watch?v=sAq_ocpRh_I",
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
    description: "Día agregado a tu rutina original: tren inferior completo con foco en glúteo (sentadilla búlgara), core, cuádriceps, femoral y estabilizadores de cadera (aductor/abductor).",
    color: "#22c55e",
    isNew: true,
    exercises: [
      {
        id: "sentadilla_bulgara",
        name: "Sentadilla Búlgara (glúteos)",
        muscle: "Glúteo",
        nota: "Foco en glúteo, torso ligeramente inclinado adelante.",
        video: "https://www.youtube.com/watch?v=hs9AoJZMtg4",
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
        video: "https://www.youtube.com/watch?v=1919eTCoESo",
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
        video: "https://www.youtube.com/watch?v=0tn5K9NlCfo",
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
        video: "https://www.youtube.com/watch?v=1Tq3QdYUuHs",
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
        video: "https://www.youtube.com/watch?v=YyvSfVjQeL0",
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
        video: "https://www.youtube.com/watch?v=G-9C9helFCM",
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
        video: "https://www.youtube.com/watch?v=G-9C9helFCM",
        sets: [
          { repRange: "8-10", pr: null },
          { repRange: "8-10", pr: null },
        ],
      },
    ],
  },

  sarm: {
    label: "HOMBROS / BRAZOS",
    description: "Día de hombro (énfasis press militar y laterales) combinado con brazos: bíceps en distintos ángulos y tríceps trasnuca para cerrar la semana.",
    color: "#a855f7",
    exercises: [
      {
        id: "press_militar_smith",
        name: "Press Militar Sentado Smith",
        muscle: "Deltoide anterior",
        nota: "Codos un poco adelante, banco a 80-90°, leg drive.",
        video: "https://www.youtube.com/watch?v=2yjwXTZQDDI",
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
        video: "https://www.youtube.com/watch?v=3VcKaXpzqRo",
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
        video: "https://www.youtube.com/watch?v=6cksTm7gWS4",
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
        video: "https://www.youtube.com/watch?v=zC3nLlEvin4",
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
        video: "https://www.youtube.com/watch?v=fIWP-FRFNU0",
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
        video: "https://www.youtube.com/watch?v=oMgVq3ZEhTs",
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
        video: "https://www.youtube.com/watch?v=YbX7Wd8jQ-U",
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
   SISTEMA DE PERFILES (localStorage)
   ========================================================================= */

const PROFILES_KEY = "rutina_gym_profiles_v1";
const ACTIVE_PROFILE_KEY = "rutina_gym_active_profile_v1";

function loadProfiles() {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveProfiles(profiles) {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)); } catch {}
}

function loadActiveProfile() {
  try { return localStorage.getItem(ACTIVE_PROFILE_KEY) || null; } catch { return null; }
}

function saveActiveProfile(name) {
  try {
    if (name) localStorage.setItem(ACTIVE_PROFILE_KEY, name);
    else localStorage.removeItem(ACTIVE_PROFILE_KEY);
  } catch {}
}

function getProfileLogs(profiles, profileName) {
  return profiles[profileName]?.logs || {};
}

function setProfileLogs(profiles, profileName, logs) {
  return {
    ...profiles,
    [profileName]: { ...profiles[profileName], logs },
  };
}

/* =========================================================================
   UTILIDADES
   ========================================================================= */

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function volume(kg, reps) {
  if (!kg || !reps) return 0;
  return kg * reps;
}

/* =========================================================================
   PANTALLA DE LOGIN / REGISTRO
   ========================================================================= */

function LoginScreen({ onLogin }) {
  const [profiles, setProfilesState] = useState(loadProfiles);
  const [mode, setMode] = useState("login"); // login | register
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");

  const profileList = Object.keys(profiles);

  const handleLogin = (profileName) => {
    const profile = profiles[profileName];
    if (!profile) return;
    if (profile.pin) {
      // Pedir PIN
      const entered = prompt(`PIN de ${profileName}:`);
      if (entered !== profile.pin) {
        setError("PIN incorrecto.");
        return;
      }
    }
    saveActiveProfile(profileName);
    onLogin(profileName, profiles);
  };

  const handleRegister = () => {
    setError("");
    const trimmed = name.trim();
    if (!trimmed) { setError("Ingresá un nombre."); return; }
    if (profiles[trimmed]) { setError("Ya existe un perfil con ese nombre."); return; }
    if (pin && pin.length < 4) { setError("El PIN debe tener al menos 4 dígitos."); return; }
    if (pin && pin !== pinConfirm) { setError("Los PINs no coinciden."); return; }

    const newProfiles = {
      ...profiles,
      [trimmed]: { pin: pin || null, logs: {}, createdAt: new Date().toISOString() },
    };
    saveProfiles(newProfiles);
    setProfilesState(newProfiles);
    saveActiveProfile(trimmed);
    onLogin(trimmed, newProfiles);
  };

  const handleDeleteProfile = (profileName) => {
    if (!window.confirm(`¿Borrar el perfil "${profileName}" y todos sus datos? Esto no se puede deshacer.`)) return;
    const p = { ...profiles };
    delete p[profileName];
    saveProfiles(p);
    setProfilesState(p);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-orange-500/20 flex items-center justify-center mb-3">
            <Flame className="text-orange-400" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Mi Rutina</h1>
          <p className="text-sm text-slate-500 mt-1">Seguimiento de cargas y progreso</p>
        </div>

        {/* Perfiles existentes */}
        {profileList.length > 0 && mode === "login" && (
          <div className="mb-6">
            <p className="text-xs uppercase tracking-widest text-slate-500 mb-3 font-semibold">Elegí tu perfil</p>
            <div className="space-y-2">
              {profileList.map((pName) => (
                <div key={pName} className="flex items-center gap-2">
                  <button
                    onClick={() => handleLogin(pName)}
                    className="flex-1 flex items-center gap-3 bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-2xl px-4 py-3.5 transition text-left group"
                  >
                    <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                      <UserCircle size={20} className="text-orange-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-slate-100 font-semibold">{pName}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        {profiles[pName].pin ? <><Lock size={10} /> Con PIN</> : "Sin PIN"}
                      </p>
                    </div>
                    <ChevronUp size={16} className="text-slate-600 group-hover:text-slate-400 rotate-90 transition" />
                  </button>
                  <button
                    onClick={() => handleDeleteProfile(pName)}
                    className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500/50 hover:text-rose-400 text-slate-600 transition"
                    title="Borrar perfil"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Formulario nuevo perfil */}
        {mode === "register" ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold text-slate-100">Crear perfil nuevo</h2>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Nombre</label>
              <input
                type="text"
                placeholder="Tu nombre o apodo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">PIN (opcional)</label>
              <div className="relative">
                <input
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  placeholder="4+ dígitos para proteger tu perfil"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-sm pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPin((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {pin && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Confirmar PIN</label>
                <input
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  placeholder="Repetí el PIN"
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-sm"
                />
              </div>
            )}
            {error && <p className="text-rose-400 text-xs">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setMode("login"); setError(""); }}
                className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleRegister}
                className="flex-1 py-3 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-400 transition"
              >
                Crear perfil
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setMode("register"); setError(""); }}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-dashed border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition text-sm font-semibold"
          >
            <Plus size={16} /> Crear perfil nuevo
          </button>
        )}

        {error && mode === "login" && <p className="text-rose-400 text-xs mt-3 text-center">{error}</p>}
      </div>
    </div>
  );
}

/* =========================================================================
   TEMPORIZADOR DE DESCANSO
   ========================================================================= */

function RestTimer({ seconds, accent }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => { setRemaining(seconds); }, [seconds]);

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
            } catch {}
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
          <circle cx="18" cy="18" r="16" fill="none" stroke={accent} strokeWidth="3"
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
        <button onClick={() => setRunning((r) => !r)}
          className="p-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 transition text-slate-100 active:scale-95"
          title={running ? "Pausar" : "Iniciar descanso"}
        >
          {running ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button onClick={() => { setRunning(false); setRemaining(seconds); }}
          className="p-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 transition text-slate-100 active:scale-95"
          title="Reiniciar"
        >
          <RotateCcw size={18} />
        </button>
      </div>
      <span className="text-xs text-slate-400">Descanso {seconds === REST_LONG ? "5 min" : "3 min"}</span>
    </div>
  );
}

/* =========================================================================
   FILA DE SET
   ========================================================================= */

function SetRow({ exerciseId, setIndex, setDef, accent, logs, setLogs }) {
  const key = `${exerciseId}_${setIndex}`;
  const prKey = `${key}_pr_override`;
  const today = todayStr();
  const history = logs[key] || [];
  const lastEntry = history[history.length - 1];
  const override = logs[prKey];

  const computedPR = useMemo(() => {
    let best = setDef.pr ? { ...setDef.pr } : null;
    history.forEach((h) => {
      if (!best || volume(h.kg, h.reps) > volume(best.kg, best.reps)) best = { kg: h.kg, reps: h.reps };
    });
    return best;
  }, [history, setDef.pr]);

  const currentPR = override || computedPR;
  const [reps, setReps] = useState(lastEntry?.reps ?? "");
  const [kg, setKg] = useState(lastEntry?.kg ?? "");
  const [feedback, setFeedback] = useState(null);
  const [editingPR, setEditingPR] = useState(false);
  const [editReps, setEditReps] = useState(currentPR?.reps ?? "");
  const [editKg, setEditKg] = useState(currentPR?.kg ?? "");
  const [saved, setSaved] = useState(false);

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
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);

    if (!currentPR || newVol > prevBestVol) {
      setFeedback({ type: "pr", msg: "¡Nueva marca! 🔥" });
    } else if (newVol === prevBestVol) {
      setFeedback({ type: "tie", msg: "Igualaste tu marca 💪" });
    } else {
      const diffPct = (((prevBestVol - newVol) / prevBestVol) * 100).toFixed(0);
      setFeedback({ type: "down", msg: `-${diffPct}% del volumen récord` });
    }
  };

  const savePROverride = () => {
    const r = parseFloat(editReps);
    const k = parseFloat(editKg);
    if (!r || !k || isNaN(r) || isNaN(k)) return;
    const newLogs = { ...logs, [prKey]: { kg: k, reps: r } };
    setLogs(newLogs);
    setEditingPR(false);
  };

  const clearPROverride = () => {
    const newLogs = { ...logs };
    delete newLogs[prKey];
    setLogs(newLogs);
    setEditingPR(false);
  };

  return (
    <div className="py-3 border-b border-slate-800/80 last:border-0">
      {/* Header de la serie */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400">SERIE {setIndex + 1}</span>
          <span className="text-[10px] bg-slate-800 text-slate-500 rounded-md px-1.5 py-0.5">{setDef.repRange} reps</span>
          {setDef.heavy && <span className="text-[10px] bg-amber-500/20 text-amber-400 rounded-md px-1.5 py-0.5 font-semibold">FUERZA</span>}
        </div>
        {feedback && (
          <span className={`text-xs font-semibold ${feedback.type === "pr" ? "text-emerald-400" : feedback.type === "down" ? "text-rose-400" : "text-amber-400"}`}>
            {feedback.type === "pr" && <Trophy size={11} className="inline mr-0.5" />}
            {feedback.msg}
          </span>
        )}
      </div>

      {/* Inputs inline grandes para mobile */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex flex-col">
          <label className="text-[10px] text-slate-600 mb-1">REPS</label>
          <input
            type="number"
            inputMode="decimal"
            placeholder="—"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-lg font-bold text-center text-slate-100 focus:outline-none focus:ring-2"
            style={{ "--tw-ring-color": accent }}
          />
        </div>
        <div className="text-slate-600 text-lg font-light mt-4">×</div>
        <div className="flex-1 flex flex-col">
          <label className="text-[10px] text-slate-600 mb-1">KG</label>
          <input
            type="number"
            inputMode="decimal"
            placeholder="—"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-lg font-bold text-center text-slate-100 focus:outline-none focus:ring-2"
            style={{ "--tw-ring-color": accent }}
          />
        </div>
        <button
          onClick={handleSave}
          className={`mt-4 p-3.5 rounded-xl text-white transition active:scale-95 ${saved ? "bg-emerald-500" : ""}`}
          style={!saved ? { backgroundColor: accent } : {}}
          title="Guardar"
        >
          {saved ? "✓" : <Save size={18} />}
        </button>
      </div>

      {/* Record actual */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1.5">
          {currentPR ? (
            <span className="text-xs text-slate-500">
              Récord: <span className="text-slate-300 font-bold">{currentPR.reps}×{currentPR.kg}kg</span>
              {override && <span className="ml-1 text-amber-500" title="Corregido">✎</span>}
            </span>
          ) : (
            <span className="text-xs text-slate-600">Sin marca todavía</span>
          )}
          <button onClick={() => { setEditReps(currentPR?.reps ?? ""); setEditKg(currentPR?.kg ?? ""); setEditingPR((e) => !e); }}
            className="text-slate-600 hover:text-slate-400 transition text-xs ml-1"
            title="Editar récord">✏️</button>
        </div>
      </div>

      {editingPR && (
        <div className="mt-2 bg-slate-800/70 border border-slate-700 rounded-xl p-3 space-y-2">
          <p className="text-[11px] text-slate-400">Corregir récord:</p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="number" inputMode="decimal" placeholder="Reps" value={editReps}
              onChange={(e) => setEditReps(e.target.value)}
              className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 focus:outline-none" />
            <span className="text-slate-500 text-xs">reps ×</span>
            <input type="number" inputMode="decimal" placeholder="Kg" value={editKg}
              onChange={(e) => setEditKg(e.target.value)}
              className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 focus:outline-none" />
            <span className="text-slate-500 text-xs">kg</span>
            <button onClick={savePROverride}
              className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold transition active:scale-95"
              style={{ backgroundColor: accent }}>
              Guardar
            </button>
            {override && (
              <button onClick={clearPROverride}
                className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 text-xs transition">
                Quitar
              </button>
            )}
            <button onClick={() => setEditingPR(false)} className="px-3 py-1.5 text-slate-500 text-xs hover:text-slate-300">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   TARJETA DE EJERCICIO
   ========================================================================= */

function ExerciseCard({ exercise, accent, logs, setLogs }) {
  const [open, setOpen] = useState(false);
  const hasHeavySet = exercise.sets.some((s) => s.heavy);
  const restSeconds = hasHeavySet ? REST_LONG : REST_SHORT;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-4 hover:bg-slate-800/40 active:bg-slate-800/60 transition text-left"
      >
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: accent }} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-slate-100 text-[15px]">{exercise.name}</h3>
              {exercise.muscle && (
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md font-semibold"
                  style={{ backgroundColor: accent + "22", color: accent }}>
                  {exercise.muscle}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{exercise.nota}</p>
          </div>
        </div>
        {open ? <ChevronUp size={20} className="text-slate-500 shrink-0" /> : <ChevronDown size={20} className="text-slate-500 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-0">
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

          <div className="flex flex-col gap-3 pt-3">
            <RestTimer seconds={restSeconds} accent={accent} />
            <a
              href={exercise.video}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white transition text-sm font-medium active:scale-95"
            >
              <Video size={16} /> Ver técnica en YouTube
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   DÍA DE RUTINA
   ========================================================================= */

function RoutineDayView({ dayKey, logs, setLogs }) {
  const day = ROUTINE[dayKey];
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400 leading-relaxed">{day.description}</p>
      {day.isNew && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl px-3 py-2">
          🆕 Día nuevo: empezás a registrar tus marcas desde cero.
        </div>
      )}
      {day.exercises.map((ex) => (
        <ExerciseCard key={ex.id} exercise={ex} accent={day.color} logs={logs} setLogs={setLogs} />
      ))}
    </div>
  );
}

/* =========================================================================
   PROGRESO
   ========================================================================= */

function GlobalStats({ logs }) {
  const stats = useMemo(() => {
    const dateSet = new Set();
    let totalVolume = 0;
    let totalSetsLogged = 0;

    Object.entries(logs).forEach(([k, v]) => {
      if (k.endsWith("_pr_override") || !Array.isArray(v)) return;
      v.forEach((entry) => {
        dateSet.add(entry.date);
        totalVolume += volume(entry.kg, entry.reps);
        totalSetsLogged += 1;
      });
    });

    let streak = 0;
    let cursor = new Date();
    while (true) {
      const d = cursor.toISOString().slice(0, 10);
      if (dateSet.has(d)) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
      else break;
    }

    return { totalVolume: Math.round(totalVolume), totalSetsLogged, streak, daysTrained: dateSet.size };
  }, [logs]);

  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        { val: stats.totalVolume.toLocaleString("es-AR"), label: "Kg×reps totales", color: "text-slate-100" },
        { val: stats.streak, label: "Días seguidos", color: "text-orange-400" },
        { val: stats.daysTrained, label: "Días registrados", color: "text-slate-100" },
        { val: stats.totalSetsLogged, label: "Series cargadas", color: "text-slate-100" },
      ].map(({ val, label, color }) => (
        <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
          <p className={`text-2xl font-bold ${color}`}>{val}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
        </div>
      ))}
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
        <div className="flex flex-col gap-2">
          <select
            value={selectedId}
            onChange={(e) => { setSelectedId(e.target.value); setSelectedSet(0); }}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-sm text-slate-100 w-full"
          >
            {allExercises.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.day} — {ex.name}</option>
            ))}
          </select>
          <select
            value={selectedSet}
            onChange={(e) => setSelectedSet(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-sm text-slate-100 w-full"
          >
            {Array.from({ length: selectedExercise?.sets || 1 }).map((_, i) => (
              <option key={i} value={i}>Serie {i + 1}</option>
            ))}
          </select>
        </div>

        {chartData.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-10">
            Sin registros aún. ¡Cargá tu primer entrenamiento!
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8 }} labelStyle={{ color: "#cbd5e1" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="kg" stroke={selectedExercise?.color || "#22c55e"} strokeWidth={2} dot={{ r: 3 }} name="Kg" />
                <Line type="monotone" dataKey="reps" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="Reps" />
                <Line type="monotone" dataKey="volumen" stroke="#a855f7" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 2 }} name="Vol (kg×reps)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {chartData.length >= 2 && (() => {
          const first = chartData[0];
          const last = chartData[chartData.length - 1];
          const diff = last.volumen - first.volumen;
          const pct = first.volumen ? ((diff / first.volumen) * 100).toFixed(1) : 0;
          const positive = diff >= 0;
          return (
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${positive ? "bg-emerald-500/10" : "bg-rose-500/10"}`}>
              {positive ? <TrendingUp size={16} className="text-emerald-400" /> : <TrendingDown size={16} className="text-rose-400" />}
              <span className={positive ? "text-emerald-400" : "text-rose-400"}>
                {positive ? "Progreso positivo" : "Regresión"}: {positive ? "+" : ""}{pct}% de volumen
              </span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/* =========================================================================
   VIDEOS
   ========================================================================= */

function VideosView() {
  return (
    <div className="space-y-5">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-slate-200 mb-1">Biblioteca de técnica</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          Un video de referencia por ejercicio. Tocá para abrir en YouTube.
        </p>
      </div>
      {DAY_ORDER.map((dayKey) => {
        const day = ROUTINE[dayKey];
        return (
          <div key={dayKey}>
            <h2 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: day.color }}>
              {day.label}
            </h2>
            <div className="space-y-2">
              {day.exercises.map((ex) => (
                <a key={ex.id} href={ex.video} target="_blank" rel="noreferrer"
                  className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3.5 hover:border-slate-600 active:scale-[0.98] transition">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: day.color + "22" }}>
                    <Video size={18} style={{ color: day.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 font-medium truncate">{ex.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{ex.nota}</p>
                  </div>
                  <ChevronDown size={14} className="text-slate-600 -rotate-90 shrink-0" />
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
   RESUMEN DEL DÍA
   ========================================================================= */

function DaySummary({ dayKey, logs }) {
  const day = ROUTINE[dayKey];
  const today = todayStr();
  let totalSets = 0, doneToday = 0, prsToday = 0;

  day.exercises.forEach((ex) => {
    ex.sets.forEach((s, i) => {
      totalSets += 1;
      const key = `${ex.id}_${i}`;
      const history = logs[key] || [];
      const todayEntry = history.find((h) => h.date === today);
      if (todayEntry) {
        doneToday += 1;
        let best = s.pr ? { ...s.pr } : null;
        history.filter((h) => h.date !== today).forEach((h) => {
          if (!best || volume(h.kg, h.reps) > volume(best.kg, best.reps)) best = h;
        });
        if (!best || volume(todayEntry.kg, todayEntry.reps) > volume(best.kg, best.reps)) prsToday += 1;
      }
    });
  });

  const pct = totalSets ? Math.round((doneToday / totalSets) * 100) : 0;

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
        <p className="text-2xl font-bold text-slate-100">{pct}%</p>
        <p className="text-[10px] text-slate-500 flex items-center justify-center gap-1 mt-0.5"><ListChecks size={10} /> Hoy</p>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
        <p className="text-2xl font-bold text-amber-400">{prsToday}</p>
        <p className="text-[10px] text-slate-500 flex items-center justify-center gap-1 mt-0.5"><Trophy size={10} /> Marcas</p>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
        <p className="text-2xl font-bold text-slate-100">{day.exercises.length}</p>
        <p className="text-[10px] text-slate-500 flex items-center justify-center gap-1 mt-0.5"><Dumbbell size={10} /> Ejercicios</p>
      </div>
    </div>
  );
}

/* =========================================================================
   APP PRINCIPAL
   ========================================================================= */

export default function App() {
  const [profiles, setProfiles] = useState(loadProfiles);
  const [activeProfile, setActiveProfile] = useState(null);
  const [activeDay, setActiveDay] = useState("push");
  const [tab, setTab] = useState("rutina");

  // Al montar, intentar auto-login si hay perfil activo sin PIN
  useEffect(() => {
    const saved = loadActiveProfile();
    if (saved && profiles[saved] && !profiles[saved].pin) {
      setActiveProfile(saved);
    }
  }, []);

  const logs = useMemo(() => getProfileLogs(profiles, activeProfile), [profiles, activeProfile]);

  const setLogs = (newLogs) => {
    const newProfiles = setProfileLogs(profiles, activeProfile, newLogs);
    setProfiles(newProfiles);
    saveProfiles(newProfiles);
  };

  const handleLogin = (profileName, updatedProfiles) => {
    setProfiles(updatedProfiles || profiles);
    setActiveProfile(profileName);
  };

  const handleLogout = () => {
    saveActiveProfile(null);
    setActiveProfile(null);
  };

  const handleReset = () => {
    if (!window.confirm(`¿Borrar todo el historial de "${activeProfile}"? No se puede deshacer.`)) return;
    const newProfiles = setProfileLogs(profiles, activeProfile, {});
    setProfiles(newProfiles);
    saveProfiles(newProfiles);
  };

  if (!activeProfile) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* HEADER */}
      <header className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-xl mx-auto px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Flame className="text-orange-400" size={20} />
              <div>
                <h1 className="font-bold text-base leading-tight">Mi Rutina</h1>
                <p className="text-[11px] text-slate-500 leading-tight flex items-center gap-1">
                  <UserCircle size={10} /> {activeProfile}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handleReset} className="text-slate-600 hover:text-rose-400 transition p-2 rounded-lg" title="Borrar historial">
                <Trash2 size={15} />
              </button>
              <button onClick={handleLogout} className="text-slate-600 hover:text-slate-300 transition p-2 rounded-lg flex items-center gap-1 text-xs" title="Cambiar perfil">
                <LogOut size={15} />
              </button>
            </div>
          </div>

          {/* NAV TABS */}
          <nav className="flex gap-1 mt-3 bg-slate-900 rounded-xl p-1">
            {[
              { key: "rutina", label: "Rutina", icon: Dumbbell },
              { key: "progreso", label: "Progreso", icon: BarChart3 },
              { key: "videos", label: "Videos", icon: Video },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-lg transition font-medium ${tab === key ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"}`}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </nav>

          {/* DÍA SELECTOR */}
          {tab === "rutina" && (
            <div className="flex gap-1.5 mt-2.5 overflow-x-auto pb-1 scrollbar-hide">
              {DAY_ORDER.map((dayKey) => (
                <button
                  key={dayKey}
                  onClick={() => setActiveDay(dayKey)}
                  className="px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition border active:scale-95"
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

      {/* CONTENIDO */}
      <main className="max-w-xl mx-auto px-4 py-4 space-y-4 pb-20">
        {tab === "rutina" && (
          <>
            <DaySummary dayKey={activeDay} logs={logs} />
            <RoutineDayView dayKey={activeDay} logs={logs} setLogs={setLogs} />
          </>
        )}
        {tab === "progreso" && <ProgressView logs={logs} />}
        {tab === "videos" && <VideosView />}
      </main>

      <footer className="text-center text-[10px] text-slate-700 pb-6 px-4">
        Cada perfil guarda sus datos por separado · {activeProfile}
      </footer>
    </div>
  );
}
