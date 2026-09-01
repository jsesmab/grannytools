import { useEffect } from "react";

export type ReminderPerson = { id: string; name: string; color: string };
export type ReminderEntry = {
  id: string;
  personId: string;
  title: string;
  kind: "fija" | "periodica";
  date?: string;
  days?: number[];
  start: string;
  end: string;
  remindMin?: number;
};

export const PEOPLE_KEY = "grannytools.citas.people";
export const ENTRIES_KEY = "grannytools.citas.entries";
const FIRED_KEY = "grannytools.citas.avisados";
export const DEFAULT_REMIND_MIN = 15;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* ignore */
  }
}

function announce(text: string) {
  beep();
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Grannytools", { body: text, icon: "/icon-192.png" });
    }
  } catch {
    /* ignore */
  }
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-ES";
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
  try {
    navigator.vibrate?.([300, 150, 300]);
  } catch {
    /* ignore */
  }
}

export function askReminderPermission() {
  try {
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
  } catch {
    /* ignore */
  }
}

function check() {
  const now = new Date();
  const iso = isoDay(now);
  const dow = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const people = read<ReminderPerson[]>(PEOPLE_KEY, []);
  const entries = read<ReminderEntry[]>(ENTRIES_KEY, []);
  const fired = read<{ day: string; ids: string[] }>(FIRED_KEY, { day: iso, ids: [] });
  if (fired.day !== iso) {
    fired.day = iso;
    fired.ids = [];
  }

  let changed = false;
  for (const e of entries) {
    const today = e.kind === "fija" ? e.date === iso : (e.days ?? []).includes(dow);
    if (!today) continue;
    const lead = e.remindMin ?? DEFAULT_REMIND_MIN;
    if (lead <= 0) continue;
    const target = toMin(e.start) - lead;
    if (nowMin < target || nowMin > target + 2) continue;
    if (fired.ids.includes(e.id)) continue;
    const who = people.find((p) => p.id === e.personId)?.name;
    announce(
      `Aviso: ${e.title || "cita"}${who ? ` con ${who}` : ""} en ${lead} minutos, a las ${e.start.replace(":", " y ")}.`,
    );
    fired.ids.push(e.id);
    changed = true;
  }

  if (changed || fired.day === iso) {
    try {
      localStorage.setItem(FIRED_KEY, JSON.stringify(fired));
    } catch {
      /* ignore */
    }
  }
}

export function AppReminders() {
  useEffect(() => {
    check();
    const id = window.setInterval(check, 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
