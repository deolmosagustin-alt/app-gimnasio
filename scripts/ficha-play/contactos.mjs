// Una hoja de contactos con las láminas, para revisarlas juntas.
// Uso: node contactos.mjs <raíz> <carpeta de láminas> <salida.png> [ancho de cada una]
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
const [RAIZ, CARPETA, SALIDA] = process.argv.slice(2, 5).map((x) => resolve(x));
const ANCHO = process.argv[5] || "300";
const req = createRequire(join(RAIZ, "package.json"));
const pw = await import(pathToFileURL(req.resolve("playwright")).href);
const chromium = pw.chromium || pw.default.chromium;
const n = ["01-serie", "02-grafica", "03-plan", "04-musculos", "05-ia", "06-ticket", "07-amigos", "08-rutinas"];
const w = Number(ANCHO), h = Math.round(w * 1920 / 1080);
const html = `<!doctype html><html><body style="margin:0;background:#888;display:grid;grid-template-columns:repeat(4,${w}px);gap:8px;padding:8px;width:${4 * w + 40}px">
${n.map((x) => `<img src="${pathToFileURL(join(CARPETA, x + ".png")).href}" style="width:${w}px;height:${h}px;display:block">`).join("")}
<img src="${pathToFileURL(join(CARPETA, "principal.png")).href}" style="grid-column:1 / span 2;width:${2 * w + 8}px;display:block">
</body></html>`;
const archivo = join(CARPETA, "_contactos.html");
writeFileSync(archivo, html);
const browser = await chromium.launch();
try {
  const p = await browser.newPage({ viewport: { width: 4 * w + 40, height: 800 } });
  await p.goto(pathToFileURL(archivo).href);
  await p.waitForTimeout(600);
  await p.screenshot({ path: SALIDA, fullPage: true });
} finally {
  await browser.close();
}
console.log("listo");
