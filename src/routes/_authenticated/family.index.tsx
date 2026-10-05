import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FamilyShell } from "@/components/FamilyShell";
import { dayItems, eldersQuery, syncLabel } from "@/lib/family-data";

export const Route = createFileRoute("/_authenticated/family/")({
  head: () => ({
    meta: [
      { title: "Mis personas — Grannytools Family" },
      { name: "description", content: "Las personas que cuidas, con su próxima cita, medicina y tarea." },
      { property: "og:title", content: "Mis personas — Grannytools Family" },
      { property: "og:description", content: "Resumen de las personas que cuidas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(eldersQuery),
  component: Personas,
  errorComponent: ({ error }) => <p className="p-6">No se pudo cargar: {error.message}</p>,
  notFoundComponent: () => <p className="p-6">No encontrado</p>,
});

function Personas() {
  const { data: elders } = useSuspenseQuery(eldersQuery);
  const now = new Date().toTimeString().slice(0, 5);
  return (
    <FamilyShell title="Mis personas">
      {elders.length === 0 && (
        <div className="rounded-3xl border-2 border-dashed border-border p-8 text-center">
          <p className="text-xl font-bold">Aún no cuidas a nadie.</p>
          <p className="mt-1 text-muted-foreground">En el teléfono de la persona abre Ajustes → «Vincular con un familiar» y escribe aquí el código.</p>
          <Link to="/family/vincular" className="mt-4 inline-block rounded-2xl bg-primary px-6 py-3 font-bold text-primary-foreground">Vincular persona</Link>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {elders.map((e) => {
          const next = dayItems(e.snapshot).filter((i) => i.time >= now && i.status !== "hecha").slice(0, 3);
          return (
            <Link key={e.id} to="/family/persona/$id" params={{ id: e.id }} data-flat-button
              className="block space-y-3 rounded-3xl border-2 border-border bg-card p-5 hover:border-primary">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-2xl font-extrabold">{e.name || "Sin nombre"}</h2>
                <span className="rounded-lg bg-muted px-2 py-1 text-xs font-bold">{e.role === "admin" ? "Administrador" : "Consultas"}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {syncLabel(e.last_sync)} · Modo {e.care_mode === "protegido" ? "Protegido" : "Autónomo"}
              </p>
              {next.length ? next.map((i, k) => (
                <p key={k} className="text-base"><b>{i.time}</b> · {i.title}</p>
              )) : <p className="text-muted-foreground">Nada más por hoy.</p>}
            </Link>
          );
        })}
      </div>
    </FamilyShell>
  );
}
