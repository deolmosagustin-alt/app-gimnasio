// Lee la ficha de Play sin cambiar nada: el idioma por defecto, las fichas
// que hay (título y descripción corta) y cuántas capturas tiene cada una.
// Abre una edición y la borra al final. Uso: node leer-ficha.mjs <clave.json>
import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";
const [CLAVE] = process.argv.slice(2);
const sa = JSON.parse(readFileSync(CLAVE, "utf8"));
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = b64({ alg: "RS256", typ: "JWT" }) + "." + b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: sa.token_uri, iat: now, exp: now + 3000 });
const s = createSign("RSA-SHA256"); s.update(unsigned);
const jwt = unsigned + "." + s.sign(sa.private_key).toString("base64url");
const tok = await (await fetch(sa.token_uri, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) })).json();
if (!tok.access_token) throw new Error("sin token");
const H = { authorization: `Bearer ${tok.access_token}` };
const base = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.modusfit.fitness";
const edit = await (await fetch(`${base}/edits`, { method: "POST", headers: H })).json();
const E = `${base}/edits/${edit.id}`;
try {
  const det = await (await fetch(`${E}/details`, { headers: H })).json();
  console.log("idioma por defecto:", det.defaultLanguage);
  const lst = await (await fetch(`${E}/listings`, { headers: H })).json();
  for (const l of lst.listings || []) {
    const caps = await (await fetch(`${E}/listings/${l.language}/phoneScreenshots`, { headers: H })).json();
    const fg = await (await fetch(`${E}/listings/${l.language}/featureGraphic`, { headers: H })).json();
    console.log(`- ${l.language}: "${l.title}" | corta: "${l.shortDescription}" | larga: ${l.fullDescription?.length} caracteres | capturas: ${(caps.images || []).length} | imagen principal: ${(fg.images || []).length}`);
  }
  const tracks = await (await fetch(`${E}/tracks`, { headers: H })).json();
  for (const t of tracks.tracks || []) console.log(`pista ${t.track}: ${(t.releases || []).map((r) => `${r.name || ""} ${r.status} [${(r.versionCodes || []).join(",")}]`).join("; ")}`);
} finally {
  await fetch(E, { method: "DELETE", headers: H }).catch(() => {});
}
