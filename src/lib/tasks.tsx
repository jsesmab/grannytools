import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, ClipboardCheck } from "lucide-react";

export type Task = {
  id: string;
  title: string;
  time: string; // HH:MM
  date?: string; // puntual (YYYY-MM-DD)
  days?: number[]; // periódica (0..6, 0 = domingo)
};
export type TaskStatus = "hecha" | "no";

export const TASKS_KEY = "grannytools.tareas";
export const TASKS_STATUS_KEY = "grannytools.tareas.estado"; // { "<id>:<fecha>": "hecha" | "no" }
const TASKS_SHOWN_KEY = "grannytools.tareas.avisadas"; // { day, ids }

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}

export function isoDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

export const loadTasks = () => read<Task[]>(TASKS_KEY, []);
export const saveTasks = (t: Task[]) => write(TASKS_KEY, t);
export const loadStatus = () => read<Record<string, TaskStatus>>(TASKS_STATUS_KEY, {});
export function setTaskStatus(id: string, day: string, s: TaskStatus) {
  const all = loadStatus();
  all[`${id}:${day}`] = s;
  write(TASKS_STATUS_KEY, all);
  window.dispatchEvent(new Event("grannytools-tasks"));
}
export function taskIsOn(t: Task, d = new Date()) {
  return t.date ? t.date === isoDay(d) : (t.days ?? []).includes(d.getDay());
}

function announce(text: string) {
  try {
    if ("Notification" in window && Notification.permission === "granted")
      new Notification("Grannytools", { body: text, icon: "/icon-192.png" });
  } catch { /* ignore */ }
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-ES";
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  } catch { /* ignore */ }
  try { navigator.vibrate?.([300, 150, 300]); } catch { /* ignore */ }
}

/** Muestra un aviso a pantalla completa a la hora de cada tarea, con «Hecha» / «No hecha». */
export function TaskAlert() {
  const [current, setCurrent] = useState<Task | null>(null);

  useEffect(() => {
    const check = () => {
      if (current) return;
      const now = new Date();
      const day = isoDay(now);
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const shown = read<{ day: string; ids: string[] }>(TASKS_SHOWN_KEY, { day, ids: [] });
      if (shown.day !== day) { shown.day = day; shown.ids = []; }
      const status = loadStatus();
      const due = loadTasks().find((t) => {
        if (!taskIsOn(t, now) || shown.ids.includes(t.id) || status[`${t.id}:${day}`]) return false;
        const m = toMin(t.time);
        return nowMin >= m && nowMin <= m + 2;
      });
      if (!due) return;
      shown.ids.push(due.id);
      write(TASKS_SHOWN_KEY, shown);
      announce(`Es hora de: ${due.title}.`);
      setCurrent(due);
    };
    check();
    const id = window.setInterval(check, 30_000);
    return () => window.clearInterval(id);
  }, [current]);

  if (!current) return null;
  const answer = (s: TaskStatus) => {
    setTaskStatus(current.id, isoDay(), s);
    setCurrent(null);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/95 p-4" role="alertdialog" aria-label="Aviso de tarea">
      <div className="w-full max-w-md rounded-3xl bg-card p-5 text-center shadow-xl">
        <ClipboardCheck className="mx-auto mb-2 h-16 w-16 text-primary" aria-hidden />
        <p className="text-lg font-bold text-muted-foreground">Tarea de las {current.time}</p>
        <h2 className="mb-5 text-3xl font-black">{current.title}</h2>
        <div className="grid gap-3">
          <button onClick={() => answer("hecha")} className="flex items-center justify-center gap-2 rounded-2xl bg-success py-5 text-2xl font-black text-success-foreground active:scale-95">
            <CheckCircle2 className="h-8 w-8" aria-hidden /> Hecha
          </button>
          <button onClick={() => answer("no")} className="flex items-center justify-center gap-2 rounded-2xl bg-destructive py-4 text-xl font-black text-destructive-foreground active:scale-95">
            <XCircle className="h-7 w-7" aria-hidden /> No hecha
          </button>
        </div>
      </div>
    </div>
  );
}
