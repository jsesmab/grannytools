import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

const deviceAuth = { deviceId: z.string().min(8).max(80), secret: z.string().min(16).max(120) };

/** Verifica (o registra) el teléfono del mayor y devuelve su elder_id. */
async function deviceElder(deviceId: string, secret: string, name = "") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const hash = await sha256(secret);
  const { data: dev } = await supabaseAdmin.from("elder_devices").select("elder_id, secret_hash").eq("device_id", deviceId).maybeSingle();
  if (dev) {
    if (dev.secret_hash !== hash) throw new Error("Dispositivo no autorizado");
    return { db: supabaseAdmin, elderId: dev.elder_id };
  }
  const { data: elder, error } = await supabaseAdmin.from("elders").insert({ name }).select("id").single();
  if (error) throw error;
  const { error: dErr } = await supabaseAdmin.from("elder_devices").insert({ device_id: deviceId, elder_id: elder.id, secret_hash: hash });
  if (dErr) {
    // Otra sincronización simultánea registró el teléfono: descartamos el duplicado.
    await supabaseAdmin.from("elders").delete().eq("id", elder.id);
    return deviceElder(deviceId, secret, name);
  }
  return { db: supabaseAdmin, elderId: elder.id };
}

async function membersOf(db: any, elderId: string) {
  const { data: m } = await db.from("elder_members").select("id, user_id, role, created_at").eq("elder_id", elderId).order("created_at");
  const ids = (m ?? []).map((x: any) => x.user_id);
  const { data: p } = ids.length ? await db.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
  return (m ?? []).map((x: any) => ({
    id: x.id, role: x.role as "admin" | "consulta", at: x.created_at,
    name: (p ?? []).find((q: any) => q.id === x.user_id)?.display_name || "Familiar",
  }));
}

/** Sincronización desde el teléfono del mayor (sin cuenta; se autentica con su secreto de dispositivo). */
export const deviceSync = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    ...deviceAuth,
    name: z.string().max(80).default(""),
    careMode: z.enum(["autonomo", "protegido"]),
    careModeAt: z.number(),
    snapshot: z.record(z.string(), z.unknown()),
    invite: z.object({ code: z.string().regex(/^GT-[A-Z0-9]{6}$/), expires: z.number() }).nullable(),
  }).parse(d))
  .handler(async ({ data }) => {
    if (JSON.stringify(data.snapshot).length > 400_000) throw new Error("Datos demasiado grandes");
    const { db, elderId } = await deviceElder(data.deviceId, data.secret, data.name);
    const { data: elder } = await db.from("elders").select("care_mode, care_mode_at").eq("id", elderId).single();
    let careMode = elder!.care_mode as "autonomo" | "protegido";
    let careModeAt = new Date(elder!.care_mode_at).getTime();
    const patch: { name: string; snapshot: any; last_sync: string; care_mode?: string; care_mode_at?: string } = { name: data.name, snapshot: data.snapshot, last_sync: new Date().toISOString() };
    if (data.careModeAt > careModeAt) {
      careMode = data.careMode; careModeAt = data.careModeAt;
      patch.care_mode = careMode; patch.care_mode_at = new Date(careModeAt).toISOString();
    }
    await db.from("elders").update(patch).eq("id", elderId);
    if (data.invite && data.invite.expires > Date.now()) {
      const { data: ex } = await db.from("elder_invites").select("elder_id").eq("code", data.invite.code).maybeSingle();
      if (!ex) await db.from("elder_invites").insert({ code: data.invite.code, elder_id: elderId, expires_at: new Date(data.invite.expires).toISOString() });
    }
    // Cambios que la familia ha preparado: se entregan una vez y se marcan como aplicados.
    const { data: changes } = await (db as any).from("elder_changes").select("id, kind, op, item_key, item")
      .eq("elder_id", elderId).is("applied_at", null).order("created_at");
    if (changes?.length) await (db as any).from("elder_changes").update({ applied_at: new Date().toISOString() }).in("id", changes.map((c: any) => c.id));
    return { careMode, careModeAt, members: await membersOf(db, elderId), changes: (changes ?? []) as { kind: "med" | "cita" | "task"; op: "upsert" | "delete"; item_key: string; item: Record<string, any> | null }[] };
  });

/** El mayor gestiona desde su teléfono los familiares vinculados. */
export const deviceMemberAction = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ...deviceAuth, memberId: z.string().uuid(), action: z.enum(["admin", "consulta", "remove"]) }).parse(d))
  .handler(async ({ data }) => {
    const { db, elderId } = await deviceElder(data.deviceId, data.secret);
    const q = db.from("elder_members");
    if (data.action === "remove") await q.delete().eq("id", data.memberId).eq("elder_id", elderId);
    else await q.update({ role: data.action }).eq("id", data.memberId).eq("elder_id", elderId);
    return { members: await membersOf(db, elderId) };
  });

/** Un familiar canjea el código del teléfono del mayor. El primero será Administrador. */
export const redeemInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().trim().toUpperCase().regex(/^GT-[A-Z0-9]{6}$/, "Código no válido") }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await db.from("elder_invites").select("*").eq("code", data.code).maybeSingle();
    if (!inv || inv.used_at || new Date(inv.expires_at).getTime() < Date.now())
      return { ok: false as const, error: "El código no existe, ya se usó o ha caducado. Pide uno nuevo en el teléfono." };
    const { count } = await db.from("elder_members").select("id", { count: "exact", head: true }).eq("elder_id", inv.elder_id);
    const { error } = await db.from("elder_members").upsert(
      { elder_id: inv.elder_id, user_id: context.userId, role: count ? "consulta" : "admin" },
      { onConflict: "elder_id,user_id", ignoreDuplicates: true });
    if (error) throw error;
    await db.from("elder_invites").update({ used_at: new Date().toISOString() }).eq("code", data.code);
    return { ok: true as const, elderId: inv.elder_id };
  });

async function requireAdmin(context: { supabase: any; userId: string }, elderId: string) {
  const { data } = await context.supabase.from("elder_members").select("role").eq("elder_id", elderId).eq("user_id", context.userId).maybeSingle();
  if (data?.role !== "admin") throw new Error("Solo un Administrador puede hacer esto");
}

export const setElderCareMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ elderId: z.string().uuid(), mode: z.enum(["autonomo", "protegido"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context, data.elderId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    await db.from("elders").update({ care_mode: data.mode, care_mode_at: new Date().toISOString() }).eq("id", data.elderId);
    return { ok: true };
  });

export const familyMemberAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ elderId: z.string().uuid(), memberId: z.string().uuid(), action: z.enum(["admin", "consulta", "remove"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context, data.elderId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const q = db.from("elder_members");
    if (data.action === "remove") await q.delete().eq("id", data.memberId).eq("elder_id", data.elderId);
    else await q.update({ role: data.action }).eq("id", data.memberId).eq("elder_id", data.elderId);
    return { ok: true };
  });

/** Un Administrador crea, modifica o borra una cita, medicina o tarea. Llega al teléfono en su próxima sincronización. */
export const familyChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    elderId: z.string().uuid(),
    kind: z.enum(["med", "cita", "task"]),
    op: z.enum(["upsert", "delete"]),
    key: z.string().min(1).max(120),
    item: z.record(z.string(), z.any()).nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context, data.elderId);
    if (JSON.stringify(data.item ?? {}).length > 5000) throw new Error("Datos demasiado grandes");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { error } = await (db as any).from("elder_changes").insert({
      elder_id: data.elderId, created_by: context.userId, kind: data.kind, op: data.op, item_key: data.key, item: data.item,
    });
    if (error) throw error;
    return { ok: true };
  });
