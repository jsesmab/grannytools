import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FamilyShell } from "@/components/FamilyShell";
import { useState } from "react";
import { eldersQuery, syncLabel } from "@/lib/family-data";
import { FamilyEditor } from "@/components/FamilyEditor";
import { FamilyMembers } from "@/components/FamilyMembers";

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
  errorComponent: ({ error }) => <p className="p-6">No se pudo cargar: {(error as Error).message}</p>,
  notFoundComponent: () => <p className="p-6">No encontrado</p>,
});

function Personas() {
  const { data: elders } = useSuspenseQuery(eldersQuery);
  const [open, setOpen] = useState<string[]>([]);
  return (
    <FamilyShell title="Mis personas" wide>
      {elders.length === 0 && (
        <div className="rounded-3xl border-2 border-dashed border-border p-8 text-center">
          <p className="text-xl font-bold">Aún no cuidas a nadie.</p>
          <p className="mt-1 text-muted-foreground">En el teléfono de la persona abre Ajustes → «Vincular con un familiar» y escribe aquí el código.</p>
          <Link to="/family/vincular" className="mt-4 inline-block rounded-2xl bg-primary px-6 py-3 font-bold text-primary-foreground">Vincular persona</Link>
        </div>
      )}
      <div className="space-y-4">
        {elders.map((e) => {
          const on = open.includes(e.id);
          const admin = e.role === "admin";
          return (
            <div key={e.id} className="space-y-3">
              <button data-flat-button aria-expanded={on} onClick={() => setOpen((o) => on ? o.filter((x) => x !== e.id) : [...o, e.id])}
                className="flex w-full items-center gap-3 rounded-3xl border-2 border-border bg-card p-5 text-left hover:border-primary">
                <span className="text-2xl">{on ? "▾" : "▸"}</span>
                <span className="flex-1 text-2xl font-extrabold">{e.name || "Sin nombre"}</span>
                <span className="rounded-lg bg-muted px-2 py-1 text-xs font-bold">{admin ? "Administrador" : "Consultas"}</span>
              </button>
              {on && (
                <div className="space-y-3 pl-2 sm:pl-6">
                  <p className="text-sm text-muted-foreground">{syncLabel(e.last_sync)}{!admin && " · solo ver"} · <Link to="/family/persona/$id" params={{ id: e.id }} className="text-primary underline">Ficha completa</Link></p>
                  <FamilyEditor elderId={e.id} snapshot={e.snapshot} admin={admin} />
                  <FamilyMembers elderId={e.id} admin={admin} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {elders.length > 0 && (
        <Link to="/family/vincular" className="mt-6 block rounded-3xl border-2 border-dashed border-primary p-5 text-center text-xl font-bold text-primary">
          + Vincular otra persona
        </Link>
      )}
    </FamilyShell>
  );
}
