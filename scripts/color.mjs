// npm run color -- <carpeta> [<otra carpeta>]
//
// Cuánto color tiene cada pantalla de `npm run capturas`, para que ninguna
// pestaña quede más cargada que las otras. Mide con el criterio de la skill
// de gusto para pantallas de app (design-taste-frontend, colourShare): los
// píxeles con saturación HSL de 0,4 o más y luz entre 0,18 y 0,82, con la
// captura reducida a 240 px de ancho. En las apps que estudia esa skill la
// mediana es 3 % y casi todas quedan en 5 % o menos. Suma la variedad:
// cuántas familias de tono (12, de 30° cada una) ocupan al menos el 0,3 % de
// la pantalla.
//
// Con dos carpetas, las pone una al lado de la otra (antes y después). Las
// carpetas se buscan también dentro de .taste-skill/capturas/.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..");
const carpetas = process.argv.slice(2).map((c) => (existsSync(c) ? c : join(RAIZ, ".taste-skill", "capturas", c)));
if (!carpetas.length || carpetas.some((c) => !existsSync(c))) {
  console.error("Uso: npm run color -- <carpeta de capturas> [<otra carpeta>]");
  process.exit(1);
}
const req = createRequire(join(RAIZ, "package.json"));
const pw = await import(pathToFileURL(req.resolve("playwright")).href);
const chromium = pw.chromium || pw.default.chromium;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<html><body></body></html>");
const medir = (b64) => page.evaluate(async (b64) => {
  const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
  const w = 240, h = Math.max(1, Math.round((240 * img.height) / img.width));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data; let n = 0; const tonos = new Array(12).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    const s = mx === mn ? 0 : l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn);
    if (s >= 0.4 && l >= 0.18 && l <= 0.82) {
      n++;
      const dd = mx - mn;
      let hue = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
      hue = (hue * 60 + 360) % 360;
      tonos[Math.floor(hue / 30) % 12]++;
    }
  }
  const total = w * h;
  return { share: n / total, familias: tonos.filter((t) => t / total >= 0.003).length };
}, b64);

const res = new Map();
for (const dir of carpetas) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".png") && !/login|primera-rutina|armar-semana|bienvenida/.test(x)).sort()) {
    const nombre = f.replace(/^celular-|\.png$/g, "");
    if (!res.has(nombre)) res.set(nombre, {});
    res.get(nombre)[dir] = await medir(readFileSync(join(dir, f)).toString("base64"));
  }
}
await browser.close();
const cab = (c) => c.split(/[\\/]/).pop();
console.log(["pantalla".padEnd(34), ...carpetas.map((c) => cab(c).padStart(16))].join(""));
for (const [nombre, por] of res) {
  console.log([nombre.padEnd(34), ...carpetas.map((c) => (por[c] ? `${(por[c].share * 100).toFixed(1).padStart(5)} % · ${por[c].familias} t` : "—").padStart(16))].join(""));
}
console.log("\n% = píxeles con color fuerte · t = familias de tono. Referencia: 3 % de mediana; más de 12 % es demasiado.");
