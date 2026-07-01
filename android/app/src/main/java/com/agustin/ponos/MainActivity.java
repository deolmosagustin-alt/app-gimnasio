package com.agustin.ponos;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Sacar la barra gris de scroll del WebView de Android —
        // el CSS (scrollbar-width: none) no la controla porque es
        // renderizada por el sistema, no por el navegador.
        WebView webView = getBridge().getWebView();
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
    }
}