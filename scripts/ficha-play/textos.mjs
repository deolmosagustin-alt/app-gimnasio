// Los textos de la ficha de Play. es-419 (América Latina, el idioma por
// defecto) va con vos, como la app; es-ES y es-US, con tú. El título lleva la
// búsqueda principal ("rutinas de gimnasio") y la descripción corta, la
// segunda ("registro de entrenamiento"). Límites de Play: título 30, corta 80,
// larga 4000. La larga admite <b>.
export const TITULO = "Modus Fit: Rutinas de Gimnasio";

const LARGA_VOS = `Modus Fit es tu registro de entrenamiento para el gimnasio: anotás cada serie en un toque, seguís tu rutina con un plan que progresa como el de un entrenador personal y ves cuánto subís semana a semana.

<b>Anotá tu entrenamiento en segundos</b>
• Cada serie viene escrita con lo que toca hoy: una rep más que la vez pasada o, al llegar al tope del rango, un poco más de peso.
• Reps y kilos se ajustan con − y +, sin abrir el teclado. En kilos o en libras, y con el salto de peso de cada máquina.
• El cronómetro de descanso arranca solo al guardar la serie, te avisa al terminar y queda siempre a la vista.
• La barra del día se carga con un disco por serie: cuando está llena, terminaste.

<b>Un plan que progresa como el de un entrenador</b>
• Sobrecarga progresiva con doble progresión: primero suben las reps y, al llegar al tope del rango, el peso, de a poco.
• Si no llegás a una meta, la próxima vez la repetís; si te trabás dos veces, baja un poco para volver a subir.
• Ciclos con semana de descarga para recuperarte.
• Pedile a la IA que planifique tu bloque de fuerza o de hipertrofia.

<b>Tu progreso, a la vista</b>
• La gráfica de cada ejercicio, con tus récords y tu 1RM estimado.
• Tu nivel en cada músculo, de Bronce a Maestro.
• Tu historial de entrenamientos como un cuaderno, con el ticket de cada sesión.
• Resúmenes de la semana, el mes y el año, y tus medidas corporales con su evolución.

<b>Un entrenador personal con IA</b>
• Conoce tu rutina, tus marcas y tu progreso.
• Preguntale con cuánto peso arrancar o qué te toca hoy, o pedile una rutina nueva.

<b>Rutinas de gimnasio listas o la tuya</b>
• Push Pull Legs, Upper/Lower (torso y pierna), Arnold Split, Bro Split, Cuerpo completo y más.
• Armá tu rutina día por día con más de 340 ejercicios, que encontrás aunque no escribas el nombre exacto.
• Importá la rutina de tu profe desde una foto, un PDF, un Excel o un Word.

<b>Entrená con tus amigos</b>
• Quién fue más veces al gym esta semana, aplausos y retos.
• El mano a mano con un amigo, músculo por músculo.
• Compartí tu rutina con un link y tu perfil con un código QR.

Gratis y sin anuncios. Funciona sin cuenta, y si entrás con Google tus datos también se guardan en la nube, para no perder nada si cambiás de celular.`;

const LARGA_TU = `Modus Fit es tu registro de entrenamiento para el gimnasio: anotas cada serie en un toque, sigues tu rutina con un plan que progresa como el de un entrenador personal y ves cuánto subes semana a semana.

<b>Anota tu entrenamiento en segundos</b>
• Cada serie viene escrita con lo que toca hoy: una rep más que la vez pasada o, al llegar al tope del rango, un poco más de peso.
• Reps y kilos se ajustan con − y +, sin abrir el teclado. En kilos o en libras, y con el salto de peso de cada máquina.
• El cronómetro de descanso arranca solo al guardar la serie, te avisa al terminar y queda siempre a la vista.
• La barra del día se carga con un disco por serie: cuando está llena, terminaste.

<b>Un plan que progresa como el de un entrenador</b>
• Sobrecarga progresiva con doble progresión: primero suben las reps y, al llegar al tope del rango, el peso, poco a poco.
• Si no llegas a una meta, la próxima vez la repites; si te atascas dos veces, baja un poco para volver a subir.
• Ciclos con semana de descarga para recuperarte.
• Pídele a la IA que planifique tu bloque de fuerza o de hipertrofia.

<b>Tu progreso, a la vista</b>
• La gráfica de cada ejercicio, con tus récords y tu 1RM estimado.
• Tu nivel en cada músculo, de Bronce a Maestro.
• Tu historial de entrenamientos como un cuaderno, con el ticket de cada sesión.
• Resúmenes de la semana, el mes y el año, y tus medidas corporales con su evolución.

<b>Un entrenador personal con IA</b>
• Conoce tu rutina, tus marcas y tu progreso.
• Pregúntale con cuánto peso empezar o qué te toca hoy, o pídele una rutina nueva.

<b>Rutinas de gimnasio listas o la tuya</b>
• Push Pull Legs, Upper/Lower (torso y pierna), Arnold Split, Bro Split, Cuerpo completo y más.
• Arma tu rutina día por día con más de 340 ejercicios, que encuentras aunque no escribas el nombre exacto.
• Importa la rutina de tu entrenador desde una foto, un PDF, un Excel o un Word.

<b>Entrena con tus amigos</b>
• Quién fue más veces al gym esta semana, aplausos y retos.
• El cara a cara con un amigo, músculo por músculo.
• Comparte tu rutina con un enlace y tu perfil con un código QR.

Gratis y sin anuncios. Funciona sin cuenta, y si entras con Google tus datos también se guardan en la nube, para no perder nada si cambias de teléfono.`;

// Cada idioma: sus textos y la carpeta de láminas que usa.
export const FICHAS = {
  "es-419": { corta: "Rutinas y registro de entrenamiento: anotá tus series y progresá con IA", larga: LARGA_VOS, laminas: "laminas" },
  "es-ES": { corta: "Rutinas y registro de entrenamiento: anota tus series y progresa con IA", larga: LARGA_TU, laminas: "laminas-tu" },
  "es-US": { corta: "Rutinas y registro de entrenamiento: anota tus series y progresa con IA", larga: LARGA_TU, laminas: "laminas-tu" },
};

export function revisar() {
  const fallas = [];
  if (TITULO.length > 30) fallas.push(`título: ${TITULO.length} (máximo 30)`);
  for (const [idioma, f] of Object.entries(FICHAS)) {
    if (f.corta.length > 80) fallas.push(`${idioma} corta: ${f.corta.length} (máximo 80)`);
    if (f.larga.length > 4000) fallas.push(`${idioma} larga: ${f.larga.length} (máximo 4000)`);
  }
  return fallas;
}
