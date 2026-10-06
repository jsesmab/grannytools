// Acceso con huella / Face ID para la app Family instalada desde las tiendas.
// Usa el plugin nativo BiometricAuth (@aparajita/capacitor-biometric-auth) a través
// de window.Capacitor, así la web sigue funcionando sin él. La huella nunca sale
// del teléfono: el sistema solo responde "correcto" o "incorrecto".
const KEY = "grannytools.family.biometric";
const UNLOCKED = "grannytools.family.unlocked";

type BioPlugin = {
  checkBiometry: () => Promise<{ isAvailable: boolean }>;
  authenticate: (o: Record<string, unknown>) => Promise<void>;
};

function plugin(): BioPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return (cap.Plugins?.BiometricAuth as BioPlugin) ?? null;
}

export async function biometricAvailable(): Promise<boolean> {
  const p = plugin();
  if (!p) return false;
  try { return (await p.checkBiometry()).isAvailable; } catch { return false; }
}

export function biometricEnabled(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export async function verifyBiometric(reason = "Entra en Grannytools Family"): Promise<boolean> {
  const p = plugin();
  if (!p) return false;
  try {
    await p.authenticate({ reason, cancelTitle: "Cancelar", allowDeviceCredential: true, androidTitle: "Grannytools Family", androidSubtitle: reason });
    try { sessionStorage.setItem(UNLOCKED, "1"); } catch { /* ignore */ }
    return true;
  } catch { return false; }
}

export async function setBiometricEnabled(on: boolean): Promise<boolean> {
  if (on && !(await verifyBiometric("Activa el acceso con huella"))) return false;
  try { on ? localStorage.setItem(KEY, "1") : localStorage.removeItem(KEY); } catch { /* ignore */ }
  return true;
}

/** ¿Hay que pedir la huella antes de enseñar los datos? */
export function needsUnlock(): boolean {
  if (!biometricEnabled() || !plugin()) return false;
  try { return sessionStorage.getItem(UNLOCKED) !== "1"; } catch { return true; }
}

export function clearUnlock() {
  try { sessionStorage.removeItem(UNLOCKED); } catch { /* ignore */ }
}
