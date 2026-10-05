/**
 * Vinculación con la futura app Family. Todo local: genera un identificador de
 * dispositivo y un código corto. La app Family, al escanear el QR, deberá
 * registrar el vínculo y llamar a markLinked(nombre). Sin servidor todavía.
 */
const DEVICE_KEY = "grannytools.deviceId";
const CODE_KEY = "grannytools.link.code";
const LINK_KEY = "grannytools.link.family";
export const LINK_EVT = "grannytools:link";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rand = (n: number) => {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => ALPHA[b % ALPHA.length]).join("");
};

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, id); }
  return id;
}

export function getLinkCode(renew = false): string {
  let c = renew ? null : localStorage.getItem(CODE_KEY);
  if (!c) { c = `GT-${rand(6)}`; localStorage.setItem(CODE_KEY, c); }
  return c;
}

export function linkPayload(): string {
  return JSON.stringify({ app: "grannytools", v: 1, device: getDeviceId(), code: getLinkCode() });
}

export function getLinkedFamily(): { name: string; at: string } | null {
  try { return JSON.parse(localStorage.getItem(LINK_KEY) ?? "null"); } catch { return null; }
}

export function markLinked(name: string) {
  localStorage.setItem(LINK_KEY, JSON.stringify({ name, at: new Date().toISOString() }));
  window.dispatchEvent(new Event(LINK_EVT));
}

export function unlink() {
  localStorage.removeItem(LINK_KEY);
  getLinkCode(true);
  window.dispatchEvent(new Event(LINK_EVT));
}
