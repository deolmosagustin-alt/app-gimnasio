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

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

@CapacitorPlugin(name = "RestTimerNotification")
public class RestTimerPlugin extends Plugin {

    private static final String TAG = "RestTimerPlugin";
    private static final String CHANNEL_ID = "modusfit-rest-chrono-v6";
    private static final int NOTIFICATION_ID = 9100;

    @PluginMethod
    public void start(PluginCall call) {
        Integer secondsParam = call.getInt("seconds");
        long seconds = (secondsParam != null) ? secondsParam.longValue() : 60L;

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

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(getIconResId(context))
                .setContentTitle("Descanso en curso")
                .setContentText("Modus Fit · próxima serie")
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
                .setColor(Color.parseColor("#14B8A6"))
                .setContentIntent(pendingIntent)
                // Cronómetro en cuenta regresiva. setShowWhen(FALSE) es
                // OBLIGATORIO: la doc de Live Updates dice que el "when time"
                // NO debe mostrarse en la notif para que el chip use el
                // cronómetro. Tenerlo en true impedía el chip.
                .setWhen(whenMillis)
                .setShowWhen(false)
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        // ===== LIVE UPDATE / STATUS BAR CHIP (Android 16+, API 36) =====
        // Requiere: permiso POST_PROMOTED_NOTIFICATIONS (manifest),
        // setRequestPromotedOngoing(true), un estilo ELEGIBLE (Standard/
        // BigText/Call/Progress), ongoing, y setShortCriticalText para el
        // texto del chip. Usamos ProgressStyle (el estilo pensado para
        // tareas con inicio y fin, como este descanso) que es lo que
        // dispara el chip en la barra de estado.
        if (Build.VERSION.SDK_INT >= 36) {
            try {
                builder.setRequestPromotedOngoing(true);
                builder.setShortCriticalText(chipText);
                // ProgressStyle: barra de progreso llena (el descanso corriendo).
                NotificationCompat.ProgressStyle progressStyle =
                        new NotificationCompat.ProgressStyle()
                                .setProgress(100, 100)
                                .setProgressTrackerIcon(
                                        androidx.core.graphics.drawable.IconCompat.createWithResource(context, getIconResId(context)));
                builder.setStyle(progressStyle);
            } catch (Throwable t) {
                Log.w(TAG, "Live Update API no disponible: " + t.getMessage());
            }
        }

        Notification notification = builder.build();

        // Diagnóstico — filtrá "RestTimerPlugin" en Logcat.
        if (Build.VERSION.SDK_INT >= 36) {
            try {
                boolean promotable = notification.hasPromotableCharacteristics();
                Log.i(TAG, "hasPromotableCharacteristics = " + promotable);
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
