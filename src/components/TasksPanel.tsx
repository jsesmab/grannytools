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
  const todays = tasks.filter((t) => taskIsOn(t)).sort((a, b) => a.time.localeCompare(b.time));
  const others = tasks.filter((t) => !taskIsOn(t));

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

      <div>
        <h2 className="mb-2 text-lg font-bold">Hoy</h2>
        {todays.length === 0 && <p className="text-sm text-muted-foreground">No hay tareas para hoy.</p>}
        <div className="space-y-2">
          {todays.map((t) => {
            const s = status[`${t.id}:${today}`];
            return (
              <div key={t.id} className="rounded-2xl bg-card p-3 shadow">
                <button onClick={() => openForm(t)} className="mb-2 block w-full text-left">
                  <span className="text-xl font-black">{t.time} · {t.title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {s === "hecha" ? "Realizada" : s === "no" ? "No realizada" : "Pendiente"}
                  </span>
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => mark(t.id, "hecha")} aria-pressed={s === "hecha"} className={`flex items-center justify-center gap-1 rounded-xl py-3 font-black active:scale-95 ${s === "hecha" ? "bg-success text-success-foreground" : "bg-secondary text-secondary-foreground"}`}>
                    <CheckCircle2 className="h-5 w-5" aria-hidden /> Hecha
                  </button>
                  <button onClick={() => mark(t.id, "no")} aria-pressed={s === "no"} className={`flex items-center justify-center gap-1 rounded-xl py-3 font-black active:scale-95 ${s === "no" ? "bg-destructive text-destructive-foreground" : "bg-secondary text-secondary-foreground"}`}>
                    <XCircle className="h-5 w-5" aria-hidden /> No hecha
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {others.length > 0 && (
        <div>
          <h2 className="mb-2 text-lg font-bold">Otros días</h2>
          <div className="space-y-2">
            {others.map((t) => (
              <button key={t.id} onClick={() => openForm(t)} className="flex w-full items-center gap-2 rounded-xl bg-secondary px-3 py-3 text-left font-bold text-secondary-foreground active:scale-[0.98]">
                {t.date ? <CalendarDays className="h-5 w-5" aria-hidden /> : <Repeat className="h-5 w-5" aria-hidden />}
                <span className="flex-1">{t.title}<span className="block text-sm font-normal">{describe(t)}</span></span>
              </button>
            ))}
          </div>
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
