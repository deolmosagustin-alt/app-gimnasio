import { Component } from "react";

/**
 * Red de seguridad ante un error de render.
 *
 * Sin esto, cualquier excepción en cualquier componente desmonta el árbol
 * entero y deja la PANTALLA EN BLANCO: en el navegador al menos se puede
 * recargar, pero dentro de la app de Android no hay barra de direcciones ni
 * botón de recargar — la única salida es cerrar la app por completo, y si
 * el error se repite al volver a entrar, la app queda inutilizable. Es el
 * peor modo de falla posible justo después de publicar, y además el más
 * silencioso: no se entera nadie hasta que llegan las reseñas de 1 estrella.
 *
 * Acá se muestra una pantalla de recuperación con el error a la vista (para
 * poder reportarlo) y dos salidas. Lo que NUNCA hace es tocar los datos
 * guardados: el entrenamiento de la persona no se toca ni se borra.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Queda en el log del dispositivo (visible con Logcat) para poder
    // diagnosticar un reporte real sin tener que reproducirlo a ciegas.
    console.error("[crash]", error, info?.componentStack);
    try {
      // Últimos crashes, para poder pedírselos a la persona que reporta.
      const previos = JSON.parse(localStorage.getItem("gym_crashes_v1") || "[]");
      previos.unshift({ at: new Date().toISOString(), msg: String(error?.message || error), stack: String(info?.componentStack || "").slice(0, 1200) });
      localStorage.setItem("gym_crashes_v1", JSON.stringify(previos.slice(0, 5)));
    } catch { /* si ni eso se puede guardar, no es momento de insistir */ }
  }

  render() {
    if (!this.state.error) return this.props.children;
    const msg = String(this.state.error?.message || this.state.error || "Error desconocido");
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#020617", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(244,63,94,0.15)", border: "1px solid rgba(244,63,94,0.3)", fontSize: 26 }}>⚠️</div>
          <h1 style={{ fontSize: 19, fontWeight: 800, margin: "0 0 8px" }}>Algo se rompió</h1>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: "#94a3b8", margin: "0 0 18px" }}>
            Tus entrenamientos están guardados y no se perdió nada. Probá recargar; si vuelve a pasar, contanos qué estabas haciendo.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ width: "100%", padding: "13px 16px", borderRadius: 14, border: "none", backgroundColor: "#14B8A6", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            Recargar la app
          </button>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ width: "100%", marginTop: 8, padding: "11px 16px", borderRadius: 14, border: "1px solid rgba(148,163,184,0.25)", background: "transparent", color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Intentar seguir sin recargar
          </button>
          <details style={{ marginTop: 18, textAlign: "left" }}>
            <summary style={{ fontSize: 11, color: "#64748b", cursor: "pointer" }}>Detalle técnico</summary>
            <pre style={{ fontSize: 10, color: "#64748b", whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 8, maxHeight: 180, overflow: "auto" }}>{msg}</pre>
          </details>
        </div>
      </div>
    );
  }
}
