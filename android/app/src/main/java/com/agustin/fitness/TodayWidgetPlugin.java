package com.agustin.fitness;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Puente para el widget de pantalla de inicio ("Hoy toca Push" / "Descanso
// hoy" / "¡Ya entrenaste! ✅"). El widget vive en TodayWidgetProvider, FUERA
// del WebView, así que no puede leer localStorage/logs directamente — la
// app JS le manda el texto ya armado cada vez que cambia (agenda semanal,
// o apenas termina la sesión de hoy) y este plugin lo deja en
// SharedPreferences nativo para que el widget lo lea y se refresque.
// Mismo patrón que RestTimerPlugin: registrado a mano en MainActivity
// (Capacitor no detecta plugins Java custom solo).
@CapacitorPlugin(name = "TodayWidget")
public class TodayWidgetPlugin extends Plugin {

    public static final String PREFS_NAME = "modusfit_widget";
    public static final String KEY_LABEL = "today_label";

    @PluginMethod
    public void updateToday(PluginCall call) {
        String label = call.getString("label", "Abrí Modus Fit para ver tu rutina de hoy");
        Context context = getContext();

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_LABEL, label).apply();

        // Empuja el refresco a todas las instancias del widget ya puestas en
        // la pantalla de inicio, sin esperar al ciclo automático de Android
        // (que puede tardar hasta updatePeriodMillis).
        Intent intent = new Intent(context, TodayWidgetProvider.class);
        intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(context, TodayWidgetProvider.class));
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        context.sendBroadcast(intent);

        JSObject ret = new JSObject();
        ret.put("updated", true);
        call.resolve(ret);
    }
}
