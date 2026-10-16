#!/usr/bin/env node
/**
 * Genera imágenes con Gemini (Nano Banana) para las skills de diseño que
 * trabajan a partir de una imagen: image-to-code, imagegen-frontend-web,
 * imagegen-frontend-mobile y brandkit. Claude no genera imágenes por su
 * cuenta; con esto las pide, las guarda y después las puede mirar.
 *
 *   npm run imagen -- "pantalla de rutina de una app de gimnasio, modo oscuro"
 *   npm run imagen -- "..." --formato 16:9 --tamano 2K
 *   npm run imagen -- "rediseñá esta pantalla" --ref .taste-skill/capturas/antes/celular-rutina.png
 *   npm run imagen -- --modelos          (los modelos de imagen de la cuenta)
 *
 * Necesita una clave de Gemini CON FACTURACIÓN: la generación de imágenes no
 * tiene cupo gratis (unos US$0,03 por imagen en 1K). La clave gratis de la
 * app no sirve, y además le comería la cuota a los usuarios. Va en
 * .env.local, que git ignora:
 *
 *   GEMINI_IMAGEN_API_KEY=...
 *
 * Las imágenes quedan en .taste-skill/imagenes/, salvo que se pida otra ruta
 * con --salida. Usa la Interactions API, que es la que documenta Google para
 * imagen; los nombres de campo salen de su especificación OpenAPI.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, extname, resolve } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com";
const MODELO = "gemini-nano-banana-2.1";
const FORMATOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "1:8", "8:1", "1:4", "4:1"];
const TAMANOS = ["512", "1K", "2K", "4K"];
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const EXTENSION = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };

// Para cortar con un mensaje. No se usa process.exit: en Windows, salir así
// con un fetch recién cerrado hace caer a Node ("Assertion failed ...
// UV_HANDLE_CLOSING"). Se deja terminar el programa solo, con exitCode.
class Salida extends Error {}
const salir = (mensaje) => { throw new Salida(mensaje); };

const args = process.argv.slice(2);
const valores = (flag) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const valor = (flag) => valores(flag)[0] || null;

// La clave: primero el entorno, después .env.local (formato CLAVE=valor).
const leerClave = () => {
  const desdeEnv = process.env.GEMINI_IMAGEN_API_KEY || process.env.GEMINI_API_KEY;
  if (desdeEnv) return desdeEnv;
  const archivo = join(RAIZ, ".env.local");
  if (!existsSync(archivo)) return null;
  const vars = Object.fromEntries(
    readFileSync(archivo, "utf8").split(/\r?\n/)
      .map((l) => l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/))
      .filter(Boolean)
      .map(([, k, v]) => [k, v.replace(/^(["'])(.*)\1$/, "$2")]),
  );
  return vars.GEMINI_IMAGEN_API_KEY || vars.GEMINI_API_KEY || null;
};

// Traduce los errores de Google a qué hacer. Las APIs viejas devuelven
// { error: {...} }; la Interactions API, la misma cosa dentro de una lista.
const explicarError = (status, cuerpo, modelo) => {
  const err = (Array.isArray(cuerpo) ? cuerpo[0] : cuerpo)?.error || {};
  const msg = String(err.message || cuerpo?.raw || "").slice(0, 400);
  const motivo = (err.details || []).map((d) => d.reason).filter(Boolean).join(" ");
  if (/API_KEY_INVALID/.test(motivo) || /API key not valid/i.test(msg)) return "La clave no es válida. Revisá que esté bien copiada en .env.local.";
  if (status === 429 && /limit: ?0|free.?tier/i.test(msg)) return "Esta clave no tiene facturación activa, y la generación de imágenes no tiene cupo gratis.\nActivá la facturación del proyecto en https://aistudio.google.com o usá una clave de un proyecto que la tenga.";
  if (status === 429) return `Se agotó la cuota de la clave por ahora. Esperá un rato y probá de nuevo.\n(${msg})`;
  if (status === 403) return `La clave no tiene permiso para usar ${modelo}. Suele ser porque el proyecto no tiene facturación activa.\n(${msg})`;
  if (status === 404) return `El modelo ${modelo} no existe para esta clave. Mirá cuáles hay con: npm run imagen -- --modelos\n(${msg})`;
  return `Gemini respondió ${status}${err.status ? ` ${err.status}` : ""}: ${msg || "sin detalle"}`;
};

const pedir = async (url, opciones) => {
  let res;
  try {
    res = await fetch(url, { ...opciones, signal: AbortSignal.timeout(180000) });
  } catch (e) {
    salir(`No se pudo hablar con Gemini: ${e.name === "TimeoutError" ? "tardó más de 3 minutos" : e.message}`);
  }
  const texto = await res.text();
  let cuerpo;
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = { raw: texto }; }
  return { res, cuerpo };
};

async function main() {
  const clave = leerClave();
  if (!clave) {
    salir(
      "Falta la clave de Gemini para generar imágenes.\n\n" +
      "  1. Creala en https://aistudio.google.com/apikey (en un proyecto con facturación activa:\n" +
      "     la generación de imágenes no tiene cupo gratis).\n" +
      "  2. Agregá esta línea a .env.local, en la raíz del proyecto:\n\n" +
      "     GEMINI_IMAGEN_API_KEY=tu-clave",
    );
  }
  const headers = { "x-goog-api-key": clave, "Content-Type": "application/json" };

  if (args.includes("--modelos")) {
    const { res, cuerpo } = await pedir(`${BASE}/v1beta/models?pageSize=1000`, { headers });
    if (!res.ok) salir(explicarError(res.status, cuerpo, "la lista de modelos"));
    const deImagen = (cuerpo.models || []).filter((m) => /image|banana/i.test(`${m.name} ${m.displayName}`));
    if (!deImagen.length) salir("La cuenta no tiene ningún modelo de imagen disponible.");
    for (const m of deImagen) console.log(`${String(m.name).replace(/^models\//, "")}  ${m.displayName || ""}`);
    return;
  }

  const usados = new Set(["--formato", "--tamano", "--ref", "--salida", "--modelo"].flatMap((f) => valores(f)));
  const prompt = args.find((a) => !a.startsWith("--") && !usados.has(a));
  if (!prompt) salir('Falta qué imagen generar.\n  npm run imagen -- "pantalla de rutina de una app de gimnasio, modo oscuro"');
  const formato = valor("--formato") || "9:16";
  const tamano = (valor("--tamano") || "1K").toUpperCase().replace(/^512PX$/, "512");
  const modelo = valor("--modelo") || MODELO;
  if (!FORMATOS.includes(formato)) salir(`--formato tiene que ser uno de: ${FORMATOS.join(", ")}`);
  if (!TAMANOS.includes(tamano)) salir(`--tamano tiene que ser uno de: ${TAMANOS.join(", ")}`);

  // Imágenes de referencia (por ejemplo, una captura de la pantalla actual
  // para rediseñarla). Van en el mismo pedido, después del texto.
  const referencias = valores("--ref").map((ruta) => {
    const archivo = resolve(RAIZ, ruta);
    if (!existsSync(archivo)) salir(`No existe la imagen de referencia: ${ruta}`);
    const mime = MIME[extname(archivo).toLowerCase()];
    if (!mime) salir(`La referencia tiene que ser PNG, JPG o WebP: ${ruta}`);
    return { type: "image", data: readFileSync(archivo).toString("base64"), mime_type: mime };
  });

  const cuerpoPedido = {
    model: modelo,
    input: [{ type: "text", text: prompt }, ...referencias],
    response_format: { type: "image", aspect_ratio: formato, image_size: tamano, mime_type: "image/jpeg" },
    store: false,
  };

  console.log(`Generando con ${modelo} (${formato}, ${tamano}${referencias.length ? `, ${referencias.length} referencia(s)` : ""})…`);
  const { res, cuerpo } = await pedir(`${BASE}/v1beta/interactions`, { method: "POST", headers, body: JSON.stringify(cuerpoPedido) });
  if (!res.ok) salir(explicarError(res.status, cuerpo, modelo));

  const salidas = (cuerpo.steps || []).filter((s) => s.type === "model_output");
  const bloques = salidas.flatMap((s) => s.content || []);
  const imagenes = bloques.filter((b) => b.type === "image" && b.data);
  for (const t of bloques.filter((b) => b.type === "text" && b.text)) console.log(`Gemini: ${t.text.trim()}`);

  if (!imagenes.length) {
    const motivos = [
      ...(cuerpo.errors || []).map((e) => e.message),
      ...salidas.map((s) => s.error?.message).filter(Boolean),
    ];
    salir(`Gemini no devolvió ninguna imagen (estado: ${cuerpo.status || "desconocido"}).${motivos.length ? `\n${motivos.join("\n")}` : "\nSuele pasar cuando el pedido choca con sus filtros: probá reformulándolo."}`);
  }

  const slug = prompt.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").split("-").filter(Boolean).slice(0, 6).join("-") || "imagen";
  // Hora local, no UTC: que el nombre coincida con el reloj de quien la pidió.
  const sello = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  const pedida = valor("--salida");

  imagenes.forEach((img, i) => {
    const ext = EXTENSION[img.mime_type] || ".jpg";
    const sufijo = imagenes.length > 1 ? `-${i + 1}` : "";
    // La extensión la decide lo que de verdad devolvió Gemini, no la pedida.
    const destino = pedida
      ? resolve(RAIZ, pedida).replace(/\.(png|jpe?g|webp)$/i, "") + `${sufijo}${ext}`
      : join(RAIZ, ".taste-skill", "imagenes", `${sello}-${slug}${sufijo}${ext}`);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, Buffer.from(img.data, "base64"));
    console.log(`Guardada: ${relative(RAIZ, destino)}`);
  });
}

main().catch((e) => {
  if (!(e instanceof Salida)) throw e;
  console.error(e.message);
  process.exitCode = 1;
});
