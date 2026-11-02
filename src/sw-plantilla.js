// EL SERVICE WORKER: que la app abra sin señal.
//
// La app de Android carga la web publicada (server.url en capacitor.config),
// así que sin internet el WebView mostraba la página de error de Chrome:
// en un gimnasio en un subsuelo, la app ni abría, aunque todos tus datos
// estuvieran en el teléfono. Esto guarda la página y sus archivos la primera
// vez que la abrís con conexión, y sin conexión la sirve desde ahí.
//
// - La página (navegar): primero la red, siempre, así nadie se queda con una
//   versión vieja; si la red no contesta en unos segundos o no hay, la última
//   que se guardó. En la app, el pedido lo atiende Capacitor (inyecta el
//   puente con los plugins), así que la copia guardada ya lo trae.
// - /assets/*: tienen el hash en el nombre y nunca cambian; se sirven del
//   caché. Al instalarse se guardan todos los de esta versión (la lista la
//   pone el armado, ver vite.config.js), salvo los lectores de PDF y Excel,
//   que se guardan la primera vez que se usan.
// - Todo lo demás (Firebase, la IA en /api, otros sitios) no se toca.
//
// REGLA DE ORO: esto nunca puede dejar la app peor que sin él. El caché del
// teléfono se puede romper (en el emulador se rompió al cortarse a mitad de
// una escritura: "Unexpected internal error" en cada match) y eso hacía
// fallar la página entera. Todo lo que toca el caché atrapa sus errores y
// sigue por la red, y un caché roto se borra.
//
// Plantilla: el armado reemplaza ARCHIVOS y VERSION y la publica en /sw.js.
const ARCHIVOS = self.__ARCHIVOS__ || [];
const VERSION = self.__VERSION__ || "dev";
const CACHE_PAGINAS = "modusfit-paginas";
const CACHE_ARCHIVOS = `modusfit-archivos-${VERSION}`;
const ESPERA_RED_MS = 5000;

// Un caché que tiró un error interno no sirve más: se borra entero, así la
// próxima vez se arma de cero en vez de fallar siempre igual.
function descartar(nombre, err) {
  console.warn(`[sw] el caché ${nombre} falló, se borra:`, err?.message || err);
  self.caches.delete(nombre).catch(() => {});
}
async function buscar(nombre, clave) {
  try {
    const cache = await self.caches.open(nombre);
    return (await cache.match(clave, { ignoreVary: true })) || null;
  } catch (err) { descartar(nombre, err); return null; }
}
async function guardar(nombre, clave, res) {
  try {
    const cache = await self.caches.open(nombre);
    await cache.put(clave, res);
  } catch (err) { descartar(nombre, err); }
}
async function buscarEnTodos(clave) {
  try { return (await self.caches.match(clave, { ignoreVary: true })) || null; } catch { return null; }
}

self.addEventListener("install", (evento) => {
  evento.waitUntil((async () => {
    try {
      const cache = await self.caches.open(CACHE_ARCHIVOS);
      // De a uno y sin cortar si alguno falla: mejor tener casi todo que nada.
      await Promise.all(ARCHIVOS.map((url) => cache.add(new Request(url, { cache: "reload" })).catch(() => {})));
      // La página, si todavía no hay ninguna guardada: así abre sin señal
      // desde la segunda vez, sin esperar otra visita. Con Accept de HTML,
      // que es lo que mira Capacitor para meterle el puente con los plugins.
      const raiz = `${self.location.origin}/`;
      if (!(await buscar(CACHE_PAGINAS, raiz))) {
        const res = await fetch(new Request(raiz, { cache: "reload", headers: { Accept: "text/html,application/xhtml+xml" } }));
        if (res.ok && res.type === "basic") await guardar(CACHE_PAGINAS, raiz, res);
      }
    } catch (err) {
      // Sin red o sin lugar: se guarda en la próxima visita. Instalarse igual.
      console.warn("[sw] no se pudo guardar todo al instalar:", err?.message || err);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil((async () => {
    try {
      // Se queda la versión anterior además de esta: una pantalla que quedó
      // abierta con la anterior todavía puede pedir alguno de sus archivos
      // (el lector de QR, por ejemplo), y el servidor ya no los tiene.
      // caches.keys() los da en el orden en que se crearon.
      const nombres = (await self.caches.keys()).filter((n) => n.startsWith("modusfit-archivos-") && n !== CACHE_ARCHIVOS);
      await Promise.all(nombres.slice(0, -1).map((n) => self.caches.delete(n)));
    } catch { /* limpiar es opcional */ }
    await self.clients.claim();
  })());
});

const PAGINA_SIN_CONEXION = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Modus Fit</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0c0d10;color:#d6d8dc;font:16px/1.45 system-ui,sans-serif;padding:24px;box-sizing:border-box;text-align:center}h1{font-size:22px;color:#fff;margin:0 0 8px}button{margin-top:18px;height:48px;padding:0 24px;border:0;border-radius:999px;background:#e6e7ea;color:#111;font:600 15px system-ui,sans-serif}</style></head>
<body><main><h1>Sin conexión</h1><p>Abrí Modus Fit una vez con internet y después funciona sin señal.</p><button onclick="location.reload()">Probar de nuevo</button></main></body></html>`;
const sinConexion = () => new Response(PAGINA_SIN_CONEXION, { headers: { "Content-Type": "text/html; charset=utf-8" } });

function claveDePagina(url) {
  const u = new URL(url);
  return u.origin + (u.pathname === "/index.html" ? "/" : u.pathname);
}

// La red tiene unos segundos; si no contesta (o el servidor falla), la copia
// guardada, y la red sigue de fondo para que la próxima vez abra la nueva.
function navegar(evento) {
  const clave = claveDePagina(evento.request.url);
  let guardado = Promise.resolve();
  const red = fetch(evento.request).then((res) => {
    if (res.ok && res.type === "basic") guardado = guardar(CACHE_PAGINAS, clave, res.clone());
    return res;
  });
  evento.waitUntil(red.then(() => guardado, () => {}));
  evento.respondWith((async () => {
    const copia = await buscar(CACHE_PAGINAS, clave);
    try {
      const res = copia
        ? await Promise.race([red, new Promise((resolver) => setTimeout(() => resolver(copia), ESPERA_RED_MS))])
        : await red;
      return res.status >= 500 && copia ? copia : res;
    } catch {
      return copia || sinConexion();
    }
  })().catch(() => red.catch(sinConexion)));
}

// ignoreVary (en buscar): el script de la página pide con un encabezado
// Origin que el pedido guardado al instalarse no tenía; si el servidor
// responde con "Vary: Origin", sin esto no coincidían y sin red no se
// encontraba nada.
async function archivo(evento) {
  const guardado = await buscar(CACHE_ARCHIVOS, evento.request);
  if (guardado) return guardado;
  try {
    const res = await fetch(evento.request);
    if (res.ok && res.type === "basic") guardar(CACHE_ARCHIVOS, evento.request, res.clone());
    return res;
  } catch (err) {
    // Un archivo de una versión anterior que quedó en otro caché.
    const viejo = await buscarEnTodos(evento.request);
    if (viejo) return viejo;
    throw err;
  }
}

async function otro(evento) {
  try {
    const res = await fetch(evento.request);
    if (res.ok && res.type === "basic") guardar(CACHE_PAGINAS, evento.request, res.clone());
    return res;
  } catch (err) {
    const guardado = await buscarEnTodos(evento.request);
    if (guardado) return guardado;
    throw err;
  }
}

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") { navegar(evento); return; }
  if (url.pathname === "/sw.js") return;
  // Cualquier error propio del service worker termina en la red, como si no
  // estuviera.
  const manejar = url.pathname.startsWith("/assets/") ? archivo : otro;
  evento.respondWith(manejar(evento).catch(() => fetch(req)));
});
