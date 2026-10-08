import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FamilyShell } from "@/components/FamilyShell";
import { FamilyEditor } from "@/components/FamilyEditor";
import { eldersQuery } from "@/lib/family-data";

export const Route = createFileRoute("/_authenticated/family/editar/$id")({
  head: () => ({
    meta: [
      { title: "Añadir o modificar — Grannytools Family" },
      { name: "description", content: "Añade o modifica citas, tareas, medicinas y turnos de la persona." },
      { property: "og:title", content: "Añadir o modificar — Grannytools Family" },
      { property: "og:description", content: "Edición rápida de la agenda de la persona." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context, params }) => {
    const elders = await context.queryClient.ensureQueryData(eldersQuery);
    if (!elders.some((e) => e.id === params.id)) throw notFound();
  },
  component: Editar,
  errorComponent: ({ error }) => <p className="p-6">No se pudo cargar: {(error as Error).message}</p>,
  notFoundComponent: () => <p className="p-6">No tienes acceso a esta persona.</p>,
});

function Editar() {
  const { id } = Route.useParams();
  const { data: elders } = useSuspenseQuery(eldersQuery);
  const e = elders.find((x) => x.id === id)!;
  return (
    <FamilyShell title={`Añadir o modificar · ${e.name || "Sin nombre"}`} wide>
      <Link to="/family/hoy" className="inline-block rounded-xl bg-secondary px-3 py-2 text-sm font-bold text-secondary-foreground">← Volver al panel del día</Link>
      <FamilyEditor elderId={id} snapshot={e.snapshot} admin={e.role === "admin"} />
    </FamilyShell>
  );
}
