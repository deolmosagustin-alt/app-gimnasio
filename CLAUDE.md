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
| Página pública o landing (no pantallas de app) | `design-taste-frontend` (la v1 y la v2-experimental son versiones viejas) |
| Una estética puntual | `minimalist-ui`, `industrial-brutalist-ui` o `high-end-visual-design`, una sola |
| Diseñar a partir de imágenes generadas | `image-to-code`, `imagegen-frontend-mobile`, `imagegen-frontend-web`, `brandkit`: generan con `npm run imagen` |
| Un DESIGN.md para Google Stitch | `stitch-design-taste` |
| Diseñar en el canvas de superdesign.dev | `superdesign` |
| Landings con animaciones GSAP | `gpt-taste` |
| Que no se recorte código largo | `full-output-enforcement` |

Las que empiezan con `design:` (y las `engineering:` y `marketing:`) no están en el repo: son plugins de la cuenta de claude.ai y se actualizan solos. Para bugs sirven `engineering:debug` y `engineering:code-review`.

No edites el contenido de las skills del repo: se actualizan desde sus repos con `npx skills update`. En Windows quedan copiadas y no enlazadas, así que si una no se actualiza, reinstalala con `npx skills add <repo> -s <skill> -a claude-code -y` (los repos están en `skills-lock.json`).

## Herramientas

- **`npm run capturas`**: capturas de las pantallas reales en celular (login, primera rutina, armar semana, bienvenida, las cinco pestañas y perfil). `-- --escritorio` suma 1440 px, `-- --safari` usa WebKit, `-- --carpeta antes` para comparar antes y después. Crea un perfil local en un navegador descartable y levanta su propio Vite; no toca Firebase. Quedan en `.taste-skill/capturas/`.
- **`npm run imagen -- "<pedido>"`**: genera una imagen con Gemini (Nano Banana) para las skills de imágenes. Opciones: `--formato 16:9`, `--tamano 2K`, `--ref <captura>` para partir de una pantalla actual, `--modelos`. Necesita `GEMINI_IMAGEN_API_KEY` en `.env.local`, de un proyecto **con facturación**: la generación de imágenes no tiene cupo gratis (unos US$0,03 por imagen). La clave gratis de la app no sirve, y usarla le comería la cuota a los usuarios. Quedan en `.taste-skill/imagenes/`.
- **`ui-ux-pro-max`**: su SKILL.md llama al buscador con `${CLAUDE_PLUGIN_ROOT}`, que acá no existe porque no es un plugin. Correlo desde la raíz: `python .claude/skills/ui-ux-pro-max/scripts/search.py "<consulta>" --design-system`.
- **`design-taste-frontend`**: `inspect.mjs` necesita una URL (con `npm run dev`, `http://localhost:5173`). Si le pasás `dist/index.html` sirve la raíz del repo y la app queda en blanco. Para las pantallas de adentro, `npm run capturas`. Su `lint.mjs` está pensado para landings: en la app marca cientos de fallas que no aplican.
- **`superdesign`**: necesita la cuenta del usuario, una vez: `npx --yes @superdesign/cli@latest login`. Cada generación gasta créditos, y la skill sube partes del código a superdesign.dev para diseñar.

## Carpetas con documentación y el CSS

Tailwind escanea todo el repo buscando clases, salvo lo que ignora git. `src/index.css` excluye `.agents` y `.claude` con `@source not`, porque las skills traen ejemplos de clases que terminaban en el CSS de producción. Si sumás otra carpeta con documentación así, excluila también: el CSS de producción pesa 107 KB, y si sube sin que cambie la app, es eso. ESLint también ignora esas carpetas (`eslint.config.js`).

## Sistema visual

Antes de diseñar algo nuevo, mirá lo que ya hay. Vive en dos lugares:

- **`src/index.css`** (`@theme`): las fuentes y la escala `slate` de Tailwind redefinida como grafito. Cambiar ahí cambia todas las pantallas.
- **`ANIMATION_CSS` en `src/App.jsx`**, bloque "SISTEMA VISUAL" al final: los tokens (`--surface-1/2/3`, `--hairline`, `--panel-sunken`, `--text-strong/muted/faint`, `--accent`) con su versión en `.light-mode`, y las piezas fijas: barra de arriba, título de pestaña, barra de abajo, dock, cronómetros y tarjetas de ejercicio.

Las reglas:

- **Letras:** Geist para leer y Archivo para títulos, rótulos en mayúscula y números grandes. Para un número grande, usá la clase `num-display`.
- **Color:** un acento, el teal. Los colores de cada día y de cada pestaña sirven solo para lo que es de ese día o de esa pestaña.
- **Sin manchas borrosas:** nada de círculos con `blur` detrás de los paneles. Una regla global las apaga en las pantallas y las deja solo en los modales de festejo.
- **Nada oscuro fijo en estilos en línea:** un fondo como `rgba(5,7,11,…)` se ve como una mancha en modo claro. Usá un token. Lo mismo para colores de texto pensados para fondo oscuro: `SOCIAL_INK` es la variable `--social-tinta`, que tiene su versión clara.
- **Palabras enteras:** en lugares angostos (solapas de días, chips) no partas palabras ni las cortes con "…". Para los días: `etiquetaDeDia` + `.dia-solapa-texto`, que ajustan la letra a la palabra más larga.
- **Piezas propias de la app:** la barra cargada (`BarraCargada`, un disco por serie con los colores de competición) y la planilla de series (`.serie-fila`, columnas en `--cols-serie`). Reusalas en vez de inventar otra barra de progreso u otra fila.
