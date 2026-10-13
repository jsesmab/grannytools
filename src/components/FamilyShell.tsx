import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { clearUnlock, needsUnlock, verifyBiometric } from "@/lib/biometrics";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { familyHeartbeat } from "@/lib/family.functions";
import { claimSession } from "@/lib/session.functions";
import { deviceId, KICKED_FLAG } from "@/lib/single-session";
import { isTestPayments } from "@/lib/stripe";

const NAV = [
  { to: "/family", label: "Mis personas" },
  { to: "/family/hoy", label: "Panel del día" },
  { to: "/family/historico", label: "Histórico" },
] as const;

export function FamilyShell({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const out = async () => {
    await qc.cancelQueries(); qc.clear();
    clearUnlock();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  };
  const [locked, setLocked] = useState(false);
  const beat = useServerFn(familyHeartbeat);
  useEffect(() => { setLocked(needsUnlock()); void beat().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Sesión única: si la cuenta se abre en otro dispositivo, este se cierra solo.
  const claim = useServerFn(claimSession);
  useEffect(() => {
    let stop = false;
    const check = async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || stop) return;
      const { data } = await supabase.from("user_sessions").select("device_id").eq("user_id", u.user.id).maybeSingle();
      if (!data) { await claim({ data: { deviceId: deviceId() } }).catch(() => {}); return; }
      if (data.device_id !== deviceId()) { sessionStorage.setItem(KICKED_FLAG, "1"); await out(); }
    };
    void check();
    const iv = setInterval(check, 20_000);
    const vis = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearInterval(iv); document.removeEventListener("visibilitychange", vis); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const unlock = async () => { if (await verifyBiometric()) setLocked(false); };
  useEffect(() => { if (locked) void unlock(); }, [locked]); // eslint-disable-line react-hooks/exhaustive-deps
  if (locked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
        <div className="w-full max-w-sm space-y-4 rounded-3xl border-2 border-border bg-card p-6 text-center">
          <img src="/family-icon-192.png" alt="Grannytools Family" width={112} height={112} className="mx-auto h-28 w-28 object-contain" />
          <p className="text-5xl" aria-hidden>🔒</p>
          <h1 className="text-2xl font-extrabold">Grannytools Family</h1>
          <button onClick={unlock} className="w-full rounded-2xl bg-primary py-4 text-lg font-bold text-primary-foreground">Entrar con huella / Face ID</button>
          <button onClick={out} className="w-full rounded-2xl bg-secondary py-3 font-bold text-secondary-foreground">Entrar con contraseña</button>
        </div>
      </main>
    );
  }
  return (
    <div className="min-h-screen bg-background text-foreground">
      {isTestPayments() && <div className="bg-accent px-4 py-1 text-center text-xs font-semibold text-accent-foreground">Pagos en modo de prueba: no se cobra dinero real.</div>}
      <header className="border-b-2 border-border bg-card">
        <div className={`mx-auto flex items-start justify-between gap-3 px-4 pt-4 ${wide ? "max-w-7xl" : "max-w-4xl"}`}>
          <img src="/family-icon-192.png" alt="Grannytools Family" width={112} height={112} className="h-28 w-28 object-contain" />
          <div className="flex flex-col items-stretch gap-2">
            <button onClick={out} className="rounded-xl bg-muted px-4 py-2 text-sm font-bold text-foreground">Salir</button>
            <Link to="/family/perfil" className="rounded-xl bg-secondary px-4 py-2 text-center text-sm font-bold text-secondary-foreground">Mi perfil</Link>
            <Link to="/family/planes" className="rounded-xl bg-secondary px-4 py-2 text-center text-sm font-bold text-secondary-foreground">Mi plan</Link>
          </div>
        </div>
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
