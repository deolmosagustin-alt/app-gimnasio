#!/usr/bin/env node
// Prueba que los cambios de pestaña de la barra van sin la transición de
// pantalla entera (dejaba un cuadro negro) y que el día que viaja desde Rutinas hasta la placa del día en Rutina, en un
// navegador de verdad. Necesita el perfil de muestra (npm run capturas --
// --datos). Capturas en .taste-skill/pruebas/.
//
//   npm run transiciones
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = join(RAIZ, ".taste-skill", "pruebas");
mkdirSync(SALIDA, { recursive: true });
const server = await createServer({ root: RAIZ, logLevel: "error", server: { port: 0 } });
await server.listen();
const url = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-AR" });
const page = await ctx.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource|\[demo\]/.test(m.text())) errores.push(m.text().slice(0, 200)); });
let mal = 0;
const ok = (n, c, extra = "") => { if (!c) mal++; console.log(`${c ? "✓" : "✗"} ${n}${extra ? ` (${extra})` : ""}`); };
try {
  await page.goto(`${url}/?demo=rutina`); await page.waitForTimeout(1500);
  await page.addInitScript(() => {
    window.__vt = 0;
    const orig = document.startViewTransition?.bind(document);
    if (orig) document.startViewTransition = (cb) => { window.__vt++; return orig(cb); };
  });
  await page.goto(`${url}/?pestana=rutina`); await page.waitForTimeout(1800);
  for (let k = 0; k < 4; k++) { await page.keyboard.press("Escape"); await page.waitForTimeout(150); }
  ok("el navegador tiene transiciones de vista", await page.evaluate(() => typeof document.startViewTransition === "function"));
  const nav = page.locator("nav.barra-pestanas");
  await nav.getByRole("button", { name: /Progreso/ }).click();
  await page.waitForTimeout(180);
  await page.screenshot({ path: `${SALIDA}/vt-medio.png` });
  await page.waitForTimeout(700);
  ok("Rutina → Progreso cambia sin la transición de pantalla entera (deslizamiento)", (await page.evaluate(() => window.__vt)) === 0);
  ok("quedó en Progreso", await page.locator(".titulo-pagina h1", { hasText: "Progreso" }).isVisible());
  ok("se limpió la marca de la transición", await page.evaluate(() => !document.documentElement.dataset.vt));
  await nav.getByRole("button", { name: /Rutinas/ }).click();
  await page.waitForTimeout(900);
  ok("quedó en Rutinas", await page.locator(".titulo-pagina h1", { hasText: "Rutinas" }).isVisible());
  const pesa = page.locator(".estante-lugar.con-pesa").first();
  await pesa.click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SALIDA}/vt-viaja.png` });
  await page.waitForTimeout(900);
  ok("la pesa llevó a Rutina", await page.locator(".titulo-pagina h1", { hasText: /^Rutina$/ }).isVisible());
  ok("sólo la pesa usó la transición de vista", (await page.evaluate(() => window.__vt)) === 1, String(await page.evaluate(() => window.__vt)));
  ok("la placa quedó sin nombre de transición", await page.evaluate(() => !document.querySelector(".dia-hero")?.style.viewTransitionName));
  await page.screenshot({ path: `${SALIDA}/vt-final.png` });
  ok("sin errores de la página", errores.length === 0);
  if (errores.length) console.log(errores);
} finally { await browser.close(); await server.close(); }
process.exit(mal ? 1 : 0);
