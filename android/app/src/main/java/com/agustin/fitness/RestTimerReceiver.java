package com.agustin.fitness;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// Los botones de la notificación del descanso (Pausar, Seguir, +15 s,
// Reiniciar, Cerrar) y la alarma del final llegan acá, aunque la app esté
// cerrada. Lo que hacen está en Descanso.aplicar.
public class RestTimerReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        Descanso.aplicar(context.getApplicationContext(), intent.getAction());
    }
}
