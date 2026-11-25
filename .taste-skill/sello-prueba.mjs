// El sello todas las semanas y la vez pasada ⇄ récord en la serie con plan:
// node .taste-skill/sello-prueba.mjs (con npm run dev, después de capturas --datos)
import { chromium } from "playwright";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
const errores = []; p.on("pageerror", (e) => errores.push(e.message));
await p.goto("http://localhost:5173/?demo=rutina"); await p.waitForTimeout(2500);
// Semana 3 de un ciclo de 6 + 1: no es la de descarga.
await p.evaluate(() => {
  const ps = JSON.parse(localStorage.gym_profiles_v2); const pf = Object.values(ps)[0];
  const d = new Date(); d.setDate(d.getDate() - 7 * 2 - 1); d.setHours(0, 0, 0, 0);
  localStorage.setItem("gym_cycle_start_v2", d.toISOString());
  pf.settings = { ...(pf.settings || {}), deloadEnabled: true, deloadWeeks: 1, trainWeeks: 6 };
  localStorage.gym_profiles_v2 = JSON.stringify(ps);
});
await p.goto("http://localhost:5173/?pestana=rutina"); await p.waitForTimeout(3500);
await p.keyboard.press("Escape"); await p.waitForTimeout(500);
const sello = p.locator(".sello-semana");
console.log("semana 3 · sello:", await sello.innerText().catch(() => "no hay"), "· subtítulo:", await p.locator("h1 + *").first().innerText().catch(() => ""));
await p.locator(".dia-hero").first().screenshot({ path: ".taste-skill/pruebas/sello-normal.png" });
await sello.click(); await p.waitForTimeout(2500);
console.log("tras tocarlo:", await sello.innerText(), "· nota:", await p.locator(".nota-descarga").count(), "· ajuste:", await p.evaluate(() => Object.values(JSON.parse(localStorage.gym_profiles_v2))[0].settings.descargaManual));
await p.screenshot({ path: ".taste-skill/pruebas/sello-descarga.png" });
await sello.click(); await p.waitForTimeout(1500);
console.log("de vuelta:", await sello.innerText(), "· nota:", await p.locator(".nota-descarga").count());
console.log(errores.length ? errores : "sin errores");
await b.close();
