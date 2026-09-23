import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 1200 } });
const errs = [];
const red = [];
page.on("pageerror", (e) => errs.push("PAGEERROR: " + (e.stack || e.message).split("\n").slice(0, 5).join(" ⏎ ")));
page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) errs.push("CONSOLE: " + m.text().slice(0, 300)); });
const log = (...a) => console.log(...a);
const cerrar = async () => {
  for (let i = 0; i < 4; i++) {
    const ov = page.locator(".modal-overlay");
    if (!(await ov.count())) return;
    await ov.first().click({ position: { x: 4, y: 4 }, force: true }).catch(() => {});
    await page.waitForTimeout(500);
  }
};
// /api/ia local → endpoint REAL de producción (es lo que corre en el teléfono)
await page.route("**/api/ia", async (route) => {
  const t0 = Date.now();
  try {
    const r = await fetch("https://app-gimnasio-two.vercel.app/api/ia", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: route.request().postData(),
    });
    const body = await r.text();
    red.push({ status: r.status, ms: Date.now() - t0, bytes: body.length, muestra: body.slice(0, 160) });
    await route.fulfill({ status: r.status, contentType: "application/json", body });
  } catch (e) {
    red.push({ status: "FALLO", ms: Date.now() - t0, error: String(e.message) });
    await route.abort();
  }
});

await page.goto("http://localhost:5173/"); await page.waitForTimeout(1200);
await page.getByText("Crear perfil sin Google").click(); await page.waitForTimeout(300);
await page.locator("input").first().fill("QA Bot2");
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
// Perfil con historial real, como el de alguien que usa la app
await page.evaluate(() => {
  const dd = JSON.parse(localStorage.getItem("gym_profiles_v2"));
  const k = Object.keys(dd)[Object.keys(dd).length - 1];
  const prof = dd[k];
  const def = prof.routines[prof.activeRoutineId];
  const logs = {}; const ses = [];
  def.dayOrder.forEach((dk) => (def.days[dk].exercises || []).forEach((ex) => {
    const lib = ex.libId || ex.id;
    (ex.sets || []).forEach((_, si) => {
      logs[`${lib}_${si}`] = Array.from({ length: 20 }, (__, j) => {
        const d = new Date(2026, 4, 1); d.setDate(d.getDate() + j * 5);
        return { date: d.toISOString().slice(0, 10), kg: 50 + (j % 10) * 2.5, reps: 8, rpe: 8 };
      });
    });
  }));
  for (let j = 0; j < 60; j++) { const d = new Date(2026, 4, 1); d.setDate(d.getDate() + j * 2); ses.push({ date: d.toISOString().slice(0, 10), dayKey: def.dayOrder[j % def.dayOrder.length] }); }
  prof.logs = logs; prof.trainingSessions = ses;
  prof.lastSeenMonthRecap = "2026-09"; prof.lastSeenYearRecap = "2026";
  localStorage.setItem("gym_profiles_v2", JSON.stringify(dd));
});
await page.reload(); await page.waitForTimeout(2000); await cerrar();
errs.length = 0;

await page.locator("button:visible").filter({ hasText: /^Chatbot$/i }).first().click({ timeout: 8000 });
await page.waitForTimeout(1500);
log("chatbot abierto. Enviando un mensaje real…");
const input = page.locator("textarea:visible").last();
await input.fill("que tal vengo entrenando?"); await page.waitForTimeout(300);
const botones = page.locator("button:visible");
const n = await botones.count();
// el botón de enviar es el último con svg dentro del área de escritura
await botones.nth(n - 1).click().catch(async () => { await input.press("Enter"); });
log("esperando respuesta (hasta 80s)…");
for (let i = 0; i < 80; i++) {
  await page.waitForTimeout(1000);
  const t = await page.locator("body").innerText();
  if (/No pudimos armar|no está disponible en este momento|Algo se rompió|límite de uso|tardó demasiado|No se pudo conectar/i.test(t)) { log(`ERROR VISIBLE a los ${i + 1}s`); break; }
  if (red.length && !/Pensando/.test(t)) { log(`respuesta renderizada a los ${i + 1}s`); break; }
}
const t = await page.locator("body").innerText();
const burbujas = t.split("\n").filter(Boolean).slice(-14).join(" | ");
log("PANTALLA (final):", burbujas);
log("RED:", JSON.stringify(red, null, 1));
log("ERRORES:", errs.slice(0, 4));
log("DONE");
await browser.close();
