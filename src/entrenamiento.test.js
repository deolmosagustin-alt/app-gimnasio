// Las cuentas de la lógica de entrenamiento con casos conocidos (antes,
// scripts/probar-logica.mjs, que sacaba las funciones de App.jsx como texto).
// npm test
import { describe, expect, it } from "vitest";
import { siguientePaso, cargaDeDescarga, repsDeDescarga, seriesDeAdaptacion, seriesDeDescarga, ejerciciosEnBaja, esDelDia } from "./entrenamiento.js";

describe("siguientePaso (doble progresión)", () => {
  it("con el mismo peso, una rep más", () => {
    expect(siguientePaso(80, 9, "8-12", 2.5)).toEqual({ kg: 80, reps: 10, motivo: "rep" });
  });
  it("al tope del rango sube el peso (2,5 sobre 80 es 3 %)", () => {
    expect(siguientePaso(80, 12, "8-12", 2.5)).toEqual({ kg: 82.5, reps: 8, motivo: "peso" });
  });
  it("con un salto de más del 10 %, primero dos reps arriba del tope", () => {
    expect(siguientePaso(10, 12, "8-12", 2.5)).toEqual({ kg: 10, reps: 13, motivo: "rep" });
    expect(siguientePaso(10, 14, "8-12", 2.5)).toEqual({ kg: 12.5, reps: 8, motivo: "peso" });
  });
  it("al fallo (RPE 9,5 o más) se repite; con RPE 8 sigue normal", () => {
    expect(siguientePaso(80, 9, "8-12", 2.5, { rpe: 10 })).toEqual({ kg: 80, reps: 9, motivo: "fallo" });
    expect(siguientePaso(80, 9, "8-12", 2.5, { rpe: 8 })).toEqual({ kg: 80, reps: 10, motivo: "rep" });
  });
  it("a peso corporal, sólo reps", () => {
    expect(siguientePaso(0, 8, "6-10", 2.5)).toEqual({ kg: 0, reps: 9, motivo: "rep" });
  });
  it("sin rango o sin reps no propone nada", () => {
    expect(siguientePaso(80, 8, "", 2.5)).toBeNull();
    expect(siguientePaso(80, 0, "8-12", 2.5)).toBeNull();
  });
});

describe("cargaDeDescarga", () => {
  it("casi todo el peso, a un peso que se puede cargar, y menos reps", () => {
    expect(cargaDeDescarga({ kg: 77.5, reps: 5 }, { pct: 0.9, salto: 2.5, unit: "kg" })).toEqual({ reps: 3, kg: 70, kgVista: 70 });
    expect(cargaDeDescarga({ kg: 85, reps: 8 }, { pct: 0.9, salto: 2.5, unit: "kg" })).toEqual({ reps: 5, kg: 77.5, kgVista: 77.5 });
  });
  it("al 100 %, el mismo peso con menos reps (4 x 8 x 100 pasa a 2 x 5 x 100)", () => {
    expect(cargaDeDescarga({ kg: 100, reps: 8 }, { pct: 1, salto: 2.5, unit: "kg" })).toEqual({ reps: 5, kg: 100, kgVista: 100 });
  });
  it("en libras, de a 5 lb; en una máquina de a 7 kg", () => {
    expect(cargaDeDescarga({ kg: 85, reps: 8 }, { pct: 0.9, salto: 5, unit: "lbs" }).kgVista).toBe(170);
    expect(cargaDeDescarga({ kg: 70, reps: 10 }, { pct: 0.9, salto: 7, unit: "kg" }).kgVista).toBe(63);
  });
  it("nunca más pesado que lo de siempre", () => {
    expect(cargaDeDescarga({ kg: 2.5, reps: 12 }, { pct: 0.9, salto: 2.5, unit: "kg" })).toEqual({ reps: 8, kg: 2.5, kgVista: 2.5 });
    expect(cargaDeDescarga({ kg: 10, reps: 10 }, { pct: 0.95, salto: 5, unit: "kg" }).kgVista).toBe(10);
  });
  it("a peso corporal, menos reps", () => {
    expect(cargaDeDescarga({ kg: 0, reps: 10 }, { pct: 0.9 })).toEqual({ reps: 6, kg: 0, kgVista: 0 });
  });
  it("en cardio, menos minutos", () => {
    expect(cargaDeDescarga({ minutes: 20 }, { pct: 0.9, cardio: true })).toEqual({ minutes: 15 });
  });
});

describe("repsDeDescarga y seriesDeAdaptacion", () => {
  it("saca 3 o 4 reps en las series largas y menos en las cortas", () => {
    expect([1, 2, 3, 5, 8, 10, 12, 15, 20].map(repsDeDescarga)).toEqual([1, 1, 2, 3, 5, 6, 8, 11, 16]);
  });
  it("tres cuartos de las series al volver de la descarga", () => {
    expect([1, 2, 3, 4, 5, 6].map(seriesDeAdaptacion)).toEqual([1, 2, 2, 3, 4, 5]);
  });
});

describe("seriesDeDescarga", () => {
  it("la mitad o un tercio, nunca menos de una", () => {
    expect([seriesDeDescarga(3, 2), seriesDeDescarga(4, 2), seriesDeDescarga(1, 2), seriesDeDescarga(5, 3)]).toEqual([2, 2, 1, 2]);
  });
});

describe("ejerciciosEnBaja", () => {
  const rutina = { push: { exercises: [
    { id: "banca", name: "Press banca", sets: [{}] },
    { id: "militar", name: "Press militar", sets: [{}] },
    { id: "fondos", name: "Fondos", sets: [{}] },
  ] } };
  const serie = (date, kg, reps) => ({ date, kg, reps });
  const logs = {
    banca_0: [serie("2026-10-08", 80, 8), serie("2026-10-15", 80, 9), serie("2026-10-22", 80, 7), serie("2026-10-29", 80, 6)],
    militar_0: [serie("2026-10-08", 40, 8), serie("2026-10-15", 40, 9), serie("2026-10-22", 37.5, 8), serie("2026-10-29", 37.5, 7)],
    // Subió el peso (la doble progresión): el 1RM estimado baja, pero no está en baja.
    fondos_0: [serie("2026-10-08", 20, 12), serie("2026-10-15", 20, 12), serie("2026-10-22", 22.5, 8), serie("2026-10-29", 22.5, 8)],
  };
  it("avisa en banca y militar, no en fondos (subió el peso)", () => {
    expect(ejerciciosEnBaja(logs, rutina, "2026-11-05")).toEqual(["Press banca", "Press militar"]);
  });
  it("sin sesiones de las dos últimas semanas, no avisa", () => {
    expect(ejerciciosEnBaja(logs, rutina, "2026-12-20")).toEqual([]);
  });
});

import { planDeEntrenador } from "./entrenamiento.js";
describe("planDeEntrenador", () => {
  it("el principiante da un paso por semana, sin saltos bruscos", () => {
    const p = planDeEntrenador({ kg: 80, reps: 8 }, { repRange: "8-10", salto: 2.5, semanas: 4, cadencia: "principiante" });
    expect(p.map((e) => `${e.reps}x${e.kg}`)).toEqual(["9x80", "10x80", "8x82.5", "9x82.5"]);
  });
  it("el intermedio consolida una de cada tres semanas", () => {
    const p = planDeEntrenador({ kg: 80, reps: 8 }, { repRange: "8-12", salto: 2.5, semanas: 3, cadencia: "intermedio", desde: 2 });
    expect(p.map((e) => [e.week, e.reps, e.kg])).toEqual([[2, 9, 80], [3, 10, 80], [4, 10, 80]]);
  });
  it("con una máquina de 15 lb y poco peso, suma reps antes de saltar", () => {
    const p = planDeEntrenador({ kg: 60, reps: 12 }, { repRange: "10-12", salto: 15, semanas: 3, cadencia: "principiante" });
    expect(p.map((e) => `${e.reps}x${e.kg}`)).toEqual(["13x60", "14x60", "10x75"]);
  });
  it("mantener no sube nada", () => {
    const p = planDeEntrenador({ kg: 50, reps: 10 }, { repRange: "8-12", semanas: 3, cadencia: "mantenimiento" });
    expect(new Set(p.map((e) => `${e.reps}x${e.kg}`)).size).toBe(1);
  });
});

import { equilibrarReps, redondearConReps } from "./entrenamiento.js";
describe("redondeos coherentes", () => {
  it("si el peso sube al redondear, baja una rep", () => {
    // 8 × 76 → 77,5: mismo esfuerzo con una rep menos (≈7,4 → 7)
    expect(equilibrarReps(76, 77.5, 8)).toBe(7);
  });
  it("si baja mucho, sube una rep", () => {
    expect(equilibrarReps(40, 37.5, 10)).toBe(12);
  });
  it("una diferencia chica no toca las reps", () => {
    expect(equilibrarReps(63.75, 62.5, 8)).toBe(8);
  });
  it("nunca cambia más de dos reps ni baja de una", () => {
    expect(equilibrarReps(20, 30, 5)).toBe(3);
    expect(equilibrarReps(20, 30, 1)).toBe(1);
  });
  it("redondea al salto de una máquina de 7 kg y ajusta", () => {
    expect(redondearConReps(66, 10, 7)).toEqual({ kg: 63, reps: 12 });
  });
});

import { resumenDeCiclo } from "./entrenamiento.js";
describe("resumenDeCiclo", () => {
  const logs = {
    press_0: [{ date: "2026-08-01", kg: 70, reps: 8 }, { date: "2026-09-20", kg: 75, reps: 8 }],
    press_1: [{ date: "2026-08-01", kg: 72.5, reps: 6 }, { date: "2026-09-25", kg: 60, reps: 8, deload: true }],
    remo_0: [{ date: "2026-08-10", kg: 60, reps: 10 }, { date: "2026-09-18", kg: 55, reps: 10 }],
    fondos_0: [{ date: "2026-09-19", kg: 0, reps: 12 }],
    cinta_0: [{ date: "2026-09-19", minutes: 20 }],
    viejo_0: [{ date: "2026-07-01", kg: 40, reps: 10 }],
  };
  const r = resumenDeCiclo(logs, "2026-09-14", "2026-11-02");
  it("compara lo mejor de antes con lo mejor del ciclo, sin la descarga ni el cardio", () => {
    const press = r.filas.find((f) => f.id === "press");
    expect(press.antes).toMatchObject({ kg: 70, reps: 8 });
    expect(press.ahora).toMatchObject({ kg: 75, reps: 8 });
    expect(press.esRecord).toBe(true);
    expect(press.cambio).toBeGreaterThan(6);
    expect(r.filas.some((f) => f.id === "cinta")).toBe(false);
    expect(r.filas.some((f) => f.id === "viejo")).toBe(false);
  });
  it("lo que bajó no es récord, y lo nuevo se marca como nuevo", () => {
    expect(r.filas.find((f) => f.id === "remo").esRecord).toBe(false);
    expect(r.filas.find((f) => f.id === "fondos")).toMatchObject({ nuevo: true, corporal: true });
    expect(r.records).toBe(1);
    expect(r.filas[0].id).toBe("press");
  });
});

describe("esDelDia", () => {
  const fechas = { piernas1: new Set(["2026-11-02"]), piernas2: new Set(["2026-11-05"]) };
  it("una serie nueva va con su día", () => {
    expect(esDelDia({ date: "2026-11-09", dia: "piernas1" }, "piernas1", fechas)).toBe(true);
    expect(esDelDia({ date: "2026-11-09", dia: "piernas1" }, "piernas2", fechas)).toBe(false);
  });
  it("una de antes se ubica por la sesión de esa fecha", () => {
    expect(esDelDia({ date: "2026-11-05" }, "piernas2", fechas)).toBe(true);
    expect(esDelDia({ date: "2026-11-05" }, "piernas1", fechas)).toBe(false);
  });
  it("la que no se puede ubicar cuenta para los dos", () => {
    expect(esDelDia({ date: "2026-10-01" }, "piernas1", fechas)).toBe(true);
    expect(esDelDia({ date: "2026-10-01" }, "piernas2", fechas)).toBe(true);
  });
});
