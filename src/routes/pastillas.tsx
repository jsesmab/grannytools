import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Pill, Plus, Trash2, Check, AlertTriangle } from "lucide-react";
import { useCareLocked } from "@/lib/care-lock";

export const Route = createFileRoute("/pastillas")({
  head: () => ({
    meta: [
      { title: "Grannytools — Recordatorio de pastillas" },
      { name: "description", content: "Da de alta tus medicinas en dos pasos y recibe un aviso con sonido a la hora de tomarlas." },
      { property: "og:title", content: "Grannytools — Pastillas" },
      { property: "og:description", content: "Avisos sencillos para no olvidar tus medicinas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pastillas,
});

// from/until en formato YYYY-MM-DD. Sin "until" = tratamiento crónico (todo el calendario).
type Med = { name: string; times: string[]; takenAt?: string; from?: string; until?: string };
const KEY = "grannytools.meds";
const TAKEN_KEY = "grannytools.meds.tomadas";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function localDayKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isActiveToday(m: Med) {
  const today = localDayKey(new Date());
  if (m.from && today < m.from) return false;
  if (m.until && today > m.until) return false;
  return true;
}

// Tratamiento terminado: se guarda en el histórico pero deja de avisar.
function isFinished(m: Med) {
  return Boolean(m.until && localDayKey(new Date()) > m.until);
}


function esDate(iso: string) {
  const [y, mo, d] = iso.split("-");
  return `${d}/${mo}/${y}`;
}

function beep() {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = 880;
    g.gain.value = 0.35;
    osc.connect(g).connect(ctx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, 1200);
  } catch { /* ignore */ }
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function Pastillas() {
  const [meds, setMeds] = useState<Med[]>([]);
  const [name, setName] = useState("");
  const [times, setTimes] = useState<string[]>(["09:00"]);
  const [adding, setAdding] = useState(false);
  const { locked } = useCareLocked();
  const [chronic, setChronic] = useState(true);
  const [from, setFrom] = useState(localDayKey(new Date()));
  const [until, setUntil] = useState("");
  const [notifOn, setNotifOn] = useState(false);
  const [due, setDue] = useState<{ med: string; time: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firedRef = useRef<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);
  const activeMeds = meds.filter((m) => !isFinished(m));
  const finishedMeds = meds.filter(isFinished);


  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setMeds(JSON.parse(raw));
    } catch { /* ignore */ }
    if (typeof Notification !== "undefined" && Notification.permission === "granted") setNotifOn(true);
  }, []);

  const save = (next: Med[]) => {
    setMeds(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  // Check every 20s whether a dose is due
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      for (const m of meds) {
        if (!isActiveToday(m)) continue;
        for (const t of m.times) {
          const id = `${todayKey()}|${m.name}|${t}`;
          if (t === hhmm && !firedRef.current.has(id)) {
            firedRef.current.add(id);
            setDue({ med: m.name, time: t });
            beep();
            try { navigator.vibrate?.([400, 200, 400]); } catch { /* ignore */ }
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification("Hora de tu medicina", { body: `${m.name} — ${t}` });
            }
          }
        }
      }
    };
    check();
    const id = setInterval(check, 20000);
    return () => clearInterval(id);
  }, [meds]);


  const addMed = () => {
    const n = name.trim();
    const ts = times.filter(Boolean);
    if (!n || ts.length === 0) { setError("Escribe el nombre y al menos una hora."); return; }
    if (!chronic && (!from || !until)) { setError("Pon la fecha de inicio y la de fin del tratamiento."); return; }
    if (!chronic && until < from) { setError("La fecha de fin debe ser posterior a la de inicio."); return; }
    const med: Med = chronic ? { name: n, times: ts } : { name: n, times: ts, from, until };
    save([...meds, med]);
    setName(""); setTimes(["09:00"]); setAdding(false); setError(null);
    setChronic(true); setFrom(localDayKey(new Date())); setUntil("");
  };

  const [taken, setTaken] = useState<Record<string, string>>({});
  useEffect(() => {
    try { setTaken(JSON.parse(localStorage.getItem(TAKEN_KEY) || "{}")); } catch { /* ignore */ }
  }, []);
  const doseKey = (med: string, time: string) => `${localDayKey(new Date())}|${med}|${time}`;
  const toggleDose = (med: string, time: string, force?: boolean) => {
    const k = doseKey(med, time);
    const next = { ...taken };
    const on = force ?? !next[k];
    if (on) next[k] = new Date().toISOString(); else delete next[k];
    setTaken(next);
    try { localStorage.setItem(TAKEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-3 py-3">
        <header className="mb-3 flex items-center gap-2">
          <Link to="/" aria-label="Inicio" className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground active:scale-[0.95]">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning text-warning-foreground">
            <Pill className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="text-xl font-bold">Pastillas</h1>
        </header>

        {due && (
          <div className="mb-3 rounded-2xl bg-warning p-4 text-warning-foreground shadow-lg">
            <p className="text-lg font-black">¡Toca tomar {due.med}!</p>
            <p className="text-sm">Hora: {due.time}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button onClick={() => { toggleDose(due.med, due.time, true); setDue(null); }} className="flex items-center justify-center gap-2 rounded-xl bg-success px-3 py-4 text-lg font-black text-success-foreground active:scale-[0.97]">
                <Check className="h-6 w-6" aria-hidden /> Tomada
              </button>
              <button onClick={() => setDue(null)} className="rounded-xl bg-secondary px-3 py-4 text-base font-bold text-secondary-foreground active:scale-[0.97]">
                Luego
              </button>
            </div>
          </div>
        )}

        {activeMeds.length === 0 && !adding && (
          <p className="mb-3 rounded-xl bg-card p-3 text-sm text-muted-foreground shadow-sm">
            No hay medicinas en curso. Pulsa <b>Añadir medicina</b>.
          </p>
        )}

        {(() => {
          const slots = new Map<string, Med[]>();
          for (const m of activeMeds) {
            if (!isActiveToday(m)) continue;
            for (const t of m.times) slots.set(t, [...(slots.get(t) ?? []), m]);
          }
          const now = new Date();
          const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
          const hours = [...slots.keys()].sort();
          if (hours.length === 0) return null;
          return (
            <ol className="mb-3 space-y-2" aria-label="Tomas de hoy">
              {hours.map((t) => (
                <li key={t} className={["rounded-2xl bg-card p-3 shadow-sm", t < hhmm ? "" : "border-2 border-warning"].join(" ")}>
                  <div className="mb-2 flex items-baseline gap-2">
                    <span className="text-3xl font-black tabular-nums">{t}</span>
                    <span className="text-sm font-bold text-muted-foreground">{t < hhmm ? "ya pasó" : "próxima"}</span>
                  </div>
                  <div className="space-y-2">
                    {slots.get(t)!.map((m) => {
                      const on = !!taken[doseKey(m.name, t)];
                      return (
                        <button
                          key={m.name}
                          onClick={() => toggleDose(m.name, t)}
                          aria-pressed={on}
                          aria-label={`${m.name} a las ${t}: ${on ? "tomada, toca para desmarcar" : "sin tomar, toca para marcar"}`}
                          className={[
                            "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left",
                            on ? "bg-success text-success-foreground" : "bg-secondary text-secondary-foreground",
                          ].join(" ")}
                        >
                          <Pill className="h-6 w-6 shrink-0" aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-lg font-black">{m.name}</span>
                          <span className="flex items-center gap-1 text-base font-black">
                            {on ? <><Check className="h-5 w-5" aria-hidden /> Tomada</> : "Tomar"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ol>
          );
        })()}

        {finishedMeds.length > 0 && (
          <div className="mb-3">
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="w-full rounded-xl bg-secondary px-3 py-3 text-base font-bold text-secondary-foreground"
            >
              {showHistory ? "Ocultar histórico" : `Ver histórico (${finishedMeds.length})`}
            </button>
            {showHistory && (
              <div className="mt-2 space-y-2">
                {finishedMeds.map((m, i) => (
                  <div key={i} className="rounded-2xl bg-card p-3 opacity-70 shadow-sm">
                    <div className="truncate text-base font-bold line-through">{m.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Terminado: {esDate(m.from ?? todayKey())} → {esDate(m.until!)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}




        {adding ? (
          <div className="space-y-2 rounded-2xl border-2 border-dashed border-border p-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la medicina"
              className="w-full rounded-lg border-2 border-border bg-background px-3 py-3 text-base"
            />

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setChronic(true)}
                className={[
                  "rounded-xl px-2 py-3 text-base font-black active:scale-[0.97]",
                  chronic ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                ].join(" ")}
              >
                Siempre
              </button>
              <button
                onClick={() => setChronic(false)}
                className={[
                  "rounded-xl px-2 py-3 text-base font-black active:scale-[0.97]",
                  !chronic ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                ].join(" ")}
              >
                Unos días
              </button>
            </div>

            {!chronic && (
              <div className="space-y-2 rounded-xl bg-card p-2">
                <label className="block text-sm font-bold">
                  Desde
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="mt-1 w-full rounded-lg border-2 border-border bg-background px-3 py-3 text-lg font-bold"
                  />
                </label>
                <label className="block text-sm font-bold">
                  Hasta
                  <input
                    type="date"
                    value={until}
                    min={from}
                    onChange={(e) => setUntil(e.target.value)}
                    className="mt-1 w-full rounded-lg border-2 border-border bg-background px-3 py-3 text-lg font-bold"
                  />
                </label>
              </div>
            )}

            {times.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="time"
                  value={t}
                  onChange={(e) => {
                    const next = times.slice();
                    next[i] = e.target.value;
                    setTimes(next);
                  }}
                  className="flex-1 rounded-lg border-2 border-border bg-background px-3 py-3 text-lg font-bold"
                />
                {times.length > 1 && (
                  <button
                    onClick={() => setTimes(times.filter((_, idx) => idx !== i))}
                    aria-label="Quitar hora"
                    className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground active:scale-[0.95]"
                  >
                    <Trash2 className="h-5 w-5" aria-hidden />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setTimes([...times, "20:00"])}
              className="w-full rounded-lg bg-secondary px-3 py-2 text-sm font-bold text-secondary-foreground active:scale-[0.97]"
            >
              + Otra hora
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={addMed} className="rounded-xl bg-primary px-3 py-3 text-base font-bold text-primary-foreground active:scale-[0.97]">
                Guardar
              </button>
              <button onClick={() => { setAdding(false); setError(null); }} className="rounded-xl bg-secondary px-3 py-3 text-base font-bold text-secondary-foreground active:scale-[0.97]">
                Cancelar
              </button>
            </div>
          </div>
        ) : locked ? (
          <p className="rounded-2xl border-2 border-warning bg-warning/15 p-3 text-center text-base font-bold">
            🔒 Medicinas protegidas: la familia gestiona los cambios.
          </p>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-3 py-5 text-lg font-black text-primary-foreground shadow-lg active:scale-[0.98] active:shadow-inner"
          >
            <Plus className="h-6 w-6" aria-hidden />
            Añadir medicina
          </button>
        )}

        {error && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border-2 border-destructive/40 bg-destructive/10 p-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <p className="mt-3 rounded-xl bg-card p-3 text-xs text-muted-foreground shadow-sm">
          «Siempre» pone el aviso todos los días sin fin. «Unos días» solo avisa entre las fechas de inicio y fin del tratamiento. La aplicación avisa sola a la hora de cada toma: no hace falta usar ningún calendario.
        </p>
      </div>
    </main>
  );
}
