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
