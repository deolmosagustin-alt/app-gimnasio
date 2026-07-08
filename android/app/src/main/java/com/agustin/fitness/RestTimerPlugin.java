package com.agustin.fitness;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

@CapacitorPlugin(name = "RestTimerNotification")
public class RestTimerPlugin extends Plugin {

    // Cambié a v3 para forzar la recreación del canal con importancia ALTA (Heads-Up)
    private static final String CHANNEL_ID = "modusfit-rest-chrono-v3";
    private static final int NOTIFICATION_ID = 9100;

    @PluginMethod
    public void start(PluginCall call) {
        // 1. Corrección del NullPointerException y variables redundantes
        Integer secondsParam = call.getInt("seconds");
        long seconds = (secondsParam != null) ? secondsParam.longValue() : 60L;

        Context context = getContext();
        createChannel(context);

        long whenMillis = System.currentTimeMillis() + seconds * 1000L;

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, openIntent, flags);

        int minutes = (int) (seconds / 60);
        int secsRem = (int) (seconds % 60);

        // 2. Corrección del bug de Locale en String.format
        String durationLabel = minutes > 0
                ? String.format(Locale.getDefault(), "Descanso de %d:%02d", minutes, secsRem)
                : String.format(Locale.getDefault(), "Descanso de %d seg", secsRem);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(getIconResId(context))
                .setContentTitle("La cuenta regresiva está corriendo")
                .setContentText(durationLabel + " — toca para volver a Modus Fit")
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                // 3. Corrección clave para que aparezca expandida (estilo Spotify):
                // Debe ser HIGH, con DEFAULT solo se queda en la barra silenciosamente
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
                .setColor(Color.parseColor("#14B8A6"))
                .setContentIntent(pendingIntent)
                .setWhen(whenMillis)
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
                .setShowWhen(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                    || context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
            }
        } catch (SecurityException e) {
            // Sin permiso de notificaciones — la app sigue igual.
        }

        JSObject ret = new JSObject();
        ret.put("started", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            NotificationManagerCompat.from(getContext()).cancel(NOTIFICATION_ID);
        } catch (SecurityException e) {
            // Sin permiso no hay nada que cancelar.
        }
        JSObject ret = new JSObject();
        ret.put("stopped", true);
        call.resolve(ret);
    }

    private void createChannel(Context context) {
        // 4. Corrección del error crítico: Envolver en comprobación de API 26+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Para notificaciones flotantes (Heads-Up), la importancia del canal debe ser HIGH
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Cronómetro de descanso",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Cuenta regresiva del descanso entre series");
            channel.setShowBadge(false);
            channel.setSound(null, null); // sin sonido al aparecer — solo visual
            channel.enableVibration(false);
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private int getIconResId(Context context) {
        int resId = context.getResources().getIdentifier("ic_stat_modusfit", "drawable", context.getPackageName());
        if (resId == 0) resId = context.getApplicationInfo().icon;
        return resId;
    }
}