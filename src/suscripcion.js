/* ============================================================================
   MODUS FIT PREMIUM: la suscripción, preparada y con el cobro APAGADO.

   Pedido del 03/11/2026: "dejar la app preparada para cobrar desde las
   tiendas, con suscripción mensual, semestral y anual", con estrategias que
   hayan demostrado funcionar. Cada decisión, con su fuente, está en
   docs/suscripcion.md. Lo esencial:

   · Freemium sin candados (pedido del 03/11: "que se pueda usar muy bien
     gratis pero que con pro se sienta la diferencia, no restringir nada en
     el plan gratis en cuanto a funciones"): todas las funciones son gratis,
     también Planificar con IA e importar con foto. Premium es más de lo que
     cuesta (las consultas por día a la IA, que se pagan por pedido) y sin
     anuncios, que se prenden con el cobro.
   · Tres planes de una misma suscripción de Google Play (producto
     `modus_premium`, tres planes base). El anual va primero y elegido, con 7
     días gratis; el semestral y el mensual, como comparación.
   · El precio que se cobra va siempre más grande que su equivalente por mes
     (política de suscripciones de Google Play), y antes de comprar se dice
     cuánto dura la prueba, cuánto se cobra después, que se renueva solo y
     cómo se cancela.
   · Los precios de verdad los pone la tienda (localizados por país, con
     paridad de poder adquisitivo): en la app se muestran los que devuelve
     RevenueCat, nunca escritos a mano. Los de acá son los de referencia en
     dólares, para el modo de prueba y para cargar en Play Console.

   LA BANDERA: con COBRO_ACTIVO en false (lo de fábrica) nadie ve un paywall
   ni un candado y todo sigue gratis, como hasta ahora: se puede publicar en
   main sin que cambie nada. En desarrollo, con modusfit_premium_prueba en
   "1" en el localStorage, se prueba todo el circuito con un proveedor de
   mentira que no cobra. Para prenderlo de verdad: docs/suscripcion.md,
   "Para prenderlo".
============================================================================ */
import { Capacitor, registerPlugin } from "@capacitor/core";

export const COBRO_ACTIVO = import.meta.env.VITE_COBRO_ACTIVO === "1";
// Los anuncios (AdMob), todavía sin hacer: se prenden junto con el cobro
// (pedido del 03/11: "que el plan pro saque los anuncios", con la meta de
// prender todo a las 1000 descargas). Premium los saca: el código de los
// anuncios tiene que preguntar `mostrarAnuncios(esPremium)` antes de cargar
// uno, y nunca durante el entrenamiento.
export const ANUNCIOS_ACTIVOS = import.meta.env.VITE_ANUNCIOS_ACTIVOS === "1";
export const mostrarAnuncios = (esPremium) => ANUNCIOS_ACTIVOS && !esPremium;
const CLAVE_PRUEBA = "modusfit_premium_prueba";
const CLAVE_ESTADO_PRUEBA = "modusfit_premium_prueba_estado";
// La clave pública del SDK de RevenueCat para Android (empieza con "goog_").
// Es pública por diseño (va en la app); la secreta nunca viaja al cliente.
const CLAVE_REVENUECAT = import.meta.env.VITE_REVENUECAT_ANDROID || "";

// También con ?premium=prueba en la dirección (lo usa scripts/probar-flujos.mjs:
// el perfil de muestra borra el localStorage al cargar).
export function modoPrueba() {
  if (!import.meta.env.DEV) return false;
  try {
    if (typeof location !== "undefined" && new URLSearchParams(location.search).get("premium") === "prueba") return true;
    return localStorage.getItem(CLAVE_PRUEBA) === "1";
  } catch { return false; }
}
// Si hay que mostrar algo de Premium (planes, candados, el paywall).
export const suscripcionVisible = () => COBRO_ACTIVO || modoPrueba();

export const PAQUETE = "com.modusfit.fitness";
export const PRODUCTO = "modus_premium";
export const DERECHO = "premium";

// Los tres planes, en el orden del paywall. `precioUSD`: la referencia para
// Play Console (la tienda pone el de cada país) y para el modo de prueba.
export const PLANES = [
  { id: "anual", basePlan: "anual", tipo: "ANNUAL", periodo: "P1Y", meses: 12, precioUSD: 17.99, prueba: 7, nombre: "Anual", cada: "por año" },
  { id: "semestral", basePlan: "semestral", tipo: "SIX_MONTH", periodo: "P6M", meses: 6, precioUSD: 11.99, prueba: 0, nombre: "Semestral", cada: "cada 6 meses" },
  { id: "mensual", basePlan: "mensual", tipo: "MONTHLY", periodo: "P1M", meses: 1, precioUSD: 2.99, prueba: 0, nombre: "Mensual", cada: "por mes" },
];
export const PLAN_ELEGIDO = "anual";

// Qué es de Premium. El cupo de la IA: gratis, 5 consultas por día (un tope
// que se siente en el hábito, no a fin de mes); con Premium, 25, el tope de
// siempre.
export const CUPO_IA_GRATIS = 15;
export const CUPO_IA_PREMIUM = 40;
export const FUNCIONES = {
  ia_cupo: { titulo: "Seguí hablando con tu entrenador", bajada: `Llegaste a las ${CUPO_IA_GRATIS} consultas de hoy. Con Premium tenés ${CUPO_IA_PREMIUM} por día.` },
  primer_entrenamiento: { titulo: "Entrenaste. Así, sin interrupciones.", bajada: "Todo sigue gratis. Premium saca los anuncios y te da más consultas a tu entrenador." },
  perfil: { titulo: "Lo mismo, sin interrupciones", bajada: "Todas las funciones son gratis. Premium saca los anuncios y te da más IA." },
};
// Lo que suma Premium, en el paywall.
// "Sin anuncios" va sólo cuando hay anuncios que sacar: prometerlo sin
// anuncios sería engañoso. En el modo de prueba se ve, para revisar el paywall
// como va a quedar.
export const BENEFICIOS = [
  ...(ANUNCIOS_ACTIVOS || modoPrueba() ? [{ titulo: "Sin anuncios", bajada: "En ninguna pantalla." }] : []),
  { titulo: `${CUPO_IA_PREMIUM} consultas por día al Entrenador IA`, bajada: `Gratis son ${CUPO_IA_GRATIS}. Planificar con IA e importar con foto también usan consultas.` },
];

// ── El formato de los precios ───────────────────────────────────────────────
export function precioEscrito(monto, moneda = "USD") {
  try { return new Intl.NumberFormat("es-AR", { style: "currency", currency: moneda, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(monto); } catch { return `${moneda} ${monto.toFixed(2)}`; }
}

// Lo que da por mes un plan largo, redondeado para arriba: la cuenta nunca
// puede mostrarlo más barato de lo que es.
export const porMesHaciaArriba = (monto, meses) => Math.ceil((monto / meses) * 100 - 1e-9) / 100;
// Cuánto se ahorra contra pagar mes a mes, redondeado para abajo (nunca de más).
export function ahorroContraMensual(oferta, mensual) {
  if (!oferta || !mensual || oferta.meses <= 1 || !(mensual.monto > 0) || oferta.moneda !== mensual.moneda) return 0;
  return Math.max(0, Math.floor((1 - oferta.monto / (mensual.monto * oferta.meses)) * 100 + 1e-9));
}

// ── El estado (Premium o no), compartido por toda la app ────────────────────
const VACIO = { activo: false, plan: null, enPrueba: false, vence: null, seRenueva: null, cargado: false };
let ESTADO = VACIO;
const OYENTES = new Set();
// PREMIUM DE REGALO (05/11, pedido: "un lugar donde poner códigos especiales
// para darle el plan pago a amigos y familia sin que paguen"): un código
// canjeado (ver canjearCodigo en social.js) deja `premiumRegalo` en el perfil;
// mientras esté vigente, cuenta como Premium aunque la tienda diga que no.
let REGALO = null;
let ULTIMO = {};
const regaloVigente = () => !!REGALO && (!REGALO.hasta || REGALO.hasta >= new Date().toISOString().slice(0, 10));
function publicar(e) {
  ULTIMO = e || {};
  const conRegalo = !ULTIMO.activo && regaloVigente() ? { activo: true, plan: "regalo", vence: REGALO.hasta || null, regalo: true, codigo: REGALO.codigo || null } : {};
  ESTADO = { ...VACIO, ...ULTIMO, ...conRegalo, cargado: true };
  OYENTES.forEach((f) => f());
}
export function aplicarRegalo(regalo) { REGALO = regalo && regalo.codigo ? regalo : null; publicar(ULTIMO); }
export function suscribirPremium(f) { OYENTES.add(f); return () => OYENTES.delete(f); }
export function estadoPremium() { return ESTADO; }
export const esPremium = () => ESTADO.activo;
// Si una función le pide Premium a esta persona ahora.
export const necesitaPremium = () => suscripcionVisible() && !ESTADO.activo;
export const cupoDiarioIA = () => (necesitaPremium() ? CUPO_IA_GRATIS : CUPO_IA_PREMIUM);

// ── El paywall se pide desde cualquier pantalla; lo dibuja App ──────────────
export const EVENTO_PAYWALL = "modusfit:paywall";
export function pedirPaywall(motivo = "perfil") {
  if (!suscripcionVisible() || typeof window === "undefined") return false;
  window.dispatchEvent(new CustomEvent(EVENTO_PAYWALL, { detail: { motivo } }));
  return true;
}
// Los que salen solos (después del primer entrenamiento): uno solo, y nunca
// dos en menos de tres días (la skill de paywalls: "respetar el no").
const CLAVE_AUTOMATICO = "modusfit_paywall_automatico";
export function paywallAutomatico(motivo) {
  if (!necesitaPremium()) return false;
  try {
    const visto = JSON.parse(localStorage.getItem(CLAVE_AUTOMATICO) || "{}");
    if (visto[motivo]) return false;
    if (visto.ultimo && Date.now() - visto.ultimo < 3 * 86400000) return false;
    localStorage.setItem(CLAVE_AUTOMATICO, JSON.stringify({ ...visto, [motivo]: Date.now(), ultimo: Date.now() }));
  } catch { return false; }
  return pedirPaywall(motivo);
}

// ── Los proveedores ─────────────────────────────────────────────────────────
// De mentira (sólo en desarrollo): compra al instante y guarda el estado en
// el localStorage. Sirve para probar el paywall, los candados y Perfil.
const deMentira = {
  nombre: "prueba",
  async iniciar() {
    try { publicar(JSON.parse(localStorage.getItem(CLAVE_ESTADO_PRUEBA) || "null") || {}); } catch { publicar({}); }
  },
  async ofertas() {
    return PLANES.map((p) => ({ ...p, precio: precioEscrito(p.precioUSD), monto: p.precioUSD, moneda: "USD", porMes: p.meses > 1 ? precioEscrito(porMesHaciaArriba(p.precioUSD, p.meses)) : null, dias: p.prueba || 0 }));
  },
  async comprar(planId) {
    const plan = PLANES.find((p) => p.id === planId);
    if (!plan) throw new Error("Ese plan no existe.");
    await new Promise((r) => setTimeout(r, 600));
    const dias = plan.prueba ? plan.prueba : plan.meses * 30;
    const e = { activo: true, plan: plan.id, enPrueba: !!plan.prueba, vence: new Date(Date.now() + dias * 86400000).toISOString(), seRenueva: true };
    try { localStorage.setItem(CLAVE_ESTADO_PRUEBA, JSON.stringify(e)); } catch { /* sin almacenamiento */ }
    publicar(e);
    return e;
  },
  async restaurar() { await this.iniciar(); return ESTADO; },
  gestionar() {
    try { localStorage.removeItem(CLAVE_ESTADO_PRUEBA); } catch { /* sin almacenamiento */ }
    publicar({});
  },
};

// RevenueCat, sobre Google Play Billing. Queda DORMIDO hasta que se instale
// su plugin (`npm i @revenuecat/purchases-capacitor` y `npx cap sync`, que
// viaja con un APK nuevo) y se cargue la clave: registerPlugin("Purchases")
// habla con el plugin nativo, con los mismos métodos de su API
// (configure, getOfferings, purchasePackage, getCustomerInfo,
// restorePurchases). Sin probar contra la tienda: ver docs/suscripcion.md.
const Purchases = registerPlugin("Purchases");
const hayRevenueCat = () => !!CLAVE_REVENUECAT && Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Purchases");
let PAQUETES = {};
function desdeCliente(info) {
  const e = info?.entitlements?.active?.[DERECHO];
  if (!e) return { activo: false };
  const id = String(e.productIdentifier || "");
  const plan = PLANES.find((p) => id.endsWith(`:${p.basePlan}`))?.id || null;
  return { activo: true, plan, enPrueba: e.periodType === "TRIAL", vence: e.expirationDate || null, seRenueva: e.willRenew ?? null };
}
const deLaTienda = {
  nombre: "revenuecat",
  async iniciar(uid) {
    await Purchases.configure({ apiKey: CLAVE_REVENUECAT, appUserID: uid || null });
    const { customerInfo } = await Purchases.getCustomerInfo();
    publicar(desdeCliente(customerInfo));
  },
  async ofertas() {
    const { current } = await Purchases.getOfferings();
    const paquetes = current?.availablePackages || [];
    PAQUETES = {};
    return PLANES.map((p) => {
      const pkg = paquetes.find((x) => x.packageType === p.tipo);
      if (!pkg) return null;
      PAQUETES[p.id] = pkg;
      const prod = pkg.product;
      // La prueba gratis la da la tienda sólo a quien no la usó: si no viene
      // la fase gratis, no se promete.
      const gratis = prod.defaultOption?.freePhase?.billingPeriod;
      const dias = gratis ? (gratis.unit === "WEEK" ? gratis.value * 7 : gratis.unit === "DAY" ? gratis.value : gratis.unit === "MONTH" ? gratis.value * 30 : 0) : 0;
      return { ...p, precio: prod.priceString, monto: prod.price, moneda: prod.currencyCode, porMes: p.meses > 1 ? precioEscrito(porMesHaciaArriba(prod.price, p.meses), prod.currencyCode) : null, dias };
    }).filter(Boolean);
  },
  async comprar(planId) {
    const pkg = PAQUETES[planId];
    if (!pkg) throw new Error("Ese plan no está disponible ahora.");
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    const e = desdeCliente(customerInfo);
    publicar(e);
    return e;
  },
  async restaurar() {
    const { customerInfo } = await Purchases.restorePurchases();
    publicar(desdeCliente(customerInfo));
    return ESTADO;
  },
  gestionar() {
    window.open(`https://play.google.com/store/account/subscriptions?sku=${PRODUCTO}&package=${PAQUETE}`, "_blank");
  },
};

export function proveedor() {
  if (modoPrueba()) return deMentira;
  if (COBRO_ACTIVO && hayRevenueCat()) return deLaTienda;
  return null;
}
// Al abrir la app (y al cambiar de cuenta): lee si esta persona es Premium.
export async function iniciarSuscripcion(uid = null) {
  const p = proveedor();
  if (!p) { publicar({}); return; }
  try { await p.iniciar(uid); } catch (e) { console.warn("[premium] no se pudo leer la suscripción:", e?.message || e); publicar({}); }
}
