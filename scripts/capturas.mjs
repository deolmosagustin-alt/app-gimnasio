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
 *   npm run capturas -- --datos           (con 6 semanas de entrenamiento de
 *                                          ejemplo: Progreso, la gráfica y el
 *                                          historial dejan de verse vacíos)
 *   npm run capturas -- --claro           (las pestañas en modo claro)
 *   npm run capturas -- --ancho 320       (un celular más angosto, para ver
 *                                          si algún texto se corta)
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
const conDatos = args.includes("--datos");
const conClaro = args.includes("--claro");
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
  { nombre: "celular", viewport: { width: Number(valor("--ancho")) || 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ...(conEscritorio ? [{ nombre: "escritorio", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }] : []),
];

// HISTORIAL DE EJEMPLO (--datos). Corre adentro de la página: tiene que ser
// autosuficiente. Arma seis semanas de la rutina elegida —cuatro sesiones
// por semana, con progresión de cargas— más el peso corporal semanal, y fija
// el inicio del ciclo. Es lo que ve alguien que ya viene entrenando.
function sembrarHistorial() {
  const CLAVE = "gym_profiles_v2";
  const todos = JSON.parse(localStorage.getItem(CLAVE) || "{}");
  const nombre = Object.keys(todos)[0];
  const p = todos[nombre];
  const rutina = p?.routines?.[p.activeRoutineId];
  if (!rutina) return "sin rutina";
  const fecha = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const BASE = [[/sentadilla/, 90], [/peso_muerto/, 100], [/prensa/, 160], [/press_banca/, 70], [/press_militar_barra/, 45], [/dominada/, 0], [/remo/, 60], [/jalon/, 55], [/curl/, 14], [/vuelos|lateral/, 9], [/gemelo|pantorrilla/, 60], [/mancuerna/, 22], [/extension|femoral|polea|cuadriceps|aductor/, 35]];
  const base = (id) => (BASE.find(([re]) => re.test(id)) || [null, 25])[1];
  const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
  const inicio = new Date(hoy); inicio.setDate(inicio.getDate() - 35 - ((inicio.getDay() + 6) % 7));
  const logs = { ...(p.logs || {}) };
  const sesiones = [];
  const orden = rutina.dayOrder || Object.keys(rutina.days);
  let n = 0;
  for (let d = new Date(inicio); d < hoy; d.setDate(d.getDate() + 1)) {
    const diaSemana = (d.getDay() + 6) % 7;
    if (![0, 2, 4, 5].includes(diaSemana)) continue;
    const semana = Math.floor((d - inicio) / (7 * 864e5));
    if (semana === 3 && diaSemana === 5) continue;
    const dayKey = orden[n % orden.length]; n++;
    const dia = rutina.days[dayKey];
    dia.exercises.forEach((ex) => {
      const kgBase = base(ex.libId);
      const tienePesada = ex.sets.some((x) => parseInt(x.repRange, 10) <= 6);
      ex.sets.forEach((serie, i) => {
        const [lo, hi] = String(serie.repRange).split("-").map((v) => parseInt(v, 10));
        const pesada = lo <= 6;
        const sube = Math.floor(semana / 2) * (kgBase >= 40 ? 2.5 : 1);
        let kg = kgBase + sube;
        if (tienePesada && !pesada) kg = Math.round((kg * 0.82) / 2.5) * 2.5;
        const reps = Math.min(hi || lo, lo + ((semana + i) % 3));
        const clave = `${ex.libId}_${i}`;
        (logs[clave] = logs[clave] || []).push({ date: fecha(d), reps: kgBase === 0 ? reps + semana : reps, kg, ...(i === 0 && semana % 2 ? { rpe: 8 } : {}) });
      });
    });
    const empezo = new Date(d); empezo.setHours(19, 5, 0, 0);
    const termino = new Date(empezo.getTime() + (52 + (n % 4) * 6) * 60000);
    sesiones.push({ date: fecha(d), dayKey, startedAt: empezo.toISOString(), endedAt: termino.toISOString(), routineId: p.activeRoutineId, dayExerciseIds: dia.exercises.map((e) => e.libId) });
  }
  const peso = [];
  for (let w = 0; w < 6; w++) { const d = new Date(inicio); d.setDate(d.getDate() + w * 7 + 1); peso.push({ date: fecha(d), value: Math.round((78.6 - w * 0.35 + (w % 2) * 0.2) * 10) / 10 }); }
  p.logs = logs;
  p.trainingSessions = sesiones;
  // Cintura cada dos semanas y pecho dos veces: para ver la cinta métrica.
  const cintura = [0, 2, 4].map((w, i) => { const d = new Date(inicio); d.setDate(d.getDate() + w * 7 + 1); return { date: fecha(d), value: [86.5, 85.8, 84.9][i] }; });
  const pecho = [0, 4].map((w, i) => { const d = new Date(inicio); d.setDate(d.getDate() + w * 7 + 1); return { date: fecha(d), value: [101, 102.5][i] }; });
  p.measurements = { ...(p.measurements || {}), weight: peso, waist: cintura, chest: pecho };
  p.sex = p.sex || "M"; p.age = p.age || 28; p.heightCm = p.heightCm || 178;
  p.settings = { ...(p.settings || {}), bodyWeightKg: peso[peso.length - 1].value };
  localStorage.setItem(CLAVE, JSON.stringify(todos));
  localStorage.setItem("gym_cycle_start_v2", inicio.toISOString());
  // Social de muestra (sólo existe en desarrollo, ver src/social-demo.js):
  // cinco amigos con su semana, para que Social no se vea vacío.
  p.username = p.username || "diseno";
  localStorage.setItem(CLAVE, JSON.stringify(todos));
  localStorage.setItem("modusfit_demo_social", "1");
  // Como si la vez pasada Martina no te ganara en nada: así sale el aviso de
  // que te pasó en un músculo.
  localStorage.setItem("modusfit_te_paso_demo-yo", JSON.stringify({ "demo-martina": [] }));
  return `${sesiones.length} sesiones`;
}

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
      // En la de página completa, la barra de pestañas (que es fija) quedaba
      // pegada en el medio, tapando lo que hubiera ahí: se esconde sólo para esa.
      await page.screenshot({ path: `${base}-completa.png`, fullPage: true, scale: "css", style: ".barra-pestanas { visibility: hidden !important; }" });
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

    if (conDatos) {
      await paso("cargar el historial de ejemplo", async () => {
        console.log(`  historial de ejemplo: ${await page.evaluate(sembrarHistorial)}`);
        await page.reload();
        await page.waitForTimeout(1800);
        await cerrarModales();
      });
    }

    if (conClaro) {
      await paso("pasar al modo claro", async () => {
        await page.evaluate(() => {
          const CLAVE = "gym_profiles_v2";
          const todos = JSON.parse(localStorage.getItem(CLAVE) || "{}");
          for (const p of Object.values(todos)) p.settings = { ...(p.settings || {}), theme: "light" };
          localStorage.setItem(CLAVE, JSON.stringify(todos));
        });
        await page.reload();
        await page.waitForTimeout(1500);
        await cerrarModales();
      });
    }

    for (const pestana of PESTANAS) {
      await paso(`abrir la pestaña ${pestana}`, async () => {
        await cerrarModales();
        const boton = page.locator("button:visible").filter({ hasText: new RegExp(`^${pestana}$`, "i") });
        await boton.first().click({ timeout: 8000 });
      });
      await capturar(pestana);
      // Con datos, también lo que hay adentro: un ejercicio abierto en
      // Rutina y cada sección de Progreso.
      if (conDatos && pestana === "Rutina") {
        await paso("abrir el primer ejercicio", () => page.locator(".ejercicio-cabecera").first().click({ timeout: 8000 }));
        await page.waitForTimeout(600);
        await page.locator(".ejercicio.abierto").first().scrollIntoViewIfNeeded().catch(() => {});
        const base = join(SALIDA, `${nombre}-rutina-ejercicio`);
        await page.screenshot({ path: `${base}.png` });
        console.log(`  ${relative(RAIZ, base)}.png`);
      }
      if (conDatos && pestana === "Rutinas") {
        await paso("abrir el balance de la rutina", () => page.getByRole("button", { name: "Balance" }).first().click({ timeout: 8000 }));
        await capturar("Rutinas Balance");
      }
      if (conDatos && pestana === "Social") {
        for (const seccion of ["Actividad", "Ranking"]) {
          await paso(`abrir ${seccion} en Social`, () => page.getByRole("tab", { name: seccion }).first().click({ timeout: 8000 }));
          await capturar(`Social ${seccion}`);
        }
        // La competencia: tocar a un amigo en el Ranking abre el mano a mano.
        await paso("abrir la competencia con un amigo", () => page.locator(".podio-lugar:not(.yo), .ranking-fila:not(.yo)").first().click({ timeout: 8000 }));
        await capturar("Social Competencia");
        await paso("volver de la competencia", () => page.getByRole("button", { name: "Volver" }).first().click({ timeout: 8000 }));
        // La pizarra de récords del grupo, en el Ranking.
        await paso("abrir los récords del grupo", () => page.getByRole("tab", { name: "Récords" }).first().click({ timeout: 8000 }));
        await capturar("Social Records");
        // El perfil de un amigo, desde la lista de Amigos.
        await paso("abrir Amigos en Social", () => page.getByRole("tab", { name: "Amigos" }).first().click({ timeout: 8000 }));
        await capturar("Social Amigos");
        await paso("abrir el perfil de un amigo", () => page.locator("button.amigo-cuerpo").first().click({ timeout: 8000 }));
        await capturar("Social Amigo");
        await paso("volver del perfil del amigo", () => page.getByRole("button", { name: "Volver" }).first().click({ timeout: 8000 }));
        // Tu perfil, como lo ven tus amigos: se abre tocando tu credencial.
        await paso("abrir tu perfil desde la credencial", () => page.locator(".credencial-cuerpo").first().click({ timeout: 8000 }));
        await capturar("Social Mi perfil");
        await paso("volver de tu perfil", () => page.getByRole("button", { name: "Volver" }).first().click({ timeout: 8000 }));
      }
      if (conDatos && pestana === "Progreso") {
        for (const seccion of ["Historial", "Ejercicios", "Medidas"]) {
          await paso(`abrir ${seccion} en Progreso`, () => page.getByRole("tab", { name: seccion }).first().click({ timeout: 8000 }));
          await capturar(`Progreso ${seccion}`);
        }
        await paso("ver la cintura en Medidas", () => page.getByRole("tab", { name: /Cintura/ }).first().click({ timeout: 8000 }));
        await capturar("Progreso Medidas Cintura");
      }
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
