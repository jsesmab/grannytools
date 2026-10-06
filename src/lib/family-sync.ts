import { useEffect } from "react";
import { deviceSync, deviceMemberAction } from "@/lib/family.functions";
import { getCareMode, getCareModeAt, setCareMode } from "@/lib/care-lock";
import { getDeviceId, peekInvite, saveMembersFromServer, type FamilyMember } from "@/lib/family-link";

/** Sincroniza el teléfono del mayor con la nube cuando hay conexión. La app sigue funcionando sin ella. */
const SECRET_KEY = "grannytools.deviceSecret";
const SYNC_EVT = "grannytools:syncnow";
export const LAST_SYNC_KEY = "grannytools.lastSync";

function deviceSecret() {
  let s = localStorage.getItem(SECRET_KEY);
  if (!s) {
    const a = new Uint8Array(32); crypto.getRandomValues(a);
    s = Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(SECRET_KEY, s);
  }
  return s;
}

const json = (k: string, d: unknown) => { try { return JSON.parse(localStorage.getItem(k) ?? "null") ?? d; } catch { return d; } };

function snapshot() {
  const contacts = (json("grannytools.contacts", []) as { name?: string; phone?: string }[]).map((c) => ({ name: c.name ?? "", phone: c.phone ?? "" }));
  return {
    meds: json("grannytools.meds", []),
    tomadas: json("grannytools.meds.tomadas", {}),
    people: json("grannytools.citas.people", []),
    entries: json("grannytools.citas.entries", []),
    tasks: json("grannytools.tareas", []),
    taskStatus: json("grannytools.tareas.estado", {}),
    contacts,
    emergency: localStorage.getItem("grannytools.emergency") ?? "",
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

type Change = { kind: "med" | "cita" | "task"; op: "upsert" | "delete"; item_key: string; item: Record<string, unknown> | null };
const STORE = { med: ["grannytools.meds", "name"], cita: ["grannytools.citas.entries", "id"], task: ["grannytools.tareas", "id"] } as const;

/** Aplica en el teléfono los cambios hechos desde Family (el teléfono sigue mandando). */
export function applyChanges(changes: Change[]) {
  for (const c of changes) {
    const [key, idField] = STORE[c.kind];
    const list = (json(key, []) as Record<string, unknown>[]).filter((x) => String(x[idField]) !== c.item_key);
    if (c.op === "upsert" && c.item) list.push(c.item);
    localStorage.setItem(key, JSON.stringify(list));
  }
  window.dispatchEvent(new Event("grannytools-tasks"));
  window.dispatchEvent(new Event("storage"));
}

let running = false;
export async function syncNow() {
  if (running || typeof navigator === "undefined" || !navigator.onLine) return;
  running = true;
  try {
    const inv = peekInvite();
    const r = await deviceSync({ data: {
      deviceId: getDeviceId(), secret: deviceSecret(),
      name: localStorage.getItem("grannytools.username") ?? "",
      careMode: getCareMode(), careModeAt: getCareModeAt(),
      snapshot: snapshot(),
      invite: inv ? { code: inv.code, expires: inv.expires } : null,
    } });
    if (r.careModeAt > getCareModeAt() || r.careMode !== getCareMode()) setCareMode(r.careMode, "family", r.careModeAt);
    saveMembersFromServer(r.members as FamilyMember[]);
    if (r.changes?.length) { applyChanges(r.changes as Change[]); running = false; return syncNow(); }
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  } catch (e) { console.warn("Sincronización Family pendiente", e); }
  finally { running = false; }
}

export const requestSync = () => window.dispatchEvent(new Event(SYNC_EVT));

export async function memberAction(memberId: string, action: "admin" | "consulta" | "remove") {
  const r = await deviceMemberAction({ data: { deviceId: getDeviceId(), secret: deviceSecret(), memberId, action } });
  saveMembersFromServer(r.members as FamilyMember[]);
}

/** Montado en el root solo en la app del mayor: sincroniza al abrir, cada minuto y al recuperar conexión. */
export function FamilySync() {
  useEffect(() => {
    const go = () => { void syncNow(); };
    go();
    const t = setInterval(go, 60_000);
    window.addEventListener("online", go);
    window.addEventListener(SYNC_EVT, go);
    return () => { clearInterval(t); window.removeEventListener("online", go); window.removeEventListener(SYNC_EVT, go); };
  }, []);
  return null;
}
