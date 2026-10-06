import { useEffect, useState } from "react";
import { Plus, Trash2, CheckCircle2, XCircle, Repeat, CalendarDays } from "lucide-react";
import { isoDay, loadStatus, loadTasks, saveTasks, setTaskStatus, taskIsOn, type Task, type TaskStatus } from "@/lib/tasks";

const DAYS = ["L", "M", "X", "J", "V", "S", "D"];
const DAY_INDEX = [1, 2, 3, 4, 5, 6, 0];
const uid = () => Math.random().toString(36).slice(2, 10);
const input = "w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-base";

export function TasksPanel({ locked = false }: { locked?: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState<Record<string, TaskStatus>>({});
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<"hoy" | "semana">("hoy");
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("10:00");
  const [repeat, setRepeat] = useState(false);
  const [date, setDate] = useState(isoDay());
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);

  useEffect(() => {
    const refresh = () => { setTasks(loadTasks()); setStatus(loadStatus()); };
    refresh();
    window.addEventListener("grannytools-tasks", refresh);
    return () => window.removeEventListener("grannytools-tasks", refresh);
  }, []);

  const today = isoDay();
  const byTime = (a: Task, b: Task) => a.time.localeCompare(b.time);
  const todays = tasks.filter((t) => taskIsOn(t)).sort(byTime);
  const [openDays, setOpenDays] = useState<string[]>([]);
  const NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const weekDays = NAMES.map((name, i) => {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    const iso = isoDay(dt);
    return { name, dt, iso, isToday: iso === today, list: tasks.filter((t) => taskIsOn(t, dt)).sort(byTime) };
  });
  const card = (t: Task, canMark: boolean) => {
    const s = canMark ? status[`${t.id}:${today}`] : undefined;
    return (
      <div key={t.id} className="rounded-2xl border-2 border-border bg-card p-3 shadow">
        <button onClick={() => openForm(t)} data-flat-button className="mb-2 block w-full text-left">
          <span className="block text-2xl font-black">{t.time}</span>
          <span className="block text-xl font-bold">{t.title}</span>
          <span className="block text-sm text-muted-foreground">
            {t.date ? "Un día" : "Se repite"}{canMark ? ` · ${s === "hecha" ? "Realizada" : s === "no" ? "No realizada" : "Pendiente"}` : ""}
          </span>
        </button>
        {canMark && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => mark(t.id, "hecha")} aria-pressed={s === "hecha"} className={`flex items-center justify-center gap-1 rounded-xl py-4 text-lg font-black active:scale-95 ${s === "hecha" ? "bg-success text-success-foreground" : "bg-secondary text-secondary-foreground"}`}>
              <CheckCircle2 className="h-6 w-6" aria-hidden /> Hecha
            </button>
            <button onClick={() => mark(t.id, "no")} aria-pressed={s === "no"} className={`flex items-center justify-center gap-1 rounded-xl py-4 text-lg font-black active:scale-95 ${s === "no" ? "bg-destructive text-destructive-foreground" : "bg-secondary text-secondary-foreground"}`}>
              <XCircle className="h-6 w-6" aria-hidden /> No hecha
            </button>
          </div>
        )}
      </div>
    );
  };

  const openForm = (t?: Task) => {
    setEditId(t?.id ?? null);
    setTitle(t?.title ?? "");
    setTime(t?.time ?? "10:00");
    setRepeat(t ? !t.date : false);
    setDate(t?.date ?? today);
    setDays(t?.days ?? [1, 2, 3, 4, 5]);
    setOpen(true);
  };
  const persist = (next: Task[]) => { setTasks(next); saveTasks(next); };
  const save = () => {
    if (!title.trim() || (repeat && days.length === 0) || (!repeat && !date)) return;
    const t: Task = { id: editId ?? uid(), title: title.trim(), time, ...(repeat ? { days } : { date }) };
    persist(editId ? tasks.map((x) => (x.id === editId ? t : x)) : [...tasks, t]);
    setOpen(false);
  };
  const remove = (id: string) => { persist(tasks.filter((t) => t.id !== id)); setOpen(false); };
  const mark = (id: string, s: TaskStatus) => { setTaskStatus(id, today, s); setStatus(loadStatus()); };
  const describe = (t: Task) =>
    t.date ? `${t.date} · ${t.time}` : `${DAY_INDEX.filter((d) => t.days?.includes(d)).map((d) => DAYS[DAY_INDEX.indexOf(d)]).join(" ")} · ${t.time}`;

  return (
    <section className="space-y-4">
      {!locked && <button onClick={() => openForm()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-success py-4 text-lg font-black text-success-foreground shadow active:scale-95">
        <Plus className="h-6 w-6" aria-hidden /> Nueva tarea
      </button>}

      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Qué días ver">
        {(["hoy", "semana"] as const).map((r) => (
          <button key={r} onClick={() => setRange(r)} aria-pressed={range === r}
            className={`rounded-xl py-3 text-lg font-black ${range === r ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
            {r === "hoy" ? "Solo hoy" : "Semana completa"}
          </button>
        ))}
      </div>

      {range === "hoy" ? (
        <div>
          <h2 className="mb-2 text-xl font-black">Hoy</h2>
          {todays.length === 0 && <p className="rounded-2xl bg-card p-5 text-center text-lg font-bold text-muted-foreground shadow">Hoy no hay tareas.</p>}
          <div className="space-y-2">{todays.map((t) => card(t, true))}</div>
        </div>
      ) : (
        <div className="space-y-2">
          {weekDays.map((w) => {
            const isOpen = openDays.includes(w.iso);
            return (
              <div key={w.iso} className="rounded-2xl bg-card shadow">
                <button onClick={() => setOpenDays((p) => (p.includes(w.iso) ? p.filter((x) => x !== w.iso) : [...p, w.iso]))} aria-expanded={isOpen}
                  className={`flex w-full items-center justify-between rounded-2xl px-4 py-4 text-left text-lg font-black ${w.isToday ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                  <span>{w.name} {w.dt.getDate()}{w.isToday ? " (Hoy)" : ""}</span>
                  <span className="text-base font-bold">{w.list.length === 0 ? "Sin actividad" : `${w.list.length} ${w.list.length === 1 ? "tarea" : "tareas"}`} {isOpen ? "▲" : "▼"}</span>
                </button>
                {isOpen && (
                  <div className="space-y-2 p-2">
                    {w.list.length === 0 ? <p className="p-2 text-center text-muted-foreground">Nada este día.</p> : w.list.map((t) => card(t, w.isToday))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-foreground/50 p-2" role="dialog" aria-label="Tarea">
          <div className="max-h-[90dvh] w-full overflow-y-auto rounded-2xl bg-card p-3 shadow-xl">
            <h2 className="mb-2 text-xl font-black">{locked ? "Datos de la tarea" : editId ? "Modificar tarea" : "Nueva tarea"}</h2>
            <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0">
            <label className="text-sm font-bold">¿Qué hay que hacer?</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Regar las plantas, caminar…" className={`mb-2 ${input}`} />
            <div className="mb-2 grid grid-cols-2 gap-2">
              <button onClick={() => setRepeat(false)} className={`rounded-xl py-3 font-bold active:scale-95 ${!repeat ? "bg-success text-success-foreground" : "bg-secondary text-secondary-foreground"}`}>Un día</button>
              <button onClick={() => setRepeat(true)} className={`flex items-center justify-center gap-1 rounded-xl py-3 font-bold active:scale-95 ${repeat ? "bg-success text-success-foreground" : "bg-secondary text-secondary-foreground"}`}><Repeat className="h-4 w-4" aria-hidden /> Se repite</button>
            </div>
            {repeat ? (
              <div className="mb-2 flex gap-1">
                {DAY_INDEX.map((d, i) => (
                  <button key={d} onClick={() => setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]))} aria-pressed={days.includes(d)} className={`h-11 flex-1 rounded-lg font-black active:scale-95 ${days.includes(d) ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{DAYS[i]}</button>
                ))}
              </div>
            ) : (
              <>
                <label className="text-sm font-bold">Fecha</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`mb-2 ${input}`} />
              </>
            )}
            <label className="text-sm font-bold">Hora del aviso</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`mb-3 ${input}`} />
            </fieldset>
            {locked ? (
              <button onClick={() => setOpen(false)} className="w-full rounded-xl bg-primary py-3 text-lg font-black text-primary-foreground active:scale-95">Cerrar</button>
            ) : (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setOpen(false)} className="rounded-xl bg-secondary py-3 text-lg font-bold text-secondary-foreground active:scale-95">Cancelar</button>
              <button onClick={save} className="rounded-xl bg-primary py-3 text-lg font-black text-primary-foreground active:scale-95">Guardar</button>
            </div>
            )}
            {editId && !locked && (
              <button onClick={() => remove(editId)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-destructive py-3 text-lg font-bold text-destructive-foreground active:scale-95">
                <Trash2 className="h-5 w-5" aria-hidden /> Borrar
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
