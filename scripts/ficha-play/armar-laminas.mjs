// Las láminas de Play (1080 × 1920) y la imagen principal (1024 × 500), con
// las pantallas y los recortes de sacar-pantallas.mjs. Cada lámina, de un
// color fuerte (el de su pestaña, más saturado: en la tienda se ven chicas y
// una al lado de la otra), con un disco de pesas de fondo, el título grande,
// el teléfono y, en las primeras, la pieza clave agrandada encima.
// Uso: node armar-laminas.mjs <raíz> <carpeta de la ficha> [--tu]
// Con --tu, los textos con tú (para es-ES y es-US) en laminas-tu/.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
const [RAIZ, FICHA] = process.argv.slice(2).filter((x) => !x.startsWith("--")).map((x) => resolve(x));
const TU = process.argv.includes("--tu");
const SALIDA = join(FICHA, TU ? "laminas-tu" : "laminas");
mkdirSync(SALIDA, { recursive: true });
const req = createRequire(join(RAIZ, "package.json"));
const pw = await import(pathToFileURL(req.resolve("playwright")).href);
const chromium = pw.chromium || pw.default.chromium;
const archivo = (p) => pathToFileURL(p).href;
const FUENTE = archivo(join(RAIZ, "node_modules/@fontsource-variable/mona-sans/files/mona-sans-latin-wdth-normal.woff2"));
const pantalla = (n) => join(FICHA, "pantallas", `${n}.png`);

// fondo: [arriba, abajo]. recorte: la pieza agrandada (x, y, ancho, giro).
const LAMINAS = [
  { n: "01-serie", img: "rutina-serie", ancla: "bottom", fondo: ["#12A08D", "#075247"],
    recorte: { img: "recorte-serie", x: 50, y: 1150, ancho: 980, giro: -2.5 },
    vos: ["Tu rutina, que progresa sola", "Cada serie viene escrita con lo que toca hoy: una rep más o un poco más de peso."],
    tu: ["Tu rutina, que progresa sola", "Cada serie viene escrita con lo que toca hoy: una rep más o un poco más de peso."] },
  { n: "02-grafica", img: "progreso-grafica", ancla: "top", fondo: ["#3373F0", "#173A9E"],
    recorte: { img: "recorte-grafica", x: 50, y: 1150, ancho: 980, giro: 2 },
    vos: ["Mirá cuánto subiste", "La gráfica de cada ejercicio, con tus récords y tu 1RM estimado."],
    tu: ["Mira tu progreso", "La gráfica de cada ejercicio, con tus récords y tu 1RM estimado."] },
  { n: "03-plan", img: "planificador", ancla: "top", fondo: ["#F07428", "#A53A08"],
    recorte: { img: "recorte-plan", x: 70, y: 900, ancho: 900, giro: -2.5 },
    vos: ["Un plan como el de un entrenador", "Primero suben las reps, después el peso. Si no llegás a una meta, la repetís."],
    tu: ["Un plan como el de un entrenador", "Primero suben las reps, después el peso. Si no llegas a una meta, la repites."] },
  { n: "04-musculos", img: "progreso-muneco", ancla: "top", fondo: ["#DB8E12", "#8A4F06"],
    vos: ["Tu nivel en cada músculo", "De Bronce a Maestro, calculado con tus marcas."],
    tu: ["Tu nivel en cada músculo", "De Bronce a Maestro, calculado con tus marcas."] },
  { n: "05-ia", img: "chatbot", ancla: "top", fondo: ["#169068", "#0A4A36"],
    vos: ["Un entrenador con IA que te conoce", "Preguntale con cuánto arrancar o pedile una rutina nueva."],
    tu: ["Un entrenador con IA que te conoce", "Pregúntale con cuánto empezar o pídele una rutina nueva."] },
  { n: "06-ticket", img: "ticket", ancla: "top", fondo: ["#E5395A", "#93142F"],
    vos: ["Cada sesión, en su ticket", "Cuánto duró, qué levantaste y cómo te fue contra la vez pasada."],
    tu: ["Cada sesión, en su ticket", "Cuánto duró, qué levantaste y cómo te fue contra la vez pasada."] },
  { n: "07-amigos", img: "social", ancla: "top", fondo: ["#8152F0", "#4320A0"],
    recorte: { img: "recorte-carrera", x: 60, y: 1235, ancho: 960, giro: 2 },
    vos: ["Entrená con tus amigos", "Quién fue más veces esta semana, aplausos y retos."],
    tu: ["Entrena con tus amigos", "Quién fue más veces esta semana, aplausos y retos."] },
  { n: "08-rutinas", img: "rutinas", ancla: "top", fondo: ["#4558E0", "#232B8C"],
    vos: ["Rutinas listas o la de tu profe", "Push Pull Legs, Cuerpo completo y más, o importala desde una foto."],
    tu: ["Rutinas listas o la de tu entrenador", "Push Pull Legs, Cuerpo completo y más, o impórtala desde una foto."] },
];

const base = `
@font-face { font-family: Mona; src: url("${FUENTE}") format("woff2"); font-weight: 200 900; font-stretch: 75% 125%; }
* { box-sizing: border-box; margin: 0; }
html, body { background: #000; }
body { font-family: Mona, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
/* El disco de pesas de fondo: dos aros y el agujero, en blanco muy tenue. */
.disco { position: absolute; border-radius: 50%; border-style: solid; border-color: rgba(255,255,255,.075); pointer-events: none; }
`;
const lamina = (l) => {
  const [titulo, bajada] = TU ? l.tu : l.vos;
  const r = l.recorte && existsSync(pantalla(l.recorte.img)) ? l.recorte : null;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${base}
.lamina { position: relative; width: 1080px; height: 1920px; overflow: hidden; display: flex; flex-direction: column;
  background: radial-gradient(90% 48% at 18% 2%, rgba(255,255,255,.16), transparent 62%), linear-gradient(172deg, ${l.fondo[0]} 8%, ${l.fondo[1]} 92%); }
.texto { position: relative; padding: 116px 84px 0; }
h1 { font-size: 112px; line-height: .96; font-weight: 820; font-stretch: 80%; letter-spacing: -0.025em; color: #fff; text-wrap: balance; }
p { margin-top: 30px; font-size: 43px; line-height: 1.28; font-weight: 500; color: rgba(255,255,255,.9); max-width: 900px; text-wrap: pretty; }
.telefono { position: relative; margin: 70px auto 0; width: 852px; flex: 1 1 0; min-height: 0; padding: 20px 20px 0; border-radius: 92px 92px 0 0; background: #0b0c0e;
  box-shadow: 0 0 0 3px rgba(255,255,255,.16), 0 -10px 90px -20px rgba(0,0,0,.5); }
.pantalla { position: relative; height: 100%; border-radius: 74px 74px 0 0; overflow: hidden; background: #000; }
.pantalla img { width: 100%; height: 100%; object-fit: cover; object-position: center ${l.ancla}; display: block; }
.recorte { position: absolute; left: ${r?.x || 0}px; top: ${r?.y || 0}px; width: ${r?.ancho || 0}px; transform: rotate(${r?.giro || 0}deg); border-radius: 40px; overflow: hidden; background: #111;
  box-shadow: 0 0 0 5px rgba(255,255,255,.95), 0 60px 110px -30px rgba(0,0,0,.75), 0 24px 40px -18px rgba(0,0,0,.5); }
.recorte img { display: block; width: 100%; }
</style></head><body><main class="lamina">
<span class="disco" style="width:980px;height:980px;right:-330px;top:-300px;border-width:120px"></span>
<span class="disco" style="width:420px;height:420px;right:-50px;top:-20px;border-width:36px"></span>
<div class="texto"><h1>${titulo}</h1><p>${bajada}</p></div>
<div class="telefono"><div class="pantalla"><img src="${archivo(pantalla(l.img))}" alt=""></div></div>
${r ? `<div class="recorte"><img src="${archivo(pantalla(r.img))}" alt=""></div>` : ""}
</main></body></html>`;
};

// La imagen principal: el nombre, qué hace y la placa del día con su barra.
const principal = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${base}
.principal { position: relative; width: 1024px; height: 500px; overflow: hidden; display: grid; grid-template-columns: 1fr 452px; align-items: center; gap: 30px; padding: 0 54px 0 70px;
  background: radial-gradient(70% 90% at 10% 0%, rgba(255,255,255,.18), transparent 64%), linear-gradient(160deg, #12A08D, #064B41); }
h1 { position: relative; font-size: 118px; line-height: .9; font-weight: 840; font-stretch: 80%; letter-spacing: -0.03em; color: #fff; }
p { position: relative; margin-top: 22px; font-size: 34px; line-height: 1.22; font-weight: 560; color: rgba(255,255,255,.92); max-width: 420px; text-wrap: balance; }
.tarjeta { position: relative; width: 452px; border-radius: 30px; overflow: hidden; background: #111; transform: rotate(-3deg);
  box-shadow: 0 0 0 4px rgba(255,255,255,.95), 0 40px 80px -24px rgba(0,0,0,.7); }
.tarjeta img { display: block; width: 100%; }
</style></head><body><main class="principal">
<span class="disco" style="width:620px;height:620px;right:-170px;top:-120px;border-width:80px"></span>
<span class="disco" style="width:260px;height:260px;right:10px;top:60px;border-width:24px"></span>
<div><h1>Modus Fit</h1><p>Tu rutina de gimnasio, que progresa sola</p></div>
<div class="tarjeta"><img src="${archivo(pantalla("recorte-dia"))}" alt=""></div>
</main></body></html>`;

const browser = await chromium.launch();
try {
  const p = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  for (const l of LAMINAS) {
    const html = join(SALIDA, `${l.n}.html`);
    writeFileSync(html, lamina(l));
    await p.goto(archivo(html));
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(500);
    await p.screenshot({ path: join(SALIDA, `${l.n}.png`), clip: { x: 0, y: 0, width: 1080, height: 1920 } });
    console.log("  " + l.n);
  }
  const html = join(SALIDA, "principal.html");
  writeFileSync(html, principal);
  await p.setViewportSize({ width: 1024, height: 500 });
  await p.goto(archivo(html));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  await p.screenshot({ path: join(SALIDA, "principal.png"), clip: { x: 0, y: 0, width: 1024, height: 500 } });
  console.log("  principal");
} finally {
  await browser.close();
}
