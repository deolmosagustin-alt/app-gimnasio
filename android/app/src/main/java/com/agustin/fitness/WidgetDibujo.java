package com.agustin.fitness;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.CornerPathEffect;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.os.Build;
import android.os.SystemClock;
import android.text.TextPaint;
import android.text.TextUtils;

import androidx.core.content.res.ResourcesCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * LOS WIDGETS DE MODUS FIT (14/11/2026, la segunda versión; pedido: "que sean
 * cosas utilizables y de buen diseño, cuanto menos espacio ocupen, mejor").
 * Cuatro, y cada uno se adapta al tamaño que le den (un bloque, media fila,
 * una fila, un cuadrado):
 *   sup / sup1  Suplementos: cada uno es un botón con su forma; se toca y
 *               queda tomado (WidgetAcciones), sin abrir la app.
 *   empezar     Qué toca hoy y el botón que arranca la sesión.
 *   descanso    Tiempos para arrancar el reloj del descanso; mientras corre,
 *               la cuenta con pausa y cerrar (el mismo reloj de la notificación).
 *   tira        La semana: cada día teñido con lo que hiciste, y la racha.
 * LA TERCERA VERSIÓN (15/11; pedido: "metele más al diseño… son como muy
 * básicos", "más variedad", mirando los de Hevy, HabitKit y Streaks): cada
 * placa lleva arriba la luz tenue de su tono, como las pestañas de la app;
 * Empezar suma una rayita por ejercicio; y hay seis conceptos más:
 *   lista       La rutina de hoy: los ejercicios con sus series y su carga.
 *   mes         El mes en un calendario: cada día teñido con lo que hiciste.
 *   columnas    El volumen de las últimas ocho semanas, en columnas.
 *   record      Tu último récord, en dorado.
 *   racha       La racha en palitos de tiza, de a cinco.
 *   sup7        Suplementos con su semana: un renglón por cada uno.
 * Se dibujan a mano en una imagen, con la letra de la app (Mona Sans, en
 * res/font). El dibujo devuelve además un "plano": qué zonas se tocan y qué
 * hace cada una (ModusWidget las pone encima como vistas transparentes) y
 * dónde va el reloj en vivo. Las formas de los suplementos son las de
 * IconoSuplemento en App.jsx: si cambiás una, cambiala allá.
 */
public final class WidgetDibujo {
    private WidgetDibujo() {}

    /** Lo que ModusWidget necesita para armar el widget alrededor de la imagen. */
    static final class Plano {
        Bitmap bmp;
        String raiz = "abrir";              // qué hace el widget entero al tocarlo
        int filas = 0;                      // las zonas: hasta 4 filas de hasta 5
        int[] cols = {0, 0, 0, 0};
        int pl, pt, pr, pb;                 // el margen del bloque de zonas, en px
        String[] acciones = new String[20]; // fila * 5 + columna
        boolean crono = false;              // el reloj en vivo (un Chronometer)
        long cronoBase;
        boolean cronoBaja = true;
        String cronoFormato = null;
        int cl, ct, cr, cb;                 // su caja, en px
        float cronoTam;
        int cronoColor = FUERTE;
    }

    static final int F1 = 0xFF232529, F2 = 0xFF17181B, BORDE = 0xFF2D2F35;
    static final int FUERTE = 0xFFF2F2EF, SUAVE = 0xFFA2A6AD, HUNDIDO = 0xFF26282D, BOTON = 0xFF2C2E34, RAYA = 0xFF3B3E45, TINTA = 0xFF101214;
    static final int VERDE = 0xFF6FD39A, GRIS = 0xFF8A8C92, ACENTO = 0xFF7BD0BD;
    static final int AZUL = 0xFF6C9BF2, ORO = 0xFFE8C36A, TIZA = 0xFFE9E7DF, CLARO = 0xFFDADCE0, TENUE = 0xFF7F838B;

    private static Typeface ANGOSTA, TEXTO;

    private static void fuentes(Context ctx) {
        if (ANGOSTA != null) return;
        try { ANGOSTA = ResourcesCompat.getFont(ctx, R.font.mona_angosta); } catch (Exception e) { /* la del sistema */ }
        try { TEXTO = ResourcesCompat.getFont(ctx, R.font.mona_texto); } catch (Exception e) { /* la del sistema */ }
        if (ANGOSTA == null) ANGOSTA = Typeface.create("sans-serif-condensed", Typeface.BOLD);
        if (TEXTO == null) TEXTO = Typeface.create("sans-serif-medium", Typeface.NORMAL);
    }

    static int color(String hex, int porDefecto) {
        try { return hex == null || hex.isEmpty() ? porDefecto : Color.parseColor(hex); } catch (Exception e) { return porDefecto; }
    }

    /** Mezcla a con b: t = cuánto de a (0 a 1). */
    static int mezcla(int a, int b, float t) {
        float u = 1f - t;
        return Color.rgb(Math.round(Color.red(a) * t + Color.red(b) * u), Math.round(Color.green(a) * t + Color.green(b) * u), Math.round(Color.blue(a) * t + Color.blue(b) * u));
    }

    /** El color de lo que se toca, como en la app: el del día en pastel. */
    static int pastel(int c) { return mezcla(c, Color.WHITE, 0.72f); }

    private static Paint pincel(int color) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(color);
        return p;
    }

    private static Paint trazo(int color, float ancho) {
        Paint p = pincel(color);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(ancho);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeJoin(Paint.Join.ROUND);
        return p;
    }

    private static Paint texto(int color, float tam, Typeface tf) {
        Paint p = pincel(color);
        p.setTextSize(tam);
        p.setTypeface(tf);
        return p;
    }

    /** Achica la letra hasta que entre (con un piso) y, si no entra, la corta con "…". */
    private static String encajar(Paint p, String s, float ancho, float piso) {
        if (s == null) return "";
        while (p.getTextSize() > piso && p.measureText(s) > ancho) p.setTextSize(p.getTextSize() - 0.5f);
        if (p.measureText(s) <= ancho) return s;
        return TextUtils.ellipsize(s, new TextPaint(p), Math.max(ancho, 1f), TextUtils.TruncateAt.END).toString();
    }

    private static void alCentro(Canvas c, String s, float cx, float y, Paint p) {
        c.drawText(s, cx - p.measureText(s) / 2f, y, p);
    }

    static String reloj(long seg) {
        long s = Math.max(0, seg);
        return (s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
    }

    private static int entre(int v, int a, int b) { return Math.max(a, Math.min(b, v)); }

    /** El radio de las esquinas: el del sistema (Android 12+), para calzar con los demás widgets. */
    private static float radio(Context ctx, float d, int w, int h) {
        float r = 22 * d;
        if (Build.VERSION.SDK_INT >= 31) {
            try { r = ctx.getResources().getDimension(android.R.dimen.system_app_widget_background_radius); } catch (Exception e) { /* el de siempre */ }
        }
        r = Math.max(16 * d, Math.min(r, 28 * d));
        return Math.min(r, Math.min(w, h) / 2f);
    }

    private static void fondo(Canvas c, int w, int h, float d, float r, int arriba, int abajo, int borde) {
        RectF rr = new RectF(0.5f * d, 0.5f * d, w - 0.5f * d, h - 0.5f * d);
        Paint p = pincel(arriba);
        if (arriba != abajo) p.setShader(new LinearGradient(0, 0, 0, h, arriba, abajo, Shader.TileMode.CLAMP));
        c.drawRoundRect(rr, r, r, p);
        Paint b = pincel(borde);
        b.setStyle(Paint.Style.STROKE);
        b.setStrokeWidth(d);
        c.drawRoundRect(rr, r, r, b);
    }

    /** La placa con la luz tenue de su tono arriba, como cada pestaña de la app, y el brillo del canto. */
    private static void fondo(Canvas c, int w, int h, float d, float r, int tono) {
        fondo(c, w, h, d, r, F1, F2, BORDE);
        if (tono != 0) {
            Path clip = new Path();
            clip.addRoundRect(new RectF(d, d, w - d, h - d), r, r, Path.Direction.CW);
            c.save();
            c.clipPath(clip);
            int base = tono & 0x00FFFFFF;
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
            p.setShader(new RadialGradient(w * 0.08f, -h * 0.3f, Math.max(w * 0.8f, h * 1.5f), new int[]{base | 0x3D000000, base | 0x14000000, base}, new float[]{0f, 0.5f, 1f}, Shader.TileMode.CLAMP));
            c.drawRect(0, 0, w, h, p);
            c.restore();
        }
        c.drawLine(r * 0.9f, 1.25f * d, w - r * 0.9f, 1.25f * d, trazo(0x18FFFFFF, d));
    }

    private static JSONObject delDia(JSONArray agenda, String f) {
        for (int i = 0; agenda != null && i < agenda.length(); i++) {
            JSONObject a = agenda.optJSONObject(i);
            if (a != null && f.equals(a.optString("f"))) return a;
        }
        return null;
    }

    /** Una rayita por ejercicio; llenas, las que ya llevás. */
    private static void rayitas(Canvas c, float d, float x, float y, int n, float llenas, int col, float maxAncho) {
        n = entre(n, 1, 10);
        float sep = 3 * d, an = Math.min(16 * d, (maxAncho - sep * (n - 1)) / n), al = 3.5f * d;
        for (int i = 0; i < n; i++) {
            RectF rr = new RectF(x + i * (an + sep), y, x + i * (an + sep) + an, y + al);
            c.drawRoundRect(rr, al / 2f, al / 2f, pincel(i < Math.round(llenas) ? pastel(col) : RAYA));
        }
    }

    private static void aLaDerecha(Canvas c, String s, float x, float y, Paint p) {
        c.drawText(s, x - p.measureText(s), y, p);
    }

    /**
     * @param hoy     la fecha de hoy (AAAA-MM-DD); en una vista previa, la del estado de muestra
     * @param tomas   las tomas de hoy: { id: [n, t] }
     * @param vivo    el descanso en curso (Descanso.leer) o null
     * @param indice  para "sup1": cuál de los suplementos le toca a este widget
     * @param quieto  true en una vista previa: el reloj se dibuja en la imagen
     */
    public static Plano plano(Context ctx, String tipo, int w, int h, JSONObject estado, String hoy, JSONObject tomas, JSONObject vivo, int indice, boolean quieto) {
        fuentes(ctx);
        float d = ctx.getResources().getDisplayMetrics().density;
        w = Math.max(w, 8);
        h = Math.max(h, 8);
        Plano p = new Plano();
        p.bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(p.bmp);
        float r = radio(ctx, d, w, h);
        if (estado == null) estado = new JSONObject();
        if (tomas == null) tomas = new JSONObject();
        if ("lista".equals(tipo)) lista(c, p, w, h, d, r, estado, hoy);
        else if ("mes".equals(tipo)) mes(c, p, w, h, d, r, estado, hoy);
        else if ("columnas".equals(tipo)) columnas(c, p, w, h, d, r, estado, hoy);
        else if ("record".equals(tipo)) record(c, p, w, h, d, r, estado, hoy);
        else if ("racha".equals(tipo)) racha(c, p, w, h, d, r, estado, hoy);
        else if ("sup7".equals(tipo)) supSemana(c, p, w, h, d, r, estado, tomas, hoy);
        else if ("sup".equals(tipo) || "sup1".equals(tipo)) suplementos(c, p, w, h, d, r, estado, tomas, "sup1".equals(tipo), indice);
        else if ("descanso".equals(tipo)) descanso(c, p, w, h, d, r, estado, vivo, hoy, quieto);
        else if ("tira".equals(tipo)) tira(c, p, w, h, d, r, estado, hoy);
        else empezar(c, p, w, h, d, r, estado, hoy);
        return p;
    }

    // ══ LAS FORMAS ══════════════════════════════════════════════════════
    // En una caja de 24 × 24, como los SVG de la app.
    static void icono(Canvas c, String forma, float cx, float cy, float tam, int color) {
        float s = tam / 24f;
        c.save();
        c.translate(cx - tam / 2f, cy - tam / 2f);
        c.scale(s, s);
        Paint f = pincel(color);
        Paint t = trazo(color, 2f);
        Path q = new Path();
        if ("scoop".equals(forma)) {
            q.moveTo(3, 9); q.lineTo(14, 9); q.lineTo(14, 12.5f);
            q.arcTo(new RectF(3, 7, 14, 18), 0, 180);
            q.close();
            c.drawPath(q, f);
            t.setStrokeWidth(2.4f);
            c.drawLine(14.5f, 10.5f, 21, 10.5f, t);
        } else if ("pastilla".equals(forma)) {
            c.drawCircle(12, 12, 8, t);
            c.drawLine(6.5f, 17.5f, 17.5f, 6.5f, t);
        } else if ("shaker".equals(forma)) {
            q.moveTo(7, 8.5f); q.lineTo(17, 8.5f); q.lineTo(16, 21); q.lineTo(8, 21); q.close();
            f.setPathEffect(new CornerPathEffect(1f));
            c.drawPath(q, f);
            f.setPathEffect(null);
            c.drawRoundRect(new RectF(6, 4.5f, 18, 7.5f), 1, 1, f);
            c.drawRoundRect(new RectF(10, 2, 14, 4.5f), 1, 1, f);
        } else if ("gota".equals(forma)) {
            q.moveTo(12, 3);
            q.cubicTo(15.5f, 7.3f, 18, 10.4f, 18, 13.6f);
            q.arcTo(new RectF(6, 7.6f, 18, 19.6f), 0, 180);
            q.cubicTo(6, 10.4f, 8.5f, 7.3f, 12, 3);
            q.close();
            c.drawPath(q, f);
        } else if ("play".equals(forma)) {
            q.moveTo(8, 5); q.lineTo(8, 19); q.lineTo(19, 12); q.close();
            f.setPathEffect(new CornerPathEffect(1.6f));
            c.drawPath(q, f);
        } else if ("pausa".equals(forma)) {
            c.drawRoundRect(new RectF(6.5f, 5.5f, 10.5f, 18.5f), 1.3f, 1.3f, f);
            c.drawRoundRect(new RectF(13.5f, 5.5f, 17.5f, 18.5f), 1.3f, 1.3f, f);
        } else if ("cruz".equals(forma)) {
            t.setStrokeWidth(2.4f);
            c.drawLine(7, 7, 17, 17, t);
            c.drawLine(17, 7, 7, 17, t);
        } else if ("tilde".equals(forma)) {
            t.setStrokeWidth(2.7f);
            q.moveTo(5.5f, 12.5f); q.lineTo(10, 17); q.lineTo(18.5f, 7.5f);
            c.drawPath(q, t);
        } else if ("reinicio".equals(forma)) {
            t.setStrokeWidth(2.3f);
            c.drawArc(new RectF(5, 5, 19, 19), -50, 300, false, t);
            q.moveTo(13.2f, 4.2f); q.lineTo(9.9f, 8.1f); q.lineTo(8.3f, 3.2f); q.close();
            f.setPathEffect(new CornerPathEffect(0.8f));
            c.drawPath(q, f);
        } else { // la cápsula: mitad llena, mitad contorno
            c.rotate(-35, 12, 12);
            RectF rr = new RectF(2.5f, 8, 21.5f, 16);
            c.save();
            c.clipRect(2.5f, 7, 12, 17);
            c.drawRoundRect(rr, 4, 4, f);
            c.restore();
            c.drawRoundRect(rr, 4, 4, t);
        }
        c.restore();
    }

    // ══ SUPLEMENTOS ═════════════════════════════════════════════════════
    private static int tomadas(JSONObject tomas, String id) {
        JSONArray a = tomas.optJSONArray(id);
        return a == null ? 0 : Math.max(0, a.optInt(0, 0));
    }

    /** El aro de un suplemento con su nombre debajo, centrado en cx. */
    private static void dosis(Canvas c, float d, JSONObject x, int tom, float cx, float cy, float r, float ancho) {
        int col = color(x.optString("color", ""), ACENTO);
        int total = Math.max(1, x.optInt("dosis", 1));
        boolean lleno = tom >= total;
        if (lleno) {
            c.drawCircle(cx, cy, r, pincel(pastel(col)));
        } else {
            c.drawCircle(cx, cy, r, pincel(HUNDIDO));
            c.drawCircle(cx, cy, r - 0.75f * d, trazo(RAYA, 1.5f * d));
            if (tom > 0) c.drawArc(new RectF(cx - r + 1.5f * d, cy - r + 1.5f * d, cx + r - 1.5f * d, cy + r - 1.5f * d), -90, 360f * tom / total, false, trazo(pastel(col), 3 * d));
        }
        icono(c, x.optString("forma", "capsula"), cx, cy, r * 1.08f, lleno ? TINTA : 0xFFC9CCD2);
        String nombre = x.optString("nombre", "");
        if (!lleno && total > 1 && tom > 0) nombre = nombre + " " + tom + "/" + total;
        Paint pn = texto(lleno ? 0xFFE6E6E2 : SUAVE, 10.5f * d, TEXTO);
        alCentro(c, encajar(pn, nombre, ancho - 4 * d, 9 * d), cx, cy + r + 14 * d, pn);
    }

    private static void suplementos(Canvas c, Plano p, int w, int h, float d, float r, JSONObject estado, JSONObject tomas, boolean uno, int indice) {
        JSONObject s = estado.optJSONObject("sup");
        JSONArray lista = s == null ? null : s.optJSONArray("lista");
        int n = lista == null ? 0 : lista.length();
        boolean chico = uno || w < 115 * d;
        float m = 14 * d;
        if (n == 0 || (uno && indice >= n)) {
            // Sin suplementos cargados (o un bloque de más): lleva a cargarlos.
            fondo(c, w, h, d, r, 0);
            p.raiz = "abrir:suplementos";
            if (chico) {
                icono(c, "capsula", w / 2f, h / 2f - 8 * d, Math.min(28 * d, w * 0.4f), SUAVE);
                Paint pt = texto(SUAVE, 10.5f * d, TEXTO);
                alCentro(c, encajar(pt, n == 0 ? "Cargar" : "Agregar", w - 8 * d, 9 * d), w / 2f, h / 2f + 20 * d, pt);
            } else {
                float cy = h / 2f;
                c.drawCircle(m + 21 * d, cy, 21 * d, pincel(HUNDIDO));
                icono(c, "capsula", m + 21 * d, cy, 23 * d, 0xFFC9CCD2);
                c.drawText("Suplementos", m + 54 * d, cy - 4 * d, texto(SUAVE, 11.5f * d, TEXTO));
                Paint pt = texto(FUERTE, 16 * d, ANGOSTA);
                c.drawText(encajar(pt, "Tocá para cargar los tuyos", w - m - 54 * d - m, 11 * d), m + 54 * d, cy + 14 * d, pt);
            }
            return;
        }
        if (chico) {
            // Un bloque: un solo suplemento, y todo el bloque es el botón.
            JSONObject x = lista.optJSONObject(uno ? indice : 0);
            if (x == null) x = new JSONObject();
            int col = color(x.optString("color", ""), ACENTO);
            int total = Math.max(1, x.optInt("dosis", 1));
            int tom = tomadas(tomas, x.optString("id", ""));
            boolean lleno = tom >= total;
            if (lleno) fondo(c, w, h, d, r, pastel(col), pastel(col), pastel(col));
            else fondo(c, w, h, d, r, tom > 0 ? col : 0);
            float tam = Math.min(32 * d, Math.min(w, h) * 0.42f);
            float cy = h / 2f - 9 * d;
            if (!lleno && tom > 0) {
                float ra = tam * 0.78f;
                c.drawCircle(w / 2f, cy, ra, trazo(RAYA, 2 * d));
                c.drawArc(new RectF(w / 2f - ra, cy - ra, w / 2f + ra, cy + ra), -90, 360f * tom / total, false, trazo(pastel(col), 3 * d));
                tam *= 0.8f;
            }
            icono(c, x.optString("forma", "capsula"), w / 2f, cy, tam, lleno ? TINTA : 0xFFD3D6DB);
            String nombre = x.optString("nombre", "");
            if (!lleno && total > 1) nombre = nombre + " " + tom + "/" + total;
            Paint pn = texto(lleno ? 0xFF1C2A27 : SUAVE, 11 * d, TEXTO);
            alCentro(c, encajar(pn, nombre, w - 10 * d, 9 * d), w / 2f, Math.min(h - 9 * d, cy + tam * 0.78f + 15 * d), pn);
            p.filas = 1;
            p.cols[0] = 1;
            p.acciones[0] = "sup:" + x.optString("id", "");
            return;
        }
        fondo(c, w, h, d, r, 0);
        p.raiz = "abrir:suplementos";
        float lat = 8 * d;
        if (h < 140 * d) {
            // Una fila: los que entren, hasta cinco.
            int k = Math.min(n, entre((int) ((w - 2 * lat) / (58 * d)), 1, 5));
            float cw = (w - 2 * lat) / k;
            float ra = Math.max(12 * d, Math.min(21 * d, (h - 32 * d) / 2f));
            float cy = h / 2f - 8 * d;
            for (int i = 0; i < k; i++) {
                JSONObject x = lista.optJSONObject(i);
                if (x == null) continue;
                dosis(c, d, x, tomadas(tomas, x.optString("id", "")), lat + cw * (i + 0.5f), cy, ra, cw);
                p.acciones[i] = "sup:" + x.optString("id", "");
            }
            p.filas = 1;
            p.cols[0] = k;
            p.pl = p.pr = Math.round(lat);
            return;
        }
        // Un cuadrado (o más): arriba cuántos llevás, y abajo de a dos filas.
        int hechos = 0;
        for (int i = 0; i < n; i++) {
            JSONObject x = lista.optJSONObject(i);
            if (x != null && tomadas(tomas, x.optString("id", "")) >= Math.max(1, x.optInt("dosis", 1))) hechos++;
        }
        Paint pc = texto(SUAVE, 11.5f * d, TEXTO);
        c.drawText(encajar(pc, "Suplementos · " + hechos + " de " + n, w - 2 * m, 9.5f * d), m, m + 9 * d, pc);
        float top = 30 * d, bot = 6 * d;
        int porFila = entre((int) ((w - 2 * lat) / (62 * d)), 2, 5);
        int k = Math.min(n, porFila * 2);
        int filas = k > porFila ? 2 : 1;
        int enLaPrimera = filas == 2 ? (k + 1) / 2 : k;
        float fh = (h - top - bot) / filas;
        float ra = Math.max(12 * d, Math.min(22 * d, (fh - 28 * d) / 2f));
        for (int i = 0; i < k; i++) {
            int fila = i < enLaPrimera ? 0 : 1;
            int enEsta = fila == 0 ? enLaPrimera : k - enLaPrimera;
            int col = fila == 0 ? i : i - enLaPrimera;
            float cw = (w - 2 * lat) / enEsta;
            JSONObject x = lista.optJSONObject(i);
            if (x == null) continue;
            dosis(c, d, x, tomadas(tomas, x.optString("id", "")), lat + cw * (col + 0.5f), top + fh * (fila + 0.5f) - 8 * d, ra, cw);
            p.acciones[fila * 5 + col] = "sup:" + x.optString("id", "");
        }
        p.filas = filas;
        p.cols[0] = enLaPrimera;
        p.cols[1] = k - enLaPrimera;
        p.pl = p.pr = Math.round(lat);
        p.pt = Math.round(top);
        p.pb = Math.round(bot);
    }

    // ══ EMPEZAR A ENTRENAR ══════════════════════════════════════════════
    /** Una píldora con su ícono y su texto; devuelve el ancho. */
    private static float pildora(Canvas c, float d, float x, float cy, String forma, String rotulo, int col, boolean desdeLaDerecha) {
        Paint pt = texto(mezcla(col, TINTA, 0.16f), 14 * d, ANGOSTA);
        float alto = 40 * d, ancho = pt.measureText(rotulo) + 46 * d;
        float x0 = desdeLaDerecha ? x - ancho : x;
        c.drawRoundRect(new RectF(x0, cy - alto / 2f, x0 + ancho, cy + alto / 2f), alto / 2f, alto / 2f, pincel(pastel(col)));
        icono(c, forma, x0 + 21 * d, cy, 15 * d, pt.getColor());
        c.drawText(rotulo, x0 + 32 * d, cy + 5 * d, pt);
        return ancho;
    }

    private static void pildoraAncha(Canvas c, float d, float x0, float x1, float cy, String forma, String rotulo, int col) {
        Paint pt = texto(mezcla(col, TINTA, 0.16f), 15 * d, ANGOSTA);
        float alto = 42 * d;
        c.drawRoundRect(new RectF(x0, cy - alto / 2f, x1, cy + alto / 2f), alto / 2f, alto / 2f, pincel(pastel(col)));
        float sx = (x0 + x1 - pt.measureText(rotulo) - 20 * d) / 2f;
        icono(c, forma, sx + 7 * d, cy, 15 * d, pt.getColor());
        c.drawText(rotulo, sx + 20 * d, cy + 5.5f * d, pt);
    }

    private static void empezar(Canvas c, Plano p, int w, int h, float d, float r, JSONObject estado, String hoy) {
        float m = 14 * d, cy = h / 2f;
        boolean uno = w < 115 * d, dos = w < 215 * d, alto = h >= 140 * d;
        JSONArray agenda = estado.optJSONArray("agenda");
        JSONObject e = null;
        int idx = -1;
        for (int i = 0; agenda != null && i < agenda.length(); i++) {
            JSONObject a = agenda.optJSONObject(i);
            if (a != null && hoy.equals(a.optString("f"))) { e = a; idx = i; break; }
        }
        if (e == null) {
            // Hace más de una semana que no se abre la app (o nunca): no hay agenda.
            fondo(c, w, h, d, r, 0);
            Paint pt = texto(FUERTE, (uno ? 13 : 18) * d, ANGOSTA);
            if (uno) {
                icono(c, "play", w / 2f, cy - 8 * d, 24 * d, SUAVE);
                alCentro(c, encajar(pt, "Abrir", w - 8 * d, 9 * d), w / 2f, cy + 22 * d, pt);
            } else {
                c.drawText("Modus Fit", m, cy - 5 * d, texto(SUAVE, 11.5f * d, TEXTO));
                c.drawText(encajar(pt, "Abrí la app para ver tu día", w - 2 * m, 11 * d), m, cy + 15 * d, pt);
            }
            return;
        }
        String dia = e.optString("dia", "");
        String key = e.optString("key", "");
        if (key.isEmpty()) {
            // Día de descanso: qué viene después, con su color.
            String sigue = "", cuando = "", tituloSig = "";
            int colSig = 0;
            for (int j = idx + 1; j < agenda.length(); j++) {
                JSONObject a = agenda.optJSONObject(j);
                if (a != null && !a.optString("key", "").isEmpty()) {
                    cuando = j == idx + 1 ? "Mañana" : "El " + a.optString("dia", "");
                    tituloSig = a.optString("titulo", "");
                    sigue = cuando + ", " + tituloSig;
                    colSig = color(a.optString("color", ""), ACENTO);
                    break;
                }
            }
            fondo(c, w, h, d, r, 0);
            Paint pt = texto(0xFFC9CBD0, (uno ? 14 : alto ? 26 : 21) * d, ANGOSTA);
            if (uno) {
                alCentro(c, "Hoy", w / 2f, cy - 6 * d, texto(SUAVE, 10.5f * d, TEXTO));
                alCentro(c, encajar(pt, "Descanso", w - 8 * d, 9 * d), w / 2f, cy + 12 * d, pt);
            } else if (alto) {
                c.drawText("Hoy, " + dia, m, m + 10 * d, texto(SUAVE, 11.5f * d, TEXTO));
                c.drawText("Descanso", m, m + 40 * d, pt);
                if (!sigue.isEmpty()) {
                    c.drawText(cuando, m, h - m - 20 * d, texto(SUAVE, 11.5f * d, TEXTO));
                    Paint pg = texto(mezcla(pastel(colSig), GRIS, 0.75f), 19 * d, ANGOSTA);
                    c.drawText(encajar(pg, tituloSig, w - 2 * m, 12 * d), m, h - m, pg);
                }
            } else if (dos || sigue.isEmpty()) {
                c.drawText("Hoy, " + dia, m, cy - 7 * d, texto(SUAVE, 11.5f * d, TEXTO));
                c.drawText("Descanso", m, cy + 16 * d, pt);
            } else {
                // A la derecha, lo que viene: cuándo y qué, en su color.
                Paint pg = texto(mezcla(pastel(colSig), GRIS, 0.75f), 19 * d, ANGOSTA);
                float ancho = Math.min(w * 0.42f, Math.max(pg.measureText(tituloSig), 60 * d));
                String ts = encajar(pg, tituloSig, ancho, 12 * d);
                aLaDerecha(c, cuando, w - m, cy - 7 * d, texto(SUAVE, 11.5f * d, TEXTO));
                aLaDerecha(c, ts, w - m, cy + 15 * d, pg);
                c.drawText("Hoy, " + dia, m, cy - 7 * d, texto(SUAVE, 11.5f * d, TEXTO));
                c.drawText(encajar(pt, "Descanso", w - 2 * m - ancho - 12 * d, 12 * d), m, cy + 16 * d, pt);
            }
            return;
        }
        int col = color(e.optString("color", ""), ACENTO);
        fondo(c, w, h, d, r, col);
        String titulo = e.optString("titulo", "");
        int ej = e.optInt("ej", 0), min = e.optInt("min", 0), series = e.optInt("series", 0);
        JSONObject ahora = hoy.equals(estado.optString("fecha")) ? estado.optJSONObject("ahora") : null;
        boolean sesion = ahora != null && ahora.optBoolean("sesion", false);
        boolean listo = ahora != null && ahora.optBoolean("listo", false) && !sesion;
        int hechas = ahora == null ? 0 : ahora.optInt("hechas", 0);
        float llenas = listo ? ej : series > 0 ? (float) ej * Math.min(hechas, series) / series : 0;
        p.raiz = listo || sesion ? "abrir:rutina" : "abrir:iniciar:" + hoy + ":" + key;
        String forma = listo ? "tilde" : "play";
        String boton = listo ? "Listo" : sesion ? "Seguir" : "Empezar";
        String detalle = sesion ? hechas + " de " + series + " series" : (ej > 0 ? ej + (ej == 1 ? " ejercicio" : " ejercicios") : "") + (min > 0 ? " · " + min + " min" : "");

        if (uno) {
            float ra = Math.min(18 * d, w * 0.26f), by = cy - 9 * d;
            if (listo) c.drawCircle(w / 2f, by, ra - d, trazo(pastel(col), 2 * d));
            else c.drawCircle(w / 2f, by, ra, pincel(pastel(col)));
            icono(c, forma, w / 2f + (listo ? 0 : d), by, ra * 1.0f, listo ? pastel(col) : mezcla(col, TINTA, 0.16f));
            Paint pt = texto(FUERTE, 12 * d, ANGOSTA);
            alCentro(c, encajar(pt, titulo, w - 8 * d, 9 * d), w / 2f, by + ra + 15 * d, pt);
            return;
        }
        if (alto) {
            c.drawText(sesion ? "En curso" : "Hoy, " + dia, m, m + 10 * d, texto(SUAVE, 11.5f * d, TEXTO));
            Paint pt = texto(FUERTE, 30 * d, ANGOSTA);
            String t = encajar(pt, titulo, w - 2 * m, 15 * d);
            float yt = m + 14 * d + pt.getTextSize();
            c.drawText(t, m, yt, pt);
            if (ej > 0) rayitas(c, d, m, yt + 9 * d, ej, llenas, col, w - 2 * m);
            Paint ps = texto(SUAVE, 12 * d, TEXTO);
            if (!detalle.isEmpty()) c.drawText(encajar(ps, detalle.startsWith(" · ") ? detalle.substring(3) : detalle, w - 2 * m, 9.5f * d), m, yt + 30 * d, ps);
            float by = h - 11 * d - 21 * d;
            if (listo) {
                c.drawCircle(m + 16 * d, by, 15 * d, trazo(pastel(col), 2 * d));
                icono(c, "tilde", m + 16 * d, by, 16 * d, pastel(col));
                c.drawText("Listo por hoy", m + 40 * d, by + 5 * d, texto(FUERTE, 14 * d, ANGOSTA));
            } else {
                pildoraAncha(c, d, 11 * d, w - 11 * d, by, forma, boton, col);
            }
            return;
        }
        if (dos) {
            float ra = 20 * d, bx = w - 12 * d - ra;
            if (listo) c.drawCircle(bx, cy, ra - d, trazo(pastel(col), 2 * d));
            else c.drawCircle(bx, cy, ra, pincel(pastel(col)));
            icono(c, forma, bx + (listo ? 0 : d), cy, 18 * d, listo ? pastel(col) : mezcla(col, TINTA, 0.16f));
            float libre = bx - ra - 8 * d - m;
            c.drawText(sesion ? "En curso" : listo ? "Listo" : "Hoy", m, cy - 13 * d, texto(SUAVE, 11.5f * d, TEXTO));
            Paint pt = texto(FUERTE, 20 * d, ANGOSTA);
            c.drawText(encajar(pt, titulo, libre, 11 * d), m, cy + 8 * d, pt);
            if (ej > 0) rayitas(c, d, m, cy + 17 * d, ej, llenas, col, libre);
            return;
        }
        // Una fila: lo de hoy a la izquierda y el botón a la derecha.
        float usado;
        if (listo) {
            float ra = 19 * d, bx = w - m - ra;
            c.drawCircle(bx, cy, ra - d, trazo(pastel(col), 2 * d));
            icono(c, "tilde", bx, cy, 18 * d, pastel(col));
            usado = 2 * ra;
        } else {
            usado = pildora(c, d, w - m, cy, forma, boton, col, true);
        }
        float libre = w - 2 * m - usado - 10 * d;
        Paint ps = texto(SUAVE, 11.5f * d, TEXTO);
        String arriba = sesion ? "En curso · " + detalle : listo ? "Hoy, " + dia + " · listo" : "Hoy, " + dia + (detalle.isEmpty() ? "" : detalle.startsWith(" · ") ? detalle : " · " + detalle);
        if (ps.measureText(arriba) > libre && !sesion && !listo) arriba = "Hoy, " + dia + (ej > 0 ? " · " + ej + " ej." : "");
        c.drawText(encajar(ps, arriba, libre, 9.5f * d), m, cy - 14 * d, ps);
        Paint pt = texto(FUERTE, 23 * d, ANGOSTA);
        c.drawText(encajar(pt, titulo, libre, 12 * d), m, cy + 9 * d, pt);
        if (ej > 0) rayitas(c, d, m, cy + 18 * d, ej, llenas, col, libre);
    }

    // ══ LA RUTINA DE HOY ════════════════════════════════════════════════
    /** Lo de hoy con sus ejercicios: el nombre, una rayita por serie y la carga. */
    private static void lista(Canvas c, Plano p, int w, int h, float d, float r, JSONObject estado, String hoy) {
        JSONArray agenda = estado.optJSONArray("agenda");
        JSONObject e = delDia(agenda, hoy);
        if (e == null || h < 140 * d || w < 215 * d) { empezar(c, p, w, h, d, r, estado, hoy); return; }
        float m = 15 * d;
        int idx = 0;
        for (int i = 0; i < agenda.length(); i++) if (agenda.optJSONObject(i) == e) idx = i;
        String dia = e.optString("dia", ""), key = e.optString("key", "");
        float y0 = m + 47 * d, fh = 20.5f * d;
        int filas = Math.max(1, (int) ((h - y0 - 6 * d) / fh));
        fh = (h - y0 - 6 * d) / filas;
        if (key.isEmpty()) {
            // Descanso: los días que vienen, cada uno en su color.
            fondo(c, w, h, d, r, 0);
            c.drawText("Hoy, " + dia, m, m + 6 * d, texto(SUAVE, 11.5f * d, TEXTO));
            c.drawText("Descanso", m, m + 30 * d, texto(0xFFC9CBD0, 23 * d, ANGOSTA));
            filas = Math.max(1, (int) ((h - y0 - 6 * d) / (25 * d)));
            fh = Math.min(30 * d, (h - y0 - 6 * d) / filas);
            int n = 0;
            for (int j = idx + 1; j < agenda.length() && n < filas; j++) {
                JSONObject a = agenda.optJSONObject(j);
                if (a == null || a.optString("key", "").isEmpty()) continue;
                float y = y0 + fh * n;
                c.drawLine(m, y, w - m, y, trazo(0x14FFFFFF, d));
                float base = y + fh / 2f + 4.5f * d;
                String cuando = j == idx + 1 ? "Mañana" : a.optString("dia", "");
                if (!cuando.isEmpty()) cuando = cuando.substring(0, 1).toUpperCase() + cuando.substring(1);
                Paint pg = texto(mezcla(pastel(color(a.optString("color", ""), ACENTO)), GRIS, 0.75f), 15 * d, ANGOSTA);
                String ts = encajar(pg, a.optString("titulo", ""), w * 0.4f, 11 * d);
                aLaDerecha(c, ts, w - m, base, pg);
                c.drawText(cuando, m, base, texto(CLARO, 12.5f * d, TEXTO));
                int ej = a.optInt("ej", 0), min = a.optInt("min", 0);
                Paint pd = texto(TENUE, 11.5f * d, TEXTO);
                String det = (ej > 0 ? ej + " ej." : "") + (min > 0 ? " · " + min + " min" : "");
                if (w >= 300 * d) c.drawText(det, m + 82 * d, base, pd);
                n++;
            }
            return;
        }
        int col = color(e.optString("color", ""), ACENTO);
        fondo(c, w, h, d, r, col);
        String titulo = e.optString("titulo", "");
        int ej = e.optInt("ej", 0), min = e.optInt("min", 0), series = e.optInt("series", 0);
        JSONObject ahora = hoy.equals(estado.optString("fecha")) ? estado.optJSONObject("ahora") : null;
        boolean sesion = ahora != null && ahora.optBoolean("sesion", false);
        boolean listo = ahora != null && ahora.optBoolean("listo", false) && !sesion;
        int hechas = ahora == null ? 0 : ahora.optInt("hechas", 0);
        float llenas = listo ? ej : series > 0 ? (float) ej * Math.min(hechas, series) / series : 0;
        p.raiz = listo || sesion ? "abrir:rutina" : "abrir:iniciar:" + hoy + ":" + key;
        float usado, by = m + 17 * d;
        if (listo) {
            float ra = 18 * d, bx = w - m - ra;
            c.drawCircle(bx, by, ra - d, trazo(pastel(col), 2 * d));
            icono(c, "tilde", bx, by, 17 * d, pastel(col));
            usado = 2 * ra;
        } else {
            usado = pildora(c, d, w - m, by, "play", sesion ? "Seguir" : "Empezar", col, true);
        }
        float libre = w - 2 * m - usado - 10 * d;
        Paint ps = texto(SUAVE, 11.5f * d, TEXTO);
        String arriba = sesion ? "En curso · " + hechas + " de " + series + " series" : listo ? "Hoy, " + dia + " · listo" : "Hoy, " + dia + (min > 0 ? " · " + min + " min" : "");
        c.drawText(encajar(ps, arriba, libre, 9.5f * d), m, m + 6 * d, ps);
        Paint pt = texto(FUERTE, 23 * d, ANGOSTA);
        c.drawText(encajar(pt, titulo, libre, 13 * d), m, m + 29 * d, pt);
        if (ej > 0) rayitas(c, d, m, m + 36 * d, ej, llenas, col, libre);

        JSONArray l = e.optJSONArray("lista");
        int n = l == null ? 0 : l.length();
        int total = Math.max(n, ej);
        if (total <= filas) { filas = Math.max(total, 1); fh = Math.min(30 * d, (h - y0 - 6 * d) / filas); }
        int mostrar = total > filas ? filas - 1 : Math.min(n, filas);
        for (int i = 0; i < mostrar && i < n; i++) {
            JSONObject x = l.optJSONObject(i);
            if (x == null) continue;
            float y = y0 + fh * i, base = y + fh / 2f + 4.5f * d;
            c.drawLine(m, y, w - m, y, trazo(0x14FFFFFF, d));
            String peso = x.optString("p", "");
            int ss = entre(x.optInt("s", 0), 0, 8);
            float xr = w - m;
            if (!peso.isEmpty()) {
                Paint pp = texto(FUERTE, 14 * d, ANGOSTA);
                aLaDerecha(c, peso, xr, base, pp);
                xr -= Math.max(pp.measureText(peso), 50 * d) + 9 * d;
            }
            // Una rayita parada por serie, como en la app.
            for (int k = 0; k < ss; k++) {
                float xx = xr - (ss - k) * 5.5f * d;
                c.drawRoundRect(new RectF(xx, base - 10 * d, xx + 2.5f * d, base), 1.25f * d, 1.25f * d, pincel(0xFF5C6068));
            }
            xr -= ss * 5.5f * d + 10 * d;
            Paint pn = texto(CLARO, 12.5f * d, TEXTO);
            c.drawText(encajar(pn, x.optString("n", ""), xr - m, 10.5f * d), m, base, pn);
        }
        if (total > filas) {
            float y = y0 + fh * (filas - 1), base = y + fh / 2f + 4.5f * d;
            c.drawLine(m, y, w - m, y, trazo(0x14FFFFFF, d));
            int mas = total - (filas - 1);
            c.drawText("y " + mas + " más", m, base, texto(TENUE, 12 * d, TEXTO));
        }
    }

    // ══ DESCANSO RÁPIDO ═════════════════════════════════════════════════
    private static int[] enteros(JSONArray a, int[] porDefecto) {
        if (a == null || a.length() == 0) return porDefecto;
        int[] out = new int[a.length()];
        for (int i = 0; i < out.length; i++) out[i] = Math.max(5, a.optInt(i, 60));
        return out;
    }

    /** k tiempos de menor a mayor: primero los tuyos (corto y largo), después los demás. */
    private static int[] elegir(int[] tiempos, int[] tuyos, int k) {
        java.util.ArrayList<Integer> l = new java.util.ArrayList<>();
        for (int t : tuyos) if (!l.contains(t) && l.size() < k) l.add(t);
        for (int t : tiempos) if (!l.contains(t) && l.size() < k) l.add(t);
        java.util.Collections.sort(l);
        int[] out = new int[l.size()];
        for (int i = 0; i < out.length; i++) out[i] = l.get(i);
        return out;
    }

    private static void chip(Canvas c, float d, RectF rr, String s, float tam) { chip(c, d, rr, s, tam, false); }

    /** La tecla de un tiempo; los dos tuyos (el corto y el largo de Perfil), en el tono. */
    private static void chip(Canvas c, float d, RectF rr, String s, float tam, boolean tuyo) {
        c.drawRoundRect(rr, 14 * d, 14 * d, pincel(tuyo ? mezcla(ACENTO, BOTON, 0.14f) : BOTON));
        c.drawLine(rr.left + 12 * d, rr.top + 0.75f * d, rr.right - 12 * d, rr.top + 0.75f * d, trazo(0x14FFFFFF, d));
        Paint pt = texto(tuyo ? pastel(ACENTO) : FUERTE, tam, ANGOSTA);
        alCentro(c, s, rr.centerX(), rr.centerY() + tam * 0.36f, pt);
    }

    /** El reloj quieto: el aro, lo que falta en el color y, corriendo, el punto de la aguja. */
    private static void aro(Canvas c, float d, float cx, float cy, float ra, float grosor, int tono, boolean entero) {
        c.drawCircle(cx, cy, ra, trazo(0x2EFFFFFF, grosor));
        RectF o = new RectF(cx - ra, cy - ra, cx + ra, cy + ra);
        if (entero) { c.drawCircle(cx, cy, ra, trazo(tono, grosor)); return; }
        c.drawArc(o, -30, 300, false, trazo(tono, grosor));
        double ang = Math.toRadians(60);
        c.drawCircle(cx + (float) (ra * Math.sin(ang)), cy - (float) (ra * Math.cos(ang)), grosor * 0.62f, pincel(FUERTE));
    }

    /** El reloj de pared quieto: el bisel de doce marcas, un cuarto de arco y la aguja. */
    private static void dial(Canvas c, float d, float cx, float cy, float ra) {
        c.drawCircle(cx, cy, ra, trazo(0x30FFFFFF, 2 * d));
        for (int i = 0; i < 12; i++) {
            double a = Math.toRadians(i * 30);
            float s1 = (float) Math.sin(a), c1 = (float) Math.cos(a), r0 = ra - (i % 3 == 0 ? 6.5f : 5f) * d, r1 = ra - 3 * d;
            c.drawLine(cx + r0 * s1, cy - r0 * c1, cx + r1 * s1, cy - r1 * c1, trazo(i % 3 == 0 ? 0x70FFFFFF : 0x38FFFFFF, 1.3f * d));
        }
        c.drawArc(new RectF(cx - ra, cy - ra, cx + ra, cy + ra), -90, 100, false, trazo(pastel(ACENTO), 2.4f * d));
        double a = Math.toRadians(100);
        c.drawLine(cx, cy, cx + (float) ((ra - 8 * d) * Math.sin(a)), cy - (float) ((ra - 8 * d) * Math.cos(a)), trazo(FUERTE, 1.8f * d));
        c.drawCircle(cx, cy, 1.8f * d, pincel(FUERTE));
    }

    private static boolean esTuyo(int[] tuyos, int t) {
        for (int x : tuyos) if (x == t) return true;
        return false;
    }

    private static void redondo(Canvas c, float d, float cx, float cy, float ra, String forma) {
        c.drawCircle(cx, cy, ra, pincel(BOTON));
        icono(c, forma, cx, cy, ra * 0.95f, FUERTE);
    }

    private static void descanso(Canvas c, Plano p, int w, int h, float d, float r, JSONObject estado, JSONObject vivo, String hoy, boolean quieto) {
        fondo(c, w, h, d, r, vivo == null ? 0 : "fin".equals(vivo.optString("estado")) ? VERDE : vivo.has("color") ? (0xFF000000 | vivo.optInt("color", ACENTO)) : ACENTO);
        float m = 14 * d, cy = h / 2f;
        boolean uno = w < 115 * d, dos = w < 215 * d, alto = h >= 140 * d;
        JSONObject cfg = estado.optJSONObject("descanso");
        int[] tiempos = enteros(cfg == null ? null : cfg.optJSONArray("tiempos"), new int[]{60, 90, 120, 180});
        int[] tuyos = enteros(cfg == null ? null : cfg.optJSONArray("tuyos"), new int[]{90, 180});

        if (vivo == null) {
            // Sin descanso: los tiempos para arrancarlo.
            if (uno) {
                Paint pt = texto(FUERTE, 23 * d, ANGOSTA);
                alCentro(c, encajar(pt, reloj(tuyos[0]), w - 10 * d, 12 * d), w / 2f, cy + 2 * d, pt);
                Paint ps = texto(SUAVE, 10.5f * d, TEXTO);
                alCentro(c, encajar(ps, "descanso", w - 8 * d, 9 * d), w / 2f, cy + 19 * d, ps);
                p.filas = 1; p.cols[0] = 1; p.acciones[0] = "descanso:" + tuyos[0];
                return;
            }
            if (!alto) {
                boolean rotulo = w >= 270 * d;
                float x0 = rotulo ? m + 50 * d : 9 * d, x1 = w - 9 * d;
                int[] t = elegir(tiempos, tuyos, entre((int) ((x1 - x0) / (54 * d)), 1, 4));
                if (rotulo) dial(c, d, m + 20 * d, cy, 20 * d);
                float cw = (x1 - x0) / t.length, ch = Math.min(46 * d, h - 20 * d);
                for (int i = 0; i < t.length; i++) {
                    chip(c, d, new RectF(x0 + cw * i + 3 * d, cy - ch / 2f, x0 + cw * (i + 1) - 3 * d, cy + ch / 2f), reloj(t[i]), 17 * d, esTuyo(tuyos, t[i]));
                    p.acciones[i] = "descanso:" + t[i];
                }
                p.filas = 1; p.cols[0] = t.length; p.pl = Math.round(x0); p.pr = Math.round(w - x1);
                return;
            }
            c.drawText("Descanso", m, m + 9 * d, texto(SUAVE, 11.5f * d, TEXTO));
            int[] t = elegir(tiempos, tuyos, 4);
            float top = 30 * d, lat = 9 * d, bot = 9 * d;
            int filas = t.length > 2 ? 2 : 1, porFila = filas == 2 ? (t.length + 1) / 2 : t.length;
            float fh = (h - top - bot) / filas;
            for (int i = 0; i < t.length; i++) {
                int fila = i < porFila ? 0 : 1, enEsta = fila == 0 ? porFila : t.length - porFila, col = fila == 0 ? i : i - porFila;
                float cw = (w - 2 * lat) / enEsta;
                chip(c, d, new RectF(lat + cw * col + 3 * d, top + fh * fila + 3 * d, lat + cw * (col + 1) - 3 * d, top + fh * (fila + 1) - 3 * d), reloj(t[i]), 19 * d, esTuyo(tuyos, t[i]));
                p.acciones[fila * 5 + col] = "descanso:" + t[i];
            }
            p.filas = filas; p.cols[0] = porFila; p.cols[1] = t.length - porFila;
            p.pl = p.pr = Math.round(lat); p.pt = Math.round(top); p.pb = Math.round(bot);
            return;
        }

        // Con un descanso en curso: la cuenta, y pausa (o seguir, o reiniciar) y cerrar.
        long ahora = System.currentTimeMillis();
        String est = vivo.optString("estado", "corre");
        boolean esFin = "fin".equals(est), pausa = "pausa".equals(est);
        long fin = vivo.optLong("fin", ahora);
        int col = vivo.has("color") ? (0xFF000000 | vivo.optInt("color", ACENTO)) : ACENTO;
        int tono = esFin ? VERDE : pausa ? mezcla(col, GRIS, 0.45f) : pastel(col);
        String sigue = vivo.optString("titulo", "");
        String sub = esFin ? "Terminó el descanso" : pausa ? "En pausa" : sigue.isEmpty() ? "Descanso" : sigue;
        String a1 = esFin ? "d:REINICIAR" : pausa ? "d:SEGUIR" : "d:PAUSAR";
        String i1 = esFin ? "reinicio" : pausa ? "play" : "pausa";
        String fijo = pausa ? reloj(vivo.optInt("restante", 0)) : esFin ? "+" + reloj((ahora - fin) / 1000) : reloj(Math.round((fin - ahora) / 1000.0));
        boolean enVivo = !pausa && !quieto;
        float tam;
        RectF caja;
        p.raiz = "abrir:rutina";

        if (uno) {
            tam = Math.min(22 * d, w * 0.3f);
            caja = new RectF(2 * d, cy - 22 * d, w - 2 * d, cy + 8 * d);
            Paint ps = texto(esFin ? VERDE : SUAVE, 10.5f * d, TEXTO);
            alCentro(c, encajar(ps, esFin ? "terminó" : pausa ? "en pausa" : "descanso", w - 8 * d, 9 * d), w / 2f, cy + 22 * d, ps);
            p.filas = 1; p.cols[0] = 1; p.acciones[0] = esFin ? "d:CERRAR" : a1;
        } else if (alto) {
            float ra = Math.min((w - 2 * m) / 2f, (h - m - 62 * d) / 2f) - 3 * d;
            float ry = m + ra + 3 * d;
            aro(c, d, w / 2f, ry, ra, 6 * d, tono, esFin || pausa);
            for (int i = 0; i < 12; i++) {
                double an = Math.toRadians(i * 30);
                float s1 = (float) Math.sin(an), c1 = (float) Math.cos(an), r0 = ra - 11 * d, r1 = ra - 7.5f * d;
                c.drawLine(w / 2f + r0 * s1, ry - r0 * c1, w / 2f + r1 * s1, ry - r1 * c1, trazo(i % 3 == 0 ? 0x66FFFFFF : 0x30FFFFFF, 1.3f * d));
            }
            tam = Math.min(27 * d, ra * 0.56f);
            caja = new RectF(w / 2f - ra + 8 * d, ry - tam, w / 2f + ra - 8 * d, ry + tam);
            float by = h - 12 * d - 19 * d;
            redondo(c, d, w / 2f - 26 * d, by, 19 * d, i1);
            redondo(c, d, w / 2f + 26 * d, by, 19 * d, "cruz");
            p.filas = 1; p.cols[0] = 2; p.acciones[0] = a1; p.acciones[1] = "d:CERRAR";
            p.pl = p.pr = Math.round(w / 2f - 52 * d); p.pt = Math.round(by - 24 * d); p.pb = Math.round(h - by - 24 * d);
        } else if (dos) {
            float bx = w - 10 * d - 20 * d;
            redondo(c, d, bx, cy, 20 * d, esFin ? "cruz" : i1);
            tam = 23 * d;
            caja = new RectF(6 * d, cy - 24 * d, bx - 24 * d, cy + 6 * d);
            Paint ps = texto(esFin ? VERDE : SUAVE, 10.5f * d, TEXTO);
            alCentro(c, encajar(ps, esFin ? "Terminó" : pausa ? "En pausa" : "Descanso", caja.width(), 9 * d), caja.centerX(), cy + 21 * d, ps);
            p.filas = 1; p.cols[0] = 1; p.acciones[0] = esFin ? "d:CERRAR" : a1;
            p.pl = Math.round(bx - 26 * d); p.pr = Math.round(4 * d);
        } else {
            float ra = 19 * d, rx = m + ra + 2 * d;
            aro(c, d, rx, cy, ra, 5 * d, tono, esFin || pausa);
            if (esFin) icono(c, "tilde", rx, cy, 17 * d, VERDE);
            tam = 25 * d;
            float tx = rx + ra + 12 * d;
            caja = new RectF(tx, cy - 25 * d, tx + 80 * d, cy + 5 * d);
            float bx = w - m - 20 * d;
            redondo(c, d, bx - 48 * d, cy, 20 * d, i1);
            redondo(c, d, bx, cy, 20 * d, "cruz");
            Paint ps = texto(esFin ? VERDE : SUAVE, 11.5f * d, TEXTO);
            c.drawText(encajar(ps, sub, bx - 76 * d - tx, 9.5f * d), tx + 2 * d, cy + 20 * d, ps);
            p.filas = 1; p.cols[0] = 2; p.acciones[0] = a1; p.acciones[1] = "d:CERRAR";
            p.pl = Math.round(bx - 72 * d); p.pr = Math.round(m - 4 * d);
        }
        if (enVivo) {
            p.crono = true;
            p.cronoBase = SystemClock.elapsedRealtime() + (fin - ahora);
            p.cronoBaja = !esFin;
            p.cronoFormato = esFin ? "+%s" : null;
            p.cronoTam = tam;
            p.cronoColor = esFin ? VERDE : FUERTE;
            p.cl = Math.round(caja.left); p.ct = Math.round(caja.top); p.cr = Math.round(caja.right); p.cb = Math.round(caja.bottom);
        } else {
            Paint pt = texto(esFin ? VERDE : pausa ? 0xFFC9CBD0 : FUERTE, tam, ANGOSTA);
            alCentro(c, encajar(pt, fijo, caja.width(), 11 * d), caja.centerX(), caja.centerY() + tam * 0.36f, pt);
        }
    }

    // ══ LA SEMANA EN UNA TIRA ═══════════════════════════════════════════
    private static void tira(Canvas c, Plano p, int w, int h, float d, float r, JSONObject estado, String hoy) {
        fondo(c, w, h, d, r, AZUL);
        p.raiz = "abrir:progreso";
        float m = 14 * d, cy = h / 2f;
        boolean uno = w < 115 * d, dos = w < 215 * d, alto = h >= 140 * d;
        JSONObject t = estado.optJSONObject("tira");
        String lunes = WidgetAcciones.lunesDe(hoy);
        boolean vigente = t != null && lunes.equals(t.optString("lunes"));
        // La racha que mandó la app vale esta semana y la que sigue; después, se cortó.
        boolean deLaPasada = t != null && WidgetAcciones.masDias(t.optString("lunes", "2000-01-03"), 7).equals(lunes);
        JSONArray dias = vigente ? t.optJSONArray("dias") : null;
        int racha = vigente || deLaPasada ? t.optInt("racha", 0) : 0;
        int hechos = vigente ? t.optInt("hechos", 0) : 0;
        int plan = t == null ? 0 : t.optInt("planeados", 0);
        int hoyIdx = WidgetAcciones.diaDeLaSemana(hoy);
        boolean conRacha = racha >= 2;
        String numero = conRacha ? String.valueOf(racha) : String.valueOf(hechos);
        String sufijo = conRacha ? "sem" : plan > 0 ? "de " + plan : "";
        String rotulo = conRacha ? "Racha" : "Semana";

        if (uno) {
            Paint pn = texto(FUERTE, 28 * d, ANGOSTA);
            alCentro(c, numero, w / 2f, cy + 4 * d, pn);
            Paint ps = texto(SUAVE, 10.5f * d, TEXTO);
            alCentro(c, encajar(ps, conRacha ? "semanas" : "esta semana", w - 8 * d, 8.5f * d), w / 2f, cy + 21 * d, ps);
            return;
        }
        float x0 = m, x1 = w - m, arriba, abajo;
        if (alto) {
            c.drawText("Esta semana", m, m + 9 * d, texto(SUAVE, 11.5f * d, TEXTO));
            if (conRacha) {
                Paint pr = texto(FUERTE, 12 * d, ANGOSTA);
                String s = "racha " + racha;
                c.drawText(s, w - m - pr.measureText(s), m + 9 * d, pr);
            }
            float ch = Math.min(72 * d, h - 30 * d - 14 * d);
            arriba = 30 * d + (h - 30 * d - 14 * d - ch) / 2f;
            abajo = arriba + ch;
            x0 = 10 * d; x1 = w - 10 * d;
        } else {
            if (!dos) {
                c.drawText(rotulo, m, cy - 8 * d, texto(SUAVE, 11.5f * d, TEXTO));
                Paint pn = texto(FUERTE, 27 * d, ANGOSTA);
                c.drawText(numero, m, cy + 17 * d, pn);
                if (!sufijo.isEmpty()) c.drawText(sufijo, m + pn.measureText(numero) + 3 * d, cy + 17 * d, texto(SUAVE, 12.5f * d, TEXTO));
                x0 = m + 78 * d;
            } else {
                x0 = 8 * d; x1 = w - 8 * d;
            }
            float ch = Math.min(48 * d, h - 20 * d);
            arriba = cy - ch / 2f;
            abajo = cy + ch / 2f;
        }
        float sep = 4 * d;
        float cw = Math.min(alto ? 60 * d : 36 * d, (x1 - x0 - 6 * sep) / 7f);
        float inicio = dos || alto ? (x0 + x1 - 7 * cw - 6 * sep) / 2f : x1 - 7 * cw - 6 * sep;
        String[] letras = {"L", "M", "M", "J", "V", "S", "D"};
        for (int i = 0; i < 7; i++) {
            JSONObject dia = dias == null ? null : dias.optJSONObject(i);
            int series = dia == null ? 0 : dia.optInt("s", 0);
            boolean esHoy = i == hoyIdx;
            RectF rr = new RectF(inicio + i * (cw + sep), arriba, inicio + i * (cw + sep) + cw, abajo);
            float rd = Math.min(9 * d, cw / 3f);
            if (series > 0) c.drawRoundRect(rr, rd, rd, pincel(mezcla(color(dia.optString("c", ""), ACENTO), GRIS, 0.62f)));
            else c.drawRoundRect(rr, rd, rd, pincel(HUNDIDO));
            if (esHoy) {
                RectF ri = new RectF(rr.left + 0.75f * d, rr.top + 0.75f * d, rr.right - 0.75f * d, rr.bottom - 0.75f * d);
                c.drawRoundRect(ri, rd, rd, trazo(0xFFE6E6E2, 1.5f * d));
            }
            Paint pl = texto(series > 0 ? TINTA : esHoy ? 0xFFE6E6E2 : 0xFF7F838B, Math.min(11 * d, cw * 0.42f), TEXTO);
            pl.setFakeBoldText(true);
            alCentro(c, letras[i], rr.centerX(), rr.top + 14 * d, pl);
            if (series > 0) {
                Paint pn = texto(TINTA, Math.min(14 * d, cw * 0.5f), ANGOSTA);
                alCentro(c, String.valueOf(series), rr.centerX(), rr.bottom - 7 * d, pn);
            } else if (i >= hoyIdx) {
                // Lo que falta de la semana: una raya del color de lo que toca ese día.
                JSONObject a = delDia(estado.optJSONArray("agenda"), WidgetAcciones.masDias(lunes, i));
                if (a != null && !a.optString("key", "").isEmpty()) {
                    float an = cw * 0.46f;
                    c.drawRoundRect(new RectF(rr.centerX() - an / 2f, rr.bottom - 10.5f * d, rr.centerX() + an / 2f, rr.bottom - 7.5f * d), 1.5f * d, 1.5f * d, pincel(mezcla(color(a.optString("color", ""), ACENTO), GRIS, 0.55f)));
                }
            }
        }
    }

    // ══ EL MES ══════════════════════════════════════════════════════════
    private static final String[] MESES = {"Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"};

    private static int numero(String s, int a, int b) {
        try { return Integer.parseInt(s.substring(a, b)); } catch (Exception e) { return 1; }
    }

    private static void celdaMes(Canvas c, float d, RectF rr, String hex, boolean esHoy, boolean futuro, String n) {
        float rd = Math.min(5.5f * d, rr.width() / 3.2f);
        boolean fue = hex != null;
        c.drawRoundRect(rr, rd, rd, pincel(fue ? mezcla(color(hex, ACENTO), GRIS, 0.62f) : futuro ? 0xFF24262B : 0xFF32353B));
        if (esHoy) c.drawRoundRect(new RectF(rr.left + 0.7f * d, rr.top + 0.7f * d, rr.right - 0.7f * d, rr.bottom - 0.7f * d), rd, rd, trazo(0xFFE6E6E2, 1.4f * d));
        if (n != null) {
            Paint pn = texto(fue ? TINTA : esHoy ? 0xFFE6E6E2 : futuro ? 0xFF53565D : TENUE, rr.height() * 0.46f, TEXTO);
            if (fue) pn.setFakeBoldText(true);
            alCentro(c, n, rr.centerX(), rr.centerY() + rr.height() * 0.17f, pn);
        }
    }

    private static void mes(Canvas c, Plano p, int w, int h, float d, float r, JSONObject estado, String hoy) {
        fondo(c, w, h, d, r, AZUL);
        p.raiz = "abrir:progreso";
        float m = 14 * d, cy = h / 2f;
        boolean uno = w < 115 * d, alto = h >= 140 * d, ancho = w >= 215 * d;
        JSONObject t = estado.optJSONObject("mes");
        boolean vig = t != null && hoy.startsWith(t.optString("ym", "x"));
        JSONObject dias = vig ? t.optJSONObject("dias") : null;
        int ses = vig ? t.optInt("ses", 0) : 0;
        int anio = numero(hoy, 0, 4), mesN = entre(numero(hoy, 5, 7), 1, 12), hoyN = numero(hoy, 8, 10);
        Calendar cal = Calendar.getInstance();
        cal.set(anio, mesN - 1, 1, 12, 0, 0);
        int total = cal.getActualMaximum(Calendar.DAY_OF_MONTH);
        int primero = (cal.get(Calendar.DAY_OF_WEEK) + 5) % 7;
        int filas = (primero + total + 6) / 7;
        String nombre = MESES[mesN - 1];
        String cuenta = ses + (ses == 1 ? " sesión" : " sesiones");

        if (uno || (!alto && !ancho)) {
            Paint pn = texto(FUERTE, 28 * d, ANGOSTA);
            float cx = uno ? w / 2f : m + 24 * d;
            alCentro(c, String.valueOf(ses), w / 2f, cy + 3 * d, pn);
            Paint ps = texto(SUAVE, 10.5f * d, TEXTO);
            alCentro(c, encajar(ps, uno ? nombre.toLowerCase() : "en " + nombre.toLowerCase(), w - 8 * d, 8.5f * d), w / 2f, cy + 20 * d, ps);
            return;
        }
        if (!alto) {
            // Una fila: el mes y la cuenta, y los días en dos renglones.
            c.drawText(nombre, m, cy - 8 * d, texto(SUAVE, 11.5f * d, TEXTO));
            Paint pn = texto(FUERTE, 27 * d, ANGOSTA);
            c.drawText(String.valueOf(ses), m, cy + 17 * d, pn);
            c.drawText(ses == 1 ? "sesión" : "ses.", m + pn.measureText(String.valueOf(ses)) + 4 * d, cy + 17 * d, texto(SUAVE, 12 * d, TEXTO));
            int k = (total + 1) / 2;
            float x0 = m + 84 * d, x1 = w - m, sep = 3 * d;
            float cw = Math.min(16 * d, (x1 - x0 - sep * (k - 1)) / k), ch = Math.min(cw * 1.35f, (h - 22 * d - sep) / 2f);
            float inicio = x1 - (k * cw + (k - 1) * sep), top = cy - ch - sep / 2f;
            for (int n = 1; n <= total; n++) {
                int fila = (n - 1) / k, col = (n - 1) % k;
                RectF rr = new RectF(inicio + col * (cw + sep), top + fila * (ch + sep), inicio + col * (cw + sep) + cw, top + fila * (ch + sep) + ch);
                String hex = dias == null ? null : dias.optString(String.valueOf(n), null);
                celdaMes(c, d, rr, hex, n == hoyN, n > hoyN, null);
            }
            return;
        }
        // Un cuadrado (o más): el calendario del mes.
        float gx0 = m, gx1 = ancho ? w - m - 118 * d : w - m, gy1 = h - m + 1 * d;
        c.drawText(nombre, m, m + 11 * d, texto(FUERTE, 16 * d, ANGOSTA));
        if (!ancho) aLaDerecha(c, cuenta, w - m, m + 10 * d, texto(SUAVE, 11 * d, TEXTO));
        float gy0 = m + 21 * d;
        boolean letras = h >= 160 * d;
        float sep = 3.5f * d;
        float lado = Math.min((gx1 - gx0 - 6 * sep) / 7f, (gy1 - gy0 - (letras ? 12 * d : 0) - (filas - 1) * sep) / filas);
        float ox = ancho ? gx0 : gx0 + (gx1 - gx0 - (7 * lado + 6 * sep)) / 2f;
        if (letras) {
            String[] ls = {"L", "M", "M", "J", "V", "S", "D"};
            Paint pl = texto(TENUE, 8.5f * d, TEXTO);
            for (int i = 0; i < 7; i++) alCentro(c, ls[i], ox + i * (lado + sep) + lado / 2f, gy0 + 7 * d, pl);
            gy0 += 12 * d;
        }
        float oy = gy0 + (gy1 - gy0 - (filas * lado + (filas - 1) * sep)) / 2f;
        for (int n = 1; n <= total; n++) {
            int pos = primero + n - 1;
            float x = ox + (pos % 7) * (lado + sep), y = oy + (pos / 7) * (lado + sep);
            String hex = dias == null ? null : dias.optString(String.valueOf(n), null);
            celdaMes(c, d, new RectF(x, y, x + lado, y + lado), hex, n == hoyN, n > hoyN, lado >= 19 * d ? String.valueOf(n) : null);
        }
        if (ancho) {
            float px = ox + 7 * lado + 6 * sep + 24 * d, pr = w - m;
            Paint pn = texto(FUERTE, 42 * d, ANGOSTA);
            c.drawText(String.valueOf(ses), px, m + 42 * d, pn);
            c.drawText(ses == 1 ? "sesión" : "sesiones", px, m + 58 * d, texto(SUAVE, 12 * d, TEXTO));
            int series = vig ? t.optInt("series", 0) : 0, antes = t == null ? 0 : vig ? t.optInt("antes", 0) : 0;
            float y2 = h - m - 2 * d, y1 = y2 - 23 * d;
            c.drawLine(px, y1 + 8 * d, pr, y1 + 8 * d, trazo(0x14FFFFFF, d));
            c.drawText("Series", px, y1, texto(SUAVE, 11.5f * d, TEXTO));
            aLaDerecha(c, String.valueOf(series), pr, y1, texto(FUERTE, 14 * d, ANGOSTA));
            c.drawText("Mes pasado", px, y2, texto(SUAVE, 11.5f * d, TEXTO));
            aLaDerecha(c, String.valueOf(antes), pr, y2, texto(CLARO, 14 * d, ANGOSTA));
        }
    }

    // ══ EL VOLUMEN DE LAS SEMANAS ═══════════════════════════════════════
    private static String miles(long v) {
        String s = String.valueOf(Math.abs(v));
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            if (i > 0 && (s.length() - i) % 3 == 0) b.append('.');
            b.append(s.charAt(i));
        }
        return b.toString();
    }

    private static void barras(Canvas c, float d, float x0, float x1, float top, float bottom, long[] v) {
        long max = 1;
        for (long x : v) max = Math.max(max, x);
        int n = v.length;
        float sep = Math.min(5 * d, (x1 - x0) / (n * 3f)), cw = (x1 - x0 - sep * (n - 1)) / n, rd = Math.min(4 * d, cw / 3f);
        c.drawLine(x0, bottom + 0.5f * d, x1, bottom + 0.5f * d, trazo(0x26FFFFFF, d));
        c.drawLine(x0, top, x1, top, trazo(0x10FFFFFF, d));
        c.drawLine(x0, (top + bottom) / 2f, x1, (top + bottom) / 2f, trazo(0x10FFFFFF, d));
        for (int i = 0; i < n; i++) {
            float x = x0 + i * (cw + sep);
            float al = v[i] <= 0 ? 0 : Math.max(3 * d, (bottom - top) * v[i] / max);
            if (al <= 0) { c.drawRoundRect(new RectF(x, bottom - 2 * d, x + cw, bottom), d, d, pincel(0xFF34363C)); continue; }
            Path q = new Path();
            q.addRoundRect(new RectF(x, bottom - al, x + cw, bottom), new float[]{rd, rd, rd, rd, 0, 0, 0, 0}, Path.Direction.CW);
            c.drawPath(q, pincel(i == n - 1 ? pastel(AZUL) : 0xFF4D5058));
        }
    }

    private static void columnas(Canvas c, Plano p, int w, int h, float d, float r, JSONObject estado, String hoy) {
        fondo(c, w, h, d, r, AZUL);
        p.raiz = "abrir:progreso";
        float m = 14 * d, cy = h / 2f;
        boolean uno = w < 115 * d, dos = w < 215 * d, alto = h >= 140 * d;
        JSONObject t = estado.optJSONObject("semanas");
        long[] v = new long[8];
        String lunes = WidgetAcciones.lunesDe(hoy);
        String u = t == null ? "kg" : t.optString("u", "kg");
        if (t != null) {
            JSONArray a = t.optJSONArray("v");
            String l0 = t.optString("lunes", "");
            int corr = -1;
            for (int k = 0; k < 8 && !l0.isEmpty(); k++) if (WidgetAcciones.masDias(l0, 7 * k).equals(lunes)) { corr = k; break; }
            for (int i = 0; corr >= 0 && a != null && i < 8; i++) v[i] = i + corr < 8 ? Math.max(0, a.optLong(i + corr, 0)) : 0;
        }
        long esta = v[7], pasada = v[6];
        boolean sube = pasada > 0 && esta > pasada;
        String delta = pasada > 0 && esta > 0 ? (esta >= pasada ? "+" : "−") + Math.abs(Math.round((esta - pasada) * 100f / pasada)) + " %" : "";
        if (uno) {
            barras(c, d, 10 * d, w - 10 * d, 12 * d, h - 30 * d, v);
            Paint ps = texto(SUAVE, 10.5f * d, TEXTO);
            alCentro(c, encajar(ps, "volumen", w - 8 * d, 8.5f * d), w / 2f, h - 11 * d, ps);
            return;
        }
        if (!alto) {
            c.drawText(dos ? "Volumen" : "Volumen · semana", m, cy - 8 * d, texto(SUAVE, 11.5f * d, TEXTO));
            Paint pn = texto(FUERTE, (dos ? 20 : 25) * d, ANGOSTA);
            String num = miles(esta);
            float izq = dos ? 72 * d : 112 * d;
            num = encajar(pn, num, izq - 18 * d, 13 * d);
            c.drawText(num, m, cy + 17 * d, pn);
            c.drawText(u, m + pn.measureText(num) + 3 * d, cy + 17 * d, texto(SUAVE, 11.5f * d, TEXTO));
            barras(c, d, m + izq, w - m, 15 * d, h - 15 * d, v);
            return;
        }
        c.drawText("Volumen · semana", m, m + 9 * d, texto(SUAVE, 11.5f * d, TEXTO));
        Paint pn = texto(FUERTE, 29 * d, ANGOSTA);
        String num = encajar(pn, miles(esta), w - 2 * m - 22 * d, 16 * d);
        c.drawText(num, m, m + 40 * d, pn);
        c.drawText(u, m + pn.measureText(num) + 4 * d, m + 40 * d, texto(SUAVE, 12.5f * d, TEXTO));
        if (!delta.isEmpty()) {
            Paint pd = texto(sube ? VERDE : SUAVE, 12 * d, TEXTO);
            if (dos) {
                c.drawText(delta, m, m + 57 * d, pd);
                c.drawText(" contra la pasada", m + pd.measureText(delta), m + 57 * d, texto(TENUE, 11.5f * d, TEXTO));
            } else {
                aLaDerecha(c, delta, w - m, m + 38 * d, texto(sube ? VERDE : SUAVE, 16 * d, ANGOSTA));
                aLaDerecha(c, "contra la pasada", w - m, m + 9 * d, texto(TENUE, 11.5f * d, TEXTO));
            }
        }
        barras(c, d, m, w - m, m + (dos ? 68 : 54) * d, h - m, v);
    }

    // ══ TU ÚLTIMO RÉCORD ════════════════════════════════════════════════
    /** La campana de los récords, en una caja de 24 × 24. */
    private static void campana(Canvas c, float cx, float cy, float tam, int color) {
        float s = tam / 24f;
        c.save();
        c.translate(cx - tam / 2f, cy - tam / 2f);
        c.scale(s, s);
        Paint f = pincel(color);
        Path q = new Path();
        q.moveTo(4.5f, 17.5f); q.lineTo(6.8f, 14.4f); q.lineTo(6.8f, 10.6f);
        q.arcTo(new RectF(6.8f, 5.4f, 17.2f, 15.8f), 180, 180);
        q.lineTo(17.2f, 14.4f); q.lineTo(19.5f, 17.5f); q.close();
        f.setPathEffect(new CornerPathEffect(1.2f));
        c.drawPath(q, f);
        f.setPathEffect(null);
        c.drawCircle(12, 20.2f, 1.9f, f);
        c.drawCircle(12, 4.3f, 1.4f, f);
        c.restore();
    }

    private static int diasEntre(String a, String b) {
        try {
            Calendar x = Calendar.getInstance(), y = Calendar.getInstance();
            x.set(numero(a, 0, 4), numero(a, 5, 7) - 1, numero(a, 8, 10), 12, 0, 0);
            y.set(numero(b, 0, 4), numero(b, 5, 7) - 1, numero(b, 8, 10), 12, 0, 0);
            return (int) Math.round((y.getTimeInMillis() - x.getTimeInMillis()) / 86400000.0);
        } catch (Exception e) { return 0; }
    }

    private static void record(Canvas c, Plano p, int w, int h, float d, float r, JSONObject estado, String hoy) {
        JSONObject t = estado.optJSONObject("record");
        boolean hay = t != null && !t.optString("ej", "").isEmpty() && t.optString("f", "").length() >= 10;
        fondo(c, w, h, d, r, hay ? ORO : 0);
        p.raiz = "abrir:progreso";
        float m = 14 * d, cy = h / 2f;
        boolean uno = w < 115 * d, dos = w < 215 * d, alto = h >= 140 * d;
        int oro = mezcla(ORO, Color.WHITE, 0.82f);
        if (!hay) {
            if (uno) {
                campana(c, w / 2f, cy - 8 * d, 26 * d, 0xFF6A6E76);
                Paint ps = texto(SUAVE, 10.5f * d, TEXTO);
                alCentro(c, encajar(ps, "récords", w - 8 * d, 8.5f * d), w / 2f, cy + 21 * d, ps);
            } else {
                campana(c, m + 12 * d, alto ? m + 12 * d : cy, 24 * d, 0xFF6A6E76);
                float tx = alto ? m : m + 34 * d, ty = alto ? m + 44 * d : cy - 5 * d;
                c.drawText("Récords", tx, ty, texto(SUAVE, 11.5f * d, TEXTO));
                Paint pt = texto(FUERTE, 15 * d, ANGOSTA);
                c.drawText(encajar(pt, "El próximo aparece acá", w - m - tx, 10.5f * d), tx, ty + 19 * d, pt);
            }
            return;
        }
        int n = Math.max(0, diasEntre(t.optString("f"), hoy));
        String cuando = n == 0 ? "hoy" : n == 1 ? "ayer" : n < 60 ? "hace " + n + " días" : "hace " + (n / 30) + " meses";
        String serie = t.optString("serie", ""), ej = t.optString("ej", ""), rm = t.optString("rm", "");
        if (uno) {
            campana(c, w / 2f, cy - 17 * d, 19 * d, oro);
            Paint pt = texto(FUERTE, 14 * d, ANGOSTA);
            alCentro(c, encajar(pt, serie, w - 8 * d, 9.5f * d), w / 2f, cy + 9 * d, pt);
            Paint ps = texto(SUAVE, 10 * d, TEXTO);
            alCentro(c, encajar(ps, ej, w - 8 * d, 8.5f * d), w / 2f, cy + 24 * d, ps);
            return;
        }
        if (alto) {
            campana(c, m + 9 * d, m + 9 * d, 18 * d, oro);
            c.drawText("Récord", m + 24 * d, m + 13 * d, texto(oro, 12.5f * d, TEXTO));
            aLaDerecha(c, cuando, w - m, m + 13 * d, texto(SUAVE, 11.5f * d, TEXTO));
            Paint pt = texto(FUERTE, (dos ? 28 : 34) * d, ANGOSTA);
            String ss = encajar(pt, serie, w - 2 * m, 15 * d);
            float ys = cy + 8 * d;
            c.drawText(ss, m, ys, pt);
            Paint pe = texto(CLARO, 13 * d, TEXTO);
            c.drawText(encajar(pe, ej, w - 2 * m, 10 * d), m, ys + 20 * d, pe);
            if (!rm.isEmpty()) {
                c.drawLine(m, h - m - 21 * d, w - m, h - m - 21 * d, trazo(0x14FFFFFF, d));
                c.drawText("1RM estimado", m, h - m - 2 * d, texto(SUAVE, 11.5f * d, TEXTO));
                aLaDerecha(c, rm, w - m, h - m - 2 * d, texto(oro, 14 * d, ANGOSTA));
            }
            return;
        }
        float der = 0;
        if (!dos && !rm.isEmpty()) {
            Paint pr = texto(oro, 21 * d, ANGOSTA);
            aLaDerecha(c, rm, w - m, cy + 15 * d, pr);
            aLaDerecha(c, "1RM estimado", w - m, cy - 9 * d, texto(SUAVE, 11.5f * d, TEXTO));
            der = Math.max(pr.measureText(rm), 78 * d) + 14 * d;
        }
        float libre = w - 2 * m - der;
        campana(c, m + 7 * d, cy - 21 * d, 14 * d, oro);
        Paint pl = texto(oro, 11.5f * d, TEXTO);
        c.drawText("Récord", m + 18 * d, cy - 17 * d, pl);
        Paint pc = texto(SUAVE, 11.5f * d, TEXTO);
        String cs = " · " + cuando;
        if (m + 18 * d + pl.measureText("Récord") + pc.measureText(cs) <= m + libre) c.drawText(cs, m + 18 * d + pl.measureText("Récord"), cy - 17 * d, pc);
        Paint pt = texto(FUERTE, 23 * d, ANGOSTA);
        c.drawText(encajar(pt, serie, libre, 13 * d), m, cy + 9 * d, pt);
        Paint pe = texto(SUAVE, 11.5f * d, TEXTO);
        c.drawText(encajar(pe, ej, libre, 9.5f * d), m, cy + 26 * d, pe);
    }

    // ══ LA RACHA EN TIZA ════════════════════════════════════════════════
    private static float anchoTiza(int n, float alto) {
        if (n <= 0) return 0;
        float paso = alto * 0.34f, sepG = alto * 0.62f;
        int g = (n - 1) / 5, k = Math.min((n - 1) % 5, 3);
        return g * (3 * paso + sepG) + k * paso + alto * 0.1f;
    }

    /** Palitos de tiza, de a cinco: el quinto cruza a los otros cuatro (como MarcasTiza en la app). */
    private static void tiza(Canvas c, float x, float yb, float alto, int n) {
        float paso = alto * 0.34f, sepG = alto * 0.62f;
        Paint t = trazo(0xE8E9E7DF, Math.max(1.5f, alto * 0.105f));
        for (int i = 0; i < n; i++) {
            int g = i / 5, k = i % 5;
            float gx = x + g * (3 * paso + sepG);
            if (k < 4) {
                float xx = gx + k * paso, ti = ((i * 7) % 3 - 1) * alto * 0.05f;
                c.drawLine(xx + ti, yb - ((i * 3) % 2) * alto * 0.04f, xx - ti * 0.6f + alto * 0.03f, yb - alto + ((i * 5) % 3) * alto * 0.05f, t);
            } else {
                c.drawLine(gx - paso * 0.5f, yb - alto * 0.2f, gx + 3 * paso + paso * 0.5f, yb - alto * 0.82f, t);
            }
        }
    }

    private static void racha(Canvas c, Plano p, int w, int h, float d, float r, JSONObject estado, String hoy) {
        fondo(c, w, h, d, r, 0xFFB9B7AE);
        p.raiz = "abrir:progreso";
        float m = 14 * d, cy = h / 2f;
        boolean uno = w < 115 * d, alto = h >= 140 * d;
        JSONObject t = estado.optJSONObject("tira");
        String lunes = WidgetAcciones.lunesDe(hoy);
        boolean vigente = t != null && lunes.equals(t.optString("lunes"));
        boolean deLaPasada = t != null && WidgetAcciones.masDias(t.optString("lunes", "2000-01-03"), 7).equals(lunes);
        int racha = vigente || deLaPasada ? t.optInt("racha", 0) : 0;
        int hechos = vigente ? t.optInt("hechos", 0) : 0;
        boolean conRacha = racha >= 2;
        int n = conRacha ? racha : hechos;
        String rot = conRacha ? (uno ? "semanas" : "semanas seguidas") : n == 1 ? "vez esta semana" : (uno ? "esta semana" : "veces esta semana");
        if (uno) {
            Paint pn = texto(FUERTE, 26 * d, ANGOSTA);
            alCentro(c, String.valueOf(n), w / 2f, cy - 7 * d, pn);
            int k = Math.min(n, 10);
            float al = 13 * d, an = anchoTiza(k, al);
            if (an > w - 14 * d) { al *= (w - 14 * d) / an; an = anchoTiza(k, al); }
            tiza(c, (w - an) / 2f, cy + 12 * d, al, k);
            Paint ps = texto(SUAVE, 10.5f * d, TEXTO);
            alCentro(c, encajar(ps, rot, w - 8 * d, 8.5f * d), w / 2f, cy + 28 * d, ps);
            return;
        }
        if (alto) {
            c.drawText("Racha", m, m + 9 * d, texto(SUAVE, 11.5f * d, TEXTO));
            Paint pn = texto(FUERTE, 46 * d, ANGOSTA);
            c.drawText(String.valueOf(n), m, m + 56 * d, pn);
            Paint ps = texto(SUAVE, 12 * d, TEXTO);
            c.drawText(encajar(ps, rot, w - 2 * m - pn.measureText(String.valueOf(n)) - 6 * d, 9.5f * d), m + pn.measureText(String.valueOf(n)) + 6 * d, m + 56 * d, ps);
            float al = 26 * d;
            int porFila = 5;
            while (anchoTiza(porFila + 5, al) <= w - 2 * m - 4 * d) porFila += 5;
            int k = Math.min(n, porFila * 2);
            float yb = h - m - (k > porFila ? al + 10 * d : 0) - 2 * d;
            tiza(c, m + 4 * d, yb, al, Math.min(k, porFila));
            if (k > porFila) tiza(c, m + 4 * d, yb + al + 10 * d, al, k - porFila);
            return;
        }
        Paint pn = texto(FUERTE, 30 * d, ANGOSTA);
        String num = String.valueOf(n);
        c.drawText(num, m, cy + 5 * d, pn);
        Paint ps = texto(SUAVE, 11.5f * d, TEXTO);
        float al = 24 * d, izq = Math.max(pn.measureText(num) + 8 * d, 0);
        int k = n;
        while (k > 0 && anchoTiza(k, al) > w - 2 * m - izq - 16 * d) k--;
        c.drawText(encajar(ps, rot, w - 2 * m, 9.5f * d), m, cy + 23 * d, ps);
        tiza(c, w - m - anchoTiza(k, al) - 4 * d, cy + 6 * d, al, k);
    }

    // ══ SUPLEMENTOS, CON SU SEMANA ══════════════════════════════════════
    private static void supSemana(Canvas c, Plano p, int w, int h, float d, float r, JSONObject estado, JSONObject tomasHoy, String hoy) {
        JSONObject s = estado.optJSONObject("sup");
        JSONArray lista = s == null ? null : s.optJSONArray("lista");
        int n = lista == null ? 0 : lista.length();
        if (n == 0 || h < 140 * d || w < 215 * d) { suplementos(c, p, w, h, d, r, estado, tomasHoy, false, 0); return; }
        fondo(c, w, h, d, r, 0);
        p.raiz = "abrir:suplementos";
        JSONObject todas = estado.optJSONObject("_tomas");
        if (todas == null && s != null) todas = s.optJSONObject("tomas");
        if (todas == null) todas = new JSONObject();
        float m = 14 * d;
        int hechos = 0;
        for (int i = 0; i < n; i++) {
            JSONObject x = lista.optJSONObject(i);
            if (x != null && tomadas(tomasHoy, x.optString("id", "")) >= Math.max(1, x.optInt("dosis", 1))) hechos++;
        }
        c.drawText("Suplementos · " + hechos + " de " + n, m, m + 9 * d, texto(SUAVE, 11.5f * d, TEXTO));
        float top = 30 * d, bot = 7 * d;
        int filas = entre(Math.min(n, (int) ((h - top - bot) / (30 * d))), 1, 4);
        float fh = Math.min(42 * d, (h - top - bot) / filas);
        float lado = Math.min(21 * d, fh - 9 * d), sep = 4 * d;
        if (w < 290 * d) { lado = Math.min(lado, 16 * d); sep = 3 * d; }
        float gx = w - m - (7 * lado + 6 * sep);
        String ls = "LMMJVSD";
        String[] fechas = new String[7];
        for (int k = 0; k < 7; k++) {
            fechas[k] = WidgetAcciones.masDias(hoy, k - 6);
            Paint pl = texto(k == 6 ? 0xFFE6E6E2 : TENUE, 9 * d, TEXTO);
            if (k == 6) pl.setFakeBoldText(true);
            alCentro(c, String.valueOf(ls.charAt(WidgetAcciones.diaDeLaSemana(fechas[k]))), gx + k * (lado + sep) + lado / 2f, m + 9 * d, pl);
        }
        for (int i = 0; i < filas; i++) {
            JSONObject x = lista.optJSONObject(i);
            if (x == null) continue;
            String id = x.optString("id", "");
            int col = color(x.optString("color", ""), ACENTO), total = Math.max(1, x.optInt("dosis", 1)), tom = tomadas(tomasHoy, id);
            boolean lleno = tom >= total;
            float cy = top + fh * (i + 0.5f), ra = Math.min(14 * d, fh / 2f - 3 * d), cx = m + ra;
            if (i > 0) c.drawLine(m, top + fh * i, w - m, top + fh * i, trazo(0x10FFFFFF, d));
            if (lleno) {
                c.drawCircle(cx, cy, ra, pincel(pastel(col)));
            } else {
                c.drawCircle(cx, cy, ra, pincel(HUNDIDO));
                c.drawCircle(cx, cy, ra - 0.75f * d, trazo(RAYA, 1.5f * d));
                if (tom > 0) c.drawArc(new RectF(cx - ra + 1.5f * d, cy - ra + 1.5f * d, cx + ra - 1.5f * d, cy + ra - 1.5f * d), -90, 360f * tom / total, false, trazo(pastel(col), 2.6f * d));
            }
            icono(c, x.optString("forma", "capsula"), cx, cy, ra * 1.1f, lleno ? TINTA : 0xFFC9CCD2);
            String nombre = x.optString("nombre", "");
            if (!lleno && total > 1 && tom > 0) nombre = nombre + " " + tom + "/" + total;
            Paint pn = texto(lleno ? 0xFFE6E6E2 : CLARO, 12.5f * d, TEXTO);
            float nx = m + 2 * ra + 9 * d;
            c.drawText(encajar(pn, nombre, gx - nx - 8 * d, 10 * d), nx, cy + 4.5f * d, pn);
            for (int k = 0; k < 7; k++) {
                int tk = tom;
                if (k < 6) {
                    JSONObject delDia = todas.optJSONObject(fechas[k]);
                    tk = delDia == null ? 0 : tomadas(delDia, id);
                }
                RectF rr = new RectF(gx + k * (lado + sep), cy - lado / 2f, gx + k * (lado + sep) + lado, cy + lado / 2f);
                float rd = Math.min(6 * d, lado / 3.2f);
                c.drawRoundRect(rr, rd, rd, pincel(HUNDIDO));
                if (tk >= total) {
                    c.drawRoundRect(rr, rd, rd, pincel(mezcla(col, GRIS, 0.66f)));
                } else if (tk > 0) {
                    c.save();
                    c.clipRect(rr.left, rr.top, rr.left + lado * tk / total, rr.bottom);
                    c.drawRoundRect(rr, rd, rd, pincel(mezcla(col, GRIS, 0.45f)));
                    c.restore();
                }
                if (k == 6 && tk < total) c.drawRoundRect(new RectF(rr.left + 0.7f * d, rr.top + 0.7f * d, rr.right - 0.7f * d, rr.bottom - 0.7f * d), rd, rd, trazo(0xFFE6E6E2, 1.3f * d));
            }
            p.acciones[i * 5] = "sup:" + id;
            p.cols[i] = 1;
        }
        p.filas = filas;
        p.pt = Math.round(top);
        p.pb = Math.round(Math.max(0, h - top - fh * filas));
    }
}
