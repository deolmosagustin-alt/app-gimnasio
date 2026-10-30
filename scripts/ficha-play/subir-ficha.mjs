// La ficha de Play en sus tres idiomas (es-419 con vos, es-ES y es-US con
// tú): el texto de textos.mjs, las 8 láminas y la imagen principal de cada
// uno. Todo en una sola edición: si algo falla, se descarta entera.
// Uso: node subir-ficha.mjs <clave.json> <carpeta de la ficha> [--probar]
// Con --probar sólo revisa los largos y que estén las imágenes.
import { readFileSync, existsSync } from "node:fs";
import { createSign } from "node:crypto";
import { join } from "node:path";
import { TITULO, FICHAS, revisar } from "./textos.mjs";
const [CLAVE, FICHA] = process.argv.slice(2);
const PROBAR = process.argv.includes("--probar");
const CAPTURAS = ["01-serie", "02-grafica", "03-plan", "04-musculos", "05-ia", "06-ticket", "07-amigos", "08-rutinas"];

const fallas = revisar();
for (const f of Object.values(FICHAS)) {
  for (const n of [...CAPTURAS, "principal"]) if (!existsSync(join(FICHA, f.laminas, `${n}.png`))) fallas.push(`falta ${f.laminas}/${n}.png`);
}
if (fallas.length) throw new Error([...new Set(fallas)].join("; "));
console.log(`título ${TITULO.length}; ${Object.entries(FICHAS).map(([k, f]) => `${k}: corta ${f.corta.length}, larga ${f.larga.length}`).join("; ")}`);
if (PROBAR) process.exit(0);

const sa = JSON.parse(readFileSync(CLAVE, "utf8"));
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = b64({ alg: "RS256", typ: "JWT" }) + "." + b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: sa.token_uri, iat: now, exp: now + 3000 });
const s = createSign("RSA-SHA256"); s.update(unsigned);
const jwt = unsigned + "." + s.sign(sa.private_key).toString("base64url");
const tok = await (await fetch(sa.token_uri, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) })).json();
if (!tok.access_token) throw new Error("sin token");
const H = { authorization: `Bearer ${tok.access_token}` };
const pkg = "com.modusfit.fitness";
const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}`;
const subida = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${pkg}`;
const paso = async (nombre, r) => { const t = await r.text(); if (!r.ok) throw new Error(`${nombre} ${r.status}: ${t.slice(0, 600)}`); console.log(`${nombre}: ${r.status}`); return t ? JSON.parse(t) : {}; };

const edit = await paso("edición", await fetch(`${base}/edits`, { method: "POST", headers: H }));
const E = `${base}/edits/${edit.id}`;
try {
  for (const [idioma, f] of Object.entries(FICHAS)) {
    // PUT crea la ficha del idioma si no estaba.
    await paso(`${idioma} texto`, await fetch(`${E}/listings/${idioma}`, { method: "PUT", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify({ language: idioma, title: TITULO, shortDescription: f.corta, fullDescription: f.larga }) }));
    await paso(`${idioma} capturas viejas fuera`, await fetch(`${E}/listings/${idioma}/phoneScreenshots`, { method: "DELETE", headers: H }));
    for (const n of CAPTURAS) {
      await paso(`${idioma} ${n}`, await fetch(`${subida}/edits/${edit.id}/listings/${idioma}/phoneScreenshots?uploadType=media`, { method: "POST", headers: { ...H, "content-type": "image/png" }, body: readFileSync(join(FICHA, f.laminas, `${n}.png`)) }));
    }
    await paso(`${idioma} imagen principal vieja fuera`, await fetch(`${E}/listings/${idioma}/featureGraphic`, { method: "DELETE", headers: H }));
    await paso(`${idioma} imagen principal`, await fetch(`${subida}/edits/${edit.id}/listings/${idioma}/featureGraphic?uploadType=media`, { method: "POST", headers: { ...H, "content-type": "image/png" }, body: readFileSync(join(FICHA, f.laminas, "principal.png")) }));
  }
  await paso("confirmación", await fetch(`${E}:commit`, { method: "POST", headers: H }));
} catch (e) {
  await fetch(E, { method: "DELETE", headers: H }).catch(() => {});
  throw e;
}
