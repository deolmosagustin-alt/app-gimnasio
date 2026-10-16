# Notas para Claude

## Diseño: qué skill usar

Hay 18 skills de diseño en `.claude/skills/`, que es donde las lee Claude Code. Quince también están en `.agents/skills/`, la carpeta que usan otros agentes. Usá **una por tarea**: varias se contradicen. Por ejemplo, `design-taste-frontend` prohíbe gradientes, glassmorphism y sombras, y `redesign-existing-projects` los recomienda.

| Para | Skill |
|---|---|
| Mejorar las pantallas de la app (casi todo el trabajo) | `redesign-existing-projects`, y antes de entregar el checklist de `ui-ux-pro-max` (`references/pro-rules.md`) |
| Dirección visual general: paleta, tipografía, criterio | `frontend-design`, o `ui-ux-pro-max` con `--design-system` |
| Auditoría de accesibilidad y experiencia de uso | `web-design-guidelines` |
| Página pública o landing (no pantallas de app) | `design-taste-frontend` (la v1 y la v2-experimental son versiones viejas) |
| Una estética puntual | `minimalist-ui`, `industrial-brutalist-ui` o `high-end-visual-design`, una sola |
| Diseñar a partir de imágenes generadas | `image-to-code`, `imagegen-frontend-mobile`, `imagegen-frontend-web`, `brandkit`: generan con `npm run imagen` |
| Un DESIGN.md para Google Stitch | `stitch-design-taste` |
| Diseñar en el canvas de superdesign.dev | `superdesign` |
| Landings con animaciones GSAP | `gpt-taste` |
| Que no se recorte código largo | `full-output-enforcement` |

No edites el contenido de las skills: se actualizan desde sus repos con `npx skills update`. En Windows quedan copiadas y no enlazadas, así que si una no se actualiza, reinstalala con `npx skills add <repo> -s <skill> -a claude-code -y` (los repos están en `skills-lock.json`).

## Herramientas

- **`npm run capturas`**: capturas de las pantallas reales en celular (login, primera rutina, armar semana, bienvenida, las cinco pestañas y perfil). `-- --escritorio` suma 1440 px, `-- --safari` usa WebKit, `-- --carpeta antes` para comparar antes y después. Crea un perfil local en un navegador descartable y levanta su propio Vite; no toca Firebase. Quedan en `.taste-skill/capturas/`.
- **`npm run imagen -- "<pedido>"`**: genera una imagen con Gemini (Nano Banana) para las skills de imágenes. Opciones: `--formato 16:9`, `--tamano 2K`, `--ref <captura>` para partir de una pantalla actual, `--modelos`. Necesita `GEMINI_IMAGEN_API_KEY` en `.env.local`, de un proyecto **con facturación**: la generación de imágenes no tiene cupo gratis (unos US$0,03 por imagen). La clave gratis de la app no sirve, y usarla le comería la cuota a los usuarios. Quedan en `.taste-skill/imagenes/`.
- **`ui-ux-pro-max`**: su SKILL.md llama al buscador con `${CLAUDE_PLUGIN_ROOT}`, que acá no existe porque no es un plugin. Correlo desde la raíz: `python .claude/skills/ui-ux-pro-max/scripts/search.py "<consulta>" --design-system`.
- **`design-taste-frontend`**: `inspect.mjs` necesita una URL (con `npm run dev`, `http://localhost:5173`). Si le pasás `dist/index.html` sirve la raíz del repo y la app queda en blanco. Para las pantallas de adentro, `npm run capturas`. Su `lint.mjs` está pensado para landings: en la app marca cientos de fallas que no aplican.
- **`superdesign`**: necesita la cuenta del usuario, una vez: `npx --yes @superdesign/cli@latest login`. Cada generación gasta créditos, y la skill sube partes del código a superdesign.dev para diseñar.

## Carpetas con documentación y el CSS

Tailwind escanea todo el repo buscando clases, salvo lo que ignora git. `src/index.css` excluye `.agents` y `.claude` con `@source not`, porque las skills traen ejemplos de clases que terminaban en el CSS de producción. Si sumás otra carpeta con documentación así, excluila también: el CSS de producción pesa 106 KB, y si sube sin que cambie la app, es eso. ESLint también ignora esas carpetas (`eslint.config.js`).
