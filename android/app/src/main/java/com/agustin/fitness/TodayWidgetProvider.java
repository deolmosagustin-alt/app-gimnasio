package com.agustin.fitness;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.widget.RemoteViews;

// Widget de pantalla de inicio: una sola línea de texto ("Hoy toca Push",
// "Descanso hoy", "¡Ya entrenaste! ✅" — lo decide la app JS vía
// TodayWidgetPlugin) más un toque para abrir la app directo. Deliberadamente
// simple (sin botones de acción propios): la meta es enterarte del día sin
// destrabar el teléfono, no reemplazar la app.
public class TodayWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences(TodayWidgetPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        String label = prefs.getString(TodayWidgetPlugin.KEY_LABEL, "Abrí Modus Fit para ver tu rutina de hoy");

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.today_widget);
            views.setTextViewText(R.id.today_widget_label, label);

            Intent openIntent = new Intent(context, MainActivity.class);
            openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, openIntent, piFlags);
            views.setOnClickPendingIntent(R.id.today_widget_root, pendingIntent);

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}
