package com.agustin.fitness;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.Icon;
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
    // Canal v8: IMPORTANCE_DEFAULT — aparece en la barra SIN saltar el popup
    // (heads-up). El v7 usaba HIGH y por eso la notificación "saltaba".
    // DEFAULT sigue siendo válido para Live Updates (solo MIN está prohibido).
    private static final String CHANNEL_ID = "modusfit-rest-chrono-v8";
    private static final int NOTIFICATION_ID = 9100;
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
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, openIntent, piFlags);

        int minutes = (int) (seconds / 60);
        int secsRem = (int) (seconds % 60);
        String chipText = minutes > 0
                ? String.format(Locale.getDefault(), "%d:%02d", minutes, secsRem)
                : (secsRem + "s");
        String title = "Descanso";
        String body = (exerciseName != null && !exerciseName.isEmpty())
                ? exerciseName
                : "Recuperá · próxima serie";

        Notification notification = null;

        // ═══════ CAMINO 1 (Android 16+, API 36): API NATIVA del framework ═══════
        // Construimos la notificación con android.app.Notification.Builder
        // DIRECTO, sin la capa de compatibilidad. Motivo: las APIs de Live
        // Updates (setRequestPromotedOngoing, setShortCriticalText,
        // ProgressStyle) son nuevísimas, y la versión compat puede no
        // trasladar el pedido de promoción al sistema real — la notificación
        // se ve, pero el sistema nunca la considera para la Now Bar / chip.
        // Con la API nativa no hay intermediario posible.
        if (Build.VERSION.SDK_INT >= 36) {
            try {
                Icon smallIcon = Icon.createWithResource(context, getIconResId(context));

                Notification.ProgressStyle.Segment seg =
                        new Notification.ProgressStyle.Segment(100).setColor(ACCENT);
                List<Notification.ProgressStyle.Segment> segs = new ArrayList<>();
                segs.add(seg);
                Notification.ProgressStyle progressStyle = new Notification.ProgressStyle()
                        .setProgressSegments(segs)
                        .setProgress(100)
                        .setProgressTrackerIcon(smallIcon);

                Notification.Builder nb = new Notification.Builder(context, CHANNEL_ID)
                        .setSmallIcon(smallIcon)
                        .setContentTitle(title)
                        .setContentText(body)
                        .setOngoing(true)
                        .setOnlyAlertOnce(true)
                        .setCategory(Notification.CATEGORY_STOPWATCH)
                        .setColor(ACCENT)
                        .setContentIntent(pendingIntent)
                        .setWhen(whenMillis)
                        .setShowWhen(false)
                        .setUsesChronometer(true)
                        .setChronometerCountDown(true)
                        .setVisibility(Notification.VISIBILITY_PUBLIC)
                        .setStyle(progressStyle)
                        .setShortCriticalText(chipText)
                        .setRequestPromotedOngoing(true);

                notification = nb.build();
                Log.i(TAG, "v8: notificación construida con API NATIVA de Android 16");
            } catch (Throwable t) {
                Log.w(TAG, "v8: API nativa falló (" + t + ") — usando camino compat");
                notification = null;
            }
        }

        // ═══════ CAMINO 2 (fallback / Android < 16): NotificationCompat ═══════
        if (notification == null) {
            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(getIconResId(context))
                    .setContentTitle(title)
                    .setContentText(body)
                    .setOngoing(true)
                    .setOnlyAlertOnce(true)
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
                    .setColor(ACCENT)
                    .setContentIntent(pendingIntent)
                    .setWhen(whenMillis)
                    .setShowWhen(false)
                    .setUsesChronometer(true)
                    .setChronometerCountDown(true)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);
            if (Build.VERSION.SDK_INT >= 36) {
                try {
                    builder.setRequestPromotedOngoing(true);
                    builder.setShortCriticalText(chipText);
                    List<NotificationCompat.ProgressStyle.Segment> segments = new ArrayList<>();
                    segments.add(new NotificationCompat.ProgressStyle.Segment(100).setColor(ACCENT));
                    builder.setStyle(new NotificationCompat.ProgressStyle()
                            .setProgressSegments(segments)
                            .setProgress(100)
                            .setProgressTrackerIcon(IconCompat.createWithResource(context, getIconResId(context))));
                } catch (Throwable t) {
                    Log.w(TAG, "compat Live Update no disponible: " + t.getMessage());
                }
            }
            notification = builder.build();
            Log.i(TAG, "v8: notificación construida con NotificationCompat");
        }

        // Diagnóstico definitivo — filtrá "RestTimerPlugin" en Logcat.
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
                    NotificationManager.IMPORTANCE_DEFAULT // no salta heads-up
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
