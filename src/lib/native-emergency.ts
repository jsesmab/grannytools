// Puente de socorro: web hoy, tienda (Capacitor) mañana.
//
// - En la web: abre SMS con la ubicación y luego el marcador (el móvil pide confirmar).
// - En la app de tienda (Android): usa el plugin nativo "DirectEmergency"
//   (ver docs/CAPACITOR.md) que envía el SMS y llama sin pasos intermedios.

type DirectEmergencyPlugin = {
  sendSms(o: { phone: string; text: string }): Promise<void>;
  call(o: { phone: string }): Promise<void>;
};

type CapWindow = {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    Plugins?: { DirectEmergency?: DirectEmergencyPlugin };
  };
};

function cap() {
  return typeof window === "undefined" ? undefined : (window as unknown as CapWindow).Capacitor;
}

export function isNativeApp() {
  return !!cap()?.isNativePlatform?.();
}

function nativePlugin(): DirectEmergencyPlugin | null {
  const c = cap();
  if (!c?.isNativePlatform?.()) return null;
  return c.Plugins?.DirectEmergency ?? null;
}

export async function emergencySms(phone: string, text: string) {
  const p = nativePlugin();
  if (p) {
    try {
      await p.sendSms({ phone, text });
      return;
    } catch (e) {
      console.error("SMS nativo falló, uso la web", e);
    }
  }
  window.location.href = `sms:${phone}?&body=${encodeURIComponent(text)}`;
}

export async function emergencyCall(phone: string) {
  const p = nativePlugin();
  if (p) {
    try {
      await p.call({ phone });
      return;
    } catch (e) {
      console.error("Llamada nativa falló, uso la web", e);
    }
  }
  window.location.href = `tel:${phone}`;
}
