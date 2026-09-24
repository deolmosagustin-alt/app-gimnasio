import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
