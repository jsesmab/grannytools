# Empaquetar Grannytools para tiendas (Capacitor)

## 1. Preparar
```bash
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios @capacitor/local-notifications @capacitor/motion
npm run build
npx cap add android
npx cap sync
npx cap open android
```

## 2. Permisos Android (android/app/src/main/AndroidManifest.xml)
```xml
<uses-permission android:name="android.permission.CALL_PHONE" />
<uses-permission android:name="android.permission.SEND_SMS" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
```
Google Play exige justificar SEND_SMS / CALL_PHONE (formulario "Permissions Declaration": uso de emergencia/seguridad).

## 1 bis. Dos productos independientes y widget gigante

Capacitor está instalado. Compilar la web en el ordenador de desarrollo y preparar cada producto:
```bash
npm run build
npm run cap:elder -- android
npm run cap:family -- android
# En Mac, con Xcode:
npm run cap:elder -- ios
npm run cap:family -- ios
```
Los scripts **no compilan ni firman** AAB/IPA. Abren dos proyectos independientes:

| Producto | Identificador | Proyecto Android | Proyecto iOS |
|---|---|---|---|
| Grannytools | `com.grannytools.app` | `native/elder/android` | `native/elder/ios` |
| Grannytools Family | `com.grannytools.family` | `native/family/android` | `native/family/ios` |

La configuración predeterminada es Grannytools. Family carga `https://grannytools.lovable.app/family` (requiere web publicada actualizada y red); revisar este modelo de WebView antes de presentar a tiendas. No sustituye pruebas de autenticación/OAuth ni garantiza aprobación de Apple. El empaquetado local del mayor requiere comprobar navegación offline y recursos de todas las pantallas: una salida SSR no implica que toda ruta funcione como app local.

### Android: widget listo para integrar
`cap:elder` copia las fuentes de `native/elder/widget/android`, el icono `public/icon-512.png`, añade el receiver al manifest y registra `HomeWidgetPlugin` en MainActivity. Se puede ejecutar varias veces sin duplicar registros. No copia nada de esto a Family.

Propuesta 4×4 con un único icono que abre Grannytools, redimensionable. Android 12+ usa celdas objetivo; en versiones anteriores se usan dimensiones mínimas. Desde Android 8, si el launcher lo admite, el botón del alta solicita anclarlo; el usuario confirma. No hay permiso especial ni instalación silenciosa. Si no hay soporte, se indica cómo añadirlo manualmente.

Comprobar en dispositivo: aceptar/cancelar la solicitud, launcher sin soporte, añadir desde Widgets, tocar el icono con app cerrada, cambiar tamaño, reiniciar teléfono y confirmar que Family no contiene el widget.

### iPhone: extensión WidgetKit pendiente de configurar en Xcode
1. En el proyecto **elder**, añadir target **Widget Extension**, identificador `com.grannytools.app.widget`, deployment target iOS 17 o posterior; no Live Activity.
2. Reemplazar el archivo Swift de ejemplo por `native/elder/widget/ios/GrannytoolsWidget.swift`. No conservar dos declaraciones `@main`.
3. Añadir al Assets de la extensión un Image Set `GrannytoolsWidgetIcon` usando `public/icon-512.png` (para mayor resolución se puede preparar una exportación del mismo icono).
4. En la app principal, registrar en URL Types el esquema `grannytools`; al tocar el widget el sistema abre la app. Este acceso solo abre la app, no procesa instrucciones ni datos externos.
5. Verificar que la extensión está embebida en la app, elegir equipo/firma, probar el tamaño grande y `grannytools://open` en dispositivo.

Apple no permite anclar widgets por código ni impone una cuadrícula exacta 4×4. Durante el alta se muestra la guía manual. La extensión no se añade automáticamente con `cap sync`.

### Venta y controles previos a publicación
- Crear dos fichas de apps y configurar sus precios de forma independiente. En Apple se puede solicitar un App Bundle de apps de pago conforme a los requisitos vigentes; Google Play no tiene compra conjunta equivalente automática. No hay cobros integrados ni precios inventados.
- Pendiente: cuentas y firmas del titular, icono diferenciador de Family, capturas, política de privacidad, declaraciones de permisos/datos, clasificación de edad y pruebas reales.
- Instalar e integrar los plugins específicos por producto: DirectEmergency solo elder; BiometricAuth solo Family. Instalar plugins en una dependencia compartida puede copiarlos a ambas apps: revisar cada proyecto y excluir plugins/permisos innecesarios.
- Comprobar notificaciones con la app cerrada, detector en segundo plano, sesión segura de Family y biometría en dispositivo; lo documentado aquí no sustituye esas integraciones.
- La admisión de SMS/llamadas y las afirmaciones médicas requieren revisión de las políticas; no prometer aceptación ni funcionamiento de emergencias sin validación real.

## 3. Plugin nativo DirectEmergency (android/app/src/main/java/com/grannytools/app/DirectEmergencyPlugin.java)
```java
package com.grannytools.app;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.telephony.SmsManager;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;

@CapacitorPlugin(name = "DirectEmergency", permissions = {
  @Permission(strings = { Manifest.permission.SEND_SMS }, alias = "sms"),
  @Permission(strings = { Manifest.permission.CALL_PHONE }, alias = "call")
})
public class DirectEmergencyPlugin extends Plugin {
  @PluginMethod
  public void sendSms(PluginCall call) {
    if (getPermissionState("sms") != PermissionState.GRANTED) { requestPermissionForAlias("sms", call, "smsCb"); return; }
    SmsManager sm = SmsManager.getDefault();
    sm.sendMultipartTextMessage(call.getString("phone"), null, sm.divideMessage(call.getString("text")), null, null);
    call.resolve();
  }
  @PermissionCallback private void smsCb(PluginCall call) { sendSms(call); }

  @PluginMethod
  public void call(PluginCall call) {
    if (getPermissionState("call") != PermissionState.GRANTED) { requestPermissionForAlias("call", call, "callCb"); return; }
    Intent i = new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + call.getString("phone")));
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    getContext().startActivity(i);
    call.resolve();
  }
  @PermissionCallback private void callCb(PluginCall call) { call(call); }
}
```
Registrarlo en `MainActivity.java`: `registerPlugin(DirectEmergencyPlugin.class);` antes de `super.onCreate(...)`.

## 4. iPhone
Apple no permite llamar ni enviar SMS sin confirmación: se mantiene el comportamiento web (un toque).

## 5. Detector de caídas con pantalla apagada
Conectar `@capacitor/motion` (o un servicio en primer plano de Android) a `pushAcceleration()` de `src/lib/fall-detection.ts`.

## 6. Huella / Face ID (app Family)
```bash
npm i @aparajita/capacitor-biometric-auth && npx cap sync
```
- Android (AndroidManifest.xml): `<uses-permission android:name="android.permission.USE_BIOMETRIC" />`
- iOS (Info.plist): `NSFaceIDUsageDescription` = «Grannytools Family usa Face ID para darte acceso rápido y seguro a los datos de tu familiar.»
- Código: `src/lib/biometrics.ts` (lo detecta en `window.Capacitor.Plugins.BiometricAuth`; sin plugin, la opción no aparece).
- Privacidad: la biometría la valida el sistema; no se guarda ni se envía. Añadir cláusula informativa en la política de privacidad.
