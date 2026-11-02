import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fuente empaquetada con la app: el WebView de Android y la app instalada en
// el iPhone la tienen aunque no haya internet en el gimnasio. Es la versión
// con los ejes de peso y de redondez (ROND), la que usan los números grandes
// (ver fuente.css: sólo los alfabetos latinos).
import './fuente.css'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

// Errores que NO pasan por React (una promesa que nadie atrapó, un handler
// asíncrono que explota): no rompen la pantalla, pero desaparecían sin
// dejar rastro. Quedan en el log del dispositivo para poder diagnosticar un
// reporte real desde Logcat.
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (e) => {
    console.error("[promesa sin atrapar]", e?.reason);
  });

  // CHUNK VIEJO: la app de Android carga desde el dominio de Vercel
  // (capacitor.config.json → server.url), así que el WebView puede quedarse
  // con un index.html cacheado que apunta a nombres de archivo que el deploy
  // nuevo ya reemplazó. Todo lo que se carga bajo demanda —el generador de
  // QR, el lector de QR, el lector de PDF/Excel, los plugins de Capacitor—
  // empieza a dar 404 y falla EN SILENCIO: la función simplemente no hace
  // nada. Es lo que dejó sin andar al QR (generar Y escanear a la vez, que
  // es justo lo que comparten: los dos son imports dinámicos).
  // La cura es recargar una sola vez: al pedir el index de nuevo llega el
  // mapa de archivos nuevo. El flag en sessionStorage evita el bucle si el
  // problema fuera otro (sin red, por ejemplo).
  const RECARGA_YA_INTENTADA = "modusfit_recarga_por_chunk";
  const recargarPorChunkViejo = (motivo) => {
    try {
      if (sessionStorage.getItem(RECARGA_YA_INTENTADA)) {
        console.error("[chunk] falló de nuevo tras recargar, no insisto:", motivo);
        return;
      }
      sessionStorage.setItem(RECARGA_YA_INTENTADA, "1");
    } catch { /* sin sessionStorage, mejor no recargar: no hay cómo frenar el bucle */ return; }
    console.error("[chunk] no se pudo cargar una parte de la app, recargando:", motivo);
    window.location.reload();
  };
  // Vite avisa con su propio evento cuando falla la precarga de un módulo.
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    recargarPorChunkViejo(e?.payload?.message || "vite:preloadError");
  });
  // Y por las dudas, el caso general: un import() que se rechaza con el
  // error típico de módulo inalcanzable.
  window.addEventListener("unhandledrejection", (e) => {
    const msg = String(e?.reason?.message || e?.reason || "");
    if (/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(msg)) {
      recargarPorChunkViejo(msg);
    }
  });
}

// Sin señal la app abre igual: el service worker guarda la página y sus
// archivos (ver src/sw-plantilla.js). Sólo en la versión publicada.
if (import.meta.env.PROD && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("[sw] no se pudo registrar:", e?.message || e))
  })
}

const arrancar = () => createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// SÓLO EN DESARROLLO: ?demo=<pestaña> (rutina, progreso, social, rutinas,
// entrenador_ia o perfil) abre la app con el perfil y el historial de muestra
// que deja `npm run capturas -- --datos` en .taste-skill/demo-storage.json, en
// esa pestaña. Es para las herramientas que sólo reciben una dirección, como
// el inspector de la skill de diseño. En la versión publicada no existe.
const demo = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("demo") : null
if (demo) {
  fetch("/.taste-skill/demo-storage.json")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`sin perfil de muestra (${r.status}): corré npm run capturas -- --datos`))))
    .then((datos) => {
      localStorage.clear()
      for (const [clave, valor] of Object.entries(datos)) localStorage.setItem(clave, valor)
    })
    .catch((e) => console.error("[demo]", e.message))
    .finally(arrancar)
} else {
  arrancar()
}
