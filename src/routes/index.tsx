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
  to: "/oir" | "/lupa" | "/panico" | "/ubicacion" | "/pastillas" | "/camara";
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
  { to: "/camara", label: "Cámara", Icon: Camera, bg: "bg-secondary", fg: "text-secondary-foreground" },
];

function Home() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-3 py-3">
        <header className="mb-3 text-center">
          <h1 className="text-3xl font-black tracking-tight">Grannytools</h1>
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
