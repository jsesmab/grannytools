import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { FamilyShell, StatusPill } from "@/components/FamilyShell";
import { dayItems, eldersQuery, KIND_LABEL, membersQuery, syncLabel, ymd } from "@/lib/family-data";
import { setElderCareMode } from "@/lib/family.functions";
import { FamilyEditor } from "@/components/FamilyEditor";
import { FamilyMembers } from "@/components/FamilyMembers";

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
  const setMode = useServerFn(setElderCareMode);
  const [day, setDay] = useState(ymd());

  const e = elders.find((x) => x.id === id)!;
  const admin = e.role === "admin";
  const items = dayItems(e.snapshot, new Date(day + "T12:00"));
  const s = e.snapshot;

  const refresh = () => qc.invalidateQueries({ queryKey: ["family"] });
  const changeMode = async (mode: "autonomo" | "protegido") => { await setMode({ data: { elderId: id, mode } }); refresh(); };
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
          {(["cita", "tarea", "medicina", "turno"] as const).map((kind) => {
            const g = items.filter((i) => i.kind === kind);
            if (!g.length) return null;
            return (
              <div key={kind} className="space-y-2">
                <h3 className="text-sm font-black uppercase text-primary">{KIND_LABEL[kind]}s ({g.length})</h3>
                {g.map((i, k) => (
                  <div key={k} className="flex items-center gap-3 border-b border-border pb-2 last:border-0">
                    <span className="w-14 text-lg font-black">{i.time}</span>
                    <span className="flex-1">{i.title}{i.end ? ` (hasta ${i.end})` : ""}{i.detail ? <span className="text-muted-foreground"> · {i.detail}</span> : null}</span>
                    <StatusPill status={i.status} />
                  </div>
                ))}
              </div>
            );
          })}
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
          <h2 className="text-xl font-extrabold">Contactos</h2>
          {(s.contacts ?? []).length === 0 && <p className="text-muted-foreground">Sin contactos.</p>}
          {(s.contacts ?? []).map((c, k) => (
            <p key={k}>{c.phone === s.emergency ? "⭐ " : ""}<b>{c.name}</b> · <a href={`tel:${c.phone}`} className="text-primary underline">{c.phone}</a></p>
          ))}
        </section>

        <div className="lg:col-span-3"><FamilyMembers elderId={id} admin={admin} /></div>
      </div>
      <FamilyEditor elderId={id} snapshot={s} admin={admin} />
    </FamilyShell>
  );
}
