#!/usr/bin/env node
/**
 * La sesión de punta a punta, en un navegador de verdad: "Iniciar sesión"
 * tiene que mostrar el molinete de entrada, y al guardar una serie y
 * finalizar tiene que salir el ticket. Lo pidió el usuario el 03/11/2026
 * ("me está dejando de dar los tickets cuando termino, lo mismo con la
 * animación del molinete").
 *
 *   npm run sesion        (o node scripts/probar-sesion.mjs)
 *
 * Necesita el perfil de muestra (npm run capturas -- --datos). Levanta su
 * propio Vite y deja las capturas en .taste-skill/pruebas/.
 */
import { mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = join(RAIZ, ".taste-skill", "pruebas");
mkdirSync(SALIDA, { recursive: true });
if (!existsSync(join(RAIZ, ".taste-skill", "demo-storage.json"))) {
  console.error("Falta el perfil de muestra: corré npm run capturas -- --datos");
  process.exit(1);
}

const server = await createServer({ root: RAIZ, logLevel: "error", server: { port: 0, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch();
const errores = [];
let fallas = 0;
const ok = (nombre, c, detalle = "") => {
  if (!c) fallas++;
  console.log(`${c ? "  ✓" : "  ✗"} ${nombre}${detalle ? ` (${detalle})` : ""}`);
};

async function probar({ fecha, nombre, boton }) {
  console.log(nombre);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" });
  const page = await context.newPage();
  await page.clock.install({ time: new Date(`${fecha}T18:30:00-03:00`) });
  page.on("pageerror", (e) => errores.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource|\[demo\]/.test(m.text())) errores.push(m.text().slice(0, 300)); });
  await page.goto(`${url}/?demo=rutina`);
  await page.waitForTimeout(1500);
  // El ciclo de muestra empieza el 14/09: el 22/10 es la semana 6 y el 5/11, la 8 (la descarga).
  await page.evaluate(() => { localStorage.setItem("gym_cycle_start_v2", "2026-09-14T15:00:00.000Z"); localStorage.setItem("modusfit_descarga_vista", new Date().toISOString().slice(0, 10)); });
  await page.goto(`${url}/?pestana=rutina`);
  await page.waitForTimeout(2500);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Escape").catch(() => {});
    const saltar = page.getByRole("button", { name: /^(Saltar|Ahora no)$/ });
    if (await saltar.count()) await saltar.first().click().catch(() => {});
    await page.waitForTimeout(300);
  }
  const iniciar = page.getByRole("button", { name: /Iniciar sesión/ }).first();
  ok("está el botón Iniciar sesión", await iniciar.count());
  await iniciar.click();
  await page.waitForTimeout(400);
  ok("al iniciar sale el molinete", (await page.locator(".molinete-velo").count()) > 0);
  await page.waitForTimeout(2600);
  ok("el molinete se va solo", (await page.locator(".molinete-velo").count()) === 0);

  // Una serie y Finalizar.
  if (!(await page.getByRole("button", { name: boton }).count())) {
    await page.locator(".ejercicio").first().scrollIntoViewIfNeeded();
    await page.locator(".ejercicio").first().click();
    await page.waitForTimeout(800);
  }
  const guardar = page.getByRole("button", { name: boton }).first();
  ok("está el ✓ de la serie", await guardar.count());
  if (!(await guardar.count())) { await page.screenshot({ path: join(SALIDA, `sesion-${fecha}-sin-serie.png`) }); await context.close(); return; }
  await guardar.scrollIntoViewIfNeeded();
  await guardar.click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /^Finalizar/ }).first().click();
  await page.waitForTimeout(400);
  const si = page.getByRole("button", { name: /Sí, finalizar/ });
  if (await si.count()) await si.first().click();
  // Primero la salida por el molinete (04/11), después el ticket.
  await page.waitForTimeout(500);
  ok("al finalizar sale el molinete de salida", (await page.locator(".molinete-velo.salida").count()) > 0);
  ok("el ticket espera al molinete", (await page.locator(".ticket-fila").count()) === 0);
  await page.screenshot({ path: join(SALIDA, `sesion-${fecha}-salida.png`) });
  await page.waitForTimeout(2600);
  ok("el molinete de salida se va solo", (await page.locator(".molinete-velo").count()) === 0);
  await page.screenshot({ path: join(SALIDA, `sesion-${fecha}-ticket.png`) });
  ok("al finalizar sale el ticket", (await page.locator(".ticket-fila").count()) > 0);
  await context.close();
}

try {
  await probar({ fecha: "2026-10-22", nombre: "Entrenamiento (semana 6)", boton: "Guardar serie" });
  await probar({ fecha: "2026-11-05", nombre: "Semana de descarga (semana 8)", boton: "Marcar como hecha" });
  ok("sin errores de consola", errores.length === 0, errores.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  await server.close();
}
process.exit(fallas ? 1 : 0);
