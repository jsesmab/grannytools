import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Ear, Search, Users, MapPin, Pill, Camera, CalendarDays, Pencil, Check, Volume2,
  Pause, Play, Square, Settings, ChevronRight, Bell, BellOff, X,
} from "lucide-react";
import { usePrefs } from "@/hooks/use-prefs";
import { askReminderPermission, DEFAULT_REMIND_MIN } from "@/lib/reminders";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Grannytools — Ayudas prácticas para el día a día" },
      {
        name: "description",
        content:
          "Grannytools reúne ayudas sencillas para personas mayores: amplificador de sonido, lupa, contactos con llamada directa, compartir ubicación y recordatorio de pastillas.",
      },
      { property: "og:title", content: "Grannytools — Ayudas prácticas para mayores" },
      { property: "og:description", content: "Oír mejor, ver mejor, llamar, compartir ubicación y recordar las pastillas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

type Tile = {
  to: "/oir" | "/lupa" | "/panico" | "/ubicacion" | "/pastillas" | "/citas" | "/camara";
  label: string;
  Icon: typeof Ear;
  bg: string;
  fg: string;
};

const TILES: Tile[] = [
  { to: "/panico", label: "Contactos", Icon: Users, bg: "bg-destructive", fg: "text-destructive-foreground" },
  { to: "/ubicacion", label: "Ubicación", Icon: MapPin, bg: "bg-primary", fg: "text-primary-foreground" },
  { to: "/citas", label: "Citas", Icon: CalendarDays, bg: "bg-success", fg: "text-success-foreground" },
  { to: "/pastillas", label: "Pastillas", Icon: Pill, bg: "bg-warning", fg: "text-warning-foreground" },
  { to: "/oir", label: "Oír", Icon: Ear, bg: "bg-primary", fg: "text-primary-foreground" },
  { to: "/lupa", label: "Lupa", Icon: Search, bg: "bg-success", fg: "text-success-foreground" },
  { to: "/camara", label: "Cámara", Icon: Camera, bg: "bg-secondary", fg: "text-secondary-foreground" },
];

// Qué ajustes abre cada botón cuando el modo ajustes está activo.
type SheetKey = "vista" | "voz" | "lupa" | "avisos";
const TILE_SHEET: Partial<Record<Tile["to"], SheetKey>> = {
  "/lupa": "lupa",
  "/citas": "avisos",
  "/pastillas": "avisos",
};


const USER_NAME_KEY = "grannytools.username";
const PEOPLE_KEY = "grannytools.citas.people";
const ENTRIES_KEY = "grannytools.citas.entries";
const VOICE_KEY = "grannytools.voz";
const WEATHER_CACHE_KEY = "grannytools.weather.today";
// Se guarda en la sesión: se conserva al navegar y se borra al cerrar la aplicación.
const GREETED_KEY = "grannytools.greeted";
const hasAppGreeted = () => {
  try { return sessionStorage.getItem(GREETED_KEY) === "1"; } catch { return false; }
};
const setAppGreeted = () => {
  try { sessionStorage.setItem(GREETED_KEY, "1"); } catch { /* ignore */ }
};

type Person = { id: string; name: string; color: string };
type Entry = {
  id: string;
  personId: string;
  title: string;
  kind: "fija" | "periodica";
  date?: string;
  days?: number[];
  start: string;
  end: string;
  companion?: string;
  remindMin?: number;
};

type CachedWeather = {
  date: string;
  desc: string;
  max: number;
  min: number;
};

function greetingFor(date: Date) {
  const h = date.getHours();
  if (h < 6) return "Buenas noches";
  if (h < 14) return "Buenos días";
  if (h < 21) return "Buenas tardes";
  return "Buenas noches";
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function weatherText(code: number) {
  if (code === 0) return "despejado";
  if (code <= 2) return "poco nuboso";
  if (code === 3) return "nublado";
  if (code <= 48) return "con niebla";
  if (code <= 57) return "con llovizna";
  if (code <= 67) return "con lluvia";
  if (code <= 77) return "con nieve";
  if (code <= 82) return "con chubascos";
  if (code <= 86) return "con nieve";
  return "con tormenta";
}

function weatherPhrase(desc: string) {
  if (desc === "despejado" || desc === "poco nuboso") return "hace buen tiempo";
  if (desc === "nublado") return "está nublado";
  return `hace un día ${desc}`;
}

function todayISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Home() {
  const { prefs, update } = usePrefs();
  const [userName, setUserName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [draft, setDraft] = useState("");
  const [greeting, setGreeting] = useState("Hola");
  const [todayItems, setTodayItems] = useState<{ id: string; text: string; color: string; remindMin: number }[]>([]);
  const [spokenText, setSpokenText] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rate, setRate] = useState(0.9);
  const [volume, setVolume] = useState(1);
  const [showPrefs, setShowPrefs] = useState(false);
  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const [notifOn, setNotifOn] = useState(false);
  const [notifMsg, setNotifMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      if ("Notification" in window && Notification.permission === "granted") setNotifOn(true);
    } catch { /* ignore */ }
  }, []);

  const askNotif = async () => {
    try {
      if (!("Notification" in window)) { setNotifMsg("Este navegador no permite avisos."); return; }
      const p = await Notification.requestPermission();
      setNotifOn(p === "granted");
      setNotifMsg(p === "granted" ? "Listo, los avisos ya están activados." : "El móvil no ha permitido los avisos. Revísalo en los ajustes del navegador.");
    } catch { setNotifMsg("No se han podido activar los avisos."); }
  };

  const testNotif = () => {
    setNotifMsg("El aviso de prueba sonará en 5 segundos…");
    window.setTimeout(() => {
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = 880;
          gain.gain.value = 0.2;
          osc.connect(gain).connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.4);
          setTimeout(() => ctx.close().catch(() => {}), 900);
        }
      } catch { /* ignore */ }
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Grannytools", { body: "Esto es un aviso de prueba. Todo funciona bien.", icon: "/icon-192.png" });
        }
      } catch { /* ignore */ }
      try { navigator.vibrate?.([300, 150, 300]); } catch { /* ignore */ }
      setNotifMsg(null);
    }, 5000);
  };
  const [weather, setWeather] = useState<{ desc: string; max: number; min: number } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const pollRef = useRef<number | null>(null);
  const [showCitas, setShowCitas] = useState(true);

  useEffect(() => {
    const now = new Date();
    setGreeting(greetingFor(now));

    const today = todayISO(now);

    let saved = "";
    try {
      saved = localStorage.getItem(USER_NAME_KEY) ?? "";
      setUserName(saved);
      setDraft(saved);
      if (!saved) setEditingName(true);
    } catch {
      /* ignore */
    }

    const voice = load<{ rate: number; volume: number }>(VOICE_KEY, { rate: 0.9, volume: 1 });
    setRate(voice.rate);
    setVolume(voice.volume);

    const people = load<Person[]>(PEOPLE_KEY, []);
    const entries = load<Entry[]>(ENTRIES_KEY, []);
    const iso = todayISO(now);
    const dow = now.getDay();
    // En el saludo solo se cuentan las CITAS de hoy (puntuales o recurrentes), los turnos no.
    const mine = entries
      .filter((e) => e.kind === "fija" && (e.date ? e.date === iso : (e.days ?? []).includes(dow)))
      .sort((a, b) => a.start.localeCompare(b.start));

    const items = mine.map((e) => {
      const p = people.find((x) => x.id === e.personId);
      const who = p?.name ? ` — ${p.name}` : "";
      const withWho = e.companion ? ` · con ${e.companion}` : "";
      return {
        id: e.id,
        text: `${e.start} a ${e.end} · ${e.title || "Cita"}${who}${withWho}`,
        color: p?.color ?? "bg-secondary",
        remindMin: e.remindMin ?? DEFAULT_REMIND_MIN,
      };
    });
    setTodayItems(items);

    const citasTxt = items.length
      ? `Tus citas de hoy son: ` +
        mine
          .map((e) => {
            const p = people.find((x) => x.id === e.personId);
            return `${e.title || "cita"}${p?.name ? ` con ${p.name}` : ""}, a las ${e.start.replace(":", " y ")}${e.companion ? `, te acompaña ${e.companion}` : ""}`;
          })
          .join("; ") + "."
      : "Hoy no tienes ninguna cita.";
    setSpokenText(citasTxt);

    askReminderPermission();
  }, []);

  // Previsión del tiempo de hoy (sin cuenta ni clave: Open-Meteo)
  useEffect(() => {
    let cancelled = false;
    const today = todayISO(new Date());

    // La caché permite preparar los saludos siguientes sin esperar a la red.
    const cached = load<CachedWeather | null>(WEATHER_CACHE_KEY, null);
    if (cached?.date === today) {
      setWeather({ desc: cached.desc, max: cached.max, min: cached.min });
    }

    const fetchWeather = async (lat: number, lon: number) => {
      try {
        const url =
          `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}` +
          `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
        const res = await fetch(url);
        const json = (await res.json()) as {
          daily?: { weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
        };
        const d = json.daily;
        if (!d || cancelled) return;
        const desc = weatherText(d.weather_code[0]);
        const max = Math.round(d.temperature_2m_max[0]);
        const min = Math.round(d.temperature_2m_min[0]);
        const forecast = { desc, max, min };
        setWeather(forecast);
        try {
          localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ date: today, ...forecast }));
        } catch {
          /* la caché es opcional */
        }
      } catch {
        /* sin tiempo */
      }
    };

    // Si hay una previsión válida, ya podemos saludar. Solo consultamos la red
    // cuando falta la caché o pertenece a otro día.
    if (cached?.date === today) return () => { cancelled = true; };

    try {
      navigator.geolocation?.getCurrentPosition(
        (pos) => void fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => void fetchWeather(40.42, -3.7), // Madrid por defecto
        { timeout: 8000, maximumAge: 3_600_000 },
      );
    } catch {
      void fetchWeather(40.42, -3.7);
    }
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  }, []);

  // Saludo automático al abrir la app (modo "auto" o "ambos")
  const autoSpokeRef = useRef(false);
  useEffect(() => {
    if (autoSpokeRef.current) return;
    if (!spokenText) return;
    // Solo una vez por apertura de la aplicación (no al volver a esta pantalla)
    if (hasAppGreeted()) {
      autoSpokeRef.current = true;
      return;
    }
    setPreparing(true);
    // Esperamos al tiempo; si tarda más de 4 s, saludamos sin él.
    if (!weather) {
      const t = window.setTimeout(() => {
        if (!autoSpokeRef.current) {
          autoSpokeRef.current = true;
          setAppGreeted();
          setPreparing(false);
          speak();
        }
      }, 4000);
      return () => {
        window.clearTimeout(t);
        setPreparing(false);
      };
    }
    autoSpokeRef.current = true;
    setAppGreeted();
    setPreparing(false);
    speak();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spokenText, weather]);

  const markGreeted = () => {
    setPreparing(false);
    setShowCitas(false);
  };

  const saveVoice = (r: number, v: number) => {
    try { localStorage.setItem(VOICE_KEY, JSON.stringify({ rate: r, volume: v })); } catch { /* ignore */ }
  };

  const watchSpeech = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(() => {
      const s = window.speechSynthesis;
      if (!s) return;
      setSpeaking(s.speaking);
      setPaused(s.paused);
      if (!s.speaking && pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 400);
  };

  const speak = () => {
    try {
      const synth = window.speechSynthesis;
      if (!synth || !spokenText) return;
      synth.cancel();
      markGreeted();
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      const hora = `son las ${h} ${m === 0 ? "en punto" : `y ${m}`}`;
      const clima = weather
        ? ` y ${weatherPhrase(weather.desc)}, con ${weather.max} grados de máxima y ${weather.min} de mínima`
        : "";
      const hello = `${greetingFor(now)}${userName ? `, ${userName}` : ""}, ${hora}${clima}. `;
      const text = hello + spokenText;
      let speechStarted = false;

      const doSpeak = () => {
        if (speechStarted) return;
        speechStarted = true;
        const u = new SpeechSynthesisUtterance(text);
        const es = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith("es"));
        if (es) u.voice = es;
        u.lang = "es-ES";
        u.rate = rate;
        u.volume = volume;
        u.pitch = 1.1;
        u.onstart = () => { setNeedsTap(false); setSpeaking(true); };
        u.onend = () => { setSpeaking(false); setPaused(false); };
        u.onerror = () => { setSpeaking(false); setPaused(false); setNeedsTap(true); };
        synth.speak(u);
        setSpeaking(true);
        setPaused(false);
        watchSpeech();
        // Si el navegador bloquea la voz (necesita un toque), lo avisamos.
        window.setTimeout(() => {
          if (!synth.speaking && !synth.pending) setNeedsTap(true);
        }, 900);
      };

      if (synth.getVoices().length === 0) {
        const onVoices = () => {
          synth.removeEventListener("voiceschanged", onVoices);
          doSpeak();
        };
        synth.addEventListener("voiceschanged", onVoices);
        window.setTimeout(() => {
          synth.removeEventListener("voiceschanged", onVoices);
          doSpeak();
        }, 800);
        return;
      }
      doSpeak();
    } catch {
      /* ignore */
    }
  };


  // Si el navegador exige un toque previo, saludamos en cuanto el usuario toque la pantalla.
  useEffect(() => {
    if (!needsTap) return;
    const onTap = () => speak();
    window.addEventListener("pointerdown", onTap, { once: true });
    return () => window.removeEventListener("pointerdown", onTap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsTap, spokenText, weather, rate, volume, userName]);

  const togglePause = () => {

    const s = window.speechSynthesis;
    if (!s) return;
    if (s.paused) { s.resume(); setPaused(false); }
    else { s.pause(); setPaused(true); }
  };

  const stopSpeech = () => {
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    setSpeaking(false);
    setPaused(false);
  };

  const saveName = () => {
    const n = draft.trim();
    setUserName(n);
    setEditingName(false);
    try { localStorage.setItem(USER_NAME_KEY, n); } catch { /* ignore */ }
  };


  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-3 py-3">
        <header className="mb-3 text-center">
          <div className="flex items-start justify-between gap-2">
            <span className="h-11 w-11" aria-hidden />
            <h1 className="flex-1 text-3xl font-black tracking-tight">Grannytools</h1>
            <button
              onClick={() => { setShowPrefs((v) => !v); setSheet(null); }}
              aria-label="Ajustes"
              aria-expanded={showPrefs}
              className={`flex h-11 w-11 items-center justify-center rounded-xl active:scale-95 ${showPrefs ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
            >
              <Settings className="h-6 w-6" aria-hidden />
            </button>
          </div>
          {editingName ? (
            <form
              onSubmit={(e) => { e.preventDefault(); saveName(); }}
              className="mx-auto mt-2 flex max-w-sm items-center gap-2"
            >
              <label htmlFor="nombre" className="sr-only">Tu nombre</label>
              <input
                id="nombre"
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="¿Cómo te llamas?"
                className="w-full rounded-lg border-2 border-border bg-background px-3 py-2 text-base"
              />
              <button
                type="submit"
                aria-label="Guardar nombre"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground active:scale-[0.95]"
              >
                <Check className="h-5 w-5" aria-hidden />
              </button>
            </form>
          ) : (
            <button
              onClick={() => { setDraft(userName); setEditingName(true); }}
              aria-label="Cambiar tu nombre"
              className="mx-auto mt-1 flex items-center gap-2 rounded-lg px-2 py-1 active:scale-[0.97]"
            >
              <span className="text-xl font-bold">
                {greeting}{userName ? `, ${userName}` : ""}
              </span>
              <Pencil className="h-4 w-4 text-muted-foreground" aria-hidden />
            </button>
          )}
          {weather && (
            <p className="mt-1 text-base font-semibold text-muted-foreground">
              Hoy: {weather.desc} · {weather.max}° / {weather.min}°
            </p>
          )}
        </header>

        {showPrefs && (
          <div className="mb-3 space-y-2">
            <p className="rounded-2xl bg-warning p-3 text-center text-base font-bold text-warning-foreground">
              Modo ajustes: toca un botón para cambiar sus opciones.
            </p>
            <button
              onClick={() => setSheet("vista")}
              className="w-full rounded-2xl bg-card py-3 text-lg font-bold shadow-sm active:scale-[0.98]"
            >
              Cómo se ve la aplicación
            </button>
          </div>
        )}

        {sheet && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3" onClick={() => setSheet(null)}>
            <section
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl space-y-3 rounded-2xl bg-card p-4 shadow-xl"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-black">
                  {sheet === "vista" && "Cómo se ve la aplicación"}
                  {sheet === "voz" && "El saludo"}
                  {sheet === "lupa" && "La lupa"}
                  {sheet === "avisos" && "Avisos en el móvil"}
                </h2>
                <button
                  onClick={() => setSheet(null)}
                  aria-label="Cerrar ajustes"
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground active:scale-95"
                >
                  <X className="h-6 w-6" aria-hidden />
                </button>
              </div>

              {sheet === "vista" && (
                <>
                  <div>
                    <label htmlFor="fuente" className="text-sm font-bold">
                      Tamaño de letra · {Math.round(prefs.fontScale * 100)}%
                    </label>
                    <input
                      id="fuente"
                      type="range"
                      min={0.85}
                      max={1.6}
                      step={0.05}
                      value={prefs.fontScale}
                      onChange={(e) => update({ fontScale: Number(e.target.value) })}
                      className="h-3 w-full accent-primary"
                    />
                  </div>
                  <button
                    onClick={() => update({ highContrast: !prefs.highContrast })}
                    aria-pressed={prefs.highContrast}
                    className={`w-full rounded-xl py-3 text-lg font-bold active:scale-95 ${prefs.highContrast ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                  >
                    Contraste alto: {prefs.highContrast ? "sí" : "no"}
                  </button>
                </>
              )}

              {sheet === "lupa" && (
                <div>
                  <label htmlFor="brillo" className="text-sm font-bold">
                    Brillo extra en la lupa · ×{prefs.brightness.toFixed(1)}
                  </label>
                  <input
                    id="brillo"
                    type="range"
                    min={1}
                    max={2}
                    step={0.1}
                    value={prefs.brightness}
                    onChange={(e) => update({ brightness: Number(e.target.value) })}
                    className="h-3 w-full accent-primary"
                  />
                </div>
              )}

              {sheet === "voz" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="velocidad" className="text-sm font-bold">
                      Velocidad ×{rate.toFixed(1)}
                    </label>
                    <input
                      id="velocidad"
                      type="range"
                      min={0.5}
                      max={1.5}
                      step={0.1}
                      value={rate}
                      onChange={(e) => { const v = Number(e.target.value); setRate(v); saveVoice(v, volume); }}
                      className="h-3 w-full accent-primary"
                    />
                  </div>
                  <div>
                    <label htmlFor="volumen" className="text-sm font-bold">
                      Volumen {Math.round(volume * 100)}%
                    </label>
                    <input
                      id="volumen"
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.1}
                      value={volume}
                      onChange={(e) => { const v = Number(e.target.value); setVolume(v); saveVoice(rate, v); }}
                      className="h-3 w-full accent-primary"
                    />
                  </div>
                </div>
              )}

              {sheet === "avisos" && (
                <>
                  <button
                    onClick={askNotif}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-lg font-bold active:scale-95 ${notifOn ? "bg-success text-success-foreground" : "bg-primary text-primary-foreground"}`}
                  >
                    {notifOn ? <Bell className="h-6 w-6" aria-hidden /> : <BellOff className="h-6 w-6" aria-hidden />}
                    {notifOn ? "Avisos activados" : "Activar avisos"}
                  </button>
                  {notifMsg && <p className="text-sm font-semibold text-muted-foreground">{notifMsg}</p>}
                  <button
                    onClick={testNotif}
                    className="w-full rounded-xl bg-secondary py-3 text-base font-bold text-secondary-foreground active:scale-95"
                  >
                    Probar aviso (suena en 5 segundos)
                  </button>
                </>
              )}
            </section>
          </div>
        )}

        <section className="mb-3 rounded-2xl bg-card p-3 text-left shadow-sm">
          {showCitas && (
            <>
              <h2 className="mb-2 text-base font-bold">
                {todayItems.length ? `Hoy tienes ${todayItems.length} ${todayItems.length === 1 ? "cita" : "citas"}` : "Hoy no tienes citas"}
              </h2>

              {todayItems.length > 0 && (
                <ul className="mb-3 space-y-1">
                  {todayItems.map((it) => (
                    <li key={it.id}>
                      <Link
                        to="/citas"
                        search={{ edit: it.id }}
                        className="flex w-full items-center gap-2 rounded-lg bg-secondary px-2 py-2 text-sm font-semibold text-secondary-foreground active:scale-[0.98]"
                      >
                        <span className={`h-3 w-3 shrink-0 rounded-full ${it.color}`} aria-hidden />
                        <span className="flex-1 text-left">
                          {it.text}
                          <span className="block text-xs font-normal text-muted-foreground">
                            Aviso {it.remindMin} min antes
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {preparing && !needsTap && (
            <div className="mb-3 rounded-2xl bg-secondary p-5 text-center text-2xl font-black text-secondary-foreground animate-pulse">
              Preparando saludo…
            </div>
          )}
          {needsTap && (
            <button
              onClick={speak}
              className="mb-3 w-full rounded-2xl bg-warning p-5 text-center text-2xl font-black text-warning-foreground active:scale-[0.98]"
            >
              Toca aquí para escuchar el saludo
            </button>
          )}

          <button
            onClick={showPrefs ? () => setSheet("voz") : speak}
            aria-label={showPrefs ? "Ajustes del saludo" : "Escuchar el saludo inicial y las citas de hoy"}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-4 text-xl font-black text-primary-foreground shadow-md active:scale-[0.98]"
          >
            {showPrefs ? <Settings className="h-8 w-8" aria-hidden /> : <Volume2 className="h-8 w-8" aria-hidden />}
            {showPrefs ? "Ajustes del saludo" : "Saludo inicial"}
          </button>
          {speaking && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={togglePause}
                aria-label={paused ? "Reanudar lectura" : "Pausar lectura"}
                className="flex items-center justify-center gap-2 rounded-xl bg-secondary py-3 text-base font-bold text-secondary-foreground active:scale-95"
              >
                {paused ? <Play className="h-6 w-6" aria-hidden /> : <Pause className="h-6 w-6" aria-hidden />}
                {paused ? "Seguir" : "Pausa"}
              </button>
              <button
                onClick={stopSpeech}
                aria-label="Parar lectura"
                className="flex items-center justify-center gap-2 rounded-xl bg-secondary py-3 text-base font-bold text-secondary-foreground active:scale-95"
              >
                <Square className="h-6 w-6" aria-hidden /> Parar
              </button>
            </div>
          )}
        </section>


        <div className="grid grid-cols-2 gap-2 pb-3">

          {TILES.map(({ to, label, Icon, bg, fg }) => {
            const cls = [
              "flex h-[calc((100dvh-11rem)/3)] min-h-28 flex-col items-center justify-center gap-2 rounded-2xl p-3 shadow-lg select-none text-center",
              "active:scale-[0.97] active:shadow-inner transition-all",
              bg,
              fg,
            ].join(" ");
            const inner = (
              <>
                {showPrefs ? <Settings className="h-12 w-12" aria-hidden /> : <Icon className="h-12 w-12" aria-hidden />}
                <span className="text-xl font-black leading-tight">{label}</span>
              </>
            );
            if (showPrefs) {
              const key = TILE_SHEET[to];
              return (
                <button
                  key={to}
                  onClick={() => (key ? setSheet(key) : undefined)}
                  className={`${cls} ${key ? "" : "opacity-50"}`}
                >
                  {inner}
                  {!key && <span className="text-xs font-semibold">Se ajusta dentro</span>}
                </button>
              );
            }
            return (
              <Link key={to} to={to} className={cls}>
                {inner}
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
