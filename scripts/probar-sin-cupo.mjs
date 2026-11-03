#!/usr/bin/env node
// Simula que la cuota gratis de Gemini se terminó para todos (503 con
// sinCupoGlobal): el chat tiene que decir a qué hora vuelve y no descontar la
// consulta. Necesita el perfil de muestra (npm run capturas -- --datos).
//
//   npm run sincupo
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const server = await createServer({ root: RAIZ, logLevel: "error", server: { port: 5900 + Math.floor(Math.random() * 90) } });
await server.listen();
const url = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" })).newPage();
await page.route("**/api/ia", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "x", sinCupoGlobal: true, vuelve: "2026-11-04T08:01:00.000Z" }) }));
await page.goto(`${url}/?demo=entrenador_ia`); await page.waitForTimeout(1500);
await page.goto(`${url}/?pestana=entrenador_ia`); await page.waitForTimeout(2000);
for (let k = 0; k < 4; k++) { await page.keyboard.press("Escape"); await page.waitForTimeout(120); }
const antes = await page.evaluate(() => localStorage.getItem("modusfit_ia_cupo") || localStorage.getItem(Object.keys(localStorage).find((k) => /cupo/i.test(k)) || "") || "nada");
const caja = page.locator("textarea, input[type=text]").last();
await caja.fill("¿Qué hago hoy?"); await page.keyboard.press("Enter"); await page.waitForTimeout(2500);
const texto = await page.locator("body").innerText();
const despues = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => /cupo/i.test(x)); return k ? `${k}=${localStorage.getItem(k)}` : "nada"; });
console.log("aviso:", (texto.match(/El Entrenador IA tuvo mucha gente[^\n]*/) || ["(no apareció)"])[0]);
console.log("cupo antes:", antes, "| después:", despues);
await browser.close(); await server.close();
