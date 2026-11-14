package com.agustin.fitness;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {

    // Un toque en un widget que abre la app para hacer algo (ModusWidget.intento).
    static final String ACCION_WIDGET = "com.agustin.fitness.WIDGET";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(RestTimerPlugin.class);
        registerPlugin(TodayWidgetPlugin.class);
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        // Fondo oscuro desde el primer frame — elimina el flash blanco
        webView.setBackgroundColor(Color.parseColor("#0a0a0f"));
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);

        // El permiso de las notificaciones ya no se pide al abrir: lo pide la
        // web cuando hace falta (al iniciar una sesión o prender un
        // recordatorio, ver pedirPermisoDeAvisos en App.jsx), con el motivo a
        // la vista. Pedirlo acá salía antes de ver la app, sin explicar para qué.
        abrirLinkDeLaApp(getIntent());
        accionDeWidget(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        abrirLinkDeLaApp(intent);
        accionDeWidget(intent);
    }

    // "Empezar" en el widget del día, o un widget que lleva a una parte de la
    // app (modusfit://widget/iniciar?fecha=…&key=…, /rutina, /suplementos): se
    // le pasa a la web por el plugin de los widgets, que lo guarda hasta que
    // la web lo escuche (al abrir en frío todavía no cargó).
    private void accionDeWidget(Intent intent) {
        if (intent == null || !ACCION_WIDGET.equals(intent.getAction())) return;
        Uri uri = intent.getData();
        intent.setAction(null); // un giro de pantalla no lo repite
        if (uri == null || !"modusfit".equals(uri.getScheme()) || uri.getLastPathSegment() == null) return;
        try {
            PluginHandle h = getBridge().getPlugin("TodayWidget");
            if (h != null && h.getInstance() instanceof TodayWidgetPlugin) {
                ((TodayWidgetPlugin) h.getInstance()).accion(uri.getLastPathSegment(), uri.getQueryParameter("key"), uri.getQueryParameter("fecha"));
            }
        } catch (Exception e) { /* se abre la app y nada más */ }
    }

    // Los links de la app (el QR de un amigo, una rutina compartida): Android
    // abre la app (App Links, ver AndroidManifest) y Capacitor carga la página
    // de inicio igual; acá se le pasa el link entero a la web, que lo lee del
    // "#" (al arrancar, o con el evento hashchange si la app ya estaba abierta).
    private void abrirLinkDeLaApp(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri uri = intent.getData();
        if (uri == null || !"https".equals(uri.getScheme()) || !"app-gimnasio-two.vercel.app".equals(uri.getHost())) return;
        String fragmento = uri.getEncodedFragment();
        if (fragmento == null || fragmento.isEmpty()) return;
        WebView webView = getBridge().getWebView();
        webView.post(() -> webView.loadUrl(uri.toString()));
    }
}