// LA DECLARACIÓN DE "SEGURIDAD DE LOS DATOS" DE GOOGLE PLAY, como código.
//
//   npm run play -- datos             muestra qué se declara y arma el CSV (no manda nada)
//   npm run play -- datos --enviar    la sube a Play (pisa lo que haya en la consola)
//
// La API (applications.dataSafety) recibe el mismo CSV que "Importar CSV" de
// Play Console. plantilla.csv es la plantilla de Google en blanco (764 filas:
// tres preguntas generales, 38 tipos de datos y cinco preguntas por tipo).
//
// Qué cuenta, según Play: "recopila" es lo que sale del teléfono hacia
// nosotros o quien trabaja para nosotros (Firebase, Vercel); "comparte" es lo
// que le llega a otro que lo usa para lo suyo. Lo que Social muestra a tus
// amigos no es compartir: lo decide la persona. Si cambia lo que la app manda
// (un campo nuevo a la nube, otra cosa para la IA), cambiá esto, la política
// de privacidad (public/privacy-policy.html y el modal de Perfil) y volvé a
// subirlo.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Con el plan gratis de la API de Gemini, Google puede usar lo que se le manda
// para mejorar sus productos: eso es compartir. Con facturación en la clave,
// Google lo procesa sólo para responder: poné false y volvé a subirlo.
export const GEMINI_GRATIS = true;

const P = {
  funcion: "PSL_APP_FUNCTIONALITY",
  cuenta: "PSL_ACCOUNT_MANAGEMENT",
  personalizar: "PSL_PERSONALIZATION",
  seguridad: "PSL_FRAUD_PREVENTION_SECURITY",
};

// Todo es opcional: sin iniciar sesión con Google la app guarda todo en el
// teléfono, y la IA, la importación y Social se usan sólo si la persona quiere.
export const TIPOS = {
  PSL_NAME: { que: "El nombre (perfil y Social)", para: [P.funcion, P.cuenta] },
  PSL_EMAIL: { que: "El mail de la cuenta de Google", para: [P.cuenta] },
  PSL_USER_ACCOUNT: { que: "El id de Firebase y el @usuario de Social", para: [P.funcion, P.cuenta] },
  PSL_OTHER_PERSONAL: { que: "Sexo, fecha de nacimiento y altura (sexo y edad van a la IA)", para: [P.funcion, P.personalizar], comparte: GEMINI_GRATIS },
  PSL_FITNESS: { que: "Entrenamiento, sesiones, medidas y peso (un resumen va a la IA)", para: [P.funcion, P.personalizar], comparte: GEMINI_GRATIS },
  PSL_OTHER_MESSAGES: { que: "Lo que se le escribe al Entrenador IA y los reportes de sus respuestas", para: [P.funcion], comparte: GEMINI_GRATIS },
  PSL_USER_GENERATED_CONTENT: { que: "Rutinas, rutinas compartidas por link y retos (las rutinas van a la IA)", para: [P.funcion], comparte: GEMINI_GRATIS },
  PSL_PHOTOS: { que: "La foto de perfil y las fotos de una rutina que se importa (van a la IA)", para: [P.funcion], comparte: GEMINI_GRATIS },
  PSL_FILES_AND_DOCS: { que: "Los archivos de una rutina que se importa (van a la IA, no se guardan)", para: [P.funcion], comparte: GEMINI_GRATIS, efimero: true },
  PSL_DEVICE_ID: { que: "La IP y el navegador que ve Firebase al iniciar sesión, contra el abuso", para: [P.seguridad] },
};

const GENERALES = {
  PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA: true,
  PSL_DATA_COLLECTION_ENCRYPTED_IN_TRANSIT: true, // todo va por HTTPS
  PSL_DATA_COLLECTION_USER_REQUEST_DELETE: true, // Perfil › Eliminar perfil, y eliminar-cuenta.html
};

const csv = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const SI = "TRUE", NO = "FALSE";

// Lo que va en "Response value" para una fila de la plantilla.
function valor(pregunta, respuesta) {
  if (pregunta in GENERALES) return GENERALES[pregunta] ? SI : NO;
  if (pregunta.startsWith("PSL_DATA_TYPES_")) return TIPOS[respuesta] ? SI : "";
  const [, tipo, ...resto] = pregunta.split(":");
  const t = TIPOS[tipo];
  if (!t) return "";
  switch (resto.join(":")) {
    case "PSL_DATA_USAGE_COLLECTION_AND_SHARING":
      if (respuesta === "PSL_DATA_USAGE_ONLY_COLLECTED") return SI;
      return respuesta === "PSL_DATA_USAGE_ONLY_SHARED" && t.comparte ? SI : "";
    case "PSL_DATA_USAGE_EPHEMERAL": return t.efimero ? SI : NO;
    case "DATA_USAGE_USER_CONTROL": return respuesta === "PSL_DATA_USAGE_USER_CONTROL_OPTIONAL" ? SI : "";
    case "DATA_USAGE_COLLECTION_PURPOSE": return t.para.includes(respuesta) ? SI : "";
    case "DATA_USAGE_SHARING_PURPOSE": return t.comparte && respuesta === P.funcion ? SI : "";
    default: throw new Error(`Pregunta que la plantilla no tenía: ${pregunta}`);
  }
}

export function armarCsv() {
  const lineas = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "plantilla.csv"), "utf8").trimEnd().split("\n");
  // En la plantilla en blanco ningún campo lleva comillas salvo, quizá, el rótulo del final.
  return lineas.map((linea, i) => {
    if (i === 0) return linea;
    const [pregunta, respuesta, , requisito, ...rotulo] = linea.split(",");
    return [pregunta, respuesta, valor(pregunta, respuesta), requisito].map(csv).join(",") + "," + rotulo.join(",");
  }).join("\n") + "\n";
}

export function resumen() {
  return Object.entries(TIPOS).map(([id, t]) => `${t.comparte ? "recopila y comparte" : "recopila"}${t.efimero ? " (efímero)" : ""}  ${id}: ${t.que}`).join("\n");
}
