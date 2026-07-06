package com.agustin.fitness;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RestTimerNotification")
public class RestTimerPlugin extends Plugin {

    private static final String CHANNEL_ID = "modusfit-rest-timer-chrono";
    private static final int NOTIFICATION_ID = 9100;

    @PluginMethod
    public void start(PluginCall call) {
        int secondsInt = call.getInt("seconds", 60);
        long seconds = secondsInt;
        Context context = getContext();
        createChannel(context);

        long whenMillis = System.currentTimeMillis() + seconds * 1000L;

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, openIntent, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(getIconResId(context))
                .setContentTitle("Descanso entre series")
                .setContentText("Modus Fit")
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(pendingIntent)
                .setWhen(whenMillis)
                .setUsesChronometer(true)
                .setChronometerCountDown(true);

        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                    || context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
            }
        } catch (SecurityException e) {
            // El usuario no concedió el permiso de notificaciones — la app
            // sigue funcionando igual, solo no se muestra este aviso extra.
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
            // Sin permiso de notificaciones no hay nada que cancelar de todas formas.
        }
        JSObject ret = new JSObject();
        ret.put("stopped", true);
        call.resolve(ret);
    }

    private void createChannel(Context context) {
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Cronometro de descanso",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Muestra la cuenta regresiva del descanso entre series");
        channel.setShowBadge(false);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private int getIconResId(Context context) {
        int resId = context.getResources().getIdentifier("ic_stat_modusfit", "drawable", context.getPackageName());
        if (resId == 0) resId = context.getApplicationInfo().icon;
        return resId;
    }
}
