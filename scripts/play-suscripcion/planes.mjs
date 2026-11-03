#!/usr/bin/env node
/**
 * La suscripción de Modus Fit Premium para Google Play, lista para crear
 * cuando se prenda el cobro (docs/suscripcion.md, "Para prenderlo"). No sube
 * nada: arma el JSON de la API (monetization.subscriptions) y lo revisa.
 *
 *   node scripts/play-suscripcion/planes.mjs          (resumen y revisión)
 *   node scripts/play-suscripcion/planes.mjs --json   (el JSON para la API)
 *
 * Los ids de Play son permanentes: un producto o un plan base borrado no se
 * puede volver a crear con el mismo id (skill gplay-iap-setup). Por eso van
 * acá, decididos una vez: el producto `modus_premium`, los planes base
 * `mensual`, `semestral` y `anual`, y la oferta `prueba-7-dias` (sólo en el
 * anual, para quien nunca la usó). Tienen que coincidir con src/suscripcion.js.
 *
 * Los precios: la referencia en dólares y, por país, la paridad de poder
 * adquisitivo de la skill gplay-ppp-pricing (al .99 más cercano).
 * Son el precio en dólares equivalente: la moneda local la pone Play con
 * monetization.convertRegionPrices al cargarlos.
 */
const PRODUCTO = "modus_premium";
const PLANES = [
  { basePlanId: "mensual", periodo: "P1M", usd: 4.99 },
  { basePlanId: "semestral", periodo: "P6M", usd: 19.99 },
  { basePlanId: "anual", periodo: "P1Y", usd: 29.99, oferta: { offerId: "prueba-7-dias", fase: { duration: "P7D", pricingType: "FREE_TRIAL" } } },
];
// Multiplicadores de la skill gplay-ppp-pricing para los países donde está la
// ficha en español (y Brasil, el mercado grande de la región). Perú y Uruguay
// no están en su tabla: van con el de los vecinos.
const PPP = { US: 1, ES: 0.7, CL: 0.6, UY: 0.6, BR: 0.5, MX: 0.45, CO: 0.4, PE: 0.4, AR: 0.3 };
function redondear99(x) {
  // Al .99 más cercano (4,73 → 4,99; 13,99 → 13,99; 2,25 → 1,99).
  const arriba = Math.floor(x) + 0.99, abajo = arriba - 1;
  return Math.round((abajo > 0 && x - abajo < arriba - x ? abajo : arriba) * 100) / 100;
}
export const PRECIOS = Object.fromEntries(Object.entries(PPP).map(([pais, m]) => [pais, Object.fromEntries(PLANES.map((p) => [p.basePlanId, redondear99(p.usd * m)]))]));

// Los textos del producto en la tienda (título 55, descripción 80, hasta 4
// beneficios). es-419 con vos, como la app; es-ES y es-US con tú. El nombre
// del producto también indexa en Play (skill aso): lleva "entrenador con IA".
const BENEFICIOS_VOS = ["25 consultas por día al Entrenador IA", "Planificá tu progresión con IA", "Importá rutinas con una foto", "Lo gratis sigue gratis"];
const BENEFICIOS_TU = ["25 consultas al día al Entrenador IA", "Planifica tu progresión con IA", "Importa rutinas con una foto", "Lo gratis sigue gratis"];
export const LISTADOS = [
  { languageCode: "es-419", title: "Modus Fit Premium: tu entrenador con IA", description: "Más IA para tu entrenamiento: consultas, planificación e importar con foto.", benefits: BENEFICIOS_VOS },
  { languageCode: "es-ES", title: "Modus Fit Premium: tu entrenador con IA", description: "Más IA para tu entrenamiento: consultas, planificación e importar con foto.", benefits: BENEFICIOS_TU },
  { languageCode: "es-US", title: "Modus Fit Premium: tu entrenador con IA", description: "Más IA para tu entrenamiento: consultas, planificación e importar con foto.", benefits: BENEFICIOS_TU },
];

// La suscripción (monetization.subscriptions.create) y, aparte, sus ofertas
// (monetization.subscriptions.basePlans.offers.create): en Play la oferta de
// prueba se crea sobre el plan base ya creado.
export function producto() {
  const precio = (usd) => { const [u, c = "0"] = usd.toFixed(2).split("."); return { currencyCode: "USD", units: u, nanos: Number(c) * 10000000 }; };
  return {
    suscripcion: {
      packageName: "com.modusfit.fitness",
      productId: PRODUCTO,
      listings: LISTADOS,
      basePlans: PLANES.map((p) => ({
        basePlanId: p.basePlanId,
        state: "ACTIVE",
        autoRenewingBasePlanType: { billingPeriodDuration: p.periodo, gracePeriodDuration: "P3D", resubscribeState: "RESUBSCRIBE_STATE_ACTIVE" },
        // Los de cada país se completan con convertRegionPrices a partir de PRECIOS.
        regionalConfigs: [{ regionCode: "US", newSubscriberAvailability: true, price: precio(p.usd) }],
      })),
    },
    ofertas: PLANES.filter((p) => p.oferta).map((p) => ({
      basePlanId: p.basePlanId,
      offerId: p.oferta.offerId,
      state: "ACTIVE",
      phases: [{ duration: p.oferta.fase.duration, regionalConfigs: [{ regionCode: "US", free: {} }] }],
      // Sólo para quien nunca tuvo esta suscripción: la prueba es una vez.
      targeting: { acquisitionRule: { scope: { specificSubscriptionInApp: PRODUCTO } } },
      offerTags: [{ tag: "prueba" }],
    })),
  };
}

export function revisar() {
  const fallas = [];
  LISTADOS.forEach((l) => {
    if (l.title.length > 55) fallas.push(`${l.languageCode} título: ${l.title.length} (máximo 55)`);
    if (l.description.length > 80) fallas.push(`${l.languageCode} descripción: ${l.description.length} (máximo 80)`);
    if (l.benefits.length > 4) fallas.push(`${l.languageCode}: ${l.benefits.length} beneficios (máximo 4)`);
    l.benefits.forEach((b) => { if (b.length > 40) fallas.push(`${l.languageCode} beneficio largo (${b.length}): ${b}`); });
  });
  return fallas;
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("play-suscripcion/planes.mjs")) {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(producto(), null, 2));
  } else {
    console.log(`Producto ${PRODUCTO}: ${PLANES.map((p) => `${p.basePlanId} (${p.periodo}, US$ ${p.usd})`).join(", ")}`);
    console.log("Prueba: 7 días gratis en el anual, sólo para quien nunca la usó.\n");
    console.log("Precio equivalente en dólares por país (paridad de poder adquisitivo):");
    console.log("país   mensual  semestral  anual   anual por mes  ahorro del anual");
    for (const [pais, p] of Object.entries(PRECIOS)) {
      const porMes = Math.ceil((p.anual / 12) * 100) / 100;
      const ahorro = Math.floor((1 - p.anual / (p.mensual * 12)) * 100);
      console.log(`${pais.padEnd(6)} ${String(p.mensual).padEnd(8)} ${String(p.semestral).padEnd(10)} ${String(p.anual).padEnd(7)} ${String(porMes).padEnd(14)} ${ahorro} %`);
    }
    const fallas = revisar();
    console.log(fallas.length ? `\nRevisar:\n  ${fallas.join("\n  ")}` : "\nLos textos entran en los límites de Play.");
    process.exit(fallas.length ? 1 : 0);
  }
}
