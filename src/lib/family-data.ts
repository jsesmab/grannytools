import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Role = "admin" | "consulta";
export type Snapshot = {
  meds?: { name: string; times: string[]; from?: string; until?: string }[];
  tomadas?: Record<string, string>;
  people?: { id: string; name: string; color?: string }[];
  entries?: { id: string; title: string; kind: "fija" | "periodica"; date?: string; days?: number[]; start: string; end: string; who?: string; personId?: string; companion?: string }[];
  tasks?: { id: string; title: string; time: string; date?: string; days?: number[] }[];
  taskStatus?: Record<string, "hecha" | "no">;
  contacts?: { name: string; phone: string }[];
  emergency?: string;
};
export type Elder = { id: string; name: string; care_mode: string; last_sync: string | null; snapshot: Snapshot; role: Role; demo?: boolean };

export const DEMO_ID = "00000000-0000-0000-0000-000000000000";
/** Persona de ejemplo (datos simulados) para probar Family sin vincular a nadie. */
export function demoElder(): Elder {
  const t = new Date(), day = ymd(t);
  const add = (n: number) => { const d = new Date(t); d.setDate(d.getDate() + n); return ymd(d); };
  const all = [0, 1, 2, 3, 4, 5, 6];
  return {
    id: DEMO_ID, name: "Carmen (ejemplo)", care_mode: "autonomo", last_sync: new Date().toISOString(), role: "consulta", demo: true,
    snapshot: {
      people: [{ id: "p1", name: "Lucía" }],
      entries: [
        { id: "e1", title: "Revisión de tensión", kind: "fija", date: day, start: "10:30", end: "11:15", who: "Dra. Pérez", companion: "Javier" },
        { id: "e2", title: "Fisioterapia", kind: "fija", date: add(2), start: "17:00", end: "18:00", who: "Centro de salud" },
        { id: "e3", title: "Mañanas", kind: "periodica", days: all, start: "09:00", end: "14:00", who: "Lucía", personId: "p1" },
      ],
      meds: [
        { name: "Omeprazol", times: ["08:00"] },
        { name: "Paracetamol", times: ["09:00", "15:00", "21:00"], from: add(-3), until: add(4) },
        { name: "Amoxicilina", times: ["08:00", "20:00"], from: add(-20), until: add(-10) },
      ],
      tomadas: { [`${day}|Omeprazol|08:00`]: `${day}T08:05` },
      tasks: [
        { id: "t1", title: "Paseo de 20 minutos", time: "12:00", days: all },
        { id: "t2", title: "Llamar a la farmacia", time: "18:00", date: day },
      ],
      taskStatus: { [`t1:${add(-1)}`]: "hecha" },
      contacts: [{ name: "Javier", phone: "600000000" }],
    },
  };
}

export const ymd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export type DayItem = {
  kind: "cita" | "turno" | "medicina" | "tarea";
  time: string; end?: string; title: string; detail?: string;
  /** Datos extra en líneas («Con: Cardiólogo», «Hasta el 15/10/2026»…). */
  info?: string[];
  status?: "hecha" | "no" | "pendiente" | "pasada";
};

/** Normaliza horas a HH:MM (acepta «9:00»). */
export const normTime = (t?: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? ""));
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "00:00";
};
export const esDate = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const DAYS_TXT = ["D", "L", "M", "X", "J", "V", "S"];
const daysTxt = (ds?: number[]) => [1, 2, 3, 4, 5, 6, 0].filter((d) => ds?.includes(d)).map((d) => DAYS_TXT[d]).join(" ");
const daysLeft = (until: string, day: string) => Math.round((new Date(until).getTime() - new Date(day).getTime()) / 86400000);

/** Todo lo que toca hoy a una persona, ordenado por hora. */
export function dayItems(s: Snapshot, d = new Date()): DayItem[] {
  const day = ymd(d), wd = d.getDay();
  const nowHM = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const isToday = day === ymd();
  const out: DayItem[] = [];
  for (const e of s.entries ?? []) {
    // Una cita puede ser de un día (date) o semanal (days); un turno siempre semanal.
    const hit = e.date ? e.date === day : (e.days ?? []).includes(wd);
    if (!hit) continue;
    const isCita = e.kind !== "periodica";
    const person = s.people?.find((p) => p.id === e.personId)?.name;
    const who = e.who || person;
    const start = normTime(e.start), end = normTime(e.end);
    out.push({
      kind: isCita ? "cita" : "turno", time: start, end,
      title: isCita ? (e.title || who || "Cita") : (who || e.title || "Turno"),
      detail: [isCita ? who : e.title, e.companion && `con ${e.companion}`].filter(Boolean).join(" · "),
      info: [
        `Horario: ${start} – ${end}`,
        isCita && who ? `Con: ${who}` : "",
        !isCita && who ? `Hace el turno: ${who}` : "",
        e.title ? (isCita ? `Motivo: ${e.title}` : `Nota: ${e.title}`) : "",
        e.companion ? `Acompañante: ${e.companion}` : "",
        e.date ? "Un día" : `Se repite: ${daysTxt(e.days)}`,
      ].filter(Boolean) as string[],
      status: isToday && end < nowHM ? "pasada" : undefined,
    });
  }
  for (const m of s.meds ?? []) {
    if ((m.from && m.from > day) || (m.until && m.until < day)) continue;
    const vig = m.until ? `Hasta el ${esDate(m.until)} (quedan ${daysLeft(m.until, day)} días)` : "Tratamiento continuo";
    for (const raw of m.times ?? []) {
      const t = normTime(raw);
      const taken = s.tomadas?.[`${day}|${m.name}|${raw}`] ?? s.tomadas?.[`${day}|${m.name}|${t}`];
      out.push({ kind: "medicina", time: t, title: m.name, detail: vig,
        info: [`Tomas: ${(m.times ?? []).map(normTime).join(", ")}`, m.from ? `Desde el ${esDate(m.from)}` : "", vig, taken ? `Tomada a las ${String(taken).slice(11, 16) || "—"}` : ""].filter(Boolean),
        status: taken ? "hecha" : isToday && t < nowHM ? "pasada" : "pendiente" });
    }
  }
  for (const t of s.tasks ?? []) {
    const hit = t.date ? t.date === day : (t.days ?? []).includes(wd);
    if (!hit) continue;
    const time = normTime(t.time);
    const st = s.taskStatus?.[`${t.id}:${day}`];
    out.push({ kind: "tarea", time, title: t.title, detail: t.date ? "Un día" : `Se repite: ${daysTxt(t.days)}`,
      info: [`Hora: ${time}`, t.date ? `Fecha: ${esDate(t.date)}` : `Se repite: ${daysTxt(t.days)}`, st === "hecha" ? "Realizada" : st === "no" ? "No realizada" : "Sin marcar"],
      status: st ?? (isToday && time < nowHM ? "pasada" : "pendiente") });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

export const eldersQuery = queryOptions({
  queryKey: ["family", "elders"],
  queryFn: async (): Promise<Elder[]> => {
    const { data: u } = await supabase.auth.getUser();
    const { data: mem, error } = await supabase.from("elder_members").select("elder_id, role").eq("user_id", u.user!.id);
    if (error) throw error;
    const ids = (mem ?? []).map((m) => m.elder_id);
    if (!ids.length) return [demoElder()];
    const { data: el, error: e2 } = await supabase.from("elders").select("id, name, care_mode, last_sync, snapshot").in("id", ids);
    if (e2) throw e2;
    return (el ?? []).map((e) => ({ ...e, snapshot: (e.snapshot ?? {}) as Snapshot, role: mem!.find((m) => m.elder_id === e.id)!.role as Role }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  refetchInterval: 30_000,
});

export const membersQuery = (elderId: string) => queryOptions({
  queryKey: ["family", "members", elderId],
  queryFn: async () => {
    const { data: m, error } = await supabase.from("elder_members").select("id, user_id, role").eq("elder_id", elderId).order("created_at");
    if (error) throw error;
    const { data: p } = await supabase.from("profiles").select("id, display_name, phone").in("id", (m ?? []).map((x) => x.user_id));
    return (m ?? []).map((x) => ({ ...x, profile: p?.find((q) => q.id === x.user_id) }));
  },
});

export function syncLabel(iso: string | null) {
  if (!iso) return "Nunca sincronizado";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 2) return "Al día";
  if (min < 60) return `Hace ${min} min`;
  if (min < 1440) return `Hace ${Math.round(min / 60)} h`;
  return `Hace ${Math.round(min / 1440)} días`;
}

export const KIND_LABEL = { cita: "Cita", turno: "Turno", medicina: "Medicina", tarea: "Tarea" } as const;
