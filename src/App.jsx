import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  Play, Pause, RotateCcw, TrendingUp, TrendingDown, Dumbbell,
  ChevronDown, ChevronUp, Trophy, Flame, Save, Trash2, BarChart3,
  ListChecks, LogOut, X, Check, AlertTriangle, Calendar, Zap,
  Mail, Clock, User, ChevronRight, Edit3, Info, SkipForward,
  Target, Award, Activity, ArrowUp, ArrowDown, Minus,
} from "lucide-react";

const REST_LONG = 300;
const REST_SHORT = 180;
const TRAIN_WEEKS = 7;
const DELOAD_WEEKS = 1;
const CYCLE_WEEKS = TRAIN_WEEKS + DELOAD_WEEKS;
const yt = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

const ROUTINE = {
  push: {
    label: "PUSH", description: "Pecho · Hombro anterior · Tríceps",
    color: "#14B8A6", grad: "from-teal-500/20 to-transparent",
    exercises: [
      { id:"press_banca", name:"Press Banca", muscle:"Pectoral", nota:"Hacer fuerza con las piernas.", video: yt("press banca técnica correcta"), sets:[{repRange:"3-5",pr:null,heavy:true},{repRange:"3-5",pr:null,heavy:true},{repRange:"8-10",pr:null}] },
      { id:"press_inclinado_smith", name:"Press Inclinado Smith", muscle:"Pectoral sup.", nota:"Codos bastante pegados.", video: yt("press inclinado smith técnica"), sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
      { id:"cruce_poleas", name:"Cruce de Poleas", muscle:"Pectoral", nota:"Énfasis en el estiramiento.", video: yt("cruce de poleas técnica pectoral"), sets:[{repRange:"10-12",pr:null},{repRange:"10-12",pr:null}] },
      { id:"vuelos_laterales_mancuerna", name:"Vuelos Laterales Mancuerna", muscle:"Deltoides lateral", nota:"Levantar un poco para adelante.", video: yt("vuelos laterales mancuerna técnica deltoides"), sets:[{repRange:"12-15",pr:null},{repRange:"12-15",pr:null},{repRange:"12-15",pr:null},{repRange:"12-15",pr:null}] },
      { id:"pec_dec_deltoides_push", name:"Pec Dec para Deltoides", muscle:"Deltoides post.", nota:"Unilateral.", video: yt("pec dec deltoides posterior técnica"), sets:[{repRange:"12-15",pr:null},{repRange:"12-15",pr:null}] },
      { id:"triceps_trasnuca_push", name:"Tríceps Trasnuca", muscle:"Tríceps", nota:"Pausa en el fondo, codos no van cerrados.", video: yt("triceps trasnuca técnica overhead extension"), sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
      { id:"triceps_polea_alta", name:"Tríceps Polea Alta", muscle:"Tríceps", nota:"El húmero no se mueve.", video: yt("tríceps polea alta técnica cable pushdown"), sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
    ],
  },
  pull: {
    label: "PULL", description: "Dorsal · Romboides · Bíceps",
    color: "#3B82F6", grad: "from-blue-500/20 to-transparent",
    exercises: [
      { id:"remo_ancho_maquina", name:"Remo Ancho Máquina", muscle:"Dorsal", nota:"No levantar los hombros.", video: yt("remo ancho máquina técnica espalda"), sets:[{repRange:"4-6",pr:null,heavy:true},{repRange:"4-6",pr:null,heavy:true},{repRange:"8-10",pr:null}] },
      { id:"dorsalera", name:"Dorsalera Agarre Ancho", muscle:"Dorsal", nota:"No descolocar los hombros, pulgar en la marca.", video: yt("dorsalera lat pulldown agarre ancho técnica"), sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
      { id:"remo_unilateral", name:"Remo Unilateral", muscle:"Dorsal / oblicuos", nota:"Contraer los oblicuos, codo lo más abajo posible.", video: yt("remo unilateral mancuerna técnica espalda"), sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
      { id:"pull_over", name:"Pull Over", muscle:"Dorsal / serrato", nota:"Codos siempre un poco flexionados.", video: yt("pull over espalda técnica mancuerna"), sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
      { id:"face_pull", name:"Face Pull", muscle:"Deltoides post.", nota:"Polea a la altura de los ojos.", video: yt("face pull técnica deltoides posterior"), sets:[{repRange:"15-20",pr:null},{repRange:"15-20",pr:null}] },
      { id:"biceps_alternado_mancuerna", name:"Bíceps Alternado Mancuerna", muscle:"Bíceps", nota:"Mover un poco el húmero al final.", video: yt("curl alternado mancuerna técnica bíceps"), sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null},{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
    ],
  },
  legs: {
    label: "PIERNAS", description: "Glúteo · Cuádriceps · Femoral · Aductores",
    color: "#F97316", grad: "from-orange-500/20 to-transparent", isNew: true,
    exercises: [
      { id:"sentadilla_bulgara", name:"Sentadilla Búlgara", muscle:"Glúteo", nota:"Torso ligeramente inclinado adelante.", video: yt("sentadilla búlgara técnica glúteo"), sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
      { id:"abdominales", name:"Abdominales", muscle:"Core", nota:"Controlar la excéntrica, sin impulso.", video: yt("abdominales técnica correcta core"), sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null},{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
      { id:"jaca", name:"Hack Squat", muscle:"Cuádriceps", nota:"Pies a la altura de hombros, bajar controlado.", video: yt("hack squat técnica cuádriceps"), sets:[{repRange:"4-6",pr:null,heavy:true},{repRange:"4-6",pr:null,heavy:true},{repRange:"8-10",pr:null}] },
      { id:"curl_femoral_maquina", name:"Curl Femoral Máquina", muscle:"Femoral", nota:"Controlar la fase negativa.", video: yt("curl femoral máquina técnica isquios"), sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
      { id:"extension_cuadriceps", name:"Extensión de Cuádriceps", muscle:"Cuádriceps", nota:"Pausa de 1 seg arriba.", video: yt("extensión cuádriceps máquina técnica"), sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
      { id:"aductor_maquina", name:"Aductor Máquina", muscle:"Aductores", nota:"Rango completo, sin rebotar.", video: yt("aductor máquina técnica inner thigh"), sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
      { id:"abductor_maquina", name:"Abductor Máquina", muscle:"Glúteo medio", nota:"Espalda apoyada, movimiento controlado.", video: yt("abductor máquina técnica glúteo medio"), sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
    ],
  },
  sarm: {
    label: "HOMBROS / BRAZOS", description: "Deltoides · Bíceps · Tríceps",
    color: "#A855F7", grad: "from-purple-500/20 to-transparent",
    exercises: [
      { id:"press_militar_smith", name:"Press Militar Smith", muscle:"Deltoides ant.", nota:"Codos adelante, banco 80-90°.", video: yt("press militar smith técnica hombros"), sets:[{repRange:"4-6",pr:null,heavy:true},{repRange:"4-6",pr:null,heavy:true},{repRange:"8-10",pr:null}] },
      { id:"vuelos_laterales_maquina", name:"Vuelos Laterales Máquina", muscle:"Deltoides lateral", nota:"No hacer tanta fuerza con el agarre.", video: yt("vuelos laterales máquina deltoides técnica"), sets:[{repRange:"12-15",pr:null},{repRange:"12-15",pr:null},{repRange:"12-15",pr:null},{repRange:"12-15",pr:null}] },
      { id:"pec_dec_deltoides_sarm", name:"Pec Dec Deltoides Posterior", muscle:"Deltoides post.", nota:"Unilateral.", video: yt("pec dec deltoides posterior técnica"), sets:[{repRange:"12-15",pr:null},{repRange:"12-15",pr:null}] },
      { id:"biceps_martillo", name:"Bíceps Martillo", muscle:"Bíceps / braquial", nota:"Alternado.", video: yt("curl martillo bíceps técnica hammer curl"), sets:[{repRange:"6-8",pr:null},{repRange:"6-8",pr:null},{repRange:"6-8",pr:null}] },
      { id:"biceps_banco_scott", name:"Bíceps Banco Scott", muscle:"Bíceps", nota:"Unilateral con mancuerna.", video: yt("curl banco scott técnica bíceps preacher curl"), sets:[{repRange:"6-8",pr:null},{repRange:"6-8",pr:null},{repRange:"6-8",pr:null}] },
      { id:"biceps_banco_inclinado", name:"Bíceps Banco Inclinado", muscle:"Bíceps cab. larga", nota:"Alternado, 6 puntos arriba.", video: yt("curl banco inclinado bíceps técnica incline curl"), sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
      { id:"triceps_trasnuca_sarm", name:"Tríceps Trasnuca", muscle:"Tríceps", nota:"Pausa en el fondo.", video: yt("triceps trasnuca técnica overhead extension"), sets:[{repRange:"8-10",pr:null},{repRange:"8-10",pr:null},{repRange:"8-10",pr:null}] },
    ],
  },
};
const DAY_ORDER = ["push","pull","legs","sarm"];

const KEY_TO_DAY = {};
DAY_ORDER.forEach(dk => { ROUTINE[dk].exercises.forEach(ex => { ex.sets.forEach((_,i) => { KEY_TO_DAY[`${ex.id}_${i}`] = dk; }); }); });

const DEFAULT_SETTINGS = { alertType: "sound", restLong: REST_LONG, restShort: REST_SHORT, trainWeeks: TRAIN_WEEKS, deloadWeeks: DELOAD_WEEKS, deloadPct: 0.75, deloadSetDivisor: 2 };
const STAGNATION_DAYS = 21;

function getProfileSettings(profile) { return { ...DEFAULT_SETTINGS, ...(profile?.settings || {}) }; }

const PROFILES_KEY = "gym_profiles_v2";
const ACTIVE_KEY = "gym_active_v2";
const CYCLE_START_KEY = "gym_cycle_start_v2";

function getDeviceId() {
  let id = localStorage.getItem("gym_device_id");
  if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("gym_device_id", id); }
  return id;
}
function loadProfiles() { try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || "{}"); } catch { return {}; } }
function saveProfiles(p) { try { localStorage.setItem(PROFILES_KEY, JSON.stringify(p)); } catch {} }
function loadActive() { try { return localStorage.getItem(ACTIVE_KEY) || null; } catch { return null; } }
function saveActive(n) { try { n ? localStorage.setItem(ACTIVE_KEY, n) : localStorage.removeItem(ACTIVE_KEY); } catch {} }
function loadCycleStart() { try { const raw = localStorage.getItem(CYCLE_START_KEY); return raw ? new Date(raw) : null; } catch { return null; } }
function saveCycleStart(d) { try { localStorage.setItem(CYCLE_START_KEY, d.toISOString()); } catch {} }

function todayStr() { return new Date().toISOString().slice(0,10); }
function formatTime(s) { return `${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`; }
function vol(kg,reps) { return (!kg||!reps) ? 0 : kg*reps; }
function estimate1RM(kg,reps) { return (!kg||!reps) ? 0 : Math.round(kg*(1+reps/30)*10)/10; }
function repRangeTop(repRange) { const parts = String(repRange).split("-"); return parseInt(parts[parts.length-1], 10); }

function getSuggestedDay(logs) {
  let lastDate = null;
  Object.entries(logs).forEach(([k,v]) => { if (k.endsWith("_pr_override")||!Array.isArray(v)||!KEY_TO_DAY[k]) return; v.forEach(e => { if (!lastDate||e.date>lastDate) lastDate=e.date; }); });
  if (!lastDate) return DAY_ORDER[0];
  let lastDayKey = null;
  Object.entries(logs).forEach(([k,v]) => { if (k.endsWith("_pr_override")||!Array.isArray(v)||!KEY_TO_DAY[k]) return; if (v.some(e=>e.date===lastDate)) lastDayKey=KEY_TO_DAY[k]; });
  if (!lastDayKey) return DAY_ORDER[0];
  return DAY_ORDER[(DAY_ORDER.indexOf(lastDayKey)+1) % DAY_ORDER.length];
}

function getStagnationInfo(exercise, logs) {
  let stagnant = false, maxGapDays = 0;
  exercise.sets.forEach((s,i) => {
    const key = `${exercise.id}_${i}`, hist = logs[key]||[];
    if (hist.length===0) return;
    const overrideDate = logs[`${key}_pr_override`]?.date;
    if (!overrideDate) return;
    const lastTrainedDate = hist.reduce((max,h)=>h.date>max?h.date:max, hist[0].date);
    const gapDays = Math.round((new Date(lastTrainedDate)-new Date(overrideDate))/86400000);
    if (gapDays>maxGapDays) maxGapDays=gapDays;
    if (gapDays>=STAGNATION_DAYS) stagnant=true;
  });
  return { stagnant, maxGapDays };
}

function getWeekInfo(cycleStart, settings=DEFAULT_SETTINGS) {
  if (!cycleStart) return null;
  const { trainWeeks=TRAIN_WEEKS, deloadWeeks=DELOAD_WEEKS } = settings;
  const cycleWeeks = trainWeeks+deloadWeeks;
  const diffDays = Math.floor((new Date()-cycleStart)/86400000);
  const totalWeek = Math.floor(diffDays/7);
  const weekInCycle = (totalWeek%cycleWeeks)+1;
  const isDeload = weekInCycle>trainWeeks;
  return { totalWeek:totalWeek+1, weekInCycle, isDeload, cycleNumber:Math.floor(totalWeek/cycleWeeks)+1, cycleWeeks, trainWeeks, deloadWeeks };
}

function PinInput({ length=4, onComplete, label="Ingresá tu PIN", error, onCancel }) {
  const [digits, setDigits] = useState([]);
  const inputRef = useRef();
  useEffect(() => { inputRef.current?.focus(); }, []);
  const tap = (n) => {
    if (digits.length>=length) return;
    const next = [...digits, String(n)];
    setDigits(next);
    if (next.length===length) setTimeout(()=>onComplete(next.join("")), 80);
  };
  const del = () => setDigits(d=>d.slice(0,-1));
  const handleKey = (e) => {
    if (e.key>="0"&&e.key<="9"&&digits.length<length) { const next=[...digits,e.key]; setDigits(next); if(next.length===length) setTimeout(()=>onComplete(next.join("")),80); }
    else if (e.key==="Backspace") setDigits(d=>d.slice(0,-1));
  };
  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <p className="text-sm text-slate-400 font-medium tracking-wide">{label}</p>
      <div className="flex gap-4">
        {Array.from({length}).map((_,i)=>(
          <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${i<digits.length?"bg-teal-500 border-teal-500 scale-110 shadow-[0_0_12px_-1px_rgba(20,184,166,0.7)]":"border-slate-600 bg-transparent"}`}/>
        ))}
      </div>
      {error && <p className="text-rose-400 text-xs font-medium animate-pulse">{error}</p>}
      <div className="grid grid-cols-3 gap-3 w-64">
        {[1,2,3,4,5,6,7,8,9].map(n=>(
          <button key={n} onClick={()=>tap(n)} className="h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-xl font-semibold text-slate-100 transition-all">{n}</button>
        ))}
        {onCancel?<button onClick={onCancel} className="h-16 rounded-2xl text-slate-500 hover:text-slate-300 text-sm font-medium">Cancelar</button>:<div/>}
        <button onClick={()=>tap(0)} className="h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-xl font-semibold text-slate-100 transition-all">0</button>
        <button onClick={del} className="h-16 rounded-2xl text-slate-400 hover:text-slate-200 active:scale-95 transition-all flex items-center justify-center">⌫</button>
      </div>
      <input ref={inputRef} className="sr-only" onKeyDown={handleKey} readOnly/>
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [profiles, setProfilesState] = useState(loadProfiles);
  const [phase, setPhase] = useState("list");
  const [pendingProfile, setPendingProfile] = useState(null);
  const [pinError, setPinError] = useState("");
  const [regName, setRegName] = useState(""); const [regMail, setRegMail] = useState(""); const [regPin, setRegPin] = useState("");
  const [regStep, setRegStep] = useState(1); const [regError, setRegError] = useState("");
  const deviceId = getDeviceId();
  const profileList = Object.keys(profiles);
  const deviceProfile = profileList.find(n=>profiles[n].deviceId===deviceId);

  const tryLogin = (name) => { const p=profiles[name]; if(p.pin){setPendingProfile(name);setPhase("pin");}else{saveActive(name);onLogin(name,profiles);} };
  const handlePinLogin = (entered) => {
    if (entered===profiles[pendingProfile].pin) { saveActive(pendingProfile); onLogin(pendingProfile,profiles); }
    else { setPinError("PIN incorrecto."); setTimeout(()=>setPinError(""),1500); }
  };
  const finishRegister = () => {
    const name=regName.trim();
    const newProfiles={...profiles,[name]:{pin:regPin||null,logs:{},email:regMail||null,joinedAt:new Date().toISOString(),deviceId,maxesSetup:false}};
    saveProfiles(newProfiles); setProfilesState(newProfiles); saveActive(name); onLogin(name,newProfiles);
  };
  const handleRegister = () => {
    setRegError("");
    if (!regName.trim()){setRegError("Ingresá tu nombre.");return;}
    if (profiles[regName.trim()]){setRegError("Ya existe ese nombre.");return;}
    if (regMail&&!regMail.includes("@")){setRegError("Email inválido.");return;}
    if (regStep===1){setRegStep(2);return;}
    if (regStep===2){if(regPin.length>0&&regPin.length<4){setRegError("El PIN debe tener 4 dígitos.");return;}if(regPin.length===0){finishRegister();return;}setRegStep(3);return;}
    if (regStep===3){finishRegister();}
  };
  useEffect(()=>{ if(deviceProfile&&!profiles[deviceProfile].pin){saveActive(deviceProfile);onLogin(deviceProfile,profiles);} },[]);

  if (phase==="pin") return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-teal-500/10 blur-3xl pointer-events-none"/>
      <div className="w-full max-w-xs relative">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-teal-500/15 flex items-center justify-center mb-3"><Flame className="text-teal-500" size={28}/></div>
          <h2 className="text-xl font-bold text-white">{pendingProfile}</h2>
        </div>
        <PinInput label="Ingresá tu PIN" onComplete={handlePinLogin} error={pinError} onCancel={()=>{setPhase("list");setPendingProfile(null);setPinError("");}}/>
      </div>
    </div>
  );

  if (phase==="register") return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-teal-500/10 blur-3xl pointer-events-none"/>
      <div className="w-full max-w-sm relative">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={()=>{setPhase("list");setRegStep(1);setRegError("");}} className="text-slate-500 hover:text-slate-300"><ChevronDown size={20} className="rotate-90"/></button>
          <h2 className="text-lg font-bold text-white">Crear perfil</h2>
        </div>
        <div className="flex gap-1.5 mb-6">{[1,2,3].map(s=><div key={s} className={`h-1 flex-1 rounded-full transition-all ${regStep>=s?"bg-teal-500":"bg-slate-800"}`}/>)}</div>
        <div className="space-y-4">
          {regStep===1&&(<>
            <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Nombre</label><input type="text" placeholder="¿Cómo te llamás?" value={regName} onChange={e=>setRegName(e.target.value)} className="w-full bg-slate-900/80 border border-slate-700/50 rounded-2xl px-4 py-3.5 text-white focus:outline-none focus:border-teal-500/60 text-sm transition" autoFocus/></div>
            <div><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Email <span className="text-slate-600 normal-case">(opcional)</span></label><input type="email" placeholder="tu@email.com" value={regMail} onChange={e=>setRegMail(e.target.value)} className="w-full bg-slate-900/80 border border-slate-700/50 rounded-2xl px-4 py-3.5 text-white focus:outline-none focus:border-teal-500/60 text-sm transition"/></div>
          </>)}
          {regStep===2&&(<div className="text-center py-4"><p className="text-slate-400 text-sm mb-6">¿Querés proteger tu perfil con un PIN?</p><div className="flex gap-3 justify-center"><button onClick={()=>{setRegPin("");finishRegister();}} className="flex-1 py-3.5 rounded-2xl border border-slate-700 text-slate-400 text-sm font-semibold">Sin PIN</button><button onClick={()=>setRegStep(2.5)} className="flex-1 py-3.5 rounded-2xl bg-teal-500 text-white text-sm font-bold">Con PIN</button></div></div>)}
          {regStep===2.5&&<PinInput length={4} label="Elegí un PIN" onComplete={(p)=>{setRegPin(p);setRegStep(3);}}/>}
          {regStep===3&&<PinInput length={4} label="Confirmá el PIN" onComplete={(p)=>{if(p===regPin){finishRegister();}else{setRegError("No coinciden.");setTimeout(()=>setRegError(""),1500);}}} error={regError}/>}
        </div>
        {regError&&regStep===1&&<p className="text-rose-400 text-xs mt-3 text-center">{regError}</p>}
        {regStep===1&&<button onClick={handleRegister} className="w-full mt-6 py-4 rounded-2xl bg-teal-500 text-white font-bold text-sm hover:bg-teal-400 active:scale-[0.98] transition-all shadow-lg shadow-teal-500/20">Continuar →</button>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-teal-500/10 blur-3xl pointer-events-none"/>
      <div className="w-full max-w-sm relative">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-teal-500/30 to-teal-500/5 border border-teal-500/20 flex items-center justify-center mb-4 shadow-[0_0_40px_-10px_rgba(20,184,166,0.55)]"><Flame className="text-teal-500" size={30}/></div>
          <h1 className="text-2xl font-black text-white tracking-tight">Mi Rutina</h1>
          <p className="text-slate-500 text-sm mt-1">Seguimiento de cargas y progreso</p>
        </div>
        {profileList.length>0&&(<div className="mb-5"><p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-3">Perfiles</p><div className="space-y-2">{profileList.map(name=>(
          <button key={name} onClick={()=>tryLogin(name)} className="w-full flex items-center gap-3.5 bg-slate-900/60 border border-slate-800/60 hover:border-teal-500/30 rounded-2xl px-4 py-3.5 transition-all active:scale-[0.98] text-left group">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black shrink-0" style={{background:"linear-gradient(135deg,#14B8A6,#0E7490)",color:"white"}}>{name.charAt(0).toUpperCase()}</div>
            <div className="flex-1 min-w-0"><p className="text-white font-semibold text-sm">{name}</p><p className="text-[11px] text-slate-500">{profiles[name].pin?"🔒 Con PIN":"Sin PIN"} · {profiles[name].deviceId===deviceId?"Este dispositivo":"Otro dispositivo"}</p></div>
            <ChevronRight size={16} className="text-slate-600 group-hover:text-teal-400 transition shrink-0"/>
          </button>
        ))}</div></div>)}
        <button onClick={()=>setPhase("register")} className="w-full py-4 rounded-2xl border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-teal-500/40 transition-all text-sm font-semibold flex items-center justify-center gap-2">+ Crear perfil nuevo</button>
      </div>
    </div>
  );
}

function RestTimer({ seconds, accent, alertType="sound" }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  const ref = useRef();
  useEffect(()=>{setRemaining(seconds);setRunning(false);},[seconds]);
  useEffect(()=>{
    if(running){ref.current=setInterval(()=>{setRemaining(r=>{if(r<=1){clearInterval(ref.current);setRunning(false);if(alertType!=="vibration"){try{const a=new AudioContext();[0,220].forEach(d=>setTimeout(()=>{const o=a.createOscillator(),g=a.createGain();o.frequency.value=880;o.connect(g);g.connect(a.destination);g.gain.value=0.2;o.start();setTimeout(()=>o.stop(),280);},d));}catch{}}if(alertType!=="sound"){try{navigator.vibrate?.([250,120,250,120,250]);}catch{}}return 0;}return r-1;});},1000);}
    return ()=>clearInterval(ref.current);
  },[running,alertType]);
  const pct=Math.max(0,Math.min(100,(remaining/seconds)*100)), r=16, circ=2*Math.PI*r;
  return (
    <div className="flex items-center gap-3 bg-slate-900/60 rounded-2xl px-4 py-3 border border-slate-800/60">
      <div className="relative w-12 h-12 shrink-0">
        <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
          <circle cx="18" cy="18" r={r} fill="none" stroke="#1a1a2e" strokeWidth="3"/>
          <circle cx="18" cy="18" r={r} fill="none" stroke={accent} strokeWidth="3" strokeDasharray={circ} strokeDashoffset={circ*(1-pct/100)} strokeLinecap="round" style={{transition:"stroke-dashoffset 0.3s linear"}}/>
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-200">{formatTime(remaining)}</span>
      </div>
      <div className="flex gap-2">
        <button onClick={()=>setRunning(r=>!r)} className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 transition text-slate-200">{running?<Pause size={16}/>:<Play size={16}/>}</button>
        <button onClick={()=>{setRunning(false);setRemaining(seconds);}} className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 transition text-slate-200"><RotateCcw size={16}/></button>
      </div>
      <span className="text-xs text-slate-500">{formatTime(seconds)} descanso</span>
    </div>
  );
}

function SetRow({ exerciseId, setIndex, setDef, accent, logs, setLogs, deloadKgFactor=1, deloadMode=false, resetKey=0 }) {
  const key=`${exerciseId}_${setIndex}`, prKey=`${key}_pr_override`, today=todayStr();
  const history=logs[key]||[], override=logs[prKey];
  const computedPR=useMemo(()=>{let best=setDef.pr?{...setDef.pr}:null;history.forEach(h=>{if(!best||vol(h.kg,h.reps)>vol(best.kg,best.reps))best={kg:h.kg,reps:h.reps};});return best;},[history,setDef.pr]);
  const currentPR=override||computedPR;
  const suggestedKg=currentPR&&deloadMode?Math.round(currentPR.kg*deloadKgFactor*2)/2:null;
  const [reps,setReps]=useState(""); const [kg,setKg]=useState(""); const [feedback,setFeedback]=useState(null);
  const [editingPR,setEditingPR]=useState(false); const [editReps,setEditReps]=useState(""); const [editKg,setEditKg]=useState(""); const [saved,setSaved]=useState(false);
  useEffect(()=>{setReps("");setKg("");setFeedback(null);setSaved(false);},[resetKey]);
  const handleSave=()=>{
    const r=parseFloat(reps),k=parseFloat(kg);
    if(!r||!k||isNaN(r)||isNaN(k)){setFeedback({type:"error",msg:"Completá reps y kg."});return;}
    const prevVol=currentPR?vol(currentPR.kg,currentPR.reps):0, newVol=vol(k,r);
    const newHistory=[...history.filter(h=>h.date!==today),{date:today,reps:r,kg:k}];
    let newLogs={...logs,[key]:newHistory};
    if(!currentPR||newVol>prevVol) newLogs={...newLogs,[prKey]:{kg:k,reps:r,date:today}};
    setLogs(newLogs); setSaved(true); setTimeout(()=>setSaved(false),1200);
    const suggestUp=r>repRangeTop(setDef.repRange);
    if(!currentPR||newVol>prevVol) setFeedback({type:"pr",msg:"¡Nueva marca! 🔥",suggestUp});
    else if(newVol===prevVol) setFeedback({type:"tie",msg:"Igualaste tu marca 💪",suggestUp:false});
    else setFeedback({type:"down",msg:`-${(((prevVol-newVol)/prevVol)*100).toFixed(0)}% vs récord`,suggestUp:false});
  };
  const savePR=()=>{const r=parseFloat(editReps),k=parseFloat(editKg);if(!r||!k||isNaN(r)||isNaN(k))return;setLogs({...logs,[prKey]:{kg:k,reps:r}});setEditingPR(false);};
  return (
    <div className="py-3 border-b border-slate-800/50 last:border-0">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">S{setIndex+1}</span>
          <span className="text-[10px] bg-slate-800/80 text-slate-500 rounded-lg px-2 py-0.5">{setDef.repRange} reps</span>
          {setDef.heavy&&<span className="text-[10px] bg-amber-500/15 text-amber-400 rounded-lg px-2 py-0.5 font-bold">FUERZA</span>}
        </div>
        {feedback&&<span className={`text-xs font-semibold ${feedback.type==="pr"?"text-emerald-400":feedback.type==="down"?"text-rose-400":"text-amber-400"}`}>{feedback.msg}</span>}
      </div>
      {feedback?.suggestUp&&<div className="mb-2.5 -mt-1 text-[11px] text-teal-400 flex items-center gap-1.5"><TrendingUp size={11}/> Superaste el rango · probá +2.5kg la próxima</div>}
      {deloadMode&&suggestedKg&&<div className="mb-2 text-[11px] text-purple-400 flex items-center gap-1.5"><Zap size={11}/> Descarga: {suggestedKg} kg sugerido ({Math.round(deloadKgFactor*100)}%)</div>}
      <div className="flex items-end gap-2">
        <div className="flex-1"><label className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider mb-1.5 block">Reps</label><input type="number" inputMode="decimal" placeholder="—" value={reps} onChange={e=>setReps(e.target.value)} className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-3.5 text-xl font-black text-center text-white focus:outline-none focus:border-teal-500/50 transition"/></div>
        <div className="text-slate-700 text-lg pb-3">×</div>
        <div className="flex-1"><label className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider mb-1.5 block">Kg</label><input type="number" inputMode="decimal" placeholder="—" value={kg} onChange={e=>setKg(e.target.value)} className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-3.5 text-xl font-black text-center text-white focus:outline-none focus:border-teal-500/50 transition"/></div>
        <button onClick={handleSave} className={`p-3.5 rounded-xl transition-all active:scale-95 font-bold text-white flex items-center justify-center ${saved?"bg-emerald-500":"hover:opacity-90"}`} style={!saved?{backgroundColor:accent}:{}}>{saved?<Check size={18}/>:<Save size={18}/>}</button>
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          {currentPR?<span className="text-[11px] text-slate-600">Récord: <span className="text-slate-300 font-bold">{currentPR.reps}×{currentPR.kg}kg</span>{override&&<span className="text-amber-500 ml-1">✎</span>}</span>:<span className="text-[11px] text-slate-700">Sin marca aún</span>}
          <button onClick={()=>{setEditReps(currentPR?.reps??"");setEditKg(currentPR?.kg??"");setEditingPR(e=>!e);}} className="text-slate-700 hover:text-slate-400 text-xs">✏️</button>
        </div>
      </div>
      {editingPR&&(
        <div className="mt-2 bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2">
          <p className="text-[11px] text-slate-500">Corregir récord:</p>
          <div className="flex flex-wrap gap-2 items-center">
            <input type="number" inputMode="decimal" placeholder="Reps" value={editReps} onChange={e=>setEditReps(e.target.value)} className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white"/>
            <span className="text-slate-600 text-xs">reps ×</span>
            <input type="number" inputMode="decimal" placeholder="Kg" value={editKg} onChange={e=>setEditKg(e.target.value)} className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white"/>
            <span className="text-slate-600 text-xs">kg</span>
            <button onClick={savePR} className="px-3 py-1.5 rounded-lg text-white text-xs font-bold" style={{backgroundColor:accent}}>Guardar</button>
            {override&&<button onClick={()=>{const l={...logs};delete l[prKey];setLogs(l);setEditingPR(false);}} className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 text-xs">Quitar</button>}
            <button onClick={()=>setEditingPR(false)} className="text-slate-500 text-xs">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExerciseCard({ exercise, accent, logs, setLogs, deloadSets, deloadMode, resetKey=0, settings=DEFAULT_SETTINGS }) {
  const [open,setOpen]=useState(false);
  const hasHeavy=exercise.sets.some(s=>s.heavy);
  const setsToShow=deloadSets?exercise.sets.slice(0,deloadSets):exercise.sets;
  const {stagnant}=useMemo(()=>getStagnationInfo(exercise,logs),[exercise,logs]);
  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-md shadow-black/20">
      <button onClick={()=>setOpen(o=>!o)} className="w-full flex items-center justify-between px-4 py-4 hover:bg-slate-800/30 active:bg-slate-800/50 transition text-left">
        <div className="flex items-center gap-3">
          <div className="w-2 h-8 rounded-full" style={{backgroundColor:accent,boxShadow:`0 0 10px -2px ${accent}`}}/>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-white text-sm">{exercise.name}</h3>
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-lg font-bold" style={{backgroundColor:accent+"18",color:accent}}>{exercise.muscle}</span>
              {deloadMode&&<span className="text-[10px] bg-purple-500/15 text-purple-400 rounded-lg px-1.5 py-0.5 font-bold">DESCARGA</span>}
              {!deloadMode&&stagnant&&<span className="text-[10px] bg-rose-500/15 text-rose-400 rounded-lg px-1.5 py-0.5 font-bold flex items-center gap-1"><AlertTriangle size={9}/> ESTANCADO</span>}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">{exercise.nota}</p>
          </div>
        </div>
        {open?<ChevronUp size={18} className="text-slate-600 shrink-0"/>:<ChevronDown size={18} className="text-slate-600 shrink-0"/>}
      </button>
      {open&&(
        <div className="px-4 pb-4 pt-0">
          {!deloadMode&&stagnant&&<div className="mb-3 text-[11px] text-rose-400/90 bg-rose-500/5 border border-rose-500/15 rounded-xl px-3 py-2 flex items-start gap-1.5"><Info size={12} className="mt-0.5 shrink-0"/><span>Hace {STAGNATION_DAYS}+ días sin superar el récord. Considerá cambiar reps, descanso o variante.</span></div>}
          {setsToShow.map((s,i)=><SetRow key={i} exerciseId={exercise.id} setIndex={i} setDef={s} accent={accent} logs={logs} setLogs={setLogs} deloadKgFactor={settings.deloadPct} deloadMode={deloadMode} resetKey={resetKey}/>)}
          <div className="flex flex-col gap-2 pt-3">
            <RestTimer seconds={hasHeavy?settings.restLong:settings.restShort} accent={accent} alertType={settings.alertType}/>
            <a href={exercise.video} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-800 text-slate-400 hover:border-slate-600 hover:text-white transition text-sm font-medium">▶ Ver técnica en YouTube</a>
          </div>
        </div>
      )}
    </div>
  );
}

function DaySummary({ dayKey, logs, onResetDay }) {
  const day=ROUTINE[dayKey], today=todayStr();
  let totalSets=0,doneToday=0,prsToday=0;
  day.exercises.forEach(ex=>{ex.sets.forEach((s,i)=>{totalSets++;const h=logs[`${ex.id}_${i}`]||[],t=h.find(x=>x.date===today);if(t){doneToday++;let best=s.pr?{...s.pr}:null;const ov=logs[`${ex.id}_${i}_pr_override`];if(ov)best=ov;else h.filter(x=>x.date!==today).forEach(x=>{if(!best||vol(x.kg,x.reps)>vol(best.kg,best.reps))best=x;});if(!best||vol(t.kg,t.reps)>vol(best.kg,best.reps))prsToday++;}});});
  const pct=totalSets?Math.round((doneToday/totalSets)*100):0;
  const [confirmReset,setConfirmReset]=useState(false);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {[{val:`${pct}%`,label:"Completado",icon:<ListChecks size={12}/>,color:"text-white"},{val:prsToday,label:"Marcas hoy",icon:<Trophy size={12}/>,color:"text-amber-400"},{val:day.exercises.length,label:"Ejercicios",icon:<Dumbbell size={12}/>,color:"text-white"}].map(({val,label,icon,color})=>(
          <div key={label} className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-3 text-center backdrop-blur-sm"><p className={`text-2xl font-black ${color}`}>{val}</p><p className="text-[10px] text-slate-600 flex items-center justify-center gap-1 mt-0.5">{icon}{label}</p></div>
        ))}
      </div>
      {!confirmReset?(<button onClick={()=>setConfirmReset(true)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-800/60 text-slate-600 hover:text-slate-400 transition text-xs font-medium"><RotateCcw size={12}/> Resetear sesión de hoy</button>):(
        <div className="flex gap-2 items-center bg-slate-900/60 border border-slate-700/50 rounded-xl px-3 py-2">
          <p className="text-xs text-slate-400 flex-1">¿Borrar reps/kg de hoy? Los récords no cambian.</p>
          <button onClick={()=>setConfirmReset(false)} className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs">No</button>
          <button onClick={()=>{onResetDay();setConfirmReset(false);}} className="px-2.5 py-1.5 rounded-lg bg-rose-500/80 text-white text-xs font-bold">Sí</button>
        </div>
      )}
    </div>
  );
}

function WeekCalendar({ cycleStart, logs, settings=DEFAULT_SETTINGS }) {
  const weekInfo=getWeekInfo(cycleStart,settings);
  if (!cycleStart||!weekInfo) return null;
  const {cycleWeeks,trainWeeks}=weekInfo;
  const trainedDays=useMemo(()=>{const s=new Set();Object.entries(logs).forEach(([k,v])=>{if(k.endsWith("_pr_override")||!Array.isArray(v))return;v.forEach(e=>s.add(e.date));});return s;},[logs]);
  const weekDots=Array.from({length:cycleWeeks},(_,wi)=>{const ws=new Date(cycleStart);ws.setDate(ws.getDate()+wi*7);const days=Array.from({length:7},(_,di)=>{const d=new Date(ws);d.setDate(d.getDate()+di);return d.toISOString().slice(0,10);});return{week:wi+1,days,trained:days.filter(d=>trainedDays.has(d)).length,isDeload:wi+1>trainWeeks};});
  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm shadow-md shadow-black/20">
      <div className="flex items-center justify-between mb-4">
        <div><h3 className="text-sm font-bold text-white">Ciclo actual</h3><p className="text-[11px] text-slate-500">Ciclo #{weekInfo.cycleNumber} · Semana {weekInfo.weekInCycle} de {cycleWeeks}</p></div>
        <div className={`px-3 py-1.5 rounded-xl text-xs font-bold ${weekInfo.isDeload?"bg-purple-500/20 text-purple-400":"bg-teal-500/20 text-teal-400"}`}>{weekInfo.isDeload?"DESCARGA":"ENTRENAMIENTO"}</div>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {weekDots.map(({week,trained,isDeload})=>{const isCurrent=week===weekInfo.weekInCycle;return(
          <div key={week} className="flex flex-col items-center gap-1">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black transition-all ${isCurrent?"ring-2 ring-offset-2 ring-offset-slate-950":""} ${isDeload?isCurrent?"bg-purple-500 ring-purple-500 text-white":"bg-purple-500/10 text-purple-600 border border-purple-500/20":trained>0?isCurrent?"bg-teal-500 ring-teal-500 text-white":"bg-teal-500/20 text-teal-400 border border-teal-500/20":isCurrent?"bg-slate-700 ring-slate-500 text-white":"bg-slate-800/50 text-slate-700 border border-slate-800"}`}>
              {isDeload?"D":week}
            </div>
            {trained>0&&!isDeload&&<div className="flex gap-0.5">{Array.from({length:Math.min(trained,7)}).map((_,i)=><div key={i} className="w-1 h-1 rounded-full bg-teal-500/60"/>)}</div>}
          </div>
        );})}
      </div>
      <div className="flex gap-4 mt-4 text-[10px] text-slate-600">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-md bg-teal-500/20 border border-teal-500/30"/><span>Entrenamiento</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-md bg-purple-500/20 border border-purple-500/30"/><span>Descarga</span></div>
      </div>
    </div>
  );
}

function RoutineView({ logs, setLogs, cycleStart, settings }) {
  const [activeDay,setActiveDay]=useState(()=>getSuggestedDay(logs));
  const suggestedDay=useMemo(()=>getSuggestedDay(logs),[]);
  const weekInfo=getWeekInfo(cycleStart,settings), isDeload=weekInfo?.isDeload, day=ROUTINE[activeDay];
  const [resetKeys,setResetKeys]=useState({push:0,pull:0,legs:0,sarm:0});
  const getDeloadSets=(ex)=>Math.max(1,Math.ceil(ex.sets.length/settings.deloadSetDivisor));
  const handleResetDay=()=>{
    const today=todayStr(), newLogs={...logs};
    day.exercises.forEach(ex=>{ex.sets.forEach((_,i)=>{const key=`${ex.id}_${i}`;if(newLogs[key]){newLogs[key]=newLogs[key].filter(h=>h.date!==today);if(!newLogs[key].length)delete newLogs[key];}});});
    setLogs(newLogs); setResetKeys(prev=>({...prev,[activeDay]:prev[activeDay]+1}));
  };
  return (
    <div className="space-y-4">
      <WeekCalendar cycleStart={cycleStart} logs={logs} settings={settings}/>
      {isDeload&&<div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl px-4 py-3 flex items-start gap-3"><Zap size={16} className="text-purple-400 mt-0.5 shrink-0"/><div><p className="text-sm font-bold text-purple-300">Semana de descarga activa</p><p className="text-xs text-purple-500/80 mt-0.5">Series ÷{settings.deloadSetDivisor} · Cargas al {Math.round(settings.deloadPct*100)}% · Mismas repeticiones</p></div></div>}
      {activeDay===suggestedDay&&<div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-900/40 border border-slate-800/40 rounded-xl px-3 py-2"><RotateCcw size={12} className="text-slate-600 shrink-0"/><span>Según tu rotación, hoy te toca <span className="font-semibold" style={{color:day.color}}>{day.label}</span></span></div>}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {DAY_ORDER.map(k=>(
          <button key={k} onClick={()=>setActiveDay(k)} className="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-95 border"
            style={activeDay===k?{background:k==="push"?"linear-gradient(135deg,#14B8A6,#0E7490)":ROUTINE[k].color,borderColor:ROUTINE[k].color,color:"#fff",boxShadow:`0 4px 14px -4px ${ROUTINE[k].color}66`}:{borderColor:"#1e2035",color:"#475569"}}>
            {ROUTINE[k].label}
          </button>
        ))}
      </div>
      <DaySummary dayKey={activeDay} logs={logs} onResetDay={handleResetDay}/>
      <p className="text-xs text-slate-500 leading-relaxed px-1">{day.description}</p>
      {day.isNew&&<div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl px-3 py-2">🆕 Empezás a registrar tus marcas desde hoy.</div>}
      {day.exercises.map(ex=><ExerciseCard key={ex.id} exercise={ex} accent={day.color} logs={logs} setLogs={setLogs} deloadSets={isDeload?getDeloadSets(ex):null} deloadMode={isDeload} resetKey={resetKeys[activeDay]} settings={settings}/>)}
    </div>
  );
}

/* ── DELOAD VIEW — REDESIGNED ── */
function DeloadView({ logs, settings=DEFAULT_SETTINGS }) {
  const { trainWeeks, deloadWeeks, deloadPct, deloadSetDivisor } = settings;
  const pctLabel = Math.round(deloadPct*100);
  const [activeDay, setActiveDay] = useState(DAY_ORDER[0]);
  const day = ROUTINE[activeDay];

  return (
    <div className="space-y-5">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-950/60 via-slate-900/80 to-slate-900/60 p-5">
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-purple-500/15 blur-2xl pointer-events-none"/>
        <div className="absolute -bottom-4 -left-4 w-24 h-24 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none"/>
        <div className="relative">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Zap size={16} className="text-purple-400"/>
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
            {[{label:"Ciclo",val:`${trainWeeks}+${deloadWeeks}sem`},{label:"Carga",val:`${pctLabel}%`},{label:"Series",val:`÷${deloadSetDivisor}`}].map(({label,val})=>(
              <div key={label} className="bg-purple-500/10 border border-purple-500/15 rounded-xl px-3 py-2 text-center">
                <p className="text-sm font-black text-purple-200">{val}</p>
                <p className="text-[10px] text-purple-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Day tabs with exercise count */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {DAY_ORDER.map(dk => {
          const d=ROUTINE[dk], isActive=activeDay===dk;
          const withPR=d.exercises.filter(ex=>ex.sets.some((s,i)=>logs[`${ex.id}_${i}_pr_override`]||(logs[`${ex.id}_${i}`]||[]).length>0)).length;
          return (
            <button key={dk} onClick={()=>setActiveDay(dk)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-95 border shrink-0"
              style={isActive?{backgroundColor:d.color+"22",borderColor:d.color+"55",color:d.color}:{borderColor:"#1e2035",color:"#475569"}}>
              <span>{d.label}</span>
              {withPR>0&&<span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={isActive?{backgroundColor:d.color+"30",color:d.color}:{backgroundColor:"#1e2035",color:"#475569"}}>{withPR}/{d.exercises.length}</span>}
            </button>
          );
        })}
      </div>

      {/* Exercise list */}
      <div className="space-y-3">
        {day.exercises.map(ex => {
          const deloadSets=Math.max(1,Math.ceil(ex.sets.length/deloadSetDivisor));
          const bestPerSet=ex.sets.map((s,i)=>{const h=logs[`${ex.id}_${i}`]||[];let best=s.pr?{...s.pr}:null;const ov=logs[`${ex.id}_${i}_pr_override`];if(ov)best=ov;else h.forEach(e=>{if(!best||vol(e.kg,e.reps)>vol(best.kg,best.reps))best=e;});return best;});
          const hasPR=bestPerSet.some(Boolean);
          return (
            <div key={ex.id} className="bg-slate-900/50 border border-slate-800/50 rounded-2xl overflow-hidden backdrop-blur-sm">
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800/40">
                <div className="w-1.5 h-6 rounded-full shrink-0" style={{backgroundColor:day.color,boxShadow:`0 0 8px -2px ${day.color}`}}/>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-sm">{ex.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-lg font-bold" style={{backgroundColor:day.color+"18",color:day.color}}>{ex.muscle}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">{ex.sets.length} → <span className="text-purple-400 font-bold">{deloadSets} series</span> en descarga</p>
                </div>
              </div>
              <div className="px-4 py-3 space-y-2">
                {hasPR ? (
                  ex.sets.slice(0,deloadSets).map((s,i)=>{
                    const best=bestPerSet[i], deloadKg=best?Math.round(best.kg*deloadPct*2)/2:null;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-slate-600 w-5 shrink-0">S{i+1}</span>
                        <span className="text-[10px] text-slate-600 bg-slate-800/60 rounded-lg px-2 py-1 shrink-0">{s.repRange} reps</span>
                        {best?(
                          <div className="flex items-center gap-2 flex-1 justify-end">
                            <span className="text-[11px] text-slate-600 line-through">{best.reps}×{best.kg}kg</span>
                            <div className="flex items-center gap-1">
                              <ArrowDown size={10} className="text-purple-400"/>
                              <span className="text-sm font-black text-purple-300">{best.reps}×{deloadKg}kg</span>
                            </div>
                          </div>
                        ):<span className="text-[11px] text-slate-700 flex-1 text-right">Sin marca</span>}
                      </div>
                    );
                  })
                ):(
                  <div className="flex items-center gap-2 py-1">
                    <div className="w-5 h-5 rounded-lg bg-slate-800/80 flex items-center justify-center shrink-0"><Target size={11} className="text-slate-600"/></div>
                    <p className="text-[11px] text-slate-600">Registrá marcas en la rutina para ver la descarga calculada.</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-3 bg-slate-900/40 border border-slate-800/40 rounded-2xl px-4 py-3.5">
        <Info size={14} className="text-slate-600 mt-0.5 shrink-0"/>
        <p className="text-[11px] text-slate-500 leading-relaxed">La descarga reduce el estrés acumulado sin perder las adaptaciones. Mantené la técnica y el ritmo, pero no busques marcas nuevas esta semana.</p>
      </div>
    </div>
  );
}

/* ── PROGRESS VIEW — REDESIGNED ── */
const CustomTooltip = ({active,payload,label})=>{
  if(!active||!payload?.length) return null;
  return (
    <div className="bg-[#0f0f1a] border border-slate-700/60 rounded-xl px-3 py-2.5 text-xs shadow-xl shadow-black/40">
      <p className="text-slate-400 mb-1.5 font-medium">{label}</p>
      {payload.map(p=><p key={p.name} style={{color:p.color}} className="font-bold">{p.name}: {p.value}</p>)}
    </div>
  );
};

function ProgressView({ logs, setLogs }) {
  const allExercises=useMemo(()=>DAY_ORDER.flatMap(dk=>ROUTINE[dk].exercises.map(e=>({id:e.id,name:e.name,day:ROUTINE[dk].label,color:ROUTINE[dk].color,sets:e.sets.length,dayKey:dk}))),[]);

  const stats=useMemo(()=>{
    const dateSet=new Set();let totalVol=0,totalSets=0;
    Object.entries(logs).forEach(([k,v])=>{if(k.endsWith("_pr_override")||!Array.isArray(v))return;v.forEach(e=>{dateSet.add(e.date);totalVol+=vol(e.kg,e.reps);totalSets++;});});
    let streak=0,cursor=new Date();
    while(true){const d=cursor.toISOString().slice(0,10);if(dateSet.has(d)){streak++;cursor.setDate(cursor.getDate()-1);}else break;}
    return {totalVol:Math.round(totalVol),totalSets,streak,daysTrained:dateSet.size};
  },[logs]);

  const muscleVolume=useMemo(()=>{
    const map={};
    DAY_ORDER.forEach(dk=>{ROUTINE[dk].exercises.forEach(ex=>{const muscle=ex.muscle.split(" ")[0];ex.sets.forEach((s,i)=>{(logs[`${ex.id}_${i}`]||[]).forEach(e=>{map[muscle]=(map[muscle]||0)+vol(e.kg,e.reps);});});});});
    return Object.entries(map).map(([name,val])=>({name,val:Math.round(val)})).sort((a,b)=>b.val-a.val).slice(0,6);
  },[logs]);

  const [selId,setSelId]=useState(allExercises[0]?.id);
  const [selSet,setSelSet]=useState(0);
  const [metric,setMetric]=useState("peso");
  const [dayFilter,setDayFilter]=useState("all");
  const selEx=allExercises.find(e=>e.id===selId);
  const filteredExercises=dayFilter==="all"?allExercises:allExercises.filter(e=>e.dayKey===dayFilter);
  const history=(logs[`${selId}_${selSet}`]||[]).slice().sort((a,b)=>a.date>b.date?1:-1);
  const chartData=history.map(h=>({date:h.date.slice(5),kg:h.kg,reps:h.reps,vol:vol(h.kg,h.reps),e1rm:estimate1RM(h.kg,h.reps)}));

  const prBoard=useMemo(()=>{
    return allExercises.map(ex=>{
      let best1rm=0,bestKg=0,bestReps=0;
      Array.from({length:ex.sets}).forEach((_,i)=>{
        const ov=logs[`${ex.id}_${i}_pr_override`], h=logs[`${ex.id}_${i}`]||[];
        const entries=ov?[ov]:h;
        entries.forEach(e=>{const rm=estimate1RM(e.kg,e.reps);if(rm>best1rm){best1rm=rm;bestKg=e.kg;bestReps=e.reps;}});
      });
      return {...ex,best1rm,bestKg,bestReps};
    }).filter(e=>e.best1rm>0).sort((a,b)=>b.best1rm-a.best1rm).slice(0,5);
  },[logs,allExercises]);

  const dayPRcounts=useMemo(()=>{
    const counts={};
    DAY_ORDER.forEach(dk=>{let improved=0;ROUTINE[dk].exercises.forEach(ex=>{ex.sets.forEach((s,i)=>{const h=logs[`${ex.id}_${i}`]||[];if(h.length>1&&vol(h[h.length-1].kg,h[h.length-1].reps)>vol(h[0].kg,h[0].reps))improved++;});});counts[dk]=improved;});
    return counts;
  },[logs]);

  const [confirmResetProgress,setConfirmResetProgress]=useState(false);
  const [activeTab,setActiveTab]=useState("chart");

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          {val:stats.daysTrained,label:"Días entrenados",sub:"desde el inicio",accent:"#14B8A6"},
          {val:stats.streak>0?`${stats.streak}🔥`:"0",label:"Racha actual",sub:"días seguidos",accent:"#F59E0B"},
          {val:stats.totalSets,label:"Series registradas",sub:"total histórico",accent:"#14B8A6"},
          {val:stats.totalVol>999?`${(stats.totalVol/1000).toFixed(1)}k`:stats.totalVol,label:"Kg × reps",sub:"volumen total",accent:"#A855F7"},
        ].map(({val,label,sub,accent})=>(
          <div key={label} className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm shadow-md shadow-black/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 rounded-full blur-2xl opacity-20 -translate-y-4 translate-x-4" style={{backgroundColor:accent}}/>
            <p className="text-2xl font-black text-white tabular-nums leading-none relative">{val}</p>
            <p className="text-xs font-semibold text-white/80 mt-1 relative">{label}</p>
            <p className="text-[10px] text-slate-600 mt-0.5 relative">{sub}</p>
          </div>
        ))}
      </div>

      {/* Day breakdown */}
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm shadow-md shadow-black/20">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Mejoras por día</p>
        <div className="flex gap-2">
          {DAY_ORDER.map(dk=>{
            const d=ROUTINE[dk], count=dayPRcounts[dk]||0;
            return (
              <div key={dk} className="flex-1 bg-slate-800/40 rounded-xl p-2.5 text-center border border-slate-800/60">
                <div className="w-8 h-8 rounded-xl mx-auto flex items-center justify-center mb-1.5 text-[10px] font-black" style={{backgroundColor:d.color+"18",color:d.color}}>{d.label.slice(0,1)}</div>
                <p className="text-sm font-black text-white">{count}</p>
                <p className="text-[9px] text-slate-600 leading-tight mt-0.5">series<br/>mejoradas</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Analysis tabs */}
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-md shadow-black/20">
        <div className="flex border-b border-slate-800/60">
          {[{k:"chart",l:"Evolución",icon:<Activity size={13}/>},{k:"prs",l:"Top PRs",icon:<Trophy size={13}/>},{k:"muscle",l:"Por músculo",icon:<BarChart3 size={13}/>}].map(({k,l,icon})=>(
            <button key={k} onClick={()=>setActiveTab(k)} className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-all ${activeTab===k?"text-teal-400 border-b-2 border-teal-400":"text-slate-600 hover:text-slate-400"}`}>{icon}{l}</button>
          ))}
        </div>

        <div className="p-4">
          {activeTab==="chart"&&(
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500 font-semibold">Ejercicio y serie</p>
                <div className="flex bg-slate-950/60 rounded-xl p-0.5 border border-slate-800/60 shrink-0">
                  {[{k:"peso",l:"Kg"},{k:"vol",l:"Vol"},{k:"1rm",l:"1RM"}].map(opt=>(
                    <button key={opt.k} onClick={()=>setMetric(opt.k)} className={`px-2.5 py-1.5 rounded-[10px] text-[10px] font-bold transition-all ${metric===opt.k?"bg-teal-500 text-white":"text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-1.5 overflow-x-auto">
                <button onClick={()=>setDayFilter("all")} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border shrink-0 ${dayFilter==="all"?"bg-slate-700 border-slate-600 text-white":"border-slate-800 text-slate-600"}`}>Todos</button>
                {DAY_ORDER.map(dk=>(
                  <button key={dk} onClick={()=>{setDayFilter(dk);const first=allExercises.find(e=>e.dayKey===dk);if(first){setSelId(first.id);setSelSet(0);}}}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border shrink-0"
                    style={dayFilter===dk?{backgroundColor:ROUTINE[dk].color+"22",borderColor:ROUTINE[dk].color+"55",color:ROUTINE[dk].color}:{borderColor:"#1e2035",color:"#475569"}}>
                    {ROUTINE[dk].label}
                  </button>
                ))}
              </div>
              <select value={selId} onChange={e=>{setSelId(e.target.value);setSelSet(0);}} className="bg-slate-800/80 border border-slate-700/50 rounded-xl px-3 py-3 text-sm text-white w-full focus:outline-none">
                {filteredExercises.map(e=><option key={e.id} value={e.id}>{e.day} — {e.name}</option>)}
              </select>
              <div className="flex gap-2">
                {Array.from({length:selEx?.sets||1}).map((_,i)=>(
                  <button key={i} onClick={()=>setSelSet(i)} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${selSet===i?"border-teal-500/50 bg-teal-500/10 text-teal-400":"border-slate-800 text-slate-600"}`}>S{i+1}</button>
                ))}
              </div>
              {chartData.length===0?(
                <div className="text-center text-slate-600 py-10"><BarChart3 size={28} className="mx-auto mb-2.5 opacity-30"/><p className="text-sm">Sin registros para esta serie.</p><p className="text-xs mt-1 text-slate-700">Guardá series en la rutina para ver tu evolución aquí.</p></div>
              ):(
                <>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{top:5,right:0,left:-25,bottom:0}}>
                        <defs>
                          <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={selEx?.color} stopOpacity={0.35}/><stop offset="95%" stopColor={selEx?.color} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e"/>
                        <XAxis dataKey="date" stroke="#334155" fontSize={10}/>
                        <YAxis stroke="#334155" fontSize={10}/>
                        <Tooltip content={<CustomTooltip/>}/>
                        {metric==="peso"&&<Area type="monotone" dataKey="kg" stroke={selEx?.color||"#14B8A6"} fill="url(#gA)" strokeWidth={2.5} dot={{r:3,fill:selEx?.color,strokeWidth:0}} name="Kg"/>}
                        {metric==="vol"&&<Area type="monotone" dataKey="vol" stroke="#A855F7" fill="url(#gA)" strokeWidth={2.5} dot={{r:3,fill:"#A855F7",strokeWidth:0}} name="Volumen"/>}
                        {metric==="1rm"&&<Area type="monotone" dataKey="e1rm" stroke="#14B8A6" fill="url(#gA)" strokeWidth={2.5} dot={{r:3,fill:"#14B8A6",strokeWidth:0}} name="1RM est."/>}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  {chartData.length>=2&&(()=>{
                    const f=chartData[0],l=chartData[chartData.length-1];
                    const fVal=metric==="peso"?f.kg:metric==="vol"?f.vol:f.e1rm, lVal=metric==="peso"?l.kg:metric==="vol"?l.vol:l.e1rm;
                    const diff=lVal-fVal, pct=fVal?((diff/fVal)*100).toFixed(1):0, pos=diff>=0;
                    const metricLabel=metric==="peso"?"de kg":metric==="vol"?"de volumen":"de 1RM estimado";
                    return (
                      <div className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold ${pos?"bg-emerald-500/10 text-emerald-400 border border-emerald-500/15":"bg-rose-500/10 text-rose-400 border border-rose-500/15"}`}>
                        {pos?<TrendingUp size={14}/>:<TrendingDown size={14}/>}
                        <div><span className="font-black">{pos?"+":""}{pct}% {metricLabel}</span><span className="text-xs opacity-60 ml-1.5">· {chartData.length} sesiones</span></div>
                      </div>
                    );
                  })()}
                  {metric==="1rm"&&<p className="text-[10px] text-slate-600">Estimado con fórmula de Epley. Solo referencia, no un máximo real.</p>}
                </>
              )}
            </div>
          )}

          {activeTab==="prs"&&(
            <div className="space-y-2.5">
              <p className="text-xs text-slate-500">Top ejercicios por 1RM estimado</p>
              {prBoard.length===0?(
                <div className="text-center py-10 text-slate-600"><Award size={28} className="mx-auto mb-2.5 opacity-30"/><p className="text-sm">Todavía no hay marcas registradas.</p></div>
              ):(
                prBoard.map((ex,idx)=>{
                  const medals=["🥇","🥈","🥉","4","5"];
                  return (
                    <div key={ex.id} className="flex items-center gap-3 bg-slate-800/40 rounded-xl px-3.5 py-3 border border-slate-800/40">
                      <span className="text-lg shrink-0 w-7 text-center">{medals[idx]}</span>
                      <div className="flex-1 min-w-0"><p className="text-sm font-bold text-white truncate">{ex.name}</p><p className="text-[10px] font-bold" style={{color:ex.color}}>{ex.day}</p></div>
                      <div className="text-right shrink-0"><p className="text-sm font-black text-white">{ex.best1rm}<span className="text-xs text-slate-500 font-normal">kg</span></p><p className="text-[10px] text-slate-500">{ex.bestReps}×{ex.bestKg}kg</p></div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab==="muscle"&&(
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Volumen acumulado por grupo muscular</p>
              {muscleVolume.length===0?(
                <div className="text-center py-10 text-slate-600"><Dumbbell size={28} className="mx-auto mb-2.5 opacity-30"/><p className="text-sm">Sin datos todavía.</p></div>
              ):(
                muscleVolume.map(({name,val},i)=>{
                  const max=muscleVolume[0].val, pct=max?(val/max)*100:0;
                  const colors=["#14B8A6","#3B82F6","#F97316","#A855F7","#F59E0B","#EC4899"];
                  const color=colors[i%colors.length];
                  return (
                    <div key={name}>
                      <div className="flex items-center justify-between mb-1.5"><span className="text-xs font-bold text-slate-300">{name}</span><span className="text-xs font-black tabular-nums" style={{color}}>{val.toLocaleString("es-AR")}</span></div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-500" style={{width:`${pct}%`,backgroundColor:color,boxShadow:`0 0 8px -2px ${color}`}}/></div>
                    </div>
                  );
                })
              )}
              <p className="text-[10px] text-slate-600 pt-1">Volumen = kg × repeticiones totales históricas</p>
            </div>
          )}
        </div>
      </div>

      {!confirmResetProgress?(
        <button onClick={()=>setConfirmResetProgress(true)} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-800/60 text-slate-600 hover:text-rose-400 hover:border-rose-500/30 transition text-xs font-medium"><Trash2 size={12}/> Resetear todo el historial</button>
      ):(
        <div className="flex gap-2 items-center bg-rose-950/30 border border-rose-500/20 rounded-xl px-3 py-2.5">
          <p className="text-xs text-rose-300/80 flex-1">¿Borrar todo el historial? Los récords se mantienen.</p>
          <button onClick={()=>setConfirmResetProgress(false)} className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs">No</button>
          <button onClick={()=>{const nl={};Object.entries(logs).forEach(([k,v])=>{if(k.endsWith("_pr_override"))nl[k]=v;});setLogs(nl);setConfirmResetProgress(false);}} className="px-2.5 py-1.5 rounded-lg bg-rose-500 text-white text-xs font-bold">Sí, borrar</button>
        </div>
      )}
    </div>
  );
}

function ProfileView({ profileName, profiles, onLogout, onDelete, onUpdateProfile, cycleStart, onSetCycleStart }) {
  const profile=profiles[profileName];
  const [showDeletePin,setShowDeletePin]=useState(false); const [deleteError,setDeleteError]=useState("");
  const [editing,setEditing]=useState(false); const [editMail,setEditMail]=useState(profile?.email||"");
  const [showCycleSetup,setShowCycleSetup]=useState(false);
  const joinDate=profile?.joinedAt?new Date(profile.joinedAt).toLocaleDateString("es-AR",{day:"numeric",month:"long",year:"numeric"}):"—";
  const settings=getProfileSettings(profile), weekInfo=getWeekInfo(cycleStart,settings);
  const updateSettings=(patch)=>onUpdateProfile({settings:{...settings,...patch}});
  const adjustRest=(key,delta)=>updateSettings({[key]:Math.min(600,Math.max(30,settings[key]+delta))});
  const adjustSetting=(key,delta,min,max)=>updateSettings({[key]:Math.min(max,Math.max(min,settings[key]+delta))});
  const adjustDeloadPct=(delta)=>updateSettings({deloadPct:Math.min(0.95,Math.max(0.5,Math.round((settings.deloadPct+delta)*100)/100))});
  const handleDeleteConfirm=(pin)=>{if(profile.pin&&pin!==profile.pin){setDeleteError("PIN incorrecto.");setTimeout(()=>setDeleteError(""),1500);}else{onDelete();}};
  const initial=profileName.charAt(0).toUpperCase();
  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-slate-900 to-slate-900/50 border border-slate-800/50 rounded-2xl p-5 text-center shadow-md shadow-black/20">
        <div className="w-20 h-20 rounded-3xl mx-auto flex items-center justify-center text-3xl font-black text-white mb-3" style={{background:"linear-gradient(135deg,#14B8A6,#0E7490)"}}>{initial}</div>
        <h2 className="text-xl font-black text-white">{profileName}</h2>
        {profile?.email&&<p className="text-sm text-slate-400 mt-1">{profile.email}</p>}
        <p className="text-[11px] text-slate-600 mt-1">Miembro desde {joinDate}</p>
      </div>
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl divide-y divide-slate-800/50 overflow-hidden backdrop-blur-sm shadow-md shadow-black/20">
        {[{icon:<Mail size={14}/>,label:"Email",val:profile?.email||"No configurado"},{icon:<Clock size={14}/>,label:"Unido el",val:joinDate},{icon:<Calendar size={14}/>,label:"Ciclo actual",val:weekInfo?`Ciclo #${weekInfo.cycleNumber} · Semana ${weekInfo.weekInCycle}/${weekInfo.cycleWeeks}`:"No iniciado"},{icon:<Zap size={14}/>,label:"Estado",val:weekInfo?(weekInfo.isDeload?"🟣 Semana de descarga":"🟠 Semana de entrenamiento"):"—"}].map(({icon,label,val})=>(
          <div key={label} className="flex items-center gap-3 px-4 py-3.5"><span className="text-slate-600">{icon}</span><span className="text-slate-500 text-xs flex-1">{label}</span><span className="text-slate-300 text-xs font-medium text-right">{val}</span></div>
        ))}
      </div>
      {editing?(
        <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 space-y-3">
          <input type="email" value={editMail} onChange={e=>setEditMail(e.target.value)} placeholder="tu@email.com" className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-3 text-white text-sm focus:outline-none"/>
          <div className="flex gap-2">
            <button onClick={()=>setEditing(false)} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-semibold">Cancelar</button>
            <button onClick={()=>{onUpdateProfile({email:editMail});setEditing(false);}} className="flex-1 py-3 rounded-xl bg-teal-500 text-white text-sm font-bold">Guardar</button>
          </div>
        </div>
      ):(
        <button onClick={()=>setEditing(true)} className="w-full flex items-center gap-2 justify-center py-3 rounded-2xl border border-slate-800 text-slate-400 hover:border-slate-600 hover:text-white transition text-sm font-medium"><Edit3 size={14}/> Editar perfil</button>
      )}
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm shadow-md shadow-black/20">
        <div className="flex items-center justify-between mb-2">
          <div><p className="text-sm font-bold text-white">Inicio de ciclo</p><p className="text-[11px] text-slate-500 mt-0.5">{cycleStart?`Iniciado el ${new Date(cycleStart).toLocaleDateString("es-AR")}`:"No configurado"}</p></div>
          <button onClick={()=>setShowCycleSetup(true)} className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700">{cycleStart?"Cambiar":"Configurar"}</button>
        </div>
      </div>
      {showCycleSetup&&(
        <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold text-white">¿Cuándo empezaste el ciclo actual?</p>
          <input type="date" className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-3 text-white text-sm focus:outline-none" defaultValue={cycleStart?new Date(cycleStart).toISOString().slice(0,10):todayStr()} id="cycle-date-input"/>
          <div className="flex gap-2">
            <button onClick={()=>setShowCycleSetup(false)} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-semibold">Cancelar</button>
            <button onClick={()=>{const val=document.getElementById("cycle-date-input").value;if(val){onSetCycleStart(new Date(val));setShowCycleSetup(false);}}} className="flex-1 py-3 rounded-xl bg-teal-500 text-white text-sm font-bold">Guardar</button>
          </div>
        </div>
      )}
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm shadow-md shadow-black/20 space-y-3.5">
        <div><p className="text-sm font-bold text-white">Configuración de descarga</p><p className="text-[11px] text-slate-500 mt-0.5">Cada cuánto llega y cómo se reduce la carga</p></div>
        <div className="grid grid-cols-2 gap-3">
          {[{key:"trainWeeks",label:"Sem. entrenamiento",min:2,max:12},{key:"deloadWeeks",label:"Sem. descarga",min:1,max:4}].map(({key,label,min,max})=>(
            <div key={key} className="bg-slate-950/40 rounded-xl p-3"><p className="text-[10px] text-slate-500 mb-2">{label}</p><div className="flex items-center justify-between"><button onClick={()=>adjustSetting(key,-1,min,max)} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 active:scale-95">−</button><span className="text-sm font-black text-white tabular-nums">{settings[key]}</span><button onClick={()=>adjustSetting(key,1,min,max)} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 active:scale-95">+</button></div></div>
          ))}
        </div>
        <div className="bg-slate-950/40 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2"><p className="text-[10px] text-slate-500">Carga en descarga</p><span className="text-[11px] font-bold text-purple-400 tabular-nums">{Math.round(settings.deloadPct*100)}%</span></div>
          <div className="flex items-center gap-3"><button onClick={()=>adjustDeloadPct(-0.05)} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 active:scale-95 shrink-0">−</button><div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-purple-500 rounded-full transition-all" style={{width:`${settings.deloadPct*100}%`}}/></div><button onClick={()=>adjustDeloadPct(0.05)} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 active:scale-95 shrink-0">+</button></div>
        </div>
        <div><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Reducción de series</p><div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">{[{k:2,l:"Mitad"},{k:3,l:"Tercio"},{k:4,l:"Cuarto"}].map(opt=><button key={opt.k} onClick={()=>updateSettings({deloadSetDivisor:opt.k})} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${settings.deloadSetDivisor===opt.k?"bg-purple-500 text-white":"text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>)}</div></div>
      </div>
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 backdrop-blur-sm shadow-md shadow-black/20 space-y-3.5">
        <div><p className="text-sm font-bold text-white">Descanso entre series</p><p className="text-[11px] text-slate-500 mt-0.5">Cómo te avisamos y cuánto dura cada pausa</p></div>
        <div><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Aviso al terminar</p><div className="flex bg-slate-950/60 rounded-xl p-1 border border-slate-800/60">{[{k:"sound",l:"Sonido"},{k:"vibration",l:"Vibración"},{k:"both",l:"Ambos"}].map(opt=><button key={opt.k} onClick={()=>updateSettings({alertType:opt.k})} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${settings.alertType===opt.k?"bg-teal-500 text-white":"text-slate-500 hover:text-slate-300"}`}>{opt.l}</button>)}</div></div>
        <div className="grid grid-cols-2 gap-3">
          {[{key:"restLong",label:"Ejercicios pesados"},{key:"restShort",label:"Resto"}].map(({key,label})=>(
            <div key={key} className="bg-slate-950/40 rounded-xl p-3"><p className="text-[10px] text-slate-500 mb-2">{label}</p><div className="flex items-center justify-between"><button onClick={()=>adjustRest(key,-15)} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 active:scale-95">−</button><span className="text-sm font-black text-white tabular-nums">{formatTime(settings[key])}</span><button onClick={()=>adjustRest(key,15)} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 active:scale-95">+</button></div></div>
          ))}
        </div>
      </div>
      <button onClick={onLogout} className="w-full flex items-center gap-2 justify-center py-3.5 rounded-2xl border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 transition text-sm font-semibold"><LogOut size={14}/> Cambiar de perfil</button>
      {!showDeletePin?(
        <button onClick={()=>setShowDeletePin(true)} className="w-full flex items-center gap-2 justify-center py-3.5 rounded-2xl border border-rose-500/20 text-rose-500/70 hover:text-rose-400 hover:border-rose-500/40 transition text-sm font-semibold"><Trash2 size={14}/> Eliminar perfil de {profileName}</button>
      ):(
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4">
          <div className="flex items-start gap-2.5 mb-4"><AlertTriangle size={16} className="text-rose-400 mt-0.5 shrink-0"/><p className="text-xs text-rose-400 font-semibold">{profile?.pin?"Esto borra el perfil y todo el historial de forma permanente. Ingresá tu PIN para confirmar.":"Esto borra el perfil y todo el historial de forma permanente. No se puede deshacer."}</p></div>
          {profile?.pin?<PinInput label="PIN para confirmar" onComplete={handleDeleteConfirm} error={deleteError} onCancel={()=>setShowDeletePin(false)}/>:(
            <div className="flex gap-2"><button onClick={()=>setShowDeletePin(false)} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-semibold">Cancelar</button><button onClick={onDelete} className="flex-1 py-3 rounded-xl bg-rose-500 text-white text-sm font-bold">Eliminar perfil</button></div>
          )}
        </div>
      )}
    </div>
  );
}

function MaxSetupWizard({ logs, setLogs, onDone }) {
  const allSets=DAY_ORDER.flatMap(dk=>ROUTINE[dk].exercises.flatMap((ex,ei)=>ex.sets.map((s,si)=>({dayKey:dk,dayColor:ROUTINE[dk].color,dayLabel:ROUTINE[dk].label,ex,setIndex:si,s,key:`${ex.id}_${si}`}))));
  const [step,setStep]=useState(0); const [values,setValues]=useState({}); const [confirmSkipAll,setConfirmSkipAll]=useState(false);
  const current=allSets[step];
  const handleNext=()=>{
    const v=values[current.key];
    if(v?.kg&&v?.reps){const prKey=`${current.key}_pr_override`;setLogs({...logs,[prKey]:{kg:parseFloat(v.kg),reps:parseFloat(v.reps)}});}
    if(step>=allSets.length-1)onDone();else setStep(s=>s+1);
  };
  const pct=Math.round((step/allSets.length)*100);
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col px-4 py-8 relative overflow-hidden">
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-30" style={{backgroundColor:current.dayColor}}/>
      <div className="max-w-sm mx-auto w-full flex-1 flex flex-col relative">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3"><h2 className="text-sm font-bold text-white">Establecer marcas iniciales</h2><span className="text-xs text-slate-500">{step+1} / {allSets.length}</span></div>
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-400 transition-all duration-300" style={{width:`${pct}%`}}/></div>
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[10px] text-slate-600">Podés saltear ejercicios que no hayas hecho</p>
            {!confirmSkipAll&&<button onClick={()=>setConfirmSkipAll(true)} className="text-[10px] text-slate-500 hover:text-slate-300 font-semibold flex items-center gap-1"><SkipForward size={11}/> Saltear todo</button>}
          </div>
        </div>
        {confirmSkipAll&&(
          <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-4 mb-4 space-y-3">
            <p className="text-xs text-slate-300 leading-relaxed">¿Saltear toda la configuración? Podés ingresar marcas más adelante desde la rutina.</p>
            <div className="flex gap-2">
              <button onClick={()=>setConfirmSkipAll(false)} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-semibold">Seguir</button>
              <button onClick={onDone} className="flex-1 py-3 rounded-xl bg-slate-700 text-white text-sm font-bold">Saltear todo</button>
            </div>
          </div>
        )}
        <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-5 flex-1 flex flex-col justify-between shadow-xl shadow-black/30">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg mb-3 inline-block" style={{backgroundColor:current.dayColor+"18",color:current.dayColor}}>{current.dayLabel}</span>
            <h3 className="text-xl font-black text-white mt-2">{current.ex.name}</h3>
            <p className="text-sm text-slate-500 mt-1">{current.ex.muscle}</p>
            <p className="text-xs text-slate-600 mt-3 italic">"{current.ex.nota}"</p>
            <div className="mt-6">
              <p className="text-xs font-semibold text-slate-400 mb-3">Serie {current.setIndex+1} · {current.s.repRange} reps</p>
              <div className="flex gap-3">
                <div className="flex-1"><label className="text-[10px] text-slate-600 uppercase tracking-wider font-bold mb-1.5 block">Tu mejor Reps</label><input type="number" inputMode="decimal" placeholder="—" value={values[current.key]?.reps||""} onChange={e=>setValues(v=>({...v,[current.key]:{...v[current.key],reps:e.target.value}}))} className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-4 text-2xl font-black text-center text-white focus:outline-none transition"/></div>
                <div className="text-slate-700 text-xl pb-2 flex items-end">×</div>
                <div className="flex-1"><label className="text-[10px] text-slate-600 uppercase tracking-wider font-bold mb-1.5 block">Tu mejor Kg</label><input type="number" inputMode="decimal" placeholder="—" value={values[current.key]?.kg||""} onChange={e=>setValues(v=>({...v,[current.key]:{...v[current.key],kg:e.target.value}}))} className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-4 text-2xl font-black text-center text-white focus:outline-none transition"/></div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <button onClick={()=>{if(step<allSets.length-1)setStep(s=>s+1);else onDone();}} className="py-3.5 px-4 rounded-2xl border border-slate-700 text-slate-400 text-sm font-semibold">Saltear</button>
            <button onClick={handleNext} className="flex-1 py-3.5 rounded-2xl bg-teal-500 text-white text-sm font-bold hover:bg-teal-400 active:scale-[0.98] transition-all shadow-lg shadow-teal-500/20">{step<allSets.length-1?"Siguiente →":"Listo ✓"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BottomBar({ tab, setTab, profileName }) {
  const initial=profileName.charAt(0).toUpperCase();
  const tabs=[
    {key:"rutina",icon:<Dumbbell size={22}/>,label:"Rutina"},
    {key:"progreso",icon:<BarChart3 size={22}/>,label:"Progreso"},
    {key:"descarga",icon:<Zap size={22}/>,label:"Descarga"},
    {key:"perfil",icon:<div className="w-7 h-7 rounded-xl flex items-center justify-center text-sm font-black text-white" style={{background:tab==="perfil"?"linear-gradient(135deg,#14B8A6,#0E7490)":"transparent",border:tab==="perfil"?"none":"2px solid #334155",color:tab==="perfil"?"white":"#6B7280"}}>{initial}</div>,label:profileName},
  ];
  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/50">
      <div className="max-w-xl mx-auto flex">
        {tabs.map(({key,icon,label})=>(
          <button key={key} onClick={()=>setTab(key)} className="flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-all active:scale-95">
            <span className={`transition-all ${tab===key?"text-teal-400":"text-slate-600"}`}>{icon}</span>
            <span className={`text-[9px] font-bold uppercase tracking-wider transition-all ${tab===key?"text-teal-400":"text-slate-700"}`}>{label.length>8?label.slice(0,7)+"…":label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [profiles,setProfiles]=useState(loadProfiles);
  const [activeProfile,setActiveProfile]=useState(null);
  const [tab,setTab]=useState("rutina");
  const [cycleStart,setCycleStartState]=useState(loadCycleStart);
  const [showWizard,setShowWizard]=useState(false);

  useEffect(()=>{
    const saved=loadActive();
    if(saved&&profiles[saved]&&!profiles[saved].pin){setActiveProfile(saved);if(!profiles[saved].maxesSetup)setShowWizard(true);}
  },[]);

  const profile=profiles[activeProfile], logs=profile?.logs||{};
  const setLogs=useCallback((newLogs)=>{const np={...profiles,[activeProfile]:{...profiles[activeProfile],logs:newLogs}};setProfiles(np);saveProfiles(np);},[profiles,activeProfile]);
  const handleLogin=(name,updatedProfiles)=>{const profs=updatedProfiles||profiles;setProfiles(profs);setActiveProfile(name);if(!profs[name]?.maxesSetup)setShowWizard(true);};
  const handleLogout=()=>{saveActive(null);setActiveProfile(null);setShowWizard(false);};
  const handleDelete=()=>{const np={...profiles};delete np[activeProfile];setProfiles(np);saveProfiles(np);saveActive(null);setActiveProfile(null);setShowWizard(false);};
  const handleUpdateProfile=(updates)=>{const np={...profiles,[activeProfile]:{...profiles[activeProfile],...updates}};setProfiles(np);saveProfiles(np);};
  const handleSetCycleStart=(d)=>{setCycleStartState(d);saveCycleStart(d);};
  const handleWizardDone=()=>{const np={...profiles,[activeProfile]:{...profiles[activeProfile],maxesSetup:true}};setProfiles(np);saveProfiles(np);setShowWizard(false);};

  if(!activeProfile) return <LoginScreen onLogin={handleLogin}/>;
  if(showWizard) return <MaxSetupWizard logs={logs} setLogs={(nl)=>{setLogs(nl);}} onDone={handleWizardDone}/>;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans">
      <header className="sticky top-0 z-10 bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-slate-800/40">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base font-black text-white shrink-0" style={{background:"linear-gradient(135deg,#14B8A6,#0E7490)"}}>{activeProfile.charAt(0).toUpperCase()}</div>
          <div className="flex-1 min-w-0">
            <h1 className="font-black text-base text-white leading-tight tracking-tight">
              {tab==="rutina"&&"Rutina"}{tab==="progreso"&&"Progreso"}{tab==="descarga"&&"Descarga"}{tab==="perfil"&&"Perfil"}
            </h1>
            <p className="text-[11px] text-slate-600 leading-tight">{activeProfile}</p>
          </div>
          <div className="w-8 h-8 rounded-xl bg-teal-500/15 flex items-center justify-center"><Flame size={16} className="text-teal-500"/></div>
        </div>
      </header>
      <main className="max-w-xl mx-auto px-4 py-4 pb-28 space-y-4">
        {tab==="rutina"&&<RoutineView logs={logs} setLogs={setLogs} cycleStart={cycleStart} settings={getProfileSettings(profile)}/>}
        {tab==="progreso"&&<ProgressView logs={logs} setLogs={setLogs}/>}
        {tab==="descarga"&&<DeloadView logs={logs} settings={getProfileSettings(profile)}/>}
        {tab==="perfil"&&<ProfileView profileName={activeProfile} profiles={profiles} onLogout={handleLogout} onDelete={handleDelete} onUpdateProfile={handleUpdateProfile} cycleStart={cycleStart} onSetCycleStart={handleSetCycleStart}/>}
      </main>
      <BottomBar tab={tab} setTab={setTab} profileName={activeProfile}/>
    </div>
  );
}
