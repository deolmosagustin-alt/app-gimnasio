// En la serie con plan: la vez pasada ⇄ el récord, con el botón chico.
// node .taste-skill/ref-plan.mjs [claro]
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const claro = process.argv[2] === "claro";
const pre = process.argv[3] || "ahora";
const C = join(RAIZ, ".taste-skill", "ref-plan"); mkdirSync(C, { recursive: true });
const server = await createServer({ root: RAIZ, logLevel: "error", server: { port: 0 } });
await server.listen();
const url = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" })).newPage();
const errores = []; page.on("pageerror", (e) => errores.push(e.message));
await page.clock.install({ time: new Date("2026-10-22T18:30:00-03:00") });
await page.goto(`${url}/?demo=rutina`); await page.waitForTimeout(1500);
const info = await page.evaluate((c) => {
  localStorage.setItem("gym_cycle_start_v2", "2026-10-05T15:00:00.000Z");
  const t = JSON.parse(localStorage.getItem("gym_profiles_v2"));
  const out = {};
  Object.values(t).forEach((p) => {
    p.settings = { ...(p.settings || {}), trainingMode: "planned", ...(c ? { theme: "light" } : {}) };
    const r = p.routines?.[p.activeRoutineId];
    out.conDias = !!r?.days;
    if (r?.days) {
      Object.values(r.days).forEach((d) => (d.exercises || []).slice(0, 2).forEach((e) => (e.sets || []).forEach((s) => {
        s.plannedProgression = [1, 2, 3, 4, 5, 6, 7].map((week) => ({ week, reps: 8 + ((week - 1) % 3), kg: 60 + 2.5 * Math.floor((week - 1) / 3) }));
        s.plannedAt = "2026-10-05T15:00:00.000Z"; s.plannedCycle = 1;
      })));
      // Dos rutinas creadas, para ver la lista.
      p.routines.mia1 = { ...JSON.parse(JSON.stringify(r)), name: "Torso / Pierna de invierno", source: "custom" };
      p.activeRoutineId = "mia1";
      p.routines.mia2 = { ...JSON.parse(JSON.stringify(r)), name: "Fuerza 5 × 5", source: "custom", dayOrder: r.dayOrder.slice(0, 2) };
    }
  });
  localStorage.setItem("gym_profiles_v2", JSON.stringify(t));
  return out;
}, claro);
console.log(info);
const cerrar = async () => { for (let k = 0; k < 4; k++) { await page.keyboard.press("Escape"); await page.waitForTimeout(150); } };
const foto = (n) => page.screenshot({ path: join(C, `${pre}-${n}${claro ? "-claro" : ""}.png`) });
await page.goto(`${url}/?pestana=rutina`); await page.waitForTimeout(3000); await cerrar();
await page.locator(".ejercicio-cabecera").first().click(); await page.waitForTimeout(900);
await page.locator(".ejercicio").first().evaluate((el) => el.scrollIntoView({ block: "start" })); await page.evaluate(() => window.scrollBy(0, -120)); await page.waitForTimeout(400);
const ref = page.locator(".ejercicio").first().locator(".foco-ref").first();
console.log("antes de tocar:", (await ref.innerText()).replace(/\s+/g, " "), "· es botón:", await ref.evaluate((el) => el.tagName));
await foto("1-antes");
await ref.click(); await page.waitForTimeout(700);
console.log("tocado:", (await ref.innerText()).replace(/\s+/g, " "));
await foto("2-record");
const otra = page.locator(".ejercicio").nth(1);
await otra.locator(".ejercicio-cabecera").click(); await page.waitForTimeout(900);
console.log("el segundo ejercicio también:", (await otra.locator(".foco-ref").first().innerText().catch(() => "-")).replace(/\s+/g, " "));
await ref.click(); await page.waitForTimeout(500);
console.log("de vuelta:", (await ref.innerText()).replace(/\s+/g, " "));
console.log("errores:", errores.length ? errores : "ninguno");
await browser.close(); await server.close();
