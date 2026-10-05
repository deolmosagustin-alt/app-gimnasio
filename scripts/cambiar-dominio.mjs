#!/usr/bin/env node
/**
 * Cambia el dominio de Modus Fit en TODOS los archivos donde está escrito.
 *
 * El dominio aparece en once lugares repartidos entre HTML, JSON, XML, texto
 * plano y JavaScript. Ninguno puede leer una constante de los otros: el
 * index.html no importa módulos, robots.txt es texto pelado y
 * capacitor.config.json lo lee el build de Android. Olvidarse de uno no rompe
 * nada visiblemente — simplemente el canonical apunta al dominio viejo, o la
 * app nativa sigue cargando la URL anterior — así que la única forma segura
 * de cambiarlo es de una sola pasada.
 *
 *   npm run dominio -- modusfit.app
 *   npm run dominio -- modusfit.app --simular    (muestra qué haría, sin tocar)
 *
 * Lo que este script NO puede hacer (son consolas web, no archivos) queda
 * impreso como recordatorio al final.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

// Todos los archivos que nombran el dominio. Los de android/app/build son
// artefactos de compilación: los regenera `npx cap sync`, no se tocan acá.
const ARCHIVOS = [
  "index.html",
  "public/robots.txt",
  "public/sitemap.xml",
  "src/App.jsx",
  "capacitor.config.json",
  "android/app/src/main/assets/capacitor.config.json",
];

const args = process.argv.slice(2);
const simular = args.includes("--simular");
const nuevo = args.find((a) => !a.startsWith("--"));

if (!nuevo) {
  console.error("Falta el dominio nuevo.\n  npm run dominio -- modusfit.app");
  process.exit(1);
}

// Se acepta "modusfit.app", "https://modusfit.app" o con barra al final.
const limpio = nuevo.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(limpio)) {
  console.error(`"${nuevo}" no parece un dominio válido.`);
  process.exit(1);
}
const destino = `https://${limpio}`;

// El dominio actual se lee del propio código en vez de estar hardcodeado acá:
// así el script sirve también la segunda vez que cambien de dominio.
const appJsx = readFileSync(join(RAIZ, "src/App.jsx"), "utf8");
const m = appJsx.match(/const API_ORIGIN = "(https:\/\/[^"]+)"/);
if (!m) {
  console.error("No encontré API_ORIGIN en src/App.jsx — ¿cambió de nombre?");
  process.exit(1);
}
const actual = m[1];

if (actual === destino) {
  console.log(`Ya está todo apuntando a ${destino}. No hay nada que cambiar.`);
  process.exit(0);
}

console.log(`${actual}  →  ${destino}${simular ? "   (simulación)" : ""}\n`);

let total = 0;
for (const rel of ARCHIVOS) {
  const ruta = join(RAIZ, rel);
  if (!existsSync(ruta)) {
    console.log(`  —  ${rel}  (no existe, se saltea)`);
    continue;
  }
  const antes = readFileSync(ruta, "utf8");
  const despues = antes.split(actual).join(destino);
  const cuantos = antes.split(actual).length - 1;
  if (!cuantos) {
    console.log(`  —  ${rel}  (no lo nombra)`);
    continue;
  }
  if (!simular) writeFileSync(ruta, despues, "utf8");
  total += cuantos;
  console.log(`  ✓  ${rel}  (${cuantos})`);
}

console.log(`\n${total} referencia${total === 1 ? "" : "s"}${simular ? " se cambiarían" : " cambiadas"}.`);

if (!simular) {
  console.log(`
Falta hacer esto a mano — son consolas web, no archivos:

  1. Vercel → Settings → Domains → agregar ${limpio}
     (y en el registrador, apuntar el DNS a donde diga Vercel)
  2. Firebase → Authentication → Settings → Authorized domains
     → agregar ${limpio}. Sin esto el login con Google deja de andar
     en el dominio nuevo, y falla en silencio.
  3. Google Search Console → agregar ${limpio} y mandar
     https://${limpio}/sitemap.xml
  4. npx cap sync android, y rebuildear el APK: la app nativa carga
     la web desde server.url y hasta que no la actualicen va a seguir
     entrando al dominio viejo.

Y revisá que el dominio viejo redirija al nuevo en vez de quedar vivo
en paralelo: dos dominios con el mismo contenido se compiten entre sí
en Google.`);
}
