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
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
