/**
 * Vinculación con la futura app Family (todo local, sin servidor todavía).
 * - Cada teléfono tiene un deviceId único.
 * - El QR es una invitación temporal (caduca a los 10 min) con un secreto aleatorio:
 *   Family deberá validarla en el servidor; una invitación usada o caducada no sirve.
 * - Varios familiares pueden vincularse, cada uno con rol "admin" o "consulta".
 *   "consulta" solo ve datos; no modifica ni recibe avisos.
 * Family llamará a addFamilyMember(nombre, rol) al completar la vinculación.
 */
const DEVICE_KEY = "grannytools.deviceId";
const INVITE_KEY = "grannytools.link.invite";
const MEMBERS_KEY = "grannytools.link.members";
export const LINK_EVT = "grannytools:link";
export const INVITE_TTL_MS = 10 * 60 * 1000;

export type FamilyRole = "admin" | "consulta";
export type FamilyMember = { id: string; name: string; role: FamilyRole; at: string };
export type Invite = { code: string; secret: string; expires: number };

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rand = (n: number) => {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => ALPHA[b % ALPHA.length]).join("");
};
const emit = () => window.dispatchEvent(new Event(LINK_EVT));

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, id); }
  return id;
}

export function getInvite(renew = false): Invite {
  let inv: Invite | null = null;
  try { inv = JSON.parse(localStorage.getItem(INVITE_KEY) ?? "null"); } catch { /* ignore */ }
  if (renew || !inv || inv.expires < Date.now()) {
    inv = { code: `GT-${rand(6)}`, secret: rand(24), expires: Date.now() + INVITE_TTL_MS };
    localStorage.setItem(INVITE_KEY, JSON.stringify(inv));
  }
  return inv;
}

/** Invitación vigente sin crear una nueva (para la sincronización). */
export function peekInvite(): Invite | null {
  try {
    const inv = JSON.parse(localStorage.getItem(INVITE_KEY) ?? "null") as Invite | null;
    return inv && inv.expires > Date.now() ? inv : null;
  } catch { return null; }
}

/** Lista de familiares que devuelve el servidor (fuente de verdad cuando hay conexión). */
export function saveMembersFromServer(m: FamilyMember[]) {
  const prev = localStorage.getItem(MEMBERS_KEY);
  const next = JSON.stringify(m);
  if (prev !== next) { localStorage.setItem(MEMBERS_KEY, next); emit(); }
}

export function linkPayload(inv = getInvite()): string {
  return JSON.stringify({ app: "grannytools", v: 2, device: getDeviceId(), code: inv.code, secret: inv.secret, exp: inv.expires });
}

export function getFamilyMembers(): FamilyMember[] {
  try { return JSON.parse(localStorage.getItem(MEMBERS_KEY) ?? "[]"); } catch { return []; }
}

const save = (m: FamilyMember[]) => { localStorage.setItem(MEMBERS_KEY, JSON.stringify(m)); emit(); };

/** Llamado por Family al validar la invitación. La invitación se consume. */
export function addFamilyMember(name: string, role: FamilyRole) {
  save([...getFamilyMembers(), { id: crypto.randomUUID(), name, role, at: new Date().toISOString() }]);
  localStorage.removeItem(INVITE_KEY);
}

export function setMemberRole(id: string, role: FamilyRole) {
  save(getFamilyMembers().map((m) => (m.id === id ? { ...m, role } : m)));
}

export function removeFamilyMember(id: string) {
  save(getFamilyMembers().filter((m) => m.id !== id));
}
