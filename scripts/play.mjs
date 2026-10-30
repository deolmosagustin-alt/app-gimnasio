// GOOGLE PLAY DESDE LA TERMINAL, con la cuenta de servicio (fuera del repo:
// C:/Users/usuario/.claves/play-gymapp-1e2a1.json, o la ruta de PLAY_CLAVE).
//
//   npm run play -- estado                  qué versión hay en cada pista
//   npm run play -- aab                     arma el AAB firmado (ver abajo)
//   npm run play -- subir [aab] [--pista alpha] [--notas "Qué cambió"]
//   npm run play -- resenas                 las últimas reseñas, con su respuesta
//   npm run play -- responder <id> "texto"  contesta una reseña
//   npm run play -- cierres [--dias 7]      los cierres y ANR de los últimos días
//
// LA FIRMA: `aab` usa la clave de subida que dice C:/Users/usuario/.claves/
// firma.properties (storeFile, storePassword, keyAlias, keyPassword; o la ruta
// de MODUSFIT_FIRMA). Ese archivo no entra al repo ni pasa por el chat: lo
// llena el dueño una vez. android/app/build.gradle lo lee; sin él, el release
// sale sin firmar y Play lo rechaza.
import { readFileSync, existsSync, statSync } from "node:fs";
import { createSign } from "node:crypto";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAQUETE = "com.modusfit.fitness";
const CLAVE = process.env.PLAY_CLAVE || join(homedir(), ".claves", "play-gymapp-1e2a1.json");
const FIRMA = process.env.MODUSFIT_FIRMA || join(homedir(), ".claves", "firma.properties");
const AAB = join(RAIZ, "android", "app", "build", "outputs", "bundle", "release", "app-release.aab");
const JAVA = process.env.JAVA_HOME || "C:/Program Files/Android/Android Studio/jbr";

const [orden = "estado", ...resto] = process.argv.slice(2);
const opcion = (nombre, defecto = null) => { const i = resto.indexOf(`--${nombre}`); return i >= 0 ? resto[i + 1] : defecto; };
const sueltos = resto.filter((a, i) => !a.startsWith("--") && !(i > 0 && resto[i - 1].startsWith("--")));

async function token(alcance) {
  if (!existsSync(CLAVE)) throw new Error(`No está la cuenta de servicio en ${CLAVE}`);
  const sa = JSON.parse(readFileSync(CLAVE, "utf8"));
  const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
  const ahora = Math.floor(Date.now() / 1000);
  const sinFirmar = b64({ alg: "RS256", typ: "JWT" }) + "." + b64({ iss: sa.client_email, scope: alcance, aud: sa.token_uri, iat: ahora, exp: ahora + 3000 });
  const f = createSign("RSA-SHA256");
  f.update(sinFirmar);
  const jwt = sinFirmar + "." + f.sign(sa.private_key).toString("base64url");
  const r = await (await fetch(sa.token_uri, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) })).json();
  if (!r.access_token) throw new Error(`Sin permiso: ${JSON.stringify(r).slice(0, 300)}`);
  return { authorization: `Bearer ${r.access_token}` };
}

const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PAQUETE}`;
const SUBIDA = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PAQUETE}`;
async function pedir(H, nombre, url, init = {}) {
  const r = await fetch(url, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${nombre} ${r.status}: ${t.slice(0, 600)}`);
  return t ? JSON.parse(t) : {};
}
// Una edición de Play: todo adentro se confirma junto o se descarta.
async function enEdicion(H, fn, { confirmar = false } = {}) {
  const e = await pedir(H, "edición", `${API}/edits`, { method: "POST" });
  const E = `${API}/edits/${e.id}`;
  try {
    const r = await fn(E, e.id);
    if (confirmar) await pedir(H, "confirmación", `${E}:commit`, { method: "POST" });
    else await fetch(E, { method: "DELETE", headers: H }).catch(() => {});
    return r;
  } catch (err) {
    await fetch(E, { method: "DELETE", headers: H }).catch(() => {});
    throw err;
  }
}

function leerFirma() {
  if (!existsSync(FIRMA)) return null;
  const p = Object.fromEntries(readFileSync(FIRMA, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
  return ["storeFile", "storePassword", "keyAlias", "keyPassword"].every((k) => p[k]) ? p : null;
}

const ordenes = {
  async estado() {
    const H = await token("https://www.googleapis.com/auth/androidpublisher");
    const pistas = await enEdicion(H, (E) => pedir(H, "pistas", `${E}/tracks`));
    for (const p of pistas.tracks || []) {
      const rel = (p.releases || []).map((r) => `${r.name || "sin nombre"} (${(r.versionCodes || []).join(", ") || "—"}, ${r.status})`).join("; ");
      console.log(`${p.track.padEnd(12)} ${rel || "vacía"}`);
    }
  },

  async aab() {
    const firma = leerFirma();
    if (!firma) throw new Error(`Falta la firma: llená storeFile, storePassword, keyAlias y keyPassword en ${FIRMA} (una vez, en tu computadora).`);
    if (!existsSync(firma.storeFile)) throw new Error(`No está el archivo de la clave que dice storeFile (${firma.storeFile}).`);
    // La app carga la web publicada: si el config de adentro del AAB no tiene
    // server.url (quedó de un APK de prueba), la app sale con la web vieja.
    const config = JSON.parse(readFileSync(join(RAIZ, "android", "app", "src", "main", "assets", "capacitor.config.json"), "utf8"));
    if (!config.server?.url) throw new Error("android/app/src/main/assets/capacitor.config.json no tiene server.url: corré `npx cap sync android` antes.");
    const gradle = spawnSync(process.platform === "win32" ? "gradlew.bat" : "./gradlew", ["bundleRelease"], { cwd: join(RAIZ, "android"), stdio: "inherit", shell: true, env: { ...process.env, JAVA_HOME: JAVA } });
    if (gradle.status !== 0) throw new Error("gradle bundleRelease falló");
    const v = spawnSync(join(JAVA, "bin", "jarsigner"), ["-verify", AAB], { encoding: "utf8" });
    if (!/jar verified/.test(v.stdout || "")) throw new Error(`El AAB no quedó firmado: ${(v.stdout || v.stderr || "").slice(0, 300)}`);
    const gv = readFileSync(join(RAIZ, "android", "app", "build.gradle"), "utf8");
    console.log(`Listo: ${AAB} (${(statSync(AAB).size / 1e6).toFixed(1)} MB, versionCode ${gv.match(/versionCode (\d+)/)?.[1]}, ${gv.match(/versionName "([^"]+)"/)?.[1]}), firmado.`);
  },

  async subir() {
    const archivo = sueltos[0] || AAB;
    if (!existsSync(archivo)) throw new Error(`No está el AAB: ${archivo}. Armalo con \`npm run play -- aab\`.`);
    const pista = opcion("pista", "alpha");
    const notas = opcion("notas");
    const H = await token("https://www.googleapis.com/auth/androidpublisher");
    await enEdicion(H, async (E, id) => {
      const b = await pedir(H, "subida", `${SUBIDA}/edits/${id}/bundles?uploadType=media`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: readFileSync(archivo) });
      console.log(`subido: versionCode ${b.versionCode}`);
      const gv = readFileSync(join(RAIZ, "android", "app", "build.gradle"), "utf8");
      const nombre = gv.match(/versionName "([^"]+)"/)?.[1] || String(b.versionCode);
      await pedir(H, "pista", `${E}/tracks/${pista}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ track: pista, releases: [{ name: nombre, versionCodes: [String(b.versionCode)], status: "completed", ...(notas ? { releaseNotes: [{ language: "es-419", text: notas }] } : {}) }] }) });
      console.log(`${nombre} en ${pista}`);
    }, { confirmar: true });
  },

  async resenas() {
    const H = await token("https://www.googleapis.com/auth/androidpublisher");
    const r = await pedir(H, "reseñas", `${API}/reviews?maxResults=50`);
    if (!r.reviews?.length) { console.log("Sin reseñas con texto en los últimos 7 días (la API sólo trae esas)."); return; }
    for (const rv of r.reviews) {
      const c = rv.comments?.find((x) => x.userComment)?.userComment;
      const resp = rv.comments?.find((x) => x.developerComment)?.developerComment;
      console.log(`${rv.reviewId}  ${"★".repeat(c?.starRating || 0)}  ${new Date(Number(c?.lastModified?.seconds || 0) * 1000).toLocaleDateString("es-AR")}  v${c?.appVersionName || "?"}\n  ${(c?.text || "").trim()}${resp ? `\n  respuesta: ${resp.text}` : ""}`);
    }
  },

  async responder() {
    const [id, ...texto] = sueltos;
    if (!id || !texto.length) throw new Error('Uso: npm run play -- responder <id> "texto"');
    const H = await token("https://www.googleapis.com/auth/androidpublisher");
    await pedir(H, "respuesta", `${API}/reviews/${id}:reply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ replyText: texto.join(" ") }) });
    console.log("Respondida.");
  },

  async cierres() {
    const dias = Number(opcion("dias", "7"));
    const H = await token("https://www.googleapis.com/auth/playdeveloperreporting");
    const fecha = (d, cual) => `interval.${cual}.year=${d.getUTCFullYear()}&interval.${cual}.month=${d.getUTCMonth() + 1}&interval.${cual}.day=${d.getUTCDate()}`;
    const url = `https://playdeveloperreporting.googleapis.com/v1beta1/apps/${PAQUETE}/errorReports:search?pageSize=50&${fecha(new Date(Date.now() - dias * 864e5), "startTime")}&${fecha(new Date(), "endTime")}`;
    const r = await pedir(H, "cierres", url);
    if (!r.errorReports?.length) { console.log(`Sin cierres ni ANR en los últimos ${dias} días.`); return; }
    for (const e of r.errorReports) {
      const primera = (e.reportText || "").split("\n").find((l) => l.trim()) || "";
      console.log(`${e.eventTime?.slice(0, 10) || ""}  ${e.type || ""}  v${e.appVersion?.versionCode || "?"}  Android ${e.osVersion?.apiLevel || "?"}  ${e.deviceModel?.marketingName || ""}\n  ${primera.slice(0, 200)}`);
    }
  },
};

if (!ordenes[orden]) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(2, 9).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(1);
}
ordenes[orden]().catch((e) => { console.error(e.message); process.exit(1); });
