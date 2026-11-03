# Play Console: lo que no tiene API, listo para pegar

Preparado el 03/11/2026 para el lanzamiento. Todo esto se carga a mano en Play Console (la API de Google Play no lo permite). Cada apartado dice dónde está y qué poner.

## 0. Antes que nada: la 1.0.25

1. Android Studio › Build › Generate Signed App Bundle › Android App Bundle › release. El almacén, el alias y las contraseñas ya están cargados: tocás Siguiente y Crear. Queda en `android/app/release/app-release.aab`.
2. Avisale a Claude: la sube a la prueba cerrada con `npm run play -- subir android/app/release/app-release.aab --pista alpha`.

Revisado el 03/11: compila, apunta a Android 16 (API 36) y ya no pide el ID de publicidad. Sus permisos: cámara (el QR), micrófono (dictarle al Entrenador IA), notificaciones, alarmas exactas y notificaciones destacadas (el descanso), arranque del teléfono (reprogramar el descanso) e internet.

## 1. ID de publicidad

**Dónde:** Política y programas › Contenido de la app › ID de publicidad.
**Qué poner:** "¿Tu app usa un ID de publicidad?" → **No**. Hacerlo después de que la 1.0.25 reemplace a la 1.0.24 (la 1.0.24 todavía lo pedía).
Cuando se prendan los anuncios (a las 1000 descargas) vuelve a ser **Sí**, con el SDK de AdMob.

## 2. Acceso a la app

**Dónde:** Contenido de la app › Acceso a la app › "Todas las funciones o algunas están restringidas".
**Instrucciones para la revisión (pegar):**

> La app funciona sin cuenta: en la primera pantalla, tocá "Crear perfil sin Google", escribí un nombre, elegí un PIN de 4 números y después "Empezar con esta" para tener una rutina. Así se usan Rutina, Progreso, Rutinas y el Entrenador IA.
> Social (amigos, ranking, aplausos) necesita iniciar sesión con cualquier cuenta de Google: tocá "Continuar con Google" en la primera pantalla. No hace falta ninguna cuenta especial ni datos de prueba.

## 3. Apps de salud

**Dónde:** Contenido de la app › Apps de salud.
**Qué marcar:** "Actividad física y fitness" (registro de entrenamientos de fuerza, progreso y medidas corporales).
**No marcar:** nada médico (no diagnostica ni trata enfermedades) ni Health Connect (la app no lo usa).
**Si pregunta por la IA:** el Entrenador IA da consejos generales de entrenamiento con reglas de seguridad (ante dolor o síntomas de alarma deriva a un profesional) y avisa debajo de cada respuesta "No reemplaza el consejo de un profesional de la salud".

## 4. Categoría y etiquetas

**Dónde:** Presencia en la tienda › Configuración de la tienda.
**Categoría:** Salud y bienestar.
**Etiquetas (hasta cinco):** las que más encajan entre las que ofrece Play: Entrenamiento de fuerza, Gimnasio, Seguimiento de entrenamientos, Ejercicio, Fitness.

## 5. Condición de comerciante (ley europea de servicios digitales)

**Dónde:** Configuración › Detalles de la cuenta de desarrollador (o el aviso en Inicio).
**Qué poner, hoy:** **No soy comerciante** (la app es gratis, sin cobros ni anuncios).
**A las 1000 descargas,** cuando se prendan el cobro y los anuncios, pasa a **Soy comerciante**, y Play pide mostrar en la ficha una dirección y un teléfono o mail de contacto.

## 6. Verificación de desarrollador

**Dónde:** Inicio (aviso de "Verificación de desarrolladores").
Revisar que el paquete `com.modusfit.fitness` figure registrado. Si pide verificar identidad, lo hacés vos con tu documento.

## 7. La prueba cerrada y el paso a producción

- Hacen falta **12 testers durante 14 días seguidos** (cuenta personal). Link para sumarse: https://play.google.com/apps/testing/com.modusfit.fitness (los pasos, en `probar.html`).
- Para cargarlos más rápido: creá un Grupo de Google (groups.google.com), pasale el mail del grupo a Claude y lo suma a la pista con `npm run play -- testers --pista alpha --grupo <mail>`. Quien entra al grupo queda como tester.
- Pasados los 14 días con 12 personas, en Play Console aparece "Solicitar acceso a producción": son tres preguntas sobre la prueba (cuántos testers, qué cambiaste con lo que dijeron, si la app está lista). Claude te prepara las respuestas con lo que haya pasado en la prueba.

## 8. Notas de la versión 1.0.25 (pegar en la pista)

> Ahora el descanso se ve en la barra de arriba y en la pantalla bloqueada, con pausa y +15 s. El código QR de tu perfil abre la app con cualquier cámara. Arreglamos un cierre al guardar una imagen. Y la app ya no pide el ID de publicidad.
