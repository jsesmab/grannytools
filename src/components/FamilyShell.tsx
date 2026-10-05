import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

const NAV = [
  { to: "/family", label: "Mis personas" },
  { to: "/family/hoy", label: "Panel del día" },
  { to: "/family/vincular", label: "Vincular" },
  { to: "/family/perfil", label: "Mi perfil" },
] as const;

export function FamilyShell({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const out = async () => {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b-2 border-border bg-card">
        <div className={`mx-auto flex flex-wrap items-center gap-2 px-4 py-3 ${wide ? "max-w-7xl" : "max-w-4xl"}`}>
          <span className="mr-3 text-lg font-black text-primary">Grannytools Family</span>
          <nav className="flex flex-1 flex-wrap gap-2">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} activeOptions={{ exact: true }}
                className="rounded-xl bg-secondary px-3 py-2 text-sm font-bold text-secondary-foreground"
                activeProps={{ className: "!bg-primary !text-primary-foreground" }}>
                {n.label}
              </Link>
            ))}
          </nav>
          <button onClick={out} className="rounded-xl bg-muted px-3 py-2 text-sm font-bold text-foreground">Salir</button>
        </div>
      </header>
      <main className={`mx-auto space-y-5 p-4 ${wide ? "max-w-7xl" : "max-w-4xl"}`}>
        <h1 className="text-3xl font-extrabold">{title}</h1>
        {children}
      </main>
    </div>
  );
}

export function StatusPill({ status }: { status?: string }) {
  if (!status) return null;
  const map: Record<string, [string, string]> = {
    hecha: ["Hecho", "bg-primary text-primary-foreground"],
    no: ["No hecho", "bg-destructive text-destructive-foreground"],
    pasada: ["Sin marcar", "bg-destructive/15 text-destructive"],
    pendiente: ["Pendiente", "bg-muted text-muted-foreground"],
  };
  const [l, c] = map[status] ?? [status, "bg-muted"];
  return <span className={`rounded-lg px-2 py-1 text-xs font-bold ${c}`}>{l}</span>;
}
