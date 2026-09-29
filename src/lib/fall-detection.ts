// Detector de caídas.
//
// Diseñado con dos canales para que el mismo algoritmo sirva hoy en el navegador
// y mañana en las tiendas (Android / iOS empaquetado con Capacitor):
//
//  - Canal web: DeviceMotionEvent (solo con la aplicación abierta o en primer plano).
//  - Canal nativo: al empaquetar, basta con llamar a `pushAcceleration()` desde el
//    plugin de movimiento (@capacitor/motion o un servicio en segundo plano de
//    Android). El algoritmo y el protocolo de socorro no cambian.

export const FALL_ENABLED_KEY = "grannytools.fall.enabled";
export const EMERGENCY_KEY = "grannytools.emergency";
export const FALL_COUNTDOWN_SEC = 30;

const G = 9.81;
const FREEFALL_G = 0.5; // por debajo de 0,5 g -> caída libre
const IMPACT_G = 3.0; // por encima de 3 g -> impacto
const FREEFALL_MIN_MS = 120;
const FREEFALL_MAX_MS = 900;
const IMPACT_WINDOW_MS = 900;
const STILL_MS = 1500;
const STILL_TOLERANCE_G = 0.35;

type Phase = "idle" | "freefall" | "impact";

export function isFallEnabled() {
  try {
    return localStorage.getItem(FALL_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setFallEnabled(on: boolean) {
  try {
    localStorage.setItem(FALL_ENABLED_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function getEmergencyPhone() {
  try {
    return localStorage.getItem(EMERGENCY_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setEmergencyPhone(phone: string) {
  try {
    localStorage.setItem(EMERGENCY_KEY, phone);
  } catch {
    /* ignore */
  }
}

/** ¿El móvil deja leer el sensor de movimiento? */
export function motionAvailable() {
  return typeof window !== "undefined" && "DeviceMotionEvent" in window;
}

type IosMotion = { requestPermission?: () => Promise<"granted" | "denied"> };

/** iPhone exige pedir permiso desde un toque del usuario. */
export async function requestMotionPermission(): Promise<boolean> {
  if (!motionAvailable()) return false;
  const dm = window.DeviceMotionEvent as unknown as IosMotion;
  if (typeof dm.requestPermission === "function") {
    try {
      return (await dm.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }
  return true;
}

export function createFallDetector(onFall: () => void) {
  let phase: Phase = "idle";
  let freefallStart = 0;
  let impactAt = 0;
  let stillSince = 0;
  let armed = true;

  const reset = () => {
    phase = "idle";
    freefallStart = 0;
    impactAt = 0;
    stillSince = 0;
  };

  /** Acepta la aceleración en m/s² (incluida la gravedad). */
  const pushAcceleration = (x: number, y: number, z: number, now = Date.now()) => {
    if (!armed) return;
    const g = Math.sqrt(x * x + y * y + z * z) / G;

    if (phase === "idle") {
      if (g < FREEFALL_G) {
        phase = "freefall";
        freefallStart = now;
      }
      return;
    }

    if (phase === "freefall") {
      if (g < FREEFALL_G) {
        if (now - freefallStart > FREEFALL_MAX_MS) reset();
        return;
      }
      const duration = now - freefallStart;
      if (duration >= FREEFALL_MIN_MS && g > IMPACT_G) {
        phase = "impact";
        impactAt = now;
        stillSince = 0;
        return;
      }
      if (duration < FREEFALL_MIN_MS && g > IMPACT_G) {
        reset();
        return;
      }
      if (now - freefallStart > FREEFALL_MAX_MS) reset();
      return;
    }

    // phase === "impact": esperamos inmovilidad
    if (now - impactAt > IMPACT_WINDOW_MS + STILL_MS + 2000) {
      reset();
      return;
    }
    const still = Math.abs(g - 1) < STILL_TOLERANCE_G;
    if (!still) {
      stillSince = 0;
      return;
    }
    if (!stillSince) stillSince = now;
    if (now - stillSince >= STILL_MS) {
      reset();
      armed = false;
      onFall();
      window.setTimeout(() => {
        armed = true;
      }, 10000);
    }
  };

  const onMotion = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null || a.z == null) return;
    pushAcceleration(a.x, a.y, a.z);
  };

  const start = () => window.addEventListener("devicemotion", onMotion);
  const stop = () => window.removeEventListener("devicemotion", onMotion);

  return { start, stop, pushAcceleration, reset };
}

/** Enlace de Google Maps con la posición actual (o null si no se consigue). */
export async function currentLocationLink(): Promise<string | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }),
    );
    const { latitude, longitude } = pos.coords;
    return `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  } catch {
    return null;
  }
}

/** Protocolo de socorro: mensaje con la ubicación y llamada al contacto. */
export async function sendEmergency(phone: string) {
  const tel = phone.replace(/[^\d+]/g, "");
  if (!tel) return;
  const link = await currentLocationLink();
  const text = link
    ? `¡EMERGENCIA! Posible caída y no respondo. Mi ubicación: ${link}`
    : "¡EMERGENCIA! Posible caída y no respondo. No se ha podido obtener la ubicación.";
  const { emergencySms, emergencyCall, isNativeApp } = await import("./native-emergency");
  try {
    await emergencySms(tel, text);
  } catch {
    /* ignore */
  }
  window.setTimeout(() => void emergencyCall(tel), isNativeApp() ? 1000 : 2500);
}
