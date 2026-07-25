import { createFileRoute, Link } from "@tanstack/react-router";
import { Ear, Search, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Grammytools — Ayudas prácticas para el día a día" },
      {
        name: "description",
        content:
          "Grammytools reúne en una sola app tres ayudas para personas mayores: amplificador de sonido, lupa con la cámara y contactos de ayuda con llamada rápida.",
      },
      { property: "og:title", content: "Grammytools — Ayudas prácticas para mayores" },
      { property: "og:description", content: "Oír mejor, ver mejor y pedir ayuda en un solo toque." },
    ],
  }),
  component: Home,
});

type Tile = {
  to: "/oir" | "/lupa" | "/panico";
  label: string;
  hint: string;
  Icon: typeof Ear;
  bg: string;
  fg: string;
  ring: string;
};

const TILES: Tile[] = [
  {
    to: "/oir",
    label: "Oír",
    hint: "Amplifica las conversaciones",
    Icon: Ear,
    bg: "bg-primary",
    fg: "text-primary-foreground",
    ring: "ring-primary",
  },
  {
    to: "/lupa",
    label: "Lupa",
    hint: "Ver de cerca con la cámara",
    Icon: Search,
    bg: "bg-success",
    fg: "text-success-foreground",
    ring: "ring-success",
  },
  {
    to: "/panico",
    label: "Contactos",
    hint: "Llama a tus contactos de ayuda",
    Icon: Users,
    bg: "bg-destructive",
    fg: "text-destructive-foreground",
    ring: "ring-destructive",
  },
];

function Home() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-4">
        <header className="mb-4 text-center">
          <h1 className="text-3xl font-black tracking-tight">Grammytools</h1>
          <p className="mt-1 text-sm text-muted-foreground">Elige qué quieres hacer</p>
        </header>

        <div className="flex flex-1 flex-col gap-3">
          {TILES.map(({ to, label, hint, Icon, bg, fg, ring }) => (
            <Link
              key={to}
              to={to}
              className={[
                "flex flex-1 items-center gap-4 rounded-2xl px-5 py-6 shadow-lg select-none",
                "active:scale-[0.98] active:shadow-inner transition-all",
                "ring-2 ring-transparent focus-visible:ring-offset-2 focus-visible:" + ring,
                bg,
                fg,
              ].join(" ")}
            >
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-black/15">
                <Icon className="h-10 w-10" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-black leading-tight">{label}</div>
                <div className="text-base opacity-90">{hint}</div>
              </div>
            </Link>
          ))}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Pulsa un botón para empezar. Podrás volver aquí desde cualquier pantalla.
        </p>
      </div>
    </main>
  );
}
