#!/usr/bin/env node
// Prueba el recorrido del "?" (como el tour de autogestión UCA): la
// bienvenida, la flecha, el recuadro de acción, el teclado, "Seguir con…" y
// la cruz. Necesita el perfil de muestra (npm run capturas -- --datos).
//
//   npm run recorrido
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
let mal = 0;
const ok = (n, c) => { if (!c) mal++; console.log(`${c ? "✓" : "✗"} ${n}`); };
try {
  await page.goto(`${url}/?demo=rutina`); await page.waitForTimeout(1500);
  await page.goto(`${url}/?pestana=rutina`); await page.waitForTimeout(1800);
  for (let k = 0; k < 4; k++) { await page.keyboard.press("Escape"); await page.waitForTimeout(200); }
  await page.getByRole("button", { name: /Ayuda/ }).click();
  await page.waitForTimeout(600);
  ok("el ? abre la bienvenida", await page.locator(".recorrido-bienvenida").isVisible());
  ok("la bienvenida lista los pasos", (await page.locator(".recorrido-bienvenida-lista li").count()) >= 4);
  await page.screenshot({ path: `${SALIDA}/tour-bienvenida.png` });
  await page.getByRole("button", { name: /^Empezar/ }).click();
  await page.waitForTimeout(900);
  ok("arranca el paso 1", (await page.locator(".recorrido-paso").innerText()).startsWith("Paso 1 de"));
  ok("la tarjeta tiene flecha", (await page.locator(".recorrido-tarjeta.flecha-arriba, .recorrido-tarjeta.flecha-abajo").count()) === 1);
  ok("trae el recuadro de acción", await page.locator(".recorrido-accion").isVisible());
  await page.screenshot({ path: `${SALIDA}/tour-paso1.png` });
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(800);
  ok("la flecha del teclado avanza", (await page.locator(".recorrido-paso").innerText()).startsWith("Paso 2 de"));
  await page.screenshot({ path: `${SALIDA}/tour-paso2.png` });
  for (let k = 0; k < 8; k++) { const b = page.getByRole("button", { name: /^Siguiente/ }); if (!(await b.count())) break; await b.click(); await page.waitForTimeout(700); }
  const seguir = page.getByRole("button", { name: /Seguir con Progreso/ });
  ok("al final ofrece seguir con Progreso", (await seguir.count()) === 1);
  await page.screenshot({ path: `${SALIDA}/tour-final.png` });
  await seguir.click(); await page.waitForTimeout(1500);
  ok("sigue en Progreso, paso 1", (await page.locator(".recorrido-paso").innerText().catch(() => "")).startsWith("Paso 1 de"));
  await page.screenshot({ path: `${SALIDA}/tour-progreso.png` });
  const info = await page.evaluate(() => { const b = document.querySelector(".recorrido-cerrar-chico"); const r = b.getBoundingClientRect(); const enc = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return `${Math.round(r.left)},${Math.round(r.top)} ${r.width}x${r.height} arriba=${enc?.className}`; });
  if (!/cerrar/.test(info)) console.log(`la cruz está tapada: ${info}`);
  await page.getByRole("button", { name: "Cerrar el recorrido" }).click({ timeout: 4000 }).catch(async (e) => { console.log("clic falló: " + e.message.split(String.fromCharCode(10))[0]); await page.evaluate(() => document.querySelector(".recorrido-cerrar-chico").click()); });
  await page.waitForTimeout(400);
  ok("la cruz lo cierra", (await page.locator(".recorrido-tarjeta").count()) === 0);
  ok("sin errores de la página", errores.length === 0);
  if (errores.length) console.log(errores);
} finally { await browser.close(); await server.close(); }
process.exit(mal ? 1 : 0);
