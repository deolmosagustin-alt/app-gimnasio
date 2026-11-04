#!/usr/bin/env node
/**
 * Prueba de punta a punta, en un navegador de verdad, de los flujos de la
 * tanda de noviembre (rama mejoras-noviembre):
 *
 *   · la semana de descarga adentro de Rutina: la vista se transforma (la
 *     barra suelta discos), cada serie trae un peso que se puede cargar, se
 *     marca, se pasa a entrenamiento normal y se vuelve;
 *   · la vista previa de la descarga desde Progreso y "Hacerla esta semana"
 *     (corre el inicio del ciclo);
 *   · el chat: la pizarra queda arriba y la charla crece debajo (la IA se
 *     simula: no gasta cupo de Gemini);
 *   · el paywall en modo de prueba (sólo existe en desarrollo) y que, con el
 *     cobro apagado, no aparece;
 *   · los errores de consola de todo el recorrido.
 *
 *   npm run probar            (o node scripts/probar-flujos.mjs)
 *
 * Necesita el perfil de muestra: npm run capturas -- --datos (deja
 * .taste-skill/demo-storage.json). Levanta su propio Vite y deja las
 * capturas en .taste-skill/pruebas/. Sale con código 1 si algo falla.
 */
import { mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
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
const resultados = [];
const ok = (nombre, condicion, detalle = "") => {
  resultados.push({ nombre, ok: !!condicion, detalle });
  console.log(`${condicion ? "  ✓" : "  ✗"} ${nombre}${detalle ? ` (${detalle})` : ""}`);
};

// Una página con el perfil de muestra en una pestaña, como si fuera `fecha`
// a las 18:30. `antes` corre en la página antes de que arranque la app.
// El ciclo de muestra empieza el 14/09/2026: el 5/11 es la semana 8 de 8 (la
// descarga) y el 22/10, la 6. Se fija acá para no depender de cuándo se armó
// el perfil de muestra (npm run capturas crea el suyo con el ciclo de ese día).
const CICLO = "2026-09-14T15:00:00.000Z";
async function abrir(pestana, { fecha = "2026-11-05", ancho = 390, alto = 844, antes = null, extra = "", ciclo = CICLO } = {}) {
  const context = await browser.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(`${fecha}T18:30:00-03:00`));
  page.on("pageerror", (e) => errores.push(`[${pestana}] ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|Failed to load resource|\[demo\]/.test(m.text())) errores.push(`[${pestana}] ${m.text().slice(0, 300)}`);
  });
  if (antes) await page.addInitScript(antes);
  // Lo que pasa con el día de Rutina desde que aparece: si abre normal y
  // después se transforma en la descarga, queda [false, true].
  await page.addInitScript(() => {
    window.__dia = [];
    new MutationObserver(() => {
      const s = document.querySelector(".dia-seccion");
      if (!s) return;
      const v = s.classList.contains("en-descarga");
      if (window.__dia[window.__dia.length - 1] !== v) window.__dia.push(v);
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  });
  await page.goto(`${url}/?demo=${pestana}${extra}`);
  // 2,5 s: la primera carga marca la descarga como vista unos 450 ms después
  // de armar Rutina; con menos espera, esa marca podía llegar después de
  // borrarla abajo y la segunda carga ya abría transformada.
  await page.waitForTimeout(2500);
  // El inicio del ciclo y, de nuevo, la app (sin ?demo, que volvería a cargar el perfil de muestra).
  await page.evaluate((c) => { localStorage.setItem("gym_cycle_start_v2", c); localStorage.removeItem("modusfit_descarga_vista"); }, ciclo);
  await page.goto(`${url}/?pestana=${pestana}${extra}`);
  await page.waitForTimeout(1500);
  await cerrarModales(page);
  return { page, context };
}
// Cierra lo que tape la pantalla (el resumen del mes, la bienvenida, el
// recorrido) como lo haría una persona: Escape y, si sigue, un toque afuera.
async function cerrarModales(page) {
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(250);
    const saltar = page.getByRole("button", { name: /^Saltar$/ });
    if (await saltar.count()) await saltar.first().click().catch(() => {});
    const fondo = page.locator(".modal-overlay:not(.pointer-events-none)");
    if (!(await fondo.count())) return;
    await fondo.first().click({ position: { x: 4, y: 4 }, force: true }).catch(() => {});
    await page.waitForTimeout(450);
  }
}
const captura = async (page, nombre, completa = false) => {
  const ruta = join(SALIDA, `${nombre}.png`);
  await page.screenshot({ path: ruta, fullPage: completa });
  return relative(RAIZ, ruta);
};
const perfil = (page) => page.evaluate(() => {
  const todos = JSON.parse(localStorage.getItem("gym_profiles_v2") || "{}");
  return todos[localStorage.getItem("gym_active_v2")] || Object.values(todos)[0] || null;
});

try {
  // ── 1. LA SEMANA DE DESCARGA, ADENTRO DE RUTINA ─────────────────────────
  console.log("Semana de descarga (jueves 5/11, semana 8 de 8 del ciclo de muestra)");
  {
    // La primera vez del día, Rutina abre normal y se transforma.
    const { page, context } = await abrir("rutina");
    await page.waitForTimeout(600);
    const historia = await page.evaluate(() => window.__dia);
    ok("abre como Rutina y se transforma en la descarga", historia[0] === false && historia[historia.length - 1] === true, JSON.stringify(historia));
    ok("el título dice que es la semana de descarga", /Semana de descarga/.test(await page.locator(".titulo-pagina").innerText()));
    const afuera = await page.locator(".dia-seccion .barra-cargada .disco-lugar.afuera").count();
    const lugares = await page.locator(".dia-seccion .barra-cargada .disco-lugar").count();
    ok("la barra suelta los discos que sobran", afuera > 0 && afuera < lugares, `${afuera} de ${lugares} afuera`);
    const texto = await page.locator(".dia-barra-texto").innerText();
    ok("cuenta las series de descarga", /series de descarga/.test(texto), texto.replace(/\s+/g, " "));
    ok("la hoja del plan se pliega", (await page.locator(".plegable-descarga.plegada").count()) === 1);
    ok("no queda la pantalla aparte vieja", (await page.getByText("Recuperación activa").count()) === 0);
    console.log(`    ${await captura(page, "descarga-rutina")}`);
    // Abrir el primer ejercicio: sus series de descarga.
    await page.locator(".dia-seccion .ejercicio-cabecera").first().click();
    await page.waitForTimeout(700);
    const visores = page.locator(".dia-seccion .ejercicio.abierto .descarga-visor");
    ok("el ejercicio trae sus series de descarga", (await visores.count()) > 0, `${await visores.count()} series`);
    const pesos = await page.locator(".dia-seccion .ejercicio.abierto .descarga-hoy").allInnerTexts();
    const cargables = pesos.every((p) => { const m = p.replace(/\s+/g, " ").match(/×\s*([\d.,]+)/); if (!m) return true; const kg = parseFloat(m[1].replace(",", ".")); return Math.abs(kg / 2.5 - Math.round(kg / 2.5)) < 1e-6; });
    ok("los pesos de descarga se pueden cargar (de a 2,5 kg)", cargables, pesos.map((p) => p.replace(/\s+/g, " ")).join(" | "));
    ok("las series que sobran van tachadas", (await page.locator(".dia-seccion .ejercicio.abierto .descarga-sobra").count()) > 0);
    console.log(`    ${await captura(page, "descarga-ejercicio")}`);
    // Marcar la primera.
    await page.locator(".dia-seccion .ejercicio.abierto .descarga-marcar").first().click();
    await page.waitForTimeout(600);
    ok("se marca la serie", (await page.locator(".dia-seccion .ejercicio.abierto .descarga-marcar[aria-pressed='true']").count()) === 1);
    const p = await perfil(page);
    const marcas = Object.entries(p?.deloadProgress || {}).filter(([, v]) => v === "2026-11-05");
    const enLogs = Object.values(p?.logs || {}).some((v) => Array.isArray(v) && v.some((h) => h.deload && h.date === "2026-11-05"));
    ok("queda guardada como serie de descarga", marcas.length === 1 && enLogs, `${marcas.length} marca, en el historial: ${enLogs}`);
    ok("la barra carga un disco", (await page.locator(".dia-seccion .barra-cargada .disco-lugar .disco-entra").count()) === 1);
    ok("ofrece terminar la descarga de hoy", (await page.getByRole("button", { name: /Terminar la descarga de hoy/ }).count()) === 1);
    // Pasar a entrenamiento normal y volver: con el sello de la semana.
    await page.locator(".sello-semana").click();
    await page.waitForTimeout(900);
    ok("se pasa a entrenamiento normal en el lugar", (await page.locator(".dia-seccion.en-descarga").count()) === 0 && (await page.locator(".dia-seccion .barra-cargada .disco-lugar.afuera").count()) === 0);
    console.log(`    ${await captura(page, "descarga-normal")}`);
    await page.locator(".sello-semana").click();
    await page.waitForTimeout(900);
    ok("y se vuelve a la descarga", (await page.locator(".dia-seccion.en-descarga").count()) === 1);
    await context.close();
  }

  // ── 2. LA VISTA PREVIA Y ADELANTAR LA DESCARGA ──────────────────────────
  console.log("Vista previa de la descarga (jueves 22/10, semana 6 de 8)");
  {
    const { page, context } = await abrir("progreso", { fecha: "2026-10-22" });
    const enlace = page.getByRole("button", { name: /Ver mi semana de descarga/ });
    ok("Progreso ofrece ver la descarga", (await enlace.count()) > 0);
    if (await enlace.count()) {
      await enlace.first().click();
      await page.waitForTimeout(1400);
      ok("abre Rutina en vista previa", /Así va a ser tu descarga/.test(await page.locator(".dia-hero").first().innerText()));
      ok("en la vista previa no se marcan series", (await page.locator(".descarga-marcar").count()) === 0);
      console.log(`    ${await captura(page, "descarga-previa")}`);
      const antes = await page.evaluate(() => localStorage.getItem("gym_cycle_start_v2"));
      await page.getByRole("button", { name: "Hacerla esta semana" }).click();
      await page.waitForTimeout(1400);
      const despues = await page.evaluate(() => localStorage.getItem("gym_cycle_start_v2"));
      const semanas = Math.round((new Date(antes) - new Date(despues)) / (7 * 86400000));
      ok("adelantarla corre el inicio del ciclo", semanas === 2, `${semanas} semanas antes`);
      ok("y esta semana pasa a ser la de descarga", (await page.locator(".dia-seccion.en-descarga").count()) === 1 && (await page.locator(".sello-semana.descarga").count()) === 1);
      console.log(`    ${await captura(page, "descarga-adelantada")}`);
    }
    await context.close();
  }

  // ── 3. EL CHAT: LA PIZARRA SE QUEDA ─────────────────────────────────────
  console.log("Chat (la IA simulada)");
  {
    const { page, context } = await abrir("entrenador_ia");
    await page.route("**/api/ia", (route) => route.fulfill({ json: { text: "Hoy te toca **Push**. Arrancá por el press banca: la vez pasada hiciste 8 × 80 kg, hoy probá 9 × 80.", modelo: "simulado" } }));
    ok("arranca con la pizarra", (await page.locator(".pizarra-ia").count()) === 1);
    await page.locator("textarea").fill("¿Qué hago hoy?");
    await page.getByRole("button", { name: "Enviar" }).click();
    await page.waitForTimeout(2500);
    ok("la pizarra sigue después de mandar un mensaje", (await page.locator(".pizarra-ia").count()) === 1);
    ok("la respuesta aparece debajo de la pizarra", await page.evaluate(() => {
      const piz = document.querySelector(".pizarra-ia")?.getBoundingClientRect();
      const res = [...document.querySelectorAll(".burbuja.ia")].pop()?.getBoundingClientRect();
      return !!piz && !!res && res.top > piz.bottom;
    }));
    ok("la respuesta queda a la vista, arriba de la barra de escribir", await page.evaluate(() => {
      const res = [...document.querySelectorAll(".burbuja.ia")].pop()?.getBoundingClientRect();
      const barra = document.querySelector("[data-recorrido='escribir']")?.getBoundingClientRect();
      return !!res && !!barra && res.top > 0 && res.top < barra.top;
    }));
    const notas = page.locator(".pizarra-ia .ia-tarjeta.postit");
    ok("las notas de la pizarra se pueden tocar en la charla", (await notas.count()) === 4 && (await notas.first().isEnabled()));
    const chicos = await page.evaluate(() => [...document.querySelectorAll(".burbuja-accion")].filter((b) => { const r = b.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).length);
    ok("copiar, regenerar y reportar miden al menos 24 px", chicos === 0, `${chicos} más chicos`);
    console.log(`    ${await captura(page, "chat-charla")}`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    console.log(`    ${await captura(page, "chat-pizarra")}`);
    await context.close();
  }

  // ── 4. EL PAYWALL ───────────────────────────────────────────────────────
  console.log("Paywall");
  {
    // Con el cobro apagado (lo de siempre), no aparece nada de Premium.
    const { page, context } = await abrir("perfil");
    ok("con el cobro apagado no hay paywall ni Premium", (await page.locator(".paywall").count()) === 0 && (await page.getByText(/Modus Fit Premium/).count()) === 0);
    await context.close();
  }
  {
    // En modo de prueba (sólo desarrollo): Perfil › Tu plan › Ver los planes.
    const { page, context } = await abrir("perfil", { extra: "&premium=prueba" });
    const ver = page.getByRole("button", { name: /Ver los planes/ });
    ok("Perfil muestra Tu plan en modo de prueba", (await ver.count()) > 0);
    if (await ver.count()) {
      await ver.first().click();
      await page.waitForTimeout(900);
      const planes = page.locator(".paywall [role='radio']");
      ok("el paywall muestra los tres planes", (await planes.count()) === 3);
      ok("el anual viene elegido", (await page.locator(".paywall [role='radio'][aria-checked='true']").innerText()).includes("Anual"));
      const textoAnual = await page.locator(".paywall [role='radio'][aria-checked='true']").innerText();
      ok("el anual muestra lo que se cobra y, aparte, cuánto da por mes", /por año/.test(textoAnual) && /por mes/.test(textoAnual), textoAnual.replace(/\s+/g, " "));
      ok("dice qué pasa al terminar la prueba y cómo cancelar", /cancel/i.test(await page.locator(".paywall").innerText()));
      ok("se puede cerrar y seguir gratis", (await page.getByRole("button", { name: /Seguir gratis/ }).count()) === 1);
      console.log(`    ${await captura(page, "paywall")}`);
      await page.locator(".paywall").evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await page.waitForTimeout(300);
      console.log(`    ${await captura(page, "paywall-abajo")}`);
      await page.locator(".paywall-cta").click();
      await page.waitForTimeout(1200);
      ok("comprar en modo de prueba activa Premium", (await page.getByText(/Premium activo|Tenés Premium/).count()) > 0);
      console.log(`    ${await captura(page, "paywall-activo")}`);
    }
    await context.close();
  }
} catch (e) {
  console.error(`\nSe cortó la prueba: ${e.message.split("\n")[0]}`);
  resultados.push({ nombre: "la prueba terminó", ok: false });
} finally {
  await browser.close();
  await server.close();
}

const fallidas = resultados.filter((r) => !r.ok);
const errs = [...new Set(errores)];
console.log(`\n${resultados.length - fallidas.length} de ${resultados.length} bien.`);
if (errs.length) { console.log("Errores de la app mientras se recorría:"); errs.slice(0, 15).forEach((e) => console.log(`  ${e}`)); }
process.exit(fallidas.length || errs.length ? 1 : 0);
