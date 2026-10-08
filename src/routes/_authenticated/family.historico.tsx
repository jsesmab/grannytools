import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FamilyShell } from "@/components/FamilyShell";
import { eldersQuery, esDate, normTime, ymd, type Elder } from "@/lib/family-data";

export const Route = createFileRoute("/_authenticated/family/historico")({
  head: () => ({
    meta: [
      { title: "Histórico — Grannytools Family" },
      { name: "description", content: "Tratamientos terminados, citas, tareas y turnos pasados, por persona, concepto y fechas." },
      { property: "og:title", content: "Histórico — Grannytools Family" },
      { property: "og:description", content: "Consulta del historial de cuidados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(eldersQuery),
  component: Historico,
  errorComponent: ({ error }) => <p className="p-6">No se pudo cargar: {(error as Error).message}</p>,
});

type Kind = "cita" | "tarea" | "medicina" | "turno";
const KINDS: [Kind, string][] = [["cita", "Citas"], ["tarea", "Tareas"], ["medicina", "Medicinas"], ["turno", "Turnos"]];
type H = { kind: Kind; date: string; elder: string; title: string; lines: string[] };

function history(e: Elder, today: string): H[] {
  const s = e.snapshot, elder = e.name || "Sin nombre", out: H[] = [];
  for (const m of s.meds ?? []) if (m.until && m.until < today) {
    const tomas = Object.entries(s.tomadas ?? {}).filter(([k]) => k.split("|")[1] === m.name).length;
    out.push({ kind: "medicina", date: m.until, elder, title: m.name, lines: [
      `Periodo: ${m.from ? esDate(m.from) : "—"} → ${esDate(m.until)}`, `Tomas al día: ${m.times.map(normTime).join(", ")}`, `Tomas registradas: ${tomas}`] });
  }
  for (const c of s.entries ?? []) if (c.date && c.date < today) {
    const turno = c.kind === "periodica";
    out.push({ kind: turno ? "turno" : "cita", date: c.date, elder, title: c.title || c.who || "Cita", lines: [
      `Horario: ${normTime(c.start)} – ${normTime(c.end)}`, c.who ? `Con: ${c.who}` : "", c.companion ? `Acompañante: ${c.companion}` : ""].filter(Boolean) });
  }
  for (const t of s.tasks ?? []) if (t.date && t.date < today) {
    const st = s.taskStatus?.[`${t.id}:${t.date}`];
    out.push({ kind: "tarea", date: t.date, elder, title: t.title, lines: [`Hora: ${normTime(t.time)}`, st === "hecha" ? "Realizada" : st === "no" ? "No realizada" : "Sin marcar"] });
  }
  // Registro diario de tareas periódicas y turnos ya pasados.
  for (const [k, st] of Object.entries(s.taskStatus ?? {})) {
    const [id, date] = k.split(":"); const t = s.tasks?.find((x) => x.id === id);
    if (!t || t.date || !date || date >= today) continue;
    out.push({ kind: "tarea", date, elder, title: t.title, lines: [`Hora: ${normTime(t.time)}`, st === "hecha" ? "Realizada" : "No realizada"] });
  }
  return out;
}

function Historico() {
  const { data: elders } = useSuspenseQuery(eldersQuery);
  const today = ymd();
  const [who, setWho] = useState("todos");
  const [kind, setKind] = useState<"todos" | Kind>("todos");
  const [from, setFrom] = useState(ymd(new Date(Date.now() - 90 * 86400000)));
  const [to, setTo] = useState(today);
  const rows = elders.filter((e) => who === "todos" || e.id === who).flatMap((e) => history(e, today))
    .filter((r) => (kind === "todos" || r.kind === kind) && (!from || r.date >= from) && (!to || r.date <= to))
    .sort((a, b) => b.date.localeCompare(a.date));
  const sel = "rounded-xl border-2 border-input bg-background px-3 py-2 font-semibold";
  return (
    <FamilyShell title={`Histórico · ${who === "todos" ? "Todas las personas" : (elders.find((x) => x.id === who)?.name || "Sin nombre")}`} wide>
      <div className="flex flex-wrap items-end gap-2">
        <select value={who} onChange={(e) => setWho(e.target.value)} className={sel}>
          <option value="todos">Todas las personas</option>
          {elders.map((e) => <option key={e.id} value={e.id}>{e.name || "Sin nombre"}</option>)}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={sel}>
          <option value="todos">Todos los conceptos</option>
          {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label className="text-sm font-bold">Desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${sel} block`} /></label>
        <label className="text-sm font-bold">Hasta<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${sel} block`} /></label>
      </div>
      {rows.length === 0 && <p className="text-muted-foreground">No hay registros en esas fechas.</p>}
      {KINDS.filter(([k]) => kind === "todos" || kind === k).map(([k, l]) => {
        const g = rows.filter((r) => r.kind === k);
        if (!g.length) return null;
        return (
          <section key={k} className="space-y-2 rounded-3xl border-2 border-border bg-card p-5">
            <h2 className="text-xl font-extrabold">{l} ({g.length})</h2>
            {g.map((r, i) => (
              <div key={i} className="border-b border-border pb-2 last:border-0">
                <p className="font-bold"><span className="mr-2">{esDate(r.date)}</span>{r.title} <span className="text-sm text-muted-foreground">· {r.elder}</span></p>
                <ul className="text-sm">{r.lines.map((x) => <li key={x}>• {x}</li>)}</ul>
              </div>
            ))}
          </section>
        );
      })}
    </FamilyShell>
  );
}
