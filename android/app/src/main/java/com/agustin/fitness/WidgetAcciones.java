package com.agustin.fitness;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Iterator;
import java.util.Locale;

/**
 * Lo que se toca en un widget y se resuelve acá, sin abrir la app: anotar un
 * suplemento y arrancar un descanso. (Pausar, seguir, reiniciar y cerrar el
 * descanso van al mismo receptor que los botones de la notificación.)
 *
 * Las tomas se guardan en el teléfono: { "2026-11-14": { id: [n, t] } }, con
 * n = cuántas llevás y t = cuándo fue el último toque. La app tiene las suyas
 * y las junta con éstas (gana el toque más nuevo). Es la misma regla que
 * src/suplementos.js: si cambiás una, cambiá la otra.
 */
public class WidgetAcciones extends BroadcastReceiver {
    static final String SUP = "com.agustin.fitness.widget.SUP";
    static final String DESCANSO = "com.agustin.fitness.widget.DESCANSO";
    private static final String KEY_TOMAS = "tomas";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        Context c = context.getApplicationContext();
        Uri u = intent.getData();
        String dato = u == null ? null : u.getLastPathSegment();
        if (dato == null) return;
        if (SUP.equals(intent.getAction())) {
            tomar(c, dato);
            ModusWidget.pintarTodos(c);
            TodayWidgetPlugin.avisar("tomas");
        } else if (DESCANSO.equals(intent.getAction())) {
            try { Descanso.iniciarRapido(c, Math.max(5, Math.min(Integer.parseInt(dato), 3600))); } catch (Exception e) { /* un dato roto */ }
        }
    }

    // ── Las fechas, en la hora del teléfono (como todayStr en la app) ──
    static String hoy() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Calendar.getInstance().getTime());
    }

    private static Calendar calendario(String fecha) {
        Calendar cal = Calendar.getInstance();
        try {
            String[] p = fecha.split("-");
            cal.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]), 12, 0, 0);
        } catch (Exception e) { /* hoy */ }
        return cal;
    }

    static String masDias(String fecha, int dias) {
        Calendar cal = calendario(fecha);
        cal.add(Calendar.DAY_OF_MONTH, dias);
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.getTime());
    }

    /** 0 = lunes … 6 = domingo. */
    static int diaDeLaSemana(String fecha) {
        return (calendario(fecha).get(Calendar.DAY_OF_WEEK) + 5) % 7;
    }

    static String lunesDe(String fecha) {
        return masDias(fecha, -diaDeLaSemana(fecha));
    }

    // ── Las tomas ──
    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(TodayWidgetPlugin.PREFS_NAME, Context.MODE_PRIVATE);
    }

    static synchronized JSONObject tomas(Context c) {
        try { return new JSONObject(prefs(c).getString(KEY_TOMAS, "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    static JSONObject tomasDe(Context c, String fecha) {
        JSONObject dia = tomas(c).optJSONObject(fecha);
        return dia == null ? new JSONObject() : dia;
    }

    /** Un toque: una toma más; con todas las del día hechas, el toque la vacía. */
    static synchronized void tomar(Context c, String id) {
        try {
            int dosis = 0;
            JSONObject sup = ModusWidget.estado(c).optJSONObject("sup");
            JSONArray lista = sup == null ? null : sup.optJSONArray("lista");
            for (int i = 0; lista != null && i < lista.length(); i++) {
                JSONObject x = lista.optJSONObject(i);
                if (x != null && id.equals(x.optString("id"))) dosis = Math.max(1, x.optInt("dosis", 1));
            }
            if (dosis == 0) return; // ya no existe ese suplemento
            String hoy = hoy();
            JSONObject todas = tomas(c);
            JSONObject dia = todas.optJSONObject(hoy);
            if (dia == null) dia = new JSONObject();
            JSONArray a = dia.optJSONArray(id);
            int n = a == null ? 0 : Math.max(0, a.optInt(0, 0));
            dia.put(id, new JSONArray().put(n >= dosis ? 0 : n + 1).put(System.currentTimeMillis()));
            todas.put(hoy, dia);
            guardar(c, todas, hoy);
        } catch (Exception e) { /* un toque perdido no rompe nada */ }
    }

    /** Lo que manda la app: de cada suplemento y día queda el toque más nuevo. */
    static synchronized void unir(Context c, JSONObject entrantes) {
        if (entrantes == null) return;
        try {
            JSONObject todas = tomas(c);
            boolean cambio = false;
            Iterator<String> fechas = entrantes.keys();
            while (fechas.hasNext()) {
                String f = fechas.next();
                JSONObject nuevo = entrantes.optJSONObject(f);
                if (nuevo == null || !f.matches("\\d{4}-\\d{2}-\\d{2}")) continue;
                JSONObject dia = todas.optJSONObject(f);
                if (dia == null) dia = new JSONObject();
                Iterator<String> ids = nuevo.keys();
                while (ids.hasNext()) {
                    String id = ids.next();
                    JSONArray b = nuevo.optJSONArray(id);
                    if (b == null || b.optLong(1, 0) <= 0) continue;
                    JSONArray a = dia.optJSONArray(id);
                    if (a != null && a.optLong(1, 0) >= b.optLong(1, 0)) continue;
                    dia.put(id, new JSONArray().put(Math.max(0, b.optInt(0, 0))).put(b.optLong(1, 0)));
                    cambio = true;
                }
                todas.put(f, dia);
            }
            if (cambio) guardar(c, todas, hoy());
        } catch (Exception e) { /* lo que no se pudo leer, se ignora */ }
    }

    // Quedan diez días: la app guarda el historial; acá sólo hace falta lo reciente.
    private static void guardar(Context c, JSONObject todas, String hoy) {
        try {
            String desde = masDias(hoy, -10);
            JSONArray viejas = new JSONArray();
            Iterator<String> it = todas.keys();
            while (it.hasNext()) { String f = it.next(); if (f.compareTo(desde) < 0) viejas.put(f); }
            for (int i = 0; i < viejas.length(); i++) todas.remove(viejas.optString(i));
        } catch (Exception e) { /* se guarda igual */ }
        prefs(c).edit().putString(KEY_TOMAS, todas.toString()).apply();
    }
}
