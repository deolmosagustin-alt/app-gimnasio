// Las animaciones de Motion (incluidas las de reacomodar la lista de series)
// se cargan aparte, después de que la app arranca: son la parte pesada de la
// librería y no hacen falta para dibujar la primera pantalla. Ver LazyMotion
// en App.jsx.
import { domMax } from "motion/react";

export default domMax;
