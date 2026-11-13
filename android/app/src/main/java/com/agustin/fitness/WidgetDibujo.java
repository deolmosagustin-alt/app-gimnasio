package com.agustin.fitness;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Los widgets de Modus Fit (13/11/2026) se dibujan a mano en una imagen: un
 * widget de Android sólo acepta vistas simples, y las piezas de la app (la
 * barra cargada, la tarjeta de fichar, los cajones del ciclo) no lo son.
 * La app manda el estado ya resuelto (TodayWidgetPlugin, clave "estado") y
 * acá sólo se pinta. Tres dibujos: "hoy", "semana" y "ciclo".
 */
public final class WidgetDibujo {
    private WidgetDibujo() {}

    private static final Typeface ANGOSTA = Typeface.create("sans-serif-condensed", Typeface.BOLD);
    private static final Typeface NORMAL = Typeface.create("sans-serif-medium", Typeface.NORMAL);
    private static final Typeface NEGRITA = Typeface.create("sans-serif", Typeface.BOLD);

    static int color(String hex, int porDefecto) {
        try { return hex == null || hex.isEmpty() ? porDefecto : Color.parseColor(hex); } catch (Exception e) { return porDefecto; }
    }

    /** Mezcla a con b: t = cuánto de a (0 a 1). */
    static int mezcla(int a, int b, float t) {
        float u = 1f - t;
        return Color.rgb(Math.round(Color.red(a) * t + Color.red(b) * u), Math.round(Color.green(a) * t + Color.green(b) * u), Math.round(Color.blue(a) * t + Color.blue(b) * u));
    }

    private static Paint pincel(int color) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(color);
        return p;
    }

    private static Paint texto(int color, float tam, Typeface tf) {
        Paint p = pincel(color);
        p.setTextSize(tam);
        p.setTypeface(tf);
        return p;
    }

    /** Achica la letra hasta que el texto entre en el ancho. */
    private static void ajustar(Paint p, String s, float ancho) {
        while (p.getTextSize() > 8f && p.measureText(s) > ancho) p.setTextSize(p.getTextSize() - 1f);
    }

    public static Bitmap dibujar(Context ctx, String tipo, int w, int h, JSONObject estado) {
        float d = ctx.getResources().getDisplayMetrics().density;
        Bitmap bmp = Bitmap.createBitmap(Math.max(w, 2), Math.max(h, 2), Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        JSONObject datos = estado == null ? null : estado.optJSONObject(tipo);
        if ("semana".equals(tipo)) semana(c, w, h, d, datos);
        else if ("ciclo".equals(tipo)) ciclo(c, w, h, d, datos);
        else hoy(c, w, h, d, datos);
        return bmp;
    }

    private static void fondo(Canvas c, int w, int h, float d, int arriba, int abajo, int borde) {
        RectF r = new RectF(0.5f * d, 0.5f * d, w - 0.5f * d, h - 0.5f * d);
        Paint p = pincel(arriba);
        p.setShader(new LinearGradient(0, 0, 0, h, arriba, abajo, Shader.TileMode.CLAMP));
        c.drawRoundRect(r, 24 * d, 24 * d, p);
        Paint b = pincel(borde);
        b.setStyle(Paint.Style.STROKE);
        b.setStrokeWidth(d);
        c.drawRoundRect(r, 24 * d, 24 * d, b);
    }

    // ── HOY TE TOCA: el día, la barra con sus series y el botón. ──
    private static void hoy(Canvas c, int w, int h, float d, JSONObject o) {
        fondo(c, w, h, d, 0xFF24262B, 0xFF16171A, 0xFF2E3036);
        float m = 16 * d;
        String estado = o == null ? "vacio" : o.optString("estado", "toca");
        String sub = o == null ? "Modus Fit" : o.optString("sub", "Hoy");
        String titulo = o == null ? "Abrí la app" : o.optString("titulo", "Hoy");
        int dia = color(o == null ? null : o.optString("color", ""), 0xFF7BD0BD);
        int series = o == null ? 0 : o.optInt("series", 0);
        int hechas = o == null ? 0 : o.optInt("hechas", 0);
        boolean chico = h < 100 * d;
        boolean descansa = "descansa".equals(estado);

        Paint pSub = texto(0xFFA3A6AD, 12 * d, NORMAL);
        // En el tamaño chico no entra todo: va el título arriba y el pie abajo.
        if (!chico) c.drawText(sub, m, m + 10 * d, pSub);
        Paint pTit = texto(descansa ? 0xFFC9CBD0 : 0xFFF1F1EF, (chico ? 22 : 30) * d, ANGOSTA);
        ajustar(pTit, titulo, w - 2 * m - (chico ? 130 * d : 0));
        float yTit = chico ? m + pTit.getTextSize() - 4 * d : m + 10 * d + pTit.getTextSize() + 2 * d;
        c.drawText(titulo, m, yTit, pTit);

        // El renglón de abajo: cuánto llevás y el botón.
        float yPie = h - m;
        String pie = o == null ? "Tocá para abrir" : o.optString("pie", "");
        Paint pPie = texto(0xFFA3A6AD, 12 * d, NORMAL);
        String boton = o == null ? "" : o.optString("boton", "");
        float anchoBoton = 0;
        if (!boton.isEmpty()) {
            Paint pb = texto(mezcla(dia, 0xFF07080A, 0.18f), 13 * d, NEGRITA);
            anchoBoton = pb.measureText(boton) + 28 * d;
            RectF rb = new RectF(w - m - anchoBoton, yPie - 24 * d, w - m, yPie + 8 * d);
            c.drawRoundRect(rb, 16 * d, 16 * d, pincel(mezcla(dia, Color.WHITE, 0.72f)));
            c.drawText(boton, rb.left + 14 * d, rb.centerY() + 4.5f * d, pb);
        }
        ajustar(pPie, pie, w - 2 * m - anchoBoton - 8 * d);
        c.drawText(pie, m, yPie + 2 * d, pPie);

        // La barra: un disco por serie, repartidos a los dos lados; los hechos, llenos.
        if (chico || series <= 0) return;
        float arriba = yTit + 8 * d, abajo = yPie - 30 * d;
        if (abajo - arriba < 26 * d) return;
        float cy = (arriba + abajo) / 2f;
        float alto = Math.min(abajo - arriba, 44 * d);
        int n = Math.min(series, 20);
        int porLado = (n + 1) / 2;
        float disco = 8 * d, hueco = 1.5f * d, collarin = 5 * d;
        float mitad = Math.min(34 * d, (w - 2 * m) / 2f - porLado * (disco + hueco) - collarin - 6 * d);
        if (mitad < 8 * d) { mitad = 8 * d; }
        float cx = w / 2f;
        Paint eje = pincel(0xFF9EA1A8);
        eje.setShader(new LinearGradient(0, cy - 2.5f * d, 0, cy + 2.5f * d, 0xFFD0D2D6, 0xFF7D8087, Shader.TileMode.CLAMP));
        float largo = mitad + collarin + porLado * (disco + hueco) + 8 * d;
        c.drawRoundRect(new RectF(cx - largo, cy - 2.5f * d, cx + largo, cy + 2.5f * d), 2 * d, 2 * d, eje);
        Paint col = pincel(mezcla(dia, 0xFF8A8C92, 0.7f));
        c.drawRoundRect(new RectF(cx - mitad - collarin, cy - 8 * d, cx - mitad, cy + 8 * d), 2 * d, 2 * d, col);
        c.drawRoundRect(new RectF(cx + mitad, cy - 8 * d, cx + mitad + collarin, cy + 8 * d), 2 * d, 2 * d, col);
        Paint lleno = pincel(mezcla(dia, 0xFF8A8C92, 0.62f));
        Paint vacio = pincel(0xFF50535B);
        vacio.setStyle(Paint.Style.STROKE);
        vacio.setStrokeWidth(d);
        for (int i = 0; i < n; i++) {
            int lado = i % 2 == 0 ? -1 : 1;
            int k = i / 2;
            // Como en una barra de verdad: los discos grandes adentro y los chicos afuera.
            float altoDisco = alto * (k < 2 ? 1f : k < 4 ? 0.84f : k < 6 ? 0.68f : 0.54f);
            float x0 = lado < 0 ? cx - mitad - collarin - hueco - (k + 1) * disco - k * hueco : cx + mitad + collarin + hueco + k * (disco + hueco);
            RectF r = new RectF(x0, cy - altoDisco / 2f, x0 + disco, cy + altoDisco / 2f);
            c.drawRoundRect(r, 2.5f * d, 2.5f * d, i < hechas ? lleno : vacio);
        }
    }

    // ── LA SEMANA: la tarjeta de fichar, de cartón. ──
    private static void semana(Canvas c, int w, int h, float d, JSONObject o) {
        fondo(c, w, h, d, 0xFFE9DFC8, 0xFFDED3B9, 0xFFB8AD94);
        float m = 14 * d;
        int tinta = 0xFF22386E, marron = 0xFF6F6553, papel = 0xFFECE3CF;
        Paint pRot = texto(marron, 12 * d, NEGRITA);
        c.drawText("Tarjeta de la semana", m, m + 10 * d, pRot);
        String cuenta = o == null ? "" : o.optString("cuenta", "");
        Paint pCu = texto(tinta, 14 * d, NEGRITA);
        c.drawText(cuenta, w - m - pCu.measureText(cuenta), m + 10 * d, pCu);
        Paint raya = pincel(0x55504432);
        c.drawRect(m, m + 17 * d, w - m, m + 18 * d, raya);

        String pie = o == null ? "Abrí la app para verla" : o.optString("pie", "");
        boolean conPie = !pie.isEmpty() && h > 118 * d;
        float arriba = m + 24 * d, abajo = h - m - (conPie ? 20 * d : 0);
        JSONArray dias = o == null ? null : o.optJSONArray("dias");
        String[] letras = {"L", "M", "M", "J", "V", "S", "D"};
        float sep = 4 * d, ancho = (w - 2 * m - 6 * sep) / 7f;
        Paint borde = pincel(0x40504432);
        borde.setStyle(Paint.Style.STROKE);
        borde.setStrokeWidth(d);
        for (int i = 0; i < 7; i++) {
            JSONObject dia = dias == null ? null : dias.optJSONObject(i);
            int series = dia == null ? 0 : dia.optInt("series", 0);
            boolean esHoy = dia != null && dia.optBoolean("hoy", false);
            RectF r = new RectF(m + i * (ancho + sep), arriba, m + i * (ancho + sep) + ancho, abajo);
            if (series > 0) {
                int col = color(dia.optString("color", ""), marron);
                c.drawRoundRect(r, 7 * d, 7 * d, pincel(mezcla(col, papel, 0.4f)));
                Paint b = pincel(mezcla(col, 0xFF8A7F6A, 0.55f));
                b.setStyle(Paint.Style.STROKE);
                b.setStrokeWidth(d);
                c.drawRoundRect(r, 7 * d, 7 * d, b);
            } else {
                Paint b = esHoy ? pincel(0xFF6B6252) : borde;
                if (esHoy) { b.setStyle(Paint.Style.STROKE); b.setStrokeWidth(1.5f * d); b.setPathEffect(new DashPathEffect(new float[]{4 * d, 3 * d}, 0)); }
                c.drawRoundRect(r, 7 * d, 7 * d, b);
            }
            Paint pl = texto(series > 0 ? 0xFF2C2924 : 0xFF8A7F6A, 11 * d, NEGRITA);
            c.drawText(letras[i], r.centerX() - pl.measureText(letras[i]) / 2f, r.top + 15 * d, pl);
            String n = series > 0 ? String.valueOf(series) : "–";
            Paint pn = texto(series > 0 ? tinta : 0xFFA59B86, 17 * d, ANGOSTA);
            c.drawText(n, r.centerX() - pn.measureText(n) / 2f, r.bottom - 8 * d, pn);
        }
        if (conPie) {
            Paint pp = texto(tinta, 13 * d, NEGRITA);
            ajustar(pp, pie, w - 2 * m);
            c.drawText(pie, m, h - m + 1 * d, pp);
        }
    }

    // ── EL CICLO: los cajones en la pizarra. ──
    private static final int[] PINTURA = {0xFFD9D9D6, 0xFF3F8F5C, 0xFFD8B93C, 0xFF3F5FAE, 0xFFC0473B};

    private static void ciclo(Canvas c, int w, int h, float d, JSONObject o) {
        fondo(c, w, h, d, 0xFF2D2F33, 0xFF25272B, 0xFF3A3C41);
        float m = 14 * d;
        Paint punto = pincel(0x12FFFFFF);
        for (float y = 10 * d; y < h - 6 * d; y += 12 * d) for (float x = 10 * d; x < w - 6 * d; x += 12 * d) c.drawCircle(x, y, 0.9f * d, punto);
        String titulo = o == null ? "Tu ciclo" : o.optString("titulo", "Ciclo");
        c.drawText(titulo, m, m + 10 * d, texto(0xFFB5B8BF, 12 * d, NORMAL));
        String cuenta = o == null ? "" : o.optString("cuenta", "");
        Paint pCu = texto(0xFFF1F1EF, 15 * d, ANGOSTA);
        c.drawText(cuenta, w - m - pCu.measureText(cuenta), m + 11 * d, pCu);

        String pie = o == null ? "Abrí la app" : o.optString("pie", "");
        Paint pPie = texto(0xFFB5B8BF, 11.5f * d, NORMAL);
        ajustar(pPie, pie, w - 2 * m);
        c.drawText(pie, m, h - m + 2 * d, pPie);

        int total = o == null ? 0 : o.optInt("total", 0);
        int entreno = o == null ? 0 : o.optInt("entreno", total);
        int semana = o == null ? 0 : o.optInt("semana", 0);
        if (total <= 0) return;
        float arriba = m + 20 * d, base = h - m - 16 * d;
        if (base - arriba < 16 * d) return;
        float sep = 4 * d, ancho = (w - 2 * m - (total - 1) * sep) / total;
        for (int i = 0; i < total; i++) {
            boolean descarga = i >= entreno;
            float f = descarga ? 0.36f : 0.45f + 0.55f * (entreno > 1 ? (float) Math.min(i, entreno - 1) / (entreno - 1) : 1f);
            float alto = (base - arriba) * f;
            RectF r = new RectF(m + i * (ancho + sep), base - alto, m + i * (ancho + sep) + ancho, base);
            int col = descarga ? 0xFF16171A : PINTURA[Math.round((entreno > 1 ? (float) Math.min(i, entreno - 1) / (entreno - 1) : 1f) * (PINTURA.length - 1))];
            if (i + 1 < semana) {
                c.drawRoundRect(r, 3 * d, 3 * d, pincel(descarga ? col : mezcla(col, 0xFF5A5C61, 0.45f)));
            } else if (i + 1 == semana) {
                c.drawRoundRect(r, 3 * d, 3 * d, pincel(descarga ? 0xFF0F1012 : col));
                Paint b = pincel(Color.WHITE);
                b.setStyle(Paint.Style.STROKE);
                b.setStrokeWidth(1.5f * d);
                c.drawRoundRect(r, 3 * d, 3 * d, b);
            } else {
                Paint b = pincel(0x80FFFFFF);
                b.setStyle(Paint.Style.STROKE);
                b.setStrokeWidth(d);
                b.setPathEffect(new DashPathEffect(new float[]{3 * d, 3 * d}, 0));
                c.drawRoundRect(r, 3 * d, 3 * d, b);
            }
            if (descarga && ancho > 10 * d) {
                Paint pd = texto(0xCCFFFFFF, 10 * d, NEGRITA);
                c.drawText("D", r.centerX() - pd.measureText("D") / 2f, r.centerY() + 4 * d, pd);
            }
        }
        c.drawRect(m - 4 * d, base, w - m + 4 * d, base + 3 * d, pincel(0xFF101113));
    }
}
