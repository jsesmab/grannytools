import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { dayItems, demoElder, KIND_LABEL, type DayItem } from "@/lib/family-data";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Demostración — Grannytools Family" },
      { name: "description", content: "Prueba Grannytools Family con una persona de ejemplo, sin registrarte." },
      { property: "og:title", content: "Demostración — Grannytools Family" },
      { property: "og:description", content: "Mira cómo funciona Family con datos simulados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Demo,
});

function Demo() {
  const [items, setItems] = useState<DayItem[]>([]);
  const [meds, setMeds] = useState<{ name: string; times: string[]; until?: string }[]>([]);
  // Se calcula en el navegador para usar la fecha y hora del propio móvil.
  useEffect(() => { const e = demoElder(); setItems(dayItems(e.snapshot)); setMeds((e.snapshot.meds ?? []).filter((m) => !m.until || m.until >= new Date().toISOString().slice(0, 10))); }, []);
  return (
    <main className="mx-auto max-w-2xl space-y-5 bg-background p-4 text-foreground">
      <div className="flex items-center gap-3">
        <img src="/family-icon-192.png" alt="Grannytools Family" width={56} height={56} className="h-14 w-14" />
        <div><p className="text-sm font-bold uppercase text-primary">Demostración</p><h1 className="text-2xl font-extrabold">Carmen (ejemplo)</h1></div>
      </div>
      <p className="rounded-2xl bg-primary/10 p-4">Datos simulados para que veas cómo funciona Family. Para cuidar a una persona real, crea tu cuenta y elige un plan.</p>
      <section className="space-y-2">
        <h2 className="text-xl font-extrabold">Panel del día</h2>
        {items.map((it, i) => (
          <div key={i} className="rounded-2xl border-2 border-border bg-card p-4">
            <p className="text-sm font-bold text-primary">{KIND_LABEL[it.kind]} · {it.time}{it.end ? ` – ${it.end}` : ""}</p>
            <p className="text-lg font-extrabold">{it.title}</p>
            {it.detail && <p className="text-muted-foreground">{it.detail}</p>}
          </div>
        ))}
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-extrabold">Medicinas en curso</h2>
        {meds.map((m) => <p key={m.name} className="rounded-2xl bg-muted p-3 font-semibold">{m.name} · {m.times.join(", ")}</p>)}
      </section>
      <Link to="/auth" className="block rounded-2xl bg-primary py-3 text-center text-lg font-bold text-primary-foreground">Crear cuenta o entrar</Link>
    </main>
  );
}
