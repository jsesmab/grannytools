import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Pill, Plus, Trash2, Bell, BellOff, Check, AlertTriangle, CalendarPlus } from "lucide-react";

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

// Primera ocurrencia teniendo en cuenta la fecha de inicio del tratamiento.
function firstOccurrence(time: string, from?: string) {
  const [hh, mm] = time.split(":");
  const now = new Date();
  let start: Date;
  if (from) {
    const [y, mo, d] = from.split("-").map(Number);
    start = new Date(y, mo - 1, d, Number(hh), Number(mm), 0, 0);
  } else {
    start = new Date();
    start.setHours(Number(hh), Number(mm), 0, 0);
  }
  if (start.getTime() < now.getTime()) {
    // si la fecha de inicio ya pasó, empezamos hoy/mañana
    const t = new Date();
    t.setHours(Number(hh), Number(mm), 0, 0);
    if (t.getTime() < now.getTime()) t.setDate(t.getDate() + 1);
    start = t;
  }
  return start;
}

function untilStamp(until: string) {
  const [y, mo, d] = until.split("-").map(Number);
  const end = new Date(y, mo - 1, d, 23, 59, 59);
  return `${end.getUTCFullYear()}${pad(end.getUTCMonth() + 1)}${pad(end.getUTCDate())}T${pad(end.getUTCHours())}${pad(end.getUTCMinutes())}${pad(end.getUTCSeconds())}Z`;
}

function rrule(until?: string) {
  return until ? `FREQ=DAILY;UNTIL=${untilStamp(until)}` : "FREQ=DAILY";
}

function icsForMeds(meds: Med[]) {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Grannytools//Pastillas//ES",
    "CALSCALE:GREGORIAN",
  ];
  meds.forEach((m, mi) => {
    m.times.forEach((t, ti) => {
      const start = firstOccurrence(t, m.from);
      const dt = `${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}T${pad(start.getHours())}${pad(start.getMinutes())}00`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:grannytools-${mi}-${ti}-${start.getTime()}@grannytools`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${dt}`,
        "DURATION:PT10M",
        `RRULE:${rrule(m.until)}`,
        `SUMMARY:Tomar ${m.name}`,
        `DESCRIPTION:Recordatorio de Grannytools para tomar ${m.name} a las ${t}`,
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:Tomar ${m.name}`,
        "TRIGGER:PT0M",
        "END:VALARM",
        "END:VEVENT",
      );
    });
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function downloadIcs(meds: Med[], filename: string) {
  const blob = new Blob([icsForMeds(meds)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function utcStamp(d: Date) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
}

// Enlace de Google Calendar: se abre ya relleno y solo hay que pulsar "Guardar".
function googleCalUrl(medName: string, time: string, from?: string, until?: string) {
  const start = firstOccurrence(time, from);
  const end = new Date(start.getTime() + 10 * 60 * 1000);
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `Tomar ${medName}`,
    details: `Recordatorio de Grannytools para tomar ${medName} a las ${time}`,
    dates: `${utcStamp(start)}/${utcStamp(end)}`,
    recur: `RRULE:${rrule(until)}`,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

type Pending = { med: string; time: string; from?: string; until?: string };

function pendingFor(meds: Med[]): Pending[] {
  return meds.flatMap((m) => m.times.map((t) => ({ med: m.name, time: t, from: m.from, until: m.until })));
}

function Pastillas() {
  const [meds, setMeds] = useState<Med[]>([]);
  const [name, setName] = useState("");
  const [times, setTimes] = useState<string[]>(["09:00"]);
  const [adding, setAdding] = useState(false);
  const [chronic, setChronic] = useState(true);
  const [from, setFrom] = useState(localDayKey(new Date()));
  const [until, setUntil] = useState("");
  const [notifOn, setNotifOn] = useState(false);
  const [due, setDue] = useState<{ med: string; time: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<Pending[]>([]);
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

  const askNotif = async () => {
    if (typeof Notification === "undefined") { setError("Este navegador no permite avisos."); return; }
    const p = await Notification.requestPermission();
    setNotifOn(p === "granted");
    if (p !== "granted") setError("No se han permitido los avisos.");
  };

  const openGoogle = (p: Pending) => {
    window.open(googleCalUrl(p.med, p.time, p.from, p.until), "_blank", "noopener");
  };

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
    // Abre Google Calendar ya relleno con el primer aviso (gesto del usuario).
    const list: Pending[] = ts.map((t) => ({ med: n, time: t, from: med.from, until: med.until }));
    openGoogle(list[0]);
    setQueue(list.slice(1));
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
          <Link to="/" aria-label="Inicio" className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground active:scale-[0.95]">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>
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

        {activeMeds.length === 0 && !adding && (
          <p className="mb-3 rounded-xl bg-card p-3 text-sm text-muted-foreground shadow-sm">
            No hay medicinas en curso. Pulsa <b>Añadir medicina</b>.
          </p>
        )}

        <div className="mb-3 space-y-2">
          {meds.map((m, i) => (isFinished(m) ? null : (
            <div key={i} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-warning text-warning-foreground">
                <Pill className="h-6 w-6" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-black">{m.name}</div>
                <div className="text-sm text-muted-foreground">{m.times.join("  ·  ")}</div>
                <div className="text-xs font-bold text-muted-foreground">
                  {m.until
                    ? `Tratamiento: ${esDate(m.from ?? todayKey())} → ${esDate(m.until)}`
                    : "Todos los días (crónico)"}
                </div>
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
          )))}
        </div>

        {finishedMeds.length > 0 && (
          <div className="mb-3">
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="w-full rounded-xl bg-secondary px-3 py-3 text-base font-bold text-secondary-foreground active:scale-[0.97]"
            >
              {showHistory ? "Ocultar histórico" : `Ver histórico (${finishedMeds.length})`}
            </button>
            {showHistory && (
              <div className="mt-2 space-y-2">
                {meds.map((m, i) => (isFinished(m) ? (
                  <div key={i} className="flex items-center gap-3 rounded-2xl bg-card p-3 opacity-70 shadow-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-bold line-through">{m.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Terminado: {esDate(m.from ?? todayKey())} → {esDate(m.until!)}
                      </div>
                    </div>
                    <button
                      onClick={() => save(meds.filter((_, idx) => idx !== i))}
                      aria-label={`Borrar del histórico ${m.name}`}
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground active:scale-[0.95]"
                    >
                      <Trash2 className="h-5 w-5" aria-hidden />
                    </button>
                  </div>
                ) : null))}
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

        {queue.length > 0 && (
          <div className="mt-3 rounded-2xl bg-card p-3 shadow-sm">
            <p className="mb-2 text-sm">
              Falta{queue.length > 1 ? "n" : ""} <b>{queue.length}</b> aviso{queue.length > 1 ? "s" : ""} por añadir al calendario.
            </p>
            <button
              onClick={() => { openGoogle(queue[0]); setQueue(queue.slice(1)); }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-3 py-4 text-base font-black text-primary-foreground active:scale-[0.98]"
            >
              <CalendarPlus className="h-6 w-6" aria-hidden />
              Añadir el de las {queue[0].time}
            </button>
          </div>
        )}

        {activeMeds.length > 0 && (
          <div className="mt-3 space-y-2">
            <button
              onClick={() => {
                const list = pendingFor(activeMeds);
                if (list.length === 0) return;
                openGoogle(list[0]);
                setQueue(list.slice(1));
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-3 py-4 text-base font-black text-primary-foreground shadow-sm active:scale-[0.98]"
            >
              <CalendarPlus className="h-6 w-6" aria-hidden />
              Poner avisos en Google Calendar
            </button>
            <button
              onClick={() => downloadIcs(activeMeds, "pastillas-grannytools.ics")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary px-3 py-3 text-sm font-bold text-secondary-foreground shadow-sm active:scale-[0.98]"
            >
              <CalendarPlus className="h-5 w-5" aria-hidden />
              Si no usas Google: archivo para el calendario
            </button>
          </div>
        )}

        <p className="mt-3 rounded-xl bg-card p-3 text-xs text-muted-foreground shadow-sm">
          «Siempre» pone el aviso todos los días sin fin. «Unos días» solo avisa entre las fechas de inicio y fin del tratamiento. Al guardar se abre el calendario de Google con el aviso ya escrito: solo hay que pulsar «Guardar».
        </p>
      </div>
    </main>
  );
}
