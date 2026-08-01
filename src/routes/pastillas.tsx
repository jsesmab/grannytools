import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Pill, Plus, Trash2, Bell, BellOff, Check, AlertTriangle } from "lucide-react";

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

type Med = { name: string; times: string[]; takenAt?: string };
const KEY = "grannytools.meds";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
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

function Pastillas() {
  const [meds, setMeds] = useState<Med[]>([]);
  const [name, setName] = useState("");
  const [times, setTimes] = useState<string[]>(["09:00"]);
  const [adding, setAdding] = useState(false);
  const [notifOn, setNotifOn] = useState(false);
  const [due, setDue] = useState<{ med: string; time: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const firedRef = useRef<Set<string>>(new Set());

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

  const askNotif = async () => {
    if (typeof Notification === "undefined") { setError("Este navegador no permite avisos."); return; }
    const p = await Notification.requestPermission();
    setNotifOn(p === "granted");
    if (p !== "granted") setError("No se han permitido los avisos.");
  };

  const addMed = () => {
    const n = name.trim();
    const ts = times.filter(Boolean);
    if (!n || ts.length === 0) { setError("Escribe el nombre y al menos una hora."); return; }
    save([...meds, { name: n, times: ts }]);
    setName(""); setTimes(["09:00"]); setAdding(false); setError(null);
  };

  const markTaken = (i: number) => {
    const next = meds.slice();
    next[i] = { ...next[i], takenAt: new Date().toISOString() };
    save(next);
    setDue(null);
  };

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-3 py-3">
        <header className="mb-3 flex items-center gap-2">
          <a href="/" aria-label="Inicio" className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground active:scale-[0.95]">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </a>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning text-warning-foreground">
            <Pill className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="text-xl font-bold">Pastillas</h1>
          <button
            onClick={askNotif}
            aria-label="Permitir avisos"
            className={[
              "ml-auto flex h-10 w-10 items-center justify-center rounded-xl active:scale-[0.95]",
              notifOn ? "bg-success text-success-foreground" : "bg-secondary text-secondary-foreground",
            ].join(" ")}
          >
            {notifOn ? <Bell className="h-5 w-5" aria-hidden /> : <BellOff className="h-5 w-5" aria-hidden />}
          </button>
        </header>

        {due && (
          <div className="mb-3 rounded-2xl bg-warning p-4 text-warning-foreground shadow-lg">
            <p className="text-lg font-black">¡Toca tomar {due.med}!</p>
            <p className="text-sm">Hora: {due.time}</p>
            <button onClick={() => setDue(null)} className="mt-2 w-full rounded-xl bg-black/15 px-3 py-3 text-base font-bold active:scale-[0.97]">
              Entendido
            </button>
          </div>
        )}

        {meds.length === 0 && !adding && (
          <p className="mb-3 rounded-xl bg-card p-3 text-sm text-muted-foreground shadow-sm">
            Todavía no hay medicinas. Pulsa <b>Añadir medicina</b>.
          </p>
        )}

        <div className="mb-3 space-y-2">
          {meds.map((m, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-warning text-warning-foreground">
                <Pill className="h-6 w-6" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-black">{m.name}</div>
                <div className="text-sm text-muted-foreground">{m.times.join("  ·  ")}</div>
              </div>
              <button
                onClick={() => markTaken(i)}
                aria-label={`Marcar ${m.name} como tomada`}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-success text-success-foreground active:scale-[0.95]"
              >
                <Check className="h-5 w-5" aria-hidden />
              </button>
              <button
                onClick={() => save(meds.filter((_, idx) => idx !== i))}
                aria-label={`Borrar ${m.name}`}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-destructive text-destructive-foreground active:scale-[0.95]"
              >
                <Trash2 className="h-5 w-5" aria-hidden />
              </button>
            </div>
          ))}
        </div>

        {adding ? (
          <div className="space-y-2 rounded-2xl border-2 border-dashed border-border p-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la medicina"
              className="w-full rounded-lg border-2 border-border bg-background px-3 py-3 text-base"
            />
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
          El aviso suena mientras la aplicación está abierta en el móvil.
        </p>
      </div>
    </main>
  );
}
