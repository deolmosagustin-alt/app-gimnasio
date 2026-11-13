package com.agustin.fitness;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;

/**
 * El puente de los widgets. La app manda el estado ya resuelto (que toca hoy,
 * la semana, el ciclo) y aca se guarda y se repintan los widgets: ellos no
 * saben nada de rutinas. "vista" devuelve el dibujo como PNG, para probarlo
 * sin tener que poner el widget en la pantalla de inicio.
 */
@CapacitorPlugin(name = "TodayWidget")
public class TodayWidgetPlugin extends Plugin {

    public static final String PREFS_NAME = "modusfit_widget";
    public static final String KEY_LABEL = "today_label";
    public static final String KEY_ESTADO = "estado";
    public static final int VERSION = 2;

    @PluginMethod
    public void updateToday(PluginCall call) {
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor ed = prefs.edit();
        String label = call.getString("label", null);
        if (label != null) ed.putString(KEY_LABEL, label);
        JSObject estado = call.getObject("estado", null);
        if (estado != null) {
            ed.putString(KEY_ESTADO, estado.toString());
        } else if (label != null && !prefs.contains(KEY_ESTADO)) {
            // Una web anterior a los widgets nuevos: al menos el titulo de hoy.
            try {
                ed.putString(KEY_ESTADO, new JSONObject().put("hoy", new JSONObject().put("titulo", label).put("sub", "Modus Fit")).toString());
            } catch (Exception e) { /* nada */ }
        }
        ed.apply();
        ModusWidget.pintarTodos(context);
        JSObject ret = new JSObject();
        ret.put("updated", true);
        ret.put("version", VERSION);
        call.resolve(ret);
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("version", VERSION);
        call.resolve(ret);
    }

    @PluginMethod
    public void vista(PluginCall call) {
        try {
            String tipo = call.getString("tipo", "hoy");
            float d = getContext().getResources().getDisplayMetrics().density;
            int w = Math.round(call.getInt("ancho", 300) * d), h = Math.round(call.getInt("alto", 140) * d);
            JSObject estado = call.getObject("estado", null);
            JSONObject datos = estado != null ? new JSONObject(estado.toString()) : ModusWidget.estado(getContext());
            Bitmap bmp = WidgetDibujo.dibujar(getContext(), tipo, Math.min(w, 1400), Math.min(h, 1000), datos);
            ByteArrayOutputStream salida = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.PNG, 100, salida);
            JSObject ret = new JSObject();
            ret.put("png", Base64.encodeToString(salida.toByteArray(), Base64.NO_WRAP));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("No se pudo dibujar el widget", e);
        }
    }
}
