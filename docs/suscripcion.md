# Modus Fit Premium: la suscripción, preparada y apagada

Preparado el 03/11/2026 en la rama `mejoras-noviembre`. La app ya tiene la suscripción con tres planes (mensual, semestral y anual), el paywall, los candados y la sección de Perfil. **El cobro está apagado por bandera**: con `VITE_COBRO_ACTIVO` sin poner (lo de hoy), nadie ve un paywall ni un candado y todo sigue gratis. Se puede publicar sin que cambie nada.

## Qué hay en el código

| Pieza | Dónde |
|---|---|
| Planes, derechos, cupo de IA, estado de Premium y proveedores | `src/suscripcion.js` |
| El paywall, el aviso del fin de la prueba y Perfil › Tu plan | `Paywall`, `avisarFinDePrueba`, `SeccionPremium` en `src/App.jsx` |
| Los candados | el cupo del Entrenador IA (`cupoDeHoy`), Planificar con IA (`onOpenIA`) e importar con foto (`leerConIA`) |
| El producto de Play, sus precios por país y sus textos | `scripts/play-suscripcion/planes.mjs` (`--json` arma lo que va a la API) |
| La prueba del circuito entero | `scripts/probar-flujos.mjs`, sección "Paywall" |

**Probarlo sin cobrar nada**: con `npm run dev`, abrí la app con `?premium=prueba` en la dirección (o poné `modusfit_premium_prueba` en `"1"` en el localStorage). Así aparecen Perfil › Tu plan y los candados, y "comprar" activa Premium al instante con un proveedor de mentira. El modo de prueba no existe en la versión publicada.

## Qué es gratis y qué es Premium

Decisión del 03/11/2026 (pedido: "que se pueda usar muy bien gratis pero que con pro se sienta la diferencia, es decir no restringir nada en el plan gratis en cuanto a funciones disponibles"):

- **Gratis, todas las funciones:** anotar, las rutinas, el historial, los récords, las gráficas, los resúmenes, el ciclo y la descarga, Social, compartir, importar (también con foto) y la IA entera: el Entrenador IA, Planificar con IA y leer una foto. Con **15 consultas por día** a la IA.
- **Premium:**
  - **sin anuncios** (los anuncios todavía no existen: se prenden con el cobro);
  - **40 consultas por día** a la IA en vez de 15.

**Por qué así.** Premium vende comodidad y más uso, no funciones. Lo que cuesta plata es la IA por pedido (cerca de US$ 0,01 por mensaje con facturación) y lo que molesta son los anuncios. Las dos diferencias se sienten sin dejar a nadie afuera de nada. Planificar con IA e importar con foto descuentan consultas como cualquier pedido a la IA. 15 por día es más de lo que usa casi cualquiera; quien la usa mucho es justo quien más cuesta, y el que más valora Premium.

Antes (la primera versión del 03/11) Planificar con IA e importar con foto eran sólo de Premium y el gratis tenía 5 consultas: se sacó. La skill de paywalls recomienda un tope que "se sienta en el hábito": con 15 casi nunca se siente, así que la diferencia la van a hacer los anuncios. Si con datos se ve que nadie llega a 15, se puede bajar.

## Las decisiones y sus fuentes

| Decisión | Por qué | Fuente |
|---|---|---|
| **Freemium**, no paywall duro | Los paywalls duros convierten unas cinco veces más a pago en 35 días (10,7 % contra 2,1 %), pero la retención anual es casi igual (27 % contra 28 %) y tienen más reembolsos (5,8 % contra 3,4 %). Freemium conviene cuando lo gratis trae gente (Social, compartir). | RevenueCat, *State of Subscription Apps* 2025 y 2026 (vía [Airbridge](https://www.airbridge.io/en/blog/hard-paywall-vs-freemium-2026) y la skill `paywalls`) |
| **Tres planes**, el **anual primero y elegido** | En Salud y fitness el anual trae el 62 % de los ingresos. Elegir el anual de entrada no baja la conversión. Que sean tres es el pedido; ojo: con dos duraciones la conversión es un 67 % más alta, y sumar productos ganó sólo el 53 % de las pruebas A/B. Es lo primero para probar. | Adapty, [*State of Paywalls* 2026](https://adapty.io/state-of-paywalls/report/) |
| **7 días gratis, sólo en el anual** | En Salud y fitness, las pruebas de 5 a 9 días convierten mejor (46,8 %) que las de 10 a 16 (40,4 %). La prueba en el plan anual es el patrón de las apps de suscripción. El mensual y el semestral, sin prueba. | RevenueCat, [Free trial length](https://www.revenuecat.com/blog/growth/free-trial-length) (17.000 apps, 2025-2026); skill `paywalls` |
| **El precio que se cobra, grande; el mensual equivalente, chico y aparte** | Google Play marca como infracción "un precio mensual desglosado mostrado más destacado que el monto que se cobra", y pide no mostrar como mensual un plan que se cobra por año. El anual dice "US$ 17,99 por año" y, debajo, "US$ 1,50 por mes". El equivalente se redondea para arriba (nunca más barato de lo que es). | [Política de suscripciones de Google Play](https://support.google.com/googleplay/android-developer/answer/9900533) |
| **"Ahorrás 49 %" y no "Más popular"** | El ancla se hace eligiendo el anual y con su ahorro real, calculado contra pagar mes a mes y redondeado para abajo. "Más popular" sería afirmar algo sin datos, y Play prohíbe las compras engañosas. Cuando RevenueCat muestre que el anual es el más elegido, se puede probar "El más elegido" contra "Ahorrás N %". | Play (arriba); [Superwall](https://superwall.com/solutions/price-testing-optimization) sugiere probar las dos insignias |
| **Antes de pagar, todas las condiciones** | Cuánto dura la prueba, cuánto se cobra después, que se renueva sola y cómo se cancela, sin pasos extra para leerlo. Además: "Restaurar compras", términos y privacidad, y "Seguir gratis" siempre a la vista. | Política de Play (arriba); checklist de la skill `paywalls` |
| **Aviso dos días antes de que termine la prueba** | Las renovaciones sorpresa traen reembolsos, malas reseñas y contracargos. Google además manda un mail. | skill `paywalls`, referencia de apps de suscripción |
| **Cuándo aparece el paywall** | Al quedarse sin consultas de IA, al tocar algo de Premium, desde Perfil y una sola vez después del primer entrenamiento terminado (el ticket). Nunca dos automáticos en menos de tres días. | skill `paywalls`: "valor antes de pedir", "respetar el no" |
| **Precios por país** | Paridad de poder adquisitivo: Argentina al 30 % del precio de EE. UU., México al 45 %, España al 70 % (tabla abajo). En Salud y fitness, el anual típico es US$ 29,99. En América Latina el anual baja a US$ 30,11 contra US$ 39,99 en EE. UU. | skill `gplay-ppp-pricing`; Adapty 2026 |
| **US$ 2,99, 11,99 y 17,99** (bajados el 03/11, pedido: "baja el precio bastante") | Por debajo de la competencia a propósito, para la primera etapa: Hevy cobra US$ 2,99 por mes y US$ 23,99 por año; Strong, US$ 4,99, 19,99 y 29,99; el anual típico de la categoría es US$ 29,99 (Adapty). Se mantienen las proporciones (el anual ahorra 49 % y el semestral 33 %). Antes eran US$ 4,99, 19,99 y 29,99. Subir más adelante es posible para los nuevos sin tocar a los que ya pagan. | [App Store de Strong](https://apps.apple.com/app/id464254577); [comparación de precios 2026](https://www.sensai.fit/blog/fitness-app-pricing-free-tier-comparison) |
| **RevenueCat**, no Play Billing a mano | Valida las compras en su servidor, maneja derechos, período de gracia y retenciones, avisa por webhook, hace pruebas de paywall y sirve para iOS más adelante. Tiene plugin oficial para Capacitor. Es gratis hasta US$ 2.500 de ingresos por mes y después cobra el 1 %. A mano habría que validar cada compra en `api/` con la cuenta de servicio (skill `gplay-purchase-verification`). | skill `rc-subscriptions`; [plugin](https://github.com/RevenueCat/purchases-capacitor); precios de RevenueCat (varias fuentes de 2026) |
| **La comisión de la tienda** | Las suscripciones pagan un 15 % en Google Play: en EE. UU., Reino Unido y el Espacio Económico Europeo, desde el 30/06/2026, son 10 % de servicio y 5 % de cobro. | skill `paywalls` (Android Developers Blog, junio 2026) |

## Precios por país (precio equivalente en dólares)

Salen de `node scripts/play-suscripcion/planes.mjs`. Play pone la moneda local con `monetization.convertRegionPrices` al cargarlos.

| País | Mensual | Semestral | Anual | Anual por mes |
|---|---|---|---|---|
| EE. UU. | 2,99 | 11,99 | 17,99 | 1,50 |
| España | 1,99 | 7,99 | 12,99 | 1,09 |
| Chile, Uruguay | 1,99 | 6,99 | 10,99 | 0,92 |
| Brasil | 1,99 | 5,99 | 8,99 | 0,75 |
| México | 0,99 | 4,99 | 7,99 | 0,67 |
| Colombia, Perú | 0,99 | 4,99 | 6,99 | 0,59 |
| Argentina | 0,99 | 3,99 | 4,99 | 0,42 |

Con los precios más bajos el redondeo al ,99 pesa: en México el mensual queda en 0,99 y el anual ahorra 32 %, en Brasil 62 %. Al cargarlos en Play conviene revisar país por país que el anual ahorre entre 40 y 55 %.

En la app no hay ningún precio escrito a mano: muestra los que devuelve la tienda para cada persona. Los de `src/suscripcion.js` son sólo para el modo de prueba.

## Cuánto puede dejar (una estimación para reemplazar con datos)

`ingreso por descarga = inicio de prueba × prueba a pago × precio anual × (1 − comisión)` (skill `paywalls`).

En América Latina, Salud y fitness tiene un 1,46 % de inicios de prueba por vista del paywall y entre 19,8 % y 33,3 % de prueba a pago (Adapty 2026). La mediana de prueba a pago en la categoría es del 39,9 % (RevenueCat 2025).

Con un anual de US$ 4,99 en Argentina, el ingreso por descarga queda en centavos. El cobro sirve para cubrir la IA de quien la usa mucho, no como negocio grande al principio. Hay que medirlo en las primeras semanas.

## Quien ya usa la app

Prender el cobro le baja el cupo de la IA de 25 a 15 consultas por día a quien ya la usa (y le suma anuncios): para esas personas es una suba de precio. La skill `pricing` dice tres cosas para hacerlo sin romper la confianza:

- avisar con tiempo, adentro de la app, y explicar por qué (la IA cuesta por uso);
- dar una transición y no un corte: por ejemplo, 30 días con el cupo de siempre para las cuentas creadas antes de prender el cobro, o el anual con un descuento único;
- empezar por las personas nuevas, que no tienen un precio de referencia.

Eso se decide al prenderlo y todavía no está en el código.

La métrica de valor está bien elegida: quien usa más la IA saca más de Premium, y el cupo crece con eso. Los precios bajos por país son paridad de poder adquisitivo, no la "trampa del precio bajísimo" de la skill. El precio de referencia (US$ 17,99 por año) está por debajo del típico de la categoría (US$ 29,99), a propósito para la primera etapa.

## Cuándo prenderlo: a las 1000 descargas

Decisión del 03/11/2026: el cobro y los anuncios se prenden **juntos, al llegar a las 1000 descargas**. Hasta ahí la app sigue toda gratis y sin anuncios, para ganar usuarios y reseñas.

**Los anuncios** (AdMob, la cuenta ya está creada) todavía no están hechos. Cuando se hagan: banner o intersticial sólo fuera del entrenamiento (nunca con una sesión abierta ni en el descanso), y sólo si `mostrarAnuncios(esPremium)` de `src/suscripcion.js` da verdadero. Premium los saca: con `VITE_ANUNCIOS_ACTIVOS=1`, el paywall suma "Sin anuncios" y el producto de Play ya lo trae como cuarto beneficio. Sin anuncios en la app, el paywall no lo promete. Prender anuncios pide también: el SDK en un APK nuevo, el ID de publicidad (`AD_ID`) de vuelta en el manifiesto, "Contiene anuncios" en Play Console, la declaración de datos y la política.

**La IA, hasta las 1000 descargas, con la cuota gratis de Gemini** (decisión del 03/11/2026: "lanzarla con esta limitación y, superado un monto de descargas, pasar al plan pago en simultáneo con los anuncios para no perder dinero"). La cuota gratis es de todo el proyecto, unas 250 consultas por día de Flash y 1.000 de Flash-Lite, y se renueva a la medianoche de California (las 4 o las 5 de la mañana en Argentina). Para que alcance para más gente:

- cada persona tiene **10 consultas por día** (`IA_CUPO_LANZAMIENTO`; antes 25): alcanza para unas 125 personas que la usen mucho;
- cuando se termina la cuota de todos, el servidor contesta `503` con `sinCupoGlobal` y la hora en que vuelve (`proximaMedianochePacifico`); la app **no descuenta esa consulta** y avisa "Vuelve a las 5:00", en la hora del teléfono (`fetchIA`, `devolverCupoIA`);
- detrás de Flash y Flash-Lite quedan los Gemma de respaldo para los pedidos cortos (crear una rutina).

**El paso de las 1000 descargas, todo junto** (para no pagar la IA sin que entre plata):

1. Facturación en la clave de Gemini (Google AI Studio › Plan de pago) con una alerta de presupuesto.
2. En Vercel, las variables `VITE_IA_PAGA=1` (vuelven las 25 consultas por día, o el cupo de Premium), `VITE_COBRO_ACTIVO=1` y `VITE_ANUNCIOS_ACTIVOS=1`, y volver a publicar.
3. En `scripts/play-datos/declaracion.mjs`, `GEMINI_GRATIS = false`, y `npm run play -- datos --enviar`: con facturación, Google ya no usa lo que se le manda para mejorar sus servicios.
4. En la política (`public/privacy-policy.html` y el modal de Perfil), sacar la frase del plan gratuito de Gemini y sumar el cobro y los anuncios; en la ficha, `VITE_COBRO_ACTIVO=1 node scripts/ficha-play/subir-ficha.mjs …`.
5. Los pasos de "Para prenderlo", más abajo: el producto en Play y RevenueCat, el SDK en un APK nuevo y AdMob.

**Qué medir antes**: con 1000 descargas, la retención a 30 días y cuántos usan la IA por día dicen si el cupo de 5 gratis está bien, y cuánto cuesta la IA por usuario. Hasta el 03/11/2026 no había medición de descargas en la app: se ven en Play Console (`npm run play -- estado` no las trae).

## Para prenderlo

1. **Play Console**: crear la suscripción con `node scripts/play-suscripcion/planes.mjs --json`. Primero el producto y sus tres planes base, después la oferta `prueba-7-dias` sobre el anual. Los precios por país van con `convertRegionPrices`. Los ids son permanentes: no crear productos "de prueba" con estos nombres.
2. **RevenueCat**:
   - un proyecto con la app de Android y la cuenta de servicio de Play (necesita ver los datos financieros y administrar pedidos);
   - el derecho `premium`;
   - la oferta `default` con los paquetes mensual, semestral y anual apuntando a los tres planes base;
   - las notificaciones en tiempo real de Play (Pub/Sub).
3. **La app**:
   - `npm i @revenuecat/purchases-capacitor` y `npx cap sync android`. Es nativo, así que va con una versión nueva en Play (subir `versionCode`).
   - En Vercel, `VITE_REVENUECAT_ANDROID` (la clave pública `goog_…`) y `VITE_COBRO_ACTIVO=1`.
   - Probar con cuentas de prueba de licencias (Play Console › Pruebas de licencias) en la prueba cerrada.
4. **El servidor**: hoy el cupo de la IA se cuenta en el teléfono. Con el cobro prendido, `api/ia.js` tiene que validar el cupo por cuenta: 25 con Premium, 5 sin. Se puede hacer de dos formas:
   - consultar a RevenueCat (`GET /v1/subscribers/{uid}` con la clave secreta, en una variable de Vercel);
   - recibir su webhook y guardar `premium` en `users/{uid}` (con una regla de Firestore que no deje escribirlo desde la app).
5. **Gemini con facturación**: Premium promete 25 consultas por día, y el plan gratis de Gemini ya se agotaba el 02/11. Al activarla, `GEMINI_GRATIS = false` en `scripts/play-datos/declaracion.mjs` y en la política.
6. **Lo legal, antes de prender**:
   - **La política** (`public/privacy-policy.html` y el modal de Perfil): el punto "Anuncios y pagos" hoy dice que la app es gratis. Tiene que contar que hay una suscripción opcional que cobra Google Play y que RevenueCat procesa el estado de la compra.
   - **Los términos** (`public/terminos.html`): la renovación automática, cómo cancelar y los reembolsos según Google Play.
   - **La declaración de datos** (`scripts/play-datos/declaracion.mjs`, `npm run play -- datos --enviar`): sumar "Información financiera › Historial de compras", recopilado y no compartido (RevenueCat es un proveedor del servicio).
7. **La ficha de Play** (el borrador está abajo): la larga tiene que distinguir lo gratis de lo pago, como pide Play.

## Borrador de la ficha de Play

El título y la corta no cambian: llevan las búsquedas que hoy posicionan ("rutinas de gimnasio", "registro de entrenamiento") y Play no deja poner "gratis" en el título. La larga (`scripts/ficha-play/textos.mjs`) cambia en tres lugares. Va en es-419 (con vos); es-ES y es-US con tú:

- En "Un plan que progresa…": «• Con Premium, pedile a la IA que planifique tu bloque de fuerza o de hipertrofia.»
- En "Rutinas de gimnasio…": «• Importá la rutina de tu profe desde un PDF, un Excel o un Word; con Premium, también desde una foto.»
- El cierre: «Gratis y sin anuncios: anotar, tus rutinas, el historial, los récords y Social no se pagan. Modus Fit Premium es opcional, con 7 días gratis en el plan anual: suma 25 consultas por día al Entrenador IA, Planificar con IA e importar con una foto. Funciona sin cuenta, y si entrás con Google tus datos también se guardan en la nube, para no perder nada si cambiás de celular.»

El producto (`scripts/play-suscripcion/planes.mjs`): el nombre también indexa en la búsqueda de Play, por eso lleva "entrenador con IA".

- **Nombre** (39 de 55): «Modus Fit Premium: tu entrenador con IA».
- **Descripción** (76 de 80): «Más IA para tu entrenamiento: consultas, planificación e importar con foto.»
- **Beneficios** (4 de 4): «25 consultas por día al Entrenador IA», «Planificá tu progresión con IA», «Importá rutinas con una foto», «Lo gratis sigue gratis».

Palabras que conviene que aparezcan de forma natural en la larga, sin repetirlas de más: rutinas de gimnasio, registro de entrenamiento, entrenador personal con IA, planificador de entrenamiento, progresión de cargas, sobrecarga progresiva.

## Para probar después (con RevenueCat Experiments)

1. Dos planes (anual y mensual) contra tres.
2. Paywall al terminar la bienvenida contra después del primer entrenamiento. Adapty mide que el de la bienvenida convierte unas cuatro veces más (0,85 % contra 0,23 % de las vistas). Acá se eligió esperar al primer entrenamiento, para no pedir plata antes de mostrar valor.
3. Prueba de 7 días contra 3.
4. "Ahorrás N %" contra "El más elegido", cuando haya datos.

## Fuentes

- RevenueCat. [Free trial length](https://www.revenuecat.com/blog/growth/free-trial-length) (17.000+ apps, 2025-2026) y [State of Subscription Apps 2025](https://revenuecat.com/state-of-subscription-apps-2025).
- Adapty. [State of Paywalls 2026](https://adapty.io/state-of-paywalls/report/).
- Airbridge. [Hard paywall vs freemium (2026)](https://www.airbridge.io/en/blog/hard-paywall-vs-freemium-2026), con los datos de RevenueCat 2026.
- Google Play. [Política de suscripciones](https://support.google.com/googleplay/android-developer/answer/9900533).
- Superwall. [Price testing](https://superwall.com/solutions/price-testing-optimization) y [Sell annual plans as monthly installments](https://api.superwall.me/solutions/sell-annual-plans-as-monthly-installments).
- Precios de la competencia: [Strong en el App Store](https://apps.apple.com/app/id464254577) y la [comparación de precios de apps de fitness 2026](https://www.sensai.fit/blog/fitness-app-pricing-free-tier-comparison) (Hevy, Strong y otras).
- RevenueCat para Capacitor: [purchases-capacitor](https://github.com/RevenueCat/purchases-capacitor) (los tipos `PurchasesOffering`, `PurchasesPackage` y `CustomerInfo` que usa `src/suscripcion.js`).
- Skills: `paywalls` (y su referencia de apps de suscripción), `pricing`, `rc-subscriptions`, `aso`, `gplay-iap-setup`, `gplay-ppp-pricing` y `gplay-purchase-verification`.
