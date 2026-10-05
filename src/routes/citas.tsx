import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, CalendarDays, Repeat, Users, Pencil, Bell, UserPlus, ClipboardCheck } from "lucide-react";
import { DEFAULT_REMIND_MIN } from "@/lib/reminders";
import { TasksPanel } from "@/components/TasksPanel";

type View = "turnos" | "citas" | "tareas" | "personas";
const VIEWS: View[] = ["turnos", "citas", "tareas", "personas"];

export const Route = createFileRoute("/citas")({
  validateSearch: (search: Record<string, unknown>): { edit?: string; view?: View } => ({
    edit: typeof search.edit === "string" ? search.edit : undefined,
    view: VIEWS.includes(search.view as View) ? (search.view as View) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Grannytools — Citas, turnos y tareas" },
      {
        name: "description",
        content:
          "Organiza citas médicas puntuales con acompañante y turnos de cuidadoras o familiares en barras de tiempo por día.",
      },
      { property: "og:title", content: "Grannytools — Citas, turnos y tareas" },
      { property: "og:description", content: "Citas puntuales con acompañante y turnos de cuidadoras por día." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Citas,
});

type Person = { id: string; name: string; role: "cuidadora" | "familiar" | "medico"; color: string };
type Entry = {
  id: string;
  personId?: string; // persona del turno (solo turnos)
  who?: string; // con quién es la cita (texto libre, solo citas)
  title: string;
  kind: "fija" | "periodica"; // fija = cita puntual · periodica = turno
  date?: string; // cita
  days?: number[]; // turno 0..6
  start: string;
  end: string;
  companion?: string; // acompañante (solo citas)
  remindMin?: number;
};

const PEOPLE_KEY = "grannytools.citas.people";
const ENTRIES_KEY = "grannytools.citas.entries";

const COLORS = [
  { name: "Azul", cls: "bg-[#2563eb]" },
  { name: "Verde", cls: "bg-[#16a34a]" },
  { name: "Naranja", cls: "bg-[#ea580c]" },
  { name: "Morado", cls: "bg-[#7c3aed]" },
  { name: "Rosa", cls: "bg-[#db2777]" },
  { name: "Turquesa", cls: "bg-[#0891b2]" },
];

const DAYS = ["L", "M", "X", "J", "V", "S", "D"];
const DAY_INDEX = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const ROLES: { v: Person["role"]; label: string }[] = [
  { v: "cuidadora", label: "Cuidadora" },
  { v: "familiar", label: "Hijo/Familiar" },
  { v: "medico", label: "Médico" },
];

const uid = () => Math.random().toString(36).slice(2, 10);

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function endMin(start: string, end: string) {
  const s = toMin(start);
  let e = toMin(end);
  if (e <= s) e = 24 * 60; // turnos que cruzan medianoche se cortan a las 24:00
  return e;
}

function hoursBetween(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let m = eh * 60 + em - (sh * 60 + sm);
  if (m < 0) m += 24 * 60;
  return Math.round((m / 60) * 10) / 10;
}

// Reparte las citas de un día en carriles: si se solapan, van en barras distintas.
function buildLanes(list: Entry[]): Entry[][] {
  const sorted = [...list].sort((a, b) => toMin(a.start) - toMin(b.start) || toMin(a.end) - toMin(b.end));
  const lanes: Entry[][] = [];
  for (const e of sorted) {
    const lane = lanes.find((l) => {
      const last = l[l.length - 1];
      return endMin(last.start, last.end) <= toMin(e.start);
    });
    if (lane) lane.push(e);
    else lanes.push([e]);
  }
  return lanes;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Citas() {
  const { edit: editId, view } = Route.useSearch();
  const tab = view ?? (editId ? "citas" : undefined);
  const navigate = useNavigate();
  const [people, setPeople] = useState<Person[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);

  // form persona
  const [pName, setPName] = useState("");
  const [pRole, setPRole] = useState<Person["role"]>("cuidadora");
  const [pColor, setPColor] = useState(COLORS[0].cls);

  // form cita / turno
  const [eOpen, setEOpen] = useState(false);
  const [eEditId, setEEditId] = useState<string | null>(null);
  const [ePerson, setEPerson] = useState("");
  const [eWho, setEWho] = useState("");
  const [eTitle, setETitle] = useState("");
  const [eKind, setEKind] = useState<Entry["kind"]>("periodica");
  const [eDate, setEDate] = useState("");
  const [eDays, setEDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [eStart, setEStart] = useState("09:00");
  const [eEnd, setEEnd] = useState("11:00");
  const [eCompanion, setECompanion] = useState("");
  const [eRemind, setERemind] = useState(DEFAULT_REMIND_MIN);
  const [eRepeat, setERepeat] = useState<"once" | "weekly">("once");

  useEffect(() => {
    setPeople(load<Person[]>(PEOPLE_KEY, []));
    const loaded = load<Entry[]>(ENTRIES_KEY, []);
    setEntries(loaded);
    if (editId) {
      const found = loaded.find((e) => e.id === editId);
      if (found) openEdit(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const personById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);

  const addPerson = () => {
    const name = pName.trim();
    if (!name) return;
    const next = [...people, { id: uid(), name, role: pRole, color: pColor }];
    setPeople(next); save(PEOPLE_KEY, next);
    setPName("");
    setPColor(COLORS[next.length % COLORS.length].cls);
  };

  const removePerson = (id: string) => {
    const np = people.filter((p) => p.id !== id);
    const ne = entries.filter((e) => e.personId !== id);
    setPeople(np); save(PEOPLE_KEY, np);
    setEntries(ne); save(ENTRIES_KEY, ne);
  };

  const openNew = (kind: Entry["kind"]) => {
    setEEditId(null);
    setEPerson(people[0]?.id ?? "");
    setETitle("");
    setEKind(kind);
    setERepeat(kind === "fija" ? "once" : "weekly");
    setEDate(kind === "fija" ? todayISO() : "");
    setEDays(kind === "fija" ? [] : [1, 2, 3, 4, 5]);
    setEStart(kind === "fija" ? "10:00" : "09:00");
    setEEnd(kind === "fija" ? "11:00" : "14:00");
    setECompanion("");
    setERemind(DEFAULT_REMIND_MIN);
    setEOpen(true);
  };

  const openEdit = (e: Entry) => {
    setEEditId(e.id);
    setEPerson(e.personId);
    setETitle(e.title);
    setEKind(e.kind);
    setERepeat(e.kind === "periodica" || !e.date ? "weekly" : "once");
    setEDate(e.date ?? "");
    setEDays(e.days ?? (e.kind === "fija" ? [] : [1, 2, 3, 4, 5]));
    setEStart(e.start);
    setEEnd(e.end);
    setECompanion(e.companion ?? "");
    setERemind(e.remindMin ?? DEFAULT_REMIND_MIN);
    setEOpen(true);
  };

  const closeForm = () => {
    setEOpen(false);
    setEEditId(null);
    if (editId) void navigate({ to: "/citas", search: { view: tab } });
  };

  const saveEntry = () => {
    if (!ePerson) return;
    const repeats = eKind === "periodica" || eRepeat === "weekly";
    if (!repeats && !eDate) return;
    if (repeats && eDays.length === 0) return;
    const base: Entry = {
      id: eEditId ?? uid(),
      personId: ePerson,
      title: eTitle.trim() || (eKind === "fija" ? "Cita" : "Turno"),
      kind: eKind,
      start: eStart,
      end: eEnd,
      remindMin: eRemind,
      ...(repeats ? { days: eDays } : { date: eDate }),
      ...(eKind === "fija" ? { companion: eCompanion.trim() || undefined } : {}),
    };
    const next = eEditId ? entries.map((x) => (x.id === eEditId ? base : x)) : [...entries, base];
    setEntries(next); save(ENTRIES_KEY, next);
    closeForm();
  };

  const removeEntry = (id: string) => {
    const next = entries.filter((e) => e.id !== id);
    setEntries(next); save(ENTRIES_KEY, next);
    closeForm();
  };

  const toggleDay = (d: number) =>
    setEDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const weeklyHours = (personId: string) =>
    entries
      .filter((e) => e.personId === personId && e.kind === "periodica")
      .reduce((sum, e) => sum + hoursBetween(e.start, e.end) * (e.days?.length ?? 0), 0);

  const fixedByDate = useMemo(() => {
    const map = new Map<string, Entry[]>();
    entries.filter((e) => e.kind === "fija" && e.date).forEach((e) => {
      const list = map.get(e.date!) ?? [];
      list.push(e);
      map.set(e.date!, list);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [entries]);

  // Barra temporal de un día: una fila por carril, colores de cada persona.
  const Timeline = ({ list }: { list: Entry[] }) => {
    if (list.length === 0) return <p className="text-sm text-muted-foreground">Sin turnos</p>;
    const lanes = buildLanes(list);
    return (
      <div className="space-y-1">
        {lanes.map((lane, li) => (
          <div key={li} className="relative h-10 overflow-hidden rounded-lg bg-secondary">
            {lane.map((e) => {
              const s = toMin(e.start);
              const en = endMin(e.start, e.end);
              return (
                <button
                  key={e.id}
                  onClick={() => openEdit(e)}
                  title={`${personById[e.personId]?.name} · ${e.start}–${e.end} · ${e.title}`}
                  className={`absolute top-0 flex h-full items-center overflow-hidden rounded-lg px-1 text-left text-white active:scale-[0.98] ${personById[e.personId]?.color ?? "bg-primary"}`}
                  style={{ left: `${(s / 1440) * 100}%`, width: `${Math.max(((en - s) / 1440) * 100, 4)}%` }}
                >
                  <span className="truncate text-[11px] font-black leading-tight">
                    {personById[e.personId]?.name}
                    <span className="block text-[10px] font-normal opacity-90">{e.start}–{e.end}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
        <div className="flex justify-between px-0.5 text-[10px] text-muted-foreground">
          {["0", "6", "12", "18", "24"].map((h) => (
            <span key={h}>{h}h</span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-3 py-3">
        <header className="mb-3 flex items-center gap-2">
          {tab ? (
            <Link to="/citas" search={{}} aria-label="Volver" className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground active:scale-95">
              <ArrowLeft className="h-6 w-6" aria-hidden />
            </Link>
          ) : (
            <Link to="/" aria-label="Volver al inicio" className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground active:scale-95">
              <ArrowLeft className="h-6 w-6" aria-hidden />
            </Link>
          )}
          <h1 className="text-2xl font-black">
            {tab === "turnos" ? "Turnos" : tab === "citas" ? "Citas" : tab === "tareas" ? "Tareas" : tab === "personas" ? "Personas" : "Citas y turnos"}
          </h1>
        </header>

        {!tab && (
          <nav className="grid gap-3" aria-label="Elegir apartado">
            <Link to="/citas" search={{ view: "citas" }} className="flex items-center justify-center gap-3 rounded-2xl bg-warning py-8 text-3xl font-black text-warning-foreground shadow-lg active:scale-[0.98]">
              <CalendarDays className="h-10 w-10" aria-hidden /> Citas
            </Link>
            <Link to="/citas" search={{ view: "turnos" }} className="flex items-center justify-center gap-3 rounded-2xl bg-primary py-8 text-3xl font-black text-primary-foreground shadow-lg active:scale-[0.98]">
              <Repeat className="h-10 w-10" aria-hidden /> Turnos
            </Link>
            <Link to="/citas" search={{ view: "tareas" }} className="flex items-center justify-center gap-3 rounded-2xl bg-success py-8 text-3xl font-black text-success-foreground shadow-lg active:scale-[0.98]">
              <ClipboardCheck className="h-10 w-10" aria-hidden /> Tareas
            </Link>
            <Link to="/citas" search={{ view: "personas" }} className="flex items-center justify-center gap-2 rounded-2xl bg-secondary py-4 text-xl font-bold text-secondary-foreground active:scale-[0.98]">
              <Users className="h-6 w-6" aria-hidden /> Personas
            </Link>
          </nav>
        )}

        {tab === "tareas" && <TasksPanel />}

        {tab === "personas" && (
          <section className="space-y-3">
            <div className="rounded-2xl bg-card p-3 shadow">
              <h2 className="mb-2 text-lg font-bold">Añadir cuidadora o familiar</h2>
              <input
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                placeholder="Nombre"
                className="mb-2 w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-base"
              />
              <div className="mb-2 grid grid-cols-3 gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r.v}
                    onClick={() => setPRole(r.v)}
                    className={`rounded-lg py-2 text-sm font-bold active:scale-95 ${pRole === r.v ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c.cls}
                    aria-label={`Color ${c.name}`}
                    onClick={() => setPColor(c.cls)}
                    className={`h-10 w-10 rounded-full ${c.cls} ${pColor === c.cls ? "ring-4 ring-ring" : ""}`}
                  />
                ))}
              </div>
              <button onClick={addPerson} className="flex w-full items-center justify-center gap-2 rounded-xl bg-success py-3 text-lg font-black text-success-foreground active:scale-95">
                <Plus className="h-5 w-5" aria-hidden /> Añadir
              </button>
            </div>

            {people.map((p) => (
              <div key={p.id} className={`flex items-center gap-3 rounded-2xl p-3 text-white shadow ${p.color}`}>
                <div className="flex-1">
                  <p className="text-xl font-black">{p.name}</p>
                  <p className="text-sm opacity-90">
                    {ROLES.find((r) => r.v === p.role)?.label} · {weeklyHours(p.id)} h/semana
                  </p>
                </div>
                <button onClick={() => removePerson(p.id)} aria-label={`Borrar ${p.name}`} className="flex h-11 w-11 items-center justify-center rounded-xl bg-black/25 active:scale-95">
                  <Trash2 className="h-5 w-5" aria-hidden />
                </button>
              </div>
            ))}
            {people.length === 0 && <p className="text-center text-muted-foreground">Aún no hay personas.</p>}
          </section>
        )}

        {(tab === "citas" || tab === "turnos") && (
          <section className="space-y-4">
            <div className="grid gap-2">
              {tab === "citas" ? (
              <button
                onClick={() => openNew("fija")}
                disabled={people.length === 0}
                className="flex items-center justify-center gap-2 rounded-2xl bg-warning py-4 text-lg font-black text-warning-foreground shadow active:scale-95 disabled:opacity-50"
              >
                <CalendarDays className="h-6 w-6" aria-hidden /> Nueva cita
              </button>
              ) : (
              <button
                onClick={() => openNew("periodica")}
                disabled={people.length === 0}
                className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-lg font-black text-primary-foreground shadow active:scale-95 disabled:opacity-50"
              >
                <Repeat className="h-6 w-6" aria-hidden /> Nuevo turno
              </button>
              )}
            </div>
            {people.length === 0 && (
              <p className="text-center text-muted-foreground">Primero añade personas en el apartado «Personas».</p>
            )}
            <p className="text-center text-sm text-muted-foreground">Toca una barra para modificarla.</p>

            <div>
              <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><Repeat className="h-5 w-5" aria-hidden /> {tab === "turnos" ? "Turnos de cada semana" : "Citas que se repiten"}</h2>
              <div className="space-y-2">
                {DAY_INDEX.map((d, i) => {
                  const list = entries.filter((e) => e.days?.includes(d) && (tab === "turnos" ? e.kind === "periodica" : e.kind === "fija"));
                  return (
                    <div key={d} className="rounded-2xl bg-card p-2 shadow">
                      <p className="mb-1 font-bold">{DAY_NAMES[i]}</p>
                      <Timeline list={list} />
                    </div>
                  );
                })}
              </div>
            </div>

            {tab === "citas" && (<div>
              <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><CalendarDays className="h-5 w-5" aria-hidden /> Citas con fecha</h2>
              {fixedByDate.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin citas con fecha.</p>
              ) : (
                <div className="space-y-2">
                  {fixedByDate.map(([date, list]) => (
                    <div key={date} className="rounded-2xl bg-card p-2 shadow">
                      <p className="mb-1 font-bold">{date}</p>
                      <Timeline list={list} />
                      <div className="mt-1 space-y-1">
                        {[...list].sort((a, b) => toMin(a.start) - toMin(b.start)).map((e) => (
                          <button
                            key={e.id}
                            onClick={() => openEdit(e)}
                            className="flex w-full items-center gap-2 rounded-lg bg-secondary px-2 py-2 text-left text-sm font-bold text-secondary-foreground active:scale-[0.98]"
                          >
                            <span className={`h-4 w-4 shrink-0 rounded-full ${personById[e.personId]?.color ?? "bg-primary"}`} />
                            <span className="flex-1 truncate">
                              {e.start}–{e.end} · {e.title} · {personById[e.personId]?.name}
                              {e.companion ? ` · con ${e.companion}` : ""}
                            </span>
                            <Pencil className="h-4 w-4 shrink-0" aria-hidden />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>)}
          </section>
        )}

        {eOpen && (
          <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-2" role="dialog" aria-label="Cita">
            <div className="max-h-[90dvh] w-full overflow-y-auto rounded-2xl bg-card p-3 shadow-xl">
              <h2 className="mb-2 text-xl font-black">
                {eEditId ? (eKind === "fija" ? "Modificar cita" : "Modificar turno") : eKind === "fija" ? "Nueva cita" : "Nuevo turno"}
              </h2>

              <div className="mb-2 grid grid-cols-2 gap-2">
                <button onClick={() => setEKind("fija")} className={`rounded-xl py-3 font-bold active:scale-95 ${eKind === "fija" ? "bg-warning text-warning-foreground" : "bg-secondary text-secondary-foreground"}`}>Cita puntual</button>
                <button onClick={() => setEKind("periodica")} className={`rounded-xl py-3 font-bold active:scale-95 ${eKind === "periodica" ? "bg-success text-success-foreground" : "bg-secondary text-secondary-foreground"}`}>Turno</button>
              </div>

              <label className="text-sm font-bold">{eKind === "fija" ? "¿Con quién es la cita?" : "Persona del turno"}</label>
              <select value={ePerson} onChange={(e) => setEPerson(e.target.value)} className="mb-2 w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-base">
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              <label className="text-sm font-bold">Descripción</label>
              <input value={eTitle} onChange={(e) => setETitle(e.target.value)} placeholder={eKind === "fija" ? "Cardiólogo, peluquería…" : "Turno de mañana…"} className="mb-2 w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-base" />

              {eKind === "fija" && (
                <div className="mb-2">
                  <label className="flex items-center gap-1 text-sm font-bold"><UserPlus className="h-4 w-4" aria-hidden /> Acompañante (opcional)</label>
                  <input
                    value={eCompanion}
                    onChange={(e) => setECompanion(e.target.value)}
                    placeholder="Quién te acompaña"
                    className="w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-base"
                    list="acompanantes"
                  />
                  <datalist id="acompanantes">
                    {people.map((p) => <option key={p.id} value={p.name} />)}
                  </datalist>
                </div>
              )}

              {eKind === "fija" && (
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setERepeat("once"); if (!eDate) setEDate(todayISO()); }}
                    aria-pressed={eRepeat === "once"}
                    className={`rounded-xl py-3 font-bold active:scale-95 ${eRepeat === "once" ? "bg-warning text-warning-foreground" : "bg-secondary text-secondary-foreground"}`}
                  >
                    Un día
                  </button>
                  <button
                    onClick={() => { setERepeat("weekly"); if (eDays.length === 0) setEDays([2, 5]); }}
                    aria-pressed={eRepeat === "weekly"}
                    className={`flex items-center justify-center gap-1 rounded-xl py-3 font-bold active:scale-95 ${eRepeat === "weekly" ? "bg-warning text-warning-foreground" : "bg-secondary text-secondary-foreground"}`}
                  >
                    <Repeat className="h-4 w-4" aria-hidden /> Se repite
                  </button>
                </div>
              )}

              {eKind === "periodica" || eRepeat === "weekly" ? (
                <div className="mb-2">
                  <p className="text-sm font-bold">Días de la semana</p>
                  <div className="flex gap-1">
                    {DAY_INDEX.map((d, i) => (
                      <button
                        key={d}
                        onClick={() => toggleDay(d)}
                        aria-pressed={eDays.includes(d)}
                        className={`h-11 flex-1 rounded-lg font-black active:scale-95 ${eDays.includes(d) ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                      >
                        {DAYS[i]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mb-2">
                  <label className="text-sm font-bold">Fecha</label>
                  <input type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} className="w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-base" />
                </div>
              )}

              <div className="mb-1 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-bold">Desde</label>
                  <input type="time" value={eStart} onChange={(e) => setEStart(e.target.value)} className="w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-base" />
                </div>
                <div>
                  <label className="text-sm font-bold">Hasta</label>
                  <input type="time" value={eEnd} onChange={(e) => setEEnd(e.target.value)} className="w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-base" />
                </div>
              </div>

              {eKind === "periodica" && (
                <div className="mb-2 grid grid-cols-3 gap-2">
                  <button onClick={() => { setEStart("00:00"); setEEnd("23:59"); }} className="rounded-lg bg-secondary py-2 text-sm font-bold text-secondary-foreground active:scale-95">Todo el día</button>
                  <button onClick={() => { setEStart("08:00"); setEEnd("15:00"); }} className="rounded-lg bg-secondary py-2 text-sm font-bold text-secondary-foreground active:scale-95">Mañana</button>
                  <button onClick={() => { setEStart("15:00"); setEEnd("22:00"); }} className="rounded-lg bg-secondary py-2 text-sm font-bold text-secondary-foreground active:scale-95">Tarde</button>
                </div>
              )}

              <label className="flex items-center gap-1 text-sm font-bold"><Bell className="h-4 w-4" aria-hidden /> Avisarme antes</label>
              <select value={eRemind} onChange={(e) => setERemind(Number(e.target.value))} className="mb-2 w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-base">
                <option value={0}>Sin aviso</option>
                <option value={5}>5 minutos antes</option>
                <option value={15}>15 minutos antes</option>
                <option value={30}>30 minutos antes</option>
                <option value={60}>1 hora antes</option>
              </select>

              <p className="mb-3 text-sm text-muted-foreground">
                {hoursBetween(eStart, eEnd)} horas al día
                {eKind === "periodica" ? ` · ${Math.round(hoursBetween(eStart, eEnd) * eDays.length * 10) / 10} h a la semana` : ""}
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={closeForm} className="rounded-xl bg-secondary py-3 text-lg font-bold text-secondary-foreground active:scale-95">Cancelar</button>
                <button onClick={saveEntry} className="rounded-xl bg-primary py-3 text-lg font-black text-primary-foreground active:scale-95">Guardar</button>
              </div>
              {eEditId && (
                <button
                  onClick={() => removeEntry(eEditId)}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-destructive py-3 text-lg font-bold text-destructive-foreground active:scale-95"
                >
                  <Trash2 className="h-5 w-5" aria-hidden /> Borrar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
