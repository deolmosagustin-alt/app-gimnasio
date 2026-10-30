package com.agustin.fitness;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

// EL DESCANSO EN LA NOTIFICACIÓN (plugin v13). El estado del descanso que se
// ve en la barra se guarda acá, aparte de la web, para que los botones de la
// notificación (Pausar, Seguir, +15 s, Reiniciar, Cerrar) y el aviso del
// final anden con la app cerrada o en segundo plano. Antes la notificación
// sólo mostraba el reloj y se iba al llegar a cero; el aviso del final era
// otra notificación, programada desde la web.
//
// Tres estados, como el dock de la app:
//   corre: el reloj baja (en la notificación y en el chip de la barra).
//   pausa: quieto, con lo que falta escrito.
//   fin:   llegó a cero; avisa una vez y queda contando cuánto te pasaste,
//          hasta que la cierres, la reinicies o arranque otro descanso.
// La web se entera de lo que pasó acá por el evento "accion" del plugin o,
// al volver a la app, leyendo estado() (los eventos quedan en una cola).
final class Descanso {
    private static final String TAG = "RestTimerPlugin";
    private static final String PREFS = "modusfit_descanso";
    static final int ID = 9100;
    // Los canales: el del reloj, silencioso (el mismo del v8, así no cambia
    // lo que la persona ya configuró), y los del final: con sonido y
    // vibración fuerte, o sólo vibración (según "Cómo avisa" en Perfil).
    static final String CANAL_CORRE = "modusfit-rest-chrono-v8";
    static final String CANAL_FIN = "modusfit-rest-done-v1";
    static final String CANAL_FIN_VIBRA = "modusfit-rest-done-vibra-v1";
    static final int VERDE = Color.parseColor("#10B981");
    static final int ACENTO = Color.parseColor("#14B8A6");
    private static final long[] VIBRACION_FIN = new long[]{0, 500, 250, 500, 250, 800};

    static final String PAUSAR = "com.agustin.fitness.descanso.PAUSAR";
    static final String SEGUIR = "com.agustin.fitness.descanso.SEGUIR";
    static final String MAS15 = "com.agustin.fitness.descanso.MAS15";
    static final String REINICIAR = "com.agustin.fitness.descanso.REINICIAR";
    static final String CERRAR = "com.agustin.fitness.descanso.CERRAR";
    static final String FIN = "com.agustin.fitness.descanso.FIN";

    // La app a la vista: el aviso del final lo da la propia app (el sonido y
    // el dock), y la notificación pasa a "fin" sin sonar. Lo fija el plugin.
    static volatile boolean enPrimerPlano = false;
    // El plugin vivo, para avisarle a la web en el momento.
    static volatile RestTimerPlugin plugin = null;

    private Descanso() { }

    // ── El estado guardado ────────────────────────────────────────────────
    static JSONObject leer(Context c) {
        try {
            String s = prefs(c).getString("estado", null);
            return s != null ? new JSONObject(s) : null;
        } catch (Exception e) {
            return null;
        }
    }

    static void guardar(Context c, JSONObject e) {
        prefs(c).edit().putString("estado", e != null ? e.toString() : null).apply();
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // Lo que pasó en la notificación y la web todavía no leyó. Cada evento
    // lleva un número (seq) para que la web no aplique dos veces el mismo.
    static JSONObject anotar(Context c, JSONObject e, String accion) {
        JSONObject ev = new JSONObject();
        try {
            SharedPreferences p = prefs(c);
            int seq = p.getInt("seq", 0) + 1;
            ev.put("seq", seq);
            ev.put("accion", accion);
            ev.put("id", e.optString("id", ""));
            ev.put("estado", e.optString("estado", ""));
            ev.put("fin", e.optLong("fin", 0));
            ev.put("restante", e.optInt("restante", 0));
            ev.put("duracion", e.optInt("duracion", 0));
            ev.put("ts", System.currentTimeMillis());
            JSONArray cola = new JSONArray(p.getString("eventos", "[]"));
            cola.put(ev);
            JSONArray recorte = new JSONArray();
            for (int i = Math.max(0, cola.length() - 20); i < cola.length(); i++) recorte.put(cola.get(i));
            p.edit().putInt("seq", seq).putString("eventos", recorte.toString()).apply();
        } catch (Exception ex) {
            Log.w(TAG, "No se pudo anotar el evento: " + ex);
        }
        RestTimerPlugin vivo = plugin;
        if (vivo != null) vivo.emitir(ev);
        return ev;
    }

    // Los eventos pendientes, y la cola queda vacía (la web ya los tiene).
    static JSONArray sacarEventos(Context c) {
        try {
            SharedPreferences p = prefs(c);
            JSONArray cola = new JSONArray(p.getString("eventos", "[]"));
            p.edit().putString("eventos", "[]").apply();
            return cola;
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    // ── Lo que hacen los botones y la alarma ──────────────────────────────
    static void aplicar(Context c, String accion) {
        JSONObject e = leer(c);
        if (e == null) {
            // Sin descanso guardado (se cerró desde la app): fuera la notificación.
            cancelarNotificacion(c);
            cancelarFin(c);
            return;
        }
        long ahora = System.currentTimeMillis();
        String estado = e.optString("estado", "");
        try {
            if (PAUSAR.equals(accion) && "corre".equals(estado)) {
                int restante = (int) Math.max(1, Math.ceil((e.optLong("fin") - ahora) / 1000.0));
                e.put("estado", "pausa").put("restante", restante);
                cancelarFin(c);
            } else if (SEGUIR.equals(accion) && "pausa".equals(estado)) {
                e.put("estado", "corre").put("fin", ahora + e.optInt("restante", 30) * 1000L).put("avisado", false);
                programarFin(c, e.optLong("fin"));
            } else if (MAS15.equals(accion) && "corre".equals(estado)) {
                long fin = Math.max(ahora + 5000L, e.optLong("fin") + 15000L);
                e.put("fin", fin);
                programarFin(c, fin);
            } else if (MAS15.equals(accion) && "pausa".equals(estado)) {
                e.put("restante", e.optInt("restante", 0) + 15);
            } else if (REINICIAR.equals(accion)) {
                int duracion = Math.max(5, e.optInt("duracion", 60));
                e.put("estado", "corre").put("fin", ahora + duracion * 1000L).put("avisado", false).remove("restante");
                programarFin(c, e.optLong("fin"));
            } else if (CERRAR.equals(accion)) {
                e.put("estado", "cerrado");
                cancelarNotificacion(c);
                cancelarFin(c);
                anotar(c, e, "cerrar");
                guardar(c, null);
                return;
            } else if (FIN.equals(accion)) {
                // La alarma (o el reloj de respaldo del plugin). Si mientras
                // tanto se pausó, se sumó tiempo o se cerró, no hace nada.
                if (!"corre".equals(estado) || ahora < e.optLong("fin") - 1500L) return;
                e.put("estado", "fin");
                boolean alertar = !enPrimerPlano && !e.optBoolean("avisado", false);
                e.put("avisado", true);
                guardar(c, e);
                publicar(c, e, alertar);
                anotar(c, e, "fin");
                return;
            } else {
                return; // un botón que no corresponde a este estado
            }
        } catch (Exception ex) {
            Log.w(TAG, "No se pudo aplicar " + accion + ": " + ex);
            return;
        }
        guardar(c, e);
        publicar(c, e, false);
        anotar(c, e, nombreDe(accion));
    }

    private static String nombreDe(String accion) {
        if (PAUSAR.equals(accion)) return "pausar";
        if (SEGUIR.equals(accion)) return "seguir";
        if (MAS15.equals(accion)) return "mas15";
        if (REINICIAR.equals(accion)) return "reiniciar";
        if (CERRAR.equals(accion)) return "cerrar";
        return "fin";
    }

    // ── La alarma del final ───────────────────────────────────────────────
    // Exacta si Android lo permite ("Alarmas y recordatorios"); si no, la
    // más cercana que deja el sistema, y el plugin, si está vivo, tiene su
    // propio reloj de respaldo. Desde Android 14 ese permiso viene apagado.
    static boolean alarmasExactas(Context c) {
        if (Build.VERSION.SDK_INT < 31) return true;
        AlarmManager am = c.getSystemService(AlarmManager.class);
        return am != null && am.canScheduleExactAlarms();
    }

    static void programarFin(Context c, long fin) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        PendingIntent pi = intento(c, FIN, 9109);
        try {
            if (alarmasExactas(c)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fin, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fin, pi);
        } catch (SecurityException se) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fin, pi);
        }
        RestTimerPlugin vivo = plugin;
        if (vivo != null) vivo.respaldo(fin);
    }

    static void cancelarFin(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(intento(c, FIN, 9109));
        RestTimerPlugin vivo = plugin;
        if (vivo != null) vivo.respaldo(0);
    }

    private static PendingIntent intento(Context c, String accion, int codigo) {
        Intent i = new Intent(c, RestTimerReceiver.class).setAction(accion);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(c, codigo, i, flags);
    }

    // ── La notificación ───────────────────────────────────────────────────
    static void crearCanales(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager m = c.getSystemService(NotificationManager.class);
        if (m == null) return;
        NotificationChannel corre = new NotificationChannel(CANAL_CORRE, "Cronómetro de descanso", NotificationManager.IMPORTANCE_DEFAULT);
        corre.setDescription("El reloj del descanso entre series, en vivo");
        corre.setShowBadge(false);
        corre.setSound(null, null);
        corre.enableVibration(false);
        m.createNotificationChannel(corre);
        NotificationChannel fin = new NotificationChannel(CANAL_FIN, "Fin del descanso", NotificationManager.IMPORTANCE_HIGH);
        fin.setDescription("Aviso al terminar el descanso entre series");
        fin.setShowBadge(false);
        fin.enableVibration(true);
        fin.setVibrationPattern(VIBRACION_FIN);
        m.createNotificationChannel(fin);
        NotificationChannel vibra = new NotificationChannel(CANAL_FIN_VIBRA, "Fin del descanso, sin sonido", NotificationManager.IMPORTANCE_HIGH);
        vibra.setDescription("Aviso al terminar el descanso, sólo con vibración");
        vibra.setShowBadge(false);
        vibra.setSound(null, null);
        vibra.enableVibration(true);
        vibra.setVibrationPattern(VIBRACION_FIN);
        m.createNotificationChannel(vibra);
    }

    static void cancelarNotificacion(Context c) {
        try {
            NotificationManagerCompat.from(c).cancel(ID);
        } catch (SecurityException ignored) { }
    }

    // Arma y publica la notificación del estado. `alertar`: el final con
    // sonido y vibración (sólo la primera vez y con la app fuera de vista).
    static void publicar(Context c, JSONObject e, boolean alertar) {
        crearCanales(c);
        String estado = e.optString("estado", "corre");
        long ahora = System.currentTimeMillis();
        long fin = e.optLong("fin", ahora);
        int color = e.optInt("color", ACENTO);
        String titulo = e.optString("titulo", "Descanso");
        String cuerpo = e.optString("cuerpo", "Tu próxima serie");
        String subtitulo = e.optString("subtitulo", "Descanso");
        boolean esFin = "fin".equals(estado);
        boolean esPausa = "pausa".equals(estado);
        String canal = esFin && alertar ? ("vibration".equals(e.optString("alerta")) ? CANAL_FIN_VIBRA : CANAL_FIN) : CANAL_CORRE;
        int restante = e.optInt("restante", 0);

        if (esFin) {
            titulo = e.optString("tituloFin", "Terminó el descanso");
            cuerpo = e.optString("cuerpoFin", "Te toca la próxima serie.");
        } else if (esPausa) {
            cuerpo = "En pausa. Faltan " + reloj(restante) + ".";
        }
        Bitmap icono = esFin ? relojTerminado() : esPausa ? relojEnPausa(color) : relojDePared(color, false);

        // Los botones: corriendo, Pausar, +15 s y Cerrar; en pausa, Seguir,
        // +15 s y Cerrar; terminado, Reiniciar y Cerrar.
        String[][] botones = esFin
                ? new String[][]{{REINICIAR, "Reiniciar"}, {CERRAR, "Cerrar"}}
                : esPausa
                        ? new String[][]{{SEGUIR, "Seguir"}, {MAS15, "+15 s"}, {CERRAR, "Cerrar"}}
                        : new String[][]{{PAUSAR, "Pausar"}, {MAS15, "+15 s"}, {CERRAR, "Cerrar"}};

        Intent abrir = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent alTocar = PendingIntent.getActivity(c, 0, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        // Si la alarma nunca llega (el sistema la demoró), la notificación no
        // queda contando en negativo: se va un minuto y medio después. La de
        // "terminado" se va a la media hora, como el reloj del dock.
        long seVaEn = esFin ? Math.max(1000L, fin + 30L * 60L * 1000L - ahora) : esPausa ? 0L : Math.max(1000L, fin - ahora + 90L * 1000L);

        Notification n = null;
        if (Build.VERSION.SDK_INT >= 36) {
            try {
                Icon chico = Icon.createWithResource(c, iconoChico(c));
                Notification.Builder nb = new Notification.Builder(c, canal)
                        .setSmallIcon(chico)
                        .setLargeIcon(Icon.createWithBitmap(icono))
                        .setContentTitle(titulo)
                        .setContentText(cuerpo)
                        .setSubText(subtitulo)
                        .setOngoing(true)
                        .setOnlyAlertOnce(!alertar)
                        .setCategory(Notification.CATEGORY_STOPWATCH)
                        .setColor(esFin ? VERDE : color)
                        .setContentIntent(alTocar)
                        .setVisibility(Notification.VISIBILITY_PUBLIC);
                if (esPausa) {
                    nb.setShowWhen(false).setUsesChronometer(false);
                    textoDelChip(nb, reloj(restante));
                } else {
                    nb.setWhen(fin).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(!esFin);
                }
                if (seVaEn > 0) nb.setTimeoutAfter(seVaEn);
                for (int i = 0; i < botones.length; i++) {
                    nb.addAction(new Notification.Action.Builder(chico, botones[i][1], intento(c, botones[i][0], 9101 + i)).build());
                }
                boolean pedido = false;
                try {
                    Notification.Builder.class.getMethod("setRequestPromotedOngoing", boolean.class).invoke(nb, true);
                    pedido = true;
                } catch (Throwable t) {
                    Log.w(TAG, "v13: setRequestPromotedOngoing no disponible: " + t);
                }
                n = nb.build();
                if (!pedido) {
                    try {
                        n.flags |= Notification.class.getField("FLAG_PROMOTED_ONGOING").getInt(null);
                    } catch (Throwable t) {
                        Log.w(TAG, "v13: FLAG_PROMOTED_ONGOING no disponible: " + t);
                    }
                }
            } catch (Throwable t) {
                Log.w(TAG, "v13: la API nativa falló (" + t + "), uso la de compatibilidad");
                n = null;
            }
        }
        if (n == null) {
            NotificationCompat.Builder b = new NotificationCompat.Builder(c, canal)
                    .setSmallIcon(iconoChico(c))
                    .setLargeIcon(icono)
                    .setContentTitle(titulo)
                    .setContentText(cuerpo)
                    .setSubText(subtitulo)
                    .setOngoing(true)
                    .setOnlyAlertOnce(!alertar)
                    .setPriority(alertar ? NotificationCompat.PRIORITY_HIGH : NotificationCompat.PRIORITY_DEFAULT)
                    .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
                    .setColor(esFin ? VERDE : color)
                    .setContentIntent(alTocar)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);
            if (esPausa) {
                b.setShowWhen(false).setUsesChronometer(false);
            } else {
                b.setWhen(fin).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(!esFin);
            }
            if (alertar) b.setVibrate(VIBRACION_FIN);
            if (seVaEn > 0) b.setTimeoutAfter(seVaEn);
            for (int i = 0; i < botones.length; i++) b.addAction(0, botones[i][1], intento(c, botones[i][0], 9101 + i));
            n = b.build();
        }
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                    || c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                NotificationManagerCompat.from(c).notify(ID, n);
            }
        } catch (SecurityException se) {
            Log.e(TAG, "Sin permiso para publicar: " + se.getMessage());
        }
    }

    // En pausa el chip de la barra muestra lo que falta, quieto (Android 16:
    // setShortCriticalText, por reflexión porque no todos los SDK lo traen).
    private static void textoDelChip(Notification.Builder nb, String texto) {
        try {
            Notification.Builder.class.getMethod("setShortCriticalText", String.class).invoke(nb, texto);
        } catch (Throwable ignored) { }
    }

    static String reloj(int seg) {
        int s = Math.max(0, seg);
        return (s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
    }

    static int iconoChico(Context c) {
        int resId = c.getResources().getIdentifier("ic_stat_modusfit", "drawable", c.getPackageName());
        return resId != 0 ? resId : c.getApplicationInfo().icon;
    }

    // ── Los relojes de pared (el DialDescanso de la app, quieto) ──────────
    // Corriendo: el arco del color del día con la aguja. En pausa: el arco
    // apagado con gris y las dos rayas de la pausa. Terminado: el aro entero
    // en verde con el ✓.
    static Bitmap relojDePared(int color, boolean sube) {
        Bitmap b = base();
        Canvas c = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        float s = b.getWidth(), cx = s / 2f, cy = s / 2f, r = s * 0.235f;
        arco(c, p, s, mezclar(color, Color.WHITE, 0.28f), sube ? 360f : 300f);
        if (!sube) {
            double ang = Math.toRadians(60);
            p.setStyle(Paint.Style.FILL);
            p.setColor(Color.parseColor("#F1F1EE"));
            c.drawCircle(cx + (float) (r * Math.sin(ang)), cy - (float) (r * Math.cos(ang)), s * 0.052f, p);
        }
        return b;
    }

    static Bitmap relojEnPausa(int color) {
        Bitmap b = base();
        Canvas c = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        float s = b.getWidth(), cx = s / 2f, cy = s / 2f;
        arco(c, p, s, mezclar(mezclar(color, Color.parseColor("#8A8C92"), 0.55f), Color.WHITE, 0.15f), 300f);
        p.setStyle(Paint.Style.FILL);
        p.setColor(Color.parseColor("#F1F1EE"));
        float alto = s * 0.16f, ancho = s * 0.045f, sep = s * 0.045f;
        c.drawRoundRect(new RectF(cx - sep - ancho, cy - alto / 2, cx - sep, cy + alto / 2), ancho / 2, ancho / 2, p);
        c.drawRoundRect(new RectF(cx + sep, cy - alto / 2, cx + sep + ancho, cy + alto / 2), ancho / 2, ancho / 2, p);
        return b;
    }

    static Bitmap relojTerminado() {
        Bitmap b = base();
        Canvas c = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        float s = b.getWidth(), cx = s / 2f, cy = s / 2f;
        arco(c, p, s, mezclar(VERDE, Color.WHITE, 0.2f), 360f);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeJoin(Paint.Join.ROUND);
        p.setStrokeWidth(s * 0.05f);
        p.setColor(Color.parseColor("#F1F1EE"));
        Path tilde = new Path();
        tilde.moveTo(cx - s * 0.085f, cy + s * 0.005f);
        tilde.lineTo(cx - s * 0.02f, cy + s * 0.07f);
        tilde.lineTo(cx + s * 0.095f, cy - s * 0.065f);
        c.drawPath(tilde, p);
        return b;
    }

    // La caja del reloj: el fondo de grafito y el bisel de doce marcas.
    private static Bitmap base() {
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
        return b;
    }

    // El aro de fondo y el arco con lo que falta (de las doce, en sentido horario).
    private static void arco(Canvas c, Paint p, float s, int color, float barrido) {
        float cx = s / 2f, cy = s / 2f, r = s * 0.235f;
        RectF oval = new RectF(cx - r, cy - r, cx + r, cy + r);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeWidth(s * 0.085f);
        p.setColor(Color.argb(46, 255, 255, 255));
        c.drawCircle(cx, cy, r, p);
        p.setColor(color);
        c.drawArc(oval, -90f + (360f - barrido), barrido, false, p);
    }

    // Mezcla dos colores: t es cuánto del segundo.
    static int mezclar(int a, int b, float t) {
        int r = Math.round(Color.red(a) * (1 - t) + Color.red(b) * t);
        int g = Math.round(Color.green(a) * (1 - t) + Color.green(b) * t);
        int bl = Math.round(Color.blue(a) * (1 - t) + Color.blue(b) * t);
        return Color.rgb(r, g, bl);
    }
}
