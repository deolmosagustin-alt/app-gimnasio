/* ============================================================================
   DATA.JS — catálogo de ejercicios, grupos musculares y rutinas
   preestablecidas, separado de App.jsx para que ese archivo quede más
   liviano (esto es la parte más pesada en líneas: el catálogo completo de
   ejercicios y las 6 rutinas predeterminadas). RANK_TIERS queda afuera a
   propósito — sigue viviendo en App.jsx, tal como se pidió.

   `mkSets` está duplicada acá adentro a propósito: PRESET_ROUTINES la
   necesita para armar las series de cada ejercicio, pero también se usa
   en muchos otros lugares de App.jsx que no tienen nada que ver con este
   archivo (el importador de rutinas, el armador de rutinas a mano...).
   Importarla desde App.jsx hubiera creado una dependencia circular
   (App.jsx -> data.js -> App.jsx), así que se mantienen las dos copias —
   es una función de una sola línea, sin ningún estado ni dependencias,
   así que duplicarla no tiene ningún costo real.
============================================================================ */
export function mkSets(n, repRange) { return Array.from({ length: n }, () => ({ repRange })); }

export const MUSCLE_GROUPS = [
  { key: "cardio", label: "Cardio", color: "#FB7185" },
  { key: "pectoral_superior", label: "Pectoral superior", color: "#14B8A6" },
  { key: "pectoral_medio", label: "Pectoral medio/inferior", color: "#0D9488" },
  { key: "dorsales", label: "Dorsales", color: "#3B82F6" },
  { key: "trapecio", label: "Trapecio", color: "#1D4ED8" },
  { key: "deltoide_anterior", label: "Deltoide anterior", color: "#A855F7" },
  { key: "deltoide_lateral", label: "Deltoide lateral", color: "#9333EA" },
  { key: "deltoide_posterior", label: "Deltoide posterior", color: "#7E22CE" },
  { key: "biceps", label: "Bíceps", color: "#F59E0B" },
  { key: "triceps", label: "Tríceps", color: "#F97316" },
  { key: "antebrazos", label: "Antebrazos", color: "#84CC16" },
  { key: "cuadriceps", label: "Cuádriceps", color: "#EF4444" },
  { key: "femoral", label: "Femoral", color: "#EC4899" },
  { key: "gluteo", label: "Glúteo y cadera", color: "#8B5CF6" },
  { key: "aductores", label: "Aductores", color: "#D946EF" },
  { key: "core", label: "Core / Abdomen", color: "#06B6D4" },
  { key: "espalda_baja", label: "Espalda baja", color: "#2563EB" },
  { key: "pantorrillas", label: "Pantorrillas", color: "#22C55E" },
  { key: "oblicuos", label: "Oblicuos", color: "#10B981" },
  { key: "tibial_anterior", label: "Tibial anterior", color: "#34D399" },
];
export const MUSCLE_GROUP_BY_KEY = {};
MUSCLE_GROUPS.forEach((g) => { MUSCLE_GROUP_BY_KEY[g.key] = g; });

// El catálogo de ejercicios. "group" es el grupo muscular para el buscador al
// crear una rutina; "muscle" es el texto específico que se ve en la tarjeta.
export const EXERCISE_LIBRARY = [
  // Pecho
  { id: "press_banca", name: "Press Banca", muscle: "Pectoral", group: "pectoral_medio", secondary: [{ group: "triceps", weight: 0.35, alwaysCount: true }, { group: "deltoide_anterior", weight: 0.3 }], nota: "Leg drive firme y omóplatos retraídos.", videoQuery: "press banca técnica correcta" },
  { id: "press_banca_smith", name: "Press Banca Smith", muscle: "Pectoral", group: "pectoral_medio", secondary: [{ group: "triceps", weight: 0.35, alwaysCount: true }, { group: "deltoide_anterior", weight: 0.25 }], nota: "Riel fijo: foco total en el músculo, sin estabilizar.", videoQuery: "press banca smith técnica" },
  { id: "press_inclinado_smith", name: "Press Inclinado Smith", muscle: "Pectoral sup.", group: "pectoral_superior", secondary: [{ group: "triceps", weight: 0.3, alwaysCount: true }, { group: "deltoide_anterior", weight: 0.35 }], nota: "Codos bastante pegados, para enfocar la parte superior del pecho.", videoQuery: "press inclinado smith técnica" },
  { id: "press_inclinado_mancuernas", name: "Press Inclinado con Mancuernas", muscle: "Pectoral sup.", group: "pectoral_superior", loadFactor: 2, secondary: [{ group: "triceps", weight: 0.3, alwaysCount: true }, { group: "deltoide_anterior", weight: 0.35 }], loadFactor: 2, nota: "Más rango que con barra; no hiperextiendas abajo.", videoQuery: "press inclinado mancuernas técnica" },
  { id: "press_plano_mancuernas", name: "Press Plano con Mancuernas", muscle: "Pectoral", group: "pectoral_medio", loadFactor: 2, secondary: [{ group: "triceps", weight: 0.3, alwaysCount: true }, { group: "deltoide_anterior", weight: 0.3 }], loadFactor: 2, nota: "Buen complemento del press banca, permite mayor estiramiento.", videoQuery: "press plano mancuernas técnica" },
  { id: "press_declinado_barra", name: "Press Declinado con Barra", muscle: "Pectoral inf.", group: "pectoral_medio", secondary: [{ group: "triceps", weight: 0.35, alwaysCount: true }], nota: "Enfoca la parte baja del pectoral, asegurá bien los pies.", videoQuery: "press declinado barra técnica" },
  { id: "press_pecho_maquina", name: "Press de Pecho en Máquina", muscle: "Pectoral", group: "pectoral_medio", secondary: [{ group: "triceps", weight: 0.3, alwaysCount: true }, { group: "deltoide_anterior", weight: 0.2 }], nota: "Suma volumen sin fatigar estabilizadores.", videoQuery: "press de pecho en máquina técnica chest press machine" },
  { id: "cruce_poleas", name: "Cruce de Poleas", muscle: "Pectoral", group: "pectoral_medio", nota: "Énfasis en el estiramiento.", videoQuery: "cruce de poleas técnica pectoral" },
  { id: "aperturas_mancuerna", name: "Aperturas con Mancuernas", muscle: "Pectoral", group: "pectoral_medio", loadFactor: 2, nota: "Codos siempre un poco flexionados, no los traves rectos.", videoQuery: "aperturas con mancuernas técnica dumbbell flyes" },
  { id: "pec_deck_pectoral", name: "Pec Deck", muscle: "Pectoral", group: "pectoral_medio", nota: "Controlado: juntá al frente sin golpear.", videoQuery: "pec deck máquina técnica pectoral" },
  { id: "press_cerrado", name: "Press Banca Agarre Cerrado", muscle: "Pectoral / Tríceps", group: "pectoral_medio", secondary: [{ group: "triceps", weight: 0.5, alwaysCount: true }], nota: "Manos a la altura de los hombros, buen híbrido con tríceps.", videoQuery: "press banca agarre cerrado técnica" },
  { id: "flexiones", name: "Flexiones de Brazos", muscle: "Pectoral", group: "pectoral_medio", rankExcluded: true, nota: "Con tu propio peso corporal, útil para activar antes de entrenar.", videoQuery: "flexiones de brazos técnica correcta" },
  // Espalda
  { id: "remo_ancho_maquina", name: "Remo Ancho Máquina", muscle: "Trapecio", group: "trapecio", secondary: [{ group: "dorsales", weight: 0.3 }, { group: "deltoide_posterior", weight: 0.25 }, { group: "biceps", weight: 0.15 }], nota: "No encojas los hombros: movés con la espalda.", videoQuery: "remo ancho máquina técnica espalda" },
  { id: "dorsalera", name: "Dorsalera Agarre Ancho", muscle: "Dorsal", group: "dorsales", secondary: [{ group: "deltoide_posterior", weight: 0.25 }, { group: "biceps", weight: 0.2 }, { group: "antebrazos", weight: 0.15 }], nota: "Hombros en su lugar, pulgar en la marca.", videoQuery: "dorsalera lat pulldown agarre ancho técnica" },
  { id: "dorsalera_agarre_cerrado", name: "Dorsalera Agarre Cerrado", muscle: "Dorsal", group: "dorsales", secondary: [{ group: "biceps", weight: 0.4 }, { group: "antebrazos", weight: 0.2 }], nota: "Agarre supino o en V: dorsal bajo.", videoQuery: "jalón agarre cerrado técnica dorsal" },
  { id: "remo_barra", name: "Remo con Barra", muscle: "Dorsal medio", group: "dorsales", secondary: [{ group: "biceps", weight: 0.3 }, { group: "deltoide_posterior", weight: 0.25 }, { group: "trapecio", weight: 0.2 }, { group: "antebrazos", weight: 0.15 }], nota: "Espalda neutra, torso a unos 45°, no uses impulso de la zona lumbar.", videoQuery: "remo con barra técnica bent over row" },
  { id: "remo_unilateral", name: "Remo Unilateral", muscle: "Dorsal / oblicuos", group: "dorsales", secondary: [{ group: "biceps", weight: 0.3 }, { group: "deltoide_posterior", weight: 0.25 }, { group: "antebrazos", weight: 0.15 }], nota: "Contraé los oblicuos, codo lo más abajo posible.", videoQuery: "remo unilateral mancuerna técnica espalda" },
  { id: "remo_maquina_sentado", name: "Remo Sentado en Máquina/Polea", muscle: "Dorsal medio", group: "dorsales", secondary: [{ group: "biceps", weight: 0.25 }, { group: "deltoide_posterior", weight: 0.25 }, { group: "trapecio", weight: 0.2 }], nota: "Pecho contra el apoyo, llevá los codos atrás sin balancear el torso.", videoQuery: "remo sentado polea técnica seated cable row" },
  { id: "remo_pecho_apoyado", name: "Remo con Pecho Apoyado", muscle: "Dorsal medio", group: "dorsales", secondary: [{ group: "biceps", weight: 0.25 }, { group: "deltoide_posterior", weight: 0.25 }, { group: "trapecio", weight: 0.2 }], nota: "El apoyo del banco saca la lumbar: foco puro en espalda.", videoQuery: "remo pecho apoyado técnica chest supported row" },
  { id: "pull_over", name: "Pull Over", muscle: "Dorsal / serrato", group: "dorsales", secondary: [{ group: "triceps", weight: 0.15, alwaysCount: true }], nota: "Codos siempre un poco flexionados.", videoQuery: "pull over espalda técnica mancuerna" },
  { id: "peso_muerto", name: "Peso Muerto", muscle: "Espalda baja / Femoral", group: "dorsales", secondary: [{ group: "gluteo", weight: 0.4 }, { group: "femoral", weight: 0.35 }, { group: "trapecio", weight: 0.3 }, { group: "antebrazos", weight: 0.3 }, { group: "espalda_baja", weight: 0.4 }], nota: "Espalda neutra todo el recorrido.", videoQuery: "peso muerto técnica correcta" },
  { id: "remo_t", name: "Remo en T", muscle: "Dorsal medio", group: "dorsales", secondary: [{ group: "biceps", weight: 0.35 }, { group: "trapecio", weight: 0.25 }, { group: "deltoide_posterior", weight: 0.1 }], nota: "Pecho apoyado si tenés banco, foco en juntar los omóplatos.", videoQuery: "remo en T técnica espalda" },
  { id: "hiperextensiones", name: "Hiperextensiones", muscle: "Espalda baja", group: "espalda_baja", secondary: [{ group: "gluteo", weight: 0.3 }, { group: "femoral", weight: 0.25 }], nota: "No hiperextiendas de más arriba, contraé glúteo al subir.", videoQuery: "hiperextensiones técnica espalda baja" },
  { id: "dominadas", name: "Dominadas", muscle: "Dorsal", group: "dorsales", rankExcluded: true, nota: "Si todavía no podés hacer muchas, usá banda de asistencia.", videoQuery: "dominadas técnica correcta" },
  // Hombros
  { id: "press_militar_smith", name: "Press Militar Smith", muscle: "Deltoides ant.", group: "deltoide_anterior", secondary: [{ group: "triceps", weight: 0.3, alwaysCount: true }, { group: "trapecio", weight: 0.15 }], nota: "Codos adelante, banco a 80-90°.", videoQuery: "press militar smith técnica hombros" },
  { id: "press_militar_maquina", name: "Press Militar en Máquina", muscle: "Deltoides ant.", group: "deltoide_anterior", secondary: [{ group: "triceps", weight: 0.3, alwaysCount: true }], nota: "Recorrido guiado: sumá series sin estabilizar.", videoQuery: "press militar máquina técnica shoulder press machine" },
  { id: "press_militar_mancuernas", name: "Press Militar con Mancuernas", muscle: "Deltoides ant.", group: "deltoide_anterior", loadFactor: 2, secondary: [{ group: "triceps", weight: 0.3, alwaysCount: true }, { group: "trapecio", weight: 0.15 }], loadFactor: 2, nota: "Mayor rango y estabilidad que con barra.", videoQuery: "press militar mancuernas técnica" },
  { id: "press_arnold", name: "Press Arnold", muscle: "Deltoides ant. / lateral", group: "deltoide_anterior", loadFactor: 2, secondary: [{ group: "deltoide_lateral", weight: 0.3 }, { group: "triceps", weight: 0.25, alwaysCount: true }], loadFactor: 2, nota: "La rotación de muñeca suma trabajo del deltoides lateral.", videoQuery: "press arnold técnica hombros" },
  { id: "vuelos_laterales_mancuerna", name: "Vuelos Laterales Mancuerna", muscle: "Deltoides lateral", group: "deltoide_lateral", loadFactor: 2, nota: "Levantá un poco hacia adelante, no uses impulso.", videoQuery: "vuelos laterales mancuerna técnica deltoides" },
  { id: "vuelos_laterales_maquina", name: "Vuelos Laterales Máquina", muscle: "Deltoides lateral", group: "deltoide_lateral", nota: "No hagas tanta fuerza con el agarre, dejá trabajar al hombro.", videoQuery: "vuelos laterales máquina deltoides técnica" },
  { id: "vuelos_frontales", name: "Vuelos Frontales", muscle: "Deltoides ant.", group: "deltoide_anterior", secondary: [{ group: "pectoral_superior", weight: 0.15 }], loadFactor: 2, nota: "No subas más arriba de los hombros, evitá el impulso lumbar.", videoQuery: "vuelos frontales técnica front raise" },
  { id: "remo_al_cuello", name: "Remo al Cuello", muscle: "Deltoides lateral / Trapecio", group: "deltoide_lateral", secondary: [{ group: "trapecio", weight: 0.35 }], nota: "Codos arriba de las manos, subí solo hasta el pecho.", videoQuery: "remo al cuello técnica upright row" },
  { id: "pec_dec_deltoides", name: "Pec Dec para Deltoides Posterior", muscle: "Deltoides post.", group: "deltoide_posterior", secondary: [{ group: "deltoide_lateral", weight: 0.2 }, { group: "trapecio", weight: 0.15 }], nota: "Unilateral, movimiento controlado.", videoQuery: "pec dec deltoides posterior técnica" },
  { id: "elevaciones_pajaro", name: "Elevaciones tipo Pájaro", muscle: "Deltoides post.", group: "deltoide_posterior", secondary: [{ group: "trapecio", weight: 0.2 }], loadFactor: 2, nota: "Torso inclinado hacia adelante, codos con leve flexión fija.", videoQuery: "elevaciones pájaro técnica reverse fly deltoides posterior" },
  { id: "face_pull", name: "Face Pull", muscle: "Deltoides post.", group: "deltoide_posterior", secondary: [{ group: "trapecio", weight: 0.3 }], nota: "Polea a la altura de los ojos.", videoQuery: "face pull técnica deltoides posterior" },
  // Bíceps
  { id: "biceps_alternado_mancuerna", name: "Bíceps Alternado Mancuerna", muscle: "Bíceps", group: "biceps", loadFactor: 2, nota: "Movés un poco el húmero al final.", videoQuery: "curl alternado mancuerna técnica bíceps" },
  { id: "biceps_martillo", name: "Bíceps Martillo", muscle: "Bíceps / braquial", group: "biceps", loadFactor: 2, nota: "Alternado, agarre neutro.", videoQuery: "curl martillo bíceps técnica hammer curl" },
  { id: "biceps_banco_scott", name: "Bíceps Banco Scott", muscle: "Bíceps", group: "biceps", nota: "Unilateral con mancuerna, evitá usar impulso.", videoQuery: "curl banco scott técnica bíceps preacher curl" },
  { id: "biceps_banco_inclinado", name: "Bíceps Banco Inclinado", muscle: "Bíceps cab. larga", group: "biceps", loadFactor: 2, nota: "Alternado, buen estiramiento al inicio del movimiento.", videoQuery: "curl banco inclinado bíceps técnica incline curl" },
  { id: "biceps_barra_z", name: "Curl con Barra Z", muscle: "Bíceps", group: "biceps", nota: "Más amigable para la muñeca que la barra recta.", videoQuery: "curl barra Z técnica bíceps" },
  { id: "biceps_polea_barra", name: "Curl en Polea Baja con Barra", muscle: "Bíceps", group: "biceps", nota: "Tensión constante durante todo el recorrido, no balancees el torso.", videoQuery: "curl polea baja barra técnica bíceps" },
  { id: "biceps_concentrado", name: "Curl Concentrado", muscle: "Bíceps", group: "biceps", nota: "Codo apoyado en la pierna, foco total en el pico del bíceps.", videoQuery: "curl concentrado técnica bíceps" },
  // Tríceps
  { id: "triceps_trasnuca", name: "Tríceps Trasnuca", muscle: "Tríceps", group: "triceps", nota: "Pausa en el fondo, los codos no van cerrados.", videoQuery: "triceps trasnuca técnica overhead extension" },
  { id: "triceps_polea_alta", name: "Tríceps Polea Alta", muscle: "Tríceps", group: "triceps", nota: "El húmero no se mueve durante el ejercicio.", videoQuery: "tríceps polea alta técnica cable pushdown" },
  { id: "triceps_polea_cuerda", name: "Tríceps en Polea con Cuerda", muscle: "Tríceps", group: "triceps", nota: "Separá las manos al final del recorrido para más contracción.", videoQuery: "tríceps polea cuerda técnica rope pushdown" },
  { id: "triceps_frances", name: "Press Francés", muscle: "Tríceps", group: "triceps", nota: "Codos fijos, cuidado con sobrecargar el hombro.", videoQuery: "press francés técnica tríceps" },
  { id: "triceps_patada", name: "Patada de Tríceps", muscle: "Tríceps", group: "triceps", nota: "Brazo pegado al torso, extendé solo el antebrazo.", videoQuery: "patada de tríceps técnica kickback" },
  { id: "fondos_triceps", name: "Fondos en Paralelas o Banco", muscle: "Tríceps", group: "triceps", rankExcluded: true, nota: "Buen ejercicio compuesto, inclinate poco para enfocar el tríceps.", videoQuery: "fondos tríceps técnica correcta" },
  // Cuádriceps
  { id: "jaca", name: "Hack Squat", muscle: "Cuádriceps", group: "cuadriceps", secondary: [{ group: "tibial_anterior", weight: 0.08 }, { group: "gluteo", weight: 0.25 }, { group: "aductores", weight: 0.12 }], nota: "Pies a la altura de los hombros, bajá controlado.", videoQuery: "hack squat técnica cuádriceps" },
  { id: "sentadilla_smith", name: "Sentadilla en Multipower", muscle: "Cuádriceps", group: "cuadriceps", secondary: [{ group: "gluteo", weight: 0.3 }, { group: "aductores", weight: 0.12 }], nota: "El riel fija el recorrido, buena opción para enfocarte en la pierna.", videoQuery: "sentadilla multipower smith técnica" },
  { id: "sentadilla_goblet", name: "Sentadilla Goblet", muscle: "Cuádriceps", group: "cuadriceps", secondary: [{ group: "gluteo", weight: 0.25 }, { group: "core", weight: 0.15 }], nota: "Mancuerna pegada al pecho, codos adentro de las rodillas al bajar.", videoQuery: "sentadilla goblet técnica" },
  { id: "extension_cuadriceps", name: "Extensión de Cuádriceps", muscle: "Cuádriceps", group: "cuadriceps", nota: "Pausa de 1 segundo arriba.", videoQuery: "extensión cuádriceps máquina técnica" },
  { id: "sentadilla_convencional", name: "Sentadilla con Barra", muscle: "Cuádriceps", group: "cuadriceps", secondary: [{ group: "gluteo", weight: 0.4 }, { group: "femoral", weight: 0.2 }, { group: "core", weight: 0.15 }, { group: "espalda_baja", weight: 0.15 }], nota: "El básico de piernas, la profundidad depende de tu movilidad.", videoQuery: "sentadilla con barra técnica correcta" },
  { id: "prensa", name: "Prensa de Piernas", muscle: "Cuádriceps", group: "cuadriceps", secondary: [{ group: "tibial_anterior", weight: 0.08 }, { group: "gluteo", weight: 0.3 }, { group: "aductores", weight: 0.12 }], nota: "Alternativa de bajo estrés en la zona lumbar.", videoQuery: "prensa de piernas técnica" },
  { id: "step_up", name: "Step Up (Subida al Cajón)", muscle: "Cuádriceps / Glúteo", group: "cuadriceps", secondary: [{ group: "gluteo", weight: 0.35 }, { group: "femoral", weight: 0.15 }], nota: "Empujá con el talón del pie de arriba, evitá rebotar con el de abajo.", videoQuery: "step up subida al cajón técnica" },
  { id: "zancadas", name: "Zancadas", muscle: "Cuádriceps / Glúteo", group: "cuadriceps", secondary: [{ group: "tibial_anterior", weight: 0.08 }, { group: "gluteo", weight: 0.4 }, { group: "femoral", weight: 0.15 }], nota: "Trabajo unilateral, ayuda a corregir desbalances entre piernas.", videoQuery: "zancadas técnica correcta" },
  // Femoral
  { id: "curl_femoral_maquina", name: "Curl Femoral Máquina", muscle: "Femoral", group: "femoral", nota: "Controlá bien la fase negativa.", videoQuery: "curl femoral máquina técnica isquios" },
  { id: "peso_muerto_rumano", name: "Peso Muerto Rumano", muscle: "Femoral", group: "femoral", secondary: [{ group: "gluteo", weight: 0.35 }, { group: "dorsales", weight: 0.2 }, { group: "espalda_baja", weight: 0.25 }], nota: "Bajá llevando la cadera hacia atrás, rodillas casi rectas.", videoQuery: "peso muerto rumano técnica" },
  { id: "peso_muerto_piernas_rigidas", name: "Peso Muerto Piernas Rígidas", muscle: "Femoral", group: "femoral", secondary: [{ group: "gluteo", weight: 0.35 }, { group: "dorsales", weight: 0.2 }, { group: "espalda_baja", weight: 0.25 }], nota: "Rango más amplio que el rumano, rodillas casi sin flexión.", videoQuery: "peso muerto piernas rígidas técnica stiff leg deadlift" },
  { id: "curl_femoral_acostado", name: "Curl Femoral Acostado", muscle: "Femoral", group: "femoral", nota: "Variante tumbado, controlá bien la vuelta.", videoQuery: "curl femoral acostado técnica" },
  // Glúteo y cadera
  { id: "sentadilla_bulgara", name: "Sentadilla Búlgara (énfasis glúteo)", muscle: "Glúteo", group: "gluteo", secondary: [{ group: "aductores", weight: 0.12 }, { group: "tibial_anterior", weight: 0.08 }, { group: "cuadriceps", weight: 0.3 }, { group: "femoral", weight: 0.2 }], nota: "Torso inclinado ~30° adelante: el trabajo va al glúteo.", videoQuery: "sentadilla búlgara técnica glúteo" },
  { id: "sentadilla_bulgara_cuad", name: "Sentadilla Búlgara (énfasis cuádriceps)", muscle: "Cuádriceps", group: "cuadriceps", secondary: [{ group: "gluteo", weight: 0.25 }, { group: "femoral", weight: 0.15 }], nota: "Torso vertical: el trabajo va al cuádriceps.", videoQuery: "sentadilla búlgara cuádriceps torso vertical técnica" },
  { id: "hip_thrust", name: "Hip Thrust", muscle: "Glúteo", group: "gluteo", secondary: [{ group: "femoral", weight: 0.25 }], nota: "Pausa de 1-2 segundos arriba, contraé bien el glúteo.", videoQuery: "hip thrust técnica glúteo" },
  { id: "puente_gluteo", name: "Puente de Glúteo", muscle: "Glúteo", group: "gluteo", secondary: [{ group: "femoral", weight: 0.15 }], nota: "Variante sin barra, buena para activar antes de entrenar pierna.", videoQuery: "puente de glúteo técnica glute bridge" },
  { id: "aductores_maquina", name: "Aductores en Máquina", muscle: "Aductores", group: "aductores", nota: "Movimiento controlado, sin usar el impulso del tronco.", videoQuery: "aductores en máquina técnica" },
  { id: "peso_muerto_sumo", name: "Peso Muerto Sumo", muscle: "Glúteo / Aductores", group: "gluteo", secondary: [{ group: "femoral", weight: 0.3 }, { group: "dorsales", weight: 0.2 }, { group: "cuadriceps", weight: 0.2 }, { group: "aductores", weight: 0.25 }, { group: "espalda_baja", weight: 0.25 }], nota: "Postura ancha, rodillas hacia afuera siguiendo la punta del pie.", videoQuery: "peso muerto sumo técnica" },
  { id: "abductor_maquina", name: "Abductor Máquina", muscle: "Glúteo medio", group: "gluteo", nota: "Espalda apoyada, movimiento controlado.", videoQuery: "abductor máquina técnica glúteo medio" },
  { id: "aductor_maquina", name: "Aductor Máquina", muscle: "Aductores", group: "gluteo", nota: "Rango completo, sin rebotar.", videoQuery: "aductor máquina técnica inner thigh" },
  { id: "patada_gluteo", name: "Patada de Glúteo en Polea", muscle: "Glúteo", group: "gluteo", nota: "Movimiento controlado, evitá usar la zona lumbar para empujar.", videoQuery: "patada de glúteo polea técnica" },
  // Core
  { id: "abdominales", name: "Abdominales", muscle: "Core", group: "core", nota: "Controlá la fase excéntrica, sin impulso.", videoQuery: "abdominales técnica correcta core" },
  { id: "abdominales_maquina", name: "Abdominales en Máquina", muscle: "Core", group: "core", nota: "Foco en doblar la zona media, no solo flexionar el cuello.", videoQuery: "abdominales máquina técnica" },
  { id: "plancha", name: "Plancha Abdominal", muscle: "Core", group: "core", rankExcluded: true, nota: "Mantené la cadera alineada con los hombros, no la dejes caer.", videoQuery: "plancha abdominal técnica correcta" },
  { id: "plancha_lateral", name: "Plancha Lateral", muscle: "Core / oblicuos", group: "oblicuos", rankExcluded: true, nota: "Cadera elevada en línea recta, no la dejes caer hacia el piso.", videoQuery: "plancha lateral técnica side plank" },
  { id: "giros_rusos", name: "Giros Rusos", muscle: "Core / oblicuos", group: "oblicuos", nota: "Movimiento controlado desde el torso, no solo los brazos.", videoQuery: "giros rusos técnica russian twist" },
  { id: "rueda_abdominal", name: "Rueda Abdominal", muscle: "Core", group: "core", rankExcluded: true, nota: "Empezá con poco recorrido, mantené la zona lumbar protegida.", videoQuery: "rueda abdominal técnica ab wheel" },
  { id: "elevacion_piernas", name: "Elevación de Piernas Colgado", muscle: "Core / abdomen bajo", group: "core", nota: "Controlá el balanceo, el foco está en el abdomen bajo.", videoQuery: "elevación de piernas colgado técnica" },
  // Pantorrillas
  { id: "elevacion_talones_parado", name: "Elevación de Talones de Pie", muscle: "Pantorrillas", group: "pantorrillas", nota: "Rango completo, hacé una pausa arriba.", videoQuery: "elevación de talones de pie técnica gemelos" },
  { id: "elevacion_talones_sentado", name: "Elevación de Talones Sentado", muscle: "Pantorrillas (sóleo)", group: "pantorrillas", nota: "Variante que enfatiza más el sóleo.", videoQuery: "elevación de talones sentado técnica sóleo" },
  { id: "elevacion_talones_prensa", name: "Elevación de Talones en Prensa", muscle: "Pantorrillas", group: "pantorrillas", nota: "Apoyá solo la punta del pie en la plataforma, rango completo.", videoQuery: "elevación de talones en prensa técnica" },
  { id: "elevacion_talones_unilateral", name: "Elevación de Talones a Una Pierna", muscle: "Pantorrillas", group: "pantorrillas", nota: "Sostenete para el equilibrio; sin peso extra al inicio.", videoQuery: "elevación de talones a una pierna técnica" },
  // Pecho (catálogo extendido)
  { id: "press_banca_agarre_invertido", name: "Press Banca Agarre Invertido", muscle: "Pectoral sup.", group: "pectoral_superior", secondary: [{ group: "triceps", weight: 0.3, alwaysCount: true }, { group: "deltoide_anterior", weight: 0.3 }], nota: "Agarre supino: más énfasis en el pecho superior.", videoQuery: "press banca agarre invertido técnica" },
  { id: "press_banca_mancuernas_neutro", name: "Press Banca con Mancuernas Agarre Neutro", muscle: "Pectoral", group: "pectoral_medio", loadFactor: 2, secondary: [{ group: "triceps", weight: 0.3, alwaysCount: true }, { group: "deltoide_anterior", weight: 0.3 }], loadFactor: 2, nota: "Palmas enfrentadas: menos estrés en el hombro.", videoQuery: "press banca mancuernas agarre neutro técnica" },
  { id: "press_inclinado_barra", name: "Press Inclinado con Barra", muscle: "Pectoral sup.", group: "pectoral_superior", secondary: [{ group: "triceps", weight: 0.3, alwaysCount: true }, { group: "deltoide_anterior", weight: 0.35 }], nota: "Banco a 30-45°; más alto suma hombro, no pecho.", videoQuery: "press inclinado con barra técnica" },
  { id: "press_inclinado_maquina", name: "Press Inclinado en Máquina", muscle: "Pectoral sup.", group: "pectoral_superior", secondary: [{ group: "triceps", weight: 0.3, alwaysCount: true }, { group: "deltoide_anterior", weight: 0.3 }], nota: "Trayectoria fija: volumen sin estabilizar.", videoQuery: "press inclinado en máquina técnica" },
  { id: "press_declinado_mancuernas", name: "Press Declinado con Mancuernas", muscle: "Pectoral inf.", group: "pectoral_medio", secondary: [{ group: "triceps", weight: 0.3, alwaysCount: true }], loadFactor: 2, nota: "Asegurá bien los pies, bajá controlado hacia la parte baja del pecho.", videoQuery: "press declinado con mancuernas técnica" },
  { id: "press_declinado_maquina", name: "Press Declinado en Máquina", muscle: "Pectoral inf.", group: "pectoral_medio", secondary: [{ group: "triceps", weight: 0.3, alwaysCount: true }], nota: "Recorrido guiado, foco en la parte baja del pectoral.", videoQuery: "press declinado en máquina técnica" },
  { id: "aperturas_banco_inclinado", name: "Aperturas con Mancuernas en Banco Inclinado", muscle: "Pectoral sup.", group: "pectoral_superior", loadFactor: 2, nota: "Como las planas, con énfasis en la parte alta.", videoQuery: "aperturas banco inclinado técnica pectoral" },
  { id: "cruce_poleas_alto_bajo", name: "Cruce de Poleas Alto a Bajo", muscle: "Pectoral inf.", group: "pectoral_medio", nota: "Poleas arriba, tirá abajo y adelante: pecho inferior.", videoQuery: "cruce de poleas alto a bajo técnica" },
  { id: "cruce_poleas_bajo_alto", name: "Cruce de Poleas Bajo a Alto", muscle: "Pectoral sup.", group: "pectoral_superior", nota: "Poleas abajo, tirá arriba y adelante: pecho superior.", videoQuery: "cruce de poleas bajo a alto técnica" },
  { id: "cruce_poleas_una_mano", name: "Cruce de Poleas a Una Mano", muscle: "Pectoral", group: "pectoral_medio", nota: "Unilateral: buscá la contracción máxima al final.", videoQuery: "cruce de poleas a una mano técnica" },
  { id: "press_landmine", name: "Press Landmine", muscle: "Pectoral", group: "pectoral_medio", secondary: [{ group: "triceps", weight: 0.3, alwaysCount: true }, { group: "deltoide_anterior", weight: 0.3 }], nota: "Empujá en diagonal, arriba y adelante.", videoQuery: "press landmine técnica pectoral" },
  { id: "svend_press", name: "Svend Press", muscle: "Pectoral", group: "pectoral_medio", secondary: [{ group: "triceps", weight: 0.2, alwaysCount: true }], nota: "Apretá el disco entre palmas y empujá sin soltar presión.", videoQuery: "svend press técnica pectoral" },
  { id: "flexiones_declinadas", name: "Flexiones Declinadas", muscle: "Pectoral sup.", group: "pectoral_superior", rankExcluded: true, nota: "Pies elevados: más énfasis en pecho superior.", videoQuery: "flexiones declinadas técnica" },
  { id: "flexiones_inclinadas", name: "Flexiones Inclinadas", muscle: "Pectoral inf.", group: "pectoral_medio", rankExcluded: true, nota: "Manos elevadas: más foco en el pecho inferior.", videoQuery: "flexiones inclinadas técnica" },
  { id: "flexiones_deficit", name: "Flexiones con Déficit", muscle: "Pectoral", group: "pectoral_medio", rankExcluded: true, nota: "Manos sobre discos o mancuernas para sumar rango de estiramiento.", videoQuery: "flexiones con déficit técnica" },
  { id: "flexiones_pliometricas", name: "Flexiones Pliométricas", muscle: "Pectoral", group: "pectoral_medio", rankExcluded: true, nota: "Despegá las manos con fuerza y controlá la caída.", videoQuery: "flexiones pliométricas técnica" },
  { id: "fondos_anillas", name: "Fondos en Anillas", muscle: "Pectoral", group: "pectoral_medio", rankExcluded: true, nota: "Más inestable que las fijas: controlá la apertura.", videoQuery: "fondos en anillas técnica" },
  // Espalda (catálogo extendido)
  { id: "dominadas_supinas", name: "Dominadas Supinas", muscle: "Dorsal / Bíceps", group: "dorsales", rankExcluded: true, nota: "Palmas hacia vos: suma más bíceps.", videoQuery: "dominadas supinas chin up técnica" },
  { id: "dominadas_agarre_neutro", name: "Dominadas Agarre Neutro", muscle: "Dorsal", group: "dorsales", rankExcluded: true, nota: "Palmas enfrentadas, suele ser más amigable para el hombro.", videoQuery: "dominadas agarre neutro técnica" },
  { id: "dominadas_lastre", name: "Dominadas con Lastre", muscle: "Dorsal", group: "dorsales", rankExcluded: true, nota: "Sumá lastre solo cuando domines tu propio peso.", videoQuery: "dominadas con lastre técnica" },
  { id: "dominadas_asistidas", name: "Dominadas Asistidas en Máquina", muscle: "Dorsal", group: "dorsales", rankExcluded: true, nota: "Buena opción para sumar volumen de dominadas con control de la carga.", videoQuery: "dominadas asistidas máquina técnica" },
  { id: "jalon_agarre_neutro", name: "Jalón al Pecho Agarre Neutro", muscle: "Dorsal", group: "dorsales", secondary: [{ group: "biceps", weight: 0.3 }, { group: "deltoide_posterior", weight: 0.15 }, { group: "antebrazos", weight: 0.15 }], nota: "Barra en V: buen estiramiento al final.", videoQuery: "jalón al pecho agarre neutro técnica" },
  { id: "jalon_unilateral", name: "Jalón Unilateral en Polea Alta", muscle: "Dorsal", group: "dorsales", secondary: [{ group: "biceps", weight: 0.3 }, { group: "deltoide_posterior", weight: 0.15 }, { group: "antebrazos", weight: 0.15 }], nota: "Trabajo unilateral, mantené el torso estable sin rotar de más.", videoQuery: "jalón unilateral polea alta técnica" },
  { id: "remo_barra_supino", name: "Remo con Barra Agarre Supino", muscle: "Dorsal", group: "dorsales", secondary: [{ group: "biceps", weight: 0.45 }, { group: "trapecio", weight: 0.15 }], nota: "Agarre supino, mayor énfasis en la parte baja del dorsal.", videoQuery: "remo con barra agarre supino técnica" },
  { id: "remo_t_libre", name: "Remo en T Libre", muscle: "Dorsal medio", group: "dorsales", secondary: [{ group: "biceps", weight: 0.35 }, { group: "trapecio", weight: 0.25 }, { group: "deltoide_posterior", weight: 0.1 }, { group: "core", weight: 0.15 }], nota: "Sin apoyo: exige más core.", videoQuery: "remo en T libre técnica" },
  { id: "remo_polea_agarre_ancho", name: "Remo en Polea Baja Agarre Ancho", muscle: "Deltoides post. / Romboides", group: "deltoide_posterior", secondary: [{ group: "dorsales", weight: 0.3 }, { group: "trapecio", weight: 0.25 }, { group: "biceps", weight: 0.15 }], nota: "Agarre ancho: foco en posterior y romboides.", videoQuery: "remo polea baja agarre ancho técnica" },
  { id: "remo_meadows", name: "Remo Meadows", muscle: "Dorsal", group: "dorsales", secondary: [{ group: "biceps", weight: 0.3 }, { group: "deltoide_posterior", weight: 0.2 }, { group: "trapecio", weight: 0.15 }], nota: "Unilateral con apoyo: buen estiramiento inicial.", videoQuery: "remo meadows técnica espalda" },
  { id: "pullover_polea_alta", name: "Pullover en Polea Alta", muscle: "Dorsal", group: "dorsales", secondary: [{ group: "triceps", weight: 0.15, alwaysCount: true }], nota: "Brazos extendidos, bajá la barra en arco sin flexionar los codos.", videoQuery: "pullover polea alta técnica dorsal" },
  { id: "encogimientos_barra", name: "Encogimientos de Hombros con Barra", muscle: "Trapecio", group: "trapecio", nota: "Subí los hombros derecho hacia arriba, no los gires en círculo.", videoQuery: "encogimientos de hombros con barra técnica shrugs" },
  { id: "encogimientos_mancuernas", name: "Encogimientos de Hombros con Mancuernas", muscle: "Trapecio", group: "trapecio", loadFactor: 2, nota: "Línea de tracción más natural que con barra, pausa arriba.", videoQuery: "encogimientos de hombros con mancuernas técnica" },
  { id: "encogimientos_smith", name: "Encogimientos en Máquina Smith", muscle: "Trapecio", group: "trapecio", nota: "Trayectoria vertical fija, te deja enfocarte en apretar el trapecio.", videoQuery: "encogimientos máquina smith técnica trapecio" },
  { id: "encogimientos_polea_baja", name: "Encogimientos en Polea Baja", muscle: "Trapecio", group: "trapecio", nota: "Tensión constante, sin impulso de piernas.", videoQuery: "encogimientos polea baja técnica trapecio" },
  { id: "paseo_granjero", name: "Paseo del Granjero", muscle: "Trapecio / Agarre", group: "trapecio", secondary: [{ group: "oblicuos", weight: 0.2 }, { group: "antebrazos", weight: 0.5 }, { group: "core", weight: 0.2 }], nota: "Torso erguido, hombros atrás.", videoQuery: "paseo del granjero técnica farmers walk" },
  { id: "retraccion_escapular", name: "Retracción Escapular", muscle: "Trapecio medio / Romboides", group: "trapecio", secondary: [{ group: "deltoide_posterior", weight: 0.25 }], nota: "Hombros atrás juntando escápulas, codos rectos. Movimiento corto con pausa.", videoQuery: "retracción escapular técnica trapecio romboides" },
  { id: "buenos_dias", name: "Buenos Días con Barra", muscle: "Espalda baja / Femoral", group: "espalda_baja", secondary: [{ group: "femoral", weight: 0.4 }, { group: "gluteo", weight: 0.3 }], nota: "Poco peso al principio; espalda neutra al flexionar la cadera.", videoQuery: "buenos días con barra técnica good morning" },
  { id: "supermans", name: "Supermans", muscle: "Espalda baja", group: "espalda_baja", secondary: [{ group: "gluteo", weight: 0.2 }], nota: "Tumbado boca abajo, levantá brazos y piernas a la vez de forma controlada.", videoQuery: "supermans técnica espalda baja" },
  // Hombros (catálogo extendido)
  { id: "press_militar_pie_barra", name: "Press Militar de Pie con Barra", muscle: "Deltoides ant.", group: "deltoide_anterior", secondary: [{ group: "triceps", weight: 0.3, alwaysCount: true }, { group: "trapecio", weight: 0.2 }, { group: "core", weight: 0.15 }], nota: "Apretá el core para no arquear la espalda baja al empujar.", videoQuery: "press militar de pie con barra técnica" },
  { id: "press_militar_sentado_barra", name: "Press Militar Sentado con Barra", muscle: "Deltoides ant.", group: "deltoide_anterior", secondary: [{ group: "triceps", weight: 0.3, alwaysCount: true }], nota: "El banco te quita el impulso de piernas, foco puro en el hombro.", videoQuery: "press militar sentado con barra técnica" },
  { id: "press_militar_smith_otravar", name: "Press Militar en Máquina Smith", muscle: "Deltoides ant.", group: "deltoide_anterior", secondary: [{ group: "triceps", weight: 0.3, alwaysCount: true }], nota: "Recorrido fijo hacia adelante, no lo hagas tras nuca para proteger el hombro.", videoQuery: "press militar smith técnica frontal" },
  { id: "press_hombro_una_mano", name: "Press de Hombro a Una Mano", muscle: "Deltoides ant.", group: "deltoide_anterior", secondary: [{ group: "triceps", weight: 0.25, alwaysCount: true }, { group: "core", weight: 0.2 }], nota: "De pie con una mancuerna, exige estabilidad extra del core de ese lado.", videoQuery: "press de hombro a una mano técnica" },
  { id: "z_press", name: "Z Press", muscle: "Deltoides ant. / Core", group: "deltoide_anterior", secondary: [{ group: "triceps", weight: 0.25, alwaysCount: true }, { group: "core", weight: 0.25 }], nota: "Sentado en el piso con piernas estiradas.", videoQuery: "z press técnica hombros" },
  { id: "vuelos_laterales_polea_baja", name: "Elevaciones Laterales en Polea Baja", muscle: "Deltoides lateral", group: "deltoide_lateral", nota: "Tensión constante incluso al inicio del recorrido.", videoQuery: "elevaciones laterales polea baja técnica" },
  { id: "vuelos_laterales_inclinado", name: "Elevaciones Laterales Inclinadas", muscle: "Deltoides lateral", group: "deltoide_lateral", nota: "Acostado de lado en un banco inclinado.", videoQuery: "elevaciones laterales inclinadas técnica" },
  { id: "cruces_invertidos_polea", name: "Cruces Invertidos en Polea Alta", muscle: "Deltoides post.", group: "deltoide_posterior", secondary: [{ group: "trapecio", weight: 0.15 }], nota: "Poleas cruzadas a la altura de los hombros.", videoQuery: "cruces invertidos polea alta técnica deltoides posterior" },
  // Bíceps (catálogo extendido)
  { id: "curl_barra_recta", name: "Curl con Barra Recta", muscle: "Bíceps", group: "biceps", nota: "Codos fijos pegados al torso, no los lleves hacia adelante al subir.", videoQuery: "curl con barra recta técnica bíceps" },
  { id: "curl_polea_cuerda", name: "Curl en Polea Baja con Cuerda", muscle: "Bíceps", group: "biceps", nota: "Separá un poco las manos arriba para sumar contracción extra.", videoQuery: "curl polea baja cuerda técnica bíceps" },
  { id: "curl_spider", name: "Curl Spider", muscle: "Bíceps", group: "biceps", nota: "Boca abajo en un banco inclinado.", videoQuery: "curl spider técnica bíceps" },
  { id: "curl_zottman", name: "Curl Zottman", muscle: "Bíceps / Antebrazo", group: "biceps", loadFactor: 2, nota: "Subí en supinación y girá las muñecas para bajar en pronación.", videoQuery: "curl zottman técnica bíceps antebrazo" },
  { id: "curl_hercules", name: "Curl Hércules", muscle: "Bíceps", group: "biceps", nota: "En poleas dobles, brazos abiertos en cruz, llevá las manos hacia los hombros.", videoQuery: "curl hércules técnica bíceps poleas" },
  // Tríceps (catálogo extendido)
  { id: "triceps_trasnuca_polea", name: "Extensión de Tríceps Tras Nuca en Polea", muscle: "Tríceps", group: "triceps", nota: "Codos fijos cerca de la cabeza.", videoQuery: "extensión tríceps tras nuca polea técnica" },
  { id: "flexiones_diamante", name: "Flexiones Diamante", muscle: "Tríceps", group: "triceps", rankExcluded: true, nota: "Manos juntas formando un rombo debajo del pecho.", videoQuery: "flexiones diamante técnica tríceps" },
  // Antebrazos
  { id: "curl_muneca_pronacion", name: "Curl de Muñeca en Pronación", muscle: "Antebrazo (extensores)", group: "antebrazos", nota: "Palmas hacia abajo, subí solo la muñeca sin mover el antebrazo.", videoQuery: "curl de muñeca pronación técnica antebrazo" },
  { id: "curl_muneca_supinacion", name: "Curl de Muñeca en Supinación", muscle: "Antebrazo (flexores)", group: "antebrazos", nota: "Palmas hacia arriba, apoyá los antebrazos y flexioná solo la muñeca.", videoQuery: "curl de muñeca supinación técnica antebrazo" },
  { id: "rodillo_muneca", name: "Rodillo de Muñeca", muscle: "Antebrazo", group: "antebrazos", nota: "Enrollá la cuerda con peso girando las muñecas.", videoQuery: "rodillo de muñeca técnica antebrazo" },
  { id: "sujecion_discos_pellizco", name: "Sujeción de Discos por Pellizco", muscle: "Antebrazo / Agarre", group: "antebrazos", nota: "Sostené discos lisos solo con la punta de los dedos el mayor tiempo posible.", videoQuery: "sujeción de discos por pellizco técnica agarre" },
  // Cuádriceps (catálogo extendido)
  { id: "sentadilla_frontal", name: "Sentadilla Frontal", muscle: "Cuádriceps", group: "cuadriceps", secondary: [{ group: "gluteo", weight: 0.3 }, { group: "aductores", weight: 0.12 }, { group: "core", weight: 0.2 }], nota: "Barra apoyada adelante en los hombros.", videoQuery: "sentadilla frontal técnica front squat" },
  { id: "sentadilla_sissy", name: "Sentadilla Sissy", muscle: "Cuádriceps", group: "cuadriceps", nota: "Sostenete de algo fijo, rodillas adelante, torso recto.", videoQuery: "sentadilla sissy técnica cuádriceps" },
  { id: "zancadas_atras", name: "Zancadas hacia Atrás", muscle: "Cuádriceps / Glúteo", group: "cuadriceps", secondary: [{ group: "gluteo", weight: 0.4 }, { group: "femoral", weight: 0.15 }], nota: "Dar el paso hacia atrás suele ser más suave para la rodilla que adelante.", videoQuery: "zancadas hacia atrás técnica reverse lunge" },
  { id: "sentadilla_zercher", name: "Sentadilla Zercher", muscle: "Cuádriceps", group: "cuadriceps", secondary: [{ group: "gluteo", weight: 0.3 }, { group: "core", weight: 0.25 }], nota: "Barra sostenida en el pliegue de los codos, exige mucho del core.", videoQuery: "sentadilla zercher técnica" },
  { id: "sentadilla_pistol", name: "Sentadilla Pistol", muscle: "Cuádriceps", group: "cuadriceps", secondary: [{ group: "gluteo", weight: 0.3 }, { group: "core", weight: 0.2 }], nota: "A una sola pierna; progresá de a poco con la movilidad.", videoQuery: "sentadilla pistol técnica una pierna" },
  // Femoral (catálogo extendido)
  { id: "peso_muerto_rumano_mancuernas", name: "Peso Muerto Rumano con Mancuernas", muscle: "Femoral", group: "femoral", loadFactor: 2, secondary: [{ group: "gluteo", weight: 0.35 }, { group: "dorsales", weight: 0.15 }, { group: "antebrazos", weight: 0.15 }, { group: "espalda_baja", weight: 0.2 }], nota: "Mismo patrón que con barra, pero con más libertad en la trayectoria.", videoQuery: "peso muerto rumano con mancuernas técnica" },
  { id: "curl_femoral_sentado", name: "Curl Femoral Sentado", muscle: "Femoral", group: "femoral", nota: "Cadera flexionada: mayor estiramiento previo del isquiotibial.", videoQuery: "curl femoral sentado técnica" },
  { id: "curl_femoral_pie", name: "Curl Femoral de Pie", muscle: "Femoral", group: "femoral", nota: "Trabajo unilateral, apoyate bien para no compensar con la cadera.", videoQuery: "curl femoral de pie técnica" },
  { id: "curl_femoral_nordico", name: "Curl Femoral Nórdico", muscle: "Femoral", group: "femoral", rankExcluded: true, nota: "Bajá lo más lento posible controlando con los isquiotibiales.", videoQuery: "curl femoral nórdico técnica nordic curl" },
  { id: "glute_ham_raise", name: "Glute Ham Raise", muscle: "Femoral / Glúteo", group: "femoral", rankExcluded: true, nota: "Combina cadera y rodilla en un solo movimiento.", videoQuery: "glute ham raise técnica" },
  // Glúteo y cadera (catálogo extendido)
  { id: "hip_thrust_unilateral", name: "Hip Thrust Unilateral", muscle: "Glúteo", group: "gluteo", secondary: [{ group: "femoral", weight: 0.2 }], nota: "Una pierna en el piso, la otra extendida. Corrige asimetrías.", videoQuery: "hip thrust unilateral técnica" },
  { id: "paseos_laterales_banda", name: "Paseos Laterales con Banda", muscle: "Glúteo medio", group: "gluteo", nota: "Banda por encima de las rodillas o tobillos.", videoQuery: "paseos laterales con banda técnica monster walk" },
  { id: "sentadilla_sumo", name: "Sentadilla Sumo", muscle: "Glúteo / Aductores", group: "gluteo", secondary: [{ group: "cuadriceps", weight: 0.3 }, { group: "femoral", weight: 0.15 }, { group: "aductores", weight: 0.3 }], nota: "Postura ancha con puntas afuera.", videoQuery: "sentadilla sumo técnica" },
  { id: "hiperextension_invertida", name: "Hiperextensión Invertida", muscle: "Glúteo / Espalda baja", group: "espalda_baja", secondary: [{ group: "gluteo", weight: 0.3 }], nota: "Torso fijo, levantás las piernas en vez del torso — cuidá no usar impulso.", videoQuery: "hiperextensión invertida técnica reverse hyper" },
  { id: "plancha_copenhague", name: "Plancha Copenhague", muscle: "Aductores", group: "gluteo", nota: "Pierna de arriba apoyada en un banco.", videoQuery: "plancha copenhague técnica aductores" },
  { id: "aduccion_polea_baja", name: "Aducción de Cadera en Polea Baja", muscle: "Aductores", group: "gluteo", nota: "De pie, cruzá la pierna por delante del cuerpo en un arco controlado.", videoQuery: "aducción cadera polea baja técnica" },
  // Pantorrillas (catálogo extendido)
  { id: "elevacion_talones_burro", name: "Elevación de Talones tipo Burro", muscle: "Pantorrillas", group: "pantorrillas", nota: "Torso inclinado hacia adelante.", videoQuery: "elevación de talones tipo burro técnica donkey calf raise" },
  // Core (catálogo extendido)
  { id: "crunch_polea_alta", name: "Crunch en Polea Alta", muscle: "Core", group: "core", nota: "Arrodillado: flexioná la zona media, no tires con los brazos.", videoQuery: "crunch polea alta arrodillado técnica" },
  { id: "crunch_banco_declinado", name: "Crunch en Banco Declinado", muscle: "Core", group: "core", nota: "Mayor rango que en el piso, controlá la bajada sin dejarte caer.", videoQuery: "crunch banco declinado técnica" },
  { id: "crunch_fitball", name: "Crunch en Fitball", muscle: "Core", group: "core", nota: "La base inestable suma rango excéntrico.", videoQuery: "crunch en fitball técnica" },
  { id: "v_ups", name: "V-Ups", muscle: "Core", group: "core", nota: "Subís piernas y torso a la vez formando una V, controlá la bajada.", videoQuery: "v-ups técnica abdominales" },
  { id: "elevacion_rodillas_silla_romana", name: "Elevación de Rodillas en Silla Romana", muscle: "Core / abdomen bajo", group: "core", nota: "Apoyado en los antebrazos, subí las rodillas sin balancear el cuerpo.", videoQuery: "elevación de rodillas silla romana técnica" },
  { id: "elevacion_piernas_tumbado", name: "Elevación de Piernas Tumbado", muscle: "Core / abdomen bajo", group: "core", nota: "Espalda baja pegada al piso, no la dejes despegar al bajar las piernas.", videoQuery: "elevación de piernas tumbado técnica" },
  { id: "tijeras_piernas", name: "Tijeras de Piernas", muscle: "Core", group: "core", nota: "Espalda baja apoyada en el piso.", videoQuery: "tijeras de piernas técnica core" },
  { id: "l_sit", name: "L-Sit", muscle: "Core", group: "core", rankExcluded: true, nota: "Piernas estiradas y paralelas al piso.", videoQuery: "l-sit técnica core" },
  { id: "plancha_rkc", name: "Plancha RKC", muscle: "Core", group: "core", rankExcluded: true, nota: "Apretá con fuerza glúteos y cuádriceps durante toda la plancha.", videoQuery: "plancha rkc técnica core" },
  { id: "paseo_granjero_unilateral", name: "Paseo del Granjero Unilateral", muscle: "Core / oblicuos", group: "core", secondary: [{ group: "antebrazos", weight: 0.4 }, { group: "trapecio", weight: 0.15 }], nota: "Peso de un solo lado, evitá que el torso se incline hacia donde cargás.", videoQuery: "paseo del granjero unilateral técnica suitcase carry" },
  { id: "press_pallof", name: "Press Pallof", muscle: "Core / oblicuos", group: "oblicuos", secondary: [{ group: "deltoide_anterior", weight: 0.15 }], nota: "De costado a la polea; empujá sin rotar el torso.", videoQuery: "press pallof técnica core antirotación" },
  { id: "bird_dog", name: "Bird Dog", muscle: "Core", group: "core", rankExcluded: true, nota: "Cuatro apoyos: estirá brazo y pierna opuestos con espalda estable.", videoQuery: "bird dog técnica core" },
  { id: "dead_bug", name: "Dead Bug", muscle: "Core", group: "core", rankExcluded: true, nota: "Boca arriba: bajá brazo y pierna opuestos sin despegar la lumbar.", videoQuery: "dead bug técnica core" },
  { id: "lenador_polea", name: "Leñador en Polea", muscle: "Core / oblicuos", group: "oblicuos", secondary: [{ group: "deltoide_anterior", weight: 0.15 }], nota: "Movimiento diagonal de arriba a abajo (o viceversa).", videoQuery: "leñador polea técnica core woodchopper" },
  { id: "crunch_lateral", name: "Crunch Lateral", muscle: "Core / oblicuos", group: "oblicuos", nota: "Tumbado de costado, flexioná hacia el oblicuo sin tirar del cuello.", videoQuery: "crunch lateral técnica oblicuos" },
  { id: "giros_torso_barra", name: "Giros de Torso con Barra", muscle: "Core / oblicuos", group: "core", nota: "Barra sobre los hombros, girá despacio y controlado — nunca de golpe.", videoQuery: "giros de torso con barra técnica core" },
  { id: "stomach_vacuum", name: "Stomach Vacuum", muscle: "Core (transverso)", group: "core", nota: "Exhalá todo el aire y metiendo el ombligo hacia la columna.", videoQuery: "stomach vacuum técnica transverso abdominal" },
  // Cardio — a diferencia del resto, no se registran en reps×kg sino en
  // minutos (y distancia, opcional). `cardio: true` es lo que le avisa a
  // SetRow que tiene que mostrar esos campos en vez de los de siempre.
  // rankExcluded porque no tienen una carga comparable para el sistema de
  // rangos por músculo (igual que pasa con dominadas, planchas, etc.).
  { id: "cinta_caminar", name: "Cinta — Caminar", muscle: "Cardio", group: "cardio", cardio: true, rankExcluded: true, nota: "Ritmo cómodo, ideal para entrada en calor o cardio de baja intensidad.", videoQuery: "caminar en cinta técnica" },
  { id: "cinta_correr", name: "Cinta — Correr", muscle: "Cardio", group: "cardio", cardio: true, rankExcluded: true, nota: "Ajustá la inclinación si querés sumar dificultad sin aumentar la velocidad.", videoQuery: "correr en cinta técnica" },
  { id: "bicicleta_fija", name: "Bicicleta Fija", muscle: "Cardio", group: "cardio", cardio: true, rankExcluded: true, nota: "Asiento a la altura donde la pierna casi se estira abajo.", videoQuery: "bicicleta fija técnica" },
  { id: "elíptico", name: "Elíptico", muscle: "Cardio", group: "cardio", cardio: true, rankExcluded: true, nota: "Bajo impacto en las articulaciones, buena alternativa a correr.", videoQuery: "elíptico máquina técnica" },
  { id: "remo_ergometro", name: "Remo (Ergómetro)", muscle: "Cardio", group: "cardio", cardio: true, rankExcluded: true, nota: "La fuerza sale de las piernas primero.", videoQuery: "remo ergómetro técnica rowing machine" },
  { id: "escaladora", name: "Escaladora (StairMaster)", muscle: "Cardio", group: "cardio", cardio: true, rankExcluded: true, nota: "Pasos cortos y constantes rinden mejor que pisotones largos y salteados.", videoQuery: "escaladora stairmaster técnica" },
  { id: "soga", name: "Soga (Saltar la Cuerda)", muscle: "Cardio", group: "cardio", cardio: true, rankExcluded: true, nota: "Saltos chicos apoyando la punta del pie.", videoQuery: "saltar la cuerda técnica" },
  { id: "bicicleta_aire", name: "Bicicleta de Aire (Assault Bike)", muscle: "Cardio", group: "cardio", cardio: true, rankExcluded: true, nota: "La intensidad sube con el esfuerzo; ideal para intervalos duros.", videoQuery: "assault bike air bike técnica" },
  { id: "caminata_aire_libre", name: "Caminata / Trote al Aire Libre", muscle: "Cardio", group: "cardio", cardio: true, rankExcluded: true, nota: "Sin máquina — registrá el tiempo y.", videoQuery: "trote al aire libre técnica" },

  { id: "elevacion_tibial", name: "Elevación Tibial (Tibial Raise)", muscle: "Tibial anterior", group: "tibial_anterior", nota: "Talones en el piso, levantá las puntas lo más alto posible.", videoQuery: "tibial raise técnica tibialis anterior" },
  { id: "caminata_tibial", name: "Caminata sobre los Talones", muscle: "Tibial anterior", group: "tibial_anterior", rankExcluded: true, nota: "Caminá apoyando solo los talones, puntas al aire.", videoQuery: "heel walk tibialis anterior" },
  { id: "crunch_oblicuo", name: "Crunch Oblicuo", muscle: "Oblicuos", group: "oblicuos", nota: "Llevá el codo hacia la rodilla opuesta sin tirar del cuello.", videoQuery: "crunch oblicuo técnica obliques" },
  { id: "rotacion_torso_polea", name: "Rotación de Torso en Polea", muscle: "Oblicuos", group: "oblicuos", nota: "Polea a la altura del pecho, girá el torso sin mover los pies.", videoQuery: "rotación torso polea oblicuos cable rotation" },

  // ═══════════════════════════════════════════════════════════════════════
  // VARIANTES CON MANCUERNAS Y AMPLIACIÓN DEL CATÁLOGO
  // Todo lo que lleva DOS mancuernas tiene loadFactor: 2 — así el rango por
  // músculo cuenta la carga REAL (2×20kg = 40kg), no la de una sola. Los
  // ejercicios a una mano (unilaterales) van sin loadFactor: el peso que
  // registrás ya es el que levanta ese lado.
  // ═══════════════════════════════════════════════════════════════════════

  // ---- Pecho (mancuernas y variantes) ----
  { id: "aperturas_declinadas_mancuernas", name: "Aperturas Declinadas con Mancuernas", muscle: "Pectoral inf.", group: "pectoral_medio", loadFactor: 2, nota: "Banco en declive, codos con flexión fija: pecho inferior.", videoQuery: "aperturas declinadas mancuernas técnica" },
  { id: "press_guillotina", name: "Press Guillotina", muscle: "Pectoral sup.", group: "pectoral_superior", secondary: [{ group: "triceps", weight: 0.25, alwaysCount: true }, { group: "deltoide_anterior", weight: 0.3 }], nota: "Barra hacia el cuello con codos abiertos. Usá poco peso y un compañero.", videoQuery: "press guillotina técnica pectoral" },
  { id: "press_banca_pausa", name: "Press Banca con Pausa", muscle: "Pectoral", group: "pectoral_medio", secondary: [{ group: "triceps", weight: 0.35, alwaysCount: true }, { group: "deltoide_anterior", weight: 0.3 }], nota: "Pausa completa de 1-2s en el pecho: mata el rebote y construye fuerza.", videoQuery: "press banca con pausa técnica paused bench" },
  { id: "press_banca_tempo", name: "Press Banca Tempo", muscle: "Pectoral", group: "pectoral_medio", secondary: [{ group: "triceps", weight: 0.3, alwaysCount: true }], nota: "Bajada lenta de 3-4 segundos: más tiempo bajo tensión con menos peso.", videoQuery: "press banca tempo excéntrico técnica" },
  { id: "press_floor", name: "Floor Press", muscle: "Pectoral", group: "pectoral_medio", secondary: [{ group: "triceps", weight: 0.45, alwaysCount: true }], nota: "Acostado en el piso: rango corto, muy amigable para el hombro.", videoQuery: "floor press técnica" },
  { id: "press_floor_mancuernas", name: "Floor Press con Mancuernas", muscle: "Pectoral", group: "pectoral_medio", secondary: [{ group: "triceps", weight: 0.4, alwaysCount: true }], loadFactor: 2, nota: "Los codos tocan el piso y frenan: excelente si tenés molestias de hombro.", videoQuery: "floor press mancuernas técnica" },
  { id: "aperturas_polea_pecho", name: "Aperturas en Polea a la Altura del Pecho", muscle: "Pectoral", group: "pectoral_medio", nota: "Tensión pareja en todo el arco, buscá juntar bien al frente.", videoQuery: "aperturas en polea técnica pectoral" },
  { id: "press_pecho_maquina_convergente", name: "Press de Pecho Convergente", muscle: "Pectoral", group: "pectoral_medio", secondary: [{ group: "triceps", weight: 0.3, alwaysCount: true }, { group: "deltoide_anterior", weight: 0.2 }], nota: "Los brazos convergen al frente imitando el arco natural del pecho.", videoQuery: "press pecho convergente máquina técnica" },
  { id: "pullover_mancuerna_pecho", name: "Pullover con Mancuerna (énfasis pecho)", muscle: "Pectoral", group: "pectoral_medio", secondary: [{ group: "dorsales", weight: 0.3 }, { group: "triceps", weight: 0.2, alwaysCount: true }], nota: "Codos más cerrados y torso plano: el foco va al pectoral.", videoQuery: "pullover mancuerna pectoral técnica" },

  // ---- Espalda (mancuernas y variantes) ----
  { id: "remo_mancuernas_dos_manos", name: "Remo con Mancuernas a Dos Manos", muscle: "Dorsal medio", group: "dorsales", secondary: [{ group: "biceps", weight: 0.3 }, { group: "deltoide_posterior", weight: 0.25 }, { group: "trapecio", weight: 0.2 }, { group: "antebrazos", weight: 0.15 }], loadFactor: 2, nota: "Torso a 45°, llevá ambas mancuernas hacia la cadera.", videoQuery: "remo con mancuernas dos manos técnica" },
  { id: "remo_mancuernas_pecho_apoyado", name: "Remo con Mancuernas Pecho Apoyado", muscle: "Dorsal medio", group: "dorsales", secondary: [{ group: "biceps", weight: 0.25 }, { group: "deltoide_posterior", weight: 0.3 }, { group: "trapecio", weight: 0.25 }], loadFactor: 2, nota: "Banco inclinado a 30-45°: saca la lumbar de la ecuación.", videoQuery: "remo mancuernas pecho apoyado incline row técnica" },
  { id: "remo_kroc", name: "Remo Kroc", muscle: "Dorsal", group: "dorsales", secondary: [{ group: "biceps", weight: 0.3 }, { group: "trapecio", weight: 0.25 }, { group: "antebrazos", weight: 0.35 }], nota: "Remo unilateral pesado con algo de impulso controlado, altas reps.", videoQuery: "remo kroc técnica kroc row" },
  { id: "peso_muerto_mancuernas", name: "Peso Muerto con Mancuernas", muscle: "Espalda baja / Femoral", group: "dorsales", secondary: [{ group: "gluteo", weight: 0.4 }, { group: "femoral", weight: 0.35 }, { group: "trapecio", weight: 0.25 }, { group: "antebrazos", weight: 0.3 }, { group: "espalda_baja", weight: 0.4 }], loadFactor: 2, nota: "Ideal si no tenés barra; misma bisagra de cadera, espalda neutra.", videoQuery: "peso muerto con mancuernas técnica" },
  { id: "peso_muerto_trap_bar", name: "Peso Muerto con Barra Hexagonal", muscle: "Espalda / Pierna", group: "dorsales", secondary: [{ group: "cuadriceps", weight: 0.35 }, { group: "gluteo", weight: 0.4 }, { group: "femoral", weight: 0.25 }, { group: "trapecio", weight: 0.3 }, { group: "espalda_baja", weight: 0.3 }], nota: "La barra hexagonal te centra la carga: más amigable para la lumbar.", videoQuery: "peso muerto trap bar técnica" },
  { id: "peso_muerto_deficit", name: "Peso Muerto con Déficit", muscle: "Espalda baja / Femoral", group: "dorsales", secondary: [{ group: "gluteo", weight: 0.4 }, { group: "femoral", weight: 0.4 }, { group: "espalda_baja", weight: 0.45 }], nota: "Parado sobre un disco: más rango, más difícil el arranque.", videoQuery: "peso muerto con déficit técnica deficit deadlift" },
  { id: "rack_pull", name: "Rack Pull", muscle: "Espalda / Trapecio", group: "dorsales", secondary: [{ group: "trapecio", weight: 0.4 }, { group: "gluteo", weight: 0.25 }, { group: "antebrazos", weight: 0.35 }, { group: "espalda_baja", weight: 0.35 }], nota: "Peso muerto parcial desde las rejillas: permite cargar muy pesado.", videoQuery: "rack pull técnica" },
  { id: "remo_invertido", name: "Remo Invertido", muscle: "Dorsal medio", group: "dorsales", rankExcluded: true, nota: "Con tu peso corporal bajo una barra fija; cuanto más horizontal, más difícil.", videoQuery: "remo invertido técnica inverted row" },
  { id: "jalon_pecho_agarre_supino", name: "Jalón al Pecho Agarre Supino", muscle: "Dorsal", group: "dorsales", secondary: [{ group: "biceps", weight: 0.45 }, { group: "antebrazos", weight: 0.2 }], nota: "Palmas hacia vos: más bíceps y dorsal bajo.", videoQuery: "jalón al pecho agarre supino técnica" },
  { id: "remo_polea_una_mano", name: "Remo en Polea a Una Mano", muscle: "Dorsal", group: "dorsales", secondary: [{ group: "biceps", weight: 0.3 }, { group: "deltoide_posterior", weight: 0.2 }], nota: "Unilateral: buscá el rango completo estirando bien al frente.", videoQuery: "remo polea una mano técnica" },
  { id: "encogimientos_trap_bar", name: "Encogimientos con Barra Hexagonal", muscle: "Trapecio", group: "trapecio", secondary: [{ group: "antebrazos", weight: 0.3 }], nota: "La carga centrada te deja cargar más que con barra recta.", videoQuery: "encogimientos barra hexagonal técnica" },
  { id: "encogimientos_inclinado", name: "Encogimientos Inclinados con Mancuernas", muscle: "Trapecio medio", group: "trapecio", secondary: [{ group: "deltoide_posterior", weight: 0.25 }], loadFactor: 2, nota: "Pecho apoyado en banco inclinado: foco en el trapecio medio.", videoQuery: "encogimientos inclinados mancuernas técnica" },
  { id: "good_morning_mancuerna", name: "Buenos Días con Mancuerna", muscle: "Espalda baja / Femoral", group: "espalda_baja", secondary: [{ group: "femoral", weight: 0.4 }, { group: "gluteo", weight: 0.3 }], nota: "Mancuerna contra el pecho, bisagra de cadera con espalda neutra.", videoQuery: "buenos días con mancuerna técnica" },
  { id: "extension_lumbar_45", name: "Extensión Lumbar a 45°", muscle: "Espalda baja", group: "espalda_baja", secondary: [{ group: "gluteo", weight: 0.35 }, { group: "femoral", weight: 0.3 }], nota: "Banco a 45°: podés sumar un disco contra el pecho para cargar más.", videoQuery: "extensión lumbar 45 grados técnica" },

  // ---- Hombros (mancuernas y variantes) ----
  { id: "press_militar_sentado_mancuernas", name: "Press Militar Sentado con Mancuernas", muscle: "Deltoides ant.", group: "deltoide_anterior", secondary: [{ group: "triceps", weight: 0.3, alwaysCount: true }], loadFactor: 2, nota: "Respaldo del banco: foco puro en el hombro, sin impulso de piernas.", videoQuery: "press militar sentado mancuernas técnica" },
  { id: "elevaciones_laterales_una_mano", name: "Elevaciones Laterales a Una Mano", muscle: "Deltoides lateral", group: "deltoide_lateral", nota: "Sostenete con la otra mano y enfocate en un solo lado a la vez.", videoQuery: "elevaciones laterales a una mano técnica" },
  { id: "elevaciones_laterales_lean_away", name: "Elevaciones Laterales Inclinado (Lean Away)", muscle: "Deltoides lateral", group: "deltoide_lateral", nota: "Colgado de una columna, inclinado hacia afuera: más estiramiento inicial.", videoQuery: "elevaciones laterales lean away técnica" },
  { id: "elevaciones_laterales_banda", name: "Elevaciones Laterales con Banda", muscle: "Deltoides lateral", group: "deltoide_lateral", nota: "La resistencia crece al final: buen finisher de bombeo.", videoQuery: "elevaciones laterales con banda técnica" },
  { id: "vuelos_frontales_disco", name: "Elevaciones Frontales con Disco", muscle: "Deltoides ant.", group: "deltoide_anterior", secondary: [{ group: "pectoral_superior", weight: 0.15 }], nota: "Disco sostenido a los costados, subí hasta la altura de los ojos.", videoQuery: "elevaciones frontales con disco técnica" },
  { id: "elevaciones_pajaro_polea", name: "Elevaciones Pájaro en Polea", muscle: "Deltoides post.", group: "deltoide_posterior", secondary: [{ group: "trapecio", weight: 0.2 }], nota: "Tensión constante en todo el arco, mejor que la mancuerna al inicio.", videoQuery: "elevaciones pájaro polea técnica" },
  { id: "elevaciones_pajaro_maquina", name: "Elevaciones Pájaro en Máquina", muscle: "Deltoides post.", group: "deltoide_posterior", secondary: [{ group: "trapecio", weight: 0.2 }], nota: "Recorrido guiado: sumá volumen de posterior sin pensar en la técnica.", videoQuery: "reverse pec deck máquina técnica" },
  { id: "face_pull_banda", name: "Face Pull con Banda", muscle: "Deltoides post.", group: "deltoide_posterior", secondary: [{ group: "trapecio", weight: 0.3 }], nota: "Perfecto para calentar el hombro antes de empujar.", videoQuery: "face pull con banda técnica" },
  { id: "press_landmine_hombro", name: "Press Landmine de Hombro", muscle: "Deltoides ant.", group: "deltoide_anterior", secondary: [{ group: "triceps", weight: 0.25, alwaysCount: true }, { group: "core", weight: 0.2 }], nota: "Trayectoria en arco, muy amigable para hombros con molestias.", videoQuery: "press landmine hombro técnica" },
  { id: "cuban_press", name: "Cuban Press", muscle: "Manguito / Deltoides", group: "deltoide_posterior", secondary: [{ group: "deltoide_lateral", weight: 0.25 }, { group: "trapecio", weight: 0.2 }], loadFactor: 2, nota: "Poco peso: rotación externa + press. Excelente para la salud del hombro.", videoQuery: "cuban press técnica hombro" },
  { id: "rotacion_externa_polea", name: "Rotación Externa en Polea", muscle: "Manguito rotador", group: "deltoide_posterior", nota: "Codo pegado al torso a 90°, poco peso y mucho control.", videoQuery: "rotación externa polea manguito rotador técnica" },

  // ---- Bíceps (mancuernas y variantes) ----
  { id: "curl_mancuernas_simultaneo", name: "Curl con Mancuernas Simultáneo", muscle: "Bíceps", group: "biceps", loadFactor: 2, nota: "Ambos brazos a la vez, codos fijos al torso.", videoQuery: "curl mancuernas simultáneo técnica" },
  { id: "curl_martillo_cruzado", name: "Curl Martillo Cruzado", muscle: "Bíceps / braquial", group: "biceps", nota: "Llevá la mancuerna hacia el hombro opuesto cruzando el torso.", videoQuery: "curl martillo cruzado técnica cross body hammer" },
  { id: "curl_martillo_cuerda", name: "Curl Martillo en Polea con Cuerda", muscle: "Bíceps / braquial", group: "biceps", secondary: [{ group: "antebrazos", weight: 0.3 }], nota: "Agarre neutro con tensión constante: braquial y braquiorradial.", videoQuery: "curl martillo cuerda polea técnica" },
  { id: "curl_scott_mancuerna", name: "Curl Scott con Mancuerna", muscle: "Bíceps", group: "biceps", nota: "Unilateral en el banco Scott: aislamiento total, cero impulso.", videoQuery: "curl scott mancuerna unilateral técnica" },
  { id: "curl_scott_maquina", name: "Curl en Máquina Scott", muscle: "Bíceps", group: "biceps", nota: "Recorrido guiado con brazos apoyados, ideal para las últimas series.", videoQuery: "curl máquina scott técnica preacher machine" },
  { id: "curl_araña_barra", name: "Curl Araña con Barra", muscle: "Bíceps", group: "biceps", nota: "Boca abajo sobre banco inclinado, brazos colgando perpendiculares.", videoQuery: "curl araña barra técnica spider curl" },
  { id: "curl_21s", name: "Curl 21s", muscle: "Bíceps", group: "biceps", nota: "7 reps abajo + 7 arriba + 7 completas. Bombeo brutal con poco peso.", videoQuery: "curl 21s técnica bíceps" },
  { id: "curl_inclinado_martillo", name: "Curl Martillo en Banco Inclinado", muscle: "Bíceps / braquial", group: "biceps", loadFactor: 2, nota: "Agarre neutro con el brazo colgando atrás: máximo estiramiento.", videoQuery: "curl martillo banco inclinado técnica" },
  { id: "curl_banda", name: "Curl con Banda Elástica", muscle: "Bíceps", group: "biceps", rankExcluded: true, nota: "La resistencia sube al final del recorrido; buen finisher en casa.", videoQuery: "curl con banda elástica técnica" },
  { id: "chin_up_lastre", name: "Chin Up con Lastre", muscle: "Bíceps / Dorsal", group: "biceps", rankExcluded: true, nota: "Dominada supina con peso extra: uno de los mejores para bíceps.", videoQuery: "chin up con lastre técnica" },

  // ---- Tríceps (mancuernas y variantes) ----
  { id: "extension_triceps_mancuerna_una_mano", name: "Extensión de Tríceps a Una Mano", muscle: "Tríceps", group: "triceps", nota: "Mancuerna detrás de la cabeza con un solo brazo, codo apuntando arriba.", videoQuery: "extensión tríceps una mano mancuerna técnica" },
  { id: "extension_triceps_mancuernas_dos", name: "Extensión de Tríceps con Mancuernas Acostado", muscle: "Tríceps", group: "triceps", loadFactor: 2, nota: "Como el press francés pero con mancuernas: más amigable para el codo.", videoQuery: "extensión tríceps mancuernas acostado técnica" },
  { id: "press_frances_mancuernas", name: "Press Francés con Mancuernas", muscle: "Tríceps", group: "triceps", loadFactor: 2, nota: "Codos fijos apuntando al techo, bajá hasta la frente.", videoQuery: "press francés con mancuernas técnica" },
  { id: "triceps_patada_polea", name: "Patada de Tríceps en Polea", muscle: "Tríceps", group: "triceps", nota: "Tensión constante en la contracción final, mejor que con mancuerna.", videoQuery: "patada tríceps polea técnica" },
  { id: "triceps_polea_barra_recta", name: "Tríceps en Polea con Barra Recta", muscle: "Tríceps", group: "triceps", nota: "Agarre pronado firme, codos pegados al torso.", videoQuery: "tríceps polea barra recta técnica" },
  { id: "triceps_polea_una_mano", name: "Tríceps en Polea a Una Mano", muscle: "Tríceps", group: "triceps", nota: "Agarre supino o neutro, unilateral: buscá los desbalances.", videoQuery: "tríceps polea una mano técnica" },
  { id: "jm_press", name: "JM Press", muscle: "Tríceps", group: "triceps", secondary: [{ group: "pectoral_medio", weight: 0.2 }], nota: "Híbrido entre press cerrado y press francés: muy usado en powerlifting.", videoQuery: "jm press técnica tríceps" },
  { id: "skull_crusher_barra_z", name: "Rompecráneos con Barra Z", muscle: "Tríceps", group: "triceps", nota: "Bajá hacia atrás de la cabeza, no a la frente: más estiramiento.", videoQuery: "rompecráneos barra z técnica skull crusher" },
  { id: "fondos_maquina", name: "Fondos en Máquina", muscle: "Tríceps", group: "triceps", secondary: [{ group: "pectoral_medio", weight: 0.25 }], nota: "Carga controlada: podés progresar de a poco sin depender del peso corporal.", videoQuery: "fondos en máquina técnica dip machine" },
  { id: "triceps_banda", name: "Extensión de Tríceps con Banda", muscle: "Tríceps", group: "triceps", rankExcluded: true, nota: "Ideal para entrenar en casa o calentar el codo antes de empujar.", videoQuery: "extensión tríceps banda elástica técnica" },

  // ---- Cuádriceps (mancuernas y variantes) ----
  { id: "sentadilla_bulgara_mancuernas", name: "Sentadilla Búlgara con Mancuernas", muscle: "Cuádriceps / Glúteo", group: "cuadriceps", secondary: [{ group: "gluteo", weight: 0.35 }, { group: "femoral", weight: 0.2 }, { group: "aductores", weight: 0.12 }], loadFactor: 2, nota: "Una mancuerna en cada mano. Con dos de 20kg estás cargando 40kg reales.", videoQuery: "sentadilla búlgara con mancuernas técnica" },
  { id: "zancadas_mancuernas", name: "Zancadas con Mancuernas", muscle: "Cuádriceps / Glúteo", group: "cuadriceps", secondary: [{ group: "gluteo", weight: 0.4 }, { group: "femoral", weight: 0.15 }], loadFactor: 2, nota: "Una en cada mano; mantené el torso erguido y el paso largo.", videoQuery: "zancadas con mancuernas técnica" },
  { id: "zancadas_caminando", name: "Zancadas Caminando", muscle: "Cuádriceps / Glúteo", group: "cuadriceps", secondary: [{ group: "gluteo", weight: 0.45 }, { group: "femoral", weight: 0.2 }], loadFactor: 2, nota: "Avanzás paso a paso: mucho estímulo de glúteo y equilibrio.", videoQuery: "zancadas caminando técnica walking lunges" },
  { id: "step_up_mancuernas", name: "Step Up con Mancuernas", muscle: "Cuádriceps / Glúteo", group: "cuadriceps", secondary: [{ group: "gluteo", weight: 0.4 }, { group: "femoral", weight: 0.15 }], loadFactor: 2, nota: "Empujá solo con la pierna de arriba, sin rebotar con la de abajo.", videoQuery: "step up con mancuernas técnica" },
  { id: "sentadilla_copa_doble", name: "Sentadilla con Dos Mancuernas", muscle: "Cuádriceps", group: "cuadriceps", secondary: [{ group: "gluteo", weight: 0.3 }, { group: "core", weight: 0.15 }], loadFactor: 2, nota: "Mancuernas apoyadas en los hombros o colgando a los costados.", videoQuery: "sentadilla con dos mancuernas técnica" },
  { id: "sentadilla_pausa", name: "Sentadilla con Pausa", muscle: "Cuádriceps", group: "cuadriceps", secondary: [{ group: "gluteo", weight: 0.4 }, { group: "core", weight: 0.2 }, { group: "espalda_baja", weight: 0.15 }], nota: "2-3 segundos abajo sin perder tensión: elimina el rebote.", videoQuery: "sentadilla con pausa técnica paused squat" },
  { id: "sentadilla_bulgara_barra", name: "Sentadilla Búlgara con Barra", muscle: "Cuádriceps / Glúteo", group: "cuadriceps", secondary: [{ group: "gluteo", weight: 0.35 }, { group: "femoral", weight: 0.2 }], nota: "Barra en la espalda: permite cargar más que con mancuernas.", videoQuery: "sentadilla búlgara con barra técnica" },
  { id: "prensa_unilateral", name: "Prensa a Una Pierna", muscle: "Cuádriceps", group: "cuadriceps", secondary: [{ group: "gluteo", weight: 0.35 }, { group: "femoral", weight: 0.15 }], nota: "Corrige desbalances; poné el pie centrado en la plataforma.", videoQuery: "prensa a una pierna técnica" },
  { id: "extension_cuadriceps_unilateral", name: "Extensión de Cuádriceps a Una Pierna", muscle: "Cuádriceps", group: "cuadriceps", nota: "Trabajo aislado por lado: ideal si una pierna quedó atrás.", videoQuery: "extensión cuádriceps una pierna técnica" },
  { id: "sentadilla_belt_squat", name: "Belt Squat", muscle: "Cuádriceps", group: "cuadriceps", secondary: [{ group: "gluteo", weight: 0.3 }], nota: "Carga colgada de la cadera: cero compresión en la columna.", videoQuery: "belt squat técnica" },
  { id: "sentadilla_hack_invertida", name: "Hack Squat Invertida", muscle: "Glúteo / Femoral", group: "gluteo", secondary: [{ group: "cuadriceps", weight: 0.25 }, { group: "femoral", weight: 0.3 }], nota: "Mirando hacia la máquina: el foco se va al glúteo y femoral.", videoQuery: "hack squat invertida reverse técnica" },
  { id: "sentadilla_cajon", name: "Sentadilla al Cajón", muscle: "Cuádriceps", group: "cuadriceps", secondary: [{ group: "gluteo", weight: 0.4 }, { group: "femoral", weight: 0.2 }], nota: "Sentate y volvé a subir sin rebotar: enseña a sentarse hacia atrás.", videoQuery: "sentadilla al cajón técnica box squat" },

  // ---- Femoral (mancuernas y variantes) ----
  { id: "peso_muerto_una_pierna_mancuerna", name: "Peso Muerto a Una Pierna con Mancuerna", muscle: "Femoral / Glúteo", group: "femoral", secondary: [{ group: "gluteo", weight: 0.4 }, { group: "core", weight: 0.25 }, { group: "espalda_baja", weight: 0.2 }], nota: "Unilateral: mucho equilibrio y trabajo del glúteo medio.", videoQuery: "peso muerto una pierna mancuerna técnica" },
  { id: "peso_muerto_rigido_mancuernas", name: "Peso Muerto Piernas Rígidas con Mancuernas", muscle: "Femoral", group: "femoral", secondary: [{ group: "gluteo", weight: 0.35 }, { group: "espalda_baja", weight: 0.2 }], loadFactor: 2, nota: "Rodillas casi rectas, bajá las mancuernas pegadas a las piernas.", videoQuery: "peso muerto piernas rígidas mancuernas técnica" },
  { id: "curl_femoral_fitball", name: "Curl Femoral con Fitball", muscle: "Femoral", group: "femoral", rankExcluded: true, secondary: [{ group: "gluteo", weight: 0.3 }], nota: "Talones sobre la pelota: acercala al glúteo con la cadera arriba.", videoQuery: "curl femoral fitball técnica" },
  { id: "curl_femoral_deslizante", name: "Curl Femoral con Deslizadores", muscle: "Femoral", group: "femoral", rankExcluded: true, secondary: [{ group: "gluteo", weight: 0.3 }], nota: "Con toallas o sliders en el piso: excelente en casa.", videoQuery: "curl femoral sliders técnica" },
  { id: "buenos_dias_smith", name: "Buenos Días en Smith", muscle: "Femoral / Espalda baja", group: "femoral", secondary: [{ group: "gluteo", weight: 0.35 }, { group: "espalda_baja", weight: 0.4 }], nota: "El riel te guía: más seguro para aprender la bisagra de cadera.", videoQuery: "buenos días en smith técnica" },

  // ---- Glúteo (mancuernas y variantes) ----
  { id: "hip_thrust_mancuerna", name: "Hip Thrust con Mancuerna", muscle: "Glúteo", group: "gluteo", secondary: [{ group: "femoral", weight: 0.25 }], nota: "Mancuerna apoyada en la cadera: alternativa si no tenés barra.", videoQuery: "hip thrust con mancuerna técnica" },
  { id: "hip_thrust_maquina", name: "Hip Thrust en Máquina", muscle: "Glúteo", group: "gluteo", secondary: [{ group: "femoral", weight: 0.25 }], nota: "Más cómodo que con barra, permite cargar mucho sin molestias.", videoQuery: "hip thrust máquina técnica" },
  { id: "patada_gluteo_maquina", name: "Patada de Glúteo en Máquina", muscle: "Glúteo", group: "gluteo", nota: "Recorrido guiado, contraé fuerte arriba sin arquear la lumbar.", videoQuery: "patada de glúteo máquina técnica glute kickback" },
  { id: "abduccion_cadera_polea", name: "Abducción de Cadera en Polea", muscle: "Glúteo medio", group: "gluteo", nota: "De pie con tobillera, llevá la pierna hacia afuera sin inclinar el torso.", videoQuery: "abducción cadera polea técnica" },
  { id: "sentadilla_sumo_mancuerna", name: "Sentadilla Sumo con Mancuerna", muscle: "Glúteo / Aductores", group: "gluteo", secondary: [{ group: "cuadriceps", weight: 0.3 }, { group: "aductores", weight: 0.3 }], nota: "Una mancuerna colgando entre las piernas, postura ancha.", videoQuery: "sentadilla sumo con mancuerna técnica" },
  { id: "frog_pump", name: "Frog Pump", muscle: "Glúteo", group: "gluteo", nota: "Plantas de los pies juntas y rodillas afuera: activación de glúteo brutal.", videoQuery: "frog pump técnica glúteo" },
  { id: "puente_gluteo_una_pierna", name: "Puente de Glúteo a Una Pierna", muscle: "Glúteo", group: "gluteo", secondary: [{ group: "femoral", weight: 0.2 }], nota: "Una pierna extendida en el aire: corrige asimetrías.", videoQuery: "puente de glúteo una pierna técnica" },

  // ---- Pantorrillas ----
  { id: "elevacion_talones_mancuernas", name: "Elevación de Talones con Mancuernas", muscle: "Pantorrillas", group: "pantorrillas", loadFactor: 2, nota: "Una mancuerna en cada mano, subí a la punta del pie con pausa arriba.", videoQuery: "elevación de talones con mancuernas técnica" },
  { id: "elevacion_talones_smith", name: "Elevación de Talones en Smith", muscle: "Pantorrillas", group: "pantorrillas", nota: "Barra en la espalda y punta del pie sobre un escalón: rango completo.", videoQuery: "elevación de talones smith técnica" },
  { id: "elevacion_talones_hack", name: "Elevación de Talones en Hack Squat", muscle: "Pantorrillas", group: "pantorrillas", nota: "La máquina te da estabilidad total para enfocarte en el gemelo.", videoQuery: "elevación de talones hack squat técnica" },

  // ---- Core y oblicuos ----
  { id: "crunch_mancuerna", name: "Crunch con Mancuerna", muscle: "Core", group: "core", nota: "Mancuerna contra el pecho para sumar carga al crunch clásico.", videoQuery: "crunch con mancuerna técnica" },
  { id: "inclinacion_lateral_mancuerna", name: "Inclinación Lateral con Mancuerna", muscle: "Oblicuos", group: "oblicuos", nota: "Una sola mancuerna: inclinate hacia ese lado y volvé contrayendo el oblicuo.", videoQuery: "inclinación lateral mancuerna técnica side bend" },
  { id: "mountain_climbers", name: "Mountain Climbers", muscle: "Core", group: "core", rankExcluded: true, nota: "Desde plancha, llevá las rodillas al pecho alternando rápido.", videoQuery: "mountain climbers técnica" },
  { id: "hollow_hold", name: "Hollow Hold", muscle: "Core", group: "core", rankExcluded: true, nota: "Lumbar pegada al piso, brazos y piernas extendidos apenas despegados.", videoQuery: "hollow hold técnica core" },
  { id: "toes_to_bar", name: "Toes to Bar", muscle: "Core / abdomen bajo", group: "core", rankExcluded: true, nota: "Colgado, llevá las puntas de los pies hasta la barra sin balancearte.", videoQuery: "toes to bar técnica" },
  { id: "dragon_flag", name: "Dragon Flag", muscle: "Core", group: "core", rankExcluded: true, nota: "Avanzado: cuerpo recto bajando desde vertical, solo con los hombros apoyados.", videoQuery: "dragon flag técnica" },
  { id: "crunch_bicicleta", name: "Crunch Bicicleta", muscle: "Core / oblicuos", group: "oblicuos", rankExcluded: true, nota: "Codo hacia la rodilla contraria alternando de forma controlada.", videoQuery: "crunch bicicleta técnica bicycle crunch" },
  { id: "windshield_wipers", name: "Limpiaparabrisas", muscle: "Oblicuos", group: "oblicuos", rankExcluded: true, nota: "Piernas juntas girando de lado a lado con la lumbar controlada.", videoQuery: "windshield wipers técnica oblicuos" },
  { id: "landmine_twist", name: "Giro Landmine", muscle: "Oblicuos", group: "oblicuos", secondary: [{ group: "core", weight: 0.3 }], nota: "La punta de la barra en arco de lado a lado, girando desde la cadera.", videoQuery: "landmine twist técnica oblicuos" },
  { id: "ab_rollout_barra", name: "Rollout con Barra", muscle: "Core", group: "core", rankExcluded: true, nota: "Como la rueda pero con una barra cargada; controlá la lumbar.", videoQuery: "rollout con barra técnica" },

  // ---- Antebrazos ----
  { id: "curl_muneca_mancuerna", name: "Curl de Muñeca con Mancuernas", muscle: "Antebrazo (flexores)", group: "antebrazos", loadFactor: 2, nota: "Antebrazos apoyados en el banco, solo se mueve la muñeca.", videoQuery: "curl de muñeca con mancuernas técnica" },
  { id: "curl_inverso_barra", name: "Curl Inverso con Barra", muscle: "Antebrazo / braquiorradial", group: "antebrazos", secondary: [{ group: "biceps", weight: 0.4 }], nota: "Agarre pronado: braquiorradial y extensores del antebrazo.", videoQuery: "curl inverso con barra técnica reverse curl" },
  { id: "colgarse_barra", name: "Colgarse de la Barra", muscle: "Antebrazo / Agarre", group: "antebrazos", rankExcluded: true, nota: "Colgate el mayor tiempo posible: agarre, hombro y descompresión de columna.", videoQuery: "dead hang colgarse de la barra técnica" },
  { id: "grip_crusher", name: "Pinza de Agarre (Grip Crusher)", muscle: "Antebrazo / Agarre", group: "antebrazos", nota: "Apretá la pinza y sostené 1-2 segundos en la máxima contracción.", videoQuery: "grip crusher técnica agarre" },

  // ---- Cardio (ampliación) ----
  { id: "burpees", name: "Burpees", muscle: "Cardio", group: "cardio", cardio: true, rankExcluded: true, nota: "Sentadilla, plancha, flexión y salto. Full body a máxima intensidad.", videoQuery: "burpees técnica correcta" },
  { id: "battle_ropes", name: "Cuerdas de Batalla", muscle: "Cardio", group: "cardio", cardio: true, rankExcluded: true, nota: "Ondas alternadas o simultáneas; mantené la cadera baja y firme.", videoQuery: "battle ropes técnica" },
  { id: "sled_push", name: "Empuje de Trineo", muscle: "Cardio / Pierna", group: "cardio", cardio: true, rankExcluded: true, nota: "Empujá con pasos cortos y potentes, torso inclinado y brazos firmes.", videoQuery: "sled push técnica trineo" },
  { id: "escalador_maquina", name: "Escalador (Jacob's Ladder)", muscle: "Cardio", group: "cardio", cardio: true, rankExcluded: true, nota: "Movimiento de escalada continua, muy demandante y de bajo impacto.", videoQuery: "jacobs ladder máquina técnica" },
  { id: "natacion", name: "Natación", muscle: "Cardio", group: "cardio", cardio: true, rankExcluded: true, nota: "Cero impacto articular y trabajo de todo el cuerpo.", videoQuery: "natación técnica estilo libre" },
  { id: "bicicleta_aire_libre", name: "Bicicleta al Aire Libre", muscle: "Cardio", group: "cardio", cardio: true, rankExcluded: true, nota: "Registrá el tiempo y la distancia recorrida.", videoQuery: "ciclismo técnica pedaleo" },
  { id: "hiit_intervalos", name: "HIIT por Intervalos", muscle: "Cardio", group: "cardio", cardio: true, rankExcluded: true, nota: "Bloques cortos a máxima intensidad con descansos incompletos.", videoQuery: "hiit entrenamiento intervalos" },
  { id: "sprint", name: "Sprints", muscle: "Cardio", group: "cardio", cardio: true, rankExcluded: true, nota: "Máxima velocidad en tramos cortos; calentá bien los isquios antes.", videoQuery: "sprints técnica correr velocidad" },
];
export const EXERCISE_LIBRARY_BY_ID = {};
EXERCISE_LIBRARY.forEach((e) => { EXERCISE_LIBRARY_BY_ID[e.id] = e; });
export const EXERCISE_LIBRARY_BY_GROUP = {};
MUSCLE_GROUPS.forEach((g) => { EXERCISE_LIBRARY_BY_GROUP[g.key] = EXERCISE_LIBRARY.filter((e) => e.group === g.key); });

// Para el rango por músculo: qué ejercicios "cuentan" para cada grupo, en
// tres niveles de prioridad:
//  - "primary" (peso 1.0): el grupo es el músculo PRINCIPAL del ejercicio.
//    Si hay AL MENOS UNA marca en algún ejercicio principal, el rango se
//    calcula sólo con esos — un ejercicio secundario (que de paso trabaja
//    el músculo, no como su función principal) no debería poder "ganarle"
//    a un ejercicio dedicado.
//  - "always" (peso reducido, `secondary` con `alwaysCount: true`): se
//    suma a la comparación SIEMPRE, incluso si ya hay marcas principales.
//    Hoy sólo se usa para tríceps: los ejercicios de polea (press francés
//    en polea, extensiones, etc.) pueden marcar pesos engañosos según
//    cuánto divida la polea el peso real, así que un press compuesto
//    (banca, militar...) siempre se tiene en cuenta como referencia
//    adicional — aunque, para no confundir, nunca se muestra como "tu
//    mejor marca" si es el que termina ganando.
//  - "secondary" (peso reducido, el resto): sólo se usa si no hay NINGUNA
//    marca ni en "primary" ni en "always" — de último recurso, para tener
//    al menos una estimación en músculos que todavía no entrenaste de
//    forma directa.
// Los ejercicios marcados `rankExcluded` no entran en ningún nivel, por
// la misma razón de siempre (peso corporal ambiguo: fondos, dominadas,
// flexiones, planchas...).
export const EXERCISE_LIBRARY_CONTRIBUTORS_BY_GROUP = {};
MUSCLE_GROUPS.forEach((g) => {
  const primary = new Map(), always = new Map(), secondary = new Map();
  EXERCISE_LIBRARY.forEach((e) => {
    if (e.rankExcluded) return;
    if (e.group === g.key) { primary.set(e.id, 1); return; }
    if (e.secondary) {
      const hit = e.secondary.find((s) => s.group === g.key);
      if (hit) (hit.alwaysCount ? always : secondary).set(e.id, hit.weight);
    }
  });
  EXERCISE_LIBRARY_CONTRIBUTORS_BY_GROUP[g.key] = { primary, always, secondary };
});

/* ---- Rutinas preestablecidas ---- */
export const PRESET_ROUTINES = [
  {
    id: "classic_default",
    name: "PUSH / PULL / PIERNA + HOMBROS / BRAZOS",
    source: "preset",
    description: "La rutina original de la app: empuje, tracción, pierna y un día extra de hombros y brazos.",
    recommendation: "Pensada para entrenar 4 veces por semana, repitiendo el ciclo.",
    dayOrder: ["push", "pull", "legs", "sarm"],
    days: {
      push: { label: "PUSH", description: "Pecho · Hombro anterior · Tríceps", color: "#14B8A6", exercises: [
        { libId: "press_banca", sets: [{ repRange: "3-5" }, { repRange: "3-5" }, { repRange: "8-10" }] },
        { libId: "press_inclinado_smith", sets: mkSets(3, "8-10") },
        { libId: "cruce_poleas", sets: mkSets(3, "12-15") },
        { libId: "vuelos_laterales_mancuerna", sets: mkSets(3, "15-20") },
        { libId: "pec_dec_deltoides", idOverride: "pec_dec_deltoides_push", sets: mkSets(2, "12-15") },
        { libId: "triceps_trasnuca", idOverride: "triceps_trasnuca_push", sets: mkSets(3, "10-12") },
        { libId: "triceps_polea_alta", sets: mkSets(2, "12-15") },
      ] },
      pull: { label: "PULL", description: "Dorsal · Romboides · Bíceps", color: "#3B82F6", exercises: [
        { libId: "remo_ancho_maquina", sets: [{ repRange: "4-6" }, { repRange: "4-6" }, { repRange: "8-10" }] },
        { libId: "dorsalera", sets: mkSets(3, "8-10") },
        { libId: "remo_unilateral", sets: mkSets(2, "8-10") },
        { libId: "pull_over", sets: mkSets(3, "10-12") },
        { libId: "retraccion_escapular", sets: mkSets(2, "15-20") },
        { libId: "biceps_alternado_mancuerna", sets: mkSets(3, "8-10") },
      ] },
      legs: { label: "PIERNAS", description: "Glúteo · Cuádriceps · Femoral · Aductores", color: "#F97316", exercises: [
        { libId: "sentadilla_bulgara", sets: mkSets(3, "8-10") },
        { libId: "abdominales", sets: mkSets(3, "12-15") },
        { libId: "jaca", sets: [{ repRange: "4-6" }, { repRange: "4-6" }, { repRange: "8-10" }] },
        { libId: "curl_femoral_maquina", sets: mkSets(3, "10-12") },
        { libId: "extension_cuadriceps", sets: mkSets(3, "12-15") },
        { libId: "aductor_maquina", sets: mkSets(2, "12-15") },
        { libId: "abductor_maquina", sets: mkSets(2, "12-15") },
      ] },
      sarm: { label: "HOMBROS / BRAZOS", description: "Deltoides · Bíceps · Tríceps", color: "#A855F7", exercises: [
        { libId: "press_militar_smith", sets: [{ repRange: "4-6" }, { repRange: "4-6" }, { repRange: "8-10" }] },
        { libId: "vuelos_laterales_maquina", sets: mkSets(3, "15-20") },
        { libId: "pec_dec_deltoides", idOverride: "pec_dec_deltoides_sarm", sets: mkSets(2, "12-15") },
        { libId: "biceps_martillo", sets: mkSets(3, "10-12") },
        { libId: "biceps_banco_scott", sets: mkSets(3, "10-12") },
        { libId: "biceps_banco_inclinado", sets: mkSets(3, "10-12") },
        { libId: "triceps_trasnuca", idOverride: "triceps_trasnuca_sarm", sets: mkSets(3, "10-12") },
      ] },
    },
  },
  {
    id: "ppl",
    name: "PUSH / PULL / LEGS",
    source: "preset",
    description: "Empuje, tracción y pierna en días separados. El split más popular para arrancar.",
    recommendation: "Recomendado: 3 a 6 sesiones semanales (podés repetir el ciclo dos veces si entrenás 6 días).",
    dayOrder: ["push", "pull", "legs"],
    days: {
      push: { label: "PUSH", description: "Pecho · Hombro · Tríceps", color: "#14B8A6", exercises: [
        { libId: "press_banca", sets: [{ repRange: "3-5" }, { repRange: "3-5" }, { repRange: "8-10" }] },
        { libId: "press_inclinado_mancuernas", sets: mkSets(3, "8-10") },
        { libId: "vuelos_laterales_mancuerna", sets: mkSets(3, "15-20") },
        { libId: "press_militar_mancuernas", sets: mkSets(3, "8-10") },
        { libId: "triceps_polea_alta", sets: mkSets(3, "10-12") },
      ] },
      pull: { label: "PULL", description: "Espalda · Bíceps", color: "#3B82F6", exercises: [
        { libId: "peso_muerto", sets: [{ repRange: "4-6" }, { repRange: "4-6" }, { repRange: "4-6" }] },
        { libId: "dorsalera", sets: mkSets(3, "8-10") },
        { libId: "remo_unilateral", sets: mkSets(3, "8-10") },
        { libId: "face_pull", sets: mkSets(2, "15-20") },
        { libId: "biceps_alternado_mancuerna", sets: mkSets(3, "8-10") },
      ] },
      legs: { label: "LEGS", description: "Cuádriceps · Femoral · Glúteo", color: "#F97316", exercises: [
        { libId: "sentadilla_convencional", sets: [{ repRange: "4-6" }, { repRange: "4-6" }, { repRange: "8-10" }] },
        { libId: "curl_femoral_maquina", sets: mkSets(3, "10-12") },
        { libId: "extension_cuadriceps", sets: mkSets(3, "10-12") },
        { libId: "hip_thrust", sets: mkSets(3, "10-12") },
        { libId: "elevacion_talones_parado", sets: mkSets(3, "12-15") },
      ] },
    },
  },
  {
    id: "upper_lower",
    name: "UPPER / LOWER",
    source: "preset",
    description: "Divide el cuerpo en tren superior e inferior. Simple y eficiente.",
    recommendation: "Recomendado: 4 sesiones semanales alternando Torso y Pierna (ej: Lun Torso, Mar Pierna, Jue Torso, Vie Pierna).",
    dayOrder: ["upper", "lower"],
    days: {
      upper: { label: "TORSO", description: "Pecho · Espalda · Hombro · Brazos", color: "#14B8A6", exercises: [
        { libId: "press_banca", sets: [{ repRange: "4-6" }, { repRange: "4-6" }, { repRange: "8-10" }] },
        { libId: "dorsalera", sets: mkSets(3, "8-10") },
        { libId: "press_militar_mancuernas", sets: mkSets(3, "8-10") },
        { libId: "remo_unilateral", sets: mkSets(3, "8-10") },
        { libId: "vuelos_laterales_mancuerna", sets: mkSets(3, "15-20") },
        { libId: "biceps_martillo", sets: mkSets(3, "10-12") },
        { libId: "triceps_polea_alta", sets: mkSets(3, "10-12") },
      ] },
      lower: { label: "PIERNA", description: "Cuádriceps · Femoral · Pantorrilla", color: "#F97316", exercises: [
        { libId: "sentadilla_convencional", sets: [{ repRange: "4-6" }, { repRange: "4-6" }, { repRange: "8-10" }] },
        { libId: "peso_muerto_rumano", sets: mkSets(3, "10-12") },
        { libId: "prensa", sets: mkSets(3, "10-12") },
        { libId: "curl_femoral_maquina", sets: mkSets(3, "10-12") },
        { libId: "elevacion_talones_parado", sets: mkSets(3, "12-15") },
        { libId: "abdominales", sets: mkSets(3, "12-15") },
      ] },
    },
  },
  {
    id: "arnold",
    name: "ARNOLD SPLIT",
    source: "preset",
    description: "El clásico de Arnold Schwarzenegger: pecho y espalda juntos, hombros y brazos juntos, y pierna aparte.",
    recommendation: "Para gente con buena base de entrenamiento: 3 a 6 sesiones semanales repitiendo el ciclo.",
    dayOrder: ["chest_back", "shoulders_arms", "legs"],
    days: {
      chest_back: { label: "PECHO Y ESPALDA", description: "Empuje y tracción de torso juntos", color: "#14B8A6", exercises: [
        { libId: "press_banca", sets: [{ repRange: "4-6" }, { repRange: "4-6" }, { repRange: "8-10" }] },
        { libId: "dorsalera", sets: mkSets(3, "8-10") },
        { libId: "press_inclinado_mancuernas", sets: mkSets(3, "8-10") },
        { libId: "remo_unilateral", sets: mkSets(3, "8-10") },
        { libId: "cruce_poleas", sets: mkSets(3, "12-15") },
        { libId: "pull_over", sets: mkSets(2, "12-15") },
      ] },
      shoulders_arms: { label: "HOMBROS Y BRAZOS", description: "Deltoides, bíceps y tríceps", color: "#A855F7", exercises: [
        { libId: "press_militar_smith", sets: [{ repRange: "4-6" }, { repRange: "4-6" }, { repRange: "8-10" }] },
        { libId: "vuelos_laterales_mancuerna", sets: mkSets(3, "15-20") },
        { libId: "biceps_alternado_mancuerna", sets: mkSets(3, "8-10") },
        { libId: "triceps_trasnuca", sets: mkSets(3, "10-12") },
        { libId: "biceps_martillo", sets: mkSets(2, "10-12") },
        { libId: "triceps_polea_alta", sets: mkSets(3, "10-12") },
      ] },
      legs: { label: "PIERNAS", description: "Cuádriceps · Femoral · Glúteo", color: "#F97316", exercises: [
        { libId: "jaca", sets: [{ repRange: "4-6" }, { repRange: "4-6" }, { repRange: "8-10" }] },
        { libId: "curl_femoral_maquina", sets: mkSets(3, "10-12") },
        { libId: "extension_cuadriceps", sets: mkSets(3, "10-12") },
        { libId: "sentadilla_bulgara", sets: mkSets(3, "8-10") },
        { libId: "elevacion_talones_parado", sets: mkSets(3, "12-15") },
      ] },
    },
  },
  {
    id: "bro_split",
    name: "BRO SPLIT",
    source: "preset",
    description: "Un grupo muscular grande por día: pecho, espalda, hombros, brazos y piernas. El clásico del fisicoculturismo.",
    recommendation: "Recomendado: 5 sesiones semanales, un grupo por día. Si entrenás hace poco, frecuencias de 2 veces por semana por músculo suelen rendir mejor — pero este formato sigue siendo válido y es el más tradicional para enfocarte a fondo en cada grupo.",
    dayOrder: ["chest", "back", "shoulders", "arms", "legs"],
    days: {
      chest: { label: "PECHO", description: "Pectoral en todos los ángulos", color: "#14B8A6", exercises: [
        { libId: "press_banca", sets: [{ repRange: "4-6" }, { repRange: "4-6" }, { repRange: "8-10" }] },
        { libId: "press_inclinado_mancuernas", sets: mkSets(3, "8-10") },
        { libId: "press_pecho_maquina", sets: mkSets(3, "10-12") },
        { libId: "aperturas_mancuerna", sets: mkSets(3, "12-15") },
        { libId: "cruce_poleas", sets: mkSets(2, "12-15") },
      ] },
      back: { label: "ESPALDA", description: "Dorsal, espalda media y romboides", color: "#3B82F6", exercises: [
        { libId: "remo_barra", sets: [{ repRange: "4-6" }, { repRange: "4-6" }, { repRange: "8-10" }] },
        { libId: "dorsalera", sets: mkSets(3, "8-10") },
        { libId: "remo_unilateral", sets: mkSets(3, "8-10") },
        { libId: "remo_polea_agarre_ancho", sets: mkSets(3, "12-15") },
        { libId: "face_pull", sets: mkSets(2, "15-20") },
      ] },
      shoulders: { label: "HOMBROS", description: "Deltoides anterior, lateral y posterior", color: "#A855F7", exercises: [
        { libId: "press_militar_mancuernas", sets: [{ repRange: "4-6" }, { repRange: "4-6" }, { repRange: "8-10" }] },
        { libId: "vuelos_laterales_mancuerna", sets: mkSets(4, "15-20") },
        { libId: "press_arnold", sets: mkSets(3, "10-12") },
        { libId: "cruces_invertidos_polea", sets: mkSets(3, "12-15") },
        { libId: "vuelos_frontales", sets: mkSets(2, "12-15") },
      ] },
      arms: { label: "BRAZOS", description: "Bíceps y tríceps por igual", color: "#F59E0B", exercises: [
        { libId: "curl_barra_recta", sets: mkSets(3, "8-10") },
        { libId: "biceps_banco_scott", sets: mkSets(3, "10-12") },
        { libId: "biceps_martillo", sets: mkSets(2, "10-12") },
        { libId: "triceps_frances", sets: mkSets(3, "8-10") },
        { libId: "triceps_polea_cuerda", sets: mkSets(3, "10-12") },
        { libId: "triceps_patada", sets: mkSets(2, "12-15") },
      ] },
      legs: { label: "PIERNAS", description: "Cuádriceps, femoral, glúteo y pantorrilla", color: "#F97316", exercises: [
        { libId: "sentadilla_convencional", sets: [{ repRange: "4-6" }, { repRange: "4-6" }, { repRange: "8-10" }] },
        { libId: "prensa", sets: mkSets(3, "10-12") },
        { libId: "peso_muerto_rumano", sets: mkSets(3, "8-10") },
        { libId: "curl_femoral_maquina", sets: mkSets(3, "10-12") },
        { libId: "extension_cuadriceps", sets: mkSets(3, "12-15") },
        { libId: "elevacion_talones_parado", sets: mkSets(3, "15-20") },
      ] },
    },
  },
  {
    id: "fullbody",
    name: "CUERPO COMPLETO",
    source: "preset",
    description: "Trabajás todo el cuerpo en cada sesión, con tres días distintos para variar el estímulo.",
    recommendation: "Recomendado: 3 sesiones semanales no consecutivas (ej. Lunes, Miércoles, Viernes).",
    dayOrder: ["day_a", "day_b", "day_c"],
    days: {
      day_a: { label: "DÍA A", description: "Full body — variante A", color: "#14B8A6", exercises: [
        { libId: "sentadilla_convencional", sets: [{ repRange: "4-6" }, { repRange: "4-6" }, { repRange: "8-10" }] },
        { libId: "press_banca", sets: mkSets(3, "8-10") },
        { libId: "dorsalera", sets: mkSets(3, "8-10") },
        { libId: "vuelos_laterales_mancuerna", sets: mkSets(2, "15-20") },
        { libId: "abdominales", sets: mkSets(3, "12-15") },
      ] },
      day_b: { label: "DÍA B", description: "Full body — variante B", color: "#3B82F6", exercises: [
        { libId: "peso_muerto_rumano", sets: mkSets(3, "10-12") },
        { libId: "press_militar_mancuernas", sets: mkSets(3, "8-10") },
        { libId: "remo_unilateral", sets: mkSets(3, "8-10") },
        { libId: "biceps_martillo", sets: mkSets(2, "10-12") },
        { libId: "plancha", sets: mkSets(3, "12-15") },
      ] },
      day_c: { label: "DÍA C", description: "Full body — variante C", color: "#F97316", exercises: [
        { libId: "prensa", sets: mkSets(3, "10-12") },
        { libId: "press_inclinado_mancuernas", sets: mkSets(3, "8-10") },
        { libId: "remo_t", sets: mkSets(3, "8-10") },
        { libId: "triceps_polea_alta", sets: mkSets(3, "10-12") },
        { libId: "elevacion_piernas", sets: mkSets(3, "12-15") },
      ] },
    },
  },
];
export const PRESET_ROUTINES_BY_ID = {};
PRESET_ROUTINES.forEach((r) => { PRESET_ROUTINES_BY_ID[r.id] = r; });
export const CLASSIC_PRESET = PRESET_ROUTINES_BY_ID["classic_default"];
