// La pantalla de inicio con los widgets, para la lámina de la ficha de Play.
// Usa los dibujos reales del teléfono (.taste-skill/widgets/*.png, que saca
// `node .taste-skill/widgets-fotos.mjs` con el emulador) sobre un fondo propio.
// Uso: node pantalla-widgets.mjs <raíz> <carpeta de pantallas>
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
const [RAIZ, SALIDA] = process.argv.slice(2).map((x) => resolve(x));
const req = createRequire(join(RAIZ, "package.json"));
const pw = await import(pathToFileURL(req.resolve("playwright")).href);
const chromium = pw.chromium || pw.default.chromium;
const w = (n) => `data:image/png;base64,${readFileSync(join(RAIZ, ".taste-skill/widgets", `${n}.png`)).toString("base64")}`;
const img = (n, ancho, alto) => `<img src="${w(n)}" style="width:${ancho}px;height:${alto}px;display:block">`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();
await page.setContent(`<body style="margin:0;width:390px;height:844px;overflow:hidden;font:600 15px system-ui;color:#fff;background:radial-gradient(120% 70% at 20% 0%,#3b4f77 0%,#1c2238 45%,#0d0f18 100%)">
<div style="display:flex;justify-content:space-between;padding:16px 26px 0;font-size:15px"><span>9:41</span><span style="display:flex;gap:6px;align-items:center"><i style="width:17px;height:11px;border-radius:2px;background:#fff;opacity:.9"></i><i style="width:24px;height:12px;border-radius:4px;border:1.5px solid #fff;opacity:.9"></i></span></div>
<div style="display:grid;gap:14px;padding:26px 23px 0">
  ${img("sup-fila", 344, 84)}
  <div style="display:flex;gap:16px">${img("sup-cuadro", 164, 170)}${img("descanso-cuadro-corre", 164, 170)}</div>
  ${img("empezar-fila", 344, 84)}
  ${img("tira", 344, 84)}
  ${img("descanso-fila", 344, 84)}
</div>
<div style="position:absolute;left:23px;right:23px;bottom:34px;height:84px;border-radius:30px;background:rgba(255,255,255,.12);display:flex;justify-content:space-around;align-items:center">${[0, 1, 2, 3].map(() => `<i style="width:54px;height:54px;border-radius:17px;background:rgba(255,255,255,.2)"></i>`).join("")}</div>
</body>`);
await page.screenshot({ path: join(SALIDA, "widgets.png") });
// La pieza agrandada: los suplementos y el botón de empezar.
await page.setContent(`<body style="margin:0;width:372px;padding:14px;display:grid;gap:12px;background:#0f1220">${img("sup-fila", 344, 84)}${img("empezar-fila", 344, 84)}</body>`);
await page.setViewportSize({ width: 372, height: 208 });
await page.screenshot({ path: join(SALIDA, "recorte-widgets.png") });
await browser.close();
console.log("  widgets\n  recorte-widgets");
