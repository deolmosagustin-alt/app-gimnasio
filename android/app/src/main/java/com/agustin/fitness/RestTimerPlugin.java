package com.agustin.fitness;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.graphics.drawable.IconCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@CapacitorPlugin(name = "RestTimerNotification")
public class RestTimerPlugin extends Plugin {

    private static final String TAG = "RestTimerPlugin";
    // Canal nuevo (v7) para que el diseño y la config se apliquen limpios
    // sin heredar ajustes viejos que Android cachea por canal.
    private static final String CHANNEL_ID = "modusfit-rest-chrono-v7";
    private static final int NOTIFICATION_ID = 9100;

    // Paleta de la app
    private static final int ACCENT = Color.parseColor("#14B8A6"); // teal marca

    @PluginMethod
    public void start(PluginCall call) {
        Integer secondsParam = call.getInt("seconds");
        long seconds = (secondsParam != null) ? secondsParam.longValue() : 60L;
        String exerciseName = call.getString("exerciseName", "");

        Context context = getContext();
        createChannel(context);

        long whenMillis = System.currentTimeMillis() + seconds * 1000L;

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, openIntent, flags);

        int minutes = (int) (seconds / 60);
        int secsRem = (int) (seconds % 60);
        String chipText = minutes > 0
                ? String.format(Locale.getDefault(), "%d:%02d", minutes, secsRem)
                : (secsRem + "s");

        // ===== DISEÑO MINIMALISTA (lo que se ve al bajar la barra) =====
        // Título: solo "Descanso" — limpio, sin ruido. El cronómetro (when +
        // usesChronometer) hace de protagonista a la derecha, contando solo.
        // Subtexto: el nombre del ejercicio si vino, si no una línea sobria.
        // El acento teal tiñe el ícono y la barra de progreso. Sin sonido,
        // sin badge, sin vibración: presencia silenciosa y elegante.
        String title = "Descanso";
        String body = (exerciseName != null && !exerciseName.isEmpty())
                ? exerciseName
                : "Recuperá · próxima serie";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(getIconResId(context))
                .setContentTitle(title)
                .setContentText(body)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
                .setColor(ACCENT)
                .setContentIntent(pendingIntent)
                // Cronómetro en cuenta regresiva a la derecha del título.
                // setShowWhen(FALSE) es obligatorio para el chip de Live
                // Updates (el "when" no debe mostrarse como hora), pero el
                // cronómetro sí se ve porque usamos setUsesChronometer.
                .setWhen(whenMillis)
                .setShowWhen(false)
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        // ===== LIVE UPDATE / STATUS BAR CHIP (Android 16 QPR1+, API 36) =====
        // IMPORTANTE: el chip al lado de la hora NO está activo en Android 16
        // estable — llegó recién con QPR1. En estable esto no hace daño: la
        // notificación se muestra igual (con la barra de progreso), y cuando
        // el teléfono reciba QPR1 el chip aparece solo, sin tocar el código.
        // Requiere: permiso POST_PROMOTED_NOTIFICATIONS (manifest),
        // setRequestPromotedOngoing(true), estilo elegible (ProgressStyle),
        // ongoing, y setShortCriticalText para el texto del chip.
        if (Build.VERSION.SDK_INT >= 36) {
            try {
                builder.setRequestPromotedOngoing(true);
                builder.setShortCriticalText(chipText);
                // ProgressStyle: el TOTAL se define con segmentos
                // (Segment(length)) y la posición con setProgress(valor) —
                // UN solo argumento (Builder.setProgress toma tres, ProgressStyle
                // toma uno). Un segmento teal lleno = barra de progreso estética
                // que aparece abajo de la notificación, muy en la línea moderna.
                List<NotificationCompat.ProgressStyle.Segment> segments = new ArrayList<>();
                segments.add(new NotificationCompat.ProgressStyle.Segment(100).setColor(ACCENT));
                NotificationCompat.ProgressStyle progressStyle =
                        new NotificationCompat.ProgressStyle()
                                .setProgressSegments(segments)
                                .setProgress(100)
                                .setProgressTrackerIcon(
                                        IconCompat.createWithResource(context, getIconResId(context)));
                builder.setStyle(progressStyle);
            } catch (Throwable t) {
                Log.w(TAG, "Live Update API no disponible: " + t.getMessage());
            }
        }

        Notification notification = builder.build();

        // Diagnóstico — filtrá "RestTimerPlugin" en Logcat. En Android 16
        // estable esto va a decir normalmente false (el sistema aún no
        // promueve); en QPR1+ debería dar true.
        if (Build.VERSION.SDK_INT >= 36) {
            try {
                boolean promotable = notification.hasPromotableCharacteristics();
                Log.i(TAG, "hasPromotableCharacteristics = " + promotable
                        + " (chip solo visible en Android 16 QPR1+)");
            } catch (Throwable t) {
                Log.w(TAG, "No se pudo verificar promotable: " + t.getMessage());
            }
        }

        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                    || context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification);
                Log.i(TAG, "Notificación posteada (id " + NOTIFICATION_ID + ")");
            } else {
                Log.w(TAG, "Sin permiso POST_NOTIFICATIONS — no se posteó");
            }
        } catch (SecurityException e) {
            Log.e(TAG, "SecurityException al postear: " + e.getMessage());
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
            Log.e(TAG, "SecurityException al cancelar: " + e.getMessage());
        }
        JSObject ret = new JSObject();
        ret.put("stopped", true);
        call.resolve(ret);
    }

    private void createChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Cronómetro de descanso",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Cuenta regresiva del descanso entre series");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.enableLights(true);
            channel.setLightColor(ACCENT);
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
