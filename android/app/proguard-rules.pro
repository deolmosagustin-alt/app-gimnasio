# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Modus Fit (24/11/2026): los números de línea, para leer los cierres en Play
# Console (el nombre del archivo se reemplaza por "SourceFile").
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# El plugin de Firebase Authentication trae el manejo de Facebook, que la app
# no usa (sólo Google) y cuya librería no está: que R8 no lo pida.
-dontwarn com.facebook.**

# Capacitor lee por reflexión las anotaciones de cada plugin (el nombre y los
# permisos, @CapacitorPlugin y @Permission). Sin esto, la regla que trae
# Capacitor guarda las clases de los plugins pero no la anotación, y pedir un
# permiso cerraba la app (NullPointerException en Plugin.getPermissionStates,
# visto en el emulador el 24/11/2026). El núcleo y los plugins quedan enteros;
# lo demás (Firebase, AndroidX, lo propio que no es plugin) se ofusca igual.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-keep class com.getcapacitor.** { *; }
-keep @interface com.getcapacitor.annotation.** { *; }
-keep class com.capacitorjs.plugins.** { *; }
-keep class io.capawesome.capacitorjs.plugins.** { *; }
