#!/usr/bin/env node
/**
 * Auditoría de accesibilidad (WCAG 2.2 AA, con axe-core) de las pestañas de
 * la app con el perfil de muestra, en tamaño celular, en modo oscuro y claro.
 * Lista cada problema con cuántos elementos toca y un ejemplo, y deja el
 * detalle en .taste-skill/accesibilidad.json.
 *
 *   npm run accesibilidad
 *
 * Necesita el perfil de muestra (npm run capturas -- --datos). Levanta su
 * propio Vite. Sale con código 1 si hay problemas graves o críticos.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { createServer } from "vite";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(join(RAIZ, ".taste-skill", "demo-storage.json"))) {
  console.error("Falta el perfil de muestra: corré npm run capturas -- --datos");
  process.exit(1);
}
const AXE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const PESTANAS = ["rutina", "progreso", "rutinas", "social", "entrenador_ia", "perfil"];

const server = await createServer({ root: RAIZ, logLevel: "error", server: { port: 0, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch();
const todo = [];
try {
  for (const claro of [false, true]) {
    for (const pestana of PESTANAS) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "es-AR", colorScheme: claro ? "light" : "dark" });
      const page = await context.newPage();
      await page.goto(`${url}/?demo=${pestana}`);
      await page.waitForTimeout(1500);
      if (claro) await page.evaluate(() => {
        const todos = JSON.parse(localStorage.getItem("gym_profiles_v2") || "{}");
        for (const p of Object.values(todos)) p.settings = { ...(p.settings || {}), theme: "light" };
        localStorage.setItem("gym_profiles_v2", JSON.stringify(todos));
      });
      await page.goto(`${url}/?pestana=${pestana}`);
      await page.waitForTimeout(1800);
      // Lo que tape la pantalla al abrir (resumen del mes, bienvenida).
      for (let i = 0; i < 4; i++) { await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(200); }
      await page.addScriptTag({ content: AXE });
      const r = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }));
      for (const v of r.violations) todo.push({ pestana, tema: claro ? "claro" : "oscuro", id: v.id, impacto: v.impact, ayuda: v.help, nodos: v.nodes.length, elementos: v.nodes.map((n) => ({ donde: n.target.join(" "), html: n.html.slice(0, 200), por: n.failureSummary })), ejemplo: v.nodes[0]?.target?.join(" ") || "", resumen: v.nodes[0]?.failureSummary?.split("\n").slice(0, 2).join(" ") || "" });
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
writeFileSync(join(RAIZ, ".taste-skill", "accesibilidad.json"), JSON.stringify(todo, null, 2));
const porRegla = {};
for (const v of todo) (porRegla[v.id] ||= { ...v, donde: [], total: 0 }).donde.push(`${v.pestana}/${v.tema}`), (porRegla[v.id].total += v.nodos);
const orden = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const reglas = Object.values(porRegla).sort((a, b) => orden[a.impacto] - orden[b.impacto]);
if (!reglas.length) console.log("Sin problemas de WCAG 2.2 AA en las pestañas revisadas");
for (const v of reglas) console.log(`${v.impacto.padEnd(8)} ${v.id} (${v.total} elementos): ${v.ayuda}\n         en ${v.donde.join(", ")}\n         ej. ${v.ejemplo} — ${v.resumen.slice(0, 160)}`);
process.exit(reglas.some((v) => v.impacto === "critical" || v.impacto === "serious") ? 1 : 0);
