import { describe, it, expect } from "vitest";
import { tomar, tomadas, unirTomas, rachaDe, ultimosDias, recortarTomas, nuevoSuplemento, listaDeSuplementos, suplementosParaWidget } from "./suplementos.js";

const creatina = { id: "cre", nombre: "Creatina", forma: "scoop", color: "#7bd0bd", dosis: 1 };
const magnesio = { id: "mag", nombre: "Magnesio", forma: "pastilla", color: "#b6a8ff", dosis: 2 };

describe("tomar", () => {
  it("un toque la deja tomada y otro la vacía", () => {
    let t = tomar({}, "2026-11-14", creatina, 1000);
    expect(tomadas(t, "2026-11-14", "cre")).toBe(1);
    t = tomar(t, "2026-11-14", creatina, 2000);
    expect(tomadas(t, "2026-11-14", "cre")).toBe(0);
  });
  it("con dos dosis por día se llena de a una", () => {
    let t = tomar({}, "2026-11-14", magnesio, 1);
    expect(tomadas(t, "2026-11-14", "mag")).toBe(1);
    t = tomar(t, "2026-11-14", magnesio, 2);
    expect(tomadas(t, "2026-11-14", "mag")).toBe(2);
    t = tomar(t, "2026-11-14", magnesio, 3);
    expect(tomadas(t, "2026-11-14", "mag")).toBe(0);
  });
  it("no toca los otros días ni los otros suplementos", () => {
    const antes = { "2026-11-13": { cre: [1, 5] }, "2026-11-14": { mag: [1, 6] } };
    const t = tomar(antes, "2026-11-14", creatina, 9);
    expect(t["2026-11-13"]).toEqual({ cre: [1, 5] });
    expect(t["2026-11-14"]).toEqual({ mag: [1, 6], cre: [1, 9] });
    expect(antes["2026-11-14"].cre).toBeUndefined();
  });
});

describe("unirTomas", () => {
  it("gana el toque más nuevo de cada suplemento", () => {
    const app = { "2026-11-14": { cre: [1, 100], mag: [1, 300] } };
    const widget = { "2026-11-14": { cre: [0, 200], mag: [2, 250] } };
    expect(unirTomas(app, widget)).toEqual({ "2026-11-14": { cre: [0, 200], mag: [1, 300] } });
  });
  it("devuelve el mismo objeto si no hay nada nuevo", () => {
    const app = { "2026-11-14": { cre: [1, 100] } };
    expect(unirTomas(app, { "2026-11-14": { cre: [1, 100] } })).toBe(app);
    expect(unirTomas(app, null)).toBe(app);
  });
  it("ignora lo que no tiene la forma esperada", () => {
    const app = {};
    expect(unirTomas(app, { hola: { cre: [1, 5] }, "2026-11-14": { cre: "x", mag: [1] }, __proto__: { x: 1 } })).toBe(app);
  });
});

describe("rachaDe", () => {
  const dias = (fechas, sup) => Object.fromEntries(fechas.map((f) => [f, { [sup.id]: [sup.dosis, 1] }]));
  it("cuenta los días seguidos hasta hoy", () => {
    expect(rachaDe(dias(["2026-11-12", "2026-11-13", "2026-11-14"], creatina), creatina, "2026-11-14")).toBe(3);
  });
  it("sin tomar hoy todavía, sigue viva desde ayer", () => {
    expect(rachaDe(dias(["2026-11-12", "2026-11-13"], creatina), creatina, "2026-11-14")).toBe(2);
  });
  it("un día salteado la corta", () => {
    expect(rachaDe(dias(["2026-11-11", "2026-11-13", "2026-11-14"], creatina), creatina, "2026-11-14")).toBe(2);
  });
  it("media dosis no cuenta como día completo", () => {
    const t = { "2026-11-13": { mag: [2, 1] }, "2026-11-14": { mag: [1, 1] } };
    expect(rachaDe(t, magnesio, "2026-11-14")).toBe(1);
  });
  it("pasa bien de un mes al otro", () => {
    expect(rachaDe(dias(["2026-10-30", "2026-10-31", "2026-11-01"], creatina), creatina, "2026-11-01")).toBe(3);
  });
});

describe("lo demás", () => {
  it("ultimosDias da la parte tomada de cada día", () => {
    const t = { "2026-11-13": { mag: [1, 1] }, "2026-11-14": { mag: [2, 1] } };
    const d = ultimosDias(t, magnesio, "2026-11-14", 3);
    expect(d.map((x) => x.parte)).toEqual([0, 0.5, 1]);
    expect(d[2].fecha).toBe("2026-11-14");
  });
  it("recortarTomas saca lo viejo", () => {
    const t = { "2026-01-01": { cre: [1, 1] }, "2026-11-14": { cre: [1, 1] } };
    expect(Object.keys(recortarTomas(t, "2026-11-14", 120))).toEqual(["2026-11-14"]);
  });
  it("nuevoSuplemento elige un color sin usar y limpia el nombre", () => {
    const a = nuevoSuplemento({ nombre: "  Creatina  ", forma: "scoop" }, []);
    const b = nuevoSuplemento({ nombre: "Omega 3" }, [a]);
    expect(a.nombre).toBe("Creatina");
    expect(b.color).not.toBe(a.color);
    expect(b.id).not.toBe(a.id);
    expect(b.dosis).toBe(1);
  });
  it("listaDeSuplementos descarta lo roto y limita las dosis", () => {
    const l = listaDeSuplementos([creatina, null, { id: "x", nombre: "" }, { id: "ok1", nombre: "Zinc", dosis: 99, forma: "raro", color: "rojo" }]);
    expect(l.map((x) => x.id)).toEqual(["cre", "ok1"]);
    expect(l[1]).toMatchObject({ dosis: 6, forma: "capsula", color: "#7bd0bd" });
  });
  it("al teléfono van la lista y las tomas de hoy y de ayer", () => {
    const t = { "2026-11-12": { cre: [1, 1] }, "2026-11-13": { cre: [1, 2] }, "2026-11-14": { cre: [1, 3] } };
    const w = suplementosParaWidget([creatina], t, "2026-11-14");
    expect(Object.keys(w.tomas).sort()).toEqual(["2026-11-13", "2026-11-14"]);
    expect(w.lista).toHaveLength(1);
  });
});
