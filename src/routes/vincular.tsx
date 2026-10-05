import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft } from "lucide-react";
import {
  addFamilyMember, getFamilyMembers, getInvite, linkPayload, LINK_EVT, removeFamilyMember,
  setMemberRole, type FamilyMember, type Invite,
} from "@/lib/family-link";

export const Route = createFileRoute("/vincular")({
  head: () => ({
    meta: [
      { title: "Vincular con un familiar — Grannytools" },
      { name: "description", content: "Código QR temporal para que uno o varios familiares se vinculen con Grannytools Family." },
      { property: "og:title", content: "Vincular con un familiar — Grannytools" },
      { property: "og:description", content: "Código QR para conectar con Grannytools Family." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Vincular,
});

const ROLE_LABEL = { admin: "Administrador", consulta: "Consultas" } as const;

function Vincular() {
  const [inv, setInv] = useState<Invite | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [now, setNow] = useState(Date.now());
  const refresh = (renew = false) => { setInv(getInvite(renew)); setMembers(getFamilyMembers()); };

  useEffect(() => {
    refresh();
    const r = () => refresh();
    window.addEventListener(LINK_EVT, r);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { window.removeEventListener(LINK_EVT, r); clearInterval(t); };
  }, []);

  useEffect(() => { if (inv && inv.expires < now) refresh(true); }, [now, inv]);

  const left = inv ? Math.max(0, Math.ceil((inv.expires - now) / 60000)) : 0;

  return (
    <main className="mx-auto min-h-screen max-w-md bg-background p-4 text-foreground">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/" aria-label="Volver" className="rounded-2xl bg-secondary p-3 text-secondary-foreground">
          <ArrowLeft className="h-7 w-7" />
        </Link>
        <h1 className="text-2xl font-extrabold">Vincular con un familiar</h1>
      </header>
      {inv && (
        <div className="space-y-4 text-center">
          <p className="text-lg font-semibold">
            Pide a tu familiar que abra <b>Grannytools Family</b> y enfoque este dibujo con su cámara.
          </p>
          <div className="mx-auto w-fit rounded-3xl border-4 border-foreground bg-card p-4">
            <QRCodeSVG value={linkPayload(inv)} size={240} bgColor="transparent" fgColor="currentColor" level="M" />
          </div>
          <p className="text-sm font-bold text-muted-foreground">O que escriba este código:</p>
          <p className="text-4xl font-black tracking-widest">{inv.code}</p>
          <p className="text-base font-semibold">Este código sirve solo para este teléfono y caduca en {left} min.</p>
          <button onClick={() => refresh(true)} className="w-full rounded-2xl bg-secondary py-4 text-lg font-bold text-secondary-foreground">
            Generar código nuevo
          </button>

          <section className="space-y-3 text-left">
            <h2 className="text-2xl font-extrabold">Familia vinculada</h2>
            {members.length === 0 && <p className="text-lg">Todavía no hay nadie vinculado.</p>}
            {members.map((m) => (
              <div key={m.id} className="space-y-2 rounded-2xl border-2 border-border bg-card p-4">
                <p className="text-xl font-bold">{m.name}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["admin", "consulta"] as const).map((r) => (
                    <button key={r} onClick={() => setMemberRole(m.id, r)}
                      className={`rounded-xl py-3 text-base font-bold ${m.role === r ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                      {ROLE_LABEL[r]}
                    </button>
                  ))}
                </div>
                <button onClick={() => { if (confirm(`¿Desvincular a ${m.name}?`)) removeFamilyMember(m.id); }}
                  className="w-full rounded-xl bg-destructive py-3 text-lg font-bold text-destructive-foreground">
                  Desvincular
                </button>
              </div>
            ))}
            <p className="text-sm text-muted-foreground">Administrador gestiona todo. Consultas solo ve la información y no recibe avisos.</p>
            {import.meta.env.DEV && (
              <button onClick={() => { const n = prompt("Nombre del familiar (prueba)"); if (n) addFamilyMember(n, "consulta"); }}
                className="w-full rounded-xl bg-secondary py-3 text-base font-bold text-secondary-foreground">
                Simular familiar vinculado (prueba)
              </button>
            )}
          </section>
          <p className="text-xs text-muted-foreground">Funciona sin internet; los cambios del familiar llegarán cuando haya conexión.</p>
        </div>
      )}
    </main>
  );
}
