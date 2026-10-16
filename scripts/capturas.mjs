#!/usr/bin/env node
/**
 * Saca capturas de las pantallas reales de la app, para mirar el diseño.
 *
 * La app abre en el login, así que una captura "de la URL" muestra siempre
 * lo mismo. Este script hace lo que haría alguien que entra sin cuenta de
 * Google: crea un perfil local, elige una rutina preestablecida y recorre las
 * pestañas. Todo vive en el localStorage de un navegador descartable; no toca
 * Firebase ni ningún dato real.
 *
 *   npm run capturas                      (celular, 390×844)
 *   npm run capturas -- --escritorio      (además 1440×900)
 *   npm run capturas -- --safari          (motor WebKit, como un iPhone)
 *   npm run capturas -- --carpeta antes   (para comparar antes y después)
 *
 * Levanta su propio servidor de Vite en un puerto libre: no hace falta tener
 * `npm run dev` corriendo. Por cada pantalla guarda lo que se ve al abrirla
 * (nítido, al doble de resolución) y la página entera. Todo queda en
 * .taste-skill/capturas/<carpeta>/, que git ignora.
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const valor = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const conEscritorio = args.includes("--escritorio");
const motor = args.includes("--safari") ? webkit : chromium;
// Sin --carpeta, la fecha y hora local (no UTC) de la corrida.
const carpeta = valor("--carpeta") || new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
const SALIDA = join(RAIZ, ".taste-skill", "capturas", carpeta);

// Las pestañas de la barra de abajo (NAV_TABS en src/App.jsx). Perfil no está
// en la barra: en el celular se entra por el avatar del header, y en
// escritorio por el nombre en la barra lateral.
const PESTANAS = ["Rutina", "Progreso", "Social", "Rutinas", "Chatbot"];
const NOMBRE_PERFIL = "Diseño";

const VISTAS = [
  { nombre: "celular", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ...(conEscritorio ? [{ nombre: "escritorio", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }] : []),
];

const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

const server = await createServer({ root: RAIZ, logLevel: "error", server: { open: false } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await motor.launch();
const errores = [];
let fallo = null;

try {
  mkdirSync(SALIDA, { recursive: true });
  for (const vista of VISTAS) {
    const { nombre, ...opciones } = vista;
    const context = await browser.newContext(opciones);
    const page = await context.newPage();
    page.on("pageerror", (e) => errores.push(`[${nombre}] ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) errores.push(`[${nombre}] ${m.text().slice(0, 300)}`);
    });

    // Cierra lo que tape la pantalla (bienvenidas, ayudas, avisos) igual que
    // lo haría una persona: Escape, y si sigue ahí, un toque en el fondo.
    const cerrarModales = async () => {
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(250);
        const fondo = page.locator(".modal-overlay:not(.pointer-events-none)");
        if (!(await fondo.count())) return;
        await fondo.first().click({ position: { x: 4, y: 4 }, force: true }).catch(() => {});
        await page.waitForTimeout(400);
      }
    };
    const paso = async (descripcion, accion) => {
      try { await accion(); } catch (e) {
        const captura = join(SALIDA, `${nombre}-error.png`);
        await page.screenshot({ path: captura }).catch(() => {});
        throw new Error(`No pude ${descripcion} (${e.message.split("\n")[0]}). Así estaba la pantalla: ${relative(RAIZ, captura)}`);
      }
    };
    const capturar = async (pantalla) => {
      await page.waitForTimeout(900);
      await cerrarModales();
      await page.evaluate(() => window.scrollTo(0, 0));
      const base = join(SALIDA, `${nombre}-${slug(pantalla)}`);
      await page.screenshot({ path: `${base}.png` });
      await page.screenshot({ path: `${base}-completa.png`, fullPage: true, scale: "css" });
      console.log(`  ${relative(RAIZ, base)}.png`);
    };

    console.log(`${nombre} (${opciones.viewport.width}×${opciones.viewport.height})`);
    await page.goto(url);
    await capturar("Login");

    await paso("crear el perfil local", async () => {
      await page.getByText("Crear perfil sin Google").click({ timeout: 10000 });
      await page.locator("input:visible").first().fill(NOMBRE_PERFIL);
      await page.getByRole("button", { name: "Crear perfil", exact: true }).click({ timeout: 8000 });
      await page.waitForTimeout(800);
    });
    const preestablecida = page.getByText("Elegir una preestablecida");
    await preestablecida.waitFor({ timeout: 6000 }).catch(() => {});
    if (await preestablecida.count()) {
      await capturar("Primera rutina");
      await paso("elegir la rutina preestablecida", async () => {
        await preestablecida.click();
        await page.getByText(/PUSH \/ PULL \/ LEGS/i).first().click({ timeout: 8000 });
        await page.getByText("Usar esta rutina", { exact: true }).click({ timeout: 8000 });
      });
    }
    // Después viene armar la semana (qué día toca cada parte de la rutina).
    const listo = page.getByRole("button", { name: "Listo, empezar a entrenar" });
    await listo.waitFor({ timeout: 6000 }).catch(() => {});
    if (await listo.count()) {
      await capturar("Armar semana");
      await paso("confirmar la semana", () => listo.first().click({ timeout: 8000 }));
    }
    // Activar la primera rutina abre la bienvenida (WelcomeIntro), que no se
    // cierra tocando afuera: hay que saltarla. Es parte de lo que ve alguien
    // nuevo, así que se captura antes.
    const saltar = page.getByRole("button", { name: "Saltar", exact: true });
    await saltar.waitFor({ timeout: 6000 }).catch(() => {});
    if (await saltar.count()) {
      await capturar("Bienvenida");
      await paso("saltar la bienvenida", () => saltar.first().click({ timeout: 8000 }));
    }

    for (const pestana of PESTANAS) {
      await paso(`abrir la pestaña ${pestana}`, async () => {
        await cerrarModales();
        const boton = page.locator("button:visible").filter({ hasText: new RegExp(`^${pestana}$`, "i") });
        await boton.first().click({ timeout: 8000 });
      });
      await capturar(pestana);
    }
    await paso("abrir el perfil", async () => {
      await cerrarModales();
      const avatar = page.getByRole("button", { name: "Tu perfil" });
      if (await avatar.isVisible()) await avatar.click();
      else await page.locator("button:visible").filter({ hasText: NOMBRE_PERFIL }).first().click({ timeout: 8000 });
    });
    await capturar("Perfil");
    await context.close();
  }
} catch (e) {
  fallo = e;
} finally {
  await browser.close();
  await server.close();
}

if (errores.length) {
  console.log("\nErrores de la app mientras se recorría:");
  for (const e of [...new Set(errores)].slice(0, 10)) console.log("  " + e);
}
if (fallo) {
  console.error(`\n${fallo.message}`);
  process.exit(1);
}
console.log(`\nListo: ${relative(RAIZ, SALIDA)}`);
