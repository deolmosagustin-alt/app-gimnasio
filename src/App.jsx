import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  Play, Pause, RotateCcw, TrendingUp, TrendingDown, Dumbbell,
  ChevronDown, ChevronUp, Trophy, Flame, Save, Trash2, BarChart3,
  ListChecks, LogOut, X, Check, AlertTriangle, Calendar, Zap,
  Mail, Clock, User, ChevronRight, Edit3, Info,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────
   CONSTANTES
───────────────────────────────────────────────────────────────────────── */
const REST_LONG = 300;
const REST_SHORT = 180;
const TRAIN_WEEKS = 7;
const DELOAD_WEEKS = 1;
const CYCLE_WEEKS = TRAIN_WEEKS + DELOAD_WEEKS;

/* Video: search URL para que siempre funcione */
const yt = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

/* ─────────────────────────────────────────────────────────────────────────
   RUTINA
───────────────────────────────────────────────────────────────────────── */
const ROUTINE = {
  push: {
    label: "PUSH", description: "Pecho · Hombro anterior · Tríceps",
    color: "#F97316", grad: "from-orange-500/20 to-transparent",
    exercises: [
      { id:"press_banca", name:"Press Banca", muscle:"Pectoral", nota:"Hacer fuerza con las piernas.",
        video: yt("press banca técnica correcta"),
        sets:[{repRange:"3-5",pr:{reps:5,kg:115},heavy:true},{repRange:"3-5",pr:{reps:7,kg:110},heavy:true},{repRange:"8-10",pr:{reps:10,kg:100}}] },
      { id:"press_inclinado_smith", name:"Press Inclinado Smith", muscle:"Pectoral sup.", nota:"Codos bastante pegados.",
        video: yt("press inclinado smith técnica"),
        sets:[{repRange:"8-10",pr:{reps:11,kg:90}},{repRange:"8-10",pr:{reps:9,kg:90}},{repRange:"8-10",pr:{reps:10,kg:85}}] },
      { id:"cruce_poleas", name:"Cruce de Poleas", muscle:"Pectoral", nota:"Énfasis en el estiramiento.",
        video: yt("cruce de poleas técnica pectoral"),
        sets:[{repRange:"10-12",pr:{reps:13,kg:15}},{repRange:"10-12",pr:{reps:11,kg:15}}] },
      { id:"vuelos_laterales_mancuerna", name:"Vuelos Laterales Mancuerna", muscle:"Deltoides lateral", nota:"Levantar un poco para adelante.",
        video: yt("vuelos laterales mancuerna técnica deltoides"),
        sets:[{repRange:"12-15",pr:{reps:15,kg:13}},{repRange:"12-15",pr:{reps:16,kg:13}},{repRange:"12-15",pr:{reps:14,kg:10}},{repRange:"12-15",pr:{reps:13,kg:10}}] },
      { id:"pec_dec_deltoides_push", name:"Pec Dec para Deltoides", muscle:"Deltoides post.", nota:"Unilateral.",
        video: yt("pec dec deltoides posterior técnica"),
        sets:[{repRange:"12-15",pr:{reps:15,kg:32}},{repRange:"12-15",pr:{reps:12,kg:32}}] },
      { id:"triceps_trasnuca_push", name:"Tríceps Trasnuca", muscle:"Tríceps", nota:"Pausa en el fondo, codos no van cerrados.",
        video: yt("triceps trasnuca técnica overhead extension"),
        sets:[{repRange:"8-10",pr:{reps:10,kg:38}},{repRange:"8-10",pr:{reps:12,kg:32}}] },
      { id:"triceps_polea_alta", name:"Tríceps Polea Alta", muscle:"Tríceps", nota:"El húmero no se mueve.",
        video: yt("tríceps polea alta técnica cable pushdown"),
        sets:[{repRange:"8-10",pr:{reps:14,kg:38}},{repRange:"8-10",pr:{reps:12,kg:40}}] },
    ],
  },
  pull: {
    label: "PULL", description: "Dorsal · Romboides · Bíceps",
    color: "#3B82F6", grad: "from-blue-500/20 to-transparent",
    exercises: [
      { id:"remo_ancho_maquina", name:"Remo Ancho Máquina", muscle:"Dorsal", nota:"No levantar los hombros.",
        video: yt("remo ancho máquina técnica espalda"),
        sets:[{repRange:"4-6",pr:{reps:7,kg:86},heavy:true},{repRange:"4-6",pr:{reps:7,kg:79},heavy:true},{repRange:"8-10",pr:{reps:9,kg:66}}] },
      { id:"dorsalera", name:"Dorsalera Agarre Ancho", muscle:"Dorsal", nota:"No descolocar los hombros, pulgar en la marca.",
        video: yt("dorsalera lat pulldown agarre ancho técnica"),
        sets:[{repRange:"8-10",pr:{reps:10,kg:66}},{repRange:"8-10",pr:{reps:8,kg:59}},{repRange:"8-10",pr:{reps:8,kg:52}}] },
      { id:"remo_unilateral", name:"Remo Unilateral", muscle:"Dorsal / oblicuos", nota:"Contraer los oblicuos, codo lo más abajo posible.",
        video: yt("remo unilateral mancuerna técnica espalda"),
        sets:[{repRange:"8-10",pr:{reps:11,kg:25}},{repRange:"8-10",pr:{reps:9,kg:25}}] },
      { id:"pull_over", name:"Pull Over", muscle:"Dorsal / serrato", nota:"Codos siempre un poco flexionados.",
        video: yt("pull over espalda técnica mancuerna"),
        sets:[{repRange:"8-10",pr:{reps:8,kg:38}},{repRange:"8-10",pr:{reps:9,kg:32}},{repRange:"8-10",pr:{reps:9,kg:25}}] },
      { id:"face_pull", name:"Face Pull", muscle:"Deltoides post.", nota:"Polea a la altura de los ojos.",
        video: yt("face pull técnica deltoides posterior"),
        sets:[{repRange:"15-20",pr:{reps:19,kg:18}},{repRange:"15-20",pr:{reps:16,kg:20}}] },
      { id:"biceps_alternado_mancuerna", name:"Bíceps Alternado Mancuerna", muscle:"Bíceps", nota:"Mover un poco el húmero al final.",
        video: yt("curl alternado mancuerna técnica bíceps"),
        sets:[{repRange:"8-10",pr:{reps:10,kg:18}},{repRange:"8-10",pr:{reps:9,kg:15}},{repRange:"8-10",pr:{reps:10,kg:15}},{repRange:"8-10",pr:{reps:12,kg:13}}] },
    ],
  },
  legs: {
    label: "PIERNAS", description: "Glúteo · Cuádriceps · Femoral · Aductores",
    color: "#22C55E", grad: "from-green-500/20 to-transparent",
    isNew: true,
    exercises: [
      { id:"sentadilla_bulgara", name:"Sentadilla Búlgara", muscle:"Glúteo", nota:"Torso ligeramente inclinado adelante.",
        video: yt("sentadilla búlgara técnica glúteo"),
        sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
      { id:"abdominales", name:"Abdominales", muscle:"Core", nota:"Controlar la excéntrica, sin impulso.",
        video: yt("abdominales técnica correcta core"),
        sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null},{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
      { id:"jaca", name:"Hack Squat", muscle:"Cuádriceps", nota:"Pies a la altura de hombros, bajar controlado.",
        video: yt("hack squat técnica cuádriceps"),
        sets:[{repRange:"4-6",pr:null,heavy:true},{repRange:"4-6",pr:null,heavy:true},{repRange:"8-10",pr:null}] },
      { id:"curl_femoral_maquina", name:"Curl Femoral Máquina", muscle:"Femoral", nota:"Controlar la fase negativa.",
        video: yt("curl femoral máquina técnica isquios"),
        sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
      { id:"extension_cuadriceps", name:"Extensión de Cuádriceps", muscle:"Cuádriceps", nota:"Pausa de 1 seg arriba.",
        video: yt("extensión cuádriceps máquina técnica"),
        sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
      { id:"aductor_maquina", name:"Aductor Máquina", muscle:"Aductores", nota:"Rango completo, sin rebotar.",
        video: yt("aductor máquina técnica inner thigh"),
        sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
      { id:"abductor_maquina", name:"Abductor Máquina", muscle:"Glúteo medio", nota:"Espalda apoyada, movimiento controlado.",
        video: yt("abductor máquina técnica glúteo medio"),
        sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
    ],
  },
  sarm: {
    label: "HOMBROS / BRAZOS", description: "Deltoides · Bíceps · Tríceps",
    color: "#A855F7", grad: "from-purple-500/20 to-transparent",
    exercises: [
      { id:"press_militar_smith", name:"Press Militar Smith", muscle:"Deltoides ant.", nota:"Codos adelante, banco 80-90°.",
        video: yt("press militar smith técnica hombros"),
        sets:[{repRange:"4-6",pr:{reps:7,kg:95},heavy:true},{repRange:"4-6",pr:{reps:7,kg:95},heavy:true},{repRange:"8-10",pr:{reps:10,kg:85}}] },
      { id:"vuelos_laterales_maquina", name:"Vuelos Laterales Máquina", muscle:"Deltoides lateral", nota:"No hacer tanta fuerza con el agarre.",
        video: yt("vuelos laterales máquina deltoides técnica"),
        sets:[{repRange:"12-15",pr:{reps:15,kg:52}},{repRange:"12-15",pr:{reps:11,kg:52}},{repRange:"12-15",pr:{reps:14,kg:45}},{repRange:"12-15",pr:{reps:15,kg:38}}] },
      { id:"pec_dec_deltoides_sarm", name:"Pec Dec Deltoides Posterior", muscle:"Deltoides post.", nota:"Unilateral.",
        video: yt("pec dec deltoides posterior técnica"),
        sets:[{repRange:"12-15",pr:{reps:11,kg:36}},{repRange:"12-15",pr:{reps:10,kg:36}}] },
      { id:"biceps_martillo", name:"Bíceps Martillo", muscle:"Bíceps / braquial", nota:"Alternado.",
        video: yt("curl martillo bíceps técnica hammer curl"),
        sets:[{repRange:"6-8",pr:{reps:8,kg:20}},{repRange:"6-8",pr:{reps:9,kg:18}},{repRange:"6-8",pr:{reps:8,kg:18}}] },
      { id:"biceps_banco_scott", name:"Bíceps Banco Scott", muscle:"Bíceps", nota:"Unilateral con mancuerna.",
        video: yt("curl banco scott técnica bíceps preacher curl"),
        sets:[{repRange:"6-8",pr:{reps:9,kg:15}},{repRange:"6-8",pr:{reps:9,kg:15}},{repRange:"6-8",pr:{reps:8,kg:13}}] },
      { id:"biceps_banco_inclinado", name:"Bíceps Banco Inclinado", muscle:"Bíceps cab. larga", nota:"Alternado, 6 puntos arriba.",
        video: yt("curl banco inclinado bíceps técnica incline curl"),
        sets:[{repRange:"8-10",pr:{reps:10,kg:13}},{repRange:"8-10",pr:{reps:12,kg:10}}] },
      { id:"triceps_trasnuca_sarm", name:"Tríceps Trasnuca", muscle:"Tríceps", nota:"Pausa en el fondo.",
        video: yt("triceps trasnuca técnica overhead extension"),
        sets:[{repRange:"8-10",pr:{reps:16,kg:38}},{repRange:"8-10",pr:{reps:12,kg:38}},{repRange:"8-10",pr:{reps:10,kg:38}}] },
    ],
  },
};
const DAY_ORDER = ["push","pull","legs","sarm"];

/* ─────────────────────────────────────────────────────────────────────────
   STORAGE — perfiles separados por dispositivo
───────────────────────────────────────────────────────────────────────── */
const PROFILES_KEY  = "gym_profiles_v2";
const ACTIVE_KEY    = "gym_active_v2";
const CYCLE_START_KEY = "gym_cycle_start_v2";

function getDeviceId() {
  let id = localStorage.getItem("gym_device_id");
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("gym_device_id", id);
  }
  return id;
}

function loadProfiles() { try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || "{}"); } catch { return {}; } }
function saveProfiles(p) { try { localStorage.setItem(PROFILES_KEY, JSON.stringify(p)); } catch {} }
function loadActive() { try { return localStorage.getItem(ACTIVE_KEY) || null; } catch { return null; } }
function saveActive(n) { try { n ? localStorage.setItem(ACTIVE_KEY, n) : localStorage.removeItem(ACTIVE_KEY); } catch {} }

function loadCycleStart() {
  try {
    const raw = localStorage.getItem(CYCLE_START_KEY);
    return raw ? new Date(raw) : null;
  } catch { return null; }
}
function saveCycleStart(d) { try { localStorage.setItem(CYCLE_START_KEY, d.toISOString()); } catch {} }

/* ─────────────────────────────────────────────────────────────────────────
   UTILIDADES
───────────────────────────────────────────────────────────────────────── */
function todayStr() { return new Date().toISOString().slice(0,10); }
function formatTime(s) { return `${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`; }
function vol(kg,reps) { return (!kg||!reps) ? 0 : kg*reps; }

function getWeekInfo(cycleStart) {
  if (!cycleStart) return null;
  const now = new Date();
  const diffDays = Math.floor((now - cycleStart) / 86400000);
  const totalWeek = Math.floor(diffDays / 7);
  const weekInCycle = (totalWeek % CYCLE_WEEKS) + 1;
  const isDeload = weekInCycle > TRAIN_WEEKS;
  return { totalWeek: totalWeek + 1, weekInCycle, isDeload, cycleNumber: Math.floor(totalWeek / CYCLE_WEEKS) + 1 };
}

/* ─────────────────────────────────────────────────────────────────────────
   COMPONENTE: PIN INPUT (dots estéticos)
───────────────────────────────────────────────────────────────────────── */
function PinInput({ length = 4, onComplete, label = "Ingresá tu PIN", error, onCancel }) {
  const [digits, setDigits] = useState([]);
  const inputRef = useRef();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleKey = (e) => {
    if (e.key >= "0" && e.key <= "9" && digits.length < length) {
      const next = [...digits, e.key];
      setDigits(next);
      if (next.length === length) setTimeout(() => onComplete(next.join("")), 80);
    } else if (e.key === "Backspace") {
      setDigits((d) => d.slice(0,-1));
    }
  };

  const tap = (n) => {
    if (digits.length >= length) return;
    const next = [...digits, String(n)];
    setDigits(next);
    if (next.length === length) setTimeout(() => onComplete(next.join("")), 80);
  };

  const del = () => setDigits((d) => d.slice(0,-1));

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <p className="text-sm text-slate-400 font-medium tracking-wide">{label}</p>

      {/* dots */}
      <div className="flex gap-4">
        {Array.from({length}).map((_,i) => (
          <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${i < digits.length ? "bg-orange-500 border-orange-500 scale-110" : "border-slate-600 bg-transparent"}`} />
        ))}
      </div>

      {error && <p className="text-rose-400 text-xs font-medium animate-pulse">{error}</p>}

      {/* teclado numérico */}
      <div className="grid grid-cols-3 gap-3 w-64">
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <button key={n} onClick={() => tap(n)}
            className="h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-95 active:bg-slate-600 text-xl font-semibold text-slate-100 transition-all">
            {n}
          </button>
        ))}
        {onCancel ? (
          <button onClick={onCancel} className="h-16 rounded-2xl text-slate-500 hover:text-slate-300 active:scale-95 transition-all text-sm font-medium">
            Cancelar
          </button>
        ) : <div />}
        <button onClick={() => tap(0)}
          className="h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-95 active:bg-slate-600 text-xl font-semibold text-slate-100 transition-all">
          0
        </button>
        <button onClick={del} className="h-16 rounded-2xl text-slate-400 hover:text-slate-200 active:scale-95 transition-all flex items-center justify-center">
          ⌫
        </button>
      </div>

      {/* hidden input para teclado físico */}
      <input ref={inputRef} className="sr-only" onKeyDown={handleKey} readOnly />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   PANTALLA LOGIN / REGISTRO
───────────────────────────────────────────────────────────────────────── */
function LoginScreen({ onLogin }) {
  const [profiles, setProfilesState] = useState(loadProfiles);
  const [phase, setPhase] = useState("list"); // list | register | pin
  const [pendingProfile, setPendingProfile] = useState(null);
  const [pinError, setPinError] = useState("");

  // Registro
  const [regName, setRegName] = useState("");
  const [regMail, setRegMail] = useState("");
  const [regPin, setRegPin] = useState("");
  const [regPinConfirm, setRegPinConfirm] = useState("");
  const [regStep, setRegStep] = useState(1); // 1=datos, 2=pin, 3=confirm
  const [regError, setRegError] = useState("");

  const deviceId = getDeviceId();
  const profileList = Object.keys(profiles);
  // Perfil de este dispositivo
  const deviceProfile = profileList.find(n => profiles[n].deviceId === deviceId);

  const tryLogin = (name) => {
    const p = profiles[name];
    if (p.pin) { setPendingProfile(name); setPhase("pin"); }
    else { saveActive(name); onLogin(name, profiles); }
  };

  const handlePinLogin = (entered) => {
    if (entered === profiles[pendingProfile].pin) {
      saveActive(pendingProfile);
      onLogin(pendingProfile, profiles);
    } else {
      setPinError("PIN incorrecto. Intentá de nuevo.");
      setTimeout(() => setPinError(""), 1500);
    }
  };

  const handleRegister = () => {
    setRegError("");
    if (!regName.trim()) { setRegError("Ingresá tu nombre."); return; }
    if (profiles[regName.trim()]) { setRegError("Ya existe ese nombre."); return; }
    if (regMail && !regMail.includes("@")) { setRegError("Email inválido."); return; }
    if (regStep === 1) { setRegStep(2); return; }
    if (regStep === 2) {
      if (regPin.length > 0 && regPin.length < 4) { setRegError("El PIN debe tener 4+ dígitos."); return; }
      if (regPin.length === 0) { finishRegister(); return; }
      setRegStep(3); return;
    }
    if (regStep === 3) {
      if (regPin !== regPinConfirm) { setRegError("Los PINs no coinciden."); return; }
      finishRegister();
    }
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
        maxesSetup: false,
      },
    };
    saveProfiles(newProfiles);
    setProfilesState(newProfiles);
    saveActive(name);
    onLogin(name, newProfiles);
  };

  // Auto-login si este dispositivo tiene perfil sin PIN
  useEffect(() => {
    if (deviceProfile && !profiles[deviceProfile].pin) {
      saveActive(deviceProfile);
      onLogin(deviceProfile, profiles);
    }
  }, []);

  if (phase === "pin") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-xs">
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-orange-500/15 flex items-center justify-center mb-3">
              <Flame className="text-orange-500" size={28} />
            </div>
            <h2 className="text-xl font-bold text-white">{pendingProfile}</h2>
          </div>
          <PinInput label="Ingresá tu PIN" onComplete={handlePinLogin} error={pinError} onCancel={() => { setPhase("list"); setPendingProfile(null); setPinError(""); }} />
        </div>
      </div>
    );
  }

  if (phase === "register") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => { setPhase("list"); setRegStep(1); setRegError(""); }}
              className="text-slate-500 hover:text-slate-300 transition">
              <ChevronDown size={20} className="rotate-90" />
            </button>
            <h2 className="text-lg font-bold text-white">Crear perfil</h2>
          </div>

          {/* Steps */}
          <div className="flex gap-1.5 mb-6">
            {[1,2,3].map(s => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-all ${regStep >= s ? "bg-orange-500" : "bg-slate-800"}`} />
            ))}
          </div>

          <div className="space-y-4">
            {regStep === 1 && (
              <>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Nombre</label>
                  <input type="text" placeholder="¿Cómo te llamás?" value={regName}
                    onChange={e => setRegName(e.target.value)}
                    className="w-full bg-slate-900/80 border border-slate-700/50 rounded-2xl px-4 py-3.5 text-white focus:outline-none focus:border-orange-500/60 text-sm transition"
                    autoFocus />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Email <span className="text-slate-600 normal-case">(opcional)</span></label>
                  <input type="email" placeholder="tu@email.com" value={regMail}
                    onChange={e => setRegMail(e.target.value)}
                    className="w-full bg-slate-900/80 border border-slate-700/50 rounded-2xl px-4 py-3.5 text-white focus:outline-none focus:border-orange-500/60 text-sm transition" />
                </div>
              </>
            )}

            {regStep === 2 && (
              <div className="text-center py-4">
                <p className="text-slate-400 text-sm mb-6">¿Querés proteger tu perfil con un PIN? <span className="text-slate-500">(opcional)</span></p>
                <div className="flex gap-3 justify-center">
                  <button onClick={() => { setRegPin(""); finishRegister(); }}
                    className="flex-1 py-3.5 rounded-2xl border border-slate-700 text-slate-400 text-sm font-semibold hover:border-slate-500 transition">
                    Sin PIN
                  </button>
                  <button onClick={() => setRegStep(2.5)}
                    className="flex-1 py-3.5 rounded-2xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-400 transition">
                    Con PIN
                  </button>
                </div>
              </div>
            )}

            {regStep === 2.5 && (
              <div>
                <PinInput length={4} label="Elegí un PIN de 4 dígitos"
                  onComplete={(p) => { setRegPin(p); setRegStep(3); }} />
              </div>
            )}

            {regStep === 3 && (
              <div>
                <PinInput length={4} label="Confirmá el PIN"
                  onComplete={(p) => {
                    if (p === regPin) { finishRegister(); }
                    else { setRegError("No coinciden. Intentá de nuevo."); setTimeout(() => setRegError(""), 1500); }
                  }}
                  error={regError} />
              </div>
            )}
          </div>

          {regError && regStep === 1 && <p className="text-rose-400 text-xs mt-3 text-center">{regError}</p>}

          {(regStep === 1) && (
            <button onClick={handleRegister}
              className="w-full mt-6 py-4 rounded-2xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-400 active:scale-[0.98] transition-all">
              Continuar →
            </button>
          )}
        </div>
      </div>
    );
  }

  // Lista de perfiles
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-orange-500/30 to-orange-500/5 border border-orange-500/20 flex items-center justify-center mb-4">
            <Flame className="text-orange-500" size={30} />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Mi Rutina</h1>
          <p className="text-slate-500 text-sm mt-1">Seguimiento de cargas y progreso</p>
        </div>

        {profileList.length > 0 && (
          <div className="mb-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-3">Perfiles</p>
            <div className="space-y-2">
              {profileList.map(name => (
                <button key={name} onClick={() => tryLogin(name)}
                  className="w-full flex items-center gap-3.5 bg-slate-900/60 border border-slate-800/60 hover:border-slate-600/60 rounded-2xl px-4 py-3.5 transition-all active:scale-[0.98] text-left group">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black shrink-0"
                    style={{ background: "linear-gradient(135deg,#F97316,#DC2626)", color: "white" }}>
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm">{name}</p>
                    <p className="text-[11px] text-slate-500">{profiles[name].pin ? "🔒 Con PIN" : "Sin PIN"} · {profiles[name].deviceId === deviceId ? "Este dispositivo" : "Otro dispositivo"}</p>
                  </div>
                  <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 transition shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        <button onClick={() => setPhase("register")}
          className="w-full py-4 rounded-2xl border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-all text-sm font-semibold flex items-center justify-center gap-2">
          + Crear perfil nuevo
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   TIMER DE DESCANSO
───────────────────────────────────────────────────────────────────────── */
function RestTimer({ seconds, accent }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  const ref = useRef();

  useEffect(() => { setRemaining(seconds); }, [seconds]);
  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => {
        setRemaining(r => {
          if (r <= 1) {
            clearInterval(ref.current); setRunning(false);
            try { const a=new AudioContext(),o=a.createOscillator(); o.frequency.value=880; o.connect(a.destination); o.start(); setTimeout(()=>o.stop(),350); } catch {}
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    }
    return () => clearInterval(ref.current);
  }, [running]);

  const pct = Math.max(0, Math.min(100, (remaining/seconds)*100));
  const r = 16, circ = 2*Math.PI*r;

  return (
    <div className="flex items-center gap-3 bg-slate-900/60 rounded-2xl px-4 py-3 border border-slate-800/60">
      <div className="relative w-12 h-12 shrink-0">
        <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
          <circle cx="18" cy="18" r={r} fill="none" stroke="#1a1a2e" strokeWidth="3"/>
          <circle cx="18" cy="18" r={r} fill="none" stroke={accent} strokeWidth="3"
            strokeDasharray={circ} strokeDashoffset={circ*(1-pct/100)} strokeLinecap="round"
            style={{transition:"stroke-dashoffset 0.3s linear"}}/>
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-200">{formatTime(remaining)}</span>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setRunning(r=>!r)}
          className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 transition text-slate-200">
          {running ? <Pause size={16}/> : <Play size={16}/>}
        </button>
        <button onClick={() => { setRunning(false); setRemaining(seconds); }}
          className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 transition text-slate-200">
          <RotateCcw size={16}/>
        </button>
      </div>
      <span className="text-xs text-slate-500">{seconds===REST_LONG?"5 min":"3 min"} descanso</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   SET ROW
───────────────────────────────────────────────────────────────────────── */
function SetRow({ exerciseId, setIndex, setDef, accent, logs, setLogs, deloadKgFactor=1, deloadMode=false }) {
  const key = `${exerciseId}_${setIndex}`;
  const prKey = `${key}_pr_override`;
  const today = todayStr();
  const history = logs[key] || [];
  const lastEntry = history[history.length-1];
  const override = logs[prKey];

  const computedPR = useMemo(() => {
    let best = setDef.pr ? {...setDef.pr} : null;
    history.forEach(h => { if (!best || vol(h.kg,h.reps)>vol(best.kg,best.reps)) best={kg:h.kg,reps:h.reps}; });
    return best;
  }, [history, setDef.pr]);

  const currentPR = override || computedPR;
  const suggestedKg = currentPR && deloadMode ? Math.round(currentPR.kg * deloadKgFactor * 2)/2 : null;

  const [reps, setReps] = useState(lastEntry?.reps ?? "");
  const [kg, setKg] = useState(lastEntry?.kg ?? "");
  const [feedback, setFeedback] = useState(null);
  const [editingPR, setEditingPR] = useState(false);
  const [editReps, setEditReps] = useState("");
  const [editKg, setEditKg] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const r=parseFloat(reps), k=parseFloat(kg);
    if (!r||!k||isNaN(r)||isNaN(k)) { setFeedback({type:"error",msg:"Completá reps y kg."}); return; }
    const prevVol = currentPR ? vol(currentPR.kg,currentPR.reps) : 0;
    const newVol = vol(k,r);
    const entry = {date:today,reps:r,kg:k};
    const newHistory = [...history.filter(h=>h.date!==today), entry];
    setLogs({...logs,[key]:newHistory});
    setSaved(true); setTimeout(()=>setSaved(false),1200);
    if (!currentPR||newVol>prevVol) setFeedback({type:"pr",msg:"¡Nueva marca! 🔥"});
    else if (newVol===prevVol) setFeedback({type:"tie",msg:"Igualaste tu marca 💪"});
    else setFeedback({type:"down",msg:`-${(((prevVol-newVol)/prevVol)*100).toFixed(0)}% vs récord`});
  };

  const savePR = () => {
    const r=parseFloat(editReps), k=parseFloat(editKg);
    if (!r||!k||isNaN(r)||isNaN(k)) return;
    setLogs({...logs,[prKey]:{kg:k,reps:r}});
    setEditingPR(false);
  };

  return (
    <div className="py-3 border-b border-slate-800/50 last:border-0">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">S{setIndex+1}</span>
          <span className="text-[10px] bg-slate-800/80 text-slate-500 rounded-lg px-2 py-0.5">{setDef.repRange} reps</span>
          {setDef.heavy && <span className="text-[10px] bg-amber-500/15 text-amber-400 rounded-lg px-2 py-0.5 font-bold">FUERZA</span>}
        </div>
        {feedback && (
          <span className={`text-xs font-semibold ${feedback.type==="pr"?"text-emerald-400":feedback.type==="down"?"text-rose-400":"text-amber-400"}`}>
            {feedback.msg}
          </span>
        )}
      </div>

      {deloadMode && suggestedKg && (
        <div className="mb-2 text-[11px] text-purple-400 flex items-center gap-1.5">
          <Zap size={11}/> Descarga: {suggestedKg} kg sugerido (75%)
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider mb-1.5 block">Reps</label>
          <input type="number" inputMode="decimal" placeholder="—" value={reps}
            onChange={e=>setReps(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-3.5 text-xl font-black text-center text-white focus:outline-none focus:border-orange-500/50 transition"/>
        </div>
        <div className="text-slate-700 text-lg pb-3">×</div>
        <div className="flex-1">
          <label className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider mb-1.5 block">Kg</label>
          <input type="number" inputMode="decimal" placeholder="—" value={kg}
            onChange={e=>setKg(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-3.5 text-xl font-black text-center text-white focus:outline-none focus:border-orange-500/50 transition"/>
        </div>
        <button onClick={handleSave}
          className={`mb-0 p-3.5 rounded-xl transition-all active:scale-95 font-bold text-white flex items-center justify-center ${saved?"bg-emerald-500":"hover:opacity-90"}`}
          style={!saved?{backgroundColor:accent}:{}}>
          {saved ? <Check size={18}/> : <Save size={18}/>}
        </button>
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          {currentPR ? (
            <span className="text-[11px] text-slate-600">Récord: <span className="text-slate-300 font-bold">{currentPR.reps}×{currentPR.kg}kg</span>{override&&<span className="text-amber-500 ml-1">✎</span>}</span>
          ) : <span className="text-[11px] text-slate-700">Sin marca aún</span>}
          <button onClick={()=>{setEditReps(currentPR?.reps??"");setEditKg(currentPR?.kg??"");setEditingPR(e=>!e);}}
            className="text-slate-700 hover:text-slate-400 transition text-xs">✏️</button>
        </div>
      </div>

      {editingPR && (
        <div className="mt-2 bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2">
          <p className="text-[11px] text-slate-500">Corregir récord:</p>
          <div className="flex flex-wrap gap-2 items-center">
            <input type="number" inputMode="decimal" placeholder="Reps" value={editReps} onChange={e=>setEditReps(e.target.value)}
              className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white"/>
            <span className="text-slate-600 text-xs">reps ×</span>
            <input type="number" inputMode="decimal" placeholder="Kg" value={editKg} onChange={e=>setEditKg(e.target.value)}
              className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white"/>
            <span className="text-slate-600 text-xs">kg</span>
            <button onClick={savePR} className="px-3 py-1.5 rounded-lg text-white text-xs font-bold" style={{backgroundColor:accent}}>Guardar</button>
            {override&&<button onClick={()=>{const l={...logs};delete l[prKey];setLogs(l);setEditingPR(false);}} className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 text-xs">Quitar</button>}
            <button onClick={()=>setEditingPR(false)} className="text-slate-500 text-xs hover:text-slate-300">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   EXERCISE CARD
───────────────────────────────────────────────────────────────────────── */
function ExerciseCard({ exercise, accent, logs, setLogs, deloadSets, deloadMode }) {
  const [open, setOpen] = useState(false);
  const hasHeavy = exercise.sets.some(s=>s.heavy);
  const setsToShow = deloadSets ? exercise.sets.slice(0, deloadSets) : exercise.sets;

  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl overflow-hidden backdrop-blur-sm">
      <button onClick={()=>setOpen(o=>!o)}
        className="w-full flex items-center justify-between px-4 py-4 hover:bg-slate-800/30 active:bg-slate-800/50 transition text-left">
        <div className="flex items-center gap-3">
          <div className="w-2 h-8 rounded-full" style={{backgroundColor:accent}}/>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-white text-sm">{exercise.name}</h3>
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-lg font-bold"
                style={{backgroundColor:accent+"18",color:accent}}>{exercise.muscle}</span>
              {deloadMode && <span className="text-[10px] bg-purple-500/15 text-purple-400 rounded-lg px-1.5 py-0.5 font-bold">DESCARGA</span>}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">{exercise.nota}</p>
          </div>
        </div>
        {open ? <ChevronUp size={18} className="text-slate-600 shrink-0"/> : <ChevronDown size={18} className="text-slate-600 shrink-0"/>}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-0">
          {setsToShow.map((s,i) => (
            <SetRow key={i} exerciseId={exercise.id} setIndex={i} setDef={s}
              accent={accent} logs={logs} setLogs={setLogs}
              deloadKgFactor={0.75} deloadMode={deloadMode}/>
          ))}
          <div className="flex flex-col gap-2 pt-3">
            <RestTimer seconds={hasHeavy?REST_LONG:REST_SHORT} accent={accent}/>
            <a href={exercise.video} target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-800 text-slate-400 hover:border-slate-600 hover:text-white transition text-sm font-medium active:scale-[0.98]">
              ▶ Ver técnica en YouTube
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   RESUMEN DEL DÍA
───────────────────────────────────────────────────────────────────────── */
function DaySummary({ dayKey, logs }) {
  const day = ROUTINE[dayKey];
  const today = todayStr();
  let totalSets=0, doneToday=0, prsToday=0;
  day.exercises.forEach(ex => {
    ex.sets.forEach((s,i) => {
      totalSets++;
      const h = logs[`${ex.id}_${i}`]||[];
      const t = h.find(x=>x.date===today);
      if (t) {
        doneToday++;
        let best = s.pr?{...s.pr}:null;
        h.filter(x=>x.date!==today).forEach(x=>{if(!best||vol(x.kg,x.reps)>vol(best.kg,best.reps))best=x;});
        if (!best||vol(t.kg,t.reps)>vol(best.kg,best.reps)) prsToday++;
      }
    });
  });
  const pct = totalSets ? Math.round((doneToday/totalSets)*100) : 0;

  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        {val:`${pct}%`,label:"Completado",icon:<ListChecks size={12}/>,color:"text-white"},
        {val:prsToday,label:"Marcas hoy",icon:<Trophy size={12}/>,color:"text-amber-400"},
        {val:day.exercises.length,label:"Ejercicios",icon:<Dumbbell size={12}/>,color:"text-white"},
      ].map(({val,label,icon,color})=>(
        <div key={label} className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-3 text-center backdrop-blur-sm">
          <p className={`text-2xl font-black ${color}`}>{val}</p>
          <p className="text-[10px] text-slate-600 flex items-center justify-center gap-1 mt-0.5">{icon}{label}</p>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   CALENDARIO SEMANAL (7 train + 1 deload)
───────────────────────────────────────────────────────────────────────── */
function WeekCalendar({ cycleStart, logs }) {
  const weekInfo = getWeekInfo(cycleStart);
  if (!cycleStart || !weekInfo) return null;

  const weeks = Array.from({length: CYCLE_WEEKS}, (_,i) => i+1);
  const trainedDays = useMemo(() => {
    const s = new Set();
    Object.entries(logs).forEach(([k,v]) => {
      if (k.endsWith("_pr_override")||!Array.isArray(v)) return;
      v.forEach(e => s.add(e.date));
    });
    return s;
  }, [logs]);

  // Semanas desde el inicio
  const weekDots = Array.from({length: CYCLE_WEEKS}, (_,wi) => {
    const weekStart = new Date(cycleStart);
    weekStart.setDate(weekStart.getDate() + wi*7);
    const days = Array.from({length:7}, (_,di) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate()+di);
      return d.toISOString().slice(0,10);
    });
    const trained = days.filter(d=>trainedDays.has(d)).length;
    return { week: wi+1, days, trained, isDeload: wi+1 > TRAIN_WEEKS };
  });

  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-white">Ciclo actual</h3>
          <p className="text-[11px] text-slate-500">Ciclo #{weekInfo.cycleNumber} · Semana {weekInfo.weekInCycle} de {CYCLE_WEEKS}</p>
        </div>
        <div className={`px-3 py-1.5 rounded-xl text-xs font-bold ${weekInfo.isDeload?"bg-purple-500/20 text-purple-400":"bg-orange-500/20 text-orange-400"}`}>
          {weekInfo.isDeload?"DESCARGA":"ENTRENAMIENTO"}
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {weekDots.map(({week, trained, isDeload}) => {
          const isCurrent = week === weekInfo.weekInCycle;
          return (
            <div key={week} className="flex flex-col items-center gap-1">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black transition-all
                ${isCurrent?"ring-2 ring-offset-2 ring-offset-slate-950":""}
                ${isDeload
                  ? isCurrent?"bg-purple-500 ring-purple-500 text-white":"bg-purple-500/10 text-purple-600 border border-purple-500/20"
                  : trained>0
                    ? isCurrent?"bg-orange-500 ring-orange-500 text-white":"bg-orange-500/20 text-orange-400 border border-orange-500/20"
                    : isCurrent?"bg-slate-700 ring-slate-500 text-white":"bg-slate-800/50 text-slate-700 border border-slate-800"
                }`}>
                {isDeload ? "D" : week}
              </div>
              {trained>0 && !isDeload && (
                <div className="flex gap-0.5">
                  {Array.from({length:Math.min(trained,7)}).map((_,i)=>(
                    <div key={i} className="w-1 h-1 rounded-full bg-orange-500/60"/>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-4 mt-4 text-[10px] text-slate-600">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-md bg-orange-500/20 border border-orange-500/30"/><span>Entrenamiento</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-md bg-purple-500/20 border border-purple-500/30"/><span>Descarga</span></div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   RUTINA VIEW
───────────────────────────────────────────────────────────────────────── */
function RoutineView({ logs, setLogs, cycleStart }) {
  const [activeDay, setActiveDay] = useState("push");
  const weekInfo = getWeekInfo(cycleStart);
  const isDeload = weekInfo?.isDeload;
  const day = ROUTINE[activeDay];

  // Deload: calcular series reducidas
  const getDeloadSets = (ex) => {
    const n = ex.sets.length;
    return n <= 2 ? 1 : 2;
  };

  return (
    <div className="space-y-4">
      <WeekCalendar cycleStart={cycleStart} logs={logs}/>

      {isDeload && (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl px-4 py-3 flex items-start gap-3">
          <Zap size={16} className="text-purple-400 mt-0.5 shrink-0"/>
          <div>
            <p className="text-sm font-bold text-purple-300">Semana de descarga activa</p>
            <p className="text-xs text-purple-500/80 mt-0.5">Series reducidas a la mitad · Cargas al 75% · Mismas repeticiones</p>
          </div>
        </div>
      )}

      {/* Day tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {DAY_ORDER.map(k => (
          <button key={k} onClick={()=>setActiveDay(k)}
            className="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-95 border"
            style={activeDay===k
              ?{backgroundColor:ROUTINE[k].color,borderColor:ROUTINE[k].color,color:"#fff"}
              :{borderColor:"#1e2035",color:"#475569"}}>
            {ROUTINE[k].label}
          </button>
        ))}
      </div>

      <DaySummary dayKey={activeDay} logs={logs}/>
      <p className="text-xs text-slate-500 leading-relaxed px-1">{day.description}</p>
      {day.isNew && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl px-3 py-2">🆕 Empezás a registrar tus marcas desde hoy.</div>}
      {day.exercises.map(ex => (
        <ExerciseCard key={ex.id} exercise={ex} accent={day.color}
          logs={logs} setLogs={setLogs}
          deloadSets={isDeload ? getDeloadSets(ex) : null}
          deloadMode={isDeload}/>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   PESTAÑA DESCARGA (cálculo)
───────────────────────────────────────────────────────────────────────── */
function DeloadView({ logs }) {
  const allExercises = DAY_ORDER.flatMap(dk => ROUTINE[dk].exercises.map(e=>({...e,dayKey:dk,dayColor:ROUTINE[dk].color,dayLabel:ROUTINE[dk].label})));

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-purple-500/20 to-purple-900/10 border border-purple-500/20 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <Zap size={20} className="text-purple-400 mt-0.5 shrink-0"/>
          <div>
            <h2 className="font-bold text-white text-sm">Semana de descarga</h2>
            <p className="text-xs text-purple-300/70 mt-1 leading-relaxed">
              Cada 7 semanas de entrenamiento, 1 semana de descarga. Las cargas bajan al <strong className="text-purple-300">75%</strong> de tu récord, las series se reducen a la mitad y mantenés las repeticiones. Esto permite recuperación sin perder adaptaciones.
            </p>
          </div>
        </div>
      </div>

      {DAY_ORDER.map(dk => {
        const day = ROUTINE[dk];
        return (
          <div key={dk}>
            <p className="text-xs font-black uppercase tracking-widest mb-2.5 flex items-center gap-2" style={{color:day.color}}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{backgroundColor:day.color}}/>{day.label}
            </p>
            <div className="space-y-2">
              {day.exercises.map(ex => {
                const deloadSets = ex.sets.length <= 2 ? 1 : 2;
                const bestPerSet = ex.sets.map((s,i) => {
                  const h = logs[`${ex.id}_${i}`]||[];
                  let best = s.pr?{...s.pr}:null;
                  const ov = logs[`${ex.id}_${i}_pr_override`];
                  if (ov) best=ov;
                  else h.forEach(e=>{if(!best||vol(e.kg,e.reps)>vol(best.kg,best.reps))best=e;});
                  return best;
                });
                const hasPR = bestPerSet.some(Boolean);

                return (
                  <div key={ex.id} className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-3.5 backdrop-blur-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-bold text-white text-sm">{ex.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-lg font-bold" style={{backgroundColor:day.color+"18",color:day.color}}>{ex.muscle}</span>
                    </div>
                    <div className="text-xs text-slate-500 mb-2.5">
                      <span className="font-semibold">{ex.sets.length} series</span> → <span className="text-purple-400 font-semibold">{deloadSets} series en descarga</span>
                    </div>
                    {hasPR ? (
                      <div className="space-y-1.5">
                        {ex.sets.slice(0,deloadSets).map((s,i) => {
                          const best = bestPerSet[i];
                          const deloadKg = best ? Math.round(best.kg*0.75*2)/2 : null;
                          return (
                            <div key={i} className="flex items-center justify-between bg-slate-800/40 rounded-xl px-3 py-2">
                              <span className="text-[11px] text-slate-500">S{i+1} · {s.repRange} reps</span>
                              {best ? (
                                <div className="flex items-center gap-3 text-xs">
                                  <span className="text-slate-500 line-through">{best.reps}×{best.kg}kg</span>
                                  <span className="text-purple-400 font-bold">{best.reps}×{deloadKg}kg</span>
                                </div>
                              ) : <span className="text-[11px] text-slate-600">Sin marca aún</span>}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-600">Sin marcas registradas todavía.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   PROGRESO
───────────────────────────────────────────────────────────────────────── */
const CustomTooltip = ({active,payload,label}) => {
  if (!active||!payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs">
      <p className="text-slate-400 mb-1.5">{label}</p>
      {payload.map(p=>(
        <p key={p.name} style={{color:p.color}} className="font-semibold">{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

function ProgressView({ logs }) {
  const allExercises = useMemo(()=>DAY_ORDER.flatMap(dk=>
    ROUTINE[dk].exercises.map(e=>({id:e.id,name:e.name,day:ROUTINE[dk].label,color:ROUTINE[dk].color,sets:e.sets.length}))
  ),[]);

  const stats = useMemo(()=>{
    const dateSet=new Set(); let totalVol=0, totalSets=0;
    Object.entries(logs).forEach(([k,v])=>{
      if(k.endsWith("_pr_override")||!Array.isArray(v)) return;
      v.forEach(e=>{dateSet.add(e.date);totalVol+=vol(e.kg,e.reps);totalSets++;});
    });
    let streak=0,cursor=new Date();
    while(true){const d=cursor.toISOString().slice(0,10);if(dateSet.has(d)){streak++;cursor.setDate(cursor.getDate()-1);}else break;}
    return {totalVol:Math.round(totalVol),totalSets,streak,daysTrained:dateSet.size};
  },[logs]);

  const [selId, setSelId] = useState(allExercises[0]?.id);
  const [selSet, setSelSet] = useState(0);
  const selEx = allExercises.find(e=>e.id===selId);
  const history = (logs[`${selId}_${selSet}`]||[]).slice().sort((a,b)=>a.date>b.date?1:-1);
  const chartData = history.map(h=>({date:h.date.slice(5),kg:h.kg,reps:h.reps,vol:vol(h.kg,h.reps)}));

  // Mejor ejercicio (más PRs)
  const topEx = useMemo(()=>{
    let best={name:"—",prs:0};
    allExercises.forEach(ex=>{
      let prs=0;
      ex.sets>0&&Array.from({length:ex.sets}).forEach((_,i)=>{
        const h=logs[`${ex.id}_${i}`]||[];
        if(h.length>1){const first=h[0],last=h[h.length-1];if(vol(last.kg,last.reps)>vol(first.kg,first.reps))prs++;}
      });
      if(prs>best.prs)best={name:ex.name,prs};
    });
    return best;
  },[logs,allExercises]);

  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        {[
          {val:stats.totalVol.toLocaleString("es-AR"),label:"Kg × reps totales",color:"text-white"},
          {val:stats.streak,label:"Días seguidos 🔥",color:"text-orange-400"},
          {val:stats.daysTrained,label:"Días entrenados",color:"text-white"},
          {val:stats.totalSets,label:"Series cargadas",color:"text-white"},
        ].map(({val,label,color})=>(
          <div key={label} className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm">
            <p className={`text-2xl font-black ${color} tabular-nums`}>{val}</p>
            <p className="text-[10px] text-slate-600 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {topEx.prs>0&&(
        <div className="bg-gradient-to-r from-amber-500/15 to-transparent border border-amber-500/20 rounded-2xl px-4 py-3 flex items-center gap-3">
          <Trophy size={18} className="text-amber-400 shrink-0"/>
          <div>
            <p className="text-xs font-bold text-amber-300">Mejor progreso</p>
            <p className="text-[11px] text-amber-500/80">{topEx.name} · {topEx.prs} serie{topEx.prs!==1?"s":""} con mejora</p>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm space-y-3">
        <h3 className="text-sm font-bold text-white">Evolución por ejercicio</h3>
        <div className="flex flex-col gap-2">
          <select value={selId} onChange={e=>{setSelId(e.target.value);setSelSet(0);}}
            className="bg-slate-800/80 border border-slate-700/50 rounded-xl px-3 py-3 text-sm text-white w-full">
            {allExercises.map(e=><option key={e.id} value={e.id}>{e.day} — {e.name}</option>)}
          </select>
          <select value={selSet} onChange={e=>setSelSet(Number(e.target.value))}
            className="bg-slate-800/80 border border-slate-700/50 rounded-xl px-3 py-3 text-sm text-white w-full">
            {Array.from({length:selEx?.sets||1}).map((_,i)=><option key={i} value={i}>Serie {i+1}</option>)}
          </select>
        </div>

        {chartData.length===0 ? (
          <div className="text-center text-slate-600 text-sm py-12">
            <BarChart3 size={32} className="mx-auto mb-3 opacity-30"/>
            <p>Sin registros aún.</p>
          </div>
        ) : (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{top:5,right:0,left:-25,bottom:0}}>
                  <defs>
                    <linearGradient id="gKg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={selEx?.color} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={selEx?.color} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gVol" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#A855F7" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#A855F7" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e"/>
                  <XAxis dataKey="date" stroke="#334155" fontSize={10}/>
                  <YAxis stroke="#334155" fontSize={10}/>
                  <Tooltip content={<CustomTooltip/>}/>
                  <Area type="monotone" dataKey="kg" stroke={selEx?.color||"#F97316"} fill="url(#gKg)" strokeWidth={2} dot={{r:3,fill:selEx?.color}} name="Kg"/>
                  <Area type="monotone" dataKey="vol" stroke="#A855F7" fill="url(#gVol)" strokeWidth={2} dot={{r:2,fill:"#A855F7"}} name="Volumen"/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {chartData.length>=2&&(()=>{
              const f=chartData[0],l=chartData[chartData.length-1];
              const diff=l.vol-f.vol, pct=f.vol?((diff/f.vol)*100).toFixed(1):0, pos=diff>=0;
              return (
                <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold ${pos?"bg-emerald-500/10 text-emerald-400":"bg-rose-500/10 text-rose-400"}`}>
                  {pos?<TrendingUp size={14}/>:<TrendingDown size={14}/>}
                  {pos?"Progreso":"Regresión"}: {pos?"+":""}{pct}% de volumen desde el primer registro
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   PERFIL
───────────────────────────────────────────────────────────────────────── */
function ProfileView({ profileName, profiles, onLogout, onDelete, onUpdateProfile, cycleStart, onSetCycleStart }) {
  const profile = profiles[profileName];
  const [showDeletePin, setShowDeletePin] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editMail, setEditMail] = useState(profile?.email||"");
  const [showCycleSetup, setShowCycleSetup] = useState(false);

  const joinDate = profile?.joinedAt ? new Date(profile.joinedAt).toLocaleDateString("es-AR",{day:"numeric",month:"long",year:"numeric"}) : "—";
  const weekInfo = getWeekInfo(cycleStart);

  const handleDeleteConfirm = (pin) => {
    if (profile.pin && pin !== profile.pin) {
      setDeleteError("PIN incorrecto.");
      setTimeout(()=>setDeleteError(""),1500);
    } else {
      onDelete();
    }
  };

  const initial = profileName.charAt(0).toUpperCase();

  return (
    <div className="space-y-4">
      {/* Avatar + nombre */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-900/50 border border-slate-800/50 rounded-2xl p-5 text-center">
        <div className="w-20 h-20 rounded-3xl mx-auto flex items-center justify-center text-3xl font-black text-white mb-3"
          style={{background:"linear-gradient(135deg,#F97316,#DC2626)"}}>
          {initial}
        </div>
        <h2 className="text-xl font-black text-white">{profileName}</h2>
        {profile?.email && <p className="text-sm text-slate-400 mt-1">{profile.email}</p>}
        <p className="text-[11px] text-slate-600 mt-1">Miembro desde {joinDate}</p>
      </div>

      {/* Info */}
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl divide-y divide-slate-800/50 overflow-hidden backdrop-blur-sm">
        {[
          {icon:<Mail size={14}/>,label:"Email",val:profile?.email||"No configurado"},
          {icon:<Clock size={14}/>,label:"Unido el",val:joinDate},
          {icon:<Calendar size={14}/>,label:"Ciclo actual",val:weekInfo?`Ciclo #${weekInfo.cycleNumber} · Semana ${weekInfo.weekInCycle}/${CYCLE_WEEKS}`:"No iniciado"},
          {icon:<Zap size={14}/>,label:"Estado",val:weekInfo?(weekInfo.isDeload?"🟣 Semana de descarga":"🟠 Semana de entrenamiento"):"—"},
        ].map(({icon,label,val})=>(
          <div key={label} className="flex items-center gap-3 px-4 py-3.5">
            <span className="text-slate-600">{icon}</span>
            <span className="text-slate-500 text-xs flex-1">{label}</span>
            <span className="text-slate-300 text-xs font-medium text-right">{val}</span>
          </div>
        ))}
      </div>

      {/* Editar email */}
      {editing ? (
        <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 space-y-3">
          <input type="email" value={editMail} onChange={e=>setEditMail(e.target.value)}
            placeholder="tu@email.com"
            className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500/50"/>
          <div className="flex gap-2">
            <button onClick={()=>setEditing(false)} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-semibold">Cancelar</button>
            <button onClick={()=>{onUpdateProfile({email:editMail});setEditing(false);}}
              className="flex-1 py-3 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-400 transition">Guardar</button>
          </div>
        </div>
      ) : (
        <button onClick={()=>setEditing(true)}
          className="w-full flex items-center gap-2 justify-center py-3 rounded-2xl border border-slate-800 text-slate-400 hover:border-slate-600 hover:text-white transition text-sm font-medium">
          <Edit3 size={14}/> Editar perfil
        </button>
      )}

      {/* Inicio de ciclo */}
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-bold text-white">Inicio de ciclo</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {cycleStart ? `Iniciado el ${new Date(cycleStart).toLocaleDateString("es-AR")}` : "No configurado"}
            </p>
          </div>
          <button onClick={()=>setShowCycleSetup(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition">
            {cycleStart?"Cambiar":"Configurar"}
          </button>
        </div>
      </div>

      {showCycleSetup && (
        <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold text-white">¿Cuándo empezaste el ciclo actual?</p>
          <input type="date" className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-3 text-white text-sm focus:outline-none"
            defaultValue={cycleStart ? new Date(cycleStart).toISOString().slice(0,10) : todayStr()}
            id="cycle-date-input"/>
          <div className="flex gap-2">
            <button onClick={()=>setShowCycleSetup(false)} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-semibold">Cancelar</button>
            <button onClick={()=>{
              const val = document.getElementById("cycle-date-input").value;
              if(val){onSetCycleStart(new Date(val));setShowCycleSetup(false);}
            }} className="flex-1 py-3 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-400 transition">Guardar</button>
          </div>
        </div>
      )}

      {/* Cerrar sesión */}
      <button onClick={onLogout}
        className="w-full flex items-center gap-2 justify-center py-3.5 rounded-2xl border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 transition text-sm font-semibold">
        <LogOut size={14}/> Cambiar de perfil
      </button>

      {/* Borrar */}
      {!showDeletePin ? (
        <button onClick={()=>setShowDeletePin(true)}
          className="w-full flex items-center gap-2 justify-center py-3.5 rounded-2xl border border-rose-500/20 text-rose-500/70 hover:text-rose-400 hover:border-rose-500/40 transition text-sm font-semibold">
          <Trash2 size={14}/> Borrar historial de {profileName}
        </button>
      ) : (
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4">
          <p className="text-xs text-rose-400 font-semibold text-center mb-4">
            {profile?.pin ? "Ingresá tu PIN para confirmar el borrado" : "¿Estás seguro? Esto no se puede deshacer."}
          </p>
          {profile?.pin ? (
            <PinInput label="PIN para confirmar" onComplete={handleDeleteConfirm} error={deleteError}
              onCancel={()=>setShowDeletePin(false)}/>
          ) : (
            <div className="flex gap-2">
              <button onClick={()=>setShowDeletePin(false)} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-semibold">Cancelar</button>
              <button onClick={onDelete} className="flex-1 py-3 rounded-xl bg-rose-500 text-white text-sm font-bold hover:bg-rose-400 transition">Borrar todo</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   WIZARD DE PRIMERAS MARCAS
───────────────────────────────────────────────────────────────────────── */
function MaxSetupWizard({ logs, setLogs, onDone }) {
  const allSets = DAY_ORDER.flatMap(dk =>
    ROUTINE[dk].exercises.flatMap((ex,ei) =>
      ex.sets.map((s,si) => ({dayKey:dk,dayColor:ROUTINE[dk].color,dayLabel:ROUTINE[dk].label,ex,setIndex:si,s,key:`${ex.id}_${si}`}))
    )
  );

  const [step, setStep] = useState(0);
  const [values, setValues] = useState({});
  const current = allSets[step];

  const handleNext = () => {
    const v = values[current.key];
    if (v?.kg && v?.reps) {
      const newLogs = {...logs, [current.key]: [{date:"2024-01-01",reps:parseFloat(v.reps),kg:parseFloat(v.kg)}]};
      setLogs(newLogs);
    }
    if (step >= allSets.length-1) onDone();
    else setStep(s=>s+1);
  };

  const pct = Math.round((step/allSets.length)*100);

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col px-4 py-8">
      <div className="max-w-sm mx-auto w-full flex-1 flex flex-col">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">Establecer marcas iniciales</h2>
            <span className="text-xs text-slate-500">{step+1} / {allSets.length}</span>
          </div>
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-300" style={{width:`${pct}%`}}/>
          </div>
          <p className="text-[10px] text-slate-600 mt-1.5">Podés saltear ejercicios que no hayas hecho</p>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-5 flex-1 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg mb-3 inline-block"
              style={{backgroundColor:current.dayColor+"18",color:current.dayColor}}>
              {current.dayLabel}
            </span>
            <h3 className="text-xl font-black text-white mt-2">{current.ex.name}</h3>
            <p className="text-sm text-slate-500 mt-1">{current.ex.muscle}</p>
            <p className="text-xs text-slate-600 mt-3 italic">"{current.ex.nota}"</p>

            <div className="mt-6">
              <p className="text-xs font-semibold text-slate-400 mb-3">Serie {current.setIndex+1} · {current.s.repRange} reps</p>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] text-slate-600 uppercase tracking-wider font-bold mb-1.5 block">Tu mejor Reps</label>
                  <input type="number" inputMode="decimal" placeholder="—"
                    value={values[current.key]?.reps||""}
                    onChange={e=>setValues(v=>({...v,[current.key]:{...v[current.key],reps:e.target.value}}))}
                    className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-4 text-2xl font-black text-center text-white focus:outline-none focus:border-orange-500/50 transition"/>
                </div>
                <div className="text-slate-700 text-xl pb-2 flex items-end">×</div>
                <div className="flex-1">
                  <label className="text-[10px] text-slate-600 uppercase tracking-wider font-bold mb-1.5 block">Tu mejor Kg</label>
                  <input type="number" inputMode="decimal" placeholder="—"
                    value={values[current.key]?.kg||""}
                    onChange={e=>setValues(v=>({...v,[current.key]:{...v[current.key],kg:e.target.value}}))}
                    className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-4 text-2xl font-black text-center text-white focus:outline-none focus:border-orange-500/50 transition"/>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <button onClick={()=>{ if(step<allSets.length-1)setStep(s=>s+1); else onDone(); }}
              className="py-3.5 px-4 rounded-2xl border border-slate-700 text-slate-400 text-sm font-semibold hover:border-slate-500 transition">
              Saltear
            </button>
            <button onClick={handleNext}
              className="flex-1 py-3.5 rounded-2xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-400 active:scale-[0.98] transition-all">
              {step<allSets.length-1 ? "Siguiente →" : "Listo ✓"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   BOTTOM TAB BAR
───────────────────────────────────────────────────────────────────────── */
function BottomBar({ tab, setTab, profileName }) {
  const initial = profileName.charAt(0).toUpperCase();
  const tabs = [
    {key:"rutina",icon:<Dumbbell size={22}/>,label:"Rutina"},
    {key:"progreso",icon:<BarChart3 size={22}/>,label:"Progreso"},
    {key:"descarga",icon:<Zap size={22}/>,label:"Descarga"},
    {key:"perfil",icon:(
      <div className="w-7 h-7 rounded-xl flex items-center justify-center text-sm font-black text-white"
        style={{background: tab==="perfil"?"linear-gradient(135deg,#F97316,#DC2626)":"transparent",
          border: tab==="perfil"?"none":"2px solid #334155",color:tab==="perfil"?"white":"#6B7280"}}>
        {initial}
      </div>
    ),label:profileName},
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/50">
      <div className="max-w-xl mx-auto flex">
        {tabs.map(({key,icon,label})=>(
          <button key={key} onClick={()=>setTab(key)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-all active:scale-95">
            <span className={`transition-all ${tab===key&&key!=="perfil" ? "text-orange-400" : key==="descarga"&&tab===key?"text-purple-400":"text-slate-600"}`}>
              {icon}
            </span>
            <span className={`text-[9px] font-bold uppercase tracking-wider transition-all ${
              tab===key
                ? key==="descarga"?"text-purple-400":key==="perfil"?"text-orange-400":"text-orange-400"
                : "text-slate-700"
            }`}>
              {label.length>8?label.slice(0,7)+"…":label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   APP PRINCIPAL
───────────────────────────────────────────────────────────────────────── */
export default function App() {
  const [profiles, setProfiles] = useState(loadProfiles);
  const [activeProfile, setActiveProfile] = useState(null);
  const [tab, setTab] = useState("rutina");
  const [cycleStart, setCycleStartState] = useState(loadCycleStart);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    const saved = loadActive();
    if (saved && profiles[saved]) {
      if (!profiles[saved].pin) {
        setActiveProfile(saved);
        if (!profiles[saved].maxesSetup) setShowWizard(true);
      }
    }
  }, []);

  const profile = profiles[activeProfile];
  const logs = profile?.logs || {};

  const setLogs = useCallback((newLogs) => {
    const np = {...profiles, [activeProfile]: {...profiles[activeProfile], logs: newLogs}};
    setProfiles(np);
    saveProfiles(np);
  }, [profiles, activeProfile]);

  const handleLogin = (name, updatedProfiles) => {
    const profs = updatedProfiles || profiles;
    setProfiles(profs);
    setActiveProfile(name);
    if (!profs[name]?.maxesSetup) setShowWizard(true);
  };

  const handleLogout = () => { saveActive(null); setActiveProfile(null); setShowWizard(false); };

  const handleDelete = () => {
    const np = {...profiles, [activeProfile]: {...profiles[activeProfile], logs: {}, maxesSetup: false}};
    setProfiles(np);
    saveProfiles(np);
  };

  const handleUpdateProfile = (updates) => {
    const np = {...profiles, [activeProfile]: {...profiles[activeProfile], ...updates}};
    setProfiles(np);
    saveProfiles(np);
  };

  const handleSetCycleStart = (d) => {
    setCycleStartState(d);
    saveCycleStart(d);
  };

  const handleWizardDone = () => {
    const np = {...profiles, [activeProfile]: {...profiles[activeProfile], maxesSetup: true}};
    setProfiles(np);
    saveProfiles(np);
    setShowWizard(false);
  };

  if (!activeProfile) return <LoginScreen onLogin={handleLogin}/>;

  if (showWizard) return (
    <MaxSetupWizard logs={logs} setLogs={(nl)=>{setLogs(nl);}} onDone={handleWizardDone}/>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans">
      {/* HEADER */}
      <header className="sticky top-0 z-10 bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-slate-800/40">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base font-black text-white shrink-0"
            style={{background:"linear-gradient(135deg,#F97316,#DC2626)"}}>
            {activeProfile.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-black text-base text-white leading-tight tracking-tight">
              {tab==="rutina"&&"Rutina"}
              {tab==="progreso"&&"Progreso"}
              {tab==="descarga"&&"Semana de Descarga"}
              {tab==="perfil"&&"Perfil"}
            </h1>
            <p className="text-[11px] text-slate-600 leading-tight">{activeProfile}</p>
          </div>
          <div className="w-8 h-8 rounded-xl bg-orange-500/15 flex items-center justify-center">
            <Flame size={16} className="text-orange-500"/>
          </div>
        </div>
      </header>

      {/* CONTENIDO */}
      <main className="max-w-xl mx-auto px-4 py-4 pb-28 space-y-4">
        {tab==="rutina"&&<RoutineView logs={logs} setLogs={setLogs} cycleStart={cycleStart}/>}
        {tab==="progreso"&&<ProgressView logs={logs}/>}
        {tab==="descarga"&&<DeloadView logs={logs}/>}
        {tab==="perfil"&&(
          <ProfileView
            profileName={activeProfile}
            profiles={profiles}
            onLogout={handleLogout}
            onDelete={handleDelete}
            onUpdateProfile={handleUpdateProfile}
            cycleStart={cycleStart}
            onSetCycleStart={handleSetCycleStart}
          />
        )}
      </main>

      <BottomBar tab={tab} setTab={setTab} profileName={activeProfile}/>
    </div>
  );
}
