import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Ear, Search, Users, MapPin, Pill, Camera, CalendarDays, Pencil, Check } from "lucide-react";


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
  { to: "/oir", label: "Oír", Icon: Ear, bg: "bg-primary", fg: "text-primary-foreground" },
  { to: "/lupa", label: "Lupa", Icon: Search, bg: "bg-success", fg: "text-success-foreground" },
  { to: "/panico", label: "Contactos", Icon: Users, bg: "bg-destructive", fg: "text-destructive-foreground" },
  { to: "/ubicacion", label: "Ubicación", Icon: MapPin, bg: "bg-primary", fg: "text-primary-foreground" },
  { to: "/pastillas", label: "Pastillas", Icon: Pill, bg: "bg-warning", fg: "text-warning-foreground" },
  { to: "/citas", label: "Citas", Icon: CalendarDays, bg: "bg-success", fg: "text-success-foreground" },
  { to: "/camara", label: "Cámara", Icon: Camera, bg: "bg-secondary", fg: "text-secondary-foreground" },
];


const USER_NAME_KEY = "grannytools.username";
const PEOPLE_KEY = "grannytools.citas.people";
const ENTRIES_KEY = "grannytools.citas.entries";

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

function todayISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Home() {
  const [userName, setUserName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [draft, setDraft] = useState("");
  const [greeting, setGreeting] = useState("Hola");
  const [todayItems, setTodayItems] = useState<{ id: string; text: string; color: string }[]>([]);
  const [spokenText, setSpokenText] = useState("");

  useEffect(() => {
    const now = new Date();
    setGreeting(greetingFor(now));
    let saved = "";
    try {
      saved = localStorage.getItem(USER_NAME_KEY) ?? "";
      setUserName(saved);
      setDraft(saved);
      if (!saved) setEditingName(true);
    } catch {
      /* ignore */
    }

    const people = load<Person[]>(PEOPLE_KEY, []);
    const entries = load<Entry[]>(ENTRIES_KEY, []);
    const iso = todayISO(now);
    const dow = now.getDay();
    const mine = entries
      .filter((e) => (e.kind === "fija" ? e.date === iso : (e.days ?? []).includes(dow)))
      .sort((a, b) => a.start.localeCompare(b.start));

    const items = mine.map((e) => {
      const p = people.find((x) => x.id === e.personId);
      const who = p?.name ? ` — ${p.name}` : "";
      return {
        id: e.id,
        text: `${e.start} a ${e.end} · ${e.title || "Turno"}${who}`,
        color: p?.color ?? "bg-secondary",
      };
    });
    setTodayItems(items);

    const hello = `${greetingFor(now)}${saved ? `, ${saved}` : ""}.`;
    const body = items.length
      ? ` Hoy tienes ${items.length} ${items.length === 1 ? "cita" : "citas"}: ` +
        mine
          .map((e) => {
            const p = people.find((x) => x.id === e.personId);
            return `${e.title || "turno"}${p?.name ? ` con ${p.name}` : ""}, de ${e.start.replace(":", " y ")} a ${e.end.replace(":", " y ")}`;
          })
          .join("; ") + "."
      : " Hoy no tienes ninguna cita.";
    setSpokenText(hello + body);
  }, []);

  const speak = () => {
    try {
      const synth = window.speechSynthesis;
      if (!synth || !spokenText) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(spokenText);
      u.lang = "es-ES";
      u.rate = 0.9;
      u.pitch = 1.1;
      synth.speak(u);
    } catch {
      /* ignore */
    }
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
          <h1 className="text-3xl font-black tracking-tight">Grannytools</h1>
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
        </header>

        <section className="mb-3 rounded-2xl bg-card p-3 text-left shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">
              {todayItems.length ? `Hoy tienes ${todayItems.length} ${todayItems.length === 1 ? "cita" : "citas"}` : "Hoy no tienes citas"}
            </h2>
            <button
              onClick={speak}
              aria-label="Escuchar el saludo y las citas de hoy"
              className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground active:scale-[0.97]"
            >
              <Volume2 className="h-5 w-5" aria-hidden /> Escuchar
            </button>
          </div>
          {todayItems.length > 0 && (
            <ul className="space-y-1">
              {todayItems.map((it) => (
                <li key={it.id} className="flex items-center gap-2 text-sm font-semibold">
                  <span className={`h-3 w-3 shrink-0 rounded-full ${it.color}`} aria-hidden />
                  <span>{it.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>


        <div className="grid grid-cols-2 gap-2 pb-3">

          {TILES.map(({ to, label, Icon, bg, fg }) => (
            <Link
              key={to}
              to={to}
              className={[
                "flex h-[calc((100dvh-11rem)/3)] min-h-28 flex-col items-center justify-center gap-2 rounded-2xl p-3 shadow-lg select-none",
                "active:scale-[0.97] active:shadow-inner transition-all",
                bg,
                fg,
              ].join(" ")}
            >
              <Icon className="h-12 w-12" aria-hidden />
              <span className="text-xl font-black leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
