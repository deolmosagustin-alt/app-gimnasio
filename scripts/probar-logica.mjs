#!/usr/bin/env node
/**
 * Prueba las cuentas de la lógica de entrenamiento (sin navegador): la
 * progresión de un entrenador (con el tope del 10 % y el fallo), el peso de la
 * descarga (redondeado a lo que se puede cargar), cuántas series quedan en la
 * descarga y el aviso de que venís bajando. Saca cada función de src/App.jsx
 * y la corre con casos conocidos. Ver docs/critica-entrenamiento.md.
 *
 *   node scripts/probar-logica.mjs
 */
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
// Saca el código de una función (por llaves balanceadas) o de un const de una línea.
function extraer(nombre) {
  const i = src.indexOf(`function ${nombre}(`);
  if (i < 0) { const j = src.indexOf(`const ${nombre} =`); if (j < 0) throw new Error(nombre); return src.slice(j, src.indexOf(";\n", j) + 1); }
  let k = src.indexOf("{", src.indexOf(")", i)), prof = 0;
  for (; k < src.length; k++) { if (src[k] === "{") prof++; else if (src[k] === "}") { prof--; if (!prof) break; } }
  return src.slice(i, k + 1);
}
const kgToDisplay = (kg, u) => (u === "lbs" ? Math.round(kg * 2.20462 * 4) / 4 : kg);
const displayToKg = (v, u) => (u === "lbs" ? Math.round((v / 2.20462) * 4) / 4 : v);
const estimate1RM = (kg, reps) => (!kg || !reps ? 0 : Math.round(kg * (1 + reps / 30) * 10) / 10);
const localDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayStr = () => "2026-11-05";
const codigo = ["rangoDeReps", "siguientePaso", "cargaDeDescarga", "seriesDeDescarga", "ejerciciosEnBaja"].map(extraer).join("\n");
const f = new Function("kgToDisplay", "displayToKg", "estimate1RM", "localDateStr", "todayStr", `${codigo}; return { siguientePaso, cargaDeDescarga, seriesDeDescarga, ejerciciosEnBaja };`);
const { siguientePaso, cargaDeDescarga, seriesDeDescarga, ejerciciosEnBaja } = f(kgToDisplay, displayToKg, estimate1RM, localDateStr, todayStr);
let mal = 0;
const igual = (nombre, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) mal++; console.log(`${ok ? "✓" : "✗"} ${nombre}: ${JSON.stringify(a)}${ok ? "" : ` (esperaba ${JSON.stringify(b)})`}`); };
igual("una rep más", siguientePaso(80, 9, "8-12", 2.5), { kg: 80, reps: 10, motivo: "rep" });
igual("al tope sube el peso (2,5 sobre 80 es 3 %)", siguientePaso(80, 12, "8-12", 2.5), { kg: 82.5, reps: 8, motivo: "peso" });
igual("salto de 25 %: primero dos reps más arriba del tope", siguientePaso(10, 12, "8-12", 2.5), { kg: 10, reps: 13, motivo: "rep" });
igual("…y a tope+2, salta", siguientePaso(10, 14, "8-12", 2.5), { kg: 12.5, reps: 8, motivo: "peso" });
igual("al fallo (RPE 10) se repite", siguientePaso(80, 9, "8-12", 2.5, { rpe: 10 }), { kg: 80, reps: 9, motivo: "fallo" });
igual("RPE 8 sigue normal", siguientePaso(80, 9, "8-12", 2.5, { rpe: 8 }), { kg: 80, reps: 10, motivo: "rep" });
igual("peso corporal: una rep más", siguientePaso(0, 8, "6-10", 2.5), { kg: 0, reps: 9, motivo: "rep" });
igual("descarga 75 % de 77,5 → 57,5 (no 58,1)", cargaDeDescarga({ kg: 77.5, reps: 5 }, { pct: 0.75, salto: 2.5, unit: "kg" }), { reps: 5, kg: 57.5, kgVista: 57.5 });
igual("descarga 75 % de 85 → 62,5 (no 64)", cargaDeDescarga({ kg: 85, reps: 8 }, { pct: 0.75, salto: 2.5, unit: "kg" }), { reps: 8, kg: 62.5, kgVista: 62.5 });
igual("en libras, de a 5 lb", cargaDeDescarga({ kg: 85, reps: 8 }, { pct: 0.75, salto: 5, unit: "lbs" }).kgVista, 140);
igual("máquina de a 7 kg", cargaDeDescarga({ kg: 70, reps: 10 }, { pct: 0.75, salto: 7, unit: "kg" }).kgVista, 49);
igual("peso mínimo: bajan las reps", cargaDeDescarga({ kg: 2.5, reps: 12 }, { pct: 0.75, salto: 2.5, unit: "kg" }), { reps: 9, kg: 2.5, kgVista: 2.5 });
igual("peso corporal: menos reps", cargaDeDescarga({ kg: 0, reps: 10 }, { pct: 0.75 }), { reps: 8, kg: 0, kgVista: 0 });
igual("cardio: menos minutos", cargaDeDescarga({ minutes: 20 }, { pct: 0.75, cardio: true }), { minutes: 15 });
igual("series de descarga: 3 → 2, 4 → 2, 1 → 1, 5 → 2 (un tercio)", [seriesDeDescarga(3, 2), seriesDeDescarga(4, 2), seriesDeDescarga(1, 2), seriesDeDescarga(5, 3)], [2, 2, 1, 2]);
// Venís bajando: dos sesiones seguidas un 5 % abajo de tu mejor serie del mes, sin haber subido el peso.
const rutina = { push: { exercises: [{ id: "banca", name: "Press banca", sets: [{}] }, { id: "militar", name: "Press militar", sets: [{}] }, { id: "fondos", name: "Fondos", sets: [{}] }] } };
const serie = (date, kg, reps) => ({ date, kg, reps });
const logs = {
  banca_0: [serie("2026-10-08", 80, 8), serie("2026-10-15", 80, 9), serie("2026-10-22", 80, 7), serie("2026-10-29", 80, 6)],
  militar_0: [serie("2026-10-08", 40, 8), serie("2026-10-15", 40, 9), serie("2026-10-22", 37.5, 8), serie("2026-10-29", 37.5, 7)],
  // Subió el peso (la doble progresión): el 1RM estimado baja, pero no está en baja.
  fondos_0: [serie("2026-10-08", 20, 12), serie("2026-10-15", 20, 12), serie("2026-10-22", 22.5, 8), serie("2026-10-29", 22.5, 8)],
};
igual("venís bajando en banca y militar, no en fondos (subió el peso)", ejerciciosEnBaja(logs, rutina, "2026-11-05"), ["Press banca", "Press militar"]);
igual("sin sesiones de las dos últimas semanas, no avisa", ejerciciosEnBaja(logs, rutina, "2026-12-20"), []);
console.log(mal ? `\n${mal} mal` : "\nTodo bien");
process.exit(mal ? 1 : 0);
