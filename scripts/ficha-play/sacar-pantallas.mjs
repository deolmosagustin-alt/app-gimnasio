// Las pantallas de la app para las capturas de Play, con la demo, cada una en
// su mejor momento, y los recortes de las piezas que las láminas muestran
// agrandadas (la serie, la gráfica, Tu plan, la carrera y la placa del día).
// Uso: node sacar-pantallas.mjs <raíz> <salida>
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
const [RAIZ, SALIDA] = process.argv.slice(2).map((x) => resolve(x));
mkdirSync(SALIDA, { recursive: true });
const req = createRequire(join(RAIZ, "package.json"));
const pw = await import(pathToFileURL(req.resolve("playwright")).href);
const chromium = pw.chromium || pw.default.chromium;
const { createServer } = await import(pathToFileURL(req.resolve("vite")).href);
const server = await createServer({ root: RAIZ, logLevel: "error", server: { open: false, port: 5411 } });
await server.listen();
const URL = server.resolvedUrls.local[0];
const browser = await chromium.launch();
const FECHA = "2026-10-19T18:30:00";
const clic = (loc) => loc.evaluate((b) => b.click());
// El perfil de muestra se llama "Diseño": para la tienda, un nombre de
// persona. Se cambia sólo en lo que recibe el navegador.
const NOMBRE = "Nico";
const demoConNombre = (() => {
  const d = JSON.parse(readFileSync(join(RAIZ, ".taste-skill/demo-storage.json"), "utf8"));
  const perfiles = JSON.parse(d.gym_profiles_v2 || "{}");
  const [viejo] = Object.keys(perfiles);
  if (!viejo) return JSON.stringify(d);
  const perfil = { ...perfiles[viejo], username: NOMBRE.toLowerCase() };
  d.gym_profiles_v2 = JSON.stringify({ [NOMBRE]: perfil });
  for (const k of Object.keys(d)) if (k !== "gym_profiles_v2" && typeof d[k] === "string" && d[k].includes(viejo)) d[k] = d[k].split(viejo).join(NOMBRE);
  return JSON.stringify(d);
})();
const nueva = async (demo, fecha = FECHA) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.route("**/.taste-skill/demo-storage.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: demoConNombre }));
  await p.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "gym_profiles_v2") {
        try {
          const todos = JSON.parse(v);
          for (const n of Object.keys(todos)) {
            const perfil = todos[n];
            perfil.onboardingDone = true;
            perfil.settings = { ...(perfil.settings || {}), trainingMode: "planned", autoShowPrShare: false };
            const r = perfil.routines?.[perfil.activeRoutineId];
            if (r && !r.__plan) {
              r.__plan = true;
              r.source = "custom";
              // Un plan de doble progresión en los tres primeros ejercicios de
              // cada día (una rep por semana y, al tope, 2,5 kg), para que Tu
              // plan tenga sus metas escritas.
              Object.values(r.days || {}).forEach((d) => (d.exercises || []).slice(0, 3).forEach((ex, i) => {
                const base = [72.5, 22.5, 10][i] || 20;
                if (ex.sets?.[0]) ex.sets[0].plannedProgression = Array.from({ length: 7 }, (_, w) => ({ week: w + 1, kg: base + Math.floor(w / 3) * 2.5, reps: 6 + (w % 3) }));
              }));
            }
          }
          v = JSON.stringify(todos);
        } catch { /* nada */ }
      }
      return orig.call(this, k, v);
    };
  });
  await p.clock.setFixedTime(new Date(fecha));
  await p.goto(URL + "?demo=" + demo);
  await p.waitForTimeout(3200);
  return p;
};
const foto = async (p, n) => { await p.waitForTimeout(900); await p.screenshot({ path: join(SALIDA, `${n}.png`) }); console.log("  " + n); };
// Un recorte de la pantalla: de la caja de `desde` a la de `hasta` (o la
// misma), con un margen.
const recorte = async (p, n, desde, hasta = desde, margen = 12) => {
  await p.waitForTimeout(700);
  const a = await desde.boundingBox(), b = await hasta.boundingBox();
  if (!a || !b) { console.log("  (sin " + n + ")"); return; }
  const x = Math.max(0, Math.min(a.x, b.x) - margen), y = Math.max(0, a.y - margen);
  const ancho = Math.min(390 - x, Math.max(a.x + a.width, b.x + b.width) - x + margen);
  const alto = Math.min(844 - y, b.y + b.height - y + margen);
  await p.screenshot({ path: join(SALIDA, `${n}.png`), clip: { x, y, width: ancho, height: alto } });
  console.log("  " + n);
};
const subirA = async (p, loc, margen = 120) => { await loc.evaluate((el, m) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - m), margen); await p.waitForTimeout(500); };
try {
  // Rutina: se inicia la sesión y se guardan dos series.
  {
    const p = await nueva("rutina");
    // La hora avanza como en una sesión de verdad: se entra 18:05, la
    // primera serie a las 18:27, la segunda a las 18:29 y la foto a las
    // 18:30 y pico (el descanso, a medio correr).
    await p.clock.setFixedTime(new Date("2026-10-19T18:05:00"));
    await clic(p.getByRole("button", { name: /Iniciar sesión/ }).first());
    await p.waitForTimeout(3000);
    const tarjeta = p.locator(".ejercicio").first();
    await clic(tarjeta.locator(".ejercicio-cabecera"));
    await p.waitForTimeout(700);
    for (const hora of ["18:27:00", "18:29:00"]) {
      await p.clock.setFixedTime(new Date(`2026-10-19T${hora}`));
      await clic(tarjeta.getByRole("button", { name: "Guardar serie" }).first());
      await p.waitForTimeout(2600);
    }
    await p.clock.setFixedTime(new Date("2026-10-19T18:30:13"));
    await p.waitForTimeout(1200);
    await subirA(p, tarjeta, 110);
    await foto(p, "rutina-serie");
    // La serie en foco, sola: la de hoy, con lo de la vez pasada arriba.
    const foco = tarjeta.locator(".serie-foco").first();
    if (await foco.count()) { await subirA(p, foco, 200); await recorte(p, "recorte-serie", foco, foco, 2); }
    await p.evaluate(() => window.scrollTo(0, 0));
    await foto(p, "rutina-arriba");
    const hoja = p.locator('section[aria-label="Tu plan"]').first();
    if (await hoja.count()) { await subirA(p, hoja, 90); await recorte(p, "recorte-plan", hoja, hoja, 2); }
    const dia = p.locator(".dia-hero").first();
    if (await dia.count()) {
      await subirA(p, dia, 90);
      await foto(p, "rutina-dia");
      // La placa del día hasta la barra: para la imagen principal.
      const barra = dia.locator(".dia-barra").first();
      if (await barra.count()) await recorte(p, "recorte-dia", dia, barra, 0);
    }
    await p.context().close();
  }
  // Progreso: el muñeco, la gráfica y el historial.
  {
    const p = await nueva("progreso");
    await subirA(p, p.locator(".figura-cuerpo").first(), 260);
    await foto(p, "progreso-muneco");
    await clic(p.getByRole("tab", { name: /Ejercicios/ }).first());
    await p.waitForTimeout(1200);
    const sel = p.locator("button").filter({ hasText: "Elevación de Talones" }).first();
    if (await sel.count()) await subirA(p, sel, 130);
    await foto(p, "progreso-grafica");
    // La gráfica sola: en la lámina tapa la del teléfono, agrandada.
    const grafica = p.locator(".grafica-tiempo").first();
    if (await grafica.count()) await recorte(p, "recorte-grafica", grafica, grafica, 14);
    await clic(p.getByRole("tab", { name: /Historial/ }).first());
    await p.waitForTimeout(1200);
    await subirA(p, p.locator(".tarjeta-perforada, .hueco-dia").first(), 180);
    await foto(p, "progreso-historial");
    // El ticket de un día.
    const picado = p.locator(".hueco-dia.picado").last();
    if (await picado.count()) {
      await clic(picado);
      await p.waitForTimeout(900);
      const t = p.getByRole("button", { name: /^Ticket$/ }).first();
      if (await t.count()) { await clic(t); await p.waitForTimeout(1800); await foto(p, "ticket"); }
    }
    await p.context().close();
  }
  // El planificador, lleno como un entrenador.
  {
    const p = await nueva("rutina");
    await clic(p.locator('section[aria-label="Tu plan"]').getByRole("button", { name: /Planificar/ }).first());
    await p.waitForTimeout(1200);
    await clic(p.getByRole("button", { name: /Llenar el ciclo/ }).first());
    await p.waitForTimeout(800);
    await foto(p, "planificador");
    await p.context().close();
  }
  // El Chatbot, Social y Rutinas.
  // Social, un jueves: la carrera de la semana con más sesiones.
  for (const [demo, n, fecha] of [["entrenador_ia", "chatbot"], ["social", "social", "2026-10-22T18:30:00"], ["rutinas", "rutinas"]]) {
    const p = await nueva(demo, fecha);
    await foto(p, n);
    if (n === "social") {
      const carrera = p.locator(".carrera").first();
      if (await carrera.count()) { await subirA(p, carrera, 220); await recorte(p, "recorte-carrera", carrera, carrera, 3); }
    }
    await p.context().close();
  }
} finally {
  await browser.close();
  await server.close();
}
