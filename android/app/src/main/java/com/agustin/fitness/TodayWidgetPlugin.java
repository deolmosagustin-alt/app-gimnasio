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
 * El puente de los widgets. La app manda el estado ya resuelto (la agenda de
 * la semana, los suplementos, los tiempos de descanso) y acá se guarda y se
 * repintan los widgets: ellos no saben nada de rutinas.
 *
 * v3 (14/11/2026): los widgets se tocan. "tomas" devuelve los suplementos
 * anotados desde la pantalla de inicio; el evento "accion" le avisa a la web
 * lo que se tocó ("iniciar" con el día, "rutina", "suplementos", "tomas").
 * "vista" devuelve cualquier widget como PNG, para probarlos y para sacar las
 * vistas previas del menú de widgets.
 */
@CapacitorPlugin(name = "TodayWidget")
public class TodayWidgetPlugin extends Plugin {

    public static final String PREFS_NAME = "modusfit_widget";
    public static final String KEY_LABEL = "today_label";
    public static final String KEY_ESTADO = "estado";
    public static final int VERSION = 3;

    private static volatile TodayWidgetPlugin vivo = null;

    @Override
    public void load() {
        vivo = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (vivo == this) vivo = null;
    }

    /** Algo cambió en un widget con la app viva (un suplemento anotado). */
    static void avisar(String accion) {
        TodayWidgetPlugin p = vivo;
        if (p == null) return;
        try {
            JSObject o = new JSObject();
            o.put("accion", accion);
            p.notifyListeners("accion", o);
        } catch (Exception e) { /* la web lo lee al volver */ }
    }

    /** Un toque que abrió la app: queda guardado hasta que la web lo escuche. */
    void accion(String accion, String dayKey, String fecha) {
        JSObject o = new JSObject();
        o.put("accion", accion);
        if (dayKey != null) o.put("dayKey", dayKey);
        if (fecha != null) o.put("fecha", fecha);
        notifyListeners("accion", o, true);
    }

    @PluginMethod
    public void updateToday(PluginCall call) {
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor ed = prefs.edit();
        String label = call.getString("label", null);
        if (label != null) ed.putString(KEY_LABEL, label);
        JSObject estado = call.getObject("estado", null);
        if (estado != null) ed.putString(KEY_ESTADO, estado.toString());
        ed.commit();
        if (estado != null) {
            JSONObject sup = estado.optJSONObject("sup");
            if (sup != null) WidgetAcciones.unir(context, sup.optJSONObject("tomas"));
        }
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

    /**
     * Pide ponerlo en la pantalla de inicio: Android muestra su cartel con
     * "Agregar" (desde Android 8, si el lanzador lo permite). cual: 0 a 7, el
     * lugar en ModusWidget.TABLA.
     */
    @PluginMethod
    public void fijar(PluginCall call) {
        JSObject ret = new JSObject();
        boolean pedido = false;
        try {
            int cual = call.getInt("cual", -1);
            if (android.os.Build.VERSION.SDK_INT >= 26 && cual >= 0 && cual < ModusWidget.TABLA.length) {
                android.appwidget.AppWidgetManager mgr = android.appwidget.AppWidgetManager.getInstance(getContext());
                if (mgr.isRequestPinAppWidgetSupported()) {
                    pedido = mgr.requestPinAppWidget(new android.content.ComponentName(getContext(), (Class<?>) ModusWidget.TABLA[cual][0]), null, null);
                }
            }
        } catch (Exception e) { /* no se pudo: se agrega a mano */ }
        ret.put("pedido", pedido);
        call.resolve(ret);
    }

    /** Los suplementos anotados en el teléfono (los últimos diez días). */
    @PluginMethod
    public void tomas(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            ret.put("tomas", JSObject.fromJSONObject(WidgetAcciones.tomas(getContext())));
        } catch (Exception e) {
            ret.put("tomas", new JSObject());
        }
        call.resolve(ret);
    }

    /**
     * Un widget como PNG. tipo: sup, sup1, empezar, descanso o tira; ancho y
     * alto en dp; estado, el de muestra (o el guardado); vivo, un descanso de
     * muestra; indice, cuál suplemento en "sup1".
     */
    @PluginMethod
    public void vista(PluginCall call) {
        try {
            String tipo = call.getString("tipo", "empezar");
            float d = getContext().getResources().getDisplayMetrics().density;
            int w = Math.round(call.getInt("ancho", 320) * d), h = Math.round(call.getInt("alto", 84) * d);
            JSObject estado = call.getObject("estado", null);
            JSONObject datos = estado != null ? new JSONObject(estado.toString()) : ModusWidget.estado(getContext());
            String hoy = estado != null && !datos.optString("fecha").isEmpty() ? datos.optString("fecha") : WidgetAcciones.hoy();
            JSONObject tomas = null;
            if (estado != null) {
                JSONObject sup = datos.optJSONObject("sup");
                JSONObject todas = sup == null ? null : sup.optJSONObject("tomas");
                tomas = todas == null ? null : todas.optJSONObject(hoy);
            } else {
                tomas = WidgetAcciones.tomasDe(getContext(), hoy);
            }
            JSObject v = call.getObject("vivo", null);
            JSONObject vivoD = v != null ? new JSONObject(v.toString()) : estado != null ? null : ModusWidget.descansoVivo(getContext());
            if (vivoD != null && vivoD.has("faltan")) vivoD.put("fin", System.currentTimeMillis() + vivoD.optLong("faltan") * 1000L);
            Bitmap bmp = WidgetDibujo.plano(getContext(), tipo, Math.min(w, 1400), Math.min(h, 1000), datos, hoy, tomas, vivoD, call.getInt("indice", 0), true).bmp;
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
