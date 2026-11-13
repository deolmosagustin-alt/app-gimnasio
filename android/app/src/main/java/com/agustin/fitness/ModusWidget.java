package com.agustin.fitness;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * La base de los tres widgets (hoy, semana, ciclo): cada uno es una imagen
 * dibujada por WidgetDibujo con el último estado que mandó la app. Tocarlo
 * abre Modus Fit.
 */
public abstract class ModusWidget extends AppWidgetProvider {
    protected abstract String tipo();

    static final Class<?>[] TODOS = {TodayWidgetProvider.class, WeekWidgetProvider.class, CycleWidgetProvider.class};

    static JSONObject estado(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(TodayWidgetPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        try { return new JSONObject(prefs.getString(TodayWidgetPlugin.KEY_ESTADO, "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    static void pintar(Context ctx, AppWidgetManager mgr, int id, String tipo) {
        float d = ctx.getResources().getDisplayMetrics().density;
        Bundle o = mgr.getAppWidgetOptions(id);
        boolean vertical = ctx.getResources().getConfiguration().orientation != Configuration.ORIENTATION_LANDSCAPE;
        int porDefectoW = "ciclo".equals(tipo) ? 150 : 300, porDefectoH = "ciclo".equals(tipo) ? 150 : 140;
        int wdp = o == null ? 0 : o.getInt(vertical ? AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH : AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 0);
        int hdp = o == null ? 0 : o.getInt(vertical ? AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT : AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        if (wdp <= 0) wdp = porDefectoW;
        if (hdp <= 0) hdp = porDefectoH;
        // Un tope, para no pasarle al sistema una imagen enorme.
        int w = Math.min(Math.round(wdp * d), 1400), h = Math.min(Math.round(hdp * d), 1000);

        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.today_widget);
        views.setImageViewBitmap(R.id.modus_widget_imagen, WidgetDibujo.dibujar(ctx, tipo, w, h, estado(ctx)));
        Intent abrir = new Intent(ctx, MainActivity.class);
        abrir.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        views.setOnClickPendingIntent(R.id.today_widget_root, PendingIntent.getActivity(ctx, 0, abrir, flags));
        mgr.updateAppWidget(id, views);
    }

    /** Vuelve a pintar todos los widgets de Modus Fit que haya en la pantalla. */
    static void pintarTodos(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        String[] tipos = {"hoy", "semana", "ciclo"};
        for (int k = 0; k < TODOS.length; k++) {
            for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, TODOS[k]))) {
                try { pintar(ctx, mgr, id, tipos[k]); } catch (Exception e) { /* un widget roto no frena a los demás */ }
            }
        }
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            try { pintar(ctx, mgr, id, tipo()); } catch (Exception e) { /* ignorado a propósito */ }
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle opciones) {
        try { pintar(ctx, mgr, id, tipo()); } catch (Exception e) { /* ignorado a propósito */ }
    }
}
