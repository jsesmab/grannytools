import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { familyChange } from "@/lib/family.functions";
import { supabase } from "@/integrations/supabase/client";
import type { Snapshot } from "@/lib/family-data";

type Kind = "med" | "cita" | "task" | "turno";
type Draft = Record<string, string | number[] | undefined>;
const DAYS = [["L", 1], ["M", 2], ["X", 3], ["J", 4], ["V", 5], ["S", 6], ["D", 0]] as const;
const uid = () => Math.random().toString(36).slice(2, 10);
const input = "w-full rounded-xl border-2 border-input bg-background px-3 py-2";
const card = "rounded-3xl border-2 border-border bg-card p-5 space-y-3";

const pendingQuery = (elderId: string) => ({
  queryKey: ["family", "pending", elderId],
  queryFn: async () => {
    const { data } = await (supabase as any).from("elder_changes").select("id, kind, op, item_key, item")
      .eq("elder_id", elderId).is("applied_at", null).order("created_at");
    return (data ?? []) as { id: string; kind: Kind; op: string; item_key: string; item: Record<string, unknown> | null }[];
  },
  refetchInterval: 30_000,
});

const LABEL: Record<Kind, string> = { med: "Medicinas", cita: "Citas", task: "Tareas", turno: "Turnos" };
const ORDER: Kind[] = ["cita", "task", "med", "turno"];

export function FamilyEditor({ elderId, snapshot, admin }: { elderId: string; snapshot: Snapshot; admin: boolean }) {
  const qc = useQueryClient();
  const send = useServerFn(familyChange);
  const { data: pending = [] } = useQuery(pendingQuery(elderId));
  const [edit, setEdit] = useState<{ kind: Kind; key?: string; d: Draft } | null>(null);
  const [err, setErr] = useState("");
  const [openK, setOpenK] = useState<Kind[]>([]);
  const people = snapshot.people ?? [];

  const today = new Date().toISOString().slice(0, 10);
  // Lo caducado (tratamientos terminados, citas/tareas de un día ya pasadas) vive en Histórico.
  const live = <T extends { until?: string; date?: string }>(x: T) => !(x.until && x.until < today) && !(x.date && x.date < today);
  const lists: Record<Kind, { key: string; label: string; raw: Record<string, unknown> }[]> = {
    med: (snapshot.meds ?? []).filter(live).map((m) => ({ key: m.name, label: `${m.name} · ${m.times.join(", ")}${m.until ? ` · hasta ${m.until}` : ""}`, raw: m })),
    cita: (snapshot.entries ?? []).filter((e) => e.kind === "fija" && live(e)).map((e) => ({ key: e.id, label: `${e.date ?? "Semanal"} · ${e.start}–${e.end} · ${e.title}${e.who ? ` · ${e.who}` : ""}`, raw: e })),
    turno: (snapshot.entries ?? []).filter((e) => e.kind === "periodica").map((e) => ({ key: e.id, label: `${(e.days ?? []).map((n) => DAYS.find((d) => d[1] === n)?.[0]).join("")} · ${e.start}–${e.end} · ${people.find((p) => p.id === e.personId)?.name ?? e.who ?? e.title}`, raw: e })),
    task: (snapshot.tasks ?? []).filter(live).map((t) => ({ key: t.id, label: `${t.time} · ${t.title} ${t.date ? `(${t.date})` : "(periódica)"}`, raw: t })),
  };

  const open = (kind: Kind, raw?: Record<string, unknown>, key?: string) => {
    const r = (raw ?? {}) as any;
    const d: Draft = kind === "med"
      ? { name: r.name ?? "", times: (r.times ?? ["09:00"]).join(", "), from: r.from, until: r.until }
      : kind === "turno"
        ? { title: r.title ?? "", personId: r.personId ?? people[0]?.id ?? "", who: r.who ?? "", days: r.days ?? [1, 2, 3, 4, 5], start: r.start ?? "09:00", end: r.end ?? "14:00" }
      : kind === "cita"
        ? { title: r.title ?? "", who: r.who ?? "", companion: r.companion ?? "", date: r.date ?? (r.days ? undefined : new Date().toISOString().slice(0, 10)), days: r.days, start: r.start ?? "10:00", end: r.end ?? "11:00" }
        : { title: r.title ?? "", time: r.time ?? "10:00", date: r.date ?? (r.days ? undefined : new Date().toISOString().slice(0, 10)), days: r.days };
    setErr(""); setEdit({ kind, key, d: { ...d, _raw: undefined } });
  };

  const submit = async (op: "upsert" | "delete") => {
    if (!edit) return;
    const { kind, d } = edit;
    const orig = (lists[kind].find((x) => x.key === edit.key)?.raw ?? {}) as Record<string, unknown>;
    let item: Record<string, unknown> | null = null;
    const repeat = Array.isArray(d.days);
    if (op === "upsert") {
      if (kind === "med") {
        const times = String(d.times).split(/[,\s]+/).filter((t) => /^\d{1,2}:\d{2}$/.test(t)).map((t) => t.padStart(5, "0"));
        if (!String(d.name).trim() || !times.length) return setErr("Pon nombre y al menos una hora (ej. 09:00, 21:00).");
        item = { ...orig, name: String(d.name).trim(), times, from: d.from || undefined, until: d.until || undefined };
      } else if (kind === "turno") {
        if (!d.personId && !String(d.who).trim()) return setErr("Elige quién hace el turno.");
        if (!(d.days as number[]).length) return setErr("Elige algún día.");
        item = { remindMin: 0, ...orig, id: edit.key ?? uid(), kind: "periodica", title: String(d.title).trim() || undefined, personId: d.personId || undefined, who: String(d.who ?? "").trim() || undefined, days: d.days, start: d.start, end: d.end };
      } else {
        if (!String(d.title).trim()) return setErr("Pon un título.");
        if (repeat && !(d.days as number[]).length) return setErr("Elige algún día.");
        const when = repeat ? { days: d.days, date: undefined } : { date: d.date, days: undefined };
        item = kind === "cita"
          ? { remindMin: 60, ...orig, id: edit.key ?? uid(), kind: "fija", title: String(d.title).trim(), who: String(d.who).trim() || undefined, companion: String(d.companion).trim() || undefined, start: d.start, end: d.end, ...when, personId: undefined }
          : { ...orig, id: edit.key ?? uid(), title: String(d.title).trim(), time: d.time, ...when };
      }
    } else if (!confirm("¿Borrar? Se quitará del teléfono al conectarse.")) return;
    const key = edit.key ?? String(item?.[kind === "med" ? "name" : "id"]);
    try {
      await send({ data: { elderId, kind: kind === "turno" ? "cita" : kind, op, key, item: item ? (JSON.parse(JSON.stringify(item)) as Record<string, any>) : null } });
      setEdit(null);
      qc.invalidateQueries({ queryKey: ["family", "pending", elderId] });
    } catch (e) { setErr((e as Error).message); }
  };

  const set = (k: string, v: string | number[] | undefined) => setEdit((x) => x && { ...x, d: { ...x.d, [k]: v } });

  return (
    <>
      {pending.length > 0 && (
        <section className="rounded-3xl border-2 border-warning bg-warning/15 p-4">
          <p className="font-bold">⏳ {pending.length} cambio(s) esperando a que el teléfono se conecte:</p>
          <ul className="ml-5 list-disc text-sm">
            {pending.map((p) => <li key={p.id}>{p.op === "delete" ? "Borrar" : "Guardar"} {LABEL[p.kind === "cita" && (p.item as any)?.kind === "periodica" ? "turno" : p.kind].toLowerCase().slice(0, -1)}: {String(p.item?.title ?? p.item?.name ?? p.item_key)}</li>)}
          </ul>
        </section>
      )}
      <div className="space-y-3">
        {ORDER.map((kind) => { const on = openK.includes(kind); return (
          <section key={kind} className={card}>
            <div className="flex items-center justify-between gap-2">
              <button data-flat-button aria-expanded={on} onClick={() => setOpenK((o) => on ? o.filter((x) => x !== kind) : [...o, kind])}
                className="flex flex-1 items-center gap-2 text-left text-xl font-extrabold">
                <span>{on ? "▾" : "▸"}</span>{LABEL[kind]} <span className="text-sm font-semibold text-muted-foreground">({lists[kind].length})</span>
              </button>
              {admin && <button onClick={() => { open(kind); setOpenK((o) => o.includes(kind) ? o : [...o, kind]); }} className="rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">+ Añadir</button>}
            </div>
            {on && <>{lists[kind].length === 0 && <p className="text-muted-foreground">Nada todavía.</p>}
            {lists[kind].map((x) => admin ? (
              <button key={x.key} data-flat-button onClick={() => open(kind, x.raw, x.key)} className="block w-full rounded-xl px-2 py-1 text-left hover:bg-muted">{x.label} ✏️</button>
            ) : <p key={x.key}>{x.label}</p>)}</>}
          </section>
        ); })}
      </div>

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-label="Editar">
          <div className="w-full max-w-md space-y-3 rounded-3xl bg-card p-5 shadow-xl">
            <h2 className="text-xl font-extrabold">{edit.key ? "Modificar" : "Añadir"} {LABEL[edit.kind].toLowerCase().slice(0, -1)}</h2>
            {edit.kind === "turno" ? (<>
              {people.length > 0 ? (
                <select className={input} value={String(edit.d.personId ?? "")} onChange={(e) => set("personId", e.target.value)}>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : <input className={input} placeholder="Quién hace el turno" value={String(edit.d.who ?? "")} onChange={(e) => set("who", e.target.value)} />}
              <input className={input} placeholder="Nota (opcional)" value={String(edit.d.title ?? "")} onChange={(e) => set("title", e.target.value)} />
              <div className="flex gap-1">{DAYS.map(([l, n]) => {
                const on = (edit.d.days as number[]).includes(n);
                return <button key={n} onClick={() => set("days", on ? (edit.d.days as number[]).filter((x) => x !== n) : [...(edit.d.days as number[]), n])}
                  className={`flex-1 rounded-lg py-2 font-bold ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{l}</button>;
              })}</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm font-bold">Empieza<input type="time" className={input} value={String(edit.d.start)} onChange={(e) => set("start", e.target.value)} /></label>
                <label className="text-sm font-bold">Termina<input type="time" className={input} value={String(edit.d.end)} onChange={(e) => set("end", e.target.value)} /></label>
              </div>
            </>) : edit.kind === "med" ? (<>
              <input className={input} placeholder="Nombre" value={String(edit.d.name ?? "")} onChange={(e) => set("name", e.target.value)} />
              {(() => {
                const list = String(edit.d.times ?? "").split(/[,\s]+/).filter(Boolean);
                const save = (l: string[]) => set("times", l.join(", "));
                return (
                  <div className="space-y-2">
                    <p className="text-sm font-bold">Tomas al día ({list.length})</p>
                    {list.map((t, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-16 text-sm font-bold">Toma {i + 1}</span>
                        <input type="time" className={input} value={t.padStart(5, "0")}
                          onChange={(e) => { const l = [...list]; l[i] = e.target.value; save(l); }} />
                        {list.length > 1 && (
                          <button type="button" aria-label={`Quitar toma ${i + 1}`} onClick={() => save(list.filter((_, j) => j !== i))}
                            className="rounded-xl bg-secondary px-3 py-2 font-bold text-secondary-foreground">✕</button>
                        )}
                      </div>
                    ))}
                    <button type="button" onClick={() => save([...list, list.length ? "21:00" : "09:00"])}
                      className="w-full rounded-xl bg-secondary py-2 font-bold text-secondary-foreground">+ Añadir otra toma</button>
                  </div>
                );
              })()}
              <label className="block text-sm font-bold">Desde<input type="date" className={input} value={String(edit.d.from ?? "")} onChange={(e) => set("from", e.target.value)} /></label>
              <label className="block text-sm font-bold">Hasta (vacío = crónico)<input type="date" className={input} value={String(edit.d.until ?? "")} onChange={(e) => set("until", e.target.value)} /></label>
            </>) : (<>
              <input className={input} placeholder="Título" value={String(edit.d.title ?? "")} onChange={(e) => set("title", e.target.value)} />
              {edit.kind === "cita" && <>
                <input className={input} placeholder="Con quién (médico, lugar…)" value={String(edit.d.who ?? "")} onChange={(e) => set("who", e.target.value)} />
                <input className={input} placeholder="Acompañante" value={String(edit.d.companion ?? "")} onChange={(e) => set("companion", e.target.value)} />
              </>}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => set("days", undefined)} className={`rounded-xl py-2 font-bold ${!Array.isArray(edit.d.days) ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>Un día</button>
                <button onClick={() => set("days", [1, 2, 3, 4, 5])} className={`rounded-xl py-2 font-bold ${Array.isArray(edit.d.days) ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>Cada semana</button>
              </div>
              {Array.isArray(edit.d.days) ? (
                <div className="flex gap-1">{DAYS.map(([l, n]) => {
                  const on = (edit.d.days as number[]).includes(n);
                  return <button key={n} onClick={() => set("days", on ? (edit.d.days as number[]).filter((x) => x !== n) : [...(edit.d.days as number[]), n])}
                    className={`flex-1 rounded-lg py-2 font-bold ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{l}</button>;
                })}</div>
              ) : <input type="date" className={input} value={String(edit.d.date ?? "")} onChange={(e) => set("date", e.target.value)} />}
              {edit.kind === "cita" ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-sm font-bold">Empieza<input type="time" className={input} value={String(edit.d.start)} onChange={(e) => set("start", e.target.value)} /></label>
                  <label className="text-sm font-bold">Termina<input type="time" className={input} value={String(edit.d.end)} onChange={(e) => set("end", e.target.value)} /></label>
                </div>
              ) : <label className="block text-sm font-bold">Hora<input type="time" className={input} value={String(edit.d.time)} onChange={(e) => set("time", e.target.value)} /></label>}
            </>)}
            {err && <p className="font-semibold text-destructive">{err}</p>}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => submit("upsert")} className="flex-1 rounded-2xl bg-primary py-3 font-bold text-primary-foreground">Guardar</button>
              {edit.key && <button onClick={() => submit("delete")} className="rounded-2xl bg-destructive px-4 py-3 font-bold text-destructive-foreground">Borrar</button>}
              <button onClick={() => setEdit(null)} className="rounded-2xl bg-secondary px-4 py-3 font-bold text-secondary-foreground">Cancelar</button>
            </div>
            <p className="text-sm text-muted-foreground">Se aplicará en el teléfono en cuanto se conecte (normalmente en un minuto).</p>
          </div>
        </div>
      )}
    </>
  );
}
