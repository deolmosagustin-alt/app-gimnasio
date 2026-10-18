# Notas para Claude

## Diseño: qué skill usar

Hay 29 skills en `.claude/skills/`, que es donde las lee Claude Code: 19 de diseño y 10 de funcionalidad (tabla más abajo). Quince de diseño también están en `.agents/skills/`, la carpeta que usan otros agentes. Usá **una por tarea**: varias se contradicen. Por ejemplo, `design-taste-frontend` prohíbe gradientes, glassmorphism y sombras, y `redesign-existing-projects` los recomienda.

| Para | Skill |
|---|---|
| Mejorar las pantallas de la app (casi todo el trabajo) | `redesign-existing-projects`, y antes de entregar el checklist de `ui-ux-pro-max` (`references/pro-rules.md`) |
| Dirección visual general: paleta, tipografía, criterio | `frontend-design`, o `ui-ux-pro-max` con `--design-system` |
| Auditoría de accesibilidad y experiencia de uso | `web-design-guidelines` sobre el código; `design:accessibility-review` para WCAG AA (contraste, tamaño de toque, lector de pantalla) |
| Crítica de una pantalla: jerarquía, usabilidad, consistencia | `design:design-critique` (con capturas de `npm run capturas`) |
| Textos de la app: botones, errores, estados vacíos, bienvenida | `design:ux-copy` |
| Revisar que colores, espaciados y componentes sean coherentes | `design:design-system` |
| Pulir una pantalla ya hecha: estados vacíos, errores, casos borde, movimiento | `impeccable` |
| Página pública o landing (no pantallas de app) | `design-taste-frontend` (la v1 y la v2-experimental son versiones viejas) |
| Una estética puntual | `minimalist-ui`, `industrial-brutalist-ui` o `high-end-visual-design`, una sola |
| Diseñar a partir de imágenes generadas | `image-to-code`, `imagegen-frontend-mobile`, `imagegen-frontend-web`, `brandkit`: generan con `npm run imagen` |
| Un DESIGN.md para Google Stitch | `stitch-design-taste` |
| Diseñar en el canvas de superdesign.dev | `superdesign` |
| Landings con animaciones GSAP | `gpt-taste` |
| Que no se recorte código largo | `full-output-enforcement` |

## Funcionalidad: qué skill usar

| Para | Skill |
|---|---|
| Escribir o revisar componentes React, rendimiento, re-renders | `vercel-react-best-practices` |
| Consultas, modelo de datos e índices de Firestore | `firebase-firestore` |
| Login y cuentas | `firebase-auth-basics` |
| Revisar `firestore.rules` antes de cambiarlas | `firebase-security-rules-auditor` |
| Probar un flujo de punta a punta en el navegador | `webapp-testing` (Playwright, con `npm run dev`) |
| La app de Android: configuración y plugins de Capacitor | `capacitor-best-practices` |
| Pantalla en blanco, cuelgues o plugins que fallan en el celular | `debugging-capacitor` |
| Contenido tapado por el notch, la barra de estado o la de gestos | `safe-area-handling` |
| Lector de pantalla y tamaño de letra del sistema en el celular | `capacitor-accessibility` |
| Buscar una skill que todavía no está | `find-skills` (`npx skills find <tema>`) |

Las que empiezan con `design:` (y las `engineering:` y `marketing:`) no están en el repo: son plugins de la cuenta de claude.ai y se actualizan solos. Para bugs sirven `engineering:debug` y `engineering:code-review`.

No edites el contenido de las skills del repo: se actualizan desde sus repos con `npx skills update`. En Windows quedan copiadas y no enlazadas, así que si una no se actualiza, reinstalala con `npx skills add <repo> -s <skill> -a claude-code -y` (los repos están en `skills-lock.json`).

## Herramientas

- **`npm run capturas`**: capturas de las pantallas reales en celular (login, primera rutina, armar semana, bienvenida, las cinco pestañas y perfil). `-- --escritorio` suma 1440 px, `-- --safari` usa WebKit, `-- --carpeta antes` para comparar antes y después. Crea un perfil local en un navegador descartable y levanta su propio Vite; no toca Firebase. Quedan en `.taste-skill/capturas/`.
  - `-- --datos` carga seis semanas de entrenamiento, medidas y el Social de muestra, y suma un ejercicio abierto, las secciones de Progreso (con la cintura en Medidas), Actividad y Ranking de Social, y el Balance de Rutinas. Para diseñar casi todo conviene usarlo: sin datos, Progreso y Social se ven vacíos.
  - `-- --claro` saca las pestañas en modo claro; `-- --ancho 320`, en un celular angosto, para ver si algún texto se corta.
  - La captura de página completa (`-completa.png`) esconde la barra de pestañas, que si no queda pegada en el medio.
- **Social de muestra** (sólo en desarrollo): con `modusfit_demo_social` en `"1"` en el localStorage (lo pone `--datos`), `src/social.js` contesta con los cinco amigos de `src/social-demo.js` en vez de ir a Firestore. Esas ramas van detrás de `import.meta.env.DEV`, así que no viajan en la versión publicada. Si sumás una función de Social que lee Firestore, agregale su rama.
- **`npm run imagen -- "<pedido>"`**: genera una imagen con Gemini (Nano Banana) para las skills de imágenes. Opciones: `--formato 16:9`, `--tamano 2K`, `--ref <captura>` para partir de una pantalla actual, `--modelos`. Necesita `GEMINI_IMAGEN_API_KEY` en `.env.local`, de un proyecto **con facturación**: la generación de imágenes no tiene cupo gratis (unos US$0,03 por imagen). La clave gratis de la app no sirve, y usarla le comería la cuota a los usuarios. Quedan en `.taste-skill/imagenes/`.
- **`ui-ux-pro-max`**: su SKILL.md llama al buscador con `${CLAUDE_PLUGIN_ROOT}`, que acá no existe porque no es un plugin. Correlo desde la raíz: `python .claude/skills/ui-ux-pro-max/scripts/search.py "<consulta>" --design-system`.
- **`design-taste-frontend`**: `inspect.mjs` necesita una URL (con `npm run dev`, `http://localhost:5173`). Si le pasás `dist/index.html` sirve la raíz del repo y la app queda en blanco. Para las pantallas de adentro, `npm run capturas`. Su `lint.mjs` está pensado para landings: en la app marca cientos de fallas que no aplican.
- **`superdesign`**: necesita la cuenta del usuario, una vez: `npx --yes @superdesign/cli@latest login`. Cada generación gasta créditos, y la skill sube partes del código a superdesign.dev para diseñar.

## Carpetas con documentación y el CSS

Tailwind escanea todo el repo buscando clases, salvo lo que ignora git. `src/index.css` excluye `.agents` y `.claude` con `@source not`, porque las skills traen ejemplos de clases que terminaban en el CSS de producción. Si sumás otra carpeta con documentación así, excluila también: el CSS de producción pesa 99 KB, y si sube sin que cambie la app, es eso. ESLint también ignora esas carpetas (`eslint.config.js`).

## Sistema visual: "Grafito"

Antes de diseñar algo nuevo, mirá lo que ya hay. Vive en tres lugares:

- **`src/index.css`** (`@theme`): la fuente, la escala `slate` de Tailwind (grafito neutro), los acentos de Tailwind con la mitad de croma (el `teal` es gris tiza) y las esquinas. Cambiar ahí cambia todas las pantallas.
- **`src/fuente.css`**: Mona Sans empaquetada (peso y ancho), sólo latín y latín extendido.
- **`ANIMATION_CSS` en `src/App.jsx`**, bloque "SISTEMA VISUAL" al final: los tokens (`--surface-1/2/3`, `--hairline`, `--panel-sunken`, `--text-strong/muted/faint`, `--accion-fondo/tinta`, `--velo`, `--velo-fuerte`, `--hairline-fuerte`, `--brillo`, `--placa-canto`, `--record`) con su versión en `.light-mode`, y las piezas: la isla de abajo, el dock, los cronómetros, los días, la serie y la barra cargada.

Las reglas:

- **Color en puntos estratégicos, y suave:** las superficies son siempre neutras (la jerarquía la hace la luz); el color va en lo que se toca y en lo que identifica, nunca de fondo de una pantalla. El usuario pidió "toques de color en puntos estratégicos, no chillones": el botón principal y lo elegido usan el color de lo que mirás en versión pastel (`--accion-fondo`, con letra `--accion-tinta`, o `color-mix(in oklab, var(--c, var(--tono)) 72%, white)` si el elemento tiene color propio), lo tonal es ese color al 13% (`.boton-tonal`, `.icono-galleta`), arriba de cada pantalla hay una luz tenue de ese color (`.app-fondo`), y llevan color los discos de la barra, el arco del reloj, la línea de las gráficas y las marcas de cada día. Los acentos de Tailwind van al 70% de su croma (index.css) y `tint()` (utils.js) mezcla el color mitad y mitad con gris. El dorado (`--record`) es sólo para los récords.
- **Nada de color escrito a mano:** ni degradés de color en un botón (`linear-gradient(135deg,#14B8A6,…)`) ni `!text-white` sobre un fondo: un botón principal es `.boton-pildora` o `background: var(--accion-fondo)` con `text-[color:var(--accion-tinta)]`.
- **Letras:** Mona Sans. Números grandes con `num-display` (angostos, `font-stretch`). Sus cifras tabulares son su corte monoespaciado (cero tachado), así que están apagadas en toda la app (`font-feature-settings: "tnum" 0` en `html`): no las vuelvas a prender. Sin mayúsculas sostenidas: `.uppercase` no transforma.
- **Placas:** los contenedores (`.tarjeta-tonal`, `.seccion-plegable`, `.ejercicio`, `.dia-hero`) son placas de grafito con `box-shadow: var(--placa-canto)` (el canto de 1px y el brillo de arriba). Sin bordes de color. Botones en píldora (`.boton-pildora`, `.boton-tonal`, `.boton-redondo`) y rieles con la elegida en tiza (`.selector-dias`, `.pestanas-internas`, `.segmentado`). La galleta (`.galleta`) es ahora un círculo: la forma de lo completado.
- **La serie:** una sola en foco por ejercicio: una línea arriba (serie, rango y récord o meta), el visor (`.foco-visor`: reps × kilos grandes y angostos, y el ✓) y debajo de cada número su − y su +. Lo de la vez pasada no se repite: viene escrito en el visor. Las demás series son renglones finos (`.serie-linea`). Antes de sumarle algo a la serie, pensá qué sacás.
- **La barra cargada** (`BarraCargada`) es la pieza propia: un disco por serie, de goma de color mate (los colores de competición, apagados con gris) y con su tamaño real; los collarines llevan el color del día. No inventes otra barra de progreso; la onda (`Onda`) es sólo para la espera del descanso.
- **Objetos en vez de números:** antes de mostrar un número suelto, una lista de cajas o un párrafo, fijate si ya lo dice una de las piezas del gimnasio: `Cadena` (rachas), `BalanzaCursor` (peso: hoy contra el inicio), `CintaMetrica` (medidas en cm), la escalera del ciclo (`.escalera-ciclo`) y la de récords (Ejercicios), la tarjeta perforada (`.tarjeta-perforada` con `.hueco-dia`, para calendarios), `CarnetSocio` (Perfil), `CarreraSemana` (Social: quién lleva más sesiones esta semana, cada uno en su carril), `DiasRutina` (Rutinas: los días como baldosas; `RoutinePreview` usa las mismas baldosas para la rutina que propone la IA, la que importás o la que te comparten), `BarraEquilibrio` (Rutinas) y `SemanaPerforada`. El descanso es el reloj de pared (`DialDescanso`: el bisel de marcas, el arco con lo que falta y la aguja; tocarlo pausa). Viven en el bloque "PIEZAS DEL GIMNASIO" de `src/App.jsx`: los componentes antes de "LA BARRA CARGADA" y los estilos al final de `ANIMATION_CSS`. Si hace falta una nueva, que sea un objeto que cualquiera que entrena reconozca sin leer. Lo que propone el Entrenador IA va en una placa `.plan-ia` (`.plan-ia.aviso` si no se pudo resolver), con los botones de siempre.
- **Colores de rango como texto:** con `.tinta-rango` y `--rango-c`, que los apaga (y en modo claro los oscurece). Plata y oro claro, tal cual, no se leen sobre fondo claro.
- **Movimiento:** los resortes (`--resorte`) sólo para lo que responde a un toque. Motion (`m.div`, que carga diferido con `LazyMotion`) para reacomodar listas; NumberFlow (`RelojQueGira`) para relojes y contadores. Todo respeta "reducir movimiento".
- **Sin manchas borrosas:** nada de círculos con `blur` detrás de los paneles. Una regla global las apaga en las pantallas y las deja sólo en los modales de festejo. El desenfoque de fondo (`backdrop-filter`) va sólo en lo fijo: la isla de abajo, el dock y la barra de arriba.
- **Nada oscuro fijo en estilos en línea:** un fondo como `rgba(5,7,11,…)` se ve como una mancha en modo claro. Usá un token. `SOCIAL_INK` es la variable `--social-tinta`, que tiene su versión clara.
- **Palabras enteras:** en lugares angostos (solapas de días, chips, el nombre del día) no partas palabras ni las cortes con "…". Para los días: `etiquetaDeDia` + `.dia-solapa-texto`, que ajustan la letra a la palabra más larga. Revisalo con `npm run capturas -- --datos --ancho 320`.
