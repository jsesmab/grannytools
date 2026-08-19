import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Ear, Search, Users, MapPin, Pill, Camera, Pencil, Check } from "lucide-react";


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

function greetingFor(date: Date) {
  const h = date.getHours();
  if (h < 6) return "Buenas noches";
  if (h < 14) return "Buenos días";
  if (h < 21) return "Buenas tardes";
  return "Buenas noches";
}

function Home() {
  const [userName, setUserName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [draft, setDraft] = useState("");
  const [greeting, setGreeting] = useState("Hola");

  useEffect(() => {
    setGreeting(greetingFor(new Date()));
    try {
      const saved = localStorage.getItem(USER_NAME_KEY) ?? "";
      setUserName(saved);
      setDraft(saved);
      if (!saved) setEditingName(true);
    } catch {
      /* ignore */
    }
  }, []);

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
          <p className="text-sm text-muted-foreground">Elige qué quieres hacer</p>
        </header>

        <div className="grid flex-1 grid-cols-2 gap-2">

          {TILES.map(({ to, label, Icon, bg, fg }) => (
            <Link
              key={to}
              to={to}
              className={[
                "flex flex-col items-center justify-center gap-2 rounded-2xl p-3 shadow-lg select-none",
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
