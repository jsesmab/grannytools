import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FamilyShell, StatusPill } from "@/components/FamilyShell";
import { dayItems, eldersQuery, KIND_LABEL, syncLabel, type DayItem } from "@/lib/family-data";

export const Route = createFileRoute("/_authenticated/family/hoy")({
  head: () => ({
    meta: [
      { title: "Panel del día — Grannytools Family" },
      { name: "description", content: "Todas las citas, medicinas y tareas del día de todas las personas, hora a hora." },
      { property: "og:title", content: "Panel del día — Grannytools Family" },
      { property: "og:description", content: "Vista de ordenador para cuidadores y residencias." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(eldersQuery),
  component: Hoy,
  errorComponent: ({ error }) => <p className="p-6">No se pudo cargar: {(error as Error).message}</p>,
  notFoundComponent: () => <p className="p-6">No encontrado</p>,
});

type Row = DayItem & { elderId: string; elder: string };
const KINDS = ["cita", "tarea", "medicina", "turno"] as const;

function Hoy() {
  const { data: elders } = useSuspenseQuery(eldersQuery);
  const [kinds, setKinds] = useState<string[]>(["cita"]);
  const [who, setWho] = useState("todos");
  const [expanded, setExpanded] = useState<string[]>([]);
  const now = new Date().toTimeString().slice(0, 5);

  const rows: Row[] = elders.filter((e) => who === "todos" || e.id === who)
    .flatMap((e) => dayItems(e.snapshot).map((i) => ({ ...i, elderId: e.id, elder: e.name || "Sin nombre" })))
    .filter((r) => kinds.includes(r.kind))
    .sort((a, b) => a.time.localeCompare(b.time) || a.elder.localeCompare(b.elder));
  const hours = [...new Set(rows.map((r) => r.time.slice(0, 2)))];
  const missed = rows.filter((r) => r.status === "pasada");

  return (
    <FamilyShell title={`Panel del día · ${new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}`} wide>
      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <button key={k} onClick={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])}
            className={`rounded-xl px-3 py-2 text-sm font-bold ${kinds.includes(k) ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
            {KIND_LABEL[k]}
          </button>
        ))}
        <select value={who} onChange={(e) => setWho(e.target.value)} className="rounded-xl border-2 border-input bg-background px-3 py-2 font-semibold">
          <option value="todos">Todas las personas ({elders.length})</option>
          {elders.map((e) => <option key={e.id} value={e.id}>{e.name || "Sin nombre"}</option>)}
        </select>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="overflow-hidden rounded-3xl border-2 border-border bg-card">
          {hours.length === 0 && <p className="p-6 text-muted-foreground">Nada programado hoy.</p>}
          {hours.map((h) => (
            <div key={h} className={`grid grid-cols-1 border-b border-border last:border-0 sm:grid-cols-[72px_1fr] ${now.slice(0, 2) === h ? "bg-primary/5" : ""}`}>
              <div className="border-b border-border p-3 text-2xl font-black sm:border-b-0 sm:border-r">{h}:00</div>
              <div className="divide-y divide-border/50">
                {rows.filter((r) => r.time.startsWith(h)).map((r, i) => {
                  const k = `${h}-${i}-${r.elderId}-${r.title}`;
                  const isOpen = expanded.includes(k);
                  return (
                    <div key={k} className="p-3">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                        <div className="min-w-0">
                          <p className="font-bold">
                            <span className="mr-2 text-lg">{r.time}{r.end ? `–${r.end}` : ""}</span>
                            <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">{KIND_LABEL[r.kind]}</span>
                          </p>
                          <p className="text-lg font-extrabold">{r.title}</p>
                          <Link to="/family/persona/$id" params={{ id: r.elderId }} data-flat-button className="text-sm font-bold text-primary underline">{r.elder}</Link>
                          {r.detail && <span className="text-sm text-muted-foreground"> · {r.detail}</span>}
                        </div>
                        <StatusPill status={r.status} />
                      </div>
                      {r.info && r.info.length > 0 && (<>
                        <ul className={`mt-2 space-y-0.5 text-sm ${isOpen ? "block" : "hidden lg:block"}`}>
                          {r.info.map((x) => <li key={x}>• {x}</li>)}
                        </ul>
                        <button data-flat-button onClick={() => setExpanded((p) => isOpen ? p.filter((x) => x !== k) : [...p, k])}
                          className="mt-1 text-sm font-bold text-primary underline lg:hidden">{isOpen ? "Ocultar detalles ▲" : "Ver detalles ▼"}</button>
                      </>)}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <aside className="space-y-4">
          <div className="rounded-3xl border-2 border-destructive/40 bg-card p-4">
            <h2 className="text-lg font-extrabold">Sin marcar ({missed.length})</h2>
            {missed.length === 0 ? <p className="text-muted-foreground">Todo al día.</p> : missed.map((r, i) => (
              <p key={i} className="text-sm"><b>{r.time}</b> {r.elder} · {r.title}</p>
            ))}
          </div>
          <div className="rounded-3xl border-2 border-border bg-card p-4">
            <h2 className="text-lg font-extrabold">Sincronización</h2>
            {elders.map((e) => (
              <p key={e.id} className="flex justify-between text-sm"><span>{e.name || "Sin nombre"}</span><span className="text-muted-foreground">{syncLabel(e.last_sync)}</span></p>
            ))}
          </div>
          <div className="rounded-3xl border-2 border-border bg-card p-4">
            <h2 className="text-lg font-extrabold">Añadir o modificar</h2>
            <p className="mb-2 text-sm text-muted-foreground">Citas, tareas, medicinas y turnos de cada persona:</p>
            {elders.map((e) => (
              <Link key={e.id} to="/family/editar/$id" params={{ id: e.id }} className="mb-2 block rounded-xl bg-primary px-3 py-2 text-center font-bold text-primary-foreground">✏️ {e.name || "Sin nombre"}</Link>
            ))}
          </div>
        </aside>
      </div>
    </FamilyShell>
  );
}
