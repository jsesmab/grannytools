import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { FamilyShell, StatusPill } from "@/components/FamilyShell";
import { dayItems, eldersQuery, KIND_LABEL, membersQuery, syncLabel, ymd } from "@/lib/family-data";
import { familyMemberAction, setElderCareMode } from "@/lib/family.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/family/persona/$id")({
  head: () => ({
    meta: [
      { title: "Ficha de la persona — Grannytools Family" },
      { name: "description", content: "Agenda, medicinas, tareas, contactos y familia vinculada de la persona." },
      { property: "og:title", content: "Ficha de la persona — Grannytools Family" },
      { property: "og:description", content: "Resumen completo de la persona que cuidas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context, params }) => {
    const elders = await context.queryClient.ensureQueryData(eldersQuery);
    if (!elders.some((e) => e.id === params.id)) throw notFound();
    await context.queryClient.ensureQueryData(membersQuery(params.id));
  },
  component: Ficha,
  errorComponent: ({ error }) => <p className="p-6">No se pudo cargar: {(error as Error).message}</p>,
  notFoundComponent: () => <p className="p-6">No tienes acceso a esta persona.</p>,
});

const card = "rounded-3xl border-2 border-border bg-card p-5 space-y-3";

function Ficha() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: elders } = useSuspenseQuery(eldersQuery);
  const { data: members } = useSuspenseQuery(membersQuery(id));
  const setMode = useServerFn(setElderCareMode);
  const memberAct = useServerFn(familyMemberAction);
  const [day, setDay] = useState(ymd());
  const [me, setMe] = useState<string>();
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMe(data.user?.id)); }, []);

  const e = elders.find((x) => x.id === id)!;
  const admin = e.role === "admin";
  const items = dayItems(e.snapshot, new Date(day + "T12:00"));
  const s = e.snapshot;

  const refresh = () => qc.invalidateQueries({ queryKey: ["family"] });
  const changeMode = async (mode: "autonomo" | "protegido") => { await setMode({ data: { elderId: id, mode } }); refresh(); };
  const act = async (memberId: string, action: "admin" | "consulta" | "remove") => {
    if (action === "remove" && !confirm("¿Quitar a esta persona de la familia vinculada?")) return;
    await memberAct({ data: { elderId: id, memberId, action } }); refresh();
  };

  return (
    <FamilyShell title={e.name || "Sin nombre"} wide>
      <p className="text-muted-foreground">
        {syncLabel(e.last_sync)} · Tu rol: <b>{admin ? "Administrador" : "Consultas"}</b>
        {!admin && " (solo ver)"}
      </p>
      <div className="grid gap-5 lg:grid-cols-3">
        <section className={`${card} lg:col-span-2`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-extrabold">Agenda del día</h2>
            <input type="date" value={day} onChange={(ev) => setDay(ev.target.value || ymd())}
              className="rounded-xl border-2 border-input bg-background px-3 py-2 font-semibold" />
          </div>
          {items.length === 0 && <p className="text-muted-foreground">Nada programado.</p>}
          {items.map((i, k) => (
            <div key={k} className="flex items-center gap-3 border-b border-border pb-2 last:border-0">
              <span className="w-14 text-lg font-black">{i.time}</span>
              <span className="w-20 text-xs font-bold uppercase text-muted-foreground">{KIND_LABEL[i.kind]}</span>
              <span className="flex-1">{i.title}{i.end ? ` (hasta ${i.end})` : ""}{i.detail ? <span className="text-muted-foreground"> · {i.detail}</span> : null}</span>
              <StatusPill status={i.status} />
            </div>
          ))}
        </section>

        <section className={card}>
          <h2 className="text-xl font-extrabold">Modo de uso</h2>
          <div className="grid grid-cols-2 gap-2">
            {(["autonomo", "protegido"] as const).map((m) => (
              <button key={m} disabled={!admin} onClick={() => changeMode(m)}
                className={`rounded-xl py-3 font-bold ${e.care_mode === m ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                {m === "autonomo" ? "Autónomo" : "Protegido"}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">Protegido: la persona ve su agenda y marca tomas, pero no puede crear ni borrar. Se aplica en su teléfono al conectarse.</p>
        </section>

        <section className={card}>
          <h2 className="text-xl font-extrabold">Medicinas</h2>
          {(s.meds ?? []).length === 0 && <p className="text-muted-foreground">Sin medicinas.</p>}
          {(s.meds ?? []).map((m, k) => (
            <p key={k}><b>{m.name}</b> · {m.times.join(", ")}{m.until ? <span className="text-muted-foreground"> · hasta {m.until}</span> : null}</p>
          ))}
        </section>

        <section className={card}>
          <h2 className="text-xl font-extrabold">Tareas</h2>
          {(s.tasks ?? []).length === 0 && <p className="text-muted-foreground">Sin tareas.</p>}
          {(s.tasks ?? []).map((t) => (
            <p key={t.id}><b>{t.time}</b> · {t.title} <span className="text-muted-foreground">{t.date ? `(${t.date})` : "(periódica)"}</span></p>
          ))}
        </section>

        <section className={card}>
          <h2 className="text-xl font-extrabold">Contactos</h2>
          {(s.contacts ?? []).length === 0 && <p className="text-muted-foreground">Sin contactos.</p>}
          {(s.contacts ?? []).map((c, k) => (
            <p key={k}>{c.phone === s.emergency ? "⭐ " : ""}<b>{c.name}</b> · <a href={`tel:${c.phone}`} className="text-primary underline">{c.phone}</a></p>
          ))}
        </section>

        <section className={`${card} lg:col-span-3`}>
          <h2 className="text-xl font-extrabold">Familia vinculada</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {members.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-border p-3">
                <span className="flex-1 font-bold">{m.profile?.display_name || "Familiar"}{m.user_id === me ? " (tú)" : ""}
                  {m.profile?.phone ? <span className="block text-sm font-normal text-muted-foreground">{m.profile.phone}</span> : null}</span>
                {admin ? (<>
                  <select value={m.role} onChange={(ev) => act(m.id, ev.target.value as "admin" | "consulta")}
                    className="rounded-xl border-2 border-input bg-background px-2 py-2 text-sm font-semibold">
                    <option value="admin">Administrador</option>
                    <option value="consulta">Consultas</option>
                  </select>
                  {m.user_id !== me && <button onClick={() => act(m.id, "remove")} className="rounded-xl bg-destructive px-3 py-2 text-sm font-bold text-destructive-foreground">Quitar</button>}
                </>) : <span className="text-sm font-semibold">{m.role === "admin" ? "Administrador" : "Consultas"}</span>}
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">Para añadir a alguien más, genera un código nuevo en el teléfono de la persona.</p>
        </section>
      </div>
      <p className="text-sm text-muted-foreground">La edición de citas, medicinas y tareas desde Family llega en la siguiente fase.</p>
    </FamilyShell>
  );
}
