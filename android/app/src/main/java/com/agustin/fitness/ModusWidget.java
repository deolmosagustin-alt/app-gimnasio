package com.agustin.fitness;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.Arrays;

/**
 * La base de los widgets de Modus Fit. Cada uno es una imagen que dibuja
 * WidgetDibujo con el último estado que mandó la app, más unas zonas
 * transparentes encima (lo que se toca) y, en el descanso, un reloj en vivo.
 * Los proveedores son clases vacías: qué dibuja cada uno está en TABLA.
 */
public abstract class ModusWidget extends AppWidgetProvider {
    // El proveedor, qué dibuja, y el tamaño (en dp) si el sistema no lo dice.
    static final Object[][] TABLA = {
        {SupUnoWidget.class, "sup1", 76, 84},
        {SupFilaWidget.class, "sup", 320, 84},
        {SupCuadroWidget.class, "sup", 160, 170},
        {EmpezarChicoWidget.class, "empezar", 160, 84},
        {TodayWidgetProvider.class, "empezar", 320, 84},
        {DescansoFilaWidget.class, "descanso", 320, 84},
        {DescansoCuadroWidget.class, "descanso", 160, 170},
        {WeekWidgetProvider.class, "tira", 320, 84},
    };

    private static final int[][] ZONAS = {
        {R.id.wz00, R.id.wz01, R.id.wz02, R.id.wz03, R.id.wz04},
        {R.id.wz10, R.id.wz11, R.id.wz12, R.id.wz13, R.id.wz14},
    };
    private static final int[] FILAS = {R.id.wzf0, R.id.wzf1};

    static JSONObject estado(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(TodayWidgetPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        try { return new JSONObject(prefs.getString(TodayWidgetPlugin.KEY_ESTADO, "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    /** El descanso que hay que mostrar, o null. Uno olvidado no queda para siempre. */
    static JSONObject descansoVivo(Context ctx) {
        try {
            JSONObject e = Descanso.leer(ctx);
            if (e == null) return null;
            String est = e.optString("estado", "");
            long ahora = System.currentTimeMillis(), fin = e.optLong("fin", 0);
            if ("pausa".equals(est)) return e;
            if ("corre".equals(est)) {
                // La alarma del final no llegó (el sistema la demoró): se muestra terminado.
                if (ahora > fin + 5000L) e.put("estado", "fin");
                return ahora > fin + 30L * 60L * 1000L ? null : e;
            }
            if ("fin".equals(est)) return ahora > fin + 30L * 60L * 1000L ? null : e;
        } catch (Exception ex) { /* sin descanso */ }
        return null;
    }

    private static Object[] filaDe(Class<?> clase) {
        for (Object[] f : TABLA) if (f[0] == clase) return f;
        return TABLA[4];
    }

    /** Qué hace un toque. Ver las acciones en WidgetDibujo.Plano. */
    private static PendingIntent intento(Context ctx, String accion) {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        if (accion != null && accion.startsWith("sup:")) {
            Intent i = new Intent(ctx, WidgetAcciones.class).setAction(WidgetAcciones.SUP).setData(Uri.parse("modusfit://sup/" + Uri.encode(accion.substring(4))));
            return PendingIntent.getBroadcast(ctx, 9201, i, flags);
        }
        if (accion != null && accion.startsWith("descanso:")) {
            Intent i = new Intent(ctx, WidgetAcciones.class).setAction(WidgetAcciones.DESCANSO).setData(Uri.parse("modusfit://descanso/" + Uri.encode(accion.substring(9))));
            return PendingIntent.getBroadcast(ctx, 9202, i, flags);
        }
        if (accion != null && accion.startsWith("d:")) {
            String cual = accion.substring(2);
            String a = "PAUSAR".equals(cual) ? Descanso.PAUSAR : "SEGUIR".equals(cual) ? Descanso.SEGUIR : "REINICIAR".equals(cual) ? Descanso.REINICIAR : Descanso.CERRAR;
            Intent i = new Intent(ctx, RestTimerReceiver.class).setAction(a);
            return PendingIntent.getBroadcast(ctx, 9203 + Math.abs(cual.hashCode() % 50), i, flags);
        }
        Intent abrir = new Intent(ctx, MainActivity.class);
        abrir.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (accion != null && accion.startsWith("abrir:")) {
            // "abrir:rutina", "abrir:suplementos" o "abrir:iniciar:<fecha>:<día>".
            String resto = accion.substring(6);
            Uri.Builder u = new Uri.Builder().scheme("modusfit").authority("widget");
            if (resto.startsWith("iniciar:")) {
                String[] p = resto.substring(8).split(":", 2);
                u.appendPath("iniciar").appendQueryParameter("fecha", p[0]).appendQueryParameter("key", p.length > 1 ? p[1] : "");
            } else {
                u.appendPath(resto);
            }
            abrir.setAction(MainActivity.ACCION_WIDGET).setData(u.build());
        }
        return PendingIntent.getActivity(ctx, 0, abrir, flags);
    }

    static void pintar(Context ctx, AppWidgetManager mgr, int id, Object[] fila) {
        float d = ctx.getResources().getDisplayMetrics().density;
        String tipo = (String) fila[1];
        Bundle o = mgr.getAppWidgetOptions(id);
        boolean vertical = ctx.getResources().getConfiguration().orientation != Configuration.ORIENTATION_LANDSCAPE;
        int wdp = o == null ? 0 : o.getInt(vertical ? AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH : AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 0);
        int hdp = o == null ? 0 : o.getInt(vertical ? AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT : AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        if (wdp <= 0) wdp = (Integer) fila[2];
        if (hdp <= 0) hdp = (Integer) fila[3];
        // Un tope, para no pasarle al sistema una imagen enorme.
        int w = Math.min(Math.round(wdp * d), 1400), h = Math.min(Math.round(hdp * d), 1000);

        int indice = 0;
        if ("sup1".equals(tipo)) {
            // Cada bloque de un suplemento muestra uno distinto: el primero que
            // pusiste, el primero de la lista; el segundo, el segundo…
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, (Class<?>) fila[0]));
            Arrays.sort(ids);
            indice = Math.max(0, Arrays.binarySearch(ids, id));
        }
        String hoy = WidgetAcciones.hoy();
        WidgetDibujo.Plano p = WidgetDibujo.plano(ctx, tipo, w, h, estado(ctx), hoy, WidgetAcciones.tomasDe(ctx, hoy), "descanso".equals(tipo) ? descansoVivo(ctx) : null, indice, false);

        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_zonas);
        v.setImageViewBitmap(R.id.modus_widget_imagen, p.bmp);
        v.setOnClickPendingIntent(R.id.today_widget_root, intento(ctx, p.raiz));
        v.setViewPadding(R.id.wz, p.pl, p.pt, p.pr, p.pb);
        for (int f = 0; f < 2; f++) {
            v.setViewVisibility(FILAS[f], f < p.filas ? View.VISIBLE : View.GONE);
            for (int k = 0; k < 5; k++) {
                boolean hay = f < p.filas && k < p.cols[f];
                v.setViewVisibility(ZONAS[f][k], hay ? View.VISIBLE : View.GONE);
                if (hay) {
                    String a = p.acciones[f * 5 + k];
                    v.setOnClickPendingIntent(ZONAS[f][k], intento(ctx, a == null ? p.raiz : a));
                }
            }
        }
        if (p.crono) {
            v.setViewVisibility(R.id.wcrono, View.VISIBLE);
            v.setViewPadding(R.id.wcrono, p.cl, p.ct, Math.max(0, w - p.cr), Math.max(0, h - p.cb));
            v.setTextViewTextSize(R.id.wcrono, TypedValue.COMPLEX_UNIT_PX, p.cronoTam);
            v.setTextColor(R.id.wcrono, p.cronoColor);
            v.setChronometerCountDown(R.id.wcrono, p.cronoBaja);
            v.setChronometer(R.id.wcrono, p.cronoBase, p.cronoFormato, true);
        } else {
            v.setViewVisibility(R.id.wcrono, View.GONE);
            v.setChronometer(R.id.wcrono, 0, null, false);
        }
        mgr.updateAppWidget(id, v);
    }

    /** Vuelve a pintar todos los widgets de Modus Fit que haya en la pantalla (o sólo los de un tipo). */
    static void pintarTodos(Context ctx) { pintarLos(ctx, null); }

    static void pintarLos(Context ctx, String tipo) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            for (Object[] fila : TABLA) {
                if (tipo != null && !tipo.equals(fila[1])) continue;
                for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, (Class<?>) fila[0]))) {
                    try { pintar(ctx, mgr, id, fila); } catch (Exception e) { /* un widget roto no frena a los demás */ }
                }
            }
        } catch (Exception e) { /* sin widgets */ }
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        Object[] fila = filaDe(getClass());
        for (int id : ids) {
            try { pintar(ctx, mgr, id, fila); } catch (Exception e) { /* ignorado a propósito */ }
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle opciones) {
        try { pintar(ctx, mgr, id, filaDe(getClass())); } catch (Exception e) { /* ignorado a propósito */ }
    }

    // Al sacar un bloque de suplemento, los que quedan se reacomodan.
    @Override
    public void onDeleted(Context ctx, int[] ids) {
        if ("sup1".equals(filaDe(getClass())[1])) pintarLos(ctx, "sup1");
    }
}
