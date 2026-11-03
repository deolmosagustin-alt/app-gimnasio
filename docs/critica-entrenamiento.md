# La lógica de entrenamiento de Modus Fit, contra la evidencia

Revisión del 03/11/2026, con el código de la rama `mejoras-noviembre`. Para cada tema: qué hace la app, qué dice la evidencia, el veredicto y qué se cambió. Las fuentes están al final, con link. Donde no hay consenso, se dice.

## Resumen

La base está bien: doble progresión, rangos amplios para hipertrofia, frecuencia de dos o más veces por semana, descarga en cada ciclo, y una IA a la que la app le recorta las propuestas para que no salte de a mucho. Había seis cosas para corregir y quedaron corregidas:

1. **El peso de la descarga no se podía cargar** (se redondeaba de a medio kilo: 64 kg, 141,1 lb) y **salía de tu récord de siempre**, que puede ser de hace meses. Ahora sale de tu mejor serie del último mes y se redondea al salto de ese ejercicio, hacia el lado liviano.
2. **La descarga era sólo planeada.** La evidencia la quiere planeada *y* autorregulada. Ahora, si venís bajando en dos o más ejercicios, Rutina te ofrece adelantarla.
3. **El volumen por músculo estaba mal contado**: contaba la rutina una sola vez aunque un día se hiciera dos veces por semana, sólo el músculo principal y en grupos demasiado finos ("Pectoral 3" en una rutina con nueve series de pecho). Ahora cuenta por semana y por músculo entero, y suma a medias los secundarios, el método que mejor predice el crecimiento. También muestra la referencia de 10 series por semana.
4. **La progresión podía pedir saltos imposibles**: 2,5 kg sobre un vuelo lateral de 10 kg es un 25 %. Ahora, si el salto pasa del 10 %, primero suma hasta dos reps arriba del tope, como pide el ACSM.
5. **La progresión sumaba una rep aunque la vez pasada hubieras llegado al fallo.** Ahora, con RPE 9,5 o más, repite la serie.
6. **Al Entrenador IA le faltaban reglas de seguridad** (dolor, síntomas de alarma, condiciones médicas, menores, dietas y suplementos) **y números** (volumen, fallo, descansos, descarga). Al generador de rutinas le faltaban frecuencia, volumen por nivel y equilibrio de empuje y tracción.

## 1. Progresión de cargas

**Qué hace.** Doble progresión serie por serie (`siguientePaso`): con el mismo peso, una rep más por vez hasta el tope del rango; ahí sube un salto (el de ese ejercicio, 2,5 kg o 5 lb por defecto) y las reps vuelven al piso. La serie viene escrita así desde la vez pasada. Con un plan, la meta del día la pone `metaDeHoy`: si cumpliste, avanzás un escalón; si no, la repetís; dos veces sin llegar, baja un 10 %.

**Qué dice la evidencia.**
- Subir reps o subir peso dan adaptaciones parecidas en 8 semanas: las dos son sobrecarga progresiva válidas (Plotkin et al., 2022). La doble progresión combina las dos.
- El ACSM (2009) recomienda subir la carga "un 2-10 % (menos en los ejercicios de músculos chicos, más en los grandes) cuando se pueden hacer una o dos repeticiones más que las buscadas en dos sesiones seguidas". El ACSM 2026 ya no fija una regla de progresión y dice que pocas variables cambian mucho el resultado.
- Para la fuerza, terminar lejos del fallo rinde lo mismo. Para la hipertrofia, más cerca del fallo crece más (Robinson et al., 2024). Ir siempre al fallo no hace falta (ACSM 2026).

**Veredicto.** Bien en lo central. Dos huecos:
- El salto fijo de 2,5 kg es un 2,5 % en una sentadilla de 100 kg, pero un 25 % en un vuelo lateral de 10 kg. Con saltos así, volver al piso del rango se hace imposible.
- La progresión no miraba el esfuerzo anotado.

El criterio del ACSM de dos sesiones seguidas no se adoptó. El usuario pidió explícitamente que el peso suba al llegar al tope ("recién ahí sube el peso"), y la diferencia es de una sesión.

**Qué se cambió** (`siguientePaso`, en `src/App.jsx`):
- Si el salto supera el 10 % del peso, antes de saltar se suman hasta dos reps arriba del tope. Es el "una o dos repeticiones más que las buscadas" del ACSM.
- Si la vez pasada anotaste RPE 9,5 o más (al fallo), hoy se repite la serie, y la serie lo dice: "llegaste al fallo, hoy lo mismo".
- La regla vale para todo lo que usa `siguientePaso`: la serie, "Llenar el ciclo", "Seguir el plan" y lo que propone la IA (`deAPoco`).
- Pruebas: `node scripts/probar-logica.mjs`.

**El −10 % después de dos fallos** (`metaDeHoy`) es práctica de entrenadores (los "resets" de los programas lineales), no algo medido en estudios. Es conservador y razonable, y se dejó.

## 2. Volumen semanal

**Qué hacía.** `volumenPorMusculo` contaba las series de la rutina una vez, sólo del músculo principal y con los grupos del catálogo (pectoral superior y pectoral medio por separado), y la pantalla decía "series por semana".

**Qué dice la evidencia.**
- El ACSM 2026 (una revisión de 137 revisiones sistemáticas) recomienda para hipertrofia unas 10 series por semana por grupo muscular, y entrenar cada músculo grande al menos dos veces por semana.
- Pelland et al. (67 estudios) encuentran que más volumen sigue sumando hipertrofia con rendimientos decrecientes, y en la fuerza bajan más rápido. El conteo que mejor predice es el fraccional: series directas enteras, indirectas a medias.

**Veredicto.** El número no era por semana, y en grupos tan finos ningún músculo llegaba a la referencia aunque la rutina estuviera bien. Era un error de cuenta, no de criterio.

**Qué se cambió.**
- `vecesPorSemana` lee el cronograma: un Upper/Lower de dos días hecho cuatro veces por semana cuenta doble.
- `volumenPorMusculo`, que usan el empuje y la tracción de Balance, ahora es por semana.
- `seriesSemanalesPorMusculo` es nueva y la usa la lista "Por músculo":
  - junta los grupos en nueve músculos (pecho, espalda, hombros, bíceps, tríceps, cuádriceps, femorales, glúteos y pantorrillas);
  - suma a medias los secundarios que ya trae el catálogo;
  - dibuja una raya en 10 series y nombra los músculos que quedan abajo.

## 3. RPE y RIR

**Qué hace.** El esfuerzo (RPE o RIR) se anota en la serie, si está prendido. El planificador con IA puede sumar RPE por semana, subiendo de 7 a 9 dentro del bloque.

**Qué dice la evidencia.** La escala de RPE basada en repeticiones en reserva sirve para autorregular la carga. Se estima con un error de alrededor de una repetición, y mejor cerca del fallo y con cargas altas (Zourdos et al., 2016; revisión de 2025 sobre su precisión). Que el esfuerzo vaya subiendo dentro de un bloque es la forma habitual de usarla.

**Veredicto.** Bien, pero el RPE anotado no se usaba para nada. **Cambio:** ahora frena la progresión cuando la serie fue al fallo (ver el punto 1).

## 4. Descansos

**Qué hace.** 3 minutos de fábrica, y 5 para las series pesadas (rango con tope de 6 reps o menos).

**Qué dice la evidencia.**
- ACSM 2009: "por lo menos 2-3 minutos" en los básicos pesados; en los accesorios, "1-2 minutos pueden alcanzar"; y 3-5 minutos con cargas muy pesadas en avanzados.
- Singer et al. (2024): para hipertrofia, más de 60 s tiene un beneficio chico, y más de 90 s ya no cambia nada.

**Veredicto.** Dentro de la evidencia, del lado largo: no hacen daño y alargan la sesión. **No se cambió**, para no mover algo que la gente ya tiene configurado. La IA ahora recomienda 2-3 minutos en básicos y 1-2 en accesorios.

## 5. La semana de descarga

**Qué hacía.**
- Cuándo: después de 7 semanas de trabajo, 1 de descarga, sólo planeada.
- Cuánto: la mitad de las series, al 75 % del peso, con las mismas reps. El peso salía del récord de cada serie (o del pico del plan) y se redondeaba de a 0,5 kg.
- Dónde: una pantalla aparte que reemplazaba a Rutina.

**Qué dice la evidencia.**
- **Qué es:** "un período de menos estrés de entrenamiento, para aliviar la fatiga física y mental" (consenso Delphi, Bell et al., 2023).
- **Cuándo:** no hay consenso. La literatura cita cada 4 a 6 semanas, y el consenso dice que puede ir en la última semana del mesociclo y ser "planeada y también autorregulada". En la encuesta a 246 atletas de fuerza y físico (Rogerson et al., 2024), la descarga era cada 5,6 ± 2,3 semanas y duraba 6,4 ± 1,7 días. La disparaban también el rendimiento estancado, el dolor muscular o de articulaciones.
- **Cómo:** bajar el volumen (menos series y menos reps), bajar la carga y alejar el fallo (más repeticiones en reserva), con la misma frecuencia (Rogerson et al., 2024; Bell et al., 2023).
- **Lo que no:** parar del todo una semana a la mitad de un bloque de 9 no mejoró la hipertrofia y restó algo de fuerza (Coleman et al., 2024). La descarga tiene que ser entrenamiento liviano, no descanso total.

**Veredicto.**
- **Cuándo:** 7 + 1 está dentro del rango observado (5,6 ± 2,3 semanas), del lado largo, y es configurable. No se cambió, porque correr el ciclo de todos movería la semana en la que está cada uno. Faltaba la autorregulación.
- **Cuánto:** la mitad de las series y menos peso con las mismas reps aleja mucho el fallo, y eso coincide con la evidencia. Lo que fallaba era el cálculo del peso.

**Qué se cambió.**
- **La base:** tu mejor serie de las últimas 4 semanas (o el pico del plan, si seguís uno). Antes era el récord de siempre. `baseDeDescarga`.
- **El peso:** redondeado al salto del ejercicio (2,5 kg, 5 lb o lo que marque la máquina), y en un empate, al más liviano. Si ya es el peso más chico, bajan las reps; a peso corporal, también. `cargaDeDescarga`.
- **Adelantarla:** `ejerciciosEnBaja` cuenta los ejercicios cuyas dos últimas sesiones quedaron, las dos, un 5 % abajo de su mejor serie del mes anterior, sin haber subido el peso. Con dos o más, Rutina dice "Venís bajando en N ejercicios: mirá la descarga". Desde la vista previa, "Hacerla esta semana" corre el inicio del ciclo para que esta sea la de descarga (`handleAdelantarDescarga`).
- **Dónde:** la descarga ahora es Rutina misma, transformada. La barra suelta los discos que sobran, la hoja del plan se pliega, cada tarjeta se queda con sus series de descarga y las demás se tachan. Un selector en el día deja elegir entre entrenamiento y descarga. Desde Progreso se abre la vista previa en Rutina, no otra pestaña. La pantalla aparte (`DeloadView`) se sacó.
- **La IA:** recomienda la descarga cada 4 a 8 semanas o antes si el rendimiento baja dos o más sesiones seguidas, con la mitad de las series y RIR de 4 o más. Nunca recomienda parar del todo.

## 6. Aproximaciones y 1RM estimado

- **Aproximaciones:** la rampa es 50 % × 8, 70 % × 5 y 85 % × 3 de tu mejor peso de trabajo. Es una progresión estándar y sólo se muestra si la prendés. Para un aislamiento, o para el segundo ejercicio del mismo músculo, alcanza con una serie de aproximación. **Queda como idea**, no se cambió.
- **1RM estimado:** con la fórmula de Epley, que sobreestima cuando las series tienen muchas reps. Se usa para comparar series y para los rangos, no para cargar la barra, así que alcanza. **No se cambió.**

## 7. Los consejos de la IA

**Qué hace.** El Entrenador IA recibe instrucciones con marcos de evidencia (doble progresión, volumen, frecuencia, rangos, mitos), el análisis ya calculado del historial de la persona y reglas para proponer cambios con un botón de confirmar. Lo que propone para planificar pasa por `deAPoco`, que no deja dar más de un paso por semana. El generador de rutinas del cuestionario sólo tenía rangos por objetivo.

**Qué dice la evidencia.**
- Los planes de ChatGPT sirven de borrador, pero les falta individualización: fueron casi iguales para hombres y mujeres (Washif et al., 2024).
- En una evaluación profesional, los planes de GPT-4 para hipertrofia y fuerza "no fueron del todo satisfactorios" (Biology of Sport, 2025).
- Las dos conclusiones van en la misma dirección: que la app ponga los límites, no la IA.

**Veredicto.**
- **Personalización:** está bien resuelta, porque la IA ve los datos reales y la app recorta lo que propone.
- **Seguridad:** no había ninguna regla para dolor, síntomas de alarma, condiciones médicas, embarazo, menores, dietas extremas ni suplementos. En la pantalla sólo figura "No reemplaza el consejo de un profesional de la salud".
- **Números:** faltaban los de volumen, fallo, descansos y descarga.

**Qué se cambió** (`AI_SYSTEM_PROMPT_STATIC`):
- **Bloque "SEGURIDAD, SIEMPRE":**
  - ante un dolor que no es leve, dejar el ejercicio y consultar;
  - ante una señal de alarma, parar y, si es fuerte, emergencias;
  - con condiciones médicas, embarazo o medicación, consejos conservadores y validarlos con el médico, sin diagnósticos;
  - menores sin máximos ni dietas restrictivas;
  - nada de menos de 1200 kcal ni de bajar más del 1 % del peso por semana;
  - sólo suplementos con evidencia (creatina, cafeína, proteína) y nunca anabólicos ni fármacos para adelgazar.
- **Las cifras:**
  - unas 10 series por semana por músculo y secundarios a medias;
  - fuerza al 80 % o más, 2-3 series y 2 veces por semana;
  - RIR 0-3 para hipertrofia y 1-4 alcanza para la fuerza, sin fallo en básicos pesados sin ayuda;
  - descansos de 2-3 minutos en básicos y 1-2 en accesorios;
  - la descarga, con sus disparadores, y sin parar del todo.
- **El ejemplo de `config_ciclo`**: ahora dice el 75 % de la carga reciente, como la app (antes, el 60 % del récord).

En el generador de rutinas (`PersonalizedRoutineWizard`):
- cada músculo dos veces por semana, con la división según los días;
- el volumen semanal por nivel: principiante 6-10, intermedio 10-15 y avanzado 10-20;
- empuje y tracción parejos;
- ejercicios simples para principiantes;
- potencia o equilibrio desde los 60 años;
- sin cargas máximas para menores;
- sin fallo en los básicos con barra.

**Lo que no se puede asegurar:** que la IA siga las instrucciones siempre. Por eso la app no aplica nada sin el botón de confirmar, y recorta las progresiones (`deAPoco`).

## Ideas que quedaron afuera

- El criterio del ACSM de dos sesiones seguidas al tope antes de subir el peso, como opción en Perfil.
- Un salto de fábrica según el equipo (mancuernas de a 2 kg, máquinas de a 5 kg) en vez de 2,5 kg para todo.
- En la descarga autorregulada, sumar señales que hoy no se anotan (cómo dormiste, dolor articular).
- Validar del lado del servidor las propuestas de la IA, además de en la app.

## Fuentes

- American College of Sports Medicine (2026). [Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews](https://journals.lww.com/acsm-msse/fulltext/2026/04000/american_college_of_sports_medicine_position.21.aspx). *Medicine & Science in Sports & Exercise*. Resumen: [ACSM, "5 things to know"](https://acsm.org/resistance-training-guidelines-update-2026/).
- Ratamess et al., ACSM (2009). [Progression models in resistance training for healthy adults](https://pubmed.ncbi.nlm.nih.gov/19204579/). *MSSE* 41(3):687-708. Las citas sobre el 2-10 % y los descansos son textuales del artículo.
- Bell et al. (2023). [Integrating Deloading into Strength and Physique Sports Training Programmes: An International Delphi Consensus Approach](https://pmc.ncbi.nlm.nih.gov/articles/PMC10511399/). *Sports Medicine - Open*.
- Rogerson et al. (2024). [Deloading Practices in Strength and Physique Sports: A Cross-sectional Survey](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10948666/). *Sports Medicine - Open*.
- Coleman et al. (2024). [Gaining more from doing less? The effects of a one-week deload period during supervised resistance training on muscular adaptations](https://peerj.com/articles/16777). *PeerJ*.
- Plotkin et al. (2022). [Progressive overload without progressing load? The effects of load or repetition progression on muscular adaptations](https://peerj.com/articles/14142). *PeerJ*.
- Robinson et al. (2024). [Exploring the Dose–Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy: A Series of Meta-regressions](https://doi.org/10.1007/s40279-024-02069-2). *Sports Medicine* 54:2209-2231.
- Pelland et al. [The Resistance Training Dose-Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gain](https://sportrxiv.org/index.php/server/preprint/view/537). SportRxiv (2024); publicado en *Sports Medicine* (2026).
- Schoenfeld et al. (2021). [Loading Recommendations for Muscle Strength, Hypertrophy, and Local Endurance: A Re-Examination of the Repetition Continuum](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7927075/). *Sports* 9(2):32.
- Singer et al. (2024). [Give it a rest: a systematic review with Bayesian meta-analysis on the effect of inter-set rest interval duration on muscle hypertrophy](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/text). *Frontiers in Sports and Active Living*.
- Zourdos et al. (2016). Novel Resistance Training–Specific Rating of Perceived Exertion Scale Measuring Repetitions in Reserve. *J Strength Cond Res* 30:267-275. Sobre su precisión: [Proximity to failure and total repetitions performed in a set influences accuracy of intraset repetitions in reserve-based rating of perceived exertion](https://pubmed.ncbi.nlm.nih.gov/30747900/).
- Washif et al. (2024). [Artificial intelligence in sport: Exploring the potential of using ChatGPT in resistance training prescription](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10955742/). *Biology of Sport*.
- Biology of Sport (2025). [A professional assessment of training plans for muscle hypertrophy and maximal strength developed by generative artificial intelligence](https://www.termedia.pl/A-professional-assessment-of-training-plans-for-muscle-hypertrophy-and-maximal-strength-developed-by-generative-artificial-intelligence,78,56339,1,0.html). *Biology of Sport*.
