import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 1200 } });
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERROR: " + (e.stack || e.message).split("\n").slice(0, 6).join("\n")));
page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) errs.push("CONSOLE: " + m.text().slice(0, 400)); });
const log = (...a) => console.log(...a);
const cerrar = async () => {
  for (let i = 0; i < 4; i++) {
    const ov = page.locator(".modal-overlay");
    if (!(await ov.count())) return;
    await ov.first().click({ position: { x: 4, y: 4 }, force: true }).catch(() => {});
    await page.waitForTimeout(500);
  }
};
await page.goto("http://localhost:5173/"); await page.waitForTimeout(1200);
await page.getByText("Crear perfil sin Google").click(); await page.waitForTimeout(300);
await page.locator("input").first().fill("QA Bot");
await page.getByRole("button", { name: "Crear perfil" }).click(); await page.waitForTimeout(800);
const p = page.getByText("Elegir una preestablecida");
if (await p.count()) {
  await p.click(); await page.waitForTimeout(400);
  await page.getByText(/PUSH \/ PULL \/ LEGS/i).first().click(); await page.waitForTimeout(400);
  await page.getByText("Usar esta rutina", { exact: true }).click(); await page.waitForTimeout(600);
  const l = page.getByText("Listo, empezar a entrenar", { exact: true }); if (await l.count()) await l.click();
  await page.waitForTimeout(700);
}
await cerrar();
await page.evaluate(() => {
  const dd = JSON.parse(localStorage.getItem("gym_profiles_v2"));
  const k = Object.keys(dd)[Object.keys(dd).length - 1];
  dd[k].lastSeenMonthRecap = "2026-09"; dd[k].lastSeenYearRecap = "2026";
  localStorage.setItem("gym_profiles_v2", JSON.stringify(dd));
});
await page.reload(); await page.waitForTimeout(1800); await cerrar();
errs.length = 0;

log("== abriendo el Chatbot ==");
const bot = page.locator("button:visible").filter({ hasText: /^Chatbot$/i });
log("pestaña encontrada:", await bot.count());
await bot.first().click({ timeout: 8000 }).catch((e) => log("click falló:", e.message));
await page.waitForTimeout(2500);
const t = await page.locator("body").innerText();
log("pantalla:", t.split("\n").filter(Boolean).slice(0, 8).join(" | "));
log("¿pantalla de crash?:", /Algo se rompió/.test(t));
if (/Algo se rompió/.test(t)) {
  const det = page.locator("details");
  if (await det.count()) { await det.first().click(); await page.waitForTimeout(400); }
  const pre = await page.locator("pre").first().innerText().catch(() => "");
  log("DETALLE DEL CRASH:", pre.slice(0, 500));
  const guardado = await page.evaluate(() => JSON.parse(localStorage.getItem("gym_crashes_v1") || "[]")[0] || null);
  if (guardado) { log("mensaje:", guardado.msg); log("componentes:", (guardado.stack || "").split("\n").filter(Boolean).slice(0, 8).join(" | ")); }
}
log("ERRORES DE CONSOLA:");
errs.slice(0, 4).forEach((e) => log(" ", e));
log("DONE");
await browser.close();
