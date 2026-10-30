package com.agustin.fitness;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.graphics.drawable.IconCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "RestTimerNotification")
public class RestTimerPlugin extends Plugin {

    private static final String TAG = "RestTimerPlugin";
    // v11: la app pregunta la versión con info() para saber si este plugin
    // cuenta para arriba (el cardio) y dibuja el reloj de pared.
    // v12: el APK con Kotlin 2.2 (ver build.gradle): desde esta versión la app
    // puede usar @capacitor/filesystem sin que se cierre.
    // v13: con "id", el descanso vive en Descanso.java: los botones de la
    // notificación (Pausar, Seguir, +15 s, Reiniciar, Cerrar), el aviso del
    // final con su propia alarma y el estado "terminado" que cuenta cuánto te
    // pasaste. Sin "id" (el cardio), todo sigue como en la v12.
    private static final int VERSION = 13;
    // Canal v8: IMPORTANCE_DEFAULT — aparece en la barra SIN saltar el popup
    // (heads-up). El v7 usaba HIGH y por eso la notificación "saltaba".
    // DEFAULT sigue siendo válido para Live Updates (solo MIN está prohibido).
    private static final String CHANNEL_ID = "modusfit-rest-chrono-v8";
    private static final int NOTIFICATION_ID = 9100;
    private static final int ACCENT = Color.parseColor("#14B8A6"); // teal marca

    // El reloj de respaldo del final, por si la alarma llega tarde (sin el
    // permiso de alarmas exactas, Android la puede demorar).
    private final Handler reloj = new Handler(Looper.getMainLooper());
    private Runnable alFinal = null;

    @Override
    public void load() {
        Descanso.plugin = this;
        Descanso.enPrimerPlano = true;
        Descanso.crearCanales(getContext());
    }

    @Override
    protected void handleOnResume() {
        Descanso.enPrimerPlano = true;
    }

    @Override
    protected void handleOnPause() {
        Descanso.enPrimerPlano = false;
    }

    @Override
    protected void handleOnDestroy() {
        Descanso.enPrimerPlano = false;
        if (Descanso.plugin == this) Descanso.plugin = null;
        reloj.removeCallbacksAndMessages(null);
    }

    @PluginMethod
    public void info(PluginCall call) {
        Context c = getContext();
        JSObject ret = new JSObject();
        ret.put("version", VERSION);
        ret.put("alarmasExactas", Descanso.alarmasExactas(c));
        ret.put("notificaciones", NotificationManagerCompat.from(c).areNotificationsEnabled());
        // Las Live Updates (Android 16): la persona las puede apagar en Ajustes.
        boolean live = false;
        if (Build.VERSION.SDK_INT >= 36) {
            try {
                NotificationManager m = c.getSystemService(NotificationManager.class);
                Object r = NotificationManager.class.getMethod("canPostPromotedNotifications").invoke(m);
                live = Boolean.TRUE.equals(r);
            } catch (Throwable ignored) { }
        }
        ret.put("liveUpdates", live);
        ret.put("android", Build.VERSION.SDK_INT);
        call.resolve(ret);
    }

    // Abre "Alarmas y recordatorios" de la app, para que el aviso del final
    // del descanso llegue en el segundo justo (Android 12+).
    @PluginMethod
    public void pedirAlarmasExactas(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            }
        } catch (Exception e) {
            Log.w(TAG, "No se pudo abrir Alarmas y recordatorios: " + e);
        }
        call.resolve();
    }

    // Abre los ajustes de avisos de la app ("avisos") o, en Android 16, los
    // de las actualizaciones en vivo ("live"), para prender lo que esté apagado.
    @PluginMethod
    public void abrirAjustes(PluginCall call) {
        String que = call.getString("que", "avisos");
        Context c = getContext();
        Intent i = null;
        if ("live".equals(que) && Build.VERSION.SDK_INT >= 36) {
            i = new Intent("android.settings.MANAGE_APP_PROMOTED_NOTIFICATIONS");
        }
        if (i == null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        }
        try {
            if (i == null) {
                i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + c.getPackageName()));
            } else {
                i.putExtra(Settings.EXTRA_APP_PACKAGE, c.getPackageName());
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
        } catch (Exception e) {
            try {
                Intent j = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + c.getPackageName()));
                j.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                c.startActivity(j);
            } catch (Exception ignored) { }
        }
        call.resolve();
    }

    // Lo que dice la notificación del descanso ahora, y lo que pasó en ella
    // mientras la app no miraba (la cola de eventos queda vacía).
    @PluginMethod
    public void estado(PluginCall call) {
        Context c = getContext();
        JSObject ret = new JSObject();
        try {
            JSONObject e = Descanso.leer(c);
            if (e != null) ret.put("descanso", JSObject.fromJSONObject(e));
            JSONArray ev = Descanso.sacarEventos(c);
            ret.put("eventos", JSArray.from(ev));
        } catch (Exception ex) {
            ret.put("eventos", new JSArray());
        }
        call.resolve(ret);
    }

    // Un botón de la notificación o la alarma: a la web, en el momento.
    void emitir(JSONObject ev) {
        try {
            notifyListeners("accion", JSObject.fromJSONObject(ev), true);
        } catch (Exception e) {
            Log.w(TAG, "No se pudo avisar a la web: " + e);
        }
    }

    // Programa (o con 0, cancela) el reloj de respaldo del final.
    void respaldo(long fin) {
        if (alFinal != null) reloj.removeCallbacks(alFinal);
        alFinal = null;
        if (fin <= 0) return;
        final Context c = getContext().getApplicationContext();
        alFinal = () -> Descanso.aplicar(c, Descanso.FIN);
        reloj.postDelayed(alFinal, Math.max(0L, fin - System.currentTimeMillis()) + 400L);
    }

    // v13: el descanso con su id, sus botones y su alarma.
    private void iniciarV13(PluginCall call, String id) {
        Context c = getContext();
        long ahora = System.currentTimeMillis();
        try {
            JSONObject previo = Descanso.leer(c);
            JSONObject e = new JSONObject();
            e.put("id", id);
            e.put("titulo", call.getString("titulo", "Descanso"));
            e.put("cuerpo", call.getString("cuerpo", "Tu próxima serie"));
            e.put("subtitulo", call.getString("subtitulo", "Descanso"));
            e.put("tituloFin", call.getString("tituloFin", "Terminó el descanso"));
            e.put("cuerpoFin", call.getString("cuerpoFin", "Te toca la próxima serie."));
            e.put("alerta", call.getString("alerta", "sound"));
            e.put("color", colorDe(call.getString("color", null)));
            Integer duracion = call.getInt("duracion");
            Integer segundos = call.getInt("seconds");
            e.put("duracion", duracion != null ? duracion : (segundos != null ? segundos : 60));
            Long fin = null;
            try { fin = call.getLong("fin"); } catch (Exception ignored) { }
            if (fin == null) {
                Double d = call.getDouble("fin");
                if (d != null) fin = d.longValue();
            }
            boolean pausado = Boolean.TRUE.equals(call.getBoolean("pausado", false));
            boolean terminado = Boolean.TRUE.equals(call.getBoolean("terminado", false));
            if (pausado) {
                Integer restante = call.getInt("restante");
                e.put("estado", "pausa");
                e.put("restante", restante != null ? Math.max(1, restante) : 30);
                e.put("fin", ahora);
            } else if (terminado) {
                e.put("estado", "fin");
                e.put("fin", fin != null ? fin : ahora);
                e.put("avisado", true);
            } else {
                e.put("estado", "corre");
                e.put("fin", fin != null ? fin : ahora + (segundos != null ? segundos : 60) * 1000L);
                // El mismo descanso, sin cambios en la hora del final: si ya
                // avisó, no avisa de nuevo.
                boolean mismo = previo != null && id.equals(previo.optString("id")) && previo.optLong("fin") == e.optLong("fin");
                e.put("avisado", mismo && previo.optBoolean("avisado", false));
            }
            Descanso.guardar(c, e);
            if ("corre".equals(e.optString("estado"))) Descanso.programarFin(c, e.optLong("fin"));
            else Descanso.cancelarFin(c);
            Descanso.publicar(c, e, false);
            JSObject ret = new JSObject();
            ret.put("started", true);
            ret.put("version", VERSION);
            call.resolve(ret);
        } catch (Exception ex) {
            Log.e(TAG, "v13: no se pudo iniciar el descanso: " + ex);
            call.reject("No se pudo iniciar el descanso: " + ex.getMessage());
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        String idDescanso = call.getString("id", null);
        if (idDescanso != null && !idDescanso.isEmpty()) {
            iniciarV13(call, idDescanso);
            return;
        }
        Integer secondsParam = call.getInt("seconds");
        long seconds = (secondsParam != null) ? secondsParam.longValue() : 60L;
        String exerciseName = call.getString("exerciseName", "");
        // Lo que se ve lo decide la app (v10: "Press Banca" y "Meta 8 × 80 kg",
        // con el color del día). v11: el subtítulo ("Descanso", "Cardio") y
        // la cuenta para arriba del cardio, desde `inicio`.
        String tituloParam = call.getString("titulo", null);
        String cuerpoParam = call.getString("cuerpo", null);
        String subtituloParam = call.getString("subtitulo", null);
        boolean sube = "sube".equals(call.getString("cuenta", "baja"));
        Long inicioParam = null;
        try { inicioParam = call.getLong("inicio"); } catch (Exception ignored) { }
        if (inicioParam == null) {
            Double d = call.getDouble("inicio");
            if (d != null) inicioParam = d.longValue();
        }
        int accent = colorDe(call.getString("color", null));
        // Las series como tramos de la barra (v10). La app ya no las manda
        // (pedido: "en vez de cuántas series quedan, la meta o el récord"),
        // pero un llamado viejo las sigue dibujando.
        Integer hechasParam = call.getInt("hechas");
        Integer totalParam = call.getInt("total");
        int total = (totalParam != null) ? Math.max(0, Math.min(totalParam, 12)) : 0;
        int hechas = (hechasParam != null) ? Math.max(0, Math.min(hechasParam, total)) : 0;

        Context context = getContext();
        createChannel(context);

        // Cuenta para abajo: el "when" es la hora en que termina. Para arriba
        // (cardio): la hora en que arrancó. El reloj lo dibuja el sistema, en
        // vivo, en la notificación y en el chip de la barra de estado.
        long whenMillis = sube
                ? (inicioParam != null ? inicioParam : System.currentTimeMillis())
                : System.currentTimeMillis() + seconds * 1000L;

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, openIntent, piFlags);

        String title = (tituloParam != null && !tituloParam.isEmpty()) ? tituloParam : (sube ? "Cardio" : "Descanso");
        String body = (cuerpoParam != null && !cuerpoParam.isEmpty())
                ? cuerpoParam
                : (exerciseName != null && !exerciseName.isEmpty())
                        ? "Después: " + exerciseName
                        : "Tu próxima serie";
        String subText = (subtituloParam != null && !subtituloParam.isEmpty()) ? subtituloParam : "Modus Fit";
        // El reloj de pared del color del día: el mismo de la app, a la
        // derecha de la notificación.
        Bitmap reloj = relojDePared(accent, sube);
        // Al terminar la cuenta, la notificación se va sola: queda el aviso de
        // "Terminó el descanso" (programado aparte), sin un reloj en negativo.
        long seVaEn = sube ? 0L : seconds * 1000L + 1000L;

        Notification notification = null;

        // ═══════ CAMINO 1 (Android 16+, API 36): API NATIVA del framework ═══════
        // Construimos la notificación con android.app.Notification.Builder
        // DIRECTO, sin la capa de compatibilidad. Motivo: las APIs de Live
        // Updates (setRequestPromotedOngoing, ProgressStyle) son nuevísimas, y
        // la versión compat puede no trasladar el pedido de promoción al
        // sistema real — la notificación se ve, pero el sistema nunca la
        // considera para la Now Bar / chip.
        if (Build.VERSION.SDK_INT >= 36) {
            try {
                Icon smallIcon = Icon.createWithResource(context, getIconResId(context));

                Notification.ProgressStyle progressStyle = null;
                if (total > 0) {
                    List<Notification.ProgressStyle.Segment> segs = new ArrayList<>();
                    for (int i = 0; i < total; i++) segs.add(new Notification.ProgressStyle.Segment(1).setColor(accent));
                    progressStyle = new Notification.ProgressStyle()
                            .setProgressSegments(segs)
                            .setProgress(hechas)
                            .setProgressTrackerIcon(smallIcon);
                }

                // v11: sin texto fijo en el chip (setShortCriticalText dejaba
                // "1:30" quieto todo el descanso). Con el reloj y showWhen, el
                // chip y la cabecera cuentan en vivo.
                Notification.Builder nb = new Notification.Builder(context, CHANNEL_ID)
                        .setSmallIcon(smallIcon)
                        .setLargeIcon(Icon.createWithBitmap(reloj))
                        .setContentTitle(title)
                        .setContentText(body)
                        .setSubText(subText)
                        .setOngoing(true)
                        .setOnlyAlertOnce(true)
                        .setCategory(Notification.CATEGORY_STOPWATCH)
                        .setColor(accent)
                        .setContentIntent(pendingIntent)
                        .setWhen(whenMillis)
                        .setShowWhen(true)
                        .setUsesChronometer(true)
                        .setChronometerCountDown(!sube)
                        .setVisibility(Notification.VISIBILITY_PUBLIC);
                if (seVaEn > 0) nb.setTimeoutAfter(seVaEn);
                if (progressStyle != null) nb.setStyle(progressStyle);

                // setRequestPromotedOngoing NO está expuesto en el android.jar
                // del SDK (Google lo tiene detrás de un feature flag → "Cannot
                // resolve method" al compilar), pero SÍ existe en el framework
                // real del teléfono con Android 16 / One UI 8.5. Lo invocamos
                // por REFLECTION: compila siempre y en el dispositivo funciona.
                boolean promotedRequested = false;
                try {
                    Notification.Builder.class
                            .getMethod("setRequestPromotedOngoing", boolean.class)
                            .invoke(nb, true);
                    promotedRequested = true;
                } catch (Throwable t) {
                    Log.w(TAG, "v11: setRequestPromotedOngoing no disponible: " + t);
                }

                notification = nb.build();

                // Doble red: si el método no existió, seteamos el flag de
                // promoción directo sobre la notificación construida.
                if (!promotedRequested) {
                    try {
                        int flag = Notification.class.getField("FLAG_PROMOTED_ONGOING").getInt(null);
                        notification.flags |= flag;
                    } catch (Throwable t) {
                        Log.w(TAG, "v11: FLAG_PROMOTED_ONGOING no disponible: " + t);
                    }
                }
                Log.i(TAG, "v11: notificación construida con API NATIVA de Android 16");
            } catch (Throwable t) {
                Log.w(TAG, "v11: API nativa falló (" + t + ") — usando camino compat");
                notification = null;
            }
        }

        // ═══════ CAMINO 2 (fallback / Android < 16): NotificationCompat ═══════
        if (notification == null) {
            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(getIconResId(context))
                    .setLargeIcon(reloj)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setSubText(subText)
                    .setOngoing(true)
                    .setOnlyAlertOnce(true)
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
                    .setColor(accent)
                    .setContentIntent(pendingIntent)
                    .setWhen(whenMillis)
                    .setShowWhen(true)
                    .setUsesChronometer(true)
                    .setChronometerCountDown(!sube)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);
            if (seVaEn > 0) builder.setTimeoutAfter(seVaEn);
            if (total > 0) builder.setProgress(total, hechas, false);
            if (Build.VERSION.SDK_INT >= 36) {
                try {
                    builder.setRequestPromotedOngoing(true);
                    if (total > 0) {
                        List<NotificationCompat.ProgressStyle.Segment> segments = new ArrayList<>();
                        for (int i = 0; i < total; i++) segments.add(new NotificationCompat.ProgressStyle.Segment(1).setColor(accent));
                        builder.setStyle(new NotificationCompat.ProgressStyle()
                                .setProgressSegments(segments)
                                .setProgress(hechas)
                                .setProgressTrackerIcon(IconCompat.createWithResource(context, getIconResId(context))));
                    }
                } catch (Throwable t) {
                    Log.w(TAG, "compat Live Update no disponible: " + t.getMessage());
                }
            }
            notification = builder.build();
            Log.i(TAG, "v11: notificación construida con NotificationCompat");
        }

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
        // v13: fuera también la alarma del final y el estado guardado.
        Descanso.cancelarFin(getContext());
        Descanso.guardar(getContext(), null);
        JSObject ret = new JSObject();
        ret.put("stopped", true);
        call.resolve(ret);
    }

    // EL RELOJ DE PARED de la app (DialDescanso), quieto: el bisel de doce
    // marcas, el arco del color del día en pastel con lo que falta y la aguja.
    // Para arriba (cardio), el arco entero y sin aguja.
    private static Bitmap relojDePared(int color, boolean sube) {
        int s = 192;
        Bitmap b = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        float cx = s / 2f, cy = s / 2f;
        p.setStyle(Paint.Style.FILL);
        p.setColor(Color.parseColor("#1E1F23"));
        c.drawCircle(cx, cy, s * 0.48f, p);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeCap(Paint.Cap.ROUND);
        for (int i = 0; i < 12; i++) {
            double a = Math.toRadians(i * 30);
            boolean mayor = i % 3 == 0;
            float r1 = s * 0.42f, r2 = mayor ? s * 0.33f : s * 0.37f;
            p.setColor(mayor ? Color.parseColor("#A4A6AC") : Color.parseColor("#5E6066"));
            p.setStrokeWidth(mayor ? s * 0.032f : s * 0.022f);
            c.drawLine(cx + (float) (r1 * Math.sin(a)), cy - (float) (r1 * Math.cos(a)),
                    cx + (float) (r2 * Math.sin(a)), cy - (float) (r2 * Math.cos(a)), p);
        }
        float r = s * 0.235f;
        RectF oval = new RectF(cx - r, cy - r, cx + r, cy + r);
        p.setStrokeWidth(s * 0.085f);
        p.setColor(Color.argb(46, 255, 255, 255));
        c.drawCircle(cx, cy, r, p);
        p.setColor(mezclar(color, Color.WHITE, 0.28f));
        float barrido = sube ? 360f : 300f;
        c.drawArc(oval, -90f + (360f - barrido), barrido, false, p);
        if (!sube) {
            double ang = Math.toRadians(360 - barrido);
            p.setStyle(Paint.Style.FILL);
            p.setColor(Color.parseColor("#F1F1EE"));
            c.drawCircle(cx + (float) (r * Math.sin(ang)), cy - (float) (r * Math.cos(ang)), s * 0.052f, p);
        }
        return b;
    }

    // Mezcla dos colores: t es cuánto del segundo.
    private static int mezclar(int a, int b, float t) {
        int r = Math.round(Color.red(a) * (1 - t) + Color.red(b) * t);
        int g = Math.round(Color.green(a) * (1 - t) + Color.green(b) * t);
        int bl = Math.round(Color.blue(a) * (1 - t) + Color.blue(b) * t);
        return Color.rgb(r, g, bl);
    }

    // Los canales (el del reloj y los del final) los crea Descanso.
    private void createChannel(Context context) {
        Descanso.crearCanales(context);
    }

    private int colorDe(String hex) {
        if (hex == null || hex.isEmpty()) return ACCENT;
        try {
            return Color.parseColor(hex);
        } catch (IllegalArgumentException e) {
            return ACCENT;
        }
    }

    private int getIconResId(Context context) {
        int resId = context.getResources().getIdentifier("ic_stat_modusfit", "drawable", context.getPackageName());
        if (resId == 0) resId = context.getApplicationInfo().icon;
        return resId;
    }
}
