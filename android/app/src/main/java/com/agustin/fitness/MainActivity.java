package com.agustin.fitness;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

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
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        abrirLinkDeLaApp(intent);
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